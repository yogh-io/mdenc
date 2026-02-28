import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { encrypt, decrypt } from './encrypt.js';
import { seal, verifySeal } from './seal.js';

async function getPassword(): Promise<string> {
  const envPassword = process.env['MDENC_PASSWORD'];
  if (envPassword) return envPassword;

  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question('Password: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
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

  const password = await getPassword();

  try {
    switch (command) {
      case 'encrypt': {
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
        const fileContent = readFileSync(inputFile, 'utf-8');
        const sealed = await seal(fileContent, password);
        writeFileSync(inputFile, sealed);
        console.error('Sealed:', inputFile);
        break;
      }

      case 'verify': {
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
