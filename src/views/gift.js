// 收到一张唱片卡：开箱 → 出场仪式 → 收进自己的唱片架
import { decodePayload, fatRecord } from '../lib/share.js';
import { blankRecord, saveRecord, findDuplicate, track, uid, profile } from '../lib/store.js';
import '../styles/share.css';
import { $, esc, toast, go, localStamp } from '../lib/ui.js';
import { coverOf, extractPalette } from '../lib/color.js';
import { playCeremony } from '../three/ceremony.js';

export async function mount(view, { args }) {
  let data;
  try { data = await decodePayload(args[0] || ''); } catch {
    view.innerHTML = `<div class="page"><div class="empty"><h3>这张唱片卡打不开</h3><p>链接可能被截断了。</p><a class="btn" href="#/">去我的博物馆</a></div></div>`;
    return;
  }
  const r = { ...blankRecord(), ...fatRecord(data.rec) };
  if (!r.palette?.length) r.palette = (await extractPalette(coverOf(r))) || [];
  track('visit_shared', { kind: 'gift' });
  const dup = findDuplicate(r.title, r.artist);

  view.innerHTML = `<div class="gift-stage"><div style="max-width:560px">
    <span class="mono accent">一张寄给你的唱片</span>
    <h1 class="serif" style="font-size:clamp(40px,6vw,76px);font-weight:400;line-height:1;margin:14px 0">${esc(data.from || '一位朋友')}<br>送了你一张唱片</h1>
    ${data.msg ? `<p class="serif" style="font-size:26px;font-style:italic;color:var(--cream-2)">“${esc(data.msg)}”</p>` : ''}
    <div style="position:relative;width:min(320px,70vw);margin:36px auto;aspect-ratio:1">
      <button class="sealed" id="sealed" aria-label="拆开唱片卡"><span class="env-flap"></span><span class="env-disc"></span><span class="env-seal">A</span><span class="env-to">给 ${esc(profile().name || '你')}</span></button>
    </div>
    <div class="row" style="justify-content:center"><button class="btn hot lg" id="open">拆开它</button></div>
  </div></div>`;

  const open = () => {
    playCeremony(r, {
      onAction: () => reveal(),
    });
  };
  function reveal() {
    view.innerHTML = `<div class="gift-stage"><div style="max-width:620px">
      <img src="${esc(coverOf(r))}" style="width:min(340px,72vw);margin:0 auto 28px;box-shadow:0 40px 80px rgba(0,0,0,.6)" alt="">
      <span class="mono dimmer">${r.year || ''} · ${esc(r.genre || '')}</span>
      <h1 class="serif" style="font-size:clamp(40px,6vw,72px);font-weight:400;line-height:1;margin:8px 0">${esc(r.title)}</h1>
      <div style="font-size:20px;font-weight:600">${esc(r.artist)}</div>
      ${r.note ? `<p class="serif" style="font-size:24px;font-style:italic;color:var(--cream-2);margin-top:20px">${esc(data.from)} 写道：“${esc(r.note)}”</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:28px">${dup ? `<a class="btn solid" href="#/record/${dup.id}">你已经收藏过它 · 去看看</a>` : '<button class="btn hot lg" id="keep">收进我的唱片架</button>'}<a class="btn ghost" href="#/">先逛逛</a></div>
    </div></div>`;
    $('#keep')?.addEventListener('click', async () => {
      const rec = blankRecord({
        ...r, id: undefined, note: '', giftFrom: data.from || '一位朋友', addedAt: Date.now(), listenedAt: localStamp(), shares: [], seed: false,
        memories: [{ id: uid('m_'), at: Date.now(), text: `${data.from || '一位朋友'} 送给我的唱片卡${data.msg ? `：“${data.msg}”` : '。'}${r.note ? ` TA 的注释是“${r.note}”。` : ''}`, mood: null }],
      });
      rec.id = uid('r_');
      await saveRecord(rec);
      track('add_complete', { recordId: rec.id, via: 'gift' });
      toast('已收进你的唱片架');
      go('#/record/' + rec.id);
    });
  }
  $('#open').onclick = open;
  $('#sealed').onclick = open;
}
