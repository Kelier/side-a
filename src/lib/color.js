// 颜色、随机与封面工具

export function hash(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
export function hsl(h, s, l, a = 1) {
  return `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => lerp(v, b[i], t)));
}
export function alpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// 从封面提取 5 色调色板（色彩量化 + 饱和度/占比加权）
export async function extractPalette(src) {
  try {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 48, 48);
    const { data } = ctx.getImageData(0, 0, 48, 48);
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const b = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
      b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]; b.n++;
      buckets.set(key, b);
    }
    const cands = [...buckets.values()].map((b) => {
      const rgb = [b.r / b.n, b.g / b.n, b.b / b.n];
      const [, s, l] = rgbToHsl(rgb);
      return { rgb, n: b.n, s, l, score: b.n * (0.35 + s) * (l > 0.06 && l < 0.96 ? 1 : 0.4) };
    }).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const c of cands) {
      if (picked.every((p) => dist(p.rgb, c.rgb) > 48)) picked.push(c);
      if (picked.length >= 5) break;
    }
    while (picked.length < 5) picked.push(cands[picked.length % cands.length] || { rgb: [30, 30, 30] });
    return picked.map((p) => rgbToHex(p.rgb));
  } catch {
    return null;
  }
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function paletteFromSeed(seedStr) {
  const r = rng(hash(seedStr));
  const base = r() * 360;
  const mode = Math.floor(r() * 4);
  const out = [];
  for (let i = 0; i < 5; i++) {
    const h = mode === 0 ? base + i * 12 : mode === 1 ? base + (i % 2) * 180 : mode === 2 ? base + i * 72 : base + i * 30;
    const s = 0.35 + r() * 0.5;
    const l = i === 0 ? 0.12 + r() * 0.15 : 0.35 + r() * 0.45;
    out.push(rgbToHex(hslToRgb(((h % 360) + 360) % 360, s, l)));
  }
  return out;
}
export function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

let _noise = null;
function noiseTile() {
  if (_noise) return _noise;
  _noise = document.createElement('canvas');
  _noise.width = _noise.height = 128;
  const g = _noise.getContext('2d');
  const id = g.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 70;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return _noise;
}

// 生成式封面：当没有真实封面时，根据标题与艺术家生成一个抽象的“唱片封套”
export function generateCover(title = '', artist = '', size = 480) {
  const seed = hash(title + '|' + artist);
  const r = rng(seed);
  const pal = paletteFromSeed(title + artist);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = pal[0];
  ctx.fillRect(0, 0, size, size);
  const style = seed % 5;
  const S = size;
  if (style === 0) {
    // 同心圆：像一张俯视的唱片
    const cx = S * (0.3 + r() * 0.4), cy = S * (0.3 + r() * 0.4);
    for (let i = 14; i > 0; i--) {
      ctx.beginPath();
      ctx.arc(cx, cy, (i / 14) * S * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = pal[1 + (i % 4)];
      ctx.globalAlpha = 0.85;
      ctx.fill();
    }
  } else if (style === 1) {
    // 色带
    let y = 0;
    while (y < S) {
      const h = S * (0.03 + r() * 0.16);
      ctx.fillStyle = pal[1 + Math.floor(r() * 4)];
      ctx.fillRect(0, y, S, h);
      y += h;
    }
  } else if (style === 2) {
    // 包豪斯几何
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = pal[1 + (i % 4)];
      const x = r() * S, y = r() * S, w = S * (0.15 + r() * 0.45);
      if (r() > 0.5) { ctx.beginPath(); ctx.arc(x, y, w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(x - w / 2, y - w / 2, w, w * (0.3 + r()));
    }
  } else if (style === 3) {
    // 渐变雾
    for (let i = 0; i < 5; i++) {
      const g = ctx.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, S * (0.4 + r() * 0.6));
      g.addColorStop(0, pal[1 + (i % 4)]);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
  } else {
    // 网格点阵
    const n = 6 + Math.floor(r() * 8);
    const cell = S / n;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      ctx.fillStyle = pal[1 + ((x * 3 + y * 5 + Math.floor(r() * 2)) % 4)];
      const rad = cell * (0.15 + r() * 0.35);
      ctx.beginPath();
      ctx.arc(x * cell + cell / 2, y * cell + cell / 2, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // 颗粒（复用一块噪点贴图，避免逐像素处理）
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = ctx.createPattern(noiseTile(), 'repeat');
  ctx.translate(-r() * 128, -r() * 128);
  ctx.fillRect(0, 0, S + 128, S + 128);
  ctx.restore();
  // 小号标题
  ctx.fillStyle = luminance(pal[0]) > 0.4 ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.82)';
  ctx.font = `600 ${Math.round(S * 0.032)}px "Archivo Variable", sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.fillText((artist || '').toUpperCase().slice(0, 28), S * 0.06, S * 0.93);
  ctx.font = `italic ${Math.round(S * 0.05)}px "Instrument Serif", serif`;
  ctx.fillText((title || '').slice(0, 26), S * 0.06, S * 0.88);
  return { dataUrl: c.toDataURL('image/jpeg', 0.88), palette: pal };
}

// 把任意图片压缩成指定尺寸的方形 JPEG dataURL
export async function toSquareDataUrl(src, size = 600, quality = 0.88) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', quality);
}

export function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

const genCache = new Map();
export function coverOf(rec) {
  if (rec.cover) return rec.cover;
  if (rec.coverUrl) return rec.coverUrl;
  const k = rec.title + '|' + rec.artist;
  if (!genCache.has(k)) genCache.set(k, generateCover(rec.title, rec.artist).dataUrl);
  return genCache.get(k);
}
