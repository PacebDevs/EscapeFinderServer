const redis = require('../cache/redisClient'); // igual que usas en salaService
const { getSalasForMap } = require('../services/salasMapService');

// === helpers iguales a tu salaService ===
function deepClean(obj) { // mismo enfoque que en tu servicio
  if (Array.isArray(obj)) return obj.map(deepClean).filter(v => v !== null && v !== undefined);
  if (obj && typeof obj === 'object') {
    const cleaned = Object.entries(obj).reduce((acc, [k, v]) => {
      const cv = deepClean(v);
      if (cv !== null && cv !== undefined && (typeof cv !== 'object' || Object.keys(cv).length > 0)) acc[k] = cv;
      return acc;
    }, {});
    return cleaned;
  }
  return obj;
}
function orderObjectKeys(obj) {
  return Object.keys(obj).sort().reduce((acc, k) => {
    const v = obj[k];
    if (v === undefined) return acc;
    if (v && typeof v === 'object' && !Array.isArray(v)) acc[k] = orderObjectKeys(v);
    else if (Array.isArray(v)) acc[k] = [...v].sort();
    else acc[k] = v;
    return acc;
  }, {});
}

exports.getSalasMap = async (req, res) => {
  try {
    // ===== Validación mínima pedida: ciudad o lat/lng =====
    const ciudad = req.query.ciudad ? String(req.query.ciudad).trim() : '';
    const latQ = req.query.lat != null ? Number(req.query.lat) : null;
    const lngQ = req.query.lng != null ? Number(req.query.lng) : null;
    if (!ciudad && !(Number.isFinite(latQ) && Number.isFinite(lngQ))) {
      return res.status(400).json({ error: "Debes enviar 'ciudad' o bien 'lat' y 'lng'." });
    }

    // ===== Normalización igual que en getFilteredSalas =====
    const filters = { ...req.query };
    // CSV -> arrays (idéntico a tu controlador de lista)
    if (filters.categorias && typeof filters.categorias === 'string') filters.categorias = filters.categorias.split(',').map(c => c.trim());
    if (filters.dificultad && typeof filters.dificultad === 'string') filters.dificultad = filters.dificultad.split(',').map(d => d.trim());
    if (filters.accesibilidad && typeof filters.accesibilidad === 'string') filters.accesibilidad = filters.accesibilidad.split(',').map(a => a.trim());
    if (filters.restricciones_aptas && typeof filters.restricciones_aptas === 'string') filters.restricciones_aptas = filters.restricciones_aptas.split(',').map(r => r.trim());
    if (filters.publico_objetivo && typeof filters.publico_objetivo === 'string') filters.publico_objetivo = filters.publico_objetivo.split(',').map(p => p.trim());
    if (filters.idioma && typeof filters.idioma === 'string') filters.idioma = filters.idioma.trim();
    if (filters.jugadores && typeof filters.jugadores === 'string') filters.jugadores = parseInt(filters.jugadores, 10);
    if (typeof filters.precio === 'string') {
      const n = parseFloat(filters.precio.replace(',', '.'));
      if (!Number.isNaN(n)) filters.precio = n; else delete filters.precio;
    }
    if (filters.tipo_sala) {
      if (Array.isArray(filters.tipo_sala)) filters.tipo_sala = filters.tipo_sala.map(t => t.trim());
      else if (typeof filters.tipo_sala === 'string') filters.tipo_sala = filters.tipo_sala.split(',').map(t => t.trim());
    }
    // —— normalized igual que en tu servicio (sin limit/offset) ——
    const normalizedFilters = {
      query: filters.query || '',
      ciudad: filters.ciudad?.toLowerCase().trim() || '',
      categorias: Array.isArray(filters.categorias) ? [...filters.categorias].sort() : [],
      dificultad: Array.isArray(filters.dificultad) ? filters.dificultad.map(d => d.toLowerCase()) : [],
      accesibilidad: Array.isArray(filters.accesibilidad) ? filters.accesibilidad : [],
      restricciones_aptas: Array.isArray(filters.restricciones_aptas) ? filters.restricciones_aptas : [],
      publico_objetivo: Array.isArray(filters.publico_objetivo) ? filters.publico_objetivo : [],
      idioma: (typeof filters.idioma === 'string') ? filters.idioma : '',
      actores: filters.actores === 'true',
      jugadores: Number.isFinite(Number(filters.jugadores)) ? Number(filters.jugadores) : null,
      tipo_sala: Array.isArray(filters.tipo_sala) ? filters.tipo_sala.map(t => t.toLowerCase().trim()).filter(Boolean) : [],
      precio_pp: Number.isFinite(Number(filters.precio)) ? Number(filters.precio) : null,
      distancia: filters.distancia_km || null,
      coordenadas: {
        lat: Number.isFinite(Number(filters.lat)) ? Number(filters.lat) : null,
        lng: Number.isFinite(Number(filters.lng)) ? Number(filters.lng) : null
      },
      // sin limit/offset/orden
    };

    // ===== cacheKey con tu patrón + flag de modo =====
    const baseForKey = deepClean({ ...normalizedFilters, mode: 'map_all' }); // misma limpieza/orden que usas ahora
    const orderedFilters = orderObjectKeys(baseForKey);
    const cacheKey = `salas:${JSON.stringify(orderedFilters)}`; // MISMA convención que tu lista (prefijo + JSON ordenado) :contentReference[oaicite:4]{index=4}
    // try cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.set('X-Cache-Hit', '1');
      return res.json(JSON.parse(cached));
    }

    const rows = await getSalasForMap(normalizedFilters);

    // TTL igual que en lista (jugadores? 600 : 60) :contentReference[oaicite:5]{index=5}
    const ttl = normalizedFilters.jugadores !== null ? 600 : 60;
    await redis.set(cacheKey, JSON.stringify(rows), { EX: ttl });

    return res.json(rows);
  } catch (err) {
    console.error('❌ Error en getSalasMap:', err);
    return res.status(500).json({ error: 'Error al obtener salas para mapa' });
  }
};
