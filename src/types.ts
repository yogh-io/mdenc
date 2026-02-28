export interface Argon2Params {
  memory: number;  // KiB (default 65536 = 64 MiB)
  iterations: number;  // time cost (default 3)
  parallelism: number;  // lanes (default 1)
}

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memory: 65536,
  iterations: 3,
  parallelism: 1,
};

export const ARGON2_BOUNDS = {
  memory: { min: 1024, max: 4194304 },       // 1 MiB – 4 GiB
  iterations: { min: 1, max: 100 },
  parallelism: { min: 1, max: 16 },
} as const;

export interface MdencHeader {
  version: 'v1';
  salt: Uint8Array;        // 16 bytes
  fileId: Uint8Array;      // 16 bytes
  argon2: Argon2Params;
}

export interface MdencChunk {
  payload: Uint8Array;     // nonce || ciphertext || tag
}

export interface MdencFile {
  header: MdencHeader;
  headerLine: string;
  headerHmac: Uint8Array;
  chunks: MdencChunk[];
  sealHmac?: Uint8Array;   // present only if sealed
}

export enum ChunkingStrategy {
  Paragraph = 'paragraph',
  FixedSize = 'fixed-size',
}

export interface EncryptOptions {
  chunking?: ChunkingStrategy;
  maxChunkSize?: number;      // bytes, default 65536 (64 KiB)
  fixedChunkSize?: number;    // bytes, for fixed-size chunking
  argon2?: Argon2Params;
  previousFile?: string;      // previous encrypted file content for ciphertext reuse
}

export interface DecryptOptions {
  // Reserved for future options
}

export interface SealResult {
  sealed: string;             // the sealed file content
  hmac: Uint8Array;           // the file-level HMAC
}
