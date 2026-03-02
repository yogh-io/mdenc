import { readFileSync } from 'node:fs';
import { decrypt } from '../encrypt.js';
import { findGitRoot } from './utils.js';
import { resolvePassword } from './password.js';

export async function textconvCommand(filePath: string): Promise<void> {
  const content = readFileSync(filePath, 'utf-8');

  if (!content.startsWith('mdenc:v1')) {
    process.stdout.write(content);
    return;
  }

  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);

  if (!password) {
    process.stdout.write(content);
    return;
  }

  try {
    const plaintext = await decrypt(content, password);
    process.stdout.write(plaintext);
  } catch {
    process.stdout.write(content);
  }
}
