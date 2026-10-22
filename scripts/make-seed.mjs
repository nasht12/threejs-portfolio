// Twelve Seconds' warm start: the recording's first block, plus the pending transactions around it, so the page
// draws a real (clearly labelled) block before the live node answers. Derived from public/web3/replay.json, so run it
// after scripts/record-chain.mjs. Writes src/web3/twelve/seed.json (bundled: it must be there on the first frame).
//
//   seen:    transactions of that block that the recorder saw pending, with how long they had waited (ms)
//   preview: five that were still pending at that moment (they land in the next block), shown in the pool until live
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const replay = JSON.parse(await readFile(join(root, 'public/web3/replay.json'), 'utf8'));
const { at, ...block } = replay.blocks[0];
const waiting = replay.pending.filter(([t]) => t <= at);
const seen = waiting.filter(([, ref]) => ref && ref.startsWith('0.')).map(([t, ref]) => [block.txs[Number(ref.split('.')[1])][0], at - t]);
const preview = waiting.filter(([, ref]) => ref && ref.startsWith('1.')).slice(0, 5)
  .map(([t, ref]) => [replay.blocks[1].txs[Number(ref.split('.')[1])][0], at - t]);
const out = { recordedAt: replay.recordedAt, block, seen, preview };
await writeFile(join(root, 'src/web3/twelve/seed.json'), JSON.stringify(out));
console.log(`seed: block ${block.number}, ${block.txs.length} txs, ${seen.length} seen pending, ${preview.length} preview pending`);
