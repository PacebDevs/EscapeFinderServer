$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  $existing = docker compose exec -T db psql -U postgres -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname='escapefinder_pre'" 2>$null
  if ($existing -eq '1') {
    Write-Host 'escapefinder_pre ya existe; no se ha modificado.'
    exit 0
  }

  docker compose exec -T db createdb -U postgres escapefinder_pre
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear escapefinder_pre.' }

  docker compose exec -T db sh -lc "pg_dump -U postgres --schema-only --no-owner --no-privileges escapefinderdb | psql -v ON_ERROR_STOP=1 -U postgres -d escapefinder_pre"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el esquema en escapefinder_pre.' }

  docker compose cp db/seeds/001_master_data.sql db:/tmp/escapefinder_master_data.sql
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el seed de datos maestros.' }

  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d escapefinder_pre -f /tmp/escapefinder_master_data.sql
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron insertar los datos maestros.' }

  Write-Host 'escapefinder_pre creada con esquema limpio y datos maestros.'
}
finally {
  Pop-Location
}
