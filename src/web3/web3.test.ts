import { describe, expect, it } from 'vitest';
import { builderName, compactTx } from './rpc.js';
import type { TxTuple } from './rpc';
import { classify, formatEth, formatGwei } from './decode';
import { blobCount, burnedWei, nextBaseFee, tipPerGas } from './fees';
import { createPool } from './twelve/pool';
import { blockView, createWeb3Store, currentBlock, pct } from './twelve/store';
import { chainPos, tileGrid, tipHeight } from './twelve/layout';

const tx = (over: Partial<Record<number, unknown>> = {}): TxTuple => {
  const t: TxTuple = ['0xaa', '0xfrom', '0xto', '0x0', '', 0, 21000, 2, 30e9, 2e9, 0, 7];
  for (const [k, v] of Object.entries(over)) (t as unknown[])[Number(k)] = v;
  return t;
};
const block = (txs: TxTuple[], over = {}) => ({
  number: 100, hash: '0xb', parentHash: '0xa', timestamp: 1_700_000_000, builder: 'Titan', feeRecipient: '0xr',
  gasUsed: 15_000_000, gasLimit: 30_000_000, baseFee: 1e9, blobGasUsed: 0, txs, ...over,
});

describe('EIP-1559 fees', () => {
  it('moves the base fee up to 1/8 toward the 50% target', () => {
    expect(nextBaseFee({ baseFee: 1e9, gasUsed: 15e6, gasLimit: 30e6 })).toBe(1e9);
    expect(nextBaseFee({ baseFee: 1e9, gasUsed: 30e6, gasLimit: 30e6 })).toBe(1.125e9);   // full block: +12.5%
    expect(nextBaseFee({ baseFee: 1e9, gasUsed: 0, gasLimit: 30e6 })).toBe(0.875e9);      // empty block: -12.5%
    expect(nextBaseFee({ baseFee: 7, gasUsed: 15e6 + 1, gasLimit: 30e6 })).toBe(8);        // rising always moves by at least 1 wei
  });
  it('burns base fee x gas, exactly', () => {
    expect(burnedWei({ baseFee: 657_000_000, gasUsed: 28_042_986 })).toBe(657_000_000n * 28_042_986n);
  });
  it('pays the builder min(priority fee, max fee - base fee), or gas price - base fee for legacy', () => {
    expect(tipPerGas(tx({ 8: 30e9, 9: 2e9 }), 1e9)).toBe(2e9);
    expect(tipPerGas(tx({ 8: 2.5e9, 9: 2e9 }), 1e9)).toBe(1.5e9);     // capped by the max fee
    expect(tipPerGas(tx({ 7: 0, 10: 5e9 }), 1e9)).toBe(4e9);
    expect(tipPerGas(tx({ 7: 0, 10: 5e8 }), 1e9)).toBe(0);
  });
  it('counts blobs', () => expect(blobCount({ blobGasUsed: 6 * 131072 })).toBe(6));
});

describe('what a transaction is', () => {
  it('reads type, recipient and selector', () => {
    expect(classify(tx())).toEqual({ category: 'eth', action: 'ether transfer' });
    expect(classify(tx({ 4: '0xa9059cbb' })).category).toBe('token');
    expect(classify(tx({ 4: '0x095ea7b3' })).category).toBe('approval');
    expect(classify(tx({ 4: '0x3593564c' })).category).toBe('swap');
    expect(classify(tx({ 4: '0x765e827f' })).category).toBe('account');
    expect(classify(tx({ 7: 3, 4: '0x12345678' })).category).toBe('blob');
    expect(classify(tx({ 2: null, 4: '0x60806040' }))).toEqual({ category: 'other', action: 'contract deployment' });
    expect(classify(tx({ 4: '0xdeadbeef' }))).toEqual({ category: 'other', action: 'function 0xdeadbeef' });
  });
  it('compacts raw RPC transactions', () => {
    const t = compactTx({ hash: '0x1', from: '0xf', to: undefined, value: '0xde0b6b3a7640000', input: '0xa9059cbb' + '00'.repeat(64), gas: '0x5208', type: '0x2', maxFeePerGas: '0x3b9aca00', maxPriorityFeePerGas: '0x1', nonce: '0x9' });
    expect(t).toEqual(['0x1', '0xf', null, '0xde0b6b3a7640000', '0xa9059cbb', 68, 21000, 2, 1e9, 1, 0, 9]);
  });
  it('names builders from extraData', () => {
    expect(builderName('0x546974616e2028746974616e6275696c6465722e78797a29')).toBe('Titan (titanbuilder.xyz)');
    expect(builderName('0x')).toBeNull();
    expect(builderName('0xd883010e0c846765746888676f312e32322e33856c696e7578')).toMatch(/geth/);
  });
  it('formats ETH and gwei readably', () => {
    expect(formatEth('0xde0b6b3a7640000')).toBe('1');
    expect(formatEth(18_400_000_000_000_000n)).toBe('0.0184');
    expect(formatEth(12_000_000_000n)).toBe('0.000000012');
    expect(formatGwei(657_000_000)).toBe('0.657');
    expect(formatGwei(27_500_000_000)).toBe('27.5');
  });
});

describe('the pool', () => {
  it('keeps each hash once, takes it out when included, and evicts the oldest when full', () => {
    const p = createPool(3);
    p.add('a', 0); p.add('a', 5); p.add('b', 10); p.add('c', 20);
    expect(p.size).toBe(3);
    p.add('d', 30);                                         // full: 'a' (oldest) makes room
    expect(p.take('a')).toBeNull();
    expect(p.take('b')).toMatchObject({ hash: 'b', seen: 10 });
    expect(p.size).toBe(2);
    p.expire(10_000, 9_975);                                // c (age 9980) goes, d (9970) stays
    expect(p.size).toBe(1);
  });
  it('rates only live arrivals, not a recording’s pre-filled pool', () => {
    const p = createPool(10);
    p.add('old', 1000, 0); p.add('new', 1000);
    expect(p.rate(1000, 1000)).toBe(1);
  });
});

describe('the store', () => {
  it('matches a block against the pool: who waited in public, who arrived privately', () => {
    const p = createPool(10);
    p.add('0x1', 0);
    const v = blockView(block([tx({ 0: '0x1' }), tx({ 0: '0x2', 4: '0xa9059cbb' })]), p, 4000);
    expect(v.seenFor).toEqual([4000, null]);
    expect(v.seenCount).toBe(1);
    expect(Number.isNaN(v.origins[0])).toBe(false);
    expect(Number.isNaN(v.origins[3])).toBe(true);
    expect(v.counts).toMatchObject({ eth: 1, token: 1 });
    expect(pct(v)).toBe(50);
    expect(p.size).toBe(0);
  });
  it('keeps blocks newest first, replaces a reorged block, and follows the newest unless one is picked', () => {
    const s = createWeb3Store();
    const pool = createPool(4);
    s.getState().addBlock(blockView(block([tx()], { number: 1, hash: '0x1' }), pool, 0));
    s.getState().addBlock(blockView(block([tx()], { number: 2, hash: '0x2' }), pool, 0));
    expect(currentBlock(s.getState())?.number).toBe(2);
    s.getState().selectBlock(1);
    expect(currentBlock(s.getState())?.number).toBe(1);
    s.getState().addBlock(blockView(block([tx(), tx()], { number: 2, hash: '0x2b' }), pool, 0));
    expect(s.getState().blocks.map(b => b.hash)).toEqual(['0x2b', '0x1']);   // the competing block replaced the first
  });
});

describe('layout', () => {
  it('fits any block on its slab and keeps tips readable across five orders of magnitude', () => {
    expect(tileGrid(400).cols).toBe(20);
    expect(tipHeight(0)).toBeGreaterThan(0);
    expect(tipHeight(1)).toBeLessThan(tipHeight(10));
    expect(tipHeight(1e6)).toBe(1.25);
    expect(chainPos(1)[0]).toBeGreaterThan(chainPos(0)[0]);
  });
});
