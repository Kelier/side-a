// 品味档案：长图 & 12 秒动态片头
import { font, wrap, drawCover, drawVinyl, grain, fitFont, coverImage } from './kit.js';
import { alpha, luminance } from '../lib/color.js';

export async function preloadCovers(recs) {
  return Promise.all(recs.map((r) => coverImage(r)));
}

export function reportHeight(stats) {
  const grid = Math.min(12, stats.sorted.length);
  const rows = Math.ceil(grid / 4);
  return 1500 + rows * 270 + 1450 + 760 + Math.min(stats.evolutionLines.length, 4) * 70;
}

export function drawReport(ctx, W, stats, imgs, o) {
  const H = reportHeight(stats);
  const u = W / 1080;
  ctx.canvas.height = H * u;
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, W, H * u);
  const P = 80 * u;
  let y = 0;
  // 封面区
  const top = ctx.createLinearGradient(0, 0, 0, 900 * u);
  top.addColorStop(0, alpha(o.accent || '#ff5a1f', 0.28));
  top.addColorStop(1, 'rgba(11,11,12,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 900 * u);
  ctx.fillStyle = 'rgba(239,233,220,.55)';
  font(ctx, 18 * u, 'mono');
  ctx.fillText(`SIDE A  /  TASTE ARCHIVE  /  ${o.rangeText || o.periodLabelEn}`, P, 100 * u);
  ctx.fillStyle = '#efe9dc';
  font(ctx, 210 * u, 'serif', { italic: true });
  ctx.fillText(o.bigLabel, P - 8 * u, 330 * u);
  font(ctx, 64 * u, 'serif');
  ctx.fillText('我的音乐品味档案', P, 430 * u);
  ctx.fillStyle = 'rgba(239,233,220,.6)';
  font(ctx, 24 * u, 'sans');
  ctx.fillText(`${o.name} 的私人唱片博物馆 · ${o.periodLabel}`, P, 486 * u);
  // 唱片
  const hero = stats.sorted[stats.sorted.length - 1];
  const hi = imgs[stats.sorted.length - 1];
  if (hero) drawVinyl(ctx, W - 210 * u, 300 * u, 230 * u, { label: hero.palette?.[1] || '#ff5a1f', img: hi, angle: 0.5 });
  // 大数字
  y = 600 * u;
  const big = [[stats.count, '张唱片入藏'], [stats.memories, '条记忆'], [stats.newArtists, '位新艺术家']];
  big.forEach(([n, l], i) => {
    const x = P + i * ((W - P * 2) / 3);
    ctx.fillStyle = i === 0 ? (o.accent || '#ff5a1f') : '#efe9dc';
    font(ctx, 150 * u, 'serif');
    ctx.fillText(String(n), x, y + 130 * u);
    ctx.fillStyle = 'rgba(239,233,220,.6)';
    font(ctx, 22 * u, 'sans');
    ctx.fillText(l, x + 6 * u, y + 176 * u);
  });
  y += 260 * u;
  section(ctx, P, y, W, u, '01', `这段时间收藏的 ${Math.min(12, stats.sorted.length)} 张`);
  y += 90 * u;
  const cell = (W - P * 2 - 3 * 24 * u) / 4;
  stats.sorted.slice(-12).forEach((r, i) => {
    const idx = stats.sorted.length - Math.min(12, stats.sorted.length) + i;
    const x = P + (i % 4) * (cell + 24 * u), yy = y + Math.floor(i / 4) * (cell + 24 * u + 20 * u);
    drawCover(ctx, imgs[idx], x, yy, cell, cell, { shadow: 16 * u });
  });
  y += Math.ceil(Math.min(12, stats.sorted.length) / 4) * (cell + 44 * u) + 60 * u;

  // 时间：精确到秒
  const T = o.time;
  if (T && T.total) {
    section(ctx, P, y, W, u, '02', '时间里的你');
    y += 100 * u;
    const st = (t) => { const d = new Date(t); const z = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
    const rowsT = [
      ['第一个瞬间', T.first ? st(T.first.at) : '-', T.first?.rec?.title || ''],
      ['最近一个瞬间', T.last ? st(T.last.at) : '-', T.last?.rec?.title || ''],
      ['最晚的一次', T.latest ? st(T.latest.at).slice(11) : '-', T.latest?.rec?.title || ''],
      ['最长的空白', T.gap ? o.gapText : '-', ''],
    ];
    rowsT.forEach(([k, v, tt]) => {
      ctx.fillStyle = 'rgba(239,233,220,.5)';
      font(ctx, 22 * u, 'sans');
      ctx.fillText(k, P, y + 34 * u);
      ctx.fillStyle = '#efe9dc';
      font(ctx, 40 * u, 'mono', { weight: 600 });
      ctx.fillText(v, P + 220 * u, y + 38 * u);
      if (tt) { ctx.fillStyle = 'rgba(239,233,220,.5)'; font(ctx, 22 * u, 'serif', { italic: true }); ctx.textAlign = 'right'; ctx.fillText(tt.slice(0, 18), W - P, y + 36 * u); ctx.textAlign = 'left'; }
      y += 70 * u;
    });
    y += 30 * u;
    // 星期 × 小时热力图
    const cw = (W - P * 2 - 70 * u) / 24, chh = cw * 0.9;
    const mx = Math.max(1, ...T.heat.flat());
    const wk = ['日', '一', '二', '三', '四', '五', '六'];
    T.heat.forEach((row, d) => {
      ctx.fillStyle = 'rgba(239,233,220,.45)';
      font(ctx, 18 * u, 'sans');
      ctx.fillText(wk[d], P, y + d * (chh + 6 * u) + chh * 0.72);
      row.forEach((v, h) => {
        ctx.fillStyle = v ? alpha(o.accent || '#ff5a1f', 0.25 + 0.75 * (v / mx)) : 'rgba(239,233,220,.06)';
        ctx.fillRect(P + 70 * u + h * cw, y + d * (chh + 6 * u), cw - 4 * u, chh);
      });
    });
    y += 7 * (chh + 6 * u) + 10 * u;
    ctx.fillStyle = 'rgba(239,233,220,.45)';
    font(ctx, 16 * u, 'mono');
    [0, 6, 12, 18, 23].forEach((h) => ctx.fillText(String(h).padStart(2, '0'), P + 70 * u + h * cw, y + 20 * u));
    y += 70 * u;
  }

  section(ctx, P, y, W, u, '03', '最常出现的三种情绪');
  y += 100 * u;
  const maxM = stats.moods[0]?.n || 1;
  stats.moods.slice(0, 3).forEach((m, i) => {
    ctx.fillStyle = i === 0 ? (o.accent || '#ff5a1f') : '#efe9dc';
    font(ctx, 76 * u, 'serif', { italic: i === 0 });
    ctx.fillText(m.mood.label, P, y + 70 * u);
    ctx.fillStyle = 'rgba(239,233,220,.45)';
    font(ctx, 18 * u, 'mono');
    ctx.fillText(m.mood.en, P + 260 * u, y + 30 * u);
    ctx.fillStyle = 'rgba(239,233,220,.12)';
    ctx.fillRect(P + 260 * u, y + 46 * u, W - P * 2 - 380 * u, 14 * u);
    ctx.fillStyle = i === 0 ? (o.accent || '#ff5a1f') : '#efe9dc';
    ctx.fillRect(P + 260 * u, y + 46 * u, (W - P * 2 - 380 * u) * (m.n / maxM), 14 * u);
    font(ctx, 26 * u, 'mono');
    ctx.textAlign = 'right';
    ctx.fillText(`×${m.n}`, W - P, y + 62 * u);
    ctx.textAlign = 'left';
    y += 110 * u;
  });
  if (!stats.moods.length) { ctx.fillStyle = 'rgba(239,233,220,.5)'; font(ctx, 26 * u, 'sans'); ctx.fillText('还没有为唱片标注心情。', P, y + 30 * u); y += 80 * u; }
  y += 30 * u;

  section(ctx, P, y, W, u, '04', '你最偏爱的年代与流派');
  y += 100 * u;
  ctx.fillStyle = '#efe9dc';
  font(ctx, 150 * u, 'serif', { italic: true });
  ctx.fillText(stats.decades[0] ? `${stats.decades[0].d}s` : '—', P, y + 120 * u);
  font(ctx, 30 * u, 'sans', { weight: 600 });
  const gx = W / 2 + 40 * u;
  stats.genres.slice(0, 4).forEach((g, i) => {
    ctx.fillStyle = i === 0 ? (o.accent || '#ff5a1f') : 'rgba(239,233,220,.8)';
    ctx.fillText(`${g.g}`, gx, y + 30 * u + i * 44 * u);
  });
  y += 210 * u;

  section(ctx, P, y, W, u, '05', '反复回访的艺术家');
  y += 100 * u;
  stats.artists.slice(0, 3).forEach((a, i) => {
    ctx.fillStyle = 'rgba(239,233,220,.45)';
    font(ctx, 22 * u, 'mono');
    ctx.fillText(String(i + 1).padStart(2, '0'), P, y + 44 * u);
    ctx.fillStyle = '#efe9dc';
    const s = fitFont(ctx, a.a, W - P * 2 - 260 * u, 60 * u, 'sans', { weight: 700 }, 28 * u);
    ctx.fillText(a.a, P + 70 * u, y + 30 * u + s * 0.5);
    ctx.fillStyle = 'rgba(239,233,220,.5)';
    font(ctx, 20 * u, 'sans');
    ctx.textAlign = 'right';
    ctx.fillText(`${a.n} 张收藏`, W - P, y + 44 * u);
    ctx.textAlign = 'left';
    y += 84 * u;
  });
  y += 40 * u;

  section(ctx, P, y, W, u, '06', '从开始到现在，审美发生了什么变化');
  y += 100 * u;
  ctx.fillStyle = '#efe9dc';
  font(ctx, 42 * u, 'serif', { italic: true });
  stats.evolutionLines.slice(0, 4).forEach((l) => {
    wrap(ctx, l, W - P * 2, 2).forEach((ln) => { ctx.fillText(ln, P, y + 40 * u); y += 54 * u; });
    y += 16 * u;
  });
  y += 30 * u;
  // 色带：按时间排列的封面主色
  const bandW = (W - P * 2) / Math.max(1, stats.sorted.length);
  stats.sorted.forEach((r, i) => {
    ctx.fillStyle = r.palette?.[1] || '#333';
    ctx.fillRect(P + i * bandW, y, bandW + 1, 70 * u);
  });
  ctx.fillStyle = 'rgba(239,233,220,.45)';
  font(ctx, 16 * u, 'mono');
  ctx.fillText('COLOR OF THE PERIOD · 按收藏顺序排列的封面主色', P, y + 104 * u);
  y += 170 * u;
  // 页脚
  ctx.fillStyle = 'rgba(239,233,220,.12)';
  ctx.fillRect(P, y, W - P * 2, 1.5 * u);
  ctx.fillStyle = 'rgba(239,233,220,.5)';
  font(ctx, 17 * u, 'mono');
  wrap(ctx, '* 以上统计基于收藏记录与手动记录的循环次数，不是平台播放数据。', W - P * 2, 2).forEach((l, i) => ctx.fillText(l, P, y + 44 * u + i * 26 * u));
  ctx.fillStyle = '#efe9dc';
  font(ctx, 36 * u, 'sans', { weight: 800 });
  ctx.fillText('SIDE A', P, y + 140 * u);
  font(ctx, 20 * u, 'sans');
  ctx.fillStyle = 'rgba(239,233,220,.6)';
  ctx.fillText('收藏你喜欢的音乐，把你的品味变成看得见的作品。', P, y + 176 * u);
  // 按实际内容高度裁切，去掉底部空白
  const used = Math.min(H * u, Math.ceil(y + 240 * u));
  const keep = ctx.getImageData(0, 0, W, used);
  ctx.canvas.height = used;
  ctx.putImageData(keep, 0, 0);
  grain(ctx, W, used, 12, 4);
}

function section(ctx, P, y, W, u, n, title) {
  ctx.fillStyle = 'rgba(239,233,220,.15)';
  ctx.fillRect(P, y, W - P * 2, 1.5 * u);
  ctx.fillStyle = '#ff5a1f';
  font(ctx, 18 * u, 'mono');
  ctx.fillText(n, P, y + 46 * u);
  ctx.fillStyle = '#efe9dc';
  font(ctx, 34 * u, 'sans', { weight: 600 });
  ctx.fillText(title, P + 60 * u, y + 50 * u);
}

// ---------- 12 秒动态片头：120 BPM 的节拍网格，硬切 + 动态排版 ----------
export const INTRO_DURATION = 12;
export const INTRO_W = 1080, INTRO_H = 1920;
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const eOut = (x) => 1 - Math.pow(1 - clamp(x), 4);
const eIO = (x) => { x = clamp(x); return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2; };
const p2 = (n) => String(n).padStart(2, '0');
const stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`; };
const clock = (t) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };

let noiseTile = null;
function filmGrain(ctx, W, H, t, amt = 0.09) {
  if (!noiseTile) {
    noiseTile = document.createElement('canvas');
    noiseTile.width = noiseTile.height = 256;
    const g = noiseTile.getContext('2d');
    const id = g.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amt;
  const off = Math.floor(t * 24) * 97;
  ctx.translate(-(off % 256), -((off * 3) % 256));
  ctx.fillStyle = ctx.createPattern(noiseTile, 'repeat');
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

function coverFill(ctx, img, x, y, w, h, zoom = 1, fallback = '#222') {
  if (!img) { ctx.fillStyle = fallback; ctx.fillRect(x, y, w, h); return; }
  const s = Math.max(w, h) * zoom;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - s) / 2, y + (h - s) / 2, s, s);
  ctx.restore();
}

function condensed(ctx, size, weight = 900) {
  font(ctx, size, 'sans', { weight });
  if ('fontStretch' in ctx) ctx.fontStretch = 'extra-condensed';
}
function resetStretch(ctx) { if ('fontStretch' in ctx) ctx.fontStretch = 'normal'; }

// 每份收藏一套剪辑方案：节奏、段落顺序、每段的剪法和调色都从你的唱片里来
const ORIG = { open: [0, 1.5], covers: [1.5, 2], count: [3.5, 2], moods: [5.5, 2], clock: [7.5, 2], end: [9.5, 2.5] };
export function filmDirection(stats) {
  const ms = stats.moods.map((m) => m.mood).filter(Boolean);
  const w = stats.moods.reduce((s2, m) => s2 + m.n, 0) || 1;
  const energy = ms.length ? stats.moods.reduce((s2, m) => s2 + (m.mood?.energy || 0.5) * m.n, 0) / w : 0.5;
  const top = ms[0];
  const night = stats.moods.slice(0, 3).some((m) => ['night', 'insomnia', 'lonely'].includes(m.id));
  const bpm = Math.round(84 + energy * 72);
  const variety = stats.genres.length;
  const covers = energy < 0.42 ? 'dissolve' : variety >= 6 || stats.count >= 14 ? 'grid' : 'hard';
  const order = night ? ['clock', 'covers', 'moods', 'count'] : energy > 0.68 ? ['covers', 'moods', 'count', 'clock'] : variety >= 6 ? ['count', 'covers', 'moods', 'clock'] : ['covers', 'count', 'moods', 'clock'];
  const hue = top?.hue ?? 30;
  const grade = { color: `hsl(${hue} 70% ${night ? 30 : 50}%)`, alpha: night ? 0.16 : energy > 0.68 ? 0.1 : 0.07 };
  const NAMES = { covers: '封面', count: '数字', moods: '情绪', clock: '时钟' };
  const cutName = { dissolve: '慢溶', grid: '网格快切', hard: '硬切' }[covers];
  return {
    bpm, beat: 60 / bpm, scale: bpm / 120, energy, covers, moods: energy < 0.5 ? 'stack' : 'marquee', order, grade, flash: energy >= 0.5, night,
    label: `${bpm} BPM，${cutName}${top ? `，按「${top.label}」调色` : ''}，${order.map((x) => NAMES[x]).join(' / ')}`,
  };
}

export function drawIntroFrame(ctx, W, H, t, stats, imgs, o) {
  const dir = o.dir || (o.dir = filmDirection(stats));
  const u = W / 1080;
  const plan = [['open', 1.5], ...dir.order.map((id) => [id, 2]), ['end', 2.5]];
  let acc0 = 0, scene = plan[plan.length - 1][0], lt = t - (INTRO_DURATION - 2.5), dur = 2.5;
  for (const [id, d] of plan) { if (t < acc0 + d) { scene = id; lt = t - acc0; dur = d; break; } acc0 += d; }
  const [s0, sd] = ORIG[scene];
  const vt = s0 + Math.min(sd - 0.0001, (lt / dur) * sd);
  drawScene(ctx, W, H, vt, stats, imgs, o, dir, lt);
  ctx.save();
  // 调色
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = dir.grade.alpha * 3;
  ctx.fillStyle = dir.grade.color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.save();
  // 左上角时间码一直在走，右上角是这支片子的节奏
  if (t >= 1.5) {
    ctx.fillStyle = 'rgba(239,233,220,.7)';
    font(ctx, 20 * u, 'mono');
    ctx.fillText(`00:${p2(Math.floor(t))}:${p2(Math.floor((t % 1) * 30))}`, 40 * u, 60 * u);
    ctx.textAlign = 'right';
    ctx.fillText(`${dir.bpm} BPM  SIDE A`, W - 40 * u, 60 * u);
    ctx.textAlign = 'left';
  }
  // 段落之间：高能量用一帧色闪，安静的收藏用一次黑场
  let edge = 0;
  for (const [, d] of plan.slice(0, -1)) {
    edge += d;
    const dd = t - edge;
    if (dir.flash) { if (dd >= 0 && dd < 1 / 15) { ctx.globalAlpha = 0.85; ctx.fillStyle = o.accent || '#ff5a1f'; ctx.fillRect(0, 0, W, H); } }
    else if (Math.abs(dd) < 0.25) { ctx.globalAlpha = 1 - Math.abs(dd) / 0.25; ctx.fillStyle = '#050403'; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1;
  }
  filmGrain(ctx, W, H, t, dir.night ? 0.12 : 0.09);
  ctx.restore();
}

function drawScene(ctx, W, H, t, stats, imgs, o, dir, lt0) {
  const u = W / 1080;
  const recs = stats.sorted;
  const n = recs.length;
  const acc = o.accent || '#ff5a1f';
  const cream = '#efe9dc';
  const ink = '#0b0b0c';
  const from = o.from || (recs[0] ? new Date(recs[0].listenedAt || recs[0].addedAt).getTime() : Date.now());
  const to = o.to || Date.now();
  const T = o.time || {};
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, H);

  if (t < 1.5) {
    // 1. 时间码疾驰：从这段时间的第一秒跑到最后一秒
    const k = eIO(t / 1.4);
    const now = from + (to - from) * k;
    ctx.fillStyle = 'rgba(239,233,220,.5)';
    font(ctx, 22 * u, 'mono');
    ctx.fillText('SIDE A  /  TASTE ARCHIVE', 70 * u, 120 * u);
    ctx.textAlign = 'right';
    ctx.fillText(o.periodLabelEn || '', W - 70 * u, 120 * u);
    ctx.textAlign = 'left';
    ctx.fillStyle = cream;
    condensed(ctx, 250 * u, 800);
    ctx.fillText(stamp(now), 60 * u, H * 0.47);
    ctx.fillStyle = acc;
    ctx.fillText(clock(now), 60 * u, H * 0.47 + 250 * u);
    resetStretch(ctx);
    // 进度刻度
    for (let i = 0; i <= 60; i++) {
      const on = i / 60 <= k;
      ctx.fillStyle = on ? cream : 'rgba(239,233,220,.18)';
      ctx.fillRect(70 * u + i * ((W - 140 * u) / 60), H * 0.72, 3 * u, i % 5 ? 26 * u : 52 * u);
    }
    ctx.fillStyle = 'rgba(239,233,220,.55)';
    font(ctx, 24 * u, 'mono');
    ctx.fillText(`${stamp(from)} ${clock(from)}`, 70 * u, H * 0.72 + 100 * u);
    ctx.textAlign = 'right';
    ctx.fillText(`${stamp(to)} ${clock(to)}`, W - 70 * u, H * 0.72 + 100 * u);
    ctx.textAlign = 'left';
  } else if (t < 3.5) {
    // 2. 节拍硬切：每 1/2 拍一张封面，配上它入藏的那一秒
    const step = dir.covers === 'dissolve' ? dir.beat * 2 : dir.beat / 2;
    const elapsed = lt0 * dir.scale;
    const cut = Math.floor(elapsed / step);
    const local = (elapsed % step) / step;
    const pick = n ? recs.length - 1 - (cut % n) : 0;
    const r = recs[pick];
    const img = imgs[pick];
    const pal = r?.palette?.length ? r.palette : ['#222', acc];
    if (dir.covers === 'dissolve') {
      // 慢溶：两张封面缓慢推近、交叠，安静的收藏用这种剪法
      const nextPick = n ? recs.length - 1 - ((cut + 1) % n) : 0;
      coverFill(ctx, img, 0, 0, W, H, 1.04 + local * 0.08, pal[0]);
      if (local > 0.6) { ctx.globalAlpha = (local - 0.6) / 0.4; coverFill(ctx, imgs[nextPick], 0, 0, W, H, 1.04, recs[nextPick]?.palette?.[0]); ctx.globalAlpha = 1; }
      const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = Math.min(1, local * 3) * (local > 0.75 ? (1 - local) * 4 : 1);
      ctx.fillStyle = cream;
      font(ctx, 84 * u, 'serif', { italic: true });
      wrap(ctx, r?.title || '', W - 140 * u, 2).forEach((l, i, a) => ctx.fillText(l, 70 * u, H - 300 * u - (a.length - 1 - i) * 90 * u));
      font(ctx, 28 * u, 'mono'); ctx.fillStyle = acc;
      const at = r ? new Date(r.listenedAt || r.addedAt).getTime() : Date.now();
      ctx.fillText(`${stamp(at)}  ${clock(at)}`, 70 * u, H - 200 * u);
      ctx.globalAlpha = 1;
    } else if (dir.covers === 'grid' && cut % 2 === 1) {
      // 网格快切：一帧里同时闪过四张
      const half = W / 2;
      for (let q = 0; q < 4; q++) { const k = n ? (recs.length - 1 - ((cut * 4 + q) % n)) : 0; coverFill(ctx, imgs[k], (q % 2) * half, (q < 2 ? 0 : H / 2), half, H / 2, 1.05, recs[k]?.palette?.[0]); }
      ctx.fillStyle = acc; condensed(ctx, 200 * u); const nn = String((cut * 4) % Math.max(1, n) + 1).padStart(2, '0'); ctx.fillText(nn, 50 * u, H / 2 + 70 * u); resetStretch(ctx);
    } else if (cut % 4 === 3) {
      // 色块帧
      const field = [pal[1], pal[2], acc, cream].find((c) => c && luminance(c) > 0.42) || cream;
      ctx.fillStyle = field;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = ink;
      condensed(ctx, 330 * u);
      const words = (r?.title || 'SIDE A').toUpperCase();
      const lines = wrap(ctx, words, W - 100 * u, 3);
      lines.forEach((l, i) => ctx.fillText(l, 50 * u, 380 * u + i * 300 * u));
      resetStretch(ctx);
    } else {
      coverFill(ctx, img, 0, 0, W, H, 1.02 + local * 0.06, pal[0]);
      const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.82)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = cream;
      condensed(ctx, 120 * u, 800);
      wrap(ctx, (r?.title || '').toUpperCase(), W - 140 * u, 2).forEach((l, i, a) => ctx.fillText(l, 70 * u, H - 330 * u - (a.length - 1 - i) * 110 * u));
      resetStretch(ctx);
      font(ctx, 30 * u, 'mono', { weight: 600 });
      ctx.fillStyle = acc;
      const at = r ? new Date(r.listenedAt || r.addedAt).getTime() : Date.now();
      ctx.fillText(`${stamp(at)}  ${clock(at)}`, 70 * u, H - 200 * u);
      ctx.fillStyle = 'rgba(239,233,220,.75)';
      font(ctx, 28 * u, 'sans');
      ctx.fillText(r?.artist || '', 70 * u, H - 140 * u);
    }
    // 拍点闪白
    if (dir.flash && local < 0.12 && cut % 4 === 0) { ctx.fillStyle = `rgba(255,250,240,${0.5 * (1 - local / 0.12)})`; ctx.fillRect(0, 0, W, H); }
  } else if (t < 5.5) {
    // 3. 封面墙拼出来，巨大的数字滚上来
    const lt = t - 3.5;
    const cols = 4, cell = W / cols, rows = Math.ceil(H / cell);
    for (let i = 0; i < cols * rows; i++) {
      const delay = ((i * 7) % (cols * rows)) * 0.02;
      const p = eOut((lt - delay) / 0.35);
      if (p <= 0 || !n) continue;
      const k = i % n;
      const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
      ctx.globalAlpha = p * 0.42;
      coverFill(ctx, imgs[k], x + cell * (1 - p) / 2, y + cell * (1 - p) / 2, cell * p, cell * p, 1, recs[k]?.palette?.[0]);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(11,11,12,.45)';
    ctx.fillRect(0, 0, W, H);
    const cnt = Math.round(stats.count * eOut(lt / 1.2));
    ctx.fillStyle = acc;
    condensed(ctx, 900 * u);
    const tw = ctx.measureText(String(cnt)).width;
    ctx.fillText(String(cnt), (W - tw) / 2, H * 0.6);
    resetStretch(ctx);
    ctx.fillStyle = cream;
    font(ctx, 64 * u, 'serif', { italic: true });
    ctx.textAlign = 'center';
    ctx.fillText('张唱片，在这段时间里入藏', W / 2, H * 0.6 + 120 * u);
    ctx.globalAlpha = eOut((lt - 0.9) / 0.4);
    font(ctx, 30 * u, 'mono');
    ctx.fillStyle = 'rgba(239,233,220,.75)';
    ctx.fillText(`${stats.memories} 条记忆   ${stats.newArtists} 位新艺术家   ${T.total || 0} 个瞬间`, W / 2, H * 0.6 + 200 * u);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  } else if (t < 7.5) {
    // 4. 情绪跑马灯：每条色带速度不同、方向相反
    const lt = t - 5.5;
    const moods = stats.moods.length ? stats.moods.slice(0, 5) : [{ mood: { label: '未标注', en: 'UNTAGGED' } }];
    const pals = recs.map((r) => r.palette?.[1]).filter(Boolean);
    if (dir.moods === 'stack') {
      // 叠字：情绪词一个接一个落下来，安静、留白多
      const words = moods.map((m) => m.mood);
      const gap = 1.7 / Math.max(1, words.length);
      words.forEach((m, i) => {
        const k = eOut((lt - i * gap) / 0.6);
        if (k <= 0) return;
        ctx.globalAlpha = k;
        const y = H * 0.24 + i * H * 0.13 + (1 - k) * 40 * u;
        ctx.fillStyle = i === 0 ? acc : cream;
        font(ctx, (i === 0 ? 210 : 150) * u, 'serif', { italic: i % 2 === 1 });
        ctx.fillText(m.label, 70 * u, y);
        ctx.fillStyle = 'rgba(239,233,220,.45)';
        font(ctx, 22 * u, 'mono');
        ctx.fillText(m.en, W - 70 * u - ctx.measureText(m.en).width, y - 10 * u);
      });
      ctx.globalAlpha = 1;
    } else {
      const bands = 6, bh = H / bands;
      for (let b = 0; b < bands; b++) {
        const m = moods[b % moods.length].mood;
        const on = b % 2 === 0;
        const reveal = eOut((lt - b * 0.06) / 0.4);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, b * bh, W * reveal, bh); ctx.clip();
        ctx.fillStyle = on ? (b === 0 ? acc : pals[b % Math.max(1, pals.length)] || cream) : ink;
        ctx.fillRect(0, b * bh, W, bh);
        const txt = `${m.label}  ${m.en}  `.repeat(10);
        condensed(ctx, bh * 0.82, 900);
        const speed = (b % 2 ? -1 : 1) * (380 + b * 90) * u * (0.6 + dir.energy * 0.9);
        const tw2 = ctx.measureText(`${m.label}  ${m.en}  `).width;
        const x = ((lt * speed) % tw2) - tw2;
        if (on) { ctx.fillStyle = ink; ctx.fillText(txt, x, b * bh + bh * 0.8); }
        else { ctx.strokeStyle = cream; ctx.lineWidth = 2.5 * u; ctx.strokeText(txt, x, b * bh + bh * 0.8); }
        resetStretch(ctx);
        ctx.restore();
      }
      // 缝隙扫描：最后半拍把色带横向错开
      if (lt > 1.5) {
        const k = eIO((lt - 1.5) / 0.5);
        const snap = ctx.getImageData(0, 0, W, H);
        ctx.fillStyle = ink; ctx.fillRect(0, 0, W, H);
        for (let b = 0; b < bands * 2; b++) ctx.putImageData(snap, (b % 2 ? 1 : -1) * k * W, 0, 0, b * bh / 2, W, bh / 2);
      }
    }
  } else if (t < 9.5) {
    // 5. 24 小时表盘：每一个事件都是一道刻度
    const lt = t - 7.5;
    const cx = W / 2, cy = H * 0.42, R = W * 0.4;
    const hrs = T.hours || new Array(24).fill(0);
    const mx = Math.max(1, ...hrs);
    ctx.strokeStyle = 'rgba(239,233,220,.15)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (let h = 0; h < 24; h++) {
      const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
      const p = eOut((lt - h * 0.03) / 0.5);
      const len = (40 + (hrs[h] / mx) * R * 0.75) * p;
      const isPeak = T.peak && h === T.peak.h;
      ctx.strokeStyle = isPeak ? acc : hrs[h] ? cream : 'rgba(239,233,220,.2)';
      ctx.lineWidth = (isPeak ? 16 : 9) * u;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - len * 0.15), cy + Math.sin(a) * (R - len * 0.15));
      ctx.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
      ctx.stroke();
      if (h % 6 === 0) {
        ctx.fillStyle = 'rgba(239,233,220,.6)';
        font(ctx, 26 * u, 'mono');
        ctx.textAlign = 'center';
        ctx.fillText(p2(h), cx + Math.cos(a) * (R + 50 * u), cy + Math.sin(a) * (R + 50 * u) + 9 * u);
      }
    }
    // 指针扫过
    const sweep = eIO(lt / 1.6) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = acc; ctx.lineWidth = 4 * u;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep) * R * 1.02, cy + Math.sin(sweep) * R * 1.02); ctx.stroke();
    ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(cx, cy, 12 * u, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left';
    const late = T.latest;
    ctx.globalAlpha = eOut((lt - 0.6) / 0.5);
    ctx.fillStyle = 'rgba(239,233,220,.6)';
    font(ctx, 28 * u, 'mono');
    ctx.fillText('你最常在', 80 * u, H * 0.75);
    ctx.fillStyle = cream;
    condensed(ctx, 150 * u, 800);
    ctx.fillText(T.peak?.n ? T.peak.label : '还看不出', 80 * u, H * 0.75 + 150 * u);
    resetStretch(ctx);
    if (late) {
      ctx.fillStyle = 'rgba(239,233,220,.6)';
      font(ctx, 28 * u, 'mono');
      ctx.fillText(`最晚的一次  ${clock(late.at)}`, 80 * u, H * 0.75 + 230 * u);
      ctx.fillStyle = acc;
      font(ctx, 34 * u, 'serif', { italic: true });
      ctx.fillText(`${late.rec?.title || ''}`.slice(0, 26), 80 * u, H * 0.75 + 285 * u);
    }
    ctx.globalAlpha = 1;
  } else {
    // 6. 唱片旋入，品味人格定格
    const lt = t - 9.5;
    const top = recs[n - 1];
    const img = imgs[n - 1];
    const pal = top?.palette?.length ? top.palette : ['#222', acc];
    const bg = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, H * 0.7);
    bg.addColorStop(0, alpha(pal[1] || acc, 0.35)); bg.addColorStop(1, 'rgba(11,11,12,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const pv = eOut(lt / 0.8);
    drawVinyl(ctx, W / 2, H * 0.34, W * 0.38 * pv, { label: pal[1] || acc, img, angle: t * 3.49 });
    // 环绕的艺术家名
    const artist = (stats.artists[0]?.a || '').toUpperCase();
    if (artist) {
      ctx.save();
      ctx.translate(W / 2, H * 0.34);
      ctx.rotate(-t * 0.6);
      font(ctx, 30 * u, 'mono', { weight: 600 });
      ctx.fillStyle = 'rgba(239,233,220,.75)';
      const ring = `${artist}  ·  `.repeat(6);
      const rr = W * 0.44;
      let a = 0;
      for (const ch of ring) { const w = ctx.measureText(ch).width; ctx.save(); ctx.rotate(a); ctx.translate(0, -rr); ctx.fillText(ch, -w / 2, 0); ctx.restore(); a += (w + 2 * u) / rr; if (a > Math.PI * 2) break; }
      ctx.restore();
    }
    const pt = eOut((lt - 0.5) / 0.6);
    ctx.globalAlpha = pt;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(239,233,220,.6)';
    font(ctx, 26 * u, 'mono');
    ctx.fillText((o.persona?.en || '').toUpperCase(), W / 2, H * 0.66);
    ctx.fillStyle = cream;
    font(ctx, 130 * u, 'serif', { italic: true });
    ctx.fillText(o.persona?.title || o.bigLabel, W / 2, H * 0.66 + 140 * u + (1 - pt) * 40 * u);
    ctx.globalAlpha = eOut((lt - 1.1) / 0.5);
    ctx.fillStyle = 'rgba(239,233,220,.85)';
    font(ctx, 36 * u, 'serif', { italic: true });
    wrap(ctx, stats.evolutionLines[0] || '', W - 200 * u, 2).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.66 + 240 * u + i * 48 * u));
    ctx.fillStyle = acc;
    font(ctx, 26 * u, 'mono', { weight: 600 });
    const g = o.generatedAt || Date.now();
    ctx.fillText(`${stamp(g)}  ${clock(g)}`, W / 2, H - 150 * u);
    ctx.fillStyle = 'rgba(239,233,220,.55)';
    font(ctx, 24 * u, 'mono');
    ctx.fillText(`SIDE A  /  ${(o.name || '').toUpperCase()}${o.handle ? '  @' + o.handle : ''}`, W / 2, H - 100 * u);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
