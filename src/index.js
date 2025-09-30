const express = require('express');
const cors = require('cors');
const salaRoutes = require('./routes/salaRoutes');
const ubicacionRoutes = require('./routes/ubicacion');
const salasMapRoutes = require('./routes/salasMapRoutes');
const mapRoutes = require('./routes/mapRoutes');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);

// Lista de orígenes permitidos
const allowedOrigins = [
  'http://localhost:8100',     // ionic serve
  'http://192.168.1.131:8100', // live-reload en dispositivo real
  'http://localhost',          // emulador Android
  'capacitor://localhost',     // Capacitor WebView iOS/Android
  'ionic://localhost',          // variante en algunas versiones
  'http://192.168.1.201:8100'
];

if (process.env.USE_NGROK === 'true' && process.env.NGROK_URL) {
  allowedOrigins.push(process.env.NGROK_URL);
}

// Middleware CORS para Express
app.use(cors({
  origin(origin, callback) {
    // permitimos si no hay origin (p. ej. sockets internos)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true
}));

app.use(express.json());
app.use('/api/salas', salaRoutes);
app.use('/api/ubicacion', ubicacionRoutes);
app.use('/api/maps', mapRoutes);
app.use('/salas', express.static(path.join(__dirname, 'uploads/salas')));
app.use('/maps', express.static(path.join(__dirname, 'uploads/maps'))); // Añadir ruta estática para mapas
app.use('/api', salasMapRoutes);
// Socket.io con la misma configuración de CORS
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origen no permitido por Socket.io CORS: ${origin}`));
    },
    credentials: true
  }
});

// Inicialización de Socket.io y DB listener
require('./socket').init(io);
require('./config/dbListener');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
