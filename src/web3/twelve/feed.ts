import { createPool } from './pool';
import { blockView, useWeb3 } from './store';
import { startLive, startReplay, type Sink } from './source';
import type { CompactBlock } from '../rpc';
import SEED from './seed.json';

/** Chromebook tier: fewer pending transactions on screen. Same rule as the gallery's (cores and memory). */
const nav = navigator as Navigator & { deviceMemory?: number };
export const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || /[?&]quality=low/.test(location.search);

export const pool = createPool(LOW ? 1200 : 2400);
const MAX_PENDING_MS = 10 * 60_000;

/**
 * Warm start: draw the recording's first block (scripts/make-seed.mjs) at once, its pending transactions flying in, and
 * a few that were still waiting in the pool, labelled as a preview until the first live block replaces them.
 */
function warmStart() {
  const now = performance.now();
  for (const [hash, age] of SEED.seen as [string, number][]) pool.add(hash, now, now - age);
  useWeb3.getState().addBlock(blockView(SEED.block as CompactBlock, pool, now));
  pool.clear();
  for (const [hash, age] of SEED.preview as [string, number][]) pool.add(hash, now, now - age);
  useWeb3.setState({ warmStart: true });
  useWeb3.getState().setPending(pool.size, 0);
}

/** Wire a source to the pool and the store. `?source=replay` forces the recording. Returns a stop function. */
export function startFeed(): () => void {
  const replayOnly = /[?&]source=replay/.test(location.search);
  let warm = !replayOnly;
  if (warm) warmStart();
  const endWarm = () => {
    if (!warm) return;
    warm = false;
    for (const [hash] of SEED.preview as [string, number][]) pool.take(hash);
    useWeb3.setState({ blocks: [], warmStart: false });
  };
  const sink: Sink = {
    pending: (hash, age = 0) => { const now = performance.now(); pool.add(hash, now, now - age); },
    block: b => {
      // the block asked for on connect can also arrive from the subscription: matching it twice would find its
      // transactions already gone from the pool and overwrite it as "never public"
      if (useWeb3.getState().blocks.some(x => x.hash === b.hash)) return;
      endWarm();
      useWeb3.getState().addBlock(blockView(b, pool, performance.now()));
    },
    status: (s, source, note) => useWeb3.getState().setStatus(s, source, note),
    reset: listened => { warm = false; pool.clear(); useWeb3.getState().reset(listened); useWeb3.setState({ warmStart: false }); },
  };
  useWeb3.setState({ watchingSince: performance.now() });
  const replayUrl = import.meta.env.BASE_URL + 'web3/replay.json';
  let stop: () => void;
  if (replayOnly) stop = startReplay(sink, replayUrl);
  else stop = startLive(sink, () => { stop = startReplay(sink, replayUrl, 'Live nodes unreachable: showing a recording'); });

  const tick = setInterval(() => {
    const now = performance.now();
    pool.expire(now, MAX_PENDING_MS);
    useWeb3.getState().setPending(pool.size, pool.rate(now));
  }, 500);
  return () => { clearInterval(tick); stop(); };
}
