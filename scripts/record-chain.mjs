// Record a few minutes of Ethereum mainnet for the Web3 page's replay mode (used offline, in CI, and whenever the
// live nodes can't be reached). Read-only: it only subscribes to public data.
// Usage: node scripts/record-chain.mjs [blocks=12]   ->   public/web3/replay.json
//
// Format (kept small: replay only needs identity for pending transactions that never land):
//   pending: [[msFromStart, ref], …]   ref = "block.tx" index into `blocks` if it was included, or 0 if it never was
//   blocks:  [{ at: msFromStart, ...the same compact block the live page builds }]
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compactBlock } from '../src/web3/rpc.js';

const WANT = Number(process.argv[2] ?? 12);
const WARMUP_MS = 25_000;   // let the pool fill first, so the first block's "seen" share isn't understated
const URL = 'wss://ethereum-rpc.publicnode.com';

const ws = new WebSocket(URL);
const t0 = Date.now();
const pendingAt = new Map();                 // hash -> ms
const blocks = [];
let id = 10;

ws.onopen = () => {
  ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newPendingTransactions'] }));
  ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_subscribe', params: ['newHeads'] }));
  console.log('recording from', URL);
};
ws.onerror = e => { console.error('socket error', e.message ?? e.type); process.exit(1); };
ws.onmessage = async e => {
  const m = JSON.parse(e.data);
  if (m.method === 'eth_subscription') {
    const r = m.params.result;
    if (typeof r === 'string') { if (!pendingAt.has(r)) pendingAt.set(r, Date.now() - t0); }
    else if (Date.now() - t0 > WARMUP_MS) ws.send(JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'eth_getBlockByNumber', params: [r.number, true] }));
    return;
  }
  if (!m.result?.transactions) return;
  blocks.push({ at: Date.now() - t0, ...compactBlock(m.result) });
  console.log('block', blocks.at(-1).number, blocks.at(-1).txs.length, 'txs');
  if (blocks.length >= WANT) await finish();
};

async function finish() {
  ws.close();
  const start = blocks[0].at - 9_000;        // replay opens 9 s before the first block, with the pool already full
  const index = new Map();
  blocks.forEach((b, bi) => b.txs.forEach((t, ti) => index.set(t[0], `${bi}.${ti}`)));
  const pending = [];
  for (const [hash, at] of pendingAt) {
    if (at > blocks.at(-1).at) continue;
    pending.push([at - start, index.get(hash) ?? 0]);   // negative: already waiting when the replay opens
  }
  pending.sort((a, b) => a[0] - b[0]);
  const out = {
    chain: 'Ethereum mainnet',
    source: 'ethereum-rpc.publicnode.com',
    recordedAt: new Date(t0).toISOString(),
    warmupMs: start,
    pending,
    blocks: blocks.map(b => ({ ...b, at: b.at - start })),
  };
  const dir = join(import.meta.dirname, '..', 'public', 'web3');
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(out);
  await writeFile(join(dir, 'replay.json'), json);
  console.log(`wrote replay.json: ${blocks.length} blocks, ${pending.length} pending, ${(json.length / 1024).toFixed(0)} KB`);
  process.exit(0);
}
