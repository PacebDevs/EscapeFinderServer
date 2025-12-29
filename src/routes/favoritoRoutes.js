// src/routes/favoritoRoutes.js
const express = require('express');
const router = express.Router();
const favoritoController = require('../controllers/favoritoController');
const requireAuth = require('../middleware/requireAuth');

// Todas las rutas requieren autenticación
router.use(requireAuth);

// GET /api/favoritos - Obtener todas las salas favoritas
router.get('/', favoritoController.getFavoritos);

// GET /api/favoritos/ids - Obtener solo los IDs
router.get('/ids', favoritoController.getFavoritoIds);

// GET /api/favoritos/check/:id_sala - Verificar si es favorita
router.get('/check/:id_sala', favoritoController.checkFavorito);

// POST /api/favoritos/:id_sala - Agregar a favoritos
router.post('/:id_sala', favoritoController.addFavorito);

// POST /api/favoritos/:id_sala/toggle - Toggle favorito
router.post('/:id_sala/toggle', favoritoController.toggleFavorito);

// DELETE /api/favoritos/:id_sala - Quitar de favoritos
router.delete('/:id_sala', favoritoController.removeFavorito);

module.exports = router;
