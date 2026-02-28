import { describe, it, expect } from 'vitest';
import {
  serializeHeader,
  parseHeader,
  authenticateHeader,
  verifyHeader,
  generateSalt,
  generateFileId,
} from '../src/header.js';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { DEFAULT_ARGON2_PARAMS } from '../src/types.js';
import type { MdencHeader } from '../src/types.js';

function makeHeader(): MdencHeader {
  return {
    version: 'v1',
    salt: generateSalt(),
    fileId: generateFileId(),
    argon2: DEFAULT_ARGON2_PARAMS,
  };
}

describe('serializeHeader / parseHeader', () => {
  it('round-trip serialize and parse', () => {
    const original = makeHeader();
    const line = serializeHeader(original);
    const parsed = parseHeader(line);
    expect(parsed.version).toBe('v1');
    expect(Buffer.from(parsed.salt).toString('hex')).toBe(
      Buffer.from(original.salt).toString('hex'),
    );
    expect(Buffer.from(parsed.fileId).toString('hex')).toBe(
      Buffer.from(original.fileId).toString('hex'),
    );
    expect(parsed.argon2).toEqual(original.argon2);
  });

  it('all required fields present in serialized output', () => {
    const header = makeHeader();
    const line = serializeHeader(header);
    expect(line).toContain('mdenc:v1');
    expect(line).toContain('salt_b64=');
    expect(line).toContain('file_id_b64=');
    expect(line).toContain('argon2=');
  });

  it('invalid headers produce clear errors', () => {
    expect(() => parseHeader('not a header')).toThrow('missing mdenc:v1');
    expect(() => parseHeader('mdenc:v1 file_id_b64=AAAA argon2=m=1,t=1,p=1')).toThrow('missing salt_b64');
    expect(() => parseHeader('mdenc:v1 salt_b64=AAAAAAAAAAAAAAAAAAAAAA== argon2=m=1,t=1,p=1')).toThrow('missing file_id_b64');
    expect(() => parseHeader('mdenc:v1 salt_b64=AAAAAAAAAAAAAAAAAAAAAA== file_id_b64=AAAAAAAAAAAAAAAAAAAAAA==')).toThrow('missing argon2');
  });
});

describe('authenticateHeader / verifyHeader', () => {
  const headerKey = randomBytes(32);

  it('HMAC round-trip', () => {
    const header = makeHeader();
    const line = serializeHeader(header);
    const mac = authenticateHeader(headerKey, line);
    expect(mac.length).toBe(32); // SHA-256 output
    expect(verifyHeader(headerKey, line, mac)).toBe(true);
  });

  it('tampered header is rejected', () => {
    const header = makeHeader();
    const line = serializeHeader(header);
    const mac = authenticateHeader(headerKey, line);
    const tampered = line.replace('v1', 'v2');
    expect(verifyHeader(headerKey, tampered, mac)).toBe(false);
  });
});
