import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/encrypt.js';
import {
  TEST_PASSWORD,
  WRONG_PASSWORD,
  FAST_ARGON2,
  SIMPLE_MARKDOWN,
  MULTI_PARAGRAPH_MARKDOWN,
} from './helpers.js';
import { generateLargeMarkdown } from './helpers.js';

const opts = { argon2: FAST_ARGON2 };

describe('encrypt / decrypt', () => {
  it('round-trip for simple markdown', async () => {
    const encrypted = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(SIMPLE_MARKDOWN);
  });

  it('round-trip for multi-section markdown', async () => {
    const encrypted = await encrypt(MULTI_PARAGRAPH_MARKDOWN, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(MULTI_PARAGRAPH_MARKDOWN);
  });

  it('wrong password produces clear error', async () => {
    const encrypted = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, opts);
    await expect(decrypt(encrypted, WRONG_PASSWORD)).rejects.toThrow(
      'Header authentication failed',
    );
  });

  it('ciphertext reuse: unchanged chunks identical', async () => {
    const encrypted1 = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, opts);
    const encrypted2 = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, {
      ...opts,
      previousFile: encrypted1,
    });

    // All chunk lines should be identical (same content, same position)
    const lines1 = encrypted1.split('\n').slice(2).filter(l => l !== '');
    const lines2 = encrypted2.split('\n').slice(2).filter(l => l !== '');
    expect(lines1.length).toBe(lines2.length);
    for (let i = 0; i < lines1.length; i++) {
      expect(lines2[i]).toBe(lines1[i]);
    }

    // Verify the reused file still decrypts
    const decrypted = await decrypt(encrypted2, TEST_PASSWORD);
    expect(decrypted).toBe(SIMPLE_MARKDOWN);
  });

  it('ciphertext reuse: modified chunks differ', async () => {
    const original = 'first\n\nsecond\n\nthird';
    const modified = 'first\n\nchanged\n\nthird';

    const encrypted1 = await encrypt(original, TEST_PASSWORD, opts);
    const encrypted2 = await encrypt(modified, TEST_PASSWORD, {
      ...opts,
      previousFile: encrypted1,
    });

    const lines1 = encrypted1.split('\n').slice(2).filter(l => l !== '');
    const lines2 = encrypted2.split('\n').slice(2).filter(l => l !== '');

    expect(lines2[0]).toBe(lines1[0]); // first unchanged
    expect(lines2[1]).not.toBe(lines1[1]); // second changed
    // third: final flag changed position only if chunk count changed, but here it didn't
    // However, the final flag means the last chunk AAD differs, so reuse depends on that
    expect(lines2[2]).toBe(lines1[2]); // third unchanged (same final flag)

    const decrypted = await decrypt(encrypted2, TEST_PASSWORD);
    expect(decrypted).toBe(modified);
  });

  it('handles large documents', async () => {
    const large = generateLargeMarkdown(50, 100);
    const encrypted = await encrypt(large, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(large);
  });

  it('ciphertext reuse: tampered previous file falls back to fresh encryption', async () => {
    const text = 'hello\n\nworld';
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);

    // Tamper with the header auth line
    const lines = encrypted.split('\n');
    lines[1] = 'hdrauth_b64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const tampered = lines.join('\n');

    // Should still encrypt successfully (falls back to fresh keys)
    const result = await encrypt(text, TEST_PASSWORD, {
      ...opts,
      previousFile: tampered,
    });

    // Verify the result decrypts correctly
    const decrypted = await decrypt(result, TEST_PASSWORD);
    expect(decrypted).toBe(text);

    // Chunk lines should differ from the tampered source (fresh encryption)
    const resultLines = result.split('\n').slice(2).filter(l => l !== '');
    const tamperedChunks = tampered.split('\n').slice(2).filter(l => l !== '');
    // At least one chunk should differ since we generated fresh keys
    const allSame = resultLines.every((l, i) => l === tamperedChunks[i]);
    expect(allSame).toBe(false);
  });

  it('encrypted output is valid UTF-8 text', async () => {
    const encrypted = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, opts);
    // Should be all printable ASCII + base64 chars
    const lines = encrypted.split('\n');
    expect(lines[0]).toMatch(/^mdenc:v1 /);
    expect(lines[1]).toMatch(/^hdrauth_b64=/);
    for (let i = 2; i < lines.length - 1; i++) {
      expect(lines[i]).toMatch(/^[A-Za-z0-9+/=]+$/);
    }
  });
});
