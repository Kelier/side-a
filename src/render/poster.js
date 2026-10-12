// 创意二 / 四：品味海报机 & 把封面重新策展
// 同一张专辑，六种视觉版本；每个版本内部再按专辑气质（亮度 / 饱和度 / 情绪）做版式变化。
import { font, wrap, fitFont, drawCover, drawVinyl, grain, seeded, spacedText, dateStr, setStretch, FONT } from './kit.js';
import { luminance, mix, alpha, hexToRgb, rgbToHsl } from '../lib/color.js';
import { formatById, moodById } from '../lib/constants.js';

// 根据专辑气质推荐视觉版本（艺术指导）
export function artDirection(rec) {
  const pal = rec.palette?.length ? rec.palette : ['#222', '#888'];
  const lum = pal.reduce((s, c) => s + luminance(c), 0) / pal.length;
  const sat = pal.reduce((s, c) => s + rgbToHsl(hexToRgb(c))[1], 0) / pal.length;
  const moods = rec.moods || [];
  const energy = moods.map(moodById).filter(Boolean).reduce((s, m) => s + m.energy, 0) / Math.max(1, moods.length) || 0.5;
  let pick, why;
  if (moods.includes('anger') || moods.includes('burn') || (energy > 0.8 && sat > 0.4)) { pick = 'underground'; why = '高能量的情绪和饱和的色彩，适合复印纸与拼贴的粗粝感。'; }
  else if (lum < 0.12 || moods.includes('night') || moods.includes('insomnia')) { pick = 'midnight'; why = '封面整体偏暗，情绪落在夜里--用低照度、玻璃与金属去承接它。'; }
  else if (moods.includes('nostalgia') || moods.includes('tender')) { pick = 'memory'; why = '怀旧与温柔的情绪，更适合带日期和手写批注的个人版本。'; }
  else if (sat > 0.55 && energy > 0.55) { pick = 'brutalist'; why = '色彩强烈、能量偏高，用粗粝字体和冲突网格放大它的态度。'; }
  else if (lum > 0.45) { pick = 'museum'; why = '封面明亮克制，大面积留白和展签会让它像一件馆藏。'; }
  else { pick = 'film'; why = '中间调的色彩适合胶片的颗粒、齿孔与漏光。'; }
  return { pick, why, lum, sat, energy };
}

export function drawPoster(ctx, W, H, rec, img, opts = {}) {
  const ed = opts.edition || 'museum';
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ({ museum, underground, midnight, memory, brutalist, film }[ed] || museum)(ctx, W, H, rec, img, opts);
  ctx.restore();
}

const U = (W) => W / 1080; // 以 1080 宽为设计基准
const noOf = (o) => String(o.no || 1).padStart(3, '0');
const pal = (rec) => (rec.palette?.length ? rec.palette : ['#1a1a1a', '#ff5a1f', '#888', '#ccc', '#444']);

// ---------------- Museum Edition ----------------
function museum(ctx, W, H, rec, img, o) {
  const u = U(W);
  const r = seeded(rec, o.variant || 0);
  const p = pal(rec);
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(0, 0, W, H);
  // 墙面的细微渐变
  const g = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, H);
  g.addColorStop(0, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(120,100,70,.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const left = (o.variant || 0) % 2 === 1;
  const cw = W * (H / W > 1.5 ? 0.66 : H / W < 1.1 ? 0.44 : 0.58);
  const cx = left ? 96 * u : (W - cw) / 2;
  const cy = H * (H / W < 1.1 ? 0.1 : 0.13);
  // 唱片从封套后露出
  drawVinyl(ctx, cx + cw * 0.78, cy + cw / 2, cw * 0.47, { label: p[1], img, angle: r() * 6 });
  drawCover(ctx, img, cx, cy, cw, cw, { shadow: 60 * u });

  // 竖排侧标
  ctx.save();
  ctx.translate(W - 54 * u, cy);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = 'rgba(11,11,12,.5)';
  font(ctx, 17 * u, 'mono');
  spacedText(ctx, 'PERSONAL MUSIC ARCHIVE · SIDE A', 0, 0, 4 * u);
  ctx.restore();

  // 展签
  const ly = cy + cw + (H / W < 1.1 ? 50 : 90) * u;
  const lx = left ? 96 * u : (W - Math.max(cw, 640 * u)) / 2;
  const lw = Math.max(cw, 640 * u);
  ctx.fillStyle = '#0b0b0c';
  font(ctx, 18 * u, 'mono');
  ctx.fillText(`NO. ${noOf(o)}`, lx, ly);
  ctx.textAlign = 'right';
  ctx.fillText(`${formatById(rec.format).en}`, lx + lw, ly);
  ctx.textAlign = 'left';
  ctx.fillRect(lx, ly + 16 * u, lw, 1.5 * u);
  const ts = fitFont(ctx, rec.title, lw, 74 * u, 'serif', { italic: true }, 30 * u);
  ctx.fillText(rec.title, lx, ly + 22 * u + ts);
  font(ctx, 26 * u, 'sans', { weight: 600 });
  ctx.fillText(rec.artist, lx, ly + 34 * u + ts + 34 * u);
  font(ctx, 17 * u, 'mono');
  ctx.fillStyle = 'rgba(11,11,12,.6)';
  ctx.fillText(`${rec.year || '-'} · ${(rec.genre || '').toUpperCase()} · ACQUIRED ${dateStr(rec.listenedAt || rec.addedAt)}`, lx, ly + 34 * u + ts + 72 * u);
  if (o.showNote !== false && rec.note) {
    ctx.fillStyle = '#0b0b0c';
    font(ctx, 34 * u, 'serif', { italic: true });
    const lines = wrap(ctx, `“${rec.note}”`, lw, 3);
    lines.forEach((l, i) => ctx.fillText(l, lx, ly + 34 * u + ts + 132 * u + i * 42 * u));
  }
  // 署名
  ctx.fillStyle = 'rgba(11,11,12,.55)';
  font(ctx, 16 * u, 'mono');
  ctx.fillText(`COLLECTION OF ${(o.signature || '').toUpperCase()}`, lx, H - 56 * u);
  ctx.textAlign = 'right';
  ctx.fillText('SIDE A', W - 60 * u, H - 56 * u);
  ctx.textAlign = 'left';
  grain(ctx, W, H, 10, 3);
}

// ---------------- Underground Edition ----------------
function underground(ctx, W, H, rec, img, o) {
  const u = U(W);
  const r = seeded(rec, 10 + (o.variant || 0));
  const p = pal(rec);
  const acc = o.accent || (luminance(p[1]) > 0.5 ? '#ff2d2d' : p[1]);
  ctx.fillStyle = '#e9e6dd';
  ctx.fillRect(0, 0, W, H);
  // 复印纸污渍
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
    ctx.fillRect(r() * W, r() * H, r() * 300 * u, r() * 3 * u);
  }
  // 高对比阈值处理的封面
  const cw = W * 0.78;
  const off = document.createElement('canvas');
  off.width = off.height = Math.round(cw);
  const oc = off.getContext('2d');
  drawCover(oc, img, 0, 0, cw, cw);
  const id = oc.getImageData(0, 0, off.width, off.height);
  const d = id.data;
  const [ar, ag, ab] = hexToRgb(acc);
  // 自适应色阶：按封面自身的亮度分布拉伸，暗封面也能保留复印纹理
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11)]++;
  const total = d.length / 4;
  let acc0 = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc0 += hist[v]; if (acc0 > total * 0.04) { lo = v; break; } }
  acc0 = 0;
  for (let v = 255; v >= 0; v--) { acc0 += hist[v]; if (acc0 > total * 0.04) { hi = v; break; } }
  const span = Math.max(24, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.min(1, Math.max(0, ((d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) - lo) / span));
    const px = (i / 4) % off.width, py = Math.floor(i / 4 / off.width);
    const dot = ((px % 6) - 3) ** 2 + ((py % 6) - 3) ** 2 < (1 - l) * 14 ? 1 : 0;
    const v = l < 0.32 ? 0 : l > 0.68 ? 1 : 1 - dot;
    if (v === 0) { d[i] = 17; d[i + 1] = 17; d[i + 2] = 17; }
    else if (l < 0.55 && (px + py) % 7 < 3) { d[i] = ar; d[i + 1] = ag; d[i + 2] = ab; }
    else { d[i] = 233; d[i + 1] = 230; d[i + 2] = 221; }
  }
  oc.putImageData(id, 0, 0);
  ctx.save();
  ctx.translate(W / 2, H * 0.42);
  ctx.rotate((r() - 0.5) * 0.08);
  ctx.drawImage(off, -cw / 2, -cw / 2);
  // 胶带
  ctx.fillStyle = 'rgba(240,230,190,.75)';
  ctx.rotate(-0.3);
  ctx.fillRect(-cw / 2 - 30 * u, -cw / 2 - 10 * u, 180 * u, 46 * u);
  ctx.rotate(0.6);
  ctx.fillRect(cw / 2 - 160 * u, -cw / 2 + 60 * u, 180 * u, 46 * u);
  ctx.restore();

  // 勒索信式标题
  const words = (rec.title || '').toUpperCase().split(/(\s+)/).filter((w) => w.trim());
  const chars = words.length > 1 ? words : [...(rec.title || '')];
  let x = 60 * u, y = H * 0.8, ci = 0;
  for (const w of chars) {
    const sz = (70 + r() * 40) * u;
    const kind = (ci++) % 3; // 0 黑底白字 · 1 强调色底 · 2 白纸黑框
    font(ctx, sz, 'sans', { weight: 900 });
    setStretch(ctx, r() > 0.5 ? 62 : 125);
    const tw = ctx.measureText(w).width;
    if (x + tw > W - 60 * u) { x = 60 * u; y += 104 * u; }
    if (y > H - 160 * u) break;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((r() - 0.5) * 0.12);
    ctx.fillStyle = kind === 0 ? '#111' : kind === 1 ? acc : '#f6f3ea';
    ctx.fillRect(-10 * u, -sz * 0.86, tw + 20 * u, sz * 1.06);
    if (kind === 2) { ctx.strokeStyle = '#111'; ctx.lineWidth = 3 * u; ctx.strokeRect(-10 * u, -sz * 0.86, tw + 20 * u, sz * 1.06); }
    ctx.fillStyle = kind === 0 ? '#e9e6dd' : kind === 1 ? (luminance(acc) > 0.45 ? '#111' : '#f6f3ea') : '#111';
    ctx.fillText(w, 0, 0);
    ctx.restore();
    x += tw + 26 * u;
  }
  setStretch(ctx, 100);
  // 打字机条
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 40 * u, W, 54 * u);
  ctx.fillStyle = '#e9e6dd';
  font(ctx, 22 * u, 'mono', { weight: 600 });
  ctx.fillText(`${(rec.artist || '').toUpperCase()} // ${rec.year || '????'} // NO.${noOf(o)} // DO NOT PLAY IN DAYLIGHT`.slice(0, 64), 40 * u, 76 * u);
  if (o.showNote !== false && rec.note) {
    font(ctx, 26 * u, 'mono');
    const lines = wrap(ctx, rec.note, W - 200 * u, 2);
    const by = H - 70 * u - (lines.length - 1) * 36 * u;
    lines.forEach((l, i) => {
      const lw = ctx.measureText(l).width;
      ctx.fillStyle = '#111';
      ctx.fillRect(56 * u, by + i * 36 * u - 26 * u, lw + 16 * u, 34 * u);
      ctx.fillStyle = '#e9e6dd';
      ctx.fillText(l, 64 * u, by + i * 36 * u);
    });
  }
  ctx.fillStyle = '#111';
  font(ctx, 16 * u, 'mono');
  ctx.textAlign = 'right';
  ctx.fillText(`xerox by ${o.signature || 'anon'}`, W - 50 * u, H - 40 * u);
  ctx.textAlign = 'left';
  grain(ctx, W, H, 36, 11);
}

// ---------------- Midnight Edition ----------------
function midnight(ctx, W, H, rec, img, o) {
  const u = U(W);
  const p = pal(rec);
  const glow = mix(p[1], '#ffffff', 0.15);
  ctx.fillStyle = '#060607';
  ctx.fillRect(0, 0, W, H);
  // 顶部聚光
  const sp = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 0.9);
  sp.addColorStop(0, 'rgba(255,240,215,.22)');
  sp.addColorStop(0.5, alpha(p[1], 0.08));
  sp.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sp;
  ctx.fillRect(0, 0, W, H);

  const cw = W * 0.56;
  const cx = W * 0.12, cy = H * 0.16;
  // 唱片
  drawVinyl(ctx, cx + cw * 0.92, cy + cw / 2, cw * 0.48, { label: p[1], img, angle: 0.4 });
  drawCover(ctx, img, cx, cy, cw, cw, { shadow: 80 * u });
  // 地面倒影
  ctx.save();
  ctx.translate(0, (cy + cw) * 2 + 8 * u);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.2;
  drawCover(ctx, img, cx, cy, cw, cw);
  ctx.restore();
  const fade = ctx.createLinearGradient(0, cy + cw, 0, cy + cw * 1.3);
  fade.addColorStop(0, 'rgba(6,6,7,.35)');
  fade.addColorStop(1, 'rgba(6,6,7,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, cy + cw, W, cw);

  // 玻璃面板
  const gy = H * 0.66;
  const gx = W * 0.08, gw = W * 0.84, gh = H - gy - 70 * u;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(gx, gy, gw, gh, 22 * u);
  ctx.fillStyle = 'rgba(255,255,255,.045)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1.5 * u;
  ctx.stroke();
  ctx.restore();
  // 金属渐变字
  const metal = ctx.createLinearGradient(0, gy, 0, gy + 140 * u);
  metal.addColorStop(0, '#f4f4f6');
  metal.addColorStop(0.45, '#9a9ca3');
  metal.addColorStop(0.55, '#e7e8ec');
  metal.addColorStop(1, '#6d6f76');
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  font(ctx, 17 * u, 'mono');
  spacedText(ctx, `MIDNIGHT EDITION · NO. ${noOf(o)}`, gx + 40 * u, gy + 50 * u, 3 * u);
  ctx.fillStyle = metal;
  const ts = fitFont(ctx, rec.title, gw - 80 * u, 92 * u, 'serif', { italic: true }, 34 * u);
  ctx.fillText(rec.title, gx + 40 * u, gy + 60 * u + ts);
  ctx.fillStyle = glow;
  font(ctx, 26 * u, 'sans', { weight: 600 });
  ctx.fillText(rec.artist, gx + 40 * u, gy + 104 * u + ts);
  if (o.showNote !== false && rec.note) {
    ctx.fillStyle = 'rgba(239,233,220,.78)';
    font(ctx, 30 * u, 'serif', { italic: true });
    wrap(ctx, `“${rec.note}”`, gw - 80 * u, 2).forEach((l, i) => ctx.fillText(l, gx + 40 * u, gy + 158 * u + ts + i * 38 * u));
  }
  ctx.fillStyle = 'rgba(239,233,220,.4)';
  font(ctx, 15 * u, 'mono');
  ctx.fillText(`${rec.year || ''} · ${formatById(rec.format).en} · ${(o.signature || '').toUpperCase()}`, gx + 40 * u, gy + gh - 34 * u);
  // 右上的低照度小字
  ctx.save();
  ctx.translate(W - 50 * u, 60 * u);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = 'rgba(239,233,220,.35)';
  font(ctx, 15 * u, 'mono');
  spacedText(ctx, 'THIS ALBUM SHOULD NOT BE PLAYED IN DAYLIGHT', 0, 0, 3 * u);
  ctx.restore();
  grain(ctx, W, H, 22, 5);
}

// ---------------- Memory Edition ----------------
function memory(ctx, W, H, rec, img, o) {
  const u = U(W);
  const r = seeded(rec, 20 + (o.variant || 0));
  const p = pal(rec);
  ctx.fillStyle = '#f1ebdf';
  ctx.fillRect(0, 0, W, H);
  // 方格纸
  ctx.strokeStyle = 'rgba(70,90,140,.13)';
  ctx.lineWidth = 1.2 * u;
  for (let x = 0; x < W; x += 36 * u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 36 * u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // 宝丽来
  const photo = o.photo || img;
  const pw = W * 0.64, ph = pw * 1.18;
  ctx.save();
  ctx.translate(W * 0.47, H * 0.08 + ph / 2);
  ctx.rotate(-0.045 + (r() - 0.5) * 0.04);
  ctx.shadowColor = 'rgba(0,0,0,.25)';
  ctx.shadowBlur = 40 * u;
  ctx.shadowOffsetY = 16 * u;
  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  ctx.shadowColor = 'transparent';
  const iw = pw * 0.88;
  drawCover(ctx, photo, -iw / 2, -ph / 2 + pw * 0.06, iw, iw);
  // 日期戳
  ctx.fillStyle = '#ff7a1a';
  ctx.shadowColor = 'rgba(255,120,30,.8)';
  ctx.shadowBlur = 8 * u;
  font(ctx, 30 * u, 'mono', { weight: 600 });
  const d = new Date(rec.listenedAt || rec.addedAt);
  ctx.textAlign = 'right';
  ctx.fillText(`'${String(d.getFullYear()).slice(2)}  ${d.getMonth() + 1}  ${d.getDate()}`, iw / 2 - 20 * u, -ph / 2 + pw * 0.06 + iw - 24 * u);
  ctx.shadowColor = 'transparent';
  ctx.textAlign = 'left';
  // 宝丽来下沿手写
  ctx.fillStyle = '#2b2b33';
  font(ctx, 40 * u, 'serif', { italic: true });
  ctx.fillText(fitText(ctx, rec.title, iw), -iw / 2, ph / 2 - 44 * u);
  ctx.restore();
  // 胶带
  ctx.save();
  ctx.translate(W * 0.47, H * 0.08);
  ctx.rotate(0.06);
  ctx.fillStyle = alpha(mix(p[1], '#ffffff', 0.45), 0.75);
  ctx.fillRect(-90 * u, -24 * u, 180 * u, 52 * u);
  ctx.restore();
  // 封面贴纸（如果用了个人照片）
  if (o.photo && img) {
    ctx.save();
    ctx.translate(W * 0.8, H * 0.08 + ph * 0.92);
    ctx.rotate(0.12);
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = 20 * u;
    drawCover(ctx, img, -110 * u, -110 * u, 220 * u, 220 * u);
    ctx.restore();
  }
  // 手写批注
  const ny = H * 0.08 + ph + 90 * u;
  ctx.fillStyle = '#2b2b33';
  if (o.showNote !== false) {
    font(ctx, 42 * u, 'serif', { italic: true });
    const mem = rec.memories?.[rec.memories.length - 1]?.text;
    const text = rec.note || mem || '';
    wrap(ctx, text, W - 200 * u, 3).forEach((l, i) => ctx.fillText(l, 100 * u, ny + i * 52 * u));
    // 下划线
    ctx.strokeStyle = alpha(p[1], 0.7);
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(100 * u, ny + 14 * u);
    for (let x = 100; x < 520; x += 20) ctx.lineTo(x * u + 10 * u, ny + 14 * u + (r() - 0.5) * 6 * u);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(43,43,51,.7)';
  font(ctx, 24 * u, 'sans', { weight: 600 });
  ctx.fillText(`- ${rec.artist}${rec.year ? ', ' + rec.year : ''}`, 100 * u, H - 110 * u);
  font(ctx, 16 * u, 'mono');
  ctx.fillText(`MEMORY EDITION · NO.${noOf(o)} · ${(o.signature || '').toUpperCase()}`, 100 * u, H - 70 * u);
  grain(ctx, W, H, 12, 21);
}
function fitText(ctx, s, w) {
  if (ctx.measureText(s).width <= w) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}

// ---------------- Brutalist Edition ----------------
function brutalist(ctx, W, H, rec, img, o) {
  const u = U(W);
  const p = pal(rec);
  const r = seeded(rec, 30 + (o.variant || 0));
  const bg = (o.variant || 0) % 2 ? '#0b0b0c' : '#e8e4da';
  const ink = bg === '#0b0b0c' ? '#e8e4da' : '#0b0b0c';
  const acc = o.accent || p[1];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const cols = 6, rows = Math.round(6 * (H / W));
  const cwid = W / cols, rh = H / rows;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2 * u;
  for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo(i * cwid, 0); ctx.lineTo(i * cwid, H); ctx.stroke(); }
  for (let j = 1; j < rows; j++) { ctx.beginPath(); ctx.moveTo(0, j * rh); ctx.lineTo(W, j * rh); ctx.stroke(); }
  // 封面占据 4x4 格（位置随变体变化）
  const cc = Math.floor(r() * 3), rr = 1;
  const span = Math.min(4, cols - cc);
  drawCover(ctx, img, cc * cwid, rr * rh, cwid * span, cwid * span);
  // 巨大标题，被裁切出画面
  ctx.fillStyle = acc;
  const t = (rec.title || '').toUpperCase();
  font(ctx, 300 * u, 'sans', { weight: 900 });
  setStretch(ctx, 125);
  ctx.save();
  ctx.globalCompositeOperation = bg === '#0b0b0c' ? 'lighten' : 'multiply';
  ctx.fillText(t, -40 * u, rh * 1 + 230 * u);
  ctx.restore();
  setStretch(ctx, 62);
  ctx.fillStyle = ink;
  const ts = fitFont(ctx, t, W - 80 * u, 170 * u, 'sans', { weight: 900 }, 40 * u);
  setStretch(ctx, 62);
  ctx.fillText(t, 40 * u, H - rh * 1.25);
  setStretch(ctx, 100);
  // 格子里的信息表
  font(ctx, 20 * u, 'mono', { weight: 600 });
  const cells = [['NO.', noOf(o)], ['YEAR', String(rec.year || '-')], ['FMT', formatById(rec.format).en.split(' ')[0]], ['MOOD', (moodById(rec.moods?.[0])?.en || '-').slice(0, 9)]];
  cells.forEach(([k, v], i) => {
    const x = (i % cols) * cwid + 18 * u, y = 34 * u;
    ctx.fillStyle = ink;
    font(ctx, 14 * u, 'mono');
    ctx.fillText(k, x, y);
    font(ctx, 30 * u, 'sans', { weight: 800 });
    ctx.fillText(v, x, y + 46 * u);
  });
  // 竖排艺术家
  ctx.save();
  ctx.translate(W - 30 * u, rh);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = ink;
  font(ctx, 56 * u, 'sans', { weight: 900 });
  setStretch(ctx, 125);
  ctx.fillText(fitText(ctx, (rec.artist || '').toUpperCase(), rh * (rows - 2.5)), 0, 0);
  setStretch(ctx, 100);
  ctx.restore();
  if (o.showNote !== false && rec.note) {
    const ny = H - rh * 0.55;
    ctx.fillStyle = acc;
    ctx.fillRect(0, H - rh, W, rh);
    ctx.fillStyle = luminance(acc) > 0.4 ? '#0b0b0c' : '#f2ede2';
    font(ctx, 34 * u, 'sans', { weight: 700 });
    ctx.fillText(fitText(ctx, rec.note, W - 80 * u), 40 * u, ny + 12 * u);
  }
  void ts;
}

// ---------------- Film Edition ----------------
function film(ctx, W, H, rec, img, o) {
  const u = U(W);
  const p = pal(rec);
  ctx.fillStyle = '#1a0f08';
  ctx.fillRect(0, 0, W, H);
  // 片基
  const sx = 70 * u, sw = W - 140 * u;
  const base = ctx.createLinearGradient(sx, 0, sx + sw, 0);
  base.addColorStop(0, '#b4561a');
  base.addColorStop(0.5, '#cf6a24');
  base.addColorStop(1, '#a84d16');
  ctx.fillStyle = base;
  ctx.fillRect(sx, 0, sw, H);
  // 齿孔
  ctx.fillStyle = '#1a0f08';
  for (let y = 18 * u; y < H; y += 46 * u) {
    ctx.beginPath(); ctx.roundRect(sx + 18 * u, y, 26 * u, 28 * u, 5 * u); ctx.fill();
    ctx.beginPath(); ctx.roundRect(sx + sw - 44 * u, y, 26 * u, 28 * u, 5 * u); ctx.fill();
  }
  // 片边印字
  ctx.fillStyle = 'rgba(255,200,120,.85)';
  font(ctx, 16 * u, 'mono', { weight: 600 });
  ctx.save();
  ctx.translate(sx + 62 * u, 0);
  ctx.rotate(Math.PI / 2);
  for (let y = 40; y < H / u; y += 300) ctx.fillText(`SIDE A 400  ▸ ${Math.round(y / 300) + 23}A`, y * u, 0);
  ctx.restore();
  // 画幅
  const fx = sx + 80 * u, fw = sw - 160 * u;
  const frameH = fw;
  const fy = (H - frameH) / 2 - 120 * u;
  ctx.fillStyle = '#0b0703';
  ctx.fillRect(fx - 8 * u, fy - 8 * u, fw + 16 * u, frameH + 16 * u);
  drawCover(ctx, img, fx, fy, fw, frameH);
  // 漏光
  const leak = ctx.createRadialGradient(fx + fw, fy + frameH * 0.2, 0, fx + fw, fy + frameH * 0.2, fw * 0.8);
  leak.addColorStop(0, 'rgba(255,120,40,.55)');
  leak.addColorStop(0.4, 'rgba(255,60,20,.18)');
  leak.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = leak;
  ctx.fillRect(fx, fy, fw, frameH);
  ctx.restore();
  // 下一格的局部
  ctx.fillStyle = '#0b0703';
  ctx.fillRect(fx - 8 * u, fy + frameH + 40 * u, fw + 16 * u, H);
  ctx.fillRect(fx - 8 * u, 0, fw + 16 * u, fy - 40 * u);
  // 下方文字（印在下一格的黑色片区）
  const ty = fy + frameH + 120 * u;
  ctx.fillStyle = '#f3d9b5';
  const ts = fitFont(ctx, rec.title, fw - 40 * u, 80 * u, 'serif', { italic: true }, 30 * u);
  ctx.fillText(rec.title, fx + 20 * u, ty + ts * 0.3);
  font(ctx, 24 * u, 'sans', { weight: 600 });
  ctx.fillStyle = mix(p[1], '#f3d9b5', 0.5);
  ctx.fillText(rec.artist, fx + 20 * u, ty + ts * 0.3 + 44 * u);
  if (o.showNote !== false && rec.note) {
    ctx.fillStyle = 'rgba(243,217,181,.8)';
    font(ctx, 28 * u, 'serif', { italic: true });
    wrap(ctx, `“${rec.note}”`, fw - 40 * u, 2).forEach((l, i) => ctx.fillText(l, fx + 20 * u, ty + ts * 0.3 + 100 * u + i * 36 * u));
  }
  ctx.fillStyle = 'rgba(243,217,181,.5)';
  font(ctx, 15 * u, 'mono');
  ctx.fillText(`FRAME ${noOf(o)} · ${dateStr(rec.listenedAt || rec.addedAt)} · ${(o.signature || '').toUpperCase()}`, fx + 20 * u, H - 50 * u);
  ctx.fillStyle = '#f3d9b5';
  font(ctx, 15 * u, 'mono');
  ctx.fillText(`${noOf(o)}A ▸`, fx, fy - 56 * u);
  grain(ctx, W, H, 40, 9);
}

// ---------------- 收藏档案卡 ----------------
export function drawArchive(ctx, W, H, rec, img, o = {}) {
  const u = U(W);
  const p = pal(rec);
  ctx.save();
  ctx.fillStyle = '#d9d3c4';
  ctx.fillRect(0, 0, W, H);
  // 卡纸
  const m = 60 * u;
  ctx.fillStyle = '#f4efe3';
  ctx.shadowColor = 'rgba(0,0,0,.18)';
  ctx.shadowBlur = 30 * u;
  ctx.fillRect(m, m, W - m * 2, H - m * 2);
  ctx.shadowColor = 'transparent';
  const x0 = m + 50 * u, x1 = W - m - 50 * u, w = x1 - x0;
  let y = m + 70 * u;
  ctx.fillStyle = '#7a2a1a';
  font(ctx, 17 * u, 'mono', { weight: 600 });
  ctx.fillText('PERSONAL MUSIC ARCHIVE - ACCESSION CARD', x0, y);
  ctx.textAlign = 'right';
  ctx.fillText(`NO. ${noOf(o)}`, x1, y);
  ctx.textAlign = 'left';
  y += 22 * u;
  ctx.fillStyle = '#7a2a1a';
  ctx.fillRect(x0, y, w, 3 * u);
  ctx.fillRect(x0, y + 7 * u, w, 1 * u);
  y += 40 * u;
  // 封面缩略
  const cs = 250 * u;
  drawCover(ctx, img, x1 - cs, y, cs, cs, { shadow: 12 * u });
  ctx.fillStyle = '#1b1b1b';
  font(ctx, 15 * u, 'mono');
  ctx.fillText('TITLE / 题名', x0, y + 14 * u);
  font(ctx, 60 * u, 'serif', { italic: true });
  const tl = wrap(ctx, rec.title, w - cs - 40 * u, 2);
  tl.forEach((l, i) => ctx.fillText(l, x0, y + 74 * u + i * 62 * u));
  let yy = y + 74 * u + tl.length * 62 * u + 10 * u;
  font(ctx, 15 * u, 'mono');
  ctx.fillText('ARTIST / 艺术家', x0, yy);
  font(ctx, 32 * u, 'sans', { weight: 600 });
  ctx.fillText(fitText(ctx, rec.artist, w - cs - 40 * u), x0, yy + 42 * u);
  y = Math.max(y + cs, yy + 42 * u) + 50 * u;
  // 表格
  const room = o.roomName || '-';
  const rowsData = [
    ['发行年份 RELEASED', String(rec.year || '-'), '收藏形态 FORMAT', `${formatById(rec.format).label} · ${formatById(rec.format).size}`],
    ['流派 GENRE', rec.genre || '-', '入藏日期 ACQUIRED', dateStr(rec.listenedAt || rec.addedAt)],
    ['人生房间 ROOM', room, '循环记录 LOOPS', rec.loops ? `${rec.loops} 次（自记）` : '-'],
    ['心情 MOOD', (rec.moods || []).map((id) => moodById(id)?.label).filter(Boolean).join(' / ') || '-', '面 SIDE', rec.side === 'B' ? 'B 面' : 'A 面'],
  ];
  const rh = 86 * u;
  rowsData.forEach((row, i) => {
    const ry = y + i * rh;
    ctx.strokeStyle = 'rgba(122,42,26,.35)';
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x1, ry); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + w / 2, ry); ctx.lineTo(x0 + w / 2, ry + rh); ctx.stroke();
    for (let c = 0; c < 2; c++) {
      const cx = x0 + c * (w / 2) + (c ? 24 * u : 0);
      ctx.fillStyle = '#7a2a1a';
      font(ctx, 13 * u, 'mono');
      ctx.fillText(row[c * 2], cx, ry + 26 * u);
      ctx.fillStyle = '#1b1b1b';
      font(ctx, 28 * u, 'sans', { weight: 500 });
      ctx.fillText(fitText(ctx, row[c * 2 + 1], w / 2 - 40 * u), cx, ry + 66 * u);
    }
  });
  y += rowsData.length * rh;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  y += 50 * u;
  ctx.fillStyle = '#7a2a1a';
  font(ctx, 13 * u, 'mono');
  ctx.fillText('CURATOR’S NOTE / 收藏者批注', x0, y);
  ctx.fillStyle = '#1b1b1b';
  font(ctx, 38 * u, 'serif', { italic: true });
  const noteLines = wrap(ctx, rec.note ? `“${rec.note}”` : '-', w, 2);
  noteLines.forEach((l, i) => ctx.fillText(l, x0, y + 52 * u + i * 46 * u));
  y += 52 * u + noteLines.length * 46 * u + 20 * u;
  const mem = rec.memories?.[0]?.text;
  if (mem && y < H - m - 220 * u) {
    ctx.fillStyle = '#7a2a1a';
    font(ctx, 13 * u, 'mono');
    ctx.fillText('PROVENANCE / 来历', x0, y);
    ctx.fillStyle = '#333';
    font(ctx, 24 * u, 'sans');
    wrap(ctx, mem, w, Math.max(1, Math.floor((H - m - 200 * u - y) / (34 * u)))).forEach((l, i) => ctx.fillText(l, x0, y + 40 * u + i * 34 * u));
  }
  // 印章
  ctx.save();
  ctx.translate(x1 - 110 * u, H - m - 140 * u);
  ctx.rotate(-0.18);
  ctx.strokeStyle = alpha('#c0391b', 0.8);
  ctx.fillStyle = alpha('#c0391b', 0.8);
  ctx.lineWidth = 4 * u;
  ctx.beginPath(); ctx.arc(0, 0, 84 * u, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5 * u;
  ctx.beginPath(); ctx.arc(0, 0, 70 * u, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center';
  font(ctx, 22 * u, 'sans', { weight: 900 });
  ctx.fillText('SIDE A', 0, -6 * u);
  font(ctx, 12 * u, 'mono');
  ctx.fillText('COLLECTION', 0, 18 * u);
  ctx.fillText(dateStr(Date.now()), 0, 38 * u);
  ctx.restore();
  // 唱片纹条形码
  ctx.fillStyle = '#1b1b1b';
  let bx = x0;
  const r = seeded(rec, 99);
  while (bx < x0 + 380 * u) {
    const bw = (1 + Math.floor(r() * 4)) * u * 2;
    ctx.fillRect(bx, H - m - 110 * u, bw, 60 * u);
    bx += bw + (1 + Math.floor(r() * 3)) * u * 2;
  }
  font(ctx, 14 * u, 'mono');
  ctx.fillText(`SA-${(rec.id || '').slice(2, 12).toUpperCase()} · CATALOGUED BY ${(o.signature || '').toUpperCase()}`, x0, H - m - 30 * u);
  ctx.restore();
  ctx.fillStyle = p[1];
  ctx.fillRect(m, m, 10 * u, H - m * 2);
  grain(ctx, W, H, 10, 2);
}

export { FONT };
