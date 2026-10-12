// 随机艺术指导：同一份内容，按种子生成完全不同的版式。
// 用于唱片封面再创作、品味名片、入坑专辑交换卡。种子相同，结果永远相同。
import { font, wrap, fitFont, drawCover, drawVinyl, grain, setStretch } from './kit.js';
import { rng, mix, alpha, luminance } from '../lib/color.js';
import { moodById, formatById } from '../lib/constants.js';

export const FAMILIES = [
  { id: 'swiss', label: '瑞士网格' },
  { id: 'collage', label: '撕纸拼贴' },
  { id: 'polaroid', label: '拍立得' },
  { id: 'typo', label: '巨字裁切' },
  { id: 'riso', label: 'Risograph 双色' },
  { id: 'ticket', label: '演出票根' },
  { id: 'receipt', label: '热敏小票' },
  { id: 'label', label: '唱片标签' },
  { id: 'magazine', label: '杂志封面' },
  { id: 'liner', label: '黑胶内页' },
  { id: 'pricetag', label: '店员推荐卡' },
  { id: 'jcard', label: '磁带内卡' },
  { id: 'newspaper', label: '报纸乐评' },
  { id: 'exhibition', label: '展览海报' },
  { id: 'postcard', label: '明信片' },
  { id: 'wrapped', label: '年度大数字' },
];

const p2 = (n) => String(n).padStart(2, '0');
function stampOf(v) {
  const d = new Date(v || Date.now());
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

// 把不同来源的数据整理成统一的“内容包”
export function contentOf(kind, data) {
  if (kind === 'record') {
    const r = data.rec;
    const moods = (r.moods || []).map(moodById).filter(Boolean);
    return {
      kind, title: r.title, sub: r.artist, note: r.note || '', covers: [{ rec: r, img: data.img }],
      meta: [r.year ? String(r.year) : '', r.genre || '', formatById(r.format)?.en || '', ...moods.map((m) => m.en)].filter(Boolean),
      zhMeta: moods.map((m) => m.label),
      stamp: stampOf(r.listenedAt || r.addedAt), no: data.no || 1, by: data.by || '', footer: 'SIDE A / PRIVATE RECORD MUSEUM',
    };
  }
  if (kind === 'exchange') {
    return {
      kind, title: data.from ? `${data.from} 的入坑专辑` : '入坑专辑', sub: data.message || '如果你想了解我，从这几张开始。',
      note: data.message || '', covers: data.recs.map((rec, i) => ({ rec, img: data.imgs[i] })),
      meta: data.recs.map((r) => `${r.title} / ${r.artist}`), zhMeta: [], stamp: stampOf(Date.now()), no: data.recs.length, by: data.from || '',
      footer: 'GATEWAY ALBUM EXCHANGE / SIDE A',
    };
  }
  // card
  return {
    kind, title: data.profile.name, sub: data.persona.title, subEn: data.persona.en, note: data.profile.bio || '',
    covers: data.recs.map((rec, i) => ({ rec, img: data.imgs[i] })),
    meta: data.lines, zhMeta: data.moods || [], stamp: stampOf(Date.now()), no: data.count, by: '@' + (data.profile.handle || 'listener'),
    footer: `SIDE A / @${data.profile.handle || 'listener'}`,
  };
}

function paletteOf(D, r) {
  const all = D.covers.flatMap((c) => c.rec.palette || []).filter(Boolean);
  const pool = all.length ? all : ['#1a1a1a', '#ff5a1f', '#efe9dc'];
  const vivid = pool.filter((c) => { const l = luminance(c); return l > 0.18 && l < 0.85; });
  const acc = (vivid.length ? vivid : pool)[Math.floor(r() * (vivid.length || pool.length))] || '#ff5a1f';
  const schemes = [
    { bg: '#0d0c0b', ink: '#f2ede2', acc, mode: '墨底' },
    { bg: '#efe9dc', ink: '#121110', acc: luminance(acc) > 0.7 ? mix(acc, '#000', 0.4) : acc, mode: '纸底' },
    { bg: mix(pool[0], '#000', 0.25), ink: luminance(mix(pool[0], '#000', 0.25)) > 0.5 ? '#121110' : '#f2ede2', acc, mode: '专辑底色' },
    { bg: acc, ink: luminance(acc) > 0.5 ? '#121110' : '#f6f1e6', acc: luminance(acc) > 0.5 ? '#121110' : '#f6f1e6', mode: '色块' },
  ];
  return schemes[Math.floor(r() * schemes.length)];
}

// 主入口
export function generateArt(ctx, W, H, D, seed, { family = null } = {}) {
  const r = rng(seed);
  const fam = family || FAMILIES[Math.floor(r() * FAMILIES.length)].id;
  const P = paletteOf(D, r);
  const u = W / 1080;
  const notes = { family: fam, scheme: P.mode, acc: P.acc };
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  (DRAW[fam] || DRAW.swiss)(ctx, W, H, u, D, P, r, notes);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  grain(ctx, W, H, 12 + Math.floor(r() * 10), seed % 97);
  return notes;
}

export function describeArt(notes) {
  const f = FAMILIES.find((x) => x.id === notes.family)?.label || notes.family;
  return [f, notes.scheme, ...(notes.extra || [])].filter(Boolean).join('，');
}

// ---------- 小工具 ----------
function cropCover(ctx, img, x, y, w, h, r, zoom = 1, fallback = '#333') {
  if (!img) { ctx.fillStyle = fallback; ctx.fillRect(x, y, w, h); return { fx: 0.5, fy: 0.5 }; }
  const s = Math.max(w, h) * zoom;
  const fx = 0.5 + (r() - 0.5) * (zoom - 1) * 0.8, fy = 0.5 + (r() - 0.5) * (zoom - 1) * 0.8;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - s) * fx, y + (h - s) * fy, s, s);
  ctx.restore();
  return { fx, fy };
}
function line(ctx, x1, y1, x2, y2, c, w) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function mono(ctx, size, c) { font(ctx, size, 'mono'); ctx.fillStyle = c; }
function condensed(ctx, size, weight = 900) { font(ctx, size, 'sans', { weight }); setStretch(ctx, 62); }
function fitLines(ctx, text, maxW, maxH, family, opts, start, min, maxLines) {
  let size = start;
  for (; size > min; size *= 0.92) {
    font(ctx, size, family, opts);
    if (opts.stretch62) setStretch(ctx, 62);
    const ls = wrap(ctx, text, maxW, 99);
    if (ls.length <= maxLines && ls.length * size * 0.98 <= maxH) return { size, lines: ls };
  }
  font(ctx, min, family, opts);
  if (opts.stretch62) setStretch(ctx, 62);
  return { size: min, lines: wrap(ctx, text, maxW, maxLines) };
}

// ---------- 版式族 ----------
const DRAW = {
  swiss(ctx, W, H, u, D, P, r, notes) {
    const M = 64 * u, cols = 6, cw = (W - M * 2) / cols;
    const sub = alpha(P.ink, 0.5);
    for (let i = 0; i <= cols; i++) line(ctx, M + i * cw, M, M + i * cw, H - M, alpha(P.ink, 0.1), 1 * u);
    const span = 3 + Math.floor(r() * 3);
    const left = r() > 0.5;
    const cs = cw * span;
    const covers = D.covers;
    // 主图
    const cx = left ? M : W - M - cs;
    if (covers.length === 1) cropCover(ctx, covers[0].img, cx, M, cs, cs, r, 1 + r() * 0.5);
    else {
      const n = Math.min(covers.length, 4), g = 8 * u, s2 = (cs - g) / 2;
      for (let i = 0; i < n; i++) cropCover(ctx, covers[i].img, cx + (i % 2) * (s2 + g), M + Math.floor(i / 2) * (s2 + g), s2, s2, r, 1);
    }
    // 大标题
    const tx = M, tw = W - M * 2;
    ctx.fillStyle = P.ink;
    const T = fitLines(ctx, D.title.toUpperCase(), tw, H * 0.26, 'sans', { weight: 900, stretch62: true }, 260 * u, 60 * u, 3);
    let y = M + cs + 40 * u + T.size * 0.82;
    T.lines.forEach((l) => { ctx.fillText(l, tx, y); y += T.size * 0.9; });
    setStretch(ctx, 100);
    // 副标题与信息栏
    ctx.fillStyle = P.acc;
    font(ctx, 40 * u, 'sans', { weight: 700 });
    ctx.fillText(D.sub.slice(0, 28), tx, y + 20 * u);
    y += 80 * u;
    mono(ctx, 18 * u, sub);
    D.meta.slice(0, 6).forEach((m, i) => ctx.fillText(m.toUpperCase().slice(0, 34), M + (i % 3) * cw * 2, y + Math.floor(i / 3) * 30 * u));
    // 编号
    ctx.fillStyle = P.ink;
    condensed(ctx, 150 * u, 900);
    const no = p2(D.no);
    const nw = ctx.measureText(no).width;
    ctx.fillText(no, left ? W - M - nw : M, M + 130 * u);
    setStretch(ctx, 100);
    if (D.note) {
      ctx.fillStyle = P.ink;
      font(ctx, 34 * u, 'serif', { italic: true });
      wrap(ctx, `“${D.note}”`, cw * 4, 3).forEach((l, i, a) => ctx.fillText(l, M, H - M - 60 * u - (a.length - 1 - i) * 42 * u));
    }
    mono(ctx, 16 * u, sub);
    ctx.fillText(D.stamp, M, H - M);
    ctx.textAlign = 'right';
    ctx.fillText(D.footer, W - M, H - M);
    notes.extra = [`${span} 栏封面`, left ? '封面靠左' : '封面靠右'];
  },

  collage(ctx, W, H, u, D, P, r, notes) {
    // 纸张底纹
    for (let i = 0; i < 1600; i++) { ctx.fillStyle = alpha(P.ink, r() * 0.04); ctx.fillRect(r() * W, r() * H, 2, 2); }
    const pieces = 5 + Math.floor(r() * 4);
    for (let i = 0; i < pieces; i++) {
      const c = D.covers[i % D.covers.length];
      const w = (260 + r() * 360) * u, h = w * (0.6 + r() * 0.6);
      const x = r() * (W - w * 0.8) - w * 0.1, y = 120 * u + r() * (H * 0.62 - h);
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((r() - 0.5) * 0.5);
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 8 * u;
      // 撕边
      ctx.beginPath();
      const steps = 22;
      for (let k = 0; k <= steps; k++) ctx.lineTo(-w / 2 + (w * k) / steps, -h / 2 + (r() - 0.5) * 10 * u);
      for (let k = 0; k <= steps; k++) ctx.lineTo(w / 2 + (r() - 0.5) * 10 * u, -h / 2 + (h * k) / steps);
      for (let k = steps; k >= 0; k--) ctx.lineTo(-w / 2 + (w * k) / steps, h / 2 + (r() - 0.5) * 10 * u);
      for (let k = steps; k >= 0; k--) ctx.lineTo(-w / 2 + (r() - 0.5) * 10 * u, -h / 2 + (h * k) / steps);
      ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.clip();
      if (r() > 0.3 && c.img) { const s = Math.max(w, h) * (1.2 + r()); ctx.drawImage(c.img, -s * (0.3 + r() * 0.4), -s * (0.3 + r() * 0.4), s, s); }
      else { ctx.fillStyle = (c.rec.palette || [])[Math.floor(r() * 3)] || P.acc; ctx.fillRect(-w / 2, -h / 2, w, h); }
      ctx.restore();
      // 胶带
      if (r() > 0.4) {
        ctx.save();
        ctx.translate(x + w * (0.2 + r() * 0.6), y + (r() > 0.5 ? 0 : h));
        ctx.rotate((r() - 0.5) * 0.9);
        ctx.fillStyle = 'rgba(240,226,180,.72)';
        ctx.fillRect(-60 * u, -18 * u, 120 * u, 36 * u);
        ctx.restore();
      }
    }
    // 剪报字
    const words = [D.title, D.sub, ...(D.zhMeta || [])].filter(Boolean).slice(0, 4);
    let y = H * 0.74;
    words.forEach((w, i) => {
      const size = (i === 0 ? 92 : 40) * u;
      font(ctx, size, i % 2 ? 'serif' : 'sans', { weight: i === 0 ? 900 : 400, italic: i % 2 === 1 });
      const text = w.slice(0, i === 0 ? 14 : 22);
      const tw = Math.min(ctx.measureText(text).width, W - 160 * u);
      const x = 70 * u + r() * Math.max(0, W - 140 * u - tw);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((r() - 0.5) * 0.08);
      ctx.fillStyle = i === 0 ? P.ink : r() > 0.5 ? '#f6f1e6' : P.acc;
      ctx.fillRect(-12 * u, -size * 0.9, tw + 24 * u, size * 1.18);
      ctx.fillStyle = i === 0 ? P.bg : luminance(ctx.fillStyle) > 0.5 ? '#121110' : '#f6f1e6';
      ctx.fillText(text, 0, 0, W - 160 * u);
      ctx.restore();
      y += size * 1.45;
    });
    if (D.note && y < H - 140 * u) { ctx.fillStyle = P.ink; font(ctx, 32 * u, 'serif', { italic: true }); wrap(ctx, D.note, W - 160 * u, 2).forEach((l, i) => ctx.fillText(l, 80 * u, y + 10 * u + i * 40 * u)); }
    mono(ctx, 16 * u, alpha(P.ink, 0.6));
    ctx.fillText(D.stamp, 70 * u, H - 50 * u);
    ctx.textAlign = 'right'; ctx.fillText(D.footer, W - 70 * u, H - 50 * u);
    notes.extra = [`${pieces} 片撕纸`];
  },

  polaroid(ctx, W, H, u, D, P, r, notes) {
    const n = Math.min(D.covers.length, 3);
    const pw = (n === 1 ? 700 : 520) * u, ph = pw * 1.2;
    for (let i = n - 1; i >= 0; i--) {
      const c = D.covers[i];
      const cx = W / 2 + (i - (n - 1) / 2) * 170 * u + (r() - 0.5) * 40 * u;
      const cy = H * 0.4 + (r() - 0.5) * 60 * u + i * 20 * u;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((r() - 0.5) * 0.24 + (i - (n - 1) / 2) * 0.08);
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 40 * u; ctx.shadowOffsetY = 20 * u;
      ctx.fillStyle = '#f7f4ec';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.shadowColor = 'transparent';
      const m = 34 * u;
      cropCover(ctx, c.img, -pw / 2 + m, -ph / 2 + m, pw - m * 2, pw - m * 2, r, 1);
      // 轻微褪色
      ctx.fillStyle = 'rgba(255,236,200,.08)';
      ctx.fillRect(-pw / 2 + m, -ph / 2 + m, pw - m * 2, pw - m * 2);
      if (i === 0) {
        ctx.fillStyle = '#1b1a18';
        font(ctx, 38 * u, 'serif', { italic: true });
        ctx.fillText((D.kind === 'record' ? D.note || D.title : D.title).slice(0, 20), -pw / 2 + m, ph / 2 - 70 * u, pw - m * 2);
        mono(ctx, 16 * u, 'rgba(27,26,24,.55)');
        ctx.fillText(D.stamp, -pw / 2 + m, ph / 2 - 30 * u);
      }
      ctx.restore();
    }
    ctx.fillStyle = P.ink;
    const T = fitLines(ctx, D.kind === 'record' ? D.title : D.sub, W - 160 * u, 220 * u, 'serif', {}, 110 * u, 44 * u, 2);
    T.lines.forEach((l, i) => ctx.fillText(l, 80 * u, H - 230 * u + i * T.size * 1.02 - (T.lines.length - 1) * T.size));
    ctx.fillStyle = P.acc;
    font(ctx, 30 * u, 'sans', { weight: 700 });
    ctx.fillText((D.kind === 'record' ? D.sub : D.by).slice(0, 30), 80 * u, H - 150 * u);
    mono(ctx, 16 * u, alpha(P.ink, 0.55));
    ctx.fillText(D.footer, 80 * u, H - 70 * u);
    notes.extra = [`${n} 张相纸`];
  },

  typo(ctx, W, H, u, D, P, r, notes) {
    const word = D.title.toUpperCase();
    ctx.fillStyle = P.acc;
    condensed(ctx, 100 * u);
    const base = ctx.measureText(word).width || 1;
    const size = Math.min(1400 * u, (W * (1.15 + r() * 0.5)) / base * 100 * u);
    condensed(ctx, size);
    const x = -size * 0.05 - r() * W * 0.15;
    const y = H * (0.42 + r() * 0.2);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(r() > 0.6 ? -Math.PI / 2 : 0); ctx.translate(-W / 2, -H / 2);
    ctx.fillText(word, x, y);
    ctx.restore();
    setStretch(ctx, 100);
    // 小封面
    const s = 300 * u;
    const corner = Math.floor(r() * 2);
    const cx = corner ? W - 80 * u - s : 80 * u, cy = H - 300 * u - s;
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 30 * u;
    cropCover(ctx, D.covers[0].img, cx, cy, s, s, r, 1);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = P.ink;
    font(ctx, 44 * u, 'sans', { weight: 800 });
    ctx.textAlign = corner ? 'right' : 'left';
    const tx = corner ? W - 80 * u : 80 * u;
    ctx.fillText(D.title.slice(0, 24), tx, H - 200 * u, W - 160 * u);
    font(ctx, 30 * u, 'serif', { italic: true });
    ctx.fillText(D.sub.slice(0, 32), tx, H - 150 * u, W - 160 * u);
    mono(ctx, 16 * u, alpha(P.ink, 0.6));
    ctx.fillText(D.stamp, tx, H - 80 * u);
    ctx.textAlign = 'left';
    mono(ctx, 16 * u, alpha(P.ink, 0.6));
    ctx.fillText(D.footer, 80 * u, 80 * u);
    notes.extra = ['标题裁出画面', `字号 ${Math.round(size / u)}`];
  },

  riso(ctx, W, H, u, D, P, r, notes) {
    const c1 = P.acc, c2 = mix(P.acc, '#1a4fd6', 0.7);
    const paper = '#efe9dc';
    ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
    const img = D.covers[0].img;
    const S = Math.round(W / 5);
    const off = document.createElement('canvas');
    off.width = S; off.height = S;
    const g = off.getContext('2d');
    if (img) { g.filter = 'grayscale(1) contrast(1.5)'; g.drawImage(img, 0, 0, S, S); }
    const data = img ? g.getImageData(0, 0, S, S).data : null;
    const area = W - 160 * u, x0 = 80 * u, y0 = 140 * u, cell = area / S;
    const dot = (ink, dx, dy, inv) => {
      ctx.fillStyle = ink;
      ctx.globalCompositeOperation = 'multiply';
      for (let yy = 0; yy < S; yy += 1) for (let xx = 0; xx < S; xx += 1) {
        const v = data ? data[(yy * S + xx) * 4] / 255 : r();
        const k = inv ? v : 1 - v;
        if (k < 0.08) continue;
        ctx.beginPath();
        ctx.arc(x0 + xx * cell + dx, y0 + yy * cell + dy, (cell / 2) * Math.sqrt(k) * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    dot(alpha(c1, 0.9), 0, 0, false);
    dot(alpha(c2, 0.55), (4 + r() * 8) * u, (3 + r() * 6) * u, true);
    // 叠印文字
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = c2;
    const T = fitLines(ctx, D.title.toUpperCase(), W - 160 * u, 300 * u, 'sans', { weight: 900, stretch62: true }, 220 * u, 60 * u, 2);
    let y = y0 + area + 40 * u + T.size * 0.8;
    T.lines.forEach((l) => { ctx.fillText(l, 80 * u, y); ctx.fillStyle = c1; ctx.fillText(l, 80 * u + 5 * u, y + 4 * u); ctx.fillStyle = c2; y += T.size * 0.88; });
    setStretch(ctx, 100);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#16140f';
    font(ctx, 34 * u, 'serif', { italic: true });
    ctx.fillText(D.sub.slice(0, 30), 80 * u, Math.min(H - 120 * u, y + 20 * u));
    mono(ctx, 16 * u, 'rgba(22,20,15,.6)');
    ctx.fillText(`RISO 2-COLOR  ${D.stamp}`, 80 * u, 90 * u);
    ctx.textAlign = 'right'; ctx.fillText(D.footer, W - 80 * u, H - 60 * u);
    notes.scheme = '纸底';
    notes.extra = ['双色网点', '错版叠印'];
  },

  ticket(ctx, W, H, u, D, P, r, notes) {
    const M = 70 * u;
    const tw = W - M * 2, th = H - M * 2;
    const stub = th * (0.22 + r() * 0.06);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate((r() - 0.5) * 0.06); ctx.translate(-W / 2, -H / 2);
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40 * u; ctx.shadowOffsetY = 16 * u;
    const paper = P.bg === '#efe9dc' ? '#fbf8f1' : '#efe9dc';
    ctx.fillStyle = paper;
    ctx.fillRect(M, M, tw, th);
    ctx.shadowColor = 'transparent';
    // 主图
    const ih = th - stub - 300 * u;
    cropCover(ctx, D.covers[0].img, M + 40 * u, M + 40 * u, tw - 80 * u, ih, r, 1.1 + r() * 0.4);
    // 齿孔
    const py = M + th - stub;
    for (let x = M + 20 * u; x < M + tw - 10 * u; x += 26 * u) { ctx.fillStyle = P.bg; ctx.beginPath(); ctx.arc(x, py, 7 * u, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = P.bg;
    ctx.beginPath(); ctx.arc(M, py, 26 * u, 0, Math.PI * 2); ctx.arc(M + tw, py, 26 * u, 0, Math.PI * 2); ctx.fill();
    // 演出信息
    const ink = '#16140f';
    ctx.fillStyle = ink;
    const T = fitLines(ctx, D.title, tw - 80 * u, 170 * u, 'sans', { weight: 900, stretch62: true }, 120 * u, 44 * u, 2);
    let y = M + 40 * u + ih + 30 * u + T.size * 0.8;
    T.lines.forEach((l) => { ctx.fillText(l, M + 40 * u, y); y += T.size * 0.9; });
    setStretch(ctx, 100);
    ctx.fillStyle = P.acc === '#f6f1e6' ? '#ff5a1f' : P.acc;
    font(ctx, 32 * u, 'serif', { italic: true });
    ctx.fillText(D.sub.slice(0, 30), M + 40 * u, y + 10 * u);
    // 票根
    mono(ctx, 18 * u, 'rgba(22,20,15,.6)');
    const cells = [['ADMIT', 'ONE'], ['NO.', p2(D.no)], ['DATE', D.stamp.slice(0, 10)], ['TIME', D.stamp.slice(11)]];
    cells.forEach(([k, v], i) => {
      const x = M + 40 * u + i * ((tw - 80 * u) / 4);
      mono(ctx, 15 * u, 'rgba(22,20,15,.5)'); ctx.fillText(k, x, py + 60 * u);
      font(ctx, 30 * u, 'mono', { weight: 600 }); ctx.fillStyle = ink; ctx.fillText(v, x, py + 100 * u);
    });
    // 条形码
    let bx = M + 40 * u;
    while (bx < M + tw - 40 * u) { const bw = (1 + Math.floor(r() * 4)) * 2 * u; ctx.fillStyle = ink; ctx.fillRect(bx, py + 140 * u, bw, stub - 190 * u); bx += bw + (1 + Math.floor(r() * 3)) * 2 * u; }
    ctx.restore();
    notes.extra = ['齿孔票根', '条形码'];
  },

  receipt(ctx, W, H, u, D, P, r, notes) {
    const rw = 640 * u, x0 = (W - rw) / 2 + (r() - 0.5) * 60 * u;
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate((r() - 0.5) * 0.08); ctx.translate(-W / 2, -H / 2);
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30 * u;
    ctx.fillStyle = '#f7f5ef';
    ctx.beginPath();
    const top = 60 * u, bot = H - 60 * u;
    ctx.moveTo(x0, top);
    for (let x = x0; x <= x0 + rw; x += 16 * u) ctx.lineTo(x, top + ((x - x0) / (16 * u)) % 2 * 10 * u);
    ctx.lineTo(x0 + rw, bot);
    for (let x = x0 + rw; x >= x0; x -= 16 * u) ctx.lineTo(x, bot - ((x - x0) / (16 * u)) % 2 * 10 * u);
    ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent';
    const ink = '#1b1a18';
    let y = top + 90 * u;
    ctx.textAlign = 'center';
    font(ctx, 46 * u, 'sans', { weight: 900 }); ctx.fillStyle = ink; ctx.fillText('SIDE A RECORDS', W / 2, y);
    y += 40 * u; mono(ctx, 18 * u, ink); ctx.fillText(D.stamp, W / 2, y);
    y += 30 * u; ctx.fillText('- - - - - - - - - - - - - - - - - - - -', W / 2, y);
    ctx.textAlign = 'left';
    y += 50 * u;
    const thumbs = Math.min(D.covers.length, 5);
    const ts = (rw - 80 * u - (thumbs - 1) * 10 * u) / Math.max(thumbs, 3);
    for (let i = 0; i < thumbs; i++) {
      ctx.filter = 'grayscale(1) contrast(1.3)';
      cropCover(ctx, D.covers[i].img, x0 + 40 * u + i * (ts + 10 * u), y, ts, ts, r, 1);
      ctx.filter = 'none';
    }
    y += ts + 50 * u;
    // 每张唱片一行标题、一行艺术家（缩进、浅色），不再重复列出
    const items = D.kind === 'record'
      ? [[D.title, '1', 1], [D.sub, '', 0], ...D.meta.slice(0, 5).map((m) => [m, '', 0])]
      : D.covers.slice(0, 5).flatMap((c, i) => [[c.rec.title, p2(i + 1), 1], ['  ' + c.rec.artist, '', 0]]).concat(D.kind === 'card' ? D.meta.slice(0, 2).map((m) => [m, '', 0]) : []);
    items.slice(0, 12).forEach(([k, v, strong]) => {
      font(ctx, (strong ? 26 : 21) * u, 'mono', { weight: strong ? 600 : 400 }); ctx.fillStyle = strong ? ink : 'rgba(27,26,24,.6)';
      ctx.fillText(String(k).slice(0, 28), x0 + 40 * u, y);
      ctx.textAlign = 'right'; ctx.fillText(v, x0 + rw - 40 * u, y); ctx.textAlign = 'left';
      y += (strong ? 34 : 42) * u;
    });
    y += 10 * u; mono(ctx, 18 * u, ink); ctx.fillText('- - - - - - - - - - - - - - - - - - - -', x0 + 40 * u, y);
    y += 50 * u;
    font(ctx, 30 * u, 'mono', { weight: 600 }); ctx.fillText('TOTAL', x0 + 40 * u, y);
    ctx.textAlign = 'right'; ctx.fillText(D.kind === 'record' ? '1 RECORD' : `${D.covers.length} RECORDS`, x0 + rw - 40 * u, y); ctx.textAlign = 'left';
    if (D.note) {
      y += 70 * u;
      font(ctx, 30 * u, 'serif', { italic: true }); ctx.fillStyle = ink;
      wrap(ctx, D.note, rw - 80 * u, 3).forEach((l, i) => ctx.fillText(l, x0 + 40 * u, y + i * 40 * u));
    }
    let bx = x0 + 40 * u;
    while (bx < x0 + rw - 40 * u) { const bw = (1 + Math.floor(r() * 3)) * 2 * u; ctx.fillStyle = ink; ctx.fillRect(bx, bot - 170 * u, bw, 80 * u); bx += bw + (1 + Math.floor(r() * 3)) * 2 * u; }
    mono(ctx, 16 * u, ink); ctx.textAlign = 'center'; ctx.fillText('THANK YOU FOR LISTENING', W / 2, bot - 60 * u);
    ctx.restore();
    notes.extra = ['热敏纸', '灰度缩略图'];
  },

  label(ctx, W, H, u, D, P, r, notes) {
    const R = Math.min(W, H) * 0.44;
    const cx = W / 2, cy = H * 0.42;
    drawVinyl(ctx, cx, cy, R, { label: P.acc, img: D.covers[0].img, angle: r() * 6, sheen: true });
    // 标签上的环形文字
    ctx.save();
    ctx.translate(cx, cy);
    const ring = `${D.title.toUpperCase()}  ·  ${D.sub.toUpperCase()}  ·  ${D.stamp}  ·  `;
    font(ctx, 22 * u, 'mono', { weight: 600 });
    ctx.fillStyle = '#f2ede2';
    let a = -Math.PI / 2;
    const rr = R * 0.4;
    for (const ch of ring.repeat(3)) { const w = ctx.measureText(ch).width; if (a > Math.PI * 1.5) break; ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.translate(0, -rr); ctx.fillText(ch, -w / 2, 0); ctx.restore(); a += (w + 1 * u) / rr; }
    ctx.restore();
    ctx.fillStyle = P.ink;
    const T = fitLines(ctx, D.title, W - 160 * u, 200 * u, 'serif', { italic: true }, 120 * u, 44 * u, 2);
    let y = cy + R + 80 * u + T.size * 0.7;
    ctx.textAlign = 'center';
    T.lines.forEach((l) => { ctx.fillText(l, W / 2, y); y += T.size; });
    ctx.fillStyle = P.acc === P.bg ? P.ink : P.acc;
    font(ctx, 30 * u, 'sans', { weight: 700 });
    ctx.fillText(D.sub.slice(0, 30), W / 2, y + 10 * u);
    mono(ctx, 16 * u, alpha(P.ink, 0.55));
    ctx.fillText(D.footer, W / 2, H - 60 * u);
    ctx.textAlign = 'left';
    notes.extra = ['33⅓ 标签', '环形排字'];
  },

  magazine(ctx, W, H, u, D, P, r, notes) {
    cropCover(ctx, D.covers[0].img, 0, 0, W, H, r, 1.05 + r() * 0.3);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(0.65, 'rgba(0,0,0,.1)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 刊头
    const mast = 'SIDE A';
    ctx.fillStyle = r() > 0.5 ? '#f6f1e6' : P.acc;
    condensed(ctx, 100 * u);
    const mw = ctx.measureText(mast).width;
    condensed(ctx, (W - 100 * u) / mw * 100 * u);
    ctx.fillText(mast, 50 * u, 250 * u);
    setStretch(ctx, 100);
    mono(ctx, 18 * u, 'rgba(246,241,230,.85)');
    ctx.fillText(`ISSUE ${p2(D.no)}  /  ${D.stamp}`, 56 * u, 300 * u);
    // 封面要目
    ctx.fillStyle = '#f6f1e6';
    font(ctx, 30 * u, 'sans', { weight: 800 });
    const lines = [D.sub, ...D.meta.slice(0, 3)].filter(Boolean);
    lines.forEach((l, i) => { ctx.fillText(l.toUpperCase().slice(0, 30), 56 * u, H * 0.48 + i * 46 * u); });
    // 主标题
    const T = fitLines(ctx, D.title, W - 112 * u, 260 * u, 'serif', {}, 150 * u, 54 * u, 2);
    let y = H - 150 * u - (T.lines.length - 1) * T.size;
    T.lines.forEach((l) => { ctx.fillText(l, 56 * u, y); y += T.size; });
    if (D.note) { font(ctx, 28 * u, 'serif', { italic: true }); ctx.fillStyle = 'rgba(246,241,230,.85)'; ctx.fillText(`“${D.note}”`.slice(0, 34), 56 * u, H - 80 * u, W - 112 * u); }
    notes.scheme = '整版封面';
    notes.extra = ['刊头满版', '封面要目'];
  },

  // 黑胶内页：奶白纸袋，中间挖一个圆孔露出唱片标签，两栏曲目式的信息
  liner(ctx, W, H, u, D, P, r, notes) {
    ctx.fillStyle = '#1a1714'; ctx.fillRect(0, 0, W, H);
    const M = 60 * u, sw = W - M * 2, sh = Math.min(H - M * 2, sw * 1.08);
    const sx = M, sy = (H - sh) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40 * u; ctx.shadowOffsetY = 18 * u;
    ctx.fillStyle = '#efe8d8'; ctx.fillRect(sx, sy, sw, sh);
    ctx.restore();
    for (let i = 0; i < 1800; i++) { ctx.fillStyle = `rgba(120,95,60,${r() * 0.05})`; ctx.fillRect(sx + r() * sw, sy + r() * sh, 2 * u, 2 * u); }
    // 圆孔与唱片
    const cx = sx + sw / 2, cy = sy + sh * 0.36, R = sw * 0.17;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    drawVinyl(ctx, cx, cy, R * 2.6, { label: P.acc, img: D.covers[0].img, angle: r() * 6, sheen: false });
    ctx.restore();
    ctx.strokeStyle = 'rgba(80,60,30,.35)'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const ink = '#1f1b16';
    ctx.textAlign = 'center'; ctx.fillStyle = ink;
    const T = fitLines(ctx, D.title, sw - 140 * u, 130 * u, 'serif', { italic: true }, 76 * u, 34 * u, 2);
    let y = cy + R + 70 * u;
    T.lines.forEach((l) => { ctx.fillText(l, cx, y); y += T.size * 1.05; });
    mono(ctx, 17 * u, 'rgba(31,27,22,.6)'); ctx.fillText(`${D.sub}`.toUpperCase().slice(0, 40), cx, y + 6 * u);
    ctx.textAlign = 'left';
    // 两栏
    const items = D.kind === 'record'
      ? [D.sub, ...D.meta, ...(D.zhMeta || [])].filter(Boolean)
      : D.covers.map((c) => `${c.rec.title}  /  ${c.rec.artist}`);
    const colW = (sw - 140 * u) / 2;
    const half = Math.ceil(items.length / 2);
    y += 60 * u;
    [['SIDE A', items.slice(0, half)], ['SIDE B', items.slice(half)]].forEach(([h, list], ci) => {
      const x = sx + 70 * u + ci * (colW + 0 * u);
      mono(ctx, 16 * u, P.acc === '#efe9dc' ? ink : P.acc); ctx.fillText(h, x, y);
      font(ctx, 22 * u, 'sans'); ctx.fillStyle = ink;
      list.slice(0, 5).forEach((t, i) => { ctx.fillText(`${ci ? 'B' : 'A'}${i + 1}  ${String(t).slice(0, 22)}`, x, y + 38 * u + i * 34 * u); });
    });
    if (D.note) { font(ctx, 26 * u, 'serif', { italic: true }); ctx.fillStyle = 'rgba(31,27,22,.75)'; ctx.textAlign = 'center'; ctx.fillText(`“${D.note}”`.slice(0, 36), cx, sy + sh - 70 * u); ctx.textAlign = 'left'; }
    mono(ctx, 14 * u, 'rgba(31,27,22,.5)'); ctx.fillText(D.footer, sx + 30 * u, sy + sh - 26 * u);
    ctx.textAlign = 'right'; ctx.fillText(D.stamp, sx + sw - 30 * u, sy + sh - 26 * u); ctx.textAlign = 'left';
    notes.scheme = '纸袋';
    notes.extra = ['圆孔露出标签', '两面曲目'];
  },

  // 店员推荐卡：封面斜插在唱片箱里，前面夹一张手写推荐卡和荧光价签
  pricetag(ctx, W, H, u, D, P, r, notes) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1f17'); bg.addColorStop(1, '#120d0a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 后面几张唱片的脊
    for (let i = 0; i < 26; i++) { ctx.fillStyle = `hsl(${r() * 360},${20 + r() * 25}%,${18 + r() * 18}%)`; ctx.fillRect(i * (W / 26), H * 0.08, W / 26 - 3 * u, H * 0.35); }
    const cs = W * 0.74;
    ctx.save();
    ctx.translate(W / 2, H * 0.4); ctx.rotate(-0.04 + r() * 0.03);
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 50 * u; ctx.shadowOffsetY = 20 * u;
    cropCover(ctx, D.covers[0].img, -cs / 2, -cs / 2, cs, cs, r, 1);
    ctx.shadowColor = 'transparent';
    // 塑封反光
    const gl = ctx.createLinearGradient(-cs / 2, -cs / 2, cs / 2, cs / 2);
    gl.addColorStop(0.3, 'rgba(255,255,255,0)'); gl.addColorStop(0.45, 'rgba(255,255,255,.14)'); gl.addColorStop(0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(-cs / 2, -cs / 2, cs, cs);
    // 荧光价签
    ctx.translate(cs * 0.34, -cs * 0.36); ctx.rotate(0.18);
    ctx.fillStyle = ['#ffe14d', '#ff7a3c', '#9dff7a'][Math.floor(r() * 3)];
    ctx.beginPath(); ctx.arc(0, 0, 78 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1712'; ctx.textAlign = 'center';
    font(ctx, 22 * u, 'sans', { weight: 800 }); ctx.fillText('NO.', 0, -14 * u);
    font(ctx, 56 * u, 'sans', { weight: 900 }); ctx.fillText(p2(D.no), 0, 38 * u);
    ctx.restore();
    // 推荐卡
    const cw = W * 0.78, ch = H * 0.36, cx = (W - cw) / 2 + (r() - 0.5) * 30 * u, cy = H * 0.6;
    ctx.save();
    ctx.translate(cx + cw / 2, cy + ch / 2); ctx.rotate(0.02 - r() * 0.04);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30 * u; ctx.shadowOffsetY = 12 * u;
    ctx.fillStyle = '#f7f1e3'; ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#c83c22'; ctx.fillRect(-cw / 2, -ch / 2, cw, 64 * u);
    ctx.fillStyle = '#fff'; font(ctx, 30 * u, 'sans', { weight: 900 }); ctx.textAlign = 'left';
    ctx.fillText('店员推荐  STAFF PICK', -cw / 2 + 30 * u, -ch / 2 + 44 * u);
    ctx.fillStyle = '#1b1712';
    const T = fitLines(ctx, D.title, cw - 60 * u, 120 * u, 'sans', { weight: 800 }, 64 * u, 30 * u, 2);
    let y = -ch / 2 + 64 * u + 30 * u + T.size;
    T.lines.forEach((l) => { ctx.fillText(l, -cw / 2 + 30 * u, y); y += T.size * 1.05; });
    font(ctx, 26 * u, 'sans', { weight: 600 }); ctx.fillStyle = '#6a5a48';
    ctx.fillText(D.sub.slice(0, 30), -cw / 2 + 30 * u, y + 4 * u);
    font(ctx, 34 * u, 'serif', { italic: true }); ctx.fillStyle = '#1f3fae';
    wrap(ctx, D.note ? `“${D.note}”` : '如果你喜欢这张，我们大概能聊很久。', cw - 60 * u, 2).forEach((l, i) => ctx.fillText(l, -cw / 2 + 30 * u, y + 64 * u + i * 44 * u));
    mono(ctx, 15 * u, '#6a5a48'); ctx.textAlign = 'right'; ctx.fillText(`${D.by || 'SIDE A'}  ${D.stamp.slice(0, 10)}`, cw / 2 - 26 * u, ch / 2 - 22 * u);
    ctx.restore();
    notes.scheme = '唱片店';
    notes.extra = ['手写推荐卡', '荧光价签'];
  },

  // 磁带内卡：J-card 三折页展开，脊上竖排标题，内页是曲目
  jcard(ctx, W, H, u, D, P, r, notes) {
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    const cw = W * 0.82, x0 = (W - cw) / 2;
    const front = cw * 0.62, spine = cw * 0.12, flap = cw - front - spine;
    const ch = Math.min(H * 0.62, front * 1.56);
    const y0 = (H - ch) / 2 - 30 * u;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40 * u; ctx.shadowOffsetY = 18 * u;
    ctx.fillStyle = '#f3ede0'; ctx.fillRect(x0, y0, cw, ch);
    ctx.restore();
    // 内页（左）
    const ink = '#1b1712';
    let fx = x0;
    ctx.fillStyle = '#e8e0cf'; ctx.fillRect(fx, y0, flap, ch);
    mono(ctx, 14 * u, 'rgba(27,23,18,.55)');
    ctx.fillText('SIDE A', fx + 18 * u, y0 + 36 * u);
    const items = D.kind === 'record' ? [D.title, D.sub, ...D.meta] : D.covers.map((c) => c.rec.title);
    font(ctx, 18 * u, 'sans'); ctx.fillStyle = ink;
    items.slice(0, 10).forEach((t, i) => ctx.fillText(`${p2(i + 1)} ${String(t).slice(0, 9)}`, fx + 18 * u, y0 + 74 * u + i * 30 * u));
    for (let yy = y0 + 74 * u + Math.min(10, items.length) * 30 * u; yy < y0 + ch - 40 * u; yy += 30 * u) { ctx.strokeStyle = 'rgba(27,23,18,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx + 18 * u, yy - 8 * u); ctx.lineTo(fx + flap - 18 * u, yy - 8 * u); ctx.stroke(); }
    // 脊
    fx += flap;
    ctx.fillStyle = P.acc === '#121110' || P.acc === '#f6f1e6' ? '#ff5a1f' : P.acc; ctx.fillRect(fx, y0, spine, ch);
    ctx.save(); ctx.translate(fx + spine / 2 + 10 * u, y0 + ch - 30 * u); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#fff'; font(ctx, Math.min(34 * u, spine * 0.55), 'sans', { weight: 800 });
    ctx.fillText(`${D.title}  ·  ${D.sub}`.slice(0, 34), 0, 0, ch - 60 * u);
    ctx.restore();
    // 正面
    fx += spine;
    cropCover(ctx, D.covers[0].img, fx + 14 * u, y0 + 14 * u, front - 28 * u, front - 28 * u, r, 1.05);
    ctx.fillStyle = ink;
    const T = fitLines(ctx, D.title, front - 40 * u, ch - front - 70 * u, 'serif', { italic: true }, 58 * u, 26 * u, 2);
    let y = y0 + front + 14 * u + T.size;
    T.lines.forEach((l) => { ctx.fillText(l, fx + 20 * u, y); y += T.size; });
    mono(ctx, 15 * u, 'rgba(27,23,18,.6)'); ctx.fillText(`${D.sub}`.toUpperCase().slice(0, 30), fx + 20 * u, y + 6 * u);
    // 折痕
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2 * u;
    [x0 + flap, x0 + flap + spine].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + ch); ctx.stroke(); });
    ctx.fillStyle = P.ink;
    mono(ctx, 16 * u, alpha(P.ink, 0.6));
    ctx.fillText(`C60  /  TYPE I NORMAL  /  ${D.stamp}`, x0, y0 + ch + 60 * u);
    if (D.note) { font(ctx, 30 * u, 'serif', { italic: true }); ctx.fillStyle = P.ink; wrap(ctx, `“${D.note}”`, cw, 2).forEach((l, i) => ctx.fillText(l, x0, y0 + ch + 110 * u + i * 40 * u)); }
    notes.extra = ['三折页', '竖排书脊'];
  },

  // 报纸乐评：报头、日期线、通栏标题、网点照片、分栏正文、星级
  newspaper(ctx, W, H, u, D, P, r, notes) {
    const paper = '#ebe4d4', ink = '#1d1a16';
    ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(60,50,30,${r() * 0.05})`; ctx.fillRect(r() * W, r() * H, 2 * u, 2 * u); }
    const M = 56 * u;
    ctx.fillStyle = ink; ctx.textAlign = 'center';
    font(ctx, 92 * u, 'serif'); ctx.fillText('The Side A Times', W / 2, M + 80 * u);
    ctx.fillRect(M, M + 108 * u, W - M * 2, 3 * u); ctx.fillRect(M, M + 152 * u, W - M * 2, 1.5 * u);
    mono(ctx, 15 * u, ink); ctx.fillText(`${D.stamp.slice(0, 10)}   ·   乐评版   ·   第 ${p2(D.no)} 期`, W / 2, M + 138 * u);
    ctx.textAlign = 'left';
    let y = M + 190 * u;
    ctx.fillStyle = ink;
    const T = fitLines(ctx, D.title, W - M * 2, 220 * u, 'sans', { weight: 900, stretch62: true }, 130 * u, 54 * u, 2);
    T.lines.forEach((l) => { y += T.size * 0.88; ctx.fillText(l, M, y); });
    setStretch(ctx, 100);
    font(ctx, 30 * u, 'serif', { italic: true });
    y += 46 * u; ctx.fillText(`${D.sub}${D.kind === 'record' ? ' 的这张唱片，值得在深夜重听一遍' : ''}`.slice(0, 34), M, y);
    const stars = 3 + Math.floor(r() * 3);
    ctx.fillStyle = '#b8321e'; font(ctx, 30 * u, 'sans');
    ctx.fillText('★'.repeat(stars) + '☆'.repeat(5 - stars), W - M - 170 * u, y);
    y += 30 * u;
    // 网点照片
    const ph = Math.min(H * 0.32, (W - M * 2) * 0.62);
    ctx.save(); ctx.filter = 'grayscale(1) contrast(1.35)';
    cropCover(ctx, D.covers[0].img, M, y, W - M * 2, ph, r, 1.2);
    ctx.restore();
    ctx.fillStyle = 'rgba(235,228,212,.28)';
    for (let yy = y; yy < y + ph; yy += 6 * u) for (let xx = M + ((yy / (6 * u)) % 2) * 3 * u; xx < W - M; xx += 6 * u) ctx.fillRect(xx, yy, 2 * u, 2 * u);
    mono(ctx, 13 * u, 'rgba(29,26,22,.6)'); ctx.fillText(`图：${D.title}`.slice(0, 40), M, y + ph + 22 * u);
    y += ph + 54 * u;
    // 正文三栏
    const body = [
      `${D.stamp.slice(0, 10)} 讯　这张唱片在 ${D.stamp.slice(11)} 被放进了一座私人唱片博物馆。`,
      D.note ? `收藏者留下的那句话是“${D.note}”。` : '收藏者没有多说什么，只是把它放在了最顺手的位置。',
      D.kind === 'record' ? `它属于 ${D.meta.slice(0, 3).join('、')}。` : `一起入选的还有 ${D.covers.slice(1, 4).map((c) => '《' + c.rec.title + '》').join('、')}。`,
      `本报评论员认为，${D.sub}的声音在这里找到了合适的房间。`,
      (D.zhMeta || []).length ? `关键词：${D.zhMeta.join('、')}。` : '它适合被反复听，也适合被借给一个朋友。',
    ].join('');
    const cols = 3, gap = 26 * u, cwid = (W - M * 2 - gap * (cols - 1)) / cols;
    font(ctx, 25 * u, 'serif'); ctx.fillStyle = ink;
    const lines = wrap(ctx, body, cwid, 99);
    const lh = 36 * u;
    const per = Math.max(1, Math.min(Math.ceil(lines.length / cols), Math.floor((H - M - 40 * u - y) / lh)));
    lines.slice(0, per * cols).forEach((l, i) => ctx.fillText(l, M + Math.floor(i / per) * (cwid + gap), y + (i % per) * lh));
    for (let c = 1; c < cols; c++) { ctx.fillStyle = 'rgba(29,26,22,.25)'; ctx.fillRect(M + c * (cwid + gap) - gap / 2, y - 18 * u, 1 * u, per * lh); }
    // 底部引言
    if (D.note && y + per * lh + 120 * u < H - M) { ctx.fillStyle = ink; ctx.fillRect(M, y + per * lh + 20 * u, W - M * 2, 2 * u); font(ctx, 46 * u, 'serif', { italic: true }); wrap(ctx, `“${D.note}”`, W - M * 2, 2).forEach((l, i) => ctx.fillText(l, M, y + per * lh + 90 * u + i * 56 * u)); }
    notes.scheme = '新闻纸';
    notes.extra = [`${stars} 星乐评`, '三栏正文'];
  },

  // 展览海报：大片留白，作品小而居中，展名、展期与展厅
  exhibition(ctx, W, H, u, D, P, r, notes) {
    const field = [P.bg, '#e9e4da', P.acc][Math.floor(r() * 3)];
    ctx.fillStyle = field; ctx.fillRect(0, 0, W, H);
    const ink = luminance(field) > 0.5 ? '#141210' : '#f3eee4';
    const M = 70 * u;
    const n = Math.min(D.covers.length, 3);
    const cs = (W * (n === 1 ? 0.42 : 0.26));
    const gap = 26 * u;
    const total = n * cs + (n - 1) * gap;
    let x = (W - total) / 2;
    const cy = H * 0.3;
    for (let i = 0; i < n; i++) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30 * u; ctx.shadowOffsetY = 14 * u;
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 10 * u, cy - 10 * u, cs + 20 * u, cs + 20 * u);
      ctx.restore();
      cropCover(ctx, D.covers[i].img, x, cy, cs, cs, r, 1);
      x += cs + gap;
    }
    ctx.fillStyle = ink;
    mono(ctx, 17 * u, ink); ctx.fillText('SIDE A 私人唱片博物馆  /  一层展厅', M, M + 10 * u);
    ctx.textAlign = 'right'; ctx.fillText('免费入场', W - M, M + 10 * u); ctx.textAlign = 'left';
    let y = cy + cs + 120 * u;
    ctx.fillStyle = ink;
    const T = fitLines(ctx, D.kind === 'record' ? D.title : D.title, W - M * 2, 260 * u, 'serif', {}, 130 * u, 50 * u, 2);
    T.lines.forEach((l) => { ctx.fillText(l, M, y); y += T.size * 0.98; });
    font(ctx, 32 * u, 'sans', { weight: 600 }); ctx.fillText(D.sub.slice(0, 30), M, y + 6 * u);
    const d0 = D.stamp.slice(0, 10);
    const d1 = new Date(new Date(d0.replace(/\./g, '-')).getTime() + 90 * 864e5);
    const end = `${d1.getFullYear()}.${p2(d1.getMonth() + 1)}.${p2(d1.getDate())}`;
    ctx.fillRect(M, H - M - 120 * u, W - M * 2, 2 * u);
    font(ctx, 46 * u, 'sans', { weight: 300 }); ctx.fillText(`${d0} - ${end}`, M, H - M - 54 * u);
    mono(ctx, 15 * u, alpha(ink, 0.7)); ctx.fillText(D.note ? `“${D.note}”`.slice(0, 40) : '开放时间  周二至周日  10:00 - 22:00', M, H - M - 10 * u);
    notes.scheme = luminance(field) > 0.5 ? '展墙白' : '色场';
    notes.extra = [`${n} 件展品`, '大面积留白'];
  },

  // 明信片：正面封面、背面手写留言、邮票与邮戳
  postcard(ctx, W, H, u, D, P, r, notes) {
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    const pw = W * 0.86, ph = pw * 0.66;
    const draw = (cx, cy, rot, back) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40 * u; ctx.shadowOffsetY = 16 * u;
      ctx.fillStyle = '#f7f2e6'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.shadowColor = 'transparent';
      if (!back) { cropCover(ctx, D.covers[0].img, -pw / 2 + 18 * u, -ph / 2 + 18 * u, pw - 36 * u, ph - 36 * u, r, 1.4); ctx.fillStyle = 'rgba(255,255,255,.9)'; font(ctx, 40 * u, 'serif', { italic: true }); ctx.fillText(`Greetings from ${String(D.sub).slice(0, 18)}`, -pw / 2 + 40 * u, ph / 2 - 46 * u); }
      else {
        const ink = '#1f2a6b';
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(-2 * u, -ph / 2 + 40 * u, 2 * u, ph - 80 * u);
        font(ctx, 32 * u, 'serif', { italic: true }); ctx.fillStyle = ink;
        wrap(ctx, D.note || `在听 ${D.title}，想起你。`, pw / 2 - 80 * u, 5).forEach((l, i) => ctx.fillText(l, -pw / 2 + 40 * u, -ph / 2 + 110 * u + i * 46 * u));
        ctx.fillText(`${D.by || '一位朋友'}`, -pw / 2 + 40 * u, ph / 2 - 60 * u);
        // 地址线
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5 * u;
        for (let i = 0; i < 3; i++) { const yy = 30 * u + i * 60 * u; ctx.beginPath(); ctx.moveTo(40 * u, yy); ctx.lineTo(pw / 2 - 40 * u, yy); ctx.stroke(); }
        font(ctx, 30 * u, 'serif', { italic: true }); ctx.fillStyle = ink; ctx.fillText(`To: 喜欢 ${String(D.sub).slice(0, 10)} 的你`, 50 * u, 20 * u);
        // 邮票
        const sw = 130 * u, sx = pw / 2 - sw - 40 * u, sy = -ph / 2 + 40 * u;
        ctx.fillStyle = '#fff'; ctx.fillRect(sx - 8 * u, sy - 8 * u, sw + 16 * u, sw * 1.2 + 16 * u);
        for (let k = 0; k < 12; k++) { ctx.fillStyle = P.bg; ctx.beginPath(); ctx.arc(sx - 8 * u + (k / 11) * (sw + 16 * u), sy - 8 * u, 5 * u, 0, Math.PI * 2); ctx.arc(sx - 8 * u + (k / 11) * (sw + 16 * u), sy + sw * 1.2 + 8 * u, 5 * u, 0, Math.PI * 2); ctx.fill(); }
        cropCover(ctx, D.covers[Math.min(1, D.covers.length - 1)].img, sx, sy, sw, sw * 1.2, r, 1);
        // 邮戳
        ctx.strokeStyle = 'rgba(160,40,30,.7)'; ctx.lineWidth = 3 * u;
        ctx.beginPath(); ctx.arc(sx - 30 * u, sy + sw * 0.9, 62 * u, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(160,40,30,.75)'; mono(ctx, 15 * u, 'rgba(160,40,30,.8)'); ctx.textAlign = 'center';
        ctx.fillText('SIDE A', sx - 30 * u, sy + sw * 0.9 - 8 * u); ctx.fillText(D.stamp.slice(0, 10), sx - 30 * u, sy + sw * 0.9 + 16 * u); ctx.textAlign = 'left';
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(sx + 40 * u, sy + sw * 0.75 + k * 14 * u); ctx.bezierCurveTo(sx + 80 * u, sy + sw * 0.7 + k * 14 * u, sx + 110 * u, sy + sw * 0.8 + k * 14 * u, sx + 150 * u, sy + sw * 0.75 + k * 14 * u); ctx.stroke(); }
      }
      ctx.restore();
    };
    draw(W / 2 + 20 * u, H * 0.3, -0.06 + r() * 0.03, false);
    draw(W / 2 - 10 * u, H * 0.68, 0.04 - r() * 0.03, true);
    notes.extra = ['正反两面', '邮票与邮戳'];
  },

  // 年度大数字：大色块、巨大的数字、前五名
  wrapped(ctx, W, H, u, D, P, r, notes) {
    const pal = [...new Set(D.covers.flatMap((c) => c.rec.palette || []))].filter((c) => luminance(c) > 0.15 && luminance(c) < 0.85);
    const c1 = pal[0] || P.acc, c2 = pal[1] || '#ff5a1f', c3 = pal[2] || '#1d1a16';
    ctx.fillStyle = c1; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(W * (0.75 + r() * 0.2), H * 0.18, W * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c3; ctx.fillRect(0, H * 0.62, W, H * 0.38);
    const ink1 = luminance(c1) > 0.5 ? '#121110' : '#f6f1e6';
    const ink3 = luminance(c3) > 0.5 ? '#121110' : '#f6f1e6';
    const M = 64 * u;
    mono(ctx, 18 * u, ink1); ctx.fillText(`SIDE A  /  ${D.stamp.slice(0, 4)} WRAPPED`, M, M + 10 * u);
    const big = D.kind === 'record' ? String(D.meta[0] || D.stamp.slice(0, 4)) : String(D.no);
    ctx.fillStyle = ink1;
    condensed(ctx, 100 * u);
    const bw = ctx.measureText(big).width || 1;
    const bs = Math.min(H * 0.42, ((W - M * 2) / bw) * 100 * u);
    condensed(ctx, bs);
    ctx.fillText(big, M - 6 * u, H * 0.5);
    setStretch(ctx, 100);
    font(ctx, 40 * u, 'sans', { weight: 800 });
    ctx.fillText(D.kind === 'record' ? `年，${D.title}`.slice(0, 20) : D.kind === 'card' ? '张 A 面唱片' : '张入坑专辑', M, H * 0.5 + 60 * u);
    font(ctx, 30 * u, 'serif', { italic: true });
    ctx.fillText(D.kind === 'card' ? `${D.title}，${D.sub}` : D.sub, M, H * 0.5 + 106 * u, W - M * 2);
    // 前五名
    let y = H * 0.62 + 80 * u;
    mono(ctx, 16 * u, alpha(ink3, 0.7)); ctx.fillText(D.kind === 'record' ? 'THE RECORD' : 'TOP RECORDS', M, y - 20 * u);
    const list = D.kind === 'record' ? [{ rec: { title: D.title, artist: D.sub }, img: D.covers[0].img }] : D.covers.slice(0, 5);
    const row = Math.min(110 * u, (H - y - M) / Math.max(1, list.length));
    list.forEach((c, i) => {
      const s2 = row - 18 * u;
      condensed(ctx, s2 * 0.9); ctx.fillStyle = c2;
      ctx.fillText(String(i + 1), M, y + s2 * 0.85);
      setStretch(ctx, 100);
      cropCover(ctx, c.img, M + 70 * u, y, s2, s2, r, 1);
      ctx.fillStyle = ink3; font(ctx, Math.min(34 * u, s2 * 0.42), 'sans', { weight: 800 });
      ctx.fillText(String(c.rec.title).slice(0, 22), M + 90 * u + s2, y + s2 * 0.48);
      font(ctx, Math.min(24 * u, s2 * 0.3), 'sans'); ctx.fillStyle = alpha(ink3, 0.7);
      ctx.fillText(String(c.rec.artist).slice(0, 28), M + 90 * u + s2, y + s2 * 0.86);
      y += row;
    });
    notes.scheme = '色块';
    notes.extra = ['巨大数字', D.kind === 'record' ? '单张' : `前 ${list.length} 名`];
  },
};
