import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { findGitRoot, findMarkedDirs } from './utils.js';

const FILTER_CONFIGS: [string, string][] = [
  ['filter.mdenc.process', 'mdenc filter-process'],
  ['filter.mdenc.clean', 'mdenc filter-clean %f'],
  ['filter.mdenc.smudge', 'mdenc filter-smudge %f'],
  ['filter.mdenc.required', 'true'],
  ['diff.mdenc.textconv', 'mdenc textconv'],
];

function configureGitFilter(repoRoot: string): void {
  for (const [key, value] of FILTER_CONFIGS) {
    execFileSync('git', ['config', '--local', key, value], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
}

function isFilterConfigured(repoRoot: string): boolean {
  try {
    const val = execFileSync('git', ['config', '--get', 'filter.mdenc.process'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return val.length > 0;
  } catch {
    return false;
  }
}

export async function initCommand(): Promise<void> {
  const repoRoot = findGitRoot();

  // Configure git filter
  if (isFilterConfigured(repoRoot)) {
    console.log('Git filter already configured (skipped)');
  } else {
    configureGitFilter(repoRoot);
    console.log('Configured git filter (filter.mdenc + diff.mdenc)');
  }

  // Add .mdenc-password to root .gitignore
  const gitignorePath = join(repoRoot, '.gitignore');
  const entry = '.mdenc-password';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim());
    if (!lines.includes(entry)) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + entry + '\n');
      console.log('Added .mdenc-password to .gitignore');
    } else {
      console.log('.mdenc-password already in .gitignore (skipped)');
    }
  } else {
    writeFileSync(gitignorePath, entry + '\n');
    console.log('Created .gitignore with .mdenc-password');
  }

  // Re-checkout marked dirs to trigger smudge filter
  const markedDirs = findMarkedDirs(repoRoot);
  if (markedDirs.length > 0) {
    const { relative } = await import('node:path');
    for (const dir of markedDirs) {
      const relDir = relative(repoRoot, dir) || '.';
      try {
        execFileSync('git', ['checkout', 'HEAD', '--', `${relDir}/*.md`], {
          cwd: repoRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        // No .md files tracked yet — fine
      }
    }
  }

  console.log('mdenc git integration initialized.');
}

export function removeFilterCommand(): void {
  const repoRoot = findGitRoot();

  for (const section of ['filter.mdenc', 'diff.mdenc']) {
    try {
      execFileSync('git', ['config', '--local', '--remove-section', section], {
        cwd: repoRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Section may not exist
    }
  }

  console.log('Removed git filter configuration.');
}
