const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
client.connect().then(() => console.log('🔌 Conectado a Redis'));
module.exports = client;
