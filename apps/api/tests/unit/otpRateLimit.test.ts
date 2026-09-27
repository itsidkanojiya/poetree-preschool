import { describe, expect, it } from 'vitest';
import { otpDestinationKey } from '../../src/routes/public.routes.js';

const req = (channel: unknown, destination: unknown) => ({ body: { channel, destination } });

describe('code-sending throttling key', () => {
  it('counts one phone however its number is written', () => {
    // Otherwise a spacing or a +91 per request is a free pass through the cap.
    const plain = otpDestinationKey(req('PHONE', '9820000000'));

    expect(otpDestinationKey(req('PHONE', '+91 98200 00000'))).toBe(plain);
    expect(otpDestinationKey(req('PHONE', '098200-00000'))).toBe(plain);
  });

  it('counts one email address whatever its case', () => {
    expect(otpDestinationKey(req('EMAIL', '  Meera@Sunrise.test '))).toBe(
      otpDestinationKey(req('EMAIL', 'meera@sunrise.test')),
    );
  });

  it('keeps two families apart, whatever connection they share', () => {
    // The failure this replaces: keyed on the connection, the second family
    // registering over the school's Wi-Fi was locked out.
    expect(otpDestinationKey(req('PHONE', '9820000001'))).not.toBe(
      otpDestinationKey(req('PHONE', '9820000002')),
    );
  });

  it('keeps a phone and an email apart', () => {
    expect(otpDestinationKey(req('PHONE', '9820000000'))).not.toBe(
      otpDestinationKey(req('EMAIL', '9820000000')),
    );
  });

  it('survives a body with nothing sensible in it', () => {
    expect(otpDestinationKey({ body: undefined })).toBe('PHONE|');
    expect(otpDestinationKey(req(42, { not: 'a string' }))).toBe('PHONE|');
  });
});
