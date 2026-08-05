BEGIN;

CREATE OR REPLACE VIEW public.sala_precio_resumen AS
WITH publicado AS (
  SELECT
    r.id_sala,
    r.min_total AS publicado_min_total,
    r.max_total AS publicado_max_total,
    r.min_pp AS publicado_min_pp,
    r.max_pp AS publicado_max_pp,
    r.source AS publicado_source
  FROM public.sala_precio_rango r
  WHERE r.source IS DISTINCT FROM 'seed_auto'
),
detalle AS (
  SELECT
    p.id_sala,
    MIN(p.price_total) AS detalle_min_total,
    MAX(p.price_total) AS detalle_max_total,
    MIN(p.price_per_player) AS detalle_min_pp,
    MAX(p.price_per_player) AS detalle_max_pp,
    COUNT(*) AS detalle_count
  FROM public.sala_precio p
  WHERE p.source IS DISTINCT FROM 'seed_auto'
  GROUP BY p.id_sala
)
SELECT
  s.id_sala,
  publicado.publicado_min_total,
  publicado.publicado_max_total,
  publicado.publicado_min_pp,
  publicado.publicado_max_pp,
  publicado.publicado_source,
  detalle.detalle_min_total,
  detalle.detalle_max_total,
  detalle.detalle_min_pp,
  detalle.detalle_max_pp,
  COALESCE(detalle.detalle_count, 0::bigint) AS detalle_count,
  CASE
    WHEN publicado.publicado_min_total IS NOT NULL
      OR publicado.publicado_max_total IS NOT NULL THEN 'total'
    WHEN publicado.publicado_min_pp IS NOT NULL
      OR publicado.publicado_max_pp IS NOT NULL THEN 'por_persona'
    ELSE NULL
  END AS tipo_precio_publicado
FROM public.sala s
LEFT JOIN publicado ON publicado.id_sala = s.id_sala
LEFT JOIN detalle ON detalle.id_sala = s.id_sala;

ALTER VIEW public.sala_precio_resumen OWNER TO postgres;
GRANT ALL ON TABLE public.sala_precio_resumen TO postgres;

COMMIT;
