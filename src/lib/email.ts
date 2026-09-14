import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export interface EmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send an OTP code via email.
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  schoolName: string = 'EduGest'
): Promise<EmailResult> {
  if (!process.env.SMTP_USER) {
    console.warn('[EMAIL] SMTP not configured. Code not sent:', code);
    return { success: false, error: 'Email SMTP non configuré. Code: ' + code };
  }

  try {
    await transporter.sendMail({
      from: `"${schoolName}" <${process.env.SMTP_USER}>`,
      to,
      subject: `Code de vérification - ${schoolName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#0a0f0d;font-family:'Segoe UI',Tahoma,sans-serif;">
          <div style="max-width:480px;margin:40px auto;background:linear-gradient(135deg,#0d1f1a,#0b1613);border-radius:16px;border:1px solid rgba(245,166,35,0.2);overflow:hidden;">
            <div style="background:linear-gradient(135deg,#f5a623,#ffb643);padding:24px;text-align:center;">
              <h1 style="margin:0;color:#0a0f0d;font-size:24px;font-weight:800;">🎓 ${schoolName}</h1>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#ffffff;margin:0 0 8px;font-size:18px;">Code de vérification</h2>
              <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 24px;">Utilisez ce code pour vérifier votre compte :</p>
              
              <div style="background:rgba(245,166,35,0.1);border:2px solid rgba(245,166,35,0.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
                <span style="font-size:36px;font-weight:800;color:#f5a623;letter-spacing:8px;font-family:'Courier New',monospace;">${code}</span>
              </div>
              
              <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;text-align:center;">
                Ce code expire dans 10 minutes. Ne partagez ce code avec personne.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[EMAIL] Send error:', error);
    return { success: false, error: 'Erreur envoi email' };
  }
}

/**
 * Test SMTP connection.
 */
export async function testSmtpConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    await transporter.verify();
    return { connected: true };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}
