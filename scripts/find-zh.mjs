// 한문 원문 자료에서 구절 찾기: node scripts/find-zh.mjs 구절1 구절2 ...
import fs from 'node:fs'; import path from 'node:path'; import * as OpenCC from 'opencc-js';
const t2s = OpenCC.Converter({ from: 't', to: 'cn' });
const base = path.resolve('../corpus/zh');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { if (f === '.git') continue; const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.json') && !/authors?\.|error|rank|strains/.test(p)) files.push(p); } })(base);
const qs = process.argv.slice(2).map((s) => t2s(s));
const found = new Map(qs.map((q) => [q, 0]));
for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8'); const s = t2s(raw);
  for (const q of qs) { if (found.get(q) >= 2) continue; let i = s.indexOf(q); if (i < 0) continue; found.set(q, found.get(q) + 1);
    const a = s.lastIndexOf('"author"', i); const an = a >= 0 && i - a < 3000 ? s.slice(a, a + 30).replace(/\s+/g, ' ') : s.slice(Math.max(0, s.lastIndexOf('{', i)), i).replace(/\s+/g, ' ').slice(0, 80);
    console.log(`[${q}] ${path.relative(base, f)} | ${an} | ${raw.slice(i - 30, i + 60).replace(/\s+/g, '')}`); }
}
for (const [q, n] of found) if (!n) console.log(`[${q}] 없음`);
