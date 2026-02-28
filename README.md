# mdenc

Diff-friendly encrypted Markdown format. Password-protected, UTF-8 text output, per-chunk AEAD.

mdenc encrypts Markdown files into a text-based format that plays well with git. Each paragraph becomes a separately encrypted chunk, so editing one paragraph only changes one line in the encrypted output. This means `git diff` shows meaningful, minimal diffs on encrypted files.

## Install

```bash
npm install mdenc
```

## Usage

### Library

```typescript
import { encrypt, decrypt, seal, verifySeal } from 'mdenc';

// Encrypt
const encrypted = await encrypt(markdown, password);

// Decrypt
const plaintext = await decrypt(encrypted, password);

// Re-encrypt with diff reuse (unchanged paragraphs keep same ciphertext)
const updated = await encrypt(editedMarkdown, password, { previousFile: encrypted });

// Seal for integrity outside git
const sealed = await seal(encrypted, password);
await verifySeal(sealed, password);
```

### CLI

```bash
# Encrypt a file
mdenc encrypt notes.md -o notes.mdenc

# Decrypt
mdenc decrypt notes.mdenc -o notes.md

# Seal (re-encrypt + integrity HMAC)
mdenc seal notes.mdenc

# Verify seal integrity
mdenc verify notes.mdenc
```

Password is read from `MDENC_PASSWORD` environment variable or prompted interactively.

## File Format

An mdenc file is plain UTF-8 text:

```
mdenc:v1 salt_b64=... file_id_b64=... argon2=m=65536,t=3,p=1
hdrauth_b64=...
<base64-encoded encrypted chunk>
<base64-encoded encrypted chunk>
...
```

- **Line 1**: Header with algorithm parameters
- **Line 2**: Header HMAC
- **Lines 3+**: One encrypted chunk per line (base64, no wrapping)

Each chunk is XChaCha20-Poly1305 with AAD binding chunk index, file identity, and finality flag. Paragraph-based chunking means edits to one paragraph don't affect other chunks.

## Security Model

- **Encryption**: XChaCha20-Poly1305 (AEAD)
- **KDF**: Argon2id (password stretching)
- **Key derivation**: HKDF-SHA256 (separate encryption and header keys)
- **Integrity**: Per-chunk authentication, header HMAC, truncation detection via final-chunk flag
- **Optional seal**: File-level HMAC for rollback protection outside git

See [SECURITY.md](SECURITY.md) for the full security model and [SPECIFICATION.md](SPECIFICATION.md) for the format specification.

## License

ISC
