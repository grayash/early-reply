// 페이지 머리말 다듬기 (카카오톡·메신저 미리보기용)
// - 미리보기 이미지와 주소를 접속한 주소 기준의 전체 주소로 바꾼다
// - 개별 글 주소(/post.html?id=…)를 공유하면, 미리보기에 그 글이 받은 옛 문장이 보이게 한다
import { QMAP, DATA } from './_lib/util.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export async function onRequest(ctx) {
  const res = await ctx.next();
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return res;
  const u = new URL(ctx.request.url);
  const page = u.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

  let og = null;
  if (page === '/post' && u.searchParams.get('id') && ctx.env.DB) {
    try {
      const r = await ctx.env.DB.prepare('SELECT quote_id FROM posts WHERE id = ? AND hidden = 0').bind(u.searchParams.get('id')).first();
      const q = r && QMAP.get(r.quote_id);
      if (q) {
        const a = DATA.authors[q.a] || {};
        og = { title: `${a.name}의 답장 · 먼저 온 답장`, desc: cut(`“${q.ko}” — ${a.name}`, 110) };
      }
    } catch { /* 미리보기는 기본값으로 */ }
  }
  // 주소 하나로 모은다: 글 주소는 id까지, 나머지는 쿼리 없이
  const canon = `${u.origin}${u.pathname}${page === '/post' && u.searchParams.get('id') ? `?id=${encodeURIComponent(u.searchParams.get('id'))}` : page === '/person' && u.searchParams.get('id') ? `?id=${encodeURIComponent(u.searchParams.get('id'))}` : ''}`;

  let rw = new HTMLRewriter()
    .on('meta[property="og:image"]', { element(el) { el.setAttribute('content', `${u.origin}/og.png`); } })
    .on('head', { element(el) { el.append(`<meta property="og:url" content="${esc(canon)}"><link rel="canonical" href="${esc(canon)}">`, { html: true }); } });
  if (og) {
    rw = rw
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', og.title); } })
      .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', og.desc); } })
      .on('meta[name="description"]', { element(el) { el.setAttribute('content', og.desc); } });
  }
  return rw.transform(res);
}
