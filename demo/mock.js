// 예시판 전용: 서버 대신 이 브라우저 안에서 같은 일을 한다.
// 답글 고르기·거르기는 서버와 같은 코드(srv/)를 그대로 쓴다. 글은 이 브라우저에만 저장된다.
import DATA from './srv/_data/quotes.js';
import { chooseReply } from './srv/_lib/match.js';
import { isCrisis, blocked, CRISIS_HELP } from './srv/_lib/filter.js';
import { CATS } from './srv/_lib/lexicon.js';
import { quoteView, postView, dayOf, newId, sha } from './srv/_lib/util.js';

const KEY = 'or_demo_db_v1';
let mem = null;
const load = () => {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { mem = null; }
  if (!mem) mem = seed();
  return mem;
};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* 저장이 막힌 브라우저: 이 화면에서만 */ } };

// 처음 열었을 때 피드가 비어 있지 않도록 넣는 예시 글. 화면에 '예시' 표시가 붙는다.
const SEEDS = [
  '월요일 아침 너무 싫다 진짜', '오랜만에 친구랑 한잔했더니 살 것 같다', '새벽 세 시인데 잠이 안 와. 생각이 너무 많아',
  '합격했다!!!! 믿기지 않아', '고향 집 가고 싶다', '헤어진 지 한 달인데 아직도 생각난다', '열심히 했는데 인정을 못 받으니까 억울하다',
  '비 오는 날 창가에서 커피 마시는 중. 좋다',
];
function seed() {
  let s = 11; const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const db = { posts: [], votes: {}, fb: [] };
  const recentQuotes = new Set(); const recentAuthors = new Set();
  const now = Date.now();
  SEEDS.forEach((text, i) => {
    // 이 함수는 동기적으로 끝나도록(AI 없음) chooseReply의 결과를 기다리지 않고 아래에서 채운다
    db.posts.push({ id: 'ex' + i, text, created_at: now - (i + 1) * 23 * 60e3, quote_id: null, likes: (i * 7) % 4, sample: true, _rand: rand() });
  });
  return db;
}
async function fillSeeds(db) {
  if (db.posts.every((p) => p.quote_id)) return;
  let s = 11; const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const recentQuotes = new Set(); const recentAuthors = new Set();
  for (const p of db.posts.filter((x) => !x.quote_id).reverse()) {
    const r = await chooseReply(p.text, { quotes: DATA.quotes, authors: DATA.authors, recentQuotes, recentAuthors, rand });
    recentQuotes.add(r.quote.id); recentAuthors.add(r.quote.a);
    p.quote_id = r.quote.id; p.author_id = r.quote.a; p.mood = r.mood; p.day = dayOf(p.created_at); delete p._rand;
  }
  save();
}
const view = (p) => ({ ...postView({ ...p, line: null, line_ai: 0 }), sample: !!p.sample });
const ok = (o) => JSON.parse(JSON.stringify(o));

export async function mockApi(path, opt = {}) {
  const db = load(); await fillSeeds(db);
  const method = opt.method || 'GET'; const b = opt.body || {};
  const [p, qs] = path.split('?'); const q = new URLSearchParams(qs || '');
  await new Promise((r) => setTimeout(r, 120));
  const live = db.posts.filter((x) => !x.hidden).sort((a, c) => c.created_at - a.created_at);

  if (p === 'posts' && method === 'GET') {
    const before = Number(q.get('before')) || Date.now() + 1000;
    const list = live.filter((x) => x.created_at < before).slice(0, 20);
    return ok({ posts: list.map(view), more: live.filter((x) => x.created_at < before).length > 20 });
  }
  if (p === 'posts' && method === 'POST') {
    const text = String(b.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) return { error: '조금만 더 써 주세요.' };
    if (text.length > 100) return { error: '100자까지 쓸 수 있어요.' };
    if (isCrisis(text)) return { crisis: CRISIS_HELP };
    const bad = blocked(text); if (bad) return { error: bad.message, reason: bad.reason };
    const day = dayOf(); const todayCount = new Map();
    for (const x of live) if (x.day === day) todayCount.set(x.quote_id, (todayCount.get(x.quote_id) || 0) + 1);
    const recentQuotes = new Set((b.recent || []).slice(0, 30)); const recentAuthors = new Set([...recentQuotes].map((id) => id.split('-')[0]).slice(0, 5));
    const r = await chooseReply(text, { quotes: DATA.quotes, authors: DATA.authors, recentQuotes, recentAuthors, todayCount });
    const row = { id: newId(), text, created_at: Date.now(), day, quote_id: r.quote.id, author_id: r.quote.a, mood: r.mood, likes: 0, owner: await sha(String(b.token)) };
    db.posts.push(row); save();
    return ok({ post: view(row), answeredToday: (todayCount.get(r.quote.id) || 0) + 1 });
  }
  const m = p.match(/^posts\/(.+)$/);
  if (m) {
    const row = db.posts.find((x) => x.id === m[1]);
    if (method === 'DELETE') {
      if (!row) return { ok: true };
      if (row.owner !== await sha(String(opt.headers?.['x-token'] || ''))) return { error: '내 글만 지울 수 있어요.' };
      db.posts = db.posts.filter((x) => x !== row); save(); return { ok: true };
    }
    if (!row || row.hidden) return { error: '글을 찾을 수 없어요.' };
    return ok({ post: view(row), answeredToday: live.filter((x) => x.day === dayOf() && x.quote_id === row.quote_id).length });
  }
  if (p === 'vote') {
    const row = db.posts.find((x) => x.id === b.id); if (!row) return { error: '글을 찾을 수 없어요.' };
    const k = row.id; const prev = db.votes[k] || 0; db.votes[k] = b.v;
    row.likes = Math.max(0, (row.likes || 0) + (b.v === 1 ? 1 : 0) - (prev === 1 ? 1 : 0)); save();
    return { ok: true, likes: row.likes };
  }
  if (p === 'report') { const row = db.posts.find((x) => x.id === b.id); if (row) { row.reports = (row.reports || 0) + 1; save(); } return { ok: true }; }
  if (p === 'feedback') { db.fb.push({ text: String(b.text || '').slice(0, 1000), at: Date.now() }); save(); return { ok: true }; }
  if (p === 'person') {
    const id = q.get('id') || ''; const a = DATA.authors[id]; if (!a) return { error: '찾을 수 없어요.' };
    return ok({ author: { id, ...a }, answered: live.filter((x) => x.author_id === id).length,
      answeredToday: live.filter((x) => x.author_id === id && x.day === dayOf()).length,
      quotes: DATA.quotes.filter((x) => x.a === id).map((x) => quoteView(x.id)) });
  }
  if (p === 'rank') {
    const min = 5; const day = dayOf(); const today = live.filter((x) => x.day === day);
    const by = (arr, f) => { const mm = new Map(); for (const x of arr) mm.set(f(x), (mm.get(f(x)) || 0) + 1); return [...mm].sort((a, c) => c[1] - a[1]); };
    const enough = today.length >= min;
    const week = live.filter((x) => x.created_at > Date.now() - 7 * 86400e3);
    let farthest = null; for (const x of week) { const v = quoteView(x.quote_id); if (v && (!farthest || v.ago > farthest.ago)) farthest = v; }
    const likes = new Map(); for (const x of week) if (x.likes) likes.set(x.quote_id, (likes.get(x.quote_id) || 0) + x.likes);
    return ok({
      today: today.length, enough, min,
      authors: enough ? by(today, (x) => x.author_id).slice(0, 5).map(([id, n]) => ({ id, name: DATA.authors[id].name, when: DATA.authors[id].when, n })) : [],
      quotes: [...likes].sort((a, c) => c[1] - a[1]).slice(0, 5).map(([id, n]) => ({ n, quote: quoteView(id) })),
      mood: enough ? by(today, (x) => x.mood).map(([k, n]) => ({ key: k, name: CATS[k] || k, n })) : [],
      farthest, library: { quotes: DATA.quotes.length, authors: Object.keys(DATA.authors).length },
    });
  }
  return { error: '예시판에서는 쓸 수 없는 기능이에요.' };
}

export function resetDemo() { mem = null; try { localStorage.removeItem(KEY); localStorage.removeItem('or_mine'); localStorage.removeItem('or_recent'); localStorage.removeItem('or_votes'); localStorage.removeItem('or_reported'); } catch { /* */ } }
