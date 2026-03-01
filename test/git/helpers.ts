import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const CLI = join(import.meta.dirname, '..', '..', 'bin', 'mdenc');
export const PASSWORD = 'test-password';

export interface TempGitRepo {
  path: string;
  cleanup: () => void;
}

export function createTempGitRepo(): TempGitRepo {
  const repoPath = mkdtempSync(join(tmpdir(), 'mdenc-git-test-'));
  execFileSync('git', ['init', repoPath], { stdio: 'pipe' });
  execFileSync('git', ['-C', repoPath, 'config', 'user.email', 'test@test.com'], { stdio: 'pipe' });
  execFileSync('git', ['-C', repoPath, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
  // Create initial commit so HEAD exists
  execFileSync('git', ['-C', repoPath, 'commit', '--allow-empty', '-m', 'init'], { stdio: 'pipe' });
  return {
    path: repoPath,
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  };
}

export function mdenc(repo: string, args: string[], env?: Record<string, string>): string {
  return execFileSync('node', [CLI, ...args], {
    cwd: repo,
    env: { ...process.env, MDENC_PASSWORD: PASSWORD, ...env },
    encoding: 'utf-8',
    timeout: 30000,
  });
}

export function mdencStderr(repo: string, args: string[], env?: Record<string, string>): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [CLI, ...args], {
    cwd: repo,
    env: { ...process.env, MDENC_PASSWORD: PASSWORD, ...env },
    encoding: 'utf-8',
    timeout: 30000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

export function git(repo: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
