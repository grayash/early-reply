// data/ 원고 → src/data/quotes.js (서버가 쓰는 파일)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, readAuthors, readQuotes } from './lib.mjs';
import { CATS } from '../src/lib/lexicon.js';

const { authors, errors: e1 } = readAuthors();
const { quotes, errors: e2 } = readQuotes(authors);
const errors = [...e1, ...e2];
let verified = {};
try { verified = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/verified.json'), 'utf8')); } catch {}

const perAuthor = {};
for (const q of quotes) perAuthor[q.a] = (perAuthor[q.a] || 0) + 1;
for (const [a, n] of Object.entries(perAuthor)) if (n > 15) errors.push(`작가당 15개 상한 초과: ${a} (${n})`);

const used = {};
const out = quotes.map((q) => {
  const v = verified[q.id];
  used[q.a] = 1;
  const o = { id: q.id, a: q.a, src: q.src, orig: q.orig, ko: q.ko, cat: q.cat, tags: q.tags, lang: q.lang, v: v ? 1 : 0, url: v?.url || '' };
  if (q.note) o.note = q.note;
  if (q.g) o.g = 1;
  if (q.year != null) o.year = q.year;
  if (q.when) o.when = q.when;
  return o;
});
const A = {};
for (const [id, a] of Object.entries(authors)) if (used[id]) { const { corpus, ...rest } = a; A[id] = rest; }
const ver = crypto.createHash('sha1').update(JSON.stringify(out.map((q) => [q.id, q.ko, q.tags, q.note]))).digest('hex').slice(0, 10);

fs.mkdirSync(path.join(ROOT, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/data/quotes.js'), `// 자동 생성 파일 (npm run build). 직접 고치지 말 것.\nexport default ${JSON.stringify({ ver, authors: A, quotes: out })};\n`);

const byCat = {}; const gen = {};
for (const q of out) { byCat[q.cat] = (byCat[q.cat] || 0) + 1; if (q.g) gen[q.cat] = (gen[q.cat] || 0) + 1; }
console.log(`문장 ${out.length}개 · 작가 ${Object.keys(A).length}명 · 원문 대조 완료 ${out.filter((q) => q.v).length}개 · 버전 ${ver}`);
console.log(Object.keys(CATS).map((c) => `${CATS[c]} ${byCat[c] || 0}(범용 ${gen[c] || 0})`).join(' | '));
if (errors.length) { console.log(`\n오류 ${errors.length}건:\n` + errors.slice(0, 40).join('\n')); process.exitCode = 1; }
