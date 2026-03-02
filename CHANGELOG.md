# Changelog

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
