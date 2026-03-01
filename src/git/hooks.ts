import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { encrypt, decrypt } from '../encrypt.js';
import { resolvePassword } from './password.js';
import {
  findGitRoot,
  findMarkedDirs,
  getMdFilesInDir,
  getMdencFilesInDir,
  gitAdd,
  gitRmCached,
  isFileStaged,
} from './utils.js';

function needsReEncryption(mdPath: string, mdencPath: string): boolean {
  if (!existsSync(mdencPath)) return true;
  const mdMtime = statSync(mdPath).mtimeMs;
  const mdencMtime = statSync(mdencPath).mtimeMs;
  return mdMtime > mdencMtime;
}

export async function preCommitHook(): Promise<void> {
  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);

  if (!password) {
    process.stderr.write(
      'mdenc: no password available (set MDENC_PASSWORD or create .mdenc-password). Skipping encryption.\n',
    );
    process.exit(0);
  }

  const markedDirs = findMarkedDirs(repoRoot);
  if (markedDirs.length === 0) process.exit(0);

  let encryptedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const dir of markedDirs) {
    const mdFiles = getMdFilesInDir(dir);

    for (const mdFile of mdFiles) {
      const mdPath = join(dir, mdFile);
      const mdencPath = mdPath.replace(/\.md$/, '.mdenc');
      const relMdPath = relative(repoRoot, mdPath);
      const relMdencPath = relative(repoRoot, mdencPath);

      // Skip if .md hasn't changed since last encryption
      if (!needsReEncryption(mdPath, mdencPath)) {
        skippedCount++;
        // Still ensure the .mdenc is staged if it exists
        if (existsSync(mdencPath)) {
          gitAdd(repoRoot, [relMdencPath]);
        }
        continue;
      }

      try {
        const plaintext = readFileSync(mdPath, 'utf-8');

        // Read existing .mdenc for previousFile optimization
        let previousFile: string | undefined;
        if (existsSync(mdencPath)) {
          previousFile = readFileSync(mdencPath, 'utf-8');
        }

        const encrypted = await encrypt(plaintext, password, { previousFile });
        writeFileSync(mdencPath, encrypted);
        gitAdd(repoRoot, [relMdencPath]);

        // Belt-and-suspenders: unstage .md if accidentally staged
        if (isFileStaged(repoRoot, relMdPath)) {
          gitRmCached(repoRoot, [relMdPath]);
        }

        encryptedCount++;
      } catch (err) {
        process.stderr.write(
          `mdenc: failed to encrypt ${relMdPath}: ${err instanceof Error ? err.message : err}\n`,
        );
        errorCount++;
      }
    }
  }

  if (encryptedCount > 0) {
    process.stderr.write(`mdenc: encrypted ${encryptedCount} file(s)\n`);
  }

  if (errorCount > 0) {
    process.stderr.write(
      `mdenc: ${errorCount} file(s) failed to encrypt. Aborting commit.\n`,
    );
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Decrypt all .mdenc files in marked directories.
 * Shared logic for post-checkout, post-merge, and post-rewrite hooks.
 * Returns the number of files decrypted.
 */
export async function decryptAll(): Promise<number> {
  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);

  if (!password) {
    process.stderr.write(
      'mdenc: no password available. Skipping decryption.\n',
    );
    return 0;
  }

  const markedDirs = findMarkedDirs(repoRoot);
  let count = 0;

  for (const dir of markedDirs) {
    const mdencFiles = getMdencFilesInDir(dir);

    for (const mdencFile of mdencFiles) {
      const mdencPath = join(dir, mdencFile);
      const mdPath = mdencPath.replace(/\.mdenc$/, '.md');
      const relMdPath = relative(repoRoot, mdPath);

      // Overwrite protection: skip if .md is newer than .mdenc
      if (existsSync(mdPath)) {
        const mdMtime = statSync(mdPath).mtimeMs;
        const mdencMtime = statSync(mdencPath).mtimeMs;
        if (mdMtime > mdencMtime) {
          process.stderr.write(
            `mdenc: skipping ${relMdPath} (local .md is newer than .mdenc)\n`,
          );
          continue;
        }
      }

      try {
        const encrypted = readFileSync(mdencPath, 'utf-8');
        const plaintext = await decrypt(encrypted, password);
        writeFileSync(mdPath, plaintext);
        count++;
      } catch (err) {
        process.stderr.write(
          `mdenc: failed to decrypt ${relative(repoRoot, mdencPath)}: ${err instanceof Error ? err.message : err}\n`,
        );
      }
    }
  }

  return count;
}

export async function postCheckoutHook(): Promise<void> {
  const count = await decryptAll();
  if (count > 0) {
    process.stderr.write(`mdenc: decrypted ${count} file(s)\n`);
  }
  process.exit(0);
}

export async function postMergeHook(): Promise<void> {
  const count = await decryptAll();
  if (count > 0) {
    process.stderr.write(`mdenc: decrypted ${count} file(s)\n`);
  }
  process.exit(0);
}

export async function postRewriteHook(): Promise<void> {
  const count = await decryptAll();
  if (count > 0) {
    process.stderr.write(`mdenc: decrypted ${count} file(s)\n`);
  }
  process.exit(0);
}
