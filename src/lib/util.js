// 브라우저와 시험 스크립트가 함께 쓰는 도우미
import DATA from '../data/quotes.js';
import { yearsAgo } from './match.js';

export { DATA };
export const QMAP = new Map(DATA.quotes.map((q) => [q.id, q]));

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

// 저장된 글(문서) → 화면에 쓰는 모양
export function postView(r) {
  return {
    id: r.id, text: r.text, at: r.at, likes: r.likes || 0,
    line: r.line || null, lineAi: false, quote: quoteView(r.quoteId),
  };
}
