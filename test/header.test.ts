import { describe, it } from 'vitest';

describe('serializeHeader / parseHeader', () => {
  it.todo('round-trip serialize and parse');
  it.todo('all required fields present');
  it.todo('invalid headers produce clear errors');
});

describe('authenticateHeader / verifyHeader', () => {
  it.todo('HMAC round-trip');
  it.todo('tampered header is rejected');
});
