// 서버 없이 Firebase(Firestore + 익명 로그인)만으로 돌아가는 뒷단.
// 화면 코드는 예전처럼 api('posts'), api('vote') 같은 이름으로 부르고, 여기서 Firestore 호출로 바꾼다.
// 답글 고르기와 거르기는 이 브라우저 안에서 한다(src/lib). 접근 제한은 firestore.rules 가 맡는다.
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, writeBatch,
  serverTimestamp, getCountFromServer, increment, Timestamp,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';
import { DATA, quoteView, postView, dayOf, newId } from './lib/util.js';
import { chooseReply } from './lib/match.js';
import { isCrisis, blocked, CRISIS_HELP } from './lib/filter.js';
import { CATS } from './lib/lexicon.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const col = (n) => collection(db, n);

// 쓰기·공감·신고 때만 익명 로그인을 한다. 글을 읽는 데는 로그인이 필요 없다.
let uidP = null;
const uid = () => uidP || (uidP = new Promise((resolve, reject) => {
  const off = onAuthStateChanged(auth, async (u) => {
    if (u) { off(); resolve(u.uid); return; }
    try { await signInAnonymously(auth); } catch (e) { off(); uidP = null; reject(e); }
  });
}));

const fail = (error) => ({ error });
const ms = (t) => (t && t.toMillis ? t.toMillis() : Date.now());
const fromDoc = (d) => { const x = d.data(); return { id: d.id, ...x, at: ms(x.at) }; };
const viewOf = (d) => postView(fromDoc(d));
const SAMPLES = ['퇴근길에 비 온다. 우산은 회사에 있고', '오랜만에 친구랑 한잔했더니 살 것 같다', '벌써 11월이라니 올해 뭐 했지'];

async function count(...filters) {
  const s = await getCountFromServer(query(col('posts'), where('hidden', '==', false), ...filters));
  return s.data().count;
}

/* ---------- 읽기 ---------- */
async function feed(q) {
  const before = Number(q.get('before')) || 0; const n = 20;
  const snap = await getDocs(query(col('posts'), where('hidden', '==', false), orderBy('at', 'desc'),
    ...(before ? [startAfter(Timestamp.fromMillis(before))] : []), limit(n)));
  const out = { posts: snap.docs.map(viewOf), more: snap.docs.length === n };
  // 글이 하나도 없을 때만: 화면이 어떻게 보이는지 알려 주는 예시(저장되지 않음, '예시' 표시)
  if (!snap.docs.length && !before) {
    let seed = 7; const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    out.samples = [];
    for (const [i, text] of SAMPLES.entries()) {
      const r = await chooseReply(text, { quotes: DATA.quotes, authors: DATA.authors, rand, recentQuotes: new Set(out.samples.map((s) => s.quote.id)) });
      out.samples.push({ id: `sample-${i}`, sample: true, text, at: 0, likes: 0, line: null, lineAi: false, quote: quoteView(r.quote.id) });
    }
  }
  return out;
}

async function onePost(id) {
  let snap;
  try { snap = await getDoc(doc(db, 'posts', id)); } catch { return fail('글을 찾을 수 없어요.'); }
  if (!snap.exists() || snap.data().hidden) return fail('글을 찾을 수 없어요.');
  const p = viewOf(snap);
  return { post: p, answeredToday: await count(where('day', '==', dayOf()), where('quoteId', '==', snap.data().quoteId)) };
}

async function person(id) {
  const a = DATA.authors[id];
  if (!a) return fail('찾을 수 없어요.');
  const [answered, answeredToday] = await Promise.all([
    count(where('authorId', '==', id)), count(where('authorId', '==', id), where('day', '==', dayOf())),
  ]);
  return { author: { id, ...a }, answered, answeredToday, quotes: DATA.quotes.filter((q) => q.a === id).map((q) => quoteView(q.id)) };
}

// 순위: 숫자가 충분히 모였을 때만 보여 준다. 가짜 숫자는 넣지 않는다. 최근 글 300개로 세고 5분 동안 기억해 둔다.
const RANK_MIN = 5;
let rankCache = null;
async function rank() {
  if (rankCache && Date.now() - rankCache.t < 300e3) return rankCache.v;
  const day = dayOf(); const weekAgo = Date.now() - 7 * 86400e3;
  const [today, snap] = await Promise.all([
    count(where('day', '==', day)),
    getDocs(query(col('posts'), where('hidden', '==', false), orderBy('at', 'desc'), limit(300))),
  ]);
  const list = snap.docs.map(fromDoc);
  const mine = list.filter((x) => x.day === day);
  const by = (arr, f) => { const m = new Map(); for (const x of arr) m.set(f(x), (m.get(f(x)) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  const enough = today >= RANK_MIN;
  const week = list.filter((x) => x.at > weekAgo);
  let farthest = null;
  for (const x of week) { const q = quoteView(x.quoteId); if (q && (!farthest || q.ago > farthest.ago)) farthest = q; }
  const likes = new Map();
  for (const x of week) if (x.likes > 0) likes.set(x.quoteId, (likes.get(x.quoteId) || 0) + x.likes);
  const v = {
    today, enough, min: RANK_MIN,
    authors: enough ? by(mine, (x) => x.authorId).slice(0, 5).map(([id, n]) => ({ id, name: DATA.authors[id]?.name, when: DATA.authors[id]?.when, n })) : [],
    quotes: [...likes].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ n, quote: quoteView(id) })).filter((x) => x.quote),
    mood: enough ? by(mine, (x) => x.mood).map(([k, n]) => ({ key: k, name: CATS[k] || k, n })) : [],
    farthest,
    library: { quotes: DATA.quotes.length, authors: Object.keys(DATA.authors).length },
  };
  rankCache = { t: Date.now(), v };
  return v;
}

/* ---------- 쓰기 ---------- */
async function write(b) {
  const text = String(b.text || '').replace(/\s+/g, ' ').trim();
  if (text.length < 2) return fail('조금만 더 써 주세요.');
  if (text.length > 100) return fail('100자까지 쓸 수 있어요.');
  if (isCrisis(text)) return { crisis: CRISIS_HELP };
  const bad = blocked(text);
  if (bad) return { error: bad.message, reason: bad.reason };

  let u;
  try { u = await uid(); } catch { return fail('연결을 준비하지 못했어요. 잠시 뒤 다시 해 주세요.'); }
  const day = dayOf();
  // 최근 글 30개에서 오늘 많이 달린 문장을 세어, 같은 문장이 하루에 몰리지 않게 한다(실패해도 글쓰기는 계속)
  const todayCount = new Map();
  try {
    const s = await getDocs(query(col('posts'), where('hidden', '==', false), orderBy('at', 'desc'), limit(30)));
    for (const d of s.docs) { const x = d.data(); if (x.day === day) todayCount.set(x.quoteId, (todayCount.get(x.quoteId) || 0) + 1); }
  } catch { /* 건너뜀 */ }
  const recentQuotes = new Set((Array.isArray(b.recent) ? b.recent : []).slice(0, 30).map(String));
  const recentAuthors = new Set([...recentQuotes].map((id) => id.split('-')[0]).slice(0, 5));
  const r = await chooseReply(text, { quotes: DATA.quotes, authors: DATA.authors, recentQuotes, recentAuthors, todayCount });

  const id = newId();
  const batch = writeBatch(db);
  batch.set(doc(db, 'posts', id), {
    text, at: serverTimestamp(), day, quoteId: r.quote.id, authorId: r.quote.a, mood: r.mood, how: r.how, likes: 0, reports: 0, hidden: false,
  });
  batch.set(doc(db, 'posts', id, 'priv', 'o'), { uid: u }); // 내 글인지 확인하는 비공개 열쇠(본인과 관리자만 읽는다)
  batch.set(doc(db, 'rate', u + '_post'), { t: serverTimestamp() }); // 20초에 한 번만
  try { await batch.commit(); } catch (e) {
    return fail(e.code === 'permission-denied' ? '잠시 뒤에 다시 써 주세요. 20초에 한 번 쓸 수 있어요.' : '글을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.');
  }
  let n = 1;
  try { n = await count(where('day', '==', day), where('quoteId', '==', r.quote.id)); } catch { /* 숫자만 건너뜀 */ }
  return { post: { id, text, at: Date.now(), likes: 0, line: null, lineAi: false, quote: quoteView(r.quote.id) }, answeredToday: n };
}

async function removeMine(id) {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'posts', id, 'priv', 'o'));
    batch.delete(doc(db, 'posts', id));
    await batch.commit();
    return { ok: true };
  } catch (e) {
    return fail(e.code === 'permission-denied' ? '내 글만 지울 수 있어요.' : '삭제하지 못했어요. 잠시 뒤 다시 해 주세요.');
  }
}

// 이 답, 어울렸나요? (1 좋아요 / -1 글쎄요 / 0 취소). 좋아요 숫자는 1표만 센다.
async function vote(b) {
  const v = [1, -1, 0].includes(b.v) ? b.v : null;
  if (!b.id || v === null) return fail('잘못된 요청이에요.');
  try {
    const u = await uid(); const id = String(b.id);
    const pref = doc(db, 'posts', id); const vref = doc(db, 'votes', id + '_' + u);
    const [p, prev] = await Promise.all([getDoc(pref), getDoc(vref)]);
    if (!p.exists()) return fail('글을 찾을 수 없어요.');
    const before = prev.exists() && prev.data().v === 1 ? 1 : 0; const after = v === 1 ? 1 : 0;
    if (!prev.exists() && v === 0) return { ok: true, likes: p.data().likes || 0 };
    const batch = writeBatch(db);
    if (v === 0) batch.delete(vref); else batch.set(vref, { p: id, v });
    if (after !== before) batch.update(pref, { likes: increment(after - before) });
    await batch.commit();
    return { ok: true, likes: Math.max(0, (p.data().likes || 0) + after - before) };
  } catch { return fail('잠시 뒤에 다시 해 주세요.'); }
}

// 신고: 서로 다른 3명이 신고하면 피드에서 가려진다. 한 사람은 글 하나에 한 번만.
async function report(b) {
  if (!b.id) return fail('잘못된 요청이에요.');
  try {
    const u = await uid(); const id = String(b.id);
    for (let i = 0; i < 2; i++) {
      const pref = doc(db, 'posts', id); const rref = doc(db, 'reports', id + '_' + u);
      const [p, ex] = await Promise.all([getDoc(pref), getDoc(rref)]);
      if (!p.exists() || ex.exists()) return { ok: true };
      const n = (p.data().reports || 0) + 1;
      const batch = writeBatch(db);
      batch.set(rref, { p: id });
      batch.update(pref, { reports: increment(1), hidden: !!p.data().hidden || n >= 3 });
      try { await batch.commit(); return { ok: true }; } catch (e) { if (e.code !== 'permission-denied') break; } // 동시에 신고가 겹쳤으면 한 번 더
    }
  } catch { /* 신고는 조용히 */ }
  return { ok: true };
}

async function feedback(b) {
  const text = String(b.text || '').trim().slice(0, 1000);
  if (text.length < 2) return fail('내용을 적어 주세요.');
  const bad = blocked(text);
  if (bad && bad.reason !== 'pii') return fail(bad.message);
  try {
    const u = await uid();
    const batch = writeBatch(db);
    batch.set(doc(col('feedback')), { text, at: serverTimestamp() });
    batch.set(doc(db, 'rate', u + '_fb'), { t: serverTimestamp() }); // 1분에 한 번만
    await batch.commit();
    return { ok: true };
  } catch (e) { return fail(e.code === 'permission-denied' ? '잠시 뒤에 다시 보내 주세요.' : '보내지 못했어요. 잠시 뒤 다시 해 주세요.'); }
}

/* ---------- 관리자(구글 로그인 + admins 문서가 있는 계정만) ---------- */
export const adminLogin = async () => (await signInWithPopup(auth, new GoogleAuthProvider())).user.uid;
export const adminLogout = () => signOut(auth);
export const adminWho = () => new Promise((res) => { const off = onAuthStateChanged(auth, (u) => { off(); res(u && !u.isAnonymous ? { uid: u.uid, name: u.displayName || '' } : null); }); });
export async function adminIsAdmin(uidValue) {
  try { return (await getDoc(doc(db, 'admins', uidValue))).exists(); } catch { return false; }
}
const adminView = (d) => { const x = fromDoc(d); return { ...postView(x), reports: x.reports || 0, hidden: !!x.hidden }; };
const subDocs = async (name, id) => (await getDocs(query(col(name), where('p', '==', id)))).docs;

async function manage(b) {
  try {
    if (b.act === 'feedback') {
      const s = await getDocs(query(col('feedback'), orderBy('at', 'desc'), limit(100)));
      return { feedback: s.docs.map((d) => ({ id: d.id, text: d.data().text, created_at: ms(d.data().at) })) };
    }
    if (b.act === 'feedback-done') { const batch = writeBatch(db); batch.delete(doc(db, 'feedback', String(b.id))); await batch.commit(); return { ok: true }; }
    if (b.act === 'reported') {
      const s = await getDocs(query(col('posts'), where('reports', '>', 0), orderBy('reports', 'desc'), limit(100)));
      return { posts: s.docs.map(adminView).sort((a, c) => Number(c.hidden) - Number(a.hidden) || c.reports - a.reports) };
    }
    const id = String(b.id || '').trim().replace(/^.*[?&]id=/, '');
    if (!id) return fail('글 주소나 id를 넣어 주세요.');
    const pref = doc(db, 'posts', id);
    if (b.act === 'find') { const d = await getDoc(pref); return d.exists() ? { post: adminView(d) } : fail('그런 글이 없어요.'); }
    if (b.act === 'hide') { const batch = writeBatch(db); batch.update(pref, { hidden: true }); await batch.commit(); return { ok: true }; }
    if (b.act === 'restore' || b.act === 'delete') {
      const batch = writeBatch(db);
      for (const d of await subDocs('reports', id)) batch.delete(d.ref);
      if (b.act === 'restore') batch.update(pref, { hidden: false, reports: 0 });
      else {
        for (const d of await subDocs('votes', id)) batch.delete(d.ref);
        batch.delete(doc(db, 'posts', id, 'priv', 'o'));
        batch.delete(pref);
      }
      await batch.commit();
      return { ok: true };
    }
    return fail('알 수 없는 요청이에요.');
  } catch (e) { return fail(e.code === 'permission-denied' ? '관리자 계정으로 들어와야 해요.' : '처리하지 못했어요: ' + (e.code || e.message)); }
}

/* ---------- 화면이 부르는 입구 ---------- */
export async function api(path, opt = {}) {
  const method = opt.method || 'GET'; const b = opt.body || {};
  const [p, qs] = path.split('?'); const q = new URLSearchParams(qs || '');
  try {
    if (p === 'posts' && method === 'GET') return await feed(q);
    if (p === 'posts' && method === 'POST') return await write(b);
    const m = p.match(/^posts\/(.+)$/);
    if (m) return method === 'DELETE' ? await removeMine(m[1]) : await onePost(m[1]);
    if (p === 'vote') return await vote(b);
    if (p === 'report') return await report(b);
    if (p === 'feedback') return await feedback(b);
    if (p === 'person') return await person(q.get('id') || '');
    if (p === 'rank') return await rank();
    if (p === 'admin/manage') return await manage(b);
  } catch (e) { console.warn(e); }
  return fail('연결이 고르지 않아요. 잠시 뒤 다시 해 주세요.');
}
