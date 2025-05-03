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
