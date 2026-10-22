// Everything the X-ray needs about one transaction, read-only, from public endpoints.
// Plain JS (typed in load.d.ts) so scripts/record-xray.mjs can share it under Node.
//
//   transaction, receipt, block header   publicnode (then dRPC)
//   call tree (internal calls, ETH moves) dRPC debug_traceTransaction / callTracer (optional: the page works without it)
//   token symbol / decimals / name        one batched eth_call per token
//   names of unknown functions & events   Sourcify's signature database (then openchain)

export const NODES = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'];
export const TRACE_NODE = 'https://eth.drpc.org';
const SIGNATURE_DBS = [
  'https://api.4byte.sourcify.dev/signature-database/v1/lookup',
  'https://api.openchain.xyz/signature-database/v1/lookup',
];
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.json();
}

async function rpc(method, params, nodes = NODES) {
  let last;
  for (const url of nodes) {
    try {
      const j = await post(url, { jsonrpc: '2.0', id: 1, method, params });
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { last = e; }
  }
  throw last;
}

async function batch(calls) {
  if (!calls.length) return [];
  const body = calls.map((c, id) => ({ jsonrpc: '2.0', id, method: c[0], params: c[1] }));
  for (const url of NODES) {
    try {
      const out = await post(url, body);
      const byId = new Map((Array.isArray(out) ? out : []).map(r => [r.id, r]));
      return calls.map((_, id) => byId.get(id)?.result ?? null);
    } catch { /* next node */ }
  }
  return calls.map(() => null);
}

/** An eth_call result as text: an ABI string, or a bytes32 (old tokens such as MKR). */
export function abiText(hex) {
  if (!hex || hex === '0x') return null;
  const b = hex.slice(2);
  let bytes = '';
  if (b.length >= 128 && parseInt(b.slice(0, 64), 16) === 32) {
    const len = parseInt(b.slice(64, 128), 16);
    bytes = b.slice(128, 128 + len * 2);
  } else bytes = b.slice(0, 64).replace(/(00)+$/, '');
  let s = '';
  for (let i = 0; i < bytes.length; i += 2) s += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
  try { s = decodeURIComponent(escape(s)); } catch { /* not UTF-8: keep the bytes */ }
  s = s.replace(/[^\x20-\x7e -￿]/g, '').trim();
  return s.length ? s.slice(0, 40) : null;
}

async function tokenMeta(addresses) {
  const calls = addresses.flatMap(a => [
    ['eth_call', [{ to: a, data: '0x95d89b41' }, 'latest']],   // symbol()
    ['eth_call', [{ to: a, data: '0x313ce567' }, 'latest']],   // decimals()
    ['eth_call', [{ to: a, data: '0x06fdde03' }, 'latest']],   // name()
  ]);
  const out = await batch(calls);
  const tokens = {};
  addresses.forEach((a, i) => {
    const symbol = abiText(out[i * 3]);
    const d = out[i * 3 + 1];
    const decimals = d && d.length === 66 ? Number(BigInt(d)) : null;
    if (symbol) tokens[a] = { symbol, decimals: decimals !== null && decimals <= 36 ? decimals : 0, name: abiText(out[i * 3 + 2]) ?? symbol };
  });
  return tokens;
}

async function lookupSignatures(selectors, topics) {
  const out = { functions: {}, events: {} };
  if (!selectors.length && !topics.length) return out;
  const q = new URLSearchParams({ filter: 'true' });
  if (selectors.length) q.set('function', selectors.join(','));
  if (topics.length) q.set('event', topics.join(','));
  for (const base of SIGNATURE_DBS) {
    try {
      const r = await fetch(`${base}?${q}`);
      if (!r.ok) continue;
      const j = await r.json();
      const pick = list => (list ?? []).find(x => x.hasVerifiedContract)?.name ?? list?.[0]?.name;
      for (const [k, v] of Object.entries(j.result?.function ?? {})) { const n = pick(v); if (n) out.functions[k] = n; }
      for (const [k, v] of Object.entries(j.result?.event ?? {})) { const n = pick(v); if (n) out.events[k] = n; }
      return out;
    } catch { /* next database */ }
  }
  return out;
}

/** Keep the call tree small: drop outputs, and huge inputs below the top level (keep the selector and the length). */
function slimFrame(f, depth = 0) {
  const input = f.input ?? '0x';
  const big = depth > 0 && input.length > 4098;
  return {
    type: f.type, from: f.from, to: f.to, value: f.value ?? '0x0', gas: f.gas, gasUsed: f.gasUsed,
    input: big ? input.slice(0, 10) : input, inputBytes: Math.max(0, (input.length - 2) / 2),
    ...(f.error ? { error: f.error } : {}),
    ...(f.calls?.length ? { calls: f.calls.map(c => slimFrame(c, depth + 1)) } : {}),
  };
}

function walk(f, visit) { if (!f) return; visit(f); for (const c of f.calls ?? []) walk(c, visit); }

export class XrayError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

export async function loadXray(hash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new XrayError('invalid', 'A transaction hash is 0x followed by 64 hex characters.');
  const [tx, receipt] = await Promise.all([rpc('eth_getTransactionByHash', [hash]), rpc('eth_getTransactionReceipt', [hash])]);
  if (!tx) throw new XrayError('not-found', 'No transaction with this hash on Ethereum mainnet.');
  if (!receipt || !tx.blockNumber) throw new XrayError('pending', 'This transaction is still pending: it has not been included in a block yet.');

  const [block, trace] = await Promise.all([
    rpc('eth_getBlockByNumber', [tx.blockNumber, false]),
    rpc('debug_traceTransaction', [hash, { tracer: 'callTracer' }], [TRACE_NODE]).then(t => slimFrame(t)).catch(() => null),
  ]);

  const tokenAddrs = [...new Set(receipt.logs.filter(l => l.topics[0] === TRANSFER || l.topics[0] === APPROVAL).map(l => l.address.toLowerCase()))].slice(0, 40);
  const selectors = new Set();
  if (tx.input && tx.input.length >= 10) selectors.add(tx.input.slice(0, 10));
  walk(trace, f => { if (f.input && f.input.length >= 10) selectors.add(f.input.slice(0, 10)); });
  const topics = [...new Set(receipt.logs.map(l => l.topics[0]).filter(Boolean))];

  const [tokens, signatures] = await Promise.all([
    tokenMeta(tokenAddrs),
    lookupSignatures([...selectors].slice(0, 80), topics.slice(0, 80)),
  ]);

  return {
    tx: { ...tx },
    receipt: {
      status: receipt.status, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice,
      cumulativeGasUsed: receipt.cumulativeGasUsed, contractAddress: receipt.contractAddress ?? null,
      blobGasUsed: receipt.blobGasUsed ?? null, blobGasPrice: receipt.blobGasPrice ?? null,
      logs: receipt.logs.map(l => ({ address: l.address.toLowerCase(), topics: l.topics, data: l.data, logIndex: l.logIndex })),
    },
    block: {
      number: block.number, timestamp: block.timestamp, baseFeePerGas: block.baseFeePerGas, miner: block.miner,
      extraData: block.extraData, gasUsed: block.gasUsed, gasLimit: block.gasLimit, txCount: block.transactions.length,
    },
    trace,
    tokens,
    signatures,
    fetchedAt: new Date().toISOString(),
  };
}
