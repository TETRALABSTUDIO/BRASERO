// Shared helpers for the Vercel serverless functions.
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

/* ---- Supabase (orders DB). No-ops gracefully if env not set. ---- */
export const db = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

export async function saveOrder(o) {
  if (!db) return;
  const { error } = await db.from('orders').upsert({
    stripe_session_id: o.stripe_session_id,
    status: o.status || 'pending',
    plan: o.plan, billing: o.billing, amount: o.amount,
    name: o.name, email: o.email, instagram: o.instagram, handle: o.handle,
  }, { onConflict: 'stripe_session_id' });
  if (error) console.error('saveOrder', error);
}

export async function markPaid(sessionId, amount) {
  if (!db) return;
  const { error } = await db.from('orders').update({ status: 'paid', amount }).eq('stripe_session_id', sessionId);
  if (error) console.error('markPaid', error);
}

export async function saveOnboarding({ sessionId, email, handle, answers }) {
  if (!db) return;
  const patch = { answers, onboarding_at: new Date().toISOString() };
  if (sessionId) {
    const { data } = await db.from('orders').update(patch).eq('stripe_session_id', sessionId).select('id');
    if (data && data.length) return;
  }
  if (email) {
    const { data } = await db.from('orders').update(patch).eq('email', email).select('id');
    if (data && data.length) return;
  }
  await db.from('orders').insert({ email, handle, status: 'onboarding-only', ...patch });
}

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

// Internal notification (to the studio inbox). No-ops if MAIL_TO not set.
export async function send(subject, html) {
  if (!mailer || !process.env.MAIL_TO) { console.log('[email:dev] ' + subject); return; }
  await mailer.sendMail({ from: process.env.MAIL_FROM, to: process.env.MAIL_TO, subject, html });
}

// Email to a specific recipient (e.g. the customer).
export async function sendTo(to, subject, html) {
  if (!mailer || !to) { console.log('[email:dev → ' + to + '] ' + subject); return; }
  await mailer.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
}

// Branded order-confirmation email sent to the customer.
export function clientOrderEmail({ name, planName, billing, amountCents, handle, ref }) {
  const amount = amountCents != null ? '$' + (amountCents / 100).toFixed(amountCents % 100 ? 2 : 0) : '';
  const first = name ? name.split(' ')[0] : '';
  const cell = 'padding:12px 16px;font-size:14px';
  const top = 'border-top:1px solid #f0f0f0';
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111111">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:28px 0"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;border:1px solid #eeeeee;border-radius:18px;overflow:hidden">
      <tr><td style="background:linear-gradient(100deg,#ff1a00,#f87000);padding:24px 28px">
        <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-1px">brasero.</span>
      </td></tr>
      <tr><td style="padding:30px 28px 6px">
        <h1 style="margin:0 0 8px;font-size:26px;letter-spacing:-1px">Order confirmed${first ? ', ' + first : ''} 🎉</h1>
        <p style="margin:0;color:#6b6b6b;font-size:15px;line-height:1.5">Thanks for your order — payment received. Here's your recap.</p>
      </td></tr>
      <tr><td style="padding:18px 28px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eeeeee;border-radius:12px">
          <tr><td style="${cell};color:#6b6b6b">Pack</td><td align="right" style="${cell};font-weight:700">${planName || '—'}</td></tr>
          <tr><td style="${cell};color:#6b6b6b;${top}">Billing</td><td align="right" style="${cell};font-weight:700;${top}">${billing === 'sub' ? 'Subscription · monthly' : 'One-time'}</td></tr>
          ${handle ? `<tr><td style="${cell};color:#6b6b6b;${top}">Account</td><td align="right" style="${cell};font-weight:700;${top}">${handle}</td></tr>` : ''}
          ${ref ? `<tr><td style="${cell};color:#6b6b6b;${top}">Order ref</td><td align="right" style="${cell};font-weight:700;${top}">#${ref}</td></tr>` : ''}
          <tr><td style="padding:14px 16px;font-weight:700;border-top:1px solid #eeeeee">Total paid</td><td align="right" style="padding:14px 16px;font-weight:900;font-size:20px;border-top:1px solid #eeeeee">${amount}${billing === 'sub' ? ' /mo' : ''}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:6px 28px 26px">
        <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#f87000;margin:14px 0 10px">What happens next</h3>
        <p style="margin:0 0 8px;font-size:14px;color:#333333">1 · We review your brief &amp; Instagram and map your hooks.</p>
        <p style="margin:0 0 8px;font-size:14px;color:#333333">2 · We write &amp; design your first decks in your brand style.</p>
        <p style="margin:0;font-size:14px;color:#333333">3 · You receive your post-ready decks by email.</p>
      </td></tr>
      <tr><td style="padding:18px 28px;background:#0c0c0c;color:#9a9a9a;font-size:12px;line-height:1.5">Brasero · decks that build lasting trust<br>Questions? Just reply to this email.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export function siteUrl(req) {
  return (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
}
