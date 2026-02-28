import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/ciphers/webcrypto';
import type { MdencHeader, Argon2Params } from './types.js';
import { DEFAULT_ARGON2_PARAMS } from './types.js';

export function generateSalt(): Uint8Array {
  return randomBytes(16);
}

export function generateFileId(): Uint8Array {
  return randomBytes(16);
}

export function serializeHeader(header: MdencHeader): string {
  const saltB64 = toBase64(header.salt);
  const fileIdB64 = toBase64(header.fileId);
  const { memory, iterations, parallelism } = header.argon2;
  return `mdenc:v1 salt_b64=${saltB64} file_id_b64=${fileIdB64} argon2=m=${memory},t=${iterations},p=${parallelism}`;
}

export function parseHeader(line: string): MdencHeader {
  if (!line.startsWith('mdenc:v1 ')) {
    throw new Error('Invalid header: missing mdenc:v1 prefix');
  }

  const saltMatch = line.match(/salt_b64=([A-Za-z0-9+/=]+)/);
  if (!saltMatch) throw new Error('Invalid header: missing salt_b64');
  const salt = fromBase64(saltMatch[1]);
  if (salt.length !== 16) throw new Error('Invalid header: salt must be 16 bytes');

  const fileIdMatch = line.match(/file_id_b64=([A-Za-z0-9+/=]+)/);
  if (!fileIdMatch) throw new Error('Invalid header: missing file_id_b64');
  const fileId = fromBase64(fileIdMatch[1]);
  if (fileId.length !== 16) throw new Error('Invalid header: file_id must be 16 bytes');

  const argonMatch = line.match(/argon2=m=(\d+),t=(\d+),p=(\d+)/);
  if (!argonMatch) throw new Error('Invalid header: missing argon2 parameters');
  const argon2: Argon2Params = {
    memory: parseInt(argonMatch[1], 10),
    iterations: parseInt(argonMatch[2], 10),
    parallelism: parseInt(argonMatch[3], 10),
  };

  return { version: 'v1', salt, fileId, argon2 };
}

export function authenticateHeader(headerKey: Uint8Array, headerLine: string): Uint8Array {
  const headerBytes = new TextEncoder().encode(headerLine);
  return hmac(sha256, headerKey, headerBytes);
}

export function verifyHeader(
  headerKey: Uint8Array,
  headerLine: string,
  hmacBytes: Uint8Array,
): boolean {
  const computed = authenticateHeader(headerKey, headerLine);
  return constantTimeEqual(computed, hmacBytes);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
