const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function enviarEmailVerificacion(usuario) {
  const token = jwt.sign(
    { 
      id_usuario: usuario.id_usuario,
      email: usuario.email,
      tipo: 'verificacion_email'
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const urlVerificacion = `${process.env.BASE_URL || 'http://localhost:3000'}/verify-email?token=${token}`;

  const mailOptions = {
    from: `"EscapeFinder" <${process.env.EMAIL_USER}>`,
    to: usuario.email,
    subject: 'Verifica tu cuenta - EscapeFinder',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>¡Bienvenido a EscapeFinder, ${usuario.nombre || 'Usuario'}!</h2>
        <p>Para completar tu registro, verifica tu correo electrónico haciendo clic en el botón:</p>
        <a href="${urlVerificacion}" 
           style="display: inline-block; padding: 12px 24px; background-color: #5d4037; 
                  color: white; text-decoration: none; border-radius: 8px; margin: 20px 0;">
          Verificar Email
        </a>
        <p>O copia este enlace en tu navegador:</p>
        <p style="color: #666; word-break: break-all;">${urlVerificacion}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          Este enlace expira en 24 horas. Si no solicitaste este registro, ignora este correo.
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email enviado correctamente:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error enviando email:', error.message);
    throw error;
  }
}

/**
 * Envía email de recuperación de contraseña
 */
async function enviarEmailRecuperacion(usuario, token) {
  const urlRecuperacion = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

  const mailOptions = {
    from: `"EscapeFinder" <${process.env.EMAIL_USER}>`,
    to: usuario.email,
    subject: 'Recuperar contraseña - EscapeFinder',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Recuperación de contraseña</h2>
        <p>Hola ${usuario.nombre || 'Usuario'},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña en EscapeFinder.</p>
        <p>Haz clic en el botón para crear una nueva contraseña:</p>
        <a href="${urlRecuperacion}" 
           style="display: inline-block; padding: 12px 24px; background-color: #5d4037; 
                  color: white; text-decoration: none; border-radius: 8px; margin: 20px 0;">
          Restablecer Contraseña
        </a>
        <p>O copia este enlace en tu navegador:</p>
        <p style="color: #666; word-break: break-all;">${urlRecuperacion}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          Este enlace expira en 1 hora. Si no solicitaste restablecer tu contraseña, ignora este correo.
        </p>
        <p style="color: #999; font-size: 12px;">
          Por seguridad, nunca compartas este enlace con nadie.
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de recuperación enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error enviando email de recuperación:', error.message);
    throw error;
  }
}

module.exports = {
  enviarEmailVerificacion,
  enviarEmailRecuperacion
};