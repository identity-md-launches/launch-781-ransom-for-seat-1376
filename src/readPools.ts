import {
  createPublicClient,
  custom,
  RpcRequestError,
  decodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  toFunctionSelector,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";

export const PAST_URLS = [
  "https://eth.drpc.org",
  "https://eth-mainnet.public.blastapi.io",
  "https://mainnet.rpc.sentio.xyz",
  "https://eth.api.pocket.network",
  "https://rpc.mevblocker.io",
  "https://rpc-eth.blockmachine.io",
  "https://mainnet.gateway.tenderly.co",
] as const;
export const LATEST_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://mainnet.rpc.sentio.xyz",
  "https://eth.api.pocket.network",
  "https://rpc-eth.blockmachine.io",
  "https://0xrpc.io/eth",
  "https://mainnet.gateway.tenderly.co",
  "https://rpc.mevblocker.io",
] as const;
type Request = { method: string; params?: readonly unknown[] };
const hex = (v: unknown) => typeof v === "string" && /^0x[\da-f]+$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
const aggregateShape = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);
const aggregateSelector = toFunctionSelector(aggregateShape[0]);
const abiBytes = (value: unknown) =>
  hex(value) &&
  (value as string).length >= 66 &&
  ((value as string).length - 2) % 64 === 0;
export function validResult(method: string, value: unknown) {
  if (method === "eth_call") return abiBytes(value);
  if (["eth_blockNumber", "eth_getBalance", "eth_chainId"].includes(method))
    return hex(value);
  if (method === "eth_getBlockByNumber")
    return (
      object(value) &&
      hex(value.number) &&
      hex(value.timestamp) &&
      hex(value.hash)
    );
  if (method === "eth_getLogs")
    return (
      Array.isArray(value) &&
      value.every(
        (log) =>
          object(log) &&
          hex(log.blockNumber) &&
          hex(log.blockHash) &&
          hex(log.transactionHash) &&
          hex(log.logIndex) &&
          hex(log.address) &&
          typeof log.data === "string" &&
          /^0x([\da-f]{2})*$/i.test(log.data) &&
          Array.isArray(log.topics) &&
          log.topics.every(hex),
      )
    );
  if (method === "eth_getBlockReceipts")
    return (
      Array.isArray(value) &&
      value.every(
        (r) =>
          object(r) &&
          hex(r.transactionHash) &&
          hex(r.from) &&
          hex(r.gasUsed) &&
          hex(r.effectiveGasPrice) &&
          Array.isArray(r.logs),
      )
    );
  return value !== undefined && value !== null;
}
const blockLabel = ({ method, params = [] }: Request) => {
  if (method === "eth_getLogs") {
    const p = params[0] as { fromBlock?: string; toBlock?: string };
    return `${p?.fromBlock}..${p?.toBlock}`;
  }
  return (
    params[method === "eth_call" || method === "eth_getBalance" ? 1 : 0] ??
    "latest"
  );
};

// A round tries each provider exactly once. Concurrent requests remember their own
// starting index; a failing old request cannot move a newer sticky choice backwards.
export function createReadPool(
  urls: readonly string[],
  options: {
    fetch?: typeof fetch;
    now?: () => number;
    timeout?: number;
    warn?: typeof console.warn;
  } = {},
) {
  const send = options.fetch ?? fetch,
    now = options.now ?? Date.now;
  let current = 0,
    resetAt = now() + 600_000,
    serial = 0;
  async function request(request: Request): Promise<unknown> {
    if (now() >= resetAt) {
      current = 0;
      resetAt = now() + 600_000;
    }
    const start = current;
    let last: unknown;
    for (let attempt = 0; attempt < urls.length; attempt++) {
      const index = (start + attempt) % urls.length,
        url = urls[index];
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const id = ++serial;
        const reply = await Promise.race([
          (async () => {
            const response = await send(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id, ...request }),
              signal: controller.signal,
            });
            if (!response.ok) throw Error(`HTTP ${response.status}`);
            return await response.json();
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(Error("No answer in 6 s"));
            }, options.timeout ?? 6000);
          }),
        ]);
        if (!object(reply) || reply.jsonrpc !== "2.0" || reply.id !== id)
          throw Error("Malformed JSON-RPC reply");
        if (object(reply.error)) {
          const error = reply.error;
          const rpcError = new RpcRequestError({
            body: request,
            url,
            error: {
              code: Number(error.code),
              message: String(error.message),
              data: error.data as never,
            },
          });
          // An executed EVM revert is an answer, including its original data.
          if (
            error.code === 3 ||
            /execution reverted|\bVM execution error\b/i.test(
              String(error.message),
            )
          )
            return Promise.reject(rpcError);
          throw rpcError;
        }
        if ("error" in reply || !validResult(request.method, reply.result))
          throw Error("Malformed RPC result");
        const data = (request.params?.[0] as { data?: Hex } | undefined)?.data;
        if (
          request.method === "eth_call" &&
          data?.startsWith(aggregateSelector)
        ) {
          const calls = decodeFunctionData({ abi: aggregateShape, data })
            .args[0];
          const results = decodeFunctionResult({
            abi: aggregateShape,
            functionName: "aggregate3",
            data: reply.result as Hex,
          });
          if (
            results.length !== calls.length ||
            results.some((r) => r.success && !abiBytes(r.returnData))
          )
            throw Error("Malformed aggregate result");
        }
        return reply.result;
      } catch (error) {
        last = error;
        (options.warn ?? console.warn)(
          "[display RPC]",
          new URL(url).host,
          request.method,
          blockLabel(request),
          error,
        );
        if (current === index) current = (index + 1) % urls.length;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
    throw last;
  }
  return { request, current: () => urls[current] };
}
export const pastPool = createReadPool(PAST_URLS);
export const latestPool = createReadPool(LATEST_URLS);
export const pastReads = createPublicClient({
  chain: mainnet,
  transport: custom(pastPool, { retryCount: 0 }),
});
export const latestReads = createPublicClient({
  chain: mainnet,
  transport: custom(latestPool, { retryCount: 0 }),
});
