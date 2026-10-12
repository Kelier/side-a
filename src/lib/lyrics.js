// 歌词与曲目：曲目来自 Apple Music 公开目录（iTunes Lookup），歌词来自 LRCLIB 开放歌词库。
// 歌词只在本页展示供挑选；导出的作品只包含你选中的几行。
import { searchCatalog } from './catalog.js';

const LOOKUP = 'https://itunes.apple.com/lookup';
const LRC = 'https://lrclib.net/api';

async function getJSON(url, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const norm = (s = '') => s.toLowerCase().replace(/[\s'’"“”.,!?()（）\-–—_:：·]/g, '');

function mapTrack(t) {
  return {
    name: t.trackName,
    artist: t.artistName,
    album: t.collectionName,
    no: t.trackNumber,
    disc: t.discNumber || 1,
    duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : null,
    previewUrl: t.previewUrl || null,
    id: t.trackId,
  };
}

async function lookupAlbum(id, country) {
  const data = await getJSON(`${LOOKUP}?id=${id}&entity=song&country=${country}`);
  return (data?.results || []).filter((x) => x.wrapperType === 'track').map(mapTrack);
}

// 一张专辑的曲目表；单曲直接返回自己
export async function albumTracks(rec) {
  if (rec.kind === 'song') {
    return [{ name: rec.trackName || rec.title, artist: rec.artist, album: rec.album || '', no: 1, disc: 1, duration: null, previewUrl: rec.previewUrl || null }];
  }
  let id = rec.coverSource === 'itunes' || rec.itunesId ? rec.itunesId : null;
  if (!id) {
    const hits = await searchCatalog(`${rec.artist} ${rec.title}`, 'album').catch(() => []);
    const hit = hits.find((h) => norm(h.title).includes(norm(rec.title).slice(0, 8)) && norm(h.artist).includes(norm(rec.artist).slice(0, 4))) || hits[0];
    id = hit?.itunesId;
  }
  if (!id) return [];
  let tracks = await lookupAlbum(id, 'CN').catch(() => []);
  if (!tracks.length) tracks = await lookupAlbum(id, 'US').catch(() => []);
  return tracks.sort((a, b) => a.disc - b.disc || a.no - b.no);
}

export function parseLRC(text = '') {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const line = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) {
      const t = Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number('0.' + m[3]) : 0);
      out.push({ t, text: line });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

function shape(hit) {
  if (!hit) return null;
  if (hit.instrumental) return { instrumental: true, name: hit.trackName, artist: hit.artistName, lines: [] };
  const synced = hit.syncedLyrics ? parseLRC(hit.syncedLyrics) : [];
  const lines = synced.length
    ? synced.map((x) => ({ t: x.t, text: x.text }))
    : (hit.plainLyrics || '').split(/\r?\n/).map((text) => ({ t: null, text: text.trim() }));
  // 去掉连续空行，保留段落之间的一个空行
  const clean = [];
  for (const l of lines) if (l.text || (clean.length && clean[clean.length - 1].text)) clean.push(l);
  while (clean.length && !clean[clean.length - 1].text) clean.pop();
  if (!clean.some((l) => l.text)) return null;
  return { instrumental: false, synced: !!synced.length, name: hit.trackName, artist: hit.artistName, album: hit.albumName, lines: clean };
}

function best(list, { name, artist, duration }) {
  if (!list?.length) return null;
  const n = norm(name), a = norm(artist);
  const score = (h) => {
    let s = 0;
    if (norm(h.trackName) === n) s += 4; else if (norm(h.trackName).includes(n) || n.includes(norm(h.trackName))) s += 2;
    if (a && (norm(h.artistName).includes(a) || a.includes(norm(h.artistName)))) s += 3;
    if (duration && h.duration && Math.abs(h.duration - duration) <= 3) s += 3;
    if (h.syncedLyrics) s += 1.5;
    if (h.plainLyrics || h.syncedLyrics) s += 1;
    if (h.instrumental) s -= 1;
    return s;
  };
  const sorted = [...list].sort((x, y) => score(y) - score(x));
  return score(sorted[0]) >= 3 ? sorted[0] : null;
}

const memo = new Map();
// strict：只接受艺术家对得上的结果（小屋字幕用，宁缺毋滥）
export async function fetchLyrics({ name, artist, album = '', duration = null, strict = false }) {
  const key = 'lyr:' + (strict ? 's:' : '') + norm(name) + '|' + norm(artist);
  if (memo.has(key)) return memo.get(key);
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) { const v = JSON.parse(cached); memo.set(key, v); return v; }
  } catch { /* 隐私模式 */ }
  const q = encodeURIComponent;
  let hit = null;
  if (duration) {
    hit = await getJSON(`${LRC}/get?track_name=${q(name)}&artist_name=${q(artist)}&album_name=${q(album)}&duration=${duration}`).catch(() => null);
    if (hit && !hit.plainLyrics && !hit.syncedLyrics && !hit.instrumental) hit = null;
  }
  if (!hit) hit = best(await getJSON(`${LRC}/search?track_name=${q(name)}&artist_name=${q(artist)}`).catch(() => null), { name, artist, duration });
  if (!hit) hit = best(await getJSON(`${LRC}/search?q=${q(name + ' ' + artist)}`).catch(() => null), { name, artist, duration });
  if (!hit && !strict) hit = best(await getJSON(`${LRC}/search?track_name=${q(name)}`).catch(() => null), { name, artist: '', duration });
  if (hit && strict && artist && !(norm(hit.artistName).includes(norm(artist)) || norm(artist).includes(norm(hit.artistName)))) hit = null;
  const out = shape(hit);
  memo.set(key, out);
  try { sessionStorage.setItem(key, JSON.stringify(out)); } catch { /* 存不下就算了 */ }
  return out;
}

export const fmtTime = (t) => (t == null ? '' : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
