// Turning raw JSON-RPC blocks into the compact shape the Web3 page works with.
// Plain JS (typed in rpc.d.ts) so scripts/record-chain.mjs can import it under Node without a build step.

const num = hex => (hex == null ? 0 : Number(BigInt(hex)));

/** extraData is free text the block's builder chose ("Titan (titanbuilder.xyz)", "beaverbuild.org"); keep what's printable. */
export function builderName(extraData) {
  if (!extraData || extraData === '0x') return null;
  let s = '';
  for (let i = 2; i < extraData.length; i += 2) {
    const c = parseInt(extraData.slice(i, i + 2), 16);
    s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s.length >= 3 ? s.slice(0, 48) : null;
}

/**
 * One transaction as a tuple:
 * [hash, from, to|null, valueHex, selector ('' for a plain transfer), inputBytes, gasLimit, type, maxFee, maxPriorityFee, gasPrice, nonce]
 */
export function compactTx(t) {
  const input = t.input ?? '0x';
  return [
    t.hash, t.from, t.to ?? null, t.value ?? '0x0',
    input.length >= 10 ? input.slice(0, 10) : '',
    Math.max(0, (input.length - 2) / 2),
    num(t.gas), num(t.type), num(t.maxFeePerGas), num(t.maxPriorityFeePerGas), num(t.gasPrice), num(t.nonce),
  ];
}

export function compactBlock(b) {
  return {
    number: num(b.number),
    hash: b.hash,
    parentHash: b.parentHash,
    timestamp: num(b.timestamp),
    builder: builderName(b.extraData),
    feeRecipient: b.miner,
    gasUsed: num(b.gasUsed),
    gasLimit: num(b.gasLimit),
    baseFee: num(b.baseFeePerGas),
    blobGasUsed: num(b.blobGasUsed),
    txs: (b.transactions ?? []).filter(t => typeof t === 'object').map(compactTx),
  };
}
