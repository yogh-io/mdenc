import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/encrypt.js';
import { seal, verifySeal } from '../src/seal.js';
import { TEST_PASSWORD, FAST_ARGON2 } from './helpers.js';

const opts = { argon2: FAST_ARGON2 };

describe('seal / verifySeal', () => {
  it('sealed file decrypts correctly', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const sealed = await seal(encrypted, TEST_PASSWORD);
    const decrypted = await decrypt(sealed, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it('sealed file verifies successfully', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const sealed = await seal(encrypted, TEST_PASSWORD);
    const valid = await verifySeal(sealed, TEST_PASSWORD);
    expect(valid).toBe(true);
  });

  it('sealed file detects rollback (replaced chunk)', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const sealed = await seal(encrypted, TEST_PASSWORD);

    // Replace a chunk line with a different encryption of different text
    const text2 = 'hello\n\nother';
    const encrypted2 = await encrypt(text2, TEST_PASSWORD, opts);
    const sealed2 = await seal(encrypted2, TEST_PASSWORD);

    // Swap second chunk from sealed2 into sealed
    const lines1 = sealed.split('\n');
    const lines2 = sealed2.split('\n');
    lines1[3] = lines2[3]; // swap second chunk
    const tampered = lines1.join('\n');

    const valid = await verifySeal(tampered, TEST_PASSWORD);
    expect(valid).toBe(false);
  });

  it('sealed file detects truncation', async () => {
    const text = 'first\n\nsecond\n\nthird';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const sealed = await seal(encrypted, TEST_PASSWORD);

    // Remove a chunk line but keep the seal
    const lines = sealed.split('\n');
    // Find the seal line index
    const sealIdx = lines.findIndex(l => l.startsWith('seal_b64='));
    // Remove the chunk before the seal
    lines.splice(sealIdx - 1, 1);
    const truncated = lines.join('\n');

    const valid = await verifySeal(truncated, TEST_PASSWORD);
    expect(valid).toBe(false);
  });

  it('sealed file detects header tampering via seal HMAC', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const sealed = await seal(encrypted, TEST_PASSWORD);

    // Replace header auth with a re-computed one (simulating an attacker
    // who changes the header and can recompute the header HMAC, but cannot
    // forge the seal HMAC which now covers the header)
    const lines = sealed.split('\n');
    // Swap the auth line with a different (invalid) value
    lines[1] = 'hdrauth_b64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const tampered = lines.join('\n');

    // verifySeal should throw on header auth failure
    await expect(verifySeal(tampered, TEST_PASSWORD)).rejects.toThrow(
      'Header authentication failed',
    );
  });

  it('unsealed files still decrypt', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    // No seal, just decrypt
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it('verifySeal throws on unsealed file', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    await expect(verifySeal(encrypted, TEST_PASSWORD)).rejects.toThrow(
      'not sealed',
    );
  });
});
