import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { decodeEventLog, formatEther, parseAbiItem } from 'viem';
import { readBatchedWatch } from '../src/watchBatch';
import { createSnapshotReader } from '../src/snapshotBatch';
import { readWatch, watchSource } from '../src/watch';
import { readPoolSwaps, swapRpc, swapArchive, SWAP_EVENT, POOL_MANAGER } from '../src/swapReads';
import { traderEth, swapSide } from '../src/swapTape';
import { POOL_ID } from '../src/chain';
const report: Record<string,unknown>={checkedAt:new Date().toISOString(),etherscan:'HTTP 403 challenge; direct explorer comparison unavailable'};
try {
  const watch=await readBatchedWatch();
  const direct=await readWatch({...watchSource,block:async()=>({number:watch.block,timestamp:watch.timestamp})});
  assert.deepEqual(watch,direct);report.watch={block:watch.block,equal:true};
  const snapshot=await createSnapshotReader()();report.snapshot={block:snapshot.block,state:snapshot.state,decimals:snapshot.decimals,imdDecimals:snapshot.imdDecimals,manifestoVerified:snapshot.manifestoVerified};
  const head=await swapRpc.getBlockNumber({cacheTime:0});
  const logs=[];
  for(let end=head;end>head-10000n;end-=2000n) {
    logs.push(...await readPoolSwaps(end-1999n,end));
    if(logs.length>=7 && logs.some(s=>s.amount0<0n))break;
  }
  logs.sort((a,b)=>Number(b.block-a.block)||b.logIndex-a.logIndex);
  const selected=[...logs.slice(0,7)];
  const buy=logs.find(s=>s.amount0<0n);if(buy && !selected.includes(buy))selected.push(buy);
  const trades: Record<string, unknown>[]=[];report.trades=trades;
  for (const swap of selected) {
    const receipt=await swapRpc.getTransactionReceipt({hash:swap.transaction});
    const tx=await swapRpc.getTransaction({hash:swap.transaction});
    const decoded=receipt.logs.filter(l=>l.address.toLowerCase()===POOL_MANAGER.toLowerCase()).flatMap(l=>{
      try {const d=decodeEventLog({abi:[SWAP_EVENT],data:l.data,topics:l.topics});return d.args.id===POOL_ID?[d]:[];} catch{return [];}
    });
    assert.ok(decoded.some(l=>l.args.amount0===swap.amount0));
    const [before,after,block]=await Promise.all([
      swapArchive.getBalance({address:tx.from,blockNumber:swap.block-1n}),
      swapArchive.getBalance({address:tx.from,blockNumber:swap.block}),
      swapRpc.getBlock({blockNumber:swap.block,includeTransactions:true}),
    ]);
    const gas=receipt.gasUsed*receipt.effectiveGasPrice;
    const paid=swap.amount0<0n ? before-after-gas : after-before+gas;
    const expected=traderEth(swap);
    const ownTx=block.transactions.filter(t=>t.from.toLowerCase()===tx.from.toLowerCase()).length;
    const displayed=Number(formatEther(expected)).toFixed(4);
    const actualDisplayed=Number(formatEther(paid)).toFixed(4);
    const wethTransfers=receipt.logs.filter(l=>l.address.toLowerCase()==='0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2').flatMap(l=>{
      try {const d=decodeEventLog({abi:[parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')],data:l.data,topics:l.topics});return [{...d.args,displayed:Number(formatEther(d.args.value)).toFixed(4)}];}catch{return [];}
    });
    trades.push({wethTransfers,wrappedPayoutMatches:wethTransfers.some(t=>t.displayed===displayed),transaction:swap.transaction,block:swap.block,side:swapSide(swap),amount0:swap.amount0,traderEth:expected,displayed,transactionValue:tx.value,senderNativeChangeExcludingGas:paid,actualDisplayed,ownTransactionsInBlock:ownTx,displayMatchesBalance:displayed===actualDisplayed,etherscan:`https://etherscan.io/tx/${swap.transaction}`});
    // Routers may pay a different recipient or return WETH; native sender balances
    // alone cannot establish the payout in those transactions.

  }
  report.trades=trades;report.result='passed';
} catch(e){report.result='failed';report.failure=String(e);process.exitCode=1;}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/live-fixes-mainnet.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
