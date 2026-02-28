import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { deriveMasterKey, deriveKeys } from './kdf.js';
import { decryptChunk, encryptChunk } from './aead.js';
import {
  parseHeader,
  serializeHeader,
  authenticateHeader,
  verifyHeader,
  toBase64,
  fromBase64,
} from './header.js';

export async function seal(
  fileContent: string,
  password: string,
): Promise<string> {
  const lines = fileContent.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 3) throw new Error('Invalid mdenc file: too few lines');

  const headerLine = lines[0];
  const header = parseHeader(headerLine);

  // Parse header auth
  const authLine = lines[1];
  const authMatch = authLine.match(/^hdrauth_b64=([A-Za-z0-9+/=]+)$/);
  if (!authMatch) throw new Error('Invalid mdenc file: missing hdrauth_b64 line');
  const headerHmac = fromBase64(authMatch[1]);

  // Derive keys
  const masterKey = await deriveMasterKey(password, header.salt, header.argon2);
  const { encKey, headerKey } = deriveKeys(masterKey);

  // Verify header
  if (!verifyHeader(headerKey, headerLine, headerHmac)) {
    throw new Error('Header authentication failed (wrong password or tampered header)');
  }

  // Get chunk lines (strip old seal if present)
  const rawChunkLines = lines.slice(2);
  const sealIndex = rawChunkLines.findIndex(l => l.startsWith('seal_b64='));
  const oldChunkLines = sealIndex >= 0 ? rawChunkLines.slice(0, sealIndex) : rawChunkLines;

  // Re-encrypt all chunks with fresh nonces
  const newChunkLines: string[] = [];
  for (let i = 0; i < oldChunkLines.length; i++) {
    const isFinal = i === oldChunkLines.length - 1;
    const payload = fromBase64(oldChunkLines[i]);
    const plaintext = decryptChunk(encKey, payload, header.fileId, i, isFinal);
    const freshPayload = encryptChunk(encKey, plaintext, header.fileId, i, isFinal);
    newChunkLines.push(toBase64(freshPayload));
  }

  // Compute seal HMAC over all chunk lines
  const chunkData = new TextEncoder().encode(newChunkLines.join('\n'));
  const sealHmac = hmac(sha256, headerKey, chunkData);
  const sealLine = `seal_b64=${toBase64(sealHmac)}`;

  return [headerLine, authLine, ...newChunkLines, sealLine, ''].join('\n');
}

export async function verifySeal(
  fileContent: string,
  password: string,
): Promise<boolean> {
  const lines = fileContent.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 3) throw new Error('Invalid mdenc file: too few lines');

  const headerLine = lines[0];
  const header = parseHeader(headerLine);

  // Parse header auth
  const authLine = lines[1];
  const authMatch = authLine.match(/^hdrauth_b64=([A-Za-z0-9+/=]+)$/);
  if (!authMatch) throw new Error('Invalid mdenc file: missing hdrauth_b64 line');
  const headerHmac = fromBase64(authMatch[1]);

  // Derive keys
  const masterKey = await deriveMasterKey(password, header.salt, header.argon2);
  const { encKey, headerKey } = deriveKeys(masterKey);

  // Verify header
  if (!verifyHeader(headerKey, headerLine, headerHmac)) {
    throw new Error('Header authentication failed');
  }

  // Find seal line
  const chunkAndSealLines = lines.slice(2);
  const sealIndex = chunkAndSealLines.findIndex(l => l.startsWith('seal_b64='));
  if (sealIndex < 0) {
    throw new Error('File is not sealed: no seal_b64 line found');
  }

  const chunkLines = chunkAndSealLines.slice(0, sealIndex);
  const sealMatch = chunkAndSealLines[sealIndex].match(/^seal_b64=([A-Za-z0-9+/=]+)$/);
  if (!sealMatch) throw new Error('Invalid seal line');
  const storedHmac = fromBase64(sealMatch[1]);

  // Verify seal HMAC
  const chunkData = new TextEncoder().encode(chunkLines.join('\n'));
  const computed = hmac(sha256, headerKey, chunkData);

  return constantTimeEqual(computed, storedHmac);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
