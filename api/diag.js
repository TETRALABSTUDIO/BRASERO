// Temporary diagnostic: reports which critical env vars are present in the live
// deployment (booleans only, never values). Lets us confirm whether SMTP/webhook
// config is actually active in production. Safe to delete once email is fixed.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
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
