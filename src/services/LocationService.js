// ===============================
// 📦 services/LocationService.js
// ===============================

require('dotenv').config();
const axios = require('axios');
const redis = require('../cache/redisClient');

const TTL_SHORT = 60 * 60;       // 1 hora (autocomplete)
const TTL_LONG = 60 * 60 * 24 * 30; // 30 días (geocode/reverse)

function normalize(str) {
  return str.trim().toLowerCase();
}

function extractCity(results) {
  for (const result of results) {
    const locality = result.address_components.find(c => c.types.includes('locality'));
    if (locality) return locality.long_name;
    const admin = result.address_components.find(c => c.types.includes('administrative_area_level_1'));
    if (admin) return admin.long_name;
  }
  return null;
}

exports.autocomplete = async (input) => {
  const key = `autocomplete:${normalize(input)}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
  const { data } = await axios.get(url, {
    params: {
      input,
      types: 'geocode',
      language: 'es',
      key: process.env.GOOGLE_API_KEY,
      components: 'country:es'
          //radius: 50000, // más resultados
    //strictbounds: false // sin recortar por límites artificiales
    }
  });

  const predictions = data.predictions.map(p => p.description);
  await redis.set(key, JSON.stringify(predictions), { EX: TTL_SHORT });
  return predictions;
};

exports.geocode = async (description) => {
  const key = `geocode-detail:${normalize(description)}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const url = 'https://maps.googleapis.com/maps/api/geocode/json';
  const { data } = await axios.get(url, {
    params: {
      address: description,
      key: process.env.GOOGLE_API_KEY
    }
  });

  if (!data.results || data.results.length === 0) {
    const error = new Error('Dirección no encontrada');
    error.status = 404;
    throw error;
  }

  const result = data.results[0];
  const ciudad = extractCity([result]);
  const payload = {
    direccion: result.formatted_address,
    ciudad,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng
  };

  await redis.set(key, JSON.stringify(payload), { EX: TTL_LONG });
  return payload;
};

exports.reverseGeocode = async (lat, lng) => {
  const key = `reverse:${lat},${lng}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const url = 'https://maps.googleapis.com/maps/api/geocode/json';
  const { data } = await axios.get(url, {
    params: {
      latlng: `${lat},${lng}`,
      key: process.env.GOOGLE_API_KEY
    }
  });

  if (!data.results || data.results.length === 0) {
    const error = new Error('Ubicación no encontrada');
    error.status = 404;
    throw error;
  }

  const result = data.results[0];
  const ciudad = extractCity([result]);
  const payload = {
    direccion: result.formatted_address,
    ciudad,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng
  };

  await redis.set(key, JSON.stringify(payload), { EX: TTL_LONG });
  return payload;
};
