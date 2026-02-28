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
| Header auth | HMAC-SHA256 | Keyed with header_key |

## Key Separation

A single password produces two independent keys via HKDF:

- `enc_key` (info: `"mdenc-v1-enc"`) — used for XChaCha20-Poly1305 chunk encryption
- `header_key` (info: `"mdenc-v1-hdr"`) — used for header HMAC and seal HMAC

This separation ensures that compromising one key does not compromise the other.

## Integrity Properties

### Per-Chunk Authentication
Each chunk is authenticated by Poly1305 as part of XChaCha20-Poly1305. Tampering with any byte of ciphertext is detected.

### Chunk Binding (AAD)
The AAD binds each chunk to its version, file identity, and position:
- **Version binding**: Prevents cross-format attacks
- **File ID binding**: A random 16-byte file ID prevents swapping chunks between files
- **Position binding**: The chunk index prevents reordering
- **Finality binding**: The final flag prevents truncation

### Header Authentication
The header HMAC prevents tampering with algorithm parameters (e.g., downgrading Argon2id cost).

### Truncation Protection
The last chunk's AAD includes a `final` flag. The decryptor rejects files where the last chunk is not flagged as final. This detects truncation attacks where an attacker removes chunks from the end.

## Accepted Leakage

mdenc intentionally leaks the following metadata (this is inherent to the diff-friendly design):

- **Number of paragraphs**: Visible as the number of chunk lines
- **Approximate paragraph sizes**: Visible from base64 line lengths
- **Edit patterns**: When a paragraph changes, its chunk line changes in git diff
- **Which paragraphs changed**: Unchanged paragraphs have identical ciphertext (when using ciphertext reuse)
- **Argon2id parameters**: Stored in plaintext header

This leakage is accepted because the primary use case values diff-friendliness over metadata hiding.

## Ciphertext Reuse and Diff-Friendliness

The ciphertext reuse optimization (unchanged paragraphs keep the same ciphertext) is a deliberate design choice. It reveals which paragraphs were modified between commits but does not reveal content.

This is safe because:
- XChaCha20-Poly1305 is IND-CPA secure; identical ciphertext reveals nothing about plaintext
- Each chunk uses a random nonce; the same plaintext encrypted separately would produce different ciphertext
- Reuse only occurs when the encryptor explicitly detects unchanged chunks

## Rollback Protection

### With Git
Git's content-addressable storage (SHA-based commit hashes) inherently protects against rollback. An attacker cannot replace a file with an older version without it being visible in the git log.

### Without Git (Seal Operation)
The optional seal operation provides rollback protection outside git. A sealed file has a file-level HMAC over all chunk ciphertext. Replacing any chunk (even with a previously valid chunk) invalidates the seal.

Limitations of the seal:
- The seal is optional; unsealed files have no rollback protection
- Sealing re-encrypts all chunks (breaks ciphertext reuse)
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
