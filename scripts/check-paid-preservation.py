"""Read-only preservation check for the paid-ransom revision."""
from pathlib import Path
import json
import runpy
import subprocess

root = Path(__file__).resolve().parent.parent
runpy.run_path(str(root / 'scripts/check-preservation.py'))

def baseline(path):
    return subprocess.check_output(['git', 'show', f'HEAD:{path}'], cwd=root)

for path in ['src/SecondAct.tsx', 'src/Watch.tsx', 'src/watch.ts', 'src/useWatch.ts',
             'src/letter.ts', 'src/second-act.css', 'src/style.css', 'src/Testament.tsx',
             'src/key.ts', 'src/keyReads.ts', 'src/useKey.ts', 'src/acts.ts', 'index.html']:
    assert (root / path).read_bytes() == baseline(path), path

app = (root / 'src/App.tsx').read_text()
app = app.replace('import { SecondActView } from "./PaidSecondAct";\nimport { usePaidRansom } from "./usePaidRansom";\nimport { ThirdActSeal } from "./ThirdActGate";', 'import { SecondAct } from "./SecondAct";')
app = app.replace('import "./paid-act.css";\n', '')
app = app.replace('  const paidRansom = usePaidRansom(watch);\n', '')
app = app.replace('{value === "third-act" && <ThirdActSeal />}', '{value === "third-act" && !keyState.given && <span className="act-seal">sealed</span>}')
app = app.replace('<SecondActView {...watch} paid={paidRansom} />', '<SecondAct {...watch} />')
assert app.encode() == baseline('src/App.tsx'), 'App differs beyond the paid-view wiring and third-act seal'
key = (root / 'src/KeyAct.tsx').read_text()
key = key.replace('import { ThirdActGate } from "./ThirdActGate";\n', '').replace('      <ThirdActGate />\n', '')
assert key.encode() == baseline('src/KeyAct.tsx'), 'Key differs beyond the gate wiring'
message = 'All original second-act, letter, watch, verdict, style, key, route and HTML bytes preserved; App differs only by new paid-view wiring and seal; KeyAct differs only by the gate.'
path = root / 'artifacts/preservation.json'
report = json.loads(path.read_text())
report['paidRevisionChecks'] = message
path.write_text(json.dumps(report, indent=2) + '\n')
print(message)
