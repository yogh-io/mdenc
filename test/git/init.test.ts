import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createTempGitRepo, mdenc, mdencStderr, type TempGitRepo } from './helpers.js';

describe('mdenc init', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('installs all four hook files', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);

    const hooksDir = join(repo.path, '.git', 'hooks');
    for (const name of ['pre-commit', 'post-checkout', 'post-merge', 'post-rewrite']) {
      const hookPath = join(hooksDir, name);
      expect(existsSync(hookPath), `${name} hook should exist`).toBe(true);
      const content = readFileSync(hookPath, 'utf-8');
      expect(content).toContain('# mdenc-hook-marker');
      expect(content).toContain(`mdenc ${name}`);
      expect(content).toContain('#!/bin/sh');
    }
  });

  it('adds .mdenc-password to .gitignore', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);

    const gitignore = readFileSync(join(repo.path, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.mdenc-password');
  });

  it('is idempotent on re-run', () => {
    repo = createTempGitRepo();
    const out1 = mdenc(repo.path, ['init']);
    const out2 = mdenc(repo.path, ['init']);

    expect(out2).toContain('already installed');
    expect(out2).toContain('.mdenc-password already in .gitignore');

    // Hook file should contain marker exactly once
    const hookContent = readFileSync(join(repo.path, '.git', 'hooks', 'pre-commit'), 'utf-8');
    const markerCount = (hookContent.match(/# mdenc-hook-marker/g) || []).length;
    expect(markerCount).toBe(1);
  });

  it('appends to existing shell hooks', () => {
    repo = createTempGitRepo();

    const hookPath = join(repo.path, '.git', 'hooks', 'pre-commit');
    writeFileSync(hookPath, '#!/bin/sh\necho "existing hook"\n');
    chmodSync(hookPath, 0o755);

    mdenc(repo.path, ['init']);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('echo "existing hook"');
    expect(content).toContain('# mdenc-hook-marker');
  });

  it('refuses to modify non-shell hooks and prints instructions', () => {
    repo = createTempGitRepo();

    const hookPath = join(repo.path, '.git', 'hooks', 'pre-commit');
    writeFileSync(hookPath, '#!/usr/bin/env python3\nprint("hello")\n');
    chmodSync(hookPath, 0o755);

    const { stderr } = mdencStderr(repo.path, ['init']);
    expect(stderr).toContain('unrecognized format');

    // Should NOT have been modified
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).not.toContain('mdenc-hook-marker');
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

describe('mdenc remove-hooks', () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it('removes mdenc blocks from hooks', () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ['init']);
    mdenc(repo.path, ['remove-hooks']);

    const hooksDir = join(repo.path, '.git', 'hooks');
    for (const name of ['pre-commit', 'post-checkout', 'post-merge', 'post-rewrite']) {
      const hookPath = join(hooksDir, name);
      // mdenc-only hooks should be deleted entirely
      expect(existsSync(hookPath), `${name} hook should be removed`).toBe(false);
    }
  });

  it('preserves non-mdenc content in hooks', () => {
    repo = createTempGitRepo();

    // Create a hook with existing content
    const hookPath = join(repo.path, '.git', 'hooks', 'pre-commit');
    writeFileSync(hookPath, '#!/bin/sh\necho "keep this"\n');
    chmodSync(hookPath, 0o755);

    mdenc(repo.path, ['init']);
    mdenc(repo.path, ['remove-hooks']);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('echo "keep this"');
    expect(content).not.toContain('mdenc-hook-marker');
  });

  it('is safe to run when no hooks are installed', () => {
    repo = createTempGitRepo();
    const output = mdenc(repo.path, ['remove-hooks']);
    expect(output).toContain('No mdenc hooks found');
  });
});
