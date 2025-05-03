// src/routes/imageRoutes.js

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');  // adapta a cómo importas tu pool de Postgres

const router = express.Router();

// Multer en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * POST /api/salas/:id_sala/cover
 * Subir imagen de portada
 */
router.post(
  '/salas/:id_sala/cover',
  upload.single('image'),
  async (req, res, next) => {
    try {
      const { id_sala } = req.params;
      if (!req.file) return res.status(400).send('No file uploaded');

      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname);
      const filename = `${id_sala}-${timestamp}${ext}`;
      const outDir = path.join(__dirname, '../uploads/salas', id_sala, 'cover');
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, filename);

      // Procesa y guarda con Sharp
      await sharp(req.file.buffer)
        .resize(800)
        .jpeg({ quality: 80 })
        .toFile(outPath);

      const imageUrl = `https://img.tu-dominio.com/salas/${id_sala}/cover/${filename}`;

      // 1) Actualiza el campo portada en sala (opcional)
      await pool.query(
        `UPDATE sala SET image_url = $1 WHERE id_sala = $2`,
        [imageUrl, id_sala]
      );
      // 2) Inserta en sala_imagen
      await pool.query(
        `INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1,'cover',$2)`,
        [id_sala, imageUrl]
      );

      res.json({ imageUrl });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/salas/:id_sala/gallery
 * Subir varias imágenes de galería
 */
router.post(
  '/salas/:id_sala/gallery',
  upload.array('images', 10),
  async (req, res, next) => {
    try {
      const { id_sala } = req.params;
      if (!req.files || !req.files.length) return res.status(400).send('No files uploaded');

      const urls = [];
      for (const file of req.files) {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const rand = Math.random().toString(36).slice(2);
        const filename = `${id_sala}-${timestamp}-${rand}${ext}`;
        const outDir = path.join(__dirname, '../uploads/salas', id_sala, 'gallery');
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, filename);

        await sharp(file.buffer)
          .resize(1200)
          .jpeg({ quality: 80 })
          .toFile(outPath);

        const imageUrl = `https://img.tu-dominio.com/salas/${id_sala}/gallery/${filename}`;
        urls.push(imageUrl);

        await pool.query(
          `INSERT INTO sala_imagen (id_sala, tipo, image_url) VALUES ($1,'gallery',$2)`,
          [id_sala, imageUrl]
        );
      }

      res.json({ gallery: urls });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
