import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PASSWORD_FILE = '.mdenc-password';

/**
 * Resolve password for non-interactive use (git hooks).
 * Checks MDENC_PASSWORD env var, then .mdenc-password file.
 * Returns null if neither is available — never prompts on TTY.
 */
export function resolvePassword(repoRoot: string): string | null {
  const envPassword = process.env['MDENC_PASSWORD'];
  if (envPassword) return envPassword;

  try {
    const content = readFileSync(join(repoRoot, PASSWORD_FILE), 'utf-8').trim();
    if (content.length > 0) return content;
  } catch {
    // File doesn't exist or unreadable
  }

  return null;
}
