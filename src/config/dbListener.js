const db = require('./db');
const redis = require('../cache/redisClient');
const { emitSalaActualizada, emitSalasUpdated } = require('../socket');
const { getSalaById } = require('../services/salaService');
const mapService = require('../services/mapService');

async function listenSalaChanges() {
  const client = await db.connect();

  await client.query('LISTEN sala_cambiada');
  await client.query('LISTEN sala_update');
  // 👇 Nuevo listener específico para cambios de ubicación
  await client.query('LISTEN direccion_update');

  client.on('notification', async (msg) => {
    // ───────────────────────────────────────────────────────────────────────
    console.log('Esto viene de la BBDD-->' + msg.channel );
    
    // 1) Notificaciones generales de sala_cambiada (alta/baja)
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
    
    // 2) Actualizaciones de sala 
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
    
    // 3) 👇 NUEVO: Cambios de dirección/coordenadas
    if (msg.channel === 'direccion_update') {
      try {
        const payload = JSON.parse(msg.payload);
        // Solo invalidar la caché si realmente es necesario
        // Por ejemplo, si la dirección cambió significativamente
        if (payload.latitud_anterior !== null && 
            Math.abs(payload.latitud_anterior - payload.latitud_nueva) > 0.0001) {
          await mapService.invalidateMapCache(payload.latitud_anterior, payload.longitud_anterior);
        }
        
        // Considerar invalidar solo las salas afectadas, no todas
        // Por ejemplo, si conoces el id_local:
        await redis.del(`salas:detalle:${payload.id_local}`);
      } catch (err) {
        console.error('Error procesando direccion_update:', err);
      }
    }
  });
  
  console.log('👂 Escuchando cambios en tablas sala y direccion...');
}

listenSalaChanges();
