"""Package VPS sources without local credentials, databases or build caches."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[2]
excluded = {
    '.git', '.venv', 'node_modules', 'dist', 'staticfiles', '__pycache__',
    '.runtime', '.sites-runtime', '.next', '.vinext', '.wrangler',
    '.agents', '.codex', 'work', 'outputs', 'backups', 'artifacts',
}
output = root / 'deploy/vps/artifacts/vetra-vps.zip'
output.parent.mkdir(parents=True, exist_ok=True)

def include(path):
    if path.is_symlink() or any(part in excluded for part in path.relative_to(root).parts):
        return False
    if path.name.startswith('.env') and path.name != '.env.example':
        return False
    return not (path.suffix in {'.pyc', '.pem', '.log', '.zip', '.tar', '.dump', '.tsbuildinfo'}
                or '.sqlite3' in path.name)

def walk(directory):
    for path in sorted(directory.iterdir()):
        if not include(path):
            continue
        if path.is_dir():
            yield from walk(path)
        elif path.is_file():
            yield path

staging = output.with_suffix('.zip.tmp')
with ZipFile(staging, 'w', ZIP_DEFLATED, strict_timestamps=False) as archive:
    archive.write(root / 'compose.yaml', 'compose.yaml')
    for directory in ('vetra-cotador', 'vetra-operacoes', 'deploy'):
        for path in walk(root / directory):
            archive.write(path, path.relative_to(root).as_posix())
staging.replace(output)
print(f'Pacote de fontes: {output}')
