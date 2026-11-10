import { json, sha, readBody, rateLimit } from '../_lib/util.js';

// 신고: 서로 다른 3명이 신고하면 피드에서 가려진다
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  if (!b.id || !b.token) return json({ error: '잘못된 요청이에요.' }, 400);
  if (!(await rateLimit(env, request, 'report', 20, 3600))) return json({ error: '잠시 뒤에 다시 해 주세요.' }, 429);
  const id = String(b.id);
  await env.DB.prepare('INSERT OR IGNORE INTO reports (post_id, voter) VALUES (?,?)').bind(id, await sha('r|' + b.token)).run();
  await env.DB.prepare(`UPDATE posts SET reports = (SELECT COUNT(*) FROM reports WHERE post_id = ?1),
    hidden = CASE WHEN (SELECT COUNT(*) FROM reports WHERE post_id = ?1) >= 3 THEN 1 ELSE hidden END WHERE id = ?1`).bind(id).run();
  return json({ ok: true });
}
