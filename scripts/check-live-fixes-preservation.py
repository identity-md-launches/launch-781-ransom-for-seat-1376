"""Check the immutable files and reverse only the authorized App integration edits."""
from pathlib import Path
import hashlib, json, re
root=Path(__file__).resolve().parent.parent
expected=json.loads((root/'scripts/fixtures/live-fixes-preservation.json').read_text())
def digest(data): return hashlib.sha256(data).hexdigest()
for name, sha in expected['unchanged'].items():
    assert digest((root/name).read_bytes()) == sha, name
app=(root/'src/App.tsx').read_text()
app=app.replace('  rpc,\n', '  rpc,\n  readSnapshot,\n')
app=app.replace('import { readBatchedSnapshot as readSnapshot } from "./snapshotBatch";\n', '')
app=app.replace('freshDollars, type DollarRound', 'freshDollars, readDollars, type DollarRound')
app=app.replace('    setRefreshing(true);\n', '    setRefreshing(true);\n    void readDollars().then(setDollarRound);\n')
app=app.replace('setData(await readSnapshot(setDollarRound));', 'setData(await readSnapshot());')
app=app.replace('className="hero-note"', 'className="hero-note desktop-only"').replace('className="testament-link"','className="testament-link desktop-only"')
app=app.replace('Uniswap’s app does not route through this hook yet.', 'Uniswap’s app does not route through custom hooks yet.')
assert digest(app.encode()) == expected['appBefore'], 'Unexpected App copy/layout/logic change'
html=(root/'index.html').read_text().replace('Seat #1376 is free. The second ransom is paid.', 'Seat #1376 is free. The second act is open.')
assert digest(html.encode()) == expected['htmlBefore'], 'Unexpected HTML/CSP edit'
assert re.search(r'content="default-src[^\"]+"', (root/'index.html').read_text())[0] == re.search(r'content="default-src[^\"]+"', (root/'dist/index.html').read_text())[0]
style=(root/'src/style.css').read_text().replace('  .hero-note,\n  .testament-link {\n    grid-column: 1 / -1;\n  }\n','')
assert digest(style.encode()) == expected['styleBefore'], 'Unexpected base style edit'
report={'unchangedFiles':len(expected['unchanged']),'chainSha256':expected['unchanged']['src/chain.ts'],'walletSha256':expected['unchanged']['src/wallet.ts'],'app':'Original bytes after reversing only requested integrations, mobile visibility and copy','index':'Original bytes after reversing only two meta descriptions; CSP matches export','baseStyles':'Original bytes after reversing only phone hero grid span','result':'passed'}
(root/'artifacts/preservation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
