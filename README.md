# mdenc

**Encrypt your Markdown. Keep your diffs.**

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
mdenc:v1 salt_b64=tWpYJ1TX... file_id_b64=QtPSfysG... argon2=m=65536,t=3,p=1
hdrauth_b64=2Iox+FH0IuoSHittEzcxSI8Ew7VUJNIBAP+3RKs3TRg=
u+C4c6fq3ShPpe0nmAdVdB3gt+Jr45rPChOYd8W3W827Hw6ye1tO7eBh...    <- # Meeting Notes
iFeHLHNGgHT3cBM20/BlPfaDjeY+WL3rZh1unY951Ha/wGHI5D8yYmMi...    <- Discussed the Q3...
dm54GXdXI+MpbgeCpbUQj9x5HYOvJ/wIIymaQxcwgraQO2lwCYUqfUka...    <- ## Action Items
2W4gqkAK/b/UD9euXLVE4I27+LnxFHdPr7lQajtI5HxC7eED4YUYtoaG...    <- Alice will draft...
JQgoywFO02b4OdkZEKhk5ZjpXyLzJCuIFAU6mi73ZazKhy+qw1Drz6k8...    <- ## Budget
NNdpCjf++ncLe9yrRbotyPUWuib8Oe68xjkaTnEJVNO7snSFS0Z6cGwY...    <- Total allocated...
```

Each paragraph becomes one line of base64. The file is plain UTF-8 text that git tracks normally.

Now you edit the "Action Items" paragraph and re-encrypt. Here's what `git diff` shows:

```diff
 mdenc:v1 salt_b64=tWpYJ1TX... file_id_b64=QtPSfysG... argon2=m=65536,t=3,p=1
 hdrauth_b64=2Iox+FH0IuoSHittEzcxSI8Ew7VUJNIBAP+3RKs3TRg=
 u+C4c6fq3ShPpe0nmAdVdB3gt+Jr45rPChOYd8W3W827Hw6ye1tO7eBh...
 iFeHLHNGgHT3cBM20/BlPfaDjeY+WL3rZh1unY951Ha/wGHI5D8yYmMi...
 dm54GXdXI+MpbgeCpbUQj9x5HYOvJ/wIIymaQxcwgraQO2lwCYUqfUka...
-2W4gqkAK/b/UD9euXLVE4I27+LnxFHdPr7lQajtI5HxC7eED4YUYtoaG...
+29eDDzd58m8BtTV3PA3zyetTyuhL3Qqimlz7APvXDZsGL/rtZtld9R0u...
 JQgoywFO02b4OdkZEKhk5ZjpXyLzJCuIFAU6mi73ZazKhy+qw1Drz6k8...
 NNdpCjf++ncLe9yrRbotyPUWuib8Oe68xjkaTnEJVNO7snSFS0Z6cGwY...
```

One paragraph changed, one line in the diff. Compare that to GPG, where the entire file would show as changed.

## Why

You want to keep private notes, journals, or sensitive docs in a git repo. GPG-encrypting the whole file works, but every tiny edit produces a completely different blob. The entire file shows as changed in every commit.

mdenc encrypts at paragraph granularity. Unchanged paragraphs produce identical ciphertext, so git only tracks the paragraphs you actually touched.

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

# Seal for tamper detection outside git
mdenc seal notes.mdenc
mdenc verify notes.mdenc
```

Password is read from `MDENC_PASSWORD` env var or prompted interactively (no echo).

## Library

```typescript
import { encrypt, decrypt, seal, verifySeal } from 'mdenc';

// Encrypt
const encrypted = await encrypt(markdown, password);

// Decrypt
const plaintext = await decrypt(encrypted, password);

// Re-encrypt with diff optimization
const updated = await encrypt(editedMarkdown, password, {
  previousFile: encrypted,
});

// Seal for integrity outside git
const sealed = await seal(encrypted, password);
const ok = await verifySeal(sealed, password);
```

## How it works

1. Your Markdown is split into chunks at paragraph boundaries (`\n\n`)
2. Each chunk is encrypted with XChaCha20-Poly1305 using a random nonce
3. The output is plain UTF-8 text -- one base64 line per chunk
4. On re-encryption, unchanged chunks reuse their ciphertext, producing minimal diffs

The password is stretched with Argon2id (64 MiB, 3 iterations). Keys are derived via HKDF-SHA256 with separate keys for encryption and header authentication.

## What leaks

mdenc is designed for diff-friendliness, not metadata hiding. An observer can see:

- How many paragraphs your document has
- Approximate size of each paragraph
- Which paragraphs changed between commits

The *content* of your paragraphs stays confidential.

## Docs

- [SECURITY.md](SECURITY.md) -- threat model, crypto details, accepted tradeoffs
- [SPECIFICATION.md](SPECIFICATION.md) -- wire format for implementers

## License

ISC
