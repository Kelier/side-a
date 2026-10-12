// 视图共享片段
import { esc, pad } from '../lib/ui.js';
import { coverOf } from '../lib/color.js';
import { moodById } from '../lib/constants.js';

export function recordCard(r, i = null, { link = true } = {}) {
  const tag = link ? 'a' : 'div';
  const href = link ? ` href="#/record/${r.id}"` : '';
  return `<${tag} class="rcard" data-format="${r.format}" data-id="${r.id}"${href} style="--lbl:${r.palette?.[1] || '#ff5a1f'}">
    ${i !== null ? `<span class="no">NO. ${pad(i)}</span>` : ''}
    <div class="sleeve"><div class="disc-peek"></div><img loading="lazy" src="${esc(coverOf(r))}" alt="${esc(r.title)} 封面">
      ${r.side === 'B' ? '<span class="badge bside">B 面</span>' : ''}</div>
    <div class="meta"><div class="t">${esc(r.title)}</div><div class="a">${esc(r.artist)}${r.year ? ' · ' + r.year : ''}</div>
      ${r.note ? `<div class="n">“${esc(r.note)}”</div>` : ''}</div>
  </${tag}>`;
}

export function moodChips(ids = []) {
  return ids.map(moodById).filter(Boolean).map((m) => `<span class="chip on" style="pointer-events:none">${m.label}<small>${m.en}</small></span>`).join('');
}

export function footer() {
  return `<footer class="footer"><span>SIDE A 私人唱片博物馆。收藏你喜欢的音乐，把你的品味变成看得见的作品。</span>
  <span>封面与 30 秒试听来自 Apple Music 公开目录 · 歌词来自 LRCLIB · 数据仅保存在你的浏览器 · <a href="#/lab" style="text-decoration:underline">数据与备份</a></span></footer>`;
}

export function recordPicker(list, currentId) {
  return `<div class="rec-picker">${list.map((r) => `<button data-pick="${r.id}" class="${r.id === currentId ? 'on' : ''}" title="${esc(r.title)} - ${esc(r.artist)}"><img src="${esc(coverOf(r))}" alt=""></button>`).join('')}</div>`;
}
