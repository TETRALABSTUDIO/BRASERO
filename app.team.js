/* ============================================================================
   app.team.js - owner + talent workspace (team bundle), lazy-loaded for roles
   'owner' and 'talent'. Ported from panel.html into the unified app shell:
   owner admin (dashboard / projects / talents / CRM + impersonation) and the
   shared project board (brief · elements · script/design · client chat), with
   owner-only controls gated on ME.is_owner. Login is handled by app.html; this
   module assumes an authenticated session (it only adds the must_reset screen).
   Client code never loads this file (clients load app.client.js).
   ========================================================================== */
import { API, igUser, compress, fmtMsgTime, parseSlides, sanitizeSlide, slidesViewHTML, slideMeta, brandBriefView } from './app.core.js';

/* ---- module state ---- */
let R = null, CTX = null;                 // mount root + ctx, stable across re-mounts
let docWired = false;                     // document-level listeners attached once
const $ = s => R.querySelector(s);
const $$ = s => [...R.querySelectorAll(s)];

const esc = s => (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const initials = s => { const p = (s || '').trim().split(/[\s@.]+/).filter(Boolean); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); };
function avatar(t, size, extra) { return t.photo ? `<img class="avatar ${size}" src="${esc(t.photo)}" ${extra || ''}>` : `<div class="avatar ${size}" ${extra || ''}>${esc(initials(t.name || t.email))}</div>`; }
/* White bubble with the branding glyph (orange-gradient person, #ic-brand sprite)
   sized to 90% as the default client avatar. */
const USER_GLYPH = '<svg class="iav__usr" viewBox="0 0 120 120" fill="none" aria-hidden="true"><use href="#ic-brand"/></svg>';
// Plan glyphs (orange gradient) for the little badge on the client's avatar.
const PLAN_ICON = {
  starter: '<svg class="iavbadge__i" viewBox="0 0 109 77" fill="none" aria-hidden="true"><path d="M79.1201 3.31964C73.0367 -1.10655 64.7991 -1.10654 58.7157 3.31964L36.7652 19.2903C30.6817 23.7165 28.1362 31.5621 30.4598 38.7238L38.8442 64.565C41.1678 71.7267 47.8322 76.5755 55.3518 76.5755H82.484C90.0036 76.5755 96.668 71.7267 98.9916 64.565L107.376 38.7238C109.7 31.5621 107.154 23.7165 101.071 19.2903L79.1201 3.31964Z" fill="url(#ember_g0)"/><path d="M27.006 36.5291C23.6878 34.1094 19.1946 34.1094 15.8763 36.5291L3.90332 45.2597C0.585077 47.6794 -0.803414 51.9683 0.464042 55.8834L5.03732 70.0099C6.30478 73.925 9.93989 76.5757 14.0415 76.5757H28.8409C32.9425 76.5757 36.5776 73.9249 37.845 70.0099L42.4183 55.8834C43.6858 51.9683 42.2973 47.6794 38.979 45.2597L27.006 36.5291Z" fill="url(#ember_g1)"/><defs><linearGradient id="ember_g0" x1="107.1" y1="22.1804" x2="39.1783" y2="72.2445" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient><linearGradient id="ember_g1" x1="42.2679" y1="46.8396" x2="5.16169" y2="74.1294" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient></defs></svg>',
  flame: '<svg class="iavbadge__i" viewBox="0 0 96 104" fill="none" aria-hidden="true"><g opacity="0.6"><path d="M60.4144 34.2834C58.7515 29.1812 60.0019 22.4318 65.3675 22.3364C68.1653 22.2867 70.9717 23.5077 73.3489 25.9993L90.1678 43.6285C94.829 48.5143 96.7795 53.0313 94.9991 58.5188L88.5748 78.3188C86.7944 83.8063 81.688 87.5215 75.9264 87.5215H55.1371C49.3754 87.5215 44.2691 83.8062 42.4886 78.3188L36.0644 58.5188C33.5971 50.9145 45.7002 50.5691 50.2504 57.1423L52.9287 61.0114C54.9974 63.9999 59.5524 63.5192 60.9517 60.1646L64.7289 51.1092C65.1524 50.094 65.1978 48.9607 64.857 47.9148L60.4144 34.2834Z" fill="url(#flame_g0)"/></g><path d="M56.1858 19.0523C58.8373 10.9166 56.8435 0.154374 48.288 0.00232682C43.8267 -0.0769576 39.3518 1.86992 35.5614 5.84296L8.74301 33.9533C1.31046 41.7439 -1.79962 48.9465 1.03936 57.6965L11.2831 89.2683C14.122 98.0182 22.2643 103.942 31.4515 103.942H64.6008C73.7879 103.942 81.9302 98.0182 84.7692 89.2683L95.0129 57.6965C98.947 45.5711 79.6483 45.0203 72.3927 55.5016L68.1221 61.671C64.8234 66.4363 57.5604 65.6697 55.3292 60.3208L49.3062 45.8817C48.6309 44.2629 48.5585 42.4556 49.102 40.788L56.1858 19.0523Z" fill="url(#flame_g1)"/><defs><linearGradient id="flame_g0" x1="94.7924" y1="41.2165" x2="39.1394" y2="77.9406" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient><linearGradient id="flame_g1" x1="1.36893" y1="30.1073" x2="90.1096" y2="88.6653" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient></defs></svg>',
  burst: '<svg class="iavbadge__i" viewBox="0 0 128 82" fill="none" aria-hidden="true"><path d="M9.26424 28.1323C5.47213 29.4555 1.85979 31.8179 0.728004 35.6714C-0.242668 38.9764 -0.242667 42.4987 0.728007 45.8037C1.8598 49.6573 5.47213 52.0196 9.26424 53.3429L62.8085 72.0268C66.6006 73.35 69.7196 76.0708 73.0368 78.3351C77.5564 81.42 83.3533 82.3518 88.7723 80.5936L115.553 71.9045C122.975 69.4963 128 62.5897 128 54.7968L128 26.6783C128 18.8855 122.975 11.9789 115.553 9.57072L88.7723 0.88162C83.3532 -0.876626 77.5564 0.0552096 73.0368 3.1401C69.7196 5.40435 66.6006 8.12515 62.8085 9.44838L9.26424 28.1323Z" fill="url(#meteor_g0)"/><path d="M52.0753 30.1646C47.4882 36.4692 47.4882 45.0062 52.0753 51.3107L68.6265 74.0591C73.2136 80.3637 81.3443 83.0018 88.7664 80.5936L115.547 71.9045C122.969 69.4964 127.994 62.5898 127.994 54.7969L127.994 26.6784C127.994 18.8856 122.969 11.9789 115.547 9.5708L88.7664 0.881704C81.3443 -1.52643 73.2136 1.11167 68.6265 7.41624L52.0753 30.1646Z" fill="url(#meteor_g1)"/><path d="M70.1655 34.9433C67.575 38.5037 67.575 43.3248 70.1655 46.8851L79.5125 59.7318C82.1029 63.2922 86.6946 64.782 90.8861 63.4221L106.01 58.5151C110.201 57.1551 113.039 53.2548 113.039 48.8539L113.039 32.9745C113.039 28.5736 110.201 24.6733 106.01 23.3133L90.8861 18.4063C86.6946 17.0464 82.1029 18.5362 79.5125 22.0966L70.1655 34.9433Z" fill="url(#meteor_g2)"/><defs><linearGradient id="meteor_g0" x1="17.742" y1="62.1273" x2="135.169" y2="42.8475" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000" stop-opacity="0.6"/><stop offset="1" stop-color="#F87000" stop-opacity="0.6"/></linearGradient><linearGradient id="meteor_g1" x1="1.83409" y1="23.5996" x2="76.946" y2="108.319" gradientUnits="userSpaceOnUse"><stop stop-color="#FF0000"/><stop offset="1" stop-color="#F87000"/></linearGradient><linearGradient id="meteor_g2" x1="81.2039" y1="18.5677" x2="110.504" y2="58.3196" gradientUnits="userSpaceOnUse"><stop stop-color="#F87000"/><stop offset="1" stop-color="#FF0000"/></linearGradient></defs></svg>',
};
function clientAv(o, cls) {
  const ic = (o && PLAN_ICON[o.plan]) || '';
  const badge = ic ? `<span class="iavbadge">${ic}</span>` : '';
  return `<span class="iavw"><span class="iav ${cls || ''}">${USER_GLYPH}</span>${badge}</span>`;
}

const PLAN_NAMES = { starter: 'Ember', flame: 'Flame', burst: 'Meteor' };
const PLAN_LOGO = { starter: 'ember', flame: 'flame', burst: 'meteor' };
const planName = p => PLAN_NAMES[p] || p || '';

let TOKEN = '', ME = null, REF = '', ORDERS = [], TALENTS = [];
let ADMIN = { orders: [], leads: [], talents: [] };

/* ---- authenticated fetch (Bearer = current session) ---- */
async function api(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: JSON.stringify(body) });
  if (r.status === 401) { doLogout(); throw new Error('unauthorized'); }
  return r.json();
}
/* fetch as a specific token (owner token while impersonating) */
async function apiAs(token, body) { try { const r = await fetch(API + '/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }); return await r.json(); } catch (e) { return { ok: false }; } }

function doLogout() { ['brasero_session', 'brasero_owner_session', 'brasero_owner_name', 'brasero_owner_email'].forEach(k => localStorage.removeItem(k)); TOKEN = ''; ME = null; location.href = 'app.html'; }

/* compress / fmtMsgTime / parseSlides / sanitizeSlide / slidesViewHTML are
   shared (app.core.js); the slide editor + renumber helpers stay team-local. */

const STUDIO_LOGO = '<svg class="logo" viewBox="0 0 798 220" fill="none" style="height:46px"><use href="#brasero-studio"/></svg>';

/* ============================================================================
   MARKUP - the authenticated app shell (admin + board + modals), injected once.
   ========================================================================== */
function shellHTML() {
  return `
  <div class="teamapp">
    <div id="adminApp" class="adminapp hide">
      <aside class="aside">
        <div class="aside__brand">${STUDIO_LOGO}</div>
        <nav class="aside__nav" id="adminNav">
          <button class="navi on" type="button" data-sec="dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg> Dashboard</button>
          <button class="navi" type="button" data-sec="projects"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> Projects</button>
          <button class="navi" type="button" data-sec="talents"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 20a5.5 5.5 0 0 0-3-4.9"/></svg> Talents</button>
          <button class="navi" type="button" data-sec="crm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h4l2 3h6l2-3h4"/><path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg> CRM</button>
          <button class="navi" type="button" data-sec="emails"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg> Emails</button>
        </nav>
        <div class="aside__foot">
          <button class="b-grad b-sm" id="newProject" type="button" style="width:100%">+ New project</button>
          <div class="side__me" id="adminMe"></div>
        </div>
      </aside>
      <main class="amain">
        <section class="asec" id="sec-dashboard"></section>
        <section class="asec hide" id="sec-projects"></section>
        <section class="asec hide" id="sec-talents">
          <div class="sechead"><h2>Talents</h2><button class="b-grad b-sm" id="openTalentModal" type="button">+ Create talent</button></div>
          <div class="tgrid" id="teamGrid"></div>
        </section>
        <section class="asec hide" id="sec-crm"></section>
        <section class="asec hide" id="sec-emails"></section>
      </main>
    </div>

    <div id="detail" class="hide">
      <div class="board" id="board">
        <aside class="board__list">
          <div class="side__brand" id="sideTop">
            <svg class="logo-svg" viewBox="0 0 798 189" fill="none"><use href="#brasero-mark"/></svg>
            <div class="side__actions">
              <button type="button" class="oswitch hide" id="toDash" title="Back to dashboard" aria-label="Back to dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
              <button type="button" class="oswitch" id="switcherBtn" title="Switch project" aria-label="Switch project"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg></button>
            </div>
            <div class="switcher__menu hide" id="switcherMenu"></div>
          </div>
          <div class="side__order" id="orderProfile">
            <div class="cprofile">
              <div class="cprofile__av" id="oAvatar"></div>
              <div class="cprofile__nrow">
                <h2 class="cprofile__name" id="oName"></h2>
                <button type="button" class="cprofile__brief" id="briefBtn" title="View the brief" aria-label="View the brief"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a0 0 0 0 1 0 0H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg></button>
              </div>
              <div class="cprofile__ig" id="oIg"></div>
              <div class="side__badges" id="oBadges"></div>
              <button type="button" class="cprofile__cv hide" id="clientView" title="Copy a link to open this project's client view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg> <span>Copy client link</span></button>
            </div>
          </div>
          <div id="deckList"></div>
          <div class="side__foot"><button class="b-grad b-sm" id="addDeck" style="width:100%">+ Add element</button></div>
          <div class="side__me" id="sideMe"></div>
        </aside>
        <div class="board__right">
          <div class="dtabs hide" id="boardTabs"></div>
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
                <label class="chat__clip" id="chatClip" title="Attach images"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.6 1.6 0 0 1-2.3-2.3l7.8-7.8"/></svg><input type="file" id="chatFiles" accept="image/*" multiple hidden></label>
                <button class="b-grad b-sm" id="chatSend" type="submit">Send</button>
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
              <button class="b-ghost b-sm" id="tutBack" type="button">← Back</button>
              <button class="b-grad b-sm" id="tutNext" type="button">Next →</button>
            </div>
          </div>
          <button class="helpfab" id="helpFab" type="button" title="How it works" aria-label="How it works"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.4c.8.7 1 1.3 1 2.6h6c0-1.3.2-1.9 1-2.6A6 6 0 0 0 12 3z"/></svg></button>
        </div>
        <button class="msgfab" id="msgFab" type="button" title="Messages" aria-label="Messages"><span class="msgfab__dot hide" id="chatDotFab"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.1 7.6L3 21l1.9-5.9A8.4 8.4 0 1 1 21 11.5z"/></svg></button>
      </div>
    </div>

    <div class="modal modal--panel hide" id="newModal">
      <div class="modalc modalc--wide">
        <div class="modalc__h"><h3>New project</h3><button type="button" class="mx" id="npClose">✕</button></div>
        <form id="npForm">
          <div class="np-sec">
            <div class="np-sec__t">Client</div>
            <div class="grid2">
              <div class="field"><label>Client name</label><input id="npName" placeholder="Nina Park"></div>
              <div class="field"><label>Client email</label><input id="npEmail" type="email" placeholder="nina@brand.com" required></div>
            </div>
            <div class="grid2">
              <div class="field"><label>Instagram handle</label><input id="npIg" placeholder="@brand"></div>
              <div class="field"><label>Phone (optional)</label><input id="npPhone" placeholder="+1 555 …"></div>
            </div>
          </div>
          <div class="np-sec">
            <div class="np-sec__t">Pack</div>
            <div class="planpick" id="npPlans"></div>
            <div class="grid2">
              <div class="field"><label>Billing</label>
                <div class="btoggle" id="npBilling">
                  <button type="button" data-bill="once" class="on">One-time</button>
                  <button type="button" data-bill="sub">Subscription <span class="save">−10%</span></button>
                </div>
              </div>
              <div class="field"><label>Number of decks</label><input id="npDecks" type="number" min="0" max="50" value="10"></div>
            </div>
          </div>
          <div class="np-sec">
            <div class="np-sec__t">Upsells <span class="np-opt">optional</span></div>
            <div class="upcards" id="npAddons"></div>
          </div>
          <div class="np-sec">
            <div class="np-sec__t">Brief <span class="np-opt">optional</span>
              <button type="button" class="np-fill" id="npFill" title="Fill with a random credible sample"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3v4M3 5h4M6 17v4M4 19h4" stroke-linecap="round"/><path d="M19 3l1.6 3.4L24 8l-3.4 1.6L19 13l-1.6-3.4L14 8l3.4-1.6z" fill="currentColor" stroke="none"/><path d="M14.5 14.5l5 5" stroke-linecap="round"/></svg> Auto-fill</button>
            </div>
            <div class="grid2">
              <div class="field"><label>Page / brand</label><input id="npBPage" placeholder="e.g. Wealth Notes"></div>
              <div class="field"><label>#1 goal</label><select id="npBGoal"><option value="">Select…</option><option>Reach &amp; virality</option><option>Saves &amp; shares</option><option>Followers growth</option><option>Sales / leads</option></select></div>
            </div>
            <div class="field"><label>What is the page about?</label><textarea id="npBNiche" style="min-height:64px" placeholder="Niche, topics and angle…"></textarea></div>
            <div class="field"><label>Target audience</label><textarea id="npBAudience" style="min-height:64px" placeholder="Ideal follower: age, stage, what they want…"></textarea></div>
            <div class="field"><label>Brand vibe</label><textarea id="npBStyle" style="min-height:64px" placeholder="Bold, high-contrast, warm accents, big type…"></textarea></div>
            <div class="field"><label>Brand colors</label><div id="npBColors" class="palette"></div></div>
            <div class="field"><label>Typography</label><div id="npBTypo" class="typo"></div></div>
            <div class="field"><label>Brand logo <span style="font-weight:600;color:#bbb;font-size:12px">PNG or SVG · optional</span></label><div id="npBLogo" class="logo-up"></div></div>
            <div class="field"><label>Instagram inspiration</label><div id="npBInspo" class="iglist"></div></div>
            <div class="field"><label>Anything else to know?</label><textarea id="npBNotes" style="min-height:64px" placeholder="Tell us anything…"></textarea></div>
          </div>
          <div class="np-sec">
            <div class="np-sec__t">Assignment</div>
            <div class="field"><label>Assign to talent (optional)</label><select id="npTalent"><option value="">Unassigned</option></select></div>
          </div>
          <div class="np-recap" id="npRecap"></div>
          <div class="np-actions">
            <button class="b-grad" type="submit" id="npSubmit">Create project →</button>
            <button class="b-del b-sm hide" type="button" id="npDelete">Delete project</button>
            <span class="err" id="npErr" style="margin-top:0"></span>
          </div>
        </form>
      </div>
    </div>

    <div class="modal modal--panel hide" id="talentModal">
      <div class="modalc">
        <div class="modalc__h"><h3>Create a talent account</h3><button type="button" class="mx" id="tmClose">✕</button></div>
        <p style="font-size:13px;color:var(--grey);margin:-8px 0 16px">We generate a temporary password to share with them. They change it on first login.</p>
        <form id="talentForm">
          <div class="grid2">
            <div class="field"><label>Name (optional)</label><input id="tName" placeholder="Jane Doe"></div>
            <div class="field"><label>Email</label><input id="tEmail" type="email" placeholder="jane@brasero.studio" required></div>
          </div>
          <label style="display:flex;align-items:center;gap:7px;margin:0 0 16px"><input type="checkbox" id="tOwner" style="width:auto"> Make owner</label>
          <div style="display:flex;align-items:center;gap:10px">
            <button class="b-grad" type="submit">Create account →</button>
            <span class="err" id="tErr"></span>
          </div>
        </form>
        <div id="tCreated" class="tcreated hide"></div>
      </div>
    </div>

    <div class="modal modal--panel hide" id="profileModal">
      <div class="modalc">
        <div class="modalc__h"><h3 id="pfTitle">My profile</h3><button type="button" class="mx" id="pfClose">✕</button></div>
        <div id="pfBody"></div>
      </div>
    </div>

    <div class="lb" id="lb"><img id="lbImg" alt=""><button type="button" class="lb__dl" id="lbDl">⬇ Download</button></div>
    <div class="impbar hide" id="impBar"></div>

    <div class="modal modal--panel hide" id="addElemModal">
      <div class="modalc">
        <div class="modalc__h"><h3>Add elements</h3><button type="button" class="mx" id="aeClose">✕</button></div>
        <p style="font-size:13px;color:var(--grey);margin:-8px 0 16px">The same packs a client can add, added straight to this order, no charge.</p>
        <div id="aeBody"></div>
      </div>
    </div>

    <div class="modal modal--panel hide" id="briefModal">
      <div class="briefpage">
        <div class="briefpage__top">
          <div class="briefpage__id" id="briefHead"></div>
          <div class="briefpage__topr"><span class="briefpage__tag">Project brief</span><button type="button" class="mx" id="bmClose" title="Close">✕</button></div>
        </div>
        <div class="briefpage__body"><div id="briefBody"></div></div>
      </div>
    </div>
  </div>`;
}

/* ============================================================================
   MOUNT
   ========================================================================== */
export async function mount(root, ctx) {
  R = root; CTX = ctx;
  TOKEN = localStorage.getItem('brasero_session') || '';
  document.body.classList.remove('appmode');
  R.innerHTML = shellHTML();
  wireStatic();
  wireDocOnce();
  await boot();
}

async function boot() {
  let d;
  try { d = await api('/api/admin', { action: 'list' }); }
  catch (e) { return; }
  if (!d.ok) { doLogout(); return; }
  ME = d.me; ORDERS = d.orders || [];
  if (ME.must_reset) { renderReset(); return; }
  renderImpBar();
  if (ME.is_owner) {
    const dash = await api('/api/admin', { action: 'dashboard' });
    if (dash.ok) { ADMIN = { orders: dash.orders || [], leads: dash.leads || [], talents: dash.talents || [] }; ORDERS = ADMIN.orders; TALENTS = ADMIN.talents; }
  }
  // restore exactly where we were before the refresh (project + tab, or admin section)
  const nav = localStorage.getItem('brasero_nav') || '';
  const last = localStorage.getItem('brasero_last_ref');
  const canOrder = !!(last && ORDERS.some(o => o.ref === last));
  if (nav === 'order' && canOrder) { openOrder(last, true); }
  else if (ME.is_owner) { showAdmin(SECS.includes(nav) ? nav : 'dashboard'); }
  else { const target = canOrder ? last : (ORDERS[0] && ORDERS[0].ref); if (target) openOrder(target, true); else renderTalentEmpty(); }
}

/* talents with no assigned projects yet */
function renderTalentEmpty() {
  document.body.classList.remove('appmode');
  $('#adminApp').classList.add('hide'); $('#detail').classList.add('hide');
  const host = document.createElement('div');
  host.className = 'empty'; host.style.minHeight = '70vh';
  host.innerHTML = `<div><b style="font-size:17px">No projects assigned yet</b><p style="margin-top:8px;color:var(--grey)">When a project is assigned to you it will show up here.</p><button class="b-ghost b-sm" id="talentOut" style="margin-top:16px">Sign out</button></div>`;
  R.querySelector('.teamapp').appendChild(host);
  host.querySelector('#talentOut').onclick = doLogout;
}

/* ---------- first-login forced password reset ---------- */
function renderReset() {
  document.body.classList.remove('appmode');
  R.innerHTML = `<div class="authwrap">
    <svg class="logo" viewBox="0 0 798 220" fill="none" style="height:38px;margin-bottom:18px;color:var(--ink)"><use href="#brasero-studio"/></svg>
    <h1 style="font-size:22px;font-weight:900;letter-spacing:-.03em;margin-bottom:6px">Choose a password</h1>
    <p>Set a new password to finish setting up your account.</p>
    <form id="resetForm">
      <div class="field"><label>New password</label><input id="resetPass" type="password" placeholder="Min 8 characters, 1 uppercase" autocomplete="new-password" required></div>
      <button class="b-grad" id="resetBtn" style="width:100%" type="submit">Save &amp; continue →</button>
      <div class="err" id="resetErr"></div>
    </form>
  </div>`;
  setTimeout(() => $('#resetPass').focus(), 30);
  $('#resetForm').addEventListener('submit', async e => {
    e.preventDefault(); const p = $('#resetPass').value; $('#resetErr').textContent = '';
    const pe = pwError(p); if (pe) { $('#resetErr').textContent = pe; return; }
    const btn = $('#resetBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    const r = await api('/api/admin', { action: 'update_me', password: p });
    if (r.ok) { mount(R, CTX); }
    else { $('#resetErr').textContent = 'Something went wrong.'; btn.disabled = false; btn.textContent = 'Save & continue →'; }
  });
}

/* ========== OWNER ADMIN SHELL ========== */
const STATE = { todo: ['todo', 'To start', '#dc2626'], progress: ['progress', 'In progress', '#2563eb'], done: ['done', 'Completed', '#16a34a'] };
function spill(st) { const [c, l] = STATE[st] || STATE.todo; return `<span class="spill ${c}">${l}</span>`; }
const fmtMoney = c => '$' + Math.round((c || 0) / 100).toLocaleString('en-US');
const fmtDate = s => { if (!s) return '-'; try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return '-'; } };
function talentObj(email) { return email ? (ADMIN.talents || []).find(x => (x.email || '').toLowerCase() === email.toLowerCase()) : null; }
function talentName(email) { if (!email) return 'Unassigned'; const t = talentObj(email); return t ? (t.name || t.email) : email; }
const SECS = ['dashboard', 'projects', 'talents', 'crm', 'emails'];
function showAdmin(sec) { stopMsgPoll(); document.body.classList.remove('appmode'); $('#detail').classList.add('hide'); $('#adminApp').classList.remove('hide'); renderAdminMe(); navTo(sec || 'dashboard'); }
function navTo(sec) {
  try { localStorage.setItem('brasero_nav', sec); } catch (e) {}
  $('#adminNav').querySelectorAll('.navi').forEach(b => b.classList.toggle('on', b.dataset.sec === sec));
  SECS.forEach(s => $('#sec-' + s).classList.toggle('hide', s !== sec));
  if (sec === 'dashboard') renderDashboard();
  else if (sec === 'projects') renderProjectsSection();
  else if (sec === 'talents') loadTeam();
  else if (sec === 'crm') renderCRMSection();
  else if (sec === 'emails') renderEmailsSection();
}
/* profile actions: sign-out pill + (owner) account switcher */
const ACCT_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg>';
const ACCT_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>';
function impersonating() { return !!localStorage.getItem('brasero_owner_session'); }
function ownerTok() { return localStorage.getItem('brasero_owner_session') || ((ME && ME.is_owner) ? TOKEN : ''); }
function showSwitcher() { return !!ownerTok(); }
function clearNav() { ['brasero_last_ref', 'brasero_nav', 'brasero_last_tab', 'brasero_open_tabs'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} }); }
const ACCT_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
// Role glyphs for the avatar corner bubble: crown = owner, spark = talent.
const IC_CROWN = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7.5l4 3.2L12 4l5 6.7 4-3.2L19 19H5L3 7.5z"/></svg>';
const IC_SPARK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z"/></svg>';
// Avatar with a small role bubble bottom-right (owner crown / talent spark).
function avatarRole(t, size) {
  const owner = !!(t && t.is_owner);
  return `<span class="avrole"><span class="avrole__ph">${avatar(t, size)}</span><span class="avrole__b ${owner ? 'avrole__b--owner' : 'avrole__b--talent'}" title="${owner ? 'Owner' : 'Talent'}">${owner ? IC_CROWN : IC_SPARK}</span></span>`;
}
function meActions(logoutId) {
  const sw = showSwitcher() ? `<button type="button" class="acctsw__ic" data-acct-menu title="Switch account">${ACCT_UP}</button>` : '';
  return `<div class="acctsw"><button type="button" class="acctsw__ic" data-profile title="Edit my profile">${ACCT_GEAR}</button>${sw}<button type="button" class="acctsw__ic" id="${logoutId}" title="Sign out">${ACCT_OUT}</button><div class="acctsw__menu hide" data-acct-list></div></div>`;
}
function wireAcct(rootEl, logoutId) {
  if (logoutId) { const lo = R.querySelector('#' + logoutId); if (lo) lo.onclick = doLogout; }
  const pf = rootEl.querySelector('[data-profile]'); if (pf) pf.onclick = openProfile;
  const bk = rootEl.querySelector('[data-imp-back]'); if (bk) bk.onclick = switchBack;
  const btn = rootEl.querySelector('[data-acct-menu]'), menu = rootEl.querySelector('[data-acct-list]');
  if (!btn || !menu) return;
  btn.onclick = async e => {
    e.stopPropagation();
    if (!menu.classList.contains('hide')) { menu.classList.add('hide'); return; }
    R.querySelectorAll('[data-acct-list]').forEach(m => m.classList.add('hide'));
    menu.innerHTML = '<div class="acctsw__loading">Loading…</div>'; menu.classList.remove('hide');
    const ot = ownerTok(); if (!ot) { menu.innerHTML = '<div class="acctsw__loading">Unavailable.</div>'; return; }
    const r = await apiAs(ot, { action: 'list_talents' }); const list = (r && r.ok && r.talents) ? r.talents : [];
    const ownerEmail = localStorage.getItem('brasero_owner_email') || '';
    const back = impersonating() ? `<button type="button" class="acctsw__row acctsw__back" data-acct-back><span class="acctsw__bic">↩</span><span class="acctsw__row-i"><span class="acctsw__row-n">Back to ${esc(localStorage.getItem('brasero_owner_name') || 'my account')}</span><span class="acctsw__row-r">Your owner account</span></span></button>` : '';
    const rows = list.filter(t => t.email !== ME.email && t.email !== ownerEmail).map(t => `<button type="button" class="acctsw__row" data-acct="${esc(t.email)}">${avatar(t, 'xs')}<span class="acctsw__row-i"><span class="acctsw__row-n">${esc(t.name || t.email)}</span><span class="acctsw__row-r">${t.is_owner ? 'Owner' : 'Talent'}</span></span></button>`).join('');
    menu.innerHTML = (back + rows) || '<div class="acctsw__loading">No other accounts.</div>';
  };
  menu.onclick = e => { if (e.target.closest('[data-acct-back]')) { switchBack(); return; } const r = e.target.closest('[data-acct]'); if (r) loginAs(r.dataset.acct); };
}
async function loginAs(email) {
  if (!localStorage.getItem('brasero_owner_session') && ME && ME.is_owner) {
    localStorage.setItem('brasero_owner_session', TOKEN);
    localStorage.setItem('brasero_owner_name', ME.name || ME.email || 'owner');
    localStorage.setItem('brasero_owner_email', ME.email || '');
  }
  const ot = ownerTok(); if (!ot) return;
  const r = await apiAs(ot, { action: 'login_as', email });
  if (r && r.ok && r.token) { localStorage.setItem('brasero_session', r.token); clearNav(); location.reload(); }
  else alert('Could not switch account.');
}
function switchBack() {
  const ot = localStorage.getItem('brasero_owner_session'); if (!ot) return;
  localStorage.setItem('brasero_session', ot);
  ['brasero_owner_session', 'brasero_owner_name', 'brasero_owner_email'].forEach(k => localStorage.removeItem(k));
  clearNav(); location.reload();
}
function renderImpBar() {
  const el = $('#impBar'); if (!el) return;
  if (!impersonating() || !ME) { el.classList.add('hide'); el.innerHTML = ''; return; }
  el.classList.remove('hide');
  el.innerHTML = `<span class="impbar__l">Viewing as <b>${esc(ME.name || ME.email)}</b></span>
    <div class="acctsw">
      <button type="button" class="acctsw__ic" data-acct-menu title="Switch account">${ACCT_UP}</button>
      <button type="button" class="impbar__back" data-imp-back>↩ Back to ${esc(localStorage.getItem('brasero_owner_name') || 'owner')}</button>
      <div class="acctsw__menu hide" data-acct-list></div>
    </div>`;
  wireAcct(el, null);
}
function renderAdminMe() {
  const el = $('#adminMe'); if (!el || !ME) return;
  el.innerHTML = `${avatarRole(ME, 'sm')}<div class="side__me-info"><span class="side__me-name" title="${esc(ME.name || ME.email)}">${esc(ME.name || ME.email.split('@')[0])}</span></div>${meActions('adminLogout')}`;
  wireAcct(el, 'adminLogout');
}

/* ----- self profile editor (name · password · photo · weekly hours · time zone) ----- */
const PF_DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
function tzList() { try { const z = Intl.supportedValuesOf('timeZone'); if (z && z.length) return z; } catch (_) {} return ['UTC', 'Europe/Paris', 'Europe/London', 'Europe/Madrid', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney']; }
function guessTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { return ''; } }
// Password policy: at least 8 chars and one uppercase letter. Returns '' if ok.
function pwError(p) {
  if (!p || p.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(p)) return 'Password must include at least one uppercase letter.';
  return '';
}
let PF_PHOTO;      // undefined = keep current photo
let PF_TARGET;     // the talent being edited (ME when self-editing)
let PF_OWNER_EDIT; // true when the owner edits another talent → show the rates column
// Open the self-profile editor (any talent editing themselves).
function openProfile() { PF_TARGET = ME; PF_OWNER_EDIT = false; PF_PHOTO = undefined; renderProfileForm(); $('#profileModal').classList.remove('hide'); }
// Owner: edit a talent in the SAME overlay, plus the agreed-rates column.
function openTalentEditor(email) {
  const t = TALENTS.find(x => (x.email || '').toLowerCase() === (email || '').toLowerCase());
  if (!t) return;
  PF_TARGET = t; PF_OWNER_EDIT = true; PF_PHOTO = undefined; renderProfileForm();
  $('#profileModal').classList.remove('hide');
}
function renderProfileForm() {
  const U = PF_TARGET; if (!U) return;
  $('#pfTitle').textContent = PF_OWNER_EDIT ? `Edit ${U.name || U.email}` : 'My profile';
  $('#profileModal').querySelector('.modalc').classList.toggle('modalc--wide', PF_OWNER_EDIT);
  const av = (U.availability && typeof U.availability === 'object') ? U.availability : {};
  const tz = U.timezone || (PF_OWNER_EDIT ? '' : guessTz());
  const tzOpts = (PF_OWNER_EDIT && !tz ? '<option value="">Not set</option>' : '') + tzList().map(z => `<option value="${esc(z)}" ${z === tz ? 'selected' : ''}>${esc(z)}</option>`).join('');
  const photo = PF_PHOTO !== undefined ? PF_PHOTO : (U.photo || '');
  const days = PF_DAYS.map(([k, label]) => { const d = av[k] || {}; const on = !!d.on;
    return `<div class="pfday" data-day="${k}">
      <label class="pfday__t"><input type="checkbox" data-on ${on ? 'checked' : ''}><span>${label}</span></label>
      <div class="pfday__h"><input type="time" data-start value="${esc(d.start || '09:00')}" ${on ? '' : 'disabled'}><span>–</span><input type="time" data-end value="${esc(d.end || '17:00')}" ${on ? '' : 'disabled'}></div>
    </div>`; }).join('');
  const left = `
    <div class="pfhead">
      <label class="pfphoto" title="Change photo">${photo ? `<img src="${esc(photo)}" alt="">` : avatar(U, 'lg')}<span class="pfphoto__edit">Change</span><input type="file" accept="image/*" hidden data-pf-photo></label>
      <div class="pffields">
        <div class="field"><label>Name</label><input id="pfName" value="${esc(U.name || '')}" placeholder="Name"></div>
        <div class="field"><label>New password <span class="field__opt">leave blank to keep · min 8 chars, 1 uppercase</span></label><input id="pfPass" type="password" autocomplete="new-password" placeholder="••••••"></div>
      </div>
    </div>
    <div class="field"><label>Time zone</label><select id="pfTz">${tzOpts}</select></div>
    <div class="field"><label>Working hours</label></div>
    <div class="pfdays">${days}</div>`;
  const rates = PF_OWNER_EDIT ? rateColumnHTML(U) : '';
  $('#pfBody').innerHTML = `
    <div class="pfgrid ${PF_OWNER_EDIT ? 'pfgrid--rates' : ''}">
      <div class="pfgrid__main">${left}</div>
      ${rates}
    </div>
    <div class="err" id="pfErr" style="margin:6px 0"></div>
    <button type="button" class="b-grad" id="pfSave" style="width:100%">${PF_OWNER_EDIT ? 'Save talent' : 'Save profile'}</button>`;
  const body = $('#pfBody');
  body.querySelector('[data-pf-photo]').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { PF_PHOTO = await compress(f, 512, 0.8); renderProfileForm(); } catch (_) {} };
  body.querySelectorAll('.pfday').forEach(row => { const cb = row.querySelector('[data-on]'); cb.onchange = () => row.querySelectorAll('input[type=time]').forEach(t => t.disabled = !cb.checked); });
  body.querySelector('#pfSave').onclick = saveProfile;
}
// The agreed per-offer / per-upsell fee column (owner-only). Inputs in $, the
// value stored in cents. Used by the dashboard margin calc.
function rateColumnHTML(t) {
  const r = (t.rates && typeof t.rates === 'object') ? t.rates : {};
  const row = ([k, name, icon]) => { const v = r[k] != null ? (r[k] / 100) : '';
    return `<label class="prate"><span class="prate__ic">${icon}</span><span class="prate__n">${esc(name)}</span><span class="prate__in"><i>$</i><input type="number" min="0" step="1" inputmode="numeric" data-rate="${k}" value="${v}" placeholder="0"></span></label>`; };
  return `<div class="pfgrid__rates">
    <div class="prate__h">Agreed fee per offer</div>
    <div class="prate__sub">What you pay this talent. Drives the margin on the dashboard. Hidden from the talent.</div>
    <div class="prate__grp">${RATE_OFFERS.map(row).join('')}</div>
    <div class="prate__h" style="margin-top:14px">Upsells</div>
    <div class="prate__grp">${RATE_UPSELLS.map(row).join('')}</div>
  </div>`;
}
async function saveProfile() {
  const body = $('#pfBody'), errEl = $('#pfErr'); errEl.textContent = '';
  const availability = {};
  body.querySelectorAll('.pfday').forEach(row => { const on = row.querySelector('[data-on]').checked;
    availability[row.dataset.day] = { on, start: row.querySelector('[data-start]').value || '09:00', end: row.querySelector('[data-end]').value || '17:00' }; });
  const name = $('#pfName').value.trim(), pass = $('#pfPass').value, timezone = $('#pfTz').value;
  if (pass) { const pe = pwError(pass); if (pe) { errEl.textContent = pe; return; } }
  const payload = PF_OWNER_EDIT
    ? { action: 'update_talent', email: PF_TARGET.email, name, timezone, availability }
    : { action: 'update_me', name, timezone, availability };
  if (pass) payload.password = pass;
  if (PF_PHOTO !== undefined) payload.photo = PF_PHOTO;
  if (PF_OWNER_EDIT) {
    const rates = {};
    body.querySelectorAll('[data-rate]').forEach(inp => { const n = parseFloat(inp.value); if (isFinite(n) && n > 0) rates[inp.dataset.rate] = Math.round(n * 100); });
    payload.rates = rates;
  }
  const btn = $('#pfSave'), old = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    const r = await api('/api/admin', payload);
    if (r && r.ok) {
      $('#profileModal').classList.add('hide');
      if (PF_OWNER_EDIT) { TALENTS = r.talents || TALENTS; ADMIN.talents = TALENTS; renderTeam(); if (!$('#sec-dashboard').classList.contains('hide')) renderDashboard(); }
      else { ME = r.me || ME; if (CTX) CTX.session = ME; renderSideMe(); renderAdminMe(); }
    } else { errEl.textContent = 'Error: ' + ((r && r.error) || 'could not save'); btn.disabled = false; btn.textContent = old; }
  } catch (e) { errEl.textContent = 'Network error.'; btn.disabled = false; btn.textContent = old; }
}

/* ----- dashboard ----- */
let DPERIOD = '6m';
const PERIODS = [['30d', '30 days'], ['90d', '90 days'], ['6m', '6 months'], ['12m', '12 months'], ['all', 'All']];
function periodCutoff() { const now = new Date(); if (DPERIOD === '30d') return Date.now() - 30 * 864e5; if (DPERIOD === '90d') return Date.now() - 90 * 864e5; if (DPERIOD === '6m') { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d.getTime(); } if (DPERIOD === '12m') { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d.getTime(); } return 0; }
function ordersInPeriod() { const c = periodCutoff(); return ADMIN.orders.filter(o => !c || (o.created_at && new Date(o.created_at).getTime() >= c)); }
// Catmull-Rom → cubic-bezier smoothing: turns a point list into a fluid curve.
function smoothD(pts, t) {
  if (!pts.length) return '';
  if (pts.length < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  t = t == null ? 0.18 : t;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
// Smooth area: the curve, dropped to a baseline and closed (the "smoke" fill).
function smoothArea(pts, baseY) {
  if (!pts.length) return '';
  return smoothD(pts) + ` L ${pts[pts.length - 1][0].toFixed(1)} ${baseY} L ${pts[0][0].toFixed(1)} ${baseY} Z`;
}
// `valfn` lets the same buckets carry revenue OR margin (default: revenue).
function revSeries(orders, valfn) {
  valfn = valfn || (o => o.amount || 0);
  const now = new Date();
  if (DPERIOD === '30d') {
    const out = []; for (let i = 5; i >= 0; i--) { const end = now.getTime() - i * 5 * 864e5; out.push({ start: end - 5 * 864e5, end, label: new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: 0 }); }
    orders.forEach(o => { const t = new Date(o.created_at).getTime(); const b = out.find(x => t > x.start && t <= x.end); if (b) b.value += valfn(o); });
    return out.map(b => ({ label: b.label, value: b.value }));
  }
  const months = DPERIOD === '90d' ? 3 : DPERIOD === '12m' ? 12 : 6, out = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: d.getFullYear() + '-' + d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'short' }), value: 0 }); }
  orders.forEach(o => { const d = new Date(o.created_at); const k = d.getFullYear() + '-' + d.getMonth(); const m = out.find(x => x.key === k); if (m) m.value += valfn(o); });
  return out.map(m => ({ label: m.label, value: m.value }));
}
// Margin contributed by one order (revenue - talent cost); 0 when not priced.
const orderProfit = o => { const c = orderCost(o); return c == null ? 0 : (o.amount || 0) - c; };
// Optional `s2` draws a second line (e.g. margin) on the same scale, no area.
function lineChart(series, s2) {
  const W = 600, H = 150, pad = 10, n = series.length;
  const max = Math.max(1, ...series.map(s => s.value), ...(s2 || []).map(s => s.value));
  const xs = i => n <= 1 ? W / 2 : pad + i * (W - 2 * pad) / (n - 1), ys = v => H - (v / max) * (H - 24) - 8;
  if (!series.length) return '<div class="ph-sub">No data.</div>';
  const pts = series.map((s, i) => [xs(i), ys(s.value)]);
  const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" fill="#fff" stroke="url(#tgrad)" stroke-width="2.2"/>`).join('');
  const marginLine = s2 ? `<path d="${smoothD(s2.map((p, i) => [xs(i), ys(p.value)]))}" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 5"/>` : '';
  const labels = series.map((s, i) => `<text class="axl" x="${xs(i).toFixed(1)}" y="${H + 14}" text-anchor="middle">${esc(s.label)}</text>`).join('');
  return `<svg class="linec" viewBox="0 0 ${W} ${H + 20}" preserveAspectRatio="xMidYMid meet">
    <path d="${smoothArea(pts, H)}" fill="url(#sparkArea)"/><path d="${smoothD(pts)}" fill="none" stroke="url(#tgrad)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>${marginLine}${dots}${labels}</svg>`;
}
function planPie(orders) {
  const colors = { starter: '#f9a857', flame: '#f87000', burst: '#cf3500' }, names = { starter: 'Ember', flame: 'Flame', burst: 'Meteor' };
  const counts = {}; orders.forEach(o => { const p = o.plan || 'other'; counts[p] = (counts[p] || 0) + 1; });
  const total = orders.length, segs = Object.keys(counts).map(p => ({ name: names[p] || p, n: counts[p], color: colors[p] || '#c9c9c9' })).sort((a, b) => b.n - a.n);
  if (!total) return '<div class="pierow"><div class="pie empty"></div><div class="pielegend"><span style="color:var(--grey)">No orders in this period.</span></div></div>';
  let acc = 0; const stops = segs.map(s => { const a = acc / total * 360, b = (acc + s.n) / total * 360; acc += s.n; return `${s.color} ${a.toFixed(1)}deg ${b.toFixed(1)}deg`; });
  const legend = segs.map(s => `<div class="row"><i style="background:${s.color}"></i>${esc(s.name)}<b>${s.n} · ${Math.round(s.n / total * 100)}%</b></div>`).join('');
  return `<div class="pierow"><div class="pie" style="background:conic-gradient(${stops.join(',')})"></div><div class="pielegend">${legend}</div></div>`;
}
function kCell(l, v, s) { return `<div class="kcell"><div class="kcell__l">${l}</div><div class="kcell__v">${v}</div><div class="kcell__s">${s}</div></div>`; }
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
// Remaining/overdue time, short form (e.g. "2d 4h left" / "overdue 3h").
function relLeft(ms) { const late = ms < 0, abs = Math.abs(ms), h = Math.floor(abs / 36e5), d = Math.floor(h / 24), hr = h % 24, t = d > 0 ? `${d}d ${hr}h` : `${h}h`; return late ? `overdue ${t}` : `${t} left`; }
// Actionable items for the owner, surfaced on the dashboard (global, not period-bound):
// overdue / due-soon projects, unassigned projects, leads to recover. Sorted by urgency.
function needsAttention() {
  const now = Date.now(), out = [];
  (ADMIN.orders || []).forEach(o => {
    if ((o.state || 'todo') === 'done') return;
    const dms = deadlineMs(o, o.kinds) - now;
    if (dms < 0) out.push({ sev: 0, ref: o.ref, who: o.name || 'Untitled', tag: 'Overdue', meta: relLeft(dms) });
    else if (dms < 2 * 864e5) out.push({ sev: 1, ref: o.ref, who: o.name || 'Untitled', tag: 'Due soon', meta: relLeft(dms) });
    if (!o.talent_email) out.push({ sev: 2, ref: o.ref, who: o.name || 'Untitled', tag: 'Unassigned', meta: 'No talent yet' });
  });
  (ADMIN.leads || []).forEach(l => out.push({ sev: 3, lead: 1, who: l.name || l.email || 'Lead', tag: 'Lead', meta: planName(l.plan) || 'Abandoned checkout' }));
  return out.sort((a, b) => a.sev - b.sev);
}
function attnRow(a) {
  return `<button type="button" class="attn__row" ${a.lead ? 'data-attn-crm' : `data-attn-ref="${esc(a.ref)}"`}>
    <span class="attn__dot s${a.sev}"></span>
    <span class="attn__main"><span class="attn__who">${esc(a.who)}</span><span class="attn__tag s${a.sev}">${a.tag}</span></span>
    <span class="attn__meta">${esc(a.meta)}</span><span class="attn__go">${CHEV}</span>
  </button>`;
}
// Margin per order = revenue (o.amount) minus the assigned talent's agreed fee
// for the plan + each purchased upsell. null when no talent or no rate is set.
function orderCost(o) {
  const t = talentObj(o.talent_email), r = t && t.rates;
  if (!r) return null;
  let cost = 0, known = false;
  [o.plan, ...(Array.isArray(o.addons) ? o.addons : [])].forEach(k => { if (k && r[k] != null) { cost += r[k]; known = true; } });
  return known ? cost : null;
}
function renderDashboard() {
  const O = ordersInPeriod(), L = ADMIN.leads, T = (ADMIN.talents || []).filter(t => !t.is_owner);
  const active = O.filter(o => o.state !== 'done').length, done = O.filter(o => o.state === 'done').length;
  const revenue = O.reduce((s, o) => s + (o.amount || 0), 0);
  const priced = O.filter(o => orderCost(o) != null);
  const pricedRev = priced.reduce((s, o) => s + (o.amount || 0), 0), cost = priced.reduce((s, o) => s + orderCost(o), 0);
  const profit = pricedRev - cost, marginPct = pricedRev ? Math.round(profit / pricedRev * 100) : null;
  const attn = needsAttention(), shown = attn.slice(0, 6);
  $('#sec-dashboard').innerHTML = `
    <div class="sechead"><h2>Dashboard</h2>
      <div class="period" id="dperiod">${PERIODS.map(([k, l]) => `<button type="button" data-p="${k}" class="${DPERIOD === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div class="kstrip">
      ${kCell('Revenue', fmtMoney(revenue), O.length + ' paid order' + (O.length === 1 ? '' : 's'))}
      ${kCell('Margin', marginPct == null ? '—' : marginPct + '%', priced.length ? fmtMoney(profit) + ' profit' : 'set talent rates')}
      ${kCell('Active projects', active, done + ' completed')}
      ${kCell('Talents', T.length, 'in the studio')}
      ${kCell('Leads', L.length, 'unpaid / abandoned')}
    </div>
    <div class="panels">
      <div class="panel">
        <div class="panel__h"><h3>Revenue &amp; margin</h3><span class="panel__big">${fmtMoney(revenue)}</span></div>
        <div class="chartleg"><span class="rleg rleg--rev"><i></i>Revenue</span><span class="rleg rleg--margin"><i></i>Margin${priced.length ? ' · ' + fmtMoney(profit) : ''}</span></div>
        ${lineChart(revSeries(O), revSeries(O, orderProfit))}
      </div>
      <div class="panel"><div class="panel__h"><h3>Offers split</h3></div><div class="ph-sub">Packages bought in this period</div>${planPie(O)}</div>
    </div>
    <div class="panel attn">
      <div class="panel__h"><h3>Needs attention</h3>${attn.length ? `<span class="attn__count">${attn.length}</span>` : ''}</div>
      <div class="attn__list">${shown.length ? shown.map(attnRow).join('') : '<div class="attn__clear">✓ You\'re all caught up. Nothing needs your attention right now.</div>'}</div>
    </div>`;
  $('#dperiod').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { DPERIOD = b.dataset.p; renderDashboard(); } });
  $('#sec-dashboard').querySelectorAll('[data-attn-ref]').forEach(el => el.onclick = () => openOrder(el.dataset.attnRef));
  $('#sec-dashboard').querySelectorAll('[data-attn-crm]').forEach(el => el.onclick = () => navTo('crm'));
}

/* ----- projects ----- */
let PF = { q: '', talent: '', sort: 'deadline', view: 'board' };
const PLAN_RANK = { burst: 0, flame: 1, starter: 2 };
function filteredProjects() {
  return ADMIN.orders.filter(o => (!PF.q || (o.ref + ' ' + (o.name || '') + ' ' + (o.plan || '') + ' ' + (o.email || '')).toLowerCase().includes(PF.q)) && (!PF.talent || (o.talent_email || '') === PF.talent));
}
function sortProjects(list) {
  const arr = [...list];
  if (PF.sort === 'offer') arr.sort((a, b) => (PLAN_RANK[a.plan] ?? 9) - (PLAN_RANK[b.plan] ?? 9) || (b.amount || 0) - (a.amount || 0));
  else if (PF.sort === 'status') { const r = { todo: 0, progress: 1, done: 2 }; arr.sort((a, b) => r[a.state || 'todo'] - r[b.state || 'todo']); }
  else arr.sort((a, b) => deadlineMs(a, a.items) - deadlineMs(b, b.items));
  return arr;
}
const PLUS_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const CHECK_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>';
// Compact reassign control: assigned talent's avatar + name, or a quiet "Assign"
// pill when unassigned. Clicking opens a popover (openAssignMenu) to reassign.
function assignChip(o) {
  const t = talentObj(o.talent_email);
  if (t) return `<button class="who" type="button" data-stop data-assign-btn="${esc(o.ref)}" title="Reassign talent"><span class="who__av">${avatar(t, 'avatar--xs')}</span><span class="who__n">${esc(t.name || t.email)}</span></button>`;
  return `<button class="who who--none" type="button" data-stop data-assign-btn="${esc(o.ref)}" title="Assign talent">${PLUS_IC}<span class="who__n">Assign</span></button>`;
}
function closeAssignMenu() {
  const m = document.getElementById('assignMenu'); if (m) m.remove();
  document.removeEventListener('click', onAssignOutside, true);
  document.removeEventListener('keydown', onAssignKey);
}
function onAssignOutside(e) { if (!e.target.closest('#assignMenu') && !e.target.closest('[data-assign-btn]')) closeAssignMenu(); }
function onAssignKey(e) { if (e.key === 'Escape') closeAssignMenu(); }
function openAssignMenu(ref, anchor) {
  const existing = document.getElementById('assignMenu');
  const wasSame = existing && existing.dataset.ref === ref;
  closeAssignMenu();
  if (wasSame) return; // second click on the same chip closes it
  const o = (ADMIN.orders || []).find(x => x.ref === ref); if (!o) return;
  const cur = (o.talent_email || '').toLowerCase();
  const item = (av, name, val, on) => `<button class="amenu__i ${on ? 'on' : ''}" type="button" data-pick="${esc(val)}">${av}<span class="amenu__n">${esc(name)}</span>${on ? CHECK_IC : ''}</button>`;
  const rows = (ADMIN.talents || []).filter(t => !t.is_owner)
    .map(t => item(avatar(t, 'avatar--xs'), t.name || t.email, t.email, cur === (t.email || '').toLowerCase())).join('');
  const m = document.createElement('div');
  m.className = 'amenu'; m.id = 'assignMenu'; m.dataset.ref = ref;
  m.innerHTML = `<div class="amenu__h">Assign to</div>${rows}${item(`<span class="amenu__none">${PLUS_IC}</span>`, 'Unassigned', '', !cur)}`;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  let left = r.left; if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
  let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = r.top - 6 - h;
  m.style.left = Math.max(8, left) + 'px'; m.style.top = Math.max(8, top) + 'px';
  m.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => {
    const val = b.dataset.pick; closeAssignMenu();
    const res = await api('/api/admin', { action: 'assign_order', ref, talentEmail: val || null });
    if (res.ok) { ADMIN.orders = res.orders || ADMIN.orders; ORDERS = ADMIN.orders; renderProjectsBody(); }
  });
  setTimeout(() => { document.addEventListener('click', onAssignOutside, true); document.addEventListener('keydown', onAssignKey); }, 0);
}
function kindChips(kinds) {
  const map = [['carousel', kinds && kinds.carousel, 'deck'], ['story', kinds && kinds.story, 'story'], ['branding', kinds && kinds.branding, 'branding']];
  return map.filter(([k, n]) => n > 0).map(([k, n, lbl]) => `<span class="kc__kind" title="${n} ${lbl}${n > 1 ? 's' : ''}">${TYPE_ICON[k] || ''}<b>${n}</b></span>`).join('');
}
function projCard(o) {
  const c = o.counts || { done: 0, active: 0, todo: 0 }, total = o.items || 0, pct = total ? Math.round(c.done / total * 100) : 0;
  const chips = kindChips(o.kinds);
  const line = [c.done ? `${c.done} done` : '', c.active ? `${c.active} in progress` : '', c.todo ? `${c.todo} to start` : ''].filter(Boolean).join(' · ') || 'No elements yet';
  return `<div class="kc" data-card="${esc(o.ref)}">
    <button class="kc__edit" data-stop data-edit="${esc(o.ref)}" title="Edit project">${EDIT_IC}</button>
    <div class="kc__head">${clientAv(o, 'iav--sm')}<div class="kc__n">${esc(o.name || 'Untitled')}</div></div>
    <div class="kc__meta"><span class="swi__ref">#${esc(o.ref)}</span><span class="kc__pack">${esc(planName(o.plan) || '')}</span></div>
    ${chips ? `<div class="kc__kinds">${chips}</div>` : ''}
    ${total ? `<div class="kc__prog"><div class="kc__bar"><i style="width:${pct}%"></i></div><span class="kc__progt">${line}</span></div>` : ''}
    <div class="kc__foot">${dlBadge(o, o.kinds)}<span class="kc__items">${total} element${total === 1 ? '' : 's'}</span></div>
    <div class="kc__assign" data-stop>${assignChip(o)}</div>
  </div>`;
}
const EDIT_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4.5-1L20 7.5a2 2 0 0 0-2.8-2.8L4.8 17.5 4 20z"/></svg>';
function projRow(o) {
  return `<tr data-row="${esc(o.ref)}" class="clk"><td><span class="swi__ref">#${esc(o.ref)}</span></td>
    <td><div class="rname">${clientAv(o, 'iav--sm')}<div><b>${esc(o.name || '-')}</b><div class="rsub">${esc(o.email || '')}</div></div></div></td>
    <td>${esc(planName(o.plan) || '-')}</td>
    <td>${o.billing === 'sub' ? 'Subscription' : 'One-time'}</td>
    <td class="amoney">${fmtMoney(o.amount)}</td>
    <td data-stop>${assignChip(o)}</td>
    <td>${dlBadge(o, o.kinds)}</td>
    <td>${spill(o.state)}</td>
    <td data-stop><button class="iconbtn" data-edit="${esc(o.ref)}" title="Edit project">${EDIT_IC}</button></td></tr>`;
}
function renderProjectsBody() {
  closeAssignMenu();
  const list = sortProjects(filteredProjects()), body = $('#pbody');
  if (PF.view === 'list') {
    const rows = list.length ? list.map(projRow).join('') : '<tr><td colspan="9" class="emptyrow">No projects.</td></tr>';
    body.innerHTML = `<div class="tbl"><table><thead><tr><th>Ref</th><th>Client</th><th>Pack</th><th>Billing</th><th>Amount</th><th>Talent</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else {
    body.innerHTML = `<div class="kboard">` + ['todo', 'progress', 'done'].map(st => { const [c, l, col] = STATE[st]; const items = list.filter(o => (o.state || 'todo') === st);
      return `<div><div class="kcolh"><span class="dot" style="background:${col}"></span>${l}<span class="c">${items.length}</span></div><div class="kcards">${items.map(projCard).join('') || '<div class="knone">No projects</div>'}</div></div>`; }).join('') + `</div>`;
  }
  bindProjects();
}
function openEditOrder(ref) { const o = (ADMIN.orders || []).find(x => x.ref === ref); if (o) openNewModal(o); }
function bindProjects() {
  $('#pbody').querySelectorAll('[data-card]').forEach(el => el.onclick = e => { if (e.target.closest('[data-stop]')) return; openOrder(el.dataset.card); });
  $('#pbody').querySelectorAll('tr[data-row]').forEach(el => el.onclick = e => { if (e.target.closest('[data-stop]')) return; openOrder(el.dataset.row); });
  $('#pbody').querySelectorAll('[data-assign-btn]').forEach(b => b.onclick = e => { e.stopPropagation(); openAssignMenu(b.dataset.assignBtn, b); });
  $('#pbody').querySelectorAll('[data-edit]').forEach(b => b.onclick = e => { e.stopPropagation(); openEditOrder(b.dataset.edit); });
}
function renderProjectsSection() {
  const talents = [...new Set(ADMIN.orders.map(o => o.talent_email).filter(Boolean))];
  $('#sec-projects').innerHTML = `
    <div class="sechead"><h2>Projects</h2>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="vswitch" id="pview"><button type="button" data-v="board" class="${PF.view === 'board' ? 'on' : ''}">Board</button><button type="button" data-v="list" class="${PF.view === 'list' ? 'on' : ''}">List</button></div>
        <button class="b-grad b-sm" data-newproj type="button">+ New project</button>
      </div>
    </div>
    <div class="filters">
      <div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" stroke-linecap="round"/></svg><input id="pfq" placeholder="Search by name, #ref, email…" value="${esc(PF.q)}"></div>
      <select id="pftalent"><option value="">All talents</option>${talents.map(t => `<option value="${esc(t)}" ${PF.talent === t ? 'selected' : ''}>${esc(talentName(t))}</option>`).join('')}</select>
      <select id="pfsort"><option value="deadline" ${PF.sort === 'deadline' ? 'selected' : ''}>Sort: Deadline</option><option value="offer" ${PF.sort === 'offer' ? 'selected' : ''}>Sort: Offer</option><option value="status" ${PF.sort === 'status' ? 'selected' : ''}>Sort: Status</option></select>
    </div>
    <div id="pbody"></div>`;
  $('#pfq').oninput = e => { PF.q = e.target.value.trim().toLowerCase(); renderProjectsBody(); };
  $('#pftalent').onchange = e => { PF.talent = e.target.value; renderProjectsBody(); };
  $('#pfsort').onchange = e => { PF.sort = e.target.value; renderProjectsBody(); };
  $('#pview').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b && b.dataset.v !== PF.view) { PF.view = b.dataset.v; renderProjectsSection(); } });
  $('#sec-projects').querySelector('[data-newproj]').onclick = openNewModal;
  renderProjectsBody();
}
const BOLT_IC = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>';
// Display labels for the recovery sequence (keep in sync with CAMPAIGN_STEPS in _lib.js).
const CAMP_STEPS = ['Reminder', 'Follow-up', 'Last chance'];
function campCell(l) {
  const c = l.campaign || { step: 0, auto: false };
  const step = c.step || 0, total = CAMP_STEPS.length;
  const segs = CAMP_STEPS.map((_, i) => `<i class="camp__seg ${i < step ? 'on' : ''} ${i === step && c.auto ? 'next' : ''}"></i>`).join('');
  const lbl = step === 0 ? 'Not started'
    : step >= total ? '✓ Sequence complete'
    : `${step}/${total} sent · next: ${CAMP_STEPS[step]}`;
  return `<div class="camp"><div class="camp__bar">${segs}</div><div class="camp__lbl ${step >= total ? 'done' : ''}">${lbl}${c.auto ? '<span class="camp__autotag">auto</span>' : ''}</div></div>`;
}
function campActions(l) {
  const c = l.campaign || { step: 0, auto: false };
  const step = c.step || 0, total = CAMP_STEPS.length, done = step >= total;
  const main = done
    ? '<span class="campdone">Completed</span>'
    : `<button class="qa qa--go" type="button" data-camp-next="${esc(l.ref)}" title="Send the &quot;${esc(CAMP_STEPS[step])}&quot; email now">${step === 0 ? '▸ Launch' : '▸ Next step'}</button>`;
  return `<div class="campact">${main}<button class="camptoggle ${c.auto ? 'on' : ''}" type="button" data-camp-auto="${esc(l.ref)}" title="Auto-send the next step when it's due">${BOLT_IC}Auto</button></div>`;
}
function renderCRMSection() {
  const L = ADMIN.leads || [];
  const onboarded = L.filter(l => l.onboarded).length, abandoned = L.length - onboarded;
  const pipeline = L.reduce((s, l) => s + (l.amount || 0), 0);
  const inCampaign = L.filter(l => l.campaign && (l.campaign.step || 0) > 0).length;
  const funCell = (lab, v, s, tone) => `<div class="funcell"><div class="funcell__l">${tone ? `<i class="lstage__d lstage__d--${tone}"></i>` : ''}${lab}</div><div class="funcell__v">${v}</div><div class="funcell__s">${s}</div></div>`;
  const dotLabel = l => l.onboarded
    ? '<span class="lstage"><i class="lstage__d lstage__d--warm"></i>Onboarded</span>'
    : '<span class="lstage"><i class="lstage__d lstage__d--cold"></i>Abandoned</span>';
  const sub = l => [l.email, l.handle].filter(Boolean).map(esc).join(' · ') || '—';
  const rows = L.length ? L.map(l => `<tr>
      <td><div class="lname">${esc(l.name || 'Unknown')}</div><div class="lsub">${sub(l)}</div></td>
      <td class="ta-r">${l.amount ? fmtMoney(l.amount) : '—'}</td>
      <td>${dotLabel(l)}<div class="lmuted lmuted--sm">${fmtDate(l.created_at)}</div></td>
      <td>${campCell(l)}</td>
      <td class="crow__act">${campActions(l)}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="emptyrow">No leads yet. Unpaid or abandoned checkouts show up here.</td></tr>';
  $('#sec-crm').innerHTML = `
    <div class="sechead"><h2>CRM</h2><span class="sechead__sub">${L.length} lead${L.length === 1 ? '' : 's'} to recover</span></div>
    <div class="funnel">
      ${funCell('In pipeline', L.length, 'unpaid leads')}
      ${funCell('In campaign', inCampaign, 'being nudged')}
      ${funCell('Abandoned', abandoned, 'left at checkout', 'cold')}
      ${funCell('Pipeline value', fmtMoney(pipeline), 'est. if recovered')}
    </div>
    <div class="tbl tbl--crm"><table><thead><tr><th>Lead</th><th class="ta-r">Est. value</th><th>Stage</th><th>Campaign</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  bindCRM();
}
function setLeadCampaign(ref, campaign) {
  const l = (ADMIN.leads || []).find(x => x.ref === ref); if (l) l.campaign = campaign;
}
function bindCRM() {
  $('#sec-crm').querySelectorAll('[data-camp-next]').forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = 'Sending…';
    const r = await api('/api/admin', { action: 'campaign', op: 'send_next', ref: b.dataset.campNext });
    if (r.ok) { setLeadCampaign(r.ref, r.campaign); renderCRMSection(); }
    else { b.disabled = false; alert(r.error === 'complete' ? 'Sequence already complete.' : 'Error: ' + (r.error || '')); }
  });
  $('#sec-crm').querySelectorAll('[data-camp-auto]').forEach(b => b.onclick = async () => {
    const r = await api('/api/admin', { action: 'campaign', op: 'set_auto', ref: b.dataset.campAuto });
    if (r.ok) { setLeadCampaign(r.ref, r.campaign); renderCRMSection(); }
    else alert('Error: ' + (r.error || ''));
  });
}

/* ----- Emails: gallery of every template the app sends, rendered live from the
   server (api_lib) with sample data. Owner-only (this whole shell is). ----- */
let EMAILS_CACHE = null;
async function renderEmailsSection() {
  const sec = $('#sec-emails');
  if (!EMAILS_CACHE) {
    sec.innerHTML = `<div class="sechead"><h2>Emails</h2><span class="sechead__sub">Loading templates…</span></div>`;
    try { const r = await api('/api/admin', { action: 'email_gallery' }); if (r.ok) EMAILS_CACHE = r.emails || []; } catch (e) {}
    if (!EMAILS_CACHE) { sec.innerHTML = `<div class="sechead"><h2>Emails</h2><span class="sechead__sub">Couldn't load templates.</span></div>`; return; }
  }
  const list = EMAILS_CACHE, groups = [...new Set(list.map(e => e.group))];
  const cls = g => 'eb-' + g.replace(/\s+/g, '-').toLowerCase();
  const card = (e, i) => `<figure class="ecard" data-group="${esc(e.group)}">
    <figcaption class="ecard__cap">
      <div class="ecard__top"><span class="ebadge ${cls(e.group)}">${esc(e.group)}</span><span class="ecard__n">#${i + 1}</span></div>
      <h3>${esc(e.name)}</h3>
      <p class="ecard__subj"><span>Subject</span> ${esc(e.subject)}</p>
    </figcaption>
    <div class="ecard__frame"><iframe loading="lazy" srcdoc="${esc(e.html)}"></iframe></div>
  </figure>`;
  sec.innerHTML = `
    <div class="sechead"><h2>Emails</h2><span class="sechead__sub">${list.length} templates the app sends</span></div>
    <div class="echips" id="emailChips">
      <button class="echip on" type="button" data-f="all">All</button>
      ${groups.map(g => `<button class="echip" type="button" data-f="${esc(g)}">${esc(g)}</button>`).join('')}
    </div>
    <div class="egrid" id="emailGrid">${list.map(card).join('')}</div>`;
  bindEmails();
}
function bindEmails() {
  const chips = $('#emailChips'); if (!chips) return;
  chips.onclick = e => {
    const b = e.target.closest('.echip'); if (!b) return;
    chips.querySelectorAll('.echip').forEach(x => x.classList.toggle('on', x === b));
    const f = b.dataset.f;
    $('#emailGrid').querySelectorAll('.ecard').forEach(c => c.classList.toggle('hide', !(f === 'all' || c.dataset.group === f)));
  };
}

/* type icons + per-deck progress */
const TYPE_ICON = {
  carousel: `<svg class="ti" viewBox="0 0 140 94" fill="none"><use href="#ic-decks"/></svg>`,
  story: `<svg class="ti" viewBox="0 0 134 122" fill="none"><use href="#ic-story"/></svg>`,
  branding: `<svg class="ti" viewBox="0 0 120 120" fill="none"><use href="#ic-brand"/></svg>`,
};
const DPCT = { writing: 12, script_review: 34, designing: 58, design_review: 80, revision: 72, done: 100 };
function packDays(n) { return n >= 10 ? 3 : (n > 0 ? 2 : 0); }
function deadlineDays(kinds) { const k = kinds || {}; const d = packDays(k.carousel || 0) + packDays(k.story || 0) + ((k.branding || 0) > 0 ? 3 : 0); return d || 2; }
function kindsOfDecks(decks) { const k = { carousel: 0, story: 0, branding: 0 }; (decks || []).forEach(d => { const t = d.type || 'carousel'; k[t] = (k[t] || 0) + 1; }); return k; }
function deadlineMs(o, kinds) { const start = (o && o.created_at) ? new Date(o.created_at).getTime() : Date.now(); return start + deadlineDays(kinds || (o && o.kinds) || {}) * 86400000; }
function dlBadge(o, kinds) {
  const ms = deadlineMs(o, kinds) - Date.now(), late = ms < 0, abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000), d = Math.floor(h / 24), hr = h % 24, t = d > 0 ? `${d}d ${hr}h` : `${h}h`;
  return `<span class="dl ${late ? 'late' : (h < 24 ? 'soon' : '')}">⏱ ${late ? 'Overdue ' + t : t + ' left'}</span>`;
}

/* ---------- new project (owner) ---------- */
const NP_PLANS = {
  starter: { name: 'Ember', price: 120, decks: 3, pd: '3 decks' },
  flame: { name: 'Flame', price: 240, decks: 6, pd: '6 decks' },
  burst: { name: 'Meteor', price: 350, decks: 10, pd: '9 + 1 decks' },
};
const NP_ADDONS = {
  branding: { name: 'Social media branding', price: 210, sub: 'Profile photo · banners · CTAs', vis: 'brand' },
  story: { name: 'Story pack', sub: 'Custom-written, on-brand stories', vis: 'story', opts: [{ key: 'story3', n: 3, price: 100 }, { key: 'story6', n: 6, price: 150 }, { key: 'story9', n: 9, price: 190, free: true }] },
  bundle: { name: 'Mega Bundle', price: 359, was: 400, sub: 'Full branding + 9 stories + 1 free', vis: 'bundle' },
};
const STORY_KEYS = ['story3', 'story6', 'story9'];
const npFmt = n => '$' + n.toLocaleString('en-US');
const NP = { plan: 'burst', billing: 'once', branding: false, story: null, bundle: false };
const npVisIcon = v => v === 'brand'
  ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 15l-5-5L5 20" stroke-linecap="round"/></svg>'
  : v === 'bundle'
  ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 7H4v13h16zM4 7l2-3h12l2 3M12 7v13M9 11h6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>';
// Rate rows: [key, label, icon]. Keys match o.plan / o.addons so margin lines up.
const RATE_OFFERS = [['starter', 'Ember', PLAN_ICON.starter], ['flame', 'Flame', PLAN_ICON.flame], ['burst', 'Meteor', PLAN_ICON.burst]];
const RATE_UPSELLS = [['branding', 'Branding', npVisIcon('brand')], ['story3', 'Story pack · 3', npVisIcon('story')], ['story6', 'Story pack · 6', npVisIcon('story')], ['story9', 'Story pack · 9+1', npVisIcon('story')], ['bundle', 'Mega Bundle', npVisIcon('bundle')]];
function npPlanPrice() { const base = NP_PLANS[NP.plan].price; return NP.billing === 'sub' ? Math.round(base * 0.9) : base; }
function npAddonsTotal() { let s = 0; if (NP.branding) s += NP_ADDONS.branding.price; if (NP.story) { s += NP_ADDONS.story.opts.find(o => o.key === NP.story).price; } if (NP.bundle) s += NP_ADDONS.bundle.price; return s; }
function npSelectedAddonKeys() { const k = []; if (NP.branding) k.push('branding'); if (NP.story) k.push(NP.story); if (NP.bundle) k.push('bundle'); return k; }
function renderNpPlans() {
  $('#npPlans').innerHTML = Object.entries(NP_PLANS).map(([k, p]) => {
    const price = NP.billing === 'sub' ? Math.round(p.price * 0.9) : p.price;
    return `<button type="button" class="plancard ${NP.plan === k ? 'on' : ''}" data-plan="${k}"><b>${p.name}</b><span class="pp">${npFmt(price)}${NP.billing === 'sub' ? '<small style="font-size:10px">/mo</small>' : ''}</span><span class="pd">${p.pd}</span></button>`;
  }).join('');
}
function renderNpAddons() {
  const a = NP_ADDONS;
  const storyOpts = a.story.opts.map(o => `<button type="button" class="storyopt2 ${NP.story === o.key ? 'on' : ''}" data-story="${o.key}">${o.n} stor${o.n > 1 ? 'ies' : 'y'}${o.free ? ' +1' : ''}<small>${npFmt(o.price)}</small></button>`).join('');
  $('#npAddons').innerHTML = `
    <button type="button" class="upcard upcard--brand ${NP.branding ? 'on' : ''}" data-up="branding">
      <div class="upcard__vis">${npVisIcon('brand')}</div>
      <div class="upcard__body"><div class="upcard__head"><b>${a.branding.name}</b><span class="upcard__price">+${npFmt(a.branding.price)}</span></div>
        <span class="upcard__sub">${a.branding.sub}</span><span class="upcard__pick">${NP.branding ? '✓ Added' : '+ Add'}</span></div>
    </button>
    <div class="upcard upcard--story ${NP.story ? 'on' : ''}">
      <div class="upcard__vis">${npVisIcon('story')}</div>
      <div class="upcard__body"><div class="upcard__head"><b>${a.story.name}</b><span class="upcard__price">${NP.story ? '+' + npFmt(a.story.opts.find(o => o.key === NP.story).price) : 'from ' + npFmt(100)}</span></div>
        <span class="upcard__sub">${a.story.sub}</span>
        <div class="storyopts">${storyOpts}</div></div>
    </div>
    <button type="button" class="upcard upcard--bundle ${NP.bundle ? 'on' : ''}" data-up="bundle">
      <div class="upcard__vis">${npVisIcon('bundle')}</div>
      <div class="upcard__body"><div class="upcard__head"><b>${a.bundle.name}</b><span class="upcard__price">+${npFmt(a.bundle.price)} <small style="color:var(--grey);text-decoration:line-through;font-weight:700">${npFmt(a.bundle.was)}</small></span></div>
        <span class="upcard__sub">${a.bundle.sub}</span><span class="upcard__pick">${NP.bundle ? '✓ Added' : '+ Add'}</span></div>
    </button>`;
}
function renderNpRecap() {
  const p = NP_PLANS[NP.plan], lines = [];
  lines.push(`<div class="rl">${p.name} pack <span class="muted" style="margin-left:6px">· ${NP.billing === 'sub' ? 'subscription' : 'one-time'}</span><b>${npFmt(npPlanPrice())}${NP.billing === 'sub' ? '/mo' : ''}</b></div>`);
  if (NP.branding) lines.push(`<div class="rl">${NP_ADDONS.branding.name}<b>+${npFmt(NP_ADDONS.branding.price)}</b></div>`);
  if (NP.story) { const o = NP_ADDONS.story.opts.find(o => o.key === NP.story); lines.push(`<div class="rl">Story pack · ${o.n} stories<b>+${npFmt(o.price)}</b></div>`); }
  if (NP.bundle) lines.push(`<div class="rl">${NP_ADDONS.bundle.name}<b>+${npFmt(NP_ADDONS.bundle.price)}</b></div>`);
  const total = npPlanPrice() + npAddonsTotal();
  $('#npRecap').innerHTML = lines.join('') + `<div class="rtot">Total<b>${npFmt(total)}${NP.billing === 'sub' ? '/mo + add-ons once' : ''}</b></div>`;
}
function renderNp() { renderNpPlans(); renderNpAddons(); renderNpRecap(); }

let NP_EDIT = null;
async function openNewModal(order) {
  if (!(order && order.ref)) order = null;
  if (ME && ME.is_owner && !TALENTS.length) { try { const t = await api('/api/admin', { action: 'list_talents' }); if (t.ok) TALENTS = t.talents || []; } catch (e) {} }
  NP_EDIT = order ? order.ref : null;
  $('#npForm').reset(); $('#npErr').textContent = '';
  if (order) {
    const a = order.addons || [], an = order.answers || {};
    NP.plan = order.plan || 'burst'; NP.billing = order.billing || 'once';
    NP.branding = a.includes('branding'); NP.story = STORY_KEYS.find(k => a.includes(k)) || null; NP.bundle = a.includes('bundle');
    $('#npName').value = order.name || ''; $('#npEmail').value = order.email || ''; $('#npIg').value = order.instagram || ''; $('#npPhone').value = order.phone || '';
    $('#npDecks').value = (order.kinds && order.kinds.carousel != null) ? order.kinds.carousel : NP_PLANS[NP.plan].decks;
    $('#npBPage').value = an.page || ''; $('#npBGoal').value = an.goal || ''; $('#npBNiche').value = an.niche || '';
    $('#npBAudience').value = an.audience || ''; $('#npBStyle').value = an.style || ''; $('#npBNotes').value = an.notes || '';
  } else {
    NP.plan = 'burst'; NP.billing = 'once'; NP.branding = false; NP.story = null; NP.bundle = false;
    $('#npDecks').value = NP_PLANS.burst.decks;
  }
  const anv = (order && order.answers) || {};
  initPalette($('#npBColors'), anv.colors || '');
  initTypo($('#npBTypo'), anv.typo || '', anv.typo_file || '', anv.typo_file_name || '');
  initLogo($('#npBLogo'), anv.logo || '', anv.logo_name || '');
  initIgList($('#npBInspo'), anv.inspo || '');
  $('#npBilling').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.bill === NP.billing));
  $('#npTalent').innerHTML = '<option value="">Unassigned</option>' + (TALENTS || []).filter(t => !t.is_owner).map(t => `<option value="${esc(t.email)}" ${order && (order.talent_email || '').toLowerCase() === (t.email || '').toLowerCase() ? 'selected' : ''}>${esc(t.name || t.email)}</option>`).join('');
  $('#newModal').querySelector('.modalc__h h3').textContent = order ? 'Edit project' : 'New project';
  $('#npSubmit').textContent = order ? 'Save changes →' : 'Create project →';
  $('#npDelete').classList.toggle('hide', !order);
  renderNp();
  $('#newModal').classList.remove('hide'); setTimeout(() => $('#npName').focus(), 30);
}

/* reusable visual-identity widgets (shared with the client onboarding) */
let NP_TYPO_FILE = null;
function wHexToRgb(h) { h = (h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h || '0', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function wNormHex(h) { h = (h || '').trim(); if (!h) return ''; if (h[0] !== '#') h = '#' + h; if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + h.slice(1).split('').map(x => x + x).join(''); return /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : ''; }
function wColorRow(c) { c = wNormHex(c) || '#888888'; const [r, g, b] = wHexToRgb(c);
  return `<div class="pal-row" data-pal-row><input type="color" class="pal-pick" value="${c}"><input type="text" class="pal-hex" value="${c}" maxlength="7" spellcheck="false" autocomplete="off"><span class="pal-rgb">R ${r} · G ${g} · B ${b}</span><button type="button" class="pal-del" data-pal-del title="Remove">✕</button></div>`; }
function initPalette(wrap, csv) {
  const max = 5, vals = csv ? String(csv).split(',').map(s => s.trim()).filter(Boolean) : [];
  const presets = [['#ff5a00', '#111111', '#f4f1ec'], ['#1d4ed8', '#0b1220', '#ffffff'], ['#16a34a', '#052e16', '#f0fdf4'], ['#db2777', '#1f1147', '#fff1f7']];
  wrap.innerHTML = `<div class="pal-rows">${(vals.length ? vals : ['#ff5a00', '#111111', '#f4f1ec']).map(wColorRow).join('')}</div>
    <div class="pal-foot"><button type="button" class="pal-add" data-pal-add>+ Add color</button>
      <div class="pal-presets">${presets.map(p => `<button type="button" class="pal-preset" data-preset="${p.join(',')}">${p.map(c => `<i style="background:${c}"></i>`).join('')}</button>`).join('')}</div></div>`;
  const rows = () => [...wrap.querySelectorAll('[data-pal-row]')];
  const upd = () => { const a = wrap.querySelector('[data-pal-add]'); if (a) a.style.display = rows().length >= max ? 'none' : ''; };
  const wire = row => { const pick = row.querySelector('.pal-pick'), hex = row.querySelector('.pal-hex'), rgb = row.querySelector('.pal-rgb');
    const setRgb = c => { const [r, g, b] = wHexToRgb(c); rgb.textContent = `R ${r} · G ${g} · B ${b}`; };
    pick.addEventListener('input', () => { hex.value = pick.value; setRgb(pick.value); });
    hex.addEventListener('input', () => { const n = wNormHex(hex.value); if (n) { pick.value = n; setRgb(n); } });
    hex.addEventListener('blur', () => { const n = wNormHex(hex.value); hex.value = n || pick.value; });
    hex.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hex.blur(); } });
    row.querySelector('[data-pal-del]').addEventListener('click', () => { if (rows().length <= 1) return; row.remove(); upd(); }); };
  rows().forEach(wire);
  wrap.querySelector('[data-pal-add]').addEventListener('click', () => { if (rows().length >= max) return; const t = document.createElement('div'); t.innerHTML = wColorRow('#888888'); const row = t.firstElementChild; wrap.querySelector('.pal-rows').appendChild(row); wire(row); upd(); });
  wrap.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { wrap.querySelector('.pal-rows').innerHTML = b.dataset.preset.split(',').map(wColorRow).join(''); rows().forEach(wire); upd(); }));
  upd();
}
function paletteVal(wrap) { return [...wrap.querySelectorAll('.pal-pick')].map(i => i.value).join(', '); }
function initTypo(wrap, name, fileData, fileName) {
  NP_TYPO_FILE = fileData ? { data: fileData, name: fileName || 'font' } : null;
  wrap.innerHTML = `<input type="text" class="typo-name" value="${esc(name || '')}" placeholder="Font name, e.g. Satoshi, Playfair Display…" autocomplete="off">
    <div class="typo-import"><label class="typo-btn">⬆ Import font file<input type="file" accept=".ttf,.otf,.woff,.woff2" hidden></label>
      <span class="typo-file ${NP_TYPO_FILE ? '' : 'hide'}"><b>${esc(NP_TYPO_FILE ? NP_TYPO_FILE.name : '')}</b><button type="button" data-typo-fdel title="Remove">✕</button></span></div>`;
  const file = wrap.querySelector('input[type=file]'), box = wrap.querySelector('.typo-file'), nm = box.querySelector('b');
  wrap.querySelector('.typo-name').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return;
    if (f.size > 1024 * 1024) { alert('Font file is too large (max 1 MB). Just type the font name instead.'); file.value = ''; return; }
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    NP_TYPO_FILE = { data, name: f.name }; nm.textContent = f.name; box.classList.remove('hide'); });
  wrap.querySelector('[data-typo-fdel]').addEventListener('click', () => { NP_TYPO_FILE = null; file.value = ''; nm.textContent = ''; box.classList.add('hide'); });
}
function igChip(u) { return `<span class="ig-chip" data-ig="${esc(u)}">${esc(u)}<button type="button" data-ig-del title="Remove">✕</button></span>`; }
function igNormalize(s) { s = (s || '').trim(); if (!s) return ''; const m = s.replace(/\/+$/, '').match(/instagram\.com\/([^/?#]+)/i); return m ? ('@' + m[1].replace(/^@/, '')) : ('@' + s.replace(/^@/, '')); }
function initIgList(wrap, csv) {
  const max = 5, list = csv ? String(csv).split(',').map(s => s.trim()).filter(Boolean) : [];
  wrap.innerHTML = `<div class="ig-add"><input type="text" class="ig-input" placeholder="instagram.com/page or @handle" autocomplete="off"><button type="button" class="ig-btn" data-ig-add>Add</button></div>
    <div class="ig-chips">${list.map(igChip).join('')}</div><p class="ig-hint"></p>`;
  const input = wrap.querySelector('.ig-input'), chips = wrap.querySelector('.ig-chips'), hint = wrap.querySelector('.ig-hint');
  const items = () => [...chips.querySelectorAll('[data-ig]')].map(c => c.dataset.ig);
  const upd = () => { const n = items().length; wrap.querySelector('[data-ig-add]').disabled = n >= max; hint.textContent = n >= max ? `Maximum ${max} accounts.` : `Add up to ${max} accounts.`; };
  const add = () => { const u = igNormalize(input.value); if (!u || u === '@') { input.value = ''; return; }
    if (!items().includes(u) && items().length < max) { chips.insertAdjacentHTML('beforeend', igChip(u)); upd(); } input.value = ''; input.focus(); };
  wrap.querySelector('[data-ig-add]').addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  chips.addEventListener('click', e => { const d = e.target.closest('[data-ig-del]'); if (!d) return; d.closest('[data-ig]').remove(); upd(); });
  upd();
}
function igListVal(wrap) { return [...wrap.querySelectorAll('[data-ig]')].map(c => c.dataset.ig).join(', '); }
let NP_LOGO_FILE = null;
function initLogo(wrap, dataUrl, name) {
  NP_LOGO_FILE = dataUrl ? { data: dataUrl, name: name || 'logo' } : null;
  wrap.innerHTML = `<label class="logo-btn">⬆ Upload logo<input type="file" accept="image/png,image/svg+xml,.png,.svg" hidden></label>
    <div class="logo-prev ${NP_LOGO_FILE ? '' : 'hide'}"><img src="${NP_LOGO_FILE ? esc(NP_LOGO_FILE.data) : ''}" alt=""><button type="button" data-logo-del title="Remove">✕</button></div>`;
  const file = wrap.querySelector('input[type=file]'), prev = wrap.querySelector('.logo-prev'), img = prev.querySelector('img');
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return;
    if (!/png|svg/i.test(f.type) && !/\.(png|svg)$/i.test(f.name)) { alert('Please upload a PNG or SVG file.'); file.value = ''; return; }
    if (f.size > 2 * 1024 * 1024) { alert('Logo is too large (max 2 MB).'); file.value = ''; return; }
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    NP_LOGO_FILE = { data, name: f.name }; img.src = data; prev.classList.remove('hide'); });
  wrap.querySelector('[data-logo-del]').addEventListener('click', () => { NP_LOGO_FILE = null; file.value = ''; img.src = ''; prev.classList.add('hide'); });
}
function npBrief() {
  const b = { page: $('#npBPage').value.trim(), handle: $('#npIg').value.trim(), goal: $('#npBGoal').value.trim(),
    niche: $('#npBNiche').value.trim(), audience: $('#npBAudience').value.trim(),
    style: $('#npBStyle').value.trim(), notes: $('#npBNotes').value.trim(),
    colors: paletteVal($('#npBColors')), typo: ($('#npBTypo .typo-name') || {}).value, inspo: igListVal($('#npBInspo')) };
  if (NP_TYPO_FILE) { b.typo_file = NP_TYPO_FILE.data; b.typo_file_name = NP_TYPO_FILE.name; }
  if (NP_LOGO_FILE) { b.logo = NP_LOGO_FILE.data; b.logo_name = NP_LOGO_FILE.name; }
  Object.keys(b).forEach(k => { if (b[k] == null || b[k] === '') delete b[k]; });
  return Object.keys(b).length ? b : null;
}
const NP_SAMPLES = [
  { name: 'Nina Park', ig: '@wealthnotes', phone: '+1 415 555 0142', page: 'Wealth Notes', goal: 'Sales / leads', niche: 'Personal finance for millennials: budgeting, index investing and money mindset, no jargon.', audience: '25–38 y/o professionals starting to invest, want to build wealth but feel overwhelmed by finance content.', style: 'Clean, high-contrast, big bold type, lots of negative space.', colors: '#0f5132, #f4f1ec, #111111', typo: 'Bold sans (Satoshi)', inspo: '@humphreytalks, @her.first.100k', notes: 'Tone should feel reassuring and expert, never salesy. Avoid stock-photo vibes.' },
  { name: 'Marcus Hale', ig: '@hale.strength', phone: '+1 312 555 0188', page: 'Hale Strength', goal: 'Followers growth', niche: 'Strength training and fat-loss for busy men over 30: minimalist programs, science-backed.', audience: '30–45 y/o men, desk jobs, limited time, tired of fitness fads and want a no-BS plan.', style: 'Dark, gritty, bold condensed type, before/after energy.', colors: '#f87000, #1a1a1a, #f4f1ec', typo: 'Condensed bold (Anton)', inspo: '@jeffnippard', notes: 'Lots of myth-busting hooks. Keep it motivational but practical, science citations welcome.' },
  { name: 'Sofia Rinaldi', ig: '@glow.lab', phone: '+44 7700 900321', page: 'Glow Lab', goal: 'Saves & shares', niche: 'Evidence-based skincare: ingredient breakdowns, routine building, debunking trends.', audience: '20–35 y/o women confused by skincare marketing, want science not hype.', style: 'Soft pastel, glossy, rounded type, dermatology-meets-editorial.', colors: '#f7c8d0, #ffffff, #3a2e3a', typo: 'Rounded serif', inspo: '@drmamina, @theordinary', notes: 'Every claim must be backed. Carousel-friendly, saveable “cheat sheet” formats.' },
  { name: 'Daniel Osei', ig: '@buildwithdan', phone: '+1 646 555 0173', page: 'Build with Dan', goal: 'Reach & virality', niche: 'Indie SaaS and bootstrapping: building in public, growth tactics, founder lessons.', audience: 'Aspiring and early-stage indie founders, 22–40, devs and designers going solo.', style: 'Modern tech, mono accents, clean grid.', colors: '#1d4ed8, #0b1220, #ffffff', typo: 'Mono accents (Space Grotesk)', inspo: '@levelsio, @marc_louvion', notes: 'Hooky contrarian takes do well. Keep it honest and a bit edgy.' },
  { name: 'Camille Mercier', ig: '@maison.mercier', phone: '+33 6 12 34 56 78', page: 'Maison Mercier', goal: 'Sales / leads', niche: 'Boutique interior design studio: small-space styling, mood boards, client transformations.', audience: '28–50 urban homeowners and renters who want a designer look on a realistic budget.', style: 'Warm editorial, serif headlines, magazine layouts.', colors: '#c1654a, #f3ece2, #2a211c', typo: 'Editorial serif (Playfair Display)', inspo: '@studiomcgee', notes: 'Showcase transformations. Aspirational but attainable, soft warm tone.' },
  { name: 'Priya Nair', ig: '@calm.code', phone: '+1 206 555 0119', page: 'Calm Code', goal: 'Followers growth', niche: 'Mindful productivity for knowledge workers: focus systems, anti-burnout, deep work.', audience: '24–40 overworked professionals and students who feel scattered and want calm focus.', style: 'Minimal, airy type, lots of breathing room.', colors: '#7c9473, #e7e0d3, #2f3a2e', typo: 'Minimal sans', inspo: '@aliabdaal', notes: 'Calming, not hustle-culture. Practical frameworks people can apply same day.' },
];
function npFill() {
  const s = NP_SAMPLES[Math.floor(Math.random() * NP_SAMPLES.length)];
  if (!$('#npName').value.trim()) $('#npName').value = s.name;
  if (!$('#npEmail').value.trim()) $('#npEmail').value = s.ig.replace(/^@/, '').replace(/\./g, '') + '@gmail.com';
  $('#npIg').value = s.ig; $('#npPhone').value = s.phone;
  $('#npBPage').value = s.page; $('#npBGoal').value = s.goal;
  $('#npBNiche').value = s.niche; $('#npBAudience').value = s.audience;
  $('#npBStyle').value = s.style; $('#npBNotes').value = s.notes;
  initPalette($('#npBColors'), s.colors); initTypo($('#npBTypo'), s.typo, '', ''); initLogo($('#npBLogo'), '', ''); initIgList($('#npBInspo'), s.inspo);
}

/* ---------- floating talent guide ---------- */
const pill = (txt, col, bg) => `<span style="font-size:10.5px;font-weight:800;color:${col};background:${bg};border-radius:100px;padding:3px 10px;white-space:nowrap">${txt}</span>`;
const G_CATS = `<div style="width:100%;max-width:220px;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:#fff;box-shadow:0 10px 26px rgba(0,0,0,.07)">
  <div style="display:flex;align-items:center;gap:9px;padding:10px 12px;border-left:3px solid var(--orange);background:var(--soft)">
    <span style="width:28px;height:28px;border-radius:8px;background:rgba(248,80,0,.1);display:grid;place-items:center"><svg style="width:16px;height:16px" viewBox="0 0 140 94"><use href="#ic-decks"/></svg></span>
    <span style="flex:1;min-width:0"><b style="font-size:12px;display:block;letter-spacing:-.02em">Decks</b><span style="font-size:10px;color:var(--grey)">6 elements</span></span><span style="color:var(--grey)">›</span></div>
  <div style="display:flex;align-items:center;gap:9px;padding:10px 12px;border-top:1px solid var(--line)">
    <span style="width:28px;height:28px;border-radius:8px;background:rgba(248,80,0,.1);display:grid;place-items:center"><svg style="width:15px;height:15px" viewBox="0 0 134 122"><use href="#ic-story"/></svg></span>
    <span style="flex:1;min-width:0"><b style="font-size:12px;display:block;letter-spacing:-.02em">Stories</b><span style="font-size:10px;color:var(--grey)">3 elements</span></span><span style="color:var(--grey)">›</span></div>
  <div style="display:flex;align-items:center;gap:9px;padding:10px 12px;border-top:1px solid var(--line)">
    <span style="width:28px;height:28px;border-radius:8px;background:var(--soft);display:grid;place-items:center"><svg style="width:16px;height:16px;filter:grayscale(1);opacity:.5" viewBox="0 0 120 120"><use href="#ic-brand"/></svg></span>
    <span style="flex:1;min-width:0"><b style="font-size:12px;display:block;color:#9a9a9a;letter-spacing:-.02em">Branding</b><span style="font-size:10px;color:var(--grey)">Not in the offer</span></span>
    <span style="width:22px;height:22px;border-radius:7px;background:var(--grad);color:#fff;display:grid;place-items:center;font-weight:800;font-size:13px">+</span></div></div>`;
const TUT = [
  { tag: 'Step 1', title: 'Switch projects & read the brief', body: 'Top-left shows the project you are on. Use the switch icon to jump between projects, and the brief icon to see exactly what the client wants. Owners also get a Dashboard button back to the overview.',
    vis: `<div style="width:100%;max-width:222px;border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:0 10px 26px rgba(0,0,0,.07);padding:13px 14px">
      <div style="display:flex;align-items:flex-start;gap:7px">
        <div style="flex:1;min-width:0"><b style="font-size:12.5px;letter-spacing:-.02em">#A1B2 · Nina Park</b><div style="font-size:10.5px;color:var(--grey);margin-top:3px">Flame pack · 6 elements</div></div>
        <span style="width:27px;height:27px;border-radius:8px;background:var(--soft);border:1px solid var(--line);display:grid;place-items:center"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6b6b6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg></span>
        <span style="width:27px;height:27px;border-radius:8px;background:var(--soft);border:1px solid var(--line);display:grid;place-items:center"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6b6b6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg></span></div>
      <div style="margin-top:11px;font-size:10px;color:var(--grey);text-align:center">📄 brief · ⇄ switch project</div></div>` },
  { tag: 'Step 2', title: 'Elements grouped by type', body: 'The board is split into Decks, Stories and Branding. Open a category to fill its elements. A greyed category is not in the offer; the + lets owners add more elements, with no charge.', vis: G_CATS },
  { tag: 'Step 3', title: 'Write the script in slides', body: 'Open an element and write the copy slide by slide. Format with Title, Bold and Highlight, add or remove slides, then Send script → for the client to approve.',
    vis: `<div style="width:100%;max-width:224px">
      <div style="display:flex;gap:5px;margin-bottom:8px">
        <span style="font-size:10px;font-weight:800;background:var(--soft);border-radius:7px;padding:5px 9px">Title</span>
        <span style="font-size:10px;font-weight:800;background:var(--soft);border-radius:7px;padding:5px 10px">B</span>
        <span style="font-size:10px;font-weight:800;background:var(--soft);border-radius:7px;padding:5px 9px"><mark style="background:#ffe39a">H</mark></span></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;font-size:11px;line-height:1.5">
        <b style="font-size:12px;display:block;margin-bottom:3px">Slide 1</b>Stop believing these <mark style="background:#ffe39a">3 money myths</mark>…</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:9px"><span style="font-size:10px;font-weight:800;color:var(--grey)">+ Add slide</span>${pill('Send script →', '#fff', 'var(--grad)')}</div></div>` },
  { tag: 'Step 4', title: 'Upload the design', body: 'Once the script is approved the element switches to design. Drop up to 10 images, then Send design → to the client.',
    vis: `<div style="width:100%;max-width:224px">
      <div style="font-size:10px;color:var(--grey);font-weight:700;margin-bottom:7px">2/10 images</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">
        <div style="aspect-ratio:1;border-radius:9px;background:linear-gradient(160deg,#ffd9c4,#fff3ec)"></div>
        <div style="aspect-ratio:1;border-radius:9px;background:linear-gradient(160deg,#1a1a1a,#0a0a0a)"></div>
        <div style="aspect-ratio:1;border-radius:9px;border:1.5px dashed var(--line);display:grid;place-items:center;font-size:9px;font-weight:800;color:var(--grey);text-align:center;line-height:1.2">+ Add</div></div>
      <div style="display:flex;justify-content:flex-end;margin-top:9px">${pill('Send design →', '#fff', 'var(--grad)')}</div></div>` },
  { tag: 'Step 5', title: 'The client reviews', body: 'The client approves, or requests a retouch (limited to what their offer includes). When the script and design are both approved, the element turns Done ✓.',
    vis: `<div style="display:flex;flex-direction:column;gap:10px;align-items:center">
      ${pill('Design · awaiting client', '#2563eb', 'rgba(37,99,235,.12)')}
      <div style="font-size:18px;color:var(--grey);line-height:1">↓</div>
      <div style="display:flex;gap:8px">${pill('Done ✓', 'var(--ok)', 'var(--okbg)')}${pill('Retouch requested', 'var(--wait)', 'var(--waitbg)')}</div></div>` },
  { tag: 'Step 6', title: 'Chat with the client', body: 'Talk to the client in the panel on the right. Pick an element so they know which asset you mean. The orange dot tells you when a new message lands, even when the chat is collapsed.',
    vis: `<div style="width:100%;max-width:222px;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:#fff;box-shadow:0 10px 26px rgba(0,0,0,.07)">
      <div style="display:flex;align-items:center;gap:9px;padding:9px 11px;border-bottom:1px solid var(--line)">
        <span style="width:30px;height:30px;border-radius:50%;background:var(--grad);color:#fff;display:grid;place-items:center;font-weight:900;font-size:12px">NP</span>
        <span><span style="font-size:9.5px;font-weight:800;color:var(--orange)">Client</span><b style="display:block;font-size:12px;letter-spacing:-.02em">Nina Park</b></span></div>
      <div style="padding:11px;background:var(--soft);display:flex;flex-direction:column;gap:6px">
        <span style="align-self:flex-start;display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:800;color:var(--orange);background:rgba(248,80,0,.1);border:1px solid rgba(248,80,0,.2);border-radius:100px;padding:2px 7px"><svg style="width:11px;height:11px" viewBox="0 0 140 94"><use href="#ic-decks"/></svg>Deck 1</span>
        <span style="align-self:flex-start;background:#fff;border:1px solid var(--line);border-radius:12px;border-bottom-left-radius:4px;padding:7px 10px;font-size:11px;max-width:88%">Love slide 2, can we punch up the hook?</span></div></div>` },
];
let TUTI = 0;
function renderTut() {
  const s = TUT[TUTI];
  $('#tutTag').textContent = s.tag;
  $('#tutVis').innerHTML = s.vis;
  $('#tutTitle').textContent = s.title;
  $('#tutBody').textContent = s.body;
  $('#tutDots').innerHTML = TUT.map((_, i) => `<i class="${i === TUTI ? 'on' : ''}"></i>`).join('');
  $('#tutBack').style.visibility = TUTI === 0 ? 'hidden' : 'visible';
  $('#tutNext').textContent = TUTI === TUT.length - 1 ? 'Got it ✓' : 'Next →';
}

async function submitNewProject(e) {
  e.preventDefault(); $('#npErr').textContent = '';
  const btn = $('#npSubmit'); btn.disabled = true; const old = btn.textContent; btn.innerHTML = '<span class="spin"></span>';
  const f = { name: $('#npName').value.trim(), email: $('#npEmail').value.trim(), instagram: $('#npIg').value.trim(),
    phone: $('#npPhone').value.trim(), plan: NP.plan, billing: NP.billing,
    decks: Number($('#npDecks').value) || 0, addons: npSelectedAddonKeys(), answers: npBrief() };
  try {
    if (NP_EDIT) {
      const r = await api('/api/admin', { action: 'update_order', ref: NP_EDIT, talent_email: $('#npTalent').value || null, ...f });
      if (!r.ok) { $('#npErr').textContent = 'Could not save (' + (r.error || 'error') + ').'; return; }
      ADMIN.orders = r.orders || ADMIN.orders; ORDERS = ADMIN.orders; $('#newModal').classList.add('hide'); renderProjectsSection();
    } else {
      const r = await api('/api/admin', { action: 'create_order', talentEmail: $('#npTalent').value || null, ...f });
      if (!r.ok) { $('#npErr').textContent = 'Could not create (' + (r.error || 'error') + ').'; return; }
      ORDERS = r.orders || ORDERS; ADMIN.orders = ORDERS; $('#newModal').classList.add('hide');
      if (r.ref) openOrder(r.ref);
    }
  } catch (e2) { $('#npErr').textContent = 'Network error.'; }
  finally { btn.disabled = false; btn.textContent = old; }
}
async function deleteProject() {
  if (!NP_EDIT) return;
  if (!confirm('Delete project #' + NP_EDIT + '?\n\nThis permanently removes the order, all its elements and messages. This cannot be undone.')) return;
  const r = await api('/api/admin', { action: 'delete_order', ref: NP_EDIT });
  if (!r.ok) { alert('Error: ' + (r.error || '')); return; }
  ADMIN.orders = r.orders || ADMIN.orders; ORDERS = ADMIN.orders;
  try { if (localStorage.getItem('brasero_last_ref') === NP_EDIT) localStorage.removeItem('brasero_last_ref'); } catch (e) {}
  $('#newModal').classList.add('hide'); renderProjectsSection();
}

/* ---------- detail / project switcher ---------- */
function backToOverview() { REF = ''; showAdmin('projects'); }
function renderSwitcher() {
  const items = ORDERS.map(o => {
    const pack = planName(o.plan) ? planName(o.plan) + ' pack' : '';
    return `<button type="button" class="swi ${o.ref === REF ? 'on' : ''}" data-ref="${esc(o.ref)}">
      <div class="swi__l"><span class="swi__name">${esc(o.name || 'Untitled')} <span class="swi__ref">#${esc(o.ref)}</span></span><span class="swi__pack">${esc(pack)}</span></div>
      <div class="swi__r">${spill(o.state)}${dlBadge(o, o.kinds)}</div>
    </button>`;
  }).join('');
  const ownerExtras = (ME && ME.is_owner) ? `<div class="swi__sep"></div>
    <button type="button" class="swi swi--act" data-act="new">+ New project</button>
    <button type="button" class="swi swi--act" data-act="overview">View all projects</button>` : '';
  $('#switcherMenu').innerHTML = (items || '<div class="swi__empty">No projects yet.</div>') + ownerExtras;
}
async function openOrder(ref, restore) {
  REF = ref.replace(/^#/, '');
  const d = await api('/api/admin', { action: 'get', ref: REF });
  if (!d.ok) { alert(d.error === 'forbidden' ? 'Not your project.' : 'Order not found'); return; }
  try { localStorage.setItem('brasero_last_ref', REF); localStorage.setItem('brasero_nav', 'order'); } catch (e) {}
  $('#adminApp').classList.add('hide'); $('#detail').classList.remove('hide');
  document.body.classList.add('appmode');
  $('#toDash').classList.toggle('hide', !(ME && ME.is_owner));
  renderSwitcher();
  const o = d.order;
  $('#oAvatar').innerHTML = clientAv(o, 'iav--xl');
  $('#oName').textContent = o.name || o.email || 'Client';
  const user = igUser(o.instagram || o.handle), ig = $('#oIg');
  if (user) { ig.textContent = '@' + user; ig.style.display = ''; } else { ig.textContent = ''; ig.style.display = 'none'; }
  const badges = [`<span class="dl">#${esc(o.ref)}</span>`];
  badges.push(dlBadge(d.order, kindsOfDecks(d.decks)));
  $('#oBadges').innerHTML = badges.join('');
  $('#clientView').classList.toggle('hide', !(ME && ME.is_owner));
  const foot = R.querySelector('.side__foot'); if (foot) foot.style.display = (ME && ME.is_owner) ? '' : 'none';
  renderSideMe();
  SELDECK = null; CAT = null;
  BRIEF = d.brief || null; CURORDER = d.order || null;
  const decks = d.decks || [];
  // On a refresh, reopen every tab that was open before, not just the active one.
  let savedKeys = null, savedActive = '';
  if (restore) {
    try { savedKeys = JSON.parse(localStorage.getItem('brasero_open_tabs') || 'null'); } catch (_) {}
    savedActive = localStorage.getItem('brasero_last_tab') || '';
  }
  TABS = [{ kind: 'brief' }];
  if (Array.isArray(savedKeys)) savedKeys.forEach(k => {
    if (k && k.indexOf('deck:') === 0) { const id = k.slice(5); if (decks.some(x => String(x.id) === id) && !TABS.some(t => tabKey(t) === k)) TABS.push({ kind: 'deck', id }); }
  });
  ATAB = (savedActive && TABS.some(t => tabKey(t) === savedActive)) ? savedActive : 'brief';
  renderBoard(decks);
  chatAsset = ''; renderExpert();
  MESSAGES = d.messages || []; renderMessages(); renderAssetCur(); setUnread(false); startMsgPoll();
}

/* ---------- project brief ---------- */
let BRIEF = null, CURORDER = null;
const BRIEF_LABELS = { page: 'Page / brand', handle: 'Instagram', goal: '#1 goal', niche: 'What the page is about', audience: 'Target audience', freq: 'Posting frequency', challenge: 'Biggest challenge', style: 'Brand vibe', colors: 'Brand colors', typo: 'Typography', inspo: 'Instagram inspiration', notes: 'Anything else' };
const BRIEF_ICONS = {
  page: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  goal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/>',
  freq: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  typo: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  logo: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-4.5-4.5L7 20"/>',
  niche: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2 1 2.1h5c.1-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  audience: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"/><path d="M16 6.5a3 3 0 0 1 0 5M20.5 19c0-2.3-1.3-3.8-3.3-4.3"/>',
  colors: '<path d="M12 3.5s6 6 6 9.8a6 6 0 0 1-12 0C6 9.5 12 3.5 12 3.5z"/>',
  style: '<path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7z"/>',
  inspo: '<path d="M12 20l-1.1-1C6.6 15.1 4 12.7 4 9.8 4 7.6 5.7 6 7.8 6c1.3 0 2.5.6 3.2 1.6C11.7 6.6 12.9 6 14.2 6 16.3 6 18 7.6 18 9.8c0 2.9-2.6 5.3-6.9 9.2z"/>',
  challenge: '<path d="M5 21V4M5 4h12l-2 3.5L17 11H5"/>',
  notes: '<path d="M5 19h4L19 9l-4-4L5 15z"/><path d="M14 6l4 4"/>',
  _d: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
};
function briefHTML() {
  const b = (BRIEF && typeof BRIEF === 'object') ? BRIEF : {}, o = CURORDER || {};
  const ADDON_LBL = { branding: 'Branding', story3: '3 stories', story6: '6 stories', story9: '9+1 stories', bundle: 'Mega Bundle' };
  const nm = o.name || 'Client';
  const sub = [];
  if (o.instagram) { const u = o.instagram.replace(/^@/, ''); sub.push(`<a href="https://instagram.com/${esc(u)}" target="_blank" rel="noopener">${esc(o.instagram)}</a>`); }
  if (o.plan) sub.push(`<span>${esc(planName(o.plan))} pack</span>`);
  if (o.addons && o.addons.length) sub.push(`<span>+ ${esc(o.addons.map(k => ADDON_LBL[k] || k).join(', '))}</span>`);
  if (ME && ME.is_owner) { if (o.email) sub.push(`<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>`); if (o.phone) sub.push(`<span>${esc(o.phone)}</span>`); }
  const head = `<div class="briefin__head">${clientAv(o, 'iav--lg')}
    <div style="min-width:0"><div class="briefpage__nm">${esc(nm)}</div>
      <div class="briefpage__sub">${sub.join('<span class="sep">·</span>')}</div></div></div>`;
  const val = (k) => {
    const v = (k === 'typo') ? b.typo : b[k];
    if (k === 'colors') { const cols = String(v || '').split(',').map(s => s.trim()).filter(c => /^#?[0-9a-f]{3,8}$/i.test(c));
      return `<div class="bt__colors">${cols.map(c => { const hx = c[0] === '#' ? c : '#' + c; return `<span><i style="background:${esc(hx)}"></i><b>${esc(hx)}</b></span>`; }).join('')}</div>`; }
    if (k === 'typo') { let s = v ? `<b>${esc(String(v))}</b>` : '<span style="color:var(--grey)">Imported font</span>';
      if (b.typo_file) s += `<br><a class="biglink" href="${esc(b.typo_file)}" download="${esc(b.typo_file_name || 'font')}">⬇ ${esc(b.typo_file_name || 'font file')}</a>`;
      return s; }
    if (k === 'inspo') { return String(v || '').split(',').map(s => s.trim()).filter(Boolean).map(u => { const user = u.replace(/^@/, '');
      return `<a class="biglink" href="https://instagram.com/${esc(user)}" target="_blank" rel="noopener">${esc(u)}</a>`; }).join('&nbsp;&nbsp;·&nbsp;&nbsp;'); }
    if (k === 'logo') { return `<div class="bt__logo"><img src="${esc(b.logo)}" alt="Brand logo"></div>`; }
    return esc(String(v || ''));
  };
  const has = (k) => k === 'typo' ? (b.typo || b.typo_file) : b[k];
  const icon = (k) => `<svg class="bt__ic" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BRIEF_ICONS[k] || BRIEF_ICONS._d}</svg>`;
  const DL_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14"/></svg>';
  const TILES = [
    ['page', 'Page / brand', 1, ''],
    ['goal', '#1 goal', 1, ''],
    ['freq', 'Posting frequency', 1, ''],
    ['typo', 'Typography', 1, ''],
    ['logo', 'Brand logo', 1, ''],
    ['niche', 'What the page is about', 2, ''],
    ['audience', 'Target audience', 2, ''],
    ['colors', 'Brand colors', 2, 'bt--colors'],
    ['style', 'Brand vibe', 2, ''],
    ['inspo', 'Instagram inspiration', 2, ''],
    ['challenge', 'Biggest challenge', 2, ''],
    ['notes', 'Anything else', 4, ''],
  ];
  const COVERED = new Set(TILES.map(t => t[0]).concat('handle', 'logo_name'));
  Object.keys(b).filter(k => !COVERED.has(k) && !/_file(_name)?$/.test(k) && b[k]).forEach(k => TILES.push([k, BRIEF_LABELS[k] || k, 2, '']));
  const tiles = TILES.filter(([k]) => has(k)).map(([k, label, span, cls]) => {
    const act = (k === 'logo' && b.logo) ? `<a class="bt__dl" href="${esc(b.logo)}" download="${esc(b.logo_name || 'brand-logo')}" title="Download ${esc(b.logo_name || 'logo')}">${DL_ARROW}</a>` : '';
    return `<div class="bt bt--${span} ${cls}"><div class="bt__k">${icon(k)}<span>${esc(label)}</span>${act}</div><div class="bt__v">${val(k)}</div></div>`;
  }).join('');
  const body = tiles ? `<div class="bento">${tiles}</div>` : '<div class="bempty">No brief was filled in for this project yet.</div>';
  return `<div class="briefin">${head}${body}</div>`;
}
function renderSideMe() {
  const el = $('#sideMe'); if (!el || !ME) return;
  el.innerHTML = `${avatarRole(ME, 'sm')}<div class="side__me-info"><span class="side__me-name" title="${esc(ME.name || ME.email)}">${esc(ME.name || ME.email.split('@')[0])}</span></div>${meActions('sideLogout')}`;
  wireAcct(el, 'sideLogout');
}

/* ---------- conversation with the client ---------- */
let MESSAGES = [];
let chatAsset = '';
function deckTitleById(id) { const d = DECKS.find(x => String(x.id) === String(id)); return d ? d.title : ''; }
function deckTypeById(id) { const d = DECKS.find(x => String(x.id) === String(id)); return d ? (d.type || 'carousel') : 'carousel'; }
function renderExpert() {
  const el = $('#chatExpert'); if (!el) return;
  const nm = (CURORDER && CURORDER.name) ? CURORDER.name : 'Client';
  el.innerHTML = `${clientAv(CURORDER, 'iav--exp')}<div class="expert__info"><span class="expert__label">Client</span><b class="expert__name">${esc(nm)}<span class="chat__dot hide" id="chatDotHead"></span></b></div>`;
}
function renderMessages() {
  const t = $('#chatThread'); if (!t) return;
  const nm = (CURORDER && CURORDER.name) ? CURORDER.name : 'the client';
  if (!MESSAGES.length) { t.innerHTML = `<div class="chat__empty">Chat directly with <b>${esc(nm)}</b> about this order. Pick an element to reply about a specific asset.</div>`; }
  else t.innerHTML = MESSAGES.map(m => {
    const cls = m.sender === 'studio' ? 'msg--studio' : 'msg--client';
    const about = m.deck_id ? `<span class="msg__about">${TYPE_ICON[deckTypeById(m.deck_id)] || ''} ${esc(deckTitleById(m.deck_id) || 'Element')}</span>` : '';
    const who = esc(m.sender_name || (m.sender === 'studio' ? 'You' : 'Client'));
    const bubble = m.body ? `<div class="msg__bubble">${esc(m.body)}</div>` : '';
    const imgs = (m.images && m.images.length) ? `<div class="msg__imgs">${m.images.map(u => `<button type="button" class="msg__img" data-full="${esc(u)}" title="View"><img src="${esc(u)}" alt="attachment" loading="lazy" decoding="async"></button>`).join('')}</div>` : '';
    const del = (ME && ME.is_owner && m.id) ? `<button type="button" class="msg__del" data-del-msg="${esc(m.id)}" title="Delete this message">✕</button>` : '';
    return `<div class="msg ${cls}">${about}${bubble}${imgs}<span class="msg__meta">${who} · ${fmtMsgTime(m.created_at)}${del}</span></div>`;
  }).join('');
  t.scrollTop = t.scrollHeight;
}
function renderAssetCur() {
  const cur = $('#assetCur'); if (!cur) return;
  if (!chatAsset || !DECKS.some(d => String(d.id) === String(chatAsset))) { chatAsset = ''; cur.innerHTML = 'General'; return; }
  cur.innerHTML = `${TYPE_ICON[deckTypeById(chatAsset)] || ''}<span>${esc(deckTitleById(chatAsset))}</span>`;
}
function renderAssetMenu() {
  const gen = `<button type="button" class="assetopt ${chatAsset ? '' : 'on'}" data-asset=""><span class="assetopt__ic assetopt__ic--g">＃</span><span>General</span></button>`;
  const rows = DECKS.map(d => `<button type="button" class="assetopt ${String(d.id) === String(chatAsset) ? 'on' : ''}" data-asset="${esc(d.id)}"><span class="assetopt__ic">${TYPE_ICON[d.type] || TYPE_ICON.carousel}</span><span>${esc(d.title)}</span></button>`).join('');
  $('#assetMenu').innerHTML = gen + rows;
}
let chatImgs = [];
function renderAtts() {
  const w = $('#chatAtts'); if (!w) return;
  if (!chatImgs.length) { w.classList.add('hide'); w.innerHTML = ''; return; }
  w.classList.remove('hide');
  w.innerHTML = chatImgs.map((u, i) => `<div class="att"><img src="${u}" alt=""><button type="button" data-att="${i}" title="Remove">✕</button></div>`).join('');
}
let lbUrl = '';
let MSGPOLL = null;
function setUnread(on) { $('#chatDotFab')?.classList.toggle('hide', !on); $('#chatDotHead')?.classList.toggle('hide', !on); }
async function pollMessages() {
  if (!REF || document.hidden) return;
  try {
    const r = await api('/api/admin', { action: 'messages', ref: REF });
    if (r.ok && Array.isArray(r.messages) && r.messages.length !== MESSAGES.length) {
      const grew = r.messages.length > MESSAGES.length;
      const newFromClient = grew && r.messages.slice(MESSAGES.length).some(m => m.sender !== 'studio');
      MESSAGES = r.messages; renderMessages();
      if (newFromClient && !$('#board')?.classList.contains('chat-open')) setUnread(true);
    }
  } catch (e) {}
}
function startMsgPoll() { stopMsgPoll(); MSGPOLL = setInterval(pollMessages, 7000); }
function stopMsgPoll() { if (MSGPOLL) { clearInterval(MSGPOLL); MSGPOLL = null; } }
function setChatOpen(open) { $('#board')?.classList.toggle('chat-open', open); if (open) { setUnread(false); $('#chatInput')?.focus(); } }

/* ---------- decks ---------- */
const PILL = { writing: ['pill--wait', 'Writing'], script_review: ['pill--act', 'Script · awaiting client'], designing: ['pill--act', 'Designing'], design_review: ['pill--act', 'Design · awaiting client'], revision: ['pill--act', 'Retouch requested'], done: ['pill--done', 'Done ✓'] };
// Branding 'writing' = waiting on the client's brief, not us writing a script.
function pillFor(d) { if ((d.type || '') === 'branding' && d.status === 'writing') return ['pill--wait', 'Awaiting client']; return PILL[d.status] || PILL.writing; }
let DECKS = [], SELDECK = null, CAT = null;
const DECK_CATS = [{ key: 'carousel', label: 'Decks' }, { key: 'story', label: 'Stories' }, { key: 'branding', label: 'Branding' }];
function decksOfCat(k) { return DECKS.filter(d => (d.type || 'carousel') === k); }
let TABS = [], ATAB = null;
const BRIEF_TAB_ICON = `<svg class="ti" viewBox="0 0 24 24" fill="none" stroke="url(#tgrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a0 0 0 0 1 0 0H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>`;
function tabKey(t) { return t.kind === 'brief' ? 'brief' : 'deck:' + t.id; }
function renderTabs() {
  try { localStorage.setItem('brasero_last_tab', ATAB || 'brief'); localStorage.setItem('brasero_open_tabs', JSON.stringify(TABS.map(tabKey))); } catch (e) {}
  const el = $('#boardTabs'); if (!el) return;
  if (!TABS.length) { el.classList.add('hide'); el.innerHTML = ''; return; }
  el.classList.remove('hide');
  el.innerHTML = TABS.map(t => { const k = tabKey(t), on = k === ATAB ? 'on' : '';
    if (t.kind === 'brief') return `<div class="tab ${on}" data-tab="brief"><span class="tab__ic">${BRIEF_TAB_ICON}</span><span class="tab__l">Brief</span><button type="button" class="tab__x" data-tabx="brief" title="Close">✕</button></div>`;
    const d = DECKS.find(x => String(x.id) === String(t.id)), ic = TYPE_ICON[d ? (d.type || 'carousel') : 'carousel'] || TYPE_ICON.carousel;
    return `<div class="tab ${on}" data-tab="${esc(k)}"><span class="tab__ic">${ic}</span><span class="tab__l">${esc(d ? d.title : 'Element')}</span><button type="button" class="tab__x" data-tabx="${esc(k)}" title="Close">✕</button></div>`;
  }).join('');
}
function renderMiddle() {
  const cmd = $('#deckCmd');
  if (ATAB === 'brief') { $('#deckDetail').innerHTML = briefHTML(); cmd.innerHTML = ''; cmd.style.display = 'none'; return; }
  if (ATAB && ATAB.indexOf('deck:') === 0) { SELDECK = ATAB.slice(5); cmd.style.display = ''; renderDeckDetail(); return; }
  $('#deckDetail').innerHTML = `<div class="empty">${DECKS.length ? 'Pick an element on the left, or open the brief.' : 'No elements yet. Open the brief or add one.'}</div>`; cmd.innerHTML = ''; cmd.style.display = 'none';
}
function openTab(t) { const k = tabKey(t); if (!TABS.some(x => tabKey(x) === k)) TABS.push(t); ATAB = k; if (t.kind === 'deck') SELDECK = t.id; renderTabs(); renderSidebar(); renderMiddle(); }
function activateTab(k) { ATAB = k; const t = TABS.find(x => tabKey(x) === k); if (t && t.kind === 'deck') SELDECK = t.id; renderTabs(); renderSidebar(); renderMiddle(); }
function closeTab(k) { const i = TABS.findIndex(x => tabKey(x) === k); if (i < 0) return; TABS.splice(i, 1);
  if (ATAB === k) { const n = TABS[i] || TABS[i - 1] || null; ATAB = n ? tabKey(n) : null; if (n && n.kind === 'deck') SELDECK = n.id; }
  renderTabs(); renderSidebar(); renderMiddle(); }
function renderBoard(decks) {
  DECKS = decks || [];
  TABS = TABS.filter(t => t.kind === 'brief' || DECKS.some(d => String(d.id) === String(t.id)));
  if (ATAB && !TABS.some(t => tabKey(t) === ATAB)) ATAB = TABS.length ? tabKey(TABS[TABS.length - 1]) : null;
  if (CAT && !decksOfCat(CAT).length) CAT = null;
  renderSidebar(); renderTabs(); renderMiddle();
}
function renderSidebar() { if (CAT) renderCatList(CAT); else renderCategories(); }
function renderCategories() {
  $('#deckList').innerHTML = DECK_CATS.map(c => {
    const items = decksOfCat(c.key), n = items.length, ic = TYPE_ICON[c.key] || TYPE_ICON.carousel;
    if (n) {
      const done = items.filter(d => d.status === 'done').length;
      return `<button type="button" class="catrow" data-cat="${c.key}">
        <span class="catrow__ic">${ic}</span>
        <span class="catrow__l"><span class="catrow__n">${c.label}</span><span class="catrow__s">${n} element${n > 1 ? 's' : ''} · ${done}/${n} done</span></span>
        <svg class="catrow__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>`;
    }
    const add = (ME && ME.is_owner) ? `<span class="catrow__add" data-addcat="${c.key}" title="Add as an upsell">+</span>` : '';
    return `<div class="catrow catrow--off">
      <span class="catrow__ic">${ic}</span>
      <span class="catrow__l"><span class="catrow__n">${c.label}</span><span class="catrow__s">Not in this offer</span></span>
      ${add}</div>`;
  }).join('');
}
function deckItemHTML(d) {
  const [pc, pl] = pillFor(d), ic = TYPE_ICON[d.type] || TYPE_ICON.carousel, sel = d.id === SELDECK ? 'sel' : '';
  return `<button type="button" class="deckitem ${sel}" data-pick="${d.id}">
    <div class="deckitem__top"><span class="deckitem__title">${ic}<span>${esc(d.title)}</span></span></div>
    <div class="miniprog"><i style="width:${DPCT[d.status] || 10}%"></i></div>
    <span class="pill ${pc} deckitem__pill">${pl}</span>
  </button>`;
}
function renderCatList(cat) {
  const c = DECK_CATS.find(x => x.key === cat), items = decksOfCat(cat);
  $('#deckList').innerHTML = `<button type="button" class="catback" data-catback><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg> ${c ? c.label : 'Categories'}</button>`
    + items.map(deckItemHTML).join('');
}
function renderDeckDetail() {
  const d = DECKS.find(x => x.id === SELDECK);
  if (!d) { $('#deckDetail').innerHTML = `<div class="empty">${CAT ? 'Select an element on the left.' : 'Pick a category on the left to see its elements.'}</div>`; $('#deckCmd').innerHTML = ''; return; }
  $('#deckDetail').innerHTML = detailHTML(d);
  $('#deckCmd').innerHTML = cmdHTML(d);
  bind(d);
  // Fetch this deck's images on first view (the list omits them), then repaint the
  // gallery with the real thumbnails + their drag/delete wiring.
  if (!imagesLoaded(d)) loadDeckImages(d).then(() => { if (SELDECK === d.id) renderDeckDetail(); });
}

/* ---------- owner: add elements ---------- */
const AE_GROUPS = [
  { key: 'decks', title: 'Carousels', sub: 'Add any number of carousels', icon: 'carousel', type: 'carousel', mode: 'qty', unit: 'carousel' },
  { key: 'stories', title: 'Stories', sub: 'Add any number of stories', icon: 'story', type: 'story', mode: 'qty', unit: 'story' },
  { key: 'branding', title: 'Branding', sub: 'Full branding pack', icon: 'branding', type: 'branding', mode: 'pack', item: 'brand_full', note: 'Profile photo, X / LinkedIn / Facebook / YouTube banners, LinkedIn CTAs' },
];
let aeCat = null;
function aeSyncN() { const c = $('#aeCount'); if (!c) return 1; let n = Math.max(1, Math.min(50, Number(c.value) || 1)); if ($('#aeN')) $('#aeN').textContent = n; return n; }
function renderAE() {
  const b = $('#aeBody');
  if (!aeCat) { b.innerHTML = `<div class="aecats">${AE_GROUPS.map(g => `<button type="button" class="aecat" data-aecat="${g.key}"><span class="aecat__vis">${TYPE_ICON[g.icon]}</span><span class="aecat__body"><b>${g.title}</b><span>${g.sub}</span></span><svg class="aecat__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>`).join('')}</div>`; return; }
  const g = AE_GROUPS.find(x => x.key === aeCat);
  let inner;
  if (g.mode === 'qty') {
    inner = `<div class="aeqty">
      <div class="aeqty__row">
        <button type="button" class="aeqty__b" data-step="-1">−</button>
        <input id="aeCount" class="aeqty__in" type="number" min="1" max="50" value="3">
        <button type="button" class="aeqty__b" data-step="1">+</button>
      </div>
      <div class="aeqty__chips">${[3, 6, 10].map(n => `<button type="button" class="aeqty__chip" data-set="${n}">+${n}</button>`).join('')}</div>
      <button type="button" class="b-grad" id="aeAdd" style="width:100%">+ Add <span id="aeN">3</span> ${esc(g.unit)}s</button>
    </div>`;
  } else {
    inner = `<button type="button" class="aeitem" data-aeitem="${g.item}"><span class="aeitem__l">${g.title}${g.note ? `<small>${g.note}</small>` : ''}</span><span class="aeitem__add">+ Add</span></button>`;
  }
  b.innerHTML = `<button type="button" class="aeback" data-aeback>← All elements</button>${inner}`;
}
function openAddElems(group) { aeCat = AE_GROUPS.some(g => g.key === group) ? group : null; renderAE(); $('#addElemModal').classList.remove('hide'); }

/* The board list ships each deck without its image bytes (just image_count); a
   deck's images are fetched once, on demand, the first time its tab is shown and
   then cached here by id. IMG_CACHE survives renderBoard (which swaps DECKS for
   fresh light rows), so we never re-download an open deck's images on save. */
const IMG_CACHE = {};
function imagesOf(d) { const c = IMG_CACHE[d.id]; return (c && c.loaded) ? c.images : []; }
function imgCount(d) { const c = IMG_CACHE[d.id]; return (c && c.loaded) ? c.images.length : (d.image_count || 0); }
function imagesLoaded(d) { return (d.image_count || 0) === 0 || !!(IMG_CACHE[d.id] && IMG_CACHE[d.id].loaded); }
async function loadDeckImages(d) {
  if (IMG_CACHE[d.id] && IMG_CACHE[d.id].loaded) return;
  try { const r = await api('/api/admin', { action: 'deck_images', ref: REF, deckId: d.id });
    if (r && r.ok) IMG_CACHE[d.id] = { images: Array.isArray(r.images) ? r.images : [], loaded: true }; }
  catch (e) {}
}
function tThumb(u, editable) { return `<figure><img src="${esc(u)}" alt="" loading="lazy" decoding="async">${editable ? '<button class="x" data-x title="Remove">✕</button>' : ''}</figure>`; }
function slidesEditorHTML(d) {
  const slides = parseSlides(d.script);
  const rows = slides.map((h, i) => { const m = slideMeta(i, slides.length); return `<div class="slide ${m.cls}" data-slide>
    <div class="slide__bar"><button type="button" class="slide__drag" data-slide-drag title="Reorder" aria-label="Reorder">⠿</button><span class="slide__n">${m.label}</span><button type="button" class="slide__del" data-slide-del title="Remove slide">✕</button></div>
    <div class="slide__edit" contenteditable="true" data-slide-body>${sanitizeSlide(h)}</div></div>`; }).join('');
  return `<div class="rt-toolbar">
      <button type="button" data-rt="title" title="Title">Title</button>
      <button type="button" data-rt="bold" title="Bold"><b>B</b></button>
      <button type="button" data-rt="mark" title="Highlight"><mark>H</mark></button>
    </div>
    <div class="slides" data-f="script">${rows}</div>
    <button type="button" class="b-ghost b-sm slide__add" data-slide-add>+ Add slide</button>`;
}
function renumberSlides(det) {
  const slides = [...det.querySelectorAll('.slides [data-slide]')];
  slides.forEach((el, i) => { const m = slideMeta(i, slides.length);
    const n = el.querySelector('.slide__n'); if (n) n.textContent = m.label;
    el.classList.remove('slide--hook', 'slide--cta'); if (m.cls) el.classList.add(m.cls); });
}
/* drag-and-drop slide reordering (talent + owner) */
function slideDropTarget(slidesEl, y) {
  const els = [...slidesEl.querySelectorAll('[data-slide]:not(.slide--drag)')];
  let best = null, bestOff = -Infinity;
  for (const el of els) { const box = el.getBoundingClientRect(); const off = y - box.top - box.height / 2;
    if (off < 0 && off > bestOff) { bestOff = off; best = el; } }
  return best;
}
function wireSlideDnD(slidesEl, det) {
  if (!slidesEl) return;
  // Pointer-based reorder: reliable, and unlike HTML5 drag it never fights the
  // contenteditable slide bodies (we only act when the grab starts on a handle).
  let el = null, startY = 0, moving = false;
  slidesEl.addEventListener('pointerdown', e => {
    const h = e.target.closest('[data-slide-drag]'); if (!h) return;
    el = h.closest('[data-slide]'); if (!el) return;
    startY = e.clientY; moving = false;
    try { slidesEl.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  slidesEl.addEventListener('pointermove', e => {
    if (!el) return;
    if (!moving) { if (Math.abs(e.clientY - startY) < 4) return; moving = true; el.classList.add('slide--drag'); }
    e.preventDefault();
    const after = slideDropTarget(slidesEl, e.clientY);
    if (after == null) { if (slidesEl.lastElementChild !== el) slidesEl.appendChild(el); }
    else if (after !== el) slidesEl.insertBefore(el, after);
  });
  const end = e => { if (!el) return; try { slidesEl.releasePointerCapture(e.pointerId); } catch (_) {} el.classList.remove('slide--drag'); el = null; moving = false; renumberSlides(det); };
  slidesEl.addEventListener('pointerup', end);
  slidesEl.addEventListener('pointercancel', end);
}
/* drag-and-drop image reordering (editable gallery). Mirrors the slide reorder:
   pointer-based so it never starts a native image drag, and we ignore grabs that
   land on the ✕ delete button. New order is read from the DOM by gatherImgs on
   Save/Send, so no separate persist step is needed. */
function galDropTarget(galEl, x, y) {
  const figs = [...galEl.querySelectorAll('figure:not(.gal--placeholder)')];
  let best = null, bestDist = Infinity, after = false;
  for (const f of figs) { const b = f.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestDist) { bestDist = d; best = f; after = (y > cy + b.height / 4) || (Math.abs(y - cy) <= b.height / 2 && x > cx); } }
  return { best, after };
}
function wireGalleryDnD(galEl) {
  if (!galEl) return;
  // The grabbed tile is cloned into a floating "ghost" that tracks the cursor, while
  // the real <figure> stays in the grid as a faded placeholder and reflows to show
  // where it will land - so the image genuinely moves with the mouse.
  let el = null, ghost = null, startX = 0, startY = 0, grabX = 0, grabY = 0, moving = false;
  galEl.addEventListener('pointerdown', e => {
    if (e.target.closest('[data-x]')) return; // let the delete button click through
    const fig = e.target.closest('figure');
    if (!fig || fig.classList.contains('gal__skel')) return;
    el = fig;
    const r = el.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY; grabX = e.clientX - r.left; grabY = e.clientY - r.top;
    moving = false;
    try { galEl.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  galEl.addEventListener('pointermove', e => {
    if (!el) return;
    if (!moving) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
      moving = true;
      const r = el.getBoundingClientRect();
      ghost = el.cloneNode(true);
      ghost.classList.add('gal__ghost');
      ghost.querySelectorAll('[data-x]').forEach(n => n.remove());
      ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
      ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px';
      document.body.appendChild(ghost);
      el.classList.add('gal--placeholder');
    }
    e.preventDefault();
    ghost.style.left = (e.clientX - grabX) + 'px';
    ghost.style.top = (e.clientY - grabY) + 'px';
    const { best, after } = galDropTarget(galEl, e.clientX, e.clientY);
    if (best && best !== el) { const ref = after ? best.nextElementSibling : best; if (ref !== el) galEl.insertBefore(el, ref); }
  });
  const end = e => { if (!el) return; try { galEl.releasePointerCapture(e.pointerId); } catch (_) {} if (ghost) { ghost.remove(); ghost = null; } el.classList.remove('gal--placeholder'); el = null; moving = false; };
  galEl.addEventListener('pointerup', end);
  galEl.addEventListener('pointercancel', end);
}
function buildScaffoldSlides(n, b, o) {
  b = b || {};
  const niche = (b.niche || '').trim();
  const topic = niche || '[your topic]';
  const audience = (b.audience || '').trim() || 'most people';
  const goal = (b.goal || '').trim();
  let kw = niche ? niche.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (kw.length < 2) kw = 'INFO';
  const tp = `<mark>${esc(topic)}</mark>`;
  const mk = (t, body) => `<h4>${esc(t)}</h4>${body}`;
  const pool = [
    ['The real problem', `Most people approach ${tp} the wrong way from day one. They copy what everyone else does and wonder why nothing changes. The fix is simpler than you think.`],
    ['Why it matters', `This is the part almost everyone skips. Get it right and ${tp} finally clicks for ${esc(audience)}.`],
    ['The big mistake', `Mistake number one: trying to do everything at once. It feels productive, but it splits your focus and slows you down. Pick one thing and go all in.`],
    ['Quick win', `Try this today, it takes five minutes. Small actions repeated daily beat big plans you never start.`],
    ['The truth no one says', `Here's what nobody tells you about ${tp}. The people winning aren't more talented, they're just more consistent. That's the whole game.`],
    ['Do this instead', `Stop chasing shortcuts and nail the basics first. Master the fundamentals and ${tp} gets easier every week. Everything else follows from there.`],
    ['Keep it simple', `Break ${goal ? `<mark>${esc(goal)}</mark>` : 'your goal'} into three steps you can repeat. Keep it boring, keep it consistent, and let the results stack up.`],
  ];
  const slides = [mk('Hook', `Stop scrolling if ${tp} actually matters to you. What you're about to read changes how you think about it.`)];
  const mid = Math.max(0, n - (n >= 2 ? 2 : 1));
  for (let i = 0; i < mid; i++) { const [t, bd] = pool[i % pool.length]; slides.push(mk(t, bd)); }
  if (n >= 2) slides.push(mk('Call to action', `Want the full breakdown? Comment <mark>${esc(kw)}</mark> below or send it to me in a DM and I'll get it to you. Save this so you don't lose it.`));
  return slides.slice(0, n);
}
function fillScaffold(det, slidesEl, n) {
  const arr = buildScaffoldSlides(n, BRIEF, CURORDER);
  slidesEl.innerHTML = arr.map(h => `<div class="slide" data-slide><div class="slide__bar"><button type="button" class="slide__drag" data-slide-drag title="Reorder" aria-label="Reorder">⠿</button><span class="slide__n"></span><button type="button" class="slide__del" data-slide-del title="Remove slide">✕</button></div><div class="slide__edit" contenteditable="true" data-slide-body>${sanitizeSlide(h)}</div></div>`).join('');
  renumberSlides(det);
}
// Branding elements have no studio-written script: step 1 is the client's brief
// (read-only here), then the studio designs once it's been submitted.
function brandDetailHTML(d) {
  const owner = ME && ME.is_owner;
  const head = `<div class="detail__head"><input class="detail__titleinput" data-f="title" value="${esc(d.title)}">${owner ? '<button class="b-del b-sm" data-a="delete_deck">Delete</button>' : ''}</div>`;
  const brief = `<div class="bb-wrap"><div class="bb-wrap__h">Client brief</div>${brandBriefView(d)}</div>`;
  let body;
  if (d.status === 'writing') {
    body = brief + `<p class="note-line">⏳ Waiting for the client to send the branding details. You'll be able to design once they're in.</p>`;
  } else {
    const editable = d.status !== 'done';
    const note = (d.status === 'revision' && d.revision_note) ? `<p class="note-line"><b>Client retouch:</b> ${esc(d.revision_note)}</p>` : '';
    const gc = 'gal gal--' + (d.type || 'branding');
    const grid = imagesLoaded(d)
      ? `<div class="${gc}" data-imgs>${imagesOf(d).map(u => tThumb(u, editable)).join('')}${editable ? '<label class="adder">+ Add<br>images<input type="file" accept="image/*" multiple hidden data-file></label>' : ''}</div>`
      : `<div class="${gc}" data-imgs data-loading>${Array.from({ length: Math.min(imgCount(d), 10) }, () => '<figure class="gal__skel"></figure>').join('')}</div>`;
    body = note + grid + brief;
  }
  return head + `<div class="detail__body">${body}</div>`;
}
function detailHTML(d) {
  if ((d.type || '') === 'branding') return brandDetailHTML(d);
  const scriptEdit = d.status === 'writing' || d.status === 'script_review';
  const owner = ME && ME.is_owner;
  const autofill = (owner && scriptEdit) ? `<div class="autofill" data-autofill title="Auto-fill slides from the client brief">
      <span class="autofill__ic">✨</span>
      <button type="button" class="autofill__step" data-af-dec aria-label="Fewer slides">−</button>
      <span class="autofill__n" data-af-n>6</span>
      <button type="button" class="autofill__step" data-af-inc aria-label="More slides">+</button>
      <button type="button" class="autofill__go" data-af-go>Fill</button>
    </div>` : '';
  const counter = !scriptEdit ? `<span class="imgcount"><span data-count>${imgCount(d)}</span>/10</span>` : '';
  const head = `<div class="detail__head"><input class="detail__titleinput" data-f="title" value="${esc(d.title)}">${counter}${autofill}${owner ? '<button class="b-del b-sm" data-a="delete_deck">Delete</button>' : ''}</div>`;
  let body;
  if (scriptEdit) {
    body = slidesEditorHTML(d);
  } else {
    const editable = d.status !== 'done';
    const note = (d.status === 'revision' && d.revision_note) ? `<p class="note-line"><b>Client retouch:</b> ${esc(d.revision_note)}</p>` : '';
    const gc = 'gal gal--' + (d.type || 'carousel');
    const grid = imagesLoaded(d)
      ? `<div class="${gc}" data-imgs>${imagesOf(d).map(u => tThumb(u, editable)).join('')}${editable ? '<label class="adder">+ Add<br>images<input type="file" accept="image/*" multiple hidden data-file></label>' : ''}</div>`
      : `<div class="${gc}" data-imgs data-loading>${Array.from({ length: Math.min(imgCount(d), 10) }, () => '<figure class="gal__skel"></figure>').join('')}</div>`;
    const sc = d.script ? `<div class="tscript"><div class="tscript__h">Approved script</div>${slidesViewHTML(d.script)}</div>` : '';
    body = note + grid + sc;
  }
  return head + `<div class="detail__body">${body}</div>`;
}
function cmdHTML(d) {
  const [pc, pl] = pillFor(d), imgs = { length: imgCount(d) };
  const isBrand = (d.type || '') === 'branding';
  let actions = '';
  if (isBrand) {
    if (d.status === 'designing' || d.status === 'revision') actions = `<button class="b-ghost b-sm" data-a="save_deck">Save draft</button><button class="b-grad b-sm" data-a="send_design">Send design →</button>`;
    else if (d.status === 'design_review') actions = `<button class="b-grad b-sm" data-a="send_design">Update &amp; resend</button>`;
    const meta = `<div class="cmdbar__meta">${imgs.length ? `<span class="foot-count">${imgs.length} image${imgs.length > 1 ? 's' : ''}</span>` : ''}<span class="pill ${pc}">${pl}</span></div>`;
    const right = actions ? `<div class="actions">${actions}</div>` : `<span class="cmdbar__hint">${d.status === 'writing' ? 'Waiting for the client to send their details.' : 'Approved, nothing to do here.'}</span>`;
    return `<div class="cmdbar__row">${meta}${right}</div><div class="cmdprog"><i style="width:${DPCT[d.status] || 10}%"></i></div>`;
  }
  if (d.status === 'writing') actions = `<button class="b-ghost b-sm" data-a="save_deck">Save draft</button><button class="b-grad b-sm" data-a="send_script">Send script →</button>`;
  else if (d.status === 'script_review') actions = `<button class="b-ghost b-sm" data-a="save_deck">Save draft</button><button class="b-grad b-sm" data-a="send_script">Update &amp; resend</button>`;
  else if (d.status === 'designing') actions = `<button class="b-ghost b-sm" data-a="save_deck">Save draft</button><button class="b-grad b-sm" data-a="send_design">Send design →</button>`;
  else if (d.status === 'design_review' || d.status === 'revision') actions = `<button class="b-grad b-sm" data-a="send_design">Update &amp; resend</button>`;
  const meta = `<div class="cmdbar__meta">${imgs.length ? `<span class="foot-count">${imgs.length} image${imgs.length > 1 ? 's' : ''}</span>` : ''}<span class="pill ${pc}">${pl}</span></div>`;
  const right = actions ? `<div class="actions">${actions}</div>` : `<span class="cmdbar__hint">Approved, nothing to do here.</span>`;
  return `<div class="cmdbar__row">${meta}${right}</div><div class="cmdprog"><i style="width:${DPCT[d.status] || 10}%"></i></div>`;
}
function bind(d) {
  const det = $('#deckDetail'), root = R.querySelector('.board__right'); if (!root) return;
  const val = f => { const el = det.querySelector(`[data-f="${f}"]`); return el ? el.value : undefined; };
  const gatherImgs = () => [...det.querySelectorAll('[data-imgs] img')].map(i => i.getAttribute('src'));
  const gatherScript = () => { const b = det.querySelectorAll('[data-slide-body]'); if (!b.length) return undefined; return JSON.stringify([...b].map(x => sanitizeSlide(x.innerHTML))); };
  det.querySelectorAll('[data-rt]').forEach(btn => btn.addEventListener('mousedown', e => { e.preventDefault();
    const cmd = btn.dataset.rt;
    if (cmd === 'bold') { document.execCommand('bold', false, null); }
    else if (cmd === 'title') {
      const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
      document.execCommand('formatBlock', false, cur === 'h4' ? 'div' : 'h4');
    }
    else if (cmd === 'mark') {
      try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
      if (!document.execCommand('hiliteColor', false, '#ffe39a')) document.execCommand('backColor', false, '#ffe39a');
      try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
    }
  }));
  const slidesEl = det.querySelector('.slides[data-f="script"]');
  wireSlideDnD(slidesEl, det);
  if (d.status !== 'done' && imagesLoaded(d)) wireGalleryDnD(det.querySelector('.gal[data-imgs]'));
  const addBtn = det.querySelector('[data-slide-add]');
  if (addBtn && slidesEl) addBtn.onclick = () => { const div = document.createElement('div'); div.className = 'slide'; div.setAttribute('data-slide', '');
    div.innerHTML = '<div class="slide__bar"><button type="button" class="slide__drag" data-slide-drag title="Reorder" aria-label="Reorder">⠿</button><span class="slide__n"></span><button type="button" class="slide__del" data-slide-del title="Remove slide">✕</button></div><div class="slide__edit" contenteditable="true" data-slide-body></div>';
    slidesEl.appendChild(div); renumberSlides(det); div.querySelector('[data-slide-body]').focus(); };
  const afEl = det.querySelector('[data-autofill]');
  if (afEl && slidesEl) {
    const nEl = afEl.querySelector('[data-af-n]');
    const clamp = v => Math.max(1, Math.min(12, v));
    const setN = v => { nEl.textContent = clamp(v); };
    afEl.querySelector('[data-af-dec]').onclick = () => setN(Number(nEl.textContent) - 1);
    afEl.querySelector('[data-af-inc]').onclick = () => setN(Number(nEl.textContent) + 1);
    afEl.querySelector('[data-af-go]').onclick = () => {
      const n = clamp(Number(nEl.textContent) || 6);
      const hasContent = [...slidesEl.querySelectorAll('[data-slide-body]')].some(x => x.textContent.trim());
      if (hasContent && !confirm('Replace the current slides with ' + n + ' auto-filled slides from the brief?')) return;
      fillScaffold(det, slidesEl, n);
    };
  }
  if (slidesEl) slidesEl.addEventListener('click', e => { const del = e.target.closest('[data-slide-del]'); if (!del) return;
    if (slidesEl.querySelectorAll('[data-slide]').length <= 1) { del.closest('.slide').querySelector('[data-slide-body]').innerHTML = ''; return; }
    del.closest('.slide').remove(); renumberSlides(det); });
  const titleEl = det.querySelector('[data-f="title"]');
  if (titleEl) titleEl.addEventListener('blur', async () => {
    const t = titleEl.value.trim();
    if (!t) { titleEl.value = d.title || ''; return; }
    if (t === (d.title || '')) return;
    try { const r = await api('/api/admin', { action: 'save_deck', ref: REF, deckId: d.id, title: t });
      if (r && r.ok) { d.title = t; const dd = DECKS.find(x => x.id === d.id); if (dd) dd.title = t; renderSidebar(); renderTabs(); }
    } catch (e) {}
  });
  const file = det.querySelector('[data-file]');
  if (file) file.onchange = async e => {
    const adder = det.querySelector('.adder'); const slots = 10 - det.querySelectorAll('[data-imgs] img').length;
    const files = [...e.target.files].slice(0, Math.max(0, slots));
    if (e.target.files.length > slots) alert('Max 10 images per element, extra files were skipped.');
    for (const f of files) { const url = await compress(f); adder.insertAdjacentHTML('beforebegin', tThumb(url, true)); }
    const c = det.querySelector('[data-count]'); if (c) c.textContent = det.querySelectorAll('[data-imgs] img').length;
    e.target.value = '';
  };
  root.querySelectorAll('[data-a]').forEach(btn => btn.onclick = async () => {
    const a = btn.dataset.a;
    if (a === 'delete_deck' && !confirm('Delete this element?')) return;
    if (a === 'send_script' && !confirm('Send this script to the client for approval?')) return;
    // Images load lazily; if they aren't in the DOM yet we must NOT send an empty
    // list (save_deck/send_design only touch design_urls when images is an array),
    // otherwise we'd wipe the deck's existing design. Send images only when loaded.
    const loaded = imagesLoaded(d);
    if (a === 'send_design') {
      if (!loaded) { alert('Images are still loading, please wait a moment.'); return; }
      if (!gatherImgs().length) { alert('Add at least one image first.'); return; }
      if (!confirm('Send this design to the client for approval?')) return;
    }
    const body = { action: a, ref: REF, deckId: d.id, title: val('title'), script: gatherScript() };
    if (loaded) body.images = gatherImgs();
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try { const r = await api('/api/admin', body);
      if (r.ok) { if (body.images) IMG_CACHE[d.id] = { images: body.images, loaded: true }; renderBoard(r.decks || []); }
      else { alert('Error: ' + (r.error || '')); btn.disabled = false; btn.innerHTML = old; } }
    catch (e) { btn.disabled = false; btn.innerHTML = old; }
  });
}

/* ---------- team (owner) ---------- */
async function loadTeam() {
  const [t, o] = await Promise.all([api('/api/admin', { action: 'list_talents' }), api('/api/admin', { action: 'list' })]);
  TALENTS = t.talents || []; ORDERS = o.orders || []; ADMIN.talents = TALENTS; ADMIN.orders = ORDERS; renderTeam();
}
// Approx weekly load summed from the availability grid (null = none set).
function weeklyHours(t) {
  const av = (t.availability && typeof t.availability === 'object') ? t.availability : null;
  if (!av) return null;
  let mins = 0;
  PF_DAYS.forEach(([k]) => { const d = av[k]; if (d && d.on && d.start && d.end) { const a = d.start.split(':'), b = d.end.split(':'); const diff = (+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1]); if (diff > 0) mins += diff; } });
  return Math.round(mins / 60);
}
const tzShort = z => (z || '').split('/').pop().replace(/_/g, ' ');
// Compact workload strip: active projects, ~h/week, timezone.
function workStrip(t, c) {
  const active = c.todo + c.progress, wh = weeklyHours(t);
  const cell = (b, l) => `<div class="twork"><b>${b}</b><span>${l}</span></div>`;
  return `<div class="tcard__work">
    ${cell(active, active === 1 ? 'active project' : 'active projects')}
    ${cell(wh == null ? '—' : '~' + wh + 'h', 'per week')}
    ${cell(t.timezone ? esc(tzShort(t.timezone)) : '—', 'timezone')}
  </div>`;
}
// Per-month totals over the last `months` (default 6), for the card sparkline.
function revMonths(orders, months, valfn) {
  months = months || 6; valfn = valfn || (o => o.amount || 0);
  const now = new Date(), out = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: d.getFullYear() + '-' + d.getMonth(), v: 0 }); }
  orders.forEach(o => { if (!o.created_at) return; const d = new Date(o.created_at); const k = d.getFullYear() + '-' + d.getMonth(); const m = out.find(x => x.key === k); if (m) m.v += valfn(o); });
  return out.map(x => x.v);
}
// Two-line sparkline: studio revenue (muted) + this talent's revenue (accent),
// with a smooth curve and the gradient "smoke" under the talent's line.
function miniRevChart(studio, mine) {
  const W = 200, H = 60, p = 4, max = Math.max(1, ...studio, ...mine);
  const n = Math.max(studio.length, mine.length);
  const xs = i => n <= 1 ? W / 2 : p + i * (W - 2 * p) / (n - 1), ys = v => H - p - (max ? v / max : 0) * (H - 2 * p);
  const sp = studio.map((v, i) => [xs(i), ys(v)]), mp = mine.map((v, i) => [xs(i), ys(v)]);
  const last = mp[mp.length - 1] || [W / 2, H - p];
  return `<svg class="mrev" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${smoothArea(mp, H - p)}" fill="url(#sparkArea)"/>
    <path d="${smoothD(sp)}" fill="none" stroke="var(--faint)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".55" vector-effect="non-scaling-stroke"/>
    <path d="${smoothD(mp)}" fill="none" stroke="url(#tgrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4" fill="#fff" stroke="url(#tgrad)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
// This talent's revenue / cost / margin across their assigned orders.
function talentMargin(mine) {
  let rev = 0, pricedRev = 0, cost = 0, priced = 0;
  mine.forEach(o => { rev += (o.amount || 0); const c = orderCost(o); if (c != null) { cost += c; pricedRev += (o.amount || 0); priced++; } });
  const profit = pricedRev - cost, pct = pricedRev ? Math.round(profit / pricedRev * 100) : null;
  return { rev, profit, pct, priced, n: mine.length };
}
// Revenue/margin block folded into the talent card: stats left, sparkline right.
function talentRevBlock(t, mine) {
  const studio = revMonths(ORDERS, 6), his = revMonths(mine, 6), m = talentMargin(mine);
  const unpriced = m.n - m.priced;
  const stat = (l, v, cls) => `<div class="trev__s ${cls || ''}"><span>${l}</span><b>${v}</b></div>`;
  return `<div class="tcard__rev">
    <div class="tcard__rev-stats">
      ${stat('Revenue', fmtMoney(m.rev))}
      ${stat('Profit', m.priced ? fmtMoney(m.profit) : '—')}
      ${stat('Margin', m.pct != null ? m.pct + '%' : '<span class="trev__norate">set rates</span>', m.pct != null && m.pct < 0 ? 'low' : '')}
    </div>
    <div class="tcard__rev-chart">
      <div class="trev__leg"><span class="rleg rleg--his"><i></i>His</span><span class="rleg rleg--studio"><i></i>Studio</span>${unpriced ? `<span class="trev__miss" title="${unpriced} project(s) without an agreed rate">${unpriced} unpriced</span>` : ''}</div>
      ${miniRevChart(studio, his)}
    </div>
  </div>`;
}
const KEBAB_IC = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
const TRASH_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7"/></svg>';
function placeMenu(m, anchor, alignRight) {
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  let left = alignRight ? r.right - w : r.left;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
  let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = r.top - 6 - h;
  m.style.left = Math.max(8, left) + 'px'; m.style.top = Math.max(8, top) + 'px';
}
function closeCardMenu() {
  const m = document.getElementById('cardMenu'); if (m) m.remove();
  document.removeEventListener('click', onCardOutside, true);
  document.removeEventListener('keydown', onCardKey);
}
function onCardOutside(e) { if (!e.target.closest('#cardMenu') && !e.target.closest('[data-cardmenu]')) closeCardMenu(); }
function onCardKey(e) { if (e.key === 'Escape') closeCardMenu(); }
function openCardMenu(email, anchor) {
  const ex = document.getElementById('cardMenu'), same = ex && ex.dataset.email === email;
  closeCardMenu(); if (same) return;
  const m = document.createElement('div');
  m.className = 'amenu'; m.id = 'cardMenu'; m.dataset.email = email;
  m.innerHTML = `<button class="amenu__i" type="button" data-act="edit">${EDIT_IC}<span class="amenu__n">Edit talent</span></button><button class="amenu__i amenu__i--del" type="button" data-act="del">${TRASH_IC}<span class="amenu__n">Delete</span></button>`;
  document.body.appendChild(m);
  placeMenu(m, anchor, true);
  m.querySelector('[data-act="edit"]').onclick = () => { closeCardMenu(); openTalentEditor(email); };
  m.querySelector('[data-act="del"]').onclick = () => { closeCardMenu(); deleteTalent(email); };
  setTimeout(() => { document.addEventListener('click', onCardOutside, true); document.addEventListener('keydown', onCardKey); }, 0);
}
async function deleteTalent(email) {
  if (!confirm('Delete ' + email + '? Their projects will become unassigned.')) return;
  const r = await api('/api/admin', { action: 'delete_talent', email });
  if (!r.ok) { alert(r.error === 'self' ? "You can't delete your own account." : 'Error: ' + (r.error || '')); return; }
  TALENTS = r.talents || TALENTS; ORDERS = r.orders || ORDERS; ADMIN.talents = TALENTS; ADMIN.orders = ORDERS; renderTeam();
}
function renderTeam() {
  closeCardMenu();
  const unassigned = ORDERS.filter(o => !o.talent_email);
  $('#teamGrid').innerHTML = TALENTS.map(t => {
    const mine = ORDERS.filter(o => (o.talent_email || '').toLowerCase() === t.email.toLowerCase());
    const c = { todo: 0, progress: 0, done: 0 }; mine.forEach(o => c[o.state || 'todo']++);
    const chips = t.is_owner ? '<div class="none">Owners see every project.</div>'
      : (mine.length ? `<div class="chips">${mine.map(o => `<span class="chip">#${esc(o.ref)}<button data-unassign="${esc(o.ref)}" title="Remove">✕</button></span>`).join('')}</div>` : '<div class="none">No projects assigned.</div>');
    const assignSel = t.is_owner ? '' : `<select data-assign-for="${esc(t.email)}" style="margin-top:8px"><option value="">+ Assign a project…</option>${unassigned.map(o => `<option value="${esc(o.ref)}">#${esc(o.ref)}, ${esc(o.name || o.email || '')}</option>`).join('')}</select>`;
    return `<div class="tcard" data-talent="${esc(t.email)}">
      <button class="tcard__menu" type="button" data-stop data-cardmenu="${esc(t.email)}" title="Actions">${KEBAB_IC}</button>
      <div class="tcard__head">
        <label class="tcard__av" title="Change photo">${avatarRole(t, 'sm')}<input type="file" accept="image/*" hidden data-photo></label>
        <div class="tcard__idn"><div class="nm">${esc(t.name || 'Unnamed')}</div><div class="em" title="${esc(t.email)}">${esc(t.email)}</div></div>
      </div>
      ${t.is_owner ? '<div class="tcard__owner">Owners see and manage every project.</div>'
        : workStrip(t, c) + talentRevBlock(t, mine) + `<div class="tcard__sec"><div class="sec">Projects</div>${chips}${assignSel}</div>`}
    </div>`;
  }).join('') || '<div class="none">No talents yet.</div>';
  bindTeam();
}
function bindTeam() {
  $$('[data-unassign]').forEach(b => b.onclick = async () => { const r = await api('/api/admin', { action: 'assign_order', ref: b.dataset.unassign, talentEmail: null }); if (r.ok) { ORDERS = r.orders || ORDERS; ADMIN.orders = ORDERS; renderTeam(); } });
  $$('[data-assign-for]').forEach(s => s.onchange = async () => { if (!s.value) return; const r = await api('/api/admin', { action: 'assign_order', ref: s.value, talentEmail: s.dataset.assignFor }); if (r.ok) { ORDERS = r.orders || ORDERS; ADMIN.orders = ORDERS; renderTeam(); } });
  $$('.tcard [data-photo]').forEach(inp => inp.onchange = async e => { const f = e.target.files[0]; if (!f) return; const email = inp.closest('.tcard').dataset.talent; const photo = await compress(f, 512, 0.8); const r = await api('/api/admin', { action: 'update_talent', email, photo }); if (r.ok) { TALENTS = r.talents || TALENTS; renderTeam(); } e.target.value = ''; });
  $$('.tcard [data-cardmenu]').forEach(b => b.onclick = e => { e.stopPropagation(); openCardMenu(b.dataset.cardmenu, b); });
}
async function submitTalent(e) {
  e.preventDefault(); const errEl = $('#tErr'); errEl.style.color = ''; errEl.textContent = '';
  const email = $('#tEmail').value.trim();
  const body = { action: 'create_talent', name: $('#tName').value.trim(), email, is_owner: $('#tOwner').checked };
  const r = await api('/api/admin', body);
  if (!r.ok) { errEl.textContent = r.error === 'exists' ? 'Email already exists.' : 'Error: ' + (r.error || ''); return; }
  TALENTS = r.talents || TALENTS; ADMIN.talents = TALENTS; $('#talentForm').reset();
  const box = $('#tCreated');
  box.innerHTML = `<div class="tcreated__h">✅ Account created</div><p>Share these with <b>${esc(email)}</b>. They'll be asked to change the password on first login.</p>
    <div class="cred"><span>Email</span><code>${esc(email)}</code></div>
    <div class="cred"><span>Temporary password</span><code>${esc(r.password || '')}</code><button type="button" class="b-ghost b-sm" data-copy="${esc(r.password || '')}">Copy</button></div>`;
  box.classList.remove('hide');
  box.querySelector('[data-copy]').onclick = ev => { navigator.clipboard?.writeText(ev.target.dataset.copy); ev.target.textContent = 'Copied'; };
  renderTeam();
}

/* ============================================================================
   WIRING - element-level bindings after the shell is injected (per mount)
   ========================================================================== */
function wireStatic() {
  // admin nav
  $('#adminNav').addEventListener('click', e => { const b = e.target.closest('.navi'); if (b) navTo(b.dataset.sec); });
  $('#newProject').onclick = openNewModal;
  // new-project modal
  $('#npClose').onclick = () => $('#newModal').classList.add('hide');
  $('#npPlans').addEventListener('click', e => { const c = e.target.closest('[data-plan]'); if (!c) return; NP.plan = c.dataset.plan; $('#npDecks').value = NP_PLANS[NP.plan].decks; renderNp(); });
  $('#npBilling').addEventListener('click', e => { const b = e.target.closest('[data-bill]'); if (!b) return; NP.billing = b.dataset.bill; $('#npBilling').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderNp(); });
  $('#npAddons').addEventListener('click', e => {
    const st = e.target.closest('[data-story]'); if (st) { NP.story = NP.story === st.dataset.story ? null : st.dataset.story; if (NP.story) NP.bundle = false; renderNp(); return; }
    const up = e.target.closest('[data-up]'); if (!up) return;
    const k = up.dataset.up;
    if (k === 'bundle') { NP.bundle = !NP.bundle; if (NP.bundle) { NP.branding = false; NP.story = null; } }
    else if (k === 'branding') { NP.branding = !NP.branding; if (NP.branding) NP.bundle = false; }
    renderNp();
  });
  $('#npFill').onclick = npFill;
  $('#npForm').addEventListener('submit', submitNewProject);
  $('#npDelete').onclick = deleteProject;
  // brief + switcher
  $('#briefBtn').onclick = () => openTab({ kind: 'brief' });
  $('#bmClose').onclick = () => $('#briefModal').classList.add('hide');
  $('#switcherBtn').onclick = e => { e.stopPropagation(); renderSwitcher(); $('#switcherMenu').classList.toggle('hide'); };
  $('#toDash').onclick = () => showAdmin('dashboard');
  $('#clientView').onclick = async () => {
    const btn = $('#clientView'), label = btn.querySelector('span'), old = label.textContent;
    try {
      const r = await api('/api/admin', { action: 'client_link', ref: REF });
      if (!r || !r.ok || !r.url) { alert(r && r.error === 'no_email' ? 'This project has no client email yet.' : 'Could not generate the client link.'); return; }
      try { await navigator.clipboard.writeText(r.url); label.textContent = 'Copied ✓'; setTimeout(() => { label.textContent = old; }, 1800); }
      catch (_) { prompt('Open this link in a private window to test the client view:', r.url); }
    } catch (e) { alert('Network error.'); }
  };
  $('#switcherMenu').addEventListener('click', e => {
    const it = e.target.closest('[data-ref]');
    if (it) { $('#switcherMenu').classList.add('hide'); if (it.dataset.ref !== REF) openOrder(it.dataset.ref); return; }
    const act = e.target.closest('[data-act]');
    if (act) { $('#switcherMenu').classList.add('hide'); if (act.dataset.act === 'new') openNewModal(); else if (act.dataset.act === 'overview') backToOverview(); }
  });
  // sidebar nav
  $('#deckList').addEventListener('click', e => {
    const add = e.target.closest('[data-addcat]'); if (add) { e.stopPropagation(); openAddElems({ carousel: 'decks', story: 'stories', branding: 'branding' }[add.dataset.addcat]); return; }
    const back = e.target.closest('[data-catback]'); if (back) { CAT = null; renderSidebar(); return; }
    const cat = e.target.closest('[data-cat]'); if (cat) { CAT = cat.dataset.cat; renderSidebar(); return; }
    const it = e.target.closest('[data-pick]'); if (it) { openTab({ kind: 'deck', id: it.dataset.pick }); }
  });
  $('#deckDetail').addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (!x) return; x.closest('figure')?.remove(); const det = $('#deckDetail'), c = det.querySelector('[data-count]'); if (c) c.textContent = det.querySelectorAll('[data-imgs] img').length; });
  $('#boardTabs').addEventListener('click', e => { const x = e.target.closest('[data-tabx]'); if (x) { e.stopPropagation(); closeTab(x.dataset.tabx); return; } const t = e.target.closest('[data-tab]'); if (t) activateTab(t.dataset.tab); });
  $('#addDeck').onclick = () => openAddElems(CAT ? ({ carousel: 'decks', story: 'stories', branding: 'branding' }[CAT]) : null);
  // add-elements modal
  $('#aeClose').onclick = () => $('#addElemModal').classList.add('hide');
  $('#aeBody').addEventListener('input', e => { if (e.target.id === 'aeCount') aeSyncN(); });
  $('#aeBody').addEventListener('click', async e => {
    const back = e.target.closest('[data-aeback]'); if (back) { aeCat = null; renderAE(); return; }
    const cat = e.target.closest('[data-aecat]'); if (cat) { aeCat = cat.dataset.aecat; renderAE(); return; }
    const step = e.target.closest('[data-step]'); if (step) { const c = $('#aeCount'); c.value = Math.max(1, Math.min(50, (Number(c.value) || 1) + Number(step.dataset.step))); aeSyncN(); return; }
    const set = e.target.closest('[data-set]'); if (set) { $('#aeCount').value = set.dataset.set; aeSyncN(); return; }
    const addq = e.target.closest('#aeAdd'); if (addq) {
      const g = AE_GROUPS.find(x => x.key === aeCat), n = aeSyncN(); addq.disabled = true; addq.textContent = 'Adding…';
      const r = await api('/api/admin', { action: 'add_elements', ref: REF, type: g.type, count: n });
      if (!r.ok) { alert('Error: ' + (r.error || '')); addq.disabled = false; renderAE(); return; }
      $('#addElemModal').classList.add('hide'); CAT = g.type; SELDECK = null; renderBoard(r.decks || []); return;
    }
    const it = e.target.closest('[data-aeitem]'); if (it) {
      const key = it.dataset.aeitem; it.classList.add('on'); it.querySelector('.aeitem__add').textContent = 'Adding…';
      const r = await api('/api/admin', { action: 'add_item', ref: REF, key });
      if (!r.ok) { alert('Error: ' + (r.error || '')); it.classList.remove('on'); it.querySelector('.aeitem__add').textContent = '+ Add'; return; }
      $('#addElemModal').classList.add('hide'); CAT = 'branding'; SELDECK = null; renderBoard(r.decks || []);
    }
  });
  // talents modal
  $('#openTalentModal').onclick = () => { $('#talentForm').reset(); $('#tErr').textContent = ''; $('#tCreated').classList.add('hide'); $('#talentModal').classList.remove('hide'); setTimeout(() => $('#tEmail').focus(), 30); };
  $('#tmClose').onclick = () => $('#talentModal').classList.add('hide');
  $('#pfClose').onclick = () => $('#profileModal').classList.add('hide');
  $('#talentForm').addEventListener('submit', submitTalent);
  // chat composer
  $('#assetBtn').addEventListener('click', e => { e.stopPropagation(); renderAssetMenu(); $('#assetMenu').classList.toggle('hide'); });
  $('#assetMenu').addEventListener('click', e => { const o = e.target.closest('[data-asset]'); if (!o) return; chatAsset = o.dataset.asset; renderAssetCur(); $('#assetMenu').classList.add('hide'); });
  $('#chatFiles').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) { if (chatImgs.length >= 8) { alert('Up to 8 images per message.'); break; } if (!/^image\//.test(f.type)) continue; const u = await compress(f); if (u) chatImgs.push(u); }
    renderAtts();
  });
  $('#chatAtts').addEventListener('click', e => { const b = e.target.closest('[data-att]'); if (!b) return; chatImgs.splice(Number(b.dataset.att), 1); renderAtts(); });
  $('#chatForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#chatInput'), body = input.value.trim(); if ((!body && !chatImgs.length) || !REF) return;
    const deckId = chatAsset || '', images = chatImgs.slice();
    const btn = $('#chatSend'); btn.disabled = true;
    try {
      const r = await api('/api/admin', { action: 'send_message', ref: REF, body, deckId, images });
      if (r.ok) { MESSAGES = r.messages || MESSAGES; input.value = ''; chatAsset = ''; chatImgs = []; renderAtts(); renderAssetCur(); renderMessages(); }
    } catch (err) {} finally { btn.disabled = false; }
  });
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
  $('#chatToggle').addEventListener('click', () => setChatOpen(false));
  $('#msgFab').addEventListener('click', () => setChatOpen(true));
  $('#chatScrim').addEventListener('click', () => setChatOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#board')?.classList.contains('chat-open')) setChatOpen(false); });
  // lightbox
  $('#lb').addEventListener('click', () => $('#lb').classList.remove('open'));
  $('#lbDl').addEventListener('click', e => { e.stopPropagation(); if (!lbUrl) return; const a = document.createElement('a'); a.href = lbUrl; a.download = 'chat-image.jpg'; document.body.appendChild(a); a.click(); a.remove(); });
  // floating guide
  $('#helpFab').addEventListener('click', () => { const card = $('#helpCard'); if (card.classList.contains('hide')) { TUTI = 0; renderTut(); card.classList.remove('hide'); } else card.classList.add('hide'); });
  $('#helpClose').onclick = () => $('#helpCard').classList.add('hide');
  $('#tutBack').onclick = () => { if (TUTI > 0) { TUTI--; renderTut(); } };
  $('#tutNext').onclick = () => { if (TUTI < TUT.length - 1) { TUTI++; renderTut(); } else $('#helpCard').classList.add('hide'); };
}

/* document-level listeners - attached once, survive re-mounts */
function wireDocOnce() {
  if (docWired) return;
  docWired = true;
  document.addEventListener('click', e => { if (!e.target.closest('.acctsw') && R) R.querySelectorAll('[data-acct-list]').forEach(m => m.classList.add('hide')); });
  document.addEventListener('click', e => { if (R && !e.target.closest('#sideTop')) R.querySelector('#switcherMenu')?.classList.add('hide'); });
  document.addEventListener('click', e => { if (R && !e.target.closest('#assetPick')) R.querySelector('#assetMenu')?.classList.add('hide'); });
  // chat image lightbox
  document.addEventListener('click', e => { const ci = e.target.closest && e.target.closest('.msg__img'); if (ci && ci.dataset.full && R) { lbUrl = ci.dataset.full; R.querySelector('#lbImg').src = lbUrl; R.querySelector('#lb').classList.add('open'); } });
  // owner-only: delete any message
  document.addEventListener('click', async e => {
    const db = e.target.closest && e.target.closest('[data-del-msg]'); if (!db) return;
    if (!REF || !(ME && ME.is_owner)) return;
    if (!confirm('Delete this message for everyone? This can’t be undone.')) return;
    db.disabled = true;
    try {
      const r = await api('/api/admin', { action: 'delete_message', ref: REF, messageId: db.dataset.delMsg });
      if (r && r.ok && Array.isArray(r.messages)) { MESSAGES = r.messages; renderMessages(); }
      else { db.disabled = false; alert('Could not delete this message.'); }
    } catch (err) { db.disabled = false; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && R) R.querySelector('#lb')?.classList.remove('open'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollMessages(); });
}
