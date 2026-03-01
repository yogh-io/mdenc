import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.hg', '.svn']);
const MARKER_FILE = '.mdenc.conf';

export function findGitRoot(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error('Not a git repository');
  }
}

export function getHooksDir(): string {
  try {
    const gitDir = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return resolve(gitDir);
  } catch {
    throw new Error('Could not determine git hooks directory');
  }
}

export function findMarkedDirs(repoRoot: string): string[] {
  const results: string[] = [];
  walkForMarker(repoRoot, results);
  return results;
}

function walkForMarker(dir: string, results: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  if (entries.includes(MARKER_FILE)) {
    results.push(dir);
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) {
        walkForMarker(full, results);
      }
    } catch {
      // Skip inaccessible entries
    }
  }
}

export function getMdFilesInDir(dir: string): string[] {
  try {
    return readdirSync(dir).filter(
      f => f.endsWith('.md') && statSync(join(dir, f)).isFile(),
    );
  } catch {
    return [];
  }
}

export function getMdencFilesInDir(dir: string): string[] {
  try {
    return readdirSync(dir).filter(
      f => f.endsWith('.mdenc') && statSync(join(dir, f)).isFile(),
    );
  } catch {
    return [];
  }
}

export function gitAdd(repoRoot: string, files: string[]): void {
  if (files.length === 0) return;
  execFileSync('git', ['add', '--', ...files], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function gitRmCached(repoRoot: string, files: string[]): void {
  if (files.length === 0) return;
  execFileSync('git', ['rm', '--cached', '--', ...files], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function isFileStaged(repoRoot: string, file: string): boolean {
  try {
    const output = execFileSync(
      'git',
      ['diff', '--cached', '--name-only', '--', file],
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

export function isFileTracked(repoRoot: string, file: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', file], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}
