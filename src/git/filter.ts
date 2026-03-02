import { relative } from 'node:path';
import { encrypt, decrypt } from '../encrypt.js';
import { findGitRoot, gitShow } from './utils.js';
import { resolvePassword } from './password.js';

export async function cleanFilter(
  pathname: string,
  plaintext: string,
  password: string,
  repoRoot: string,
): Promise<string> {
  const previousFile = gitShow(repoRoot, 'HEAD', pathname);
  return encrypt(plaintext, password, { previousFile });
}

export async function smudgeFilter(
  content: string,
  password: string | null,
): Promise<string> {
  if (!password || !content.startsWith('mdenc:v1')) {
    return content;
  }

  try {
    return await decrypt(content, password);
  } catch {
    // Decryption failed (wrong password, corrupt data) — pass through
    return content;
  }
}

export async function simpleCleanFilter(pathname: string): Promise<void> {
  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);

  if (!password) {
    process.stderr.write('mdenc: no password available, cannot encrypt\n');
    process.exit(1);
  }

  const input = await readStdin();
  const encrypted = await cleanFilter(pathname, input, password, repoRoot);
  process.stdout.write(encrypted);
}

export async function simpleSmudgeFilter(): Promise<void> {
  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);

  const input = await readStdin();
  const output = await smudgeFilter(input, password);
  process.stdout.write(output);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk as Buffer));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.resume();
  });
}
