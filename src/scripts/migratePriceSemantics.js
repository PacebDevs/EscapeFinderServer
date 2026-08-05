const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function main() {
  const migrationPath = path.join(
    __dirname,
    '..',
    'migrations',
    '20260805_price_semantics.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await db.query(sql);
  console.log('✅ Migración de semántica de precios aplicada.');
}

main()
  .catch((error) => {
    console.error('❌ No se pudo aplicar la migración de precios:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
