/* ============================================================================
   app.client.js - client space (light bundle), lazy-loaded for role 'client'.
   Phase 3: magic-link "my orders" list (aggregated by client account) + the
   per-order board (read scripts/designs, approve, request retouch, download,
   chat with the studio, add to the order). Reuses the brasero.css board/chat
   design system; talks to /api/order + /api/deck with the client session token
   (api() attaches the Authorization header), so no ref+email is needed.
   ========================================================================== */
import { api, post, clearToken, esc, initials, igUser, compress, fmtMsgTime, parseSlides, sanitizeSlide, slidesViewHTML, slideMeta, brandKind, normBrand } from './app.core.js';

/* ---- module state ---- */
let R = null;            // mount root (<main id="app">), stable across view swaps
let ME = {};             // { email, name } from the session
let REF = '';            // ref of the order currently open in the board
let ORDER = null, DECKS = [], MESSAGES = [], TALENT = null;
let SELECTED = null, scriptView = null, CAT = null;
let TABS = [], ATAB = null;          // open element tabs (talent-style, closeable)
let brandPlat = 'instagram';         // active platform in the unified branding mockup
let chatAsset = '', chatImgs = [], addCat = null;
let MSGPOLL = null, lbUrl = '', lbName = '';
let docBound = false;    // document/root delegated listeners attached once

const q = (s) => R.querySelector(s);
const qa = (s) => [...R.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => (s || 'deck').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';

const PLAN_NAMES = { starter: 'Ember', flame: 'Flame', burst: 'Meteor' };
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
  static: `<svg class="ti" viewBox="0 0 140 94" fill="none"><use href="#ic-decks"/></svg>`,
  branding: `<svg class="ti" viewBox="0 0 120 120" fill="none"><use href="#ic-brand"/></svg>`,
};
const LOGO = '<svg class="logo-svg" viewBox="0 0 798 189" fill="none"><use href="#brasero-mark"/></svg>';
const DL_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h13"/></svg>';
const DECK_CATS = [{ key: 'carousel', label: 'Decks' }, { key: 'story', label: 'Stories' }, { key: 'static', label: 'Statics' }, { key: 'branding', label: 'Branding' }];

/* client avatar = white bubble + branding glyph + the plan icon as a corner badge
   (same layout as the team board's profile box). */
const USER_GLYPH = '<svg class="iav__usr" viewBox="0 0 120 120" fill="none" aria-hidden="true"><use href="#ic-brand"/></svg>';
const PLAN_ICON = {
  starter: '<svg class="iavbadge__i" viewBox="0 0 109 77" fill="none" aria-hidden="true"><path d="M79.1201 3.31964C73.0367 -1.10655 64.7991 -1.10654 58.7157 3.31964L36.7652 19.2903C30.6817 23.7165 28.1362 31.5621 30.4598 38.7238L38.8442 64.565C41.1678 71.7267 47.8322 76.5755 55.3518 76.5755H82.484C90.0036 76.5755 96.668 71.7267 98.9916 64.565L107.376 38.7238C109.7 31.5621 107.154 23.7165 101.071 19.2903L79.1201 3.31964Z" fill="url(#ember_g0)"/><path d="M27.006 36.5291C23.6878 34.1094 19.1946 34.1094 15.8763 36.5291L3.90332 45.2597C0.585077 47.6794 -0.803414 51.9683 0.464042 55.8834L5.03732 70.0099C6.30478 73.925 9.93989 76.5757 14.0415 76.5757H28.8409C32.9425 76.5757 36.5776 73.9249 37.845 70.0099L42.4183 55.8834C43.6858 51.9683 42.2973 47.6794 38.979 45.2597L27.006 36.5291Z" fill="url(#ember_g1)"/><defs><linearGradient id="ember_g0" x1="107.1" y1="22.1804" x2="39.1783" y2="72.2445" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient><linearGradient id="ember_g1" x1="42.2679" y1="46.8396" x2="5.16169" y2="74.1294" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient></defs></svg>',
  flame: '<svg class="iavbadge__i" viewBox="0 0 96 104" fill="none" aria-hidden="true"><g opacity="0.6"><path d="M60.4144 34.2834C58.7515 29.1812 60.0019 22.4318 65.3675 22.3364C68.1653 22.2867 70.9717 23.5077 73.3489 25.9993L90.1678 43.6285C94.829 48.5143 96.7795 53.0313 94.9991 58.5188L88.5748 78.3188C86.7944 83.8063 81.688 87.5215 75.9264 87.5215H55.1371C49.3754 87.5215 44.2691 83.8062 42.4886 78.3188L36.0644 58.5188C33.5971 50.9145 45.7002 50.5691 50.2504 57.1423L52.9287 61.0114C54.9974 63.9999 59.5524 63.5192 60.9517 60.1646L64.7289 51.1092C65.1524 50.094 65.1978 48.9607 64.857 47.9148L60.4144 34.2834Z" fill="url(#flame_g0)"/></g><path d="M56.1858 19.0523C58.8373 10.9166 56.8435 0.154374 48.288 0.00232682C43.8267 -0.0769576 39.3518 1.86992 35.5614 5.84296L8.74301 33.9533C1.31046 41.7439 -1.79962 48.9465 1.03936 57.6965L11.2831 89.2683C14.122 98.0182 22.2643 103.942 31.4515 103.942H64.6008C73.7879 103.942 81.9302 98.0182 84.7692 89.2683L95.0129 57.6965C98.947 45.5711 79.6483 45.0203 72.3927 55.5016L68.1221 61.671C64.8234 66.4363 57.5604 65.6697 55.3292 60.3208L49.3062 45.8817C48.6309 44.2629 48.5585 42.4556 49.102 40.788L56.1858 19.0523Z" fill="url(#flame_g1)"/><defs><linearGradient id="flame_g0" x1="94.7924" y1="41.2165" x2="39.1394" y2="77.9406" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient><linearGradient id="flame_g1" x1="1.36893" y1="30.1073" x2="90.1096" y2="88.6653" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient></defs></svg>',
  burst: '<svg class="iavbadge__i" viewBox="0 0 128 82" fill="none" aria-hidden="true"><path d="M9.26424 28.1323C5.47213 29.4555 1.85979 31.8179 0.728004 35.6714C-0.242668 38.9764 -0.242667 42.4987 0.728007 45.8037C1.8598 49.6573 5.47213 52.0196 9.26424 53.3429L62.8085 72.0268C66.6006 73.35 69.7196 76.0708 73.0368 78.3351C77.5564 81.42 83.3533 82.3518 88.7723 80.5936L115.553 71.9045C122.975 69.4963 128 62.5897 128 54.7968L128 26.6783C128 18.8855 122.975 11.9789 115.553 9.57072L88.7723 0.88162C83.3532 -0.876626 77.5564 0.0552096 73.0368 3.1401C69.7196 5.40435 66.6006 8.12515 62.8085 9.44838L9.26424 28.1323Z" fill="url(#meteor_g0)"/><path d="M52.0753 30.1646C47.4882 36.4692 47.4882 45.0062 52.0753 51.3107L68.6265 74.0591C73.2136 80.3637 81.3443 83.0018 88.7664 80.5936L115.547 71.9045C122.969 69.4964 127.994 62.5898 127.994 54.7969L127.994 26.6784C127.994 18.8856 122.969 11.9789 115.547 9.5708L88.7664 0.881704C81.3443 -1.52643 73.2136 1.11167 68.6265 7.41624L52.0753 30.1646Z" fill="url(#meteor_g1)"/><path d="M70.1655 34.9433C67.575 38.5037 67.575 43.3248 70.1655 46.8851L79.5125 59.7318C82.1029 63.2922 86.6946 64.782 90.8861 63.4221L106.01 58.5151C110.201 57.1551 113.039 53.2548 113.039 48.8539L113.039 32.9745C113.039 28.5736 110.201 24.6733 106.01 23.3133L90.8861 18.4063C86.6946 17.0464 82.1029 18.5362 79.5125 22.0966L70.1655 34.9433Z" fill="url(#meteor_g2)"/><defs><linearGradient id="meteor_g0" x1="17.742" y1="62.1273" x2="135.169" y2="42.8475" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000" stop-opacity="0.6"/><stop offset="1" stop-color="#F87000" stop-opacity="0.6"/></linearGradient><linearGradient id="meteor_g1" x1="1.83409" y1="23.5996" x2="76.946" y2="108.319" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient><linearGradient id="meteor_g2" x1="81.2039" y1="18.5677" x2="110.504" y2="58.3196" gradientUnits="userSpaceOnUse"><stop stop-color="#F87000"/><stop offset="1" stop-color="#FF0000"/></linearGradient></defs></svg>',
};
function clientAv(o, cls) {
  const ic = (o && PLAN_ICON[o.plan]) || '';
  return `<span class="iavw"><span class="iav ${cls || ''}">${USER_GLYPH}</span>${ic ? `<span class="iavbadge">${ic}</span>` : ''}</span>`;
}

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
      includes: ['Profile photo', 'X / Twitter banner', 'LinkedIn banner', 'Facebook banner', 'YouTube banner', 'LinkedIn CTA buttons'] },
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
  REF = ''; ORDER = null; DECKS = []; MESSAGES = []; TALENT = null; SELECTED = null; scriptView = null; CAT = null; TABS = []; ATAB = null;
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
  TABS = []; ATAB = null; SELECTED = null; CAT = null; scriptView = null;
  R.innerHTML = `<div class="authwrap" style="text-align:center">${LOGO}<p>Loading your project…</p></div>`;
  let d;
  try { d = await api('/api/order', { ref }); }
  catch { renderHome(); return; }
  if (!d || !d.ok) { renderHome(); return; }
  MESSAGES = d.messages || []; TALENT = d.talent || null;
  R.innerHTML = boardHTML();
  bindBoard();
  restoreTabs(ref, (d.order && d.order.decks) || []);   // reopen the tabs left open last time
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
        <div class="cprofile">
          <div class="cprofile__av" id="oAvatar"></div>
          <div class="cprofile__nrow"><h2 class="cprofile__name" id="oName"></h2></div>
          <div class="cprofile__ig" id="oIg"></div>
          <div class="side__badges" id="oBadges"></div>
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
    <div class="board__guide" id="boardGuide">
      <div class="helpcard hide" id="helpCard">
        <div class="helpcard__h"><span class="tag" id="tutTag">Step 1</span><b>How it works</b><button class="mx" id="helpClose" type="button">✕</button></div>
        <div class="tut-vis" id="tutVis"></div>
        <div class="tut-body"><h4 id="tutTitle"></h4><p id="tutBody"></p></div>
        <div class="tut-foot">
          <div class="tut-dots" id="tutDots"></div>
          <button class="btn btn--ghost btn--sm" id="tutBack" type="button">← Back</button>
          <button class="btn btn--grad btn--sm" id="tutNext" type="button">Next →</button>
        </div>
      </div>
      <button class="helpfab" id="helpFab" type="button" title="How it works" aria-label="How it works"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.4c.8.7 1 1.3 1 2.6h6c0-1.3.2-1.9 1-2.6A6 6 0 0 0 12 3z"/></svg></button>
    </div>
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

  DECKS = o.decks || [];
  // reconcile open tabs against the current decks (the brand tab survives while any
  // branding deck exists; element tabs survive while their deck exists)
  TABS = TABS.filter((t) => t.kind === 'brand' ? hasBranding() : DECKS.some((d) => String(d.id) === String(t.id)));
  if (ATAB && !TABS.some((t) => tabKey(t) === ATAB)) ATAB = TABS.length ? tabKey(TABS[TABS.length - 1]) : null;
  SELECTED = selFromTab();
  if (CAT && !decksOfCat(CAT).length) CAT = null;
  if (!DECKS.length) {
    q('#deckList').innerHTML = '';
    q('#deckDetail').innerHTML = `<div class="empty">Your decks will appear here as soon as we start production. We'll email you at every step. 🔥</div>`;
    q('#deckCmd').innerHTML = ''; renderTabs();
    return;
  }
  renderSidebar();
  renderTabs();
  renderDetail();
}

/* ---- talent-style open tabs (multi-element, closeable, persisted per order) ---- */
function brandingDecks() { return DECKS.filter((d) => (d.type || '') === 'branding'); }
function hasBranding() { return brandingDecks().length > 0; }
function tabKey(t) { return t.kind === 'brand' ? 'brand' : 'deck:' + t.id; }
function selFromTab() {
  if (!ATAB) return null;
  if (ATAB === 'brand') return 'brand';
  const t = TABS.find((x) => tabKey(x) === ATAB);
  return t ? t.id : null;
}
function renderTabs() {
  try { if (REF) { localStorage.setItem('brasero_cli_tabs_' + REF, JSON.stringify(TABS.map(tabKey))); localStorage.setItem('brasero_cli_atab_' + REF, ATAB || ''); } } catch (e) {}
  const el = q('#deckTabs'); if (!el) return;
  if (!TABS.length) { el.classList.add('hide'); el.innerHTML = ''; return; }
  el.classList.remove('hide');
  el.innerHTML = TABS.map((t) => {
    const k = tabKey(t), on = k === ATAB ? 'on' : '';
    if (t.kind === 'brand') return `<div class="tab ${on}" data-tab="brand"><span class="tab__ic">${TYPE_ICON.branding}</span><span class="tab__l">Branding</span><button type="button" class="tab__x" data-tabx="brand" title="Close">✕</button></div>`;
    const d = DECKS.find((x) => String(x.id) === String(t.id)), ic = TYPE_ICON[d ? (d.type || 'carousel') : 'carousel'] || TYPE_ICON.carousel;
    return `<div class="tab ${on}" data-tab="${esc(k)}"><span class="tab__ic">${ic}</span><span class="tab__l">${esc(d ? d.title : 'Element')}</span><button type="button" class="tab__x" data-tabx="${esc(k)}" title="Close">✕</button></div>`;
  }).join('');
}
function openTab(t) { const k = tabKey(t); if (!TABS.some((x) => tabKey(x) === k)) TABS.push(t); ATAB = k; SELECTED = selFromTab(); scriptView = null; renderTabs(); renderSidebar(); renderDetail(); }
function activateTab(k) { ATAB = k; SELECTED = selFromTab(); scriptView = null; renderTabs(); renderSidebar(); renderDetail(); }
function closeTab(k) {
  const i = TABS.findIndex((x) => tabKey(x) === k); if (i < 0) return;
  TABS.splice(i, 1);
  if (ATAB === k) { const n = TABS[i] || TABS[i - 1] || null; ATAB = n ? tabKey(n) : null; scriptView = null; }
  SELECTED = selFromTab();
  renderTabs(); renderSidebar(); renderDetail();
}
function restoreTabs(ref, decks) {
  try {
    const keys = JSON.parse(localStorage.getItem('brasero_cli_tabs_' + ref) || 'null');
    const act = localStorage.getItem('brasero_cli_atab_' + ref) || '';
    if (Array.isArray(keys)) keys.forEach((k) => {
      if (k === 'brand') { if (decks.some((d) => (d.type || '') === 'branding') && !TABS.some((t) => tabKey(t) === 'brand')) TABS.push({ kind: 'brand' }); }
      else if (k && k.indexOf('deck:') === 0) { const id = k.slice(5); const dk = decks.find((d) => String(d.id) === id); if (dk && (dk.type || '') !== 'branding' && !TABS.some((t) => tabKey(t) === k)) TABS.push({ kind: 'deck', id }); }
    });
    ATAB = (act && TABS.some((t) => tabKey(t) === act)) ? act : (TABS.length ? tabKey(TABS[TABS.length - 1]) : null);
  } catch (e) {}
}

function renderProfile(o) {
  const nm = o.name || o.email || 'Client', user = igUser(o.instagram || o.handle);
  q('#oAvatar').innerHTML = clientAv(o, 'iav--xl');   // glyph bubble + plan icon corner badge
  q('#oName').textContent = nm;
  const ig = q('#oIg');
  if (user) { ig.textContent = '@' + user; ig.style.display = ''; } else { ig.textContent = ''; ig.style.display = 'none'; }
  q('#oBadges').innerHTML = `<span class="dl">#${esc(o.ref)}</span>`;
}

/* ---- sidebar: categories → element list ---- */
function decksOfCat(k) { return DECKS.filter((d) => (d.type || 'carousel') === k); }
function renderSidebar() { if (CAT) renderCatList(CAT); else renderCategories(); }
function renderCategories() {
  q('#deckList').innerHTML = DECK_CATS.map((c) => {
    const items = decksOfCat(c.key), n = items.length, ic = TYPE_ICON[c.key] || TYPE_ICON.carousel;
    if (n) {
      const done = items.filter((d) => d.status === 'done').length;
      // Branding = ONE unified element (opens the platform mockup), not a sub-list.
      if (c.key === 'branding') {
        const sel = SELECTED === 'brand' ? 'sel' : '';
        return `<button type="button" class="catrow ${sel}" data-brand>
          <span class="catrow__ic">${ic}</span>
          <span class="catrow__l"><span class="catrow__n">${c.label}</span><span class="catrow__s">${done}/${n} done · all platforms</span></span>
          <svg class="catrow__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>`;
      }
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
// Branding 'writing' = the client owes us the brief (an action), not a wait.
function tagFor(d) {
  if ((d.type || '') === 'branding' && d.status === 'writing') return ['pill--act', 'Your details'];
  return TAG[d.status] || TAG.writing;
}
function deckItemHTML(d) {
  const [pc, pl] = tagFor(d);
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
function hasApprovedScript(d) { return (d.type || '') !== 'branding' && !!(d.script && ['designing', 'design_review', 'revision', 'done'].includes(d.status)); }
// Small in-detail segmented toggle (element view ⇄ read-only approved script);
// the element tabs live in the top bar now (#deckTabs), this is element-internal.
function detailToggle(d) {
  const onScript = scriptView === d.id;
  return `<div class="ro-toggle"><div class="tabs">
    <button type="button" class="${onScript ? '' : 'on'}" data-act="show_main" data-id="${d.id}">${esc(d.title)}</button>
    <button type="button" class="${onScript ? 'on' : ''}" data-act="show_script" data-id="${d.id}">📄 Script</button>
  </div></div>`;
}
/* ---- branding form pieces (reused by the unified shared brief, below) ---- */
function brandLinkChip(u) { return `<span class="ig-chip" data-bm-link="${esc(u)}">${esc(String(u).replace(/^https?:\/\//, ''))}<button type="button" data-bm-link-del aria-label="Remove">✕</button></span>`; }
function brandMetricRow(m) { return `<div class="bm-metric" data-bm-metric><input type="text" class="bm-mn" placeholder="Metric (e.g. Clients)" value="${esc((m && m.name) || '')}" maxlength="80"><input type="text" class="bm-mv" placeholder="Value (e.g. 200+)" value="${esc((m && m.value) || '')}" maxlength="80"><button type="button" class="bm-metric-del" data-bm-metric-del aria-label="Remove">✕</button></div>`; }
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
  const [pc, pl] = tagFor(d);
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
  const det = q('#deckDetail'), cmd = q('#deckCmd');
  if (SELECTED === 'brand') { renderBranding(); return; }   // unified branding element
  const d = DECKS.find((x) => String(x.id) === String(SELECTED));
  if (!d) { det.innerHTML = `<div class="empty">${TABS.length ? 'Pick an element on the left, or switch tabs above.' : (CAT ? 'Select an element on the left.' : 'Pick a category on the left to see its elements.')}</div>`; cmd.innerHTML = ''; return; }
  const toggle = hasApprovedScript(d) ? detailToggle(d) : '';
  det.innerHTML = toggle + detailBody(d);
  cmd.innerHTML = (hasApprovedScript(d) && scriptView === d.id) ? '' : cmdBar(d);
  bindDeck(d);
  // Fetch this deck's images on first view, then repaint with the real thumbnails.
  if (!imagesLoaded(d)) loadDeckImages(d).then(() => { if (String(SELECTED) === String(d.id)) renderDetail(); });
}

/* ============================================================================
   UNIFIED BRANDING ELEMENT - one element. The client fills ONE shared brief; the
   studio designs it and uploads a render per platform, which the client then sees
   and approves. The order keeps its individual branding decks (profile / banners /
   CTA) as the per-platform "slots" that hold each delivered render.

   NOTE: the in-editor "live preview" mockup was removed from the client view (the
   client just fills the brief, then sees the delivered renders). The mockup engine
   below (PLAT_GLYPH / PLATFORMS / platChips / brandMockup / bindBrandPlats) is KEPT
   ASIDE on purpose - it's the basis for the upcoming DELIVERY flow where the studio
   composes the per-platform render the client receives as their preview. Do not
   delete; it is intentionally not wired into the live client editor.
   ========================================================================== */
const PLAT_GLYPH = {
  instagram: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.9l-4.6-6.02L5.7 22H2.44l8.02-9.17L1.5 2h7.07l4.16 5.5L18.244 2zm-1.21 18h1.8L7.05 3.9H5.12L17.034 20z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4.98 3.5C4.98 4.9 3.9 6 2.5 6S0 4.9 0 3.5 1.1 1 2.5 1 4.98 2.1 4.98 3.5zM.2 8h4.6v13H.2V8zm7 0h4.4v1.8h.06c.6-1.1 2.1-2.3 4.3-2.3 4.6 0 5.44 3 5.44 6.9V21h-4.6v-5.9c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1V21H7.2V8z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16.5 3c.3 2.1 1.5 3.6 3.5 3.9v2.4c-1.3.1-2.5-.3-3.5-1v6.1a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v2.5a3.1 3.1 0 1 0 2.2 3V3h2.6z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.7 1.7c1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4a2.5 2.5 0 0 0 1.7-1.7C23 15.2 23 12 23 12zM9.8 15.3V8.7l5.7 3.3-5.7 3.3z"/></svg>`,
};
const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', banner: '' },
  { key: 'x', label: 'X', banner: 'X / Twitter banner' },
  { key: 'linkedin', label: 'LinkedIn', banner: 'LinkedIn banner' },
  { key: 'facebook', label: 'Facebook', banner: 'Facebook banner' },
  { key: 'tiktok', label: 'TikTok', banner: '' },
  { key: 'youtube', label: 'YouTube', banner: 'YouTube banner' },
];
function profileDeck(decks) { return decks.find((d) => brandKind(d.title) === 'profile'); }
function ctaDeck(decks) { return decks.find((d) => brandKind(d.title) === 'cta'); }
function bannerDeckFor(decks, plat) { const p = PLATFORMS.find((x) => x.key === plat); return p && p.banner ? decks.find((d) => (d.title || '') === p.banner) : null; }
function brandPlatDecks(decks, plat) {
  const out = []; const pr = profileDeck(decks); if (pr) out.push(pr);
  const b = bannerDeckFor(decks, plat); if (b) out.push(b);
  if (plat === 'linkedin') { const c = ctaDeck(decks); if (c) out.push(c); }
  return out;
}
// Merge the per-kind slices stored across branding decks back into ONE shared brief.
function mergedBrief(decks) {
  const p = profileDeck(decks), c = ctaDeck(decks), b = decks.find((d) => brandKind(d.title) === 'banner');
  const pb = p ? normBrand(p) : { mode: 'upload', photo: '', desc: '' };
  const bb = b ? normBrand(b) : { headline: '', links: [], metrics: [] };
  const cb = c ? normBrand(c) : { ctas: [] };
  return { mode: pb.mode, photo: pb.photo || '', desc: pb.desc || '', headline: bb.headline || '', links: bb.links || [], metrics: bb.metrics || [], ctas: cb.ctas || [] };
}
function platChips() {
  return `<div class="bm-plats">${PLATFORMS.map((p) => `<button type="button" class="bm-plat ${p.key === brandPlat ? 'on' : ''}" data-plat="${p.key}">${PLAT_GLYPH[p.key] || ''}<span>${p.label}</span></button>`).join('')}</div>`;
}
function brandMockup(decks, brief, plat) {
  const p = PLATFORMS.find((x) => x.key === plat) || PLATFORMS[0];
  const prof = profileDeck(decks);
  const profImg = (prof && imagesLoaded(prof) && imgCount(prof)) ? imagesOf(prof)[0] : '';
  const bd = bannerDeckFor(decks, plat);
  const bannerImg = (bd && imagesLoaded(bd) && imgCount(bd)) ? imagesOf(bd)[0] : '';
  const avatar = profImg || brief.photo || '';
  const avHTML = avatar ? `<img src="${esc(avatar)}" alt="">` : `<span class="bm-mock__ini">${esc(initials((ORDER && ORDER.name) || 'You'))}</span>`;
  const name = esc((ORDER && ORDER.name) || 'Your name');
  const user = igUser(ORDER && (ORDER.instagram || ORDER.handle));
  const handle = user ? '@' + esc(user) : '';
  const head = brief.headline ? `<div class="bm-mock__head">${esc(brief.headline)}</div>` : '';
  const metrics = brief.metrics.length ? `<div class="bm-mock__metrics">${brief.metrics.map((m) => `<span><b>${esc(m.value)}</b>${esc(m.name)}</span>`).join('')}</div>` : '';
  const ctas = (brief.ctas.some((s) => s)) ? `<div class="bm-mock__ctas">${brief.ctas.filter((s) => s).map((s) => `<span class="bm-mock__cta">${esc(s)}</span>`).join('')}</div>` : '';
  const bannerStyle = bannerImg ? ` style="background-image:url('${esc(bannerImg)}')"` : '';
  const bannerSlot = p.banner
    ? `<div class="bm-mock__banner${bannerImg ? ' bm-mock__banner--img' : ''}"${bannerStyle}>${bannerImg ? '' : head}</div>`
    : `<div class="bm-mock__nobanner"></div>`;
  return `<div class="bm-mock bm-mock--${plat}">
    ${bannerSlot}
    <div class="bm-mock__body">
      <div class="bm-mock__top"><div class="bm-mock__av">${avHTML}</div><div class="bm-mock__id"><b>${name}</b>${handle ? `<span>${handle}</span>` : ''}</div></div>
      ${p.banner ? '' : (head || '')}
      ${metrics}${ctas}
    </div>
  </div>`;
}
// Delivered branding: one block per branding deck (the render the studio uploaded),
// with the client's approve / retouch / download actions. No live mockup.
function brandDeckBlock(d) {
  if (d.status === 'design_review') {
    return `<div class="bm-act"><div class="bm-act__h"><b>${esc(d.title)}</b><span class="pill pill--act">Ready for you</span></div>
      ${imgCount(d) ? galleryGrid(d) : ''}
      <div class="actions"><button class="btn btn--grad btn--sm" data-act="validate_design" data-id="${d.id}">Approve ✓</button>
        <button class="btn btn--ghost btn--sm" data-act="toggle_rev" data-id="${d.id}">Request a retouch</button></div>
      <div class="revbox" id="rev-${d.id}"><textarea class="script" placeholder="What would you like us to change?" data-rev="${d.id}" style="min-height:80px"></textarea>
        <div class="actions"><button class="btn btn--grad btn--sm" data-act="request_revision" data-id="${d.id}">Send retouch →</button></div></div></div>`;
  }
  if (d.status === 'done') {
    return `<div class="bm-act"><div class="bm-act__h"><b>${esc(d.title)}</b><span class="pill pill--done">Approved ✓</span>${imgCount(d) ? `<button class="btn btn--ghost btn--sm" data-act="download_deck" data-id="${d.id}">${DL_ICON} Download</button>` : ''}</div>${imgCount(d) ? galleryGrid(d) : ''}</div>`;
  }
  return `<div class="bm-act bm-act--wait"><b>${esc(d.title)}</b> · in production, we'll notify you the moment it's ready.</div>`;
}
function brandDeliverables(decks) {
  return `<div class="bm-extra">${decks.map(brandDeckBlock).join('')}</div>`;
}
/* shared brief form (one set of details for every platform) - single column,
   it lives in the LEFT column next to the sticky mockup preview */
function brandSharedForm(brief) {
  return `<div class="brandform brandshared" data-brand="shared">
    <div class="btoggle bm-mode">
      <button type="button" data-bm="upload" class="${brief.mode === 'avatar' ? '' : 'on'}">Upload a photo</button>
      <button type="button" data-bm="avatar" class="${brief.mode === 'avatar' ? 'on' : ''}">Describe an avatar</button>
    </div>
    <div class="bm-pane bm-upload ${brief.mode === 'avatar' ? 'hide' : ''}">
      <label class="field"><span>Your photo <small>we'll clean it up &amp; make it on-brand</small></span>
        <label class="bm-photo" data-bm-drop>${brief.photo ? `<img src="${esc(brief.photo)}" alt="">` : '<span class="bm-photo__ph">+ Add a photo</span>'}<input type="file" accept="image/*" hidden data-bm-file></label></label>
    </div>
    <div class="bm-pane bm-avatar ${brief.mode === 'avatar' ? '' : 'hide'}">
      <label class="field"><span>Describe the avatar you want</span><textarea class="script" data-bm-desc placeholder="e.g. friendly cartoon avatar, orange hoodie, warm smile, flat style…" style="min-height:80px">${esc(brief.desc)}</textarea></label>
    </div>
    <label class="field"><span>Banner headline</span><input type="text" data-bm-headline value="${esc(brief.headline)}" placeholder="e.g. We help founders grow on LinkedIn" maxlength="300"></label>
    <div class="field"><span>Links</span>
      <div class="bm-links" data-bm-links>
        <div class="ig-add"><input type="text" class="ig-input bm-link-input" placeholder="https://… or your-site.com" autocomplete="off"><button type="button" class="ig-btn" data-bm-link-add>Add</button></div>
        <div class="ig-chips bm-link-chips">${brief.links.map(brandLinkChip).join('')}</div>
      </div>
    </div>
    <div class="field"><span>Metrics <small>optional</small></span>
      <div class="bm-metrics" data-bm-metrics>${(brief.metrics.length ? brief.metrics : [{ name: '', value: '' }]).map(brandMetricRow).join('')}</div>
      <button type="button" class="btn btn--ghost btn--sm bm-metric-add" data-bm-metric-add>+ Add metric</button>
    </div>
    <div class="field"><span>CTA buttons <small>for LinkedIn</small></span>
      ${[0, 1, 2].map((i) => `<input type="text" class="bm-cta-input" data-bm-cta="${i}" value="${esc(brief.ctas[i] || '')}" placeholder="${['Book a call', 'See pricing', 'Follow us'][i]}" maxlength="120">`).join('')}
    </div>
  </div>`;
}
/* read-only recap of the one shared brief (merged from the per-platform decks) */
function briefRecap(b) {
  if (!(b.photo || (b.desc && b.desc.trim()) || b.headline || b.links.length || b.metrics.length || b.ctas.some((s) => s))) return `<div class="bb bb--empty">No branding details yet.</div>`;
  const row = (k, v) => `<div class="bb__row"><span class="bb__k">${k}</span><span class="bb__v">${v}</span></div>`;
  const rows = [];
  if (b.mode === 'avatar' && b.desc) rows.push(row('Avatar brief', esc(b.desc)));
  else if (b.photo) rows.push(row('Photo', `<img class="bb__photo" src="${esc(b.photo)}" alt="">`));
  if (b.headline) rows.push(row('Headline', esc(b.headline)));
  if (b.links.length) rows.push(row('Links', `<span class="bb__chips">${b.links.map((l) => `<a class="bb__chip" href="${esc(l)}" target="_blank" rel="noopener">${esc(String(l).replace(/^https?:\/\//, ''))}</a>`).join('')}</span>`));
  if (b.metrics.length) rows.push(row('Metrics', `<span class="bb__metrics">${b.metrics.map((m) => `<span class="bb__metric"><b>${esc(m.value)}</b>${esc(m.name)}</span>`).join('')}</span>`));
  const ctas = b.ctas.filter((s) => s);
  if (ctas.length) rows.push(row('CTAs', `<span class="bb__chips">${ctas.map((s) => `<span class="bb__chip">${esc(s)}</span>`).join('')}</span>`));
  return `<div class="bb">${rows.join('')}</div>`;
}
function gatherSharedBrand() {
  const form = q('.brandshared'); if (!form) return { mode: 'upload', photo: '', desc: '', headline: '', links: [], metrics: [], ctas: [] };
  const mode = form.querySelector('[data-bm].on')?.dataset.bm === 'avatar' ? 'avatar' : 'upload';
  const img = form.querySelector('.bm-photo img');
  return {
    mode, photo: img ? img.getAttribute('src') : '', desc: (form.querySelector('[data-bm-desc]')?.value || '').trim(),
    headline: (form.querySelector('[data-bm-headline]')?.value || '').trim(),
    links: [...form.querySelectorAll('[data-bm-link]')].map((c) => c.dataset.bmLink),
    metrics: [...form.querySelectorAll('[data-bm-metric]')].map((r) => ({ name: r.querySelector('.bm-mn').value.trim(), value: r.querySelector('.bm-mv').value.trim() })).filter((m) => m.name || m.value),
    ctas: [...form.querySelectorAll('[data-bm-cta]')].map((i) => i.value.trim()),
  };
}
function renderBranding() {
  const det = q('#deckDetail'), cmd = q('#deckCmd');
  const decks = brandingDecks();
  if (!decks.length) { det.innerHTML = `<div class="empty">Branding isn't part of this order yet.</div>`; cmd.innerHTML = ''; return; }
  const anyWriting = decks.some((d) => d.status === 'writing');
  if (anyWriting) {
    // brief phase: the client just fills the shared details (no live preview).
    const brief = q('.brandshared') ? gatherSharedBrand() : mergedBrief(decks);
    det.innerHTML = `<p class="detail__instr">🎨 <b>Set up your branding</b>, fill your details once, we design it for every platform and send you the result.</p>
      ${brandSharedForm(brief)}`;
    cmd.innerHTML = `<div class="cmdbar__row"><span class="cmdbar__hint">Your details apply to every platform.</span><div class="actions"><button class="btn btn--grad btn--sm" data-act="submit_brand">Send details →</button></div></div>`;
    bindBrandForm();
  } else {
    // delivered phase: the renders the studio sent, per platform, to review.
    det.innerHTML = `<p class="detail__instr">🖼️ <b>Your branding</b>, review each render below, then approve it or ask for a retouch.</p>
      ${brandDeliverables(decks)}
      <div class="bb-wrap"><div class="bb-wrap__h">Your details</div>${briefRecap(mergedBrief(decks))}</div>`;
    cmd.innerHTML = '';
    // load any delivered render images, then repaint
    const need = decks.filter((d) => imgCount(d) && !imagesLoaded(d));
    if (need.length) Promise.all(need.map(loadDeckImages)).then(() => { if (SELECTED === 'brand') renderBranding(); });
  }
  bindBrandActions();
}
// [KEPT ASIDE - delivery flow] switch the mockup's platform and repaint the stage.
function bindBrandPlats() {
  qa('.bm-plat').forEach((b) => b.addEventListener('click', () => {
    if (brandPlat === b.dataset.plat) return;
    brandPlat = b.dataset.plat;
    const decks = brandingDecks();
    const brief = q('.brandshared') ? gatherSharedBrand() : mergedBrief(decks);
    qa('.bm-plat').forEach((x) => x.classList.toggle('on', x === b));
    const stage = q('.bm-stage'); if (stage) stage.innerHTML = brandMockup(decks, brief, brandPlat);
    const need = brandPlatDecks(decks, brandPlat).filter((d) => !imagesLoaded(d));
    if (need.length) Promise.all(need.map(loadDeckImages)).then(() => { if (SELECTED === 'brand') { const st = q('.bm-stage'); if (st) st.innerHTML = brandMockup(brandingDecks(), q('.brandshared') ? gatherSharedBrand() : mergedBrief(brandingDecks()), brandPlat); } });
  }));
}
function bindBrandActions() {
  qa('#deckDetail [data-act], #deckCmd [data-act]').forEach((el) => el.addEventListener('click', () => onAction(el)));
}
async function submitBrand(el) {
  const brand = gatherSharedBrand();
  const filled = brand.photo || (brand.desc && brand.desc.trim()) || brand.headline || brand.links.length || brand.metrics.length || brand.ctas.some((s) => s);
  if (!filled) { alert('Add at least one detail before sending.'); return; }
  if (!confirm('Send these details to start the design?')) return;
  const old = el.innerHTML; el.disabled = true; el.innerHTML = '<span class="spin"></span>';
  try {
    const dt = await api('/api/order', { ref: REF, action: 'submit_brand', brand });
    if (!dt || !dt.ok) { alert('Could not save. Please refresh and try again.'); el.disabled = false; el.innerHTML = old; return; }
    render(dt.order);
  } catch (e) { alert('Network error.'); el.disabled = false; el.innerHTML = old; }
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
function bindBrandForm() {
  const form = q('.brandform'); if (!form) return;
  // profile: mode toggle + photo upload
  form.querySelectorAll('[data-bm]').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.bm;
    form.querySelectorAll('[data-bm]').forEach((x) => x.classList.toggle('on', x === b));
    form.querySelector('.bm-upload')?.classList.toggle('hide', m !== 'upload');
    form.querySelector('.bm-avatar')?.classList.toggle('hide', m !== 'avatar');
  }));
  const file = form.querySelector('[data-bm-file]');
  if (file) file.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const url = await compress(f, 1200), drop = form.querySelector('[data-bm-drop]');
      drop.querySelector('.bm-photo__ph')?.remove();
      let img = drop.querySelector('img');
      if (!img) { img = document.createElement('img'); drop.insertBefore(img, file); }
      img.src = url;
    } catch (err) { alert('Could not read that image.'); }
  });
  // banner: links chip list
  const linkWrap = form.querySelector('[data-bm-links]');
  if (linkWrap) {
    const input = linkWrap.querySelector('.bm-link-input'), chips = linkWrap.querySelector('.bm-link-chips');
    const add = () => { let u = (input.value || '').trim(); if (!u) return;
      if (!/^https?:\/\//i.test(u) && /\./.test(u)) u = 'https://' + u;
      const have = [...chips.querySelectorAll('[data-bm-link]')].map((c) => c.dataset.bmLink);
      if (!have.includes(u) && have.length < 6) chips.insertAdjacentHTML('beforeend', brandLinkChip(u));
      input.value = ''; input.focus(); };
    linkWrap.querySelector('[data-bm-link-add]').addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    chips.addEventListener('click', (e) => { const d = e.target.closest('[data-bm-link-del]'); if (d) d.closest('[data-bm-link]').remove(); });
  }
  // banner: metrics repeater
  const metrics = form.querySelector('[data-bm-metrics]');
  if (metrics) {
    form.querySelector('[data-bm-metric-add]')?.addEventListener('click', () => {
      if (metrics.querySelectorAll('[data-bm-metric]').length >= 6) return;
      metrics.insertAdjacentHTML('beforeend', brandMetricRow({})); });
    metrics.addEventListener('click', (e) => { const d = e.target.closest('[data-bm-metric-del]'); if (d) d.closest('[data-bm-metric]').remove(); });
  }
}
async function onAction(el) {
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'submit_brand') { submitBrand(el); return; }   // unified branding shared brief
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

/* ---- floating "How it works" guide (client journey) ---- */
const gpill = (t, c, bg) => `<span style="display:inline-flex;align-items:center;font-size:10px;font-weight:800;color:${c};background:${bg};border-radius:100px;padding:4px 10px;white-space:nowrap">${t}</span>`;
const TUT = [
  { tag: 'Step 1', title: 'Your project & your details', body: 'Top-left shows the project you are on, with your name, handle and pack. Use ← Projects to jump back to all of your projects.',
    vis: `<div style="width:100%;max-width:218px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:0 10px 26px rgba(0,0,0,.07);padding:16px 14px;text-align:center">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--grad);color:#fff;font-weight:900;font-size:19px;display:grid;place-items:center;margin:0 auto 9px">NP</div>
      <b style="font-size:13px;letter-spacing:-.02em">Nina Park</b><div style="font-size:11px;color:var(--grey);margin-top:2px">@ninapark</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-top:10px">${gpill('#A1B2', '#555', 'rgba(0,0,0,.05)')}${gpill('Flame pack', '#555', 'rgba(0,0,0,.05)')}</div></div>` },
  { tag: 'Step 2', title: 'Your elements, grouped by type', body: 'Everything we make for you sits under Decks, Stories and Branding. Open a category to see its elements and where each one is at.',
    vis: `<div style="width:100%;max-width:222px;display:flex;flex-direction:column;gap:8px">
      ${['Decks', 'Stories', 'Branding'].map((l, i) => `<div style="display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:12px;background:#fff;padding:10px 12px"><span style="width:30px;height:24px;border-radius:7px;background:linear-gradient(160deg,#ffd9c4,#fff3ec)"></span><span style="flex:1;text-align:left"><b style="font-size:12px;display:block">${l}</b><span style="font-size:10px;color:var(--grey)">${['3 elements · 1/3 done', '2 elements · 0/2 done', 'Tap to set up'][i]}</span></span><span style="color:var(--grey)">›</span></div>`).join('')}</div>` },
  { tag: 'Step 3', title: 'Review & approve the script', body: 'Open an element to read the script slide by slide. Tweak any wording directly, then Approve script ✓ to send it into design.',
    vis: `<div style="width:100%;max-width:224px">
      <div style="background:#fff;border:1px solid var(--line);border-radius:11px;padding:11px;font-size:11px;line-height:1.5"><b style="font-size:12px;display:block;margin-bottom:3px">Slide 1</b>Stop believing these <mark style="background:#ffe39a">3 money myths</mark>…</div>
      <div style="display:flex;justify-content:flex-end;margin-top:9px">${gpill('Approve script ✓', '#fff', 'var(--grad)')}</div></div>` },
  { tag: 'Step 4', title: 'Validate the design', body: 'When the design lands you review it and either approve it, or request a retouch with a quick note on what to change.',
    vis: `<div style="display:flex;flex-direction:column;gap:10px;align-items:center">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:7px;width:150px"><div style="aspect-ratio:1;border-radius:9px;background:linear-gradient(160deg,#ffd9c4,#fff3ec)"></div><div style="aspect-ratio:1;border-radius:9px;background:linear-gradient(160deg,#1a1a1a,#0a0a0a)"></div></div>
      <div style="display:flex;gap:8px">${gpill('Approve ✓', '#fff', 'var(--grad)')}${gpill('Request a retouch', '#555', 'rgba(0,0,0,.05)')}</div></div>` },
  { tag: 'Step 5', title: 'Branding, once for every platform', body: 'Fill your branding details a single time, photo, headline, links, metrics and CTAs. We design it, and you preview the result on each platform: Instagram, X, LinkedIn, Facebook, TikTok and YouTube.',
    vis: `<div style="width:100%;max-width:224px">
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px">${['Instagram', 'X', 'LinkedIn', 'YouTube'].map((p, i) => gpill(p, i === 0 ? '#fff' : '#555', i === 0 ? 'var(--grad)' : 'rgba(0,0,0,.05)')).join('')}</div>
      <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff"><div style="height:42px;background:var(--grad)"></div><div style="padding:0 11px 11px"><div style="width:40px;height:40px;border-radius:50%;background:#fff;border:3px solid #fff;margin-top:-20px;box-shadow:0 4px 10px rgba(0,0,0,.12);display:grid;place-items:center;font-weight:900;font-size:13px;color:var(--orange)">NP</div><b style="font-size:11px;display:block;margin-top:6px">Nina Park</b></div></div></div>` },
  { tag: 'Step 6', title: 'Chat with your designer', body: 'Your dedicated designer is one message away on the right. Pick an element so they know which asset you mean. The orange dot tells you when a new reply lands.',
    vis: `<div style="width:100%;max-width:222px;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:#fff;box-shadow:0 10px 26px rgba(0,0,0,.07)">
      <div style="display:flex;align-items:center;gap:9px;padding:9px 11px;border-bottom:1px solid var(--line)"><span style="width:30px;height:30px;border-radius:50%;background:var(--grad);color:#fff;display:grid;place-items:center;font-weight:900;font-size:11px">B</span><span style="text-align:left"><span style="font-size:9.5px;font-weight:800;color:var(--orange)">Your designer</span><b style="display:block;font-size:12px;letter-spacing:-.02em">Brasero</b></span></div>
      <div style="padding:11px;background:var(--soft);display:flex;flex-direction:column;gap:6px"><span style="align-self:flex-start;background:#fff;border:1px solid var(--line);border-radius:12px;border-bottom-left-radius:4px;padding:7px 10px;font-size:11px;max-width:88%">Slide 2 is ready, want to take a look? 🔥</span></div></div>` },
];
let TUTI = 0;
function renderTut() {
  const s = TUT[TUTI];
  q('#tutTag').textContent = s.tag;
  q('#tutVis').innerHTML = s.vis;
  q('#tutTitle').textContent = s.title;
  q('#tutBody').textContent = s.body;
  q('#tutDots').innerHTML = TUT.map((_, i) => `<i class="${i === TUTI ? 'on' : ''}"></i>`).join('');
  q('#tutBack').style.visibility = TUTI === 0 ? 'hidden' : 'visible';
  q('#tutNext').textContent = TUTI === TUT.length - 1 ? 'Got it ✓' : 'Next →';
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
    const brand = e.target.closest('[data-brand]'); if (brand) { openTab({ kind: 'brand' }); return; }
    const back = e.target.closest('[data-catback]'); if (back) { CAT = null; renderSidebar(); return; }
    const cat = e.target.closest('[data-cat]'); if (cat) { CAT = cat.dataset.cat; renderSidebar(); return; }
    const it = e.target.closest('.deckitem'); if (it) { openTab({ kind: 'deck', id: it.dataset.deck }); }
  });

  // open-tabs bar (close ✕ vs activate) — talent-style
  q('#deckTabs').addEventListener('click', (e) => {
    const x = e.target.closest('[data-tabx]'); if (x) { e.stopPropagation(); closeTab(x.dataset.tabx); return; }
    const t = e.target.closest('[data-tab]'); if (t) activateTab(t.dataset.tab);
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

  // "How it works" guide
  q('#helpFab').addEventListener('click', () => { const card = q('#helpCard'); if (card.classList.contains('hide')) { TUTI = 0; renderTut(); card.classList.remove('hide'); } else card.classList.add('hide'); });
  q('#helpClose').addEventListener('click', () => q('#helpCard').classList.add('hide'));
  q('#tutBack').addEventListener('click', () => { if (TUTI > 0) { TUTI--; renderTut(); } });
  q('#tutNext').addEventListener('click', () => { if (TUTI < TUT.length - 1) { TUTI++; renderTut(); } else q('#helpCard').classList.add('hide'); });

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
