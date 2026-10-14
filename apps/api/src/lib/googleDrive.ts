/**
 * Google's sign-in and Drive endpoints, spoken over fetch.
 *
 * Not the `googleapis` package: that is tens of megabytes for the eight calls
 * below, on a box the API shares with three other projects.
 *
 * This file knows HTTP and nothing about schools. drive.service.ts decides
 * whose Drive, with which token, and who may ask.
 */

/**
 * The narrowest Drive permission there is: files this app made, and nothing
 * else in the account. Google lists it as non-sensitive, so a school sees an
 * ordinary consent screen and the app needs no security review to use it.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = ['openid', 'email', DRIVE_SCOPE];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Long enough for a megabyte on a slow line; short enough not to pile up. */
const TIMEOUT_MS = 30_000;

/**
 * What went wrong, in the terms the caller acts on:
 *
 * - `auth`: the school's permission is gone — removed from the Google account,
 *   or the password changed. Only reconnecting fixes it.
 * - `full`: the school's Drive has no room.
 * - `missing`: the file is not there, or not one this app made.
 * - `other`: Google is down, slow or rate-limiting; try again later.
 */
export type DriveErrorKind = 'auth' | 'full' | 'missing' | 'other';

export class DriveError extends Error {
  constructor(
    message: string,
    readonly kind: DriveErrorKind,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

export interface DriveGrant {
  refreshToken: string;
  /** The Google account that said yes. */
  email: string;
  /** What was actually granted: Google lets a person untick a permission. */
  scopes: string[];
}

export interface DriveClient {
  /** Where to send the school's administrator to say yes. */
  authUrl(state: string): string;
  exchangeCode(code: string): Promise<DriveGrant>;
  accessToken(refreshToken: string): Promise<{ token: string; expiresInSeconds: number }>;
  revoke(refreshToken: string): Promise<void>;
  createFolder(token: string, name: string, parentId?: string): Promise<string>;
  /** The folder is still there and not in the bin. */
  folderUsable(token: string, folderId: string): Promise<boolean>;
  upload(
    token: string,
    input: { folderId: string; name: string; mimeType: string; bytes: Buffer },
  ): Promise<{ id: string; sha256: string | null }>;
  download(token: string, fileId: string): Promise<Buffer>;
  /** To Drive's bin, where the school can still get it back for 30 days. */
  trash(token: string, fileId: string): Promise<void>;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GoogleDriveClient implements DriveClient {
  constructor(private readonly config: GoogleConfig) {}

  authUrl(state: string): string {
    const query = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      // A refresh token, so photos load long after the office closes the tab;
      // and asked for every time, because Google only hands one out on consent.
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${AUTH_URL}?${query.toString()}`;
  }

  async exchangeCode(code: string): Promise<DriveGrant> {
    const body = await this.token({
      code,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });

    const refreshToken = body.refresh_token;
    if (typeof refreshToken !== 'string') {
      throw new DriveError('Google did not give lasting access. Try connecting again.', 'auth');
    }

    return {
      refreshToken,
      email: emailFromIdToken(body.id_token) ?? '',
      scopes: typeof body.scope === 'string' ? body.scope.split(' ') : [],
    };
  }

  async accessToken(refreshToken: string): Promise<{ token: string; expiresInSeconds: number }> {
    const body = await this.token({ refresh_token: refreshToken, grant_type: 'refresh_token' });
    if (typeof body.access_token !== 'string') {
      throw new DriveError('Google did not give an access token', 'other');
    }
    return {
      token: body.access_token,
      expiresInSeconds: typeof body.expires_in === 'number' ? body.expires_in : 3600,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    await call(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' });
  }

  async createFolder(token: string, name: string, parentId?: string): Promise<string> {
    const response = await call(`${FILES_URL}?fields=id`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    return ((await response.json()) as { id: string }).id;
  }

  async folderUsable(token: string, folderId: string): Promise<boolean> {
    try {
      const response = await call(
        `${FILES_URL}/${encodeURIComponent(folderId)}?fields=id,trashed`,
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      const body = (await response.json()) as { trashed?: boolean };
      return body.trashed !== true;
    } catch (error) {
      if (error instanceof DriveError && error.kind === 'missing') return false;
      throw error;
    }
  }

  async upload(
    token: string,
    input: { folderId: string; name: string; mimeType: string; bytes: Buffer },
  ): Promise<{ id: string; sha256: string | null }> {
    // One request carrying both the description and the bytes. A resumable
    // upload is for files that might not arrive in one go; a gallery photo is
    // at most a megabyte.
    const boundary = `poetree${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const metadata = JSON.stringify({
      name: input.name,
      mimeType: input.mimeType,
      parents: [input.folderId],
    });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\ncontent-type: ${input.mimeType}\r\n\r\n`,
      ),
      input.bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const response = await call(`${UPLOAD_URL}?uploadType=multipart&fields=id,sha256Checksum`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const created = (await response.json()) as { id: string; sha256Checksum?: string };
    return { id: created.id, sha256: created.sha256Checksum ?? null };
  }

  async download(token: string, fileId: string): Promise<Buffer> {
    const response = await call(`${FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return Buffer.from(await response.arrayBuffer());
  }

  async trash(token: string, fileId: string): Promise<void> {
    try {
      await call(`${FILES_URL}/${encodeURIComponent(fileId)}?fields=id`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    } catch (error) {
      // Already gone is what was wanted.
      if (error instanceof DriveError && error.kind === 'missing') return;
      throw error;
    }
  }

  private async token(fields: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await call(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...fields,
      }).toString(),
    });
    return (await response.json()) as Record<string, unknown>;
  }
}

/**
 * The address in the ID token Google returned alongside the access token.
 *
 * Read without checking its signature, which OpenID allows for a token that
 * came straight from Google's token endpoint over TLS — it was not handed to
 * us by anybody else.
 */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: unknown;
    };
    return typeof claims.email === 'string' ? claims.email : null;
  } catch {
    return null;
  }
}

/** fetch, with a deadline, and Google's errors turned into DriveError. */
async function call(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new DriveError('Google Drive could not be reached. Try again in a minute.', 'other');
  }
  if (response.ok) return response;

  const text = await response.text().catch(() => '');
  let reason = '';
  let oauthError = '';
  try {
    const body = JSON.parse(text) as {
      error?: string | { errors?: Array<{ reason?: string }> };
    };
    if (typeof body.error === 'string') oauthError = body.error;
    else reason = body.error?.errors?.[0]?.reason ?? '';
  } catch {
    // Not JSON; the status says enough.
  }

  if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') {
    throw new DriveError(
      'The school’s Google Drive is full. Free up space in it, or add storage to that Google account.',
      'full',
    );
  }
  // Poetree's own client id or secret is wrong — the Super Admin's to fix, and
  // nothing to do with any school's access. Checked before the 401 below,
  // which is how Google answers it.
  if (oauthError === 'invalid_client') {
    throw new DriveError(
      'Poetree’s Google sign-in is not set up correctly. The Super Admin should check the client ID and secret under Google Drive.',
      'other',
    );
  }
  // A school's access was removed in its Google account, or was given to a
  // different Google client than the one now set up.
  if (
    oauthError === 'invalid_grant' ||
    oauthError === 'unauthorized_client' ||
    response.status === 401
  ) {
    throw new DriveError(
      'Google Drive access was removed. Connect the school’s Google Drive again.',
      'auth',
    );
  }
  if (response.status === 404 || reason === 'appNotAuthorizedToFile') {
    throw new DriveError('That file is not in the school’s Google Drive any more.', 'missing');
  }
  throw new DriveError(
    `Google Drive refused the request (${response.status}${reason ? `, ${reason}` : ''}). Try again in a minute.`,
    'other',
  );
}
