"""Conservative file-bundle inventory. Never opens Git metadata or dependency trees."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import re
import tarfile

root = Path(__file__).resolve().parent.parent
report_path = root / 'artifacts/package-report.json'
excluded_dirs = {'.git', '.github', '.imd', '.agents', '.codex', 'node_modules', '.vite', '.cache', '.npm', 'coverage', '.playwright-mcp'}
files = []

def walk(folder):
    for entry in sorted(folder.iterdir()):
        relative = entry.relative_to(root).as_posix()
        if entry.name in excluded_dirs or entry.name.startswith('.env') or relative == 'test/scratch':
            continue
        if entry == report_path or entry.name.endswith('.tsbuildinfo'):
            continue
        if entry.is_symlink():
            raise RuntimeError(f'Unexpected deliverable symlink: {relative}')
        if entry.is_dir():
            walk(entry)
        else:
            if entry.name == '.gitmodules' or entry.suffix in {'.tgz', '.tar', '.zip'}:
                raise RuntimeError(f'Unexpected submodule/packaging artifact: {relative}')
            files.append(entry)

walk(root)
assert (root / '.gitignore').stat().st_size <= 512
html = (root / 'dist/index.html').read_text()
for asset in re.findall(r'(?:src|href)="(\./assets/[^"]+)"', html):
    assert (root / 'dist' / asset).is_file(), asset
assert 'src="./assets/' in html and 'href="./assets/' in html
assert (root / 'dist/THIRD_PARTY_LICENSES.txt').read_bytes() == (root / 'public/THIRD_PARTY_LICENSES.txt').read_bytes()
assert 'dangerouslySetInnerHTML' not in ''.join(p.read_text() for p in (root/'src').glob('*.tsx'))
records = [{'path':p.relative_to(root).as_posix(), 'bytes':p.stat().st_size, 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
stream = io.BytesIO()
with tarfile.open(fileobj=stream, mode='w', format=tarfile.PAX_FORMAT) as archive:
    for p in files:
        data=p.read_bytes()
        info=tarfile.TarInfo(p.relative_to(root).as_posix())
        info.size=len(data)
        info.mode=0o644
        archive.addfile(info, io.BytesIO(data))
report = {
    'budgetBytes':8388608,
    'fileCountExcludingThisReport':len(files),
    'sourceAndExportBytesExcludingThisReport':sum(r['bytes'] for r in records),
    'uncompressedTarBytesExcludingThisReport':len(stream.getvalue()),
    'gzipTarBytesExcludingThisReport':len(gzip.compress(stream.getvalue(), mtime=0)),
    'distBytes':sum(r['bytes'] for r in records if r['path'].startswith('dist/')),
    'ignoreFileBytes':(root/'.gitignore').stat().st_size,
    'ignoreFileBudgetBytes':512,
    'exclusions':sorted(excluded_dirs)+['test/scratch/', '.env*', '*.tsbuildinfo'],
    'checks':'Relative assets present; complete runtime license; no deliverable symlinks, submodules or dependency archives; no HTML insertion of the face.',
    'files':records,
}
report_path.write_text(json.dumps(report,indent=2)+'\n')
conservative = report['uncompressedTarBytesExcludingThisReport'] + report_path.stat().st_size + 10240
assert conservative < report['budgetBytes'], conservative
print(json.dumps({k:v for k,v in report.items() if k not in {'files','exclusions'}},indent=2))
print(f'Including this report and 10 KiB additional tar overhead: {conservative} bytes < 8388608 bytes.')
