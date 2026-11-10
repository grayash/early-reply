// 문장의 원문이 실제 공개 원문 자료(말뭉치)에 그대로 있는지 대조한다.
// 사용: node scripts/verify.mjs [말뭉치 폴더]   (기본 ../corpus)
// 결과: data/verified.json  { 문장 id: { url: 대조한 원문 파일 주소 } }
import fs from 'node:fs';
import path from 'node:path';
import * as OpenCC from 'opencc-js';
import { ROOT, readAuthors, readQuotes } from './lib.mjs';

const CORPUS = path.resolve(process.argv[2] || path.join(ROOT, '../corpus'));
const REPO = {
  zh: 'https://github.com/chinese-poetry/chinese-poetry/blob/master/',
  la: 'https://github.com/PerseusDL/canonical-latinLit/blob/master/',
  grc: 'https://github.com/PerseusDL/canonical-greekLit/blob/master/',
};
const t2s = OpenCC.Converter({ from: 't', to: 'cn' });
const VARIANT = { 聴: '听', 懽: '欢', 讁: '谪', 鍼: '针', 碁: '棋', 疎: '疏', 徧: '遍', 牀: '床', 麤: '粗', 鵞: '鹅', 竝: '并', 襍: '杂', 閒: '间', 闲: '间', 著: '着', 澹: '淡', 惟: '唯', 祇: '只', 秖: '只' };
const normZh = (s) => [...t2s(s).replace(/[^㐀-鿿]/g, '')].map((c) => VARIANT[c] || c).join('');
const normTx = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ').replace(/j/g, 'i').replace(/v/g, 'u').replace(/[^\p{L}\p{N}]/gu, '');
const isZhLang = (l) => l === 'zh';

function walk(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  const st = fs.statSync(dir);
  if (st.isFile()) { if (test(dir)) out.push(dir); return out; }
  for (const f of fs.readdirSync(dir)) {
    if (f === '.git' || f === 'node_modules') continue;
    walk(path.join(dir, f), test, out);
  }
  return out;
}

// 한문: 작가 이름 → [{file, text}]
let zhIndex = null;
function loadZh() {
  if (zhIndex) return zhIndex;
  zhIndex = new Map();
  const base = path.join(CORPUS, 'zh');
  const files = walk(base, (f) => f.endsWith('.json') && !/authors?\.|error|rank|strains|loader|images/.test(f));
  const add = (author, text, file) => {
    const k = normZh(author || '');
    if (!k) return;
    if (!zhIndex.has(k)) zhIndex.set(k, []);
    zhIndex.get(k).push({ file, text: normZh(text) });
  };
  for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    const rel = path.relative(base, f);
    const visit = (o) => {
      if (Array.isArray(o)) return o.forEach(visit);
      if (o && typeof o === 'object') {
        const body = o.paragraphs || o.content || o.para;
        if (o.author && body) add(o.author, Array.isArray(body) ? body.join('') : String(body), rel);
        else Object.values(o).forEach(visit);
      }
    };
    visit(j);
  }
  return zhIndex;
}

const textCache = new Map();
function loadText(file, zh) {
  if (textCache.has(file)) return textCache.get(file);
  let s = fs.readFileSync(file, 'utf8');
  if (/\.(xml|html?)$/.test(file)) s = s.replace(/<[^>]+>/g, ' ');
  const n = zh ? normZh(s) : normTx(s);
  textCache.set(file, n);
  return n;
}

function specFiles(spec) {
  const [kind, rest] = spec.split(':');
  if (!rest) return { kind, files: null };
  const base = path.join(CORPUS, kind);
  const files = walk(path.join(base, rest), (f) => /\.(json|xml|txt|md|html?)$/.test(f) && !/__cts__|README|\.tracking|eng\d|-eng|\.en\./.test(path.basename(f)));
  return { kind, base, files };
}

const urlOf = (kind, base, file) => {
  const rel = path.relative(base, file).split(path.sep).map(encodeURIComponent).join('/');
  if (REPO[kind]) return REPO[kind] + rel;
  if (kind === 'gut') { const [repo, ...p] = rel.split('/'); return `https://github.com/GITenberg/${repo}/blob/master/${p.join('/')}`; }
  if (kind === 'gh') { const [o, r, ...p] = rel.split('/'); return `https://github.com/${o}/${r}/blob/HEAD/${p.join('/')}`; }
  return '';
};

const { authors } = readAuthors();
const { quotes } = readQuotes(authors);
const verified = {};
const fails = [];
const only = process.argv[3];

for (const q of quotes) {
  const a = authors[q.a];
  if (only && q.file !== only && q.a !== only) continue;
  if (!a.corpus || a.corpus === '-') { fails.push([q, '대조할 자료 없음']); continue; }
  const zh = isZhLang(q.lang);
  const norm = zh ? normZh : normTx;
  const segs = q.vorig.split(/\/|~|…|\.\.\./).map(norm).filter((s) => s.length >= (zh ? 2 : 6));
  if (!segs.length) { fails.push([q, '원문이 너무 짧음']); continue; }
  let hit = null;
  for (const spec of a.corpus.split(';').map((s) => s.trim())) {
    const { kind, base, files } = specFiles(spec);
    if (kind === 'zh' && !files) {
      const poems = loadZh().get(normZh(a.native)) || [];
      const p = poems.find((p) => segs.every((s) => p.text.includes(s)));
      if (p) { hit = REPO.zh + p.file.split(path.sep).map(encodeURIComponent).join('/'); break; }
    } else if (files) {
      const f = files.find((f) => { const t = loadText(f, zh); return segs.every((s) => t.includes(s)); });
      if (f) { hit = urlOf(kind, base, f); break; }
    }
  }
  if (hit) verified[q.id] = { url: hit }; else fails.push([q, '원문 자료에서 찾지 못함']);
}

if (!only) fs.writeFileSync(path.join(ROOT, 'data/verified.json'), JSON.stringify(verified, null, 0));
console.log(`대조 완료 ${Object.keys(verified).length} / ${only ? '(일부)' : quotes.length}`);
for (const [q, why] of fails.slice(0, 80)) console.log(`✗ ${q.file} ${q.a} | ${q.orig.slice(0, 40)} | ${why}`);
if (fails.length > 80) console.log(`… 외 ${fails.length - 80}건`);
