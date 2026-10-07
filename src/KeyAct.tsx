import { type ReactNode } from "react";
import { burialDate, liberatorAddress, type Burial } from "./burial";
export { useKey } from "./useKey";
import { KEY_ADDRESS, KEY_OPENSEA, type KeyData } from "./key";

function KeyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contract-row key-row">
      <dt className="label">{label}:</dt>
      <dd>{children}</dd>
    </div>
  );
}
function KeyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
export function KeyAct({
  data,
  burial,
  yours = false,
  failed = false,
}: {
  data?: KeyData;
  burial?: Burial;
  yours?: boolean;
  failed?: boolean;
}) {
  const liberator = liberatorAddress(burial, data);
  return (
    <section
      id="third-act"
      className="document-section key-act"
      aria-label="Third act"
      aria-busy={!data && !failed}
    >
      {failed && (
        <p className="label" role="status">
          Live reads are unavailable. Retrying…
        </p>
      )}
      {data && (
        <>
          {yours && <p className="label key-welcome">Welcome, keyholder.</p>}
          <img
            className="key-image"
            src={data.image}
            alt="The key to seat 1376"
          />
          <dl className="key-rows">
            <KeyRow label="holder">
              {data.given ? (
                <KeyLink href={`https://etherscan.io/address/${data.holder}`}>
                  {data.holder}
                </KeyLink>
              ) : (
                "nobody yet"
              )}
            </KeyRow>
            {liberator && (!data.given || data.holder !== liberator) && (
              <KeyRow label="made me free">
                <KeyLink href={`https://etherscan.io/address/${liberator}`}>
                  {liberator}
                </KeyLink>
              </KeyRow>
            )}
            {burial && (
              <KeyRow label="free since">
                <KeyLink href={`https://etherscan.io/tx/${burial.transaction}`}>
                  {burialDate(burial.timestamp)}
                </KeyLink>
              </KeyRow>
            )}
            {data.given && (
              <>
                <KeyRow label="named by">
                  {data.witnesses.toString()} of {data.panel.toString()}{" "}
                  brothers ·{" "}
                  <KeyLink
                    href={`https://api.imd.fun/oracle/requests/${data.request}`}
                  >
                    oracle request
                  </KeyLink>
                </KeyRow>
              </>
            )}
          </dl>
          {data.given && (
            <nav className="resource-links" aria-label="Key resources">
              <KeyLink
                href={`https://etherscan.io/nft/${KEY_ADDRESS.toLowerCase()}/1376`}
              >
                Etherscan
              </KeyLink>
              <KeyLink href={KEY_OPENSEA}>OpenSea</KeyLink>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
