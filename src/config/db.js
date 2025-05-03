require('dotenv').config();
const { Pool } = require('pg');

// 🔍 Mostrar la URL de conexión para verificar que viene bien del entorno
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
