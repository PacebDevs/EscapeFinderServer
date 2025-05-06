const db = require('../config/db');
const redis = require('../cache/redisClient');
const { io } = require('../socket');

exports.getFilteredSalas = async (filters) => {
  const cacheKey = `salas:${JSON.stringify(filters)}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('⚡ Cache HIT - usando Redis');
    return JSON.parse(cached);
  }

  console.log('🐘 Cache MISS - consultando PostgreSQL');

  let query = `
    SELECT 
      s.*, 
      l.nombre AS nombre_local, 
      d.*, 
      e.nombre AS empresa,
      tr.nombre AS tipo_reserva,
      s.cover_url,  -- ✅ URL portada directamente desde la tabla sala
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

  const values = [];
  let idx = 1;

  const likeFilters = {
    nombre: 's.nombre',
    descripcion: 's.descripcion',
    dificultad: 's.dificultad',
    tiempo: 's.tiempo',
    jugadores_min: 's.jugadores_min',
    jugadores_max: 's.jugadores_max',
    actores: 's.actores',
    experiencia_por_jugador: 's.experiencia_por_jugador',
    tipo_reserva: 'tr.nombre',
    nombre_local: 'l.nombre',
    telefono_local: 'l.telefono',
    email_local: 'l.email',
    web_local: 'l.web',
    tipo_via: 'd.tipo_via',
    nombre_via: 'd.nombre_via',
    numero: 'd.numero',
    ampliacion: 'd.ampliacion',
    codigo_postal: 'd.codigo_postal',
    ciudad: 'd.ciudad',
    codigo_google: 'd.codigo_google',
    categoria: 'c.nombre',
    idioma: 'i.nombre',
    publico_objetivo: 'po.nombre',
    restriccion: 'r.nombre',
    discapacidad: 'dis.nombre',
    empresa: 'e.nombre'
  };

  for (const [key, column] of Object.entries(likeFilters)) {
    if (filters[key]) {
      query += ` AND ${column} ILIKE $${idx++}`;
      values.push(`%${filters[key]}%`);
    }
  }

  query += ` GROUP BY s.id_sala, l.id_local, d.id_direccion, e.id_empresa, tr.id_tipo_reserva`;

  const { rows } = await db.query(query, values);

  await redis.set(cacheKey, JSON.stringify(rows), { EX: 600 }); // cache 10 minutos

  return rows;
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
