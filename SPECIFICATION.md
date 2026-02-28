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

The nonce is randomly generated per chunk encryption. The ciphertext and tag are produced by XChaCha20-Poly1305.

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

### Associated Authenticated Data (AAD)

Each chunk's AAD is constructed as:

```
mdenc:v1\n<file_id_hex>\nc:<index>:[final]
```

Where:
- `\n` is a literal newline (0x0A)
- `<file_id_hex>` is the 16-byte file ID encoded as lowercase hexadecimal (32 characters)
- `<index>` is the zero-based chunk index as a decimal string
- `[final]` is the literal string `final` only on the last chunk; empty string for non-final chunks

The AAD binds each chunk to:
- The format version (prevents cross-format attacks)
- The file identity (prevents cross-file chunk swapping)
- The chunk position (prevents chunk reordering)
- The finality flag (prevents truncation attacks)

### Chunk Encryption

For each chunk:

1. Generate a 24-byte random nonce (CSPRNG)
2. Construct the AAD as described above
3. Encrypt the chunk plaintext with XChaCha20-Poly1305 using `enc_key`, the nonce, and the AAD
4. Output: `nonce || ciphertext || tag` (base64-encoded as one line)

### Header Authentication

After constructing the header line, compute HMAC-SHA256 over the header line bytes (UTF-8, excluding trailing newline) using `header_key`. Output as the `hdrauth_b64` line.

## Chunking

### Paragraph Chunking (Default)

The default and recommended chunking strategy splits on paragraph boundaries (`\n\n`). This preserves diff-friendliness: editing one paragraph changes only one chunk.

Rules:
1. Normalize line endings: `\r\n` → `\n`
2. Split on `\n\n` boundaries
3. Each chunk includes its trailing separator (`\n\n`) except the last chunk
4. If any chunk exceeds the maximum chunk size (default 64 KiB), split it at byte boundaries at the cap size
5. Empty input produces a single empty chunk

### Fixed-Size Chunking (Optional)

Split at fixed byte boundaries. This has poor diff characteristics for insertions (all subsequent chunks shift) and is not recommended for version-controlled files.

## Decryption

1. Parse the header line to extract salt, file_id, and Argon2id parameters
2. Derive master key, enc_key, and header_key from the password
3. Verify the header HMAC; reject if invalid
4. For each chunk line, decrypt with the corresponding AAD (index, file_id, final flag on last chunk)
5. Verify that the last chunk was flagged as final; reject if not (truncation protection)
6. Concatenate decrypted chunks to recover the plaintext

## Ciphertext Reuse (Diff Optimization)

When re-encrypting a modified file, the encryptor MAY compare plaintext chunks with a previous encrypted version. If a chunk's plaintext is unchanged, the previous ciphertext MAY be reused directly. This optimization:

- Preserves identical ciphertext for unchanged paragraphs
- Produces minimal `git diff` output
- Is safe because the AAD binds the chunk to its position and file identity

The encryptor MUST NOT reuse ciphertext if the chunk's index has changed (e.g., a paragraph was inserted before it).

## Seal Operation

The seal operation provides file-level integrity protection for use outside of git (which provides its own content integrity via SHA hashes).

Sealing:
1. Re-encrypt all chunks with fresh random nonces
2. Compute HMAC-SHA256 over the concatenation of all chunk ciphertext lines (joined by `\n`), keyed with `header_key`
3. Append a seal line: `seal_b64=<hmac>`

Verification:
1. Decrypt and verify the file as normal
2. Additionally verify the seal HMAC over all chunk lines

The seal is optional. Files without a seal line are valid and decrypt normally. The seal detects rollback attacks (replacing the file with an older valid version) which per-chunk AEAD alone cannot prevent.

## Base64 Encoding

All base64-encoded values in mdenc use standard base64 (RFC 4648 Section 4) with `+` and `/` characters, `=` padding, and NO line wrapping. Each encoded value appears on a single line.

## Security Properties

- **Confidentiality**: XChaCha20-Poly1305 with random nonces
- **Chunk integrity**: Poly1305 authentication tag per chunk
- **Chunk binding**: AAD prevents reordering and cross-file swapping
- **Truncation protection**: Final-chunk flag in AAD
- **Header integrity**: HMAC-SHA256 over header
- **Password stretching**: Argon2id
- **Key separation**: HKDF produces distinct enc_key and header_key

## Accepted Leakage

The following information is visible in an mdenc file without the password:

- Number of chunks (number of lines minus 2)
- Approximate size of each chunk (base64 line length)
- Argon2id parameters
- The fact that the file is mdenc-encrypted
