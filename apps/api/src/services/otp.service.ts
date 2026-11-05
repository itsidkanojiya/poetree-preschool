import { createHash, randomInt } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import type { OtpChannel } from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../lib/apiError.js';
import { logger } from '../lib/logger.js';

/**
 * Proving a parent's phone number and email address before they fill in a
 * registration.
 *
 * Asked for first, not last: the number is what the account signs in with and
 * what every message afterwards goes to, and a family that types either one
 * wrong should find out on the screen where they typed it rather than three
 * screens later, or a week later when nothing arrives.
 *
 * One service for both channels. A code to a phone and a code to an inbox are
 * the same problem with different plumbing — the same expiry, the same counted
 * guesses, the same one-use-only rule — and writing them twice would be two
 * chances to get those wrong.
 *
 * What this is NOT, until it is configured: proof of anything. Both providers
 * default to `static`, which accepts one fixed code and sends no message — so
 * anyone can claim any number or address. The office approving every
 * registration by hand is what stands in the gap, and the gap closes by
 * choosing `msg91` for phones and `smtp` for email, with their credentials.
 */

/** How a code reaches somebody. Swapped by configuration, not by code. */
interface Sender {
  readonly name: string;
  readonly delivers: boolean;
  send(destination: string, code: string): Promise<void>;
}

function staticSender(channel: OtpChannel): Sender {
  return {
    name: 'static',
    delivers: false,
    async send(destination) {
      logger.warn(
        `No ${channel} message sent: the provider is "static". The code is ${env.OTP_STATIC_CODE}.`,
        { destination },
      );
    },
  };
}

/**
 * MSG91, which is what Indian schools are already paying for.
 *
 * Written now and unreachable until the three credentials exist, so that
 * turning it on is an environment change rather than a release.
 */
const msg91Sender: Sender = {
  name: 'msg91',
  delivers: true,
  async send(destination, code) {
    if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) {
      throw ApiError.internal('MSG91 is selected but its credentials are not configured');
    }

    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authkey: env.MSG91_AUTH_KEY },
      body: JSON.stringify({
        template_id: env.MSG91_TEMPLATE_ID,
        ...(env.MSG91_SENDER_ID ? { sender: env.MSG91_SENDER_ID } : {}),
        // MSG91 wants the country code without a plus.
        recipients: [{ mobiles: destination.replace(/[^0-9]/g, ''), otp: code }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error('MSG91 refused the message', { status: response.status, detail });
      throw ApiError.internal('The code could not be sent. Please try again in a moment.');
    }
  },
};

/** One connection pool for the process, made the first time a code is sent. */
let mailTransport: Transporter | null = null;

function mailer(): Transporter {
  if (!env.SMTP_HOST || !(env.SMTP_FROM ?? env.SMTP_USER)) {
    throw ApiError.internal('Email is selected but SMTP_HOST and SMTP_FROM are not configured');
  }
  mailTransport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
  });
  return mailTransport;
}

/** The sender, with the app's name when only an address was given. */
function sender(): string {
  const from = (env.SMTP_FROM ?? env.SMTP_USER ?? '').trim();
  return from.includes('<') ? from : `"Poetree Kids" <${from}>`;
}

/**
 * Any mailbox that speaks SMTP: the school domain's own, Gmail, Zoho, or a
 * sending service's SMTP door. Plain text — a code needs nothing more, and a
 * plain message is the one least likely to be filed as spam.
 */
const smtpSender: Sender = {
  name: 'smtp',
  delivers: true,
  async send(destination, code) {
    const minutes = Math.round(env.OTP_TTL_SECONDS / 60);
    try {
      await mailer().sendMail({
        from: sender(),
        to: destination,
        subject: `${code} is your Poetree Kids code`,
        text:
          `Your code is ${code}.\n\n` +
          `Type it into the Poetree Kids app to confirm this email address. ` +
          `It works for ${minutes} minutes.\n\n` +
          'If you did not ask for it, you can ignore this email.',
      });
    } catch (error) {
      logger.error('The email code could not be sent', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw ApiError.internal('The code could not be sent. Please try again in a moment.');
    }
  },
};

const emailSenders: Record<string, Sender> = {
  static: staticSender('EMAIL'),
  smtp: smtpSender,
};

const senders: Record<OtpChannel, Sender> = {
  PHONE: env.OTP_PROVIDER === 'msg91' ? msg91Sender : staticSender('PHONE'),
  EMAIL: emailSenders[env.EMAIL_OTP_PROVIDER] ?? staticSender('EMAIL'),
};

/**
 * Whether a code on this channel is really sent — and so costs money and rings
 * somebody. False while the fixed code stands in for a provider.
 */
export function isDelivered(channel: OtpChannel): boolean {
  return senders[channel].delivers;
}

/** Hashed, because four digits sitting in a table is a number anyone could use. */
function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function newCode(channel: OtpChannel): string {
  // A static provider has to agree with itself between two requests, so it
  // cannot be random.
  return senders[channel].delivers
    ? String(randomInt(0, 1_000_000)).padStart(6, '0')
    : env.OTP_STATIC_CODE;
}

/** Wrong guesses allowed before the code is dead and a new one is needed. */
const MAX_ATTEMPTS = 5;

export interface SentChallenge {
  challengeId: string;
  expiresInSeconds: number;
  /** True when a message was really sent, so the app can say when one was not. */
  delivered: boolean;
  /** How many digits to expect, so the app draws one box per digit. */
  codeLength: number;
}

/**
 * Send a code to a number or an address.
 *
 * Any code already outstanding for that destination at that school is retired
 * first: two live codes for one phone means "it didn't work, send it again"
 * leaves the family holding the one that no longer counts.
 */
export async function sendChallenge(
  schoolId: string,
  channel: OtpChannel,
  destination: string,
  resendSeconds: number = env.OTP_RESEND_SECONDS,
): Promise<SentChallenge> {
  await assertResendAllowed(schoolId, channel, destination, resendSeconds);

  await prismaUnscoped.otpChallenge.updateMany({
    where: {
      schoolId,
      channel,
      destination,
      verifiedAt: null,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { expiresAt: new Date() },
  });

  const code = newCode(channel);
  const challenge = await prismaUnscoped.otpChallenge.create({
    data: {
      schoolId,
      channel,
      destination,
      codeHash: hash(code),
      expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
    },
    select: { id: true },
  });

  await senders[channel].send(destination, code);

  return {
    challengeId: challenge.id,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    delivered: senders[channel].delivers,
    codeLength: code.length,
  };
}

/** "+91 98200 00000" and "9820000000" are one phone; an address is its lower case. */
function sameDestination(channel: OtpChannel, a: string, b: string): boolean {
  if (channel === 'EMAIL') return a.trim().toLowerCase() === b.trim().toLowerCase();
  const digits = (value: string) => value.replace(/[^0-9]/g, '').slice(-10);
  return digits(a) === digits(b);
}

/**
 * Refuses a second code to the same number or address within [seconds] of
 * the last, however the number is written. The app waits the same time
 * before it offers "Send again"; this is what stops a script that does not.
 */
async function assertResendAllowed(
  schoolId: string,
  channel: OtpChannel,
  destination: string,
  seconds: number,
): Promise<void> {
  if (seconds <= 0) return;

  const since = new Date(Date.now() - seconds * 1000);
  const recent = await prismaUnscoped.otpChallenge.findMany({
    where: { schoolId, channel, createdAt: { gt: since } },
    select: { destination: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const last = recent.find((row) => sameDestination(channel, row.destination, destination));
  if (!last) return;

  const wait = Math.max(
    1,
    Math.ceil((last.createdAt.getTime() + seconds * 1000 - Date.now()) / 1000),
  );
  throw ApiError.rateLimited(`Please wait ${wait} seconds before asking for another code.`, {
    retryAfterSeconds: wait,
  });
}

/**
 * Check a code against a challenge.
 *
 * Every refusal says the same thing. Which of "no such challenge", "expired",
 * "already used" and "wrong digits" it was tells somebody guessing where they
 * are, and tells the family nothing they can act on beyond "ask for a new one".
 */
export async function verifyChallenge(
  schoolId: string,
  challengeId: string,
  code: string,
): Promise<void> {
  const wrong = ApiError.badRequest(
    'That code is not right, or it has expired. Ask for a new one.',
  );

  const challenge = await prismaUnscoped.otpChallenge.findFirst({
    where: { id: challengeId, schoolId },
    select: { id: true, codeHash: true, expiresAt: true, usedAt: true, attempts: true },
  });

  if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) throw wrong;

  if (challenge.attempts >= MAX_ATTEMPTS) {
    // Spent. Expired rather than deleted, so the row still says what happened.
    await prismaUnscoped.otpChallenge.update({
      where: { id: challenge.id },
      data: { expiresAt: new Date() },
    });
    throw wrong;
  }

  if (challenge.codeHash !== hash(code)) {
    await prismaUnscoped.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw wrong;
  }

  await prismaUnscoped.otpChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: new Date() },
  });
}

/**
 * Spend a verified challenge on a registration.
 *
 * Checked against what is on the form, not just the id: otherwise a family
 * could prove one number, type another, and the school would ring a phone
 * nobody had answered for.
 *
 * Marked used in the same breath, so one proof cannot open two accounts.
 */
async function findVerified(
  schoolId: string,
  channel: OtpChannel,
  challengeId: string,
  destination: string,
): Promise<string> {
  const notVerified = ApiError.badRequest(
    channel === 'PHONE'
      ? 'Please confirm your mobile number with the code we sent before sending this.'
      : 'Please confirm your email address with the code we sent before sending this.',
  );

  const challenge = await prismaUnscoped.otpChallenge.findFirst({
    where: { id: challengeId, schoolId, channel, destination },
    select: { id: true, verifiedAt: true, usedAt: true, expiresAt: true },
  });

  if (!challenge || !challenge.verifiedAt || challenge.usedAt) throw notVerified;

  // A verified code is good for as long as it takes to finish the form, which
  // is what the rest of the expiry window is for.
  if (challenge.expiresAt.getTime() + env.OTP_TTL_SECONDS * 1000 <= Date.now()) {
    throw notVerified;
  }

  return challenge.id;
}

/**
 * Spend both proofs on one registration, or neither.
 *
 * Checked before either is marked, because spending the number and then
 * refusing the address would send a family back to confirm a number they had
 * already confirmed — for a mistake in the other field.
 */
export async function consumeVerifiedChallenges(
  schoolId: string,
  proofs: {
    phoneChallengeId: string;
    phone: string;
    emailChallengeId: string;
    email: string;
    /** The second number — the mother's or a guardian's — proved the same way. */
    secondPhoneChallengeId?: string;
    secondPhone?: string;
  },
): Promise<void> {
  const phoneId = await findVerified(
    schoolId,
    'PHONE',
    proofs.phoneChallengeId,
    proofs.phone,
  );
  const emailId = await findVerified(
    schoolId,
    'EMAIL',
    proofs.emailChallengeId,
    proofs.email,
  );
  const secondId =
    proofs.secondPhoneChallengeId && proofs.secondPhone
      ? await findVerified(schoolId, 'PHONE', proofs.secondPhoneChallengeId, proofs.secondPhone)
      : null;
  // One proof per number: the father's code cannot stand in for the mother's.
  if (secondId === phoneId) {
    throw ApiError.badRequest('Please confirm the second number with its own code.');
  }

  await prismaUnscoped.otpChallenge.updateMany({
    where: { id: { in: [phoneId, emailId, ...(secondId ? [secondId] : [])] } },
    data: { usedAt: new Date() },
  });
}
