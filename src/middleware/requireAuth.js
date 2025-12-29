// src/middleware/requireAuth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware para proteger rutas que requieren autenticación
 * Verifica el token JWT y añade el usuario decodificado a req.user
 */
const requireAuth = (req, res, next) => {
  try {
    // Obtener token del header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.substring(7); // Remover 'Bearer '

    // Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Añadir información del usuario a la request
    req.user = {
      id_usuario: decoded.id_usuario,
      email: decoded.email,
      tipo: decoded.tipo
    };

    next();
  } catch (error) {
    console.error('Error en autenticación:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }

    return res.status(401).json({ error: 'No autorizado' });
  }
};

module.exports = requireAuth;
