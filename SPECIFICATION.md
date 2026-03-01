# mdenc v1 Specification

## Overview

mdenc is a diff-friendly encrypted Markdown format. It produces UTF-8 text output suitable for version control with git. The format encrypts Markdown files at paragraph granularity so that edits to one paragraph produce minimal diffs in the encrypted output.

## File Structure

An mdenc v1 file consists of:

1. A header line
2. A header authentication line
3. One or more encrypted chunk lines
4. A seal line

All lines are separated by `\n` (LF). The file ends with a trailing `\n`.

### Header Line

```
mdenc:v1 salt_b64=<salt> file_id_b64=<file_id> scrypt=N=<N>,r=<r>,p=<p>
```

Fields (space-separated key=value pairs after the version tag):

- `salt_b64`: 16-byte random salt, base64-encoded (no line wrapping)
- `file_id_b64`: 16-byte random file identifier, base64-encoded (no line wrapping)
- `scrypt`: scrypt parameters in the format `N=<N>,r=<r>,p=<p>` where N must be a power of 2

Default scrypt parameters: `N=16384,r=8,p=1` (~16 MiB memory with r=8).

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

### Seal Line

```
seal_b64=<hmac>
```

HMAC-SHA256 over the header line, header auth line, and all chunk lines (see Seal below). This line is REQUIRED. It MUST be the last line before the trailing newline.

## Cryptographic Operations

### Password Normalization

Passwords MUST be normalized to Unicode NFKC form before use. This is REQUIRED, not optional. The normalized password is then UTF-8 encoded for use as the scrypt input.

### Key Derivation

1. **Master key**: Derive a 32-byte master key from the NFKC-normalized password and salt using scrypt with the parameters from the header.

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

### Seal

After encrypting all chunks, compute HMAC-SHA256 over the concatenation of:

```
<header_line>\n<auth_line>\n<chunk_lines joined by \n>
```

keyed with `header_key`. Output as the `seal_b64` line.

The seal is REQUIRED. Encryption always produces a seal, and decryption always verifies it. The seal detects:
- Chunk reordering
- Chunk truncation
- Chunk replacement with older valid ciphertext (rollback)

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

## Encryption

1. Chunk the plaintext
2. Derive master key, enc_key, header_key, and nonce_key from the password and salt
3. Serialize the header and compute the header HMAC
4. Encrypt each chunk with deterministic nonces
5. Compute the seal HMAC over all preceding lines
6. Output: header line, header auth line, chunk lines, seal line, trailing newline

## Decryption

1. Parse the header line to extract salt, file_id, and scrypt parameters
2. Derive master key, enc_key, header_key, and nonce_key from the password
3. Verify the header HMAC; reject if invalid
4. Verify the seal HMAC; reject if invalid (detects reorder, truncation, rollback)
5. Decrypt each chunk with the file_id-based AAD
6. Concatenate decrypted chunks to recover the plaintext

## Diff-Friendly Encryption (Content-Addressed)

When re-encrypting a modified file, the encryptor reuses the salt and file_id from the previous encrypted version. Since encryption is deterministic (same plaintext + same keys = same ciphertext), unchanged chunks automatically produce identical ciphertext without any explicit comparison logic. This produces minimal `git diff` output.

Inserting a paragraph between existing paragraphs only adds one new chunk line to the encrypted output; all surrounding chunks remain unchanged because the AAD and nonce derivation are position-independent. The seal line also changes (since it covers all chunk lines), producing a two-line diff: one new chunk line and an updated seal.

## Base64 Encoding

All base64-encoded values in mdenc use standard base64 (RFC 4648 Section 4) with `+` and `/` characters, `=` padding, and NO line wrapping. Each encoded value appears on a single line.

## Security Properties

- **Confidentiality**: XChaCha20-Poly1305 with deterministic nonces
- **Chunk integrity**: Poly1305 authentication tag per chunk
- **File binding**: AAD prevents cross-file chunk swapping
- **File-level integrity**: Seal HMAC detects reorder, truncation, rollback
- **Header integrity**: HMAC-SHA256 over header
- **Password stretching**: scrypt (memory-hard)
- **Key separation**: HKDF produces distinct enc_key, header_key, and nonce_key

## Accepted Leakage

The following information is visible in an mdenc file without the password:

- Number of chunks (number of lines minus 3: header, auth, seal)
- Approximate size of each chunk (base64 line length)
- Scrypt parameters
- The fact that the file is mdenc-encrypted
- Identical paragraphs produce identical ciphertext (reveals repeated content within a file)
