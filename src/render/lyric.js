// 歌词解剖室：一个词被放大，句子被拆开，文字像沟槽一样盘旋
import { font, wrap, fitFont, drawCover, grain, setStretch } from './kit.js';
import { mix, alpha, luminance, rng, hash } from '../lib/color.js';

export const LYRIC_LAYOUTS = [
  { id: 'giant', label: '巨字', en: 'GIANT WORD', desc: '一个词占据整个画面' },
  { id: 'subtitle', label: '电影字幕', en: 'FILM STILL', desc: '封面成为一帧电影画面' },
  { id: 'sheet', label: '歌词纸', en: 'LYRIC SHEET', desc: '在模糊的上下文里划出你的那几行' },
  { id: 'dissect', label: '拆解', en: 'DISSECTION', desc: '不同字重、间距与方向' },
  { id: 'swiss', label: '瑞士海报', en: 'SWISS GRID', desc: '网格、编号与粗体' },
  { id: 'groove', label: '沟槽', en: 'GROOVE', desc: '文字像唱片纹一样盘旋' },
  { id: 'annotated', label: '批注', en: 'ANNOTATED', desc: '注释、时间戳与感想' },
];

export const LYRIC_BGS = { flat: '纯色', cover: '封面虚化', duotone: '双色网版', paper: '旧纸' };

// 随机艺术指导：同一组歌词，每次给出完全不同的构图
export function randomArt(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const layout = pick(LYRIC_LAYOUTS).id;
  const bgByLayout = { subtitle: ['cover'], sheet: ['paper', 'flat'], groove: ['flat', 'paper', 'cover'], swiss: ['flat', 'paper', 'duotone'] };
  const bg = pick(bgByLayout[layout] || ['flat', 'cover', 'duotone', 'paper', 'flat']);
  return {
    layout,
    theme: bg === 'paper' ? 'paper' : pick(['ink', 'album', 'album', 'paper']),
    art: { seed, bg, tilt: (r() - 0.5) * 0.08, align: pick(['left', 'left', 'center', 'right']), scale: 0.85 + r() * 0.35, accent: Math.floor(r() * 3) },
  };
}

export function describeLyricArt(L) {
  const lay = LYRIC_LAYOUTS.find((x) => x.id === L.layout);
  const a = L.art || {};
  const parts = [lay ? `${lay.label}` : ''];
  if (a.bg) parts.push(LYRIC_BGS[a.bg]);
  parts.push({ ink: '墨色', paper: '纸色', album: '专辑配色' }[L.theme] || '');
  if (a.align) parts.push({ left: '左对齐', center: '居中', right: '右对齐' }[a.align]);
  if (a.tilt) parts.push(`倾斜 ${(a.tilt * 57.3).toFixed(1)}°`);
  if (a.scale) parts.push(`字号 ×${a.scale.toFixed(2)}`);
  return parts.filter(Boolean).join('，');
}

export function segment(line) {
  const s = String(line || '');
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter('zh', { granularity: 'word' });
    return [...seg.segment(s)].map((x) => x.segment).filter((x) => x.trim() && !/^[\p{P}\s]+$/u.test(x));
  }
  return s.split(/\s+/).filter(Boolean);
}

function theme(L, rec) {
  const p = rec?.palette?.length ? rec.palette : ['#111111', '#ff5a1f', '#efe9dc'];
  const bgMode = L.art?.bg || 'flat';
  if (bgMode === 'cover' || bgMode === 'duotone') {
    const acc = [p[1], p[2], '#ff5a1f'].filter(Boolean).map((c) => (luminance(c) < 0.35 ? mix(c, '#ffffff', 0.45) : c))[L.art?.accent || 0] || '#ff5a1f';
    return { bg: '#0b0b0c', ink: '#f2ede2', acc, sub: 'rgba(242,237,226,.62)', dark: true };
  }
  if (L.theme === 'paper') return { bg: '#efe9dc', ink: '#0b0b0c', acc: p[1] && luminance(p[1]) < 0.75 ? p[1] : '#ff5a1f', sub: 'rgba(11,11,12,.55)' };
  if (L.theme === 'album') {
    const bg = mix(p[0], '#000000', 0.25);
    const ink = luminance(bg) > 0.4 ? '#0b0b0c' : '#f2ede2';
    return { bg, ink, acc: p.find((c) => Math.abs(luminance(c) - luminance(bg)) > 0.25) || '#ff5a1f', sub: alpha(ink === '#0b0b0c' ? '#0b0b0c' : '#f2ede2', 0.55) };
  }
  return { bg: '#0b0b0c', ink: '#efe9dc', acc: '#ff5a1f', sub: 'rgba(239,233,220,.5)' };
}

export function drawLyric(ctx, W, H, L, rec, img) {
  const u = W / 1080;
  const T = theme(L, rec);
  ctx.save();
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  background(ctx, W, H, L, rec, img, T);
  const line = L.line || '';
  const key = L.keyword || segment(line).sort((a, b) => b.length - a.length)[0] || line;
  const r = rng(hash(line + L.layout + (L.art?.seed || '')));
  const tilt = L.art?.tilt || 0;
  if (tilt && L.layout !== 'subtitle' && L.layout !== 'sheet') { ctx.translate(W / 2, H / 2); ctx.rotate(tilt); ctx.translate(-W / 2, -H / 2); }
  ({ giant, dissect, groove, annotated, subtitle, sheet, swiss }[L.layout] || giant)(ctx, W, H, u, L, rec, img, T, line, key, r);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 页脚：来源
  if (L.layout !== 'subtitle') {
    ctx.fillStyle = T.sub;
    font(ctx, 16 * u, 'mono');
    ctx.textAlign = 'left';
    const song = (L.song || rec?.title || '').toUpperCase().slice(0, 40);
    const who = (L.artist || rec?.artist || '').toUpperCase().slice(0, 30);
    ctx.fillText(`${song}${who ? '  /  ' + who : ''}`, 60 * u, H - 54 * u);
    ctx.textAlign = 'right';
    ctx.fillText(`${L.time ? L.time + '  ' : ''}SIDE A`, W - 60 * u, H - 54 * u);
  }
  ctx.restore();
  grain(ctx, W, H, 14, 7);
}

// 背景处理：纯色 / 封面虚化 / 双色网版 / 旧纸
function background(ctx, W, H, L, rec, img, T) {
  const mode = L.art?.bg || 'flat';
  const p = rec?.palette?.length ? rec.palette : ['#222', '#ff5a1f'];
  if ((mode === 'cover' || mode === 'duotone') && img) {
    const S = Math.max(W, H);
    if (mode === 'cover') {
      ctx.save();
      ctx.filter = `blur(${Math.round(S / 30)}px) saturate(1.25)`;
      ctx.drawImage(img, (W - S * 1.2) / 2, (H - S * 1.2) / 2, S * 1.2, S * 1.2);
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(8,8,9,.58)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else {
      const c = document.createElement('canvas');
      c.width = Math.round(W / 3); c.height = Math.round(H / 3);
      const g = c.getContext('2d');
      g.filter = 'grayscale(1) contrast(1.6) brightness(1.05)';
      const s2 = Math.max(c.width, c.height);
      g.drawImage(img, (c.width - s2) / 2, (c.height - s2) / 2, s2, s2);
      g.filter = 'none';
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = mix(p[0], '#000000', 0.35); g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'screen';
      g.fillStyle = mix(T.acc, '#000000', 0.55); g.fillRect(0, 0, c.width, c.height);
      // 网点
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (let y = 0; y < c.height; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < c.width; x += 4) g.fillRect(x, y, 1.4, 1.4);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, 0, 0, W, H);
      ctx.fillStyle = 'rgba(8,8,9,.38)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return;
  }
  if (mode === 'paper') {
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    const r = rng(17);
    ctx.save();
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(90,70,40,${r() * 0.06})`; ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(80,55,20,.18)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// 按对齐方式排一行字
function place(ctx, text, W, margin, align) {
  const w = ctx.measureText(text).width;
  return align === 'center' ? (W - w) / 2 : align === 'right' ? W - margin - w : margin;
}

// 电影字幕：封面被裁成一帧宽银幕画面
function subtitle(ctx, W, H, u, L, rec, img, T, line) {
  const barH = Math.round(H * 0.16);
  ctx.fillStyle = '#060606';
  ctx.fillRect(0, 0, W, barH);
  ctx.fillRect(0, H - barH, W, barH);
  if (img) {
    const fh = H - barH * 2;
    const s = Math.max(W, fh) * 1.18;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, barH, W, fh); ctx.clip();
    ctx.filter = 'contrast(1.08) saturate(.9)';
    ctx.drawImage(img, (W - s) / 2 + (L.art?.tilt || 0) * 2000 * u, barH + (fh - s) / 2, s, s);
    ctx.filter = 'none';
    const gr = ctx.createLinearGradient(0, barH + fh * 0.45, 0, barH + fh);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.72)');
    ctx.fillStyle = gr; ctx.fillRect(0, barH, W, fh);
    ctx.restore();
  }
  // 字幕
  const lines = (L.lines?.length ? L.lines : [line]).slice(0, 8);
  const size = (lines.length > 4 ? 34 : lines.length > 2 ? 40 : 46) * u * Math.min(1, L.art?.scale || 1);
  font(ctx, size, 'sans', { weight: 600 });
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 2 * u;
  ctx.fillStyle = '#f6e7b4';
  const fhh = H - barH * 2;
  const rows = lines.flatMap((l) => wrap(ctx, l, W - 160 * u, 2)).slice(0, 9);
  rows.forEach((l, i) => ctx.fillText(l, W / 2, barH + fhh - 70 * u - (rows.length - 1 - i) * size * 1.3));
  ctx.shadowColor = 'transparent';
  if (L.line2) { ctx.fillStyle = 'rgba(246,231,180,.75)'; font(ctx, 26 * u, 'sans'); ctx.fillText(L.line2.slice(0, 50), W / 2, barH + fhh - 26 * u); }
  // 片头信息
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(242,237,226,.82)';
  font(ctx, 18 * u, 'mono');
  ctx.fillText(`${(rec?.title || L.song || '').toUpperCase().slice(0, 34)}`, 60 * u, barH / 2 + 6 * u);
  ctx.textAlign = 'right';
  ctx.fillText(`${L.time || '00:00'}  ·  SIDE A`, W - 60 * u, barH / 2 + 6 * u);
  ctx.textAlign = 'left';
  if (L.note) {
    ctx.fillStyle = '#f2ede2';
    font(ctx, 34 * u, 'serif', { italic: true });
    wrap(ctx, L.note, W - 120 * u, 2).forEach((l, i) => ctx.fillText(l, 60 * u, H - barH + 62 * u + i * 42 * u));
  }
  ctx.fillStyle = 'rgba(242,237,226,.5)';
  font(ctx, 15 * u, 'mono');
  ctx.fillText(`${(L.song || '').toUpperCase().slice(0, 30)}  /  ${(L.artist || rec?.artist || '').toUpperCase().slice(0, 24)}`, 60 * u, H - 40 * u);
}

// 歌词纸：上下文被虚化，只剩你划出的几行
function sheet(ctx, W, H, u, L, rec, img, T) {
  const sel = L.lines?.length ? L.lines : [L.line];
  const before = (L.context?.before || []).slice(sel.length > 4 ? -2 : -6);
  const after = (L.context?.after || []).slice(0, sel.length > 4 ? 3 : 8);
  const size = (sel.length > 5 ? 34 : sel.length > 3 ? 40 : 44) * u * Math.min(1.1, L.art?.scale || 1);
  const lh = size * 1.55;
  const x = 90 * u;
  const total = (before.length + sel.length + after.length) * lh;
  let y = Math.max(220 * u, (H - total) / 2 - 40 * u);
  ctx.fillStyle = T.sub;
  font(ctx, 16 * u, 'mono');
  ctx.fillText('LYRIC SHEET', x, 110 * u);
  ctx.textAlign = 'right';
  ctx.fillText(`${(L.song || rec?.title || '').toUpperCase().slice(0, 30)}`, W - x, 110 * u);
  ctx.textAlign = 'left';
  const blurLine = (t) => {
    ctx.save();
    ctx.filter = `blur(${Math.round(5 * u)}px)`;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = T.ink;
    font(ctx, size * 0.9, 'serif');
    ctx.fillText(t.slice(0, 40), x, y);
    ctx.restore();
    y += lh;
  };
  before.forEach(blurLine);
  const r = rng(hash(sel.join('')));
  sel.forEach((t) => {
    font(ctx, size, 'serif');
    const rows = wrap(ctx, t, W - x * 2, 2);
    rows.forEach((row) => {
      const w = ctx.measureText(row).width;
      // 荧光笔划过
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = T.acc;
      ctx.beginPath();
      const hy = y - size * 0.72, hh = size * 0.95;
      ctx.moveTo(x - 10 * u, hy + r() * 6 * u);
      ctx.lineTo(x + w + 12 * u, hy + r() * 6 * u);
      ctx.lineTo(x + w + 6 * u, hy + hh + r() * 6 * u);
      ctx.lineTo(x - 6 * u, hy + hh + r() * 6 * u);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = luminance(T.acc) > 0.5 ? '#0b0b0c' : '#f6f1e6';
      font(ctx, size, 'serif');
      ctx.fillText(row, x, y);
      y += lh;
    });
  });
  after.forEach(blurLine);
  if (L.note) {
    ctx.save();
    ctx.translate(W - 120 * u, Math.min(H - 300 * u, y + 40 * u));
    ctx.rotate(-0.05);
    ctx.fillStyle = T.acc;
    font(ctx, 34 * u, 'serif', { italic: true });
    ctx.textAlign = 'right';
    wrap(ctx, L.note, W * 0.6, 3).forEach((l, i) => ctx.fillText(l, 0, i * 44 * u));
    ctx.restore();
  }
}

// 瑞士海报：网格、粗体、编号
function swiss(ctx, W, H, u, L, rec, img, T, line, key, r) {
  const M = 60 * u;
  const col = (W - M * 2) / 6;
  ctx.strokeStyle = alpha(T.ink === '#0b0b0c' ? '#0b0b0c' : '#f2ede2', 0.18);
  ctx.lineWidth = 1 * u;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(M + col * i, M); ctx.lineTo(M + col * i, H - M * 1.6); ctx.stroke(); }
  // 封面方块
  const cs = col * (3 + Math.floor(r() * 2));
  const cx = r() > 0.5 ? M : W - M - cs;
  if (img) drawCover(ctx, img, cx, M, cs, cs);
  // 大号时间戳
  ctx.fillStyle = T.acc;
  font(ctx, 150 * u, 'sans', { weight: 900 });
  setStretch(ctx, 62);
  const ts = L.time || String(rec?.year || '');
  ctx.fillText(ts, cx === M ? M + cs + 20 * u : M, M + 120 * u);
  setStretch(ctx, 100);
  // 歌词：粗体左齐
  const lines = (L.lines?.length ? L.lines : [line]).slice(0, 8);
  let y = M + cs + 110 * u;
  const size = Math.min(84, 300 / Math.max(3, Math.max(...lines.map((l) => l.length)) ** 0.6)) * u * (L.art?.scale || 1) * (lines.length > 4 ? 0.62 : 1);
  for (const l of lines) {
    font(ctx, size, 'sans', { weight: 800 });
    setStretch(ctx, 87);
    const rows = wrap(ctx, l, W - M * 2, 3);
    ctx.fillStyle = T.ink;
    rows.forEach((row) => { if (y < H - 260 * u) { ctx.fillText(row, M, y); y += size * 1.08; } });
    setStretch(ctx, 100);
    y += size * 0.25;
  }
  ctx.fillStyle = T.sub;
  font(ctx, 18 * u, 'mono');
  ctx.fillText(`[ ${key} ]`, M, Math.min(y + 30 * u, H - 210 * u));
  annotation(ctx, M, Math.min(y + 90 * u, H - 160 * u), W - M * 2, u, L, T, 32);
}

function annotation(ctx, x, y, maxW, u, L, T, size = 34) {
  if (!L.note) return y;
  ctx.fillStyle = T.ink;
  font(ctx, size * u, 'serif', { italic: true });
  const lines = wrap(ctx, L.note, maxW, 3);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * 1.25 * u));
  return y + lines.length * size * 1.25 * u;
}

function giant(ctx, W, H, u, L, rec, img, T, line, key) {
  // 巨字
  ctx.fillStyle = T.acc;
  const size = fitFont(ctx, key, W * 1.08, 760 * u, 'sans', { weight: 900 }, 120 * u);
  font(ctx, size * Math.min(1, L.art?.scale || 1), 'sans', { weight: 900 });
  setStretch(ctx, key.length > 3 ? 62 : 100);
  const kw = ctx.measureText(key).width;
  ctx.fillText(key, (W - kw) / 2 - 10 * u, H * 0.52 + size * 0.36);
  setStretch(ctx, 100);
  // 整句压在巨字上
  ctx.fillStyle = T.ink;
  const src = L.lines?.length ? L.lines : [line];
  const gs = (src.length > 5 ? 32 : src.length > 3 ? 38 : 46) * u;
  font(ctx, gs, 'serif', { italic: true });
  const lines = src.flatMap((l) => wrap(ctx, l, W - 160 * u, 2)).slice(0, 10);
  const align = L.art?.align || 'left';
  lines.forEach((l, i) => ctx.fillText(l, place(ctx, l, W, 80 * u, align), 170 * u + i * gs * 1.26));
  if (L.line2) {
    ctx.fillStyle = T.sub;
    font(ctx, 26 * u, 'sans');
    ctx.fillText(L.line2.slice(0, 60), 80 * u, 170 * u + lines.length * 58 * u + 10 * u);
  }
  ctx.fillStyle = T.sub;
  font(ctx, 16 * u, 'mono');
  ctx.fillText(`[ ${key} ]  ×${Math.round(size / u)}PT`, 80 * u, 90 * u);
  annotation(ctx, 80 * u, H - 240 * u, W - 160 * u, u, L, T);
}

function dissect(ctx, W, H, u, L, rec, img, T, line, key, r) {
  const toks = segment(line);
  let y = 170 * u;
  ctx.fillStyle = T.sub;
  font(ctx, 16 * u, 'mono');
  ctx.fillText('FIG. 1  句子被拆开后的样子', 70 * u, 90 * u);
  for (let i = 0; i < toks.length && y < H - 380 * u; i++) {
    const tk = toks[i];
    const isKey = tk === key;
    const weight = isKey ? 900 : [200, 400, 700, 900][Math.floor(r() * 4)];
    const sz = (isKey ? 190 : 70 + r() * 70) * u;
    font(ctx, sz, r() > 0.5 ? 'sans' : 'serif', { weight, italic: r() > 0.7 });
    setStretch(ctx, isKey ? 62 : [62, 100, 125][Math.floor(r() * 3)]);
    const w = ctx.measureText(tk).width;
    const x = isKey ? 70 * u : 70 * u + r() * Math.max(0, W - 140 * u - w);
    ctx.save();
    const vertical = !isKey && r() > 0.78 && tk.length <= 4;
    ctx.translate(x, y + sz * 0.8);
    if (vertical) ctx.rotate(Math.PI / 2);
    else ctx.rotate((r() - 0.5) * 0.06);
    ctx.fillStyle = isKey ? T.acc : T.ink;
    // 拉开字距
    if (!isKey && r() > 0.6) {
      let cx = 0;
      for (const ch of tk) { ctx.fillText(ch, cx, 0); cx += ctx.measureText(ch).width + 18 * u; }
    } else ctx.fillText(tk, 0, 0);
    ctx.restore();
    // 标注线
    ctx.strokeStyle = T.sub;
    ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.moveTo(W - 210 * u, y + sz * 0.5); ctx.lineTo(W - 70 * u, y + sz * 0.5); ctx.stroke();
    ctx.fillStyle = T.sub;
    font(ctx, 14 * u, 'mono');
    ctx.fillText(`${String(i + 1).padStart(2, '0')} · ${weight}`, W - 200 * u, y + sz * 0.5 - 8 * u);
    y += (vertical ? Math.min(ctx.measureText(tk).width, 200 * u) : sz) * (isKey ? 1 : 0.95);
    setStretch(ctx, 100);
  }
  ctx.fillStyle = T.ink;
  font(ctx, 26 * u, 'sans');
  if (L.line2) ctx.fillText(L.line2.slice(0, 50), 70 * u, H - 300 * u);
  annotation(ctx, 70 * u, H - 230 * u, W - 140 * u, u, L, T);
}

function groove(ctx, W, H, u, L, rec, img, T, line, key) {
  const R = Math.min(W * 0.44, H * 0.31);
  const cx = W / 2, cy = Math.max(R + 90 * u, H * 0.42);
  // 唱片底
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = T.bg === '#efe9dc' ? '#141414' : mix(T.bg, '#000000', 0.5);
  ctx.fill();
  const text = (line + '  ·  ' + (L.line2 ? L.line2 + '  ·  ' : '')).repeat(8);
  // 沿螺旋排字
  let a = -Math.PI / 2, rr = R * 0.94;
  const fs = 30 * u;
  const keyIdx = line.indexOf(key);
  let idx = 0;
  for (const ch of text) {
    if (rr < R * 0.4) break;
    const inKey = keyIdx >= 0 && idx % (line.length + 5 + (L.line2 ? L.line2.length + 5 : 0)) >= keyIdx && idx % (line.length + 5 + (L.line2 ? L.line2.length + 5 : 0)) < keyIdx + key.length;
    font(ctx, inKey ? fs * 1.35 : fs, inKey ? 'sans' : 'serif', { weight: inKey ? 900 : 400, italic: !inKey });
    const w = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = inKey ? T.acc : '#efe9dc';
    ctx.fillText(ch, -w / 2, 0);
    ctx.restore();
    const da = (w + 3 * u) / rr;
    a += da;
    rr -= (fs * 1.25 * da) / (Math.PI * 2);
    idx++;
  }
  // 中心标签
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.34, 0, Math.PI * 2); ctx.clip();
  if (img) drawCover(ctx, img, cx - R * 0.34, cy - R * 0.34, R * 0.68, R * 0.68);
  else { ctx.fillStyle = T.acc; ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, 8 * u, 0, Math.PI * 2); ctx.fillStyle = '#050505'; ctx.fill();
  // 底部
  ctx.fillStyle = T.acc;
  const ks = fitFont(ctx, key, W - 160 * u, 120 * u, 'sans', { weight: 900 }, 40 * u);
  ctx.fillText(key, 80 * u, cy + R + 60 * u + ks * 0.8);
  annotation(ctx, 80 * u, cy + R + 100 * u + ks, W - 160 * u, u, L, T, 32);
}

function annotated(ctx, W, H, u, L, rec, img, T, line, key) {
  ctx.fillStyle = T.sub;
  font(ctx, 16 * u, 'mono');
  ctx.fillText('MARGINALIA · 页边批注', 90 * u, 100 * u);
  if (img) drawCover(ctx, img, W - 250 * u, 70 * u, 160 * u, 160 * u, { shadow: 20 * u });
  // 正文句子，关键词加下划线与上标
  const as = [...line].length > 90 ? 46 : [...line].length > 50 ? 56 : 72;
  font(ctx, as * u, 'serif');
  const lines = wrap(ctx, line, W - 180 * u, 9);
  let y = 340 * u;
  lines.forEach((l) => {
    let x = 90 * u;
    const parts = l.split(key);
    parts.forEach((part, i) => {
      ctx.fillStyle = T.ink;
      font(ctx, as * u, 'serif');
      ctx.fillText(part, x, y);
      x += ctx.measureText(part).width;
      if (i < parts.length - 1) {
        font(ctx, as * u, 'serif', { italic: true });
        ctx.fillStyle = T.acc;
        ctx.fillText(key, x, y);
        const kw = ctx.measureText(key).width;
        ctx.fillRect(x, y + 14 * u, kw, 5 * u);
        font(ctx, 26 * u, 'mono', { weight: 600 });
        ctx.fillText('¹', x + kw + 4 * u, y - 40 * u);
        x += kw + 26 * u;
      }
    });
    y += as * 1.28 * u;
  });
  if (L.line2) {
    ctx.fillStyle = T.sub;
    font(ctx, 30 * u, 'sans');
    wrap(ctx, L.line2, W - 180 * u, 2).forEach((l, i) => ctx.fillText(l, 90 * u, y + 10 * u + i * 40 * u));
    y += 100 * u;
  }
  // 时间戳
  ctx.strokeStyle = T.sub;
  ctx.lineWidth = 1.2 * u;
  ctx.beginPath(); ctx.moveTo(90 * u, y + 30 * u); ctx.lineTo(W - 90 * u, y + 30 * u); ctx.stroke();
  if (L.time) {
    const [mm, ss] = L.time.split(':').map(Number);
    const p = Math.min(1, ((mm || 0) * 60 + (ss || 0)) / 300);
    ctx.fillStyle = T.acc;
    ctx.beginPath(); ctx.arc(90 * u + p * (W - 180 * u), y + 30 * u, 9 * u, 0, Math.PI * 2); ctx.fill();
    font(ctx, 18 * u, 'mono');
    ctx.fillText(L.time, 90 * u + p * (W - 180 * u) - 24 * u, y + 70 * u);
  }
  // 脚注
  const fy = Math.max(y + 140 * u, H - 420 * u);
  ctx.fillStyle = T.acc;
  font(ctx, 22 * u, 'mono', { weight: 600 });
  ctx.fillText(`¹ ${key}`, 90 * u, fy);
  annotation(ctx, 90 * u, fy + 56 * u, W - 180 * u, u, L, T, 40);
  ctx.fillStyle = T.sub;
  font(ctx, 18 * u, 'mono');
  ctx.fillText(`${(L.by || '').toUpperCase()}  ${new Date(L.at || Date.now()).toISOString().slice(0, 10)}`, 90 * u, H - 120 * u);
}
