# 먼저 온 답장

한두 줄 글을 쓰면, 오래전에 누군가 실제로 남긴 문장 하나가 답글로 달리는 사이트.

- 문장 1,000개, 작가 245명. 전부 공개 원문 자료와 글자 단위로 대조했고 문장마다 원문 링크가 붙어 있다.
- 원문은 저작권이 끝난 글만 썼고(가장 늦게 세상을 떠난 작가 1947년), 한국어 번역은 새로 했다.
- 한국 시조 34편은 위키문헌 본문과 브라우저에서 글자 대조했다(`data/ws-checked.json`). 옛한글은 `public/fonts/old-hangul.woff2`(Noto Serif CJK KR, OFL)로 그린다.
- 글은 이름 없이 공개된다. 저장하는 것은 쓴 글과 받은 답글뿐이다.

## 구조 (Firebase만 쓴다)

서버 코드는 없다. 화면(Firebase Hosting)이 브라우저에서 바로 Firestore를 부르고, 접근 제한은 보안 규칙(`firestore.rules`)이 맡는다.
답글 고르기와 거르기도 브라우저 안에서 한다. 그래서 글 내용이 AI나 다른 서버로 넘어가지 않는다.

| 위치 | 내용 |
|---|---|
| `data/authors.txt`, `data/quotes/*.txt` | 문장 원고. 여기를 고친다 |
| `data/verified.json` | 원문 대조 결과(문장 id → 원문 링크) |
| `src/data/quotes.js` | 원고에서 만들어지는 파일. 직접 고치지 않는다 |
| `src/lib` | 답글 고르기(`match.js`), 낱말 사전(`lexicon.js`), 거르기(`filter.js`), 도우미(`util.js`) |
| `src/backend.js`, `src/firebase-config.js` | 글 쓰기·피드·공감·신고·순위·관리를 Firestore 호출로 바꾸는 곳 |
| `public/js/backend.js` | 위 파일들을 묶은 결과(`npm run client`). 직접 고치지 않는다 |
| `firestore.rules`, `firestore.indexes.json`, `firebase.json` | 보안 규칙, 색인, 호스팅 설정 |
| `public` | 화면(피드, 쓰기와 답장 연출, 순위, 사람, 소개, 관리) |
| `scripts` | 원고 → 데이터 만들기, 원문 대조, 시험 |

## 자주 쓰는 명령

```
npm install
npm run build     # 원고 → src/data/quotes.js, 그리고 public/js/backend.js 묶기
npm run verify    # 원문 대조 (../corpus 에 원문 자료가 있어야 한다)
npm test          # 일상 글 50개로 답글 고르기 시험
npm run deploy    # build 후 firebase deploy (호스팅 + 규칙 + 색인)
node scripts/old-font.mjs <NotoSerifKR-Regular.otf>   # 시조를 고친 뒤 옛한글 글꼴 다시 만들기
```

문장을 고치거나 더한 뒤에는 `verify` → `build` 순서로 돌린다.
같은 작가의 문장은 15개까지, 판본마다 낱말이 다른 자리는 `~` 로 끊어 적는다.

## 답글 고르는 순서

1. 위기 글("죽고 싶다" 등)은 답글 없이 상담 안내만 보여 주고 저장하지 않는다.
2. 욕설·개인정보·광고는 올리기 전에 막는다.
3. 글에서 감정과 주제를 찾고, 문장마다 점수를 매긴다(꼬리표 + 낱말 겹침).
4. 1위가 뚜렷하면 그 문장, 비슷하면 감정·주제가 둘 다 맞고 최근에 안 나온 문장, 모호하면 감정별 범용 문장.

## 배포 (Firebase, 프로젝트 early-reply)

콘솔에서 한 번만 하는 설정:

1. **Authentication → 로그인 방법**에서 **익명**과 **Google**을 켠다.
2. **Firestore Database**를 만든다(프로덕션 모드, 위치 `asia-northeast3` 서울 권장).
3. **Authentication → 설정 → 승인된 도메인**에 쓸 도메인이 들어 있는지 본다(`early-reply.web.app` 은 기본으로 있다).
4. **Analytics**는 이미 켜져 있다(측정 ID G-FV7PNLTV65, 코드는 `public/js/ga.js`).

내 컴퓨터에서:

```
npm install
npx firebase-tools login
npm run deploy        # 호스팅 + firestore.rules + firestore.indexes.json 을 한 번에 올린다
```

### 자동 배포 (GitHub Actions)

`main`에 올라가면 `.github/workflows/deploy.yml`이 build 후 `firebase deploy`를 돌린다. Actions 탭 → '배포' → Run workflow로 손으로 돌릴 수도 있다.
처음 한 번만 키를 넣는다:

1. Google Cloud 콘솔(프로젝트 early-reply) → IAM 및 관리자 → 서비스 계정 → 만들기.
   역할: **Firebase 관리자**(Firebase Admin), **서비스 계정 사용자**, **API 키 뷰어**.
2. 만든 계정 → 키 → 키 추가 → JSON. 받은 파일 내용을 통째로 복사한다.
3. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret.
   이름 `FIREBASE_SERVICE_ACCOUNT`, 값에 JSON 내용을 붙여 넣는다.

배포 뒤:

5. 관리자 만들기: `https://early-reply.web.app/admin.html` 에서 구글로 로그인하면, 화면에 내 uid가 나온다.
   Firebase 콘솔 → Firestore → `admins` 컬렉션을 만들고 **문서 ID를 그 uid로** 저장한다(필드는 아무거나 하나). 새로고침하면 관리자로 인식된다.
6. 색인이 만들어지는 데 몇 분 걸릴 수 있다. 피드가 비어 있고 콘솔에 색인 오류가 보이면 잠시 기다린다.
7. 규칙 확인(아래 '배포 후 시험').

## 관리 화면 (/admin.html)

- 받은 의견 읽기와 확인 후 지우기
- 신고된 글 보기: 3명이 신고하면 자동으로 가려지고, 여기서 되살리거나 지운다
- 글 찾아 지우기: 기기를 바꿔 직접 못 지우는 사람이 의견으로 글 주소를 보내오면 처리
- 구글 로그인 + `admins` 문서가 있는 계정만 열린다(규칙이 막는다)

## 배포 후 시험 (규칙은 로컬에서 시험하지 못했다)

이 환경에서는 Firestore 에뮬레이터를 내려받을 수 없어 규칙을 실제로 돌려 보지 못했다. 배포한 뒤 아래를 한 번씩 확인한다.

1. 글을 쓰면 답글이 달린다. 20초 안에 다시 쓰면 "잠시 뒤에 다시 써 주세요"가 나온다.
2. 피드에 내 글이 보이고 '내 글' 표시와 삭제 버튼이 있다. 삭제하면 사라진다.
3. '어울려요'를 누르면 숫자가 1 늘고, 다시 누르면 줄어든다. 새로고침해도 한 사람이 두 번 올릴 수 없다.
4. 다른 기기(또는 시크릿 창)에서 같은 글에 신고 3번이면 피드에서 사라진다. 관리 화면에서 되살릴 수 있다.
5. 의견 보내기가 되고, 관리 화면에서만 읽힌다. 시크릿 창에서 콘솔로 `feedback` 을 읽으려 하면 거부된다.
6. 규칙 시뮬레이터(콘솔 → Firestore → 규칙 → 시뮬레이터)로 로그인 안 한 상태의 `posts` 쓰기가 거부되는지 본다.

## 알려 둔 한계

- 서버가 없어서 글의 형식·길이·속도는 규칙이 막지만, 위기·욕설·개인정보 거르기는 브라우저 코드가 한다. 일부러 우회하는 사람은 막지 못한다. 가려진 글은 관리 화면에서 처리한다.
- 같은 사람이 익명 로그인을 새로 만들어 신고나 공감을 늘릴 수 있다. 신고로 잘못 가려진 글은 관리 화면에서 되살린다.
- 개별 글 주소(`post.html?id=…`)를 공유할 때 미리보기는 사이트 공통 이미지와 문구로 나온다(글마다 다른 미리보기는 서버가 있어야 한다).
- '왜 이 문장인지' AI 한 줄과 의미 검색은 서버가 필요해서 이번 구조에서 뺐다. 필요하면 나중에 Cloud Functions(결제 계정 필요)나 Firebase AI Logic으로 붙인다.

## 배포 전에 확인할 것

- Firestore 무료 한도(Spark): 읽기 하루 5만 회, 쓰기 2만 회, 삭제 2만 회. 피드 한 번에 20회, 순위 한 번에 약 300회(5분 동안 기억)를 읽는다.
- 실제 글로 `match.js` 의 `TUNE` 값 조정.
- 순위는 하루 글이 `RANK_MIN`(기본 5)개를 넘어야 보인다.
