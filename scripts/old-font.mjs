// 시조 원문(옛한글)에 쓰인 글자만 남긴 웹 글꼴을 만든다.
// 사용: node scripts/old-font.mjs <NotoSerifKR-Regular.otf 경로>   (notofonts/noto-cjk 의 Serif/SubsetOTF/KR, OFL)
// 시조를 고치거나 더하면 다시 돌린다. 필요: npm i -D subset-font
import fs from 'node:fs'; import path from 'node:path'; import subsetFont from 'subset-font';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const D = (await import(path.join(ROOT, 'functions/_data/quotes.js'))).default;
const text = D.quotes.filter((q) => q.lang === 'ko').map((q) => q.orig).join('') + ' /()·';
const src = fs.readFileSync(process.argv[2]);
const out = await subsetFont(src, text, { targetFormat: 'woff2' });
fs.mkdirSync(path.join(ROOT, 'public/fonts'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public/fonts/old-hangul.woff2'), out);
console.log('글자', new Set(text).size, '개 → ', out.length, 'bytes');
