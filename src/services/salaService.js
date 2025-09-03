const db = require('../config/db');
const redis = require('../cache/redisClient');
const { io } = require('../socket');

exports.getFilteredSalas = async (filters) => {

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
  tipo_sala: Array.isArray(filters.tipo_sala)
    ? filters.tipo_sala.map(t => t.toLowerCase().trim()).filter(Boolean)
    : [],

  // 💶 precio por persona (umbral) - único valor desde el front
  precio_pp: Number.isFinite(Number(filters.precio)) ? Number(filters.precio) : null,

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

  // ✨ INICIO DEL CAMBIO: Guardar los índices de los parámetros
  let distanciaSelect = 'NULL AS distancia_km,';
  let latIdx, lngIdx; // Variables para guardar los índices

  if (usarCoordenadas) {
    latIdx = idx++; // Guardamos el índice actual para la latitud
    lngIdx = idx++; // Guardamos el siguiente para la longitud

    distanciaSelect = `
      (earth_distance(
        ll_to_earth($${latIdx}, $${lngIdx}),
        ll_to_earth(d.latitud, d.longitud)
      ) / 1000) AS distancia_km,
    `;
    values.push(normalizedFilters.coordenadas.lat, normalizedFilters.coordenadas.lng);
    // No incrementamos 'idx' aquí porque ya lo hicimos al asignar latIdx y lngIdx
  }
  // ✨ FIN DEL CAMBIO

  let query = `
    SELECT 
      s.*, 
      v.min_pp AS precio_min_pp,
      v.max_pp AS precio_max_pp,
      ${distanciaSelect} -- Aquí se inserta el cálculo o NULL
      l.nombre AS nombre_local, 
      d.*, 
      e.nombre AS empresa,
      tr.nombre AS tipo_sala,
      tr.nombre AS tipo_reserva,
      s.cover_url,
      ARRAY_AGG(DISTINCT c.nombre) AS categorias,
      ARRAY_AGG(DISTINCT i.nombre) AS idiomas,
      
      -- Para la lista, solo mostramos las características que son TRUE
      ARRAY_AGG(DISTINCT car.nombre) FILTER (WHERE car.tipo = 'publico_objetivo' AND sc.es_apta = true) AS publico_objetivo,
      ARRAY_AGG(DISTINCT car.nombre) FILTER (WHERE car.tipo = 'restriccion' AND sc.es_apta = true) AS restricciones,
      ARRAY_AGG(DISTINCT car.nombre) FILTER (WHERE car.tipo = 'accesibilidad' AND sc.es_apta = true) AS discapacidades,

      ARRAY_AGG(DISTINCT ts.nombre) AS tipo_sala
    FROM sala s
    JOIN local l ON s.id_local = l.id_local
    LEFT JOIN sala_precio_minmax v ON v.id_sala = s.id_sala
    LEFT JOIN empresa e ON e.id_empresa = l.id_empresa
    LEFT JOIN direccion d ON d.id_local = l.id_local
    LEFT JOIN tipo_reserva tr ON tr.id_tipo_reserva = s.id_tipo_reserva
    LEFT JOIN sala_categoria sc_cat ON sc_cat.id_sala = s.id_sala
    LEFT JOIN categoria c ON c.id_categoria = sc_cat.id_categoria
    LEFT JOIN sala_idioma si ON si.id_sala = s.id_sala
    LEFT JOIN idioma i ON i.id_idioma = si.id_idioma
    LEFT JOIN sala_caracteristica sc ON sc.id_sala = s.id_sala
    LEFT JOIN caracteristicas car ON car.id_caracteristica = sc.id_caracteristica
    LEFT JOIN sala_tipo_sala sts ON sts.id_sala = s.id_sala
    LEFT JOIN tipo_sala ts ON ts.id_tipo_sala = sts.id_tipo_sala
    WHERE 1=1
  `;

  if (normalizedFilters.query) {
    // Usamos la función f_unaccent en la consulta
    query += ` AND (LOWER(public.f_unaccent(s.nombre)) LIKE LOWER(public.f_unaccent($${idx})) OR LOWER(public.f_unaccent(e.nombre)) LIKE LOWER(public.f_unaccent($${idx})))`;
    values.push(`%${normalizedFilters.query}%`); // Pasamos el valor con acentos, la DB se encarga
    idx++;
  }

  if (normalizedFilters.categorias.length > 0) {
    // Aplicamos f_unaccent a cada placeholder
    const placeholders = normalizedFilters.categorias.map(() => `LOWER(public.f_unaccent($${idx++}))`);
    query += ` AND LOWER(public.f_unaccent(c.nombre)) IN (${placeholders.join(', ')})`;
    // Pasamos los valores originales, la DB se encarga de todo
    values.push(...normalizedFilters.categorias);
  }

  if (normalizedFilters.dificultad.length > 0) {
    // Aplicamos f_unaccent a cada placeholder
    const placeholders = normalizedFilters.dificultad.map(() => `LOWER(public.f_unaccent($${idx++}))`);
    query += ` AND LOWER(public.f_unaccent(s.dificultad)) IN (${placeholders.join(', ')})`;
    values.push(...normalizedFilters.dificultad);
  }

  // 🔤 Filtro único de IDIOMA
  if (normalizedFilters.idioma) {
    const idiomaIdx = idx++;
    query += `
      AND EXISTS (
        SELECT 1
        FROM sala_idioma si2
        JOIN idioma i2 ON i2.id_idioma = si2.id_idioma
        WHERE si2.id_sala = s.id_sala
          AND LOWER(public.f_unaccent(i2.nombre)) = LOWER(public.f_unaccent($${idiomaIdx}))
      )
    `;
    values.push(normalizedFilters.idioma);
  }

  if (!usarCoordenadas && normalizedFilters.ciudad) {
    // Usamos la función f_unaccent en la consulta
    query += ` AND LOWER(public.f_unaccent(d.ciudad)) = $${idx}`;
    values.push(normalizedFilters.ciudad);
    idx++;
  }
  if (normalizedFilters.jugadores !== null) {
    query += ` AND $${idx} BETWEEN s.jugadores_min AND s.jugadores_max`;
    values.push(normalizedFilters.jugadores);
    idx++;
  }

  // ✨ CAMBIO: Lógica simplificada para el filtro de ACTORES
  if (normalizedFilters.actores) { // Solo se aplica si es 'true'
    query += ` AND s.actores = true`;
  }

  // 💶 Filtro de PRECIO por persona
  if (normalizedFilters.precio_pp !== null) {
    if (normalizedFilters.jugadores !== null) {
      // Con nº de jugadores: usa precio exacto si existe; si no existe, cae a max_pp de la sala
      const precioIdx = idx++;
      const playersIdx = idx++;
      query += `
        AND (
          EXISTS (
            SELECT 1
            FROM sala_precio sp
            WHERE sp.id_sala = s.id_sala
              AND sp.players = $${playersIdx}
              AND sp.price_per_player <= $${precioIdx}
          )
          OR (
            NOT EXISTS (
              SELECT 1
              FROM sala_precio sp2
              WHERE sp2.id_sala = s.id_sala
                AND sp2.players = $${playersIdx}
            )
            AND EXISTS (
              SELECT 1
              FROM sala_precio_minmax v
              WHERE v.id_sala = s.id_sala
                AND v.max_pp <= $${precioIdx}
            )
          )
        )
      `;
      values.push(normalizedFilters.precio_pp, normalizedFilters.jugadores);
    } else {
      // Sin nº de jugadores: que su precio por persona NO supere el umbral -> max_pp <= precio
      const precioIdx = idx++;
      query += `
        AND EXISTS (
          SELECT 1
          FROM sala_precio_minmax v2
          WHERE v2.id_sala = s.id_sala
            AND v2.max_pp <= $${precioIdx}
        )
      `;
      values.push(normalizedFilters.precio_pp);
    }
  }

  // Lógica para ACCESIBILIDAD (Opt-in: debe tener es_apta = true)
  if (normalizedFilters.accesibilidad.length > 0) {
    const placeholders = normalizedFilters.accesibilidad.map(() => `LOWER(public.f_unaccent($${idx++}))`);
    query += `
      AND s.id_sala IN (
        SELECT sc_sub.id_sala
        FROM sala_caracteristica sc_sub
        JOIN caracteristicas car_sub ON sc_sub.id_caracteristica = car_sub.id_caracteristica
        WHERE LOWER(public.f_unaccent(car_sub.nombre)) IN (${placeholders.join(', ')})
          AND sc_sub.es_apta = true
        GROUP BY sc_sub.id_sala
        HAVING COUNT(DISTINCT car_sub.id_caracteristica) = ${normalizedFilters.accesibilidad.length}
      )
    `;
    values.push(...normalizedFilters.accesibilidad);
  }

  // Lógica para PUBLICO OBJETIVO (Opt-in: debe tener es_apta = true)
  if (normalizedFilters.publico_objetivo.length > 0) {
    const placeholders = normalizedFilters.publico_objetivo.map(() => `LOWER(public.f_unaccent($${idx++}))`);
    query += `
      AND s.id_sala IN (
        SELECT sc_sub.id_sala
        FROM sala_caracteristica sc_sub
        JOIN caracteristicas car_sub ON sc_sub.id_caracteristica = car_sub.id_caracteristica
        WHERE LOWER(public.f_unaccent(car_sub.nombre)) IN (${placeholders.join(', ')})
          AND sc_sub.es_apta = true
        GROUP BY sc_sub.id_sala
        HAVING COUNT(DISTINCT car_sub.id_caracteristica) = ${normalizedFilters.publico_objetivo.length}
      )
    `;
    values.push(...normalizedFilters.publico_objetivo);
  }

  // Lógica para RESTRICCIONES (Opt-out: NO debe tener es_apta = false)
  if (normalizedFilters.restricciones_aptas.length > 0) {
    for (const restriccion of normalizedFilters.restricciones_aptas) {
      query += `
        AND NOT EXISTS (
          SELECT 1
          FROM sala_caracteristica sc_sub
          JOIN caracteristicas car_sub ON sc_sub.id_caracteristica = car_sub.id_caracteristica
          WHERE sc_sub.id_sala = s.id_sala
            AND LOWER(public.f_unaccent(car_sub.nombre)) = LOWER(public.f_unaccent($${idx++}))
            AND sc_sub.es_apta = false
        )
      `;
      values.push(restriccion);
    }
  }

/*if (normalizedFilters.precio.min !== undefined && normalizedFilters.precio.max !== undefined) {
  query += ` AND s.precio_min >= $${idx} AND s.precio_max <= $${idx + 1}`;
  values.push(normalizedFilters.precio.min, normalizedFilters.precio.max);
  idx += 2;
}*/
// 🌍 Distancia por coordenadas usando earth_distance + ll_to_earth (requiere extensiones cube + earthdistance)
// NOTA: PostgreSQL espera distancia en METROS (por eso se multiplica por 1000)
if (usarCoordenadas) {

  // ✨ CAMBIO: Usar los índices guardados en lugar de hardcodear 1 y 2
  const distIdx = idx++;

  query += `
    AND earth_distance(
      ll_to_earth($${latIdx}, $${lngIdx}),
      ll_to_earth(d.latitud, d.longitud)
    ) <= $${distIdx}
  `;

  values.push(
    normalizedFilters.distancia * 1000 // en metros
  );
}


  query += `
    GROUP BY s.id_sala, l.id_local, d.id_direccion, e.id_empresa, tr.id_tipo_reserva, v.min_pp, v.max_pp
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



exports.getSalaById = async (id_sala, lat = null, lng = null) => {
  const calcularDistancia = Number.isFinite(lat) && Number.isFinite(lng);
  const values = [id_sala];
  let idx = 2;

  const distanciaSelect = calcularDistancia
    ? `(earth_distance(ll_to_earth($${idx++}, $${idx++}), ll_to_earth(d.latitud, d.longitud)) / 1000) AS distancia_km,`
    : `NULL AS distancia_km,`;

  if (calcularDistancia) {
    values.push(lat, lng);
  }

  const query = `
    SELECT 
      s.*, 
      ${distanciaSelect}
      v.min_pp AS precio_min_pp,
      v.max_pp AS precio_max_pp,
      l.nombre AS nombre_local, 
      d.*, 
      e.nombre AS empresa,
      tr.nombre AS tipo_reserva,
      s.cover_url,
      s.descripcion_corta,

      ARRAY_AGG(DISTINCT c.nombre) AS categorias,
      ARRAY_AGG(DISTINCT i.nombre) AS idiomas,
      ARRAY_AGG(DISTINCT ts.nombre) AS tipo_sala,

      -- Características con estado TRUE/FALSE y tipo
      jsonb_agg(DISTINCT jsonb_build_object(
        'nombre', car.nombre,
        'tipo', car.tipo,
        'es_apta', sc.es_apta
      )) AS caracteristicas,

      -- Todas las imágenes
      json_agg(DISTINCT jsonb_build_object(
        'tipo', sim.tipo,
        'url', sim.image_url
      )) FILTER (WHERE sim.id_sala_imagen IS NOT NULL) AS imagenes

    FROM sala s
    JOIN local l ON s.id_local = l.id_local
    LEFT JOIN empresa e ON e.id_empresa = l.id_empresa
    LEFT JOIN direccion d ON d.id_local = l.id_local
    LEFT JOIN tipo_reserva tr ON tr.id_tipo_reserva = s.id_tipo_reserva
    LEFT JOIN sala_categoria sc_cat ON sc_cat.id_sala = s.id_sala
    LEFT JOIN categoria c ON c.id_categoria = sc_cat.id_categoria
    LEFT JOIN sala_idioma si ON si.id_sala = s.id_sala
    LEFT JOIN idioma i ON i.id_idioma = si.id_idioma
    LEFT JOIN sala_caracteristica sc ON sc.id_sala = s.id_sala
    LEFT JOIN caracteristicas car ON car.id_caracteristica = sc.id_caracteristica
    LEFT JOIN sala_tipo_sala sts ON sts.id_sala = s.id_sala
    LEFT JOIN tipo_sala ts ON ts.id_tipo_sala = sts.id_tipo_sala
    LEFT JOIN sala_imagen sim ON sim.id_sala = s.id_sala
    LEFT JOIN sala_precio_minmax v ON v.id_sala = s.id_sala

    WHERE s.id_sala = $1
    GROUP BY 
      s.id_sala, l.id_local, d.id_direccion, e.id_empresa, tr.id_tipo_reserva, v.min_pp, v.max_pp
  `;

  const { rows } = await db.query(query, values);
  const sala = rows[0] || null;

  if (!sala) return null;

  // 🧾 Obtener precios por número de jugadores
  const precioQuery = `
    SELECT 
      players AS jugadores,
      price_total AS total,
      price_per_player AS pp
    FROM sala_precio
    WHERE id_sala = $1
    ORDER BY players ASC
  `;
  const { rows: precios } = await db.query(precioQuery, [id_sala]);

  sala.precios_por_jugadores = precios;

  return sala;
};

