import { json, sha, readBody, rateLimit } from '../_lib/util.js';

// 이 답, 어울렸나요? (좋아요 1 / 별로 -1 / 취소 0)
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const v = [1, -1, 0].includes(b.v) ? b.v : null;
  if (!b.id || v === null || !b.token) return json({ error: '잘못된 요청이에요.' }, 400);
  if (!(await rateLimit(env, request, 'vote', 120, 3600))) return json({ error: '잠시 뒤에 다시 해 주세요.' }, 429);
  const voter = await sha('v|' + b.token);
  const id = String(b.id);
  if (v === 0) await env.DB.prepare('DELETE FROM votes WHERE post_id = ? AND voter = ?').bind(id, voter).run();
  else await env.DB.prepare('INSERT OR REPLACE INTO votes (post_id, voter, v) VALUES (?,?,?)').bind(id, voter, v).run();
  await env.DB.prepare(`UPDATE posts SET
    likes = (SELECT COUNT(*) FROM votes WHERE post_id = ?1 AND v = 1),
    dislikes = (SELECT COUNT(*) FROM votes WHERE post_id = ?1 AND v = -1) WHERE id = ?1`).bind(id).run();
  const r = await env.DB.prepare('SELECT likes FROM posts WHERE id = ?').bind(id).first();
  return json({ ok: true, likes: r?.likes || 0 });
}
