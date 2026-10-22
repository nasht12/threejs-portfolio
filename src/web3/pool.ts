/*
 * The public mempool as this page has seen it: transaction hashes our node announced, not yet in a block.
 * A fixed set of slots (each slot is one instance in the pool mesh), so nothing is allocated per transaction.
 * Lives outside React: it changes ~12 times a second and only the 3D pool reads it every frame.
 */

export interface Pending { hash: string; seen: number; slot: number }

export function createPool(capacity: number) {
  const byHash = new Map<string, Pending>();   // insertion order = oldest first
  const slots: (Pending | null)[] = new Array(capacity).fill(null);
  const free: number[] = [];
  for (let i = capacity - 1; i >= 0; i--) free.push(i);
  const arrivals: number[] = [];               // times of recent adds, for the rate

  function remove(p: Pending) {
    byHash.delete(p.hash);
    slots[p.slot] = null;
    free.push(p.slot);
  }

  return {
    capacity,
    slots,
    get size() { return byHash.size; },
    /** Seen for the first time at `seen` (ms; earlier than now for a recording's pre-filled pool). When full, the longest-waiting transaction makes room. */
    add(hash: string, now: number, seen = now) {
      if (byHash.has(hash)) return;
      if (!free.length) remove(byHash.values().next().value!);
      const p = { hash, seen, slot: free.pop()! };
      byHash.set(hash, p);
      slots[p.slot] = p;
      if (seen === now) arrivals.push(now);
    },
    /** A block included it: take it out, saying where it was and since when (or null: never seen in public). */
    take(hash: string): Pending | null {
      const p = byHash.get(hash);
      if (!p) return null;
      remove(p);
      return p;
    },
    /** Pending far longer than any block interval: replaced, dropped, or priced out. Let it go. */
    expire(now: number, maxAgeMs: number) {
      for (const p of byHash.values()) { if (now - p.seen < maxAgeMs) break; remove(p); }
    },
    /** Transactions seen per second over the last `windowMs`. */
    rate(now: number, windowMs = 10_000) {
      while (arrivals.length && now - arrivals[0] > windowMs) arrivals.shift();
      return arrivals.length / (windowMs / 1000);
    },
    clear() { for (const p of [...byHash.values()]) remove(p); arrivals.length = 0; },
  };
}
export type Pool = ReturnType<typeof createPool>;
