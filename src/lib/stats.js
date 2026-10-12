// 品味统计 —— 只基于收藏记录与用户主动记录，不冒充播放数据
import { moodById } from './constants.js';
import { luminance, hexToRgb, rgbToHsl } from './color.js';

export const dateOf = (r) => new Date(r.listenedAt || r.addedAt);

export function inPeriod(recs, year, month = null) {
  return recs.filter((r) => {
    const d = dateOf(r);
    if (year && d.getFullYear() !== year) return false;
    if (month !== null && d.getMonth() !== month) return false;
    return true;
  });
}

function count(arr) {
  const m = new Map();
  for (const x of arr) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

export function computeStats(recs, allRecs = recs) {
  const sorted = [...recs].sort((a, b) => dateOf(a) - dateOf(b));
  const moods = count(recs.flatMap((r) => r.moods)).map(([id, n]) => ({ id, n, mood: moodById(id) })).filter((x) => x.mood);
  const decades = count(recs.map((r) => r.year && Math.floor(r.year / 10) * 10)).map(([d, n]) => ({ d, n }));
  const genres = count(recs.map((r) => r.genre && r.genre.trim())).map(([g, n]) => ({ g, n }));
  const formats = count(recs.map((r) => r.format)).map(([f, n]) => ({ f, n }));
  // 反复回访的艺术家：同一艺术家多张收藏，或者被回顾 / 追加记忆的唱片
  const artistScore = new Map();
  for (const r of recs) {
    const s = 1 + (r.revisits?.length || 0) * 0.5 + Math.max(0, (r.memories?.length || 0) - 1) * 0.5 + Math.min(r.loops || 0, 10) * 0.1;
    artistScore.set(r.artist, (artistScore.get(r.artist) || 0) + s);
  }
  const artists = [...artistScore].sort((a, b) => b[1] - a[1]).map(([a, s]) => ({ a, s, n: recs.filter((r) => r.artist === a).length }));
  const prevArtists = new Set(allRecs.filter((r) => recs.length && dateOf(r) < dateOf(sorted[0])).map((r) => r.artist));
  const newArtists = new Set(recs.map((r) => r.artist).filter((a) => !prevArtists.has(a)));

  // 审美变化：前半段 vs 后半段
  const half = Math.ceil(sorted.length / 2);
  const A = sorted.slice(0, half), B = sorted.slice(half);
  const topMood = (xs) => count(xs.flatMap((r) => r.moods))[0]?.[0];
  const avgYear = (xs) => { const ys = xs.map((r) => r.year).filter(Boolean); return ys.length ? Math.round(ys.reduce((s, y) => s + y, 0) / ys.length) : null; };
  const avgLum = (xs) => { const ls = xs.flatMap((r) => (r.palette || []).slice(0, 3)).map(luminance); return ls.length ? ls.reduce((s, l) => s + l, 0) / ls.length : null; };
  const avgSat = (xs) => { const ss = xs.flatMap((r) => (r.palette || []).slice(0, 3)).map((c) => rgbToHsl(hexToRgb(c))[1]); return ss.length ? ss.reduce((s, l) => s + l, 0) / ss.length : null; };
  const energy = (xs) => { const es = xs.flatMap((r) => r.moods).map(moodById).filter(Boolean).map((m) => m.energy); return es.length ? es.reduce((s, e) => s + e, 0) / es.length : null; };
  const evolution = {
    moodFrom: moodById(topMood(A)), moodTo: moodById(topMood(B)),
    yearFrom: avgYear(A), yearTo: avgYear(B),
    lumFrom: avgLum(A), lumTo: avgLum(B), satFrom: avgSat(A), satTo: avgSat(B),
    energyFrom: energy(A), energyTo: energy(B),
  };
  const lines = [];
  if (B.length && evolution.moodFrom && evolution.moodTo && evolution.moodFrom.id !== evolution.moodTo.id) lines.push(`情绪从「${evolution.moodFrom.label}」走向了「${evolution.moodTo.label}」。`);
  if (B.length && evolution.energyFrom !== null && evolution.energyTo !== null) {
    const d = evolution.energyTo - evolution.energyFrom;
    if (Math.abs(d) > 0.08) lines.push(d > 0 ? '后半段的收藏明显更有能量，你开始需要更响的声音。' : '后半段的收藏安静了下来，你在找更慢、更克制的东西。');
  }
  if (B.length && evolution.yearFrom && evolution.yearTo && Math.abs(evolution.yearTo - evolution.yearFrom) >= 5) lines.push(evolution.yearTo < evolution.yearFrom ? `你在往回听：收藏的平均年份从 ${evolution.yearFrom} 退回到 ${evolution.yearTo}。` : `你在往前走：收藏的平均年份从 ${evolution.yearFrom} 来到 ${evolution.yearTo}。`);
  if (B.length && evolution.lumFrom !== null && evolution.lumTo !== null && Math.abs(evolution.lumTo - evolution.lumFrom) > 0.05) lines.push(evolution.lumTo > evolution.lumFrom ? '唱片架的颜色在变亮。' : '唱片架的颜色在变暗。');
  if (!lines.length) lines.push(recs.length < 4 ? '收藏还太少，审美的轨迹要再多几张唱片才看得清。' : '你的审美这段时间很稳定，这本身也是一种品味。');

  const loopsRecorded = recs.filter((r) => r.loops > 0);
  return {
    count: recs.length, sorted, moods, decades, genres, formats, artists, newArtists: newArtists.size,
    memories: recs.reduce((s, r) => s + (r.memories?.length || 0), 0),
    notes: recs.filter((r) => r.note).length,
    shares: recs.reduce((s, r) => s + (r.shares?.length || 0), 0),
    loops: loopsRecorded.reduce((s, r) => s + r.loops, 0),
    mostLooped: [...loopsRecorded].sort((a, b) => b.loops - a.loops)[0] || null,
    evolution, evolutionLines: lines,
    bSide: recs.filter((r) => r.side === 'B').length,
  };
}

// 品味人格：用于名片
export function persona(stats) {
  const m = stats.moods[0]?.mood;
  const d = stats.decades[0]?.d;
  const e = stats.evolution.energyTo ?? stats.evolution.energyFrom ?? 0.5;
  const nightish = stats.moods.slice(0, 3).some((x) => ['night', 'insomnia', 'lonely'].includes(x.id));
  let title = '漫游型收藏家';
  if (nightish && e < 0.5) title = '夜行性收藏家';
  else if (e > 0.75) title = '高能量收藏家';
  else if (d && d < 1990) title = '考古派收藏家';
  else if (stats.genres.length >= 6) title = '杂食型收藏家';
  else if (m && ['tender', 'nostalgia'].includes(m.id)) title = '怀旧型收藏家';
  return { title, en: { '夜行性收藏家': 'NOCTURNAL COLLECTOR', '高能量收藏家': 'HIGH-VOLTAGE COLLECTOR', '考古派收藏家': 'CRATE DIGGER', '杂食型收藏家': 'OMNIVORE', '怀旧型收藏家': 'NOSTALGIST', '漫游型收藏家': 'WANDERER' }[title] };
}

// ---------- 精确到秒的时间统计 ----------
export function inRange(recs, from, to) {
  return recs.filter((r) => {
    const t = dateOf(r).getTime();
    return (!from || t >= from) && (!to || t <= to);
  });
}

// 时间线上的每一个“瞬间”：收藏、写下记忆、回顾、单曲循环
export function timeEvents(recs, from = 0, to = Infinity) {
  const ev = [];
  const push = (at, type, rec, text = '') => {
    const t = typeof at === 'number' ? at : new Date(at).getTime();
    if (!isNaN(t) && t >= from && t <= to) ev.push({ at: t, type, rec, text });
  };
  for (const r of recs) {
    push(dateOf(r).getTime(), 'collect', r, r.note || '');
    for (const m of r.memories || []) push(m.at, 'memory', r, m.text);
    for (const v of r.revisits || []) push(v, 'revisit', r);
    for (const l of r.loopLog || []) push(typeof l === 'object' ? l.at : l, 'loop', r);
  }
  return ev.sort((a, b) => a.at - b.at);
}

export const EVENT_LABEL = { collect: '收藏', memory: '记忆', revisit: '回顾', loop: '循环' };
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function timeStats(events) {
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const hours = new Array(24).fill(0);
  for (const e of events) {
    const d = new Date(e.at);
    heat[d.getDay()][d.getHours()]++;
    hours[d.getHours()]++;
  }
  let peak = { d: 0, h: 0, n: 0 };
  heat.forEach((row, d) => row.forEach((n, h) => { if (n > peak.n) peak = { d, h, n }; }));
  // 最晚的一次：把凌晨 0-5 点算作“前一天的深夜”
  const lateKey = (t) => { const d = new Date(t); const h = d.getHours(); return (h < 6 ? h + 24 : h) * 3600 + d.getMinutes() * 60 + d.getSeconds(); };
  const latest = events.length ? events.reduce((a, b) => (lateKey(b.at) > lateKey(a.at) ? b : a)) : null;
  let gap = null;
  for (let i = 1; i < events.length; i++) {
    const g = events[i].at - events[i - 1].at;
    if (!gap || g > gap.ms) gap = { ms: g, from: events[i - 1], to: events[i] };
  }
  // 最密集：一小时窗口内的最多事件
  let burst = { n: 0 };
  for (let i = 0, j = 0; i < events.length; i++) {
    while (events[i].at - events[j].at > 3600e3) j++;
    if (i - j + 1 > burst.n) burst = { n: i - j + 1, from: events[j], to: events[i] };
  }
  const night = events.filter((e) => { const h = new Date(e.at).getHours(); return h >= 22 || h < 5; }).length;
  return {
    heat, hours, peak: { ...peak, label: `${WEEK[peak.d]} ${String(peak.h).padStart(2, '0')}:00` },
    latest, gap, burst, first: events[0] || null, last: events[events.length - 1] || null,
    nightShare: events.length ? night / events.length : 0, total: events.length,
  };
}

export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return { d, h, m, s: sec, text: `${d ? d + ' 天 ' : ''}${h} 时 ${String(m).padStart(2, '0')} 分 ${String(sec).padStart(2, '0')} 秒` };
}
export { WEEK };
