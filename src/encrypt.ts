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

interface PreviousFileData {
  header: MdencHeader;
  chunkLines: string[];
  encKey: Uint8Array;
}

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

  // Handle ciphertext reuse from previous file
  let prev: PreviousFileData | undefined;
  if (options?.previousFile) {
    prev = await parsePreviousFile(options.previousFile, password);
  }

  // Reuse salt/fileId from previous file for ciphertext reuse, or generate new ones
  const salt = prev ? prev.header.salt : generateSalt();
  const fileId = prev ? prev.header.fileId : generateFileId();

  // Derive keys
  const masterKey = await deriveMasterKey(password, salt, argon2);
  const { encKey, headerKey } = deriveKeys(masterKey);

  // Build header
  const header: MdencHeader = { version: 'v1', salt, fileId, argon2 };
  const headerLine = serializeHeader(header);
  const headerHmac = authenticateHeader(headerKey, headerLine);
  const headerAuthLine = `hdrauth_b64=${toBase64(headerHmac)}`;

  // Encrypt chunks, reusing ciphertext where possible
  const chunkLines: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const isFinal = i === chunks.length - 1;
    const chunkText = chunks[i];
    const chunkBytes = new TextEncoder().encode(chunkText);

    let reused = false;
    if (prev && i < prev.chunkLines.length) {
      // Try to decrypt previous chunk at this index to compare
      try {
        const prevPayload = fromBase64(prev.chunkLines[i]);
        const prevIsFinal = i === prev.chunkLines.length - 1;
        const prevPlaintext = decryptChunk(prev.encKey, prevPayload, fileId, i, prevIsFinal);
        // Compare plaintext — if identical AND final flag matches, reuse
        if (isFinal === prevIsFinal && arraysEqual(chunkBytes, prevPlaintext)) {
          chunkLines.push(prev.chunkLines[i]);
          reused = true;
        }
      } catch {
        // Previous chunk can't be decrypted at this index; encrypt fresh
      }
    }

    if (!reused) {
      const payload = encryptChunk(encKey, chunkBytes, fileId, i, isFinal);
      chunkLines.push(toBase64(payload));
    }
  }

  return [headerLine, headerAuthLine, ...chunkLines, ''].join('\n');
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
  const { encKey, headerKey } = deriveKeys(masterKey);

  // Verify header HMAC
  if (!verifyHeader(headerKey, headerLine, headerHmac)) {
    throw new Error('Header authentication failed (wrong password or tampered header)');
  }

  // Collect chunk lines (exclude seal line if present)
  const chunkLines = lines.slice(2);
  const sealIndex = chunkLines.findIndex(l => l.startsWith('seal_b64='));
  const actualChunkLines = sealIndex >= 0 ? chunkLines.slice(0, sealIndex) : chunkLines;

  if (actualChunkLines.length === 0) {
    throw new Error('Invalid mdenc file: no chunk lines');
  }

  // Decrypt chunks
  const plaintextParts: string[] = [];
  for (let i = 0; i < actualChunkLines.length; i++) {
    const isFinal = i === actualChunkLines.length - 1;
    const payload = fromBase64(actualChunkLines[i]);
    const decrypted = decryptChunk(encKey, payload, header.fileId, i, isFinal);
    plaintextParts.push(new TextDecoder().decode(decrypted));
  }

  return plaintextParts.join('');
}

async function parsePreviousFile(
  fileContent: string,
  password: string,
): Promise<PreviousFileData | undefined> {
  try {
    const lines = fileContent.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length < 3) return undefined;

    const header = parseHeader(lines[0]);
    const masterKey = await deriveMasterKey(password, header.salt, header.argon2);
    const { encKey } = deriveKeys(masterKey);

    const chunkLines = lines.slice(2);
    const sealIndex = chunkLines.findIndex(l => l.startsWith('seal_b64='));
    const actualChunkLines = sealIndex >= 0 ? chunkLines.slice(0, sealIndex) : chunkLines;

    return { header, chunkLines: actualChunkLines, encKey };
  } catch {
    return undefined;
  }
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
