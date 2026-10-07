import { PAID_START, type PaidBlock } from "./paid";
import { H0 } from "./watch";

export type BurnSource = {
  burned: (block: bigint) => Promise<bigint>;
  total: (block: bigint) => Promise<bigint>;
  block: (number: bigint) => Promise<PaidBlock>;
};

// Burned supply plus the dead balance is monotonic; live wallet balances are not.
export async function findBurnPaidBlock(latest: PaidBlock, source: BurnSource) {
  if (latest.number < PAID_START || (await source.burned(latest.number)) < H0)
    return;
  let low = PAID_START;
  let high = latest.number;
  while (low < high) {
    const middle = (low + high) / 2n;
    if ((await source.burned(middle)) >= H0) high = middle;
    else low = middle + 1n;
  }
  if ((await source.total(low)) !== 0n) return;
  return low === latest.number ? latest : source.block(low);
}
