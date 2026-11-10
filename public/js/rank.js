import { api, $, chrome, esc, num, replyHtml } from './common.js';
chrome('rank');
const r = await api('rank');
const none = (msg) => `<p class="hint">${msg}</p>`;
if (r.error) $('#sum').textContent = r.error;
else {
  $('#sum').textContent = `오늘 올라온 글 ${num(r.today)}개 · 답할 준비가 된 문장 ${num(r.library.quotes)}개, ${num(r.library.authors)}명`;
  const wait = `오늘 글이 ${r.min}개 넘게 모이면 보여 드려요. 숫자를 꾸며서 채우지 않아요.`;
  $('#authors').innerHTML = r.authors.length ? `<ol class="rank">${r.authors.map((a) => `<li><a href="/person.html?id=${encodeURIComponent(a.id)}"><b>${esc(a.name)}</b> <span class="hint">${esc(a.when || '')}</span></a><span class="n">${num(a.n)}명에게 답함</span></li>`).join('')}</ol>` : none(wait);
  const max = Math.max(1, ...r.mood.map((m) => m.n));
  $('#mood').innerHTML = r.mood.length ? `<div class="bars">${r.mood.map((m) => `<div><span>${esc(m.name)}</span><i style="width:${Math.round((m.n / max) * 55)}%"></i><em>${num(m.n)}</em></div>`).join('')}</div><p class="hint">글 내용이 아니라, 글마다 붙인 분류만 센 숫자예요.</p>` : none(wait);
  $('#quotes').innerHTML = r.quotes.length ? `<ol class="rank">${r.quotes.map((x) => `<li><span><p class="ko">${esc(x.quote.ko)}</p><a class="hint" href="/person.html?id=${encodeURIComponent(x.quote.author.id)}">${esc(x.quote.author.name)} · ${esc(x.quote.when)}</a></span><span class="n">어울려요 ${num(x.n)}</span></li>`).join('')}</ol>` : none("아직 '어울려요'를 받은 답글이 없어요.");
  $('#far').innerHTML = r.farthest ? `<div class="post">${replyHtml(r.farthest, null, false).replace(/<div class="ago">[\s\S]*?<\/div>/, `<div class="ago">${num(r.farthest.ago)}년을 건너온 답장</div>`)}</div>` : none('이번 주에 올라온 글이 아직 없어요.');
}
