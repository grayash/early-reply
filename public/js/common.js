// 모든 화면이 함께 쓰는 코드: 기기 저장, 서버 호출, 글 카드 그리기, 공유 카드
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장이 막힌 브라우저 */ } },
};
export const store = {
  token() {
    let t = LS.get('or_token');
    if (!t) { t = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''); LS.set('or_token', t); }
    return t;
  },
  mine: () => LS.get('or_mine', []),
  addMine(id) { LS.set('or_mine', [id, ...store.mine()].slice(0, 500)); },
  removeMine(id) { LS.set('or_mine', store.mine().filter((x) => x !== id)); },
  recent: () => LS.get('or_recent', []),
  addRecent(qid) { LS.set('or_recent', [qid, ...store.recent().filter((x) => x !== qid)].slice(0, 20)); },
  votes: () => LS.get('or_votes', {}),
  setVote(id, v) { const o = store.votes(); if (v) o[id] = v; else delete o[id]; LS.set('or_votes', o); },
  reported: () => LS.get('or_reported', []),
  addReported(id) { LS.set('or_reported', [id, ...store.reported()].slice(0, 300)); },
};

export async function api(path, opt = {}) {
  const res = await fetch('/api/' + path, {
    method: opt.method || 'GET',
    headers: { ...(opt.body ? { 'content-type': 'application/json' } : {}), ...(opt.headers || {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok && !data.error) data.error = '연결이 고르지 않아요. 잠시 뒤 다시 해 주세요.';
  return data;
}

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 받침에 따라 조사 고르기: josa('이백', '이/가') → '이백이'
export function josa(word, pair) {
  const [a, b] = pair.split('/'); const ch = String(word).trim().slice(-1); const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return word + a + '(' + b + ')';
  return word + ((code - 0xac00) % 28 ? a : b);
}
export const num = (n) => Number(n).toLocaleString('ko-KR');

export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}

export function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
export const agoText = (q) => `${num(q.ago)}년 전`;
const origHtml = (o) => esc(o).replace(/\s*\/\s*/g, '<br>');

export function replyHtml(q, post, mine) {
  const a = q.author;
  const meta = [a.native, q.when, a.place].filter(Boolean).join(' · ');
  const line = post?.line
    ? `<p class="linkline">${esc(post.line)}${post.lineAi ? '<span class="ai" title="이 한 줄은 AI가 썼어요">AI 연결</span>' : ''}</p>`
    : (q.note ? `<p class="linkline">${esc(q.note)}</p>` : '');
  return `<div class="reply">
    <div class="ago">↳ ${mine ? '당신의 글' : '이 글'}보다 ${agoText(q)}</div>
    <a class="author" href="/person.html?id=${encodeURIComponent(a.id)}">
      <span class="av" aria-hidden="true">${esc((a.name || '?')[0])}</span>
      <span><b>${esc(a.name)}</b><span class="meta">${esc(meta)}</span></span>
    </a>
    <p class="ko">${esc(q.ko)}</p>
    <p class="orig" lang="${esc(q.lang)}">${origHtml(q.orig)}</p>
    <p class="src">${esc(q.src)}${q.url ? ` · <a href="${esc(q.url)}" target="_blank" rel="noopener">원문 확인</a>` : ''}</p>
    ${line}
  </div>`;
}

export function postHtml(p) {
  const mine = store.mine().includes(p.id);
  const v = store.votes()[p.id];
  const sample = p.sample;
  return `<article class="post${mine ? ' mine' : ''}" data-id="${esc(p.id)}">
    <header><span>익명</span><span>·</span><span>${sample ? '' : timeAgo(p.at)}</span>
      ${mine ? '<span class="badge">내 글</span>' : ''}${sample ? '<span class="badge sample">예시</span>' : ''}</header>
    <p class="text">${esc(p.text)}</p>
    ${replyHtml(p.quote, p, mine)}
    ${sample ? '' : `<footer>
      <button data-act="like" class="${v === 1 ? 'on' : ''}" aria-pressed="${v === 1}">어울려요 <span class="n">${p.likes || ''}</span></button>
      <button data-act="dislike" class="${v === -1 ? 'on' : ''}" aria-pressed="${v === -1}">글쎄요</button>
      <span class="sp"></span>
      <button data-act="share">공유</button>
      ${mine ? '<button data-act="delete">삭제</button>' : '<button data-act="report">신고</button>'}
    </footer>`}
  </article>`;
}

/** 글 카드 안의 버튼(어울려요·글쎄요·공유·신고·삭제) 동작 */
export function bindPosts(root, posts) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.post'); const id = card.dataset.id; const act = btn.dataset.act;
    const post = posts.get(id);
    if (act === 'like' || act === 'dislike') {
      const want = act === 'like' ? 1 : -1;
      const cur = store.votes()[id];
      const v = cur === want ? 0 : want;
      store.setVote(id, v);
      card.querySelector('[data-act=like]').classList.toggle('on', v === 1);
      card.querySelector('[data-act=dislike]').classList.toggle('on', v === -1);
      const r = await api('vote', { method: 'POST', body: { id, v, token: store.token() } });
      if (r.ok) card.querySelector('.n').textContent = r.likes || '';
      else if (r.error) toast(r.error);
    } else if (act === 'share') {
      openShare(post);
    } else if (act === 'report') {
      if (store.reported().includes(id)) return toast('이미 신고한 글이에요.');
      store.addReported(id);
      await api('report', { method: 'POST', body: { id, token: store.token() } });
      card.remove(); toast('신고했어요. 이 글은 내 화면에서 가렸어요.');
    } else if (act === 'delete') {
      if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = '정말 삭제'; setTimeout(() => { btn.dataset.sure = ''; btn.textContent = '삭제'; }, 3000); return; }
      const r = await api('posts/' + id, { method: 'DELETE', headers: { 'x-token': store.token() } });
      if (r.ok) { store.removeMine(id); card.remove(); toast('삭제했어요.'); document.dispatchEvent(new CustomEvent('post-deleted', { detail: id })); }
      else toast(r.error || '삭제하지 못했어요.');
    }
  });
}

/* ---------- 공유 카드 (9:16) ---------- */
function wrap(ctx, text, maxW) {
  const lines = []; let cur = '';
  for (const ch of String(text)) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      // 낱말 중간에서 끊기지 않게, 가까운 띄어쓰기에서 줄을 바꾼다
      const sp = cur.lastIndexOf(' ');
      if (ch !== ' ' && sp > cur.length * 0.45) { lines.push(cur.slice(0, sp)); cur = cur.slice(sp + 1) + ch; }
      else { lines.push(cur.trimEnd()); cur = ch === ' ' ? '' : ch; }
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function drawCard(canvas, post, withText) {
  const W = 1080, H = 1920; canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d'); const q = post.quote;
  const serif = "'Gowun Batang', 'Noto Serif KR', serif"; const sans = "-apple-system, 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  try { await Promise.all([document.fonts.load(`56px ${serif}`, q.ko), document.fonts.load(`700 56px ${serif}`, '먼저 온 답장')]); } catch { /* 기본 글꼴로 */ }
  c.fillStyle = '#17130f'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#efe7d8'; c.textBaseline = 'top';
  const M = 110;
  c.font = `700 44px ${serif}`; c.fillText('먼저 온 답장', M, 150);
  const oldf = "'Old Hangul', 'Noto Serif KR', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', serif";
  if (q.lang === 'ko') { try { await document.fonts.load(`36px 'Old Hangul'`, q.orig); } catch { /* 기본 글꼴로 */ } }
  const body = (y0, dry) => {
    const T = dry ? () => {} : (s, x, yy) => c.fillText(s, x, yy);
    let y = y0;
    if (withText) {
      c.font = `40px ${sans}`; c.globalAlpha = .6; T('오늘, 누군가 썼다', M, y); c.globalAlpha = 1; y += 80;
      c.font = `50px ${sans}`;
      for (const l of wrap(c, post.text, W - M * 2).slice(0, 5)) { T(l, M, y); y += 76; }
      y += 70;
    }
    c.fillStyle = '#e0795f'; c.font = `600 42px ${sans}`;
    T(`↳ ${num(q.ago)}년 전, 먼저 온 답장`, M, y); y += 100;
    c.fillStyle = '#efe7d8';
    let size = q.ko.length > 90 ? 50 : q.ko.length > 50 ? 58 : 66;
    c.font = `${size}px ${serif}`;
    for (const l of wrap(c, q.ko, W - M * 2)) { T(l, M, y); y += size * 1.65; }
    y += 40;
    c.globalAlpha = .55; c.font = `36px ${q.lang === 'ko' ? oldf : serif}`;
    const orig = q.orig.split('/').map((s) => s.trim()).slice(0, 2).join(' / ');
    for (const l of wrap(c, orig, W - M * 2).slice(0, 3)) { T(l, M, y); y += 56; }
    c.globalAlpha = 1; y += 50;
    c.font = `600 44px ${sans}`; T(q.author.name, M, y); y += 64;
    c.globalAlpha = .65; c.font = `36px ${sans}`;
    T([q.when, q.author.place].filter(Boolean).join(' · '), M, y);
    const srcL = wrap(c, q.src, W - M * 2).slice(0, 2);
    srcL.forEach((l, i) => T(l, M, y + 54 * (i + 1)));
    c.globalAlpha = 1;
    return y + 54 * (srcL.length + 1) - y0;
  };
  // 위 제목(150~200)과 아래 주소(H-170) 사이 가운데
  const h = body(0, true); const top = Math.max(300, Math.round((300 + (H - 260) - h) / 2));
  body(top, false);
  c.globalAlpha = .65;
  c.font = `34px ${sans}`; c.fillText(location.host, M, H - 170);
  c.globalAlpha = 1;
}

export function openShare(post) {
  let sh = $('.sheet');
  if (!sh) {
    sh = document.createElement('div'); sh.className = 'sheet';
    sh.innerHTML = `<div class="in" role="dialog" aria-label="공유">
      <canvas></canvas>
      <label><input type="checkbox" id="shText" checked> 쓴 글도 카드에 함께 넣기</label>
      <div class="row"><button class="btn" id="shImg">이미지로 공유</button><button class="btn line" id="shLink">링크 복사</button></div>
      <button class="btn line more" id="shClose">닫기</button></div>`;
    document.body.append(sh);
    sh.addEventListener('click', (e) => { if (e.target === sh) sh.classList.remove('on'); });
    $('#shClose', sh).onclick = () => sh.classList.remove('on');
  }
  const canvas = $('canvas', sh); const chk = $('#shText', sh);
  const url = `${location.origin}/post.html?id=${encodeURIComponent(post.id)}`;
  const draw = () => drawCard(canvas, post, chk.checked);
  chk.onchange = draw; draw();
  $('#shImg', sh).onclick = async () => {
    await draw();
    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'reply.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: '먼저 온 답장' }); } catch { /* 취소 */ } }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'reply.png'; a.click(); toast('이미지를 저장했어요.'); }
    }, 'image/png');
  };
  $('#shLink', sh).onclick = async () => {
    if (post.sample) return toast('예시 글은 링크가 없어요.');
    try {
      if (navigator.share && !navigator.clipboard) await navigator.share({ url, title: '먼저 온 답장' });
      else { await navigator.clipboard.writeText(url); toast('링크를 복사했어요. 링크에서는 쓴 글도 함께 보여요.'); }
    } catch { toast(url); }
  };
  sh.classList.add('on');
}

export function chrome(active) {
  const top = document.createElement('div'); top.className = 'top';
  top.innerHTML = `<div class="in"><a class="brand" href="/">먼저 온 <i>답장</i></a><small>옛 사람이 먼저 써 둔 답글</small></div>`;
  document.body.prepend(top);
  const tabs = document.createElement('nav'); tabs.className = 'tabs'; tabs.setAttribute('aria-label', '화면 이동');
  const t = [['/', '피드', 'feed'], ['/write.html', '＋ 쓰기', 'write'], ['/rank.html', '순위', 'rank'], ['/about.html', '소개', 'about']];
  tabs.innerHTML = `<div class="in">${t.map(([h, n, k]) => `<a href="${h}" class="${k === active ? 'on' : ''}${k === 'write' ? ' write' : ''}"${k === active ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</div>`;
  document.body.append(tabs);
}
