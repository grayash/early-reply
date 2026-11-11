// 예시판 만들기: public/ 화면 + 서버 대신 브라우저 안에서 돌아가는 mock → ../demo-out/
// 사용: node scripts/build-demo.mjs   (배포용 public/ 은 건드리지 않는다)
import fs from 'node:fs'; import path from 'node:path';
import { ROOT } from './lib.mjs';

const OUT = path.resolve(ROOT, '../demo-out');
fs.rmSync(OUT, { recursive: true, force: true });
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); };
const write = (b, s) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.writeFileSync(b, s); };

// 절대 경로(/x.html, /css/…)를 상대 경로로
const rel = (s) => s
  .replace(/(href|src)="\/"/g, '$1="index.html"')
  .replace(/(href|src)="\/(?!\/)/g, '$1="')
  .replace(/(['"`])\/(write|rank|about|person|post|index)\.html/g, '$1$2.html')
  .replace(/\['\/', '피드'/g, "['index.html', '피드'");

const BANNER = `<div class="demo-bar" role="note"><b>예시판</b> 서버 없이 이 브라우저 안에서만 돌아가요. 쓴 글은 이 기기에만 남고 다른 사람에게 보이지 않아요. 처음 보이는 글 8개는 예시예요. <button type="button" id="demoReset">처음으로</button></div>`;
const BANNER_JS = `<script type="module">import { resetDemo } from './js/mock.js'; document.getElementById('demoReset').onclick = () => { resetDemo(); location.href = 'index.html'; };</script>`;

for (const f of fs.readdirSync(path.join(ROOT, 'public'))) {
  const src = path.join(ROOT, 'public', f);
  if (f === 'admin.html' || f === '_headers') continue;
  if (f.endsWith('.html')) {
    let s = rel(fs.readFileSync(src, 'utf8'));
    s = s.replace(/<title>([^<]*)<\/title>/, '<title>$1 (예시판)</title>');
    s = s.replace('<body>', `<body>\n${BANNER}`).replace('</body>', `${BANNER_JS}\n</body>`);
    write(path.join(OUT, f), s);
  } else if (fs.statSync(src).isFile()) cp(src, path.join(OUT, f));
}
// CSS: 글꼴 경로 + 예시판 띠
let css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8').replace("url('/fonts/", "url('../fonts/");
css += `\n/* 예시판 띠 */\n.demo-bar { background: #2b2620; color: #efe7d8; font-size: 13.5px; line-height: 1.55; padding: 9px 16px; text-align: center; word-break: keep-all; }\n.demo-bar b { color: #f0a58f; margin-right: 6px; }\n.demo-bar button { margin-left: 8px; color: inherit; text-decoration: underline; font-size: 13.5px; }\n`;
write(path.join(OUT, 'css/app.css'), css);
cp(path.join(ROOT, 'public/fonts/old-hangul.woff2'), path.join(OUT, 'fonts/old-hangul.woff2'));
cp(path.join(ROOT, 'public/fonts/OFL.txt'), path.join(OUT, 'fonts/OFL.txt'));

// JS: 화면 코드 복사, 서버 호출만 mock으로
for (const f of fs.readdirSync(path.join(ROOT, 'public/js'))) {
  let s = rel(fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8'));
  if (f === 'common.js') {
    s = s.replace("export async function api(path, opt = {}) {", "import { mockApi } from './mock.js';\nexport async function api(path, opt = {}) {\n  return mockApi(path, opt);")
      .replace('`${location.origin}/post.html?id=', '`${new URL(\'post.html\', location.href).href}?id=')
      .replace('c.fillText(location.host, M, H - 170);', "c.fillText('먼저 온 답장 · 예시판', M, H - 170);")
      // 예시판이 열리는 틀에서는 내려받기·공유·바깥 링크가 막혀 있다
      .replace("$('#shImg', sh).onclick = async () => {", "$('#shImg', sh).onclick = async () => { return toast('예시판에서는 이미지 저장이 막혀 있어요. 실제 사이트에서는 휴대폰에 저장하거나 바로 공유돼요.');")
      .replace('if (post.sample) return toast(', "return toast('예시판의 글은 이 기기에만 있어서 링크가 없어요.'); if (post.sample) return toast(");
  }
  write(path.join(OUT, 'js', f), s);
}
cp(path.join(ROOT, 'demo/mock.js'), path.join(OUT, 'js/mock.js'));
for (const f of ['_lib/match.js', '_lib/lexicon.js', '_lib/filter.js', '_lib/util.js', '_data/quotes.js']) cp(path.join(ROOT, 'functions', f), path.join(OUT, 'js/srv', f));

const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push(path.relative(OUT, p)); } }; walk(OUT);
console.log(`예시판 ${files.length}개 파일 → ${OUT}`);
