// 小屋：布置自己的房间，把唱片放上唱机，沉浸式聆听
import '../styles/house.css';
import { records, getMeta, setMeta, patchRecord, profile, getRecord, track } from '../lib/store.js';
import { $, $$, esc, toast } from '../lib/ui.js';
import { coverOf } from '../lib/color.js';
import { moodById } from '../lib/constants.js';
import { findPreview } from '../lib/catalog.js';
import { fetchLyrics, albumTracks } from '../lib/lyrics.js';
import { SoundDriver } from '../lib/audio.js';
import { createHouse, WALLS, FLOORS, TIMES, FURNITURE, DEFAULT_HOUSE, randomHouse, floorTexture } from '../three/house.js';

const TABS = [['space', '墙与地'], ['light', '光线'], ['furniture', '家具'], ['frames', '挂画']];

export async function mount(view, { query }) {
  view.className = 'house-view';
  const all = records();
  const shelfRecs = [...all].sort((a, b) => (a.side === 'B') - (b.side === 'B') || b.addedAt - a.addedAt);
  const saved = getMeta('house') || {};
  let cfg = { ...DEFAULT_HOUSE, name: profile().name || '', ...saved };
  let tab = 'space';
  let panelOpen = window.innerWidth > 860;
  let current = null;
  let subTimer = null;
  let raf = 0;
  const driver = new SoundDriver();

  view.innerHTML = `
    <section class="house" id="house" aria-label="我的小屋">
      <div class="house-stage" id="stage"></div>
      <div class="house-shade" aria-hidden="true"></div>

      <header class="house-title">
        <input id="hname" class="house-name" maxlength="16" value="${esc(cfg.name)}" placeholder="给小屋起个名字" aria-label="小屋的名字">
        <p>柜子里有 ${all.length} 张唱片。点一张放上唱机，拖动可以绕着房间看。</p>
      </header>

      <aside class="house-panel ${panelOpen ? 'open' : ''}" id="panel" aria-label="布置小屋">
        <div class="bezel"><div class="bezel-core">
          <span class="hp-grab" id="grab" aria-hidden="true"></span>
          <div class="hp-head"><b>布置</b><span class="hp-saved" id="saved">已自动保存</span></div>
          <div class="hp-tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" data-tab="${id}">${l}</button>`).join('')}</div>
          <div class="hp-body" id="pbody"></div>
          <div class="hp-foot">
            <button class="btn sm" id="shuffle">随机布置</button>
            <button class="btn sm ghost" id="resetv">回到全景</button>
          </div>
        </div></div>
      </aside>
      <button class="house-fab" id="fab" aria-expanded="${panelOpen}">布置</button>

      <div class="crate" id="crate" aria-label="唱片柜">
        <div class="crate-row">${shelfRecs.map((r) => `<button class="crate-item" data-id="${r.id}" title="${esc(r.title)} - ${esc(r.artist)}"><img src="${esc(coverOf(r))}" alt="${esc(r.title)} 的封面" loading="lazy"></button>`).join('')}</div>
      </div>

      <div class="spine-tip" id="tip" role="tooltip"></div>

      <div class="listen" id="listen" aria-hidden="true">
        <div class="lb lb-top"></div><div class="lb lb-bot"></div>
        <p class="subtitle" id="sub" aria-live="polite"><span class="sub-l" id="sub-l"></span><small class="sub-n" id="sub-n"></small></p>
        <div class="np" id="np">
          <img id="np-cover" alt="">
          <div class="np-meta"><b id="np-title"></b><span id="np-artist"></span>
            <div class="np-bar"><i id="np-prog"></i></div>
            <small id="np-src"></small></div>
          <div class="np-ctl">
            <button class="np-btn" id="np-prev" aria-label="上一张"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg></button>
            <button class="np-btn big" id="np-toggle" aria-label="暂停"><svg viewBox="0 0 24 24" id="np-icon"><path d="M8 5v14M16 5v14"/></svg></button>
            <button class="np-btn" id="np-next" aria-label="下一张"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l9 6-9 6z"/></svg></button>
          </div>
          <button class="np-exit" id="np-exit">离开唱机 <kbd>Esc</kbd></button>
        </div>
      </div>
    </section>`;

  const stage = $('#stage');
  const house = createHouse(stage, {
    config: cfg,
    records: shelfRecs,
    onPick: (p) => {
      const tip = $('#tip');
      if (p.type === 'hover') {
        if (!p.rec) { tip.classList.remove('show'); return; }
        tip.innerHTML = `<b>${esc(p.rec.title)}</b><span>${esc(p.rec.artist)}${p.rec.year ? '，' + p.rec.year : ''}</span>`;
        tip.style.transform = `translate(${p.x + 14}px, ${p.y - 10}px)`;
        tip.classList.add('show');
        return;
      }
      tip.classList.remove('show');
      if (p.type === 'record' && p.rec) listen(p.rec);
      else if (p.type === 'turntable') listen(current || shelfRecs[0]);
      else if (p.type === 'frame') { setTab('frames'); openPanel(true); }
    },
  });

  // ---------- 布置面板 ----------
  const swatch = (on, attrs, inner, label) => `<button class="sw ${on ? 'on' : ''}" ${attrs} aria-pressed="${on}"><span class="sw-chip">${inner}</span><span class="sw-l">${label}</span></button>`;
  const floorThumb = (id) => { const c = floorTexture(id).userData.canvas; return c.toDataURL('image/jpeg', 0.7); };
  const floorThumbs = Object.fromEntries(FLOORS.map((f) => [f.id, floorThumb(f.id)]));
  const SKY = { dawn: 'linear-gradient(#9fb4d6,#f6c9b0)', day: 'linear-gradient(#a9c4da,#e8eef0)', dusk: 'linear-gradient(#5b4a78,#ff9d5c)', night: 'linear-gradient(#070a14,#1b2440)' };

  function body() {
    if (tab === 'space') {
      return `<div class="hp-group"><h4>墙面</h4><div class="sw-grid">${WALLS.map((w) => swatch(cfg.wall === w.id, `data-k="wall" data-v="${w.id}"`, `<i style="background:${w.c}"></i>`, w.label)).join('')}</div>
        <label class="hp-toggle"><input type="checkbox" id="wains" ${cfg.wainscot ? 'checked' : ''}><span></span>护墙板</label></div>
        <div class="hp-group"><h4>地面</h4><div class="sw-grid four">${FLOORS.map((f) => swatch(cfg.floor === f.id, `data-k="floor" data-v="${f.id}"`, `<i style="background-image:url(${floorThumbs[f.id]})"></i>`, f.label)).join('')}</div></div>`;
    }
    if (tab === 'light') {
      return `<div class="hp-group"><h4>窗外是几点</h4><div class="time-list">${TIMES.map((t) => `<button class="time ${cfg.time === t.id ? 'on' : ''}" data-k="time" data-v="${t.id}" aria-pressed="${cfg.time === t.id}"><i style="background:${SKY[t.id]}"></i><b>${t.label}</b><span>${t.en}</span></button>`).join('')}</div>
        <p class="hp-note">黄昏和深夜会点亮落地灯与画灯。聆听时房间会自己暗下来。</p></div>`;
    }
    if (tab === 'furniture') {
      return Object.entries(FURNITURE).map(([k, f]) => `<div class="hp-row"><span>${f.label}</span><div class="opt">${f.opts.map(([id, l]) => `<button class="${cfg[k] === id ? 'on' : ''} ${id === 'none' ? 'none' : ''}" data-k="${k}" data-v="${id}" aria-pressed="${cfg[k] === id}">${l}</button>`).join('')}</div></div>`).join('');
    }
    const sel = cfg.frames || [];
    return `<div class="hp-group"><h4>左墙挂三幅封面</h4><p class="hp-note">按点选顺序挂上去，再点一次取下。没选满时会用置顶唱片补齐。</p>
      <div class="frame-grid">${shelfRecs.filter((r) => r.side !== 'B').map((r) => { const i = sel.indexOf(r.id); return `<button class="fr ${i >= 0 ? 'on' : ''}" data-frame="${r.id}" aria-pressed="${i >= 0}"><img src="${esc(coverOf(r))}" alt="${esc(r.title)}" loading="lazy">${i >= 0 ? `<em>${i + 1}</em>` : ''}</button>`; }).join('')}</div></div>`;
  }
  function setTab(t, anim = t !== tab) {
    tab = t;
    $$('.hp-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    const pb = $('#pbody');
    pb.innerHTML = body();
    pb.classList.remove('enter');
    if (anim) { void pb.offsetWidth; pb.classList.add('enter'); }
  }
  function openPanel(v = !panelOpen) {
    panelOpen = v;
    $('#panel').classList.toggle('open', v);
    $('#fab').setAttribute('aria-expanded', v);
    house.setInset(v && window.innerWidth > 860 ? 380 : 0);
  }
  let saveT = 0;
  function persist(next) {
    cfg = { ...cfg, ...next };
    house.apply(next);
    $('#saved').textContent = '保存中';
    clearTimeout(saveT);
    saveT = setTimeout(async () => { await setMeta('house', cfg); $('#saved').textContent = '已自动保存'; }, 400);
  }
  $('#panel').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) return setTab(t.dataset.tab);
    const o = e.target.closest('[data-k]');
    if (o) { persist({ [o.dataset.k]: o.dataset.v }); setTab(tab); return; }
    const f = e.target.closest('[data-frame]');
    if (f) {
      let sel = [...(cfg.frames || [])];
      const id = f.dataset.frame;
      sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-3);
      cfg.frames = sel;
      house.setFrames(sel);
      persist({ frames: sel });
      setTab('frames');
    }
  });
  $('#panel').addEventListener('change', (e) => { if (e.target.id === 'wains') persist({ wainscot: e.target.checked }); });
  $('#shuffle').onclick = () => { persist(randomHouse(cfg)); setTab(tab); };
  $('#resetv').onclick = () => house.resetView();
  $('#fab').onclick = () => openPanel();
  // 抽屉手柄：往下拖超过 80px 就收起
  {
    const panel = $('#panel');
    let y0 = null, dy = 0;
    const grab = $('#grab');
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; panel.classList.add('dragging'); grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; });
    const end = () => { if (y0 == null) return; y0 = null; panel.classList.remove('dragging'); panel.style.transform = ''; if (dy > 80) openPanel(false); };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
  }
  $('#hname').addEventListener('input', (e) => persist({ name: e.target.value.trim() }));
  tab = '';
  setTab('space');
  openPanel(panelOpen);

  // ---------- 唱片柜 ----------
  $('#crate').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) listen(getRecord(b.dataset.id));
  });

  // ---------- 聆听 ----------
  // 字幕：放的是哪首歌，就滚动哪首歌的歌词；情绪和曲名作为括号里的小字批注。
  // 找不到歌词（或是纯音乐）时，才退回到你写的那句话和记忆。
  let lyr = null; // { lines:[{t,text}], synced, t0, start, idx, track }
  let subToken = 0;
  function setSub(text, note) {
    const sub = $('#sub');
    sub.classList.remove('in');
    clearTimeout(sub._t);
    sub._t = setTimeout(() => {
      $('#sub-l').textContent = text;
      $('#sub-n').textContent = note ? `（${note}）` : '';
      sub.classList.add('in');
    }, 380);
  }
  function moodNote(rec, track) {
    const moods = (rec.moods || []).map(moodById).filter(Boolean).map((m) => m.label);
    return [track, moods.join('、')].filter(Boolean).join(' · ');
  }
  function fallbackSubs(rec, why) {
    const lines = [];
    if (rec.note) lines.push(`“${rec.note}”`);
    for (const m of rec.memories || []) lines.push(m.text);
    if (!lines.length) lines.push(`${rec.title}，${rec.artist}${rec.year ? '，' + rec.year : ''}。`);
    let i = 0;
    clearInterval(subTimer);
    const show = () => { setSub(lines[i % lines.length], [why, moodNote(rec)].filter(Boolean).join(' · ')); i++; };
    show();
    subTimer = setInterval(show, 7000);
  }
  async function loadLyrics(rec, track) {
    const my = ++subToken;
    lyr = null;
    clearInterval(subTimer);
    setSub('', moodNote(rec, track.name));
    const L = await fetchLyrics({ name: track.name, artist: track.artist || rec.artist, album: track.album || '', duration: track.duration, strict: true }).catch(() => null);
    if (my !== subToken || current !== rec) return;
    if (!L || L.instrumental || !L.lines.some((l) => l.text)) { fallbackSubs(rec, L?.instrumental ? '纯音乐，没有歌词' : '没找到这首的歌词'); return; }
    const lines = L.lines.filter((l) => l.text);
    // 有时间轴的歌词：从第一句前 1.5 秒开始，跟着播放进度走（暂停时字幕也停）
    const t0 = L.synced ? Math.max(0, lines[0].t - 1.5) : 0;
    lyr = { lines, synced: L.synced, t0, start: performance.now(), idx: -1, note: moodNote(rec, track.name), rec };
  }
  function lyricTick() {
    if (!lyr) return;
    const a = driver.audio;
    const el = a && !a.ended ? a.currentTime : (performance.now() - lyr.start) / 1000;
    if (a && a.paused && !a.ended && a.currentTime === 0) return;
    let i;
    if (lyr.synced) {
      const t = lyr.t0 + el;
      i = -1;
      for (let k = 0; k < lyr.lines.length; k++) { if (lyr.lines[k].t <= t) i = k; else break; }
      if (i < 0) return;
    } else {
      i = Math.floor(el / 4.2) % lyr.lines.length; // 没有时间轴：按平均节奏慢慢翻
    }
    if (i !== lyr.idx) { lyr.idx = i; setSub(lyr.lines[i].text, lyr.note); }
  }

  async function listen(rec) {
    if (!rec) return;
    current = rec;
    openPanel(false);
    $('#tip').classList.remove('show');
    view.classList.add('is-listening');
    $('#listen').setAttribute('aria-hidden', 'false');
    $('#np-cover').src = coverOf(rec);
    $('#np-title').textContent = rec.title;
    $('#np-artist').textContent = rec.artist;
    $('#np-src').textContent = '正在找试听片段';
    $('#np-prog').style.transform = 'scaleX(0)';
    $$('.crate-item').forEach((b) => b.classList.toggle('on', b.dataset.id === rec.id));
    house.enterListen();
    driver.stopAudio();
    driver.setMoods(rec.moods);
    lyr = null; subToken++;
    setSub('', moodNote(rec));
    track('listen', { recordId: rec.id });
    await house.play(rec);
    let url = rec.previewUrl;
    let tr = rec.previewTrack || (rec.kind === 'song' && rec.trackName ? { name: rec.trackName, artist: rec.artist } : null);
    if (!url || !tr) {
      const p = await findPreview(rec.trackName || rec.title, rec.artist);
      if (p?.previewUrl) {
        url = url || p.previewUrl;
        tr = tr || { name: p.trackName, artist: p.artist, album: p.album, duration: p.duration };
        patchRecord(rec.id, { previewUrl: url, previewTrack: tr });
      }
    }
    if (current !== rec) return;
    // 试听片段是哪一首，字幕就用哪一首的歌词；没有试听时，用专辑里真实的一首，不拿专辑名去猜
    if (tr) loadLyrics(rec, tr);
    else {
      const first = rec.kind === 'song' ? null : (await albumTracks(rec).catch(() => []))[0];
      if (current !== rec) return;
      if (rec.kind === 'song' || first) loadLyrics(rec, first ? { name: first.name, artist: first.artist, album: first.album, duration: first.duration } : { name: rec.trackName || rec.title, artist: rec.artist });
      else fallbackSubs(rec, '');
    }
    if (url) {
      try {
        await driver.playUrl(url, 'preview');
        $('#np-src').textContent = `Apple Music 30 秒试听${tr?.name ? ' · ' + tr.name : ''}`;
        setIcon(true);
        if (lyr) lyr.start = performance.now();
      } catch {
        $('#np-src').textContent = '浏览器拦截了自动播放，点一下播放键';
        setIcon(false);
      }
    } else {
      $('#np-src').textContent = '没有找到试听片段，唱机安静地转着';
      setIcon(false);
    }
  }
  function setIcon(playing) {
    $('#np-icon').innerHTML = playing ? '<path d="M8 5v14M16 5v14"/>' : '<path d="M7 5l12 7-12 7z"/>';
    $('#np-toggle').setAttribute('aria-label', playing ? '暂停' : '播放');
  }
  $('#np-toggle').onclick = async () => {
    const a = driver.audio;
    if (a && !a.paused) { a.pause(); house.stopDisc(); setIcon(false); return; }
    if (a) { await a.play(); house.resumeDisc(); setIcon(true); return; }
    if (current?.previewUrl || getRecord(current?.id)?.previewUrl) {
      try { await driver.playUrl(getRecord(current.id).previewUrl, 'preview'); house.resumeDisc(); setIcon(true); $('#np-src').textContent = 'Apple Music 30 秒试听'; } catch { toast('播放失败，请稍后再试'); }
    }
  };
  const step = (d) => { const i = shelfRecs.findIndex((r) => r.id === current?.id); listen(shelfRecs[(i + d + shelfRecs.length) % shelfRecs.length]); };
  $('#np-next').onclick = () => step(1);
  $('#np-prev').onclick = () => step(-1);
  function leave() {
    if (!house.listening) return;
    driver.stopAudio();
    clearInterval(subTimer);
    lyr = null; subToken++;
    view.classList.remove('is-listening');
    $('#listen').setAttribute('aria-hidden', 'true');
    $$('.crate-item').forEach((b) => b.classList.remove('on'));
    house.exitListen();
  }
  $('#np-exit').onclick = leave;
  const onKey = (e) => { if (e.key === 'Escape') leave(); };
  document.addEventListener('keydown', onKey);

  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!house.listening) return;
    const L = driver.update();
    house.setLevel(driver.mode === 'mood' ? { bass: 0, mid: 0, high: 0 } : L);
    const a = driver.audio;
    if (a && a.duration) $('#np-prog').style.transform = `scaleX(${a.currentTime / a.duration})`;
    lyricTick();
  };
  loop();

  if (query.play) {
    const r = getRecord(query.play);
    if (r) setTimeout(() => listen(r), 700);
  }

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(subTimer);
    clearTimeout(saveT);
    document.removeEventListener('keydown', onKey);
    driver.dispose();
    house.dispose();
  };
}
