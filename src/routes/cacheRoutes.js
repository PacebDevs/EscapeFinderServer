const express = require('express');
const router = express.Router();
const cacheController = require('../controllers/cacheController');

router.post('/flush', cacheController.flushFilterCache);

module.exports = router;
