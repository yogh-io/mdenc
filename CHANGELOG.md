# Changelog

## 1.0.0

First stable release. The wire format, library API, and CLI are now considered stable.

### Core
- Paragraph-granular encryption with XChaCha20-Poly1305
- Deterministic nonces via HMAC-SHA256 for diff-friendly output
- scrypt key derivation with HKDF-SHA256 key expansion (three independent keys)
- File integrity seal (HMAC-SHA256) detecting reordering, truncation, and rollback
- Header authentication preventing parameter downgrade

### CLI
- `mdenc encrypt` / `decrypt` / `verify` for standalone use
- `mdenc init` / `mark` / `status` / `remove-filter` / `genpass` for git integration
- Long-running `filter-process` for git protocol v2 performance
- Custom diff driver showing encrypted and plaintext diffs
- `--version` / `--help` flags
- Interactive password input with no-echo (TTY) and `MDENC_PASSWORD` env var

### Library
- `encrypt()`, `decrypt()`, `verifySeal()` async API
- Dual ESM/CJS with TypeScript declarations
- `previousFile` option for minimal diffs on re-encryption
- Paragraph and fixed-size chunking strategies

### Since 0.1.6
- Add `--version` / `--help` CLI flags
- Add demo site link and navigation links to README header
- Remove dead `textconv` field from status config
- Fix lint and formatting issues in diff-driver and CLI

## 0.1.6

- Fix filter-process protocol: add missing flush packet for "status unchanged" signal
- Remove textconv from `mdenc init` filter config
- Fix README: replace stale hook-based docs with smudge/clean filter workflow
- Remove unused `DecryptOptions` from public API
- Add tests for git filter core (`cleanFilter`/`smudgeFilter`) and password resolution

## 0.1.5

- Fix repository URL in package.json

## 0.1.4

- Add key documentation links to CLAUDE.md

## 0.1.3

- Replace git hook workflow with native smudge/clean filter
- Add long-running `filter-process` for git protocol v2
- Add `textconv` driver for plaintext diffs
- Add `remove-filter` command

## 0.1.2

- Fix site paths for GitHub Pages base path

## 0.1.1

- Add demo site

## 0.1.0

Initial release.

- Core encryption/decryption with paragraph-granular chunking
- Deterministic nonces via HMAC-SHA256 for diff-friendly output
- scrypt key derivation with HKDF-SHA256 key expansion
- File integrity seal (HMAC-SHA256)
- CLI with `encrypt`, `decrypt`, `verify` commands
- Library API with `encrypt()`, `decrypt()`, `verifySeal()`
