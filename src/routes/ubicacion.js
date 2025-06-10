const express = require('express');
const router = express.Router();
const locationService = require('../services/LocationService');

router.get('/', async (req, res) => {
  try {
    const { query, lat, lng } = req.query;

    if (query) {
      const ciudad = await locationService.getCityFromQuery(query);
      return res.json([ciudad]);
    }

    if (lat && lng) {
      const ciudad = await locationService.getCityFromCoords(parseFloat(lat), parseFloat(lng));
      return res.json([ciudad]);
    }

    res.status(400).json({ error: 'Parámetros incorrectos' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error interno' });
  }
});

module.exports = router;
