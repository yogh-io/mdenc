import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempGitRepo, mdenc, git, type TempGitRepo } from './helpers.js';

describe('mdenc mark', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('creates .mdenc.conf and .gitignore', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);

    expect(existsSync(join(dir, '.mdenc.conf'))).toBe(true);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);

    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('*.md');
  });

  it('stages .mdenc.conf and .gitignore', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);

    const staged = git(repo.path, ['diff', '--cached', '--name-only']);
    expect(staged).toContain('notes/.mdenc.conf');
    expect(staged).toContain('notes/.gitignore');
  });

  it('untracks already-tracked .md files', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    // Add and commit a .md file
    writeFileSync(join(dir, 'secret.md'), '# Secret\n');
    git(repo.path, ['add', 'notes/secret.md']);
    git(repo.path, ['commit', '-m', 'add md']);

    // Now mark the directory
    mdenc(repo.path, ['mark', dir]);

    // The .md file should be untracked but still exist on disk
    expect(existsSync(join(dir, 'secret.md'))).toBe(true);

    // Verify it's been removed from the index
    const tracked = git(repo.path, ['ls-files', '--', 'notes/secret.md']).trim();
    expect(tracked).toBe('');
  });

  it('is idempotent', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    const out = mdenc(repo.path, ['mark', dir]);
    expect(out).toContain('already exists');
    expect(out).toContain('already has');
  });

  it('fails for nonexistent directory', () => {
    repo = createTempGitRepo();
    try {
      mdenc(repo.path, ['mark', join(repo.path, 'nonexistent')]);
      expect.fail('Should have thrown');
    } catch {
      // Expected
    }
  });

  it('updates existing .gitignore without duplicating *.md', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);
    writeFileSync(join(dir, '.gitignore'), 'tmp/\n');

    mdenc(repo.path, ['mark', dir]);

    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('tmp/');
    expect(gitignore).toContain('*.md');
    const count = (gitignore.match(/\*\.md/g) || []).length;
    expect(count).toBe(1);
  });
});
