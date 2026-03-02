import { hkdf } from "@noble/hashes/hkdf";
import { scrypt } from "@noble/hashes/scrypt";
import { sha256 } from "@noble/hashes/sha256";
import { zeroize } from "./crypto-utils.js";
import type { ScryptParams } from "./types.js";
import { DEFAULT_SCRYPT_PARAMS } from "./types.js";

const ENC_INFO = new TextEncoder().encode("mdenc-v1-enc");
const HDR_INFO = new TextEncoder().encode("mdenc-v1-hdr");
const NONCE_INFO = new TextEncoder().encode("mdenc-v1-nonce");

export function normalizePassword(password: string): Uint8Array {
  const normalized = password.normalize("NFKC");
  return new TextEncoder().encode(normalized);
}

export function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Uint8Array {
  const passwordBytes = normalizePassword(password);
  try {
    return scrypt(passwordBytes, salt, {
      N: params.N,
      r: params.r,
      p: params.p,
      dkLen: 32,
    });
  } finally {
    zeroize(passwordBytes);
  }
}

export function deriveKeys(masterKey: Uint8Array): {
  encKey: Uint8Array;
  headerKey: Uint8Array;
  nonceKey: Uint8Array;
} {
  const encKey = hkdf(sha256, masterKey, undefined, ENC_INFO, 32);
  const headerKey = hkdf(sha256, masterKey, undefined, HDR_INFO, 32);
  const nonceKey = hkdf(sha256, masterKey, undefined, NONCE_INFO, 32);
  return { encKey, headerKey, nonceKey };
}
