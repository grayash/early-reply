import { json, readBody, rateLimit } from '../_lib/util.js';
import { blocked } from '../_lib/filter.js';

export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const text = String(b.text || '').trim().slice(0, 1000);
  if (text.length < 2) return json({ error: '내용을 적어 주세요.' }, 400);
  const bad = blocked(text);
  if (bad && bad.reason !== 'pii') return json({ error: bad.message }, 400);
  if (!(await rateLimit(env, request, 'fb', 5, 3600))) return json({ error: '잠시 뒤에 다시 보내 주세요.' }, 429);
  await env.DB.prepare('INSERT INTO feedback (text, created_at) VALUES (?, ?)').bind(text, Date.now()).run();
  return json({ ok: true });
}
