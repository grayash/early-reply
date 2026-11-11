// src/backend.js(Firebase 연결 + 문장 데이터 + 답글 고르기)를 브라우저용 파일 하나로 묶는다.
// 결과: public/js/backend.js (직접 고치지 않는다)
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = await build({
  entryPoints: [path.join(ROOT, 'src/backend.js')],
  outfile: path.join(ROOT, 'public/js/backend.js'),
  bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'none', metafile: true, logLevel: 'warning',
});
const out = Object.values(r.metafile.outputs)[0];
console.log(`public/js/backend.js ${(out.bytes / 1024).toFixed(0)}KB`);
