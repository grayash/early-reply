// 사용: node scripts/drop-ids.mjs <문장id ...>  — 해당 문장 줄을 원고에서 지운다
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { ROOT } from './lib.mjs';
const ids = new Set(process.argv.slice(2)); const dir = path.join(ROOT, 'data/quotes'); let n = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
  const out = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((line) => {
    if (!line.trim() || line.startsWith('#')) return true;
    const c = line.split('|').map((s) => s.trim());
    const id = `${c[0]}-${crypto.createHash('sha1').update((c[2] || '').replace(/\s*~\s*/g, ' ')).digest('hex').slice(0, 6)}`;
    if (ids.has(id)) { n++; return false; } return true;
  });
  fs.writeFileSync(path.join(dir, f), out.join('\n'));
}
console.log(`${n}줄 지움`);
