// 범용 문장 표시(g)를 붙이고, 같은 작가의 비슷한 원문(판본만 다른 중복)을 찾아 알려 준다.
// 사용: node scripts/mark-generic.mjs [문장id ...]
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { ROOT } from './lib.mjs';
const ids = new Set(process.argv.slice(2)); const dir = path.join(ROOT, 'data/quotes'); let n = 0; const seen = [];
const norm = (s) => s.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
  const out = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').map((line) => {
    if (!line.trim() || line.startsWith('#')) return line;
    const c = line.split('|').map((s) => s.trim());
    const orig = (c[2] || '').replace(/\s*~\s*/g, ' ');
    const id = `${c[0]}-${crypto.createHash('sha1').update(orig).digest('hex').slice(0, 6)}`;
    seen.push({ id, a: c[0], n: norm(orig), ko: c[3], f });
    if (!ids.has(id)) return line;
    while (c.length < 8) c.push('');
    if (!c[7].split(/\s+/).includes('g')) { c[7] = (c[7] + ' g').trim(); n++; }
    return c.join(' | ');
  });
  fs.writeFileSync(path.join(dir, f), out.join('\n'));
}
console.log(`범용 표시 ${n}개 추가`);
const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 2; i++) g.add(s.slice(i, i + 3)); return g; };
for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
  const a = seen[i], b = seen[j]; if (a.a !== b.a) continue;
  const ga = grams(a.n), gb = grams(b.n); let k = 0; for (const x of ga) if (gb.has(x)) k++;
  if (k / Math.min(ga.size, gb.size) > 0.6) console.log(`비슷함: ${a.id}(${a.f}) ↔ ${b.id}(${b.f}) | ${a.ko.slice(0, 26)} ↔ ${b.ko.slice(0, 26)}`);
}
