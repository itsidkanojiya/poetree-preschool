import { describe, expect, it } from 'vitest';
import { loginRateLimitKey } from '../../src/routes/auth.routes.js';

const req = (ip: string, identifier?: unknown) => ({ ip, body: { identifier } });

describe('login throttling key', () => {
  it('separates two families behind the school’s one Wi-Fi', () => {
    // The failure this replaces: keyed on the address alone, ten sign-ins at
    // the gate locked every other parent out for fifteen minutes.
    const meera = loginRateLimitKey(req('49.36.1.7', 'meera@sunrise.test'));
    const anita = loginRateLimitKey(req('49.36.1.7', 'anita@sunrise.test'));

    expect(meera).not.toBe(anita);
  });

  it('still separates the same account seen from two addresses', () => {
    expect(loginRateLimitKey(req('49.36.1.7', 'meera@sunrise.test'))).not.toBe(
      loginRateLimitKey(req('103.21.9.4', 'meera@sunrise.test')),
    );
  });

  it('treats one account written loosely as one account', () => {
    // Otherwise a spelling variant per attempt is a free pass through the cap.
    expect(loginRateLimitKey(req('49.36.1.7', '  Meera@Sunrise.test '))).toBe(
      loginRateLimitKey(req('49.36.1.7', 'meera@sunrise.test')),
    );
  });

  it('falls back to the address when no identifier was sent', () => {
    const empty = loginRateLimitKey(req('49.36.1.7'));
    const nonString = loginRateLimitKey(req('49.36.1.7', 42));

    expect(empty).toBe(nonString);
    expect(empty.endsWith('|')).toBe(true);
  });
});

describe('address part of the key', () => {
  it('holds one mobile phone to one bucket as its IPv6 address rotates', () => {
    // A phone on mobile data changes the low half of its address freely and
    // keeps its /64; keying on the whole thing would give it a fresh allowance
    // every attempt.
    const first = loginRateLimitKey(req('2401:4900:1c80:9c1::a1b2', 'meera@sunrise.test'));
    const later = loginRateLimitKey(req('2401:4900:1c80:9c1::ff09', 'meera@sunrise.test'));

    expect(first).toBe(later);
  });

  it('keeps two different networks apart', () => {
    expect(loginRateLimitKey(req('2401:4900:1c80:9c1::a1b2', 'meera@sunrise.test'))).not.toBe(
      loginRateLimitKey(req('2401:4900:aaaa:9c1::a1b2', 'meera@sunrise.test')),
    );
  });
});
