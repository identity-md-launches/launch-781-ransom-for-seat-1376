import { parseAbi } from "viem";
export { keySource, readKey, readKeyStatus } from "./keyReads";
export type { KeySource } from "./keyReads";

export const KEY_ADDRESS = "0x64547f1130CCAFa2f50D98a86f1306b2e515e416";
export const KEY_OPENSEA = `https://opensea.io/assets/ethereum/${KEY_ADDRESS.toLowerCase()}/1376`;
export const keyAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function contractURI() view returns (string)",
  "function tokenURI(uint256) view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "function liberator() view returns (address)",
  "function witnesses() view returns (uint256)",
  "function panel() view returns (uint256)",
  "function oracleRequest() view returns (bytes32)",
]);
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
    };
export function uuidFromBytes32(value: string) {
  if (!/^0x[\da-f]{64}$/i.test(value))
    throw new Error("Invalid oracle request");
  const h = value.slice(2, 34).toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
