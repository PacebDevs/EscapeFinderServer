// src/controllers/authController.js
const authService = require('../services/authService');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

exports.register = async (req, res) => {
  try {
    const { email, password, nombre, apellidos } = req.body;
    const result = await authService.register(email, password, nombre, apellidos);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error en el registro' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (error) {
    console.error('Error en login:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error en el login' });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.tipo !== 'verificacion_email') {
      return res.status(400).json({ error: 'Token inválido' });
    }

    const result = await db.query(
      `UPDATE usuario 
       SET email_verificado = TRUE 
       WHERE id_usuario = $1 AND email = $2
       RETURNING id_usuario, email, nombre, apellidos, tipo, estado`,
      [decoded.id_usuario, decoded.email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const usuario = result.rows[0];

    const sessionToken = authService.generateToken(usuario);

    res.json({ 
      mensaje: 'Email verificado correctamente',
      user: {
        id_usuario: usuario.id_usuario,
        email: usuario.email,
        nombre: usuario.nombre,
        apellidos: usuario.apellidos,
        tipo: usuario.tipo,
        estado: usuario.estado,
        email_verificado: true
      },
      token: sessionToken
    });
  } catch (error) {
    console.error('Error verificando email:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'El token ha expirado' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Token inválido' });
    }

    res.status(500).json({ error: 'Error al verificar email' });
  }
};

/**
 * Solicitar recuperación de contraseña
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (error) {
    console.error('Error en forgot password:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al procesar solicitud de recuperación' 
    });
  }
};

/**
 * Resetear contraseña con token
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.resetPassword(token, newPassword);
    res.json(result);
  } catch (error) {
    console.error('Error en reset password:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al restablecer contraseña' 
    });
  }
};

/**
 * Login con Google OAuth
 */
exports.googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    const result = await authService.googleLogin(idToken);
    res.json(result);
  } catch (error) {
    console.error('Error en Google login:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error en login con Google' 
    });
  }
};

/**
 * Login con Apple OAuth
 */
exports.appleLogin = async (req, res) => {
  try {
    const { identityToken, user } = req.body;
    const result = await authService.appleLogin(identityToken, user);
    res.json(result);
  } catch (error) {
    console.error('Error en Apple login:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error en login con Apple' 
    });
  }
};

module.exports = {
  register: exports.register,
  login: exports.login,
  verifyEmail: exports.verifyEmail,
  forgotPassword: exports.forgotPassword,
  resetPassword: exports.resetPassword,
  googleLogin: exports.googleLogin,
  appleLogin: exports.appleLogin
};
