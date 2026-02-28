import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/ciphers/webcrypto';
import type { MdencHeader, Argon2Params } from './types.js';
import { DEFAULT_ARGON2_PARAMS, ARGON2_BOUNDS } from './types.js';
import { constantTimeEqual } from './crypto-utils.js';

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

  validateArgon2Params(argon2);

  return { version: 'v1', salt, fileId, argon2 };
}

export function validateArgon2Params(params: Argon2Params): void {
  const { memory, iterations, parallelism } = ARGON2_BOUNDS;
  if (params.memory < memory.min || params.memory > memory.max) {
    throw new Error(`Invalid Argon2 memory: ${params.memory} KiB (must be ${memory.min}–${memory.max})`);
  }
  if (params.iterations < iterations.min || params.iterations > iterations.max) {
    throw new Error(`Invalid Argon2 iterations: ${params.iterations} (must be ${iterations.min}–${iterations.max})`);
  }
  if (params.parallelism < parallelism.min || params.parallelism > parallelism.max) {
    throw new Error(`Invalid Argon2 parallelism: ${params.parallelism} (must be ${parallelism.min}–${parallelism.max})`);
  }
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

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
