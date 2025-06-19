// ==============================
// 🌐 routes/ubicacion.js
// ==============================

const express = require('express');
const router = express.Router();
const locationService = require('../services/LocationService');

// Autocomplete: sugerencias mientras se escribe
router.get('/autocomplete', async (req, res) => {
  const { input } = req.query;
  if (!input) return res.status(400).json({ error: 'Falta el parámetro input' });

  try {
    const predictions = await locationService.autocomplete(input);
    res.json(predictions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en autocomplete' });
  }
});

// Geocoding: resolve una dirección completa
router.get('/geocode', async (req, res) => {
  const { description } = req.query;
  if (!description) return res.status(400).json({ error: 'Falta el parámetro description' });

  try {
    const resultado = await locationService.geocode(description);
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error en geocode' });
  }
});

// Reverse Geocoding: desde coordenadas
router.get('/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'Faltan parámetros lat y lng' });

  try {
    const resultado = await locationService.reverseGeocode(lat, lng);
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error en reverse geocode' });
  }
});

module.exports = router;
