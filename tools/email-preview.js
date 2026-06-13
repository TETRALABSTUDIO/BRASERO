#!/usr/bin/env node
/* Email gallery generator.
   Imports the REAL email templates from api/_lib.js (no copy, no divergence) and
   renders every email with sample data into a single grid page:
   tools/email-preview.html. Open that file in a browser to review all designs at
   once. Re-run `node tools/email-preview.js` after editing the templates. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  clientOrderEmail, addonClientEmail, reviewEmail, magicLinkEmail, loginCodeEmail,
  talentInviteEmail, talentAssignedEmail, talentClientActionEmail, talentProjectDoneEmail,
  messageNotifyEmail, campaignEmail, CAMPAIGN_STEPS,
} from '../api/_lib.js';

const BASE = 'https://www.braserodecks.com';
const NAME = 'Jordan Lee';
const REF = 'A1B2C3';

// Each entry: { group, name, subject, html, file }
const emails = [
  // ---- Client-facing ----
  { group: 'Client', name: 'Order confirmed', subject: 'Your Brasero order is confirmed 🎉',
    file: 'api/_lib.js · clientOrderEmail',
    html: clientOrderEmail({ name: NAME, planName: 'Growth', billing: 'sub', amountCents: 29900, handle: '@jordanlee', ref: REF, trackUrl: BASE }) },
  { group: 'Client', name: 'Add-on confirmed', subject: 'Your new Brasero items are on the way 🔥',
    file: 'api/_lib.js · addonClientEmail',
    html: addonClientEmail({ name: NAME, planName: 'Carousel', count: 3, ref: REF, trackUrl: BASE }) },
  { group: 'Client', name: 'Script ready to review', subject: 'Your Brasero script is ready to review 👀',
    file: 'api/_lib.js · reviewEmail (kind=script)',
    html: reviewEmail({ name: NAME, kind: 'script', deckTitle: '5 myths about cold email', ref: REF, url: BASE }) },
  { group: 'Client', name: 'Design ready to review', subject: 'Your Brasero design is ready to review 👀',
    file: 'api/_lib.js · reviewEmail (kind=design)',
    html: reviewEmail({ name: NAME, kind: 'design', deckTitle: '5 myths about cold email', ref: REF, url: BASE }) },
  { group: 'Client', name: 'Magic sign-in link', subject: 'Your Brasero sign-in link 🔥',
    file: 'api/_lib.js · magicLinkEmail',
    html: magicLinkEmail({ name: NAME, url: BASE }) },
  { group: 'Client', name: 'Message notification (to client)', subject: '💬 A message about your Brasero order #' + REF,
    file: 'api/_lib.js · messageNotifyEmail',
    html: messageNotifyEmail({ name: NAME, ref: REF, fromName: 'Brasero Studio', body: 'Hey! We just pushed an update to your first carousel, take a look when you get a sec.', about: '5 myths about cold email', ctaUrl: BASE, ctaLabel: 'Open the conversation' }) },

  // ---- Team / Talent-facing ----
  { group: 'Team', name: '2FA verification code', subject: 'Your Brasero verification code 🔒',
    file: 'api/_lib.js · loginCodeEmail',
    html: loginCodeEmail({ name: NAME, code: '481920' }) },
  { group: 'Team', name: 'Talent invite', subject: 'Join your Brasero studio space 🎨',
    file: 'api/_lib.js · talentInviteEmail',
    html: talentInviteEmail({ name: NAME, setupUrl: BASE }) },
  { group: 'Team', name: 'Project assigned', subject: '🚀 New project assigned to you',
    file: 'api/_lib.js · talentAssignedEmail',
    html: talentAssignedEmail({ name: NAME, ref: REF, clientName: 'Acme Co', planName: 'Growth', panelUrl: BASE }) },
  { group: 'Team', name: 'Client approved a script', subject: '✅ Your client approved a script',
    file: 'api/_lib.js · talentClientActionEmail (approved_script)',
    html: talentClientActionEmail({ name: NAME, ref: REF, deckTitle: '5 myths about cold email', kind: 'approved_script', panelUrl: BASE }) },
  { group: 'Team', name: 'Client approved a design', subject: '🎉 Your client approved a design',
    file: 'api/_lib.js · talentClientActionEmail (approved_design)',
    html: talentClientActionEmail({ name: NAME, ref: REF, deckTitle: '5 myths about cold email', kind: 'approved_design', panelUrl: BASE }) },
  { group: 'Team', name: 'Client requested a retouch', subject: '✏️ Your client requested a retouch',
    file: 'api/_lib.js · talentClientActionEmail (revision)',
    html: talentClientActionEmail({ name: NAME, ref: REF, deckTitle: '5 myths about cold email', kind: 'revision', note: 'Can we make the headline punchier and swap the blue accent for our brand orange?', panelUrl: BASE }) },
  { group: 'Team', name: 'Project completed', subject: '🎉 Project completed',
    file: 'api/_lib.js · talentProjectDoneEmail',
    html: talentProjectDoneEmail({ name: NAME, ref: REF, clientName: 'Acme Co', panelUrl: BASE }) },

  // ---- Lead recovery campaign ----
  { group: 'Lead recovery', name: 'Step 1 · Reminder (day 1)', subject: CAMPAIGN_STEPS[0].title,
    file: 'api/_lib.js · campaignEmail[0]',
    html: campaignEmail({ name: NAME }, 0, BASE).html },
  { group: 'Lead recovery', name: 'Step 2 · Follow-up (day 3)', subject: CAMPAIGN_STEPS[1].title,
    file: 'api/_lib.js · campaignEmail[1]',
    html: campaignEmail({ name: NAME }, 1, BASE).html },
  { group: 'Lead recovery', name: 'Step 3 · Last chance (day 5)', subject: CAMPAIGN_STEPS[2].title,
    file: 'api/_lib.js · campaignEmail[2]',
    html: campaignEmail({ name: NAME }, 2, BASE).html },
];

const groups = [...new Set(emails.map(e => e.group))];

const card = (e, i) => `
  <figure class="card" data-group="${e.group}">
    <figcaption>
      <div class="cap-top">
        <span class="badge badge-${e.group.replace(/\s+/g, '-').toLowerCase()}">${e.group}</span>
        <span class="num">#${i + 1}</span>
      </div>
      <h3>${e.name}</h3>
      <p class="subj"><span>Subject</span> ${e.subject}</p>
      <p class="src">${e.file}</p>
    </figcaption>
    <div class="frame-wrap">
      <iframe loading="lazy" srcdoc="${e.html.replace(/"/g, '&quot;')}"></iframe>
    </div>
  </figure>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brasero · Email gallery</title>
<style>
  :root{ --bg:#0e0d0c; --panel:#1a1817; --line:#2a2725; --ink:#f4f1ec; --muted:#9a938b; --orange:#f87000; --red:#ff1a00; }
  *{ box-sizing:border-box }
  body{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif }
  header{ position:sticky; top:0; z-index:5; background:rgba(14,13,12,.85); backdrop-filter:blur(12px); border-bottom:1px solid var(--line); padding:18px 26px }
  .htop{ display:flex; align-items:center; gap:14px; flex-wrap:wrap }
  h1{ margin:0; font-size:20px; letter-spacing:-.5px }
  h1 b{ background:linear-gradient(100deg,var(--red),var(--orange)); -webkit-background-clip:text; background-clip:text; color:transparent }
  .count{ color:var(--muted); font-size:13px }
  .filters{ margin-left:auto; display:flex; gap:8px; flex-wrap:wrap }
  .filters button{ background:var(--panel); color:var(--ink); border:1px solid var(--line); padding:7px 14px; border-radius:100px; font-size:13px; cursor:pointer; transition:.15s }
  .filters button:hover{ border-color:var(--orange) }
  .filters button.on{ background:linear-gradient(100deg,var(--red),var(--orange)); border-color:transparent; font-weight:700 }
  .wrap{ padding:26px; max-width:1700px; margin:0 auto }
  .grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(380px,1fr)); gap:22px }
  .card{ margin:0; background:var(--panel); border:1px solid var(--line); border-radius:16px; overflow:hidden; display:flex; flex-direction:column }
  figcaption{ padding:16px 18px 14px; border-bottom:1px solid var(--line) }
  .cap-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px }
  .num{ color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums }
  .badge{ font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; padding:4px 10px; border-radius:100px }
  .badge-client{ background:rgba(248,112,0,.16); color:#ffb066 }
  .badge-team{ background:rgba(90,140,255,.16); color:#9fc0ff }
  .badge-lead-recovery{ background:rgba(120,210,120,.16); color:#9be79b }
  figcaption h3{ margin:0 0 8px; font-size:16px; letter-spacing:-.3px }
  .subj{ margin:0 0 6px; font-size:13px; color:var(--ink) }
  .subj span{ display:inline-block; font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); margin-right:6px }
  .src{ margin:0; font-size:11px; color:var(--muted); font-family:ui-monospace,SFMono-Regular,Menlo,monospace }
  .frame-wrap{ background:#ffffff; height:620px; overflow:hidden; position:relative }
  iframe{ width:125%; height:125%; border:0; transform:scale(.8); transform-origin:top left; background:#ffffff }
  footer{ padding:30px 26px 50px; color:var(--muted); font-size:12px; text-align:center }
  code{ background:var(--panel); border:1px solid var(--line); padding:2px 6px; border-radius:6px }
</style>
</head>
<body>
<header>
  <div class="htop">
    <h1><b>brasero.</b> email gallery</h1>
    <span class="count">${emails.length} templates</span>
    <div class="filters">
      <button class="on" data-f="all">All</button>
      ${groups.map(g => `<button data-f="${g}">${g}</button>`).join('')}
    </div>
  </div>
</header>
<div class="wrap">
  <div class="grid">
    ${emails.map(card).join('')}
  </div>
</div>
<footer>
  Generated by <code>tools/email-preview.js</code> · templates live in <code>api/_lib.js</code> · re-run <code>node tools/email-preview.js</code> after edits.
</footer>
<script>
  const btns = document.querySelectorAll('.filters button');
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.remove('on')); b.classList.add('on');
    const f = b.dataset.f;
    document.querySelectorAll('.card').forEach(c => {
      c.style.display = (f === 'all' || c.dataset.group === f) ? '' : 'none';
    });
  }));
</script>
</body>
</html>`;

const out = path.join(__dirname, 'email-preview.html');
fs.writeFileSync(out, page);
console.log('Wrote ' + out + ' (' + emails.length + ' emails)');
