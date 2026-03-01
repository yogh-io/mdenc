import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { deriveMasterKey, deriveKeys } from './kdf.js';
import {
  parseHeader,
  verifyHeader,
  fromBase64,
} from './header.js';
import { constantTimeEqual, zeroize } from './crypto-utils.js';

export async function verifySeal(
  fileContent: string,
  password: string,
): Promise<boolean> {
  const lines = fileContent.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 3) throw new Error('Invalid mdenc file: too few lines');

  const headerLine = lines[0];
  const header = parseHeader(headerLine);

  // Parse header auth
  const authLine = lines[1];
  const authMatch = authLine.match(/^hdrauth_b64=([A-Za-z0-9+/=]+)$/);
  if (!authMatch) throw new Error('Invalid mdenc file: missing hdrauth_b64 line');
  const headerHmac = fromBase64(authMatch[1]);

  // Derive keys
  const masterKey = deriveMasterKey(password, header.salt, header.scrypt);
  const { headerKey, nonceKey } = deriveKeys(masterKey);

  try {
    // Verify header
    if (!verifyHeader(headerKey, headerLine, headerHmac)) {
      throw new Error('Header authentication failed');
    }

    // Find seal line
    const chunkAndSealLines = lines.slice(2);
    const sealIndex = chunkAndSealLines.findIndex(l => l.startsWith('seal_b64='));
    if (sealIndex < 0) {
      throw new Error('File is not sealed: no seal_b64 line found');
    }

    const chunkLines = chunkAndSealLines.slice(0, sealIndex);
    const sealMatch = chunkAndSealLines[sealIndex].match(/^seal_b64=([A-Za-z0-9+/=]+)$/);
    if (!sealMatch) throw new Error('Invalid seal line');
    const storedHmac = fromBase64(sealMatch[1]);

    // Verify seal HMAC (covers header + auth + chunk lines)
    const sealInput = headerLine + '\n' + authLine + '\n' + chunkLines.join('\n');
    const sealData = new TextEncoder().encode(sealInput);
    const computed = hmac(sha256, headerKey, sealData);

    return constantTimeEqual(computed, storedHmac);
  } finally {
    zeroize(masterKey, headerKey, nonceKey);
  }
}
