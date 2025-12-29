const redis = require('redis');

const client = redis.createClient({ 
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.error('❌ Redis Error:', err.message));
client.on('connect', () => console.log('🔌 Conectando a Redis...'));
client.on('ready', () => console.log('✅ Redis conectado'));

client.connect().catch(err => {
  console.error('❌ Error conectando a Redis:', err.message);
});

module.exports = client;
