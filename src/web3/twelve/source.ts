import { compactBlock, type CompactBlock } from '../rpc';

/*
 * Where the data comes from. Live: a public Ethereum node over WebSocket, read-only (two subscriptions and one
 * eth_getBlockByNumber per block; no keys, no wallet). Replay: a few minutes recorded by scripts/record-chain.mjs,
 * played back in real time, used when asked for (?source=replay), offline, or when no node answers.
 */

export interface Sink {
  /** a pending transaction; `ageMs` if it was first seen before now */
  pending(hash: string, ageMs?: number): void;
  block(b: CompactBlock): void;
  status(s: 'connecting' | 'live' | 'replay', source: string, note?: string): void;
  /** start over; `listenedMs` is how long the pool had already been watched (a recording starts with a full pool) */
  reset(listenedMs?: number): void;
}

export const NODES = ['wss://ethereum-rpc.publicnode.com', 'wss://eth.drpc.org'];
const host = (url: string) => new URL(url).host;

/** Returns a stop function. Calls giveUp() if no node ever answers. */
export function startLive(sink: Sink, giveUp: () => void): () => void {
  let ws: WebSocket | null = null, node = 0, failures = 0, everLive = false, stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    const url = NODES[node];
    sink.status('connecting', host(url));
    const sock = new WebSocket(url);
    ws = sock;
    let id = 10;
    const openTimeout = setTimeout(() => sock.close(), 8000);
    sock.onopen = () => {
      clearTimeout(openTimeout);
      sock.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newPendingTransactions'] }));
      sock.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_subscribe', params: ['newHeads'] }));
      // and the newest block right away, so the recorded preview is replaced without waiting for the next one
      sock.send(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: ['latest', true] }));
    };
    sock.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.id === 1 || m.id === 2) {
        if (m.error) { sock.close(); return; }      // this node won't share its mempool or heads: try the next
        if (m.id === 2) { everLive = true; failures = 0; sink.status('live', host(url)); }
        return;
      }
      if (m.method === 'eth_subscription') {
        const r = m.params?.result;
        if (typeof r === 'string') sink.pending(r);
        else if (r?.number) sock.send(JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'eth_getBlockByNumber', params: [r.number, true] }));
        return;
      }
      if (m.result?.transactions) sink.block(compactBlock(m.result));
    };
    sock.onclose = () => {
      clearTimeout(openTimeout);
      if (stopped || ws !== sock) return;
      failures++;
      node = (node + 1) % NODES.length;
      if (!everLive && failures >= NODES.length + 1) { giveUp(); return; }
      retry = setTimeout(connect, Math.min(1000 * 2 ** failures, 15_000));
    };
  };

  connect();
  return () => { stopped = true; clearTimeout(retry); ws?.close(); };
}

export interface Replay {
  chain: string;
  source: string;
  recordedAt: string;
  /** how long the recorder had been watching the mempool when the replay starts */
  warmupMs?: number;
  pending: [number, string | 0][];
  blocks: (CompactBlock & { at: number })[];
}

export function startReplay(sink: Sink, url: string, note?: string): () => void {
  let stopped = false, timer: ReturnType<typeof setInterval> | undefined;
  fetch(url).then(r => r.json() as Promise<Replay>).then(data => {
    if (stopped) return;
    const when = new Date(data.recordedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const end = data.blocks[data.blocks.length - 1].at + 12_000;
    let loop = 0, start = 0, pi = 0, bi = 0;
    const begin = () => {
      sink.reset(data.warmupMs ?? 30_000);
      sink.status('replay', data.source, note ?? `Recorded ${when}`);
      start = performance.now(); pi = 0; bi = 0; loop++;
    };
    begin();
    timer = setInterval(() => {
      const t = performance.now() - start;
      while (pi < data.pending.length && data.pending[pi][0] <= t) {
        const [at, ref] = data.pending[pi];
        const age = at < 0 ? -at : 0;            // seen before the replay opens: arrives with its age
        if (ref) { const [b, i] = ref.split('.').map(Number); sink.pending(data.blocks[b].txs[i][0], age); }
        else sink.pending(`replay-${loop}-${pi}`, age);
        pi++;
      }
      while (bi < data.blocks.length && data.blocks[bi].at <= t) {
        const { at: _at, ...b } = data.blocks[bi++];
        sink.block(b);
      }
      if (t > end) begin();
    }, 50);
  }).catch(() => sink.status('replay', 'recording', 'The recording could not be loaded.'));
  return () => { stopped = true; clearInterval(timer); };
}
