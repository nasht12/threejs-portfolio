import { create } from 'zustand';
import type { CompactBlock } from './rpc';
import { CATEGORIES, classify, type Category, type TxInfo } from './decode';
import { tipPerGas } from './fees';
import { poolPos } from './layout';
import type { Pool } from './pool';

/** A block as the page shows it: the chain's data plus what this page saw happen before it. */
export interface BlockView extends CompactBlock {
  info: TxInfo[];
  /** tip per gas offered to the builder, wei */
  tips: number[];
  /** ms each transaction waited in the public mempool before this block, or null if it was never seen there */
  seenFor: (number | null)[];
  seenCount: number;
  counts: Record<Category, number>;
  /** where each transaction flies in from: its spot in the pool, or NaN x for private order flow */
  origins: Float32Array;
  /** performance.now() when the block arrived */
  arrivedAt: number;
}

/** Match a new block against the pool: every transaction found there leaves it, and remembers where it was. */
export function blockView(b: CompactBlock, pool: Pool, now: number): BlockView {
  const n = b.txs.length;
  const origins = new Float32Array(n * 3);
  const seenFor: (number | null)[] = [], info: TxInfo[] = [], tips: number[] = [];
  const counts = Object.fromEntries(CATEGORIES.map(c => [c.id, 0])) as Record<Category, number>;
  const at: [number, number, number] = [0, 0, 0];
  let seenCount = 0;
  b.txs.forEach((tx, i) => {
    const p = pool.take(tx[0]);
    if (p) {
      poolPos(p.slot, (now - p.seen) / 1000, now / 1000, at);
      origins.set(at, i * 3);
      seenFor.push(now - p.seen);
      seenCount++;
    } else {
      origins[i * 3] = NaN;
      seenFor.push(null);
    }
    const c = classify(tx);
    info.push(c);
    counts[c.category]++;
    tips.push(tipPerGas(tx, b.baseFee));
  });
  return { ...b, info, tips, seenFor, seenCount, counts, origins, arrivedAt: now };
}

export type Status = 'connecting' | 'live' | 'replay';
/** What the legend highlights: one kind of transaction, or everything that never went through the public mempool. */
export type Focus = Category | 'private' | null;
export const KEEP_BLOCKS = 24;

interface Web3State {
  status: Status;
  source: string;
  note: string | null;
  /** newest first */
  blocks: BlockView[];
  pending: { count: number; rate: number };
  /** null block = follow the newest */
  selected: { block: number | null; tx: number | null };
  focus: Focus;
  hover: { block: number; tx: number; x: number; y: number } | null;
  announce: boolean;
  message: string;
  /** performance.now() when this page started watching the mempool (reset on replay loops) */
  watchingSince: number;

  setStatus: (status: Status, source: string, note?: string | null) => void;
  addBlock: (b: BlockView) => void;
  setPending: (count: number, rate: number) => void;
  reset: (listenedMs?: number) => void;
  selectBlock: (n: number | null) => void;
  selectTx: (block: number, tx: number | null) => void;
  setFocus: (c: Focus) => void;
  setHover: (h: Web3State['hover']) => void;
  setAnnounce: (on: boolean) => void;
}

export const pct = (b: Pick<BlockView, 'seenCount' | 'txs'>) => (b.txs.length ? Math.round((100 * b.seenCount) / b.txs.length) : 0);

export const createWeb3Store = () => create<Web3State>()((set, get) => ({
  status: 'connecting',
  source: '',
  note: null,
  blocks: [],
  pending: { count: 0, rate: 0 },
  selected: { block: null, tx: null },
  focus: null,
  hover: null,
  announce: false,
  message: '',
  watchingSince: 0,

  setStatus: (status, source, note = null) => set({ status, source, note }),

  addBlock: b => {
    const { blocks, selected, announce } = get();
    const replaced = blocks.some(x => x.number === b.number);
    const next = [b, ...blocks.filter(x => x.number !== b.number)].sort((x, y) => y.number - x.number).slice(0, KEEP_BLOCKS);
    const keepSel = selected.block === null || next.some(x => x.number === selected.block);
    const by = b.builder ? ` by ${b.builder}` : '';
    set({
      blocks: next,
      selected: keepSel ? selected : { block: null, tx: null },
      message: !announce ? get().message
        : replaced ? `Block ${b.number.toLocaleString('en-US')} was replaced by a competing block (a reorg).`
        : `Block ${b.number.toLocaleString('en-US')}${by}: ${b.txs.length} transactions, ${pct(b)}% seen in the public mempool first.`,
    });
  },

  setPending: (count, rate) => set({ pending: { count, rate } }),
  reset: (listenedMs = 0) => set({ blocks: [], pending: { count: 0, rate: 0 }, selected: { block: null, tx: null }, hover: null, watchingSince: performance.now() - listenedMs }),

  selectBlock: n => set({ selected: { block: n, tx: null } }),
  selectTx: (block, tx) => set({ selected: { block, tx } }),
  setFocus: c => set({ focus: c }),
  setHover: h => set({ hover: h }),
  setAnnounce: on => set({ announce: on, message: on ? 'New blocks will be announced.' : '' }),
}));

export const useWeb3 = createWeb3Store();

/** The block in the details panel: the selected one, or the newest. */
export const currentBlock = (s: Pick<Web3State, 'blocks' | 'selected'>) =>
  (s.selected.block === null ? s.blocks[0] : s.blocks.find(b => b.number === s.selected.block)) ?? null;
