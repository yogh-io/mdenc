import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { argon2id } from 'hash-wasm';
import type { Argon2Params } from './types.js';
import { DEFAULT_ARGON2_PARAMS } from './types.js';

const ENC_INFO = new TextEncoder().encode('mdenc-v1-enc');
const HDR_INFO = new TextEncoder().encode('mdenc-v1-hdr');

export function normalizePassword(password: string): Uint8Array {
  const normalized = password.normalize('NFKC');
  return new TextEncoder().encode(normalized);
}

export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<Uint8Array> {
  const passwordBytes = normalizePassword(password);
  const hashHex = await argon2id({
    password: passwordBytes,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memory,
    hashLength: 32,
    outputType: 'hex',
  });
  return hexToBytes(hashHex);
}

export function deriveKeys(masterKey: Uint8Array): { encKey: Uint8Array; headerKey: Uint8Array } {
  const encKey = hkdf(sha256, masterKey, undefined, ENC_INFO, 32);
  const headerKey = hkdf(sha256, masterKey, undefined, HDR_INFO, 32);
  return { encKey, headerKey };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
