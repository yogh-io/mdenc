# mdenc

**Encrypt your Markdown. Keep your diffs.**

[**Live Demo**](https://yogh-io.github.io/mdenc/) | [npm](https://www.npmjs.com/package/mdenc) | [Specification](SPECIFICATION.md) | [Security](SECURITY.md)

> **⚠️ No third-party audit.** mdenc has not been independently audited. The cryptographic design is documented in [SPECIFICATION.md](SPECIFICATION.md) and [SECURITY.md](SECURITY.md) and is open for review, but until a formal audit has been completed, **use this at your own risk and do not rely on it to protect high-value secrets.**

mdenc lets you store encrypted Markdown in git without losing the ability to see *what changed*. Edit one paragraph, and only that paragraph changes in the encrypted output. Your `git log` stays useful. Your pull request reviews stay sane.

## What it looks like

Say you have some private notes:

```markdown
# Meeting Notes

Discussed the Q3 roadmap. We agreed to prioritize
the mobile app rewrite.

## Action Items

Alice will draft the technical spec by Friday.
Bob is handling the database migration plan.

## Budget

Total allocated: $450k for the quarter.
```

`mdenc encrypt notes.md -o notes.mdenc` turns it into:

```
mdenc:v1 salt_b64=1z94qTI8... file_id_b64=eLP+c5cP... scrypt=N=16384,r=8,p=1
hdrauth_b64=griicznFYhBTVCeq1lpvB+J73wsJJbheGghxNOIJlu0=
Qnp4sPf/aN1z/VSkZ8yjGWwk0ZLqwpFAJBzbLOcoKyafqUbMp4Y7WMqF...    <- # Meeting Notes
nD1KIHOMX5VhlSU4USUxWHTrl2Qi6cev/b6J5YJR9C78XHqwnNHVxHgW...    <- Discussed the Q3...
Hes/oW+FeONHytgUa7c9ZzdF4d/w7Ei0tnGiJmqPX0DniJaiV0g0yMhc...    <- ## Action Items
yT7vkHbaXHR390bWz1d/qcK6yVeF3p5/quvW7BOx4hfoU0F2P0/oNAkR...    <- Alice will draft...
dkM7awElU/pfUYs1goxQFlgcyUq8FNHcnZrU76tPaygh7bdgYjdrC7Wx...    <- ## Budget
ZBRV9kdXm7gNiF4BvI9eklrtTjhkI9tLHu001eQUevoZbeKQ8Y70basB...    <- Total allocated...
seal_b64=29ylXnDTWQ09nzZjvoYtYUpfyr4X4NLONxpT/HOC9TU=
```

Each paragraph becomes one line of base64. A seal HMAC at the end protects the file's integrity. The file is plain UTF-8 text that git tracks normally.

Now you edit the "Action Items" paragraph and re-encrypt. Here's what `git diff` shows:

```diff
 mdenc:v1 salt_b64=1z94qTI8... file_id_b64=eLP+c5cP... scrypt=N=16384,r=8,p=1
 hdrauth_b64=griicznFYhBTVCeq1lpvB+J73wsJJbheGghxNOIJlu0=
 Qnp4sPf/aN1z/VSkZ8yjGWwk0ZLqwpFAJBzbLOcoKyafqUbMp4Y7WMqF...
 nD1KIHOMX5VhlSU4USUxWHTrl2Qi6cev/b6J5YJR9C78XHqwnNHVxHgW...
 Hes/oW+FeONHytgUa7c9ZzdF4d/w7Ei0tnGiJmqPX0DniJaiV0g0yMhc...
-yT7vkHbaXHR390bWz1d/qcK6yVeF3p5/quvW7BOx4hfoU0F2P0/oNAkR...
+1RgyC3rXcjykvoL0GgsQsHBmxy5axdD/tqMnicJGjit66+o5bjP1vSbG...
 dkM7awElU/pfUYs1goxQFlgcyUq8FNHcnZrU76tPaygh7bdgYjdrC7Wx...
 ZBRV9kdXm7gNiF4BvI9eklrtTjhkI9tLHu001eQUevoZbeKQ8Y70basB...
-seal_b64=29ylXnDTWQ09nzZjvoYtYUpfyr4X4NLONxpT/HOC9TU=
+seal_b64=iNhYjNp69tyv4tkzgDJK5Fh2h1WLgIs3Y1IPRKcpQsE=
```

One paragraph changed, one line in the diff (plus the seal updates). Even inserting a new paragraph between existing ones only adds one line -- surrounding chunks stay unchanged. Compare that to GPG, where the entire file would show as changed.

## Why

You have internal documentation -- team processes, onboarding guides, infrastructure notes -- that shouldn't sit in plaintext on a public git repository, but that isn't truly secret either. Everyone on the team who needs this information shares the same password.

GPG-encrypting the whole file works, but every tiny edit produces a completely different blob. The entire file shows as changed in every commit.

mdenc encrypts at paragraph granularity. Unchanged paragraphs produce identical ciphertext, so git only tracks the paragraphs you actually touched.

## What this is (and isn't) for

mdenc is designed to **obscure content that shouldn't be publicly readable** -- not to be a vault for high-value secrets.

The typical use case is a team that keeps internal documentation in a public (or semi-public) git repo: things like internal process docs, team contact info, environment setup instructions, or notes that are useful to the team but shouldn't be indexed by search engines or casually browsed by strangers.

**Why not for real secrets?** The password must be shared with everyone who needs access. In practice this means it's passed around in a Slack channel, a shared password manager, or a wiki. A widely-shared password is a single point of failure -- if it leaks, everything encrypted with it is exposed at once. That's fine when the content is "how to pull data from our internal SFTP" and unacceptable when the content is credentials, API keys, or genuinely confidential data. For those, use a proper secrets manager.

**Other things to know:**

- **No forward secrecy.** Anyone who obtains the password and the git history can decrypt every version of every file ever committed. There is no per-session key rotation or ephemeral key exchange.
- **No password rotation mechanism.** Changing the password means re-encrypting every file and redistributing the new password to the entire team. There is no built-in command for this -- you re-encrypt manually.
- **Metadata leaks by design.** mdenc intentionally trades some metadata privacy (paragraph count, sizes, edit patterns) for usable git diffs. This is a design choice, not a bug. See [What leaks](#what-leaks).

Think of mdenc as the digital equivalent of a locked filing cabinet in an open office: it keeps honest people honest and prevents casual snooping, but it's not a safe.

## Install

```bash
npm install mdenc
```

## CLI

```bash
# Encrypt
mdenc encrypt notes.md -o notes.mdenc

# Decrypt
mdenc decrypt notes.mdenc -o notes.md

# Re-encrypt after editing (unchanged paragraphs keep same ciphertext)
mdenc decrypt notes.mdenc -o notes.md
# ... edit notes.md ...
mdenc encrypt notes.md -o notes.mdenc

# Verify file integrity
mdenc verify notes.mdenc
```

Password is read from `MDENC_PASSWORD` env var or prompted interactively (no echo).

## Git Integration

mdenc uses git's native **smudge/clean filter** to transparently encrypt and decrypt `.md` files. You edit plaintext locally; git stores ciphertext in the repository.

```bash
# Set up git smudge/clean filter and textconv diff
mdenc init

# Generate a random password into .mdenc-password
mdenc genpass [--force]

# Mark a directory -- .md files inside will be filtered
mdenc mark docs/private

# See which files are configured for encryption
mdenc status

# Remove git filter configuration
mdenc remove-filter
```

After `mdenc init` and `mdenc mark`, the workflow is transparent: the **clean filter** encrypts `.md` files when they're staged (`git add`), and the **smudge filter** decrypts them on checkout. You always see plaintext in your working directory. The custom diff driver shows plaintext diffs of encrypted content.

## Library

```typescript
import { encrypt, decrypt, verifySeal } from 'mdenc';

// Encrypt (always includes integrity seal)
const encrypted = await encrypt(markdown, password);

// Decrypt (verifies seal automatically)
const plaintext = await decrypt(encrypted, password);

// Re-encrypt with diff optimization
const updated = await encrypt(editedMarkdown, password, {
  previousFile: encrypted,
});

// Verify integrity without decrypting
const ok = await verifySeal(encrypted, password);
```

## How it works

1. Your Markdown is split into chunks at paragraph boundaries (runs of 2+ newlines)
2. Each chunk is encrypted with XChaCha20-Poly1305 using a deterministic nonce derived from the content
3. The output is plain UTF-8 text -- one base64 line per chunk, plus a seal HMAC
4. Same content + same keys = same ciphertext, so unchanged chunks produce identical output and minimal diffs
5. The seal HMAC covers all lines, detecting reordering, truncation, and rollback on decrypt

The password is stretched with scrypt (N=16384, r=8, p=1). Keys are derived via HKDF-SHA256 with separate keys for encryption, header authentication, and nonce derivation.

## What leaks

mdenc is designed for diff-friendliness, not metadata hiding. An observer without the password can see:

- How many paragraphs your document has
- Approximate size of each paragraph
- Which paragraphs changed between commits
- Identical paragraphs within a file (they produce identical ciphertext)

The *content* of your paragraphs stays confidential. See [SECURITY.md](SECURITY.md) for the full threat model and accepted tradeoffs.

## Docs

- [SECURITY.md](SECURITY.md) -- threat model, crypto details, accepted tradeoffs
- [SPECIFICATION.md](SPECIFICATION.md) -- wire format for implementers

## License

ISC
