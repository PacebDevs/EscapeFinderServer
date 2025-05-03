const express = require('express');
const router = express.Router();
const salaController = require('../controllers/salaController');

router.get('/', salaController.getFilteredSalas);

module.exports = router;
