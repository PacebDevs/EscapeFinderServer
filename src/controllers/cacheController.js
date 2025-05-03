const redis = require('../cache/redisClient');

exports.flushFilterCache = async (req, res) => {
  const keys = await redis.keys('salas:filter:*');
  if (keys.length) {
    await redis.del(...keys);
    return res.json({ message: 'Cache de filtros limpiada', total: keys.length });
  } else {
    return res.json({ message: 'No había cache para limpiar' });
  }
};
