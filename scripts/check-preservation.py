"""Read-only baseline checks; run before the submission system creates its commit."""
from pathlib import Path
import hashlib
import json
import re
import struct
import subprocess

root = Path(__file__).resolve().parent.parent
report = {}
def baseline(path):
    return subprocess.check_output(['git', 'show', f'HEAD:{path}'], cwd=root)
for name in ['src/chain.ts', 'src/wallet.ts', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', '.gitignore']:
    data = (root/name).read_bytes()
    assert data == baseline(name), f'Protected original changed: {name}'
    report[name] = hashlib.sha256(data).hexdigest()
old = baseline('src/App.tsx').decode()
new = (root/'src/App.tsx').read_text()
old_handlers = old.split('  const setAmountValue =', 1)[1].split('  const persona =', 1)[0]
new_handlers = new.split('  const setAmountValue =', 1)[1].split('  const copy = seatCopy', 1)[0]
assert new_handlers == old_handlers, 'Trade, wallet action or hook action handler changed'
report['appActionHandlers'] = hashlib.sha256(new_handlers.encode()).hexdigest()
html = (root/'index.html').read_text()
export = (root/'dist/index.html').read_text()
csp = r'http-equiv="Content-Security-Policy"\s+content="([^"]+)"'
original_csp = re.search(csp, baseline('index.html').decode()).group(1)
for doc in [html, export]:
    assert re.search(csp, doc).group(1) == original_csp
    description = re.search(r'name="description"\s+content="([^"]+)"', doc).group(1)
    assert re.search(r'property="og:description"\s+content="([^"]+)"', doc).group(1) == description
    assert 'https://free1376.eth.limo/og.png' in doc
    assert 'summary_large_image' in doc
    assert 'Seat #1376 — $FREE1376' in doc
    for path in ['favicon.svg','favicon-32.png','apple-touch-icon.png']:
        assert f'./{path}' in doc
for name, size in [('favicon-32.png',(32,32)),('apple-touch-icon.png',(180,180)),('og.png',(1200,630))]:
    data=(root/'public'/name).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', data[16:24]) == size
    assert data == (root/'dist'/name).read_bytes()
assert (root/'dist/favicon.svg').read_bytes() == (root/'public/favicon.svg').read_bytes()
report['unchangedCSP'] = original_csp
report['checks'] = 'Original protected files and action handlers identical; CSP identical; required metadata and exact PNG dimensions; source/export icons identical.'
(root/'artifacts').mkdir(exist_ok=True)
(root/'artifacts/preservation.json').write_text(json.dumps(report,indent=2)+'\n')
print(report['checks'])
