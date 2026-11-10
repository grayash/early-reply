import { json, sha, postView, dayOf } from '../../_lib/util.js';

export async function onRequestGet({ params, env }) {
  const r = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND hidden = 0').bind(params.id).first();
  if (!r) return json({ error: '글을 찾을 수 없어요.' }, 404);
  const c = await env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE day = ? AND quote_id = ? AND hidden = 0').bind(dayOf(), r.quote_id).first();
  return json({ post: postView(r), answeredToday: c?.n || 0 });
}

// 내 글 삭제: 글을 쓸 때 기기에 저장된 열쇠가 맞아야 한다
export async function onRequestDelete({ request, params, env }) {
  const token = request.headers.get('x-token') || '';
  const r = await env.DB.prepare('SELECT owner_hash FROM posts WHERE id = ?').bind(params.id).first();
  if (!r) return json({ ok: true });
  if (r.owner_hash !== await sha(token)) return json({ error: '내 글만 지울 수 있어요.' }, 403);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM votes WHERE post_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM reports WHERE post_id = ?').bind(params.id),
  ]);
  return json({ ok: true });
}
