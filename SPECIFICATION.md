# mdenc v1 Specification

## Overview

mdenc is a diff-friendly encrypted Markdown format. It produces UTF-8 text output suitable for version control with git. The format encrypts Markdown files at paragraph granularity so that edits to one paragraph produce minimal diffs in the encrypted output.

## File Structure

An mdenc v1 file consists of:

1. A header line
2. A header authentication line
3. One or more encrypted chunk lines

All lines are separated by `\n` (LF). The file ends with a trailing `\n`.

### Header Line

```
mdenc:v1 salt_b64=<salt> file_id_b64=<file_id> argon2=m=<memory>,t=<iterations>,p=<parallelism>
```

Fields (space-separated key=value pairs after the version tag):

- `salt_b64`: 16-byte random salt, base64-encoded (no line wrapping)
- `file_id_b64`: 16-byte random file identifier, base64-encoded (no line wrapping)
- `argon2`: Argon2id parameters in the format `m=<memory_kib>,t=<iterations>,p=<parallelism>`

Default Argon2id parameters: `m=65536,t=3,p=1` (64 MiB memory, 3 iterations, 1 lane).

### Header Authentication Line

```
hdrauth_b64=<hmac>
```

HMAC-SHA256 of the header line (line 1, excluding its trailing newline), keyed with `header_key`. Base64-encoded, no line wrapping. This line is REQUIRED.

### Chunk Lines

Each subsequent line is a single encrypted chunk, base64-encoded without line wrapping. Each chunk encodes:

```
<24-byte nonce> || <ciphertext> || <16-byte Poly1305 tag>
```

The nonce is deterministically derived from the chunk plaintext (see below). The ciphertext and tag are produced by XChaCha20-Poly1305.

## Cryptographic Operations

### Password Normalization

Passwords MUST be normalized to Unicode NFKC form before use. This is REQUIRED, not optional. The normalized password is then UTF-8 encoded for use as the Argon2id input.

### Key Derivation

1. **Master key**: Derive a 32-byte master key from the NFKC-normalized password and salt using Argon2id with the parameters from the header.

2. **Encryption key** (`enc_key`): Derive from master key using HKDF-SHA256 with:
   - IKM: master key
   - Salt: (empty)
   - Info: `"mdenc-v1-enc"` (UTF-8 encoded)
   - Output length: 32 bytes

3. **Header key** (`header_key`): Derive from master key using HKDF-SHA256 with:
   - IKM: master key
   - Salt: (empty)
   - Info: `"mdenc-v1-hdr"` (UTF-8 encoded)
   - Output length: 32 bytes

4. **Nonce key** (`nonce_key`): Derive from master key using HKDF-SHA256 with:
   - IKM: master key
   - Salt: (empty)
   - Info: `"mdenc-v1-nonce"` (UTF-8 encoded)
   - Output length: 32 bytes

### Associated Authenticated Data (AAD)

Each chunk's AAD is constructed as:

```
mdenc:v1\n<file_id_hex>
```

Where:
- `\n` is a literal newline (0x0A)
- `<file_id_hex>` is the 16-byte file ID encoded as lowercase hexadecimal (32 characters)

The AAD is position-independent (no chunk index or finality flag). It binds each chunk to:
- The format version (prevents cross-format attacks)
- The file identity (prevents cross-file chunk swapping)

### Deterministic Nonce Derivation

For each chunk, the 24-byte nonce is derived deterministically:

1. Compute `HMAC-SHA256(nonce_key, plaintext)` over the chunk plaintext bytes
2. Truncate the 32-byte HMAC output to 24 bytes

This ensures that identical plaintext chunks (within the same file) always produce identical ciphertext. This is the mechanism by which mdenc achieves diff-friendliness without explicit ciphertext reuse logic.

### Chunk Encryption

For each chunk:

1. Derive the 24-byte nonce from the chunk plaintext using `nonce_key`
2. Construct the AAD as described above
3. Encrypt the chunk plaintext with XChaCha20-Poly1305 using `enc_key`, the nonce, and the AAD
4. Output: `nonce || ciphertext || tag` (base64-encoded as one line)

### Header Authentication

After constructing the header line, compute HMAC-SHA256 over the header line bytes (UTF-8, excluding trailing newline) using `header_key`. Output as the `hdrauth_b64` line.

## Chunking

### Paragraph Chunking (Default)

The default and recommended chunking strategy splits on paragraph boundaries (runs of 2 or more consecutive newlines). This preserves diff-friendliness: editing one paragraph changes only one chunk.

Rules:
1. Normalize line endings: `\r\n` → `\n`
2. Split on runs of 2+ consecutive newlines (`\n{2,}`)
3. Each boundary (the full run of newlines) is attached to the **preceding** content chunk
4. If any chunk exceeds the maximum chunk size (default 64 KiB), split it at byte boundaries at the cap size
5. Empty input produces a single empty chunk

Examples:
- `"A\n\nB"` → `["A\n\n", "B"]`
- `"A\n\n\nB"` → `["A\n\n\n", "B"]` (3-newline run preserved)
- `"A\n\n\n\nB"` → `["A\n\n\n\n", "B"]` (4-newline run preserved)

The invariant `chunks.join('') === original` always holds.

### Fixed-Size Chunking (Optional)

Split at fixed byte boundaries. This has poor diff characteristics for insertions (all subsequent chunks shift) and is not recommended for version-controlled files.

## Decryption

1. Parse the header line to extract salt, file_id, and Argon2id parameters
2. Derive master key, enc_key, header_key, and nonce_key from the password
3. Verify the header HMAC; reject if invalid
4. For each chunk line, decrypt with the file_id-based AAD
5. Concatenate decrypted chunks to recover the plaintext

## Diff-Friendly Encryption (Content-Addressed)

When re-encrypting a modified file, the encryptor reuses the salt and file_id from the previous encrypted version. Since encryption is deterministic (same plaintext + same keys = same ciphertext), unchanged chunks automatically produce identical ciphertext without any explicit comparison logic. This produces minimal `git diff` output.

Inserting a paragraph between existing paragraphs only adds one new line to the encrypted output; all surrounding chunks remain unchanged because the AAD and nonce derivation are position-independent.

## Seal Operation

The seal operation provides file-level integrity protection for use outside of git (which provides its own content integrity via SHA hashes).

Sealing:
1. Verify each chunk decrypts successfully (integrity check)
2. Compute HMAC-SHA256 over the header line, header auth line, and all chunk ciphertext lines (concatenated as `<header_line>\n<auth_line>\n<chunk_lines joined by \n>`), keyed with `header_key`
3. Append a seal line: `seal_b64=<hmac>`

The seal does NOT re-encrypt chunks. Chunk lines are preserved as-is.

Verification:
1. Verify the header HMAC
2. Verify the seal HMAC over the header line, header auth line, and all chunk lines

The seal is optional. Files without a seal line are valid and decrypt normally. The seal detects:
- Chunk reordering
- Chunk truncation
- Chunk replacement with older valid ciphertext (rollback)

## Base64 Encoding

All base64-encoded values in mdenc use standard base64 (RFC 4648 Section 4) with `+` and `/` characters, `=` padding, and NO line wrapping. Each encoded value appears on a single line.

## Security Properties

- **Confidentiality**: XChaCha20-Poly1305 with deterministic nonces
- **Chunk integrity**: Poly1305 authentication tag per chunk
- **File binding**: AAD prevents cross-file chunk swapping
- **Header integrity**: HMAC-SHA256 over header
- **Password stretching**: Argon2id
- **Key separation**: HKDF produces distinct enc_key, header_key, and nonce_key
- **File-level integrity** (with seal): HMAC over all lines detects reorder, truncation, rollback

## Accepted Leakage

The following information is visible in an mdenc file without the password:

- Number of chunks (number of lines minus 2)
- Approximate size of each chunk (base64 line length)
- Argon2id parameters
- The fact that the file is mdenc-encrypted
- Identical paragraphs produce identical ciphertext (reveals repeated content within a file)
