const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// ✅ ¡Esta función debe existir y estar bien exportada!
router.get('/:id', userController.getUser);

module.exports = router;
