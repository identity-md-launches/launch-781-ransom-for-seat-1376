import type { Address } from "viem";
import { ADDR, POOL_ID, rpc, stateAbi, tokenAbi } from "./chain";
import { ETH_USD_FEED, feedAbi, freshDollars } from "./dollars";
import { fixedAmount } from "./display";

export const NINE_WALLETS = [
  "0xE6936bb632144feFF2C6ae0BbA1adB7C80336B84",
  "0xe6FE71c54bEaF6F92738d52Eca557b07975717a6",
  "0x77e78f9f2Ff0C9EC68d75E8Db504c2605de2B04B",
  "0xDe03c2878AB5A9978104bfb599e230A81Ad2237c",
  "0x687c2B594bb0B939Ad99A2D5733f42d7f002E48b",
  "0x4f1AdcB5Bd35746C80fF526eCE9434954547D45f",
  "0x77b34ef11133DC5E63DB0DC1E042C5806c0355d2",
  "0xF04F2C7413376cEd93f1A768358c128446EF463B",
  "0x556A49E423e408380f21f09Ee74be784d8EB0Ef4",
] as const satisfies readonly Address[];
export const HIS_WALLET = ADDR.creator;
export const DEAD = "0x000000000000000000000000000000000000dEaD";
export const H0 = 189216124316902036478811955n;
export const S0 = 10n ** 27n;
export const M0 = 12160406576973525384826126n;
export const DEADLINE = 1791392400;
export const CASH_OUT = 8670000000000000000n;
export const WATCH_INTERVAL = 15_000;
const Q192 = 1n << 192n;

export const watchSource = {
  block: () => rpc.getBlock(),
  balance: (owner: Address, blockNumber: bigint) =>
    rpc.readContract({
      address: ADDR.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [owner],
      blockNumber,
    }),
  supply: (blockNumber: bigint) =>
    rpc.readContract({
      address: ADDR.token,
      abi: tokenAbi,
      functionName: "totalSupply",
      blockNumber,
    }),
  price: async (blockNumber: bigint) =>
    (
      await rpc.readContract({
        address: ADDR.stateView,
        abi: stateAbi,
        functionName: "getSlot0",
        args: [POOL_ID],
        blockNumber,
      })
    )[0],
  dollars: (blockNumber: bigint) =>
    rpc.readContract({
      address: ETH_USD_FEED,
      abi: feedAbi,
      functionName: "latestRoundData",
      blockNumber,
    }),
};
export type WatchSource = Omit<typeof watchSource, "block"> & {
  block: () => Promise<{ number: bigint; timestamp: bigint }>;
};
export type WatchSnapshot = {
  block: bigint;
  timestamp: bigint;
  balances: readonly bigint[];
  main: bigint;
  dead: bigint;
  supply: bigint;
  sqrtPriceX96: bigint;
  ethUsd: bigint;
};

// Commit a complete, same-block snapshot or reject it as a whole.
export async function readWatch(
  source: WatchSource = watchSource,
): Promise<WatchSnapshot> {
  const block = await source.block();
  const [balances, main, dead, supply, sqrtPriceX96, round] = await Promise.all(
    [
      Promise.all(
        NINE_WALLETS.map((owner) => source.balance(owner, block.number)),
      ),
      source.balance(HIS_WALLET, block.number),
      source.balance(DEAD, block.number),
      source.supply(block.number),
      source.price(block.number),
      source.dollars(block.number),
    ],
  );
  if (
    sqrtPriceX96 <= 0n ||
    round[4] < round[0] ||
    freshDollars({ answer: round[1], updatedAt: round[3] }) === undefined
  )
    throw new Error("Watch price unavailable");
  return {
    block: block.number,
    timestamp: block.timestamp,
    balances,
    main,
    dead,
    supply,
    sqrtPriceX96,
    ethUsd: round[1],
  };
}

export function watchTotals(data: WatchSnapshot) {
  const nine = data.balances.reduce((total, balance) => total + balance, 0n);
  const burned = S0 - data.supply + data.dead;
  const out = H0 - nine;
  const gained = data.main - M0;
  // Both assets have 18 decimals; sqrtPriceX96 encodes token wei / ETH wei.
  const priceSquared = data.sqrtPriceX96 * data.sqrtPriceX96;
  const ethNumerator = data.main * Q192;
  return {
    nine,
    burned,
    out,
    gained,
    eth: ethNumerator / priceSquared,
    belowCashOut: ethNumerator < CASH_OUT * priceSquared,
  };
}

export function watchVerdicts(
  data: WatchSnapshot,
  now = Math.floor(Date.now() / 1000),
) {
  const { nine, burned, out, gained, belowCashOut } = watchTotals(data);
  const lines: string[] = [];
  if (out === 0n) lines.push(now < DEADLINE ? "WAITING." : "HELD.");
  if (out > 0n && burned >= out)
    lines.push(nine === 0n ? "BURNED. ALL OF IT." : "BURNED.");
  if (out > burned)
    lines.push(
      gained >= out - burned ? "CARRIED TO HIS OWN WALLET." : "SOLD OR MOVED.",
    );
  if (gained > (out > burned ? out - burned : 0n))
    lines.push("HE BOUGHT AGAIN.");
  if (data.main < M0 && belowCashOut) lines.push("HE SOLD EARLY.");
  return lines;
}

export function watchCountdown(now = Math.floor(Date.now() / 1000)) {
  if (now >= DEADLINE) return "the deadline has passed";
  const minutes = Math.floor((DEADLINE - now) / 60);
  return `time left ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export const watchTokens = (value: bigint) =>
  fixedAmount(value, 18, 2, "nearest");
export function watchValue(data: WatchSnapshot) {
  const { eth } = watchTotals(data);
  return `≈ ${fixedAmount(eth, 18, 6, "nearest")} ETH ($${fixedAmount(eth * data.ethUsd, 26, 0, "nearest")})`;
}

export type WatchState = { data?: WatchSnapshot; failed: boolean };
// App owns this subscription, so changing acts never interrupts the watch.
export function pollWatch(
  publish: (state: WatchState) => void,
  read = readWatch,
) {
  let active = true,
    pending = false;
  let state: WatchState = { failed: false };
  const refresh = async () => {
    if (pending) return;
    pending = true;
    try {
      const data = await read();
      if (active) publish((state = { data, failed: false }));
    } catch {
      if (active) publish((state = { ...state, failed: true }));
    } finally {
      pending = false;
    }
  };
  void refresh();
  const timer = setInterval(refresh, WATCH_INTERVAL);
  return () => {
    active = false;
    clearInterval(timer);
  };
}
