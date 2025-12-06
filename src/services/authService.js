// src/services/authService.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { enviarEmailVerificacion } = require('./emailService');

const JWT_SECRET = process.env.JWT_SECRET;
const REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';

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
      sub: user.id_usuario,
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
      email_verificado
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
    email_verificado: user.email_verificado
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
    RETURNING id_usuario, email, nombre, apellidos, tipo, estado, id_empresa, email_verificado
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
        email_verificado: false
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
      email_verificado: true
    }, 
    token 
  };
}

module.exports = {
  login,
  register,
  generateToken
};
