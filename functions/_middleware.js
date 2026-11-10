// 미리보기 이미지 주소를 접속한 주소 기준의 전체 주소로 바꿔 준다 (카카오톡·메신저 미리보기용)
export async function onRequest(ctx) {
  const res = await ctx.next();
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return res;
  const u = new URL(ctx.request.url);
  return new HTMLRewriter()
    .on('meta[property="og:image"]', { element(el) { el.setAttribute('content', `${u.origin}/og.png`); } })
    .on('head', { element(el) { el.append(`<meta property="og:url" content="${u.origin}${u.pathname}">`, { html: true }); } })
    .transform(res);
}
