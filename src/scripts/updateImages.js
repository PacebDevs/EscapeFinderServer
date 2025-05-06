const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

// Configuración
const UPLOADS_DIR = path.join(__dirname, '../uploads/salas');
const BASE_URL = 'salas';
const LOG_PATH = path.join(__dirname, '../../logs/updateImages.log');

function log(message) {
  console.log(message);
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} - ${message}\n`);
}

async function run() {
  fs.writeFileSync(LOG_PATH, ''); // limpiar log

  const salas = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const id_sala of salas) {
    const folder = path.join(UPLOADS_DIR, id_sala);
    const files = fs.readdirSync(folder);

    // Portada = única imagen que contiene "portada"
    const coverFile = files.find(f => f.toLowerCase().includes('portada'));
    const galleryFiles = files.filter(f => f !== coverFile);

    try {
      // --- 1. PORTADA ---
      if (coverFile) {
        const coverUrl = `${BASE_URL}/${id_sala}/${coverFile}`;

        await pool.query(
          'UPDATE sala SET cover_url = $1 WHERE id_sala = $2',
          [coverUrl, id_sala]
        );

        const existing = await pool.query(
          'SELECT 1 FROM sala_imagen WHERE id_sala = $1 AND tipo = $2',
          [id_sala, 'cover']
        );

        if (existing.rowCount === 0) {
          await pool.query(
            'INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1, $2, $3)',
            [id_sala, 'cover', coverUrl]
          );
          log(`✅ Insertada portada para sala ${id_sala}`);
        } else {
          await pool.query(
            'UPDATE sala_imagen SET image_url = $1, created_at = NOW() WHERE id_sala = $2 AND tipo = $3',
            [coverUrl, id_sala, 'cover']
          );
          log(`🔁 Actualizada portada para sala ${id_sala}`);
        }
      } else {
        log(`⚠️ Sala ${id_sala} sin imagen de portada`);
      }

      // --- 2. GALERÍA (INSERTAR NUEVAS) ---
      for (const filename of galleryFiles) {
        const url = `${BASE_URL}/${id_sala}/${filename}`;
        const exists = await pool.query(
          'SELECT 1 FROM sala_imagen WHERE id_sala = $1 AND tipo = $2 AND image_url = $3',
          [id_sala, 'gallery', url]
        );

        if (exists.rowCount === 0) {
          await pool.query(
            'INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1, $2, $3)',
            [id_sala, 'gallery', url]
          );
          log(`📸 Añadida imagen a galería de sala ${id_sala}: ${filename}`);
        }
      }

      // --- 3. LIMPIAR IMÁGENES OBSOLETAS ---
      const urlsEnDisco = galleryFiles.map(f => `${BASE_URL}/${id_sala}/${f}`);
      const { rows: imagenesBD } = await pool.query(
        'SELECT image_url FROM sala_imagen WHERE id_sala = $1 AND tipo = $2',
        [id_sala, 'gallery']
      );

      for (const { image_url } of imagenesBD) {
        if (!urlsEnDisco.includes(image_url)) {
          await pool.query(
            'DELETE FROM sala_imagen WHERE id_sala = $1 AND tipo = $2 AND image_url = $3',
            [id_sala, 'gallery', image_url]
          );
          log(`🗑️ Eliminada imagen obsoleta en sala ${id_sala}: ${image_url}`);
        }
      }

    } catch (err) {
      log(`❌ Error en sala ${id_sala}: ${err.message}`);
    }
  }

  await pool.end();
  log('🟢 Proceso de sincronización completado.');
}

run().catch(err => {
  log(`❌ Error general: ${err.message}`);
});
