type Hex = `0x${string}`;

export interface RawTx {
  hash: Hex; from: Hex; to: Hex | null; value: Hex; input: Hex; gas: Hex; nonce: Hex; type: Hex; chainId?: Hex;
  gasPrice?: Hex; maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex; maxFeePerBlobGas?: Hex;
  accessList?: { address: Hex; storageKeys: Hex[] }[]; blobVersionedHashes?: Hex[]; authorizationList?: unknown[];
  r: Hex; s: Hex; v: Hex; yParity?: Hex;
  blockNumber: Hex; transactionIndex: Hex;
}
export interface RawLog { address: string; topics: Hex[]; data: Hex; logIndex: Hex }
export interface RawReceipt {
  status: Hex; gasUsed: Hex; effectiveGasPrice: Hex; cumulativeGasUsed: Hex; contractAddress: Hex | null;
  blobGasUsed: Hex | null; blobGasPrice: Hex | null; logs: RawLog[];
}
export interface RawBlock { number: Hex; timestamp: Hex; baseFeePerGas: Hex; miner: Hex; extraData: Hex; gasUsed: Hex; gasLimit: Hex; txCount: number }
export interface CallFrame {
  type: string; from: Hex; to?: Hex; value: Hex; gas: Hex; gasUsed: Hex; input: Hex; inputBytes: number; error?: string; calls?: CallFrame[];
}
export interface Token { symbol: string; decimals: number; name: string }
export interface XrayData {
  tx: RawTx;
  receipt: RawReceipt;
  block: RawBlock;
  trace: CallFrame | null;
  tokens: Record<string, Token>;
  signatures: { functions: Record<string, string>; events: Record<string, string> };
  fetchedAt: string;
}

export const NODES: string[];
export const TRACE_NODE: string;
export function abiText(hex: string | null): string | null;
export class XrayError extends Error {
  kind: 'invalid' | 'not-found' | 'pending';
  constructor(kind: string, message: string);
}
export function loadXray(hash: string): Promise<XrayData>;
