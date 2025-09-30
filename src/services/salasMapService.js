const db = require('../config/db');

// Recibe normalizedFilters con la misma forma que en getFilteredSalas (sin limit/offset)
exports.getSalasForMap = async (normalizedFilters) => {
  console.log('[SalasMapService] filtros recibidos:', JSON.stringify(normalizedFilters, null, 2));

  const values = [];
  let idx = 1;

  const usarCoordenadas = (
    normalizedFilters.distancia &&
    normalizedFilters.coordenadas.lat &&
    normalizedFilters.coordenadas.lng
  ); // misma condición que en tu servicio :contentReference[oaicite:8]{index=8}

  // Distancia opcional (como en tu lista) y posibilidad de devolver distancia_km en SELECT
  let distanciaSelect = 'NULL AS distancia_km,';
  let latIdx, lngIdx;
  if (usarCoordenadas) {
    latIdx = idx++;
    lngIdx = idx++;
    distanciaSelect = `
      (earth_distance(
        ll_to_earth($${latIdx}, $${lngIdx}),
        ll_to_earth(d.latitud, d.longitud)
      ) / 1000) AS distancia_km,
    `;
    values.push(normalizedFilters.coordenadas.lat, normalizedFilters.coordenadas.lng);
  }

  // SELECT mínimo para mapa (sin arrays ni blobs)
  let query = `
    SELECT
      s.id_sala,
      s.nombre,
      ${distanciaSelect}
      v.min_pp AS precio_min_pp,
      d.latitud,
      d.longitud,
      d.ciudad,
      s.cover_url
    FROM sala s
    JOIN local l ON s.id_local = l.id_local
    LEFT JOIN sala_precio_minmax v ON v.id_sala = s.id_sala
    LEFT JOIN direccion d ON d.id_local = l.id_local

    -- joins para filtros (mismos que ya usas)
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

  // ====== BLOQUE DE FILTROS (idéntica semántica a tu lista) ======

  if (normalizedFilters.query) {
    query += ` AND (LOWER(public.f_unaccent(s.nombre)) LIKE LOWER(public.f_unaccent($${idx})) OR LOWER(public.f_unaccent((SELECT e.nombre FROM empresa e WHERE e.id_empresa = l.id_empresa))) LIKE LOWER(public.f_unaccent($${idx})))`;
    values.push(`%${normalizedFilters.query}%`);
    idx++;
  }

  if (normalizedFilters.categorias.length > 0) {
    const placeholders = normalizedFilters.categorias.map(() => `LOWER(public.f_unaccent($${idx++}))`);
    query += ` AND LOWER(public.f_unaccent(c.nombre)) IN (${placeholders.join(', ')})`;
    values.push(...normalizedFilters.categorias);
  }

  if (normalizedFilters.dificultad.length > 0) {
    const placeholders = normalizedFilters.dificultad.map(() => `LOWER(public.f_unaccent($${idx++}))`);
    query += ` AND LOWER(public.f_unaccent(s.dificultad)) IN (${placeholders.join(', ')})`;
    values.push(...normalizedFilters.dificultad);
  }

  // Idioma: EXISTS (igual que en tu servicio) :contentReference[oaicite:9]{index=9}
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
    query += ` AND LOWER(public.f_unaccent(d.ciudad)) = $${idx}`;
    values.push(normalizedFilters.ciudad);
    idx++;
  }

  if (normalizedFilters.jugadores !== null) {
    query += ` AND $${idx} BETWEEN s.jugadores_min AND s.jugadores_max`;
    values.push(normalizedFilters.jugadores);
    idx++;
  }

  if (normalizedFilters.actores) {
    query += ` AND s.actores = true`;
  }

  // Precio por persona (misma lógica con sala_precio / minmax) :contentReference[oaicite:10]{index=10}
  if (normalizedFilters.precio_pp !== null) {
    if (normalizedFilters.jugadores !== null) {
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
              FROM sala_precio_minmax v3
              WHERE v3.id_sala = s.id_sala
                AND v3.max_pp <= $${precioIdx}
            )
          )
        )
      `;
      values.push(normalizedFilters.precio_pp, normalizedFilters.jugadores);
    } else {
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

  // Accesibilidad (opt-in, es_apta = true) — misma subquery/semántica
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

  // Público objetivo (opt-in)
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

  // Restricciones (opt-out: NO debe tener es_apta = false)
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

  // Distancia por coordenadas (metros) — MISMO patrón que tu lista :contentReference[oaicite:11]{index=11}
  if (usarCoordenadas) {
    const distIdx = idx++;
    query += `
      AND earth_distance(
        ll_to_earth($${latIdx}, $${lngIdx}),
        ll_to_earth(d.latitud, d.longitud)
      ) <= $${distIdx}
    `;
    values.push(normalizedFilters.distancia * 1000);
  }

  // Agrupación mínima para evitar duplicados por los LEFT JOIN de filtros
  query += `
    GROUP BY s.id_sala, d.id_direccion, v.min_pp
    ORDER BY s.nombre ASC
  `;

  const { rows } = await db.query(query, values);
  return rows; // Igual que devuelves en getFilteredSalas (un array de filas) :contentReference[oaicite:12]{index=12}
};
