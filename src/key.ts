import { getAddress, numberToHex, parseAbi, type Hex } from "viem";
import { ADDR, parseMetadata, rpc } from "./chain";

export const KEY_ADDRESS = "0x64547f1130CCAFa2f50D98a86f1306b2e515e416";
export const KEY_OPENSEA = `https://opensea.io/assets/ethereum/${KEY_ADDRESS.toLowerCase()}/1376`;
export const CREATOR_PAID =
  "0x12f457cfb647c80d6e273e6691a31625fd025906b82c043614fbff887aea5666" as Hex;
export const keyAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function contractURI() view returns (string)",
  "function tokenURI(uint256) view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "function liberator() view returns (address)",
  "function witnesses() view returns (uint256)",
  "function panel() view returns (uint256)",
  "function oracleRequest() view returns (bytes32)",
  "function windowFrom() view returns (uint256)",
  "function windowTo() view returns (uint256)",
]);
type KeyFunction = (typeof keyAbi)[number]["name"];
export const keySource = {
  block: () => rpc.getBlockNumber({ cacheTime: 0 }),
  read: (functionName: KeyFunction, blockNumber: bigint) =>
    rpc.readContract({
      address: KEY_ADDRESS,
      abi: keyAbi,
      functionName,
      args: ["ownerOf", "tokenURI"].includes(functionName)
        ? [1376n]
        : undefined,
      blockNumber,
    }),
  logs: (from: bigint, to: bigint) =>
    rpc.request({
      method: "eth_getLogs",
      params: [
        {
          address: ADDR.hook,
          topics: [CREATOR_PAID],
          fromBlock: numberToHex(from),
          toBlock: numberToHex(to),
        },
      ],
    }),
};
export type KeySource = typeof keySource;
export type KeyData =
  | { given: false; image: string; block: bigint }
  | {
      given: true;
      image: string;
      block: bigint;
      holder: string;
      liberator: string;
      witnesses: bigint;
      panel: bigint;
      request: string;
      transaction?: Hex;
    };
export function uuidFromBytes32(value: string) {
  if (!/^0x[\da-f]{64}$/i.test(value))
    throw new Error("Invalid oracle request");
  const h = value.slice(2, 34).toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function readKey(source: KeySource = keySource): Promise<KeyData> {
  const block = await source.block();
  const supply = await source.read("totalSupply", block);
  if (supply === 0n)
    return {
      given: false,
      block,
      image: parseMetadata((await source.read("contractURI", block)) as string)
        .image,
    };
  if (supply !== 1n) throw new Error("Unexpected key supply");
  const [holder, liberator, witnesses, panel, request, from, to, uri] =
    await Promise.all(
      (
        [
          "ownerOf",
          "liberator",
          "witnesses",
          "panel",
          "oracleRequest",
          "windowFrom",
          "windowTo",
          "tokenURI",
        ] as const
      ).map((name) => source.read(name, block)),
    );
  let transaction: Hex | undefined;
  try {
    const logs = await source.logs(from as bigint, to as bigint);
    transaction =
      logs.find((log) => !log.removed && log.transactionHash)
        ?.transactionHash ?? undefined;
  } catch {
    /* Provenance is optional when public RPC log reads fail. */
  }
  return {
    given: true,
    block,
    image: parseMetadata(uri as string).image,
    holder: getAddress(holder as string),
    liberator: getAddress(liberator as string),
    witnesses: witnesses as bigint,
    panel: panel as bigint,
    request: uuidFromBytes32(request as string),
    transaction,
  };
}
