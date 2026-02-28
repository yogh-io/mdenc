import { describe, it, expect } from 'vitest';
import { buildAAD, encryptChunk, decryptChunk } from '../src/aead.js';
import { randomBytes } from '@noble/ciphers/webcrypto';

const encKey = randomBytes(32);
const fileId = randomBytes(16);
const plaintext = new TextEncoder().encode('Hello, world!');

describe('buildAAD', () => {
  it('constructs correct AAD format', () => {
    const aad = buildAAD(fileId, 0, false);
    const str = new TextDecoder().decode(aad);
    expect(str).toMatch(/^mdenc:v1\n[0-9a-f]{32}\nc:0:$/);
  });

  it('includes final flag for last chunk', () => {
    const aad = buildAAD(fileId, 5, true);
    const str = new TextDecoder().decode(aad);
    expect(str).toMatch(/^mdenc:v1\n[0-9a-f]{32}\nc:5:final$/);
  });
});

describe('encryptChunk / decryptChunk', () => {
  it('round-trip encrypt/decrypt', () => {
    const payload = encryptChunk(encKey, plaintext, fileId, 0, false);
    const result = decryptChunk(encKey, payload, fileId, 0, false);
    expect(Buffer.from(result).toString()).toBe('Hello, world!');
  });

  it('tampered ciphertext is rejected', () => {
    const payload = encryptChunk(encKey, plaintext, fileId, 0, false);
    // Tamper with a byte in the ciphertext (after nonce)
    payload[30] ^= 0xff;
    expect(() => decryptChunk(encKey, payload, fileId, 0, false)).toThrow(
      'authentication failed',
    );
  });

  it('wrong key is rejected', () => {
    const payload = encryptChunk(encKey, plaintext, fileId, 0, false);
    const wrongKey = randomBytes(32);
    expect(() => decryptChunk(wrongKey, payload, fileId, 0, false)).toThrow(
      'authentication failed',
    );
  });

  it('wrong index in AAD is rejected (reorder detection)', () => {
    const payload = encryptChunk(encKey, plaintext, fileId, 0, false);
    expect(() => decryptChunk(encKey, payload, fileId, 1, false)).toThrow(
      'authentication failed',
    );
  });

  it('wrong file_id is rejected (cross-file swap detection)', () => {
    const payload = encryptChunk(encKey, plaintext, fileId, 0, false);
    const otherFileId = randomBytes(16);
    expect(() => decryptChunk(encKey, payload, otherFileId, 0, false)).toThrow(
      'authentication failed',
    );
  });

  it('final flag mismatch is rejected', () => {
    const payload = encryptChunk(encKey, plaintext, fileId, 0, true);
    expect(() => decryptChunk(encKey, payload, fileId, 0, false)).toThrow(
      'authentication failed',
    );
  });

  it('each encryption produces different ciphertext (random nonce)', () => {
    const payload1 = encryptChunk(encKey, plaintext, fileId, 0, false);
    const payload2 = encryptChunk(encKey, plaintext, fileId, 0, false);
    expect(Buffer.from(payload1).toString('hex')).not.toBe(
      Buffer.from(payload2).toString('hex'),
    );
  });
});
