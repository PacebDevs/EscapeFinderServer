const salaService = require('../services/salaService');

// GET /api/salas?ciudad=Madrid&categoria=Misterio&idioma=Español...
exports.getFilteredSalas = async (req, res) => {
  try {
    const filters = req.query;

    // 🔍 Convertir posibles strings CSV a array
    if (filters.categorias && typeof filters.categorias === 'string') {
      filters.categorias = filters.categorias.split(',').map(c => c.trim());
    }

    const salas = await salaService.getFilteredSalas(filters);
    res.json(salas);
  } catch (error) {
    console.error('❌ Error en getFilteredSalas:', error);
    res.status(500).json({ error: 'Error al obtener salas filtradas' });
  }
};
