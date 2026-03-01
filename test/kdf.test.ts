import { describe, it, expect } from 'bun:test';
import { normalizePassword, deriveMasterKey, deriveKeys } from '../src/kdf.js';
import { TEST_PASSWORD, WRONG_PASSWORD, FAST_SCRYPT } from './helpers.js';

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

  it('produces deterministic output', () => {
    const key1 = deriveMasterKey(TEST_PASSWORD, salt, FAST_SCRYPT);
    const key2 = deriveMasterKey(TEST_PASSWORD, salt, FAST_SCRYPT);
    expect(Buffer.from(key1).toString('hex')).toBe(
      Buffer.from(key2).toString('hex'),
    );
  });

  it('different passwords produce different keys', () => {
    const key1 = deriveMasterKey(TEST_PASSWORD, salt, FAST_SCRYPT);
    const key2 = deriveMasterKey(WRONG_PASSWORD, salt, FAST_SCRYPT);
    expect(Buffer.from(key1).toString('hex')).not.toBe(
      Buffer.from(key2).toString('hex'),
    );
  });

  it('key is 32 bytes', () => {
    const key = deriveMasterKey(TEST_PASSWORD, salt, FAST_SCRYPT);
    expect(key.length).toBe(32);
  });
});

describe('deriveKeys', () => {
  it('produces three distinct 32-byte keys', () => {
    const salt = new Uint8Array(16).fill(0x42);
    const masterKey = deriveMasterKey(TEST_PASSWORD, salt, FAST_SCRYPT);
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
