let io;
exports.init = (server) => {
  io = server;
  io.on('connection', socket => {
    console.log('📲 Cliente conectado a WebSocket');
  });
};
exports.io = () => io;
