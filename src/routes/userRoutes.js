const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const requireAuth = require('../middleware/requireAuth');

// ✅ ¡Esta función debe existir y estar bien exportada!
router.get('/:id', userController.getUser);

// PUT /api/user/profile - Actualizar perfil del usuario autenticado
router.put('/profile', requireAuth, userController.updateProfile);

// POST /api/user/request-password-reset - Solicitar reset de contraseña desde perfil
router.post('/request-password-reset', requireAuth, userController.requestPasswordReset);

// DELETE /api/user/account - Eliminar cuenta del usuario autenticado
router.delete('/account', requireAuth, userController.deleteAccount);

module.exports = router;
