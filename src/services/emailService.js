const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function enviarEmailVerificacion(usuario) {
  // Generar JWT con expiración de 24 horas
  const token = jwt.sign(
    { 
      id_usuario: usuario.id_usuario,
      email: usuario.email,
      tipo: 'verificacion_email'
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const urlVerificacion = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
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

  await transporter.sendMail(mailOptions);
}

module.exports = {
  enviarEmailVerificacion
};