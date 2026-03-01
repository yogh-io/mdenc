import { describe, it, expect, afterEach } from 'bun:test';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempGitRepo, mdencStderr, type TempGitRepo } from './helpers';

let repo: TempGitRepo;

afterEach(() => {
  repo?.cleanup();
});

describe('genpass', () => {
  it('generates a password file with 32 bytes of base64url', () => {
    repo = createTempGitRepo();
    const result = mdencStderr(repo.path, ['genpass']);
    expect(result.status).toBe(0);

    const content = readFileSync(join(repo.path, '.mdenc-password'), 'utf-8').trim();
    // 32 bytes base64url = 43 chars (no padding)
    expect(content).toHaveLength(43);
    expect(content).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('prints the password to stderr', () => {
    repo = createTempGitRepo();
    const result = mdencStderr(repo.path, ['genpass']);
    expect(result.status).toBe(0);

    const content = readFileSync(join(repo.path, '.mdenc-password'), 'utf-8').trim();
    expect(result.stderr).toContain(content);
  });

  it('refuses to overwrite existing password file', () => {
    repo = createTempGitRepo();
    writeFileSync(join(repo.path, '.mdenc-password'), 'existing\n');

    const result = mdencStderr(repo.path, ['genpass']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already exists');

    // Original file unchanged
    expect(readFileSync(join(repo.path, '.mdenc-password'), 'utf-8')).toBe('existing\n');
  });

  it('overwrites with --force', () => {
    repo = createTempGitRepo();
    writeFileSync(join(repo.path, '.mdenc-password'), 'existing\n');

    const result = mdencStderr(repo.path, ['genpass', '--force']);
    expect(result.status).toBe(0);

    const content = readFileSync(join(repo.path, '.mdenc-password'), 'utf-8').trim();
    expect(content).not.toBe('existing');
    expect(content).toHaveLength(43);
  });

  it('sets file permissions to 0600', () => {
    repo = createTempGitRepo();
    mdencStderr(repo.path, ['genpass']);

    const stat = statSync(join(repo.path, '.mdenc-password'));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('adds .mdenc-password to .gitignore', () => {
    repo = createTempGitRepo();
    mdencStderr(repo.path, ['genpass']);

    const gitignore = readFileSync(join(repo.path, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.mdenc-password');
  });

  it('does not duplicate .gitignore entry', () => {
    repo = createTempGitRepo();
    writeFileSync(join(repo.path, '.gitignore'), '.mdenc-password\n');

    mdencStderr(repo.path, ['genpass']);

    const gitignore = readFileSync(join(repo.path, '.gitignore'), 'utf-8');
    const count = gitignore.split('\n').filter(l => l.trim() === '.mdenc-password').length;
    expect(count).toBe(1);
  });
});
