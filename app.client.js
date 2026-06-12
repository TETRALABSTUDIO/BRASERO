/* ============================================================================
   app.client.js — client space (light bundle), lazy-loaded for role 'client'.
   Phase 2: skeleton + identity + sign-out. Phase 3 fills "my orders" (aggregate
   by client_id) and the per-order board (read + chat + add-to-order).
   ========================================================================== */
import { api, clearToken, esc, $ } from './app.core.js';

export async function mount(root, ctx) {
  document.body.classList.remove('appmode');
  const me = ctx.session || {};
  root.innerHTML = `
    <div class="home">
      <div class="home__head">
        <div>
          <div class="home__hi">Welcome back${me.email ? ', ' + esc(me.email.split('@')[0]) : ''}</div>
          <div class="home__sub">Your projects, all in one place.</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="signOut">Sign out</button>
      </div>
      <div class="empty" id="ordersHost">Loading your projects…</div>
    </div>`;

  $('#signOut', root).addEventListener('click', () => { clearToken(); location.href = 'app.html'; });

  // Phase 3 will replace this with the aggregated "my orders" list + boards.
  try {
    const d = await api('/api/order', { action: 'my_orders' });
    const host = $('#ordersHost', root);
    if (d && d.ok && Array.isArray(d.orders) && d.orders.length) {
      host.classList.remove('empty');
      host.className = 'orders';
      host.innerHTML = d.orders.map((o) => `
        <button class="ocard">
          <div class="ocard__top"><span class="ocard__ref">${esc(o.ref || '')}</span></div>
          <div class="ocard__title">${esc(o.title || o.plan || 'Project')}</div>
        </button>`).join('');
    } else {
      host.textContent = 'No projects yet. Once you order, they appear here.';
    }
  } catch {
    // my_orders endpoint lands in Phase 3; keep the skeleton graceful until then.
    $('#ordersHost', root).textContent = 'Your projects will appear here.';
  }
}
