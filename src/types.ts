export interface ScryptParams {
  N: number;  // CPU/memory cost (default 16384 = 2^14, ~16 MiB with r=8)
  r: number;  // block size (default 8)
  p: number;  // parallelism (default 1)
}

export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  N: 16384,
  r: 8,
  p: 1,
};

export const SCRYPT_BOUNDS = {
  N: { min: 1024, max: 1048576 },       // 2^10 – 2^20
  r: { min: 1, max: 64 },
  p: { min: 1, max: 16 },
} as const;

export interface MdencHeader {
  version: 'v1';
  salt: Uint8Array;        // 16 bytes
  fileId: Uint8Array;      // 16 bytes
  scrypt: ScryptParams;
}

export interface MdencChunk {
  payload: Uint8Array;     // nonce || ciphertext || tag
}

export interface MdencFile {
  header: MdencHeader;
  headerLine: string;
  headerHmac: Uint8Array;
  chunks: MdencChunk[];
  sealHmac: Uint8Array;    // file-level HMAC
}

export enum ChunkingStrategy {
  Paragraph = 'paragraph',
  FixedSize = 'fixed-size',
}

export interface EncryptOptions {
  chunking?: ChunkingStrategy;
  maxChunkSize?: number;      // bytes, default 65536 (64 KiB)
  fixedChunkSize?: number;    // bytes, for fixed-size chunking
  scrypt?: ScryptParams;
  previousFile?: string;      // previous encrypted file content for ciphertext reuse
}

export interface DecryptOptions {
  // Reserved for future options
}
