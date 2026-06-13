// Carousel generation pipeline — SHARED logic (Phase 0 prototype, v2).
//
// Two-step pipeline, on purpose:
//   1. OpenAI Images (gpt-image-1) generates the VISUAL BACKGROUND only.
//      Image models render text poorly, so we never ask them for copy.
//   2. We composite the slide TEXT on top ourselves with sharp, drawing real
//      Satoshi glyphs as vector paths via opentype.js — so the render is
//      pixel-identical locally AND on Vercel later, with NO system-font
//      dependency. Brand = "Ember Minimal" (see brandsheet.html): Satoshi only,
//      ink/white text, a single rare ember accent per slide.
//
// Import-only (no env read, no side effects at load) so the future serverless
// endpoint (api/carousel.js, Phase 1) and the CLI (tools/carousel.js) reuse the
// exact same code — same pattern as emailGallerySamples().

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import opentype from 'opentype.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(__dirname, '../assets/fonts');

/* ---- Brand tokens (mirror brandsheet.html / brasero.css) ---- */
export const BRAND = {
  ink: '#111111',
  white: '#ffffff',
  orange: '#f87000',
  gradFrom: '#ff1a00',
  gradTo: '#f87000',
};

/* OpenAI gpt-image-1 only accepts these native sizes. We map friendly names. */
export const FORMATS = {
  square: { size: '1024x1024', w: 1024, h: 1024 }, // Instagram / LinkedIn carousel
  story:  { size: '1024x1536', w: 1024, h: 1536 }, // 9:16 stories / reels
  wide:   { size: '1536x1024', w: 1536, h: 1024 }, // 16:9-ish deck slide
};

/* ---- Brasero flame mark (source: brandsheet.html #brasero-mark, symbol box 14 3 147 183) ---- */
const LOGO_PATH = 'M89.6395 47.9895C94.3875 45.2482 94.3875 38.3952 89.6395 35.6539L81.4719 30.9384C79.2684 29.6662 76.5535 29.6662 74.35 30.9384L58.8599 39.8815C56.6564 41.1536 53.9416 41.1536 51.7381 39.8814L42.8628 34.7573C38.1148 32.0161 38.1148 25.163 42.8628 22.4218L74.3503 4.24237C76.5538 2.97016 79.2687 2.97015 81.4722 4.24236L120.108 26.5485C122.311 27.8207 123.668 30.1718 123.668 32.7163L123.668 73.9556C123.668 77.2688 120.082 79.3396 117.212 77.683C114.343 76.0264 110.756 78.0972 110.756 81.4104L110.756 119.155C110.756 124.138 116.151 127.253 120.467 124.761C122.471 123.605 123.704 121.467 123.704 119.154L123.704 85.3354C123.704 82.7909 125.061 80.4398 127.265 79.1676L150.028 66.0252C154.776 63.284 160.711 66.7105 160.711 72.193L160.711 140.146C160.711 142.691 159.354 145.042 157.15 146.314L91.03 184.488C88.8265 185.761 86.1116 185.761 83.9081 184.488L17.7879 146.314C15.5843 145.042 14.2269 142.69 14.2269 140.146L14.2268 72.0684C14.2268 66.5859 20.1617 63.1594 24.9097 65.9006L47.6719 79.0424C49.8754 80.3146 51.2329 82.6657 51.2329 85.2101L51.2333 118.781C51.2334 121.325 52.5908 123.676 54.7943 124.948L84.0442 141.836C86.1635 143.059 88.7745 143.059 90.8937 141.836C95.46 139.199 95.46 132.608 90.8937 129.972L68.5858 117.093C66.3823 115.82 65.0248 113.469 65.0248 110.925L65.0248 66.3125C65.0248 63.7681 66.3822 61.417 68.5858 60.1448L89.6395 47.9895Z';
const LOGO_BOX = { x: 14, y: 3, w: 147, h: 183 };

/* ---- Font loading (lazy, cached) — Satoshi weights as opentype fonts ---- */
const FONT_FILES = { 400: 'Satoshi-Regular.ttf', 500: 'Satoshi-Medium.ttf', 700: 'Satoshi-Bold.ttf', 900: 'Satoshi-Black.ttf' };
const _fontCache = {};
function font(weight = 900) {
  if (_fontCache[weight]) return _fontCache[weight];
  const buf = fs.readFileSync(path.join(FONT_DIR, FONT_FILES[weight] || FONT_FILES[900]));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return (_fontCache[weight] = opentype.parse(ab));
}

/* ---------- Step 1: background visual via OpenAI Images ---------- */
// Returns a PNG Buffer. Throws a clear error on missing key / API failure.
export async function generateBackground(visualPrompt, { format = 'square', apiKey, quality = 'medium', transparent = false } = {}) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set (put it in .env, never in code).');
  const fmt = FORMATS[format] || FORMATS.square;

  // Two modes:
  //  - dark full background (cinematic, ember-lit) for dark slides;
  //  - transparent CUTOUT object for light/canvas slides (placed beside text).
  // Both explicitly NOT beige (brand bans the legacy cream palette), no text.
  const styled = transparent
    ? `${visualPrompt}.

A single isolated subject, centered, on a fully transparent background. Product-cutout style: no ground, no floor, no shadow, no scene, no backdrop. Sharp focus, premium, dramatic warm ember rim light. No text, no words, no logo, no watermark.`
    : `${visualPrompt}.

Cinematic premium editorial photograph. Deep near-black background with one dramatic warm ember light source, subtle orange/amber glow, high contrast, refined and minimal, generous calm negative space for a text overlay. Sophisticated, modern, slightly surreal conceptual mood. No text, no words, no letters, no logo, no watermark. NOT beige, NOT cream, NOT vintage paper, NOT grungy.`;

  const body = { model: 'gpt-image-1', prompt: styled, size: fmt.size, n: 1, quality };
  if (transparent) body.background = 'transparent';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

/* ---------- Step 2: composite branded text (real Satoshi glyphs) ---------- */

// One word carries a highlight flag. Title markup: wrap the accent phrase in
// *asterisks*  ->  "On transforme ton idée en *deck qui lève*".
function tokenize(title) {
  const out = [];
  String(title).split(/(\*[^*]+\*)/).forEach(seg => {
    if (!seg) return;
    const hl = seg.startsWith('*') && seg.endsWith('*');
    const text = hl ? seg.slice(1, -1) : seg;
    text.trim().split(/\s+/).filter(Boolean).forEach(w => out.push({ w, hl }));
  });
  return out;
}

const adv = (f, text, size) => f.getAdvanceWidth(text, size);
// Render text as vector glyphs: ONE <path> per glyph (positions/kerning from
// opentype). Splitting per-glyph avoids librsvg silently truncating a single
// very long path `d` attribute, while staying font-dependency-free.
const glyphs = (f, text, x, baseline, size, fill) =>
  f.getPaths(text, x, baseline, size)
    .map(p => p.commands.length ? `<path d="${p.toPathData(2)}" fill="${fill}"/>` : '')
    .join('');

// Wrap word tokens to a max width at a given size; returns lines of tokens with x offsets.
function layout(tokens, f, size, maxW) {
  const space = adv(f, ' ', size);
  const lines = [];
  let line = [], x = 0;
  for (const t of tokens) {
    const wWidth = adv(f, t.w, size);
    const add = (line.length ? space : 0) + wWidth;
    if (x + add > maxW && line.length) { lines.push(line); line = []; x = 0; }
    const startX = x + (line.length ? space : 0);
    line.push({ ...t, x: startX, width: wWidth });
    x = startX + wWidth;
  }
  if (line.length) lines.push(line);
  return lines;
}

// Build the SVG overlay for a dark (image) slide.
function overlaySvg({ w, h, title = '', kicker = '', body = '', index, total, theme = 'dark' }) {
  const pad = Math.round(w * 0.075);
  const light = theme === 'light';
  const maxW = w - pad * 2;
  const fg = light ? BRAND.ink : BRAND.white;       // headline
  const bodyFg = light ? '#52525b' : BRAND.white;   // muted body (ink-2 on light)
  const fBlack = font(900), fBold = font(700), fMed = font(500);

  // Fit headline: shrink until it wraps to <= 4 lines.
  const tokens = tokenize(title);
  let size = Math.round(w * 0.092), lines;
  for (; size > w * 0.05; size -= 4) {
    lines = layout(tokens, fBlack, size, maxW);
    if (lines.length <= 4) break;
  }
  const lineH = Math.round(size * 1.05);

  // Body (optional) sits under the headline.
  const bodySize = Math.round(w * 0.032);
  const bodyLines = body ? layout(tokenize(body), fMed, bodySize, maxW) : [];
  const bodyH = bodyLines.length * Math.round(bodySize * 1.32);

  // Vertical stack anchored to bottom.
  const bottom = h - pad;
  const bodyTop = bottom - bodyH;
  const titleBaselineLast = bodyTop - (body ? Math.round(w * 0.05) : 0);
  const titleTopBaseline = titleBaselineLast - (lines.length - 1) * lineH;

  let svg = '';

  // Bottom scrim for legibility (dark theme only).
  if (theme !== 'light') {
    svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#scrim)"/>`;
  }

  // Headline: render each LINE as a single path (correct kerning), with ember
  // highlight boxes behind accent runs measured by substring advance width.
  const padX = Math.round(size * 0.11), padY = Math.round(size * 0.06);
  lines.forEach((ln, i) => {
    const baseline = titleTopBaseline + i * lineH;
    // Rebuild the line string + char ranges of highlighted runs.
    let s = '', ranges = [], runStart = null, runEnd = 0;
    ln.forEach((tok, idx) => {
      if (idx) s += ' ';
      const a = s.length; s += tok.w; const b = s.length;
      if (tok.hl) { if (runStart === null) runStart = a; runEnd = b; }
      else if (runStart !== null) { ranges.push([runStart, runEnd]); runStart = null; }
    });
    if (runStart !== null) ranges.push([runStart, runEnd]);
    for (const [a, b] of ranges) {
      const x1 = pad + adv(fBlack, s.slice(0, a), size);
      const x2 = pad + adv(fBlack, s.slice(0, b), size);
      svg += `<rect x="${x1 - padX}" y="${baseline - size * 0.74 - padY}" width="${x2 - x1 + padX * 2}" height="${size * 0.86 + padY * 2}" rx="${Math.round(size * 0.1)}" fill="${BRAND.orange}"/>`;
    }
    svg += glyphs(fBlack, s, pad, baseline, size, fg);
  });

  // Kicker pill (above the headline): ember bg, white Bold uppercase.
  if (kicker) {
    const kSize = Math.round(w * 0.026);
    const kText = kicker.toUpperCase();
    const kW = adv(fBold, kText, kSize);
    const kPadX = Math.round(kSize * 0.7), kPadY = Math.round(kSize * 0.55);
    const kH = kSize + kPadY * 2;
    const kY = titleTopBaseline - size * 0.78 - Math.round(w * 0.03) - kH;
    svg += `<rect x="${pad}" y="${kY}" width="${kW + kPadX * 2}" height="${kH}" rx="${Math.round(kH / 2)}" fill="url(#ember)"/>`;
    svg += glyphs(fBold, kText, pad + kPadX, kY + kPadY + kSize * 0.82, kSize, BRAND.white);
  }

  // Body copy (whole-line paths for correct kerning).
  bodyLines.forEach((ln, i) => {
    const baseline = bodyTop + i * Math.round(bodySize * 1.32) + bodySize;
    const s = ln.map(t => t.w).join(' ');
    svg += glyphs(fMed, s, pad, baseline, bodySize, bodyFg);
  });

  // Masthead: Brasero flame mark top-left.
  const logoH = Math.round(w * 0.05);
  const s = logoH / LOGO_BOX.h;
  const logoY = pad;
  svg += `<g transform="translate(${pad - LOGO_BOX.x * s}, ${logoY - LOGO_BOX.y * s}) scale(${s})"><path d="${LOGO_PATH}" fill="url(#ember)"/></g>`;

  // Counter top-right.
  if (index && total) {
    const cSize = Math.round(w * 0.026);
    const cText = `${index} / ${total}`;
    const cW = adv(fMed, cText, cSize);
    svg += glyphs(fMed, cText, w - pad - cW, logoY + cSize * 0.9, cSize, fg);
  }

  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ember" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${BRAND.gradFrom}"/><stop offset="100%" stop-color="${BRAND.gradTo}"/>
      </linearGradient>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="50%" stop-color="#000" stop-opacity="0.1"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.82"/>
      </linearGradient>
    </defs>
    ${svg}
  </svg>`);
}

// Compose one finished slide PNG (Buffer).
//  - dark theme: bgBuffer is a full cinematic image (cover-fit).
//  - light theme: near-white Brasero canvas; optional `object` is a transparent
//    cutout placed upper-right, text sits bottom-left.
export async function composeSlide(bgBuffer, { title, kicker, body, index, total, format = 'square', theme = 'dark', object } = {}) {
  const fmt = FORMATS[format] || FORMATS.square;
  const layers = [];
  let base;

  if (theme === 'light') {
    base = sharp({ create: { width: fmt.w, height: fmt.h, channels: 3, background: '#f5f5f7' } }).png();
    if (object) {
      const objW = Math.round(fmt.w * 0.62);
      const obj = await sharp(object).resize(objW, objW, { fit: 'inside' }).png().toBuffer();
      const meta = await sharp(obj).metadata();
      layers.push({ input: obj, left: fmt.w - meta.width + Math.round(fmt.w * 0.04), top: Math.round(fmt.h * 0.06) });
    }
  } else {
    base = sharp(bgBuffer).resize(fmt.w, fmt.h, { fit: 'cover' }).png();
  }

  const svg = overlaySvg({ w: fmt.w, h: fmt.h, title, kicker, body, index, total, theme });
  layers.push({ input: svg, top: 0, left: 0 });
  return base.composite(layers).png().toBuffer();
}

/* ---------- Orchestrator: full carousel ---------- */
// slides: [{ text, visual, kicker?, body?, theme? }]  ->  [{ index, buffer }]
// theme 'dark' (default) = cinematic full background; 'light' = white canvas + cutout object.
export async function generateCarousel(slides, { format = 'square', apiKey, quality = 'medium', onProgress } = {}) {
  const total = slides.length;
  const out = [];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const theme = s.theme === 'light' ? 'light' : 'dark';
    onProgress?.(`slide ${i + 1}/${total} — generating ${theme === 'light' ? 'cutout' : 'background'}…`);
    const img = await generateBackground(s.visual || s.text, { format, apiKey, quality, transparent: theme === 'light' });
    onProgress?.(`slide ${i + 1}/${total} — compositing text…`);
    const buffer = await composeSlide(theme === 'light' ? null : img, {
      title: s.text, kicker: s.kicker, body: s.body, index: i + 1, total, format, theme,
      object: theme === 'light' ? img : undefined,
    });
    out.push({ index: i + 1, buffer });
  }
  return out;
}
