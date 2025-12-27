// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/verify-email
router.get('/verify-email', authController.verifyEmail);

// POST /api/auth/forgot-password
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', authController.resetPassword);

// POST /api/auth/google - Login con Google
router.post('/google', authController.googleLogin);

// POST /api/auth/apple - Login con Apple
router.post('/apple', authController.appleLogin);

module.exports = router;
