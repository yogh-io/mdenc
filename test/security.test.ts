import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/encrypt.js';
import { TEST_PASSWORD, FAST_ARGON2 } from './helpers.js';

const opts = { argon2: FAST_ARGON2 };

describe('attack scenarios', () => {
  it('truncation attack — missing final chunk', async () => {
    const text = 'first\n\nsecond\n\nthird';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    // Remove the last chunk line
    const lines = encrypted.split('\n');
    lines.splice(lines.length - 2, 1); // remove last chunk (before trailing empty)
    const truncated = lines.join('\n');

    await expect(decrypt(truncated, TEST_PASSWORD)).rejects.toThrow(
      'authentication failed',
    );
  });

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

  it('chunk reorder', async () => {
    const text = 'first\n\nsecond\n\nthird';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    // Swap chunks at index 2 and 3 (first two chunk lines)
    const temp = lines[2];
    lines[2] = lines[3];
    lines[3] = temp;
    const reordered = lines.join('\n');

    await expect(decrypt(reordered, TEST_PASSWORD)).rejects.toThrow(
      'authentication failed',
    );
  });

  it('header parameter downgrade', async () => {
    const encrypted = await encrypt('hello', TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    // Tamper with argon2 params in header (change memory cost)
    lines[0] = lines[0].replace(/m=\d+/, 'm=512');
    const tampered = lines.join('\n');

    // Header HMAC should catch this
    await expect(decrypt(tampered, TEST_PASSWORD)).rejects.toThrow(
      'Header authentication failed',
    );
  });
});
