// Generates the public key that pins Paceline's development extension id.
// Only the public key is kept: Chrome needs nothing else to load an unpacked extension.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const keyPath = 'packages/extension/dev-key.txt';

if (existsSync(keyPath) && !process.argv.includes('--force')) {
  console.error(`${keyPath} already exists. Pass --force to regenerate.`);
  process.exit(1);
}

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' });
const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');

mkdirSync('packages/extension', { recursive: true });
writeFileSync(keyPath, `${der.toString('base64')}\n`);
console.log(`Generated a local development extension key. Extension ID: ${id}`);
console.log('Keep packages/extension/dev-key.txt private to this checkout.');
