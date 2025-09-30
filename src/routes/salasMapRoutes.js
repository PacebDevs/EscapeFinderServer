const express = require('express');
const { getSalasMap } = require('../controllers/salasMapController');

const router = express.Router();

// GET /api/salas-map  (sin limit/offset; requiere ciudad O lat/lng)
router.get('/salas-map', getSalasMap);

module.exports = router;
