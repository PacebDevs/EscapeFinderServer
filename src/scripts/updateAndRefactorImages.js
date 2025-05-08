const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pool = require('../config/db');

// Configuración
const UPLOADS_DIR = path.join(__dirname, '../uploads/salas');
const BASE_URL = 'salas';

console.log(`🔍 DATABASE_URL: ${process.env.DATABASE_URL || '(desde config/db.js)'}`);
console.log(`📂 Analizando directorio: ${UPLOADS_DIR}`);

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
      console.log(`   ✨ Optimizada imagen: ${path.basename(inputPath)} (${width}px → ${maxWidth}px)`);
    } else {
      console.log(`   👌 Sin cambios: ${path.basename(inputPath)} (ancho ${width}px)`);
    }
  } catch (err) {
    console.warn(`   ⚠️ No se pudo optimizar ${path.basename(inputPath)}: ${err.message}`);
  }
}

async function run() {
  const salas = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  console.log(`🔎 Total de carpetas (salas) detectadas: ${salas.length}`);

  for (const id_sala of salas) {
    try {
      console.log(`\n📁 Procesando sala ${id_sala}...`);
      const folder = path.join(UPLOADS_DIR, id_sala);
      const files = fs.readdirSync(folder);
      console.log(`   🧾 Archivos encontrados: ${files.join(', ')}`);

      const portadaFile = files.find(f => f.toLowerCase().includes('portada'));
      const galleryFiles = files.filter(f => f !== portadaFile);

      if (!portadaFile) {
        console.warn(`   ⚠️ Sala ${id_sala} no tiene imagen con 'portada'`);
        continue;
      }

      // === PORTADA ===
      const portadaPath = path.join(folder, portadaFile);
      const portadaUrl = `${BASE_URL}/${id_sala}/${portadaFile}`;
      await optimizarImagen(portadaPath, 1200);

      await pool.query(
        'UPDATE sala SET cover_url = $1 WHERE id_sala = $2',
        [portadaUrl, id_sala]
      );

      const portadaExists = await pool.query(
        'SELECT 1 FROM sala_imagen WHERE id_sala = $1 AND tipo = $2',
        [id_sala, 'cover']
      );

      if (portadaExists.rowCount === 0) {
        await pool.query(
          'INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1, $2, $3)',
          [id_sala, 'cover', portadaUrl]
        );
        console.log(`   ✅ Portada insertada: ${portadaFile}`);
      } else {
        await pool.query(
          'UPDATE sala_imagen SET image_url = $1, created_at = NOW() WHERE id_sala = $2 AND tipo = $3',
          [portadaUrl, id_sala, 'cover']
        );
        console.log(`   🔁 Portada actualizada: ${portadaFile}`);
      }

      // === GALERÍA ===
      console.log(`   🖼️ Procesando galería (${galleryFiles.length} imágenes)...`);
      for (const file of galleryFiles) {
        try {
          const imgPath = path.join(folder, file);
          const imageUrl = `${BASE_URL}/${id_sala}/${file}`;
          await optimizarImagen(imgPath, 800);

          const exists = await pool.query(
            'SELECT 1 FROM sala_imagen WHERE id_sala = $1 AND tipo = $2 AND image_url = $3',
            [id_sala, 'gallery', imageUrl]
          );

          if (exists.rowCount === 0) {
            await pool.query(
              'INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1, $2, $3)',
              [id_sala, 'gallery', imageUrl]
            );
            console.log(`   🖼️ Añadida: ${file}`);
          } else {
            console.log(`   ⏭️ Ya existe: ${file}`);
          }
        } catch (err) {
          console.error(`   ❌ Error imagen galería ${file} (sala ${id_sala}): ${err.message}`);
        }
      }

    } catch (err) {
      console.error(`❌ Error general en sala ${id_sala}: ${err.message}`);
    }
  }

  // === LIMPIEZA DE REFERENCIAS HUÉRFANAS ===
  console.log(`\n🧹 Iniciando limpieza de imágenes huérfanas...`);
  try {
    const res = await pool.query('SELECT * FROM sala_imagen');
    for (const row of res.rows) {
      const imagePath = path.join(UPLOADS_DIR, row.id_sala.toString(), path.basename(row.image_url));
      if (!fs.existsSync(imagePath)) {
        await pool.query(
          'DELETE FROM sala_imagen WHERE id_sala = $1 AND tipo = $2 AND image_url = $3',
          [row.id_sala, row.tipo, row.image_url]
        );
        console.log(`   🧹 Eliminada referencia: ${row.image_url}`);
      }
    }
  } catch (err) {
    console.error(`❌ Error durante limpieza de huérfanas: ${err.message}`);
  }

  await pool.end();
  console.log('\n✅ Proceso completado con optimización y limpieza.');
}

run().catch(console.error);
