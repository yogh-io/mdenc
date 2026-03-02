import { describe, it, expect, afterEach } from 'bun:test';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempGitRepo, mdenc, git, type TempGitRepo } from './helpers.js';

describe('mdenc mark', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('creates .mdenc.conf and .gitattributes', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);

    expect(existsSync(join(dir, '.mdenc.conf'))).toBe(true);
    expect(existsSync(join(dir, '.gitattributes'))).toBe(true);

    const gitattrs = readFileSync(join(dir, '.gitattributes'), 'utf-8');
    expect(gitattrs).toContain('*.md filter=mdenc diff=mdenc');
  });

  it('stages .mdenc.conf and .gitattributes', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);

    const staged = git(repo.path, ['diff', '--cached', '--name-only']);
    expect(staged).toContain('notes/.mdenc.conf');
    expect(staged).toContain('notes/.gitattributes');
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

  it('updates existing .gitattributes without duplicating', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    // Run again
    mdenc(repo.path, ['mark', dir]);

    const gitattrs = readFileSync(join(dir, '.gitattributes'), 'utf-8');
    const count = (gitattrs.match(/filter=mdenc/g) || []).length;
    expect(count).toBe(1);
  });
});
