import { describe, it } from 'vitest';

describe('encrypt / decrypt', () => {
  it.todo('round-trip for simple markdown');
  it.todo('round-trip for multi-section markdown');
  it.todo('wrong password produces clear error');
  it.todo('ciphertext reuse: unchanged chunks identical');
  it.todo('ciphertext reuse: modified chunks differ');
  it.todo('handles large documents');
});

describe('security', () => {
  it.todo('truncation attack detected');
  it.todo('cross-file chunk swap detected');
  it.todo('chunk reorder detected');
  it.todo('header tampering detected');
});
