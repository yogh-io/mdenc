import { readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { findGitRoot, getHooksDir } from './utils.js';

const MARKER = '# mdenc-hook-marker';

const HOOK_NAMES = [
  'pre-commit',
  'post-checkout',
  'post-merge',
  'post-rewrite',
] as const;

function hookBlock(hookName: string): string {
  return `
${MARKER}
if command -v mdenc >/dev/null 2>&1; then
  mdenc ${hookName}
elif [ -x "./node_modules/.bin/mdenc" ]; then
  ./node_modules/.bin/mdenc ${hookName}
else
  echo "mdenc: not found, skipping ${hookName} hook" >&2
fi`;
}

function newHookScript(hookName: string): string {
  return `#!/bin/sh${hookBlock(hookName)}
`;
}

function isBinary(content: string): boolean {
  return content.slice(0, 512).includes('\0');
}

function hasShellShebang(content: string): boolean {
  const firstLine = content.split('\n')[0];
  return /^#!.*\b(sh|bash|zsh|dash)\b/.test(firstLine);
}

function looksLikeFrameworkHook(content: string): boolean {
  // Detect husky-style hooks that source/exec another script as their main logic
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  if (lines.length <= 2) {
    // Very short hook that sources or execs something else
    return lines.some(l => /^\.\s+"/.test(l.trim()) || /^exec\s+/.test(l.trim()));
  }
  return false;
}

function printManualInstructions(hookName: string): void {
  process.stderr.write(
    `mdenc: ${hookName} hook exists but has an unrecognized format.\n` +
      `       Add the following to your hook manually:\n\n` +
      `  ${MARKER}\n` +
      `  if command -v mdenc >/dev/null 2>&1; then\n` +
      `    mdenc ${hookName}\n` +
      `  elif [ -x "./node_modules/.bin/mdenc" ]; then\n` +
      `    ./node_modules/.bin/mdenc ${hookName}\n` +
      `  fi\n\n`,
  );
}

export async function initCommand(): Promise<void> {
  const repoRoot = findGitRoot();
  const hooksDir = getHooksDir();

  for (const hookName of HOOK_NAMES) {
    const hookPath = join(hooksDir, hookName);

    if (!existsSync(hookPath)) {
      writeFileSync(hookPath, newHookScript(hookName));
      chmodSync(hookPath, 0o755);
      console.log(`Installed ${hookName} hook`);
      continue;
    }

    const content = readFileSync(hookPath, 'utf-8');

    if (content.includes(MARKER)) {
      console.log(`${hookName} hook already installed (skipped)`);
      continue;
    }

    // Safety checks
    if (isBinary(content)) {
      process.stderr.write(
        `mdenc: ${hookName} hook appears to be a binary file. Skipping.\n`,
      );
      printManualInstructions(hookName);
      continue;
    }

    if (!hasShellShebang(content)) {
      process.stderr.write(
        `mdenc: ${hookName} hook has no shell shebang. Skipping.\n`,
      );
      printManualInstructions(hookName);
      continue;
    }

    if (looksLikeFrameworkHook(content)) {
      process.stderr.write(
        `mdenc: ${hookName} hook appears to be managed by a framework. Skipping.\n`,
      );
      printManualInstructions(hookName);
      continue;
    }

    // Safe to append
    writeFileSync(hookPath, content.trimEnd() + '\n' + hookBlock(hookName) + '\n');
    chmodSync(hookPath, 0o755);
    console.log(`Appended mdenc to existing ${hookName} hook`);
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

  // Decrypt existing .mdenc files
  const { decryptAll } = await import('./hooks.js');
  const { decrypted } = await decryptAll();
  if (decrypted > 0) {
    console.log(`Decrypted ${decrypted} existing file(s)`);
  }

  console.log('mdenc git integration initialized.');
}

export function removeHooksCommand(): void {
  const hooksDir = getHooksDir();
  let removedCount = 0;

  for (const hookName of HOOK_NAMES) {
    const hookPath = join(hooksDir, hookName);

    if (!existsSync(hookPath)) continue;

    const content = readFileSync(hookPath, 'utf-8');
    if (!content.includes(MARKER)) {
      console.log(`${hookName}: no mdenc block found (skipped)`);
      continue;
    }

    // Remove the mdenc block: from the marker line through the matching fi
    const lines = content.split('\n');
    const filtered: string[] = [];
    let inBlock = false;

    for (const line of lines) {
      if (line.trim() === MARKER) {
        inBlock = true;
        continue;
      }
      if (inBlock) {
        if (line.trim() === 'fi') {
          inBlock = false;
          continue;
        }
        continue;
      }
      filtered.push(line);
    }

    const result = filtered.join('\n');
    const isEmpty = result.split('\n').every(l => l.trim() === '' || l.startsWith('#!'));

    if (isEmpty) {
      unlinkSync(hookPath);
      console.log(`Removed ${hookName} hook (was mdenc-only)`);
    } else {
      writeFileSync(hookPath, result);
      console.log(`Removed mdenc block from ${hookName} hook`);
    }

    removedCount++;
  }

  if (removedCount === 0) {
    console.log('No mdenc hooks found to remove.');
  } else {
    console.log('mdenc hooks removed.');
  }
}
