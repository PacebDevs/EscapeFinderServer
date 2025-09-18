const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const redis = require('../cache/redisClient');
require('dotenv').config();

// Directorio para almacenar mapas
const MAPS_DIR = path.join(__dirname, '../uploads/maps');
// Asegurarse que el directorio existe
if (!fs.existsSync(MAPS_DIR)) {
  fs.mkdirSync(MAPS_DIR, { recursive: true });
}

// TTL para caché de Redis (30 días)
const TTL_CACHE = 60 * 60 * 24 * 30;
// URL base para servir mapas estáticos
const MAPS_URL_BASE = 'maps';

/**
 * Genera un nombre de archivo único basado en los parámetros
 */
function generateMapFilename(lat, lng, zoom, width, height) {
  const data = `${lat},${lng}:${zoom}:${width}x${height}`;
  const hash = crypto.createHash('md5').update(data).digest('hex');
  return `map_${hash}.png`;
}

/**
 * Obtiene el mapa estático para las coordenadas dadas
 * Si ya existe en disco, lo sirve desde ahí
 * Si no, lo solicita a Google Maps, lo guarda y lo sirve
 */
exports.getStaticMap = async (lat, lng, zoom = 15, width = 600, height = 300) => {
  if (!lat || !lng) {
    throw new Error('Se requiere latitud y longitud para generar el mapa');
  }
  
  // Generar clave para Redis
  const cacheKey = `map:static:${lat},${lng}:${zoom}:${width}x${height}`;
  
  // Verificar en Redis primero
  const cachedPath = await redis.get(cacheKey);
  if (cachedPath) {
    console.log('⚡ Cache HIT - Ruta de mapa desde Redis');
    return cachedPath;
  }

  console.log('🗺️ Cache MISS - Verificando existencia en disco');
  
  // Generar nombre de archivo único
  const filename = generateMapFilename(lat, lng, zoom, width, height);
  const filePath = path.join(MAPS_DIR, filename);
  const publicUrl = `${MAPS_URL_BASE}/${filename}`;
  
  // Verificar si existe en disco
  if (fs.existsSync(filePath)) {
    console.log('💾 Encontrado en disco - Actualizando caché');
    // Actualizar caché de Redis
    await redis.set(cacheKey, publicUrl, { EX: TTL_CACHE });
    return publicUrl;
  }
  
  console.log('🌐 No encontrado - Solicitando a Google Maps API');
  
  // Construir URL para Google Maps Static API
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const mapUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');
  
  // Añadir parámetros
  mapUrl.searchParams.append('center', `${lat},${lng}`);
  mapUrl.searchParams.append('zoom', zoom);
  mapUrl.searchParams.append('size', `${width}x${height}`);
  mapUrl.searchParams.append('markers', `color:red|${lat},${lng}`);
  mapUrl.searchParams.append('key', googleApiKey);
  
  try {
    // Descargar imagen
    const response = await axios.get(mapUrl.toString(), { responseType: 'arraybuffer' });
    
    // Guardar en disco
    fs.writeFileSync(filePath, response.data);
    console.log(`✅ Mapa guardado en: ${filePath}`);
    
    // Guardar referencia en Redis
    await redis.set(cacheKey, publicUrl, { EX: TTL_CACHE });
    
    return publicUrl;
  } catch (error) {
    console.error('❌ Error descargando mapa:', error.message);
    // En lugar de lanzar el error, devuelve null o una URL de mapa de respaldo
    return null; // o return 'URL_DE_MAPA_GENÉRICO';
  }
};

/**
 * Invalida la caché de mapas para una ubicación específica
 * y elimina las imágenes asociadas
 */
exports.invalidateMapCache = async (lat, lng) => {
  if (!lat || !lng) {
    console.warn('⚠️ Coordenadas no válidas para invalidar caché');
    return 0;
  }

  console.log(`♻️ Intentando invalidar caché para coordenadas: ${lat}, ${lng}`);
  const pattern = `map:static:${lat},${lng}:*`;
  const keys = await redis.keys(pattern);
  
  // Para cada clave en Redis
  for (const key of keys) {
    // Obtener la ruta de la imagen
    const imagePath = await redis.get(key);
    if (imagePath) {
      // Extraer nombre de archivo
      const filename = path.basename(imagePath);
      const fullPath = path.join(MAPS_DIR, filename);
      
      // Eliminar archivo si existe
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`🗑️ Eliminado archivo: ${fullPath}`);
        } catch (err) {
          console.error(`❌ Error eliminando archivo ${fullPath}:`, err);
        }
      }
    }
  }
  
  // Eliminar claves de Redis
  if (keys.length > 0) {
    await redis.del(keys);
    console.log(`♻️ Caché de mapas invalidada para coordenadas ${lat},${lng}: ${keys.length} entradas`);
    return keys.length;
  }
  
  console.log('⚠️ No se encontraron entradas de caché para invalidar');
  return 0;
};