import { parseAbi } from "viem";
import { rpc } from "./chain";

export const ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
export const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);
export type DollarRound = { answer: bigint; updatedAt: bigint };
export function freshDollars(round?: DollarRound, now = Date.now()) {
  if (!round || round.answer <= 0n || round.updatedAt <= 0n) return undefined;
  const age = Math.floor(now / 1000) - Number(round.updatedAt);
  return age >= 0 && age <= 3 * 60 * 60
    ? Number(round.answer) / 1e8
    : undefined;
}
export async function readDollars(
  read = () =>
    rpc.readContract({
      address: ETH_USD_FEED,
      abi: feedAbi,
      functionName: "latestRoundData",
    }),
): Promise<DollarRound | undefined> {
  try {
    const [roundId, answer, , updatedAt, answeredInRound] = await read();
    const round = { answer, updatedAt };
    return answeredInRound >= roundId && freshDollars(round) !== undefined
      ? round
      : undefined;
  } catch {
    return undefined;
  }
}
export function dollarValue(
  eth: number,
  dollars: number | undefined,
  digits: 0 | 2,
) {
  if (dollars === undefined || !Number.isFinite(eth) || eth < 0)
    return undefined;
  return `≈ $${(eth * dollars).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
