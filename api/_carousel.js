// Carousel generation pipeline — SHARED logic (Phase 0 prototype).
//
// Two-step pipeline, on purpose:
//   1. OpenAI Images (gpt-image-1) generates the VISUAL BACKGROUND only.
//      Image models render text poorly, so we never ask them for copy.
//   2. We composite the slide TEXT on top ourselves with sharp + SVG, using
//      Brasero's own type/colours. Pixel-controlled, on-brand, cheap.
//
// This module is import-only (no env read, no side effects at load) so the
// future serverless endpoint (api/carousel.js, Phase 1) and the CLI tool
// (tools/carousel.js, Phase 0) can both reuse the exact same functions —
// same pattern as emailGallerySamples() shared by the panel + email tooling.

import sharp from 'sharp';

/* ---- Brand tokens (mirror brasero.css) ---- */
export const BRAND = {
  ink: '#111111',
  white: '#ffffff',
  orange: '#f87000',
  gradFrom: '#ff1a00',
  gradTo: '#f87000',
  font: 'Satoshi, system-ui, -apple-system, Segoe UI, sans-serif',
};

/* OpenAI gpt-image-1 only accepts these native sizes. We map friendly names. */
export const FORMATS = {
  square: { size: '1024x1024', w: 1024, h: 1024 }, // Instagram / LinkedIn carousel
  story:  { size: '1024x1536', w: 1024, h: 1536 }, // 9:16 stories / reels
  wide:   { size: '1536x1024', w: 1536, h: 1024 }, // 16:9-ish deck slide
};

/* ---------- Step 1: background visual via OpenAI Images ---------- */
// Returns a PNG Buffer. Throws a clear error on missing key / API failure.
export async function generateBackground(visualPrompt, { format = 'square', apiKey, quality = 'high' } = {}) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set (put it in .env, never in code).');
  const fmt = FORMATS[format] || FORMATS.square;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1',
      // Steer away from any baked-in text; we add copy ourselves in step 2.
      prompt: `${visualPrompt}\n\nClean editorial background image, no text, no words, no letters, no captions, leave calm negative space for an overlay.`,
      size: fmt.size,
      n: 1,
      quality,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI Images API ${res.status}: ${detail.slice(0, 400)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image data.');
  return Buffer.from(b64, 'base64');
}

/* ---------- Step 2: composite branded text over the background ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Rough word-wrap by character budget (prototype-grade; good enough for layout).
function wrap(text, maxChars) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

// Build the SVG overlay: bottom scrim for legibility + headline + optional kicker/index.
function overlaySvg({ w, h, title = '', kicker = '', index, total }) {
  const pad = Math.round(w * 0.075);
  const titleSize = Math.round(w * 0.072);
  const lineH = Math.round(titleSize * 1.18);
  const maxChars = Math.floor((w - pad * 2) / (titleSize * 0.52));
  const lines = wrap(title, maxChars).slice(0, 4);
  const blockH = lines.length * lineH;
  const baseY = h - pad - 6;
  const startY = baseY - blockH + lineH * 0.8;

  const tspans = lines.map((ln, i) =>
    `<text x="${pad}" y="${startY + i * lineH}" font-family="${BRAND.font}" font-size="${titleSize}" font-weight="800" letter-spacing="-0.02em" fill="${BRAND.white}">${esc(ln)}</text>`
  ).join('');

  const kickerSvg = kicker
    ? `<rect x="${pad}" y="${startY - titleSize - Math.round(w * 0.055)}" rx="${Math.round(w * 0.018)}" width="${Math.round(esc(kicker).length * titleSize * 0.34) + pad}" height="${Math.round(w * 0.05)}" fill="${BRAND.orange}"/>
       <text x="${pad + Math.round(w * 0.018)}" y="${startY - titleSize - Math.round(w * 0.02)}" font-family="${BRAND.font}" font-size="${Math.round(w * 0.026)}" font-weight="800" letter-spacing="0.02em" fill="${BRAND.white}">${esc(kicker.toUpperCase())}</text>`
    : '';

  const counter = (index && total)
    ? `<text x="${w - pad}" y="${pad + Math.round(w * 0.03)}" text-anchor="end" font-family="${BRAND.font}" font-size="${Math.round(w * 0.026)}" font-weight="700" fill="${BRAND.white}" opacity="0.85">${index} / ${total}</text>`
    : '';

  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="55%" stop-color="#000" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.78"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#scrim)"/>
    ${counter}${kickerSvg}${tspans}
  </svg>`);
}

// Compose one finished slide PNG (Buffer) from a background + text fields.
export async function composeSlide(bgBuffer, { title, kicker, index, total, format = 'square' } = {}) {
  const fmt = FORMATS[format] || FORMATS.square;
  const bg = await sharp(bgBuffer).resize(fmt.w, fmt.h, { fit: 'cover' }).png();
  const svg = overlaySvg({ w: fmt.w, h: fmt.h, title, kicker, index, total });
  return bg.composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

/* ---------- Orchestrator: full carousel ---------- */
// slides: [{ text, visual, kicker? }]  ->  [{ index, buffer }]
// onProgress(msg) optional, for CLI logging.
export async function generateCarousel(slides, { format = 'square', apiKey, quality = 'high', onProgress } = {}) {
  const total = slides.length;
  const out = [];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    onProgress?.(`slide ${i + 1}/${total} — generating background…`);
    const bg = await generateBackground(s.visual || s.text, { format, apiKey, quality });
    onProgress?.(`slide ${i + 1}/${total} — compositing text…`);
    const buffer = await composeSlide(bg, {
      title: s.text, kicker: s.kicker, index: i + 1, total, format,
    });
    out.push({ index: i + 1, buffer });
  }
  return out;
}
