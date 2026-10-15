// Generates the public key that pins Paceline's development extension id.
// Only the public key is kept: Chrome needs nothing else to load an unpacked extension.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const keyPath = 'packages/extension/dev-key.txt';
const idsPath = 'packages/shared/src/extension-ids.json';

if (existsSync(keyPath) && !process.argv.includes('--force')) {
  console.error(`${keyPath} already exists. Pass --force to regenerate (this changes the dev extension id).`);
  process.exit(1);
}

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' });
const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');

mkdirSync('packages/extension', { recursive: true });
mkdirSync('packages/shared/src', { recursive: true });
writeFileSync(keyPath, `${der.toString('base64')}\n`);
writeFileSync(idsPath, `${JSON.stringify({ dev: id, store: null }, null, 2)}\n`);
console.log(`dev extension id: ${id}`);
