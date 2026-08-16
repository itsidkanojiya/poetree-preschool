import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { NO_ACCEL_HEADER, sendStoredFile } from '../../src/lib/sendStoredFile.js';

/**
 * Who copies the bytes.
 *
 * Nginx does it in production, which leaves the API's own response body empty —
 * fine for a browser or a phone, which reach us through Nginx, and useless for
 * the portal's server, which fetches this API on loopback and so was handed
 * 200, the right content type, and nothing at all. Every picture in the portal
 * was an empty frame until this header existed.
 */

const FILE = { storageKey: '_publication/2026/08/abc.png' };

function request(headers: Record<string, string> = {}): Request {
  return { get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

function response() {
  const headers: Record<string, string> = {};
  return {
    headers,
    ended: false,
    sent: null as string | null,
    headersSent: false,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    end() {
      this.ended = true;
    },
    sendFile(path: string) {
      this.sent = path;
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('serving a stored file', () => {
  it('hands off to Nginx when it is in front', () => {
    vi.spyOn(env, 'USE_X_ACCEL_REDIRECT', 'get').mockReturnValue(true);
    const res = response();

    sendStoredFile(request(), res as unknown as Response, FILE);

    expect(res.headers['X-Accel-Redirect']).toBe(`/_protected_files/${FILE.storageKey}`);
    expect(res.ended).toBe(true);
    expect(res.sent).toBeNull();
  });

  it('sends the bytes itself to a caller that cannot follow the handoff', () => {
    // The portal's proxy. Nothing sits between it and us to answer the
    // redirect, so a handoff here is an empty picture on somebody's screen.
    vi.spyOn(env, 'USE_X_ACCEL_REDIRECT', 'get').mockReturnValue(true);
    const res = response();

    sendStoredFile(request({ [NO_ACCEL_HEADER]: '1' }), res as unknown as Response, FILE);

    expect(res.headers['X-Accel-Redirect']).toBeUndefined();
    expect(res.sent).toContain('abc.png');
  });

  it('sends the bytes itself where there is no Nginx at all', () => {
    vi.spyOn(env, 'USE_X_ACCEL_REDIRECT', 'get').mockReturnValue(false);
    const res = response();

    sendStoredFile(request(), res as unknown as Response, FILE);

    expect(res.headers['X-Accel-Redirect']).toBeUndefined();
    expect(res.sent).toContain('abc.png');
  });
});
