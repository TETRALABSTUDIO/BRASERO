// Shared helpers for the Vercel serverless functions.
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

/* ---- Supabase (orders DB). No-ops gracefully if env not set. ---- */
export const db = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

/* ---- Auth primitives (Talent accounts) ---- */
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || 'brasero-dev-secret';
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64url = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const calc = crypto.scryptSync(String(pw), salt, 32);
  const orig = Buffer.from(h, 'hex');
  return calc.length === orig.length && crypto.timingSafeEqual(calc, orig);
}
function hmac(body) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
export function signToken(payload, days = 14) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + days * 864e5 }));
  return body + '.' + hmac(body);
}
export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expSig = hmac(body);
  if (sig.length !== expSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expSig))) return null;
  try { const p = JSON.parse(unb64url(body)); if (p.exp && Date.now() > p.exp) return null; return p; }
  catch { return null; }
}

/* ---- Dev-only in-memory store ----
   Active ONLY when Supabase is not configured (local dev). Lets the order
   tracker + studio panel run end-to-end with seeded demo data, so the
   UI is fully testable without a database. Never used in production. */
const uid = () => 'x' + Math.random().toString(36).slice(2, 10);
export const MEM = db ? null : {
  talents: [
    { id: 'tal-owner', email: 'owner@brasero.studio', name: 'Studio Owner', is_owner: true, password_hash: hashPassword('owner123') },
    { id: 'tal-1', email: 'talent@brasero.studio', name: 'Demo Talent', is_owner: false, password_hash: hashPassword('talent123') },
  ],
  orders: [
    { id: 'ord-demo', ref: 'DEMO1234', stripe_session_id: 'sess_demo', status: 'paid',
      plan: 'flame', billing: 'sub', name: 'Demo Client', email: 'demo@brasero.studio',
      talent_email: 'talent@brasero.studio', created_at: new Date().toISOString() },
    { id: 'ord-todo', ref: 'TODO5678', stripe_session_id: 'sess_todo', status: 'paid',
      plan: 'starter', billing: 'once', name: 'Nina Park', email: 'nina@example.com',
      talent_email: 'talent@brasero.studio', created_at: new Date().toISOString() },
    { id: 'ord-done', ref: 'DONE9001', stripe_session_id: 'sess_done', status: 'paid',
      plan: 'burst', billing: 'sub', name: 'Leo Marchand', email: 'leo@example.com',
      talent_email: 'talent@brasero.studio', created_at: new Date().toISOString() },
    // unpaid lead (abandoned checkout) — shows up in the CRM
    { id: 'ord-lead', ref: 'LEAD0001', stripe_session_id: 'sess_lead', status: 'pending',
      plan: 'flame', billing: 'once', name: 'Marc Abandon', email: 'marc@lead.com', instagram: '@marc',
      amount: 24000, created_at: new Date(Date.now() - 2 * 864e5).toISOString() },
  ],
  decks: [
    { id: 'dk-1', order_id: 'ord-demo', position: 0, status: 'script_review',
      title: 'Hook deck - “3 myths about X”',
      script: 'Slide 1 - Stop believing these 3 myths about X.\n\nSlide 2 - Myth #1: ...\n\nSlide 3 - Myth #2: ...\n\nSlide 4 - The truth: ...\n\nSlide 5 - Save this & follow for more.' },
    { id: 'dk-2', order_id: 'ord-demo', position: 1, status: 'design_review',
      title: 'Carousel - mini case study',
      script: 'How we took @client from 1k to 40k in 60 days.',
      design_urls: ['assets/carousels/1-1.jpg', 'assets/carousels/1-2.jpg', 'assets/carousels/1-3.jpg'] },
    { id: 'dk-3', order_id: 'ord-demo', position: 2, status: 'writing', type: 'story', title: 'Founder story' },
    { id: 'dk-4', order_id: 'ord-demo', position: 3, status: 'done', type: 'branding',
      title: 'Profile photo', script: 'What our clients say...',
      design_urls: ['assets/carousels/2-1.jpg', 'assets/carousels/2-2.jpg'],
      design_validated_at: new Date().toISOString() },
    { id: 'dk-5', order_id: 'ord-done', position: 0, status: 'done',
      title: 'Launch announcement', script: 'We are live!',
      design_urls: ['assets/carousels/3-1.jpg'], design_validated_at: new Date().toISOString() },
  ],
  messages: [
    { id: 'msg-1', order_id: 'ord-demo', deck_id: 'dk-1', sender: 'client', sender_name: 'Demo Client',
      body: 'Could you make the hook punchier on this one?', created_at: new Date(Date.now() - 36e5).toISOString() },
    { id: 'msg-2', order_id: 'ord-demo', deck_id: 'dk-1', sender: 'studio', sender_name: 'Demo Talent',
      body: 'On it! Sending a revised script shortly.', created_at: new Date(Date.now() - 30e5).toISOString() },
  ],
  // Client accounts (magic-link auth). Created lazily; seeded empty in dev.
  clients: [],
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
  if (!db) return null;
  const { data, error } = await db.from('orders')
    .update({ status: 'paid', amount, ref: orderRef(sessionId) })
    .eq('stripe_session_id', sessionId)
    .select('*').maybeSingle();
  if (error) { console.error('markPaid', error); return null; }
  return data;
}

// Look up a stored order (DB or in-memory demo) by its Stripe session id.
export async function findOrderBySession(sessionId) {
  if (!STORE || !sessionId) return null;
  if (MEM) return MEM.orders.find(o => o.stripe_session_id === sessionId) || null;
  const { data } = await db.from('orders').select('*').eq('stripe_session_id', sessionId).maybeSingle();
  return data || null;
}

// Trusted order shape used by the onboarding page + its emails (server is the
// single source of truth; never trust client-supplied prices/plan/email).
function onboardingOrder(ord, s) {
  const m = (s && s.metadata) || {};
  const plan = (ord && ord.plan) || m.plan || '';
  const billing = (ord && ord.billing) || m.billing || '';
  const amountCents = (s && s.amount_total != null) ? s.amount_total
    : (ord && ord.amount != null ? ord.amount : null);
  const sid = (s && s.id) || (ord && ord.stripe_session_id) || '';
  return {
    sessionId: sid,
    ref: orderRef(sid),
    name: (ord && ord.name) || m.name || '',
    email: (ord && ord.email) || (s && s.customer_email) || m.email || '',
    handle: (ord && ord.handle) || m.handle || '',
    instagram: (ord && ord.instagram) || m.instagram || '',
    niche: (ord && ord.niche) || m.niche || '',
    plan,
    planName: (PLANS[plan] && PLANS[plan].name) || plan || '',
    billing,
    price: amountCents != null ? Math.round(amountCents) / 100 : null,
  };
}

// True if a brief has already been submitted for this session (anti-duplicate).
export async function onboardingDone(sessionId) {
  if (!db || !sessionId) return false;
  const { data } = await db.from('orders').select('onboarding_at').eq('stripe_session_id', sessionId).maybeSingle();
  return !!(data && data.onboarding_at);
}

// SECURITY GATE — returns the trusted order only if the Stripe Checkout session
// is genuinely paid, else null. Used to gate the onboarding page + submission so
// nobody can send a brief without paying. Accepts a locally-stored paid order
// (webhook already ran / demo / manual) or confirms live with Stripe otherwise.
export async function verifyPaidSession(sessionId) {
  if (!sessionId) return null;
  const ord = await findOrderBySession(sessionId);
  if (ord && ord.status === 'paid') return onboardingOrder(ord, null);
  // Ask Stripe directly — covers the race before the webhook marks the order paid.
  if (process.env.STRIPE_SECRET_KEY && /^cs_/.test(sessionId)) {
    try {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      if (s && (s.payment_status === 'paid' || s.status === 'complete')) return onboardingOrder(ord, s);
    } catch (e) { console.error('verifyPaidSession', e.message); }
  }
  return null;
}

/* ---- Order tracking + deck workflow ---- */

// Look up a paid order by its public ref + email (the customer's credentials).
// Resilient to rows created before the `ref` column existed.
function matchRef(o, REF) {
  return (o.ref && o.ref.toUpperCase() === REF) || orderRef(o.stripe_session_id) === REF;
}

// Admin lookup by ref alone (no email). Resilient to legacy rows.
export async function findOrderByRef(ref) {
  if (!STORE || !ref) return null;
  const REF = String(ref).trim().toUpperCase().replace(/^#/, '');
  if (MEM) return MEM.orders.find(o => matchRef(o, REF)) || null;
  const { data } = await db.from('orders').select('*').or(`ref.eq.${REF},ref.is.null`).limit(500);
  return (data || []).find(o => matchRef(o, REF)) || null;
}

/* ---- Client accounts (magic-link auth) ----
   A client is a persistent account keyed by email. They sign in with a magic
   link (no password) and reach a space aggregating ALL their orders, instead of
   logging into a single order by ref+email. Orders link back via orders.client_id;
   email stays the stable join key for reads (one account per email). */
const pubClient = c => c && ({ email: c.email, name: c.name || '' });

export async function getClientByEmail(email) {
  if (!STORE || !email) return null;
  const EM = String(email).trim().toLowerCase();
  if (MEM) return MEM.clients.find(c => c.email === EM) || null;
  const { data } = await db.from('clients').select('*').ilike('email', EM).maybeSingle();
  return data || null;
}

// True if this email already has at least one order — gates lazy account creation
// (only people who actually ordered can get a sign-in link).
export async function emailHasOrders(email) {
  if (!STORE || !email) return false;
  const EM = String(email).trim().toLowerCase();
  if (MEM) return MEM.orders.some(o => (o.email || '').toLowerCase() === EM);
  const { data } = await db.from('orders').select('id').ilike('email', EM).limit(1);
  return !!(data && data.length);
}

// Create the client account if missing (idempotent by email), then back-link any
// of their existing orders. Returns the client row.
export async function upsertClient({ email, name } = {}) {
  if (!STORE) return null;
  const EM = String(email || '').trim().toLowerCase();
  if (!EM) return null;
  const existing = await getClientByEmail(EM);
  if (existing) {
    if (name && !existing.name) {
      if (MEM) existing.name = name;
      else await db.from('clients').update({ name }).eq('id', existing.id);
    }
    return existing;
  }
  if (MEM) {
    const c = { id: uid(), email: EM, name: name || '', created_at: new Date().toISOString() };
    MEM.clients.push(c);
    MEM.orders.forEach(o => { if ((o.email || '').toLowerCase() === EM) o.client_id = c.id; });
    return c;
  }
  const { data, error } = await db.from('clients').insert({ email: EM, name: name || '' }).select('*').maybeSingle();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return await getClientByEmail(EM); // lost a race; fetch the winner
    console.error('upsertClient', error);
    return null;
  }
  await db.from('orders').update({ client_id: data.id }).ilike('email', EM).is('client_id', null);
  return data;
}

// Stamp last sign-in (best-effort).
export async function touchClient(client) {
  if (!client) return;
  if (MEM) { client.last_login = new Date().toISOString(); return; }
  await db.from('clients').update({ last_login: new Date().toISOString() }).eq('id', client.id);
}

// Long-lived session token for a signed-in client.
export function signClientSession(client) {
  return signToken({ email: client.email, cid: client.id, role: 'client' }, 14);
}

// Resolve a signed-in client from a request's Authorization header (role 'client').
// Returns { id, email } or null. The server re-verifies the HMAC every call.
export function clientFromAuth(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const s = verifyToken(tok);
  if (!s || s.role !== 'client' || !s.email) return null;
  return { id: s.cid || null, email: String(s.email).toLowerCase() };
}
// True if a client owns an order (email is the stable join key; client_id as backup).
export const ownsOrder = (o, c) => !!o && !!c &&
  ((o.email || '').toLowerCase() === c.email || (!!c.id && o.client_id === c.id));

// Every paid order belonging to a client (keyed by their email).
export async function ordersForClient(client) {
  if (!STORE || !client) return [];
  const EM = (client.email || '').toLowerCase();
  if (MEM) return MEM.orders.filter(o => o.status === 'paid' && (o.email || '').toLowerCase() === EM)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const { data } = await db.from('orders').select('*').ilike('email', EM)
    .eq('status', 'paid').order('created_at', { ascending: false }).limit(200);
  return data || [];
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

/* ---- Messages: one client <-> studio thread per order, optionally about an asset ---- */
const pubMessage = m => ({
  id: m.id, deck_id: m.deck_id || null, sender: m.sender, sender_name: m.sender_name || '',
  body: m.body || '', images: Array.isArray(m.images) ? m.images : [], created_at: m.created_at,
});

export async function listMessages(orderId) {
  if (!STORE || !orderId) return [];
  if (MEM) return MEM.messages.filter(m => m.order_id === orderId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(pubMessage);
  const { data } = await db.from('messages').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
  return (data || []).map(pubMessage);
}

export async function addMessage(orderId, { deck_id, sender, sender_name, body, images }) {
  if (!STORE || !orderId) return null;
  const text = String(body || '').trim().slice(0, 4000);
  // keep only safe image refs (data:image URLs or http URLs), max 8 per message
  const imgs = Array.isArray(images) ? images.filter(u => typeof u === 'string' && /^(data:image\/|https?:)/.test(u)).slice(0, 8) : [];
  if (!text && !imgs.length) return null;
  const row = { order_id: orderId, deck_id: deck_id || null, sender: sender === 'studio' ? 'studio' : 'client',
    sender_name: String(sender_name || '').slice(0, 120), body: text, images: imgs };
  if (MEM) { const m = { id: uid(), created_at: new Date().toISOString(), ...row }; MEM.messages.push(m); return pubMessage(m); }
  const { data, error } = await db.from('messages').insert(row).select('*').maybeSingle();
  if (error) { console.error('addMessage', error); return null; }
  return pubMessage(data);
}

// Hard-delete one message. Scoped to its order so a caller can only remove a
// message that belongs to the order they're acting on (owner moderation).
export async function deleteMessage(orderId, messageId) {
  if (!STORE || !orderId || !messageId) return false;
  if (MEM) {
    const i = MEM.messages.findIndex(m => m.id === messageId && m.order_id === orderId);
    if (i < 0) return false;
    MEM.messages.splice(i, 1);
    return true;
  }
  const { data, error } = await db.from('messages').delete()
    .eq('id', messageId).eq('order_id', orderId).select('id');
  if (error) { console.error('deleteMessage', error); return false; }
  return !!(data && data.length);
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
  // select '*' so the enriched list carries the full brief (answers, instagram, addons,
  // phone, amount, billing) — the owner edit modal prefills from these, and a stripped
  // list would wipe them on every save/reopen.
  const { data } = await db.from('orders')
    .select('*')
    .eq('status', 'paid').order('created_at', { ascending: false }).limit(200);
  return data || [];
}

// Every order, any status (paid + pending/abandoned) — for the owner dashboard + CRM.
export async function listAllOrders() {
  if (MEM) return MEM.orders.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!db) return [];
  const { data } = await db.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
  return data || [];
}

export async function createDeck(orderId, { title, position, type }) {
  const t = type || 'carousel';
  if (MEM) { const d = { id: uid(), order_id: orderId, position, title, type: t, status: 'writing', script: '', design_urls: [] }; MEM.decks.push(d); return d; }
  if (!db) return null;
  const { data, error } = await db.from('decks').insert({ order_id: orderId, position, title, type: t, status: 'writing', design_urls: [] }).select('*').maybeSingle();
  if (error) { console.error('createDeck', error); return null; }
  return data;
}

export async function deleteDeck(deckId) {
  if (MEM) { MEM.decks = MEM.decks.filter(d => d.id !== deckId); return; }
  if (!db) return;
  await db.from('decks').delete().eq('id', deckId);
}

// How many decks each pack adds (Meteor = 9 + 1 free).
export const PLAN_DECKS = { starter: 3, flame: 6, burst: 10 };

// Add-on: append a pack's decks to an EXISTING order (used when a client buys
// extra one-time packs from the tracker). Decks start in 'writing'.
export async function addDecksToOrder(ref, plan) {
  const n = PLAN_DECKS[plan];
  if (!n) return { error: 'bad_plan' };
  const order = await findOrderByRef(ref);
  if (!order) return { error: 'order_not_found' };
  const existing = await decksForOrder(order.id);
  let created = 0;
  for (let i = 0; i < n; i++) {
    const d = await createDeck(order.id, { title: `New deck ${existing.length + i + 1}`, position: existing.length + i });
    if (d) created++;
  }
  return { ok: true, order, created };
}

/* ---- Add-on item catalogue (carousels, stories, branding) ----
   Tracker upsell: a client can add extra production items to an existing order.
   Prices in cents, enforced on the server. Each item maps to one or more deck
   rows with a `type` (carousel | story | branding) so the tracker can icon them. */
export const ITEMS = {
  deck3:     { name: '3 carousels',          amount: 12000, type: 'carousel', count: 3 },
  deck6:     { name: '6 carousels',          amount: 24000, type: 'carousel', count: 6 },
  deck9:     { name: '9 carousels + 1 free', amount: 35000, type: 'carousel', count: 10 },
  story3:    { name: '3 stories',            amount: 10000, type: 'story',    count: 3 },
  story6:    { name: '6 stories',            amount: 15000, type: 'story',    count: 6 },
  story9:    { name: '9 stories + 1 free',   amount: 19000, type: 'story',    count: 10 },
  brand_full:{ name: 'Branding pack',        amount: 21000, type: 'branding' },
  brand_pfp: { name: 'Profile photo',        amount: 6000,  type: 'branding' },
  brand_x:   { name: 'X / Twitter banner',   amount: 7000,  type: 'branding' },
  brand_li:  { name: 'LinkedIn banner',      amount: 7000,  type: 'branding' },
  brand_fb:  { name: 'Facebook banner',      amount: 7000,  type: 'branding' },
  brand_cta: { name: 'LinkedIn CTA buttons', amount: 5000,  type: 'branding' },
};
// The deck-row titles created for a given item key.
function itemTitles(key) {
  if (key === 'brand_full') return ['Profile photo', 'X / Twitter banner', 'LinkedIn banner', 'Facebook banner', 'LinkedIn CTA buttons'];
  const it = ITEMS[key];
  if (!it) return [];
  if (it.type === 'branding') return [it.name];
  const label = it.type === 'story' ? 'Story' : 'Deck';
  return Array.from({ length: it.count || 1 }, (_, i) => `New ${label} ${i + 1}`);
}
// Append a catalogue item's deck rows to an EXISTING order.
export async function addItemsToOrder(ref, key) {
  const it = ITEMS[key];
  if (!it) return { error: 'bad_item' };
  const order = await findOrderByRef(ref);
  if (!order) return { error: 'order_not_found' };
  const existing = await decksForOrder(order.id);
  const titles = itemTitles(key);
  let created = 0, pos = existing.length;
  for (const title of titles) {
    const d = await createDeck(order.id, { title, position: pos++, type: it.type });
    if (d) created++;
  }
  return { ok: true, order, created, type: it.type, name: it.name };
}

// The full set of production elements an order's offer implies, by type.
// Carousels come from the plan (or an explicit count); upsells add stories/branding.
function expectedElements({ plan, addons, decks }) {
  const brandTitles = ['Profile photo', 'X / Twitter banner', 'LinkedIn banner', 'Facebook banner', 'LinkedIn CTA buttons'];
  const nCarousel = decks != null ? Math.max(0, Math.min(50, Number(decks) || 0)) : (PLAN_DECKS[plan] || 0);
  let nStory = 0, branding = [];
  for (const key of addonKeys(addons)) {
    if (key === 'branding') branding = brandTitles.slice();
    else if (key === 'bundle') { branding = brandTitles.slice(); nStory += 10; }
    else if (key === 'story3') nStory += 3;
    else if (key === 'story6') nStory += 6;
    else if (key === 'story9') nStory += 10;
  }
  return { nCarousel, nStory, branding };
}

// Top up an order's board to the full offer (plan decks + purchased upsells),
// adding only the elements MISSING per type - never removes or touches existing
// ones. Safe to re-run (idempotent once the board is complete).
export async function populateOrderElements(orderId, { plan, addons, decks } = {}) {
  const existing = await decksForOrder(orderId);
  const have = { carousel: 0, story: 0, branding: 0 };
  for (const d of existing) { const t = d.type || 'carousel'; have[t] = (have[t] || 0) + 1; }
  const want = expectedElements({ plan, addons, decks });
  let pos = existing.length, created = 0;
  for (let i = have.carousel; i < want.nCarousel; i++) {
    if (await createDeck(orderId, { title: `Deck ${i + 1}`, position: pos++, type: 'carousel' })) created++;
  }
  for (let i = have.story; i < want.nStory; i++) {
    if (await createDeck(orderId, { title: `Story ${i + 1}`, position: pos++, type: 'story' })) created++;
  }
  for (let i = have.branding; i < want.branding.length; i++) {
    if (await createDeck(orderId, { title: want.branding[i], position: pos++, type: 'branding' })) created++;
  }
  return { created };
}

// Random 8-char public ref for manually-created (non-Stripe) orders.
const randRef = () => crypto.randomBytes(6).toString('hex').slice(0, 8).toUpperCase();

// Owner-created project from the panel: behaves exactly like a real paid order
// (gets a ref, status 'paid', plan amount, and seeded deck rows).
export async function createManualOrder({ name, email, instagram, handle, plan, billing, talent_email, decks, phone, addons, answers }) {
  const bill = billing || 'once';
  const addOns = addonKeys(addons);                                   // validated upsell keys
  const addonsTotal = addOns.reduce((s, k) => s + ADDONS[k].amount, 0);
  const amount = (PLANS[plan] ? amountFor(plan, bill) : 0) + addonsTotal;
  const row = {
    stripe_session_id: 'manual_' + crypto.randomBytes(9).toString('hex'),
    ref: randRef(), status: 'paid', plan: plan || '', billing: bill, amount,
    name: name || '', email: String(email || '').trim().toLowerCase(),
    instagram: instagram || '', handle: handle || '',
    phone: phone || '', addons: addOns,
    answers: (answers && typeof answers === 'object') ? answers : null,
    talent_email: talent_email ? String(talent_email).trim().toLowerCase() : null,
  };
  if (MEM) {
    const o = { id: uid(), created_at: new Date().toISOString(), ...row };
    MEM.orders.push(o);
    await populateOrderElements(o.id, { plan, addons: addOns, decks });
    return { ok: true, order: o, ref: row.ref };
  }
  if (!db) return { error: 'no_store' };
  const { data, error } = await db.from('orders').insert(row).select('*').maybeSingle();
  if (error) return { error: error.message };
  await populateOrderElements(data.id, { plan, addons: addOns, decks });
  return { ok: true, order: data, ref: row.ref };
}

/* ---- Talent accounts + project assignment ---- */
const pubTalent = t => t && ({ email: t.email, name: t.name || '', is_owner: !!t.is_owner, photo: t.photo || '', must_reset: !!t.must_reset });

export async function getTalentByEmail(email) {
  if (!STORE || !email) return null;
  const EM = String(email).trim().toLowerCase();
  if (MEM) return MEM.talents.find(t => t.email.toLowerCase() === EM) || null;
  const { data } = await db.from('talents').select('*').ilike('email', EM).maybeSingle();
  return data || null;
}

export async function loginTalent(email, password) {
  const t = await getTalentByEmail(email);
  if (!t || !verifyPassword(password, t.password_hash)) return null;
  return { token: signToken({ email: t.email, owner: !!t.is_owner, role: t.is_owner ? 'owner' : 'talent' }), talent: pubTalent(t) };
}

export async function createTalent({ email, password, name, is_owner, photo, must_reset }) {
  if (!STORE) return { error: 'no_store' };
  const EM = String(email || '').trim().toLowerCase();
  if (!EM || !password) return { error: 'missing' };
  if (await getTalentByEmail(EM)) return { error: 'exists' };
  const row = { email: EM, name: name || '', is_owner: !!is_owner, photo: photo || '', must_reset: !!must_reset, password_hash: hashPassword(password) };
  if (MEM) { const t = { id: uid(), ...row }; MEM.talents.push(t); return { talent: pubTalent(t) }; }
  const { data, error } = await db.from('talents').insert(row).select('*').maybeSingle();
  if (error) return { error: error.message };
  return { talent: pubTalent(data) };
}

export async function updateTalent({ email, name, password, is_owner, photo }) {
  const t = await getTalentByEmail(email);
  if (!t) return { error: 'not_found' };
  const patch = {};
  if (name != null) patch.name = name;
  if (is_owner != null) patch.is_owner = !!is_owner;
  if (photo != null) patch.photo = photo;
  if (password) { patch.password_hash = hashPassword(password); patch.must_reset = false; }
  if (MEM) { Object.assign(t, patch); return { talent: pubTalent(t) }; }
  const { data, error } = await db.from('talents').update(patch).eq('id', t.id).select('*').maybeSingle();
  if (error) return { error: error.message };
  return { talent: pubTalent(data) };
}

export async function deleteTalent(email) {
  const t = await getTalentByEmail(email);
  if (!t) return { error: 'not_found' };
  const EM = t.email.toLowerCase();
  if (MEM) {
    MEM.orders.forEach(o => { if ((o.talent_email || '').toLowerCase() === EM) o.talent_email = null; });
    MEM.talents = MEM.talents.filter(x => x.id !== t.id);
    return { ok: true };
  }
  await db.from('orders').update({ talent_email: null }).ilike('talent_email', EM);
  await db.from('talents').delete().eq('id', t.id);
  return { ok: true };
}

export async function listTalents() {
  if (MEM) return MEM.talents.map(pubTalent);
  if (!db) return [];
  const { data } = await db.from('talents').select('email,name,is_owner,photo,must_reset').order('created_at', { ascending: true });
  return (data || []).map(pubTalent);
}

// Orders assigned to a Talent (paid only).
export async function ordersForTalent(email) {
  const EM = String(email || '').trim().toLowerCase();
  if (MEM) return MEM.orders.filter(o => o.status === 'paid' && (o.talent_email || '').toLowerCase() === EM);
  if (!db) return [];
  const { data } = await db.from('orders').select('id,ref,stripe_session_id,name,email,plan,status,talent_email,created_at')
    .eq('status', 'paid').ilike('talent_email', EM).order('created_at', { ascending: false }).limit(200);
  return data || [];
}

export async function getOrderById(id) {
  if (!STORE || !id) return null;
  if (MEM) return MEM.orders.find(o => o.id === id) || null;
  const { data } = await db.from('orders').select('*').eq('id', id).maybeSingle();
  return data || null;
}

export async function assignOrder(ref, talentEmail) {
  const order = await findOrderByRef(ref);
  if (!order) return { error: 'not_found' };
  const EM = talentEmail ? String(talentEmail).trim().toLowerCase() : null;
  if (MEM) { order.talent_email = EM; return { ok: true }; }
  await db.from('orders').update({ talent_email: EM }).eq('id', order.id);
  return { ok: true };
}

// Owner: edit a project's client + offer details.
export async function updateOrder(ref, patch = {}) {
  const order = await findOrderByRef(ref);
  if (!order) return { error: 'not_found' };
  const p = {};
  for (const k of ['name', 'email', 'instagram', 'handle', 'phone', 'plan', 'billing', 'addons', 'answers', 'amount']) {
    if (patch[k] !== undefined) p[k] = patch[k] === '' ? null : patch[k];
  }
  if (patch.talent_email !== undefined) p.talent_email = patch.talent_email ? String(patch.talent_email).trim().toLowerCase() : null;
  if (!Object.keys(p).length) return { ok: true, order };
  if (MEM) { Object.assign(order, p); return { ok: true, order }; }
  const { error } = await db.from('orders').update(p).eq('id', order.id);
  if (error) return { error: 'db' };
  return { ok: true };
}

// Owner: make the board match a target offer (plan decks + addons). Adds the
// missing elements per type AND removes the surplus - but only surplus elements
// that have NO work started, so in-progress assets are never destroyed.
export async function syncOrderElements(orderId, { plan, addons, decks } = {}) {
  const want = expectedElements({ plan, addons, decks });
  const targets = { carousel: want.nCarousel, story: want.nStory, branding: want.branding.length };
  const titleFor = { carousel: i => `Deck ${i + 1}`, story: i => `Story ${i + 1}`, branding: i => want.branding[i] || `Branding ${i + 1}` };
  const started = d => !!(d.script || d.design_url || (Array.isArray(d.design_urls) && d.design_urls.length) || (d.status && d.status !== 'writing'));
  let existing = await decksForOrder(orderId);
  for (const type of ['carousel', 'story', 'branding']) {
    const cur = existing.filter(d => (d.type || 'carousel') === type);
    const target = targets[type] || 0;
    if (cur.length < target) {
      let pos = existing.length;
      for (let i = cur.length; i < target; i++) await createDeck(orderId, { title: titleFor[type](i), position: pos++, type });
      existing = await decksForOrder(orderId);
    } else if (cur.length > target) {
      const removable = cur.filter(d => !started(d)).sort((a, b) => (b.position || 0) - (a.position || 0));
      let toRemove = cur.length - target;
      for (const d of removable) { if (toRemove <= 0) break; await deleteDeck(d.id); toRemove--; }
      existing = await decksForOrder(orderId);
    }
  }
  return { ok: true };
}

// Owner: delete a project (its decks + messages cascade on delete).
export async function deleteOrder(ref) {
  const order = await findOrderByRef(ref);
  if (!order) return { error: 'not_found' };
  if (MEM) {
    MEM.orders = MEM.orders.filter(o => o.id !== order.id);
    MEM.decks = MEM.decks.filter(d => d.order_id !== order.id);
    if (MEM.messages) MEM.messages = MEM.messages.filter(m => m.order_id !== order.id);
    return { ok: true };
  }
  await db.from('orders').delete().eq('id', order.id);
  return { ok: true };
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

// Normalize a deck's design images to an array (max 10), tolerating the legacy single field.
export function deckImages(d) {
  let imgs = Array.isArray(d.design_urls) ? d.design_urls : [];
  if (!imgs.length && d.design_url) imgs = [d.design_url];
  return imgs.filter(Boolean).slice(0, 10);
}

// Coarse project state for the Talent dashboard: todo | progress | done.
export function orderState(decks) {
  if (!decks.length) return 'todo';
  if (decks.every(d => d.status === 'done')) return 'done';
  if (decks.every(d => d.status === 'writing')) return 'todo';
  return 'progress';
}

// Shape an order + its decks for the customer-facing tracker (no internal ids leaked beyond deck ids).
export function publicOrder(order, decks) {
  return {
    ref: order.ref || orderRef(order.stripe_session_id),
    name: order.name || '',
    handle: order.handle || '',
    instagram: order.instagram || '',
    plan: order.plan || '',
    billing: order.billing || '',
    status: order.status,
    answers: (order.answers && typeof order.answers === 'object') ? order.answers : null,
    progress: orderProgress(decks),
    decks: decks.map(d => ({
      id: d.id,
      title: d.title || 'Untitled deck',
      type: d.type || 'carousel',
      status: d.status,
      script: d.script || '',
      images: deckImages(d),
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
  starter: { name: 'Ember',  amount: 12000 },
  flame:   { name: 'Flame',  amount: 24000 },
  burst:   { name: 'Meteor', amount: 35000 },
};
// Real Stripe Price IDs per plan + billing, read from env.
//   STRIPE_PRICE_EMBER_ONCE / _SUB, _FLAME_ , _METEOR_ ...
export function stripePriceId(plan, billing) {
  const KEY = { starter: 'EMBER', flame: 'FLAME', burst: 'METEOR' }[plan];
  if (!KEY) return null;
  const suffix = billing === 'sub' ? 'SUB' : 'ONCE';
  return process.env[`STRIPE_PRICE_${KEY}_${suffix}`] || null;
}

export function amountFor(plan, billing) {
  const base = PLANS[plan].amount / 100;
  const dollars = billing === 'sub' ? Math.round(base * 0.9) : base;
  return dollars * 100;
}

// One-time upsell add-ons. Cents. Prices live on the server (never trust the client).
export const ADDONS = {
  branding: { name: 'Social media branding',  amount: 21000 },
  story3:   { name: 'Story pack - 3 stories', amount: 10000 },
  story6:   { name: 'Story pack - 6 stories', amount: 15000 },
  story9:   { name: 'Story pack - 9 + 1 stories', amount: 19000 },
  bundle:   { name: 'Mega Bundle - branding + 9 stories + 1 free', amount: 35900 },
};
// Build Stripe line items for the selected add-ons (one-time price_data, mixes
// fine with a recurring plan - Stripe invoices them once on the first invoice).
export function addonLineItems(addons) {
  const keys = Array.isArray(addons) ? addons.filter(a => ADDONS[a]) : [];
  return keys.map(a => ({
    quantity: 1,
    price_data: { currency: 'usd', unit_amount: ADDONS[a].amount, product_data: { name: `Brasero - ${ADDONS[a].name}` } },
  }));
}
export function addonKeys(addons) {
  return Array.isArray(addons) ? addons.filter(a => ADDONS[a]) : [];
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

const LOGO_URL = 'https://www.braserodecks.com/assets/email-logo.png';

// Shared branded shell: clean white card, logo header (no orange box) + dark footer.
export function emailShell(inner) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#111111">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:30px 12px"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(0,0,0,.07)">
      <tr><td style="padding:26px 30px 18px;border-bottom:1px solid #f0ece4">
        <img src="${LOGO_URL}" alt="Brasero" height="28" style="display:block;border:0;height:28px;width:auto">
      </td></tr>
      ${inner}
    </table>
  </td></tr></table></body></html>`;
}

function ctaButton(url, label) {
  return `<a href="${url}" style="display:inline-block;background:linear-gradient(100deg,#ff1a00,#f87000);color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:100px">${label}</a>`;
}

/* ---- structured email building blocks ---- */
function emailHero(eyebrow, title) {
  return `<tr><td style="padding:30px 30px 0">
    ${eyebrow ? `<p style="margin:0 0 7px;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#f87000">${eyebrow}</p>` : ''}
    <h1 style="margin:0;font-size:25px;letter-spacing:-.6px;line-height:1.15;color:#111111">${title}</h1>
  </td></tr>`;
}
function emailText(html) {
  return `<tr><td style="padding:16px 30px 0;font-size:15px;color:#333333;line-height:1.6">${html}</td></tr>`;
}
function noteBox(label, body) {
  return `<tr><td style="padding:14px 30px 0">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff4ef;border-radius:10px"><tr>
      <td width="4" style="background:#f87000"></td>
      <td style="padding:12px 14px;font-size:14px;color:#444444;line-height:1.5"><b style="color:#c64600">${label}</b><br>${body}</td>
    </tr></table>
  </td></tr>`;
}
function nextSteps(items) {
  const rows = items.map(s => `<tr>
    <td width="22" valign="top"><div style="width:7px;height:7px;border-radius:50%;background:#f87000;margin:7px 0 0"></div></td>
    <td style="font-size:14px;color:#3a3a3a;line-height:1.55;padding:0 0 9px 2px">${s}</td></tr>`).join('');
  return `<tr><td style="padding:18px 30px 2px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ef;border-radius:12px"><tr><td style="padding:15px 18px">
      <p style="margin:0 0 11px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#9a8f80">Next steps</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </td></tr></table>
  </td></tr>`;
}
function emailCta(url, label) {
  return `<tr><td style="padding:20px 30px 30px">${ctaButton(url, label)}</td></tr>`;
}

// "You have something to validate" email - script ready or design ready.
export function reviewEmail({ name, kind, deckTitle, ref, url }) {
  const first = name ? name.split(' ')[0] : '';
  const isScript = kind === 'script';
  const heading = isScript ? `Your script is ready to review` : `Your design is ready to review`;
  const blurb = isScript
    ? `We've written the script for <b>${deckTitle || 'your next deck'}</b>. Take a look, you can tweak the copy and approve it so we move it into design.`
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
export function clientOrderEmail({ name, planName, billing, amountCents, handle, ref, trackUrl }) {
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
        <p style="margin:0;color:#6b6b6b;font-size:15px;line-height:1.5">Thanks for your order, payment received. Here's your recap.</p>
      </td></tr>
      <tr><td style="padding:18px 28px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eeeeee;border-radius:12px">
          <tr><td style="${cell};color:#6b6b6b">Pack</td><td align="right" style="${cell};font-weight:700">${planName || '-'}</td></tr>
          <tr><td style="${cell};color:#6b6b6b;${top}">Billing</td><td align="right" style="${cell};font-weight:700;${top}">${billing === 'sub' ? 'Subscription · monthly' : 'One-time'}</td></tr>
          ${handle ? `<tr><td style="${cell};color:#6b6b6b;${top}">Account</td><td align="right" style="${cell};font-weight:700;${top}">${handle}</td></tr>` : ''}
          ${ref ? `<tr><td style="${cell};color:#6b6b6b;${top}">Order ref</td><td align="right" style="${cell};font-weight:700;${top}">#${ref}</td></tr>` : ''}
          <tr><td style="padding:14px 16px;font-weight:700;border-top:1px solid #eeeeee">Total paid</td><td align="right" style="padding:14px 16px;font-weight:900;font-size:20px;border-top:1px solid #eeeeee">${amount}${billing === 'sub' ? ' /mo' : ''}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:6px 28px 22px">
        <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#f87000;margin:14px 0 10px">What happens next</h3>
        <p style="margin:0 0 8px;font-size:14px;color:#333333">1 · We review your brief &amp; Instagram and map your hooks.</p>
        <p style="margin:0 0 8px;font-size:14px;color:#333333">2 · We write &amp; design your first decks in your brand style.</p>
        <p style="margin:0;font-size:14px;color:#333333">3 · You receive your post-ready decks by email.</p>
      </td></tr>
      ${trackUrl ? `<tr><td align="center" style="padding:6px 28px 28px">${ctaButton(trackUrl, 'Track your order →')}<p style="margin:12px 0 0;font-size:12px;color:#9a9a9a">Follow production, approve scripts &amp; designs anytime.</p></td></tr>` : ''}
    </table>
  </td></tr></table></body></html>`;
}

// Confirmation when a client adds extra decks to an existing order.
export function addonClientEmail({ name, planName, count, ref, trackUrl }) {
  const first = name ? name.split(' ')[0] : '';
  const c = count || '';
  return emailShell(`
    <tr><td style="padding:30px 28px 6px">
      <h1 style="margin:0 0 8px;font-size:26px;letter-spacing:-1px">More decks incoming${first ? ', ' + first : ''} 🔥</h1>
      <p style="margin:0;color:#6b6b6b;font-size:15px;line-height:1.5">Payment received. We've added ${c} new ${planName || ''} deck${count === 1 ? '' : 's'} to your order.</p>
    </td></tr>
    <tr><td style="padding:14px 28px 6px">
      <p style="margin:0 0 16px;font-size:14px;color:#333333;line-height:1.55">They're now in production and will appear in your tracker. We'll email you at each step to review.</p>
      ${trackUrl ? ctaButton(trackUrl, 'Open your tracker →') : ''}
    </td></tr>
    <tr><td style="padding:14px 28px 26px;color:#9a9a9a;font-size:12px">Order #${ref || ''}</td></tr>`);
}

// Passwordless sign-in link to the client's space (expires in 15 min).
export function magicLinkEmail({ name, url }) {
  return emailShell(
    emailHero('Sign in', 'Your sign-in link 🔥') +
    emailText(`${greet(name)}<p style="margin:0">Tap the button below to open your space and follow all your orders in one place. This link expires in 15 minutes.</p>`) +
    emailCta(url || '#', 'Open my space →') +
    emailText(`<p style="margin:0;font-size:12px;color:#9a9a9a">If you didn't request this, you can safely ignore this email.</p>`)
  );
}

/* ===================== Talent emails ===================== */
export const randomPassword = () => crypto.randomBytes(18).toString('hex');
// Short, shareable temporary password for a freshly-created talent account.
export const tempPassword = () => crypto.randomBytes(5).toString('hex');
const greet = name => `<p style="margin:0 0 8px">Hi${name ? ' ' + name.split(' ')[0] : ''},</p>`;

// Invite a new talent to set up their account (password + name + photo).
export function talentInviteEmail({ name, setupUrl }) {
  return emailShell(
    emailHero('Talent invite', 'Join your studio space 🎨') +
    emailText(`${greet(name)}<p style="margin:0">You've been invited to Brasero Studio to work on client carousels, stories &amp; branding.</p>`) +
    nextSteps(['Create your password', 'Add your name &amp; a profile photo', 'See every project assigned to you']) +
    emailCta(setupUrl || '#', 'Set up my account →')
  );
}

// New project assigned to a talent.
export function talentAssignedEmail({ name, ref, clientName, planName, panelUrl }) {
  return emailShell(
    emailHero('New project', `New project · #${ref || ''}`) +
    emailText(`${greet(name)}<p style="margin:0">A new project${clientName ? ` from <b>${clientName}</b>` : ''}${planName ? ` (${planName} pack)` : ''} has been assigned to you.</p>`) +
    nextSteps(['Open the panel to see the elements', 'Write the first scripts', 'Send them to the client for approval']) +
    emailCta(panelUrl || '#', 'Open the panel →')
  );
}

// Client action on a deck: approved script / approved design / requested a retouch.
export function talentClientActionEmail({ name, ref, deckTitle, kind, note, panelUrl }) {
  const t = deckTitle || 'an element';
  const map = {
    approved_script: { eyebrow: 'Client approved', title: `Script approved · #${ref || ''}`,
      intro: `Your client approved the script for <b>${t}</b>, time to design it.`,
      steps: ['Open the element in the panel', 'Create &amp; upload the slides', 'Send the design for approval'] },
    approved_design: { eyebrow: 'Client approved', title: `Design approved · #${ref || ''}`,
      intro: `Your client approved the design for <b>${t}</b>, it's done and live. 🎉`,
      steps: ['Nothing to do on this element', 'Move on to the next one in the order'] },
    revision: { eyebrow: 'Retouch requested', title: `Retouch requested · #${ref || ''}`,
      intro: `Your client asked for a change on <b>${t}</b>.`,
      steps: ['Read the client note above', 'Update the design', 'Resend it for approval'] },
  };
  const c = map[kind] || map.approved_script;
  return emailShell(
    emailHero(c.eyebrow, c.title) +
    emailText(`${greet(name)}<p style="margin:0">${c.intro}</p>`) +
    (kind === 'revision' && note ? noteBox('Client note', String(note)) : '') +
    nextSteps(c.steps) +
    emailCta(panelUrl || '#', 'Open the panel →')
  );
}

// Whole project completed (all elements approved).
export function talentProjectDoneEmail({ name, ref, clientName, panelUrl }) {
  return emailShell(
    emailHero('Completed', `Project completed · #${ref || ''} 🎉`) +
    emailText(`${greet(name)}<p style="margin:0">Every element${clientName ? ` of <b>${clientName}</b>'s order` : ''} is approved &amp; delivered. Great work!</p>`) +
    nextSteps(['The full project is now live in the client\'s space', 'Check the panel for any new assignments']) +
    emailCta(panelUrl || '#', 'View the project →')
  );
}

// New chat message between the client and the studio.
export function messageNotifyEmail({ name, ref, fromName, body, about, ctaUrl, ctaLabel }) {
  const esc = s => String(s || '').replace(/</g, '&lt;');
  return emailShell(
    emailHero('New message', `New message · #${ref || ''}`) +
    emailText(`${greet(name)}<p style="margin:0"><b>${esc(fromName) || 'Someone'}</b> sent you a message${about ? ` about <b>${esc(about)}</b>` : ''}:</p>`) +
    noteBox('Message', esc(body)) +
    emailCta(ctaUrl || '#', ctaLabel || 'Open the conversation →')
  );
}

export function siteUrl(req) {
  return (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
}

// Passwordless deep link into a client's space for transactional emails
// (order confirmed, add-on, new message, deck-to-review). Signs a magic token
// so the client lands authenticated; an optional ref deep-links to that order.
// Replaces the legacy track.html?ref&email links (retired in Phase 5).
export function clientMagicLink(base, email, ref, days = 30) {
  const token = signToken({ email: String(email || '').toLowerCase(), magic: true }, days);
  return `${base}/app.html?magic=${encodeURIComponent(token)}${ref ? `&order=${encodeURIComponent(ref)}` : ''}`;
}
