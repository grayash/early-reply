// 의미 검색: 문장 1,000개의 의미값을 미리 계산해 DB에 넣어 두고, 새 글의 의미값과 비교한다.
import { DATA } from './util.js';

const CHUNK = 100;
let cache = null; // { ver, vecs: Int8Array[], dim }

export const embedText = (q) => `${q.ko} ${q.tags.join(' ')} ${q.note || ''}`.trim();

export async function embed(env, texts) {
  const out = await env.AI.run(env.AI_EMBED_MODEL || '@cf/baai/bge-m3', { text: texts });
  return out.data;
}

const quantize = (v) => {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round((v[i] / n) * 127 * 4)));
  return q;
};

export async function loadVectors(env) {
  if (cache && cache.ver === DATA.ver) return cache;
  const { results } = await env.DB.prepare('SELECT chunk, n, data FROM emb WHERE ver = ? ORDER BY chunk').bind(DATA.ver).all();
  const total = results.reduce((s, r) => s + r.n, 0);
  if (!results.length || total !== DATA.quotes.length) return null;
  const vecs = [];
  let dim = 0;
  for (const r of results) {
    const bytes = new Int8Array(r.data instanceof ArrayBuffer ? r.data : new Uint8Array(r.data).buffer);
    dim = bytes.length / r.n;
    for (let i = 0; i < r.n; i++) vecs.push(bytes.subarray(i * dim, (i + 1) * dim));
  }
  cache = { ver: DATA.ver, vecs, dim };
  return cache;
}

/** 새 글과 모든 문장의 의미 유사도(코사인). 준비가 안 됐거나 AI 한도를 넘으면 null. */
export async function similarities(env, text) {
  if (!env.AI) return null;
  try {
    const store = await loadVectors(env);
    if (!store) return null;
    const [v] = await embed(env, [text]);
    let vn = 0; for (const x of v) vn += x * x; vn = Math.sqrt(vn) || 1;
    const sims = new Float32Array(store.vecs.length);
    for (let i = 0; i < store.vecs.length; i++) {
      const q = store.vecs[i]; let dot = 0, qn = 0;
      for (let k = 0; k < q.length; k++) { dot += q[k] * v[k]; qn += q[k] * q[k]; }
      sims[i] = dot / (Math.sqrt(qn) * vn || 1);
    }
    return sims;
  } catch (e) { return null; }
}

/** 관리자용: offset부터 CHUNK개 문장의 의미값을 계산해 저장한다. */
export async function embedChunk(env, chunk) {
  const start = chunk * CHUNK;
  const part = DATA.quotes.slice(start, start + CHUNK);
  if (!part.length) return { done: true, total: DATA.quotes.length };
  if (chunk === 0) await env.DB.prepare('DELETE FROM emb WHERE ver != ?').bind(DATA.ver).run();
  const vecs = [];
  for (let i = 0; i < part.length; i += 25) vecs.push(...await embed(env, part.slice(i, i + 25).map(embedText)));
  const dim = vecs[0].length;
  const buf = new Int8Array(dim * part.length);
  vecs.forEach((v, i) => buf.set(quantize(v), i * dim));
  await env.DB.prepare('INSERT OR REPLACE INTO emb (chunk, ver, n, data) VALUES (?, ?, ?, ?)').bind(chunk, DATA.ver, part.length, buf.buffer).run();
  cache = null;
  return { done: start + part.length >= DATA.quotes.length, next: chunk + 1, saved: start + part.length, total: DATA.quotes.length };
}
