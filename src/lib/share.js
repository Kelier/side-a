// 分享链接：把一张唱片 / 一个展览 / 一张品味名片压缩进 URL（无需服务器）
// B 面唱片永远不会被写进分享数据。

const toB64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodePayload(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toB64url(await pipe(json, new CompressionStream('deflate-raw')));
  }
  return 'j' + toB64url(json);
}

export async function decodePayload(str) {
  const kind = str[0];
  const bytes = fromB64url(str.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

// 精简唱片字段（只保留公开展示需要的）
export function slimRecord(r, { withThumb = false } = {}) {
  const o = {
    t: r.title, a: r.artist, y: r.year, g: r.genre, f: r.format, k: r.kind,
    m: r.moods, n: r.note, c: r.coverUrl || null, p: r.palette?.slice(0, 5),
    d: r.listenedAt, gw: r.gateway ? 1 : 0, l: r.loops || 0, v: r.viz?.style,
    tn: r.trackName || undefined, pv: r.previewUrl || undefined,
  };
  if (withThumb && !r.coverUrl && r.thumb) o.th = r.thumb;
  return o;
}
export function fatRecord(o) {
  return {
    title: o.t, artist: o.a, year: o.y, genre: o.g, format: o.f || 'vinyl', kind: o.k || 'album',
    moods: o.m || [], note: o.n || '', coverUrl: o.c || null, cover: o.th || null, palette: o.p || [],
    listenedAt: o.d, gateway: !!o.gw, loops: o.l || 0, viz: { style: o.v || 'orbit', seed: 7, intensity: 1 },
    trackName: o.tn || '', previewUrl: o.pv || null,
  };
}

export function shareUrl(route, payload) {
  const base = location.href.split('#')[0];
  return `${base}#/${route}/${payload}`;
}

// 小尺寸缩略图（上传封面无法通过 URL 共享时使用）
export async function thumbOf(dataUrl, size = 72) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.6);
}
