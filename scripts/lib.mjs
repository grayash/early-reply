// 문장 원고(data/)를 읽는 공통 코드
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { TAG_CAT, CATS } from '../src/lib/lexicon.js';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const split = (line) => line.split('|').map((s) => s.trim());

export function readAuthors() {
  const authors = {};
  const errors = [];
  for (const line of fs.readFileSync(path.join(ROOT, 'data/authors.txt'), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [id, name, native, lang, year, when, place, bio, corpus] = split(line);
    if (!/^[a-z0-9]+$/.test(id)) errors.push(`작가 id 형식 오류: ${id}`);
    if (authors[id]) errors.push(`작가 id 중복: ${id}`);
    if (!Number.isFinite(Number(year))) errors.push(`작가 연도 오류: ${id}`);
    authors[id] = { name, native, lang, year: Number(year), when, place, bio, corpus: corpus || '-' };
  }
  return { authors, errors };
}

export function readQuotes(authors) {
  const quotes = [];
  const errors = [];
  const seen = new Set();
  const dir = path.join(ROOT, 'data/quotes');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, n) => {
      if (!line.trim() || line.startsWith('#')) return;
      const at = `${f}:${n + 1}`;
      const [a, src, vorig, ko, cat, tagStr, note, flagStr] = split(line);
      // '~' : 화면에서는 이어 붙이고, 원문 대조 때만 끊는 표시(판본마다 낱말이 다른 자리)
      const orig = (vorig || '').replace(/\s*~\s*/g, ' ');
      if (!authors[a]) return errors.push(`${at} 작가 없음: ${a}`);
      if (!orig || !ko) return errors.push(`${at} 원문/번역 없음`);
      if (!CATS[cat]) return errors.push(`${at} 분류 오류: ${cat}`);
      const tags = (tagStr || '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const t of tags) if (!TAG_CAT[t]) errors.push(`${at} 꼬리표 오류: ${t}`);
      if (!tags.length) errors.push(`${at} 꼬리표 없음`);
      const flags = (flagStr || '').split(/\s+/).filter(Boolean);
      const id = `${a}-${crypto.createHash('sha1').update(orig).digest('hex').slice(0, 6)}`;
      if (seen.has(id)) return errors.push(`${at} 같은 원문 중복: ${orig.slice(0, 20)}`);
      seen.add(id);
      const q = { id, a, src, orig, vorig, ko, cat, tags, note: note || '', g: flags.includes('g') ? 1 : 0, lang: authors[a].lang, file: f };
      for (const fl of flags) {
        if (fl.startsWith('y=')) q.year = Number(fl.slice(2));
        if (fl.startsWith('w=')) q.when = fl.slice(2).replace(/_/g, ' ');
        if (fl.startsWith('ws=')) q.ws = fl.slice(3).replace(/_/g, ' ');
      }
      quotes.push(q);
    });
  }
  return { quotes, errors };
}
