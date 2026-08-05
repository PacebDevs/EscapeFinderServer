class PriceFilterRequiresPlayersError extends Error {
  constructor() {
    super('El filtro de precio por persona requiere un número exacto de jugadores.');
    this.name = 'PriceFilterRequiresPlayersError';
    this.code = 'PRICE_REQUIRES_PLAYERS';
  }
}

function buildPriceFilter({ pricePerPlayer, players, startIndex }) {
  if (pricePerPlayer === null || pricePerPlayer === undefined) {
    return { sql: '', values: [], nextIndex: startIndex };
  }
  if (!Number.isInteger(players) || players <= 0) {
    throw new PriceFilterRequiresPlayersError();
  }

  const priceIndex = startIndex;
  const playersIndex = startIndex + 1;

  return {
    sql: `
      AND (
        EXISTS (
          SELECT 1
          FROM sala_precio sp_price
          WHERE sp_price.id_sala = s.id_sala
            AND sp_price.source IS DISTINCT FROM 'seed_auto'
            AND sp_price.players = $${playersIndex}
            AND sp_price.price_per_player <= $${priceIndex}
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM sala_precio sp_exact
            WHERE sp_exact.id_sala = s.id_sala
              AND sp_exact.source IS DISTINCT FROM 'seed_auto'
              AND sp_exact.players = $${playersIndex}
          )
          AND EXISTS (
            SELECT 1
            FROM sala_precio_rango pr
            WHERE pr.id_sala = s.id_sala
              AND pr.source IS DISTINCT FROM 'seed_auto'
              AND (
                COALESCE(pr.max_pp, pr.min_pp) <= $${priceIndex}
                OR (
                  pr.min_pp IS NULL
                  AND pr.max_pp IS NULL
                  AND COALESCE(pr.max_total, pr.min_total) / $${playersIndex} <= $${priceIndex}
                )
              )
          )
        )
      )
    `,
    values: [pricePerPlayer, players],
    nextIndex: startIndex + 2,
  };
}

module.exports = {
  buildPriceFilter,
  PriceFilterRequiresPlayersError,
};
