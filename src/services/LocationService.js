// ===============================
// 📦 services/LocationService.js
// ===============================
require('dotenv').config();
const axios = require('axios');
const redis = require('../cache/redisClient');

// Contadores para estadísticas
let apiCallsCount = 0;
let cacheHitsCount = 0;
let lastReportTime = Date.now();

const TTL_SHORT = 60 * 60;            // 1 hora (autocomplete con resultados)
const TTL_EMPTY = 10 * 60;            // 10 min para resultados vacíos
const TTL_LONG  = 60 * 60 * 24 * 30;  // 30 días (geocode/reverse)

function normalize(str) {
  return str.trim().toLowerCase();
}
function normalizeBase(str) {
  return String(str).toLowerCase().replace(/\s{2,}/g, ' ');
}
function extractCity(results) {
  for (const result of results) {
    const locality = result.address_components?.find?.(c => c.types.includes('locality'));
    if (locality) return locality.long_name;
    const admin = result.address_components?.find?.(c => c.types.includes('administrative_area_level_1'));
    if (admin) return admin.long_name;
  }
  return null;
}

function logStats() {
  const total = apiCallsCount + cacheHitsCount;
  if (total === 0) return;
  const cacheRatio = (cacheHitsCount / total * 100).toFixed(2);
  const apiRatio = (apiCallsCount / total * 100).toFixed(2);
  console.log('\n📊 ESTADÍSTICAS DE AUTOCOMPLETADO 📊');
  console.log(`Total solicitudes: ${total}`);
  console.log(`Llamadas a API: ${apiCallsCount} (${apiRatio}%)`);
  console.log(`Aciertos de caché: ${cacheHitsCount} (${cacheRatio}%)`);
  console.log(`Ratio de ahorro: ${cacheRatio}%`);
  console.log('----------------------------------------\n');
}

// 👇 acepta { sessionToken, signal } y usa types dinámico (geocode/address)
exports.autocomplete = async (input, opts = {}) => {
  const { sessionToken, signal } = opts;

  // modo dinámico: sin número → geocode, con número → address
  const hasDigit = /\d/.test(input);
  const mode = hasDigit ? 'addr' : 'geo';

 const hasEndSpace = /\s$/.test(input);
  // Solo diferenciamos por espacio final en ADDR; en GEO lo colapsamos para mejorar el hit-rate de caché
  const spaceTag = (mode === 'addr' ? (hasEndSpace ? ':sp' : ':ns') : '');
  const key = `autocomplete:${normalizeBase(input).trim()}${spaceTag}:${mode}`;
 

  console.log(`🔍 Solicitud de autocompletado: "${input}" (mode=${mode})`);

  // caché
  const cached = await redis.get(key);
  if (cached) {
    cacheHitsCount++;
    console.log(`✅ CACHÉ: Se encontraron resultados en caché para "${input}"`);
    if (cacheHitsCount % 20 === 0 || Date.now() - lastReportTime > 5 * 60 * 1000) {
      logStats();
      lastReportTime = Date.now();
    }
    return JSON.parse(cached);
  }

  // llamada API (abortable)
  console.log(`🌐 API: Realizando llamada a Google Places API para "${input}" (types=${mode === 'addr' ? 'address' : 'geocode'})`);
  const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
  const params = {
    input,                               // crudo (espacio final si existe)
    types: hasDigit ? 'address' : 'geocode',
    language: 'es',
    components: 'country:es',
    key: process.env.GOOGLE_API_KEY
  };
  if (sessionToken) params.sessiontoken = sessionToken;

  try {
    const startTime = Date.now();
    const { data } = await axios.get(url, { params, signal }); // 👈 abortable con AbortController
    const endTime = Date.now();

    const predictions = (data?.predictions || []).map(p => p.description);
    await redis.set(key, JSON.stringify(predictions), { EX: predictions.length ? TTL_SHORT : TTL_EMPTY });

    apiCallsCount++; // cuenta solo si NO fue abortada
    console.log(`✅ API: Respuesta recibida con ${predictions.length} resultados en ${endTime - startTime}ms`);
    if (apiCallsCount % 5 === 0) { logStats(); lastReportTime = Date.now(); }

    return predictions;
  } catch (err) {
    // no cuentes si fue cancelada
    if (err && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.message === 'canceled')) {
      return [];
    }
    // otras fallas cuentan
    apiCallsCount++;
    throw err;
  }
};

exports.geocode = async (description) => {
  const key = `geocode-detail:${normalize(description)}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const url = 'https://maps.googleapis.com/maps/api/geocode/json';
  const { data } = await axios.get(url, {
    params: { address: description, key: process.env.GOOGLE_API_KEY }
  });

  if (!data.results || data.results.length === 0) {
    const error = new Error('Dirección no encontrada');
    error.status = 404;
    throw error;
  }

  const result = data.results[0];
  console.log('Geocode result:', result);
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
    params: { latlng: `${lat},${lng}`, key: process.env.GOOGLE_API_KEY }
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
