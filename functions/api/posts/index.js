import { DATA, json, sha, dayOf, newId, postView, quoteView, rateLimit, readBody } from '../../_lib/util.js';
import { isCrisis, blocked, CRISIS_HELP } from '../../_lib/filter.js';
import { chooseReply } from '../../_lib/match.js';
import { similarities } from '../../_lib/emb.js';

// 피드: 최신 글부터
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const before = Number(u.searchParams.get('before')) || Date.now() + 1000;
  const limit = Math.min(Number(u.searchParams.get('limit')) || 20, 30);
  const { results } = await env.DB.prepare(
    'SELECT * FROM posts WHERE hidden = 0 AND created_at < ? ORDER BY created_at DESC LIMIT ?').bind(before, limit).all();
  const out = { posts: results.map(postView), more: results.length === limit };
  // 글이 하나도 없을 때만: 화면이 어떻게 보이는지 알려 주는 예시(저장되지 않음, '예시' 표시)
  if (!results.length && !u.searchParams.get('before')) {
    let seed = 7; const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    out.samples = [];
    for (const [i, text] of SAMPLES.entries()) {
      const r = await chooseReply(text, { quotes: DATA.quotes, authors: DATA.authors, rand, recentQuotes: new Set(out.samples.map((s) => s.quote.id)) });
      out.samples.push({ id: `sample-${i}`, sample: true, text, at: 0, likes: 0, line: null, lineAi: false, quote: quoteView(r.quote.id) });
    }
  }
  return json(out);
}
const SAMPLES = ['퇴근길에 비 온다. 우산은 회사에 있고', '오랜만에 친구랑 한잔했더니 살 것 같다', '벌써 11월이라니 올해 뭐 했지'];

// 글 쓰기 → 옛 문장 하나가 답글로 달린다
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const text = String(b.text || '').replace(/\s+/g, ' ').trim();
  if (text.length < 2) return json({ error: '조금만 더 써 주세요.' }, 400);
  if (text.length > 100) return json({ error: '100자까지 쓸 수 있어요.' }, 400);
  if (isCrisis(text)) return json({ crisis: CRISIS_HELP });
  const bad = blocked(text);
  if (bad) return json({ error: bad.message, reason: bad.reason }, 400);
  if (!b.token || String(b.token).length < 16) return json({ error: '다시 시도해 주세요.' }, 400);
  if (!(await rateLimit(env, request, 'post', 8, 3600))) return json({ error: '잠시 뒤에 다시 써 주세요. 한 시간에 8개까지 쓸 수 있어요.' }, 429);

  const day = dayOf();
  const counts = await env.DB.prepare('SELECT quote_id, COUNT(*) n FROM posts WHERE day = ? GROUP BY quote_id').bind(day).all();
  const todayCount = new Map(counts.results.map((r) => [r.quote_id, r.n]));
  const recentQuotes = new Set((Array.isArray(b.recent) ? b.recent : []).slice(0, 30).map(String));
  const recentAuthors = new Set([...recentQuotes].map((id) => id.split('-')[0]).slice(0, 5));

  const sims = await similarities(env, text);
  const llm = env.AI ? async (system, user) => {
    const out = await env.AI.run(env.AI_TEXT_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 160, temperature: 0.4,
    });
    return typeof out === 'string' ? out : (out.response ?? out.choices?.[0]?.message?.content ?? '');
  } : null;

  const r = await chooseReply(text, { quotes: DATA.quotes, authors: DATA.authors, recentQuotes, recentAuthors, todayCount, sims, llm });
  const row = {
    id: newId(), text, created_at: Date.now(), day, quote_id: r.quote.id, author_id: r.quote.a,
    line: r.line, line_ai: r.lineAi ? 1 : 0, mood: r.mood, how: r.how + (sims ? '' : '/lex'), owner_hash: await sha(String(b.token)),
  };
  await env.DB.prepare(
    'INSERT INTO posts (id, text, created_at, day, quote_id, author_id, line, line_ai, mood, how, owner_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(row.id, row.text, row.created_at, row.day, row.quote_id, row.author_id, row.line, row.line_ai, row.mood, row.how, row.owner_hash).run();
  const answered = (todayCount.get(r.quote.id) || 0) + 1;
  return json({ post: { ...postView({ ...row, likes: 0 }) }, answeredToday: answered });
}
