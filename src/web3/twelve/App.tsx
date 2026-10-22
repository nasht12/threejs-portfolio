import { Suspense, useEffect, useState } from 'react';
import { Web3Canvas } from './Scene';
import { startFeed } from './feed';
import { currentBlock, pct, useWeb3, type BlockView } from './store';
import { CATEGORIES, CATEGORY, EXPLAIN, TX_TYPES, formatEth, formatGwei, short } from '../decode';
import { blobCount, burnedWei, nextBaseFee } from '../fees';

const ETHERSCAN = 'https://etherscan.io';
const SLOT_MS = 12_000;
const n = (v: number) => v.toLocaleString('en-US');

export default function App() {
  useEffect(() => startFeed(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') useWeb3.getState().selectBlock(null); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="w3">
      <div className="w3-stage" aria-hidden="true">
        <Suspense fallback={null}><Web3Canvas /></Suspense>
      </div>
      <Header />
      <SlotClock />
      <div className="w3-bottom">
        <Legend />
        <Metrics />
      </div>
      <Details />
      <Tooltip />
      <Announcer />
    </div>
  );
}

function Header() {
  const status = useWeb3(s => s.status);
  const source = useWeb3(s => s.source);
  const note = useWeb3(s => s.note);
  return (
    <header className="w3-head">
      <a className="w3-back" href={`${import.meta.env.BASE_URL}web3/`}>← Web3</a>
      <h1>Twelve Seconds</h1>
      <p className="w3-lede">Ethereum mainnet as it happens, read-only. Transactions wait in the public mempool; every twelve seconds a block is built from some of them, and from order flow that never went public.</p>
      <p className={`w3-status is-${status}`}>
        <span className="w3-dot" aria-hidden="true" />
        {status === 'live' ? 'Live' : status === 'replay' ? 'Replay' : 'Connecting'}
        <span className="w3-muted"> · {note ?? source}</span>
      </p>
      <details className="w3-how">
        <summary>How to read this</summary>
        <p><strong>Grey points</strong> are pending transactions one public node has heard about. All it learns is their hash: what they do and what they pay stay hidden until they land.</p>
        <p><strong>Each slab is a block</strong>, its transactions in order. Colour is what a transaction does; height is the tip it paid the block’s builder (log scale). Most blocks are assembled by specialised builders, who bid for the right to fill them.</p>
        <p><strong>Some transactions fly in from the pool. The rest drop from above:</strong> they never went public. They reached the builder privately, through private RPCs and bundles, often so nobody could trade ahead of them.</p>
      </details>
    </header>
  );
}

function SlotClock() {
  const latest = useWeb3(s => s.blocks[0]);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => { const id = setInterval(() => setNow(performance.now()), 250); return () => clearInterval(id); }, []);
  if (!latest) return <div className="w3-clock"><p className="w3-muted">Waiting for the next block…</p></div>;
  const ms = Math.max(0, now - latest.arrivedAt), f = Math.min(1, ms / SLOT_MS), C = 2 * Math.PI * 20;
  return (
    <div className="w3-clock">
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" className="ring-bg" />
        <circle cx="24" cy="24" r="20" className="ring-fg" strokeDasharray={`${C * f} ${C}`} transform="rotate(-90 24 24)" />
      </svg>
      <div>
        <p className="w3-clock-big">{Math.floor(ms / 1000)} s</p>
        <p className="w3-muted">
          {ms < SLOT_MS + 2000 ? `since block #${n(latest.number)}` : 'no block yet: a validator can miss its slot'}
        </p>
      </div>
    </div>
  );
}

function Metrics() {
  const b = useWeb3(currentBlock);
  const pending = useWeb3(s => s.pending);
  const following = useWeb3(s => s.selected.block === null);
  const since = useWeb3(s => s.watchingSince);
  if (!b) return null;
  const listened = (b.arrivedAt - since) / 1000;
  const next = nextBaseFee(b), used = b.gasUsed / b.gasLimit, privateCount = b.txs.length - b.seenCount;
  return (
    <section className="w3-metrics" aria-label={`Block ${n(b.number)} in numbers`}>
      <p className="w3-metrics-title">{following ? 'Newest block' : 'Selected block'} · #{n(b.number)}</p>
      <div className="tile">
        <p className="tile-label">Base fee</p>
        <p className="tile-big">{formatGwei(b.baseFee)} <span>gwei</span></p>
        <p className="tile-sub">next block {next > b.baseFee ? '▲' : next < b.baseFee ? '▼' : '='} {formatGwei(next)} gwei</p>
      </div>
      <div className="tile">
        <p className="tile-label">Gas used</p>
        <p className="tile-big">{Math.round(used * 100)}<span>%</span></p>
        <div className="gauge" role="img" aria-label={`${Math.round(used * 100)}% of the gas limit; the target is 50%`}>
          <div className="gauge-fill" style={{ width: `${Math.min(100, used * 100)}%` }} />
          <div className="gauge-target" />
        </div>
        <p className="tile-sub">{used > 0.5 ? 'above the 50% target: fees rise' : used < 0.5 ? 'below the 50% target: fees fall' : 'on target'}</p>
      </div>
      <div className="tile">
        <p className="tile-label">Burned</p>
        <p className="tile-big">{formatEth(burnedWei(b), 4)} <span>ETH</span></p>
        <p className="tile-sub">base fee × gas, destroyed</p>
      </div>
      <div className="tile">
        <p className="tile-label">Seen in public first</p>
        <p className="tile-big">{pct(b)}<span>%</span></p>
        <p className="tile-sub">{listened < 30
          ? `warming up: the page had listened for ${Math.max(1, Math.round(listened))} s, so this undercounts`
          : `${n(privateCount)} of ${n(b.txs.length)} arrived privately`}</p>
      </div>
      <div className="tile">
        <p className="tile-label">Pending</p>
        <p className="tile-big">{n(pending.count)}</p>
        <p className="tile-sub">{pending.rate.toFixed(1)} new per second</p>
      </div>
    </section>
  );
}

function Legend() {
  const b = useWeb3(currentBlock);
  const focus = useWeb3(s => s.focus);
  const setFocus = useWeb3(s => s.setFocus);
  if (!b) return null;
  return (
    <div className="w3-legend" role="group" aria-label="Highlight in the chain">
      {CATEGORIES.map(c => (
        <button key={c.id} type="button" aria-pressed={focus === c.id} onClick={() => setFocus(focus === c.id ? null : c.id)}>
          <span className="sw" style={{ background: c.color }} aria-hidden="true" />{c.label}<span className="ct">{b.counts[c.id]}</span>
        </button>
      ))}
      <button type="button" className="private" aria-pressed={focus === 'private'} onClick={() => setFocus(focus === 'private' ? null : 'private')}>
        <span className="sw sw-private" aria-hidden="true" />Never public<span className="ct">{b.txs.length - b.seenCount}</span>
      </button>
    </div>
  );
}

function Details() {
  const blocks = useWeb3(s => s.blocks);
  const b = useWeb3(currentBlock);
  const selected = useWeb3(s => s.selected);
  const selectBlock = useWeb3(s => s.selectBlock);
  const selectTx = useWeb3(s => s.selectTx);
  return (
    <aside className="w3-details" aria-label="Blocks and transactions">
      <h2>Blocks</h2>
      <div className="blocks" role="group" aria-label="Recent blocks">
        <button type="button" aria-pressed={selected.block === null} onClick={() => selectBlock(null)}>Follow newest</button>
        {blocks.slice(0, 8).map(x => (
          <button key={x.hash} type="button" aria-pressed={selected.block === x.number} onClick={() => selectBlock(x.number)}>
            #{n(x.number)} <span className="w3-muted">{x.txs.length} tx</span>
          </button>
        ))}
      </div>
      {b ? <BlockSummary b={b} /> : <p className="w3-muted">The first block is on its way. Blocks come every twelve seconds.</p>}
      {b && selected.tx !== null && selected.block === b.number && <TxDetail b={b} i={selected.tx} onClose={() => selectTx(b.number, null)} />}
      {b && (
        <>
          <h3>Transactions <span className="w3-muted">in block order</span></h3>
          <ol className="txlist">
            {b.txs.map((t, i) => {
              const info = b.info[i];
              return (
                <li key={t[0]}>
                  <button type="button" aria-pressed={selected.block === b.number && selected.tx === i} onClick={() => selectTx(b.number, i)}>
                    <span className="sw" style={{ background: CATEGORY[info.category].color }} aria-hidden="true" />
                    <span className="tx-what">{info.action}</span>
                    <span className="tx-kind">{CATEGORY[info.category].label}{b.seenFor[i] === null ? ' · never public' : ''}</span>
                    <span className="tx-tip">{formatGwei(b.tips[i])} gwei tip</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </aside>
  );
}

function BlockSummary({ b }: { b: BlockView }) {
  const blobs = blobCount(b);
  return (
    <section className="summary" aria-label={`Block ${n(b.number)}`}>
      <p className="summary-head">
        <a href={`${ETHERSCAN}/block/${b.number}`} target="_blank" rel="noopener">Block #{n(b.number)}</a>
        <span className="w3-muted"> · {new Date(b.timestamp * 1000).toLocaleTimeString('en-US')}</span>
      </p>
      <dl>
        <dt>Built by</dt><dd>{b.builder ?? <span className="w3-muted">unnamed builder</span>}</dd>
        <dt>Fee recipient</dt><dd className="mono">{short(b.feeRecipient)}</dd>
        <dt>Transactions</dt><dd>{n(b.txs.length)}, {pct(b)}% seen in public first</dd>
        <dt>Gas</dt><dd>{n(b.gasUsed)} of {n(b.gasLimit)}</dd>
        {blobs > 0 && <><dt>Blobs</dt><dd>{blobs} (rollup data)</dd></>}
      </dl>
    </section>
  );
}

function TxDetail({ b, i, onClose }: { b: BlockView; i: number; onClose: () => void }) {
  const t = b.txs[i];
  if (!t) return null;
  const [hash, from, to, value, , bytes, gas, type, maxFee, , gasPrice, nonce] = t;
  const info = b.info[i], seen = b.seenFor[i];
  return (
    <section className="txcard" aria-label="Selected transaction">
      <div className="txcard-head">
        <span className="sw" style={{ background: CATEGORY[info.category].color }} aria-hidden="true" />
        <h3>{CATEGORY[info.category].label}</h3>
        <button type="button" className="x" onClick={onClose} aria-label="Close transaction details">×</button>
      </div>
      <p className="txcard-explain">{EXPLAIN[info.category]}</p>
      <p className={seen === null ? 'flow flow-private' : 'flow'}>
        {seen === null
          ? 'Never seen in the public mempool. It reached the builder privately: a private RPC, a bundle, or the builder’s own transaction.'
          : `Waited ${(seen / 1000).toFixed(1)} s in the public mempool before this block took it.`}
      </p>
      <a className="xray-link" href={`${import.meta.env.BASE_URL}web3/xray/?tx=${hash}&seen=${seen === null ? 'private' : Math.round(seen)}`}>
        X-ray this transaction →
      </a>
      <dl>
        <dt>Hash</dt><dd className="mono"><a href={`${ETHERSCAN}/tx/${hash}`} target="_blank" rel="noopener">{short(hash, 10, 8)}</a></dd>
        <dt>Calls</dt><dd className="mono">{info.action}</dd>
        <dt>From</dt><dd className="mono"><a href={`${ETHERSCAN}/address/${from}`} target="_blank" rel="noopener">{short(from)}</a></dd>
        <dt>To</dt><dd className="mono">{to ? <a href={`${ETHERSCAN}/address/${to}`} target="_blank" rel="noopener">{short(to)}</a> : 'new contract'}</dd>
        <dt>Value</dt><dd>{formatEth(value, 6)} ETH</dd>
        <dt>Tip</dt><dd>{formatGwei(b.tips[i])} gwei per gas</dd>
        <dt>{type >= 2 ? 'Max fee' : 'Gas price'}</dt><dd>{formatGwei(type >= 2 ? maxFee : gasPrice)} gwei per gas</dd>
        <dt>Gas limit</dt><dd>{n(gas)}</dd>
        <dt>Calldata</dt><dd>{n(bytes)} bytes</dd>
        <dt>Type</dt><dd>{TX_TYPES[type] ?? `type ${type}`}</dd>
        <dt>Nonce</dt><dd>{n(nonce)} <span className="w3-muted">(transactions this sender made before)</span></dd>
      </dl>
    </section>
  );
}

function Tooltip() {
  const hover = useWeb3(s => s.hover);
  const b = useWeb3(s => (s.hover ? s.blocks.find(x => x.number === s.hover!.block) : undefined));
  if (!hover || !b || !b.txs[hover.tx]) return null;
  const info = b.info[hover.tx];
  return (
    <div className="w3-tip" style={{ left: hover.x + 14, top: hover.y + 14 }} aria-hidden="true">
      <strong>{CATEGORY[info.category].label}</strong>
      <span className="mono">{info.action}</span>
      <span>{formatGwei(b.tips[hover.tx])} gwei tip · {b.seenFor[hover.tx] === null ? 'never public' : `${(b.seenFor[hover.tx]! / 1000).toFixed(1)} s in the mempool`}</span>
    </div>
  );
}

function Announcer() {
  const on = useWeb3(s => s.announce);
  const message = useWeb3(s => s.message);
  const setAnnounce = useWeb3(s => s.setAnnounce);
  return (
    <div className="w3-announce">
      <button type="button" aria-pressed={on} onClick={() => setAnnounce(!on)}>Announce new blocks</button>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
    </div>
  );
}
