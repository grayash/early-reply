// 답글 고르는 방식.
// 1) 글을 분류한다(감정·주제 꼬리표)  2) 문장마다 점수를 매긴다(꼬리표 + 낱말 겹침 + 의미 유사도)
// 3) 명확하면 1위, 겹치면 규칙으로 하나, 모호하면 범용 문장 모음에서 하나  4) AI가 있으면 '왜 이 문장인지' 한 줄
// 항상 답글 하나를 돌려준다. (위기 글은 이 함수에 오기 전에 걸러진다.)

import { classify, TAG_CAT, EMOTION_CATS } from './lexicon.js';

export const TUNE = {
  TAG: 3,          // 꼬리표가 맞을 때
  CAT: 2,          // 주 분류가 글의 감정/주제와 맞을 때
  SUBCAT: 1,       // 보조 꼬리표의 분류가 맞을 때
  BIGRAM: 0.3, BIGRAM_MAX: 2,
  SIM_BASE: 0.3, SIM_SCALE: 20,   // 의미 유사도(0~1)를 점수로 바꾸는 값. 배포 후 실제 글로 조정
  MARGIN: 1.5,     // 1위와 이 점수 안쪽이면 '겹침'으로 본다
  VAGUE_SIM: 0.42, // 의미 유사도가 이보다 낮고 꼬리표도 없으면 '모호'
  TOP: 10, LLM_CANDS: 6,
};

const content = (t) => String(t).replace(/[^가-힣a-zA-Z0-9]/g, '');
const bigrams = (t) => {
  const s = content(t); const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
};

let prepared = null;
function prepare(quotes) {
  if (prepared && prepared.src === quotes) return prepared.rows;
  const rows = quotes.map((q, i) => ({
    q, i,
    cats: new Set([q.cat, ...q.tags.map((t) => TAG_CAT[t]).filter(Boolean)]),
    bi: bigrams(q.ko + ' ' + (q.note || '')),
  }));
  prepared = { src: quotes, rows };
  return rows;
}

function pickFair(pool, ctx) {
  const { recentQuotes, recentAuthors, todayCount, rand } = ctx;
  let p = pool.filter((r) => !recentQuotes.has(r.q.id));
  if (!p.length) p = pool;
  const p2 = p.filter((r) => !recentAuthors.has(r.q.a));
  if (p2.length) p = p2;
  const min = Math.min(...p.map((r) => todayCount.get(r.q.id) || 0));
  p = p.filter((r) => (todayCount.get(r.q.id) || 0) === min);
  return p[Math.floor(rand() * p.length)];
}

/**
 * @param {string} text
 * @param {object} ctx { quotes, authors, recentQuotes:Set, recentAuthors:Set, todayCount:Map, sims?:Float32Array|null, llm?:fn, rand?:fn }
 */
export async function chooseReply(text, ctx) {
  ctx = { recentQuotes: new Set(), recentAuthors: new Set(), todayCount: new Map(), rand: Math.random, sims: null, ...ctx };
  const rows = prepare(ctx.quotes);
  const cls = classify(text);
  const tb = bigrams(text);
  const hasSim = !!ctx.sims;

  let topSim = 0;
  const scored = rows.map((r) => {
    let s = 0;
    for (const t of r.q.tags) if (cls.tags[t]) s += TUNE.TAG;
    if (cls.emotion && r.q.cat === cls.emotion) s += TUNE.CAT;
    if (cls.topic && r.q.cat === cls.topic) s += TUNE.CAT;
    if (cls.emotion && r.q.cat !== cls.emotion && r.cats.has(cls.emotion)) s += TUNE.SUBCAT;
    if (cls.topic && r.q.cat !== cls.topic && r.cats.has(cls.topic)) s += TUNE.SUBCAT;
    let b = 0; for (const g of tb) if (r.bi.has(g)) b++;
    s += Math.min(b * TUNE.BIGRAM, TUNE.BIGRAM_MAX);
    if (hasSim) { const sim = ctx.sims[r.i]; if (sim > topSim) topSim = sim; s += (sim - TUNE.SIM_BASE) * TUNE.SIM_SCALE; }
    const level = (cls.emotion && r.cats.has(cls.emotion) ? 1 : 0) + (cls.topic && r.cats.has(cls.topic) ? 1 : 0);
    return { ...r, s, level };
  }).sort((a, b) => b.s - a.s);

  const vague = content(text).replace(/[ㅋㅎㅠㅜ]/g, '').length < 3 || (cls.found === 0 && (!hasSim || topSim < TUNE.VAGUE_SIM));
  const top = scored.slice(0, TUNE.TOP);
  let chosen, how;

  if (vague) {
    how = 'vague';
    const g = rows.filter((r) => r.q.g);
    let pool = g.filter((r) => r.q.cat === (cls.emotion || 'daily'));
    if (!pool.length) pool = g.filter((r) => r.q.cat === 'daily');
    if (!pool.length) pool = g.length ? g : rows;
    chosen = pickFair(pool, ctx);
  } else {
    const best = top[0].s;
    const tied = top.filter((r) => r.s >= best - TUNE.MARGIN);
    if (tied.length === 1 && !ctx.recentQuotes.has(tied[0].q.id)) { how = 'clear'; chosen = tied[0]; }
    else {
      how = 'tie';
      let pool = tied.filter((r) => !ctx.recentQuotes.has(r.q.id));
      if (!pool.length) pool = top.filter((r) => !ctx.recentQuotes.has(r.q.id));
      if (!pool.length) pool = tied;
      const maxLevel = Math.max(...pool.map((r) => r.level));
      pool = pool.filter((r) => r.level === maxLevel);
      chosen = pickFair(pool, ctx);
    }
  }

  let line = null, lineAi = false;
  if (ctx.llm && content(text).length >= 4) {
    try {
      const cands = [chosen];
      if (how !== 'vague') for (const r of top) {
        if (cands.length >= TUNE.LLM_CANDS) break;
        if (r !== chosen && !ctx.recentQuotes.has(r.q.id)) cands.push(r);
      }
      const out = await askLine(text, cands, ctx);
      if (out) {
        if (out.pick != null && cands[out.pick]) { if (cands[out.pick] !== chosen) how += '+ai'; chosen = cands[out.pick]; }
        if (out.line) { line = out.line; lineAi = true; }
      }
    } catch (e) { /* AI 한도 초과나 오류면 한 줄 없이 간다 */ }
  }

  return { quote: chosen.q, line, lineAi, how, mood: cls.emotion || cls.topic || 'daily', cls };
}

const BAD_LINE = /힘내|하세요|해보세요|해 보세요|응원|괜찮아요|이해해요|화이팅|파이팅|바랍니다|바라요/;

export function cleanLine(s) {
  if (!s) return null;
  let t = String(s).split('\n')[0].trim().replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');
  if (t.length < 8 || t.length > 80) return null;
  if (!/[가-힣]/.test(t) || /[぀-ヿ]/.test(t)) return null;
  if (BAD_LINE.test(t)) return null;
  return t;
}

async function askLine(text, cands, ctx) {
  const list = cands.map((r, i) => {
    const a = ctx.authors[r.q.a] || {};
    return `${i + 1}. ${a.name || ''} (${r.q.when || a.when || ''}, ${a.place || ''}) — "${r.q.ko}"${r.q.note ? ` [배경: ${r.q.note}]` : ''}`;
  }).join('\n');
  const system = [
    '너는 오늘의 짧은 글과, 오래전에 실제로 쓰인 문장을 이어 주는 편집자다.',
    '후보 문장 중 글의 상황에 가장 잘 맞는 것 하나를 고르고, 왜 그 문장인지 한국어 한 문장으로 쓴다.',
    '규칙: (1) 후보에 없는 문장을 만들지 않는다. (2) 한 줄은 60자 이내, "~요"로 끝나는 해요체.',
    '(3) 옛 사람이나 그 문장에 대한 사실 하나와, 글쓴이의 낱말 하나를 잇는다. 배경에 없는 사실은 지어내지 않는다.',
    '(4) 조언·위로·응원·판단을 하지 않는다. "힘내세요", "~하세요" 같은 말 금지.',
    '(5) 반드시 JSON만 출력: {"pick": 번호, "line": "한 줄"}',
  ].join('\n');
  const user = `오늘의 글: "${text}"\n\n후보:\n${list}`;
  const raw = await ctx.llm(system, user);
  const m = String(raw || '').match(/\{[\s\S]*?\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const pick = Number.isInteger(j.pick) && j.pick >= 1 && j.pick <= cands.length ? j.pick - 1 : null;
  return { pick, line: cleanLine(j.line) };
}

export function yearsAgo(year, now = new Date()) {
  return now.getFullYear() - year - (year < 0 ? 1 : 0);
}
