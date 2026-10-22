import { createPool } from './pool';
import { blockView, useWeb3 } from './store';
import { startLive, startReplay, type Sink } from './source';

/** Chromebook tier: fewer pending transactions on screen. Same rule as the gallery's (cores and memory). */
const nav = navigator as Navigator & { deviceMemory?: number };
export const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || /[?&]quality=low/.test(location.search);

export const pool = createPool(LOW ? 1200 : 2400);
const MAX_PENDING_MS = 10 * 60_000;

/** Wire a source to the pool and the store. `?source=replay` forces the recording. Returns a stop function. */
export function startFeed(): () => void {
  const sink: Sink = {
    pending: (hash, age = 0) => { const now = performance.now(); pool.add(hash, now, now - age); },
    block: b => useWeb3.getState().addBlock(blockView(b, pool, performance.now())),
    status: (s, source, note) => useWeb3.getState().setStatus(s, source, note),
    reset: listened => { pool.clear(); useWeb3.getState().reset(listened); },
  };
  useWeb3.setState({ watchingSince: performance.now() });
  const replayUrl = import.meta.env.BASE_URL + 'web3/replay.json';
  let stop: () => void;
  if (/[?&]source=replay/.test(location.search)) stop = startReplay(sink, replayUrl);
  else stop = startLive(sink, () => { stop = startReplay(sink, replayUrl, 'Live nodes unreachable: showing a recording'); });

  const tick = setInterval(() => {
    const now = performance.now();
    pool.expire(now, MAX_PENDING_MS);
    useWeb3.getState().setPending(pool.size, pool.rate(now));
  }, 500);
  return () => { clearInterval(tick); stop(); };
}
