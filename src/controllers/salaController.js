const salaService = require('../services/salaService');

// GET /api/salas?ciudad=Madrid&categoria=Misterio&idioma=Español...
exports.getFilteredSalas = async (req, res) => {
  try {
    const filters = req.query;

    // 🔍 Convertir posibles strings CSV a array
    if (filters.categorias && typeof filters.categorias === 'string') {
      filters.categorias = filters.categorias.split(',').map(c => c.trim());
    }
    if (filters.dificultad && typeof filters.dificultad === 'string') {
      filters.dificultad = filters.dificultad.split(',').map(d => d.trim());
    }
    if (filters.accesibilidad && typeof filters.accesibilidad === 'string') {
      filters.accesibilidad = filters.accesibilidad.split(',').map(a => a.trim());
    }
    if (filters.restricciones_aptas && typeof filters.restricciones_aptas === 'string') {
      filters.restricciones_aptas = filters.restricciones_aptas.split(',').map(r => r.trim());
    }
    if (filters.publico_objetivo && typeof filters.publico_objetivo === 'string') {
      filters.publico_objetivo = filters.publico_objetivo.split(',').map(p => p.trim());
    }
    // ✅ idioma: solo un string, limpiar espacios
    if (filters.idioma && typeof filters.idioma === 'string') {
      filters.idioma = filters.idioma.trim();
    }
    if (filters.jugadores && typeof filters.jugadores === 'string') {
      filters.jugadores = parseInt(filters.jugadores, 10);
    }
    
    // 💶 precio por persona recibido como string único
    if (typeof filters.precio === 'string') {
      const n = parseFloat(filters.precio.replace(',', '.'));
      if (!Number.isNaN(n)) filters.precio = n;
      else delete filters.precio;
    }
  
   
    if (filters.tipo_sala) {
      if (Array.isArray(filters.tipo_sala)) {
        filters.tipo_sala = filters.tipo_sala.map(t => t.trim());
      } else if (typeof filters.tipo_sala === 'string') {
        filters.tipo_sala = filters.tipo_sala.split(',').map(t => t.trim());
      }
    }
    const salas = await salaService.getFilteredSalas(filters);
    res.json(salas);
  } catch (error) {
    console.error('❌ Error en getFilteredSalas:', error);
    res.status(500).json({ error: 'Error al obtener salas filtradas' });
  }
};

// 👉 NUEVO: obtener una sala por ID (con lat/lng opcionales)
exports.getSalaById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const lat = req.query.lat !== undefined ? parseFloat(req.query.lat) : null;
    const lng = req.query.lng !== undefined ? parseFloat(req.query.lng) : null;

    const sala = await require('../services/salaService').getSalaById(id, lat, lng);
    if (!sala) return res.status(404).json({ error: 'Sala no encontrada' });

    res.json(sala);
  } catch (err) {
    console.error('❌ Error en getSalaById:', err);
    res.status(500).json({ error: 'Error al obtener la sala' });
  }
};
