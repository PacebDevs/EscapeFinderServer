BEGIN;

INSERT INTO public.tipo_sala (id_tipo_sala, nombre, descripcion) VALUES
  (1, 'Al aire libre', 'Salas o experiencias que se desarrollan fuera de un recinto cerrado'),
  (2, 'Escape Room', 'Escape tradicional con sala cerrada y resolución de enigmas'),
  (3, 'Experiencia', 'Experiencias inmersivas que no siguen la estructura clásica de escape'),
  (4, 'Hall game', 'Juego de escape tipo hall, normalmente sin sala cerrada'),
  (5, 'Juego portátil', 'Experiencias transportables que pueden jugarse en cualquier lugar'),
  (6, 'Realidad Virtual', 'Escape rooms o juegos basados en tecnología de realidad virtual')
ON CONFLICT (id_tipo_sala) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion;

INSERT INTO public.categoria (id_categoria, nombre) VALUES
  (1, 'Misterio'),
  (3, 'Aventuras'),
  (4, 'Ciencia Ficción'),
  (5, 'Criminal'),
  (6, 'Apocalíptico'),
  (7, 'Historia'),
  (8, 'PORTATIL'),
  (9, 'Terror'),
  (10, 'Fantasía'),
  (11, 'Kids'),
  (12, 'Adultos'),
  (13, 'Otro')
ON CONFLICT (id_categoria) DO UPDATE SET nombre = EXCLUDED.nombre;

INSERT INTO public.idioma (id_idioma, nombre, descripcion) VALUES
  (1, 'Español', 'Idioma principal'),
  (2, 'Inglés', 'Idioma internacional'),
  (3, 'Catalán', 'Incluye Valenciano/Catalán'),
  (4, 'Francés', 'Idioma internacional'),
  (5, 'Euskera', NULL),
  (6, 'Gallego', NULL),
  (7, 'Alemán', NULL),
  (8, 'Italiano', NULL),
  (9, 'Portugués', NULL)
ON CONFLICT (id_idioma) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion;

INSERT INTO public.caracteristicas (id_caracteristica, nombre, tipo, descripcion) VALUES
  (1, 'Apto Discapacidad motora', 'accesibilidad', 'Por defecto todas las salas NO serán aptas.'),
  (2, 'Apto Discapacidad visual', 'accesibilidad', 'Por defecto todas las salas NO serán aptas.'),
  (3, 'Apto Discapacidad auditiva', 'accesibilidad', 'Por defecto todas las salas NO serán aptas.'),
  (4, 'Apto para mujeres embarazadas', 'restriccion', 'Por defecto todas las salas SÍ serán aptas para embarazadas.'),
  (5, 'Apto para personas con claustrofobia', 'restriccion', 'Por defecto todas las salas SÍ serán aptas.'),
  (6, 'Niños con adulto', 'publico_objetivo', 'Por defecto todas las salas NO serán aptas.'),
  (7, 'Niños con Monitor', 'publico_objetivo', 'Por defecto todas las salas NO serán aptas.'),
  (8, 'Empresas', 'publico_objetivo', 'Sin restricción de aptitud por defecto.'),
  (9, 'Grandes grupos', 'publico_objetivo', 'Sin restricción de aptitud por defecto.'),
  (10, 'Estandar', 'publico_objetivo', 'Sin restricción de aptitud por defecto.'),
  (11, 'Familiar', 'publico_objetivo', 'Sin restricción de aptitud por defecto.'),
  (12, 'Niños', 'publico_objetivo', 'Sin restricción de aptitud por defecto.')
ON CONFLICT (id_caracteristica) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  tipo = EXCLUDED.tipo,
  descripcion = EXCLUDED.descripcion;

-- El modelo todavía no usa este catálogo. Estos dos valores evitan que el
-- importador descarte la información que ya reconoce de forma explícita.
INSERT INTO public.tipo_reserva (id_tipo_reserva, nombre) VALUES
  (1, 'Turitop Booking System'),
  (2, 'AION')
ON CONFLICT (id_tipo_reserva) DO UPDATE SET nombre = EXCLUDED.nombre;

SELECT setval(pg_get_serial_sequence('public.tipo_sala', 'id_tipo_sala'), MAX(id_tipo_sala), true) FROM public.tipo_sala;
SELECT setval(pg_get_serial_sequence('public.categoria', 'id_categoria'), MAX(id_categoria), true) FROM public.categoria;
SELECT setval(pg_get_serial_sequence('public.idioma', 'id_idioma'), MAX(id_idioma), true) FROM public.idioma;
SELECT setval(pg_get_serial_sequence('public.caracteristicas', 'id_caracteristica'), MAX(id_caracteristica), true) FROM public.caracteristicas;
SELECT setval(pg_get_serial_sequence('public.tipo_reserva', 'id_tipo_reserva'), MAX(id_tipo_reserva), true) FROM public.tipo_reserva;

COMMIT;
