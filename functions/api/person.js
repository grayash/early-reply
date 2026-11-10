import { DATA, json, quoteView, dayOf } from '../_lib/util.js';

// 답한 사람 소개: 그 사람의 문장들
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  const a = DATA.authors[id];
  if (!a) return json({ error: '찾을 수 없어요.' }, 404);
  const c = await env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE author_id = ? AND hidden = 0').bind(id).first();
  const t = await env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE author_id = ? AND day = ? AND hidden = 0').bind(id, dayOf()).first();
  return json({
    author: { id, ...a }, answered: c?.n || 0, answeredToday: t?.n || 0,
    quotes: DATA.quotes.filter((q) => q.a === id).map((q) => quoteView(q.id)),
  });
}
