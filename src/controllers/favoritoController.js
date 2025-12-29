// src/controllers/favoritoController.js
const favoritoService = require('../services/favoritoService');

/**
 * GET /api/favoritos?lat=40.416&lng=-3.703
 * Obtener todas las salas favoritas del usuario autenticado
 * Query params opcionales: lat, lng (para calcular distancia)
 */
exports.getFavoritos = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const coordenadas = (req.query.lat && req.query.lng) 
      ? { lat: parseFloat(req.query.lat), lng: parseFloat(req.query.lng) }
      : null;
    
    const favoritos = await favoritoService.getFavoritos(userId, coordenadas);
    
    res.json({
      count: favoritos.length,
      favoritos
    });
  } catch (error) {
    console.error('Error obteniendo favoritos:', error);
    res.status(500).json({ 
      error: error.message || 'Error al obtener favoritos' 
    });
  }
};

/**
 * GET /api/favoritos/ids
 * Obtener solo los IDs de salas favoritas (más ligero)
 */
exports.getFavoritoIds = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const ids = await favoritoService.getFavoritoIds(userId);
    
    res.json({ ids });
  } catch (error) {
    console.error('Error obteniendo IDs de favoritos:', error);
    res.status(500).json({ 
      error: error.message || 'Error al obtener IDs de favoritos' 
    });
  }
};

/**
 * GET /api/favoritos/check/:id_sala
 * Verificar si una sala es favorita
 */
exports.checkFavorito = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const salaId = parseInt(req.params.id_sala);

    if (isNaN(salaId)) {
      return res.status(400).json({ error: 'ID de sala inválido' });
    }

    const isFavorite = await favoritoService.isFavorito(userId, salaId);
    
    res.json({ 
      id_sala: salaId,
      isFavorite 
    });
  } catch (error) {
    console.error('Error verificando favorito:', error);
    res.status(500).json({ 
      error: error.message || 'Error al verificar favorito' 
    });
  }
};

/**
 * POST /api/favoritos/:id_sala
 * Agregar sala a favoritos
 */
exports.addFavorito = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const salaId = parseInt(req.params.id_sala);

    if (isNaN(salaId)) {
      return res.status(400).json({ error: 'ID de sala inválido' });
    }

    const result = await favoritoService.addFavorito(userId, salaId);
    
    if (result.alreadyExists) {
      return res.status(200).json({ 
        mensaje: 'La sala ya estaba en favoritos',
        alreadyExists: true
      });
    }

    res.status(201).json({ 
      mensaje: 'Sala agregada a favoritos',
      favorito: result.favorito 
    });
  } catch (error) {
    console.error('Error agregando favorito:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al agregar favorito' 
    });
  }
};

/**
 * DELETE /api/favoritos/:id_sala
 * Quitar sala de favoritos
 */
exports.removeFavorito = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const salaId = parseInt(req.params.id_sala);

    if (isNaN(salaId)) {
      return res.status(400).json({ error: 'ID de sala inválido' });
    }

    await favoritoService.removeFavorito(userId, salaId);
    
    res.json({ 
      mensaje: 'Sala quitada de favoritos',
      id_sala: salaId 
    });
  } catch (error) {
    console.error('Error quitando favorito:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al quitar favorito' 
    });
  }
};

/**
 * POST /api/favoritos/:id_sala/toggle
 * Toggle favorito (agregar si no existe, quitar si existe)
 */
exports.toggleFavorito = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const salaId = parseInt(req.params.id_sala);

    if (isNaN(salaId)) {
      return res.status(400).json({ error: 'ID de sala inválido' });
    }

    const result = await favoritoService.toggleFavorito(userId, salaId);
    
    res.json({ 
      mensaje: result.action === 'added' 
        ? 'Sala agregada a favoritos' 
        : 'Sala quitada de favoritos',
      action: result.action,
      isFavorite: result.isFavorite,
      id_sala: salaId
    });
  } catch (error) {
    console.error('Error en toggle favorito:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al cambiar favorito' 
    });
  }
};
