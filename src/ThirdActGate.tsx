export function ThirdActSeal() {
  return <span className="act-seal">sealed</span>;
}

export function ThirdActGate({ fulfilled = false }: { fulfilled?: boolean }) {
  return (
    <p className="third-act-gate">
      {fulfilled ? (
        "The second act is fulfilled. The third act opens next."
      ) : (
        <>
          The third act opens when the person who owned me sells the bag he kept
          and gets 8.67 ETH back. Everything is in{" "}
          <a href="#second-act">the second act</a>.
        </>
      )}
    </p>
  );
}
