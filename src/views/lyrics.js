// 歌词解剖室：选唱片 → 挑一首歌 → 在真实歌词里划出那几行 → 随机生成作品
import '../styles/lyrics.css';
import { records, getRecord, lyrics, saveLyric, deleteLyric, patchRecord, track, profile, uid } from '../lib/store.js';
import { $, $$, esc, toast, download, canvasToBlob, confirmBox } from '../lib/ui.js';
import { ensureFonts, coverImage } from '../render/kit.js';
import { drawLyric, LYRIC_LAYOUTS, segment, randomArt, describeLyricArt } from '../render/lyric.js';
import { coverOf } from '../lib/color.js';
import { searchCatalog } from '../lib/catalog.js';
import { albumTracks, fetchLyrics, fmtTime } from '../lib/lyrics.js';
import { RATIOS } from '../lib/constants.js';
import { createShuffler, SHUFFLE_BUTTON } from './shuffle.js';

const MAX_LINES = 8;
const MAX_CHARS = 200;
const DICE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';

export async function mount(view, { query }) {
  await ensureFonts();
  const shelf = records();
  const existing = query.id ? lyrics().find((l) => l.id === query.id) : null;

  // 当前来源（唱片架上的唱片，或搜索到的一首歌）
  let src = existing ? getRecord(existing.recordId) : getRecord(query.rec) || shelf[0] || null;
  let tracks = [];
  let cur = null; // 当前曲目
  let lyr = null; // 当前歌词
  let sel = null; // [start, end]
  let img = src ? await coverImage(src) : null;
  let audio = null;
  let history = [];
  let token = 0;

  const L = existing ? { art: {}, ...existing } : {
    id: uid('l_'), recordId: src?.id || null, song: '', artist: '', line: '', lines: [], line2: '', keyword: '', time: '', note: '',
    layout: 'giant', theme: 'ink', art: { bg: 'flat', seed: 1 }, ratio: '3:4', by: profile().name, at: Date.now(),
  };

  view.innerHTML = `
  <div class="lyr">
    <aside class="lyr-src">
      <header class="lyr-head">
        <h1>歌词<em>解剖室</em></h1>
        <p>选一张唱片，挑一首歌，在歌词里划出击中你的那几行。</p>
      </header>
      <form class="lyr-search" id="sform" role="search">
        <input class="input" id="sq" placeholder="搜任意一首歌" aria-label="搜索歌曲" autocomplete="off">
      </form>
      <div class="lyr-results" id="sres"></div>
      <div class="lyr-block">
        <h2>我的唱片架</h2>
        <div class="lyr-covers" id="covers">${shelf.map((r) => `<button data-rec="${r.id}" class="${r.id === src?.id ? 'on' : ''}" title="${esc(r.title)} - ${esc(r.artist)}"><img src="${esc(coverOf(r))}" alt="${esc(r.title)}" loading="lazy"></button>`).join('')}</div>
      </div>
      <div class="lyr-block">
        <h2 id="tl-title">曲目</h2>
        <ol class="lyr-tracks" id="tracks"></ol>
      </div>
      <div class="lyr-block" id="saved"></div>
    </aside>

    <section class="lyr-reader" aria-label="歌词">
      <div class="reader-top" id="rtop"></div>
      <div class="reader-scroll" id="scroll" tabindex="0"></div>
      <div class="reader-foot">
        <span id="selinfo">点一行开始，再点相邻的行可以延长，最多 ${MAX_LINES} 行。</span>
        <button class="btn sm ghost" id="clear" hidden>清除</button>
      </div>
    </section>

    <section class="lyr-make" aria-label="生成">
      <div class="make-bar">
        <div class="layouts" id="layouts">${LYRIC_LAYOUTS.map((l) => `<button data-l="${l.id}">${l.label}</button>`).join('')}</div>
      </div>
      <div class="make-stage"><canvas id="cv" width="1080" height="1440"></canvas></div>
      <div class="make-row">
        ${SHUFFLE_BUTTON('换一种排法')}
        <div class="seg ratios" id="ratios">${RATIOS.map((r) => `<button data-r="${r.id}">${r.id}</button>`).join('')}</div>
      </div>
      <p class="art-cap" id="cap"></p>
      <div class="hist" id="hist" aria-label="生成记录"></div>
      <div class="make-fields">
        <div class="field"><label>放大哪个词</label><div class="tokens" id="tokens"></div></div>
        <div class="field"><label for="note">你自己的注释</label><textarea class="textarea" id="note" maxlength="60" placeholder="这首歌属于我不想解释的那个夏天。">${esc(L.note)}</textarea></div>
      </div>
      <div class="make-actions"><button class="btn solid" id="save">保存</button><button class="btn" id="png">导出图片</button></div>
    </section>
  </div>`;

  const cv = $('#cv');
  const ctx = cv.getContext('2d');

  // ---------- 来源 ----------
  async function pickSource(rec) {
    src = rec;
    L.recordId = rec.id && getRecord(rec.id) ? rec.id : null;
    img = await coverImage(rec);
    $$('#covers button').forEach((b) => b.classList.toggle('on', b.dataset.rec === rec.id));
    $('#tl-title').textContent = rec.kind === 'song' ? '这首歌' : `${rec.title} 的曲目`;
    const my = ++token;
    $('#tracks').innerHTML = Array.from({ length: 6 }, () => '<li class="sk"><i></i><b></b></li>').join('');
    tracks = await albumTracks(rec).catch(() => []);
    if (my !== token) return;
    if (!tracks.length) {
      $('#tracks').innerHTML = `<li class="empty-li">在公开目录里没找到这张唱片的曲目。试试上面的搜索框。</li>`;
      return;
    }
    $('#tracks').innerHTML = tracks.map((t, i) => `<li><button data-t="${i}"><span class="no tnum">${String(t.no || i + 1).padStart(2, '0')}</span><span class="nm">${esc(t.name)}</span><span class="du tnum">${t.duration ? fmtTime(t.duration) : ''}</span></button></li>`).join('');
    const want = existing && !cur ? tracks.findIndex((t) => t.name === existing.song) : rec.trackName ? tracks.findIndex((t) => t.name.toLowerCase() === rec.trackName.toLowerCase()) : rec.kind === 'song' ? 0 : -1;
    if (want >= 0) pickTrack(want);
    else readerEmpty('从左边的曲目里挑一首。');
  }

  async function pickTrack(i) {
    cur = tracks[i];
    $$('#tracks button').forEach((b) => b.classList.toggle('on', Number(b.dataset.t) === i));
    stopAudio();
    sel = null;
    L.song = cur.name; L.artist = cur.artist || src?.artist || '';
    readerTop();
    $('#scroll').innerHTML = `<div class="ly-sk">${Array.from({ length: 12 }, (_, k) => `<i style="width:${40 + ((k * 37) % 50)}%"></i>`).join('')}</div>`;
    const my = ++token;
    lyr = await fetchLyrics({ name: cur.name, artist: cur.artist || src?.artist || '', album: cur.album || src?.title || '', duration: cur.duration });
    if (my !== token) return;
    renderLyrics();
    if (existing && existing.song === cur.name && existing.lines?.length) {
      const start = lyr?.lines?.findIndex((l) => l.text === existing.lines[0]);
      if (start >= 0) setSel([start, start + existing.lines.length - 1], false);
    }
  }

  function readerEmpty(msg) {
    $('#rtop').innerHTML = '';
    $('#scroll').innerHTML = emptyCard('SELECT A TRACK', msg);
  }
  function readerTop() {
    $('#rtop').innerHTML = `<img src="${esc(coverOf(src))}" alt="">
      <div class="rt-meta"><b>${esc(cur.name)}</b><span>${esc(cur.artist || src.artist)}${cur.album ? '，' + esc(cur.album) : ''}</span></div>
      ${cur.previewUrl ? '<button class="pv" id="pv" aria-label="试听"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg><span>试听</span></button>' : ''}`;
    $('#pv')?.addEventListener('click', toggleAudio);
  }
  // 空状态：一张像歌词纸的卡片
  function emptyCard(kicker, title, sub = '', body = '') {
    return `<div class="reader-empty"><div class="re-card">
      <span class="re-kick mono"><i class="re-disc" aria-hidden="true"></i>${kicker}</span>
      <p class="re-title">${title}</p>${sub ? `<p class="re-sub">${sub}</p>` : ''}${body}</div></div>`;
  }
  function renderLyrics() {
    const box = $('#scroll');
    if (!lyr) {
      box.innerHTML = emptyCard('NO LYRICS ON LRCLIB', '这首歌还没有人上传歌词', '把你记得的几句贴进来，一行一句。只会用来排版，不会上传。',
        `<div class="re-sheet"><textarea id="paste" rows="6" placeholder="一行一句&#10;比如：It's been a minute and I'm moving backwards" spellcheck="false"></textarea></div>
        <div class="re-foot"><span class="re-count mono tnum" id="pcount">0 行</span>
          ${navigator.clipboard?.readText ? '<button class="btn sm ghost" id="pclip">从剪贴板粘贴</button>' : ''}
          <button class="btn sm hot" id="usepaste" disabled>用这段 <kbd>⌘↵</kbd></button></div>`);
      const ta = $('#paste');
      const lines = () => ta.value.split(/\n/).map((t) => t.trim()).filter(Boolean);
      const sync = () => { const n = lines().length; $('#pcount').textContent = `${n} 行`; $('#usepaste').disabled = !n; };
      const use = () => {
        if (!lines().length) return;
        lyr = { synced: false, manual: true, lines: ta.value.trim().split(/\n/).map((t) => ({ t: null, text: t.trim() })) };
        renderLyrics();
      };
      ta.oninput = sync;
      ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); use(); } };
      $('#usepaste').onclick = use;
      $('#pclip')?.addEventListener('click', async () => { try { ta.value = await navigator.clipboard.readText(); sync(); ta.focus(); } catch { toast('浏览器没有允许读取剪贴板'); } });
      return;
    }
    if (lyr.instrumental) { box.innerHTML = emptyCard('INSTRUMENTAL', '这是一首纯音乐', '没有歌词可以划。从左边挑另一首吧。'); return; }
    let no = 0; // 没有时间轴的歌词用行号占住左边那一栏，正文永远在第二栏
    box.innerHTML = `<div class="ly-pad"></div>${lyr.lines.map((l, i) => l.text
      ? `<button class="ly" data-i="${i}"><span class="ts tnum">${l.t != null ? fmtTime(l.t) : String(++no).padStart(2, '0')}</span><span class="tx">${esc(l.text)}</span></button>`
      : `<div class="ly-gap" data-i="${i}"></div>`).join('')}<div class="ly-pad"></div>
      <p class="ly-credit">${lyr.manual ? '你贴入的歌词' : `歌词来自 LRCLIB${lyr.synced ? '，带时间轴' : ''}`}。导出时只会用到你选中的几行。</p>`;
    box.scrollTop = 0;
  }

  // ---------- 选择 ----------
  function setSel(range, scroll = true) {
    sel = range;
    // 选区画成一整块：首尾圆角，中间（包括段落空行）连成一片
    $$('.ly, .ly-gap').forEach((b) => {
      const i = Number(b.dataset.i);
      const on = !!sel && i >= sel[0] && i <= sel[1];
      b.classList.toggle('on', on);
      b.classList.toggle('first', on && i === sel[0]);
      b.classList.toggle('last', on && i === sel[1]);
    });
    const lines = sel ? lyr.lines.slice(sel[0], sel[1] + 1).map((l) => l.text).filter(Boolean) : [];
    L.lines = lines;
    L.line = lines.join(lines.some((l) => /[a-z]/i.test(l) && !/[一-鿿]/.test(l)) ? ' / ' : '  ');
    L.time = sel && lyr.lines[sel[0]].t != null ? fmtTime(lyr.lines[sel[0]].t) : '';
    L.context = sel ? {
      before: lyr.lines.slice(Math.max(0, sel[0] - 4), sel[0]).map((l) => l.text).filter(Boolean),
      after: lyr.lines.slice(sel[1] + 1, sel[1] + 7).map((l) => l.text).filter(Boolean),
    } : null;
    const chars = [...L.line].length;
    $('#selinfo').innerHTML = sel ? `已选 <b class="tnum">${lines.length}</b> 行，<b class="tnum">${chars}</b> 字${L.time ? `，从 <b class="tnum">${L.time}</b> 开始` : ''}` : `点一行开始，再点相邻的行可以延长，最多 ${MAX_LINES} 行。`;
    $('#clear').hidden = !sel;
    L.keyword = '';
    tokens();
    paint();
    if (scroll && sel && window.innerWidth <= 1080) $('.lyr-make').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#scroll').addEventListener('click', (e) => {
    const b = e.target.closest('.ly');
    if (!b) return;
    const i = Number(b.dataset.i);
    let next;
    if (!sel) next = [i, i];
    else if (e.shiftKey) next = [Math.min(sel[0], i), Math.max(sel[0], i)];
    else if (i === sel[0] - 1 || (i < sel[0] && !lyr.lines.slice(i + 1, sel[0]).some((l) => l.text))) next = [i, sel[1]];
    else if (i === sel[1] + 1 || (i > sel[1] && !lyr.lines.slice(sel[1] + 1, i).some((l) => l.text))) next = [sel[0], i];
    else if (i >= sel[0] && i <= sel[1]) next = sel[0] === sel[1] ? null : i === sel[0] ? [i + 1, sel[1]] : i === sel[1] ? [sel[0], i - 1] : [i, i];
    else next = [i, i];
    if (next) {
      const count = lyr.lines.slice(next[0], next[1] + 1).filter((l) => l.text).length;
      const chars = lyr.lines.slice(next[0], next[1] + 1).reduce((s, l) => s + [...l.text].length, 0);
      if (count > MAX_LINES || chars > MAX_CHARS) { toast(`最多选 ${MAX_LINES} 行、${MAX_CHARS} 字，只摘你最想留下的部分`); return; }
    }
    setSel(next, false);
  });
  $('#clear').onclick = () => setSel(null);

  // ---------- 试听 ----------
  function stopAudio() { if (audio) { audio.pause(); audio = null; } }
  function toggleAudio() {
    const pv = $('#pv');
    if (audio && !audio.paused) { audio.pause(); pv.classList.remove('on'); pv.querySelector('span').textContent = '试听'; return; }
    if (!audio) { audio = new Audio(cur.previewUrl); audio.onended = () => { pv?.classList.remove('on'); }; }
    audio.play().then(() => { pv.classList.add('on'); pv.querySelector('span').textContent = '暂停'; }).catch(() => toast('播放失败'));
  }

  // ---------- 生成 ----------
  function tokens() {
    const toks = [...new Set(segment(L.line))].slice(0, 24);
    const weight = (t) => (/[\u4e00-\u9fff]/.test(t) ? t.length * 2.2 : t.length) + (/^(the|and|you|that|with|this|your|for)$/i.test(t) ? -5 : 0);
    if (!toks.includes(L.keyword)) L.keyword = toks.slice().sort((x, y) => weight(y) - weight(x))[0] || '';
    $('#tokens').innerHTML = toks.length ? toks.map((t) => `<button data-k="${esc(t)}" class="${t === L.keyword ? 'on' : ''}">${esc(t)}</button>`).join('') : '<span class="hint">选好歌词后，可以换一个词来放大。</span>';
  }
  function size() {
    const r = RATIOS.find((x) => x.id === L.ratio) || RATIOS[0];
    if (cv.width !== r.w || cv.height !== r.h) { cv.width = r.w; cv.height = r.h; }
    return r;
  }
  function paint() {
    const r = size();
    const demo = !L.line;
    const data = demo ? { ...L, line: '在左边的歌词里点一行', lines: ['在左边的歌词里点一行'], keyword: '一行', note: L.note || '' } : L;
    drawLyric(ctx, r.w, r.h, data, src, img);
    if (animateCap) { sh.caption(describeLyricArt(L)); animateCap = false; } else $('#cap').textContent = describeLyricArt(L);
    $$('#layouts button').forEach((b) => b.classList.toggle('on', b.dataset.l === L.layout));
    $$('#ratios button').forEach((b) => b.classList.toggle('on', b.dataset.r === L.ratio));
  }
  function remember() {
    const t = document.createElement('canvas');
    t.width = 96; t.height = Math.round((96 * cv.height) / cv.width);
    t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
    history.unshift({ layout: L.layout, theme: L.theme, art: { ...L.art }, thumb: t.toDataURL('image/jpeg', 0.7) });
    history = history.slice(0, 8);
    $('#hist').innerHTML = history.map((h, i) => `<button data-h="${i}" class="${i === 0 ? 'on' : ''}" aria-label="第 ${i + 1} 版"><img src="${h.thumb}" alt=""></button>`).join('');
  }
  let animateCap = false;
  async function roll() {
    if (!L.line) return toast('先在歌词里选一行');
    await sh.run(() => { Object.assign(L, randomArt(Math.floor(Math.random() * 1e9))); animateCap = true; paint(); });
    remember();
    track('share_generate', { recordId: L.recordId, type: 'lyric', random: true });
  }
  const sh = createShuffler({ stage: $('.make-stage'), canvas: cv, button: $('[data-shuffle]'), caption: $('#cap'), onRoll: () => roll() });
  $('[data-shuffle]').onclick = () => roll();
  $('#hist').onclick = (e) => {
    const b = e.target.closest('[data-h]');
    if (!b) return;
    const h = history[Number(b.dataset.h)];
    $$('#hist button').forEach((x) => x.classList.toggle('on', x === b));
    sh.run(() => { Object.assign(L, { layout: h.layout, theme: h.theme, art: { ...h.art } }); animateCap = true; paint(); }, { fx: 'develop' });
  };
  $('#layouts').onclick = (e) => { const b = e.target.closest('[data-l]'); if (!b || b.dataset.l === L.layout) return; sh.run(() => { L.layout = b.dataset.l; animateCap = true; paint(); }, { fx: 'sleeve' }); };
  $('#ratios').onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b) return; L.ratio = b.dataset.r; paint(); };
  $('#tokens').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; L.keyword = b.dataset.k; tokens(); paint(); };
  $('#note').oninput = (e) => { L.note = e.target.value; paint(); };

  $('#save').onclick = async () => {
    if (!L.line) return toast('先在歌词里选一行');
    L.at = Date.now();
    await saveLyric({ ...L });
    track('share_generate', { recordId: L.recordId, type: 'lyric' });
    toast('已保存到歌词解剖室');
    savedList();
  };
  $('#png').onclick = async () => {
    if (!L.line) return toast('先在歌词里选一行');
    const blob = await canvasToBlob(cv);
    download(blob, `SIDE-A_lyric_${(L.keyword || 'line').slice(0, 12)}.png`);
    await saveLyric({ ...L, at: Date.now() });
    if (L.recordId) await patchRecord(L.recordId, (r) => ({ shares: [...(r.shares || []), { type: 'lyric', edition: L.layout, at: Date.now() }] }));
    track('share_export', { recordId: L.recordId, type: 'lyric' });
    toast('已导出，并保存了一份');
    savedList();
  };

  function savedList() {
    const list = lyrics().slice().sort((a, b) => b.at - a.at);
    $('#saved').innerHTML = list.length ? `<h2>我的歌词作品</h2><ul class="saved">${list.map((l) => {
      const r = getRecord(l.recordId);
      return `<li>${r ? `<img src="${esc(coverOf(r))}" alt="">` : '<i></i>'}<a href="#/lyrics?id=${l.id}">${esc((l.lines?.[0] || l.line || '').slice(0, 22))}<small>${esc(l.song || r?.title || '')}</small></a><button data-del="${l.id}" aria-label="删除">删除</button></li>`;
    }).join('')}</ul>` : '';
  }
  $('#saved').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (b && await confirmBox('删除这件歌词作品？', '删除')) { await deleteLyric(b.dataset.del); savedList(); }
  });

  // ---------- 搜索 ----------
  $('#sform').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('#sq').value.trim();
    if (!q) return;
    const box = $('#sres');
    box.innerHTML = '<div class="res-sk"><i></i><i></i><i></i></div>';
    try {
      const res = await searchCatalog(q, 'song');
      box.innerHTML = res.length ? res.slice(0, 6).map((r, i) => `<button data-s="${i}"><img src="${esc(r.thumb || r.coverUrl)}" alt=""><span><b>${esc(r.title)}</b><small>${esc(r.artist)}${r.album ? '，' + esc(r.album) : ''}</small></span></button>`).join('') : '<p class="hint">没有找到，换个写法试试。</p>';
      box.onclick = (ev) => {
        const b = ev.target.closest('[data-s]');
        if (!b) return;
        const r = res[Number(b.dataset.s)];
        box.innerHTML = '';
        const mine = shelf.find((x) => x.title.toLowerCase() === (r.album || '').toLowerCase() && x.artist === r.artist);
        pickSource({ ...r, id: mine?.id || null, kind: 'song', cover: null, palette: mine?.palette || [] });
      };
    } catch {
      box.innerHTML = '<p class="hint">网络不太顺，稍后再试。</p>';
    }
  };
  $('#covers').onclick = (e) => { const b = e.target.closest('[data-rec]'); if (b) pickSource(getRecord(b.dataset.rec)); };
  $('#tracks').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) pickTrack(Number(b.dataset.t)); };

  savedList();
  tokens();
  paint();
  if (src) pickSource(src);
  else readerEmpty('唱片架还是空的。搜一首歌开始吧。');

  return () => { stopAudio(); token++; sh.dispose(); };
}
