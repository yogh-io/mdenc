import { describe, it, expect } from 'vitest';
import { chunkByParagraph, chunkByFixedSize } from '../src/chunking.js';
import {
  SIMPLE_MARKDOWN,
  SINGLE_PARAGRAPH_MARKDOWN,
  EMPTY_MARKDOWN,
  WINDOWS_NEWLINE_MARKDOWN,
  MULTI_PARAGRAPH_MARKDOWN,
} from './helpers.js';

describe('chunkByParagraph', () => {
  it('splits on double newlines', () => {
    const chunks = chunkByParagraph(SIMPLE_MARKDOWN);
    expect(chunks.length).toBe(3);
  });

  it('preserves separators in chunks', () => {
    const chunks = chunkByParagraph('aaa\n\nbbb\n\nccc');
    expect(chunks[0]).toBe('aaa\n\n');
    expect(chunks[1]).toBe('bbb\n\n');
    expect(chunks[2]).toBe('ccc');
    expect(chunks.join('')).toBe('aaa\n\nbbb\n\nccc');
  });

  it('handles single paragraph', () => {
    const chunks = chunkByParagraph(SINGLE_PARAGRAPH_MARKDOWN);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(SINGLE_PARAGRAPH_MARKDOWN);
  });

  it('handles empty input', () => {
    const chunks = chunkByParagraph(EMPTY_MARKDOWN);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('');
  });

  it('splits oversized paragraphs at max chunk size', () => {
    const longParagraph = 'x'.repeat(200);
    const chunks = chunkByParagraph(longParagraph, 64);
    expect(chunks.length).toBe(4); // 200 / 64 = 3.125 → 4 chunks
    expect(chunks.join('')).toBe(longParagraph);
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(new TextEncoder().encode(chunks[i]).length).toBeLessThanOrEqual(64);
    }
  });

  it('normalizes Windows newlines', () => {
    const chunks = chunkByParagraph(WINDOWS_NEWLINE_MARKDOWN);
    // Should be split into paragraphs with \n separators
    expect(chunks.join('')).not.toContain('\r');
    expect(chunks.length).toBe(3);
    expect(chunks.join('')).toBe('# Title\n\nFirst paragraph.\n\nSecond paragraph.');
  });

  it('editing one paragraph does not change other boundaries', () => {
    const original = 'first\n\nsecond\n\nthird';
    const edited = 'first\n\nmodified second\n\nthird';
    const originalChunks = chunkByParagraph(original);
    const editedChunks = chunkByParagraph(edited);
    expect(originalChunks.length).toBe(editedChunks.length);
    expect(originalChunks[0]).toBe(editedChunks[0]); // first unchanged
    expect(originalChunks[2]).toBe(editedChunks[2]); // third unchanged
    expect(originalChunks[1]).not.toBe(editedChunks[1]); // second changed
  });

  it('handles 3 consecutive newlines (extra newline stays with preceding chunk)', () => {
    const chunks = chunkByParagraph('A\n\n\nB');
    expect(chunks).toEqual(['A\n\n\n', 'B']);
    expect(chunks.join('')).toBe('A\n\n\nB');
  });

  it('handles 4 consecutive newlines', () => {
    const chunks = chunkByParagraph('A\n\n\n\nB');
    expect(chunks).toEqual(['A\n\n\n\n', 'B']);
    expect(chunks.join('')).toBe('A\n\n\n\nB');
  });

  it('round-trip: join always equals original input', () => {
    const inputs = [
      'A\n\nB',
      'A\n\n\nB',
      'A\n\n\n\nB',
      'A\n\n\n\n\nB',
      'A\n\nB\n\n\nC\n\n\n\nD',
      '\n\nleading',
      'trailing\n\n',
      '\n\n\n',
    ];
    for (const input of inputs) {
      const chunks = chunkByParagraph(input);
      expect(chunks.join('')).toBe(input);
    }
  });
});

describe('chunkByFixedSize', () => {
  it('splits at fixed byte boundaries', () => {
    const text = 'abcdefghij'; // 10 bytes
    const chunks = chunkByFixedSize(text, 4);
    expect(chunks).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('handles input shorter than chunk size', () => {
    const chunks = chunkByFixedSize('short', 100);
    expect(chunks).toEqual(['short']);
  });

  it('handles empty input', () => {
    const chunks = chunkByFixedSize('', 10);
    expect(chunks).toEqual(['']);
  });

  it('does not split multi-byte UTF-8 characters', () => {
    // 'é' is 2 bytes in UTF-8; split at byte 3 should not break it
    const text = 'aéb'; // a(1) + é(2) + b(1) = 4 bytes
    const chunks = chunkByFixedSize(text, 3);
    // Should split as 'aé' (3 bytes) and 'b' (1 byte)
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });
});
