import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { watch } from 'chokidar';
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

  // Watch each marked directory for .md file changes
  const pending = new Set<string>();

  const watcher = watch(
    markedDirs.map(dir => join(dir, '*.md')),
    { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 100 } },
  );

  watcher.on('change', (filePath) => {
    handleFileEvent(filePath, repoRoot, password, pending);
  });
  watcher.on('add', (filePath) => {
    handleFileEvent(filePath, repoRoot, password, pending);
  });

  for (const dir of markedDirs) {
    const relDir = relative(repoRoot, dir) || '.';
    console.error(`mdenc: watching ${relDir}/`);
  }
  console.error('mdenc: watching for changes (Ctrl+C to stop)');
}

function handleFileEvent(
  filePath: string,
  repoRoot: string,
  password: string,
  pending: Set<string>,
): void {
  if (pending.has(filePath)) return;
  pending.add(filePath);

  const dir = join(filePath, '..');
  const filename = filePath.slice(dir.length + 1);

  encryptFile(dir, filename, repoRoot, password).finally(() => {
    pending.delete(filePath);
  });
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
