import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { chunkByParagraph, chunkByFixedSize } from './chunking.js';
import { deriveMasterKey, deriveKeys } from './kdf.js';
import { encryptChunk, decryptChunk } from './aead.js';
import {
  serializeHeader,
  parseHeader,
  authenticateHeader,
  verifyHeader,
  generateSalt,
  generateFileId,
  toBase64,
  fromBase64,
} from './header.js';
import { ChunkingStrategy, DEFAULT_ARGON2_PARAMS } from './types.js';
import type { EncryptOptions, MdencHeader } from './types.js';
import { constantTimeEqual, zeroize } from './crypto-utils.js';

export async function encrypt(
  plaintext: string,
  password: string,
  options?: EncryptOptions,
): Promise<string> {
  const chunking = options?.chunking ?? ChunkingStrategy.Paragraph;
  const maxChunkSize = options?.maxChunkSize ?? 65536;
  const argon2 = options?.argon2 ?? DEFAULT_ARGON2_PARAMS;

  // Chunk the plaintext
  let chunks: string[];
  if (chunking === ChunkingStrategy.FixedSize) {
    const fixedSize = options?.fixedChunkSize ?? 4096;
    chunks = chunkByFixedSize(plaintext, fixedSize);
  } else {
    chunks = chunkByParagraph(plaintext, maxChunkSize);
  }

  // If previousFile provided, extract salt/fileId from its header for key continuity
  let salt: Uint8Array;
  let fileId: Uint8Array;
  const prev = options?.previousFile
    ? await parsePreviousFileHeader(options.previousFile, password)
    : undefined;

  if (prev) {
    salt = prev.salt;
    fileId = prev.fileId;
  } else {
    salt = generateSalt();
    fileId = generateFileId();
  }

  // Derive keys
  const masterKey = await deriveMasterKey(password, salt, argon2);
  const { encKey, headerKey, nonceKey } = deriveKeys(masterKey);

  try {
    // Build header
    const header: MdencHeader = { version: 'v1', salt, fileId, argon2 };
    const headerLine = serializeHeader(header);
    const headerHmac = authenticateHeader(headerKey, headerLine);
    const headerAuthLine = `hdrauth_b64=${toBase64(headerHmac)}`;

    // Encrypt chunks — deterministic encryption handles reuse automatically
    const chunkLines: string[] = [];
    for (const chunkText of chunks) {
      const chunkBytes = new TextEncoder().encode(chunkText);
      const payload = encryptChunk(encKey, nonceKey, chunkBytes, fileId);
      chunkLines.push(toBase64(payload));
    }

    // Compute seal HMAC over header + auth + chunk lines
    const sealInput = headerLine + '\n' + headerAuthLine + '\n' + chunkLines.join('\n');
    const sealData = new TextEncoder().encode(sealInput);
    const sealHmac = hmac(sha256, headerKey, sealData);
    const sealLine = `seal_b64=${toBase64(sealHmac)}`;

    return [headerLine, headerAuthLine, ...chunkLines, sealLine, ''].join('\n');
  } finally {
    zeroize(masterKey, encKey, headerKey, nonceKey);
  }
}

export async function decrypt(
  fileContent: string,
  password: string,
): Promise<string> {
  const lines = fileContent.split('\n');

  // Remove trailing empty line if present
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  if (lines.length < 3) {
    throw new Error('Invalid mdenc file: too few lines');
  }

  // Parse header
  const headerLine = lines[0];
  const header = parseHeader(headerLine);

  // Parse header auth
  const authLine = lines[1];
  const authMatch = authLine.match(/^hdrauth_b64=([A-Za-z0-9+/=]+)$/);
  if (!authMatch) {
    throw new Error('Invalid mdenc file: missing hdrauth_b64 line');
  }
  const headerHmac = fromBase64(authMatch[1]);

  // Derive keys
  const masterKey = await deriveMasterKey(password, header.salt, header.argon2);
  const { encKey, headerKey, nonceKey } = deriveKeys(masterKey);

  try {
    // Verify header HMAC
    if (!verifyHeader(headerKey, headerLine, headerHmac)) {
      throw new Error('Header authentication failed (wrong password or tampered header)');
    }

    // Collect chunk lines and seal line
    const remaining = lines.slice(2);
    const sealIndex = remaining.findIndex(l => l.startsWith('seal_b64='));
    if (sealIndex < 0) {
      throw new Error('Invalid mdenc file: missing seal');
    }

    const chunkLines = remaining.slice(0, sealIndex);
    if (chunkLines.length === 0) {
      throw new Error('Invalid mdenc file: no chunk lines');
    }

    // Verify seal HMAC
    const sealMatch = remaining[sealIndex].match(/^seal_b64=([A-Za-z0-9+/=]+)$/);
    if (!sealMatch) throw new Error('Invalid mdenc file: malformed seal line');
    const storedSealHmac = fromBase64(sealMatch[1]);

    const sealInput = headerLine + '\n' + authLine + '\n' + chunkLines.join('\n');
    const sealData = new TextEncoder().encode(sealInput);
    const computedSealHmac = hmac(sha256, headerKey, sealData);
    if (!constantTimeEqual(computedSealHmac, storedSealHmac)) {
      throw new Error('Seal verification failed (file tampered or chunks reordered)');
    }

    // Decrypt chunks
    const plaintextParts: string[] = [];
    for (const line of chunkLines) {
      const payload = fromBase64(line);
      const decrypted = decryptChunk(encKey, payload, header.fileId);
      plaintextParts.push(new TextDecoder().decode(decrypted));
    }

    return plaintextParts.join('');
  } finally {
    zeroize(masterKey, encKey, headerKey, nonceKey);
  }
}

async function parsePreviousFileHeader(
  fileContent: string,
  password: string,
): Promise<{ salt: Uint8Array; fileId: Uint8Array } | undefined> {
  try {
    const lines = fileContent.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length < 3) return undefined;

    const headerLine = lines[0];
    const header = parseHeader(headerLine);

    // Parse and verify header HMAC before trusting
    const authLine = lines[1];
    const authMatch = authLine.match(/^hdrauth_b64=([A-Za-z0-9+/=]+)$/);
    if (!authMatch) return undefined;
    const headerHmac = fromBase64(authMatch[1]);

    const masterKey = await deriveMasterKey(password, header.salt, header.argon2);
    const { headerKey } = deriveKeys(masterKey);

    if (!verifyHeader(headerKey, headerLine, headerHmac)) return undefined;

    zeroize(masterKey, headerKey);
    return { salt: header.salt, fileId: header.fileId };
  } catch {
    return undefined;
  }
}
