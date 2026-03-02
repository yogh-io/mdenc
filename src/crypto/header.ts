import { randomBytes } from "@noble/ciphers/webcrypto";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { constantTimeEqual } from "./crypto-utils.js";
import type { MdencHeader, ScryptParams } from "./types.js";
import { SCRYPT_BOUNDS } from "./types.js";

export function generateSalt(): Uint8Array {
  return randomBytes(16);
}

export function generateFileId(): Uint8Array {
  return randomBytes(16);
}

export function serializeHeader(header: MdencHeader): string {
  const saltB64 = toBase64(header.salt);
  const fileIdB64 = toBase64(header.fileId);
  const { N, r, p } = header.scrypt;
  return `mdenc:v1 salt_b64=${saltB64} file_id_b64=${fileIdB64} scrypt=N=${N},r=${r},p=${p}`;
}

export function parseHeader(line: string): MdencHeader {
  if (!line.startsWith("mdenc:v1 ")) {
    throw new Error("Invalid header: missing mdenc:v1 prefix");
  }

  const saltMatch = line.match(/salt_b64=([A-Za-z0-9+/=]+)/);
  if (!saltMatch?.[1]) throw new Error("Invalid header: missing salt_b64");
  const salt = fromBase64(saltMatch[1]);
  if (salt.length !== 16) throw new Error("Invalid header: salt must be 16 bytes");

  const fileIdMatch = line.match(/file_id_b64=([A-Za-z0-9+/=]+)/);
  if (!fileIdMatch?.[1]) throw new Error("Invalid header: missing file_id_b64");
  const fileId = fromBase64(fileIdMatch[1]);
  if (fileId.length !== 16) throw new Error("Invalid header: file_id must be 16 bytes");

  const scryptMatch = line.match(/scrypt=N=(\d+),r=(\d+),p=(\d+)/);
  if (!scryptMatch?.[1] || !scryptMatch[2] || !scryptMatch[3])
    throw new Error("Invalid header: missing scrypt parameters");
  const scryptParams: ScryptParams = {
    N: parseInt(scryptMatch[1], 10),
    r: parseInt(scryptMatch[2], 10),
    p: parseInt(scryptMatch[3], 10),
  };

  validateScryptParams(scryptParams);

  return { version: "v1", salt, fileId, scrypt: scryptParams };
}

export function validateScryptParams(params: ScryptParams): void {
  const { N, r, p } = SCRYPT_BOUNDS;
  if (params.N < N.min || params.N > N.max) {
    throw new Error(`Invalid scrypt N: ${params.N} (must be ${N.min}–${N.max})`);
  }
  if ((params.N & (params.N - 1)) !== 0) {
    throw new Error(`Invalid scrypt N: ${params.N} (must be a power of 2)`);
  }
  if (params.r < r.min || params.r > r.max) {
    throw new Error(`Invalid scrypt r: ${params.r} (must be ${r.min}–${r.max})`);
  }
  if (params.p < p.min || params.p > p.max) {
    throw new Error(`Invalid scrypt p: ${params.p} (must be ${p.min}–${p.max})`);
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
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
