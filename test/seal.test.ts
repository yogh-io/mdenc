import { describe, it, expect } from 'bun:test';
import { encrypt, decrypt } from '../src/encrypt.js';
import { verifySeal } from '../src/seal.js';
import { TEST_PASSWORD, FAST_ARGON2 } from './helpers.js';

const opts = { argon2: FAST_ARGON2 };

describe('seal (built into encrypt)', () => {
  it('encrypt always includes seal line', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    expect(encrypted).toContain('seal_b64=');
  });

  it('encrypted file verifies successfully', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const valid = await verifySeal(encrypted, TEST_PASSWORD);
    expect(valid).toBe(true);
  });

  it('decrypt detects replaced chunk', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const text2 = 'hello\n\nother';
    const encrypted2 = await encrypt(text2, TEST_PASSWORD, {
      ...opts,
      previousFile: encrypted,
    });

    // Swap second chunk from encrypted2 into encrypted
    const lines1 = encrypted.split('\n');
    const lines2 = encrypted2.split('\n');
    lines1[3] = lines2[3]; // swap second chunk
    const tampered = lines1.join('\n');

    await expect(decrypt(tampered, TEST_PASSWORD)).rejects.toThrow(
      'Seal verification failed',
    );
  });

  it('decrypt detects truncation', async () => {
    const text = 'first\n\nsecond\n\nthird';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    // Remove a chunk line but keep the seal
    const lines = encrypted.split('\n');
    const sealIdx = lines.findIndex(l => l.startsWith('seal_b64='));
    lines.splice(sealIdx - 1, 1); // remove chunk before seal
    const truncated = lines.join('\n');

    await expect(decrypt(truncated, TEST_PASSWORD)).rejects.toThrow(
      'Seal verification failed',
    );
  });

  it('decrypt detects chunk reorder', async () => {
    const text = 'first\n\nsecond\n\nthird';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    // Swap chunks at index 2 and 3
    const temp = lines[2];
    lines[2] = lines[3];
    lines[3] = temp;
    const reordered = lines.join('\n');

    await expect(decrypt(reordered, TEST_PASSWORD)).rejects.toThrow(
      'Seal verification failed',
    );
  });

  it('decrypt detects header tampering', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    lines[1] = 'hdrauth_b64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const tampered = lines.join('\n');

    await expect(decrypt(tampered, TEST_PASSWORD)).rejects.toThrow(
      'Header authentication failed',
    );
  });

  it('verifySeal detects tampering independently', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    const lines = encrypted.split('\n');
    // Swap two chunk lines
    const temp = lines[2];
    lines[2] = lines[3];
    lines[3] = temp;
    const tampered = lines.join('\n');

    const valid = await verifySeal(tampered, TEST_PASSWORD);
    expect(valid).toBe(false);
  });
});
