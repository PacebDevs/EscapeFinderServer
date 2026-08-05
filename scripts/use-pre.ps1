$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$preUploads = Join-Path $repoRoot 'runtime\pre\uploads'
New-Item -ItemType Directory -Force -Path $preUploads | Out-Null

Push-Location $repoRoot
try {
  $existing = docker compose exec -T db psql -U postgres -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname='escapefinder_pre'" 2>$null
  if ($existing -ne '1') {
    throw 'escapefinder_pre no existe. Ejecuta primero scripts\create-pre-db.ps1.'
  }

  docker compose -f docker-compose.yml -f docker-compose.pre.yml up -d --force-recreate backend
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo apuntar el backend a preproducción.' }

  docker compose -f docker-compose.yml -f docker-compose.pre.yml exec -T backend node -e "const db=new URL(process.env.DATABASE_URL); const redis=new URL(process.env.REDIS_URL); console.log('Backend -> '+db.pathname.slice(1)+' | Redis DB '+(redis.pathname.slice(1)||'0'));"
}
finally {
  Pop-Location
}
