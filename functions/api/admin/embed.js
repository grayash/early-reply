import { json, readBody, DATA } from '../../_lib/util.js';
import { embedChunk, loadVectors } from '../../_lib/emb.js';

// 관리자용: 문장들의 의미값을 계산해 DB에 저장한다. ADMIN_KEY(비밀 값)가 맞아야 한다.
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) return json({ error: '열쇠가 맞지 않아요.' }, 403);
  if (!env.AI) return json({ error: 'AI 연결(binding)이 없어요.' }, 500);
  if (b.check) { const s = await loadVectors(env); return json({ ready: !!s, total: DATA.quotes.length, ver: DATA.ver }); }
  try { return json(await embedChunk(env, Number(b.chunk) || 0)); }
  catch (e) { return json({ error: String(e.message || e) }, 500); }
}
