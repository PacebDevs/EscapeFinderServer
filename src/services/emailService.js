const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const smtpPort = Number.parseInt(process.env.SMTP_PORT || '465', 10);
const smtpUser = process.env.SMTP_USER ?? process.env.EMAIL_USER;
const smtpPassword = process.env.SMTP_PASSWORD ?? process.env.EMAIL_PASS;
const emailFrom = process.env.EMAIL_FROM || smtpUser;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.eu',
  port: smtpPort,
  secure: process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPassword
  }
});

function assertEmailConfiguration() {
  const missingVariables = [];

  if (!smtpUser) missingVariables.push('SMTP_USER');
  if (!smtpPassword) missingVariables.push('SMTP_PASSWORD');
  if (!Number.isInteger(smtpPort) || smtpPort <= 0) {
    missingVariables.push('SMTP_PORT');
  }

  if (missingVariables.length > 0) {
    throw new Error(`Configuracion SMTP incompleta: ${missingVariables.join(', ')}`);
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildBrandedEmail({
  chip,
  title,
  intro,
  ctaLabel,
  ctaUrl,
  fallbackText,
  note,
  highlight
}) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeCtaLabel = escapeHtml(ctaLabel);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const safeFallbackText = escapeHtml(fallbackText);
  const safeNote = escapeHtml(note);
  const safeChip = escapeHtml(chip);
  const safeHighlight = escapeHtml(highlight);

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${safeTitle}</title>
    </head>
    <body style="margin: 0; padding: 24px 12px; background-color: #f3f5ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; border-collapse: collapse;">
        <tr>
          <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px 20px 0 0; padding: 26px 28px; color: #ffffff;">
            <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.9;">${safeChip}</p>
            <h1 style="margin: 10px 0 0 0; font-size: 28px; line-height: 1.2;">EscapeFinder</h1>
          </td>
        </tr>
        <tr>
          <td style="background: #ffffff; border-radius: 0 0 20px 20px; padding: 30px 28px; box-shadow: 0 8px 26px rgba(57, 66, 129, 0.15);">
            <h2 style="margin: 0 0 12px 0; color: #2b2f4a; font-size: 24px; line-height: 1.3;">${safeTitle}</h2>
            <p style="margin: 0 0 8px 0; color: #515877; font-size: 16px; line-height: 1.6;">${safeIntro}</p>
            <p style="margin: 0 0 24px 0; color: #515877; font-size: 16px; line-height: 1.6;"><strong>${safeHighlight}</strong></p>

            <a href="${safeCtaUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-size: 16px; font-weight: 700;">
              ${safeCtaLabel}
            </a>

            <p style="margin: 26px 0 8px 0; color: #6f7390; font-size: 14px; line-height: 1.6;">Si el boton no funciona, copia y pega este enlace en tu navegador:</p>
            <p style="margin: 0; word-break: break-all; color: #667eea; font-size: 14px;">${safeCtaUrl}</p>

            <hr style="border: 0; border-top: 1px solid #e7e9f5; margin: 28px 0 18px 0;" />
            <p style="margin: 0; color: #7f859f; font-size: 13px; line-height: 1.6;">${safeFallbackText}</p>
            <p style="margin: 10px 0 0 0; color: #7f859f; font-size: 13px; line-height: 1.6;">${safeNote}</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

async function enviarEmailVerificacion(usuario) {
  assertEmailConfiguration();

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
  const nombreUsuario = usuario.nombre || 'explorador';

  const mailOptions = {
    from: `"EscapeFinder" <${emailFrom}>`,
    to: usuario.email,
    subject: 'Confirma tu cuenta y empieza a explorar | EscapeFinder',
    text: `Hola ${nombreUsuario},\n\nTu aventura en EscapeFinder empieza aqui.\nConfirma tu cuenta desde este enlace: ${urlVerificacion}\n\nEste enlace expira en 24 horas. Si no creaste esta cuenta, puedes ignorar este mensaje.`,
    html: buildBrandedEmail({
      chip: 'Nuevo registro',
      title: `Bienvenido, ${nombreUsuario}`,
      intro: 'Tu aventura en EscapeFinder esta a un solo paso de comenzar.',
      highlight: 'Confirma tu email para activar tu cuenta y descubrir nuevas salas.',
      ctaLabel: 'Verificar email',
      ctaUrl: urlVerificacion,
      fallbackText: 'Este enlace expira en 24 horas.',
      note: 'Si no creaste esta cuenta, puedes ignorar este mensaje con tranquilidad.'
    })
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
  assertEmailConfiguration();

  const urlRecuperacion = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  const nombreUsuario = usuario.nombre || 'explorador';

  const mailOptions = {
    from: `"EscapeFinder" <${emailFrom}>`,
    to: usuario.email,
    subject: 'Restablece tu acceso de forma segura | EscapeFinder',
    text: `Hola ${nombreUsuario},\n\nRecibimos una solicitud para restablecer tu contrasena en EscapeFinder.\nHazlo desde este enlace: ${urlRecuperacion}\n\nEste enlace expira en 1 hora. Si no solicitaste el cambio, ignora este correo y manten tu cuenta protegida.`,
    html: buildBrandedEmail({
      chip: 'Seguridad de cuenta',
      title: `Hola ${nombreUsuario}, vamos a recuperar tu acceso`,
      intro: 'Recibimos una solicitud para restablecer tu contrasena en EscapeFinder.',
      highlight: 'Crea una nueva contrasena para volver a entrar y seguir explorando.',
      ctaLabel: 'Restablecer contrasena',
      ctaUrl: urlRecuperacion,
      fallbackText: 'Este enlace expira en 1 hora.',
      note: 'Si no solicitaste este cambio, ignora este correo. Nunca compartas este enlace.'
    })
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
