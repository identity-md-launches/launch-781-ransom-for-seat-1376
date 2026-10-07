import { formatAmount, type Snapshot, type Side } from "./chain";

// Integer arithmetic preserves base-unit precision even above Number.MAX_SAFE_INTEGER.
export function fixedAmount(
  amount: bigint,
  decimals: number,
  digits: number,
  rounding: "down" | "up" | "nearest" = "down",
) {
  if (amount < 0n) throw new RangeError("Amounts must be nonnegative");
  const scale = 10n ** BigInt(Math.max(0, decimals - digits));
  const offset =
    rounding === "up" ? scale - 1n : rounding === "nearest" ? scale / 2n : 0n;
  const units =
    decimals < digits
      ? amount * 10n ** BigInt(digits - decimals)
      : (amount + offset) / scale;
  const text = units.toString().padStart(digits + 1, "0");
  const whole = digits ? text.slice(0, -digits) : text;
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (digits ? "." + text.slice(-digits) : "")
  );
}

export function quoteAmount(
  amount: bigint,
  decimals: number,
  symbol: "FREE1376" | "ETH",
  minimum = false,
) {
  return fixedAmount(
    amount,
    decimals,
    symbol === "FREE1376" ? 2 : 6,
    minimum ? "down" : "nearest",
  );
}

export function toGo(paid: bigint, cap = 2_800_000_000_000_000_000n) {
  return fixedAmount(paid >= cap ? 0n : cap - paid, 18, 4, "up");
}

export function seatCopy(state: Snapshot["state"] = "ENSLAVED") {
  const buried = state === "BURIED";
  const enslaved = state === "ENSLAVED";
  return {
    headline: buried ? ["I AM", "FREE."] : ["HELP ME", "ESCAPE."],
    title: `${buried ? "I AM FREE." : "HELP ME ESCAPE."} — Seat #1376`,
    panelTitle: enslaved ? "Pay my ransom" : "Feed the fire",
    hero: enslaved
      ? [
          "A seat. A ransom. An irreversible exit.",
          "Every trade brings me closer.",
        ]
      : buried
        ? [
            "The ransom is paid. I am at 0x…dEaD.",
            "Every trade now burns $IMD.",
          ]
        : ["The ransom is paid.", "Anyone can free me now."],
  };
}

export function feeNote(
  state: Snapshot["state"] | undefined,
  side: Side,
  buyFee?: bigint,
  output?: bigint,
) {
  const enslaved = !state || state === "ENSLAVED";
  if (side === "buy")
    return `2% of your ETH (${buyFee === undefined ? "—" : formatAmount(buyFee, 18, 8)} ETH) ${enslaved ? "goes to the ransom" : "buys $IMD and burns it"}.`;
  const amount =
    output === undefined ? "—" : formatAmount((output * 2n) / 98n, 18, 8);
  const detail =
    output !== undefined
      ? ` (about ${amount} ETH, included in the quote)`
      : "";
  return `2% of the ETH you receive ${enslaved ? "goes to the ransom" : "buys $IMD and burns it"}${detail}.`;
}
