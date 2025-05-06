
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pool = require('../config/db');

// Configuración
const UPLOADS_DIR = path.join(__dirname, '../uploads/salas');
const BASE_URL = 'salas';

console.log(`🔍 DATABASE_URL: ${process.env.DATABASE_URL || '(desde config/db.js)'}`);

async function optimizarImagen(inputPath, maxWidth = 1200) {
  try {
    const { width } = await sharp(inputPath).metadata();
    if (width && width > maxWidth) {
      const tempPath = inputPath + '.tmp';
      await sharp(inputPath)
        .resize({ width: maxWidth })
        .jpeg({ quality: 80 })
        .toFile(tempPath);
      fs.renameSync(tempPath, inputPath);
      console.log(`✨ Optimizada imagen: ${path.basename(inputPath)}`);
    }
  } catch (err) {
    console.warn(`⚠️ No se pudo optimizar ${path.basename(inputPath)}: ${err.message}`);
  }
}

async function run() {
  const salas = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const idsProcesados = new Set();

  for (const id_sala of salas) {
    const folder = path.join(UPLOADS_DIR, id_sala);
    const files = fs.readdirSync(folder);

    const portadaFile = files.find(f => f.toLowerCase().includes('portada'));
    const galleryFiles = files.filter(f => f !== portadaFile);

    if (!portadaFile) {
      console.warn(`⚠️ Sala ${id_sala} no tiene imagen con 'portada'`);
      continue;
    }

    // PORTADA
    const portadaPath = path.join(folder, portadaFile);
    const portadaUrl = `${BASE_URL}/${id_sala}/${portadaFile}`;
    await optimizarImagen(portadaPath, 1200);
    idsProcesados.add(id_sala);

    try {
      await pool.query('UPDATE sala SET cover_url = $1 WHERE id_sala = $2', [portadaUrl, id_sala]);

      const exists = await pool.query(
        'SELECT 1 FROM sala_imagen WHERE id_sala = $1 AND tipo = $2',
        [id_sala, 'cover']
      );

      if (exists.rowCount === 0) {
        await pool.query(
          'INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1, $2, $3)',
          [id_sala, 'cover', portadaUrl]
        );
        console.log(`✅ Portada insertada: sala ${id_sala}`);
      } else {
        await pool.query(
          'UPDATE sala_imagen SET image_url = $1, created_at = NOW() WHERE id_sala = $2 AND tipo = $3',
          [portadaUrl, id_sala, 'cover']
        );
        console.log(`🔁 Portada actualizada: sala ${id_sala}`);
      }
    } catch (err) {
      console.error(`❌ Error portada sala ${id_sala}`, err);
    }

    // GALERÍA
    for (const file of galleryFiles) {
      const imgPath = path.join(folder, file);
      const imageUrl = `${BASE_URL}/${id_sala}/${file}`;
      await optimizarImagen(imgPath, 800);

      try {
        const exists = await pool.query(
          'SELECT 1 FROM sala_imagen WHERE id_sala = $1 AND tipo = $2 AND image_url = $3',
          [id_sala, 'gallery', imageUrl]
        );

        if (exists.rowCount === 0) {
          await pool.query(
            'INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1, $2, $3)',
            [id_sala, 'gallery', imageUrl]
          );
          console.log(`🖼️ Añadida galería: sala ${id_sala} → ${file}`);
        } else {
          console.log(`⏭️ Ya existe galería: ${file} (sala ${id_sala})`);
        }
      } catch (err) {
        console.error(`❌ Error imagen galería ${file} (sala ${id_sala})`, err);
      }
    }
  }

  // LIMPIEZA: Eliminar entradas que ya no tienen archivos en disco
  const res = await pool.query('SELECT * FROM sala_imagen');
  for (const row of res.rows) {
    const imagePath = path.join(UPLOADS_DIR, row.id_sala.toString(), path.basename(row.image_url));
    if (!fs.existsSync(imagePath)) {
      await pool.query('DELETE FROM sala_imagen WHERE id_sala = $1 AND tipo = $2 AND image_url = $3',
        [row.id_sala, row.tipo, row.image_url]
      );
      console.log(`🧹 Eliminada referencia huérfana: ${row.image_url}`);
    }
  }

  await pool.end();
  console.log('✅ Proceso completado con optimización.');
}

run().catch(console.error);
