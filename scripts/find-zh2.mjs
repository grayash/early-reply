// 사용: node scripts/find-zh2.mjs <찾을 구절> [하위 폴더]  — 한문 자료에서 구절을 찾아 앞뒤를 보여 준다(간체로 정규화)
import fs from 'node:fs'; import path from 'node:path'; import * as OpenCC from 'opencc-js';
const t2s = OpenCC.Converter({ from: 't', to: 'cn' });
const base = path.resolve('../corpus/zh', process.argv[3] || '');
const needle = t2s(process.argv[2]).replace(/[^㐀-鿿]/g, '');
const walk = (d, o = []) => { const st = fs.statSync(d); if (st.isFile()) { if (d.endsWith('.json')) o.push(d); return o; } for (const f of fs.readdirSync(d)) if (f !== '.git') walk(path.join(d, f), o); return o; };
let n = 0;
for (const f of walk(base)) {
  const s = t2s(fs.readFileSync(f, 'utf8')); const flat = s.replace(/[^㐀-鿿]/g, '');
  const p = flat.indexOf(needle); if (p < 0) continue;
  const q = s.indexOf(needle.slice(0, 2));
  console.log(path.relative(base, f), '…', flat.slice(Math.max(0, p - 30), p + needle.length + 30));
  const m = s.slice(0, s.indexOf(needle.slice(0, 4)) > 0 ? s.indexOf(needle.slice(0, 4)) : 0).match(/"author":\s*"([^"]+)"[^{}]*$/); if (m) console.log('   작가:', m[1]);
  if (++n >= Number(process.argv[4] || 2)) break;
}
if (!n) console.log('없음:', process.argv[2]);
