import { readFileSync, writeFileSync } from 'node:fs';
import { encrypt, decrypt } from './encrypt.js';
import { verifySeal } from './seal.js';
import { initCommand, removeFilterCommand } from './git/init.js';
import { markCommand } from './git/mark.js';
import { statusCommand } from './git/status.js';
import { genpassCommand } from './git/genpass.js';
import { simpleCleanFilter, simpleSmudgeFilter } from './git/filter.js';
import { filterProcessMain } from './git/filter-process.js';
import { textconvCommand } from './git/textconv.js';

function readPasswordFromTTY(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Non-TTY fallback: read a line from stdin
      process.stderr.write(prompt);
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk: string) => {
        const nlIdx = chunk.indexOf('\n');
        if (nlIdx >= 0) {
          data += chunk.slice(0, nlIdx);
          process.stdin.pause();
          resolve(data);
        } else {
          data += chunk;
        }
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.resume();
      return;
    }

    process.stderr.write(prompt);
    const buf: string[] = [];

    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf-8');
    process.stdin.resume();

    const onData = (ch: string) => {
      if (ch === '\u0003') {
        // Ctrl+C
        process.stderr.write('\n');
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.exit(130);
      } else if (ch === '\r' || ch === '\n') {
        // Enter
        process.stderr.write('\n');
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        resolve(buf.join(''));
      } else if (ch === '\u007F' || ch === '\b') {
        // Backspace
        buf.pop();
      } else if (ch === '\u0004') {
        // Ctrl+D (EOF)
        process.stderr.write('\n');
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        resolve(buf.join(''));
      } else if (ch >= ' ') {
        buf.push(ch);
      }
    };

    process.stdin.on('data', onData);
  });
}

async function getPassword(prompt = 'Password: '): Promise<string> {
  const envPassword = process.env['MDENC_PASSWORD'];
  if (envPassword) return envPassword;

  return readPasswordFromTTY(prompt);
}

async function getPasswordWithConfirmation(): Promise<string> {
  if (process.env['MDENC_PASSWORD']) return process.env['MDENC_PASSWORD'];

  const password = await readPasswordFromTTY('Password: ');
  const confirm = await readPasswordFromTTY('Confirm password: ');
  if (password !== confirm) {
    console.error('Error: passwords do not match');
    process.exit(1);
  }
  return password;
}

function usage(): never {
  console.error(`Usage:
  mdenc encrypt <file> [-o output]    Encrypt a markdown file
  mdenc decrypt <file> [-o output]    Decrypt an mdenc file
  mdenc verify <file>                 Verify file integrity

Git integration:
  mdenc init                          Set up git filter for automatic encryption
  mdenc mark <directory>              Mark a directory for encryption
  mdenc status                        Show encryption status
  mdenc remove-filter                 Remove git filter configuration
  mdenc genpass [--force]             Generate a random password into .mdenc-password

Internal (called by git):
  mdenc filter-process                Long-running filter process
  mdenc filter-clean <path>           Single-file clean filter
  mdenc filter-smudge <path>          Single-file smudge filter
  mdenc textconv <file>               Output plaintext for git diff`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) usage();

  const command = args[0];

  try {
    switch (command) {
      case 'encrypt': {
        if (!args[1]) usage();
        const inputFile = args[1];
        const outputIdx = args.indexOf('-o');
        const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : undefined;
        const password = await getPasswordWithConfirmation();
        const plaintext = readFileSync(inputFile, 'utf-8');
        const encrypted = await encrypt(plaintext, password);
        if (outputFile) {
          writeFileSync(outputFile, encrypted);
        } else {
          process.stdout.write(encrypted);
        }
        break;
      }

      case 'decrypt': {
        if (!args[1]) usage();
        const inputFile = args[1];
        const outputIdx = args.indexOf('-o');
        const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : undefined;
        const password = await getPassword();
        const fileContent = readFileSync(inputFile, 'utf-8');
        const decrypted = await decrypt(fileContent, password);
        if (outputFile) {
          writeFileSync(outputFile, decrypted);
        } else {
          process.stdout.write(decrypted);
        }
        break;
      }

      case 'verify': {
        if (!args[1]) usage();
        const inputFile = args[1];
        const password = await getPassword();
        const fileContent = readFileSync(inputFile, 'utf-8');
        const valid = await verifySeal(fileContent, password);
        if (valid) {
          console.error('Seal verified: OK');
          process.exit(0);
        } else {
          console.error('Seal verification FAILED');
          process.exit(1);
        }
        break;
      }

      case 'init':
        await initCommand();
        break;

      case 'mark': {
        if (!args[1]) {
          console.error('Usage: mdenc mark <directory>');
          process.exit(1);
        }
        markCommand(args[1]);
        break;
      }

      case 'status':
        statusCommand();
        break;

      case 'remove-filter':
        removeFilterCommand();
        break;

      case 'genpass':
        genpassCommand(args.includes('--force'));
        break;

      // Git filter commands (called by git, not directly by user)
      case 'filter-process':
        await filterProcessMain();
        break;

      case 'filter-clean':
        await simpleCleanFilter(args[1] ?? '');
        break;

      case 'filter-smudge':
        await simpleSmudgeFilter();
        break;

      case 'textconv':
        if (!args[1]) {
          console.error('Usage: mdenc textconv <file>');
          process.exit(1);
        }
        await textconvCommand(args[1]);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        usage();
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
