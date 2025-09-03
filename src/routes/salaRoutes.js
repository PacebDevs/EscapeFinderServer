const express = require('express');
const router = express.Router();
const salaController = require('../controllers/salaController');

router.get('/', salaController.getFilteredSalas);
// 👉 NUEVO: endpoint por ID (soporta ?lat=..&lng=..)
router.get('/:id', salaController.getSalaById);

module.exports = router;
