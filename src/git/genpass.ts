import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { findGitRoot } from './utils.js';

const PASSWORD_FILE = '.mdenc-password';

export function genpassCommand(force: boolean): void {
  const repoRoot = findGitRoot();
  const passwordPath = join(repoRoot, PASSWORD_FILE);

  if (existsSync(passwordPath) && !force) {
    console.error(`${PASSWORD_FILE} already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  const password = Buffer.from(randomBytes(32)).toString('base64url');
  writeFileSync(passwordPath, password + '\n', { mode: 0o600 });
  console.error(`Generated password and wrote to ${PASSWORD_FILE}`);
  console.error(password);

  // Ensure .mdenc-password is in .gitignore
  const gitignorePath = join(repoRoot, '.gitignore');
  const entry = PASSWORD_FILE;

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim());
    if (!lines.includes(entry)) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + entry + '\n');
      console.error('Added .mdenc-password to .gitignore');
    }
  } else {
    writeFileSync(gitignorePath, entry + '\n');
    console.error('Created .gitignore with .mdenc-password');
  }
}
