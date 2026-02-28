import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/encrypt.js';
import { TEST_PASSWORD, FAST_ARGON2 } from './helpers.js';

const opts = { argon2: FAST_ARGON2 };

describe('attack scenarios', () => {
  it('cross-file chunk swap', async () => {
    const text1 = 'file one\n\nsecond chunk';
    const text2 = 'file two\n\nsecond chunk';

    const enc1 = await encrypt(text1, TEST_PASSWORD, opts);
    const enc2 = await encrypt(text2, TEST_PASSWORD, opts);

    // Swap first chunk from file2 into file1
    const lines1 = enc1.split('\n');
    const lines2 = enc2.split('\n');
    lines1[2] = lines2[2]; // replace first chunk
    const swapped = lines1.join('\n');

    await expect(decrypt(swapped, TEST_PASSWORD)).rejects.toThrow(
      'authentication failed',
    );
  });

  it('header parameter downgrade', async () => {
    const encrypted = await encrypt('hello', TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    // Tamper with argon2 params in header (change memory cost to in-bounds value)
    lines[0] = lines[0].replace(/m=\d+/, 'm=2048');
    const tampered = lines.join('\n');

    // Header HMAC should catch this
    await expect(decrypt(tampered, TEST_PASSWORD)).rejects.toThrow(
      'Header authentication failed',
    );
  });

  it('rejects Argon2 parameter DoS (extreme values)', async () => {
    const encrypted = await encrypt('hello', TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    // Set absurdly high memory to attempt DoS
    lines[0] = lines[0].replace(/m=\d+/, 'm=999999999');
    const tampered = lines.join('\n');

    // Bounds check catches this before HMAC or KDF
    await expect(decrypt(tampered, TEST_PASSWORD)).rejects.toThrow(
      'Invalid Argon2 memory',
    );
  });

  it('identical paragraphs produce identical ciphertext (documented leakage)', async () => {
    const text = 'same content\n\nsame content\n\ndifferent';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const chunks = encrypted.split('\n').slice(2).filter(l => l !== '');
    // The two "same content\n\n" chunks should have identical ciphertext
    expect(chunks[0]).toBe(chunks[1]);
    // The "different" chunk should differ
    expect(chunks[0]).not.toBe(chunks[2]);

    // Still decrypts correctly
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });
});
