const db = require('./db');
const { flushSalaCache } = require('../services/salaService');

(async () => {
  const client = await db.connect();

  console.log('👂 Escuchando cambios en la tabla sala...');

  await client.query('LISTEN sala_cambiada');

  client.on('notification', async (msg) => {
    if (msg.channel === 'sala_cambiada') {
      console.log('🔁 Cambio detectado en tabla sala. Limpiando cache...');
      await flushSalaCache();
    }
  });

  client.on('error', (err) => {
    console.error('❌ Error en dbListener:', err);
  });
})();
