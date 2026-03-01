import { describe, it, expect } from 'bun:test';
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

  it('deterministic: same content + same keys = same ciphertext', async () => {
    const encrypted1 = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, opts);
    const encrypted2 = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, {
      ...opts,
      previousFile: encrypted1,
    });

    // All chunk lines should be identical (deterministic encryption with same keys)
    const getChunks = (s: string) => s.split('\n').slice(2).filter(l => l !== '' && !l.startsWith('seal_b64='));
    const lines1 = getChunks(encrypted1);
    const lines2 = getChunks(encrypted2);
    expect(lines1.length).toBe(lines2.length);
    for (let i = 0; i < lines1.length; i++) {
      expect(lines2[i]).toBe(lines1[i]);
    }

    // Verify the reused file still decrypts
    const decrypted = await decrypt(encrypted2, TEST_PASSWORD);
    expect(decrypted).toBe(SIMPLE_MARKDOWN);
  });

  it('deterministic: modified chunks differ, unchanged stay same', async () => {
    const original = 'first\n\nsecond\n\nthird';
    const modified = 'first\n\nchanged\n\nthird';

    const encrypted1 = await encrypt(original, TEST_PASSWORD, opts);
    const encrypted2 = await encrypt(modified, TEST_PASSWORD, {
      ...opts,
      previousFile: encrypted1,
    });

    const getChunks = (s: string) => s.split('\n').slice(2).filter(l => l !== '' && !l.startsWith('seal_b64='));
    const lines1 = getChunks(encrypted1);
    const lines2 = getChunks(encrypted2);

    expect(lines2[0]).toBe(lines1[0]); // first unchanged
    expect(lines2[1]).not.toBe(lines1[1]); // second changed
    expect(lines2[2]).toBe(lines1[2]); // third unchanged

    const decrypted = await decrypt(encrypted2, TEST_PASSWORD);
    expect(decrypted).toBe(modified);
  });

  it('inserting a paragraph only adds one new line; surrounding chunks unchanged', async () => {
    const original = 'first\n\nsecond\n\nthird';
    const withInsert = 'first\n\nsecond\n\ninserted\n\nthird';

    const encrypted1 = await encrypt(original, TEST_PASSWORD, opts);
    const encrypted2 = await encrypt(withInsert, TEST_PASSWORD, {
      ...opts,
      previousFile: encrypted1,
    });

    const getChunks = (s: string) => s.split('\n').slice(2).filter(l => l !== '' && !l.startsWith('seal_b64='));
    const chunks1 = getChunks(encrypted1);
    const chunks2 = getChunks(encrypted2);

    expect(chunks2.length).toBe(chunks1.length + 1); // one new chunk
    expect(chunks2[0]).toBe(chunks1[0]); // "first\n\n" unchanged
    expect(chunks2[1]).toBe(chunks1[1]); // "second\n\n" unchanged
    // chunks2[2] is new ("inserted\n\n")
    expect(chunks2[3]).toBe(chunks1[2]); // "third" unchanged

    const decrypted = await decrypt(encrypted2, TEST_PASSWORD);
    expect(decrypted).toBe(withInsert);
  });

  it('handles large documents', async () => {
    const large = generateLargeMarkdown(50, 100);
    const encrypted = await encrypt(large, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(large);
  });

  it('tampered previous file falls back to fresh encryption', async () => {
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

    // Header should differ (fresh salt/fileId)
    const resultHeader = result.split('\n')[0];
    const originalHeader = encrypted.split('\n')[0];
    expect(resultHeader).not.toBe(originalHeader);
  });

  it('encrypted output is valid UTF-8 text with seal', async () => {
    const encrypted = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, opts);
    const lines = encrypted.split('\n');
    expect(lines[0]).toMatch(/^mdenc:v1 /);
    expect(lines[1]).toMatch(/^hdrauth_b64=/);
    // Chunk lines are base64, last non-empty line is seal
    const contentLines = lines.slice(2).filter(l => l !== '');
    const sealLine = contentLines.pop()!;
    expect(sealLine).toMatch(/^seal_b64=[A-Za-z0-9+/=]+$/);
    for (const line of contentLines) {
      expect(line).toMatch(/^[A-Za-z0-9+/=]+$/);
    }
  });
});
