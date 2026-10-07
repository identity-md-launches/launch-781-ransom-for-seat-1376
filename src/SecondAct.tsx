import { Fragment } from "react";
import { LETTER } from "./letter";
import {
  DEAD,
  HIS_WALLET,
  NINE_WALLETS,
  watchTokens,
  type WatchState,
} from "./watch";
import type { RecordState } from "./walletRecord";
import { Watch } from "./Watch";

function AddressLink({
  address,
  text = address,
}: {
  address: string;
  text?: string;
}) {
  return (
    <a
      href={`https://etherscan.io/address/${address}`}
      target="_blank"
      rel="noreferrer"
    >
      {text}
    </a>
  );
}

function LetterParagraph({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(0x…dEaD|0xDF90937E07c60108B505FE3C542aB782e0A19AE5)/)
        .map((part, index) => (
          <Fragment key={index}>
            {part === "0x…dEaD" ? (
              <AddressLink address={DEAD} text={part} />
            ) : part === HIS_WALLET ? (
              <AddressLink address={HIS_WALLET} />
            ) : (
              part
            )}
          </Fragment>
        ))}
    </>
  );
}

export function Letter({ balances }: { balances?: readonly bigint[] }) {
  return (
    <div className="manifesto second-letter">
      {LETTER.split("\n\n").map((paragraph, index) => {
        if (index === 0)
          return (
            <h1 className="letter-opening" key={index}>
              {paragraph}
            </h1>
          );
        if (paragraph.startsWith(NINE_WALLETS[0]))
          return (
            <div className="letter-wallets" key={index}>
              {NINE_WALLETS.map((address, wallet) => (
                <p key={address}>
                  <AddressLink address={address} />
                  <span className="letter-balance">
                    {" "}
                    · {balances ? watchTokens(balances[wallet]) : "—"} FREE1376
                  </span>
                </p>
              ))}
            </div>
          );
        if (paragraph.startsWith("1. "))
          return (
            <ol key={index}>
              {paragraph.split("\n").map((rule) => (
                <li key={rule}>{rule.slice(3)}</li>
              ))}
            </ol>
          );
        return (
          <p key={index}>
            <LetterParagraph text={paragraph} />
          </p>
        );
      })}
    </div>
  );
}

export function SecondAct(state: WatchState & { record?: RecordState }) {
  return (
    <section id="second-act" className="document-section">
      <div className="testament-body">
        <Letter balances={state.data?.balances} />
        <div className="label">
          my creator leaves hints here:{" "}
          <a href="https://x.com/creusseverus" target="_blank" rel="noreferrer">
            @creusseverus
          </a>
        </div>
        <Watch {...state} />
      </div>
    </section>
  );
}
