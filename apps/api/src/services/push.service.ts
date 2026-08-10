import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../lib/logger.js';

/**
 * Firebase Cloud Messaging, spoken directly over HTTP v1.
 *
 * No firebase-admin dependency: the SDK pulls in a large tree for what is, at
 * this scale, one signed JWT and one POST per device. Doing it by hand keeps
 * the install small on a 2-core shared box and makes the failure modes visible.
 *
 * The service-account key lives only on the server, mode 600, and is excluded
 * from both git and the deploy rsync.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const KEY_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT ??
  resolve(process.cwd(), 'firebase-service-account.json');

let account: ServiceAccount | null = null;
let accountLoaded = false;

/** Absent credentials are a configuration state, not a crash. */
function serviceAccount(): ServiceAccount | null {
  if (accountLoaded) return account;
  accountLoaded = true;

  try {
    const parsed = JSON.parse(readFileSync(KEY_PATH, 'utf8')) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      logger.warn('Firebase key is missing required fields; push is disabled', { path: KEY_PATH });
      return (account = null);
    }
    logger.info('Firebase push enabled', { projectId: parsed.project_id });
    return (account = parsed);
  } catch {
    // Local development and CI have no key, and must still boot.
    logger.info('No Firebase key found; notifications will be stored but not pushed', {
      path: KEY_PATH,
    });
    return (account = null);
  }
}

export function isPushConfigured(): boolean {
  return serviceAccount() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Google access token from the service account.
 *
 * Cached until shortly before expiry — minting one per notification would add a
 * network round trip to every push and quickly hit rate limits on a busy
 * morning when a whole school marks attendance at once.
 */
async function accessToken(): Promise<string | null> {
  const key = serviceAccount();
  if (!key) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );

  const signature = base64url(
    createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key),
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!response.ok) {
    logger.error('Firebase token exchange failed', { status: response.status });
    return null;
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type PushOutcome = 'sent' | 'stale' | 'failed' | 'skipped';

/**
 * Sends one message.
 *
 * Returns `stale` when FCM says the token no longer exists, so the caller can
 * revoke it — otherwise a school accumulates dead tokens from reinstalled apps
 * and every send gets slower.
 */
export async function sendPush(message: PushMessage): Promise<PushOutcome> {
  const key = serviceAccount();
  if (!key) return 'skipped';

  const token = await accessToken();
  if (!token) return 'failed';

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: message.token,
          notification: { title: message.title, body: message.body },
          // Data values must be strings; the app deep-links from these.
          data: message.data ?? {},
          android: { priority: 'high' },
        },
      }),
    },
  );

  if (response.ok) return 'sent';

  // 404 UNREGISTERED and 400 with an invalid-argument on the token both mean
  // the device is gone. Anything else is worth retrying later.
  if (response.status === 404) return 'stale';

  const detail = await response.text().catch(() => '');
  if (response.status === 400 && detail.includes('registration token')) return 'stale';

  logger.warn('Push send failed', { status: response.status });
  return 'failed';
}
