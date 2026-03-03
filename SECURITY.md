# mdenc Security Model

> **⚠️ No third-party audit.** mdenc has not been independently audited. The cryptographic design is documented here and in [SPECIFICATION.md](SPECIFICATION.md) and is open for review, but until a formal audit has been completed, use this at your own risk.

## Intended Use Case

mdenc is designed to **obscure content that shouldn't be publicly readable in a git repository** -- not to protect high-value secrets.

The expected scenario is a team storing internal documentation (process docs, environment setup notes, team contact info, onboarding guides) in a public or semi-public repo. This content shouldn't be in plaintext on the internet, but it isn't confidential enough to warrant a dedicated secrets management infrastructure.

**Crucially, the password is shared with everyone who needs access.** In practice it lives in a shared password manager entry, a pinned Slack message, or a team wiki. A widely-shared password is inherently a single point of failure: if it leaks, all content encrypted with it is exposed at once. This is an acceptable tradeoff when the content is "how to connect to our staging SFTP server" and an unacceptable one when the content is API keys, credentials, PII, or anything genuinely confidential.

**Do not use mdenc for:**
- Credentials, tokens, or API keys (use a secrets manager)
- Personally identifiable information subject to regulatory requirements
- Data where a single password leak would cause material harm
- Anything where the threat model requires protection against a determined, resourced attacker

## Audit Status

mdenc has **not** been independently audited. The underlying cryptographic primitives come from audited libraries (`@noble/ciphers`, `@noble/hashes`), but the protocol design, key derivation scheme, and implementation have not been reviewed by a third party. Community review and feedback are welcome.

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
| KDF | scrypt | N=16384, r=8, p=1 (default) |
| Key derivation | HKDF-SHA256 | Separate info strings per key |
| Nonce derivation | HMAC-SHA256 | Truncated to 24 bytes |
| Header auth | HMAC-SHA256 | Keyed with header_key |
| Seal | HMAC-SHA256 | Keyed with header_key |

## Key Separation

A single password produces three independent keys via HKDF:

- `enc_key` (info: `"mdenc-v1-enc"`) — used for XChaCha20-Poly1305 chunk encryption
- `header_key` (info: `"mdenc-v1-hdr"`) — used for header HMAC and seal HMAC
- `nonce_key` (info: `"mdenc-v1-nonce"`) — used for deterministic nonce derivation

This separation ensures that compromising one key does not compromise the others.

## Deterministic Encryption

mdenc uses deterministic nonces derived via `HMAC-SHA256(nonce_key, plaintext)`, truncated to 24 bytes. This means:

- **Same plaintext + same keys = same ciphertext**: This is the core mechanism for diff-friendliness. Unchanged paragraphs automatically produce identical ciphertext without explicit comparison.
- **Position-independent**: The AAD contains only the version and file ID (no chunk index or finality flag). Inserting a paragraph between existing ones does not change the ciphertext of surrounding paragraphs.

### Why This Is Safe

Deterministic encryption with XChaCha20-Poly1305 is safe here because:

1. The nonce is derived from both the key material (`nonce_key`) and the plaintext via HMAC-SHA256, which is a PRF. An attacker without the key cannot predict or control nonces.
2. Each file has a unique `nonce_key` (derived from a unique salt via scrypt + HKDF). Nonce reuse across files is not a concern.
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
The header HMAC prevents tampering with algorithm parameters (e.g., downgrading scrypt cost).

### Seal (File-Level Integrity)
Every mdenc file includes a seal: an HMAC-SHA256 over the header line, header auth line, and all chunk lines, keyed with `header_key`. The seal is always present -- encryption always produces it, and decryption always verifies it.

The seal detects:
- **Chunk reordering**: Changing the order of chunk lines invalidates the seal
- **Chunk truncation**: Removing chunks invalidates the seal
- **Rollback attacks**: Replacing chunks with older valid ciphertext invalidates the seal

Since the per-chunk AAD is position-independent (to enable minimal diffs on paragraph insertion), the seal is the mechanism that provides ordering and completeness guarantees.

## Accepted Leakage

mdenc intentionally leaks the following metadata (this is inherent to the diff-friendly design):

- **Number of paragraphs**: Visible as the number of chunk lines
- **Approximate paragraph sizes**: Visible from base64 line lengths
- **Edit patterns**: When a paragraph changes, its chunk line changes in git diff
- **Which paragraphs changed**: Unchanged paragraphs have identical ciphertext
- **Identical paragraphs**: Within a file, identical plaintext produces identical ciphertext, revealing repeated content
- **Scrypt parameters**: Stored in plaintext header

This leakage is accepted because the primary use case values diff-friendliness over metadata hiding.

## Cross-File Protection

Each file has a unique random file ID embedded in the AAD. Chunks from one file cannot be decrypted with another file's AAD, preventing cross-file chunk swapping attacks even when files share the same password.

## Rollback Protection

### With Git
Git's content-addressable storage (SHA-based commit hashes) inherently protects against rollback. An attacker cannot replace a file with an older version without it being visible in the git log.

### With Seal
The seal HMAC covers all chunk lines in order. Replacing any chunk (even with a previously valid chunk from the same file) invalidates the seal, which is verified on every decrypt.

## Password Requirements

mdenc uses scrypt for password stretching, which provides:
- Memory-hard computation (resists GPU/ASIC attacks)
- Time-hard computation (sequential memory access pattern)

The default parameters (N=16384, r=8, p=1, ~16 MiB memory) are suitable for interactive use. Users with higher security requirements can increase these parameters.

Passwords are NFKC-normalized before use to ensure consistent key derivation across platforms and input methods.

## Dependencies

mdenc uses no native dependencies:
- `@noble/ciphers` — XChaCha20-Poly1305 (audited, pure JS)
- `@noble/hashes` — scrypt, HKDF-SHA256, HMAC-SHA256 (audited, pure JS)

This avoids `node-gyp` compilation issues and supply chain risks from native modules.
