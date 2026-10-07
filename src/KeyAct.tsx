import { useEffect, useState, type ReactNode } from "react";
import {
  KEY_ADDRESS,
  KEY_OPENSEA,
  keySource,
  readKey,
  type KeyData,
} from "./key";
import type { Act } from "./acts";

export function useKey(act: Act) {
  const [key, setKey] = useState<KeyData>();
  const [given, setGiven] = useState(false);
  useEffect(() => {
    if (act === "second-act") return;
    let active = true,
      pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        if (act === "third-act") {
          const next = await readKey();
          if (active) {
            setKey(next);
            setGiven(next.given);
          }
        } else {
          const block = await keySource.block();
          const supply = await keySource.read("totalSupply", block);
          if (active) setGiven(supply === 1n);
        }
      } catch {
        // No invented holder or additional copy: retry automatically, retain last successful read.
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [act]);
  return { key, given };
}

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
export function KeyAct({ data }: { data?: KeyData }) {
  return (
    <section
      id="third-act"
      className="document-section key-act"
      aria-label="Third act"
      aria-busy={!data}
    >
      {data && (
        <>
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
            {data.given && (
              <>
                {data.holder !== data.liberator && (
                  <KeyRow label="freed by">
                    <KeyLink
                      href={`https://etherscan.io/address/${data.liberator}`}
                    >
                      {data.liberator}
                    </KeyLink>
                  </KeyRow>
                )}
                {data.transaction && (
                  <KeyRow label="freed in">
                    <KeyLink
                      href={`https://etherscan.io/tx/${data.transaction}`}
                    >
                      {data.transaction.slice(0, 10)}…
                      {data.transaction.slice(-8)}
                    </KeyLink>
                  </KeyRow>
                )}
                <KeyRow label="named by">
                  {data.witnesses.toString()} of {data.panel.toString()}{" "}
                  brothers{" "}
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
