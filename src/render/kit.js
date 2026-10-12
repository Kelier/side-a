// Canvas 排版工具
import { loadImage, coverOf, rng, hash } from '../lib/color.js';

export const FONT = {
  serif: '"Instrument Serif", "Noto Serif SC", "Songti SC", "STSong", serif',
  sans: '"Archivo Variable", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

let fontsReady = null;
export function ensureFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all([
      document.fonts.load(`italic 40px "Instrument Serif"`),
      document.fonts.load(`40px "Instrument Serif"`),
      document.fonts.load(`700 40px "Archivo Variable"`),
      document.fonts.load(`40px "JetBrains Mono"`),
      document.fonts.load(`600 40px "JetBrains Mono"`),
    ]).catch(() => null);
  }
  return fontsReady;
}

const imgCache = new Map();
export function coverImage(rec) {
  const src = coverOf(rec);
  if (!imgCache.has(src)) imgCache.set(src, loadImage(src).catch(() => null));
  return imgCache.get(src);
}

export function font(ctx, size, family = 'sans', { weight = 400, italic = false, stretch = null } = {}) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${Math.round(size)}px ${FONT[family] || family}`;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch || 'normal';
}

export function setStretch(ctx, pct) {
  if (!('fontStretch' in ctx)) return;
  const map = { 62: 'extra-condensed', 75: 'condensed', 87: 'semi-condensed', 100: 'normal', 112: 'semi-expanded', 125: 'expanded' };
  ctx.fontStretch = map[pct] || 'normal';
}

const isCJK = (s) => /[　-鿿＀-￯]/.test(s);

// 中英文混排换行
export function wrap(ctx, text, maxW, maxLines = 99) {
  const out = [];
  const tokens = [];
  let buf = '';
  for (const ch of String(text || '')) {
    if (isCJK(ch) || ch === ' ') {
      if (buf) tokens.push(buf);
      buf = '';
      tokens.push(ch);
    } else buf += ch;
  }
  if (buf) tokens.push(buf);
  let line = '';
  for (const t of tokens) {
    const test = line + t;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line.trimEnd());
      line = t === ' ' ? '' : t;
      if (out.length >= maxLines) break;
    } else line = test;
  }
  if (out.length < maxLines && line) out.push(line.trimEnd());
  if (out.length === maxLines && tokens.join('').length > out.join('').length + 1) {
    let last = out[maxLines - 1];
    while (last.length && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    out[maxLines - 1] = last + '…';
  }
  return out;
}

export function fitFont(ctx, text, maxW, start, family, opts = {}, min = 10) {
  let s = start;
  font(ctx, s, family, opts);
  while (s > min && ctx.measureText(text).width > maxW) { s -= 2; font(ctx, s, family, opts); }
  return s;
}

export function drawCover(ctx, img, x, y, w, h = w, { shadow = 0, radius = 0 } = {}) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = shadow;
    ctx.shadowOffsetY = shadow * 0.4;
  }
  if (radius) { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.clip(); }
  if (img) {
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, x, y, w, h);
  } else {
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

export function drawVinyl(ctx, cx, cy, r, { label = '#ff5a1f', img = null, angle = 0, sheen = true } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0d0e';
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, r / 260);
  for (let rr = r * 0.36; rr < r * 0.985; rr += Math.max(2, r / 90)) {
    ctx.strokeStyle = `rgba(255,255,255,${0.025 + ((rr * 7) % 5) * 0.006})`;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
  }
  if (sheen) {
    const g = ctx.createConicGradient(0.6, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.08, 'rgba(255,255,255,.14)');
    g.addColorStop(0.16, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(0.58, 'rgba(255,255,255,.1)');
    g.addColorStop(0.66, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.33, 0, Math.PI * 2);
  ctx.fillStyle = label;
  ctx.fill();
  if (img) {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.85;
    const s = r * 0.66;
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.025, 0, Math.PI * 2);
  ctx.fillStyle = '#050505';
  ctx.fill();
  ctx.restore();
}

export function grain(ctx, W, H, amount = 18, seed = 1) {
  const r = rng(seed);
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const t = tile.getContext('2d');
  const id = t.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * amount * 4;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  t.putImageData(id, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function seeded(rec, extra = 0) {
  return rng(hash(rec.id + ':' + extra));
}

export function spacedText(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - x;
}

export function dateStr(d) {
  const x = new Date(d || Date.now());
  return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}`;
}
