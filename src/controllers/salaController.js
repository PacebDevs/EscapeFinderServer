const salaService = require('../services/salaService');

// GET /api/salas?ciudad=Madrid&categoria=Misterio&idioma=Español...
exports.getFilteredSalas = async (req, res) => {
  try {
    const filters = req.query;
    const salas = await salaService.getFilteredSalas(filters);
    res.json(salas);
  } catch (error) {
    console.error('❌ Error en getFilteredSalas:', error);
    res.status(500).json({ error: 'Error al obtener salas filtradas' });
  }
};
