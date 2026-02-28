import { describe, it, expect } from 'vitest';
import { normalizePassword, deriveMasterKey, deriveKeys } from '../src/kdf.js';
import { TEST_PASSWORD, WRONG_PASSWORD, FAST_ARGON2 } from './helpers.js';

describe('normalizePassword', () => {
  it('normalizes NFKC (composed vs decomposed)', () => {
    // e-acute: U+00E9 (composed) vs U+0065 U+0301 (decomposed)
    const composed = normalizePassword('\u00e9');
    const decomposed = normalizePassword('\u0065\u0301');
    expect(Buffer.from(composed).toString('hex')).toBe(
      Buffer.from(decomposed).toString('hex'),
    );
  });

  it('returns UTF-8 encoded bytes', () => {
    const bytes = normalizePassword('hello');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString()).toBe('hello');
  });
});

describe('deriveMasterKey', () => {
  const salt = new Uint8Array(16).fill(0x42);

  it('produces deterministic output', async () => {
    const key1 = await deriveMasterKey(TEST_PASSWORD, salt, FAST_ARGON2);
    const key2 = await deriveMasterKey(TEST_PASSWORD, salt, FAST_ARGON2);
    expect(Buffer.from(key1).toString('hex')).toBe(
      Buffer.from(key2).toString('hex'),
    );
  });

  it('different passwords produce different keys', async () => {
    const key1 = await deriveMasterKey(TEST_PASSWORD, salt, FAST_ARGON2);
    const key2 = await deriveMasterKey(WRONG_PASSWORD, salt, FAST_ARGON2);
    expect(Buffer.from(key1).toString('hex')).not.toBe(
      Buffer.from(key2).toString('hex'),
    );
  });

  it('key is 32 bytes', async () => {
    const key = await deriveMasterKey(TEST_PASSWORD, salt, FAST_ARGON2);
    expect(key.length).toBe(32);
  });
});

describe('deriveKeys', () => {
  it('produces three distinct 32-byte keys', async () => {
    const salt = new Uint8Array(16).fill(0x42);
    const masterKey = await deriveMasterKey(TEST_PASSWORD, salt, FAST_ARGON2);
    const { encKey, headerKey, nonceKey } = deriveKeys(masterKey);

    expect(encKey.length).toBe(32);
    expect(headerKey.length).toBe(32);
    expect(nonceKey.length).toBe(32);

    const encHex = Buffer.from(encKey).toString('hex');
    const hdrHex = Buffer.from(headerKey).toString('hex');
    const nonceHex = Buffer.from(nonceKey).toString('hex');

    expect(encHex).not.toBe(hdrHex);
    expect(encHex).not.toBe(nonceHex);
    expect(hdrHex).not.toBe(nonceHex);
  });
});
