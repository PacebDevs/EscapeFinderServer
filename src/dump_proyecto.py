from pathlib import Path
import sys
import traceback

# Extensiones a volcar (añadido .js)
EXTS = {'.ts', '.js', '.html', '.scss', '.json', '.md'}

# Carpetas a ignorar
IGNORE_DIRS = {'node_modules', 'dist', '.angular', '.git', 'uploads', 'cache'}

def collect(root: Path):
  """Recopila recursivamente archivos que coinciden con las extensiones, ignorando directorios específicos."""
  files = []
  for p in root.rglob('*'):
    if p.is_dir():
      # Comprueba si algún segmento de la ruta está en IGNORE_DIRS
      if any(part in IGNORE_DIRS for part in p.parts):
        continue
    if p.is_file() and p.suffix.lower() in EXTS:
      files.append(p)
  return files

def main():
  here = Path(__file__).resolve().parent
  
  # Determinar el directorio raíz del proyecto
  # Si se pasa un argumento, úsalo. Si no, usa el directorio padre de 'src'.
  if len(sys.argv) > 1:
    root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
      print(f"Error: La ruta proporcionada no es un directorio válido: {root}", file=sys.stderr)
      return 1
  else:
    # Por defecto, asume que el script está en 'src' y el proyecto es el padre
    root = here.parent

  out = root / 'proyecto_dump.txt'

  print(f"Analizando proyecto en: {root}")
  files = collect(root)
  print(f'Encontrados {len(files)} archivos. Escribiendo a {out}...', flush=True)

  with out.open('w', encoding='utf-8') as f:
    for p in sorted(files): # Ordena los archivos para un resultado consistente
      rel = p.relative_to(root)
      f.write(f'=== {rel.as_posix()} ===\n')
      try:
        content = p.read_text(encoding='utf-8', errors='ignore')
      except Exception as e:
        content = f'[ERROR leyendo {rel}: {e}]'
      f.write(content)
      f.write('\n\n')

  print(f'OK. Vuelco de proyecto guardado en: {out}', flush=True)
  return 0

if __name__ == '__main__':
  try:
    sys.exit(main())
  except Exception:
    traceback.print_exc()
    sys.exit(1)