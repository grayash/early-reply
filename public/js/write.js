import { api, $, chrome, postHtml, bindPosts, store, esc, num, josa, openShare } from './common.js';
chrome('write');
const ta = $('#text'); const send = $('#send'); const err = $('#err');
const EXAMPLES = ['출근길에 하늘이 예뻤는데 다들 폰만 보더라', '오랜만에 친구 만나고 왔더니 힘이 난다', '회사 진짜 싫은데 막상 그만두려니 아쉽다', '엄마 목소리 듣고 싶은 밤', '아무것도 하기 싫은 일요일 오후'];
$('#chips').innerHTML = EXAMPLES.map((t) => `<button type="button">${esc(t)}</button>`).join('');
$('#chips').onclick = (e) => { if (e.target.tagName === 'BUTTON') { ta.value = e.target.textContent; onInput(); ta.focus(); } };
const onInput = () => { const n = ta.value.trim().length; $('#cnt').textContent = ta.value.length; send.disabled = n < 2; err.textContent = ''; };
ta.addEventListener('input', onInput);

const stage = $('#stage'); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let skipped = false;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('#skip').onclick = () => { skipped = true; };
const yearLabel = (y) => (y < 0 ? `기원전 ${num(-y)}` : `${y}`);

async function play(text, post) {
  // 1) 내 글이 과거로 올라간다
  const q = post.quote; const target = new Date().getFullYear() - q.ago - (q.ago > new Date().getFullYear() ? 1 : 0);
  $('#stYear').classList.add('on');
  const from = new Date().getFullYear(); const t0 = performance.now(); const dur = 1700;
  while (!skipped) {
    const k = Math.min(1, (performance.now() - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
    const y = Math.round(from + (target - from) * e);
    $('#stYear').innerHTML = `${yearLabel(y)}<small>년</small>`;
    if (k >= 1) break; await wait(16);
  }
  $('#stYear').innerHTML = `${yearLabel(target)}<small>년 · ${esc(q.author.place || '')}</small>`;
  if (!skipped) await wait(700);
  // 2) 옛 문장이 한 글자씩 도착한다
  $('#stYear').classList.remove('on');
  $('#stWho').textContent = `${q.author.name}${q.author.native ? ' · ' + q.author.native : ''}`;
  $('#stO').textContent = q.orig.split('/').map((s) => s.trim()).slice(0, 2).join(' / ');
  $('#stLetter').classList.add('on');
  const el = $('#stQ'); el.textContent = '';
  const step = Math.max(18, Math.min(45, 2200 / q.ko.length));
  for (const ch of q.ko) { if (skipped) break; el.textContent += ch; await wait(step); }
  el.textContent = q.ko;
  $('#stNext').classList.add('on');
  if (!skipped) await Promise.race([new Promise((r) => { $('#stNext').onclick = r; }), new Promise((r) => { $('#skip').onclick = r; }), wait(6000)]);
}

function showResult(r) {
  const p = r.post; const posts = new Map([[p.id, p]]);
  const box = $('#result');
  box.innerHTML = `<h1>답장이 도착했어요</h1>
    <p class="lead">${num(p.quote.ago)}년 전, ${esc(josa(p.quote.author.name, '이/가'))} 먼저 써 둔 문장이에요.${r.answeredToday > 1 ? ` 이 문장은 오늘 ${num(r.answeredToday)}명에게 답했어요.` : ''}</p>
    ${postHtml(p)}
    <div class="row"><button class="btn accent" id="card">공유 카드 만들기</button><a class="btn line" href="/">피드에서 보기</a></div>
    <div class="row"><button class="btn line" id="again">하나 더 쓰기</button></div>`;
  bindPosts(box, posts);
  $('#card').onclick = () => openShare(p);
  $('#again').onclick = () => { box.hidden = true; $('#form').hidden = false; ta.value = ''; onInput(); ta.focus(); };
  document.addEventListener('post-deleted', () => { box.hidden = true; $('#form').hidden = false; ta.value = ''; onInput(); }, { once: true });
  $('#form').hidden = true; box.hidden = false; scrollTo(0, 0);
}

function showCrisis(c) {
  $('#form').hidden = true;
  const box = $('#crisis'); box.hidden = false;
  box.innerHTML = `<h1>${esc(c.title)}</h1><p class="lead">${esc(c.body)}</p>
    <div class="box">${c.lines.map((l) => `<a class="tel" href="tel:${l.tel.replace(/-/g, '')}"><span>${esc(l.name)} · ${esc(l.note)}</span><b>${esc(l.tel)}</b></a>`).join('')}</div>
    <p class="hint">이 글은 올라가지 않았고 저장되지도 않았어요.</p>
    <div class="row"><a class="btn line" href="/">피드로 돌아가기</a></div>`;
  scrollTo(0, 0);
}

send.onclick = async () => {
  const text = ta.value.trim(); if (text.length < 2) return;
  send.disabled = true; err.textContent = ''; skipped = reduce;
  const req = api('posts', { method: 'POST', body: { text, token: store.token(), recent: store.recent() } });
  // 연출 시작: 내 글이 위로 올라가며 사라진다
  for (const id of ['#stYear', '#stLetter', '#stNext']) $(id).classList.remove('on');
  const mt = $('#stText'); mt.classList.remove('go'); mt.textContent = text;
  if (!reduce) { stage.classList.add('on'); await wait(500); mt.classList.add('go'); }
  const [r] = await Promise.all([req, reduce ? 0 : wait(1100)]);
  if (r.crisis) { stage.classList.remove('on'); return showCrisis(r.crisis); }
  if (r.error || !r.post) { stage.classList.remove('on'); err.textContent = r.error || '답장을 받지 못했어요. 다시 해 주세요.'; send.disabled = false; return; }
  store.addMine(r.post.id); store.addRecent(r.post.quote.id);
  if (!reduce) await play(text, r.post);
  stage.classList.remove('on');
  showResult(r);
};
onInput();
