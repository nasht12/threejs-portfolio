// Save the X-ray's example transactions (real mainnet, so immutable once final) to public/web3/xray-examples.json.
// The page uses the saved copy for these hashes (instant, works offline, keeps CI off the network); any other hash is
// fetched live. Usage: node scripts/record-xray.mjs   (the hashes are EXAMPLES in src/web3/xray/examples.json)
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadXray } from '../src/web3/xray/load.js';

const root = join(import.meta.dirname, '..');
const examples = JSON.parse(await readFile(join(root, 'src/web3/xray/examples.json'), 'utf8'));
const data = {};
for (const { label, hash } of examples) {
  const d = await loadXray(hash);
  data[hash] = d;
  console.log(label.padEnd(24), hash.slice(0, 12), `${d.receipt.logs.length} logs`, d.trace ? 'trace' : 'NO TRACE', Object.keys(d.tokens).length, 'tokens');
}
const json = JSON.stringify(data);
await writeFile(join(root, 'public/web3/xray-examples.json'), json);
console.log(`wrote xray-examples.json, ${(json.length / 1024).toFixed(0)} KB`);
