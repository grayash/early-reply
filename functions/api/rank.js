import { DATA, json, dayOf, quoteView } from '../_lib/util.js';
import { CATS } from '../_lib/lexicon.js';

// 순위: 숫자가 충분히 모였을 때만 보여 준다. 가짜 숫자는 넣지 않는다.
export async function onRequestGet({ env }) {
  const min = Number(env.RANK_MIN || 5);
  const day = dayOf();
  const weekAgo = Date.now() - 7 * 86400e3;
  const [total, authors, quotes, mood, far] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE day = ? AND hidden = 0').bind(day),
    env.DB.prepare('SELECT author_id, COUNT(*) n FROM posts WHERE day = ? AND hidden = 0 GROUP BY author_id ORDER BY n DESC LIMIT 5').bind(day),
    env.DB.prepare('SELECT quote_id, SUM(likes) n FROM posts WHERE created_at > ? AND hidden = 0 GROUP BY quote_id HAVING n > 0 ORDER BY n DESC LIMIT 5').bind(weekAgo),
    env.DB.prepare('SELECT mood, COUNT(*) n FROM posts WHERE day = ? AND hidden = 0 GROUP BY mood ORDER BY n DESC').bind(day),
    env.DB.prepare('SELECT DISTINCT quote_id FROM posts WHERE created_at > ? AND hidden = 0').bind(weekAgo),
  ]);
  const n = total.results[0]?.n || 0;
  const enough = n >= min;
  let farthest = null;
  for (const r of far.results) { const q = quoteView(r.quote_id); if (q && (!farthest || q.ago > farthest.ago)) farthest = q; }
  return json({
    today: n, enough, min,
    authors: enough ? authors.results.map((r) => ({ id: r.author_id, name: DATA.authors[r.author_id]?.name, when: DATA.authors[r.author_id]?.when, n: r.n })) : [],
    quotes: quotes.results.map((r) => ({ n: r.n, quote: quoteView(r.quote_id) })).filter((x) => x.quote),
    mood: enough ? mood.results.map((r) => ({ key: r.mood, name: CATS[r.mood] || r.mood, n: r.n })) : [],
    farthest,
    library: { quotes: DATA.quotes.length, authors: Object.keys(DATA.authors).length },
  }, 200, { 'cache-control': 'public, max-age=60' });
}
