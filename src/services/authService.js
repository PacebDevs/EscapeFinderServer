// src/services/authService.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { enviarEmailRecuperacion, enviarEmailVerificacion } = require('./emailService');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET;
const REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!JWT_SECRET) {
  console.warn('⚠️ Falta JWT_SECRET en .env');
}

// Helper: normalizar email (minúsculas + trim)
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Generar JWT
function generateToken(user) {
  return jwt.sign(
    {
      id_usuario: user.id_usuario,
      email: user.email,
      tipo: user.tipo,
      id_empresa: user.id_empresa || null,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Buscar usuario por email (normalizado con f_unaccent)
async function findUserByEmail(email) {
  const { rows } = await db.query(
    `
    SELECT
      id_usuario,
      email,
      password_hash,
      nombre,
      apellidos,
      tipo,
      estado,
      id_empresa,
      email_verificado,
      avatar_url
    FROM usuario
    WHERE f_unaccent(LOWER(email)) = f_unaccent(LOWER($1))
    LIMIT 1
    `,
    [email]
  );
  return rows[0] || null;
}

// Login manual
async function login(email, password) {
  const normEmail = normalizeEmail(email);

  if (!normEmail || !password) {
    throw { status: 400, message: 'Email y contraseña obligatorios' };
  }

  const user = await findUserByEmail(normEmail);
  
  if (!user) {
    throw { status: 401, message: 'Credenciales inválidas' };
  }

  if (user.estado === 'ELIMINADO') {
    throw { status: 403, message: 'Cuenta eliminada' };
  }

  // Verificar email solo si está activado el requisito
  if (REQUIRE_EMAIL_VERIFICATION && !user.email_verificado) {
    throw { status: 403, message: 'Debes verificar tu email antes de iniciar sesión' };
  }

  const ok = await bcrypt.compare(password, user.password_hash || '');
  
  if (!ok) {
    throw { status: 401, message: 'Credenciales inválidas' };
  }

  // Actualizamos último login
  db.query('UPDATE usuario SET ultimo_login_at = NOW() WHERE id_usuario = $1', [
    user.id_usuario,
  ]).catch((err) => console.error('Error actualizando ultimo_login_at', err));

  const token = generateToken(user);

  const safeUser = {
    id_usuario: user.id_usuario,
    email: user.email,
    nombre: user.nombre,
    apellidos: user.apellidos,
    tipo: user.tipo,
    estado: user.estado,
    id_empresa: user.id_empresa,
    email_verificado: user.email_verificado,
    avatar_url: user.avatar_url
  };

  return { user: safeUser, token };
}

// Registro manual
async function register(email, password, nombre, apellidos) {
  const normEmail = normalizeEmail(email);

  if (!normEmail) {
    throw { status: 400, message: 'Email obligatorio' };
  }
  if (!password || password.length < 8) {
    throw { status: 400, message: 'La contraseña debe tener al menos 8 caracteres' };
  }

  const existing = await findUserByEmail(normEmail);
  if (existing) {
    throw { status: 409, message: 'Ya existe un usuario con ese email' };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Crear usuario con email_verificado = false si requiere verificación
  const { rows } = await db.query(
    `
    INSERT INTO usuario (
      email,
      password_hash,
      nombre,
      apellidos,
      tipo,
      estado,
      email_verificado
    )
    VALUES ($1, $2, $3, $4, 'APP', 'ACTIVO', $5)
    RETURNING id_usuario, email, nombre, apellidos, tipo, estado, id_empresa, email_verificado, avatar_url
    `,
    [normEmail, passwordHash, nombre || null, apellidos || null, !REQUIRE_EMAIL_VERIFICATION]
  );

  const user = rows[0];

  // Si requiere verificación de email
  if (REQUIRE_EMAIL_VERIFICATION) {
    try {
      await enviarEmailVerificacion(user);
    } catch (emailError) {
      console.error('Error enviando email de verificación:', emailError);
      // No fallar el registro si falla el email
    }

    return {
      user: {
        id_usuario: user.id_usuario,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        tipo: user.tipo,
        estado: user.estado,
        id_empresa: user.id_empresa,
        email_verificado: false,
        avatar_url: user.avatar_url
      },
      mensaje: 'Usuario registrado. Revisa tu email para verificar tu cuenta.'
    };
  }

  // Modo desarrollo: devolver token directamente
  const token = generateToken(user);

  return { 
    user: {
      id_usuario: user.id_usuario,
      email: user.email,
      nombre: user.nombre,
      apellidos: user.apellidos,
      tipo: user.tipo,
      estado: user.estado,
      id_empresa: user.id_empresa,
      email_verificado: true,
      avatar_url: user.avatar_url
    }, 
    token 
  };
}

/**
 * Solicitar recuperación de contraseña
 * Genera token y envía email
 */
async function forgotPassword(email) {
  const normEmail = normalizeEmail(email);

  if (!normEmail) {
    throw { status: 400, message: 'Email obligatorio' };
  }

  // Buscar usuario
  const user = await findUserByEmail(normEmail);

  // Por seguridad, no revelamos si el email existe o no
  if (!user) {
    console.log('⚠️ Email no encontrado para recuperación:', normEmail);
    return { 
      mensaje: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña.' 
    };
  }

  // Generar token de recuperación (válido 1 hora)
  const resetToken = jwt.sign(
    {
      id_usuario: user.id_usuario,
      email: user.email,
      tipo: 'reset_password'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  try {
    // Enviar email
    await enviarEmailRecuperacion(user, resetToken);
    console.log('✅ Email de recuperación enviado a:', normEmail);
  } catch (emailError) {
    console.error('❌ Error enviando email de recuperación:', emailError);
    throw { status: 500, message: 'Error al enviar email de recuperación' };
  }

  return { 
    mensaje: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña.' 
  };
}

/**
 * Resetear contraseña con token
 */
async function resetPassword(token, newPassword) {
  if (!token) {
    throw { status: 400, message: 'Token obligatorio' };
  }

  if (!newPassword || newPassword.length < 8) {
    throw { status: 400, message: 'La contraseña debe tener al menos 8 caracteres' };
  }

  let decoded;
  try {
    // Verificar token
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw { status: 400, message: 'El enlace de recuperación ha expirado' };
    }
    throw { status: 400, message: 'Enlace de recuperación inválido' };
  }

  // Verificar que sea un token de reset
  if (decoded.tipo !== 'reset_password') {
    throw { status: 400, message: 'Token inválido' };
  }

  // Hash de la nueva contraseña
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Actualizar contraseña en la BD
  const result = await db.query(
    `UPDATE usuario 
     SET password_hash = $1, updated_at = NOW()
     WHERE id_usuario = $2 AND email = $3
     RETURNING id_usuario, email, nombre, apellidos, tipo, estado, avatar_url`,
    [passwordHash, decoded.id_usuario, decoded.email]
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'Usuario no encontrado' };
  }

  const user = result.rows[0];

  // Generar nuevo token de sesión
  const sessionToken = generateToken(user);

  console.log('✅ Contraseña actualizada para:', user.email);

  return {
    mensaje: 'Contraseña actualizada correctamente',
    user: {
      id_usuario: user.id_usuario,
      email: user.email,
      nombre: user.nombre,
      apellidos: user.apellidos,
      tipo: user.tipo,
      estado: user.estado
    },
    token: sessionToken
  };
}

/**
 * Login con Google
 * @param {string} idToken - Token de Google Sign-In
 */
async function googleLogin(idToken) {
  if (!idToken) {
    throw { status: 400, message: 'Token de Google obligatorio' };
  }

  if (!GOOGLE_CLIENT_ID) {
    throw { status: 500, message: 'Google OAuth no configurado en el servidor' };
  }

  try {
    // Verificar token con Google
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const googleId = payload['sub']; // ID único de Google
    const email = payload['email'];
    const nombre = payload['given_name'] || payload['name'];
    const apellidos = payload['family_name'];
    const emailVerified = payload['email_verified'];

    console.log('✅ Token de Google verificado:', { email, googleId });

    if (!emailVerified) {
      throw { status: 400, message: 'Email no verificado por Google' };
    }

    const normEmail = normalizeEmail(email);

    // Buscar usuario existente por email
    let user = await findUserByEmail(normEmail);

    if (user) {
      // Usuario existe - vincular google_id si no lo tiene
      if (!user.google_id) {
        const { rows } = await db.query(
          `UPDATE usuario 
           SET google_id = $1, 
               email_verificado = true,
               ultimo_login_at = NOW(),
               updated_at = NOW()
           WHERE id_usuario = $2
           RETURNING id_usuario, email, nombre, apellidos, tipo, estado, id_empresa, google_id, avatar_url`,
          [googleId, user.id_usuario]
        );
        user = rows[0];
        console.log('🔗 Google ID vinculado a usuario existente:', user.email);
      } else {
        // Solo actualizar último login
        await db.query(
          `UPDATE usuario SET ultimo_login_at = NOW() WHERE id_usuario = $1`,
          [user.id_usuario]
        );
      }
    } else {
      // Usuario no existe - crear nuevo con Google
      const { rows } = await db.query(
        `INSERT INTO usuario (
          email,
          google_id,
          nombre,
          apellidos,
          tipo,
          estado,
          email_verificado,
          password_hash
        )
        VALUES ($1, $2, $3, $4, 'APP', 'ACTIVO', true, NULL)
        RETURNING id_usuario, email, nombre, apellidos, tipo, estado, id_empresa, google_id, avatar_url`,
        [normEmail, googleId, nombre, apellidos]
      );
      user = rows[0];
      console.log('✨ Nuevo usuario creado con Google:', user.email);
    }

    // Generar token de sesión
    const token = generateToken(user);

    return {
      user: {
        id_usuario: user.id_usuario,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        tipo: user.tipo,
        estado: user.estado,
        id_empresa: user.id_empresa,
        email_verificado: true,
        avatar_url: user.avatar_url
      },
      token,
      mensaje: 'Login con Google exitoso'
    };
  } catch (error) {
    if (error.status) throw error;
    console.error('❌ Error en googleLogin:', error);
    throw { status: 401, message: 'Token de Google inválido' };
  }
}

/**
 * Login con Apple
 * @param {string} identityToken - Token de Apple Sign-In
 * @param {string} user - Objeto user de Apple (solo en primer login)
 */
async function appleLogin(identityToken, appleUser) {
  if (!identityToken) {
    throw { status: 400, message: 'Token de Apple obligatorio' };
  }

  try {
    // Decodificar el JWT de Apple (sin verificar por ahora - en producción deberías verificar la firma)
    const decoded = jwt.decode(identityToken);
    
    if (!decoded || !decoded.sub || !decoded.email) {
      throw { status: 401, message: 'Token de Apple inválido' };
    }

    const appleId = decoded.sub; // ID único de Apple
    const email = decoded.email;
    const emailVerified = decoded.email_verified !== 'false';

    console.log('✅ Token de Apple decodificado:', { email, appleId });

    if (!emailVerified) {
      throw { status: 400, message: 'Email no verificado por Apple' };
    }

    const normEmail = normalizeEmail(email);

    // Buscar usuario existente por email
    let user = await findUserByEmail(normEmail);

    if (user) {
      // Usuario existe - vincular apple_id si no lo tiene
      if (!user.apple_id) {
        const { rows } = await db.query(
          `UPDATE usuario 
           SET apple_id = $1, 
               email_verificado = true,
               ultimo_login_at = NOW(),
               updated_at = NOW()
           WHERE id_usuario = $2
           RETURNING id_usuario, email, nombre, apellidos, tipo, estado, id_empresa, apple_id, avatar_url`,
          [appleId, user.id_usuario]
        );
        user = rows[0];
        console.log('🍎 Apple ID vinculado a usuario existente:', user.email);
      } else {
        // Solo actualizar último login
        await db.query(
          `UPDATE usuario SET ultimo_login_at = NOW() WHERE id_usuario = $1`,
          [user.id_usuario]
        );
      }
    } else {
      // Usuario no existe - crear nuevo con Apple
      // Apple solo proporciona nombre completo en el primer login
      const nombre = appleUser?.name?.firstName || null;
      const apellidos = appleUser?.name?.lastName || null;

      const { rows } = await db.query(
        `INSERT INTO usuario (
          email,
          apple_id,
          nombre,
          apellidos,
          tipo,
          estado,
          email_verificado,
          password_hash
        )
        VALUES ($1, $2, $3, $4, 'APP', 'ACTIVO', true, NULL)
        RETURNING id_usuario, email, nombre, apellidos, tipo, estado, id_empresa, apple_id, avatar_url`,
        [normEmail, appleId, nombre, apellidos]
      );
      user = rows[0];
      console.log('🍎 Nuevo usuario creado con Apple:', user.email);
    }

    // Generar token de sesión
    const token = generateToken(user);

    return {
      user: {
        id_usuario: user.id_usuario,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        tipo: user.tipo,
        estado: user.estado,
        id_empresa: user.id_empresa,
        email_verificado: true,
        avatar_url: user.avatar_url
      },
      token,
      mensaje: 'Login con Apple exitoso'
    };
  } catch (error) {
    if (error.status) throw error;
    console.error('❌ Error en appleLogin:', error);
    throw { status: 401, message: 'Token de Apple inválido' };
  }
}

module.exports = {
  login,
  register,
  generateToken,
  forgotPassword,
  resetPassword,
  googleLogin,
  appleLogin
};
