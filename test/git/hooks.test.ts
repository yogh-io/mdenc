import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createTempGitRepo, mdenc, mdencStderr, git, PASSWORD, type TempGitRepo } from './helpers.js';

describe('pre-commit hook', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('encrypts .md files and produces valid .mdenc', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    writeFileSync(join(dir, 'test.md'), '# Hello\n\nWorld.\n');
    mdenc(repo.path, ['pre-commit']);

    const mdencPath = join(dir, 'test.mdenc');
    expect(existsSync(mdencPath)).toBe(true);

    const encrypted = readFileSync(mdencPath, 'utf-8');
    expect(encrypted).toContain('mdenc:v1');
    expect(encrypted).toContain('seal_b64=');
  });

  it('stages .mdenc files', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    writeFileSync(join(dir, 'test.md'), '# Hello\n\nWorld.\n');
    mdenc(repo.path, ['pre-commit']);

    const staged = git(repo.path, ['diff', '--cached', '--name-only']);
    expect(staged).toContain('notes/test.mdenc');
  });

  it('uses previousFile for deterministic re-encryption', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    // Initial encrypt
    writeFileSync(join(dir, 'test.md'), '# Hello\n\nParagraph one.\n\nParagraph two.\n');
    mdenc(repo.path, ['pre-commit']);
    const first = readFileSync(join(dir, 'test.mdenc'), 'utf-8');

    git(repo.path, ['add', '-A']);
    git(repo.path, ['commit', '-m', 'first']);

    // Edit only second paragraph
    writeFileSync(join(dir, 'test.md'), '# Hello\n\nParagraph one.\n\nParagraph two edited.\n');
    mdenc(repo.path, ['pre-commit']);
    const second = readFileSync(join(dir, 'test.mdenc'), 'utf-8');

    // Same header (salt/fileId reused)
    const firstHeader = first.split('\n')[0];
    const secondHeader = second.split('\n')[0];
    expect(secondHeader).toBe(firstHeader);

    // First two chunks should be identical (header auth + paragraph 1 unchanged)
    const firstLines = first.split('\n');
    const secondLines = second.split('\n');
    expect(secondLines[1]).toBe(firstLines[1]); // hdrauth
    expect(secondLines[2]).toBe(firstLines[2]); // chunk 0 (# Hello)
    expect(secondLines[3]).toBe(firstLines[3]); // chunk 1 (Paragraph one.)
  });

  it('skips encryption when no password is available', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    writeFileSync(join(dir, 'test.md'), '# Hello\n');

    const { stderr } = mdencStderr(repo.path, ['pre-commit'], { MDENC_PASSWORD: '' });
    expect(stderr).toContain('no password available');

    // .mdenc should NOT have been created
    expect(existsSync(join(dir, 'test.mdenc'))).toBe(false);
  });

  it('ignores .md files in unmarked directories', () => {
    repo = createTempGitRepo();
    const markedDir = join(repo.path, 'private');
    const plainDir = join(repo.path, 'public');
    mkdirSync(markedDir);
    mkdirSync(plainDir);

    mdenc(repo.path, ['mark', markedDir]);
    git(repo.path, ['commit', '-m', 'mark']);

    writeFileSync(join(markedDir, 'secret.md'), '# Secret\n');
    writeFileSync(join(plainDir, 'readme.md'), '# README\n');
    mdenc(repo.path, ['pre-commit']);

    expect(existsSync(join(markedDir, 'secret.mdenc'))).toBe(true);
    expect(existsSync(join(plainDir, 'readme.mdenc'))).toBe(false);
  });

  it('skips files where .mdenc is newer than .md (mtime optimization)', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    writeFileSync(join(dir, 'test.md'), '# Hello\n');
    mdenc(repo.path, ['pre-commit']);
    const firstMdenc = readFileSync(join(dir, 'test.mdenc'), 'utf-8');

    // Run pre-commit again without modifying .md
    // Need to make .mdenc newer than .md - it already should be since we just wrote it
    const { stderr } = mdencStderr(repo.path, ['pre-commit']);

    // .mdenc should be unchanged
    const secondMdenc = readFileSync(join(dir, 'test.mdenc'), 'utf-8');
    expect(secondMdenc).toBe(firstMdenc);
  });
});

describe('post-checkout hook (decryptAll)', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('decrypts .mdenc files to .md', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    // Create and encrypt a file
    const content = '# Hello\n\nWorld.\n';
    writeFileSync(join(dir, 'test.md'), content);
    mdenc(repo.path, ['pre-commit']);

    // Remove the .md to simulate a fresh checkout
    unlinkSync(join(dir, 'test.md'));
    expect(existsSync(join(dir, 'test.md'))).toBe(false);

    // Run post-checkout
    mdenc(repo.path, ['post-checkout']);

    expect(existsSync(join(dir, 'test.md'))).toBe(true);
    expect(readFileSync(join(dir, 'test.md'), 'utf-8')).toBe(content);
  });

  it('warns and skips when no password available', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    writeFileSync(join(dir, 'test.md'), '# Hello\n');
    mdenc(repo.path, ['pre-commit']);

    unlinkSync(join(dir, 'test.md'));

    const { stderr } = mdencStderr(repo.path, ['post-checkout'], { MDENC_PASSWORD: '' });
    expect(stderr).toContain('no password available');
    expect(existsSync(join(dir, 'test.md'))).toBe(false);
  });

  it('does not overwrite .md that is newer than .mdenc', () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, 'notes');
    mkdirSync(dir);

    mdenc(repo.path, ['mark', dir]);
    git(repo.path, ['commit', '-m', 'mark']);

    writeFileSync(join(dir, 'test.md'), '# Original\n');
    mdenc(repo.path, ['pre-commit']);

    // Modify .md after encryption (making it newer)
    writeFileSync(join(dir, 'test.md'), '# Modified locally\n');

    const { stderr } = mdencStderr(repo.path, ['post-checkout']);
    expect(stderr).toContain('skipping');

    // .md should still have the local modification
    expect(readFileSync(join(dir, 'test.md'), 'utf-8')).toBe('# Modified locally\n');
  });
});
