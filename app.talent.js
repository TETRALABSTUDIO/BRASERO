/* ============================================================================
   app.talent.js — talent workspace, lazy-loaded for role 'talent'.
   Phase 4: talents share the project board with owners (shared team module),
   minus the admin shell and owner-only controls (gated on ME.is_owner inside
   the module). A talent boots straight into their assigned project (or an empty
   state when nothing is assigned yet). Client sessions never load this chunk.
   ========================================================================== */
export { mount } from './app.team.js';
