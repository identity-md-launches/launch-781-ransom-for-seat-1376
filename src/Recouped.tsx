import { fixedAmount } from "./display";
import { paidTime } from "./paid";
import { watchTokens } from "./watch";
import { recouped, recordFulfilled, type RecordState } from "./walletRecord";

export function Recouped({ record }: { record: RecordState }) {
  return (
    <section
      className="paid-section"
      aria-labelledby="recouped-title"
      aria-busy={record.pending}
    >
      <h2 className="label" id="recouped-title">
        RECOUPED
      </h2>
      <p>
        recouped by selling:{" "}
        {record.data
          ? fixedAmount(recouped(record.data), 18, 4, "nearest")
          : "—"}{" "}
        of 8.67 ETH. The third act opens at 8.67.
      </p>
      <div className="offer-rows">
        {record.data?.changes
          .filter((change) => change.kind === "sale")
          .map((sale) => (
            <p className="contract-row offer-row" key={sale.block.toString()}>
              <a
                href={`https://etherscan.io/tx/${sale.transaction}`}
                target="_blank"
                rel="noreferrer"
              >
                {paidTime(sale.timestamp)} ·{" "}
                {watchTokens(sale.before - sale.after)} FREE1376 →{" "}
                {fixedAmount(sale.proceeds, 18, 4, "nearest")} ETH
              </a>
            </p>
          ))}
      </div>
      <div role="status">
        {recordFulfilled(record) && (
          <p className="sealed-headline">THE SECOND ACT IS FULFILLED.</p>
        )}
      </div>
      <p className="label" role="status">
        {record.failed ? "Live reads are unavailable. Retrying…" : ""}
      </p>
    </section>
  );
}
