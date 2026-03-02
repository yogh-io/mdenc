# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
bun run build          # Build with tsup (ESM + CJS + types)
bun test               # Run all tests
bun test --watch       # Watch mode
bun test test/encrypt-decrypt.test.ts  # Run single test file
bun x tsc --noEmit     # Type check without emitting
```

The CLI is locally linked via `npm link` — rebuilding immediately updates the global `mdenc` command.

## Release

```bash
npm run release          # Patch bump, commit, tag, push (triggers GitHub Actions publish)
npm run release:minor    # Minor bump
npm run release:major    # Major bump
```

GitHub Actions (`.github/workflows/release.yml`) publishes to npm on `v*` tag push.

## Key Documentation

- **SPECIFICATION.md** — Full cryptographic spec: file format, key derivation, AAD, chunking, security properties
- **SECURITY.md** — Threat model, crypto details, accepted tradeoffs

## Architecture

mdenc encrypts Markdown at **paragraph granularity** so unchanged paragraphs produce identical ciphertext, enabling clean git diffs. The encryption is deterministic: same plaintext + same password + same salt = same output.

### Cryptographic Pipeline

`password` → scrypt → `masterKey` → HKDF-SHA256 → `{encKey, headerKey, nonceKey}`

Each paragraph is encrypted independently with XChaCha20-Poly1305. Nonces are derived deterministically via HMAC-SHA256(nonceKey, plaintext), making encryption reproducible. AAD is position-independent (`"mdenc:v1\n" + fileId`) so chunk reordering is detected by the seal, not the AEAD.

### File Format (`.mdenc`)

```
mdenc:v1 salt_b64=... file_id_b64=... scrypt=N=...,r=...,p=...
hdrauth_b64=<HMAC-SHA256 of header>
<base64 chunk: nonce || ciphertext || tag>
<base64 chunk: nonce || ciphertext || tag>
...
seal_b64=<HMAC-SHA256 of all lines above>
```

### Key Modules

- **encrypt.ts** — Core `encrypt()`/`decrypt()` orchestrating the full pipeline. Accepts `previousFile` option to reuse salt/fileId for minimal diffs.
- **aead.ts** — XChaCha20-Poly1305 with deterministic nonce derivation
- **kdf.ts** — scrypt + HKDF key derivation with NFKC password normalization
- **chunking.ts** — Paragraph splitting (2+ newlines) or fixed-size splitting
- **seal.ts** — HMAC-SHA256 seal covering header + auth + all chunks (detects reorder/truncation/rollback)
- **header.ts** — Parses and serializes the `mdenc:v1` header line with scrypt parameter validation

### Git Integration (`src/git/`)

Uses git's native **smudge/clean filter** mechanism. `.md` files are tracked directly in git; the filter transparently encrypts/decrypts:

- `mdenc init` configures `filter.mdenc` and `diff.mdenc` in `.git/config` (per-clone setup)
- `mdenc mark <dir>` creates `.mdenc.conf` + `.gitattributes` (with `*.md filter=mdenc diff=mdenc`)
- **Clean filter** (staging): plaintext → encrypted mdenc format in git objects
- **Smudge filter** (checkout): encrypted → plaintext in working directory
- **Long-running process** (`filter-process`): single process handles all files, caches derived keys
- **Textconv**: `diff.mdenc.textconv` enables plaintext diffs via `git diff`

Key files: `filter.ts` (core clean/smudge logic), `filter-process.ts` (git protocol v2 pkt-line), `textconv.ts`, `init.ts`, `mark.ts`.

### Build Setup

tsup produces two entry points: `src/index.ts` (library, ESM+CJS+dts) and `src/cli.ts` (CLI, ESM with `#!/usr/bin/env node` shebang banner). Only `dist/` is published to npm.

## Testing

Tests use `bun:test`. Use `FAST_SCRYPT = { N: 1024, r: 1, p: 1 }` from `test/helpers.ts` in tests to avoid slow key derivation. CLI tests spawn `bun dist/cli.js` with `MDENC_PASSWORD` env var.

## Dependencies

Only two runtime dependencies: `@noble/ciphers` (XChaCha20-Poly1305) and `@noble/hashes` (scrypt, HKDF, SHA256, HMAC). Pure JS, no native modules.
