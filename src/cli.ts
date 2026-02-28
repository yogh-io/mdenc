import { readFileSync, writeFileSync } from 'node:fs';
import { encrypt, decrypt } from './encrypt.js';
import { seal, verifySeal } from './seal.js';

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
  mdenc encrypt <file> [-o output]
  mdenc decrypt <file> [-o output]
  mdenc seal <file>
  mdenc verify <file>`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) usage();

  const command = args[0];
  const inputFile = args[1];

  const outputIdx = args.indexOf('-o');
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : undefined;

  try {
    switch (command) {
      case 'encrypt': {
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

      case 'seal': {
        const password = await getPassword();
        const fileContent = readFileSync(inputFile, 'utf-8');
        const sealed = await seal(fileContent, password);
        writeFileSync(inputFile, sealed);
        console.error('Sealed:', inputFile);
        break;
      }

      case 'verify': {
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
