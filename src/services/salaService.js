const db = require('../config/db');
const redis = require('../cache/redisClient');
const { io } = require('../socket');

exports.getFilteredSalas = async (filters) => {
  const normalizedFilters = {
    query: filters.query || '',
    categorias: Array.isArray(filters.categorias) ? [...filters.categorias].sort() : [],
    limit: Number(filters.limit) || 20,
    offset: Number(filters.offset) || 0,
    orden: filters.orden || 'nombre',
  };

  const cacheKey = `salas:${JSON.stringify(normalizedFilters)}`;

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
      tr.nombre AS tipo_reserva,
      s.cover_url,
      ARRAY_AGG(DISTINCT c.nombre) AS categorias,
      ARRAY_AGG(DISTINCT i.nombre) AS idiomas,
      ARRAY_AGG(DISTINCT po.nombre) AS publico_objetivo,
      ARRAY_AGG(DISTINCT r.nombre) AS restricciones,
      ARRAY_AGG(DISTINCT dis.nombre) AS discapacidades
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

  query += `
    GROUP BY s.id_sala, l.id_local, d.id_direccion, e.id_empresa, tr.id_tipo_reserva
    ORDER BY s.${campoOrden} ASC
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  values.push(normalizedFilters.limit, normalizedFilters.offset);

  console.log('📤 Query ejecutada con filtros:', normalizedFilters);
  console.log(query);

  const { rows } = await db.query(query, values);

  await redis.set(cacheKey, JSON.stringify(rows), { EX: 600 });

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
      ARRAY_AGG(DISTINCT dis.nombre) AS discapacidades
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
