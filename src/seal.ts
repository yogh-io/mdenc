import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { deriveMasterKey, deriveKeys } from './kdf.js';
import { decryptChunk } from './aead.js';
import {
  parseHeader,
  verifyHeader,
  toBase64,
  fromBase64,
} from './header.js';
import { constantTimeEqual, zeroize } from './crypto-utils.js';

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
  const { encKey, headerKey, nonceKey } = deriveKeys(masterKey);

  try {
    // Verify header
    if (!verifyHeader(headerKey, headerLine, headerHmac)) {
      throw new Error('Header authentication failed (wrong password or tampered header)');
    }

    // Get chunk lines (strip old seal if present)
    const rawChunkLines = lines.slice(2);
    const sealIndex = rawChunkLines.findIndex(l => l.startsWith('seal_b64='));
    const chunkLines = sealIndex >= 0 ? rawChunkLines.slice(0, sealIndex) : rawChunkLines;

    // Verify each chunk decrypts (integrity check) — no re-encryption needed
    for (const line of chunkLines) {
      const payload = fromBase64(line);
      decryptChunk(encKey, payload, header.fileId);
    }

    // Compute seal HMAC over header + auth + chunk lines
    const sealInput = headerLine + '\n' + authLine + '\n' + chunkLines.join('\n');
    const sealData = new TextEncoder().encode(sealInput);
    const sealHmac = hmac(sha256, headerKey, sealData);
    const sealLine = `seal_b64=${toBase64(sealHmac)}`;

    return [headerLine, authLine, ...chunkLines, sealLine, ''].join('\n');
  } finally {
    zeroize(masterKey, encKey, headerKey, nonceKey);
  }
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
  const { encKey, headerKey, nonceKey } = deriveKeys(masterKey);

  try {
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

    // Verify seal HMAC (covers header + auth + chunk lines)
    const sealInput = headerLine + '\n' + authLine + '\n' + chunkLines.join('\n');
    const sealData = new TextEncoder().encode(sealInput);
    const computed = hmac(sha256, headerKey, sealData);

    return constantTimeEqual(computed, storedHmac);
  } finally {
    zeroize(masterKey, encKey, headerKey, nonceKey);
  }
}
