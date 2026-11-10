import DATA from '../_data/quotes.js';
import { yearsAgo } from './match.js';

export { DATA };
export const QMAP = new Map(DATA.quotes.map((q) => [q.id, q]));

export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export async function sha(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// 한국 시간 기준 날짜(YYYY-MM-DD)
export const dayOf = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

export const newId = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

export function quoteView(id) {
  const q = QMAP.get(id);
  if (!q) return null;
  const a = DATA.authors[q.a] || {};
  return {
    id: q.id, ko: q.ko, orig: q.orig, lang: q.lang, src: q.src, url: q.url, note: q.note || '',
    when: q.when || a.when || '', ago: yearsAgo(q.year ?? a.year),
    author: { id: q.a, name: a.name, native: a.native || '', place: a.place || '' },
  };
}

export function postView(r) {
  return {
    id: r.id, text: r.text, at: r.created_at, likes: r.likes,
    line: r.line || null, lineAi: !!r.line_ai, quote: quoteView(r.quote_id),
  };
}

// 같은 사람이 짧은 시간에 너무 많이 쓰지 못하게 한다. IP는 날짜와 섞어 해시로만 잠깐 보관한다.
export async function rateLimit(env, request, name, max, windowSec) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const k = await sha(`${name}|${ip}|${dayOf()}|${env.SALT || 'old-replies'}`);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT n, exp FROM rate WHERE k = ?').bind(k).first();
  if (row && row.exp > now) {
    if (row.n >= max) return false;
    await env.DB.prepare('UPDATE rate SET n = n + 1 WHERE k = ?').bind(k).run();
  } else {
    await env.DB.prepare('INSERT OR REPLACE INTO rate (k, n, exp) VALUES (?, 1, ?)').bind(k, now + windowSec).run();
  }
  return true;
}

export async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}
