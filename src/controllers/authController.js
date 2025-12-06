// src/controllers/authController.js
const authService = require('../services/authService');

exports.register = async (req, res) => {
  try {
    const { email, password, nombre, apellidos } = req.body;

    const { user, token } = await authService.register({
      email,
      password,
      nombre,
      apellidos,
    });

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('❌ Error en register:', err);

    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }

    res.status(500).json({ error: 'Error interno en registro' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { user, token } = await authService.login({
      email,
      password,
    });

    res.json({ user, token });
  } catch (err) {
    console.error('❌ Error en login:', err);

    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }

    res.status(500).json({ error: 'Error interno en login' });
  }
};
