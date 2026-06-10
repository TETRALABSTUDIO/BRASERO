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

export async function send(subject, html) {
  if (!mailer) { console.log('[email:dev] ' + subject); return; }
  await mailer.sendMail({ from: process.env.MAIL_FROM, to: process.env.MAIL_TO, subject, html });
}

export function siteUrl(req) {
  return (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
}
