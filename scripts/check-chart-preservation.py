"""Read-only parent comparison; write only the requested evidence artifact."""
from pathlib import Path
import subprocess, hashlib, json, re
root = Path(__file__).resolve().parent.parent
protected = ['src/chain.ts','src/wallet.ts','src/App.tsx','src/PaidSecondAct.tsx','src/SecondAct.tsx',
 'src/walletRecord.ts','src/recordVisit.ts','src/useWalletRecord.ts','src/recordVerdicts.ts','src/Recouped.tsx',
 'src/Watch.tsx','src/watchBatch.ts','src/snapshotBatch.ts','src/Testament.tsx','src/Provenance.tsx',
 'src/KeyAct.tsx','src/ThirdActGate.tsx','src/useKey.ts','src/key.ts','src/acts.ts','src/letter.ts',
 'src/display.ts','src/chartAxis.ts','src/swapTape.ts',
 'package.json','package-lock.json','vite.config.ts','tsconfig.json','.gitignore']
protected += [p.relative_to(root).as_posix() for p in (root/'src').glob('*.css')]
records=[]
for name in protected:
    before=subprocess.check_output(['git','show',f'HEAD:{name}'],cwd=root)
    after=(root/name).read_bytes()
    assert before==after, name
    records.append({'path':name,'sha256':hashlib.sha256(after).hexdigest(),'byteIdentical':True})
html=(root/'index.html').read_text()
parent=subprocess.check_output(['git','show','HEAD:index.html'],cwd=root).decode()
old=re.search(r'content="(default-src[^\"]+)"',parent)[1]
new=re.search(r'content="(default-src[^\"]+)"',html)[1]
oldparts=dict(p.strip().split(' ',1) for p in old.split(';'))
newparts=dict(p.strip().split(' ',1) for p in new.split(';'))
assert newparts.keys()==oldparts.keys()
for k in oldparts:
    if k!='connect-src': assert oldparts[k]==newparts[k], k
expected={'https://eth-mainnet.public.blastapi.io','https://mainnet.rpc.sentio.xyz','https://eth.api.pocket.network','https://rpc.mevblocker.io','https://rpc-eth.blockmachine.io','https://mainnet.gateway.tenderly.co','https://0xrpc.io/eth'}
assert set(newparts['connect-src'].split())==set(oldparts['connect-src'].split())|expected
assert html.replace(new,old)==parent
assert 'Check your connection' not in (root/'src/LiveSellChart.tsx').read_text()
assert 'Past reads are unavailable. Retrying…' in (root/'src/LiveSellChart.tsx').read_text()
for name in ['chain.ts','wallet.ts']:
    assert (root/'src'/name).read_bytes()==subprocess.check_output(['git','show',f'HEAD:src/{name}'],cwd=root)
(root/'artifacts').mkdir(exist_ok=True)
(root/'artifacts/preservation.json').write_text(json.dumps({'files':records,'csp':'Only the seven additional hosts in connect-src changed; all other HTML bytes preserved.','protectedFileCount':len(records)},indent=2)+'\n')
print(f'{len(records)} protected source/config/style files byte-identical; only connect-src changed in index.html.')
