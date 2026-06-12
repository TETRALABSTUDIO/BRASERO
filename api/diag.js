// Temporary diagnostic: reports which critical env vars are present in the live
// deployment (booleans only, never values), and can test the SMTP connection from
// Vercel (?smtp=1, optionally &to=email to actually send). Safe to delete after.
import nodemailer from 'nodemailer';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query && req.query.smtp) {
    try {
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 9000, greetingTimeout: 9000, socketTimeout: 9000,
      });
      await t.verify();
      let sent = null;
      const to = req.query.to;
      if (to) { const info = await t.sendMail({ from: process.env.MAIL_FROM, to, subject: 'Brasero SMTP test (from Vercel)', html: '<p>If you got this, SMTP works from Vercel.</p>' }); sent = { accepted: info.accepted, rejected: info.rejected, response: info.response }; }
      return res.json({ smtp: 'ok', verify: true, sent });
    } catch (e) { return res.json({ smtp: 'fail', error: String((e && e.message) || e), code: (e && e.code) || null }); }
  }
  res.json({
    smtp_host: !!process.env.SMTP_HOST,
    smtp_port: process.env.SMTP_PORT || null,
    smtp_user: !!process.env.SMTP_USER,
    smtp_pass: !!process.env.SMTP_PASS,
    mail_from: !!process.env.MAIL_FROM,
    mail_to: !!process.env.MAIL_TO,
    stripe_secret_key: !!process.env.STRIPE_SECRET_KEY,
    stripe_webhook_secret: !!process.env.STRIPE_WEBHOOK_SECRET,
    supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    node: process.version,
  });
}
