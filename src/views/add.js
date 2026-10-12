// 录入：输入专辑名 → 匹配封面 → 确认记忆 → 出场仪式
import { blankRecord, saveRecord, findDuplicate, patchRecord, rooms, track, uid, records } from '../lib/store.js';
import { searchCatalog, fetchAsDataUrl, findPreview } from '../lib/catalog.js';
import { parseSentence } from '../lib/parse.js';
import { extractPalette, generateCover, toSquareDataUrl, fileToDataUrl } from '../lib/color.js';
import { MOODS, FORMATS, NOTE_PROMPTS, NOTE_EXAMPLES } from '../lib/constants.js';
import { $, $$, esc, toast, go, fmtDate, toLocalInput } from '../lib/ui.js';
import { playCeremony } from '../three/ceremony.js';

const FMT_ICON = {
  vinyl: '<svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="#111" stroke="#444"/><circle cx="15" cy="15" r="10" fill="none" stroke="#2a2a2a"/><circle cx="15" cy="15" r="5" fill="#ff5a1f"/></svg>',
  cd: '<svg width="30" height="30" viewBox="0 0 30 30"><defs><linearGradient id="cdg" x1="0" x2="1"><stop offset="0" stop-color="#cfd8ff"/><stop offset=".5" stop-color="#ffe0f2"/><stop offset="1" stop-color="#d9ffe8"/></linearGradient></defs><circle cx="15" cy="15" r="14" fill="url(#cdg)"/><circle cx="15" cy="15" r="3" fill="#0b0b0c"/></svg>',
  cassette: '<svg width="36" height="24" viewBox="0 0 36 24"><rect x="1" y="1" width="34" height="22" rx="3" fill="#1a1a1c" stroke="#555"/><rect x="5" y="4" width="26" height="8" fill="#ff5a1f"/><circle cx="12" cy="16" r="3" fill="#ddd"/><circle cx="24" cy="16" r="3" fill="#ddd"/></svg>',
  digital: '<svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="none" stroke="#efe9dc" stroke-opacity=".6"/><circle cx="15" cy="15" r="8" fill="none" stroke="#efe9dc" stroke-opacity=".35"/><circle cx="15" cy="15" r="3" fill="#efe9dc"/></svg>',
};

export async function mount(view, { query }) {
  // 首页“放入”时选好的形态（黑胶 / CD / 磁带 / 数字）
  const preferFormat = ['vinyl', 'cd', 'cassette', 'digital'].includes(query.format) ? query.format : null;
  let step = 1;
  let started = false;
  let draft = blankRecord();
  let cands = [];
  let kind = 'album';
  let parsed = null;
  let dupOf = null;
  let busy = false;

  const markStart = () => { if (!started) { started = true; track('add_start'); } };

  view.innerHTML = `<div class="page">
    <div class="page-head"><div><span class="mono dimmer">NEW ACQUISITION</span><h1>放入一张<em>唱片</em></h1>
      <p>输入专辑名、歌名，或者直接说一句话。日常记录应该在十几秒内完成，想沉浸的时候再进入展厅。</p></div></div>
    <div class="steps"><span data-s="1">01 · 识别</span><span data-s="2">02 · 记忆</span><span data-s="3">03 · 开幕</span></div>
    <div id="add-body"></div></div>`;
  const body = $('#add-body');

  function setSteps() {
    $$('.steps span').forEach((s) => {
      const n = Number(s.dataset.s);
      s.className = n === step ? 'on' : n < step ? 'done' : '';
    });
  }

  // ---------------- 第一步：识别 ----------------
  function renderFind(term = '') {
    step = 1; setSteps();
    body.oninput = null; body.onkeydown = null;
    body.innerHTML = `
      <form id="find" class="stack">
        <div class="row" style="gap:8px">
          <input class="input big" style="flex:1;min-width:260px" name="q" value="${esc(term)}" placeholder="专辑名 / 歌名 / “帮我记录一下 Radiohead 的这张专辑，我最近一直在听”" autocomplete="off" aria-label="搜索">
          <button class="btn hot lg" type="submit">匹配</button>
        </div>
        <div class="row between">
          <div class="seg" role="tablist"><button type="button" data-kind="album" class="${kind === 'album' ? 'on' : ''}">专辑</button><button type="button" data-kind="song" class="${kind === 'song' ? 'on' : ''}">单曲</button></div>
          <div class="row"><label class="btn sm" style="cursor:pointer">上传封面识别<input type="file" accept="image/*" id="up" hidden></label><button type="button" class="btn sm ghost" id="manual">手动填写 →</button></div>
        </div>
        <div id="parsed" class="hint"></div>
      </form>
      <div id="cands" style="margin-top:28px"></div>`;
    $('#find').onsubmit = (e) => { e.preventDefault(); doSearch(new FormData(e.target).get('q')); };
    $('#find').addEventListener('input', markStart);
    $$('[data-kind]', body).forEach((b) => (b.onclick = () => { kind = b.dataset.kind; $$('[data-kind]', body).forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#manual').onclick = () => { markStart(); const q = $('[name=q]').value; const p = parseSentence(q); draft = blankRecord({ title: p.title, artist: p.artist, moods: p.moods, kind }); applyGenerated(); renderDetails(); };
    $('#up').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      markStart();
      const raw = await fileToDataUrl(f);
      const cover = await toSquareDataUrl(raw, 600);
      const pal = await extractPalette(cover);
      const q = $('[name=q]').value;
      const p = parseSentence(q);
      draft = blankRecord({ title: p.title || f.name.replace(/\.[^.]+$/, ''), artist: p.artist, moods: p.moods, cover, coverSource: 'upload', palette: pal || [], kind });
      toast('封面已上传。补全专辑信息即可入库。');
      renderDetails();
    };
    if (term) doSearch(term);
    else setTimeout(() => $('[name=q]')?.focus(), 50);
  }

  async function doSearch(q) {
    q = (q || '').trim();
    if (!q || busy) return;
    markStart();
    parsed = parseSentence(q);
    if (parsed.kind === 'song') kind = 'song';
    $$('[data-kind]', body).forEach((x) => x.classList.toggle('on', x.dataset.kind === kind));
    $('#parsed').innerHTML = parsed.term !== q ? `理解为：${parsed.artist ? `艺术家 <b>${esc(parsed.artist)}</b> · ` : ''}${parsed.title ? `作品 <b>${esc(parsed.title)}</b>` : ''}${parsed.moods.length ? ` · 情绪线索 ${parsed.moods.map((m) => MOODS.find((x) => x.id === m).label).join('、')}` : ''}${parsed.loops ? ' · 正在循环' : ''}` : '';
    busy = true;
    $('#cands').innerHTML = `<p class="dim"><span class="loading"></span> 正在 Apple Music 目录里寻找「${esc(parsed.term)}」…</p>`;
    try {
      cands = await searchCatalog(parsed.term, kind);
      if (!cands.length && parsed.artist && parsed.title) cands = await searchCatalog(parsed.title, kind);
      renderCands();
    } catch {
      $('#cands').innerHTML = `<div class="dup"><b>目录暂时连不上。</b><p class="dim" style="margin:6px 0 12px">你仍然可以手动填写信息，系统会为它生成一张抽象封面；之后可以在唱片页重新匹配。</p><button class="btn solid sm" id="fallback">手动填写</button></div>`;
      $('#fallback').onclick = () => { draft = blankRecord({ title: parsed.title || q, artist: parsed.artist, moods: parsed.moods, kind }); applyGenerated(); renderDetails(); };
    } finally {
      busy = false;
    }
  }

  function renderCands() {
    if (!cands.length) {
      $('#cands').innerHTML = `<p class="dim">没有找到匹配的${kind === 'song' ? '单曲' : '专辑'}。换个关键词，或 <button class="btn sm" id="m2">手动填写</button></p>`;
      $('#m2').onclick = () => { draft = blankRecord({ title: parsed.title, artist: parsed.artist, moods: parsed.moods, kind, ...(preferFormat ? { format: preferFormat } : {}) }); applyGenerated(); renderDetails(); };
      return;
    }
    $('#cands').innerHTML = `<div class="row between" style="margin-bottom:14px"><span class="label">选择正确的封面候选 · ${cands.length} 个结果</span><span class="hint">点击即进入下一步</span></div>
      <div class="cands">${cands.map((c, i) => `<button class="cand" data-i="${i}"><img src="${esc(c.thumb)}" alt="" loading="lazy"><div class="t">${esc(c.title)}</div><div class="a">${esc(c.artist)}</div><div class="y">${c.year || ''} · ${esc(c.genre)}${c.kind === 'song' && c.album ? ' · ' + esc(c.album) : ''}</div></button>`).join('')}</div>`;
    $$('.cand', body).forEach((b) => (b.onclick = () => pick(cands[Number(b.dataset.i)])));
  }

  async function pick(c) {
    draft = blankRecord({
      kind: c.kind, title: c.title, artist: c.artist, year: c.year, genre: c.genre, itunesId: c.itunesId,
      coverUrl: c.coverUrl, coverSource: 'itunes', trackName: c.trackName || '', previewUrl: c.previewUrl || null,
      moods: parsed?.moods || [], loops: parsed?.loops || 0, format: preferFormat || (c.kind === 'song' ? 'digital' : 'vinyl'),
    });
    if (draft.loops) draft.loopLog = [Date.now()];
    renderDetails();
    const pal = await extractPalette(c.coverUrl);
    if (pal) { draft.palette = pal; paintPalette(); }
  }

  function applyGenerated() {
    if (draft.cover || draft.coverUrl) return;
    const g = generateCover(draft.title || '未命名', draft.artist || '');
    draft.palette = g.palette;
    draft._gen = g.dataUrl;
  }

  // ---------------- 第二步：记忆 ----------------
  function renderDetails() {
    step = 2; setSteps();
    dupOf = findDuplicate(draft.title, draft.artist);
    const roomList = rooms();
    const prompt = NOTE_PROMPTS[Math.floor(Math.random() * NOTE_PROMPTS.length)];
    body.innerHTML = `<div class="add-wrap">
      <div class="stack" style="gap:22px">
        <div id="dup"></div>
        <div class="row" style="gap:14px"><div class="field" style="flex:2;min-width:220px"><label>${draft.kind === 'song' ? '歌名' : '专辑名'}</label><input class="input" id="f-title" value="${esc(draft.title)}"></div>
          <div class="field" style="flex:1.4;min-width:160px"><label>艺术家</label><input class="input" id="f-artist" value="${esc(draft.artist)}"></div>
          <div class="field" style="width:100px"><label>年份</label><input class="input" id="f-year" inputmode="numeric" value="${draft.year || ''}"></div></div>
        <div class="field"><label>收藏形态</label><div class="formats">${FORMATS.map((f) => `<button type="button" class="fmt ${draft.format === f.id ? 'on' : ''}" data-fmt="${f.id}"><div class="ic">${FMT_ICON[f.id]}</div>${f.label}<small>${f.en}</small></button>`).join('')}</div></div>
        <div class="field"><label>当时的心情 · 最多 3 个</label><div class="chips" id="moods">${MOODS.map((m) => `<button type="button" class="chip ${draft.moods.includes(m.id) ? 'on' : ''}" data-mood="${m.id}">${m.label}<small>${m.en}</small></button>`).join('')}</div></div>
        <div class="field"><label>一句话证明你的品味 · ${'≤'} 40 字</label>
          <input class="input" id="f-note" maxlength="40" value="${esc(draft.note)}" placeholder="${esc(NOTE_EXAMPLES[Math.floor(Math.random() * NOTE_EXAMPLES.length)])}">
          <div class="hint">没想好？问问自己：<span class="prompt-pill" id="prompt">${esc(prompt)}</span> <span class="dimmer">· 只给提问，不替你写感受</span></div></div>
        <div class="field"><label>此刻的记忆（可选）</label><textarea class="textarea" id="f-memory" placeholder="在哪里、和谁、为什么是这张……">${esc(draft.memories[0]?.text || '')}</textarea></div>
        <div class="row" style="gap:14px;align-items:flex-end">
          <div class="field" style="flex:1;min-width:160px"><label>人生阶段</label><select class="select" id="f-room"><option value="">不归入任何阶段</option>${roomList.map((r) => `<option value="${r.id}" ${draft.room === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
          <div class="field" style="width:230px"><label>收藏时刻</label><input type="datetime-local" step="1" class="input" id="f-date" value="${toLocalInput(draft.listenedAt)}"></div>
          <div class="field" style="flex:1;min-width:150px"><label>流派</label><input class="input" id="f-genre" value="${esc(draft.genre)}" placeholder="如 Dream Pop"></div>
        </div>
        <div class="row" style="gap:18px">
          <div class="seg" title="B 面不会出现在任何分享里"><button type="button" data-side="A" class="${draft.side === 'A' ? 'on' : ''}">A 面 · 可分享</button><button type="button" data-side="B" class="${draft.side === 'B' ? 'on' : ''}">B 面 · 只给自己</button></div>
          <label class="row" style="gap:6px;font-size:13px"><input type="checkbox" id="f-loop" ${draft.loops ? 'checked' : ''}> 我最近在单曲循环</label>
          <label class="row" style="gap:6px;font-size:13px"><input type="checkbox" id="f-gateway" ${draft.gateway ? 'checked' : ''}> 这是我的入坑专辑</label>
        </div>
        <div class="row" style="margin-top:6px"><button class="btn hot lg" id="save">收藏并开幕 →</button><button class="btn ghost" id="back">← 重新匹配</button><span class="hint">按 <span class="mono">⌘/Ctrl + Enter</span> 直接收藏</span></div>
      </div>
      <div class="preview-sleeve">
        <img class="cover" id="pv" src="${esc(draft.cover || draft.coverUrl || draft._gen || '')}" alt="封面预览">
        <div class="palette" id="pal"></div>
        <div class="row between" style="margin-top:14px"><span class="mono dimmer" id="src-label"></span>
          <label class="btn sm" style="cursor:pointer">换一张封面<input type="file" accept="image/*" id="up2" hidden></label></div>
        <p class="hint" style="margin-top:12px">封面颜色会决定后续海报、雕塑与名片的主色调。</p>
      </div></div>`;
    paintPalette();
    renderDup();
    const srcLabel = { itunes: 'COVER · APPLE MUSIC CATALOG', upload: 'COVER · YOUR UPLOAD', generated: 'COVER · GENERATED ABSTRACT' };
    $('#src-label').textContent = srcLabel[draft.coverSource] || '';

    const sync = () => {
      draft.title = $('#f-title').value.trim();
      draft.artist = $('#f-artist').value.trim();
      draft.year = Number($('#f-year').value) || null;
      draft.note = $('#f-note').value.trim();
      draft.room = $('#f-room').value || null;
      draft.listenedAt = $('#f-date').value || draft.listenedAt;
      draft.genre = $('#f-genre').value.trim();
      draft.gateway = $('#f-gateway').checked;
      const loop = $('#f-loop').checked;
      draft.loops = loop ? Math.max(1, draft.loops) : 0;
      draft.loopLog = loop ? (draft.loopLog.length ? draft.loopLog : [Date.now()]) : [];
      const mem = $('#f-memory').value.trim();
      draft.memories = mem ? [{ id: draft.memories[0]?.id || uid('m_'), at: Date.now(), text: mem, mood: draft.moods[0] || null }] : [];
    };
    body.oninput = sync;
    ['#f-title', '#f-artist'].forEach((s) => $(s).addEventListener('change', () => {
      sync();
      if (draft.coverSource === 'generated') { draft._gen = null; applyGenerated(); $('#pv').src = draft._gen; paintPalette(); }
      dupOf = findDuplicate(draft.title, draft.artist); renderDup();
    }));
    $$('[data-fmt]', body).forEach((b) => (b.onclick = () => { draft.format = b.dataset.fmt; $$('[data-fmt]', body).forEach((x) => x.classList.toggle('on', x === b)); }));
    $$('[data-side]', body).forEach((b) => (b.onclick = () => { draft.side = b.dataset.side; $$('[data-side]', body).forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#moods').onclick = (e) => {
      const b = e.target.closest('[data-mood]');
      if (!b) return;
      const id = b.dataset.mood;
      if (draft.moods.includes(id)) draft.moods = draft.moods.filter((m) => m !== id);
      else if (draft.moods.length < 3) draft.moods.push(id);
      else toast('最多选择 3 种心情');
      $$('[data-mood]', body).forEach((x) => x.classList.toggle('on', draft.moods.includes(x.dataset.mood)));
    };
    $('#prompt').onclick = () => {
      const p = NOTE_PROMPTS[(NOTE_PROMPTS.indexOf($('#prompt').textContent) + 1) % NOTE_PROMPTS.length];
      $('#prompt').textContent = p;
      $('#f-note').placeholder = p;
      $('#f-note').focus();
    };
    $('#up2').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      draft.cover = await toSquareDataUrl(await fileToDataUrl(f), 600);
      draft.coverSource = 'upload';
      draft.coverUrl = null;
      $('#pv').src = draft.cover;
      draft.palette = (await extractPalette(draft.cover)) || draft.palette;
      paintPalette();
      $('#src-label').textContent = srcLabel.upload;
    };
    $('#back').onclick = () => renderFind(parsed?.raw || draft.title);
    $('#save').onclick = () => { sync(); save(); };
    body.onkeydown = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { sync(); save(); } };
    setTimeout(() => $('#f-note')?.focus(), 60);
  }

  function paintPalette() {
    const p = $('#pal');
    if (p) p.innerHTML = (draft.palette || []).map((c) => `<i style="background:${c}"></i>`).join('');
  }

  function renderDup() {
    const box = $('#dup');
    if (!box) return;
    if (!dupOf) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="dup"><span class="mono accent">ALREADY ON YOUR SHELF</span>
      <p style="margin:6px 0 12px">《${esc(dupOf.title)}》已经在你的唱片架上（收藏于 ${fmtDate(dupOf.addedAt)}，已有 ${dupOf.memories.length} 条记忆）。与其放两张一样的唱片，不如为它追加一条新的记忆。</p>
      <div class="row"><button class="btn solid sm" id="dup-append">追加为新记忆</button><a class="btn sm" href="#/record/${dupOf.id}">去看那张唱片</a><button class="btn ghost sm" id="dup-ignore">仍然新建一张</button></div></div>`;
    $('#dup-append').onclick = async () => {
      const text = $('#f-memory').value.trim() || $('#f-note').value.trim() || '又一次回到这张唱片。';
      await patchRecord(dupOf.id, (r) => ({
        memories: [...r.memories, { id: uid('m_'), at: Date.now(), text, mood: draft.moods[0] || null }],
        revisits: [...(r.revisits || []), Date.now()],
        loops: $('#f-loop').checked ? (r.loops || 0) + 1 : r.loops,
        loopLog: $('#f-loop').checked ? [...(r.loopLog || []), Date.now()] : r.loopLog,
      }));
      track('add_complete', { recordId: dupOf.id, merged: true });
      toast('已追加到已有唱片的记忆里');
      go('#/record/' + dupOf.id);
    };
    $('#dup-ignore').onclick = () => { dupOf = null; box.innerHTML = ''; };
  }

  async function save() {
    if (!draft.title) { toast('先写下它的名字'); $('#f-title').focus(); return; }
    if (busy) return;
    busy = true;
    $('#save').innerHTML = '<span class="loading"></span> 正在入库…';
    step = 3; setSteps();
    // 封面落地到本地，离线也能看
    if (draft.coverUrl && !draft.cover) {
      try { draft.cover = await fetchAsDataUrl(draft.coverUrl); } catch { /* 保留远程地址 */ }
    }
    if (!draft.cover && !draft.coverUrl) { applyGenerated(); draft.cover = draft._gen; draft.coverSource = 'generated'; }
    delete draft._gen;
    if (!draft.palette?.length) draft.palette = (await extractPalette(draft.cover || draft.coverUrl)) || [];
    draft.addedAt = Date.now();
    draft.viz.style = ['sculpture', 'orbit', 'particle', 'liquid'][records().length % 4];
    const rec = await saveRecord(draft);
    track('add_complete', { recordId: rec.id });
    if (!rec.previewUrl && rec.coverSource === 'itunes') {
      findPreview(rec.title, rec.artist).then((p) => p && patchRecord(rec.id, { previewUrl: p.previewUrl, trackName: rec.trackName || p.trackName }));
    }
    busy = false;
    playCeremony(rec, {
      onAction: (act) => {
        if (act === 'house') go('#/house?play=' + rec.id);
        else if (act === 'share') go('#/record/' + rec.id + '?gen=1');
        else go('#/shelf?focus=' + rec.id);
      },
    });
  }

  renderFind(query.q ? decodeURIComponent(query.q) : '');
}
