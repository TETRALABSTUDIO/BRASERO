#!/usr/bin/env node
/* Carousel generator — Phase 0 CLI prototype.
   Reads a JSON spec of slides, calls the SHARED pipeline in api/_carousel.js
   (OpenAI background + branded text overlay), writes PNGs to an output folder.

   Setup:  copy .env.example to .env and put your OPENAI_API_KEY in it.
   Usage:  node tools/carousel.js [spec.json] [--format square|story|wide] [--out dir]
   Default spec: tools/carousel.sample.json   Default out: tools/out/carousel/

   The pipeline lives in api/_carousel.js so the future serverless endpoint
   (Phase 1) reuses the exact same code — no copy, no divergence. */

import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { fileURLToPath } from 'url';
import { generateCarousel, FORMATS } from '../api/_carousel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Load .env (Node 22 native; ignore if absent so env-vars-only also works).
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* no .env, rely on shell env */ }

/* ---- tiny arg parser ---- */
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

const specPath = path.resolve(root, positional[0] || 'tools/carousel.sample.json');
const format = flag('format', 'square');
const outDir = path.resolve(root, flag('out', 'tools/out/carousel'));

if (!FORMATS[format]) {
  console.error(`Unknown --format "${format}". Use: ${Object.keys(FORMATS).join(', ')}`);
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Copy .env.example to .env and paste your key.');
  process.exit(1);
}
if (!fs.existsSync(specPath)) {
  console.error(`Spec not found: ${specPath}`);
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const slides = Array.isArray(spec) ? spec : spec.slides;
if (!Array.isArray(slides) || !slides.length) {
  console.error('Spec must be an array of slides, or { "slides": [...] }.');
  process.exit(1);
}

console.log(`\n🎠 Carousel — ${slides.length} slides, format "${format}" (${FORMATS[format].size})`);
console.log(`   spec: ${path.relative(root, specPath)}`);
console.log(`   out:  ${path.relative(root, outDir)}/\n`);

fs.mkdirSync(outDir, { recursive: true });

try {
  const results = await generateCarousel(slides, {
    format,
    quality: 'high',
    onProgress: msg => console.log(`   · ${msg}`),
  });
  for (const r of results) {
    const file = path.join(outDir, `slide-${String(r.index).padStart(2, '0')}.png`);
    fs.writeFileSync(file, r.buffer);
    console.log(`   ✓ ${path.relative(root, file)}  (${(r.buffer.length / 1024).toFixed(0)} KB)`);
  }
  console.log(`\n✅ Done — ${results.length} slides in ${path.relative(root, outDir)}/\n`);
} catch (e) {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
}
