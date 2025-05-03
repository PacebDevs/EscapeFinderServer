const express = require('express');
const cors = require('cors');
const salaRoutes = require('./routes/salaRoutes');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Lista de orígenes permitidos
const allowedOrigins = [
  'http://localhost:8100',     // ionic serve
  'http://192.168.1.131:8100', // live-reload en dispositivo real
  'http://localhost',          // emulador Android
  'capacitor://localhost',     // Capacitor WebView iOS/Android
  'ionic://localhost'          // variante en algunas versiones
];

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
