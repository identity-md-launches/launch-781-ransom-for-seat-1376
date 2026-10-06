import {
  createPublicClient,
  http,
  fallback,
  parseAbi,
  parseAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  decodeErrorResult,
  keccak256,
  stringToHex,
  formatUnits,
  parseUnits,
  maxUint128,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";

export const ADDR = {
  seat: "0x0000eC93127BAA929E58E97dd0095A2BFb38ec1D",
  token: "0x4543e6b511a9a7a75b56607e27997c987ea05878",
  hook: "0x5ea347b1a8e70dd72782833ca3104db1d44750cc",
  router: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
  quoter: "0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203",
  stateView: "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  creator: "0xDF90937E07c60108B505FE3C542aB782e0A19AE5",
  zero: "0x0000000000000000000000000000000000000000",
} as const satisfies Record<string, Address>;
export const POOL_ID =
  "0xfad820f2088b3a1c0e775e430ae6ccaa75012cbffb9d96d13a824096f2cdb284";
export const EXPECTED_MANIFESTO_HASH =
  "0x95338e67928e8de51d027502b517c31a293a053300c1c9fe56ed940f07595d4f";
export const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
] as const;
export const rpc = createPublicClient({
  chain: mainnet,
  transport: fallback(
    RPC_URLS.map((url) => http(url, { timeout: 9_000, retryCount: 0 })),
    { rank: false, retryCount: 1 },
  ),
});
const keyType =
  "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
export const POOL_KEY = {
  currency0: ADDR.zero,
  currency1: ADDR.token,
  fee: 3000,
  tickSpacing: 60,
  hooks: ADDR.hook,
};
export const hookAbi = parseAbi([
  "function totalFees() view returns (uint256)",
  "function CREATOR_CAP() view returns (uint256)",
  "function buried() view returns (bool)",
  "function totalIMDBurned() view returns (uint256)",
  "function burnable() view returns (uint256)",
  "function MIN_BURN() view returns (uint256)",
  "function lastBurnBlock() view returns (uint256)",
  "function MIN_BLOCKS_BETWEEN_BURNS() view returns (uint256)",
  "function status() view returns (string)",
  "function MANIFESTO() view returns (string)",
  "function MANIFESTO_HASH() view returns (bytes32)",
  "function IMD() view returns (address)",
  "function manumit()",
  "function burnIMD(bool viaPool4, uint256 callerMinOut)",
]);
export const tokenAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
]);
export const permitAbi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
export const quoteAbi = parseAbi([
  `function quoteExactInputSingle((${keyType} poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)`,
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
export const stateAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
]);
export const seatAbi = parseAbi([
  "function tokenURI(uint256) view returns (string)",
  "function getApproved(uint256) view returns (address)",
]);
export const errorAbi = parseAbi([
  "error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)",
  "error PartialFill()",
  "error StillEnslaved()",
  "error AlreadyBuried()",
  "error SeatUnavailable()",
  "error BurialRefused(bytes reason)",
  "error TooSoon()",
  "error Pool4Unavailable()",
  "error NothingToBurn()",
  "error PoolUnavailable()",
  "error PriceOffReference()",
  "error Slippage()",
  "error OnlyPoolManager()",
  "error ReentrantCall()",
  "error UnexpectedUnlock()",
  "error ExecutionFailed(uint256 commandIndex, bytes message)",
  "error WrappedError(address target, bytes4 selector, bytes reason, bytes details)",
  "error Error(string reason)",
  "error Panic(uint256 code)",
]);
export type Side = "buy" | "sell";
export type SeatMetadata = {
  image: string;
  attributes: { trait_type: string; value: string | number }[];
  name?: string;
};
export function parseMetadata(uri: string): SeatMetadata {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix))
    throw new Error("The seat returned an unsupported metadata format.");
  const bytes = Uint8Array.from(atob(uri.slice(prefix.length)), (c) =>
    c.charCodeAt(0),
  );
  const data = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  ) as SeatMetadata;
  if (
    typeof data.image !== "string" ||
    !/^data:image\/svg\+xml[;,]/i.test(data.image)
  )
    throw new Error("The seat did not return an SVG data URI.");
  if (!Array.isArray(data.attributes)) data.attributes = [];
  return data;
}
export function verifyManifesto(manifesto: string, hash: Hex) {
  return (
    keccak256(stringToHex(manifesto)) === hash &&
    hash === EXPECTED_MANIFESTO_HASH
  );
}
export function deriveState(fees: bigint, cap: bigint, buried: boolean) {
  return buried ? "BURIED" : fees >= cap ? "FREED, NOT BURIED" : "ENSLAVED";
}
export async function readSnapshot() {
  const block = await rpc.getBlock();
  const readHook = <
    N extends
      | "totalFees"
      | "CREATOR_CAP"
      | "buried"
      | "totalIMDBurned"
      | "burnable"
      | "MIN_BURN"
      | "lastBurnBlock"
      | "MIN_BLOCKS_BETWEEN_BURNS"
      | "status"
      | "MANIFESTO"
      | "MANIFESTO_HASH"
      | "IMD",
  >(
    functionName: N,
  ) =>
    rpc.readContract({
      address: ADDR.hook,
      abi: hookAbi,
      functionName,
      blockNumber: block.number,
    });
  const [
    fees,
    cap,
    buried,
    burned,
    burnable,
    minBurn,
    lastBurnBlock,
    burnBlocks,
    status,
    manifestoHash,
    imd,
    uri,
    approved,
    slot0,
    decimals,
    supply,
  ] = await Promise.all([
    readHook("totalFees"),
    readHook("CREATOR_CAP"),
    readHook("buried"),
    readHook("totalIMDBurned"),
    readHook("burnable"),
    readHook("MIN_BURN"),
    readHook("lastBurnBlock"),
    readHook("MIN_BLOCKS_BETWEEN_BURNS"),
    readHook("status"),
    readHook("MANIFESTO_HASH"),
    readHook("IMD"),
    rpc.readContract({
      address: ADDR.seat,
      abi: seatAbi,
      functionName: "tokenURI",
      args: [1376n],
      blockNumber: block.number,
    }),
    rpc.readContract({
      address: ADDR.seat,
      abi: seatAbi,
      functionName: "getApproved",
      args: [1376n],
      blockNumber: block.number,
    }),
    rpc.readContract({
      address: ADDR.stateView,
      abi: stateAbi,
      functionName: "getSlot0",
      args: [POOL_ID],
      blockNumber: block.number,
    }),
    rpc.readContract({
      address: ADDR.token,
      abi: tokenAbi,
      functionName: "decimals",
      blockNumber: block.number,
    }),
    rpc.readContract({
      address: ADDR.token,
      abi: tokenAbi,
      functionName: "totalSupply",
      blockNumber: block.number,
    }),
  ]);
  // The testament opens only with burial, at the same block as this snapshot.
  const manifesto = buried ? await readHook("MANIFESTO") : undefined;
  const imdDecimals = await rpc.readContract({
    address: imd,
    abi: tokenAbi,
    functionName: "decimals",
    blockNumber: block.number,
  });
  const tokensPerEth =
    (Number(slot0[0]) / 2 ** 96) ** 2 * 10 ** (18 - decimals);
  return {
    fees,
    cap,
    buried,
    burned,
    burnable,
    minBurn,
    lastBurnBlock,
    burnBlocks,
    status,
    manifesto,
    manifestoHash,
    manifestoVerified:
      manifesto !== undefined && verifyManifesto(manifesto, manifestoHash),
    seatApproved: approved.toLowerCase() === ADDR.hook.toLowerCase(),
    metadata: parseMetadata(uri),
    uri,
    decimals,
    supply,
    imdDecimals,
    tokensPerEth,
    state: deriveState(fees, cap, buried),
    block: block.number,
    timestamp: block.timestamp,
    fetchedAt: Date.now(),
  };
}
export type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
export function parseAmount(value: string, decimals: number): bigint {
  if (
    !/^(?:\d+\.?\d*|\.\d+)$/.test(value) ||
    (value.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(`Enter an amount with up to ${decimals} decimal places.`);
  const amount = parseUnits(value, decimals);
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  if (amount > maxUint128)
    throw new Error("This amount is too large. Enter a smaller amount.");
  return amount;
}
export async function quote(side: Side, amount: bigint, blockNumber?: bigint) {
  const data = encodeFunctionData({
    abi: quoteAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: POOL_KEY,
        zeroForOne: side === "buy",
        exactAmount: amount,
        hookData: "0x",
      },
    ],
  });
  const response = await rpc.call({ to: ADDR.quoter, data, blockNumber });
  if (!response.data) throw new Error("No quote returned. Try again.");
  const [out, gas] = decodeFunctionResult({
    abi: quoteAbi,
    functionName: "quoteExactInputSingle",
    data: response.data,
  });
  if (out <= 0n)
    throw new Error("The pool returned zero. Try a different amount.");
  return { out, gas };
}
export function minimumOut(out: bigint, slippage: number) {
  if (![1, 3, 5, 10].includes(slippage))
    throw new Error("Choose a supported slippage.");
  const minimum = (out * BigInt(100 - slippage)) / 100n;
  if (minimum <= 0n || minimum > maxUint128)
    throw new Error("The quote is outside the supported amount range.");
  return minimum;
}
export function buildTrade(
  side: Side,
  amount: bigint,
  minimum: bigint,
  timestamp: bigint,
) {
  const params = [
    encodeAbiParameters(
      parseAbiParameters(
        `(${keyType} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)`,
      ),
      [
        {
          poolKey: POOL_KEY,
          zeroForOne: side === "buy",
          amountIn: amount,
          amountOutMinimum: minimum,
          hookData: "0x",
        },
      ],
    ),
    encodeAbiParameters(parseAbiParameters("address, uint256"), [
      side === "buy" ? ADDR.zero : ADDR.token,
      amount,
    ]),
    encodeAbiParameters(parseAbiParameters("address, uint256"), [
      side === "buy" ? ADDR.token : ADDR.zero,
      minimum,
    ]),
  ];
  const input = encodeAbiParameters(parseAbiParameters("bytes, bytes[]"), [
    "0x060c0f",
    params,
  ]);
  return {
    to: ADDR.router,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "execute",
      args: ["0x10", [input], timestamp + 600n],
    }),
    value: side === "buy" ? amount : 0n,
  };
}
export async function readHoldings(owner: Address) {
  const block = await rpc.getBlock();
  const [eth, token, allowance, permit] = await Promise.all([
    rpc.getBalance({ address: owner, blockNumber: block.number }),
    rpc.readContract({
      address: ADDR.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [owner],
      blockNumber: block.number,
    }),
    rpc.readContract({
      address: ADDR.token,
      abi: tokenAbi,
      functionName: "allowance",
      args: [owner, ADDR.permit2],
      blockNumber: block.number,
    }),
    rpc.readContract({
      address: ADDR.permit2,
      abi: permitAbi,
      functionName: "allowance",
      args: [owner, ADDR.token, ADDR.router],
      blockNumber: block.number,
    }),
  ]);
  return { eth, token, allowance, permit, timestamp: block.timestamp };
}
export type Holdings = Awaited<ReturnType<typeof readHoldings>>;
export function approvalSteps(holdings: Holdings, amount: bigint) {
  return {
    token: holdings.allowance >= amount,
    router:
      holdings.permit[0] >= amount &&
      BigInt(holdings.permit[1]) > holdings.timestamp + 600n,
  };
}
export function formatAmount(amount: bigint, decimals = 18, digits = 5) {
  return Number(formatUnits(amount, decimals)).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}
export function exactFixed(amount: bigint, decimals: number, digits: number) {
  const [whole, fraction = ""] = formatUnits(amount, decimals).split(".");
  return `${whole}.${fraction.padEnd(digits, "0").slice(0, digits)}`;
}
export function errorName(error: unknown, depth = 0): string | undefined {
  if (depth > 12 || !error || typeof error !== "object") return;
  const e = error as {
    data?: unknown;
    cause?: unknown;
    error?: unknown;
    errorName?: string;
    args?: unknown[];
  };
  if (typeof e.data === "string" && /^0x[\da-f]+$/i.test(e.data)) {
    try {
      const decoded = decodeErrorResult({ abi: errorAbi, data: e.data as Hex });
      if (decoded.errorName === "ExecutionFailed")
        return (
          errorName({ data: decoded.args[1] }, depth + 1) ?? decoded.errorName
        );
      if (decoded.errorName === "WrappedError")
        return (
          errorName({ data: decoded.args[2] }, depth + 1) ?? decoded.errorName
        );
      if (decoded.errorName === "Error") return String(decoded.args[0]);
      return decoded.errorName;
    } catch {
      /* Try nested RPC/wallet error shapes below. */
    }
  }
  if (e.errorName) return e.errorName;
  return (
    errorName(e.data, depth + 1) ??
    errorName(e.cause, depth + 1) ??
    errorName(e.error, depth + 1)
  );
}
export function explainError(error: unknown, snapshot?: Snapshot) {
  const name = errorName(error);
  const errors: Record<string, string> = {
    V4TooLittleReceived: "price moved: raise slippage or try again",
    PartialFill: "too large for the pool right now",
    NothingToBurn:
      "NothingToBurn: not enough fees to burn yet. Try again after more trades.",
    PriceOffReference:
      "PriceOffReference: price is off its reference, try later.",
    Pool4Unavailable:
      "Pool4Unavailable: the burn route is unavailable. Try later.",
    PoolUnavailable: "PoolUnavailable: the pool is unavailable. Try later.",
    StillEnslaved: "StillEnslaved: the ransom is not fully paid yet.",
    AlreadyBuried: "AlreadyBuried: the seat has already been freed.",
    SeatUnavailable:
      "SeatUnavailable: the hook cannot access the seat. The holder must make it available.",
    BurialRefused:
      "BurialRefused: the seat transfer failed. The holder may need to approve the hook.",
    Slippage:
      "Slippage: the burn output is below the contract minimum. Try later.",
  };
  if (name === "TooSoon") {
    const remaining = snapshot
      ? snapshot.lastBurnBlock + snapshot.burnBlocks - snapshot.block
      : undefined;
    return remaining !== undefined && remaining > 0n
      ? `TooSoon: wait ${remaining} blocks.`
      : "TooSoon: wait for the next block and try again.";
  }
  if (name)
    return errors[name] ?? `${name}: the contract rejected this transaction.`;
  const e = error as {
    code?: number;
    shortMessage?: string;
    message?: string;
    cause?: { code?: number };
  };
  if (
    e?.code === 4001 ||
    e?.cause?.code === 4001 ||
    /user rejected|user denied/i.test(e?.message ?? "")
  )
    return "Request declined in your wallet. You can try again.";
  if (/insufficient funds/i.test(e?.message ?? ""))
    return "Not enough ETH for this transaction and gas. Lower the amount or add ETH.";
  return (
    e?.shortMessage ??
    e?.message ??
    "Unable to complete the request. Check your connection and try again."
  ).slice(0, 300);
}
