import { describe, it } from 'vitest';

describe('buildAAD', () => {
  it.todo('constructs correct AAD format');
  it.todo('includes final flag for last chunk');
});

describe('encryptChunk / decryptChunk', () => {
  it.todo('round-trip encrypt/decrypt');
  it.todo('tampered ciphertext is rejected');
  it.todo('wrong key is rejected');
  it.todo('wrong index in AAD is rejected');
  it.todo('wrong file_id is rejected');
  it.todo('final flag mismatch is rejected');
  it.todo('each encryption produces different ciphertext');
});
