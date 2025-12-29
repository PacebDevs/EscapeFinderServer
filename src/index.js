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
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title} - EscapeFinder</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          max-width: 500px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          text-align: center;
        }
        .icon { font-size: 80px; margin-bottom: 20px; }
        h1 { color: #333; margin: 10px 0; font-size: 24px; }
        p { color: #666; line-height: 1.6; margin: 15px 0; }
        button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 12px;
          cursor: pointer;
          width: 100%;
          margin-top: 20px;
          font-size: 16px;
          font-weight: 600;
        }
        button:hover { opacity: 0.9; }
        button:active { transform: scale(0.98); }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <p><strong>${subtitle}</strong></p>
        ${showAppButton ? `
          <a href="escapefinder://login" style="display: block; text-decoration: none;">
            <button style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 14px 28px; border-radius: 12px; cursor: pointer; width: 100%; margin-top: 20px; font-size: 16px; font-weight: 600;">
              Abrir EscapeFinder
            </button>
          </a>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

function generateErrorPage(errorMessage) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Error - EscapeFinder</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          max-width: 500px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          text-align: center;
        }
        .icon { font-size: 80px; margin-bottom: 20px; color: #f04141; }
        h1 { color: #333; margin: 10px 0; font-size: 24px; }
        p { color: #666; line-height: 1.6; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">❌</div>
        <h1>Error</h1>
        <p>${errorMessage}</p>
      </div>
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

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Restablecer Contraseña - EscapeFinder</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        }
        h1 { color: #333; margin: 0 0 10px 0; font-size: 24px; text-align: center; }
        p { color: #666; line-height: 1.6; margin: 0 0 30px 0; text-align: center; }
        .form-group {
          margin-bottom: 20px;
          position: relative;
        }
        label {
          display: block;
          margin-bottom: 8px;
          color: #333;
          font-weight: 500;
        }
        .input-wrapper {
          position: relative;
        }
        input {
          width: 100%;
          padding: 12px 45px 12px 12px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          box-sizing: border-box;
          transition: border-color 0.3s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
        }
        .toggle-password {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 20px;
          padding: 5px;
          color: #666;
          width: auto;
        }
        .toggle-password:hover {
          color: #667eea;
          opacity: 1;
          transform: translateY(-50%);
        }
        button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 14px;
          border-radius: 12px;
          cursor: pointer;
          width: 100%;
          font-size: 16px;
          font-weight: 600;
        }
        button:hover { opacity: 0.9; }
        button:active { transform: scale(0.98); }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .error {
          color: #f04141;
          font-size: 14px;
          margin-top: 5px;
          display: none;
        }
        .error.show { display: block; }
        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid #fff;
          border-top: 2px solid transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Restablecer Contraseña</h1>
        <p>Ingresa tu nueva contraseña</p>
        
        <form id="resetForm">
          <div class="form-group">
            <label for="password">Nueva Contraseña</label>
            <div class="input-wrapper">
              <input type="password" id="password" name="password" 
                     placeholder="Mínimo 8 caracteres" required minlength="8">
              <button type="button" class="toggle-password" onclick="togglePasswordVisibility('password', this)">
                👁️
              </button>
            </div>
            <div class="error" id="passwordError">La contraseña debe tener al menos 8 caracteres</div>
          </div>
          
          <div class="form-group">
            <label for="confirmPassword">Confirmar Contraseña</label>
            <div class="input-wrapper">
              <input type="password" id="confirmPassword" name="confirmPassword" 
                     placeholder="Repite la contraseña" required>
              <button type="button" class="toggle-password" onclick="togglePasswordVisibility('confirmPassword', this)">
                👁️
              </button>
            </div>
            <div class="error" id="confirmError">Las contraseñas no coinciden</div>
          </div>
          
          <button type="submit" id="submitBtn">
            <span id="btnText">Restablecer Contraseña</span>
            <span id="btnSpinner" class="spinner" style="display:none;"></span>
          </button>
        </form>
      </div>

      <script>
        const token = '${token}';
        const form = document.getElementById('resetForm');
        const submitBtn = document.getElementById('submitBtn');
        const btnText = document.getElementById('btnText');
        const btnSpinner = document.getElementById('btnSpinner');
        
        function togglePasswordVisibility(inputId, button) {
          const input = document.getElementById(inputId);
          if (input.type === 'password') {
            input.type = 'text';
            button.textContent = '🙈';
          } else {
            input.type = 'password';
            button.textContent = '👁️';
          }
        }
        
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const password = document.getElementById('password').value;
          const confirmPassword = document.getElementById('confirmPassword').value;
          const passwordError = document.getElementById('passwordError');
          const confirmError = document.getElementById('confirmError');
          
          // Reset errors
          passwordError.classList.remove('show');
          confirmError.classList.remove('show');
          
          // Validations
          if (password.length < 8) {
            passwordError.classList.add('show');
            return;
          }
          
          if (password !== confirmPassword) {
            confirmError.classList.add('show');
            return;
          }
          
          // Disable button and show spinner
          submitBtn.disabled = true;
          btnText.style.display = 'none';
          btnSpinner.style.display = 'inline-block';
          
          try {
            const response = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token, newPassword: password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
              // Success - show success page
              document.body.innerHTML = \`
                <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                  <div style="background: white; padding: 40px; border-radius: 20px; max-width: 500px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); text-align: center;">
                    <div style="font-size: 80px; margin-bottom: 20px;">✅</div>
                    <h1 style="color: #333; margin: 10px 0; font-size: 24px;">Contraseña Actualizada</h1>
                    <p style="color: #666; line-height: 1.6; margin: 15px 0;">Tu contraseña ha sido restablecida correctamente.</p>
                    <p style="color: #666; line-height: 1.6; margin: 15px 0;"><strong>Ahora puedes iniciar sesión con tu nueva contraseña.</strong></p>
                    <a href="escapefinder://login" style="display: block; text-decoration: none;">
                      <button style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 14px 28px; border-radius: 12px; cursor: pointer; width: 100%; margin-top: 20px; font-size: 16px; font-weight: 600;">Abrir EscapeFinder</button>
                    </a>
                  </div>
                </div>
              \`;
            } else {
              throw new Error(data.error || 'Error al restablecer contraseña');
            }
          } catch (error) {
            alert('Error: ' + error.message);
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';
          }
        });
      </script>
    </body>
    </html>
  `);
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
