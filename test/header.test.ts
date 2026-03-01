import { describe, it, expect } from 'bun:test';
import {
  serializeHeader,
  parseHeader,
  authenticateHeader,
  verifyHeader,
  generateSalt,
  generateFileId,
} from '../src/header.js';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { DEFAULT_SCRYPT_PARAMS } from '../src/types.js';
import type { MdencHeader } from '../src/types.js';

function makeHeader(): MdencHeader {
  return {
    version: 'v1',
    salt: generateSalt(),
    fileId: generateFileId(),
    scrypt: DEFAULT_SCRYPT_PARAMS,
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
    expect(parsed.scrypt).toEqual(original.scrypt);
  });

  it('all required fields present in serialized output', () => {
    const header = makeHeader();
    const line = serializeHeader(header);
    expect(line).toContain('mdenc:v1');
    expect(line).toContain('salt_b64=');
    expect(line).toContain('file_id_b64=');
    expect(line).toContain('scrypt=');
  });

  it('invalid headers produce clear errors', () => {
    expect(() => parseHeader('not a header')).toThrow('missing mdenc:v1');
    expect(() => parseHeader('mdenc:v1 file_id_b64=AAAA scrypt=N=1024,r=1,p=1')).toThrow('missing salt_b64');
    expect(() => parseHeader('mdenc:v1 salt_b64=AAAAAAAAAAAAAAAAAAAAAA== scrypt=N=1024,r=1,p=1')).toThrow('missing file_id_b64');
    expect(() => parseHeader('mdenc:v1 salt_b64=AAAAAAAAAAAAAAAAAAAAAA== file_id_b64=AAAAAAAAAAAAAAAAAAAAAA==')).toThrow('missing scrypt');
  });

  it('rejects out-of-bounds scrypt parameters', () => {
    const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
    const fid = 'AAAAAAAAAAAAAAAAAAAAAA==';
    // N too low
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=512,r=1,p=1`))
      .toThrow('Invalid scrypt N');
    // N too high
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=2000000,r=1,p=1`))
      .toThrow('Invalid scrypt N');
    // r too low
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=1024,r=0,p=1`))
      .toThrow('Invalid scrypt r');
    // r too high
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=1024,r=65,p=1`))
      .toThrow('Invalid scrypt r');
    // p too low
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=1024,r=1,p=0`))
      .toThrow('Invalid scrypt p');
    // p too high
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=1024,r=1,p=17`))
      .toThrow('Invalid scrypt p');
  });

  it('rejects scrypt N that is not a power of 2', () => {
    const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
    const fid = 'AAAAAAAAAAAAAAAAAAAAAA==';
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=1025,r=8,p=1`))
      .toThrow('must be a power of 2');
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=3000,r=8,p=1`))
      .toThrow('must be a power of 2');
    // Valid powers of 2 should pass
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=1024,r=8,p=1`))
      .not.toThrow();
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=16384,r=8,p=1`))
      .not.toThrow();
    expect(() => parseHeader(`mdenc:v1 salt_b64=${salt} file_id_b64=${fid} scrypt=N=1048576,r=8,p=1`))
      .not.toThrow();
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
    const tampered = line.replace('v1', 'v9');
    expect(verifyHeader(headerKey, tampered, mac)).toBe(false);
  });
});
