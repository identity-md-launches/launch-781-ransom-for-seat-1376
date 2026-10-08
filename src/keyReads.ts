import { getAddress } from "viem";
import { parseMetadata } from "./chain";
import { KEY_ADDRESS, keyAbi, uuidFromBytes32, type KeyData } from "./key";

import { latestReads, pastReads } from "./readPools";

type KeyFunction = (typeof keyAbi)[number]["name"];
export const keySource = {
  block: () => latestReads.getBlockNumber({ cacheTime: 0 }),
  read: (functionName: KeyFunction, blockNumber: bigint) =>
    pastReads.readContract({
      address: KEY_ADDRESS,
      abi: keyAbi,
      functionName,
      args: ["ownerOf", "tokenURI"].includes(functionName)
        ? [1376n]
        : undefined,
      blockNumber,
    }),
};
export type KeySource = typeof keySource;
export type KeyStatus =
  | { given: false; block: bigint }
  | { given: true; block: bigint; holder: string; liberator: string };

export async function readKeyStatus(
  source: KeySource = keySource,
): Promise<KeyStatus> {
  const block = await source.block();
  const supply = await source.read("totalSupply", block);
  if (supply === 0n) return { given: false, block };
  if (supply !== 1n) throw new Error("Unexpected key supply");
  const [holder, liberator] = await Promise.all([
    source.read("ownerOf", block),
    source.read("liberator", block),
  ]);
  return {
    given: true,
    block,
    holder: getAddress(holder as string),
    liberator: getAddress(liberator as string),
  };
}
export async function readKey(source: KeySource = keySource): Promise<KeyData> {
  const status = await readKeyStatus(source);
  if (!status.given)
    return {
      ...status,
      image: parseMetadata(
        (await source.read("contractURI", status.block)) as string,
      ).image,
    };
  const [uri, witnesses, panel, request] = await Promise.all(
    (["tokenURI", "witnesses", "panel", "oracleRequest"] as const).map((name) =>
      source.read(name, status.block),
    ),
  );
  return {
    ...status,
    image: parseMetadata(uri as string).image,
    witnesses: witnesses as bigint,
    panel: panel as bigint,
    request: uuidFromBytes32(request as string),
  };
}
export function isKeyholder(account?: string, key?: KeyStatus) {
  return Boolean(
    account && key?.given && account.toLowerCase() === key.holder.toLowerCase(),
  );
}
