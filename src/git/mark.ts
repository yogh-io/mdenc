import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  findGitRoot,
  getMdFilesInDir,
  gitAdd,
  gitRmCached,
  isFileTracked,
} from './utils.js';

const MARKER_FILE = '.mdenc.conf';
const MARKER_CONTENT = '# mdenc: .md files in this directory are automatically encrypted\n';
const GITIGNORE_PATTERN = '*.md';

export function markCommand(dirArg: string): void {
  const repoRoot = findGitRoot();
  const dir = resolve(dirArg);

  if (!existsSync(dir)) {
    console.error(`Error: directory "${dirArg}" does not exist`);
    process.exit(1);
  }

  const rel = relative(repoRoot, dir);
  if (rel.startsWith('..')) {
    console.error(`Error: directory "${dirArg}" is outside the git repository`);
    process.exit(1);
  }

  const relDir = rel || '.';

  // Create .mdenc.conf
  const confPath = join(dir, MARKER_FILE);
  if (!existsSync(confPath)) {
    writeFileSync(confPath, MARKER_CONTENT);
    console.log(`Created ${relDir}/${MARKER_FILE}`);
  } else {
    console.log(`${relDir}/${MARKER_FILE} already exists (skipped)`);
  }

  // Create/update .gitignore
  const gitignorePath = join(dir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim());
    if (!lines.includes(GITIGNORE_PATTERN)) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + GITIGNORE_PATTERN + '\n');
      console.log(`Updated ${relDir}/.gitignore (added ${GITIGNORE_PATTERN})`);
    } else {
      console.log(`${relDir}/.gitignore already has ${GITIGNORE_PATTERN} (skipped)`);
    }
  } else {
    writeFileSync(gitignorePath, GITIGNORE_PATTERN + '\n');
    console.log(`Created ${relDir}/.gitignore with ${GITIGNORE_PATTERN}`);
  }

  // Untrack any currently-tracked .md files
  const mdFiles = getMdFilesInDir(dir);
  const trackedMd: string[] = [];
  for (const f of mdFiles) {
    const relPath = relative(repoRoot, join(dir, f));
    if (isFileTracked(repoRoot, relPath)) {
      trackedMd.push(relPath);
    }
  }

  if (trackedMd.length > 0) {
    gitRmCached(repoRoot, trackedMd);
    for (const f of trackedMd) {
      console.log(`Untracked ${f} from git (still exists locally)`);
    }
  }

  // Stage .mdenc.conf and .gitignore
  const toStage = [
    relative(repoRoot, confPath),
    relative(repoRoot, gitignorePath),
  ];
  gitAdd(repoRoot, toStage);

  console.log(`Marked ${relDir}/ for mdenc encryption`);
}
