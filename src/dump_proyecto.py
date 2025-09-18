from pathlib import Path
import sys
import traceback

# Extensiones a volcar
EXTS = {'.ts', '.html', '.scss', '.json', '.md'}

def collect(root: Path):
  files = []
  for p in root.rglob('*'):
    if p.is_dir():
      if p.name in {'node_modules', 'dist', '.angular', '.git'}:
        continue
      continue
    if p.suffix.lower() in EXTS:
      files.append(p)
  return files

def main():
  here = Path(__file__).resolve().parent  # src/
  root = here
  out = here / 'proyecto_dump.txt'

  files = collect(root)
  print(f'Encontrados {len(files)} archivos. Escribiendo a {out}...', flush=True)

  with out.open('w', encoding='utf-8') as f:
    for p in files:
      rel = p.relative_to(root)
      f.write(f'=== {rel.as_posix()} ===\n')
      try:
        content = p.read_text(encoding='utf-8', errors='ignore')
      except Exception as e:
        content = f'[ERROR leyendo {rel}: {e}]'
      f.write(content)
      f.write('\n\n')

  print('OK', flush=True)

if __name__ == '__main__':
  try:
    sys.exit(main())
  except Exception:
    traceback.print_exc()
    sys.exit(1)