// Create (or update) a real OWNER account in the Supabase DB.
//
// Prereqs:
//   1. Run supabase_setup.sql once in Supabase → SQL Editor.
//   2. server/.env must have SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY filled in.
//
// Usage (from the project root):
//   node --env-file=server/.env scripts/make-owner.mjs "you@braserodecks.com" "YourPassword" "Your Name"
//
// Re-running updates the password/name and keeps the account as owner.

import { getTalentByEmail, createTalent, updateTalent, db } from '../api/_lib.js';

const [, , email, password, name] = process.argv;

if (!db) {
  console.error('✗ Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing). Run with --env-file=server/.env');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: node --env-file=server/.env scripts/make-owner.mjs "email" "password" "Name"');
  process.exit(1);
}

const existing = await getTalentByEmail(email);
let r;
if (existing) {
  r = await updateTalent({ email, password, name, is_owner: true });
  console.log(r.error ? `✗ update failed: ${r.error}` : `✓ Updated existing account → OWNER: ${email}`);
} else {
  r = await createTalent({ email, password, name, is_owner: true });
  console.log(r.error ? `✗ create failed: ${r.error}` : `✓ Created OWNER account: ${email}`);
}
process.exit(r.error ? 1 : 0);
