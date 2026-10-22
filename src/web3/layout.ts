/*
 * Every world-space number for the Web3 scene, and the maths that place things. Pure functions, so the pool, the
 * flights and the blocks agree on where a transaction is, and the layout can be unit-tested.
 *
 *   pool (left): pending transactions swirl in the public mempool; new ones arrive at the rim and drift inward with age
 *   chain (right): the newest block at the front, older ones receding back and to the right
 *   private relay: a point above the newest block, where transactions nobody saw in public drop in from
 */

export const POOL = { x: -5.4, z: -0.6, rim: 3.1, inner: 0.7, squash: 0.78 };
export const SLAB = 3.3;
export const CHAIN = { x: 1.2, z: 0.9, stepX: 3.8, stepZ: -3.7, keep: 7 };
export const PRIVATE = { x: CHAIN.x, y: 5.6, z: CHAIN.z + 1.2 };
export const CAMERA = { position: [-2.2, 10.5, 17.5] as const, target: [-1.0, 0, -1.6] as const, fov: 40 };

/** Where the block of a given age (0 = newest) sits on the chain. */
export function chainPos(rank: number): [number, number, number] {
  return [CHAIN.x + rank * CHAIN.stepX, 0, CHAIN.z + rank * CHAIN.stepZ];
}

/** Grid for n tiles on a slab, in block order (top of the block first, from the back-left corner). */
export function tileGrid(n: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cell = SLAB / cols;
  return { cols, cell, size: cell * 0.8 };
}
export function tileLocal(i: number, cols: number, cell: number): [number, number] {
  const c = i % cols, r = Math.floor(i / cols);
  return [-SLAB / 2 + (c + 0.5) * cell, -SLAB / 2 + (r + 0.5) * cell];
}

/** Tile height from its tip (gwei per gas): log scale, since tips range over five orders of magnitude. */
export const tipHeight = (tipGwei: number) => Math.min(1.25, 0.035 + 0.36 * Math.log10(1 + tipGwei * 4));

const hash01 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * A pending transaction's position in the pool: slot gives it a stable angle and jitter, age (seconds since it was
 * first seen) pulls it from the rim toward the middle, and t (seconds) turns the whole pool like a slow vortex.
 */
export function poolPos(slot: number, age: number, t: number, out: [number, number, number]) {
  const inward = 1 - Math.exp(-age / 75);
  const r = POOL.rim - (POOL.rim - POOL.inner) * inward + (hash01(slot) - 0.5) * 0.55;
  const a = slot * 2.399963 + t * (0.22 / (r + 0.6));
  out[0] = POOL.x + Math.cos(a) * r;
  out[1] = 0.16 + 0.07 * Math.sin(t * 1.3 + slot) + hash01(slot + 7) * 0.12;
  out[2] = POOL.z + Math.sin(a) * r * POOL.squash;
  return out;
}
