import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AbiParameter } from 'viem';
import { loadXray, type CallFrame, type XrayData } from './load.js';
import {
  assetAmount, assetName, calldataLayout, callStats, decodeCall, describeEvents, eth, fees, functionAbi, headline,
  labeller, netChanges, routerSteps, valueFlows, type Flow,
} from './analyze';
import { CATEGORIES, TX_TYPES, short } from '../decode';
import { builderName } from '../rpc.js';
import EXAMPLES from './examples.json';

const ETHERSCAN = 'https://etherscan.io';
const BASE = import.meta.env.BASE_URL;
const n = (v: number | bigint) => v.toLocaleString('en-US');
const gwei = (wei: bigint) => { const g = Number(wei) / 1e9; return g < 0.01 ? g.toPrecision(2) : g < 100 ? g.toFixed(3).replace(/\.?0+$/, '') : Math.round(g).toLocaleString('en-US'); };
/** Argument colours: the validated categorical order, never cycled; past eight, arguments go grey. */
const ARG_COLORS = CATEGORIES.slice(0, 7).map(c => c.color);
const argColor = (i: number | null) => (i === null ? '#c9c4b9' : ARG_COLORS[i] ?? '#9b9a94');

type State = { status: 'idle' } | { status: 'loading'; hash: string } | { status: 'ready'; data: XrayData } | { status: 'error'; hash: string; message: string };

let savedExamples: Promise<Record<string, XrayData>> | null = null;
async function fetchXray(hash: string): Promise<XrayData> {
  const h = hash.toLowerCase();
  if (EXAMPLES.some(e => e.hash === h)) {
    savedExamples ??= fetch(`${BASE}web3/xray-examples.json`).then(r => r.json());
    const d = (await savedExamples)[h];
    if (d) return d;
  }
  return loadXray(h);
}

const params = () => new URLSearchParams(location.search);

export default function App() {
  const [hash, setHash] = useState(() => params().get('tx') ?? '');
  const [state, setState] = useState<State>({ status: 'idle' });
  const seen = params().get('seen');

  useEffect(() => {
    const onPop = () => setHash(params().get('tx') ?? '');
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!hash) { setState({ status: 'idle' }); return; }
    let live = true;
    setState({ status: 'loading', hash });
    fetchXray(hash.trim())
      .then(data => { if (live) setState({ status: 'ready', data }); })
      .catch((e: Error) => { if (live) setState({ status: 'error', hash, message: e.message || 'The nodes did not answer. Try again in a moment.' }); });
    return () => { live = false; };
  }, [hash]);

  const go = (h: string) => {
    const q = new URLSearchParams({ tx: h.trim() });
    history.pushState(null, '', `?${q}`);
    setHash(h.trim());
    scrollTo({ top: 0 });
  };

  return (
    <div className="xr">
      <header className="xr-head">
        <a className="xr-back" href={`${BASE}web3/`}>← Web3</a>
        <h1>Transaction X-ray</h1>
        <p className="xr-lede">Any Ethereum transaction, taken apart layer by layer: what was signed, what it asked for, what ran, what it announced, where value moved, and what it cost. Read-only, from public nodes.</p>
        <HashForm initial={hash} onSubmit={go} />
        <div className="xr-examples" role="group" aria-label="Examples">
          <span className="xr-muted">Try:</span>
          {EXAMPLES.map(e => (
            <button key={e.hash} type="button" aria-pressed={hash.toLowerCase() === e.hash} onClick={() => go(e.hash)}>{e.label}</button>
          ))}
        </div>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {state.status === 'loading' ? 'Loading the transaction…' : state.status === 'ready' ? 'Transaction loaded.' : state.status === 'error' ? state.message : ''}
      </p>
      {state.status === 'loading' && <p className="xr-loading">Reading {short(state.hash, 10, 8)} from the chain…</p>}
      {state.status === 'error' && <p className="xr-error" role="alert">{state.message}</p>}
      {state.status === 'ready' && <Xray d={state.data} seen={state.data.tx.hash.toLowerCase() === hash.toLowerCase() ? seen : null} />}
    </div>
  );
}

function HashForm({ initial, onSubmit }: { initial: string; onSubmit: (h: string) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const valid = /^0x[0-9a-fA-F]{64}$/.test(v.trim());
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) onSubmit(v); };
  return (
    <form className="xr-form" onSubmit={submit}>
      <label htmlFor="tx">Transaction hash</label>
      <div>
        <input id="tx" value={v} onChange={e => setV(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off"
          aria-invalid={v.length > 0 && !valid} aria-describedby="tx-help" />
        <button type="submit" disabled={!valid}>X-ray</button>
      </div>
      <p id="tx-help" className="xr-muted">0x followed by 64 hex characters, from any Ethereum mainnet transaction.</p>
    </form>
  );
}

const LAYERS = [
  ['envelope', 'The signed envelope'],
  ['calldata', 'What it asks for'],
  ['calls', 'What ran'],
  ['events', 'What it announced'],
  ['value', 'Where value moved'],
  ['fees', 'What it cost'],
] as const;

function Xray({ d, seen }: { d: XrayData; seen: string | null }) {
  const ok = d.receipt.status === '0x1';
  const block = Number(d.block.number);
  return (
    <div className="xr-body">
      <nav className="xr-nav" aria-label="Layers">
        <ol>{LAYERS.map(([id, name], i) => <li key={id}><a href={`#${id}`}><span>{i + 1}</span>{name}</a></li>)}</ol>
      </nav>
      <main>
        <section className="xr-summary" aria-label="Summary">
          <p className={`xr-pill ${ok ? 'is-ok' : 'is-fail'}`}><span aria-hidden="true">{ok ? '✓' : '✕'}</span>{ok ? 'Succeeded' : 'Failed'}</p>
          <p className="xr-headline">{headline(d)}</p>
          <p className="xr-meta">
            <a href={`${ETHERSCAN}/tx/${d.tx.hash}`} target="_blank" rel="noopener" className="mono">{short(d.tx.hash, 10, 8)}</a>
            <span> · block <a href={`${ETHERSCAN}/block/${block}`} target="_blank" rel="noopener">#{n(block)}</a></span>
            <span> · {new Date(Number(d.block.timestamp) * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })}</span>
          </p>
          {seen && (
            <p className={`xr-seen ${seen === 'private' ? 'is-private' : ''}`}>
              {seen === 'private'
                ? 'Twelve Seconds never saw this one in the public mempool: it reached the builder through private order flow.'
                : `Twelve Seconds saw it wait ${(Number(seen) / 1000).toFixed(1)} s in the public mempool before this block took it.`}
            </p>
          )}
        </section>
        <Envelope d={d} />
        <Calldata d={d} />
        <Calls d={d} />
        <Events d={d} />
        <Value d={d} />
        <Fees d={d} />
      </main>
    </div>
  );
}

function Layer({ id, n: num, title, intro, children }: { id: string; n: number; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section id={id} className="xr-layer" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}><span className="xr-num">{num}</span>{title}</h2>
      <p className="xr-intro">{intro}</p>
      {children}
    </section>
  );
}

/** An address with its role. `plain` inside other controls (a button, a <summary>), where a link can't nest. */
function Addr({ a, d, plain = false }: { a: string | null | undefined; d: XrayData; plain?: boolean }) {
  const label = labeller(d);
  if (!a) return <span>new contract</span>;
  const l = label(a);
  return (
    <span className="xr-addr">
      {plain ? <span className="mono">{short(a)}</span> : <a className="mono" href={`${ETHERSCAN}/address/${a}`} target="_blank" rel="noopener">{short(a)}</a>}
      {l.kind !== 'address' && <span className="xr-tag">{l.name.replace(/ 0x.*$/, '')}</span>}
    </span>
  );
}

// ---- 1. envelope ----------------------------------------------------------------------------------------------

function Envelope({ d }: { d: XrayData }) {
  const t = d.tx, type = Number(t.type);
  const rows: [string, React.ReactNode, string][] = [
    ['Type', TX_TYPES[type] ?? `type ${type}`, type === 2 ? 'Pays a base fee that is burned plus a tip for the builder, capped at a maximum the sender chose.' : type === 3 ? 'Carries blobs: big, cheap, temporary data for rollups, priced in a separate fee market.' : type === 4 ? 'Lets an ordinary account delegate to contract code (EIP-7702).' : 'Pays one gas price; what is above the base fee goes to the builder.'],
    ['Chain', t.chainId ? `${Number(t.chainId)} (Ethereum mainnet)` : 'none', 'The chain id is signed in, so the same transaction can’t be replayed on another chain (EIP-155).'],
    ['Nonce', n(Number(t.nonce)), 'This sender’s transaction count. Each nonce can be used once, so one account’s transactions land in order.'],
    ['From', <Addr a={t.from} d={d} />, 'Not in the signed data: it is recovered from the signature below. Only the holder of the private key could have produced it.'],
    ['To', <Addr a={t.to} d={d} />, t.to ? 'The account or contract the transaction is addressed to.' : 'No recipient: the calldata is code, and the transaction creates a contract.'],
    ['Value', `${eth(BigInt(t.value))} ETH`, 'Ether sent along with the call.'],
    ['Gas limit', n(BigInt(t.gas)), 'The most work the sender will pay for. Unused gas is not charged.'],
  ];
  if (t.maxFeePerGas) {
    rows.push(['Max fee', `${gwei(BigInt(t.maxFeePerGas))} gwei per gas`, 'The most the sender will pay per unit of gas, base fee included.']);
    rows.push(['Max tip', `${gwei(BigInt(t.maxPriorityFeePerGas ?? '0x0'))} gwei per gas`, 'The most of that which goes to the builder. This is what buys a place in the block.']);
  } else if (t.gasPrice) rows.push(['Gas price', `${gwei(BigInt(t.gasPrice))} gwei per gas`, 'One price per gas; everything above the base fee is the tip.']);
  if (t.accessList?.length) rows.push(['Access list', `${t.accessList.length} contracts, ${t.accessList.reduce((s, a) => s + a.storageKeys.length, 0)} storage slots`, 'Declared up front so reading them later is cheaper (EIP-2930).']);
  if (t.blobVersionedHashes?.length) rows.push(['Blobs', `${t.blobVersionedHashes.length} × 128 KB`, 'Only these hashes are signed and kept forever; the blob data itself is kept by nodes for about 18 days.']);
  if (t.maxFeePerBlobGas) rows.push(['Max blob fee', `${gwei(BigInt(t.maxFeePerBlobGas))} gwei per blob gas`, 'Blob space has its own base fee, burned like the regular one.']);
  rows.push(['Signature', <span className="mono">y={Number(t.yParity ?? t.v) % 2} r={short(t.r, 8, 6)} s={short(t.s, 8, 6)}</span>, 'An ECDSA signature over everything above. Change one byte and it no longer matches.']);
  return (
    <Layer id="envelope" n={1} title="The signed envelope" intro="Everything the sender signed. Nobody, not even the block’s builder, can change any of it without breaking the signature.">
      <dl className="xr-fields">
        {rows.map(([k, v, note]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd><dd className="xr-note">{note}</dd></div>
        ))}
      </dl>
    </Layer>
  );
}

// ---- 2. calldata ----------------------------------------------------------------------------------------------

function fmtArg(v: unknown, p: AbiParameter | undefined, d: XrayData, depth = 0): React.ReactNode {
  if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) return <Addr a={v} d={d} plain />;   // drawn inside a button
  if (typeof v === 'bigint') {
    const tok = d.tokens[(d.tx.to ?? '').toLowerCase()];
    if (tok && p && /amount|value|wad/i.test(p.name ?? '')) return `${assetAmount((d.tx.to ?? '').toLowerCase(), v, d)} ${tok.symbol}`;
    if (v > 10n ** 30n) return <span className="mono">{v.toString().slice(0, 18)}… ({v.toString().length} digits)</span>;
    return n(v);
  }
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string' && v.startsWith('0x')) {
    const bytes = (v.length - 2) / 2;
    return <span className="mono">{bytes <= 32 ? v : `${v.slice(0, 18)}… (${n(bytes)} bytes)`}</span>;
  }
  if (Array.isArray(v)) {
    if (depth > 1) return `[${v.length} items]`;
    return <span>[{v.length} item{v.length === 1 ? '' : 's'}] {v.slice(0, 3).map((x, i) => <span key={i} className="xr-item">{fmtArg(x, undefined, d, depth + 1)}</span>)}{v.length > 3 ? ' …' : ''}</span>;
  }
  if (v && typeof v === 'object') {
    if (depth > 1) return '{…}';
    return <span>{Object.entries(v).slice(0, 6).map(([k, x]) => <span key={k} className="xr-item"><em>{k}</em> {fmtArg(x, undefined, d, depth + 1)}</span>)}</span>;
  }
  return String(v);
}

const WORDS_SHOWN = 40;

function Calldata({ d }: { d: XrayData }) {
  const call = useMemo(() => decodeCall(d.tx.input, d), [d]);
  const layout = useMemo(() => calldataLayout(d.tx.input, call?.abi ?? null), [d, call]);
  const steps = routerSteps(call);
  // hovering or focusing an argument shows its words; clicking pins it
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hover ?? pinned;
  const [all, setAll] = useState(false);
  const intro = 'The first four bytes pick the function: they are the start of the hash of its name and argument types. The rest are the arguments in 32-byte words. A dynamic value (bytes, arrays) leaves an offset that points further down, where its data starts.';
  if (!call) {
    return (
      <Layer id="calldata" n={2} title="What it asks for" intro={intro}>
        <p className="xr-empty">{d.tx.to ? 'No calldata: a plain ether transfer, so no contract code was asked to run.' : 'The calldata is the new contract’s creation code.'}</p>
      </Layer>
    );
  }
  const words = all ? layout.words : layout.words.slice(0, WORDS_SHOWN);
  return (
    <Layer id="calldata" n={2} title="What it asks for" intro={intro}>
      <p className="xr-fn">
        <span className="mono xr-selector">{call.selector}</span>
        {call.signature ? <span className="mono">{call.signature}</span> : <span className="xr-muted">unknown function: its name isn’t in any public signature database</span>}
        {call.source && <span className="xr-source">{call.source === 'built-in' ? 'known to this page' : 'name from Sourcify’s signature database (unverified)'}</span>}
      </p>
      {steps && (
        <div className="xr-steps" aria-label="Universal Router steps">
          <span className="xr-muted">Router steps, from its <em>commands</em> bytes:</span>
          <ol>{steps.map((s, i) => <li key={i} className="mono">{s}</li>)}</ol>
        </div>
      )}
      <div className="xr-cd">
        <ol className="xr-args" aria-label="Decoded arguments">
          {layout.args.map((a, i) => (
            <li key={i}>
              <button type="button" aria-pressed={pinned === i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => setPinned(pinned === i ? null : i)}>
                <span className="sw" style={{ background: argColor(i) }} aria-hidden="true" />
                <span className="xr-argname">{a.name} <span className="mono xr-muted">{a.type}</span></span>
                <span className="xr-argval">{call.args ? fmtArg(call.args[i], call.abi?.inputs[i], d) : <span className="xr-muted">not decoded</span>}</span>
                <span className="xr-muted xr-argwords">words {a.first}–{a.last}{a.dynamic ? ' (offset, then data)' : ''}</span>
              </button>
            </li>
          ))}
          {!call.abi && <li className="xr-muted">Without the function’s signature the words can’t be assigned to arguments.</li>}
        </ol>
        <div className="xr-words" aria-label={`Calldata: ${n(layout.words.length)} words of 32 bytes`}>
          <div className="xr-word is-selector"><span className="xr-off">sel</span><code>{call.selector.slice(2)}</code><span className="xr-wnote">function selector</span></div>
          {words.map(w => (
            <div key={w.index} className={`xr-word ${active !== null && w.arg === active ? 'is-active' : ''} ${active !== null && w.arg !== active ? 'is-dim' : ''}`}
              style={{ borderLeftColor: argColor(w.arg) }}>
              <span className="xr-off">{(w.index * 32).toString(16).padStart(4, '0')}</span>
              <code>{w.hex.match(/.{8}/g)!.join(' ')}</code>
              <span className="xr-wnote">{w.arg !== null ? `${layout.args[w.arg]?.name}${w.role === 'offset' ? ' → offset' : w.role === 'data' ? ' data' : ''}` : ''}</span>
            </div>
          ))}
          {layout.words.length > WORDS_SHOWN && (
            <button type="button" className="xr-more" onClick={() => setAll(!all)}>
              {all ? 'Show fewer words' : `Show all ${n(layout.words.length)} words (${n(layout.words.length * 32 + 4)} bytes)`}
            </button>
          )}
        </div>
      </div>
    </Layer>
  );
}

// ---- 3. calls -------------------------------------------------------------------------------------------------

const MAX_FRAMES = 400;

function Calls({ d }: { d: XrayData }) {
  const stats = callStats(d.trace);
  const intro = 'Contracts calling contracts. CALL can move ether; STATICCALL only reads; DELEGATECALL runs another contract’s code on the caller’s own storage, which is how proxies and smart wallets work. A failed call reverts everything beneath it.';
  if (!d.trace) {
    return <Layer id="calls" n={3} title="What ran" intro={intro}><p className="xr-empty">The call tree isn’t available right now: it needs a node that offers execution traces, and none answered.</p></Layer>;
  }
  let budget = MAX_FRAMES;
  return (
    <Layer id="calls" n={3} title="What ran" intro={intro}>
      <p className="xr-muted">{n(stats.frames)} call{stats.frames === 1 ? '' : 's'}, nested {stats.depth} deep{stats.reverted ? `, ${stats.reverted} reverted` : ''}.</p>
      <ul className="xr-tree"><FrameView f={d.trace} d={d} depth={0} take={() => budget-- > 0} /></ul>
      {stats.frames > MAX_FRAMES && <p className="xr-muted">Showing the first {MAX_FRAMES} calls.</p>}
    </Layer>
  );
}

function FrameView({ f, d, depth, take }: { f: CallFrame; d: XrayData; depth: number; take: () => boolean }) {
  if (!take()) return null;
  const sel = f.input?.length >= 10 ? f.input.slice(0, 10) : null;
  const fn = sel ? functionAbi(sel, d) : null;
  const name = fn?.signature ? fn.signature.split('(')[0] : sel ? sel : f.type.startsWith('CREATE') ? 'create' : 'receive ether';
  const value = BigInt(f.value ?? '0x0');
  const head = (
    <span className={`xr-frame ${f.error ? 'is-error' : ''}`}>
      <span className={`xr-op op-${f.type.toLowerCase()}`}>{f.type}</span>
      <Addr a={f.to} d={d} plain={!!f.calls?.length} />
      <span className="mono xr-fname">{name}</span>
      {value > 0n && <span className="xr-val">{eth(value)} ETH</span>}
      <span className="xr-muted">{n(BigInt(f.gasUsed))} gas</span>
      {f.error && <span className="xr-err">reverted: {f.error}</span>}
    </span>
  );
  if (!f.calls?.length) return <li>{head}</li>;
  return (
    <li>
      <details open={depth < 2}>
        <summary>{head}<span className="xr-muted"> · {f.calls.length} inner</span></summary>
        <ul>{f.calls.map((c, i) => <FrameView key={i} f={c} d={d} depth={depth + 1} take={take} />)}</ul>
      </details>
    </li>
  );
}

// ---- 4. events ------------------------------------------------------------------------------------------------

function Events({ d }: { d: XrayData }) {
  const events = useMemo(() => describeEvents(d), [d]);
  const label = labeller(d);
  return (
    <Layer id="events" n={4} title="What it announced" intro="Contracts write events to the receipt as they run. Events can’t be changed afterwards, and they are how wallets and explorers learn what happened. A failed transaction leaves none.">
      {!events.length && <p className="xr-empty">No events{d.receipt.status !== '0x1' ? ': the transaction failed, so everything it did was undone' : ''}.</p>}
      <ol className="xr-events">
        {events.map(e => (
          <li key={e.index}>
            <div className="xr-ev-head">
              <span className="xr-ev-n">{e.index}</span>
              <strong>{e.name}</strong>
              <span className="xr-muted">from {label(e.address).name}</span>
              {e.source === 'signature database' && <span className="xr-source">name from Sourcify (unverified)</span>}
            </div>
            {e.sentence && <p className="xr-ev-text">{e.sentence}.</p>}
            {e.warn && <p className="xr-warn"><span aria-hidden="true">⚠</span> <strong>Warning:</strong> {e.warn}</p>}
            <details className="xr-raw">
              <summary>Raw log</summary>
              <ol className="mono">{e.log.topics.map((t, i) => <li key={i}>topic {i}: {t}</li>)}</ol>
              <p className="mono">data: {e.log.data.length > 200 ? `${e.log.data.slice(0, 200)}… (${n((e.log.data.length - 2) / 2)} bytes)` : e.log.data}</p>
            </details>
          </li>
        ))}
      </ol>
    </Layer>
  );
}

// ---- 5. value -------------------------------------------------------------------------------------------------

/** Short enough to sit under a node: drop the address (shown below it) and any parenthetical. */
const nodeName = (s: string) => { const t = s.replace(/ 0x.*$/, '').replace(/ \(.*\)$/, ''); return t.length > 16 ? `${t.slice(0, 15)}…` : t; };

const FLOW_KIND: Record<Flow['kind'], string> = {
  value: 'sent with the call', internal: 'internal transfer', token: 'token transfer', nft: 'NFT transfer', wrap: 'wrap / unwrap', burn: 'fee, burned', tip: 'fee, tip to the builder',
};

function Value({ d }: { d: XrayData }) {
  const flows = useMemo(() => valueFlows(d), [d]);
  const net = useMemo(() => netChanges(flows), [flows]);
  const label = labeller(d);
  const [hot, setHot] = useState<number | null>(null);

  // participants in order of first appearance, sender first; assets coloured by first appearance (fees are ink)
  const people: string[] = [d.tx.from.toLowerCase()];
  for (const f of flows) for (const p of [f.from, f.to]) if (!people.includes(p)) people.push(p);
  const shown = people.slice(0, 7);
  const at = (p: string) => (shown.includes(p) ? shown.indexOf(p) : shown.length);
  const assets = [...new Set(flows.filter(f => f.kind !== 'burn' && f.kind !== 'tip').map(f => f.asset))];
  const color = (f: Flow) => (f.kind === 'burn' ? '#3d3b36' : f.kind === 'tip' ? '#9b9a94' : ARG_COLORS[assets.indexOf(f.asset)] ?? '#9b9a94');
  const W = 860, base = 150, cols = Math.max(2, Math.min(people.length, shown.length + 1));
  const x = (i: number) => 80 + (i * (W - 160)) / (cols - 1);

  return (
    <Layer id="value" n={5} title="Where value moved" intro="Every movement of ether and tokens: ether sent with the call or by contracts inside it, token transfers from the events, and the fee, split into what was burned and what went to the builder.">
      <svg className="xr-arcs" viewBox={`0 0 ${W} 296`} role="img" aria-label={`${flows.length} movements of value between ${people.length} parties; listed in the table below`}>
        {flows.map((f, i) => {
          if (at(f.from) === shown.length && at(f.to) === shown.length) return null;   // both ends folded into "more"
          const a = x(at(f.from)), b = x(at(f.to)), r = Math.abs(b - a) / 2 || 20;
          return (
            <path key={i} d={a === b ? `M ${a} ${base} m -1 0 a 20 20 0 1 1 2 0` : `M ${a} ${base} A ${r} ${Math.min(r, 112)} 0 0 1 ${b} ${base}`}
              fill="none" stroke={color(f)} strokeWidth={hot === i ? 4 : 2} strokeDasharray={f.kind === 'burn' ? '5 4' : undefined}
              opacity={hot === null || hot === i ? 1 : 0.2} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
              <title>{`${assetAmount(f.asset, f.value, d)} ${assetName(f.asset, d)}: ${label(f.from).name} → ${label(f.to).name}`}</title>
            </path>
          );
        })}
        {shown.map((p, i) => (
          <g key={p} transform={`translate(${x(i)} ${base})`}>
            <circle r="5" fill="#16181d" />
            <text y={i % 2 ? 46 : 22} textAnchor="middle" className="xr-arc-label">{nodeName(label(p).name)}</text>
            <text y={i % 2 ? 60 : 36} textAnchor="middle" className="xr-arc-sub">{p === 'burn' ? '' : short(p, 6, 4)}</text>
          </g>
        ))}
        {people.length > shown.length && (
          <g transform={`translate(${x(shown.length)} ${base})`}><circle r="5" fill="#9b9a94" /><text y="26" textAnchor="middle" className="xr-arc-label">{people.length - shown.length} more</text></g>
        )}
        <text x="12" y="288" className="xr-arc-sub">above the line: value moving right · below: moving left</text>
      </svg>
      <div className="xr-legend" aria-hidden="true">
        {assets.map((a, i) => <span key={a}><span className="sw" style={{ background: ARG_COLORS[i] ?? '#9b9a94' }} />{assetName(a, d)}</span>)}
        <span><span className="sw" style={{ background: '#3d3b36' }} />fee burned</span>
        <span><span className="sw" style={{ background: '#9b9a94' }} />tip to builder</span>
      </div>
      <table className="xr-table">
        <caption>Each movement, in order</caption>
        <thead><tr><th scope="col">Amount</th><th scope="col">From</th><th scope="col">To</th><th scope="col">How</th></tr></thead>
        <tbody>
          {flows.slice(0, 60).map((f, i) => (
            <tr key={i} className={hot === i ? 'is-hot' : ''} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
              <td className="num">{assetAmount(f.asset, f.value, d)} {assetName(f.asset, d)}</td>
              <td>{label(f.from).name}</td><td>{label(f.to).name}</td><td className="xr-muted">{FLOW_KIND[f.kind]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="xr-table">
        <caption>Net change per party</caption>
        <thead><tr><th scope="col">Party</th><th scope="col">Change</th></tr></thead>
        <tbody>
          {[...net].slice(0, 16).map(([who, m]) => (
            <tr key={who}>
              <td>{label(who).name}</td>
              <td className="num">{[...m].map(([a, v]) => <span key={a} className={v < 0n ? 'neg' : 'pos'}>{v > 0n ? '+' : ''}{assetAmount(a, v, d)} {assetName(a, d)}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!d.trace && <p className="xr-muted">Without a call tree, ether moved by contracts inside the transaction is missing here.</p>}
    </Layer>
  );
}

// ---- 6. fees --------------------------------------------------------------------------------------------------

function Fees({ d }: { d: XrayData }) {
  const f = fees(d);
  const total = Number(f.total) || 1;
  const parts = [
    ['Burned (base fee)', f.burned, '#3d3b36'],
    ['Tip to the builder', f.tip, '#9b9a94'],
    ...(f.blob > 0n ? [['Blob fee, burned', f.blob, '#6f6d66'] as const] : []),
  ] as const;
  const used = Number(f.gasUsed) / Number(f.gasLimit);
  const builder = builderName(d.block.extraData);
  return (
    <Layer id="fees" n={6} title="What it cost" intro="Gas used × the price per gas. The base fee part is burned: it leaves the supply. The tip goes to the builder of the block, which is why it decides who gets in first.">
      <div className="xr-feebar" role="img" aria-label={parts.map(([k, v]) => `${k}: ${eth(v)} ETH`).join(', ')}>
        {parts.map(([k, v, c]) => <div key={k} style={{ width: `${(Number(v) / total) * 100}%`, background: c }} />)}
      </div>
      <dl className="xr-fields xr-fees">
        <div><dt>Total</dt><dd><strong>{eth(f.total)} ETH</strong></dd><dd className="xr-note">paid by the sender, whether or not the transaction succeeded</dd></div>
        {parts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{eth(v)} ETH</dd><dd className="xr-note">{Math.round((Number(v) / total) * 100)}% of the fee</dd></div>)}
        <div><dt>Gas used</dt><dd>{n(f.gasUsed)} of {n(f.gasLimit)}</dd><dd className="xr-note">{Math.round(used * 100)}% of the limit the sender set</dd></div>
        <div><dt>Price per gas</dt><dd>{gwei(f.price)} gwei</dd><dd className="xr-note">{gwei(f.base)} base fee + {gwei(f.tipPerGas)} tip</dd></div>
        <div><dt>Place in block</dt><dd>{Number(d.tx.transactionIndex) + 1} of {d.block.txCount}</dd><dd className="xr-note">built by {builder ?? short(d.block.miner)}</dd></div>
      </dl>
    </Layer>
  );
}
