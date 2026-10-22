import type { CompactBlock, TxTuple } from './rpc';

/*
 * EIP-1559 fee arithmetic, exactly as the protocol does it (integer wei, BigInt where products overflow 2^53).
 * Each block has a gas target of half its limit; the base fee moves by up to 1/8 toward balance every block,
 * and every unit of gas used burns the base fee. What a sender pays above it is the priority fee (the tip),
 * which goes to the block's builder.
 */

const DENOMINATOR = 8n;

export function nextBaseFee(b: Pick<CompactBlock, 'baseFee' | 'gasUsed' | 'gasLimit'>): number {
  const base = BigInt(b.baseFee), used = BigInt(b.gasUsed), target = BigInt(b.gasLimit) / 2n;
  if (target === 0n || used === target) return b.baseFee;
  if (used > target) {
    const delta = (base * (used - target)) / target / DENOMINATOR;
    return Number(base + (delta > 0n ? delta : 1n));
  }
  const delta = (base * (target - used)) / target / DENOMINATOR;
  return Number(base - delta);
}

/** ETH destroyed by this block: base fee x gas used (blob fees burn too, but are left out here). */
export const burnedWei = (b: Pick<CompactBlock, 'baseFee' | 'gasUsed'>) => BigInt(b.baseFee) * BigInt(b.gasUsed);

/** The tip per gas this transaction offers the builder at the given base fee (wei). */
export function tipPerGas(t: TxTuple, baseFee: number): number {
  const [, , , , , , , type, maxFee, maxPriority, gasPrice] = t;
  if (type >= 2) return Math.max(0, Math.min(maxPriority, maxFee - baseFee));
  return Math.max(0, gasPrice - baseFee);
}

/** Blob count from blob gas (each blob is 131072 blob-gas). */
export const blobCount = (b: Pick<CompactBlock, 'blobGasUsed'>) => Math.round(b.blobGasUsed / 131072);
