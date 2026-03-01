import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolvePassword } from './password.js';
import {
  findGitRoot,
  findMarkedDirs,
  getHooksDir,
  getMdFilesInDir,
  getMdencFilesInDir,
} from './utils.js';

const HOOK_NAMES = ['pre-commit', 'post-checkout', 'post-merge', 'post-rewrite'];
const MARKER = '# mdenc-hook-marker';

export function statusCommand(): void {
  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);
  const markedDirs = findMarkedDirs(repoRoot);

  if (markedDirs.length === 0) {
    console.log('No directories marked for mdenc encryption.');
    console.log('Use "mdenc mark <directory>" to designate a directory.');
  } else {
    console.log('Marked directories:\n');

    for (const dir of markedDirs) {
      const relDir = relative(repoRoot, dir) || '.';
      console.log(`  ${relDir}/`);

      const mdFiles = getMdFilesInDir(dir);
      const mdencFiles = getMdencFilesInDir(dir);

      const mdBases = new Set(mdFiles.map(f => f.replace(/\.md$/, '')));
      const mdencBases = new Set(mdencFiles.map(f => f.replace(/\.mdenc$/, '')));

      // Paired files (both .md and .mdenc exist)
      for (const base of mdBases) {
        if (mdencBases.has(base)) {
          const mdPath = join(dir, `${base}.md`);
          const mdencPath = join(dir, `${base}.mdenc`);
          const mdMtime = statSync(mdPath).mtimeMs;
          const mdencMtime = statSync(mdencPath).mtimeMs;

          if (mdMtime > mdencMtime) {
            console.log(`    ${base}.md  [needs re-encryption]`);
          } else {
            console.log(`    ${base}.md  [up to date]`);
          }
        } else {
          console.log(`    ${base}.md  [not yet encrypted]`);
        }
      }

      // Orphaned .mdenc files (no corresponding .md)
      for (const base of mdencBases) {
        if (!mdBases.has(base)) {
          console.log(`    ${base}.mdenc  [needs decryption]`);
        }
      }

      // Check .gitignore health
      const gitignorePath = join(dir, '.gitignore');
      if (!existsSync(gitignorePath)) {
        console.log(`    WARNING: no .gitignore in this directory`);
      } else {
        const content = readFileSync(gitignorePath, 'utf-8');
        if (!content.split('\n').some(l => l.trim() === '*.md')) {
          console.log(`    WARNING: .gitignore missing *.md pattern`);
        }
      }

      console.log();
    }
  }

  // Password status
  if (!password) {
    console.log('Password: NOT AVAILABLE');
    console.log('  Set MDENC_PASSWORD env var or create .mdenc-password file');
  } else {
    console.log('Password: available');
  }

  // Hook status
  const hooksDir = getHooksDir();
  const missing: string[] = [];
  for (const name of HOOK_NAMES) {
    const hookPath = join(hooksDir, name);
    if (!existsSync(hookPath)) {
      missing.push(name);
    } else {
      const content = readFileSync(hookPath, 'utf-8');
      if (!content.includes(MARKER)) {
        missing.push(name);
      }
    }
  }

  if (missing.length > 0) {
    console.log(`Hooks: MISSING (${missing.join(', ')})`);
    console.log('  Run "mdenc init" to install hooks');
  } else {
    console.log('Hooks: all installed');
  }
}
