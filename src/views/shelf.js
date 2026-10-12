// 一生的唱片架：Shelf / Timeline / Galaxy / Notes
import { records, rooms, getRoom } from '../lib/store.js';
import { $, $$, esc, go, fmtDate } from '../lib/ui.js';
import { coverOf } from '../lib/color.js';
import { MOODS, moodById, formatById } from '../lib/constants.js';
import { createShelf } from '../three/shelf.js';
import { createGalaxy } from '../three/galaxy.js';
import { createCrateFlip } from './crateflip.js';
import '../styles/shelf.css';

const GALAXY_MIN = 8;

export async function mount(view, { query }) {
  let mode = query.view || 'shelf';
  const f = { sort: query.sort || 'added', decade: '', mood: query.mood || '', artist: '', room: query.room || '', side: '' };
  let inst = null;
  // 手机和桌面是两套场景：桌面是立体柜子，手机是一只可以翻找的唱片箱
  const mq = window.matchMedia('(max-width: 860px)');
  let isM = mq.matches;

  const all = records();
  const decades = [...new Set(all.map((r) => r.year && Math.floor(r.year / 10) * 10).filter(Boolean))].sort();
  const artists = [...new Set(all.map((r) => r.artist).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const MODES = [['shelf', 'Shelf', '唱片架'], ['timeline', 'Timeline', '时间线'], ['galaxy', 'Galaxy', '星系'], ['notes', 'Notes', '品味注释']];
  view.innerHTML = `<div class="shelf-page ${isM ? 'is-m' : ''}" id="spage">
    <div class="shelf-bar">
      <div class="seg" id="modes">
        ${MODES.map(([m, en, zh]) => `<button data-m="${m}"><span class="m-en">${en}<small>${zh}</small></span><span class="m-zh">${zh.replace('品味', '')}</span></button>`).join('')}
      </div>
      <div class="filters" id="filters" role="toolbar" aria-label="筛选"></div>
    </div>
    <div class="stage" id="stage"></div>
    <div class="shelf-hud" id="hud"></div>
    <div class="focus-card" id="focus"></div>
  </div>
  <div class="msheet" id="msheet" aria-hidden="true"><div class="ms-veil" data-close></div>
    <div class="ms-panel" role="dialog" aria-label="筛选与排列"><div class="ms-core" id="mscore"></div></div></div>`;

  const stage = $('#stage');

  // ---------- 筛选：胶囊 + 弹出面板 ----------
  const count = (fn) => all.filter(fn).length;
  const FILTERS = [
    { key: 'sort', label: '排列', kind: 'list', opts: [['added', '按收藏时间', '每年一格'], ['year', '按发行年份', '每个年代一格'], ['artist', '按艺术家', '首字母分格'], ['mood', '按情绪', '每种情绪一格'], ['format', '按形态', '黑胶、CD、磁带分开放']], always: true },
    { key: 'decade', label: '年代', kind: 'chips', all: '全部年代', opts: decades.map((d) => [String(d), `${d}s`, count((r) => r.year && Math.floor(r.year / 10) * 10 === d)]) },
    { key: 'mood', label: '情绪', kind: 'chips', all: '全部情绪', opts: MOODS.map((m) => [m.id, m.label, count((r) => r.moods.includes(m.id)), `hsl(${m.hue} 55% 55%)`]).filter((o) => o[2]) },
    { key: 'artist', label: '艺术家', kind: 'search', all: '全部艺术家', opts: artists.map((a) => [a, a, count((r) => r.artist === a), coverOf(all.find((r) => r.artist === a))]) },
    { key: 'room', label: '人生阶段', kind: 'chips', all: '全部阶段', opts: rooms().map((r) => [r.id, r.name, count((x) => x.room === r.id), r.color]).filter((o) => o[2]) },
    { key: 'side', label: 'A / B 面', kind: 'list', all: 'A 面和 B 面', opts: [['A', '只看 A 面', '会出现在分享里的'], ['B', '只看 B 面', '只属于你自己的']] },
  ];
  let openKey = null;
  const valueLabel = (F) => { const o = F.opts.find((x) => x[0] === String(f[F.key])); return o ? o[1] : F.all; };
  function drawFilters() {
    if (isM) { drawMobileBar(); return; }
    const active = FILTERS.filter((F) => !F.always && f[F.key]).length;
    $('#filters').innerHTML = FILTERS.map((F) => `<div class="fwrap"><button class="fpill ${!F.always && f[F.key] ? 'on' : ''} ${openKey === F.key ? 'open' : ''}" data-open="${F.key}" aria-expanded="${openKey === F.key}"><small>${F.label}</small><span>${esc(valueLabel(F))}</span><i aria-hidden="true"></i></button>${openKey === F.key ? pop(F) : ''}</div>`).join('')
      + `<span class="fcount tnum">${filtered().length} 张</span>${active ? '<button class="fclear" id="fclear">清除筛选</button>' : ''}`;
    const q = $('#fq');
    if (q) { q.focus(); q.oninput = () => { const v = q.value.trim().toLowerCase(); $$('.fpop [data-v]').forEach((b) => { b.hidden = b.dataset.v && !b.dataset.v.toLowerCase().includes(v); }); }; }
  }
  function pop(F) {
    const cur = String(f[F.key] || '');
    if (F.kind === 'list') return `<div class="fpop list" role="listbox">${F.all ? `<button data-k="${F.key}" data-v="" class="${!cur ? 'on' : ''}"><b>${F.all}</b></button>` : ''}${F.opts.map(([v, l, d]) => `<button data-k="${F.key}" data-v="${esc(v)}" class="${cur === v ? 'on' : ''}"><b>${esc(l)}</b><small>${esc(d)}</small></button>`).join('')}</div>`;
    if (F.kind === 'search') return `<div class="fpop search"><input id="fq" class="input" placeholder="搜艺术家" autocomplete="off"><div class="fscroll"><button data-k="${F.key}" data-v="" class="${!cur ? 'on' : ''}"><b>${F.all}</b></button>${F.opts.map(([v, l, n, img]) => `<button data-k="${F.key}" data-v="${esc(v)}" class="${cur === v ? 'on' : ''}"><img src="${esc(img)}" alt=""><b>${esc(l)}</b><span class="tnum">${n}</span></button>`).join('')}</div></div>`;
    return `<div class="fpop chips"><button data-k="${F.key}" data-v="" class="${!cur ? 'on' : ''}">${F.all}</button>${F.opts.map(([v, l, n, c]) => `<button data-k="${F.key}" data-v="${esc(v)}" class="${cur === v ? 'on' : ''}" ${c ? `style="--c:${c}"` : ''}>${c ? '<i></i>' : ''}${esc(l)}<span class="tnum">${n}</span></button>`).join('') || '<p class="hint">还没有可选的项。</p>'}</div>`;
  }
  $('#filters').addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet]')) { openSheet(); return; }
    const o = e.target.closest('[data-open]');
    if (o) { openKey = openKey === o.dataset.open ? null : o.dataset.open; drawFilters(); return; }
    const v = e.target.closest('[data-k]');
    if (v) { f[v.dataset.k] = v.dataset.v; openKey = null; drawFilters(); render(); return; }
    if (e.target.id === 'fclear') { Object.assign(f, { decade: '', mood: '', artist: '', room: '', side: '' }); openKey = null; drawFilters(); render(); }
  });
  const closePop = (e) => { if (openKey && !e.target.closest('.fwrap')) { openKey = null; drawFilters(); } };
  const escPop = (e) => { if (e.key === 'Escape' && openKey) { openKey = null; drawFilters(); } };
  document.addEventListener('pointerdown', closePop);
  document.addEventListener('keydown', escPop);

  // ---------- 手机：一个“筛选”按钮 + 底部抽屉 ----------
  const SORT = FILTERS[0];
  let draft = null;
  const activeCount = (o) => FILTERS.filter((F) => !F.always && o[F.key]).length;
  function drawMobileBar() {
    const n = activeCount(f);
    $('#filters').innerHTML = `<div class="mfbar">
      <button class="mfbtn" data-sheet><svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>筛选${n ? `<em>${n}</em>` : ''}</button>
      <button class="mfbtn" data-sheet><small>排列</small>${esc(valueLabel(SORT).replace('按', ''))}</button>
      <span class="fcount tnum">${filtered().length} 张</span></div>`;
  }
  function sheetBody() {
    const o = draft;
    const sec = (F, inner) => `<section class="ms-sec"><h5>${F.label}<small>${F.key.toUpperCase()}</small></h5>${inner}</section>`;
    const chip = (F, v, l, extra = '', n) => `<button data-mk="${F.key}" data-v="${esc(v)}" class="${String(o[F.key] || '') === v ? 'on' : ''}" ${extra}>${l}${n != null ? `<span class="tnum">${n}</span>` : ''}</button>`;
    const n = filtered(o).length;
    return `<span class="ms-grab" data-grab aria-hidden="true"></span>
      <div class="ms-head" data-grab><b>翻找唱片</b>${activeCount(o) ? '<button data-mclear>清除筛选</button>' : ''}</div>
      <div class="ms-body">
        ${sec(SORT, `<div class="ms-sort">${SORT.opts.map(([v, l, d]) => `<button data-mk="sort" data-v="${v}" class="${o.sort === v ? 'on' : ''}"><b>${l}</b><small>${d}</small></button>`).join('')}</div>`)}
        ${FILTERS.slice(1).filter((F) => F.opts.length).map((F) => sec(F, `<div class="ms-chips ${F.kind === 'search' ? 'scroll' : ''}">${chip(F, '', F.all.replace('全部', '全部'))}${F.opts.map((x) => {
          if (F.kind === 'search') return chip(F, x[0], `<img src="${esc(x[3])}" alt="">${esc(x[1])}`, '', x[2]);
          if (F.kind === 'list') return chip(F, x[0], esc(x[1].replace('只看 ', '')));
          return chip(F, x[0], `${x[3] ? '<i></i>' : ''}${esc(x[1])}`, x[3] ? `style="--c:${x[3]}"` : '', x[2]);
        }).join('')}</div>`)).join('')}
      </div>
      <div class="ms-foot"><button class="btn ghost" data-close>取消</button><button class="btn hot" data-apply ${n ? '' : 'disabled'}>${n ? `看这 ${n} 张` : '没有符合的唱片'}</button></div>`;
  }
  const sheet = $('#msheet');
  function openSheet() {
    draft = { ...f };
    $('#mscore').innerHTML = sheetBody();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
  }
  function closeSheet(apply) {
    if (apply && draft) { Object.assign(f, draft); drawFilters(); render(); }
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.querySelector('.ms-panel').style.transform = '';
  }
  function redrawSheet() {
    const body = $('#mscore .ms-body');
    const top = body?.scrollTop || 0;
    const xs = [...sheet.querySelectorAll('.ms-chips.scroll')].map((e) => e.scrollLeft);
    $('#mscore').innerHTML = sheetBody();
    $('#mscore .ms-body').scrollTop = top;
    sheet.querySelectorAll('.ms-chips.scroll').forEach((e, i) => (e.scrollLeft = xs[i] || 0));
  }
  sheet.addEventListener('click', (e) => {
    const c = e.target.closest('[data-mk]');
    if (c) { draft[c.dataset.mk] = c.dataset.v; redrawSheet(); return; }
    if (e.target.closest('[data-mclear]')) { Object.assign(draft, { decade: '', mood: '', artist: '', room: '', side: '' }); redrawSheet(); return; }
    if (e.target.closest('[data-apply]')) { closeSheet(true); return; }
    if (e.target.closest('[data-close]')) closeSheet(false);
  });
  // 往下拖抽屉的把手可以收起
  let sd = null;
  sheet.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-grab]')) { sd = e.clientY; sheet.classList.add('dragging'); e.target.setPointerCapture?.(e.pointerId); } });
  sheet.addEventListener('pointermove', (e) => { if (sd == null) return; sheet.querySelector('.ms-panel').style.transform = `translateY(${Math.max(0, e.clientY - sd)}px)`; });
  const endDrag = (e) => { if (sd == null) return; const dy = e.clientY - sd; sd = null; sheet.classList.remove('dragging'); if (dy > 90) closeSheet(false); else sheet.querySelector('.ms-panel').style.transform = ''; };
  sheet.addEventListener('pointerup', endDrag);
  sheet.addEventListener('pointercancel', endDrag);

  function filtered(o = f) {
    let list = records().filter((r) =>
      (!o.decade || (r.year && Math.floor(r.year / 10) * 10 === Number(o.decade))) &&
      (!o.mood || r.moods.includes(o.mood)) && (!o.artist || r.artist === o.artist) &&
      (!o.room || r.room === o.room) && (!o.side || r.side === o.side));
    const by = {
      added: (a, b) => a.addedAt - b.addedAt,
      year: (a, b) => (a.year || 9999) - (b.year || 9999),
      artist: (a, b) => a.artist.localeCompare(b.artist),
      mood: (a, b) => (a.moods[0] || 'zz').localeCompare(b.moods[0] || 'zz'),
      format: (a, b) => a.format.localeCompare(b.format),
    }[o.sort];
    return [...list].sort(by);
  }
  function groupFn() {
    if (f.sort === 'year') return (r) => { const d = r.year ? Math.floor(r.year / 10) * 10 : 0; return { key: d, label: d ? `${d}s` : '-', sub: 'DECADE' }; };
    if (f.sort === 'mood') return (r) => { const m = moodById(r.moods[0]); return { key: m?.id || '-', label: m?.label || '未标注', sub: m?.en || 'UNTAGGED' }; };
    if (f.sort === 'format') return (r) => { const x = formatById(r.format); return { key: x.id, label: x.label, sub: x.en }; };
    if (f.sort === 'artist') return (r) => { const c = (r.artist || '#')[0].toUpperCase(); return { key: c, label: c, sub: 'ARTIST' }; };
    return (r) => { const d = new Date(r.listenedAt || r.addedAt); return { key: d.getFullYear(), label: String(d.getFullYear()), sub: 'ACQUIRED' }; };
  }

  function showFocus(rec) {
    const box = $('#focus');
    if (!rec) { box.classList.remove('show'); return; }
    const room = getRoom(rec.room);
    box.innerHTML = `<span class="mono dimmer">${esc(formatById(rec.format).en)} · ${rec.year || '-'}${room ? ' · ' + esc(room.name) : ''}</span>
      <h3>${esc(rec.title)}</h3><div class="dim">${esc(rec.artist)}</div>
      ${rec.note ? `<div class="n">“${esc(rec.note)}”</div>` : ''}
      <div class="mono dimmer" style="margin-bottom:14px">收藏于 ${fmtDate(rec.addedAt)}${rec.loops ? ` · 循环记录 ${rec.loops} 次` : ''} · ${rec.memories.length} 条记忆</div>
      <div class="row"><a class="btn solid sm" href="#/record/${rec.id}">打开唱片</a><a class="btn sm hot" href="#/house?play=${rec.id}">▶ 在小屋里播放</a>${mode === 'shelf' ? '<button class="btn ghost sm" id="putback">放回</button>' : ''}</div>`;
    box.classList.add('show');
    $('#putback')?.addEventListener('click', () => { inst?.putBack?.(); box.classList.remove('show'); });
  }

  function hud(text) { $('#hud').innerHTML = `<span class="mono">${text}</span>`; }

  function render() {
    inst?.dispose?.();
    inst = null;
    stage.innerHTML = '';
    stage.style.overflowY = '';
    stage.classList.remove('is-galaxy');
    showFocus(null);
    $$('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    $('#filters').style.display = mode === 'galaxy' ? 'none' : '';
    const list = filtered();
    if (mode === 'shelf') {
      if (!list.length) { stage.innerHTML = `<div class="empty-stage"><div><h3 class="serif" style="font-size:40px;margin:0">这一层还是空的</h3><p>调整筛选，或者 <a class="accent" href="#/add">放入一张唱片</a></p></div></div>`; hud(''); return; }
      inst = isM ? createCrateFlip(stage, { onFocus: showFocus }) : createShelf(stage, { onFocus: showFocus });
      inst.setRecords(list, { groupBy: groupFn() });
      hud(isM ? '' : `${list.length} RECORDS · 拖动 / 滚轮浏览 · 悬停抽出 · 点击展示`);
      if (query.focus) { inst.focusById(query.focus); query.focus = null; }
    } else if (mode === 'galaxy') {
      const pool = records().filter((r) => !f.side || r.side === f.side);
      if (pool.length < GALAXY_MIN) {
        stage.innerHTML = `<div class="empty-stage"><div style="max-width:420px"><span class="mono accent">LOCKED · ${pool.length} / ${GALAXY_MIN}</span><h3 class="serif" style="font-size:44px;margin:10px 0">星系还太空了</h3><p>收藏满 ${GALAXY_MIN} 张唱片后，相似的艺术家、流派、情绪和年代会在空间里彼此吸引，形成你自己的音乐星系。</p><div class="progress" style="margin:20px 0"><i style="width:${(pool.length / GALAXY_MIN) * 100}%"></i></div><a class="btn hot" href="#/add">继续收藏</a></div></div>`;
        hud('');
        return;
      }
      stage.classList.add('is-galaxy');
      inst = createGalaxy(stage, pool, { onFocus: showFocus, topInset: $('.shelf-bar').offsetHeight + 10 });
      hud(`${pool.length} STARS · 连线 = 同一艺术家 / 流派 / 情绪 / 年代 / 人生阶段 · 拖动旋转 · 点击靠近`);
    } else if (mode === 'timeline') {
      stage.style.overflowY = 'auto';
      const byYear = new Map();
      [...list].sort((a, b) => new Date(b.listenedAt || b.addedAt) - new Date(a.listenedAt || a.addedAt)).forEach((r) => {
        const y = new Date(r.listenedAt || r.addedAt).getFullYear();
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(r);
      });
      stage.innerHTML = `<div class="timeline">${[...byYear].map(([y, rs]) => `<div class="tl-year"><h3>${y}<small>${rs.length} RECORDS</small></h3><div class="tl-items">${rs.map((r) => `
        <a class="tl-item" href="#/record/${r.id}" style="--c:${r.palette?.[1] || '#efe9dc'}"><img src="${esc(coverOf(r))}" alt="" loading="lazy">
          <div><div class="mono dimmer">${fmtDate(r.listenedAt || r.addedAt)} · ${esc(formatById(r.format).label)}${r.room ? ' · ' + esc(getRoom(r.room)?.name || '') : ''}</div><div class="t">${esc(r.title)} <span class="dim" style="font-weight:400">- ${esc(r.artist)}</span></div>${r.note ? `<div class="n">“${esc(r.note)}”</div>` : ''}</div>
          <div class="chips">${r.moods.map((m) => `<span class="chip" style="pointer-events:none">${moodById(m)?.label}</span>`).join('')}</div></a>`).join('')}</div></div>`).join('') || '<div class="empty"><h3>时间线还是空的</h3></div>'}</div>`;
      hud(`${list.length} RECORDS · 按收藏日期回看你的音乐人生`);
    } else if (mode === 'notes') {
      stage.style.overflowY = 'auto';
      const withNotes = list.filter((r) => r.note).reverse();
      stage.innerHTML = `<div class="page" style="padding-top:${isM ? 130 : 100}px"><div class="page-head"><div><span class="mono dimmer">TASTE NOTES · ${withNotes.length}</span><h1>一句话<em>证明</em>品味</h1><p>真正让人产生兴趣的不是专辑，而是你为什么喜欢它。这些句子会慢慢长成你自己的语言风格。</p></div></div>
        <div style="columns:3 300px;column-gap:40px">${withNotes.map((r) => `<a href="#/record/${r.id}" style="break-inside:avoid;display:block;margin-bottom:44px">
          <p class="serif" style="font-size:30px;line-height:1.15;margin:0 0 14px">“${esc(r.note)}”</p>
          <div class="row" style="gap:10px"><img src="${esc(coverOf(r))}" style="width:36px;height:36px;object-fit:cover" alt=""><div><div style="font-size:13px;font-weight:600">${esc(r.title)}</div><div class="dimmer" style="font-size:12px">${esc(r.artist)}</div></div></div></a>`).join('')}</div></div>`;
      hud('');
    }
  }

  $('#modes').onclick = (e) => {
    const b = e.target.closest('[data-m]');
    if (!b || b.dataset.m === mode) return;
    mode = b.dataset.m;
    history.replaceState(null, '', `#/shelf?view=${mode}`);
    render();
  };
  const onMq = () => {
    isM = mq.matches;
    $('#spage').classList.toggle('is-m', isM);
    openKey = null;
    closeSheet(false);
    drawFilters();
    render();
  };
  mq.addEventListener('change', onMq);
  drawFilters();
  render();
  return () => {
    mq.removeEventListener('change', onMq); inst?.dispose?.(); document.removeEventListener('pointerdown', closePop); document.removeEventListener('keydown', escPop); };
}
