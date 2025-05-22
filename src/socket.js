let ioInstance;

function init(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log('📲 Cliente conectado a WebSocket');

    socket.on('disconnect', () => {
      console.log('🔌 Cliente desconectado de WebSocket');
    });
  });
}

function io() {
  return ioInstance;
}

// 👉 Emisión global (para altas/bajas de salas)
function emitSalasUpdated() {
  if (ioInstance) {
    ioInstance.emit('salasUpdated');
    console.log('salasUpdated');
  }
}

// 👉 Emisión puntual (sala modificada)
function emitSalaActualizada(sala) {
  if (ioInstance) {
    ioInstance.emit('salaActualizada', sala);
    console.log('salaActualizada');
  }
}

module.exports = {
  init,
  io,
  emitSalasUpdated,
  emitSalaActualizada
};
