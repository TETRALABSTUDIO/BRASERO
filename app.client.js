/* ============================================================================
   app.client.js - client space (light bundle), lazy-loaded for role 'client'.
   Phase 3: magic-link "my orders" list (aggregated by client account) + the
   per-order board (read scripts/designs, approve, request retouch, download,
   chat with the studio, add to the order). Reuses the brasero.css board/chat
   design system; talks to /api/order + /api/deck with the client session token
   (api() attaches the Authorization header), so no ref+email is needed.
   ========================================================================== */
import { api, post, clearToken, esc, initials, igUser, compress, fmtMsgTime, parseSlides, sanitizeSlide, slidesViewHTML, slideMeta } from './app.core.js';

/* ---- module state ---- */
let R = null;            // mount root (<main id="app">), stable across view swaps
let ME = {};             // { email, name } from the session
let REF = '';            // ref of the order currently open in the board
let ORDER = null, DECKS = [], MESSAGES = [], TALENT = null;
let SELECTED = null, scriptView = null, CAT = null;
let chatAsset = '', chatImgs = [], addCat = null;
let MSGPOLL = null, lbUrl = '', lbName = '';
let docBound = false;    // document/root delegated listeners attached once

const q = (s) => R.querySelector(s);
const qa = (s) => [...R.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => (s || 'deck').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';

const PLAN_NAMES = { starter: 'Ember', flame: 'Flame', burst: 'Meteor' };
const PLAN_LOGO = { starter: 'ember', flame: 'flame', burst: 'meteor' };
const DECK_PCT = { writing: 12, script_review: 34, designing: 58, design_review: 80, revision: 72, done: 100 };
const TAG = {
  writing: ['pill--wait', 'Writing script'],
  script_review: ['pill--act', 'Validate script'],
  designing: ['pill--wait', 'In design'],
  design_review: ['pill--act', 'Validate design'],
  revision: ['pill--wait', 'Retouch in progress'],
  done: ['pill--done', 'Approved ✓'],
};
const TYPE_ICON = {
  carousel: `<svg class="ti" viewBox="0 0 140 94" fill="none"><use href="#ic-decks"/></svg>`,
  story: `<svg class="ti" viewBox="0 0 134 122" fill="none"><use href="#ic-story"/></svg>`,
  branding: `<svg class="ti" viewBox="0 0 120 120" fill="none"><use href="#ic-brand"/></svg>`,
};
const LOGO = '<svg class="logo-svg" viewBox="0 0 798 189" fill="none"><use href="#brasero-mark"/></svg>';
const DL_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h13"/></svg>';
const DECK_CATS = [{ key: 'carousel', label: 'Decks' }, { key: 'story', label: 'Stories' }, { key: 'branding', label: 'Branding' }];

// states where the CLIENT must act → instruction line under the deck name
const NEXT = {
  script_review: ['📝', 'Review &amp; edit the script', 'tweak any slide directly below, then approve it to start the design.'],
  design_review: ['👀', 'Validate design', 'review your design below, then approve it or request a retouch.'],
  done: ['🎉', 'All done', 'your carousel is ready, download it from the bar below.'],
};
// states where it's NOT the client's turn → centered "news soon" message
const WAIT = {
  writing: ['✍️', 'Writing your script', "We're crafting the script for this deck. You'll get an email the moment it's ready for your review."],
  designing: ['🎨', 'In design', "Your carousel is in production. We'll notify you the moment it's ready to review."],
  revision: ['✏️', 'Applying your retouch', "We're updating the design and will resend it for approval shortly."],
};

// orderable extras (keys map to the server-side ITEMS catalogue / Stripe price)
const ADD_GROUPS = [
  { key: 'decks', title: 'Carousels', sub: 'Swipeable carousel decks', items: [
    { key: 'deck3', cards: 3, label: '3 Decks', price: '$120' },
    { key: 'deck6', cards: 6, label: '6 Decks', price: '$240' },
    { key: 'deck9', cards: 9, label: '9 Decks', price: '$350', free: true },
  ] },
  { key: 'stories', title: 'Stories', sub: 'Vertical 9:16 story sets', items: [
    { key: 'story3', cards: 3, label: '3 Stories', price: '$100', story: true },
    { key: 'story6', cards: 6, label: '6 Stories', price: '$150', story: true },
    { key: 'story9', cards: 9, label: '9 Stories', price: '$190', free: true, story: true },
  ] },
  { key: 'branding', title: 'Branding', sub: 'Profile photo, banners & CTAs', items: [
    { key: 'brand_full', label: 'Full branding pack', price: '$210', brand: true, pack: true,
      includes: ['Profile photo', 'X / Twitter banner', 'LinkedIn banner', 'Facebook banner', 'LinkedIn CTA buttons'] },
  ] },
];
const GROUP_ICON = { decks: TYPE_ICON.carousel, stories: TYPE_ICON.story, branding: TYPE_ICON.branding };

/* white deck fan that spreads up from a shared bottom pivot */
function fanHTML(n) {
  const step = Math.min(13, 70 / Math.max(1, n - 1)), mid = (n - 1) / 2;
  let h = '';
  for (let i = 0; i < n; i++) h += `<i style="transform:translateX(-50%) rotate(${((i - mid) * step).toFixed(1)}deg)"></i>`;
  return h;
}

/* ---- slide-based script ---- parseSlides / sanitizeSlide / slidesViewHTML
   are shared (app.core.js); the editable variant stays client-local. */
function slidesEditHTML(script) {
  const slides = parseSlides(script);
  return `<div class="slides" data-edit-slides>${slides.map((h, i) => { const c = sanitizeSlide(h), m = slideMeta(i, slides.length);
    return `<div class="slide ${m.cls}"><div class="slide__bar"><span class="slide__n">${m.label}</span></div><div class="slide__edit" contenteditable="true" data-slide-body>${c}</div></div>`; }).join('')}</div>`;
}
/* Deck images are fetched on demand (the board list ships only image_count) and
   cached by id, so opening a project no longer downloads every deck's design. */
const IMG_CACHE = {};
function imagesOf(d) { const c = IMG_CACHE[d.id]; return (c && c.loaded) ? c.images : []; }
function imgCount(d) { const c = IMG_CACHE[d.id]; return (c && c.loaded) ? c.images.length : (d.image_count || 0); }
function imagesLoaded(d) { return (d.image_count || 0) === 0 || !!(IMG_CACHE[d.id] && IMG_CACHE[d.id].loaded); }
async function loadDeckImages(d) {
  if (IMG_CACHE[d.id] && IMG_CACHE[d.id].loaded) return;
  try { const r = await api('/api/order', { ref: REF, action: 'deck_images', deckId: d.id });
    if (r && r.ok) IMG_CACHE[d.id] = { images: Array.isArray(r.images) ? r.images : [], loaded: true }; }
  catch (e) {}
}
function gatherEditedScript() {
  const bodies = qa('[data-edit-slides] [data-slide-body]');
  if (!bodies.length) return undefined;
  return JSON.stringify(bodies.map((x) => sanitizeSlide(x.innerHTML)));
}

/* ============================================================================
   MOUNT
   ========================================================================== */
export async function mount(root, ctx) {
  R = root;
  ME = ctx.session || {};
  document.body.classList.remove('appmode');
  bindGlobalOnce();
  // Deep link from a transactional email / add-on checkout return (?order=REF):
  // open that order directly (openOrder falls back to the list if it's invalid).
  const deepRef = new URLSearchParams(location.search).get('order');
  if (deepRef) {
    history.replaceState(null, '', 'app.html');
    await openOrder(deepRef);
  } else {
    await renderHome();
  }
}

/* ---- document/root delegated listeners (lightbox, asset menu) attached once ---- */
function bindGlobalOnce() {
  if (docBound) return;
  docBound = true;
  // lightbox open: gallery image or chat attachment
  R.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('.gal img');
    if (img) { lbUrl = img.dataset.full; lbName = img.dataset.name || 'deck-slide'; openLb(); return; }
    const ci = e.target.closest && e.target.closest('.msg__img');
    if (ci && ci.dataset.full) { lbUrl = ci.dataset.full; lbName = 'chat-image'; openLb(); }
  });
  // close the asset picker when clicking outside it
  document.addEventListener('click', (e) => { if (!e.target.closest('#assetPick')) q('#assetMenu')?.classList.add('hide'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') q('#lb')?.classList.remove('open'); });
}

/* ============================================================================
   HOME - the client's aggregated list of orders
   ========================================================================== */
async function renderHome() {
  stopMsgPoll();
  document.body.classList.remove('appmode');
  REF = ''; ORDER = null; DECKS = []; MESSAGES = []; TALENT = null; SELECTED = null; scriptView = null; CAT = null;
  const hi = ME.email ? ', ' + esc(ME.email.split('@')[0]) : '';
  R.innerHTML = `
    <div class="home">
      <div class="home__head">
        <div>
          <div class="home__hi">Welcome back${hi}</div>
          <div class="home__sub">Your projects, all in one place.</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="signOut">Sign out</button>
      </div>
      <div class="empty" id="ordersHost">Loading your projects…</div>
    </div>`;
  q('#signOut').addEventListener('click', () => { clearToken(); location.href = 'app.html'; });

  let d;
  try { d = await api('/api/order', { action: 'my_orders' }); }
  catch { q('#ordersHost').textContent = 'Something went wrong loading your projects. Please refresh.'; return; }

  const host = q('#ordersHost');
  if (d && d.ok && Array.isArray(d.orders) && d.orders.length) {
    host.className = 'orders';
    host.innerHTML = d.orders.map(ocardHTML).join('');
    qa('.ocard').forEach((b) => b.addEventListener('click', () => openOrder(b.dataset.ref)));
  } else {
    host.className = 'empty';
    host.innerHTML = `No projects yet. <a class="grad-text" href="index.html#packages" style="font-weight:800">Place your first order →</a>`;
  }
}

function ocardHTML(o) {
  const title = o.plan ? `${PLAN_NAMES[o.plan] || o.plan} pack` : 'Project';
  const pct = o.percent || 0;
  const cls = pct >= 100 ? 'pill--done' : pct > 12 ? 'pill--act' : 'pill--wait';
  const counts = o.total ? `${o.done}/${o.total} element${o.total > 1 ? 's' : ''} done` : 'Production starting soon';
  return `<button type="button" class="ocard" data-ref="${esc(o.ref)}">
    <div class="ocard__top"><span class="ocard__ref">#${esc(o.ref)}</span><span class="pill ${cls}">${esc(o.phase || 'In progress')}</span></div>
    <div class="ocard__title">${title}</div>
    <div class="ocard__sub">${counts}</div>
    <div class="ocard__prog"><div class="miniprog"><i style="width:${pct}%"></i></div></div>
  </button>`;
}

/* ============================================================================
   BOARD - a single order (sidebar · deliverables · studio chat)
   ========================================================================== */
async function openOrder(ref) {
  REF = ref;
  R.innerHTML = `<div class="authwrap" style="text-align:center">${LOGO}<p>Loading your project…</p></div>`;
  let d;
  try { d = await api('/api/order', { ref }); }
  catch { renderHome(); return; }
  if (!d || !d.ok) { renderHome(); return; }
  MESSAGES = d.messages || []; TALENT = d.talent || null;
  R.innerHTML = boardHTML();
  bindBoard();
  render(d.order);
  renderExpert();
  renderMessages(); setUnread(false); startMsgPoll();
}

function boardHTML() {
  return `
  <div class="board" id="board">
    <aside class="board__list">
      <div class="side__brand">
        <a href="#" id="brandHome" aria-label="All projects">${LOGO}</a>
        <button type="button" class="btn btn--ghost btn--sm" id="toProjects">← Projects</button>
      </div>
      <div class="side__order">
        <div class="profile">
          <div class="profile__av" id="oAvatar"></div>
          <div class="profile__name" id="oName"></div>
          <div class="profile__ig" id="oIg"></div>
          <div class="side__badges">
            <span class="obadge"><b id="oref">#</b></span>
            <span class="obadge obadge--plan hide" id="oplan"></span>
          </div>
        </div>
      </div>
      <div id="deckList"></div>
      <div class="side__foot">
        <button type="button" class="btn btn--grad btn--sm addbtn" id="addDecks" style="width:100%">+ Add to this order</button>
      </div>
    </aside>
    <div class="board__right">
      <div class="dtabs hide" id="deckTabs"></div>
      <div id="flash" class="flash hide"></div>
      <div class="board__detail" id="deckDetail"></div>
      <div class="cmdbar" id="deckCmd"></div>
    </div>
    <div class="chat__scrim" id="chatScrim"></div>
    <aside class="board__chat" id="boardChat">
      <div class="chat__panel">
        <div class="chat__head">
          <div class="expert" id="chatExpert"></div>
          <button type="button" class="chat__collapse" id="chatToggle" title="Close messages" aria-label="Close messages">✕</button>
        </div>
        <div class="chat__thread" id="chatThread"></div>
        <form class="chat__composer" id="chatForm">
          <textarea id="chatInput" class="chat__input" placeholder="Write a message…" rows="2" maxlength="4000"></textarea>
          <div class="chat__atts hide" id="chatAtts"></div>
          <div class="chat__send-row">
            <div class="assetpick" id="assetPick">
              <button type="button" class="assetpick__btn" id="assetBtn" title="What is this about?"><span class="assetpick__cur" id="assetCur">General</span><svg class="assetpick__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
              <div class="assetpick__menu hide" id="assetMenu"></div>
            </div>
            <label class="chat__clip" id="chatClip" title="Attach images for the design"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.6 1.6 0 0 1-2.3-2.3l7.8-7.8"/></svg><input type="file" id="chatFiles" accept="image/*" multiple hidden></label>
            <button class="btn btn--grad btn--sm" id="chatSend" type="submit">Send</button>
          </div>
        </form>
      </div>
    </aside>
    <button class="msgfab" id="msgFab" type="button" title="Messages" aria-label="Messages"><span class="msgfab__dot hide" id="chatDotFab"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.1 7.6L3 21l1.9-5.9A8.4 8.4 0 1 1 21 11.5z"/></svg></button>
  </div>
  <div class="lb" id="lb"><img id="lbImg" alt=""><button type="button" class="btn btn--grad btn--sm lb__dl" id="lbDl">⬇ Download</button></div>
  <div class="modal" id="addModal">
    <div class="modal__card">
      <button type="button" class="modal__x" id="addClose" aria-label="Close">✕</button>
      <h3>Add to your order</h3>
      <p class="modal__sub">Pay once, the new items are added straight to order <b id="addRef">#</b> and appear in this project.</p>
      <div class="addpacks" id="addPacks"></div>
      <p class="modal__err" id="addErr"></p>
    </div>
  </div>`;
}

/* ---- render the order into the board ---- */
function render(o) {
  document.body.classList.add('appmode');
  ORDER = o;
  renderProfile(o);
  q('#oref').textContent = '#' + o.ref;
  const op = q('#oplan');
  if (o.plan && PLAN_LOGO[o.plan]) { op.innerHTML = `<img class="plan-logo" src="assets/plans/${PLAN_LOGO[o.plan]}.svg" alt="${esc(PLAN_NAMES[o.plan] || o.plan)} pack">`; op.classList.remove('hide'); }
  else if (o.plan) { op.textContent = (PLAN_NAMES[o.plan] || o.plan) + ' pack'; op.classList.remove('hide'); }
  else op.classList.add('hide');

  DECKS = o.decks || [];
  if (!DECKS.length) {
    q('#deckList').innerHTML = '';
    q('#deckDetail').innerHTML = `<div class="empty">Your decks will appear here as soon as we start production. We'll email you at every step. 🔥</div>`;
    q('#deckCmd').innerHTML = ''; q('#deckTabs').innerHTML = ''; q('#deckTabs').classList.add('hide');
    return;
  }
  // keep the current selection valid after a refresh
  if (!DECKS.some((d) => String(d.id) === String(SELECTED))) { SELECTED = null; scriptView = null; }
  renderSidebar();
  renderDetail();
}

function renderProfile(o) {
  const nm = o.name || 'Client', user = igUser(o.instagram || o.handle);
  q('#oAvatar').innerHTML = `<span class="profile__ph">${esc(initials(nm))}</span>`;
  q('#oName').textContent = nm;
  const ig = q('#oIg');
  if (user) { ig.textContent = '@' + user; ig.style.display = ''; } else { ig.textContent = ''; ig.style.display = 'none'; }
}

/* ---- sidebar: categories → element list ---- */
function decksOfCat(k) { return DECKS.filter((d) => (d.type || 'carousel') === k); }
function renderSidebar() { if (CAT) renderCatList(CAT); else renderCategories(); }
function renderCategories() {
  q('#deckList').innerHTML = DECK_CATS.map((c) => {
    const items = decksOfCat(c.key), n = items.length, ic = TYPE_ICON[c.key] || TYPE_ICON.carousel;
    if (n) {
      const done = items.filter((d) => d.status === 'done').length;
      return `<button type="button" class="catrow" data-cat="${c.key}">
        <span class="catrow__ic">${ic}</span>
        <span class="catrow__l"><span class="catrow__n">${c.label}</span><span class="catrow__s">${n} element${n > 1 ? 's' : ''} · ${done}/${n} done</span></span>
        <svg class="catrow__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>`;
    }
    return `<div class="catrow catrow--off">
      <span class="catrow__ic">${ic}</span>
      <span class="catrow__l"><span class="catrow__n">${c.label}</span><span class="catrow__s">Not in your order</span></span>
      <span class="catrow__add" data-addcat="${c.key}" title="Add to your order">+</span></div>`;
  }).join('');
}
function deckItemHTML(d) {
  const [pc, pl] = TAG[d.status] || TAG.writing;
  const sel = String(d.id) === String(SELECTED) ? 'sel' : '';
  const ic = TYPE_ICON[d.type] || TYPE_ICON.carousel;
  return `<button type="button" class="deckitem ${sel}" data-deck="${esc(d.id)}">
    <div class="deckitem__top"><span class="deckitem__title">${ic}<span>${esc(d.title)}</span></span></div>
    <div class="miniprog"><i style="width:${DECK_PCT[d.status] || 10}%"></i></div>
    <span class="pill ${pc} deckitem__pill">${pl}</span>
  </button>`;
}
function renderCatList(cat) {
  const c = DECK_CATS.find((x) => x.key === cat), items = decksOfCat(cat);
  q('#deckList').innerHTML = `<button type="button" class="catback" data-catback><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg> ${c ? c.label : 'Categories'}</button>`
    + items.map(deckItemHTML).join('');
}

/* ---- detail (middle column) ---- */
function hasApprovedScript(d) { return !!(d.script && ['designing', 'design_review', 'revision', 'done'].includes(d.status)); }
function detailTabs(d) {
  const onScript = scriptView === d.id;
  return `<div class="dtabs">
    <button type="button" class="dtab ${onScript ? '' : 'on'}" data-act="show_main" data-id="${d.id}">${TYPE_ICON[d.type || 'carousel'] || TYPE_ICON.carousel}<span class="dtab__l">${esc(d.title)}</span></button>
    <button type="button" class="dtab ${onScript ? 'on' : ''}" data-act="show_script" data-id="${d.id}"><span class="dtab__doc">📄</span><span class="dtab__l">Script</span></button>
  </div>`;
}
function detailBody(d) {
  if (hasApprovedScript(d) && scriptView === d.id) {
    return `<div class="ro-banner">📄 <b>Approved script</b>, read-only now that it's in design.</div>` + slidesViewHTML(d.script);
  }
  const head = hasApprovedScript(d) ? '' : `<div class="detail__head"><div class="detail__title">${esc(d.title)}</div></div>`;
  const n = NEXT[d.status];
  if (n) {
    const instr = `<p class="detail__instr">${n[0]} <b>${n[1]}</b>, ${n[2]}</p>`;
    let content = '';
    if (d.status === 'script_review') content = slidesEditHTML(d.script);
    else if (d.status === 'design_review') content = `${galleryGrid(d)}
        <div class="revbox" id="rev-${d.id}">
          <textarea class="script" placeholder="What would you like us to change?" data-rev="${d.id}" style="min-height:90px"></textarea>
          <div class="actions"><button class="btn btn--grad btn--sm" data-act="request_revision" data-id="${d.id}">Send retouch →</button></div>
        </div>`;
    else if (d.status === 'done') content = imgCount(d) ? galleryGrid(d) : '';
    return head + instr + content;
  }
  const w = WAIT[d.status] || ['', 'In progress', "We're working on it, you'll get news very soon."];
  return head + `<div class="waiting">
    ${PAN_SVG}
    <div class="waiting__h">${w[1]}</div>
    <p class="waiting__p">${w[2]}</p>
    ${d.status === 'revision' && d.revision_note ? `<p class="note-line"><b>Your retouch:</b> ${esc(d.revision_note)}</p>` : ''}
  </div>`;
}
function galleryGrid(d) {
  if (!imgCount(d)) return '';
  const gc = 'gal gal--' + (d.type || 'carousel');
  if (!imagesLoaded(d)) return `<div class="${gc}">${Array.from({ length: Math.min(imgCount(d), 10) }, () => '<figure class="gal__skel"></figure>').join('')}</div>`;
  const name = slug(d.title);
  return `<div class="${gc}">${imagesOf(d).map((u, i) => `<figure><img src="${esc(u)}" alt="" loading="lazy" data-full="${esc(u)}" data-name="${esc(name)}-${String(i + 1).padStart(2, '0')}"></figure>`).join('')}</div>`;
}
function cmdBar(d) {
  const [pc, pl] = TAG[d.status] || TAG.writing;
  const n = imgCount(d);
  let actions = '';
  if (d.status === 'script_review')
    actions = `<button class="btn btn--grad btn--sm" data-act="validate_script" data-id="${d.id}">Approve script ✓</button>`;
  else if (d.status === 'design_review')
    actions = `<button class="btn btn--grad btn--sm" data-act="validate_design" data-id="${d.id}">Approve ✓</button>
      <button class="btn btn--ghost btn--sm" data-act="toggle_rev" data-id="${d.id}">Request a retouch</button>`;
  else if (d.status === 'done' && n)
    actions = `<button class="btn btn--grad btn--sm" data-act="download_deck" data-id="${d.id}">${DL_ICON} Download carousel (${n})</button>`;
  const right = actions ? `<div class="actions">${actions}</div>` : `<span class="cmdbar__hint">No action needed, we'll keep you posted.</span>`;
  return `<div class="cmdbar__row">
      <div class="cmdbar__meta">${n ? `<span class="foot-count">${n} slide${n > 1 ? 's' : ''}</span>` : ''}<span class="pill ${pc}">${pl}</span></div>
      ${right}
    </div>
    <div class="cmdprog"><i style="width:${DECK_PCT[d.status] || 10}%"></i></div>`;
}
function renderDetail() {
  const d = DECKS.find((x) => String(x.id) === String(SELECTED));
  const det = q('#deckDetail'), cmd = q('#deckCmd'), tabsEl = q('#deckTabs');
  if (!d) { det.innerHTML = `<div class="empty">${CAT ? 'Select an element on the left.' : 'Pick a category on the left to see its elements.'}</div>`; cmd.innerHTML = ''; tabsEl.innerHTML = ''; tabsEl.classList.add('hide'); return; }
  if (hasApprovedScript(d)) { tabsEl.innerHTML = detailTabs(d); tabsEl.classList.remove('hide'); } else { tabsEl.innerHTML = ''; tabsEl.classList.add('hide'); }
  det.innerHTML = detailBody(d);
  cmd.innerHTML = (hasApprovedScript(d) && scriptView === d.id) ? '' : cmdBar(d);
  bindDeck(d);
  // Fetch this deck's images on first view, then repaint with the real thumbnails.
  if (!imagesLoaded(d)) loadDeckImages(d).then(() => { if (String(SELECTED) === String(d.id)) renderDetail(); });
}

/* ---- chat / studio conversation ---- */
function deckTitleById(id) { const d = DECKS.find((x) => String(x.id) === String(id)); return d ? d.title : ''; }
function deckTypeById(id) { const d = DECKS.find((x) => String(x.id) === String(id)); return d ? (d.type || 'carousel') : 'carousel'; }
function talentName() { return (TALENT && TALENT.name) ? TALENT.name : 'Your Brasero designer'; }
function renderExpert() {
  const el = q('#chatExpert'); if (!el) return;
  const nm = talentName(), ph = TALENT && TALENT.photo;
  const av = ph ? `<img class="expert__av" src="${esc(ph)}" alt="">` : `<div class="expert__av expert__av--ph">${esc(initials(nm))}</div>`;
  el.innerHTML = `${av}<div class="expert__info"><span class="expert__label">Your dedicated expert</span><b class="expert__name">${esc(nm)}<span class="chat__dot hide" id="chatDotHead"></span></b></div>`;
}
function renderMessages() {
  const t = q('#chatThread'); if (!t) return;
  if (!MESSAGES.length) {
    t.innerHTML = `<div class="chat__empty"><b>${esc(talentName())}</b> is the designer taking care of your project. You can reach them right here, just keep it to what matters for the work so we can keep delivering fast for everyone. 🔥</div>`;
  } else t.innerHTML = MESSAGES.map((m) => {
    const cls = m.sender === 'client' ? 'msg--client' : 'msg--studio';
    const about = m.deck_id ? `<span class="msg__about">${TYPE_ICON[deckTypeById(m.deck_id)] || ''} ${esc(deckTitleById(m.deck_id) || 'Element')}</span>` : '';
    const who = esc(m.sender_name || (m.sender === 'client' ? 'You' : 'Brasero'));
    const bubble = m.body ? `<div class="msg__bubble">${esc(m.body)}</div>` : '';
    const imgs = (m.images && m.images.length) ? `<div class="msg__imgs">${m.images.map((u) => `<button type="button" class="msg__img" data-full="${esc(u)}"><img src="${esc(u)}" alt="attachment"></button>`).join('')}</div>` : '';
    return `<div class="msg ${cls}">${about}${bubble}${imgs}<span class="msg__meta">${who} · ${fmtMsgTime(m.created_at)}</span></div>`;
  }).join('');
  t.scrollTop = t.scrollHeight;
}
function renderAssetCur() {
  const cur = q('#assetCur'); if (!cur) return;
  if (!chatAsset || !DECKS.some((d) => String(d.id) === String(chatAsset))) { chatAsset = ''; cur.innerHTML = 'General'; return; }
  cur.innerHTML = `${TYPE_ICON[deckTypeById(chatAsset)] || ''}<span>${esc(deckTitleById(chatAsset))}</span>`;
}
function renderAssetMenu() {
  const gen = `<button type="button" class="assetopt ${chatAsset ? '' : 'on'}" data-asset=""><span class="assetopt__ic assetopt__ic--g">＃</span><span>General</span></button>`;
  const rows = DECKS.map((d) => `<button type="button" class="assetopt ${String(d.id) === String(chatAsset) ? 'on' : ''}" data-asset="${esc(d.id)}"><span class="assetopt__ic">${TYPE_ICON[d.type] || TYPE_ICON.carousel}</span><span>${esc(d.title)}</span></button>`).join('');
  q('#assetMenu').innerHTML = gen + rows;
}
function renderAtts() {
  const w = q('#chatAtts'); if (!w) return;
  if (!chatImgs.length) { w.classList.add('hide'); w.innerHTML = ''; return; }
  w.classList.remove('hide');
  w.innerHTML = chatImgs.map((u, i) => `<div class="att"><img src="${u}" alt=""><button type="button" data-att="${i}" title="Remove">✕</button></div>`).join('');
}
/* image compression for chat attachments */
/* ---- live chat polling ---- */
function setUnread(on) { q('#chatDotFab')?.classList.toggle('hide', !on); q('#chatDotHead')?.classList.toggle('hide', !on); }
async function pollMessages() {
  if (!REF || document.hidden) return;
  try {
    const d = await api('/api/order', { ref: REF, action: 'messages' });
    if (d && d.ok && Array.isArray(d.messages) && d.messages.length !== MESSAGES.length) {
      const grew = d.messages.length > MESSAGES.length;
      const newFromStudio = grew && d.messages.slice(MESSAGES.length).some((m) => m.sender === 'studio');
      MESSAGES = d.messages; renderMessages();
      if (newFromStudio && !q('#board')?.classList.contains('chat-open')) setUnread(true);
    }
  } catch (e) {}
}
function startMsgPoll() { stopMsgPoll(); MSGPOLL = setInterval(pollMessages, 7000); }
function stopMsgPoll() { if (MSGPOLL) { clearInterval(MSGPOLL); MSGPOLL = null; } }

function setChatOpen(open) { q('#board')?.classList.toggle('chat-open', open); if (open) { setUnread(false); q('#chatInput')?.focus(); } }

/* ---- add-to-order modal ---- */
function optionHTML(it) {
  if (it.brand) {
    const inc = (it.includes || []).map((x) => `<li>${esc(x)}</li>`).join('');
    return `<button type="button" class="brandpack" data-item="${it.key}">
      <div class="brandpack__top">
        <span class="addrow__ic">${TYPE_ICON.branding}</span>
        <div class="brandpack__h"><b>${it.label}</b><span>One pack with everything to brand your page</span></div>
        <span class="brandpack__price">${it.price}</span>
      </div>
      ${inc ? `<ul class="brandpack__list">${inc}</ul>` : ''}
      <span class="brandpack__cta">+ Add to my order</span>
    </button>`;
  }
  return `<button type="button" class="addpack ${it.free ? 'addpack--gold' : ''} ${it.story ? 'addpack--story' : ''}" data-item="${it.key}">
    <span class="addpack__fan" aria-hidden="true">${fanHTML(it.cards)}</span>
    <span class="addpack__info">
      <b class="addpack__count">${it.label}</b>
      ${it.free ? '<span class="addpack__free">+1 Free</span>' : ''}
      <span class="addpack__sub">one-time</span>
    </span>
    <span class="addpack__price">${it.price}</span>
  </button>`;
}
function catCardHTML(g) {
  return `<button type="button" class="addcat" data-cat="${g.key}">
    <div class="addcat__vis">${GROUP_ICON[g.key] || ''}</div>
    <div class="addcat__body"><b>${g.title}</b><span>${g.sub}</span></div>
    <svg class="addcat__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
  </button>`;
}
function renderAddBody() {
  const wrap = q('#addPacks');
  if (!addCat) { wrap.innerHTML = `<div class="addcats">${ADD_GROUPS.map(catCardHTML).join('')}</div>`; return; }
  const g = ADD_GROUPS.find((x) => x.key === addCat);
  wrap.innerHTML = `<button type="button" class="addback" data-back>← All elements</button>
    <div class="addsec__list">${g.items.map(optionHTML).join('')}</div>`;
}
function openAddModal(group) {
  if (!REF) return;
  addCat = (typeof group === 'string' && ADD_GROUPS.some((g) => g.key === group)) ? group : null;
  q('#addRef').textContent = '#' + REF;
  q('#addErr').textContent = '';
  renderAddBody();
  q('#addModal').classList.add('open');
}
function closeAddModal() { q('#addModal').classList.remove('open'); }
async function startAddon(item, btn) {
  q('#addErr').textContent = '';
  const priceEl = btn.querySelector('.addpack__price,.addrow__price,.brandpack__price'), old = priceEl ? priceEl.innerHTML : '';
  btn.style.pointerEvents = 'none'; if (priceEl) priceEl.innerHTML = '<span class="spin" style="border-color:rgba(0,0,0,.25);border-top-color:#111"></span>';
  try {
    // Public endpoint (pre-payment): the client session email is the order email.
    const d = await post('/api/checkout-session', { addon_item: item, addon_ref: REF, email: ME.email || '', name: ORDER ? ORDER.name : '' });
    if (d && d.url) { location.href = d.url; return; }   // → Stripe Checkout
    q('#addErr').textContent = (d && d.error) || 'Could not start checkout. Please try again.';
  } catch (e) { q('#addErr').textContent = 'Network error. Please try again.'; }
  btn.style.pointerEvents = ''; if (priceEl) priceEl.innerHTML = old;
}

/* ---- downloads ---- */
async function downloadOne(url, name) {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) throw 0;
    const b = await r.blob();
    const ext = (b.type && b.type.split('/')[1]) || (url.split('?')[0].split('.').pop()) || 'jpg';
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = (name || 'deck') + '.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  } catch (e) { window.open(url, '_blank'); }
}
async function downloadDeck(id, btn) {
  const d = DECKS.find((x) => String(x.id) === String(id)); if (!d) return;
  await loadDeckImages(d);                 // ensure the full-res bytes are fetched
  const imgs = imagesOf(d); if (!imgs.length) return;
  const name = slug(d.title), old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Preparing…'; }
  for (let i = 0; i < imgs.length; i++) { await downloadOne(imgs[i], `${name}-${String(i + 1).padStart(2, '0')}`); await sleep(350); }
  if (btn) { btn.disabled = false; btn.innerHTML = old; }
}
function openLb() { q('#lbImg').src = lbUrl; q('#lb').classList.add('open'); }

/* ---- deck actions ---- */
function bindDeck(d) {
  qa(`[data-id="${d.id}"]`).forEach((el) => { if (el.dataset.act) el.addEventListener('click', () => onAction(el)); });
}
async function onAction(el) {
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'toggle_rev') { q('#rev-' + id).classList.toggle('open'); return; }
  if (act === 'show_script') { scriptView = id; renderDetail(); return; }
  if (act === 'show_main') { scriptView = null; renderDetail(); return; }
  if (act === 'download_deck') { downloadDeck(id, el); return; }
  const payload = { ref: REF, deckId: id, action: act };
  if (act === 'validate_script') {
    const sc = gatherEditedScript(); if (sc != null) payload.script = sc;   // send the client's edits
    if (!confirm('Approve this script and move it into design?')) return;
  }
  if (act === 'validate_design') { if (!confirm('Approve this design as final?')) return; }
  if (act === 'request_revision') {
    const ta = q(`textarea[data-rev="${id}"]`);
    payload.note = ta ? ta.value.trim() : '';
    if (!payload.note) { alert('Tell us what to change first.'); return; }
  }
  const old = el.innerHTML; el.disabled = true; el.innerHTML = '<span class="spin"></span>';
  try {
    const dt = await api('/api/deck', payload);
    if (!dt || !dt.ok) { alert('Could not save. Please refresh and try again.'); el.disabled = false; el.innerHTML = old; return; }
    render(dt.order);
  } catch (e) { alert('Network error.'); el.disabled = false; el.innerHTML = old; }
}

/* ---- one-time wiring of the board's static controls ---- */
function bindBoard() {
  q('#brandHome').addEventListener('click', (e) => { e.preventDefault(); renderHome(); });
  q('#toProjects').addEventListener('click', renderHome);
  q('#addDecks').addEventListener('click', openAddModal);
  q('#addClose').addEventListener('click', closeAddModal);

  // sidebar navigation (delegated)
  q('#deckList').addEventListener('click', (e) => {
    const add = e.target.closest('[data-addcat]'); if (add) { e.stopPropagation(); openAddModal({ carousel: 'decks', story: 'stories', branding: 'branding' }[add.dataset.addcat]); return; }
    const back = e.target.closest('[data-catback]'); if (back) { CAT = null; SELECTED = null; scriptView = null; renderSidebar(); renderDetail(); return; }
    const cat = e.target.closest('[data-cat]'); if (cat) { CAT = cat.dataset.cat; const inCat = decksOfCat(CAT); SELECTED = inCat[0] ? inCat[0].id : null; scriptView = null; renderSidebar(); renderDetail(); return; }
    const it = e.target.closest('.deckitem'); if (it) { SELECTED = it.dataset.deck; scriptView = null; renderSidebar(); renderDetail(); }
  });

  // add-modal navigation (delegated)
  q('#addPacks').addEventListener('click', (e) => {
    const cat = e.target.closest('[data-cat]'); if (cat) { addCat = cat.dataset.cat; renderAddBody(); return; }
    if (e.target.closest('[data-back]')) { addCat = null; renderAddBody(); return; }
    const b = e.target.closest('[data-item]'); if (b) startAddon(b.dataset.item, b);
  });

  // chat composer
  q('#chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = q('#chatInput'), body = input.value.trim();
    if ((!body && !chatImgs.length) || !REF) return;
    const deckId = chatAsset || '', images = chatImgs.slice();
    const btn = q('#chatSend'); btn.disabled = true;
    try {
      const d = await api('/api/order', { ref: REF, action: 'send_message', body, deckId, images });
      if (d && d.ok) { MESSAGES = d.messages || MESSAGES; input.value = ''; chatAsset = ''; chatImgs = []; renderAtts(); renderAssetCur(); renderMessages(); }
    } catch (e2) {} finally { btn.disabled = false; }
  });
  q('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); q('#chatForm').requestSubmit(); } });

  // asset picker
  q('#assetBtn').addEventListener('click', (e) => { e.stopPropagation(); renderAssetMenu(); q('#assetMenu').classList.toggle('hide'); });
  q('#assetMenu').addEventListener('click', (e) => { const o = e.target.closest('[data-asset]'); if (!o) return; chatAsset = o.dataset.asset; renderAssetCur(); q('#assetMenu').classList.add('hide'); });

  // attachments
  q('#chatFiles').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) { if (chatImgs.length >= 8) { alert('Up to 8 images per message.'); break; } if (!/^image\//.test(f.type)) continue; const u = await compress(f); if (u) chatImgs.push(u); }
    renderAtts();
  });
  q('#chatAtts').addEventListener('click', (e) => { const b = e.target.closest('[data-att]'); if (!b) return; chatImgs.splice(Number(b.dataset.att), 1); renderAtts(); });

  // chat slide-over
  q('#chatToggle').addEventListener('click', () => setChatOpen(false));
  q('#msgFab').addEventListener('click', () => setChatOpen(true));
  q('#chatScrim').addEventListener('click', () => setChatOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && q('#board')?.classList.contains('chat-open')) setChatOpen(false); });

  // lightbox controls
  q('#lb').addEventListener('click', () => q('#lb').classList.remove('open'));
  q('#lbDl').addEventListener('click', (e) => { e.stopPropagation(); if (lbUrl) downloadOne(lbUrl, lbName || 'deck-slide'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollMessages(); });
}

/* cooking animation built from the real pan + flame assets */
const PAN_SVG = `<div class="pan"><svg viewBox="0 40 200 150" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="pf0" x1="50.2201" y1="231.504" x2="133.932" y2="97.7671" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient>
    <linearGradient id="pf1" x1="241.043" y1="228.681" x2="174.91" y2="123.029" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient>
    <linearGradient id="pf2" x1="259.48" y1="87.4247" x2="102.244" y2="197.616" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient>
    <linearGradient id="pf3" x1="30.7105" y1="68.2866" x2="236.484" y2="212.494" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient>
  </defs>
  <g class="scene">
    <g transform="translate(22 54) scale(0.45)">
      <g class="flame">
        <path d="M3.66209 161.884C3.33707 155.637 3.79759 149.531 4.95525 143.66C15.3507 158.045 32.6043 167.027 51.6467 166.036C81.4836 164.484 104.413 139.037 102.861 109.201C102.433 100.978 100.189 93.2804 96.5403 86.4749C126.793 94.4837 149.78 121.262 151.493 154.193C153.617 195.015 122.246 229.83 81.4235 231.954C40.601 234.078 5.78602 202.706 3.66209 161.884Z" fill="url(#pf0)"/>
        <path d="M277.823 173.682C278.08 168.746 277.716 163.922 276.802 159.285C268.589 170.648 254.96 177.744 239.916 176.962C216.345 175.735 198.231 155.632 199.457 132.061C199.795 125.565 201.571 119.485 204.454 114.108C180.553 120.434 162.392 141.589 161.038 167.605C159.36 199.855 184.143 227.358 216.393 229.036C248.642 230.714 276.146 205.931 277.823 173.682Z" fill="url(#pf1)"/>
        <path d="M171.928 35.2455C164.315 35.2455 156.924 36.1912 149.863 37.9691C168.002 49.6932 180.008 70.0935 180.008 93.2982C180.008 129.657 150.533 159.131 114.174 159.131C104.154 159.131 94.6577 156.891 86.1562 152.887C97.8019 189.146 131.799 215.389 171.928 215.389C221.673 215.389 262 175.062 262 125.317C262 75.5716 221.673 35.2455 171.928 35.2455Z" fill="url(#pf2)"/>
        <path d="M145.29 0C155.252 2.62032e-05 164.926 1.2376 174.166 3.56445C150.428 18.9076 134.716 45.6057 134.716 75.9736C134.716 123.556 173.29 162.129 220.872 162.129C233.985 162.129 246.413 159.198 257.539 153.958C242.298 201.41 197.806 235.753 145.29 235.753C80.1887 235.753 27.4133 182.978 27.4131 117.877C27.4131 52.7755 80.1886 0 145.29 0Z" fill="url(#pf3)"/>
      </g>
    </g>
    <g transform="translate(36 150) scale(0.34)">
      <path d="M0 18C0 8.05887 8.05888 0 18 0H289V51C289 79.1665 266.167 102 238 102H51C22.8335 102 0 79.1665 0 51V18Z" fill="#1A1A1A"/>
      <rect x="172" width="234" height="39" rx="19.5" fill="#1A1A1A"/>
    </g>
  </g>
</svg></div>`;
