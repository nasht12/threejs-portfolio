import { decodeEventLog, decodeFunctionData, formatUnits, parseAbiItem, type AbiFunction, type AbiParameter, type Hex } from 'viem';
import type { CallFrame, RawLog, XrayData } from './load';
import { ADDRESS_BOOK, HANDLE_OPS, KNOWN_EVENTS, KNOWN_FUNCTIONS, ROUTER_COMMANDS, ROUTER_SELECTORS, TOPIC } from './known';
import { builderName } from '../rpc.js';
import { short } from '../decode';

/*
 * Pure analysis of one transaction: no fetching, no React. Every function here takes the XrayData from load.js and
 * returns something the page can draw, so all of it is unit-testable against the saved examples.
 */

const big = (h: string | null | undefined) => (h ? BigInt(h) : 0n);
const lower = (a: string | null | undefined) => (a ? a.toLowerCase() : '');
export const MAX_UINT = 2n ** 256n - 1n;

// ---- names ----------------------------------------------------------------------------------------------------

export interface Label { name: string; kind: 'sender' | 'builder' | 'known' | 'token' | 'contract' | 'address' | 'burn' }

export function labeller(d: XrayData) {
  const sender = lower(d.tx.from), builder = lower(d.block.miner), to = lower(d.tx.to);
  const builderTag = builderName(d.block.extraData);
  return (addr: string | null | undefined): Label => {
    const a = lower(addr);
    if (!a) return { name: 'new contract', kind: 'contract' };
    if (a === 'burn') return { name: 'burned', kind: 'burn' };
    if (a === sender) return { name: `Sender ${short(a)}`, kind: 'sender' };
    if (a === builder) return { name: `Builder${builderTag ? ` (${builderTag})` : ''}`, kind: 'builder' };
    if (ADDRESS_BOOK[a]) return { name: ADDRESS_BOOK[a], kind: a.startsWith('0x00000000000000000000') ? 'burn' : 'known' };
    if (d.tokens[a]) return { name: `${d.tokens[a].symbol} token`, kind: 'token' };
    // with calldata it ran code, so it's a contract; a plain ether transfer could be anyone's account
    if (a === to) return d.tx.input && d.tx.input !== '0x' ? { name: `Called contract ${short(a)}`, kind: 'contract' } : { name: `Recipient ${short(a)}`, kind: 'address' };
    return { name: short(a), kind: 'address' };
  };
}

// ---- the function called --------------------------------------------------------------------------------------

export interface DecodedCall {
  selector: Hex;
  /** text signature, e.g. transfer(address,uint256) */
  signature: string | null;
  /** where the name came from */
  source: 'built-in' | 'signature database' | null;
  abi: AbiFunction | null;
  args: readonly unknown[] | null;
}

export function functionAbi(selector: string, d: XrayData): { abi: AbiFunction | null; source: DecodedCall['source']; signature: string | null } {
  const known = KNOWN_FUNCTIONS.get(selector as Hex);
  if (known) return { abi: known, source: 'built-in', signature: `${known.name}(${known.inputs.map(i => typeString(i)).join(',')})` };
  const sig = d.signatures.functions[selector];
  if (!sig) return { abi: null, source: null, signature: null };
  try { return { abi: parseAbiItem(`function ${sig}`) as AbiFunction, source: 'signature database', signature: sig }; }
  catch { return { abi: null, source: 'signature database', signature: sig }; }
}

export function decodeCall(input: Hex, d: XrayData): DecodedCall | null {
  if (!input || input.length < 10) return null;
  const selector = input.slice(0, 10) as Hex;
  const { abi, source, signature } = functionAbi(selector, d);
  let args: readonly unknown[] | null = null;
  if (abi) { try { args = decodeFunctionData({ abi: [abi], data: input }).args ?? []; } catch { args = null; } }
  return { selector, signature, source, abi, args };
}

function typeString(p: AbiParameter): string {
  if (p.type.startsWith('tuple')) {
    const comps = (p as { components?: readonly AbiParameter[] }).components ?? [];
    return `(${comps.map(typeString).join(',')})${p.type.slice(5)}`;
  }
  return p.type;
}

// ---- calldata, word by word -----------------------------------------------------------------------------------

function components(p: AbiParameter) { return (p as { components?: readonly AbiParameter[] }).components ?? []; }
const arrayMatch = (t: string) => t.match(/^(.*)\[(\d*)\]$/);

export function isDynamic(p: AbiParameter): boolean {
  if (p.type === 'string' || p.type === 'bytes') return true;
  const m = arrayMatch(p.type);
  if (m) return m[2] === '' || isDynamic({ ...p, type: m[1] } as AbiParameter);
  if (p.type === 'tuple') return components(p).some(isDynamic);
  return false;
}
/** 32-byte words a parameter takes in the head of the encoding */
export function headWords(p: AbiParameter): number {
  if (isDynamic(p)) return 1;
  const m = arrayMatch(p.type);
  if (m) return Number(m[2]) * headWords({ ...p, type: m[1] } as AbiParameter);
  if (p.type === 'tuple') return components(p).reduce((s, c) => s + headWords(c), 0);
  return 1;
}

export interface Word { index: number; hex: string; arg: number | null; role: 'value' | 'offset' | 'data' }
export interface CalldataLayout { selector: string; words: Word[]; leftover: string; args: { name: string; type: string; dynamic: boolean; first: number; last: number }[] }

/**
 * Which argument owns each 32-byte word: static arguments sit in the head in order; a dynamic one leaves an offset in
 * the head and its data in the tail, from that offset up to the next dynamic argument's (or the end).
 */
export function calldataLayout(input: Hex, abi: AbiFunction | null): CalldataLayout {
  const body = input.slice(10);
  const n = Math.floor(body.length / 64);
  const words: Word[] = Array.from({ length: n }, (_, i) => ({ index: i, hex: body.slice(i * 64, i * 64 + 64), arg: null, role: 'data' as const }));
  const leftover = body.slice(n * 64);
  const args: CalldataLayout['args'] = [];
  if (!abi) return { selector: input.slice(0, 10), words, leftover, args };
  let w = 0;
  const tails: { arg: number; start: number }[] = [];
  abi.inputs.forEach((p, i) => {
    const size = headWords(p), dynamic = isDynamic(p);
    for (let k = w; k < Math.min(n, w + size); k++) { words[k].arg = i; words[k].role = dynamic ? 'offset' : 'value'; }
    if (dynamic && words[w]) tails.push({ arg: i, start: Number(BigInt('0x' + words[w].hex) / 32n) });
    args.push({ name: p.name || `arg ${i}`, type: typeString(p), dynamic, first: w, last: w + size - 1 });
    w += size;
  });
  tails.sort((a, b) => a.start - b.start);
  tails.forEach((t, k) => {
    const end = k + 1 < tails.length ? tails[k + 1].start : n;
    for (let j = Math.max(t.start, w); j < Math.min(end, n); j++) { words[j].arg = t.arg; words[j].role = 'data'; }
    const a = args[t.arg]; a.last = Math.max(a.last, Math.min(end, n) - 1);
  });
  return { selector: input.slice(0, 10), words, leftover, args };
}

/** Universal Router: the steps its `commands` bytes ask for. */
export function routerSteps(call: DecodedCall | null): string[] | null {
  if (!call || !ROUTER_SELECTORS.has(call.selector) || !call.args) return null;
  const commands = call.args[0] as Hex;
  const steps: string[] = [];
  for (let i = 2; i < commands.length; i += 2) {
    const b = parseInt(commands.slice(i, i + 2), 16);
    const name = ROUTER_COMMANDS[b & 0x3f] ?? `command 0x${(b & 0x3f).toString(16).padStart(2, '0')}`;
    steps.push(b & 0x80 ? `${name} (may fail)` : name);
  }
  return steps;
}

// ---- amounts --------------------------------------------------------------------------------------------------

/** Token amount for reading: two decimals in the thousands, four above one, a few significant digits below it. */
export function amount(v: bigint, decimals: number, maxDecimals?: number): string {
  const neg = v < 0n, s = formatUnits(neg ? -v : v, decimals);
  const [w, f = ''] = s.split('.');
  const max = maxDecimals ?? (BigInt(w) >= 1000n ? 2 : BigInt(w) >= 1n ? 4 : 6);
  const whole = BigInt(w).toLocaleString('en-US');
  let frac = f;
  if (BigInt(w) === 0n && f) { const first = f.search(/[1-9]/); frac = f.slice(0, Math.max(max, first + 3)); }
  else frac = f.slice(0, max);
  frac = frac.replace(/0+$/, '');
  return `${neg ? '−' : ''}${whole}${frac ? '.' + frac : ''}`;
}
export const eth = (wei: bigint, max = 6) => amount(wei, 18, max);

export function assetName(asset: string, d: XrayData) {
  if (asset === 'ETH') return 'ETH';
  const [addr, id] = asset.split('#');
  const t = d.tokens[addr];
  return id ? `${t?.symbol ?? short(addr)} #${id.length > 10 ? short(id, 6, 4) : id}` : t?.symbol ?? short(addr);
}
export function assetAmount(asset: string, v: bigint, d: XrayData) {
  if (asset === 'ETH') return eth(v);
  if (asset.includes('#')) return v.toString();
  return amount(v, d.tokens[asset]?.decimals ?? 0);
}

// ---- events ---------------------------------------------------------------------------------------------------

export interface EventView {
  index: number;
  address: string;
  name: string;
  /** a plain-language account, when the event is one this page understands */
  sentence: string | null;
  args: Record<string, unknown> | null;
  source: 'built-in' | 'signature database' | null;
  warn?: string;
  log: RawLog;
}

export function describeEvents(d: XrayData): EventView[] {
  const label = labeller(d);
  const who = (a: unknown) => label(String(a)).name;
  return d.receipt.logs.map((log, index) => {
    const t0 = log.topics[0];
    const abi = KNOWN_EVENTS.get(`${t0}/${log.topics.length}`);
    const base = { index, address: log.address, log };
    if (!abi) {
      const sig = t0 ? d.signatures.events[t0] : null;
      return { ...base, name: sig ? sig.split('(')[0] : 'Unknown event', sentence: null, args: null, source: sig ? 'signature database' as const : null };
    }
    let args: Record<string, unknown>;
    try { args = decodeEventLog({ abi: [abi], data: log.data, topics: log.topics as [Hex, ...Hex[]] }).args as Record<string, unknown>; }
    catch { return { ...base, name: abi.name, sentence: null, args: null, source: 'built-in' as const }; }
    const tok = d.tokens[log.address];
    const sym = tok?.symbol ?? short(log.address);
    let sentence: string | null = null, warn: string | undefined;
    const a = args as Record<string, bigint & string & boolean>;
    if (abi.name === 'Transfer' && 'value' in a) {
      const amt = `${amount(a.value, tok?.decimals ?? 0)} ${sym}`;
      sentence = lower(a.from) === ADDRESS_ZERO ? `${amt} minted to ${who(a.to)}` : lower(a.to) === ADDRESS_ZERO ? `${amt} burned from ${who(a.from)}` : `${amt} moved from ${who(a.from)} to ${who(a.to)}`;
    } else if (abi.name === 'Transfer') sentence = `NFT ${sym} #${a.tokenId} moved from ${who(a.from)} to ${who(a.to)}`;
    else if (abi.name === 'Approval') {
      const unlimited = a.value >= MAX_UINT / 2n;
      sentence = `${who(a.owner)} allowed ${who(a.spender)} to spend ${unlimited ? 'an unlimited amount of' : amount(a.value, tok?.decimals ?? 0)} ${sym}`;
      if (unlimited) warn = 'Unlimited approval: the spender can move all of this token from the owner, now or later, until it is revoked.';
    } else if (abi.name === 'ApprovalForAll') {
      sentence = `${who(a.owner)} ${a.approved ? 'allowed' : 'stopped'} ${who(a.operator)} ${a.approved ? 'to move every' : 'moving their'} ${sym} NFT`;
      if (a.approved) warn = 'Approval for all: the operator can move every NFT in this collection the owner holds.';
    } else if (abi.name === 'Deposit') sentence = `${eth(a.amount)} ETH wrapped into WETH for ${who(a.to)}`;
    else if (abi.name === 'Withdrawal') sentence = `${eth(a.amount)} WETH unwrapped back to ETH for ${who(a.from)}`;
    else if (abi.name === 'Swap' && 'id' in a) sentence = `Swap in a Uniswap v4 pool: the pool’s balance changed by ${signed(a.amount0)} of token 0 and ${signed(a.amount1)} of token 1 (raw units; positive is into the trader)`;
    else if (abi.name === 'Swap' && 'amount0In' in a) sentence = `Swap in a Uniswap v2-style pool ${short(log.address)}: in ${a.amount0In} / ${a.amount1In}, out ${a.amount0Out} / ${a.amount1Out} (raw units)`;
    else if (abi.name === 'Swap') sentence = `Swap in a Uniswap v3-style pool ${short(log.address)}: ${signed(a.amount0)} of token 0 and ${signed(a.amount1)} of token 1 (raw units; positive is into the pool)`;
    else if (abi.name === 'Sync') sentence = `Pool ${short(log.address)} recorded its new reserves`;
    else if (abi.name === 'UserOperationEvent') sentence = `Smart account ${short(String(a.sender))}’s operation ${a.success ? 'succeeded' : 'failed'}; it paid ${eth(a.actualGasCost)} ETH for gas${lower(a.paymaster) !== ADDRESS_ZERO ? `, sponsored by paymaster ${short(String(a.paymaster))}` : ''}`;
    else if (abi.name === 'BeforeExecution') sentence = 'The EntryPoint finished checking every operation and starts running them';
    else if (abi.name === 'TransferSingle') sentence = `${a.value} of ${sym} token #${a.id} moved from ${who(a.from)} to ${who(a.to)}`;
    return { ...base, name: abi.name, sentence, args, source: 'built-in' as const, warn };
  });
}
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const signed = (v: bigint) => (v > 0n ? `+${v.toLocaleString('en-US')}` : v.toLocaleString('en-US'));
const blobs = (d: XrayData) => d.tx.blobVersionedHashes?.length ?? 0;

// ---- value flow -----------------------------------------------------------------------------------------------

export interface Flow { from: string; to: string; asset: string; value: bigint; kind: 'value' | 'internal' | 'token' | 'nft' | 'wrap' | 'burn' | 'tip' }

function walkCalls(f: CallFrame | null, visit: (f: CallFrame, depth: number) => void, depth = 0) {
  if (!f || f.error) return;                                   // a reverted frame moved nothing, nor did its children
  visit(f, depth);
  for (const c of f.calls ?? []) walkCalls(c, visit, depth + 1);
}

export function fees(d: XrayData) {
  const gasUsed = big(d.receipt.gasUsed), price = big(d.receipt.effectiveGasPrice), base = big(d.block.baseFeePerGas);
  const burned = gasUsed * base, tip = gasUsed * (price - base);
  const blob = big(d.receipt.blobGasUsed) * big(d.receipt.blobGasPrice);
  return { gasUsed, gasLimit: big(d.tx.gas), price, base, tipPerGas: price - base, burned, tip, blob, total: burned + tip + blob };
}

export function valueFlows(d: XrayData): Flow[] {
  const flows: Flow[] = [];
  const ok = d.receipt.status === '0x1';
  const from = lower(d.tx.from);
  if (ok) {
    if (big(d.tx.value) > 0n) flows.push({ from, to: lower(d.tx.to ?? d.receipt.contractAddress), asset: 'ETH', value: big(d.tx.value), kind: 'value' });
    walkCalls(d.trace, (f, depth) => {
      if (depth === 0 || f.type === 'DELEGATECALL' || f.type === 'STATICCALL') return;
      const v = big(f.value);
      if (v > 0n) flows.push({ from: lower(f.from), to: lower(f.to), asset: 'ETH', value: v, kind: 'internal' });
    });
    for (const log of d.receipt.logs) {
      const t0 = log.topics[0], addr = log.address;
      const topicAddr = (i: number) => '0x' + log.topics[i].slice(26);
      if (t0 === TOPIC.transfer && log.topics.length === 3) flows.push({ from: topicAddr(1), to: topicAddr(2), asset: addr, value: big(log.data), kind: 'token' });
      else if (t0 === TOPIC.transfer && log.topics.length === 4) flows.push({ from: topicAddr(1), to: topicAddr(2), asset: `${addr}#${BigInt(log.topics[3])}`, value: 1n, kind: 'nft' });
      else if (t0 === TOPIC.deposit && log.topics.length === 2) flows.push({ from: ADDRESS_ZERO, to: topicAddr(1), asset: addr, value: big(log.data), kind: 'wrap' });
      else if (t0 === TOPIC.withdrawal && log.topics.length === 2) flows.push({ from: topicAddr(1), to: ADDRESS_ZERO, asset: addr, value: big(log.data), kind: 'wrap' });
    }
  }
  const f = fees(d);
  if (f.burned + f.blob > 0n) flows.push({ from, to: 'burn', asset: 'ETH', value: f.burned + f.blob, kind: 'burn' });
  if (f.tip > 0n) flows.push({ from, to: lower(d.block.miner), asset: 'ETH', value: f.tip, kind: 'tip' });
  return flows;
}

/** Net change per address per asset. */
export function netChanges(flows: Flow[]) {
  const net = new Map<string, Map<string, bigint>>();
  const add = (who: string, asset: string, v: bigint) => {
    if (!net.has(who)) net.set(who, new Map());
    const m = net.get(who)!; m.set(asset, (m.get(asset) ?? 0n) + v);
  };
  for (const f of flows) { add(f.from, f.asset, -f.value); add(f.to, f.asset, f.value); }
  for (const [who, m] of net) { for (const [a, v] of m) if (v === 0n) m.delete(a); if (!m.size) net.delete(who); }
  return net;
}

// ---- the headline ---------------------------------------------------------------------------------------------

export function headline(d: XrayData): string {
  const label = labeller(d);
  const call = decodeCall(d.tx.input, d);
  const f = fees(d);
  const costs = `It cost ${eth(f.total)} ETH: ${eth(f.burned + f.blob)} burned${f.tip > 0n ? ` and ${eth(f.tip)} to the builder` : ''}.`;
  if (d.receipt.status !== '0x1') {
    return `This transaction failed${d.trace?.error ? ` (${d.trace.error})` : ''}. Nothing it tried to do happened, but the sender still paid for the gas it used. ${costs}`;
  }
  const flows = valueFlows(d).filter(x => x.kind !== 'burn' && x.kind !== 'tip');
  const mine = netChanges(flows).get(lower(d.tx.from)) ?? new Map<string, bigint>();
  const list = (entries: [string, bigint][]) => entries.map(([a, v]) => `${assetAmount(a, v < 0n ? -v : v, d)} ${assetName(a, d)}`).join(' and ');
  const out = [...mine].filter(([, v]) => v < 0n), got = [...mine].filter(([, v]) => v > 0n);
  let what: string;
  if (!d.tx.to) what = `Deployed a new contract at ${short(d.receipt.contractAddress ?? '')}.`;
  else if (d.tx.type === '0x3') what = `A rollup posted ${blobs(d)} blob${blobs(d) === 1 ? '' : 's'} of batch data to Ethereum${call?.signature ? `, calling ${call.signature.split('(')[0]}` : ''}.`;
  else if (call && HANDLE_OPS.has(call.selector)) {
    const ops = d.receipt.logs.filter(l => l.topics[0] === TOPIC.userOp).length;
    what = `A bundler submitted ${ops} smart-account operation${ops === 1 ? '' : 's'} in one transaction.`;
  } else if (call?.abi?.name === 'approve' && call.args) {
    const v = call.args[1] as bigint, tok = d.tokens[lower(d.tx.to)];
    what = `Allowed ${label(String(call.args[0])).name} to spend ${v >= MAX_UINT / 2n ? 'an unlimited amount of' : amount(v, tok?.decimals ?? 0)} ${tok?.symbol ?? 'this token'}.`;
  } else if (out.length && got.length) what = `Swapped ${list(out)} for ${list(got)}.`;
  else if (out.length) {
    const asset = out[0][0];
    const rec = flows.filter(x => x.asset === asset && lower(x.from) === lower(d.tx.from)).map(x => x.to)[0];
    what = `Sent ${list(out)}${rec ? ` to ${label(rec).name}` : ''}.`;
  } else if (got.length) what = `Received ${list(got)}.`;
  else what = `Called ${call?.signature?.split('(')[0] ?? 'a function'} on ${label(d.tx.to).name}; the sender’s balances didn’t change.`;
  const pos = Number(d.tx.transactionIndex) + 1;
  return `${what} Included in block #${Number(d.block.number).toLocaleString('en-US')} as transaction ${pos} of ${d.block.txCount}. ${costs}`;
}

/** Count of call frames, by type, for the summary of the call tree. */
export function callStats(f: CallFrame | null) {
  const s = { frames: 0, depth: 0, reverted: 0 };
  const go = (x: CallFrame, depth: number) => {
    s.frames++; s.depth = Math.max(s.depth, depth); if (x.error) s.reverted++;
    for (const c of x.calls ?? []) go(c, depth + 1);
  };
  if (f) go(f, 0);
  return s;
}
