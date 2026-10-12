// 示例收藏：让第一次打开时博物馆不是空的。用户可一键清空。
import { blankRecord, saveRecord, saveRoom, saveExhibition, setMeta, getMeta, records, patchRecord, uid } from './store.js';
import { DEFAULT_ROOMS } from './constants.js';
import { searchCatalog } from './catalog.js';
import { extractPalette, paletteFromSeed } from './color.js';

// 给每条示例记录一个确定的、偏向夜晚的具体时刻（精确到秒）
function at(day, key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = (n) => { h = (h * 1103515245 + 12345) >>> 0; return h % n; };
  const hours = [19, 20, 21, 22, 22, 23, 23, 0, 1, 1, 2, 3, 14, 16, 8];
  const hh = hours[r(hours.length)];
  const d = new Date(`${day}T${String(hh).padStart(2, '0')}:${String(r(60)).padStart(2, '0')}:${String(r(60)).padStart(2, '0')}`);
  if (hh < 5) d.setDate(d.getDate() + 1);
  return d;
}
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);

const SEEDS = [
  { title: 'OK Computer', artist: 'Radiohead', year: 1997, genre: 'Alternative', format: 'vinyl', moods: ['night', 'distant'], room: 'room_3am', note: '适合一个人走很长的夜路。', listenedAt: '2026-01-14', loops: 9, pinned: true, gateway: true, memories: ['第一次听是在通宵自习室，耳机里 Airbag 一响，窗外开始下雪。'] },
  { title: '浮躁', artist: '王菲', year: 1996, genre: 'Mandopop', format: 'cd', moods: ['psych', 'nostalgia'], room: 'room_campus', note: '不是最喜欢的一张，但它最像我。', listenedAt: '2025-04-02', loops: 4, pinned: true, memories: ['宿舍楼下的二手 CD 摊，十五块。'] },
  { title: 'Blonde', artist: 'Frank Ocean', year: 2016, genre: 'R&B/Soul', format: 'vinyl', moods: ['tender', 'lonely'], room: 'room_heartbreak', note: '这张专辑不应该在白天听。', listenedAt: '2025-08-21', loops: 17, pinned: true, memories: ['那年夏天每天坐末班地铁回家。'] },
  { title: 'For Emma, Forever Ago', artist: 'Bon Iver', year: 2007, genre: 'Indie Folk', format: 'cassette', moods: ['lonely', 'restraint'], room: 'room_travel', note: '适合在没有信号的山里听。', listenedAt: '2025-11-03', loops: 3 },
  { title: 'Random Access Memories', artist: 'Daft Punk', year: 2013, genre: 'Electronic', format: 'vinyl', moods: ['sunny', 'ecstasy'], room: 'room_restart', note: '重新开始的第一天，用它把房间打扫干净。', listenedAt: '2026-03-09', loops: 6 },
  { title: '丑奴儿', artist: '草东没有派对', year: 2016, genre: 'Rock', format: 'cd', moods: ['anger', 'burn'], room: 'room_campus', note: '如果你喜欢这张，我们大概能聊很久。', listenedAt: '2025-05-18', loops: 11, gateway: true, pinned: true },
  { title: 'Bloom', artist: 'Beach House', year: 2012, genre: 'Dream Pop', format: 'vinyl', moods: ['psych', 'night'], room: 'room_3am', note: '像在水下看路灯。', listenedAt: '2026-02-11', loops: 5 },
  { title: 'async', artist: '坂本龍一', year: 2017, genre: 'Ambient', format: 'digital', moods: ['restraint', 'insomnia'], room: 'room_3am', note: '安静到能听见自己在想什么。', listenedAt: '2026-04-28', loops: 2 },
  { title: 'Remain in Light', artist: 'Talking Heads', year: 1980, genre: 'New Wave', format: 'vinyl', moods: ['ecstasy', 'psych'], room: 'room_restart', note: '身体比脑子先听懂。', listenedAt: '2026-06-06', loops: 3 },
  { title: '冀西南林路行', artist: '万能青年旅店', year: 2020, genre: 'Rock', format: 'cd', moods: ['nostalgia', 'burn'], room: 'room_travel', note: '十年等一张，等到了也没失望。', listenedAt: '2025-12-24', loops: 8, pinned: true },
  { title: 'Blue', artist: 'Joni Mitchell', year: 1971, genre: 'Folk', format: 'vinyl', moods: ['tender', 'lonely'], room: 'room_heartbreak', note: '只在一个人的时候放。', listenedAt: '2025-09-10', loops: 4, side: 'B' },
  { title: 'Selected Ambient Works 85-92', artist: 'Aphex Twin', year: 1992, genre: 'Electronic', format: 'cassette', moods: ['insomnia', 'distant'], room: 'room_3am', note: '凌晨三点的白噪音，带着一点心跳。', listenedAt: '2026-07-19', loops: 2 },
  { title: '华丽的冒险', artist: '陈绮贞', year: 2005, genre: 'Mandopop', format: 'cd', moods: ['sunny', 'tender'], room: 'room_campus', note: '十九岁的时候以为它是写给我的。', listenedAt: '2025-03-15', loops: 5, gateway: true },
  { title: 'To Pimp a Butterfly', artist: 'Kendrick Lamar', year: 2015, genre: 'Hip-Hop', format: 'digital', moods: ['anger', 'burn'], note: '每一次听都像被重新上了一课。', listenedAt: '2026-05-01', loops: 3 },
  { title: 'Long Season', artist: 'Fishmans', year: 1996, genre: 'Japanese Rock', format: 'cassette', moods: ['psych', 'nostalgia'], room: 'room_travel', note: '一首歌长成了一整个夏天。', listenedAt: '2026-08-13', loops: 4 },
  { title: 'Modal Soul', artist: 'Nujabes', year: 2005, genre: 'Jazz Hip-Hop', format: 'vinyl', moods: ['night', 'tender'], note: '写作业时它在，写论文时它还在。', listenedAt: '2026-09-27', loops: 12 },
];

export async function seedIfEmpty() {
  if (getMeta('seeded')) return false;
  for (const room of DEFAULT_ROOMS) await saveRoom({ ...room, desc: '' });
  const made = [];
  let i = 0;
  for (const s of SEEDS) {
    const { memories = [], ...rest } = s;
    // 固定 id：即使播种中途被刷新打断，再次播种也只会覆盖，不会出现重复唱片
    const rec = blankRecord({
      ...rest,
      id: 'seed_' + i,
      seed: true,
      palette: paletteFromSeed(s.title + s.artist),
      listenedAt: iso(at(s.listenedAt, s.title)),
      addedAt: at(s.listenedAt, s.title + '+').getTime() + i++,
      memories: memories.map((text, k) => ({ id: uid('m_'), at: at(s.listenedAt, s.title + k).getTime() + 86400000 * (3 + k * 5), text, mood: s.moods[0] })),
      loopLog: [],
      viz: { style: ['sculpture', 'orbit', 'particle', 'liquid'][i % 4], seed: i * 997, intensity: 1 },
    });
    made.push(rec);
    await saveRecord(rec);
  }
  const night = made.filter((r) => r.room === 'room_3am' || r.moods.includes('night')).map((r) => r.id);
  await saveExhibition({ id: 'x_seed_night', title: '十张适合凌晨听的专辑', statement: '天亮之前，世界只剩下耳机里的人。', recordIds: night, createdAt: Date.now() });
  await saveExhibition({ id: 'x_seed_gateway', title: '我的入坑专辑', statement: '如果你想了解我，从这几张开始。', recordIds: made.filter((r) => r.gateway).map((r) => r.id), createdAt: Date.now() - 1000 });
  await setMeta('seeded', true);
  await setMeta('demo', true);
  return true;
}

// 后台为示例唱片匹配真实封面（联网可用时）
export async function enrichSeedCovers() {
  const targets = records().filter((r) => r.seed && !r.coverUrl && !r.enrichTried);
  for (const r of targets) {
    try {
      const res = await searchCatalog(`${r.artist} ${r.title}`, 'album');
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
      const hit = res.find((x) => norm(x.title).includes(norm(r.title).slice(0, 8)) && norm(x.artist).includes(norm(r.artist).slice(0, 4))) || null;
      if (hit?.coverUrl) {
        const pal = await extractPalette(hit.coverUrl);
        await patchRecord(r.id, { coverUrl: hit.coverUrl, coverSource: 'itunes', itunesId: hit.itunesId, palette: pal || r.palette, enrichTried: true });
      } else {
        await patchRecord(r.id, { enrichTried: true });
      }
    } catch {
      return; // 离线：保留生成式封面
    }
  }
}
