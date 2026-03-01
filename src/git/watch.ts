import { watch, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { encrypt } from '../encrypt.js';
import { resolvePassword } from './password.js';
import { findGitRoot, findMarkedDirs, getMdFilesInDir } from './utils.js';

export async function watchCommand(): Promise<void> {
  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);

  if (!password) {
    console.error(
      'mdenc: no password available (set MDENC_PASSWORD or create .mdenc-password)',
    );
    process.exit(1);
  }

  const markedDirs = findMarkedDirs(repoRoot);
  if (markedDirs.length === 0) {
    console.error('mdenc: no marked directories found');
    process.exit(1);
  }

  // Initial encryption pass
  for (const dir of markedDirs) {
    const mdFiles = getMdFilesInDir(dir);
    for (const mdFile of mdFiles) {
      await encryptFile(dir, mdFile, repoRoot, password);
    }
  }

  // Watch each marked directory, deduplicating rapid events
  const pending = new Set<string>();

  for (const dir of markedDirs) {
    const relDir = relative(repoRoot, dir) || '.';
    console.error(`mdenc: watching ${relDir}/`);

    watch(dir, (_event, filename) => {
      if (!filename || !filename.endsWith('.md')) return;
      const key = join(dir, filename);
      if (pending.has(key)) return;
      pending.add(key);
      encryptFile(dir, filename, repoRoot, password).finally(() => {
        pending.delete(key);
      });
    });
  }

  console.error('mdenc: watching for changes (Ctrl+C to stop)');
}

async function encryptFile(
  dir: string,
  mdFile: string,
  repoRoot: string,
  password: string,
): Promise<void> {
  const mdPath = join(dir, mdFile);
  const mdencPath = mdPath.replace(/\.md$/, '.mdenc');
  const relMdPath = relative(repoRoot, mdPath);

  if (!existsSync(mdPath)) return;

  try {
    const plaintext = readFileSync(mdPath, 'utf-8');

    let previousFile: string | undefined;
    if (existsSync(mdencPath)) {
      previousFile = readFileSync(mdencPath, 'utf-8');
    }

    const encrypted = await encrypt(plaintext, password, { previousFile });
    if (encrypted === previousFile) return;
    writeFileSync(mdencPath, encrypted);
    console.error(`mdenc: encrypted ${relMdPath}`);
  } catch (err) {
    console.error(
      `mdenc: failed to encrypt ${relMdPath}: ${err instanceof Error ? err.message : err}`,
    );
  }
}
