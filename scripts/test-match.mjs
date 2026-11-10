// 답글 고르는 방식 시험: 일상 글 50개 + 모호한 글 + 걸러야 하는 글.
// AI(의미 검색·한 줄) 없이, 꼬리표와 낱말만으로 고른 결과를 보여 준다. 사용: npm test [-- --short]
import DATA from '../functions/_data/quotes.js';
import { chooseReply } from '../functions/_lib/match.js';
import { isCrisis, blocked } from '../functions/_lib/filter.js';
import { CATS } from '../functions/_lib/lexicon.js';

const POSTS = [
  '출근길에 하늘이 보라색이었는데 다들 폰만 보더라. 나만 봤나', '오랜만에 친구들이랑 밥 먹고 옴. 별거 안 했는데 배터리 꽉 찬 느낌',
  '회사 진짜 싫은데 막상 그만두려니 아쉬움. 뭐지 이 감정', '월요일 아침 너무 싫다 진짜', '오늘 팀장한테 또 깨짐. 내가 뭘 그렇게 잘못했나',
  '월급 들어왔는데 카드값 나가니까 남는 게 없네', '야근 삼 일째. 집에 가고 싶다', '퇴사하고 싶다는 말 오늘만 다섯 번 함',
  '첫 출근 했는데 아무것도 모르겠고 너무 떨린다', '면접 또 떨어졌다. 나는 뭘 해야 하지', '시험 망했다. 공부한 데서 하나도 안 나옴',
  '요즘 뭘 해도 재미가 없다', '아무것도 하기 싫어서 하루 종일 누워 있었다', '비 오는 날 창가에서 커피 마시는 중. 좋다',
  '첫눈 온다!!', '오늘 날씨 미쳤다 너무 좋아', '더워서 잠을 못 잤다', '새벽 세 시인데 잠이 안 와. 생각이 너무 많아',
  '엄마가 보낸 반찬 택배 받았는데 괜히 눈물 남', '아빠가 많이 늙으셨더라. 어깨가 작아 보였다', '애가 처음으로 엄마라고 불렀다',
  '아이 키우는 거 너무 힘들다. 내 시간이 하나도 없어', '서른인데 모아 둔 돈도 없고 이룬 것도 없다', '마흔 되니까 몸이 예전 같지 않네',
  '친구가 결혼한다는데 나만 제자리인 것 같아', '좋아하는 사람이 생겼는데 말도 못 걸겠다', '헤어진 지 한 달인데 아직도 생각난다',
  '남편이랑 별것도 아닌 걸로 싸웠다', '오늘 소개팅 완전 망함 ㅋㅋ', '혼자 밥 먹는 게 이제 편하다', '고향 집 가고 싶다',
  '오늘 드디어 프로젝트 끝냈다. 뿌듯', '합격했다!!!! 믿기지 않아', '운동 한 달 째. 아직 살아 있음', '치킨 시켰다. 오늘 하루 버틴 나에게 주는 상',
  '맥주 한 캔 따고 드라마 보는 중. 이게 행복이지', '주말에 아무 약속도 없다. 최고', '여행 가고 싶다 어디든',
  '지하철에서 누가 계속 밀어서 짜증 났음', '옆자리 사람 말이 너무 많다', '내 말은 아무도 안 들어 주는 것 같다',
  '열심히 했는데 인정을 못 받으니까 억울하다', '앞으로 뭐 해 먹고 살지 막막하다', '건강검진 결과 기다리는 중인데 불안하다',
  '내일 발표인데 벌써 심장이 뛴다', '시간이 너무 빨리 간다. 벌써 십일월이라니', '옛날 사진 보다가 한참 멍하니 있었다',
  '책 한 권 다 읽었다. 오랜만에', '오늘 하늘 봤어? 달이 엄청 크더라', '그냥 좀 외롭다',
];
const VAGUE = ['ㅋㅋㅋ', '음...', '그냥', '아', 'ㅠㅠ', '오늘도', '하'];
const FILTER = ['죽고 싶다', '그냥 사라지고 싶어', '아 배고파 죽겠다', '웃겨 죽는 줄', '010-1234-5678 연락 주세요', '씨발 짜증 나', '대출 상담 문의 카톡 아이디 abc'];

let seed = 7; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const short = process.argv.includes('--short');
const recentQuotes = new Set(), recentAuthors = new Set(), todayCount = new Map();
const used = new Map(); const how = {}; const authors = new Set();

async function run(text) {
  const r = await chooseReply(text, { quotes: DATA.quotes, authors: DATA.authors, recentQuotes, recentAuthors, todayCount, rand });
  recentQuotes.add(r.quote.id); recentAuthors.add(r.quote.a);
  if (recentAuthors.size > 5) recentAuthors.delete(recentAuthors.values().next().value);
  todayCount.set(r.quote.id, (todayCount.get(r.quote.id) || 0) + 1);
  used.set(r.quote.id, (used.get(r.quote.id) || 0) + 1); how[r.how] = (how[r.how] || 0) + 1; authors.add(r.quote.a);
  const a = DATA.authors[r.quote.a];
  console.log(`▸ ${text}\n   ↳ [${r.how}·${CATS[r.quote.cat]}] ${a.name}: ${short ? r.quote.ko.slice(0, 46) : r.quote.ko}`);
  return r;
}
console.log('── 일상 글 50개'); for (const t of POSTS) await run(t);
console.log('\n── 모호한 글'); for (const t of VAGUE) await run(t);
console.log('\n── 거르기'); for (const t of FILTER) console.log(`▸ ${t} → ${isCrisis(t) ? '위기 글: 답글 없이 상담 안내' : blocked(t) ? '막음: ' + blocked(t).reason : '통과'}`);
console.log(`\n요약: 고른 방식 ${JSON.stringify(how)} · 서로 다른 문장 ${used.size}개 · 서로 다른 작가 ${authors.size}명 · 같은 문장 반복 ${[...used.values()].filter((n) => n > 1).length}건`);
