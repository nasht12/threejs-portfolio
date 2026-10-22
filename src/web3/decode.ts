import type { TxTuple } from './rpc';

/*
 * What a transaction is, from what's on chain alone: its type, whether it has a recipient, and the first four bytes of
 * its calldata (the function selector). No ABI lookups, no third-party APIs: a selector is the keccak of a function
 * signature, so the common ones are known constants.
 */

export const CATEGORIES = [
  // Fixed order = fixed colour (validated as a set; see Legend). Never cycle or re-rank these.
  { id: 'eth', label: 'ETH transfer', color: '#2a78d6' },
  { id: 'swap', label: 'Swap', color: '#eb6834' },
  { id: 'token', label: 'Token transfer', color: '#1baf7a' },
  { id: 'account', label: 'Smart account', color: '#eda100' },
  { id: 'nft', label: 'NFT', color: '#e87ba4' },
  { id: 'blob', label: 'Rollup blob', color: '#008300' },
  { id: 'approval', label: 'Approval', color: '#6250d6' },
  { id: 'other', label: 'Other contract call', color: '#9b9a94' },
] as const;
export type Category = (typeof CATEGORIES)[number]['id'];
export const CATEGORY = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<Category, (typeof CATEGORIES)[number]>;

/** What each category means, for the details panel. */
export const EXPLAIN: Record<Category, string> = {
  eth: 'Plain ether sent from one account to another: no contract code runs.',
  swap: 'A trade through a decentralised exchange router: one token in, another out, priced by a liquidity pool.',
  token: 'An ERC-20 token moving between accounts: the token contract updates two balances.',
  account: 'A bundle of user operations from smart-contract wallets (ERC-4337), submitted together by a bundler.',
  nft: 'An NFT moving or being minted (ERC-721 / ERC-1155).',
  blob: 'A layer-2 rollup posting its batch data to Ethereum as blobs (EIP-4844): cheap data, kept for about 18 days.',
  approval: 'Permission for a contract to move this account’s tokens. The usual first step of a trade, and the step scams target.',
  other: 'A call to a contract function this page doesn’t name, or a contract being deployed. The top of a block is often here: MEV searchers’ own contracts, with unpublished function names.',
};

const SELECTORS: Record<string, [Category, string]> = {
  '0xa9059cbb': ['token', 'transfer'],
  '0x23b872dd': ['token', 'transferFrom'],
  '0x095ea7b3': ['approval', 'approve'],
  '0xd505accf': ['approval', 'permit'],
  '0xa22cb465': ['approval', 'setApprovalForAll'],
  '0x42842e0e': ['nft', 'safeTransferFrom'],
  '0xb88d4fde': ['nft', 'safeTransferFrom'],
  '0xf242432a': ['nft', 'safeTransferFrom (1155)'],
  '0x2eb2c2d6': ['nft', 'safeBatchTransferFrom'],
  '0x1249c58b': ['nft', 'mint'],
  '0xa0712d68': ['nft', 'mint'],
  '0x40c10f19': ['nft', 'mint'],
  '0x3593564c': ['swap', 'execute (Uniswap Universal Router)'],
  '0x24856bc3': ['swap', 'execute (Uniswap Universal Router)'],
  '0x7ff36ab5': ['swap', 'swapExactETHForTokens'],
  '0xb6f9de95': ['swap', 'swapExactETHForTokensSupportingFee…'],
  '0x18cbafe5': ['swap', 'swapExactTokensForETH'],
  '0x791ac947': ['swap', 'swapExactTokensForETHSupportingFee…'],
  '0x38ed1739': ['swap', 'swapExactTokensForTokens'],
  '0x5c11d795': ['swap', 'swapExactTokensForTokensSupportingFee…'],
  '0xfb3bdb41': ['swap', 'swapETHForExactTokens'],
  '0x414bf389': ['swap', 'exactInputSingle'],
  '0x04e45aaf': ['swap', 'exactInputSingle'],
  '0xc04b8d59': ['swap', 'exactInput'],
  '0xb858183f': ['swap', 'exactInput'],
  '0x5ae401dc': ['swap', 'multicall (Uniswap V3 router)'],
  '0xac9650d8': ['swap', 'multicall (Uniswap V3 router)'],
  '0x12aa3caf': ['swap', 'swap (1inch)'],
  '0x07ed2379': ['swap', 'swap (1inch)'],
  '0x0502b1c5': ['swap', 'unoswap (1inch)'],
  '0xe449022e': ['swap', 'uniswapV3Swap (1inch)'],
  '0x765e827f': ['account', 'handleOps (EntryPoint v0.7)'],
  '0x1fad948c': ['account', 'handleOps (EntryPoint v0.6)'],
  '0xd0e30db0': ['token', 'deposit (wrap ETH)'],
  '0x2e1a7d4d': ['token', 'withdraw (unwrap ETH)'],
};

export interface TxInfo {
  category: Category;
  /** human name of what was called */
  action: string;
}

export function classify(t: TxTuple): TxInfo {
  const [, , to, , selector, , , type] = t;
  if (type === 3) return { category: 'blob', action: 'blob transaction' };
  if (to === null) return { category: 'other', action: 'contract deployment' };
  if (selector === '') return { category: 'eth', action: 'ether transfer' };
  const known = SELECTORS[selector];
  if (known) return { category: known[0], action: known[1] };
  return { category: 'other', action: `function ${selector}` };
}

export const TX_TYPES: Record<number, string> = {
  0: 'legacy (type 0)',
  1: 'access list (type 1, EIP-2930)',
  2: 'fee market (type 2, EIP-1559)',
  3: 'blob (type 3, EIP-4844)',
  4: 'set code (type 4, EIP-7702)',
};

// ---- formatting -----------------------------------------------------------------------------------------------

export const short = (hex: string, head = 6, tail = 4) => (hex.length <= head + tail + 1 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`);

/** wei (hex string or bigint) as ETH, to a sensible number of places. */
export function formatEth(wei: string | bigint, places = 4): string {
  const v = typeof wei === 'bigint' ? wei : BigInt(wei);
  if (v === 0n) return '0';
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, '0');
  if (whole === 0n) {
    const first = frac.search(/[1-9]/);
    if (first >= places) return `${'0.' + frac.slice(0, first + 2).replace(/0+$/, '')}`;
  }
  const f = frac.slice(0, places).replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}${f ? '.' + f : ''}`;
}

/** wei per gas as gwei, keeping small fees readable (base fees on mainnet are often under 1 gwei now). */
export function formatGwei(wei: number): string {
  const g = wei / 1e9;
  if (g === 0) return '0';
  if (g < 0.01) return g.toPrecision(2);
  if (g < 10) return g.toFixed(3).replace(/\.?0+$/, '');
  if (g < 1000) return g.toFixed(1).replace(/\.0$/, '');
  return Math.round(g).toLocaleString('en-US');
}
