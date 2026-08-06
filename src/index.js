const express = require('express');
const cors = require('cors');
const salaRoutes = require('./routes/salaRoutes');
const ubicacionRoutes = require('./routes/ubicacion');
const salasMapRoutes = require('./routes/salasMapRoutes');
const mapRoutes = require('./routes/mapRoutes');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./config/db');
const app = express();
const server = http.createServer(app);
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const favoritoRoutes = require('./routes/favoritoRoutes');
const redis = require('./cache/redisClient');

// Lista de orígenes permitidos
const allowedOrigins = [
  'http://localhost:8100',     // ionic serve (puerto por defecto)
  'http://localhost:8101',     // ionic serve (puerto alternativo)
  'http://192.168.1.131:8100', // live-reload en dispositivo real
  'http://localhost',          // emulador Android
  'capacitor://localhost',     // Capacitor WebView iOS/Android
  'ionic://localhost',          // variante en algunas versiones
  'http://192.168.1.201:8100',
  'http://localhost:3000',     // backend HTML pages (localhost)
  'http://192.168.1.131:3000'  // backend HTML pages (IP local)
];

if (process.env.USE_NGROK === 'true' && process.env.NGROK_URL) {
  allowedOrigins.push(process.env.NGROK_URL);
}

// Middleware CORS para Express
app.use(cors({
  origin(origin, callback) {
    // permitimos si no hay origin (p. ej. sockets internos)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true
}));

app.use(express.json());

app.get('/health', async (_req, res) => {
  const checks = {
    api: 'ok',
    database: 'error',
    redis: 'error'
  };

  try {
    await db.query('SELECT 1');
    checks.database = 'ok';
  } catch (error) {
    console.error('❌ Health check PostgreSQL:', error.message);
  }

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (error) {
    console.error('❌ Health check Redis:', error.message);
  }

  const healthy = checks.database === 'ok' && checks.redis === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/favoritos', favoritoRoutes);
app.use('/api/salas', salaRoutes);
app.use('/api/ubicacion', ubicacionRoutes);
app.use('/api/maps', mapRoutes);
app.use('/salas', express.static(path.join(__dirname, 'uploads/salas')));
app.use('/maps', express.static(path.join(__dirname, 'uploads/maps'))); // Añadir ruta estática para mapas
app.use('/api', salasMapRoutes);

// Página de verificación de email
app.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.send(generateErrorPage('Token no proporcionado'));
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.tipo !== 'verificacion_email') {
      return res.send(generateErrorPage('Token inválido'));
    }

    const result = await db.query(
      `UPDATE usuario 
       SET email_verificado = TRUE 
       WHERE id_usuario = $1 AND email = $2
       RETURNING id_usuario, email, nombre`,
      [decoded.id_usuario, decoded.email]
    );

    if (result.rows.length === 0) {
      return res.send(generateErrorPage('Usuario no encontrado'));
    }

    const usuario = result.rows[0];
    res.send(generateSuccessPage(
      '✅ Email Verificado',
      `¡Hola ${usuario.nombre || 'Usuario'}! Tu email ha sido verificado correctamente.`,
      'Ahora puedes iniciar sesión en la aplicación.',
      true
    ));
  } catch (error) {
    console.error('Error verificando email:', error);
    if (error.name === 'TokenExpiredError') {
      return res.send(generateErrorPage('El enlace ha expirado. Solicita uno nuevo.'));
    }
    return res.send(generateErrorPage('Error al verificar el email'));
  }
});

function generateSuccessPage(title, message, subtitle, showAppButton = true) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeSubtitle = escapeHtml(subtitle);

  return renderBrandedPage({
    pageTitle: `${safeTitle} - EscapeFinder`,
    chip: 'Cuenta verificada',
    icon: '✅',
    iconClass: 'success',
    title: safeTitle,
    bodyHtml: `
      <p class="lead">${safeMessage}</p>
      <p class="support"><strong>${safeSubtitle}</strong></p>
    `,
    actionsHtml: showAppButton
      ? '<a class="btn-primary" href="escapefinder://login">Abrir EscapeFinder</a>'
      : ''
  });
}

function generateErrorPage(errorMessage) {
  const safeErrorMessage = escapeHtml(errorMessage);

  return renderBrandedPage({
    pageTitle: 'Error - EscapeFinder',
    chip: 'Accion requerida',
    icon: '❌',
    iconClass: 'danger',
    title: 'No se pudo completar la solicitud',
    bodyHtml: `<p class="lead">${safeErrorMessage}</p>`,
    actionsHtml: '<a class="btn-secondary" href="escapefinder://login">Volver a EscapeFinder</a>'
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getBrandedStyles(extraStyles = '') {
  return `
    :root {
      --brand-primary: #667eea;
      --brand-secondary: #764ba2;
      --bg-soft: #eef1ff;
      --text-strong: #232846;
      --text-muted: #5b6180;
      --line-soft: #e8ebf7;
      --danger: #d43c5a;
      --success: #1f9d68;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      padding: 16px;
      position: relative;
      overflow-x: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background:
        radial-gradient(circle at 12% 12%, rgba(255,255,255,0.32), transparent 45%),
        radial-gradient(circle at 90% 85%, rgba(255,255,255,0.2), transparent 34%),
        linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%);
      color: var(--text-strong);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bg-orb {
      position: fixed;
      border-radius: 999px;
      filter: blur(3px);
      z-index: 0;
      opacity: 0.42;
      pointer-events: none;
    }

    .bg-orb.orb-a {
      width: 220px;
      height: 220px;
      top: -40px;
      right: -60px;
      background: linear-gradient(160deg, #84f3db 0%, #5ec4ff 100%);
    }

    .bg-orb.orb-b {
      width: 190px;
      height: 190px;
      bottom: -45px;
      left: -45px;
      background: linear-gradient(135deg, #f8d372 0%, #f49f80 100%);
    }

    .app-shell {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 620px;
      border-radius: 26px;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 24px 52px rgba(23, 30, 72, 0.26);
    }

    .app-header {
      padding: 24px 30px;
      background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%);
      color: #ffffff;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.2);
      margin-bottom: 12px;
    }

    .brand-title {
      margin: 0;
      font-size: 30px;
      letter-spacing: 0.01em;
    }

    .app-content {
      padding: 30px;
    }

    .status-icon {
      width: 74px;
      height: 74px;
      margin: 0 auto 14px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      font-weight: 700;
    }

    .status-icon.success {
      background: rgba(31, 157, 104, 0.12);
      color: var(--success);
    }

    .status-icon.danger {
      background: rgba(212, 60, 90, 0.14);
      color: var(--danger);
    }

    h1 {
      margin: 0 0 12px 0;
      text-align: center;
      color: var(--text-strong);
      font-size: 30px;
      line-height: 1.2;
    }

    .lead {
      margin: 0 0 12px 0;
      text-align: center;
      color: var(--text-muted);
      line-height: 1.7;
      font-size: 16px;
    }

    .support {
      margin: 0;
      text-align: center;
      color: #3a3f5d;
      line-height: 1.7;
      font-size: 16px;
    }

    .actions {
      margin-top: 24px;
      display: flex;
      justify-content: center;
    }

    .btn-primary,
    .btn-secondary {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-height: 48px;
      width: 100%;
      border-radius: 12px;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
    }

    .btn-primary {
      color: #ffffff;
      background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%);
      box-shadow: 0 10px 22px rgba(102, 126, 234, 0.35);
    }

    .btn-secondary {
      color: #444f80;
      background: var(--bg-soft);
      border: 1px solid #d5dbf0;
    }

    .btn-primary:hover,
    .btn-secondary:hover {
      transform: translateY(-1px);
      opacity: 0.95;
    }

    .btn-primary:active,
    .btn-secondary:active {
      transform: translateY(0);
    }

    @media (max-width: 600px) {
      body { padding: 10px; }
      .app-shell { border-radius: 22px; }
      .app-header { padding: 20px 20px; }
      .brand-title { font-size: 26px; }
      .app-content { padding: 22px 18px; }
      h1 { font-size: 25px; }
    }

    ${extraStyles}
  `;
}

function renderBrandedPage({
  pageTitle,
  chip,
  icon,
  iconClass,
  title,
  bodyHtml,
  actionsHtml = '',
  extraStyles = '',
  script = ''
}) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>${pageTitle}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>${getBrandedStyles(extraStyles)}</style>
    </head>
    <body>
      <div class="bg-orb orb-a"></div>
      <div class="bg-orb orb-b"></div>

      <main class="app-shell">
        <header class="app-header">
          <div class="chip">${chip}</div>
          <h2 class="brand-title">EscapeFinder</h2>
        </header>

        <section class="app-content">
          <div class="status-icon ${iconClass}">${icon}</div>
          <h1>${title}</h1>
          ${bodyHtml}
          ${actionsHtml ? `<div class="actions">${actionsHtml}</div>` : ''}
        </section>
      </main>
      ${script}
    </body>
    </html>
  `;
}

// Página de reset password con formulario
app.get('/reset-password', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.send(generateErrorPage('Token no proporcionado'));
  }

  const extraStyles = `
    .status-icon.neutral {
      background: rgba(102, 126, 234, 0.14);
      color: #4f5fc5;
    }

    form {
      margin-top: 24px;
    }

    .form-row {
      margin-bottom: 18px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      color: #2f3556;
      font-size: 14px;
      font-weight: 600;
    }

    .input-wrapper {
      position: relative;
    }

    input {
      width: 100%;
      height: 48px;
      border: 1px solid #d5dbf0;
      border-radius: 12px;
      padding: 0 46px 0 14px;
      font-size: 15px;
      color: #232846;
      background: #fbfcff;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    input::placeholder {
      color: #8b90a9;
    }

    input:focus {
      outline: none;
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.12);
      background: #ffffff;
    }

    .toggle-password {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 34px;
      height: 34px;
      border: none;
      border-radius: 9px;
      background: transparent;
      cursor: pointer;
      color: #6f7698;
      font-size: 18px;
    }

    .toggle-password:hover {
      background: #edf0fb;
      color: #4958be;
    }

    .error {
      margin-top: 8px;
      font-size: 13px;
      color: var(--danger);
      display: none;
    }

    .error.show {
      display: block;
    }

    .form-feedback {
      margin: 12px 0 0 0;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(212, 60, 90, 0.3);
      background: rgba(212, 60, 90, 0.08);
      color: #a7304a;
      font-size: 14px;
      line-height: 1.5;
      display: none;
    }

    .form-feedback.show {
      display: block;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.4);
      border-top: 2px solid #ffffff;
      border-radius: 50%;
      animation: spin 0.65s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  const bodyHtml = `
    <p class="lead">Ingresa tu nueva contrasena para recuperar el acceso de forma segura.</p>
    <p class="support"><strong>Tu nueva contrasena debe tener al menos 8 caracteres.</strong></p>

    <form id="resetForm" novalidate>
      <div class="form-row">
        <label for="password">Nueva contrasena</label>
        <div class="input-wrapper">
          <input
            type="password"
            id="password"
            name="password"
            placeholder="Minimo 8 caracteres"
            required
            minlength="8"
            autocomplete="new-password"
          />
          <button type="button" class="toggle-password" data-target="password" aria-label="Mostrar u ocultar contrasena">👁️</button>
        </div>
        <div class="error" id="passwordError">La contrasena debe tener al menos 8 caracteres.</div>
      </div>

      <div class="form-row">
        <label for="confirmPassword">Confirmar contrasena</label>
        <div class="input-wrapper">
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            placeholder="Repite la contrasena"
            required
            autocomplete="new-password"
          />
          <button type="button" class="toggle-password" data-target="confirmPassword" aria-label="Mostrar u ocultar contrasena">👁️</button>
        </div>
        <div class="error" id="confirmError">Las contrasenas no coinciden.</div>
      </div>

      <button type="submit" class="btn-primary" id="submitBtn" style="border: none; cursor: pointer;">
        <span id="btnText">Actualizar contrasena</span>
        <span id="btnSpinner" class="spinner" style="display:none;"></span>
      </button>
      <div class="form-feedback" id="formFeedback"></div>
    </form>
  `;

  const script = `
    <script>
      const token = ${JSON.stringify(token)};
      const form = document.getElementById('resetForm');
      const submitBtn = document.getElementById('submitBtn');
      const btnText = document.getElementById('btnText');
      const btnSpinner = document.getElementById('btnSpinner');
      const passwordError = document.getElementById('passwordError');
      const confirmError = document.getElementById('confirmError');
      const formFeedback = document.getElementById('formFeedback');

      function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        btnText.style.display = isLoading ? 'none' : 'inline';
        btnSpinner.style.display = isLoading ? 'inline-block' : 'none';
      }

      function showFormFeedback(message) {
        formFeedback.textContent = message;
        formFeedback.classList.add('show');
      }

      function hideFormFeedback() {
        formFeedback.classList.remove('show');
        formFeedback.textContent = '';
      }

      function resetErrors() {
        passwordError.classList.remove('show');
        confirmError.classList.remove('show');
        hideFormFeedback();
      }

      function renderPasswordUpdatedState() {
        document.body.innerHTML = [
          '<div class="bg-orb orb-a"></div>',
          '<div class="bg-orb orb-b"></div>',
          '<main class="app-shell">',
          '  <header class="app-header">',
          '    <div class="chip">Seguridad de cuenta</div>',
          '    <h2 class="brand-title">EscapeFinder</h2>',
          '  </header>',
          '  <section class="app-content">',
          '    <div class="status-icon success">✅</div>',
          '    <h1>Contrasena actualizada</h1>',
          '    <p class="lead">Tu contrasena se restablecio correctamente.</p>',
          '    <p class="support"><strong>Ya puedes volver a iniciar sesion en la app.</strong></p>',
          '    <div class="actions">',
          '      <a class="btn-primary" href="escapefinder://login">Abrir EscapeFinder</a>',
          '    </div>',
          '  </section>',
          '</main>'
        ].join('');
      }

      document.querySelectorAll('.toggle-password').forEach((button) => {
        button.addEventListener('click', () => {
          const inputId = button.getAttribute('data-target');
          const input = document.getElementById(inputId);

          if (input.type === 'password') {
            input.type = 'text';
            button.textContent = '🙈';
            return;
          }

          input.type = 'password';
          button.textContent = '👁️';
        });
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        resetErrors();

        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password.length < 8) {
          passwordError.classList.add('show');
          return;
        }

        if (password !== confirmPassword) {
          confirmError.classList.add('show');
          return;
        }

        setLoading(true);

        try {
          const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, newPassword: password })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'No se pudo restablecer la contrasena.');
          }

          renderPasswordUpdatedState();
        } catch (error) {
          setLoading(false);
          showFormFeedback(error.message || 'Error inesperado. Intentalo de nuevo.');
        }
      });
    </script>
  `;

  res.send(renderBrandedPage({
    pageTitle: 'Restablecer Contrasena - EscapeFinder',
    chip: 'Seguridad de cuenta',
    icon: '🔐',
    iconClass: 'neutral',
    title: 'Restablecer contrasena',
    bodyHtml,
    extraStyles,
    script
  }));
});

// Socket.io con la misma configuración de CORS
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origen no permitido por Socket.io CORS: ${origin}`));
    },
    credentials: true
  }
});

// Inicialización de Socket.io y DB listener
require('./socket').init(io);
require('./config/dbListener');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
