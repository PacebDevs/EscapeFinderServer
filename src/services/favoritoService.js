// src/services/favoritoService.js
const db = require('../config/db');
const salaService = require('./salaService');

/**
 * Obtener todas las salas favoritas de un usuario con información completa
 * Reutiliza getFilteredSalas para traer los mismos datos que Tab1
 * @param {number} userId - ID del usuario
 * @param {object} coordenadas - Coordenadas opcionales {lat, lng} para calcular distancia
 */
exports.getFavoritos = async (userId, coordenadas = null) => {
  // Primero obtenemos los IDs de las salas favoritas
  const ids = await exports.getFavoritoIds(userId);
  
  if (ids.length === 0) {
    console.log(`📋 Usuario ${userId} no tiene favoritos`);
    return [];
  }
  
  // Preparar filtros para getFilteredSalas
  const filters = { id_salas: ids };
  
  // Si hay coordenadas, añadirlas para calcular distancia
  if (coordenadas && coordenadas.lat && coordenadas.lng) {
    filters.lat = coordenadas.lat;
    filters.lng = coordenadas.lng;
    filters.distancia_km = 999999; // Distancia muy grande para no filtrar, solo calcular
    console.log(`📍 Calculando distancias desde [${coordenadas.lat}, ${coordenadas.lng}]`);
  }
  
  // Luego usamos getFilteredSalas para obtener toda la info completa
  const salas = await salaService.getFilteredSalas(filters);
  
  console.log(`📋 Usuario ${userId} tiene ${salas.length} favoritos con info completa`);
  return salas;
};

/**
 * Obtener solo los IDs de las salas favoritas (para verificaciones rápidas)
 */
exports.getFavoritoIds = async (userId) => {
  const query = `
    SELECT id_sala
    FROM usuario_sala_favorita
    WHERE id_usuario = $1
  `;
  
  const result = await db.query(query, [userId]);
  return result.rows.map(row => row.id_sala);
};

/**
 * Verificar si una sala específica es favorita del usuario
 */
exports.isFavorito = async (userId, salaId) => {
  const query = `
    SELECT 1
    FROM usuario_sala_favorita
    WHERE id_usuario = $1 AND id_sala = $2
  `;
  
  const result = await db.query(query, [userId, salaId]);
  return result.rows.length > 0;
};

/**
 * Agregar una sala a favoritos
 * Usa ON CONFLICT para evitar duplicados
 */
exports.addFavorito = async (userId, salaId) => {
  // Primero verificar que la sala existe
  const salaCheck = await db.query('SELECT id_sala FROM sala WHERE id_sala = $1', [salaId]);
  
  if (salaCheck.rows.length === 0) {
    throw { status: 404, message: 'Sala no encontrada' };
  }

  const query = `
    INSERT INTO usuario_sala_favorita (id_usuario, id_sala)
    VALUES ($1, $2)
    ON CONFLICT (id_usuario, id_sala) DO NOTHING
    RETURNING *
  `;
  
  const result = await db.query(query, [userId, salaId]);
  
  if (result.rows.length === 0) {
    // Ya estaba en favoritos
    console.log(`ℹ️ Sala ${salaId} ya era favorita del usuario ${userId}`);
    return { alreadyExists: true };
  }
  
  console.log(`⭐ Sala ${salaId} agregada a favoritos del usuario ${userId}`);
  return { alreadyExists: false, favorito: result.rows[0] };
};

/**
 * Quitar una sala de favoritos
 */
exports.removeFavorito = async (userId, salaId) => {
  const query = `
    DELETE FROM usuario_sala_favorita
    WHERE id_usuario = $1 AND id_sala = $2
    RETURNING *
  `;
  
  const result = await db.query(query, [userId, salaId]);
  
  if (result.rows.length === 0) {
    throw { status: 404, message: 'Favorito no encontrado' };
  }
  
  console.log(`🗑️ Sala ${salaId} quitada de favoritos del usuario ${userId}`);
  return result.rows[0];
};

/**
 * Toggle: agregar si no existe, quitar si existe
 */
exports.toggleFavorito = async (userId, salaId) => {
  const existe = await exports.isFavorito(userId, salaId);
  
  if (existe) {
    await exports.removeFavorito(userId, salaId);
    return { action: 'removed', isFavorite: false };
  } else {
    await exports.addFavorito(userId, salaId);
    return { action: 'added', isFavorite: true };
  }
};
