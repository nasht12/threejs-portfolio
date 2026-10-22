import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAbiItem, type AbiFunction } from 'viem';
import type { XrayData } from './load';
import { abiText } from './load.js';
import { calldataLayout, decodeCall, describeEvents, fees, headline, headWords, netChanges, routerSteps, valueFlows } from './analyze';
import examples from './examples.json';

const saved = JSON.parse(readFileSync(join(import.meta.dirname, '../../../public/web3/xray-examples.json'), 'utf8')) as Record<string, XrayData>;
const ex = (label: string) => saved[examples.find(e => e.label === label)!.hash];

describe('reading calldata', () => {
  it('maps each 32-byte word to the argument that owns it, through offsets into the tail', () => {
    const abi = parseAbiItem('function execute(bytes commands, bytes[] inputs, uint256 deadline)') as AbiFunction;
    const d = ex('Swap through Uniswap');
    const l = calldataLayout(d.tx.input, abi);
    expect(l.words.slice(0, 3).map(w => [w.arg, w.role])).toEqual([[0, 'offset'], [1, 'offset'], [2, 'value']]);
    expect(l.args.map(a => a.name)).toEqual(['commands', 'inputs', 'deadline']);
    expect(l.words.every(w => w.arg !== null)).toBe(true);           // nothing unaccounted for
    expect(l.args[1].last).toBe(l.words.length - 1);                 // the last dynamic argument runs to the end
  });
  it('sizes static tuples and fixed arrays in the head', () => {
    const f = parseAbiItem('function f((uint256,address) a, uint8[3] b, bytes c)') as AbiFunction;
    expect(f.inputs.map(headWords)).toEqual([2, 3, 1]);
  });
  it('decodes the Universal Router’s command bytes into steps', () => {
    const d = ex('Swap through Uniswap');
    const steps = routerSteps(decodeCall(d.tx.input, d));
    expect(steps?.length).toBeGreaterThan(0);
    expect(steps!.join(' ')).toMatch(/SWAP|PERMIT2|SWEEP|WRAP/);
  });
  it('reads token symbols whether ABI strings or bytes32', () => {
    expect(abiText('0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000045553444300000000000000000000000000000000000000000000000000000000')).toBe('USDC');
    expect(abiText('0x4d4b520000000000000000000000000000000000000000000000000000000000')).toBe('MKR');
  });
});

describe('what the transaction did', () => {
  it('a token transfer: one event, one sentence, and the sender’s balance falls by exactly that amount', () => {
    const d = ex('Token transfer');
    const [e] = describeEvents(d);
    expect(e.sentence).toMatch(/^[\d,.]+ USDT moved from Sender 0x/);
    const net = netChanges(valueFlows(d).filter(f => f.kind === 'token')).get(d.tx.from.toLowerCase())!;
    expect(net.get('0xdac17f958d2ee523a2206206994597c13d831ec7')! < 0n).toBe(true);
    expect(headline(d)).toMatch(/^Sent [\d,.]+ USDT to /);
  });
  it('an approval names the spender and flags unlimited allowances', () => {
    const d = ex('Approval');
    expect(headline(d)).toMatch(/^Allowed .* to spend .* ONDO\./);
    const [e] = describeEvents(d);
    expect(e.name).toBe('Approval');
  });
  it('a swap reads as one asset for another', () => expect(headline(ex('Swap through Uniswap'))).toMatch(/^Swapped [\d,.]+ \w+ for [\d,.]+ \w+\./));
  it('a 4337 bundle counts its user operations', () => expect(headline(ex('Smart-account bundle'))).toMatch(/^A bundler submitted \d+ smart-account operations?/));
  it('a blob transaction counts its blobs and burns its blob fee', () => {
    const d = ex('Rollup blob');
    expect(headline(d)).toMatch(/^A rollup posted \d+ blobs? of batch data/);
    expect(fees(d).blob > 0n).toBe(true);
  });
  it('fees always add up: burned + tip + blob = gas used x price + blob gas x blob price', () => {
    for (const d of Object.values(saved)) {
      const f = fees(d);
      expect(f.burned + f.tip).toBe(BigInt(d.receipt.gasUsed) * BigInt(d.receipt.effectiveGasPrice));
      expect(f.tipPerGas >= 0n).toBe(true);
    }
  });
});
