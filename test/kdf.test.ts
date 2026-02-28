import { describe, it } from 'vitest';

describe('normalizePassword', () => {
  it.todo('normalizes NFKC (composed vs decomposed)');
});

describe('deriveMasterKey', () => {
  it.todo('produces deterministic output');
  it.todo('different passwords produce different keys');
});

describe('deriveKeys', () => {
  it.todo('enc_key differs from header_key');
  it.todo('keys are 32 bytes');
});
