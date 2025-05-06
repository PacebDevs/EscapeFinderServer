const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

// Directorio base de las imágenes
const UPLOADS_DIR = path.join(__dirname, '../uploads/salas');
//const BASE_URL = 'http://192.168.1.131:3000/salas'; // ← actualiza si usas dominio
const BASE_URL = 'salas'; 

async function run() {
  const salas = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const id_sala of salas) {
    const folder = path.join(UPLOADS_DIR, id_sala);
    const files = fs.readdirSync(folder);

    // Excluimos portada
    const galleryFiles = files.filter(f => !f.startsWith('cover.'));

    for (const filename of galleryFiles) {
      const imageUrl = `${BASE_URL}/${id_sala}/${filename}`;

      try {
        // Comprobar si ya existe esta imagen en galería
        const exists = await pool.query(
          'SELECT 1 FROM sala_imagen WHERE id_sala = $1 AND tipo = $2 AND image_url = $3',
          [id_sala, 'gallery', imageUrl]
        );

        if (exists.rowCount === 0) {
          await pool.query(
            'INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1, $2, $3)',
            [id_sala, 'gallery', imageUrl]
          );
          console.log(`✅ Añadida imagen de galería para sala ${id_sala}: ${filename}`);
        } else {
          console.log(`⏭️ Ya existente: ${filename} en sala ${id_sala}`);
        }
      } catch (err) {
        console.error(`❌ Error al procesar imagen ${filename} de sala ${id_sala}`, err);
      }
    }
  }

  await pool.end();
  console.log('🟢 Proceso de galería completado.');
}

run().catch(console.error);
