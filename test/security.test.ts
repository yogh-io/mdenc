import { describe, it, expect } from 'bun:test';
import { encrypt, decrypt } from '../src/encrypt.js';
import { TEST_PASSWORD, FAST_SCRYPT } from './helpers.js';

const opts = { scrypt: FAST_SCRYPT };

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

    await expect(decrypt(swapped, TEST_PASSWORD)).rejects.toThrow();
  });

  it('chunk reorder detected by seal', async () => {
    const text = 'first\n\nsecond\n\nthird';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    const temp = lines[2];
    lines[2] = lines[3];
    lines[3] = temp;
    const reordered = lines.join('\n');

    await expect(decrypt(reordered, TEST_PASSWORD)).rejects.toThrow(
      'Seal verification failed',
    );
  });

  it('truncation detected by seal', async () => {
    const text = 'first\n\nsecond\n\nthird';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    const sealIdx = lines.findIndex(l => l.startsWith('seal_b64='));
    lines.splice(sealIdx - 1, 1); // remove last chunk
    const truncated = lines.join('\n');

    await expect(decrypt(truncated, TEST_PASSWORD)).rejects.toThrow(
      'Seal verification failed',
    );
  });

  it('header parameter downgrade', async () => {
    const encrypted = await encrypt('hello', TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    lines[0] = lines[0].replace(/N=\d+/, 'N=2048');
    const tampered = lines.join('\n');

    await expect(decrypt(tampered, TEST_PASSWORD)).rejects.toThrow(
      'Header authentication failed',
    );
  });

  it('rejects scrypt parameter DoS (extreme values)', async () => {
    const encrypted = await encrypt('hello', TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    lines[0] = lines[0].replace(/N=\d+/, 'N=999999999');
    const tampered = lines.join('\n');

    await expect(decrypt(tampered, TEST_PASSWORD)).rejects.toThrow(
      'Invalid scrypt N',
    );
  });

  it('identical paragraphs produce identical ciphertext (documented leakage)', async () => {
    const text = 'same content\n\nsame content\n\ndifferent';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const chunks = encrypted.split('\n').slice(2).filter(l => l !== '' && !l.startsWith('seal_b64='));
    expect(chunks[0]).toBe(chunks[1]);
    expect(chunks[0]).not.toBe(chunks[2]);

    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });
});
