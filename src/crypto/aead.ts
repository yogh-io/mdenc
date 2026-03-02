import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";

const NONCE_LENGTH = 24;

export function buildAAD(fileId: Uint8Array): Uint8Array {
  const fileIdHex = bytesToHex(fileId);
  const aadString = `mdenc:v1\n${fileIdHex}`;
  return new TextEncoder().encode(aadString);
}

export function deriveNonce(nonceKey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const full = hmac(sha256, nonceKey, plaintext);
  return full.slice(0, NONCE_LENGTH);
}

export function encryptChunk(
  encKey: Uint8Array,
  nonceKey: Uint8Array,
  plaintext: Uint8Array,
  fileId: Uint8Array,
): Uint8Array {
  const nonce = deriveNonce(nonceKey, plaintext);
  const aad = buildAAD(fileId);
  const cipher = xchacha20poly1305(encKey, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);
  // Output: nonce || ciphertext || tag (tag is appended by noble)
  const result = new Uint8Array(NONCE_LENGTH + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, NONCE_LENGTH);
  return result;
}

export function decryptChunk(
  encKey: Uint8Array,
  payload: Uint8Array,
  fileId: Uint8Array,
): Uint8Array {
  if (payload.length < NONCE_LENGTH + 16) {
    throw new Error("Chunk payload too short");
  }
  const nonce = payload.slice(0, NONCE_LENGTH);
  const ciphertext = payload.slice(NONCE_LENGTH);
  const aad = buildAAD(fileId);
  const cipher = xchacha20poly1305(encKey, nonce, aad);
  try {
    return cipher.decrypt(ciphertext);
  } catch {
    throw new Error("Chunk authentication failed");
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}
