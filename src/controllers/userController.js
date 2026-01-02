const userService = require('../services/userService');
const authService = require('../services/authService');

exports.getUser = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'No encontrado' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
};

/**
 * Actualizar perfil del usuario autenticado (nombre y apellidos)
 */
exports.updateProfile = async (req, res) => {
  try {
    const { nombre, apellidos } = req.body;
    const userId = req.user.id_usuario; // Viene del middleware requireAuth

    const updatedUser = await userService.updateProfile(userId, { nombre, apellidos });
    
    res.json({ 
      mensaje: 'Perfil actualizado correctamente',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al actualizar perfil' 
    });
  }
};

/**
 * Actualizar avatar del usuario autenticado
 */
exports.updateAvatar = async (req, res) => {
  try {
    const { avatar_url } = req.body;
    const userId = req.user.id_usuario;

    // Validar que el avatar_url sea válido
    const validAvatars = ['candado', 'exploradora', 'hacker', 'ojo', 'reloj','inspector', 'SIN_AVATAR'];
    if (!validAvatars.includes(avatar_url)) {
      return res.status(400).json({ error: 'Avatar no válido' });
    }

    const updatedUser = await userService.updateAvatar(userId, avatar_url);
    
    res.json({ 
      mensaje: 'Avatar actualizado correctamente',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Error actualizando avatar:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al actualizar avatar' 
    });
  }
};

/**
 * Solicitar reset de contraseña desde el perfil del usuario
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const email = req.user.email; // Usuario autenticado
    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (error) {
    console.error('Error solicitando reset de contraseña:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al solicitar reset de contraseña' 
    });
  }
};

/**
 * Eliminar cuenta del usuario autenticado
 */
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    await userService.deleteAccount(userId);
    
    res.json({ 
      mensaje: 'Cuenta eliminada correctamente' 
    });
  } catch (error) {
    console.error('Error eliminando cuenta:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Error al eliminar cuenta' 
    });
  }
};
