const db = require('../config/db');
const redis = require('../cache/redisClient');

exports.getUserById = async (id) => {
  const key = `user:${id}`;

  // 1. Intentar obtener el usuario desde Redis
  const cachedUser = await redis.get(key);
  if (cachedUser) {
    console.log('🧠 Usuario obtenido desde Redis');
    return JSON.parse(cachedUser);
  }

  // 2. Si no está en cache, buscar en la base de datos
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);

  if (rows.length > 0) {
    const user = rows[0];

    // 3. Guardar en cache por 1 hora
    await redis.set(key, JSON.stringify(user), { EX: 3600 });

    return user;
  }

  return null;
};

/**
 * Actualizar perfil del usuario (nombre y apellidos)
 */
exports.updateProfile = async (userId, data) => {
  const { nombre, apellidos } = data;

  const result = await db.query(
    `UPDATE usuario 
     SET nombre = COALESCE($1, nombre), 
         apellidos = COALESCE($2, apellidos)
     WHERE id_usuario = $3
     RETURNING id_usuario, email, nombre, apellidos, tipo, estado, email_verificado`,
    [nombre, apellidos, userId]
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'Usuario no encontrado' };
  }

  // Invalidar cache
  const key = `user:${userId}`;
  await redis.del(key);

  return result.rows[0];
};

/**
 * Eliminar cuenta del usuario (eliminación permanente)
 */
exports.deleteAccount = async (userId) => {
  // Eliminación permanente del registro
  const result = await db.query(
    `DELETE FROM usuario 
     WHERE id_usuario = $1
     RETURNING id_usuario, email`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'Usuario no encontrado' };
  }

  // Invalidar cache
  const key = `user:${userId}`;
  await redis.del(key);

  return result.rows[0];
};
