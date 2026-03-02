import { describe, it, expect, afterEach } from 'bun:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempGitRepo, mdenc, type TempGitRepo } from './helpers.js';

function gitConfig(repo: string, key: string): string | null {
  try {
    return execFileSync('git', ['config', '--get', key], {
      cwd: repo,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

describe('mdenc init', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('configures git filter and diff settings', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);

    expect(gitConfig(repo.path, 'filter.mdenc.process')).toBe('mdenc filter-process');
    expect(gitConfig(repo.path, 'filter.mdenc.clean')).toBe('mdenc filter-clean %f');
    expect(gitConfig(repo.path, 'filter.mdenc.smudge')).toBe('mdenc filter-smudge %f');
    expect(gitConfig(repo.path, 'filter.mdenc.required')).toBe('true');
    expect(gitConfig(repo.path, 'diff.mdenc.textconv')).toBe('mdenc textconv');
  });

  it('adds .mdenc-password to .gitignore', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);

    const gitignore = readFileSync(join(repo.path, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.mdenc-password');
  });

  it('is idempotent on re-run', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);
    const out2 = mdenc(repo.path, ['init']);

    expect(out2).toContain('already configured');
    expect(out2).toContain('.mdenc-password already in .gitignore');
  });

  it('appends .mdenc-password to existing .gitignore without duplicating', () => {
    repo = createTempGitRepo();

    writeFileSync(join(repo.path, '.gitignore'), 'node_modules/\n');
    mdenc(repo.path, ['init']);

    const gitignore = readFileSync(join(repo.path, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.mdenc-password');

    const count = (gitignore.match(/\.mdenc-password/g) || []).length;
    expect(count).toBe(1);
  });
});

describe('mdenc remove-filter', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('removes filter configuration', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);

    // Verify config is set
    expect(gitConfig(repo.path, 'filter.mdenc.process')).not.toBeNull();

    mdenc(repo.path, ['remove-filter']);

    expect(gitConfig(repo.path, 'filter.mdenc.process')).toBeNull();
    expect(gitConfig(repo.path, 'filter.mdenc.required')).toBeNull();
    expect(gitConfig(repo.path, 'diff.mdenc.textconv')).toBeNull();
  });

  it('is safe to run when no filter is configured', () => {
    repo = createTempGitRepo();
    const output = mdenc(repo.path, ['remove-filter']);
    expect(output).toContain('Removed git filter configuration');
  });
});
