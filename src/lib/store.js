// 本地数据层：Collection → Record → Memory → Share
// 所有数据存放在浏览器 IndexedDB，内存中保留一份缓存，写入时同步落盘。

const DB_NAME = 'side-a';
const DB_VERSION = 1;
const STORES = ['records', 'rooms', 'exhibitions', 'lyrics', 'meta', 'events'];

let db = null;
const cache = { records: [], rooms: [], exhibitions: [], lyrics: [], meta: {}, events: [] };
const listeners = new Set();

function req(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx(store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function initStore() {
  db = await open();
  for (const s of ['records', 'rooms', 'exhibitions', 'lyrics', 'events']) {
    cache[s] = await req(tx(s).getAll());
  }
  const metas = await req(tx('meta').getAll());
  for (const m of metas) cache.meta[m.key] = m.value;
  cache.records.sort((a, b) => b.addedAt - a.addedAt);
  cache.events.sort((a, b) => a.at - b.at);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(kind) {
  for (const fn of listeners) fn(kind);
}

async function put(store, value) {
  await req(tx(store, 'readwrite').put(value));
}
async function del(store, id) {
  await req(tx(store, 'readwrite').delete(id));
}

// ---------- meta ----------
export function getMeta(key, fallback = null) {
  return key in cache.meta ? cache.meta[key] : fallback;
}
export async function setMeta(key, value) {
  cache.meta[key] = value;
  await put('meta', { key, value });
  emit('meta');
}

// ---------- records ----------
export const records = () => cache.records;
export const getRecord = (id) => cache.records.find((r) => r.id === id);

export function normalize(s = '') {
  return s.toLowerCase().replace(/[\s\-_'"“”‘’《》()（）\[\]【】.,，。:：!！?？·]/g, '');
}

export function findDuplicate(title, artist) {
  const t = normalize(title);
  const a = normalize(artist);
  if (!t) return null;
  return cache.records.find((r) => normalize(r.title) === t && (!a || !normalize(r.artist) || normalize(r.artist) === a)) || null;
}

export function blankRecord(partial = {}) {
  const now = Date.now();
  return {
    id: uid('r_'),
    kind: 'album', // album | song
    title: '',
    artist: '',
    trackName: '',
    year: null,
    genre: '',
    format: 'vinyl', // vinyl | cd | cassette | digital
    cover: null, // dataURL（本地保存的封面）
    coverUrl: null, // 远程封面地址（来自 Apple Music 目录）
    coverSource: 'generated', // itunes | upload | generated
    palette: [],
    moods: [],
    tags: [],
    room: null,
    note: '', // 一句话品味注释
    memories: [], // {id, at, text, mood}
    listenedAt: new Date(now - new Date(now).getTimezoneOffset() * 60000).toISOString().slice(0, 19),
    addedAt: now,
    loops: 0, // 用户主动记录的循环次数
    loopLog: [],
    side: 'A', // A 面公开；B 面只属于自己
    gateway: false, // 入坑专辑
    pinned: false, // 品味名片代表作
    itunesId: null,
    previewUrl: null,
    viz: { style: 'sculpture', seed: Math.floor(Math.random() * 1e6), intensity: 1 },
    shares: [], // {type, edition, at}
    revisits: [],
    giftFrom: null,
    seed: false,
    ...partial,
  };
}

export async function saveRecord(rec) {
  const i = cache.records.findIndex((r) => r.id === rec.id);
  if (i >= 0) cache.records[i] = rec;
  else cache.records.unshift(rec);
  await put('records', rec);
  emit('records');
  return rec;
}

export async function patchRecord(id, patch) {
  const r = getRecord(id);
  if (!r) return null;
  Object.assign(r, typeof patch === 'function' ? patch(r) || {} : patch);
  await put('records', r);
  emit('records');
  return r;
}

export async function deleteRecord(id) {
  cache.records = cache.records.filter((r) => r.id !== id);
  for (const ex of cache.exhibitions) {
    if (ex.recordIds.includes(id)) {
      ex.recordIds = ex.recordIds.filter((x) => x !== id);
      await put('exhibitions', ex);
    }
  }
  await del('records', id);
  emit('records');
}

// ---------- rooms（人生阶段） ----------
export const rooms = () => cache.rooms;
export const getRoom = (id) => cache.rooms.find((r) => r.id === id);
export async function saveRoom(room) {
  const i = cache.rooms.findIndex((r) => r.id === room.id);
  if (i >= 0) cache.rooms[i] = room;
  else cache.rooms.push(room);
  await put('rooms', room);
  emit('rooms');
}
export async function deleteRoom(id) {
  cache.rooms = cache.rooms.filter((r) => r.id !== id);
  for (const r of cache.records) if (r.room === id) { r.room = null; await put('records', r); }
  await del('rooms', id);
  emit('rooms');
}

// ---------- exhibitions（主题展览） ----------
export const exhibitions = () => cache.exhibitions;
export const getExhibition = (id) => cache.exhibitions.find((e) => e.id === id);
export async function saveExhibition(ex) {
  const i = cache.exhibitions.findIndex((e) => e.id === ex.id);
  if (i >= 0) cache.exhibitions[i] = ex;
  else cache.exhibitions.unshift(ex);
  await put('exhibitions', ex);
  emit('exhibitions');
}
export async function deleteExhibition(id) {
  cache.exhibitions = cache.exhibitions.filter((e) => e.id !== id);
  await del('exhibitions', id);
  emit('exhibitions');
}

// ---------- lyric cards（歌词解剖室作品） ----------
export const lyrics = () => cache.lyrics;
export async function saveLyric(l) {
  const i = cache.lyrics.findIndex((x) => x.id === l.id);
  if (i >= 0) cache.lyrics[i] = l;
  else cache.lyrics.unshift(l);
  await put('lyrics', l);
  emit('lyrics');
}
export async function deleteLyric(id) {
  cache.lyrics = cache.lyrics.filter((x) => x.id !== id);
  await del('lyrics', id);
  emit('lyrics');
}

// ---------- events（产品指标） ----------
export const events = () => cache.events;
export async function track(type, data = {}) {
  const e = { id: uid('e_'), type, at: Date.now(), ...data };
  cache.events.push(e);
  try { await put('events', e); } catch { /* 指标写入失败不影响主流程 */ }
}

// ---------- profile ----------
export function profile() {
  return getMeta('profile', { name: '匿名收藏家', handle: 'listener', bio: '每个人都有 A 面，也有不轻易给别人听的 B 面。', since: Date.now() });
}

export async function resetAll() {
  for (const s of STORES) await req(tx(s, 'readwrite').clear());
  cache.records = []; cache.rooms = []; cache.exhibitions = []; cache.lyrics = []; cache.events = []; cache.meta = {};
  emit('all');
}

export function exportJSON() {
  return JSON.stringify({ version: 1, exportedAt: Date.now(), ...cache }, null, 0);
}

export async function importJSON(text) {
  const data = JSON.parse(text);
  for (const s of ['records', 'rooms', 'exhibitions', 'lyrics']) {
    for (const v of data[s] || []) await put(s, v);
  }
  for (const [key, value] of Object.entries(data.meta || {})) await put('meta', { key, value });
  await initStore();
  emit('all');
}
