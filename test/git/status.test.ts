import { describe, it, expect, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempGitRepo, mdenc, git, type TempGitRepo } from './helpers.js';

describe('mdenc status', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('reports no marked directories', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);
    const output = mdenc(repo.path, ['status']);
    expect(output).toContain('No directories marked');
  });

  it('shows marked directory with file states', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['init']);
    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    // Create and encrypt a file
    writeFileSync(join(dir, 'test.md'), '# Hello\n');
    mdenc(repo.path, ['pre-commit']);

    const output = mdenc(repo.path, ['status']);
    expect(output).toContain('notes/');
    expect(output).toContain('up to date');
    expect(output).toContain('Hooks: all installed');
    expect(output).toContain('Password: available');
  });

  it('shows files needing encryption', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['init']);
    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    // Create .md without encrypting
    writeFileSync(join(dir, 'new.md'), '# New\n');

    const output = mdenc(repo.path, ['status']);
    expect(output).toContain('not yet encrypted');
  });

  it('shows missing hooks', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);

    const output = mdenc(repo.path, ['status']);
    expect(output).toContain('MISSING');
  });

  it('shows missing password', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);

    const output = mdenc(repo.path, ['status'], { MDENC_PASSWORD: '' });
    expect(output).toContain('NOT AVAILABLE');
  });
});
