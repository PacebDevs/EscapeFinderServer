const db = require('./db');
const redis = require('../cache/redisClient');
const { emitSalaActualizada, emitSalasUpdated } = require('../socket');
const { getSalaById } = require('../services/salaService');

async function listenSalaChanges() {
  const client = await db.connect();

  await client.query('LISTEN sala_cambiada');
  await client.query('LISTEN sala_update');

  client.on('notification', async (msg) => {
    // ───────────────────────────────────────────────────────────────────────
    console.log('Esto viene de la BBDD-->' + msg.channel );
    // 1) Sólo manejamos INSERT/DELETE aquí: msg.payload viene vacío
   if (msg.channel === 'sala_cambiada') {
      console.log('🔄 Notificación de cambio en salas (alta/baja) - invalidando caché');
      const keys = await redis.keys('salas:*');
      if (keys.length > 0) {
        await redis.del(keys);
        console.log('♻️ Caché de salas invalidada');
      }
      emitSalasUpdated();
      console.log('salasUpdated');
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2) Actualizaciones puntuales
    if (msg.channel === 'sala_update') {
      try {
        const payload = JSON.parse(msg.payload);
        const { id_sala } = payload;
        console.log(`🎯 Sala modificada: ${id_sala} - invalidando caché y reenviando`);
        
        const keys = await redis.keys('salas:*');
        if (keys.length > 0) {
          await redis.del(keys);
          console.log('♻️ Caché de salas invalidada');
        }

        const sala = await getSalaById(id_sala);
        if (sala) {
          emitSalaActualizada(sala);
          console.log('salaActualizada');
        } else {
          console.warn(`⚠️ Sala con ID ${id_sala} no encontrada`);
        }
      } catch (err) {
        console.error('❌ Error procesando sala_update:', err);
      }
    }
  });

  console.log('👂 Escuchando cambios en la tabla sala...');
}

listenSalaChanges();
