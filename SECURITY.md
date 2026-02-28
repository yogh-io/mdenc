# mdenc Security Model

## Threat Model

mdenc protects Markdown files at rest in git repositories. The assumed attacker can:

- Read all files in the repository (public repo or compromised hosting)
- View the full git history including all diffs
- Modify files in the repository (for integrity attacks)

The attacker cannot:

- Observe the password entry
- Access the machine where encryption/decryption occurs

## Cryptographic Primitives

| Purpose | Primitive | Parameters |
|---------|-----------|------------|
| Encryption | XChaCha20-Poly1305 | 256-bit key, 192-bit nonce |
| KDF | Argon2id | 64 MiB, 3 iterations, 1 lane |
| Key derivation | HKDF-SHA256 | Separate info strings per key |
| Nonce derivation | HMAC-SHA256 | Truncated to 24 bytes |
| Header auth | HMAC-SHA256 | Keyed with header_key |

## Key Separation

A single password produces three independent keys via HKDF:

- `enc_key` (info: `"mdenc-v1-enc"`) — used for XChaCha20-Poly1305 chunk encryption
- `header_key` (info: `"mdenc-v1-hdr"`) — used for header HMAC and seal HMAC
- `nonce_key` (info: `"mdenc-v1-nonce"`) — used for deterministic nonce derivation

This separation ensures that compromising one key does not compromise the others.

## Deterministic Encryption

mdenc v1 uses deterministic nonces derived via `HMAC-SHA256(nonce_key, plaintext)`, truncated to 24 bytes. This means:

- **Same plaintext + same keys = same ciphertext**: This is the core mechanism for diff-friendliness. Unchanged paragraphs automatically produce identical ciphertext without explicit comparison.
- **Position-independent**: The AAD contains only the version and file ID (no chunk index or finality flag). Inserting a paragraph between existing ones does not change the ciphertext of surrounding paragraphs.

### Why This Is Safe

Deterministic encryption with XChaCha20-Poly1305 is safe here because:

1. The nonce is derived from both the key material (`nonce_key`) and the plaintext via HMAC-SHA256, which is a PRF. An attacker without the key cannot predict or control nonces.
2. Each file has a unique `nonce_key` (derived from a unique salt via Argon2id + HKDF). Nonce reuse across files is not a concern.
3. Within a file, identical plaintext chunks intentionally produce identical ciphertext. This is accepted leakage (see below).
4. The 24-byte nonce space (192 bits) provides ample collision resistance even for large documents.

## Integrity Properties

### Per-Chunk Authentication
Each chunk is authenticated by Poly1305 as part of XChaCha20-Poly1305. Tampering with any byte of ciphertext is detected.

### File ID Binding (AAD)
The AAD binds each chunk to its version and file identity:
- **Version binding**: Prevents cross-format attacks
- **File ID binding**: A random 16-byte file ID prevents swapping chunks between files

### Header Authentication
The header HMAC prevents tampering with algorithm parameters (e.g., downgrading Argon2id cost).

### Seal (File-Level Integrity)
The optional seal provides file-level integrity via HMAC over all lines. It detects:
- **Chunk reordering**: Changing the order of chunk lines invalidates the seal
- **Chunk truncation**: Removing chunks invalidates the seal
- **Rollback attacks**: Replacing chunks with older valid ciphertext invalidates the seal

Without a seal, chunk reordering and truncation are not detected by AEAD alone (since AAD is position-independent). For high-integrity use cases, always seal after encrypting.

## Accepted Leakage

mdenc intentionally leaks the following metadata (this is inherent to the diff-friendly design):

- **Number of paragraphs**: Visible as the number of chunk lines
- **Approximate paragraph sizes**: Visible from base64 line lengths
- **Edit patterns**: When a paragraph changes, its chunk line changes in git diff
- **Which paragraphs changed**: Unchanged paragraphs have identical ciphertext
- **Identical paragraphs**: Within a file, identical plaintext produces identical ciphertext, revealing repeated content
- **Argon2id parameters**: Stored in plaintext header

This leakage is accepted because the primary use case values diff-friendliness over metadata hiding.

## Cross-File Protection

Each file has a unique random file ID embedded in the AAD. Chunks from one file cannot be decrypted with another file's AAD, preventing cross-file chunk swapping attacks even when files share the same password.

## Rollback Protection

### With Git
Git's content-addressable storage (SHA-based commit hashes) inherently protects against rollback. An attacker cannot replace a file with an older version without it being visible in the git log.

### Without Git (Seal Operation)
The optional seal operation provides rollback protection outside git. A sealed file has a file-level HMAC over all chunk ciphertext. Replacing any chunk (even with a previously valid chunk) invalidates the seal.

Limitations of the seal:
- The seal is optional; unsealed files have no rollback or reorder protection
- The seal protects a single point in time, not a history

## Password Requirements

mdenc uses Argon2id for password stretching, which provides:
- Memory-hard computation (resists GPU/ASIC attacks)
- Resistance to side-channel attacks (hybrid construction)

The default parameters (64 MiB, 3 iterations) are suitable for interactive use. Users with higher security requirements can increase these parameters.

Passwords are NFKC-normalized before use to ensure consistent key derivation across platforms and input methods.

## Dependencies

mdenc uses no native dependencies:
- `@noble/ciphers` — XChaCha20-Poly1305 (audited, pure JS)
- `@noble/hashes` — HKDF-SHA256, HMAC-SHA256 (audited, pure JS)
- `hash-wasm` — Argon2id (WASM, portable)

This avoids `node-gyp` compilation issues and supply chain risks from native modules.
