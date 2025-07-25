const db = require('../config/db');
const redis = require('../cache/redisClient');
const { io } = require('../socket');

exports.getFilteredSalas = async (filters) => {

const normalizedFilters = {
  query: filters.query || '',
  ciudad: filters.ciudad?.toLowerCase().trim() || '',
  categorias: Array.isArray(filters.categorias) ? [...filters.categorias].sort() : [],

  jugadores: Number.isFinite(Number(filters.jugadores)) ? Number(filters.jugadores) : null,
   tipo_sala: Array.isArray(filters.tipo_sala)
    ? filters.tipo_sala.map(t => t.toLowerCase().trim()).filter(Boolean)
    : [],
  precio: {
    min: Number(filters.precio?.min) || 0,
    max: Number(filters.precio?.max) || 9999
  },
  distancia: filters.distancia_km || null,
  coordenadas: {
  lat: Number.isFinite(Number(filters.lat)) ? Number(filters.lat) : null,
  lng: Number.isFinite(Number(filters.lng)) ? Number(filters.lng) : null
},
  limit: Number(filters.limit) || 20,
  offset: Number(filters.offset) || 0,
  orden: filters.orden || 'nombre',
};
console.log(filters.jugadores + 'Pruebaaaaaaa')
const usarCoordenadas = (
  normalizedFilters.distancia &&
  normalizedFilters.coordenadas.lat &&
  normalizedFilters.coordenadas.lng
);


function deepClean(obj) {
  if (Array.isArray(obj)) {
    return obj.map(deepClean).filter(v => v !== null && v !== undefined);
  } else if (typeof obj === 'object' && obj !== null) {
    const cleaned = Object.entries(obj).reduce((acc, [key, val]) => {
      const cleanedVal = deepClean(val);
      if (
        cleanedVal !== null &&
        cleanedVal !== undefined &&
        (typeof cleanedVal !== 'object' || Object.keys(cleanedVal).length > 0)
      ) {
        acc[key] = cleanedVal;
      }
      return acc;
    }, {});
    return cleaned;
  }
  return obj;
}

// Aplica esto justo después de normalizedFilters
const cleanedFilters = deepClean(normalizedFilters);

const orderedFilters = Object.keys(cleanedFilters)
  .sort()
  .reduce((obj, key) => {
    obj[key] = cleanedFilters[key];
    return obj;
  }, {});

const cacheKey = `salas:${JSON.stringify(orderedFilters)}`;
console.log('→ BACKEND - filtros RAW:', filters);
console.log('→ normalizedFilters:', normalizedFilters);
console.log('→ cleanedFilters:', cleanedFilters);
console.log('→ cacheKey:', cacheKey);

  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('⚡ Cache HIT - usando Redis');
    return JSON.parse(cached);
  }

  console.log('🐘 Cache MISS - consultando PostgreSQL');

  const values = [];
  let idx = 1;

  const ordenValido = ['nombre', 'dificultad', 'tiempo'];
  const campoOrden = ordenValido.includes(normalizedFilters.orden) ? normalizedFilters.orden : 'nombre';

  let query = `
    SELECT 
      s.*, 
      l.nombre AS nombre_local, 
      d.*, 
      e.nombre AS empresa,
      tr.nombre AS tipo_sala,
      tr.nombre AS tipo_reserva,
      s.cover_url,
      ARRAY_AGG(DISTINCT c.nombre) AS categorias,
      ARRAY_AGG(DISTINCT i.nombre) AS idiomas,
      ARRAY_AGG(DISTINCT po.nombre) AS publico_objetivo,
      ARRAY_AGG(DISTINCT r.nombre) AS restricciones,
      ARRAY_AGG(DISTINCT dis.nombre) AS discapacidades,
      ARRAY_AGG(DISTINCT ts.nombre) AS tipo_sala
    FROM sala s
    JOIN local l ON s.id_local = l.id_local
    LEFT JOIN empresa e ON e.id_empresa = l.id_empresa
    LEFT JOIN direccion d ON d.id_local = l.id_local
    LEFT JOIN tipo_reserva tr ON tr.id_tipo_reserva = s.id_tipo_reserva
    LEFT JOIN sala_categoria sc ON sc.id_sala = s.id_sala
    LEFT JOIN categoria c ON c.id_categoria = sc.id_categoria
    LEFT JOIN sala_idioma si ON si.id_sala = s.id_sala
    LEFT JOIN idioma i ON i.id_idioma = si.id_idioma
    LEFT JOIN sala_publico_objetivo spo ON spo.id_sala = s.id_sala
    LEFT JOIN publico_objetivo po ON po.id_publico_objetivo = spo.id_publico_objetivo
    LEFT JOIN sala_restriccion sr ON sr.id_sala = s.id_sala
    LEFT JOIN restriccion r ON r.id_restriccion = sr.id_restriccion
    LEFT JOIN sala_discapacidad sd ON sd.id_sala = s.id_sala
    LEFT JOIN discapacidad dis ON dis.id_discapacidad = sd.id_discapacidad
    LEFT JOIN sala_tipo_sala sts ON sts.id_sala = s.id_sala
    LEFT JOIN tipo_sala ts ON ts.id_tipo_sala = sts.id_tipo_sala
    WHERE 1=1
  `;

  if (normalizedFilters.query) {
    query += ` AND (LOWER(s.nombre) LIKE $${idx} OR LOWER(e.nombre) LIKE $${idx})`;
    values.push(`%${normalizedFilters.query.toLowerCase()}%`);
    idx++;
  }

  if (normalizedFilters.categorias.length > 0) {
    const placeholders = normalizedFilters.categorias.map(() => `$${idx++}`);
    query += ` AND LOWER(c.nombre) IN (${placeholders.join(', ')})`;
    values.push(...normalizedFilters.categorias.map(c => c.toLowerCase()));
  }

  if (normalizedFilters.tipo_sala.length > 0) {
    const placeholders = normalizedFilters.tipo_sala.map(() => `$${idx++}`);
    query += ` AND LOWER(ts.nombre) IN (${placeholders.join(', ')})`; 
    values.push(...normalizedFilters.tipo_sala.map(t => t.toLowerCase()));
  }

  if (!usarCoordenadas && normalizedFilters.ciudad) {
    query += ` AND LOWER(d.ciudad) = $${idx}`;
    values.push(normalizedFilters.ciudad);
    idx++;
  }
  if (normalizedFilters.jugadores !== null) {
    query += ` AND $${idx} BETWEEN s.jugadores_min AND s.jugadores_max`;
    values.push(normalizedFilters.jugadores);
    idx++;
  }

/*if (normalizedFilters.precio.min !== undefined && normalizedFilters.precio.max !== undefined) {
  query += ` AND s.precio_min >= $${idx} AND s.precio_max <= $${idx + 1}`;
  values.push(normalizedFilters.precio.min, normalizedFilters.precio.max);
  idx += 2;
}*/
// 🌍 Distancia por coordenadas usando earth_distance + ll_to_earth (requiere extensiones cube + earthdistance)
// NOTA: PostgreSQL espera distancia en METROS (por eso se multiplica por 1000)
if (usarCoordenadas) {

  const latIdx = idx++;
  const lngIdx = idx++;
  const distIdx = idx++;

  query += `
    AND earth_distance(
      ll_to_earth($${latIdx}, $${lngIdx}),
      ll_to_earth(d.latitud, d.longitud)
    ) <= $${distIdx}
  `;

  values.push(
    normalizedFilters.coordenadas.lat,
    normalizedFilters.coordenadas.lng,
    normalizedFilters.distancia * 1000 // en metros
  );
}


  query += `
    GROUP BY s.id_sala, l.id_local, d.id_direccion, e.id_empresa, tr.id_tipo_reserva
    ORDER BY s.${campoOrden} ASC
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  values.push(normalizedFilters.limit, normalizedFilters.offset);

  console.log('📤 Query ejecutada con filtros:', normalizedFilters);
  console.log('🔥 RAW filters:', filters);
  console.log(query);

  const { rows } = await db.query(query, values);

  //await redis.set(cacheKey, JSON.stringify(rows), { EX: 600 });
  await redis.set(cacheKey, JSON.stringify(rows), {
  EX: normalizedFilters.jugadores !== null ? 600 : 60
  });
console.log('📤 PostgreSQL respondió:', rows.length, 'salas');
  return rows;
};




exports.getSalaById = async (id_sala) => {
  const query = `
    SELECT 
      s.*, 
      l.nombre AS nombre_local, 
      d.*, 
      e.nombre AS empresa,
      tr.nombre AS tipo_reserva,
      s.cover_url,
      ARRAY_AGG(DISTINCT c.nombre) AS categorias,
      ARRAY_AGG(DISTINCT i.nombre) AS idiomas,
      ARRAY_AGG(DISTINCT po.nombre) AS publico_objetivo,
      ARRAY_AGG(DISTINCT r.nombre) AS restricciones,
      ARRAY_AGG(DISTINCT dis.nombre) AS discapacidades,
      ARRAY_AGG(DISTINCT ts.nombre) AS tipo_sala
    FROM sala s
    JOIN local l ON s.id_local = l.id_local
    LEFT JOIN empresa e ON e.id_empresa = l.id_empresa
    LEFT JOIN direccion d ON d.id_local = l.id_local
    LEFT JOIN tipo_reserva tr ON tr.id_tipo_reserva = s.id_tipo_reserva
    LEFT JOIN sala_categoria sc ON sc.id_sala = s.id_sala
    LEFT JOIN categoria c ON c.id_categoria = sc.id_categoria
    LEFT JOIN sala_idioma si ON si.id_sala = s.id_sala
    LEFT JOIN idioma i ON i.id_idioma = si.id_idioma
    LEFT JOIN sala_publico_objetivo spo ON spo.id_sala = s.id_sala
    LEFT JOIN publico_objetivo po ON po.id_publico_objetivo = spo.id_publico_objetivo
    LEFT JOIN sala_restriccion sr ON sr.id_sala = s.id_sala
    LEFT JOIN restriccion r ON r.id_restriccion = sr.id_restriccion
    LEFT JOIN sala_discapacidad sd ON sd.id_sala = s.id_sala
    LEFT JOIN discapacidad dis ON dis.id_discapacidad = sd.id_discapacidad
    LEFT JOIN sala_tipo_sala sts ON sts.id_sala = s.id_sala
    LEFT JOIN tipo_sala ts ON ts.id_tipo_sala = sts.id_tipo_sala
    WHERE s.id_sala = $1
    GROUP BY s.id_sala, l.id_local, d.id_direccion, e.id_empresa, tr.id_tipo_reserva
  `;
  const values = [id_sala];
  const { rows } = await db.query(query, values);
  return rows[0] || null;
};

exports.flushSalaCache = async () => {
  console.log('🧹 Intentando limpiar cache de salas...');
  const keys = await redis.keys('salas:*');
  if (keys.length > 0) {
    await redis.del(keys);
    console.log('♻️ Cache de salas invalidado');
  } else {
    console.log('ℹ️ No había claves de salas en cache');
  }
  io().emit('salasUpdated');
};
