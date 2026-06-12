/* ============================================================================
   app.owner.js — owner admin (heavy bundle), lazy-loaded for role 'owner'.
   Phase 2: skeleton only. Phase 4 migrates the panel.html owner shell here:
   dashboard / CRM / talents / kanban + impersonation. Owner-only code never
   ships to client sessions (loaded via dynamic import from app.html).
   ========================================================================== */
import { clearToken, esc, $ } from './app.core.js';

export async function mount(root, ctx) {
  document.body.classList.remove('appmode');
  const me = ctx.session || {};
  root.innerHTML = `
    <div class="home">
      <div class="home__head">
        <div>
          <div class="home__hi">Owner workspace</div>
          <div class="home__sub">${esc(me.email || '')} · dashboard, CRM, talents and projects land here in Phase 4.</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="signOut">Sign out</button>
      </div>
      <div class="empty">Owner admin migrates from panel.html in Phase 4.</div>
    </div>`;
  $('#signOut', root).addEventListener('click', () => { clearToken(); location.href = 'app.html'; });
}
