// scripts/geocode_direcciones.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const axios = require('axios');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error('Falta GOOGLE_API_KEY en .env');
  process.exit(1);
}

function construirDireccion(d) {
  return `${d.tipo_via} ${d.nombre_via} ${d.numero || ''} ${d.ampliacion || ''}, ${d.codigo_postal || ''} ${d.ciudad}`.trim();
}

async function geocode(address) {
  const url = 'https://maps.googleapis.com/maps/api/geocode/json';
  const { data } = await axios.get(url, {
    params: {
      address,
      key: GOOGLE_API_KEY,
      language: 'es',
      region: 'es'
    }
  });

  if (!data.results || data.results.length === 0) {
    console.warn(`❌ No se pudo geolocalizar: ${address}`);
    return null;
  }

  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT id_direccion, tipo_via, nombre_via, numero, ampliacion, ciudad, codigo_postal
    FROM direccion
    WHERE latitud IS NULL OR longitud IS NULL
  `);

  const yaProcesadas = new Map();

  for (const d of res.rows) {
    const clave = construirDireccion(d).toLowerCase();

    if (yaProcesadas.has(clave)) {
      const { lat, lng } = yaProcesadas.get(clave);
      await client.query(
        'UPDATE direccion SET latitud = $1, longitud = $2 WHERE id_direccion = $3',
        [lat, lng, d.id_direccion]
      );
      console.log(`🔁 Copiado para id ${d.id_direccion}: ${lat}, ${lng}`);
      continue;
    }

    const coords = await geocode(clave);
    if (!coords) continue;

    await client.query(
      'UPDATE direccion SET latitud = $1, longitud = $2 WHERE id_direccion = $3',
      [coords.lat, coords.lng, d.id_direccion]
    );

    yaProcesadas.set(clave, coords);
    console.log(`✅ Actualizado id ${d.id_direccion}: ${coords.lat}, ${coords.lng}`);
  }

  await client.end();
  console.log('🏁 Proceso finalizado.');
}

main().catch(err => {
  console.error('💥 Error durante la ejecución:', err);
  process.exit(1);
});
