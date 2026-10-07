import { recordHasBuy, type RecordState } from "./walletRecord";

export function recordVerdicts(lines: string[], record?: RecordState) {
  const verdicts = lines.filter(
    (line) => line !== "HE BOUGHT AGAIN." && line !== "HE SOLD EARLY.",
  );
  if (record?.data && !record.pending && !record.failed) {
    if (recordHasBuy(record.data)) verdicts.push("HE BOUGHT AGAIN.");
    if (record.data.firstDecreaseAllowed === false)
      verdicts.push("HE SOLD EARLY.");
  }
  return verdicts;
}
