/* ============================================================================
   app.owner.js — owner workspace, lazy-loaded for role 'owner'.
   Phase 4: the full owner admin (dashboard / projects / talents / CRM +
   impersonation) and project board live in the shared team module, which gates
   owner-only controls on ME.is_owner. This file is the role entry point the
   router (app.html) imports; it boots straight into the admin shell. Client
   sessions never load this chunk.
   ========================================================================== */
export { mount } from './app.team.js';
