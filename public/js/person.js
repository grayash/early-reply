import { api, $, chrome, esc, num } from './common.js';
chrome('');
const id = new URLSearchParams(location.search).get('id') || '';
const r = await api('person?id=' + encodeURIComponent(id));
if (r.error) $('#who').innerHTML = `<p class="empty">${r.error}</p>`;
else {
  const a = r.author;
  document.title = `${a.name} · 먼저 온 답장`;
  $('#who').innerHTML = `<h1>${esc(a.name)}</h1>
    <p class="lead">${esc([a.native, a.when, a.place].filter(Boolean).join(' · '))}<br>${esc(a.bio || '')}</p>
    <p class="hint">${r.answered ? `지금까지 ${num(r.answered)}명에게 답했어요${r.answeredToday ? ` · 오늘 ${num(r.answeredToday)}명` : ''}.` : '아직 답글로 불려 나온 적이 없어요.'}</p>
    <h2>남긴 문장 ${r.quotes.length}개</h2>`;
  $('#list').innerHTML = r.quotes.map((q) => `<article class="post"><p class="ko">${esc(q.ko)}</p>
    <p class="orig" lang="${esc(q.lang)}">${esc(q.orig).replace(/\s*\/\s*/g, '<br>')}</p>
    <p class="src">${esc(q.src)}${q.url ? ` · <a href="${esc(q.url)}" target="_blank" rel="noopener">원문 확인</a>` : ''}</p>
    ${q.note ? `<p class="linkline">${esc(q.note)}</p>` : ''}</article>`).join('');
}
