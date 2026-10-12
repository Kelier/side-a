// 轻量 DOM 工具

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s = '') {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function on(root, type, selector, fn) {
  const handler = (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  };
  root.addEventListener(type, handler);
  return () => root.removeEventListener(type, handler);
}

let toastTimer;
export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) {
    t = el('<div id="toast" role="status" aria-live="polite"></div>');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function download(href, name) {
  const a = document.createElement('a');
  a.href = typeof href === 'string' ? href : URL.createObjectURL(href);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof href !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function fmtDate(d, style = 'dot') {
  const x = typeof d === 'number' ? new Date(d) : new Date(d || Date.now());
  if (isNaN(x)) return '';
  const y = x.getFullYear(), m = String(x.getMonth() + 1).padStart(2, '0'), day = String(x.getDate()).padStart(2, '0');
  if (style === 'zh') return `${y} 年 ${x.getMonth() + 1} 月 ${x.getDate()} 日`;
  const hms = `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}:${String(x.getSeconds()).padStart(2, '0')}`;
  if (style === 'full') return `${y}.${m}.${day} ${hms}`;
  if (style === 'time') return hms;
  return `${y}.${m}.${day}`;
}

// 本地时间的 YYYY-MM-DDTHH:MM:SS，用于 datetime-local 输入框（精确到秒）
export function localStamp(d = Date.now()) {
  const x = new Date(d);
  if (isNaN(x)) return '';
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
export function toLocalInput(v) {
  if (!v) return localStamp();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : localStamp(v);
}

export const pad = (n, w = 3) => String(n).padStart(w, '0');

export function modal(inner, { wide = false, onClose } = {}) {
  const wrap = el(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card ${wide ? 'wide' : ''}"><button class="modal-x" aria-label="关闭">×</button></div></div>`);
  const card = wrap.querySelector('.modal-card');
  if (typeof inner === 'string') card.insertAdjacentHTML('beforeend', inner);
  else card.appendChild(inner);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => {
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 250);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  card.querySelector('.modal-x').onclick = close;
  return { el: card, close };
}

export function confirmBox(text, okLabel = '确定') {
  return new Promise((res) => {
    const m = modal(`<p class="confirm-text">${esc(text)}</p><div class="row end"><button class="btn ghost" data-v="0">取消</button><button class="btn solid" data-v="1">${esc(okLabel)}</button></div>`, { onClose: () => res(false) });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) { res(b.dataset.v === '1'); m.close(); }
    });
  });
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function canvasToBlob(canvas, type = 'image/png', q) {
  return new Promise((res) => canvas.toBlob(res, type, q));
}

// 导出按钮：标签 + 一行规格小字 + 按钮里的圆形图标；导出后短暂变成“已导出”
const XB_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v11M7 11l5 5 5-5M6 19.5h12"/></svg>';
const XB_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export const XB_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/></svg>';
export function exportButton(id, label, spec = '') {
  return `<button class="xbtn" id="${id}"><span class="xb-t"><b>${label}</b>${spec ? `<small class="tnum" data-spec>${spec}</small>` : ''}</span><i class="xb-ic">${XB_DOWN}</i></button>`;
}
export function exportDone(btn, text = '已导出') {
  if (!btn) return;
  const b = btn.querySelector('b'), ic = btn.querySelector('.xb-ic');
  const prev = [b.textContent, ic.innerHTML];
  btn.classList.add('done');
  b.textContent = text; ic.innerHTML = XB_OK;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.classList.remove('done'); [b.textContent, ic.innerHTML] = prev; }, 1800);
}
