import { parseAbiItem, toEventSelector, toFunctionSelector, type AbiEvent, type AbiFunction } from 'viem';

/*
 * What the X-ray knows without asking anyone: a few contracts everybody touches, and the ABIs (with parameter names
 * and `indexed` flags) of the functions and events it explains in plain language. Each ABI is keyed by the selector
 * computed from it, so a typo can't silently attach the wrong meaning to a transaction.
 */

export const ADDRESS_BOOK: Record<string, string> = {
  '0x0000000000000000000000000000000000000000': 'zero address (mint / burn)',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Permit2',
  '0x000000000004444c5dc75cb358380d2e3de08a90': 'Uniswap v4 PoolManager',
  '0x66a9893cc07d91d95644aedd05d03f95e1dba8af': 'Uniswap Universal Router',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789': 'ERC-4337 EntryPoint v0.6',
  '0x0000000071727de22e5e9d8baf0edac6f37da032': 'ERC-4337 EntryPoint v0.7',
};

const FUNCTIONS = [
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function setApprovalForAll(address operator, bool approved)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function deposit()',
  'function withdraw(uint256 amount)',
  'function execute(bytes commands, bytes[] inputs, uint256 deadline)',
  'function execute(bytes commands, bytes[] inputs)',
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)',
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)',
].map(s => parseAbiItem(s) as AbiFunction);
export const KNOWN_FUNCTIONS = new Map(FUNCTIONS.map(f => [toFunctionSelector(f), f]));

const EVENTS = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event Deposit(address indexed to, uint256 amount)',
  'event Withdrawal(address indexed from, uint256 amount)',
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
  'event BeforeExecution()',
].map(s => parseAbiItem(s) as AbiEvent);
const indexedCount = (e: AbiEvent) => e.inputs.filter(i => i.indexed).length;
/** keyed by topic0 and topic count, since ERC-20 and ERC-721 Transfer share a topic0 */
export const KNOWN_EVENTS = new Map(EVENTS.map(e => [`${toEventSelector(e)}/${indexedCount(e) + 1}`, e]));

export const TOPIC = {
  transfer: toEventSelector(EVENTS[0]),
  approval: toEventSelector(EVENTS[2]),
  transferSingle: toEventSelector(EVENTS[4]),
  deposit: toEventSelector(EVENTS[5]),
  withdrawal: toEventSelector(EVENTS[6]),
  userOp: toEventSelector(EVENTS[11]),
};

/** Uniswap Universal Router: `commands` is one byte per step; the top bit lets that step fail without reverting all. */
export const ROUTER_COMMANDS: Record<number, string> = {
  0x00: 'V3_SWAP_EXACT_IN', 0x01: 'V3_SWAP_EXACT_OUT', 0x02: 'PERMIT2_TRANSFER_FROM', 0x03: 'PERMIT2_PERMIT_BATCH',
  0x04: 'SWEEP', 0x05: 'TRANSFER', 0x06: 'PAY_PORTION', 0x08: 'V2_SWAP_EXACT_IN', 0x09: 'V2_SWAP_EXACT_OUT',
  0x0a: 'PERMIT2_PERMIT', 0x0b: 'WRAP_ETH', 0x0c: 'UNWRAP_WETH', 0x0d: 'PERMIT2_TRANSFER_FROM_BATCH',
  0x0e: 'BALANCE_CHECK_ERC20', 0x10: 'V4_SWAP', 0x11: 'V3_POSITION_MANAGER_PERMIT', 0x12: 'V3_POSITION_MANAGER_CALL',
  0x13: 'V4_INITIALIZE_POOL', 0x14: 'V4_POSITION_MANAGER_CALL',
};
export const ROUTER_SELECTORS = new Set(['0x3593564c', '0x24856bc3']);
export const HANDLE_OPS = new Set(['0x765e827f', '0x1fad948c']);
