// 访客视角：别人的唱片博物馆 / 主题展览 / 入坑专辑交换
import '../styles/share.css';
import { decodePayload, fatRecord } from '../lib/share.js';
import { blankRecord, saveRecord, findDuplicate, track, profile } from '../lib/store.js';
import { $, $$, esc, toast, go, localStamp } from '../lib/ui.js';
import { coverOf, extractPalette } from '../lib/color.js';
import { moodById } from '../lib/constants.js';
import { computeStats, persona } from '../lib/stats.js';
import { createShelf } from '../three/shelf.js';
import { footer } from './common.js';

export async function mount(view, { args }) {
  let data;
  try {
    data = await decodePayload(args[0] || '');
  } catch {
    view.innerHTML = `<div class="page"><div class="empty"><h3>这个链接打不开</h3><p>可能被截断了。请让对方重新复制一次。</p><a class="btn" href="#/">去我自己的博物馆</a></div></div>`;
    return;
  }
  track('visit_shared', { kind: data.type });
  const recs = (data.r || []).map((o, i) => ({ ...blankRecord(), ...fatRecord(o), id: 'v_' + i, addedAt: Date.now() - i }));
  const owner = data.type === 'museum' ? data.p?.n : data.type === 'exhibition' ? data.by : data.from;
  const handle = data.type === 'museum' ? data.p?.h : data.h;
  let shelf = null;
  let house = null;
  let driver = null;
  let mode = 'wall';

  const title = data.type === 'museum' ? `${esc(owner)} 的唱片博物馆` : data.type === 'exhibition' ? esc(data.t) : `${esc(owner)} 的入坑专辑`;
  const sub = data.type === 'museum' ? esc(data.p?.b || '') : data.type === 'exhibition' ? esc(data.s || '') : `${data.m ? `“${esc(data.m)}”<br>` : ''}如果你想了解 TA，从这几张开始。也把你的入坑专辑回赠给 TA 吧。`;
  const per = recs.length ? persona(computeStats(recs)) : null;

  view.innerHTML = `
    <div class="visit-hero"><span class="mono dimmer">YOU ARE VISITING · ${data.type === 'museum' ? 'PRIVATE RECORD MUSEUM' : data.type === 'exhibition' ? 'EXHIBITION' : 'GATEWAY ALBUM EXCHANGE'}${handle ? ' · @' + esc(handle) : ''}</span>
      <h1>${title}</h1><p class="dim" style="font-size:18px;max-width:640px">${sub}</p>
      <div class="row" style="margin-top:20px">${per && data.type === 'museum' ? `<span class="badge hot">${per.title} · ${per.en}</span>` : ''}${data.type === 'exhibition' ? `<span class="badge">策展人 ${esc(owner || '')}</span>` : ''}<span class="badge">${recs.length} 张唱片</span></div>
      <div class="row" style="margin-top:24px"><div class="seg" id="vm"><button data-m="wall" class="on">展墙</button><button data-m="shelf">3D 唱片架</button>${data.type === 'museum' ? '<button data-m="house">走进 TA 的小屋</button>' : ''}</div>
        ${data.type === 'exchange' ? '<a class="btn hot" href="#/card?tab=swap">回赠我的入坑专辑 →</a>' : ''}<a class="btn ghost" href="#/">建一座我自己的博物馆</a></div>
    </div>
    <div id="vbody"></div>
    ${data.type === 'museum' && data.x?.length ? `<div class="section"><div class="section-head"><div><span class="mono dimmer">EXHIBITIONS</span><h2>TA 的主题展览</h2></div></div><div class="exhibits">${data.x.map((x) => `<div class="exhibit"><h3>${esc(x.t)}</h3><p class="dim" style="margin:0;font-size:13px">${esc(x.s || '')}</p><div class="mini-covers">${x.i.map((i) => recs[i]).filter(Boolean).slice(0, 8).map((r) => `<img src="${esc(coverOf(r))}" alt="">`).join('')}</div></div>`).join('')}</div></div>` : ''}
    ${footer()}`;

  function cleanup3d() { shelf?.dispose(); shelf = null; house?.dispose(); house = null; driver?.stopAudio(); }
  function wall() {
    cleanup3d();
    $('#vbody').innerHTML = `<div class="gallery-wall">${recs.map((r, i) => `<div class="wall-item"><img src="${esc(coverOf(r))}" alt="" loading="lazy">
      <div class="wall-label"><span class="mono dimmer">${String(i + 1).padStart(2, '0')} · ${r.year || '-'}${r.gateway ? ' · 入坑专辑' : ''}</span><div class="t">${esc(r.title)}</div><div class="dim" style="font-size:13px">${esc(r.artist)}</div>
        ${r.note ? `<div class="n">“${esc(r.note)}”</div>` : ''}<div class="chips" style="margin-top:8px">${r.moods.map((m) => `<span class="chip" style="pointer-events:none;font-size:11px;padding:3px 8px">${moodById(m)?.label || ''}</span>`).join('')}</div>
        <button class="btn sm" data-take="${i}" style="margin-top:10px">＋ 收进我的唱片架</button></div></div>`).join('')}</div>`;
    $$('[data-take]').forEach((b) => (b.onclick = () => take(recs[Number(b.dataset.take)], b)));
  }
  async function houseMode() {
    cleanup3d();
    const { createHouse, DEFAULT_HOUSE } = await import('../three/house.js');
    const { SoundDriver } = await import('../lib/audio.js');
    const { findPreview } = await import('../lib/catalog.js');
    driver = driver || new SoundDriver();
    $('#vbody').innerHTML = `<div class="visit-house"><div class="vh-stage" id="vh"></div><p class="vh-hint" id="vhint">点柜子里的一张唱片，放上 TA 的唱机。</p></div>`;
    house = createHouse($('#vh'), {
      config: { ...DEFAULT_HOUSE, ...(data.hs || {}), name: data.hs?.name || owner || '' }, records: recs,
      onPick: async (p) => {
        if (p.type !== 'record' || !p.rec) return;
        const r = p.rec;
        $('#vhint').textContent = `正在放：${r.title}，${r.artist}${r.note ? `。TA 写道：“${r.note}”` : ''}`;
        house.enterListen();
        await house.play(r);
        let url = r.previewUrl;
        if (!url) url = (await findPreview(r.title, r.artist))?.previewUrl;
        if (url && house) { try { await driver.playUrl(url); } catch { /* 浏览器拦截自动播放 */ } }
      },
    });
    const loop = () => { if (!house) return; house.setLevel(driver.update()); requestAnimationFrame(loop); };
    loop();
  }
  function stage3d() {
    cleanup3d();
    $('#vbody').innerHTML = `<div class="shelf-page" style="height:78vh"><div class="stage" id="vstage"></div><div class="focus-card" id="vfocus"></div><div class="shelf-hud"><span class="mono">拖动 / 滚轮浏览 · 悬停抽出 · 点击展示</span></div></div>`;
    shelf = createShelf($('#vstage'), {
      onFocus: (r) => {
        const box = $('#vfocus');
        if (!r) return box.classList.remove('show');
        box.innerHTML = `<span class="mono dimmer">${r.year || '-'} · ${esc(r.genre || '')}</span><h3>${esc(r.title)}</h3><div class="dim">${esc(r.artist)}</div>${r.note ? `<div class="n">“${esc(r.note)}”</div>` : ''}<button class="btn sm solid" id="vtake">＋ 收进我的唱片架</button>`;
        box.classList.add('show');
        $('#vtake').onclick = (e) => take(r, e.target);
      },
    });
    shelf.setRecords(recs);
  }
  async function take(r, btn) {
    if (findDuplicate(r.title, r.artist)) { toast('它已经在你的唱片架上了'); return; }
    const pal = r.palette?.length ? r.palette : (await extractPalette(coverOf(r))) || [];
    const { id, ...rest } = r;
    void id;
    await saveRecord(blankRecord({ ...rest, palette: pal, note: '', giftFrom: owner || '一位朋友', memories: [{ id: 'm_' + Date.now(), at: Date.now(), text: `在 ${owner || '朋友'} 的${data.type === 'exhibition' ? `展览「${data.t}」` : '唱片架'}上发现了它。${r.note ? `TA 写道：“${r.note}”` : ''}`, mood: null }], addedAt: Date.now(), listenedAt: localStamp(), shares: [], seed: false }));
    track('add_complete', { via: 'visit' });
    btn.textContent = '✓ 已收进唱片架';
    btn.disabled = true;
    toast(`已收进 ${profile().name} 的唱片架`);
  }
  $('#vm').onclick = (e) => {
    const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return;
    mode = b.dataset.m;
    $$('#vm button').forEach((x) => x.classList.toggle('on', x === b));
    mode === 'wall' ? wall() : mode === 'house' ? houseMode() : stage3d();
  };
  wall();
  void go;
  return () => { cleanup3d(); driver?.dispose(); };
}
