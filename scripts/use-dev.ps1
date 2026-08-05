$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  docker compose -f docker-compose.yml up -d --force-recreate backend
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo volver a apuntar el backend a desarrollo.' }

  docker compose -f docker-compose.yml exec -T backend node -e "const db=new URL(process.env.DATABASE_URL); const redis=new URL(process.env.REDIS_URL); console.log('Backend -> '+db.pathname.slice(1)+' | Redis DB '+(redis.pathname.slice(1)||'0'));"
}
finally {
  Pop-Location
}
