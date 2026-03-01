import { describe, it, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dirname, '..', 'bin', 'mdenc');
const PASSWORD = 'test-password';

function run(args: string[], env?: Record<string, string>): string {
  return execFileSync('bun', [CLI, ...args], {
    env: { ...process.env, MDENC_PASSWORD: PASSWORD, ...env },
    encoding: 'utf-8',
    timeout: 30000,
  });
}

function runExpectFail(args: string[], env?: Record<string, string>): string {
  try {
    execFileSync('bun', [CLI, ...args], {
      env: { ...process.env, MDENC_PASSWORD: PASSWORD, ...env },
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    throw new Error('Expected command to fail');
  } catch (err: unknown) {
    const e = err as { stderr?: string; status?: number };
    if (e.status === 0) throw new Error('Expected non-zero exit');
    return e.stderr ?? '';
  }
}

describe('CLI', () => {
  let tmpDir: string;

  const setup = () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mdenc-test-'));
  };

  const cleanup = () => {
    rmSync(tmpDir, { recursive: true, force: true });
  };

  it('encrypt and decrypt round-trip', () => {
    setup();
    try {
      const inputFile = join(tmpDir, 'input.md');
      const encFile = join(tmpDir, 'output.mdenc');
      const content = '# Test\n\nHello world.\n';
      writeFileSync(inputFile, content);

      run(['encrypt', inputFile, '-o', encFile]);
      const encrypted = readFileSync(encFile, 'utf-8');
      expect(encrypted).toContain('mdenc:v1');

      const decrypted = run(['decrypt', encFile]);
      expect(decrypted).toBe(content);
    } finally {
      cleanup();
    }
  });

  it('encrypt always includes seal, verify passes', () => {
    setup();
    try {
      const inputFile = join(tmpDir, 'input.md');
      const encFile = join(tmpDir, 'output.mdenc');
      writeFileSync(inputFile, '# Test\n\nContent here.\n');

      run(['encrypt', inputFile, '-o', encFile]);

      const encrypted = readFileSync(encFile, 'utf-8');
      expect(encrypted).toContain('seal_b64=');

      // verify should not throw
      run(['verify', encFile]);
    } finally {
      cleanup();
    }
  });

  it('wrong password exits with error', () => {
    setup();
    try {
      const inputFile = join(tmpDir, 'input.md');
      const encFile = join(tmpDir, 'output.mdenc');
      writeFileSync(inputFile, '# Test\n\nContent.\n');

      run(['encrypt', inputFile, '-o', encFile]);

      const stderr = runExpectFail(['decrypt', encFile], {
        MDENC_PASSWORD: 'wrong-password',
      });
      expect(stderr).toContain('Header authentication failed');
    } finally {
      cleanup();
    }
  });

  it('reads password from MDENC_PASSWORD env var', () => {
    setup();
    try {
      const inputFile = join(tmpDir, 'input.md');
      const encFile = join(tmpDir, 'output.mdenc');
      writeFileSync(inputFile, 'hello\n');

      run(['encrypt', inputFile, '-o', encFile], {
        MDENC_PASSWORD: 'custom-pass',
      });

      const decrypted = run(['decrypt', encFile], {
        MDENC_PASSWORD: 'custom-pass',
      });
      expect(decrypted).toBe('hello\n');
    } finally {
      cleanup();
    }
  });
});
