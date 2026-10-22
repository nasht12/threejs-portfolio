/** [hash, from, to, valueHex, selector, inputBytes, gasLimit, type, maxFee, maxPriorityFee, gasPrice, nonce] */
export type TxTuple = [string, string, string | null, string, string, number, number, number, number, number, number, number];

export interface CompactBlock {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  builder: string | null;
  feeRecipient: string;
  gasUsed: number;
  gasLimit: number;
  /** wei */
  baseFee: number;
  blobGasUsed: number;
  txs: TxTuple[];
}

export function builderName(extraData: string | undefined): string | null;
export function compactTx(t: Record<string, string | undefined>): TxTuple;
export function compactBlock(b: Record<string, unknown>): CompactBlock;
