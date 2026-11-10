import { api, $, chrome, num } from './common.js';
chrome('about');
api('rank').then((r) => { if (r.library) $('#lib').textContent = `지금 답할 준비가 된 문장은 ${num(r.library.quotes)}개, 글쓴이는 ${num(r.library.authors)}명이에요.`; });
$('#fbSend').onclick = async () => {
  const text = $('#fb').value.trim(); const err = $('#fbErr');
  if (text.length < 2) { err.textContent = '내용을 적어 주세요.'; return; }
  $('#fbSend').disabled = true;
  const r = await api('feedback', { method: 'POST', body: { text } });
  $('#fbSend').disabled = false;
  if (r.ok) { $('#fb').value = ''; err.textContent = '잘 받았어요. 고맙습니다.'; } else err.textContent = r.error || '보내지 못했어요.';
};
