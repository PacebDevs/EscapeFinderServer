const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPriceFilter,
  PriceFilterRequiresPlayersError,
} = require('./priceFilter');

test('no añade condición cuando no hay filtro de precio', () => {
  assert.deepEqual(
    buildPriceFilter({ pricePerPlayer: null, players: null, startIndex: 4 }),
    { sql: '', values: [], nextIndex: 4 }
  );
});

test('exige jugadores cuando se filtra por precio', () => {
  assert.throws(
    () => buildPriceFilter({ pricePerPlayer: 20, players: null, startIndex: 1 }),
    PriceFilterRequiresPlayersError
  );
});

test('genera una condición compartida para exacto, pp publicado y total publicado', () => {
  const result = buildPriceFilter({ pricePerPlayer: 20, players: 6, startIndex: 3 });
  assert.deepEqual(result.values, [20, 6]);
  assert.equal(result.nextIndex, 5);
  assert.match(result.sql, /price_per_player <= \$3/);
  assert.match(result.sql, /COALESCE\(pr\.max_pp, pr\.min_pp\) <= \$3/);
  assert.match(result.sql, /COALESCE\(pr\.max_total, pr\.min_total\) \/ \$4 <= \$3/);
  assert.match(result.sql, /source IS DISTINCT FROM 'seed_auto'/);
});
