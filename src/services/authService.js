// src/services/authService.js
const db = require('../config/db');      // ajusta la ruta si hace falta
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
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
      sub: user.id_usuario,      // ID interno
      tipo: user.tipo,           // 'APP' | 'EMPRESA'
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
    SELECT *
    FROM usuario
    WHERE LOWER(public.f_unaccent(email)) = LOWER(public.f_unaccent($1))
    `,
    [email]
  );
  return rows[0] || null;
}

// Registro manual
async function register({ email, password, nombre, apellidos }) {
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
    VALUES ($1, $2, $3, $4, 'APP', 'ACTIVO', false)
    RETURNING id_usuario, email, nombre, apellidos, tipo, estado, id_empresa
    `,
    [normEmail, passwordHash, nombre || null, apellidos || null]
  );

  const user = rows[0];
  const token = generateToken(user);

  return { user, token };
}

// Login manual
async function login({ email, password }) {
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

  const ok = await bcrypt.compare(password, user.password_hash || '');
  if (!ok) {
    throw { status: 401, message: 'Credenciales inválidas' };
  }

  // Actualizamos último login (no hace falta esperar el resultado)
  db.query('UPDATE usuario SET ultimo_login_at = NOW() WHERE id_usuario = $1', [
    user.id_usuario,
  ]).catch((err) => console.error('Error actualizando ultimo_login_at', err));

  const token = generateToken(user);

  // Devuelvo solo campos necesarios al front
  const safeUser = {
    id_usuario: user.id_usuario,
    email: user.email,
    nombre: user.nombre,
    apellidos: user.apellidos,
    tipo: user.tipo,
    estado: user.estado,
    id_empresa: user.id_empresa,
  };

  return { user: safeUser, token };
}

module.exports = {
  register,
  login,
};
