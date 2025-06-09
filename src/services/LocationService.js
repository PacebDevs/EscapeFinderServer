require('dotenv').config();
const axios = require('axios');
const redis = require('../cache/redisClient');

const TTL = 60 * 60 * 24 * 30; // 30 dias

function extractCity(results) {
  for (const result of results) {
    const locality = result.address_components.find(c => c.types.includes('locality'));
    if (locality) return locality.long_name;
    const admin = result.address_components.find(c => c.types.includes('administrative_area_level_1'));
    if (admin) return admin.long_name;
  }
  return null;
}

exports.getCityFromQuery = async (query) => {
  if (!query) throw new Error('Par\xE1metro query requerido');
  const cacheKey = `geocode:${query}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = 'https://maps.googleapis.com/maps/api/geocode/json';
  const { data } = await axios.get(url, {
    params: {
      address: query,
      key: process.env.GOOGLE_API_KEY,
    },
  });

  if (!data.results || data.results.length === 0) {
    const error = new Error('Ciudad no encontrada');
    error.status = 404;
    throw error;
  }

  const city = extractCity(data.results);
  if (!city) {
    const error = new Error('Ciudad no encontrada');
    error.status = 404;
    throw error;
  }

  await redis.set(cacheKey, city, { EX: TTL });
  return city;
};

exports.getCityFromCoords = async (lat, lng) => {
  if (typeof lat === 'undefined' || typeof lng === 'undefined') {
    throw new Error('Par\xE1metros lat y lng requeridos');
  }

  const cacheKey = `reverse:${lat},${lng}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = 'https://maps.googleapis.com/maps/api/geocode/json';
  const { data } = await axios.get(url, {
    params: {
      latlng: `${lat},${lng}`,
      key: process.env.GOOGLE_API_KEY,
    },
  });

  if (!data.results || data.results.length === 0) {
    const error = new Error('Ciudad no encontrada');
    error.status = 404;
    throw error;
  }

  const city = extractCity(data.results);
  if (!city) {
    const error = new Error('Ciudad no encontrada');
    error.status = 404;
    throw error;
  }

  await redis.set(cacheKey, city, { EX: TTL });
  return city;
};