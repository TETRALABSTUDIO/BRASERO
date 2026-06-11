// Shared helpers for the Vercel serverless functions.
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

/* ---- Supabase (orders DB). No-ops gracefully if env not set. ---- */
export const db = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

/* ---- Dev-only in-memory store ----
   Active ONLY when Supabase is not configured (local dev). Lets the order
   tracker + studio panel run end-to-end with a seeded demo order, so the
   UI is fully testable without a database. Never used in production. */
const uid = () => 'x' + Math.random().toString(36).slice(2, 10);
export const MEM = db ? null : {
  orders: [{
    id: 'ord-demo', ref: 'DEMO1234', stripe_session_id: 'sess_demo', status: 'paid',
    plan: 'flame', billing: 'sub', name: 'Demo Client', email: 'demo@brasero.studio',
    created_at: new Date().toISOString(),
  }],
  decks: [
    { id: 'dk-1', order_id: 'ord-demo', position: 0, status: 'script_review',
      title: 'Hook deck — “3 myths about X”',
      script: 'Slide 1 — Stop believing these 3 myths about X.\n\nSlide 2 — Myth #1: ...\n\nSlide 3 — Myth #2: ...\n\nSlide 4 — The truth: ...\n\nSlide 5 — Save this & follow for more.' },
    { id: 'dk-2', order_id: 'ord-demo', position: 1, status: 'design_review',
      title: 'Carousel — mini case study',
      script: 'How we took @client from 1k to 40k in 60 days.',
      design_url: 'assets/carousels/1-1.jpg' },
    { id: 'dk-3', order_id: 'ord-demo', position: 2, status: 'writing', title: 'Founder story deck' },
    { id: 'dk-4', order_id: 'ord-demo', position: 3, status: 'done',
      title: 'Testimonial deck', script: 'What our clients say...', design_url: 'assets/carousels/2-1.jpg',
      design_validated_at: new Date().toISOString() },
  ],
};
const STORE = !!(db || MEM);

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

export function orderRef(sessionId) {
  return sessionId ? sessionId.slice(-8).toUpperCase() : '';
}

export async function markPaid(sessionId, amount) {
  if (!db) return;
  const { error } = await db.from('orders')
    .update({ status: 'paid', amount, ref: orderRef(sessionId) })
    .eq('stripe_session_id', sessionId);
  if (error) console.error('markPaid', error);
}

/* ---- Order tracking + deck workflow ---- */

// Look up a paid order by its public ref + email (the customer's credentials).
// Resilient to rows created before the `ref` column existed.
function matchRef(o, REF) {
  return (o.ref && o.ref.toUpperCase() === REF) || orderRef(o.stripe_session_id) === REF;
}

export async function findOrderByRefEmail(ref, email) {
  if (!STORE || !ref || !email) return null;
  const REF = String(ref).trim().toUpperCase().replace(/^#/, '');
  const EM = String(email).trim().toLowerCase();
  if (MEM) return MEM.orders.find(o => (o.email || '').toLowerCase() === EM && matchRef(o, REF)) || null;
  const { data, error } = await db.from('orders').select('*').ilike('email', String(email).trim());
  if (error) { console.error('findOrder', error); return null; }
  return (data || []).find(o => matchRef(o, REF)) || null;
}

// Admin lookup by ref alone (no email). Resilient to legacy rows.
export async function findOrderByRef(ref) {
  if (!STORE || !ref) return null;
  const REF = String(ref).trim().toUpperCase().replace(/^#/, '');
  if (MEM) return MEM.orders.find(o => matchRef(o, REF)) || null;
  const { data } = await db.from('orders').select('*').or(`ref.eq.${REF},ref.is.null`).limit(500);
  return (data || []).find(o => matchRef(o, REF)) || null;
}

export async function decksForOrder(orderId) {
  if (!STORE || !orderId) return [];
  if (MEM) return MEM.decks.filter(d => d.order_id === orderId).sort((a, b) => a.position - b.position);
  const { data } = await db.from('decks').select('*').eq('order_id', orderId).order('position', { ascending: true });
  return data || [];
}

export async function getDeck(deckId) {
  if (!STORE || !deckId) return null;
  if (MEM) return MEM.decks.find(d => d.id === deckId) || null;
  const { data } = await db.from('decks').select('*').eq('id', deckId).maybeSingle();
  return data || null;
}

export async function patchDeck(deckId, patch) {
  if (!STORE) return null;
  if (MEM) {
    const d = MEM.decks.find(x => x.id === deckId);
    if (d) Object.assign(d, patch, { updated_at: new Date().toISOString() });
    return d || null;
  }
  const { data, error } = await db.from('decks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', deckId).select('*').maybeSingle();
  if (error) { console.error('patchDeck', error); return null; }
  return data;
}

// Admin helpers (also back the studio panel in dev mem-mode).
export async function adminListOrders() {
  if (MEM) return MEM.orders.filter(o => o.status === 'paid');
  if (!db) return [];
  const { data } = await db.from('orders')
    .select('id,ref,stripe_session_id,name,email,plan,status,created_at')
    .eq('status', 'paid').order('created_at', { ascending: false }).limit(100);
  return data || [];
}

export async function createDeck(orderId, { title, position }) {
  if (MEM) { const d = { id: uid(), order_id: orderId, position, title, status: 'writing', script: '', design_url: '' }; MEM.decks.push(d); return d; }
  if (!db) return null;
  const { data, error } = await db.from('decks').insert({ order_id: orderId, position, title, status: 'writing' }).select('*').maybeSingle();
  if (error) { console.error('createDeck', error); return null; }
  return data;
}

export async function deleteDeck(deckId) {
  if (MEM) { MEM.decks = MEM.decks.filter(d => d.id !== deckId); return; }
  if (!db) return;
  await db.from('decks').delete().eq('id', deckId);
}

// Aggregate the decks into an overall progress phase for the tracker UI.
export function orderProgress(decks) {
  const STEPS = ['Onboarding', 'Scripts', 'Script approval', 'Design', 'Final approval', 'Delivered'];
  if (!decks.length) return { steps: STEPS, active: 1, percent: 12 };
  const W = { writing: 0.12, script_review: 0.3, designing: 0.55, revision: 0.62, design_review: 0.78, done: 1 };
  const percent = Math.round(decks.reduce((s, d) => s + (W[d.status] ?? 0), 0) / decks.length * 100);
  const has = s => decks.some(d => d.status === s);
  let active;
  if (decks.every(d => d.status === 'done')) active = 5;
  else if (has('design_review') || has('revision')) active = 4;
  else if (has('designing')) active = 3;
  else if (has('script_review')) active = 2;
  else active = 1;
  return { steps: STEPS, active, percent };
}

// Shape an order + its decks for the customer-facing tracker (no internal ids leaked beyond deck ids).
export function publicOrder(order, decks) {
  return {
    ref: order.ref || orderRef(order.stripe_session_id),
    name: order.name || '',
    handle: order.handle || '',
    plan: order.plan || '',
    billing: order.billing || '',
    status: order.status,
    progress: orderProgress(decks),
    decks: decks.map(d => ({
      id: d.id,
      title: d.title || 'Untitled deck',
      status: d.status,
      script: d.script || '',
      design_url: d.design_url || '',
      revision_note: d.revision_note || '',
      script_validated_at: d.script_validated_at,
      design_validated_at: d.design_validated_at,
    })),
  };
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

// Shared branded shell: gradient header + footer. `inner` is the body cells.
export function emailShell(inner) {
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111111">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:28px 0"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;border:1px solid #eeeeee;border-radius:18px;overflow:hidden">
      <tr><td style="background:linear-gradient(100deg,#ff1a00,#f87000);padding:24px 28px">
        <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-1px">brasero.</span>
      </td></tr>
      ${inner}
      <tr><td style="padding:18px 28px;background:#0c0c0c;color:#9a9a9a;font-size:12px;line-height:1.5">Brasero · decks that build lasting trust<br>Questions? Just reply to this email.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function ctaButton(url, label) {
  return `<a href="${url}" style="display:inline-block;background:linear-gradient(100deg,#ff1a00,#f87000);color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:100px">${label}</a>`;
}

// "You have something to validate" email — script ready or design ready.
export function reviewEmail({ name, kind, deckTitle, ref, url }) {
  const first = name ? name.split(' ')[0] : '';
  const isScript = kind === 'script';
  const heading = isScript ? `Your script is ready to review` : `Your design is ready to review`;
  const blurb = isScript
    ? `We've written the script for <b>${deckTitle || 'your next deck'}</b>. Take a look — you can tweak the copy and approve it so we move it into design.`
    : `The design for <b>${deckTitle || 'your next deck'}</b> is ready. Approve it, or send a retouch and we'll rework it.`;
  return emailShell(`
    <tr><td style="padding:30px 28px 6px">
      <h1 style="margin:0 0 8px;font-size:26px;letter-spacing:-1px">A deck needs your eyes${first ? ', ' + first : ''} 👀</h1>
      <p style="margin:0;color:#6b6b6b;font-size:15px;line-height:1.5">${heading}.</p>
    </td></tr>
    <tr><td style="padding:14px 28px 6px">
      <p style="margin:0 0 16px;font-size:14px;color:#333333;line-height:1.55">${blurb}</p>
      ${url ? ctaButton(url, isScript ? 'Review the script →' : 'Review the design →') : ''}
    </td></tr>
    <tr><td style="padding:14px 28px 26px;color:#9a9a9a;font-size:12px">Order #${ref || ''}</td></tr>`);
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
