// 一句话录入：“帮我记录一下 Radiohead 的 OK Computer，我最近一直在听”
// 规则解析（无需联网大模型）：抽出艺术家 / 作品名 / 情绪线索 / 单曲或专辑

import { MOODS } from './constants.js';

const FILLERS = [
  /帮我|麻烦|请|记录一下|记录|收藏一下|收藏|放进唱片架|放进|加入|添加|存一下|存/g,
  /我最近一直在听|最近一直在听|最近在听|一直在听|单曲循环|循环了很久|循环/g,
  /这张专辑|这张唱片|这张|专辑|唱片|这首歌|这首|歌曲/g,
];

const MOOD_HINTS = [
  [/夜|凌晨|深夜|半夜/, 'night'], [/失眠|睡不着/, 'insomnia'], [/孤独|一个人/, 'lonely'],
  [/温柔|治愈/, 'tender'], [/怀旧|以前|小时候|那年/, 'nostalgia'], [/晴|阳光|夏天|白天/, 'sunny'],
  [/迷幻|恍惚/, 'psych'], [/燃|热血|跑步/, 'burn'], [/开心|狂喜|快乐/, 'ecstasy'], [/愤怒|生气/, 'anger'],
];

export function parseSentence(text) {
  const raw = (text || '').trim();
  const out = { raw, kind: 'album', artist: '', title: '', moods: [], loops: 0, term: '' };
  if (!raw) return out;
  if (/首歌|单曲|这首/.test(raw)) out.kind = 'song';
  if (/循环|一直在听|反复/.test(raw)) out.loops = 1;
  for (const [re, id] of MOOD_HINTS) if (re.test(raw) && MOODS.find((m) => m.id === id)) out.moods.push(id);

  // 书名号优先
  const quoted = raw.match(/[《「“"](.+?)[》」”"]/);
  let rest = raw.replace(/[，,。.!！]\s*(我|最近|因为|感觉).*$/, '');
  if (quoted) out.title = quoted[1].trim();

  // “A 的 B” 结构
  const m = rest.replace(/[《》「」“”"]/g, '').match(/(?:记录一下|记录|收藏|添加|加入)?\s*([^的，,]+?)\s*的\s*(.+)$/);
  if (m) {
    out.artist = clean(m[1]);
    if (!out.title) out.title = clean(m[2]);
  } else {
    const dash = rest.match(/^(.+?)\s+(?:-|—|–|by)\s+(.+)$/i);
    if (dash) { out.title = out.title || clean(dash[1]); out.artist = clean(dash[2]); }
  }
  if (!out.title && !out.artist) out.title = clean(rest);
  out.term = [out.artist, out.title].filter(Boolean).join(' ').trim() || clean(raw);
  return out;
}

function clean(s) {
  let t = s || '';
  for (const re of FILLERS) t = t.replace(re, ' ');
  return t.replace(/[，,。.!！?？]/g, ' ').replace(/\s+/g, ' ').trim();
}
