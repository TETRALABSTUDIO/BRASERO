/* ============================================================================
   app.talent.js — talent space, lazy-loaded for role 'talent'.
   Phase 2: skeleton only. Phase 4 migrates the talent view from panel.html:
   assigned-projects board (brief + deliverables + chat), no client PII.
   ========================================================================== */
import { clearToken, esc, $ } from './app.core.js';

export async function mount(root, ctx) {
  document.body.classList.remove('appmode');
  const me = ctx.session || {};
  root.innerHTML = `
    <div class="home">
      <div class="home__head">
        <div>
          <div class="home__hi">Talent workspace</div>
          <div class="home__sub">${esc(me.email || '')} · your assigned projects land here in Phase 4.</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="signOut">Sign out</button>
      </div>
      <div class="empty">Talent board migrates from panel.html in Phase 4.</div>
    </div>`;
  $('#signOut', root).addEventListener('click', () => { clearToken(); location.href = 'app.html'; });
}
