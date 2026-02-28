import { describe, it, expect } from 'vitest';
import { buildAAD, deriveNonce, encryptChunk, decryptChunk } from '../src/aead.js';
import { randomBytes } from '@noble/ciphers/webcrypto';

const encKey = randomBytes(32);
const nonceKey = randomBytes(32);
const fileId = randomBytes(16);
const plaintext = new TextEncoder().encode('Hello, world!');

describe('buildAAD', () => {
  it('constructs correct AAD format (no index)', () => {
    const aad = buildAAD(fileId);
    const str = new TextDecoder().decode(aad);
    expect(str).toMatch(/^mdenc:v1\n[0-9a-f]{32}$/);
  });
});

describe('deriveNonce', () => {
  it('produces 24-byte nonce', () => {
    const nonce = deriveNonce(nonceKey, plaintext);
    expect(nonce.length).toBe(24);
  });

  it('same content produces same nonce (deterministic)', () => {
    const nonce1 = deriveNonce(nonceKey, plaintext);
    const nonce2 = deriveNonce(nonceKey, plaintext);
    expect(Buffer.from(nonce1).toString('hex')).toBe(
      Buffer.from(nonce2).toString('hex'),
    );
  });

  it('different content produces different nonce', () => {
    const other = new TextEncoder().encode('Different content');
    const nonce1 = deriveNonce(nonceKey, plaintext);
    const nonce2 = deriveNonce(nonceKey, other);
    expect(Buffer.from(nonce1).toString('hex')).not.toBe(
      Buffer.from(nonce2).toString('hex'),
    );
  });
});

describe('encryptChunk / decryptChunk', () => {
  it('round-trip encrypt/decrypt', () => {
    const payload = encryptChunk(encKey, nonceKey, plaintext, fileId);
    const result = decryptChunk(encKey, payload, fileId);
    expect(Buffer.from(result).toString()).toBe('Hello, world!');
  });

  it('same content produces same ciphertext (deterministic)', () => {
    const payload1 = encryptChunk(encKey, nonceKey, plaintext, fileId);
    const payload2 = encryptChunk(encKey, nonceKey, plaintext, fileId);
    expect(Buffer.from(payload1).toString('hex')).toBe(
      Buffer.from(payload2).toString('hex'),
    );
  });

  it('different content produces different ciphertext', () => {
    const other = new TextEncoder().encode('Different content');
    const payload1 = encryptChunk(encKey, nonceKey, plaintext, fileId);
    const payload2 = encryptChunk(encKey, nonceKey, other, fileId);
    expect(Buffer.from(payload1).toString('hex')).not.toBe(
      Buffer.from(payload2).toString('hex'),
    );
  });

  it('tampered ciphertext is rejected', () => {
    const payload = encryptChunk(encKey, nonceKey, plaintext, fileId);
    // Tamper with a byte in the ciphertext (after nonce)
    payload[30] ^= 0xff;
    expect(() => decryptChunk(encKey, payload, fileId)).toThrow(
      'authentication failed',
    );
  });

  it('wrong key is rejected', () => {
    const payload = encryptChunk(encKey, nonceKey, plaintext, fileId);
    const wrongKey = randomBytes(32);
    expect(() => decryptChunk(wrongKey, payload, fileId)).toThrow(
      'authentication failed',
    );
  });

  it('wrong file_id is rejected (cross-file swap detection)', () => {
    const payload = encryptChunk(encKey, nonceKey, plaintext, fileId);
    const otherFileId = randomBytes(16);
    expect(() => decryptChunk(encKey, payload, otherFileId)).toThrow(
      'authentication failed',
    );
  });
});
