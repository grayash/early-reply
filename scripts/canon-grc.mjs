// 그리스어 문장의 원문을 원문 자료에 실린 표기(악센트·숨표 포함) 그대로 바꿔 쓴다.
// 사용: node scripts/canon-grc.mjs   → data/quotes/*.txt 의 grc 문장을 제자리에서 고친다
import fs from 'node:fs'; import path from 'node:path';
import { ROOT, readAuthors } from './lib.mjs';
const CORPUS = path.join(ROOT, '../corpus');
const normCh = (c) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ').replace(/[^\p{L}\p{N}]/gu, '');
const walk = (d, o = []) => { if (!fs.existsSync(d)) return o; const st = fs.statSync(d); if (st.isFile()) { if (/grc\d*\.xml$/.test(d)) o.push(d); return o; } for (const f of fs.readdirSync(d)) if (f !== '.git') walk(path.join(d, f), o); return o; };
const cache = new Map();
const load = (f) => { if (cache.has(f)) return cache.get(f); const chars = [...fs.readFileSync(f, 'utf8').replace(/<[^>]+>/g, ' ')]; let norm = ''; const map = []; chars.forEach((c, i) => { for (const y of normCh(c)) { norm += y; map.push(i); } }); const v = { chars, norm, map }; cache.set(f, v); return v; };
const { authors } = readAuthors();
const dir = path.join(ROOT, 'data/quotes'); let changed = 0, miss = 0;
for (const fn of fs.readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
  const lines = fs.readFileSync(path.join(dir, fn), 'utf8').split('\n');
  const out = lines.map((line) => {
    if (!line.trim() || line.startsWith('#')) return line;
    const cols = line.split('|'); const a = authors[cols[0].trim()];
    if (!a || a.lang !== 'grc') return line;
    const files = a.corpus.split(';').flatMap((s) => walk(path.join(CORPUS, s.trim().replace(':', '/'))));
    const segs = cols[2].trim().split(/\s+\/\s+/).map((seg) => {
      const n = [...seg].map(normCh).join('');
      for (const f of files) { const t = load(f); const p = t.norm.indexOf(n); if (p >= 0) return t.chars.slice(t.map[p], t.map[p + n.length - 1] + 1).join('').replace(/\s+/g, ' ').trim(); }
      miss++; console.log('✗ 못 찾음:', seg.slice(0, 50)); return seg;
    });
    const neu = segs.join(' / '); if (neu !== cols[2].trim()) { changed++; cols[2] = ` ${neu} `; }
    return cols.join('|');
  });
  fs.writeFileSync(path.join(dir, fn), out.join('\n'));
}
console.log(`그리스어 원문 표기 맞춤: ${changed}문장 고침, ${miss}구절 못 찾음`);
