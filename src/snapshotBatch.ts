import {
  decodeFunctionResult,
  type Address,
  type ContractFunctionReturnType,
} from "viem";
import {
  ADDR,
  POOL_ID,
  deriveState,
  hookAbi,
  parseMetadata,
  seatAbi,
  stateAbi,
  tokenAbi,
  verifyManifesto,
  type Snapshot,
} from "./chain";
import {
  ETH_USD_FEED,
  feedAbi,
  readDollars,
  type DollarRound,
} from "./dollars";
import { swapRpc } from "./swapReads";
import {
  batchBlock,
  blockCalls,
  contractCall,
  liveBatch,
  required,
  type LiveCaller,
} from "./liveBatch";

// IMD is an immutable hook dependency. Discover its address once per visit,
// then read its decimals inside every snapshot (and confirm the address).
export function createSnapshotReader(
  discover: () => Promise<Address> = () =>
    swapRpc.readContract({
      address: ADDR.hook,
      abi: hookAbi,
      functionName: "IMD",
    }),
  call?: LiveCaller,
) {
  let dependency: Promise<Address> | undefined;
  return async (
    publishDollars?: (round: DollarRound | undefined) => void,
  ): Promise<Snapshot> => {
    let published = false;
    try {
      dependency ??= discover().catch((error) => {
        dependency = undefined;
        throw error;
      });
      const imd = await dependency;
      const names = [
        "totalFees",
        "CREATOR_CAP",
        "buried",
        "totalIMDBurned",
        "burnable",
        "MIN_BURN",
        "lastBurnBlock",
        "MIN_BLOCKS_BETWEEN_BURNS",
        "status",
        "MANIFESTO_HASH",
        "IMD",
        "MANIFESTO",
      ] as const;
      const results = await liveBatch(
        [
          ...names.map((name) => contractCall(ADDR.hook, hookAbi, name)),
          contractCall(ADDR.seat, seatAbi, "tokenURI", [1376n]),
          contractCall(ADDR.seat, seatAbi, "getApproved", [1376n]),
          contractCall(ADDR.stateView, stateAbi, "getSlot0", [POOL_ID]),
          contractCall(ADDR.token, tokenAbi, "decimals"),
          contractCall(ADDR.token, tokenAbi, "totalSupply"),
          contractCall(imd, tokenAbi, "decimals"),
          contractCall(ETH_USD_FEED, feedAbi, "latestRoundData"),
          ...blockCalls(),
        ],
        call,
      );
      // The optional feed retains its independent failure behavior.
      publishDollars?.(
        await readDollars(async () =>
          decodeFunctionResult({
            abi: feedAbi,
            functionName: "latestRoundData",
            data: required(results, 18),
          }),
        ),
      );
      published = true;
      const hook = <N extends (typeof names)[number]>(name: N) =>
        decodeFunctionResult({
          abi: hookAbi,
          functionName: name as (typeof names)[number],
          data: required(results, names.indexOf(name)),
        }) as ContractFunctionReturnType<typeof hookAbi, "view", N>;
      const fees = hook("totalFees"),
        cap = hook("CREATOR_CAP"),
        buried = hook("buried");
      // A sealed testament is neither required nor exposed, even if its optional
      // aggregate subcall returns data or reverts before burial.
      const manifesto = buried ? hook("MANIFESTO") : undefined;
      const manifestoHash = hook("MANIFESTO_HASH");
      if (hook("IMD").toLowerCase() !== imd.toLowerCase()) {
        dependency = undefined;
        throw Error("Snapshot dependency changed");
      }
      const uri = decodeFunctionResult({
        abi: seatAbi,
        functionName: "tokenURI",
        data: required(results, 12),
      });
      const approved = decodeFunctionResult({
        abi: seatAbi,
        functionName: "getApproved",
        data: required(results, 13),
      });
      const slot0 = decodeFunctionResult({
        abi: stateAbi,
        functionName: "getSlot0",
        data: required(results, 14),
      });
      const decimals = decodeFunctionResult({
        abi: tokenAbi,
        functionName: "decimals",
        data: required(results, 15),
      });
      const supply = decodeFunctionResult({
        abi: tokenAbi,
        functionName: "totalSupply",
        data: required(results, 16),
      });
      const imdDecimals = decodeFunctionResult({
        abi: tokenAbi,
        functionName: "decimals",
        data: required(results, 17),
      });
      const block = batchBlock(results);
      return {
        fees,
        cap,
        buried,
        burned: hook("totalIMDBurned"),
        burnable: hook("burnable"),
        minBurn: hook("MIN_BURN"),
        lastBurnBlock: hook("lastBurnBlock"),
        burnBlocks: hook("MIN_BLOCKS_BETWEEN_BURNS"),
        status: hook("status"),
        manifesto,
        manifestoHash,
        manifestoVerified:
          manifesto !== undefined && verifyManifesto(manifesto, manifestoHash),
        seatApproved: approved.toLowerCase() === ADDR.hook.toLowerCase(),
        metadata: parseMetadata(uri),
        uri,
        decimals,
        supply,
        imdDecimals,
        tokensPerEth: (Number(slot0[0]) / 2 ** 96) ** 2 * 10 ** (18 - decimals),
        state: deriveState(fees, cap, buried),
        block: block.number,
        timestamp: block.timestamp,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      // A failed aggregate has no usable feed either.
      if (!published) publishDollars?.(undefined);
      throw error;
    }
  };
}
export const readBatchedSnapshot = createSnapshotReader();
