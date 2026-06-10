// Shared helpers for the Vercel serverless functions.
import Stripe from 'stripe';
import nodemailer from 'nodemailer';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// Prices live ONLY on the server (never trust the client). Cents.
export const PLANS = {
  starter: { name: 'Starter', amount: 12000 },
  flame:   { name: 'Flame',   amount: 24000 },
  burst:   { name: 'Burst',   amount: 29000 },
};
export function amountFor(plan, billing) {
  const base = PLANS[plan].amount / 100;
  const dollars = billing === 'sub' ? Math.round(base * 0.9) : base;
  return dollars * 100;
}

const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}) : null;

export async function send(subject, html) {
  if (!mailer) { console.log('[email:dev] ' + subject); return; }
  await mailer.sendMail({ from: process.env.MAIL_FROM, to: process.env.MAIL_TO, subject, html });
}

export function siteUrl(req) {
  return (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
}
