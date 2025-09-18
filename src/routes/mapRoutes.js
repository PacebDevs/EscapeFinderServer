const express = require('express');
const router = express.Router();
const mapController = require('../controllers/mapController');

// GET /api/maps/static?lat=xx.xxx&lng=yy.yyy&zoom=15&width=600&height=300
router.get('/static', mapController.getStaticMap);

// POST /api/maps/invalidate - Para invalidar caché manualmente
router.post('/invalidate', mapController.invalidateMapCache);

module.exports = router;