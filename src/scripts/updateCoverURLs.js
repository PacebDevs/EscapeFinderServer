const fs = require('fs');
const path = require('path');
const pool = require('../config/db'); 

// Ruta base donde están las imágenes
const UPLOADS_DIR = path.join(__dirname, '../uploads/salas');
//const BASE_URL = 'http://192.168.1.131:3000/salas'; // cambia si usas otro dominio
const BASE_URL = 'salas';

console.log(`🔍 DATABASE_URL: ${process.env.DATABASE_URL || '(desde config/db.js)'}`);

async function run() {
  const updates = [];

  // Obtener todos los id_sala (carpetas)
  const salas = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const id_sala of salas) {
    const coverDir = path.join(UPLOADS_DIR, id_sala);
    const files = fs.readdirSync(coverDir);

    // Buscar archivo que empiece por 'cover.'
    const coverFile = files.find(f => f.startsWith('cover.'));
    if (!coverFile) {
      console.warn(`⚠️ No se encontró portada para la sala ${id_sala}`);
      continue;
    }

    const imageUrl = `${BASE_URL}/${id_sala}/${coverFile}`;
    updates.push({ id_sala, imageUrl });
  }

  // Actualizar base de datos
  for (const { id_sala, imageUrl } of updates) {
    try {
      // 1. Actualizar campo cover_url en tabla sala
      await pool.query(
        'UPDATE sala SET cover_url = $1 WHERE id_sala = $2',
        [imageUrl, id_sala]
      );

      // 2. Insertar o actualizar en sala_imagen como tipo 'cover'
      const exists = await pool.query(
        'SELECT 1 FROM sala_imagen WHERE id_sala = $1 AND tipo = $2',
        [id_sala, 'cover']
      );

      if (exists.rowCount === 0) {
        await pool.query(
          'INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1, $2, $3)',
          [id_sala, 'cover', imageUrl]
        );
        console.log(`✅ Insertada portada para sala ${id_sala}`);
      } else {
        await pool.query(
          'UPDATE sala_imagen SET image_url = $1, created_at = NOW() WHERE id_sala = $2 AND tipo = $3',
          [imageUrl, id_sala, 'cover']
        );
        console.log(`🔁 Actualizada portada para sala ${id_sala}`);
      }

    } catch (err) {
      console.error(`❌ Error al actualizar sala ${id_sala}`, err);
    }
  }

  await pool.end();
  console.log('🟢 Proceso completado.');
}

run().catch(console.error);