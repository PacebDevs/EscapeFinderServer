const salaService = require('../services/salaService');

// GET /api/salas?ciudad=Madrid&categoria=Misterio&idioma=Español...
exports.getFilteredSalas = async (req, res) => {
  try {
    const filters = req.query;

    // 🔍 Convertir posibles strings CSV a array
    if (filters.categorias && typeof filters.categorias === 'string') {
      filters.categorias = filters.categorias.split(',').map(c => c.trim());
    }
    if (filters.jugadores && typeof filters.jugadores === 'string') {
      filters.jugadores = parseInt(filters.jugadores, 10);
    }
   /* if (filters.precio && typeof filters.precio === 'string') {
      const [min, max] = filters.precio.split('-').map(p => parseFloat(p));
      filters.precio = { min: isNaN(min) ? 0 : min, max: isNaN(max) ? 9999 : max };
    }*/
   
    if (filters.tipo_sala && typeof filters.tipo_sala === 'string') {
      filters.tipo_sala = filters.tipo_sala.trim();
    }

    const salas = await salaService.getFilteredSalas(filters);
    res.json(salas);
  } catch (error) {
    console.error('❌ Error en getFilteredSalas:', error);
    res.status(500).json({ error: 'Error al obtener salas filtradas' });
  }
};
