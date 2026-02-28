import { describe, it } from 'vitest';

describe('chunkByParagraph', () => {
  it.todo('splits on double newlines');
  it.todo('preserves separators in chunks');
  it.todo('handles single paragraph');
  it.todo('handles empty input');
  it.todo('splits oversized paragraphs at max chunk size');
  it.todo('normalizes Windows newlines');
  it.todo('editing one paragraph does not change other boundaries');
});

describe('chunkByFixedSize', () => {
  it.todo('splits at fixed byte boundaries');
  it.todo('handles input shorter than chunk size');
  it.todo('handles empty input');
});
