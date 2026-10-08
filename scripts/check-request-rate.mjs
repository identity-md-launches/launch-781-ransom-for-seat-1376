import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
const label = process.argv[2] || 'after';
const root = resolve(process.argv[3] || 'dist');
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname.replace(/^\/preview\//, '') || 'index.html';
    const path = resolve(root, name);
    if (!path.startsWith(root + '/')) throw Error('path');
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(path)] || 'text/plain');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await mkdir('artifacts', {recursive:true});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell', args:['--no-sandbox']});
const report={label, startedAt:new Date().toISOString(), windows:[], errors:[], rpcErrors:[]};
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 page.on('pageerror',e=>report.errors.push(String(e)));
 let counts={}, aggregates=0, began=Date.now();
 await page.route(/https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/, async route=>{
  const request=route.request();
  const payload=request.postDataJSON();
  if(request.url().includes('publicnode')) for(const p of Array.isArray(payload)?payload:[payload]) {
   counts[p.method]=(counts[p.method]||0)+1;
   if(p.method==='eth_call' && p.params[0].to?.toLowerCase()==='0xca11bde05977b3631167028862be2a173976ca11') aggregates++;
  }
  try {
   const res=await fetch(request.url(), {method:'POST',headers:{'Content-Type':'application/json'},body:request.postData(),signal:AbortSignal.timeout(20000)});
   const body=await res.text();
   try { const p=JSON.parse(body); if(p.error && report.rpcErrors.length<20) report.rpcErrors.push(p.error); } catch {}
   await route.fulfill({status:res.status,contentType:'application/json',body});
  }catch(e){if(report.errors.length<20)report.errors.push(String(e));await route.abort();}
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/preview/#second-act`);
 for(const window of ['second-act','first-act']) {
   await page.goto(`http://127.0.0.1:${server.address().port}/preview/#${window}`);
   await page.waitForTimeout(20000);
   began=Date.now();counts={};aggregates=0;
   await page.waitForTimeout(60000);
   const row={window,elapsedMs:Date.now()-began,publicnode:{...counts},aggregates,total:Object.values(counts).reduce((a,b)=>a+b,0)};
   report.windows.push(row);console.log(JSON.stringify(row));
 }
 await page.goto(`http://127.0.0.1:${server.address().port}/preview/#second-act`);
 await page.waitForTimeout(2000);
 report.meter=await page.locator('.live-percentage [role="img"]').getAttribute('aria-label').catch(()=>null);
 report.swaps=await page.locator('.live-swap-row').evaluateAll(els=>els.map(e=>({text:e.innerText,href:e.href})));
 await page.locator('.live-paid-sections').screenshot({path:`artifacts/${label}-mainnet.png`}).catch(e=>report.errors.push(String(e)));
}finally{
 await writeFile(`artifacts/requests-${label}.json`,JSON.stringify(report,null,2)+'\n');
 await browser.close();await new Promise(r=>server.close(r));
}
