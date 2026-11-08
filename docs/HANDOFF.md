## 2026-11-08 — 기억책의 트리 이름도 자동 접미사를 뗀다(#212 후속, 컴1, ai/lt-shelf-suffix-book)

#212에서 책장에만 연결했던 표시 규칙(`displayTreeTitle`)을 **기억책(track59) 두 벌 화면**(`views/`·`design/views/`)에 연결했다. 셸 헤더(`트리: <이름>`·`#context-tree`·탭)는 #213 레인 몫이라 건드리지 않았다.

- 기억책에서 트리 이름이 실제로 들어가는 자리는 두 곳이다: **(1) 책 상단 이름표**(`.topbar .brand span`, 두 벌 화면이 함께 쓰는 `view-navigation.js`가 채운다), **(2) 책 목록 데이터**(`LTDEMO.library[].title` — 책 넘김·다른 책 열기 판단에 쓴다). 둘 다 `window.LTTreeName.displayTreeTitle`을 거치게 했고, `tree-name.js`가 없으면 원래 값을 그대로 쓰는 폴백을 뒀다.
- 표시 규칙 스크립트는 **기억책 어댑터**(`scripts/apply-book-usability.mjs`)가 `view-navigation.js` 바로 앞에 한 번만 넣는다. 이미 있으면 다시 넣지 않아 두 번 돌려도 결과가 같다(`변경 없음`). 두 벌 화면의 마크업은 손으로 고치지 않고 `node scripts/apply-book-usability.mjs`로만 맞췄다.
- 저장 데이터는 그대로다. `parent.LT41.tree.title`은 읽기만 하고, 정확히 `, 나의 순간들`로 끝나며 앞부분이 비어 있지 않을 때만 표시에서 뗀다(`리센느, 나의 순간들` → `리센느`, `내가 지은 이름` → 그대로).
- **관계 지도(track56)·기억 보드(track58)는 연결할 곳이 없다** — 두 화면은 트리 이름을 화면에 쓰지 않는다(가상 세션 DOM 탐색으로 확인, 트리 이름 노출 0).
- 기억책 상단 이름표는 `identity.css`가 `html[data-v41-screen] .topbar>.brand`를 숨기므로 지금 셸 화면에서는 눈에 보이지 않는다. 화면에서 읽히는 트리 이름은 셸 헤더(`트리: <이름>`)이며 그 표시는 #213에서 같은 공용 함수로 연결한다.
- 시험: `tests/v41-shelf-unify.test.mjs`에 3건 추가 — 두 벌 화면이 `tree-name.js`를 `view-navigation.js`보다 먼저 싣는지, 이름표·책 목록이 공용 함수를 쓰는지(원본 제목을 그대로 넣지 않는지), 표시 이름이 저장 데이터를 바꾸지 않는지, 어댑터가 스크립트를 한 번만 넣는지. 전체 `npm test` 494건 457 pass/0 fail/37 skip, `npm run build` pass.
- 가상 세션 확인(DOM): 기억책 이름표 `리센느`, 책 목록 `['리센느','내가 지은 이름']`, 본문에 `나의 순간들` 없음, 콘솔 오류 0. 예시 모드(`#book`)도 `window.LTTreeName` 로드·이름표 `좋아하는 순간들`로 정상이다.

## 2026-11-08 — 내 책장을 첫 화면과 맞추기: 밤 테마·책 카드 정보·트리 이름 접미사·예시 그림(#212, 컴1, ai/lt-shelf-unify-261108)

이슈 #212의 1~4번을 **내 책장 화면과 트리 생성 경로** 범위에서 처리했다.

- **테마**: `track32-…` iframe이 이제 테마를 넘겨받는다(`header-state.mjs`의 `appliedTheme`에 `shelf` 추가, 셸 `themedView`가 책장을 `shelf`로 판정). 밤은 `identity.css`의 밤 블록에서 어두운 무대(`--lt-stage`)·진주 글자(`--lt-pearl`)·금 포인트(`--lt-gold-deep`)·Pretendard를 쓰고 **장미 토큰을 쓰지 않는다**. "한 권의 책" 강조는 진주 계열 흐린 톤(`--lt-muted`). 정원은 지금 크림 책장·글꼴 그대로다(기존 `:root` 값이 그대로 남고, 표지 색만 `[data-lt-theme=garden]`에서 되돌린다). 기억책·기억 보드·관계 지도는 계속 A다.
- **표지 색**: 밤은 보드·지도 구분색(`--lt-group-*`), 정원은 기존 표지 색(`#a84f5d`·`#627ba2`·`#8d705e`·`#6d8979`)을 `--lt-cover-1..4` 한 곳에 둔다. 장미 계열은 밤에서 쓰지 않는다.
- **책 카드**: 표지에 이름 한 번만. 표지 아래는 `순간 N개 · 마지막 YYYY-MM-DD` 하나(마지막 날짜는 그 트리 순간 날짜의 최댓값). `책 · 02`·`기본 표지` 같은 내부 표시는 마크업에서 없앴다. 선택 카드가 표지 윗부분이 잘리던 문제는 캐러셀 수치(중앙 배율 1.12→1.06, 위 이동 -9px→+6px)로 고쳤다 — 레일 높이 375px보다 카드가 커서 위로 뜨면 `overflow:hidden`에 잘렸다.
- **트리 이름 자동 접미사**: 표시 규칙을 `public/v41/tree-name.mjs`(모듈)와 `public/v41/tree-name.js`(클래식)에 두고, 자동 문구 `, 나의 순간들`과 **정확히 일치할 때만** 뗀다(앞부분이 비면 그대로). 저장 데이터는 바꾸지 않는다. 생성 경로(`public/v41/domain.mjs`의 `createTree`)는 이제 접미사를 붙이지 않고 대상 이름을 그대로 제목으로 쓴다. **셸 헤더·기억책 표시에는 아직 연결하지 않았다**(다른 레인이 그 파일들을 고치는 중이라 충돌 방지). 공용 함수는 준비돼 있으니 후속에서 두 곳에 연결만 하면 된다.
- **오른쪽 위 예시 그림**: 실제 책과 무관한 예시 4권과 겹치던 "불러온 책을 선택하세요" 글자를 없애고, 그 자리에 **실제 내 책(최대 4권)** 을 세운다(`renderHeroShelf`). 책이 없으면 빈 무대만 남는다. 판단 근거: 예시 그림은 화면의 실제 내용(내 책장)과 어긋나 오해를 만들고, 안내 문구가 그림 위에 겹쳐 읽기 어려웠다. 실제 책을 쓰면 정보가 늘고 겹침도 사라진다.
- 시험: `tests/v41-shelf-unify.test.mjs` 12건(밤 장미 0·무대/진주/금 토큰·강조 톤·카드 정보 줄·내부 표시 없음·선택 카드 안 잘림·접미사 표시 규칙·저장 불변·생성 경로·클래식/모듈 일치·예시 그림 대체). `v41-theme-ab`·`v41-journey-garden`의 "안쪽 화면은 언제나 A" 단언은 #212 범위에 맞게 책장만 B로 갱신했고, `v41-workspace-model`의 `book.subject` 단언은 카드 줄 변경에 맞춰 실제 트리 메타데이터 단언으로 바꿨다. 전체 `npm test` 476건 439 pass/0 fail/37 skip, `npm run build` pass.
- 캡처(`scripts/capture-shelf-unify.mjs`, 가짜 세션 — 실제 로그인 없음): `out/shelf-unify/shelf-{night,garden}-{1440,390}.png`. 밤 1440·390 가시 장미색 0, 표지 이름 3권 모두 접미사 없음(`윤슬`·`하루`·`겨울 정원`), 카드 정보 줄 `3개 순간 · 마지막 2026-11-08`, `책 · NN`·`기본 표지` 없음, 선택 카드 표지 안 잘림(카드 상단 대비 +1px), 가로 넘침 0, 콘솔 오류 0. 정원은 배경 `rgb(247,240,232)`으로 기존 크림 책장 유지.
- 남긴 것: 셸 헤더·기억책의 접미사 표시 연결, 실제 계정 로그인 상태의 저장 왕복 확인.

## 2026-11-08 — 보관 파일 다시 첨부가 편집기 reset에 지워지던 문제(컴2로컬2, ai/com2-lt-asset-reattach-261108)

계정 메뉴 `내 보관 파일` → `이 파일 첨부`가 폼 URL만 채우고 끝나서, 뒤이어 `순간 추가`를 열면 `setEditorMode`의 `form.reset()`이 링크를 지웠다. 편집기가 이미 열려 있던 경우에만 유지돼 컴1의 실패/통과가 엇갈렸다.

- `private-upload.mjs`에 `onUseAsset(url)`을 두고, 선택 시 **목록을 먼저 닫은 뒤** 셸이 `순간 추가` 편집기를 열고(필요하면 reset) 그 뒤 URL을 채운다. 이미 열린 편집기면 reset 없이 URL만 바꾼다. 선택된 트리가 없으면 첫 여정으로 안내하고 URL을 채우지 않는다.
- 편집기 `링크 또는 사진` 묶음에 `내 보관 파일에서 고르기`(`#editor-assets-open`)를 추가했다. 계정 메뉴와 같은 `#account-assets` 목록을 편집기 위에 열고, Esc로 닫으면 네이티브 dialog 포커스 복귀와 입력 보존이 그대로다. 고르면 URL을 채우고 링크 칸으로 초점을 돌린다.
- 저장 경로·용량 안내·삭제 경고·사진 메타데이터 규칙은 그대로다. 새 스타일은 `--lt-*` 토큰만 쓴다.
- 시험: `tests/v41-asset-reattach.test.mjs` 3건(편집기 버튼/계정 메뉴 연결, reset 뒤 URL 유지·입력 보존, 토큰만). 전체 `npm test` 403 pass/0 fail/37 skip, `npm run build` pass(잠금 대기 0초).
- 로그아웃 미리보기 1440/390: `out/asset-reattach/home-{1440,390}.png`. 편집기·보관 목록은 로그인 게이트 안이라 로그아웃 캡처로는 열 수 없어, 해당 상호작용은 단위 시험으로 확인했다.

## 2026-11-08 — 첫 여정 완료 뒤 임시 저장이 되살아나던 문제(컴2로컬2, ai/com2-lt-journey-draft-clear-261108)

첫 여정을 끝까지 저장하고 기억책으로 나간 뒤 다시 `새 트리 만들기`를 누르면, 방금 만든 트리 이름으로 복원 안내가 떴다. 완료 시 임시값을 지우지만, iframe이 내려가며 `pagehide`가 `readForm(); persistDraft()`를 다시 실행해 저장된 트리·순간 id가 담긴 임시값을 되살렸기 때문이다.

- 완료(`state.completed=true`) 시 `finishJourneyDraft(storage)`가 `lovetree.v41.first-journey.finished` 완료 표시를 남기고 임시값을 지운다. `persistJourneyDraft(...,{completed:true})`는 쓰지 않으며, `pagehide`·`visibilitychange`·닫기가 같은 `saveDraftBeforeLeave()` 가드를 쓴다.
- 새 여정 `boot()`은 `discardFinishedJourneyDraft(storage)`로 완료 표시와 그 뒤 늦게 남은 이전 임시값을 함께 버린다. 저장 전 중간에 닫은 값은 그대로 남아 기존 복원 안내를 유지한다.
- 뒤로가기(#189·#190)·정원/밤(#194·#195)·단계·문구·저장 경로는 변경 없음. `public/v41/home*.js`·`src/views/orbit*`는 건드리지 않았다.
- 시험: `tests/v41-first-journey.test.mjs` 13건(완료 뒤 pagehide 재저장 0, 완료 표시가 남은 이전 임시값 폐기, 중간 닫기 복원 유지 포함). 전체 `npm test` 398 pass/0 fail/37 skip, `npm run build` pass(잠금 대기 0초).
- 로그아웃 미리보기(밤, 1440/390): `out/journey-draft-clear/journey-0{0..4}-{1440,390}.png` 10장 + 첫 화면 `home-{1440,390}.png`. 장미색 0, 가로 넘침 0. 실제 저장 왕복은 시험 계정 로그인 없이 수행하지 않았고, 단위 시험과 iframe 수명주기 코드로 확인했다.
## 2026-11-08 — 첫 화면 카드 결함 2건 후속(컴2로컬1, ai/com2-lt-home-cards-fix-261108)

결함 1은 comp1의 PR #197(머지 `99e6592`), 결함 2는 comp1의 PR #196(이 레인에서 머지 `b246d79`)으로 이미 구현되어 있었다. 같은 2줄 수정을 중복 PR로 다시 만들지 않고 #196을 머지한 뒤, 이 레인에서 가짜 세션으로 두 결함을 다시 확인하고 문서만 보탰다.

- **업로드 사진 판정**: `v41/home-moments.js`의 `privateMediaKind`가 `moment.url`이 현재 출처(또는 공식 별칭)의 `/api/media/<uuid>.<ext>`일 때만 사진·영상으로 보고, 사진이면 그 경로를 카드 썸네일로 쓴다. mp4·webm은 영상 카드, 외부 출처·쿼리·자격 증명이 붙은 URL은 메모 카드다. 외부 요청 0.
- **카드 메뉴 바깥 클릭**: `v41/home-cards.js`의 `clickWithin(event, ...nodes)`가 `composedPath()`를 먼저 보고, 없으면 `contains()`로 되돌아간다. shadow DOM 안 버튼 클릭이 document 리스너에서 host로 retarget되어도 메뉴·버튼이 경로에 남아 열린 상태가 유지된다. 첫 화면에서 같은 방식의 바깥 클릭 처리는 카드 메뉴 하나뿐이었다.
- **시험**: `npm test` 398 pass / 0 fail / 37 skip, `npm run build` pass(2.27s).
- **가짜 세션 캡처**(`out/home-cards-fix/`, `/api/workspace` 1 revision + 업로드 사진 3 + 글 1): 1440·390 모두 섞어서 40장 중 내 카드 4(사진 3+글 1)·금빛 문구, 내 것만 4장(사진 3), 가로 넘침 0, 콘솔 오류 0.
- **메뉴**: 마우스 클릭 열림(`hidden=false`, aria-checked 유지), 바깥 클릭 닫힘, Esc 닫힘, ArrowDown 열림 3/3(390·1440).
- **운영 로그아웃 `/v41/`**: 1440에서 `카드: 예시 ▾`를 마우스로 눌러 메뉴가 열린 채 유지되는 것을 확인했다. 로그인 상태의 섞어서·내 것만 카드 구성은 컴1 확인 몫이다.

## 2026-11-08 — 밤(A) 첫 여정을 첫 화면 무채색으로(컴2로컬2, ai/com2-lt-journey-night-261108)

첫 화면은 검정·진주색·금테인데 첫 여정만 제목 강조 줄과 주 버튼이 장미색이라 끊겨 보이던 문제를 고쳤다. **밤(기본) 테마만** 바꾸고, #194가 넣은 `html[data-lt-theme=garden]` 정원 블록은 건드리지 않았다.

- 강조 줄(`h1 em`), 작은 머리글(`.eyebrow`, `.moment-card .kicker`)은 `--lt-muted`, 오류 문구는 `--lt-pearl`로 바꿔 밤 첫 여정에서 `--lt-rose` 사용을 없앴다. 정원은 기존 블록이 이 속성들을 `--lt-rose-ink`로 덮으므로 그대로다.
- 주 버튼: 첫 화면 중앙 1차 버튼과 같은 `--lt-primary` 바탕·`--lt-primary-ink` 글자, 44px 높이·10×12 패딩·14px/400·0.02em·999px 알약·1px 테두리. 밤에만 적용되는 `html:not([data-lt-theme=garden])` 선택자다.
- 보조 버튼: `--lt-stage-2` 30% 유리 바탕, `--lt-pearl` 16% 테두리·진주 글자, 같은 44px 알약. hover는 진주 44%/9%로 옅어진다.
- 금색은 단계 테두리·현재 단계·✦·배지·메타 등 포인트에만 남겼다. 새 hex·rgba 없이 `--lt-*` 토큰과 `color-mix()`만 썼다. 단계·문구·피어남 연출·뒤로가기·정원 규칙은 변경 없음.
- 시험: `tests/v41-journey-night.test.mjs` 5건(장미 0·주 버튼 토큰/모양·보조 버튼·정원 보존·대비 4.5:1). 전체 `npm test` 392건 392 pass/0 fail/37 skip, `npm run build` pass(잠금 대기 0초).
- 미리보기(밤, dist, Chrome Headless): `out/journey-night/journey-0{0..4}-{1440,390}.png` 10장 + 같은 크기 첫 화면 `home-{1440,390}.png`. 10장 모두 장미색 계산값 0, 가로 넘침 0. 주 버튼 실측 44px·999px·14px/400·`rgb(238,233,224)`/`rgb(10,9,13)`, 보조 버튼은 어두운 유리 알약. 대비(토큰 계산): 진주/무대 18.18:1 · 보조/무대 7.25:1 · 보조/무대2 6.99:1 · 금/무대 16.69:1 · 1차 버튼 글자 16.42:1 · hover 17.62:1.

## 2026-11-08 — 정원 테마 2단계: 첫 여정까지(컴2로컬1, ai/com2-lt-journey-garden-261108)

정원 테마 적용 범위를 헤더·첫 화면에서 **첫 여정**까지 넓혔다. 책장·기억책·기억 보드·관계 지도는 계속 A다.

- 판정: `header-state.mjs`의 `appliedTheme(theme, view)`가 `home`·`journey`만 B를 돌려준다. 셸의 `themedView()`는 `current==='first-journey.html'`일 때 `'journey'`를 반환하고, `applyTheme`이 셸 문서와 iframe 문서(`$('view').contentDocument`) 양쪽에 같은 속성을 적용한다. iframe load 때도 다시 적용한다.
- 첫 여정 문서: head에서 셸의 `data-lt-theme`를 그대로 받아 첫 그리기 전에 맞춘다(셸이 없으면 단독 미리보기만 `localStorage['lt41.theme']`을 읽는다). 화면 자체는 테마를 정하지 않는다.
- 정원 규칙은 `first-journey.html`의 `html[data-lt-theme=garden]` 블록 하나에만 둔다. 크림 배경·잉크 글자, 카드(성장·복원·순간)에는 정원 테두리(`--lt-gold-deep`)와 따뜻한 그림자(`--lt-garden-shadow`), 장미 강조는 `--lt-rose-ink`, 큰 제목은 번들한 Gowun Batang + `--lt-reading` 대체, `word-break:keep-all` 유지. 새 색 값·hex는 추가하지 않았다.
- 단계 구성·문구·피어남 연출(`lt-bloom`)·뒤로가기(#189·#190)는 변경 없음.
- 시험: `tests/v41-journey-garden.test.mjs` 6건(정원일 때 첫 여정 전달·밤이면 A·안쪽 네 화면 A·head 전달·정원 토큰/테두리/글꼴/keep-all·대비 4.5:1 이상·기록 규칙 불변), `tests/v41-theme-ab.test.mjs`의 `themedView` 단언 갱신. 전체 `npm test` 421건 384 pass/0 fail/37 skip, `npm run build` pass.
- 미리보기(정원, dist, Playwright + Chrome): `out/journey-garden/{1440,390,360}-0{0..4}.png` 15장. 실측 `data-lt-theme=garden`, 배경 `rgb(247,240,232)`, h1 글꼴 `Gowun Batang`, 가로 넘침 0(15/15), 콘솔 오류 0. 정원 대비(정원 토큰 계산값): 잉크 10.9:1 · 보조 5.3:1 · 장미 잉크 5.1:1 · 금 잉크 5.8:1 · 1차 버튼 글자 5.7:1.
- 운영 로그아웃에서는 첫 여정이 로그인 게이트 뒤라, 배포된 문서·모듈에 정원 규칙이 실렸는지와 헤더 테마 적용만 확인했다. 로그인 상태 정원 첫 여정 저장 왕복은 컴1 레인 몫이다.

## 2026-11-08 — 순간 추가·수정 패널 정리(컴2로컬1, ai/com2-lt-moment-panel-261108)

오른쪽 패널을 순간 추가·이 순간 수정 전용으로 줄였다. 첫 트리는 첫 여정(#187·#189·#190)이 계속 맡고, 패널의 `새 트리` 탭은 없앴다.

- 탭 2개(`순간 추가`/`이 순간 수정`). `openEditor('new')`·헤더 주 버튼·둘러보기 `내 기록 새로 시작`은 그대로 첫 여정으로 간다. 패널은 `member.apply(editorMode, FormData)` 하나로 저장하는 경로를 바꾸지 않았다.
- 입력 순서: 링크 또는 사진(원본 링크 + 파일 선택 한 묶음) → 마음 한마디 → `더 적기`(제목·감정·날짜) → 연결 이유(추가일 때). 파일은 선택 즉시 검증·업로드하고 `파일 올리기` 2단계를 없앴다. 수정 모드에서 기존 제목·감정·날짜가 있으면 `더 적기`를 펼쳐 연다. 새 트리 전용이던 `좋아하는 대상` 칸은 패널에서 뺐다.
- `내 기록 백업`·`내 보관 파일·다시 첨부·삭제`는 계정 메뉴(#185 동그라미) 항목으로 옮겼다. 백업 안내 문구는 메뉴 항목 `title`로, 보관 파일 경고·용량·삭제 확인 문구는 `#account-assets` 다이얼로그에 그대로 남겼다. `private-upload.mjs`는 폼의 링크·사진 슬롯과 계정 다이얼로그 두 곳을 맡는다.
- 검증·미디어 메타데이터(#182·#183)·용량 안내 문구는 그대로다. 새로 넣은 스타일은 `--lt-*` 토큰만 쓴다(새 hex·rgba 0).
- 시험: `tests/v41-moment-panel.test.mjs` 7건 추가, `tests/private-upload-race.test.mjs`를 새 API(슬롯·계정 다이얼로그)로 고침. 전체 `npm test` 407건 370 pass/0 fail/37 skip, `npm run build` pass(잠금 대기 0초).
- 로컬 미리보기(dist, Playwright + 설치된 Chrome): `out/moment-panel/panel-add-{1440,390}.png`, `panel-more-{1440,390}.png`, `account-assets-1440.png`, `account-menu-1440.png`. 로그아웃 상태라 패널을 직접 열어 레이아웃만 확인했고, 실측 탭 2개·입력 순서·`data-upload` 없음·패널 가로 넘침 0(1440/390), 콘솔 오류 0건. 로그인 상태 실제 업로드·저장 왕복은 컴1 레인 몫이다.

## 2026-11-07 — 첫 화면 테마 A/B와 워드마크 LoveTree 통일 1단계(컴2레인, ai/com2-lt-theme-ab-261107)

첫 화면과 공통 헤더에만 밤(A)/정원(B) 테마를 붙였다. A는 지금 운영 그대로이고 속성이 없으면 A다. B의 새 색은 `public/v41/identity.css`의 `html[data-lt-theme=garden]` 블록 한 곳에만 있다(`reference/originals/first-journey.html`의 `:root`: 종이 #f7f0e8 · 잉크 #403536 · 장미 #c86e79 · 깊은 장미 #98505e).

- 워드마크를 `LoveTree` + 작은 `4.1`로 바꿨다(`aria-label="LoveTree 4.1 첫 화면"`). `· MEMORY ORBIT`와 새싹은 헤더에서 삭제했고 파비콘만 남긴다. A는 Pretendard 700/.22em(기존 헤더와 같은 값), B는 Gowun Batang 잉크색이다. 글꼴은 저장소 안(`public/fonts/gowun-batang/`, 라틴 서브셋 16KB + OFL 전문)에서만 받고 외부 글꼴 요청은 0건이다.
- 첫 화면 B는 그림자 루트 안쪽(`:host([data-lt-theme=garden])`)에서 색만 바꾼다. 궤도 배치·움직임·깊이 카메라는 그대로이며, 연한 메모 카드는 잉크색 3px 테두리로 크림 배경과 대비를 확보한다. 같은 `identity.css`를 그림자 루트에도 `<link>`해 한 파일의 규칙을 같이 쓴다.
- 전환은 첫 화면 오른쪽 위 도구 줄 버튼(글자 `밤`/`정원`, `aria-pressed`)과 계정 메뉴 항목 두 곳이다. 값은 `localStorage['lt41.theme']`, `index.html` head 인라인 스크립트가 첫 그리기 전에 적용하고 `try/catch` 실패 시 A다. `prefers-reduced-motion`이면 전환 애니메이션을 끈다.
- 안쪽 네 화면은 1단계에서 A로 고정한다: `header-state.mjs`의 `appliedTheme(theme, view)`가 `home`이 아니면 A를 돌려주고 셸이 그 화면에 `data-lt-theme`를 붙이지 않는다. 셸은 화면 전환·iframe load 때마다 다시 적용하고, 첫 화면 프레임은 `postMessage({type:'lt41-theme'})`로 같은 값을 맞춘다.

시험: `tests/v41-theme-ab.test.mjs` 11건 추가(기본 A · 저장/재방문 유지 · 저장 실패 A · 안쪽 화면 A · 버튼 문구와 aria-pressed · 워드마크 · head 인라인 스크립트 · 정원 색 단일 블록 · 메모 카드 테두리 · 움직임 줄이기 · 외부 글꼴 0건). 전체 `npm test` 382건 345 pass/0 fail/37 skip, `npm run build` pass(잠금 대기 0초).

로컬 미리보기(로그아웃, `dist` 정적 서버, Playwright + 설치된 Chrome): `out/theme-ab/first-{night,garden}-{1440,390,360}.png` 6장과 `out/theme-ab/inner-book-{1440,390,360}.png` 3장. 가로 넘침 0(바깥 문서·첫 화면 문서 모두, 1440·390·360), 탭 7개 모두 스크롤로 도달(390 = 111px, 360 = 129px 스크롤 범위, 마지막 탭 보임), 외부 글꼴 요청 0건. 대비(계산값): A 헤더 18.18:1·안내 13.36:1, B 헤더 10.44:1·안내 5.31:1·메모 카드 테두리 10.44:1. 정원이 저장된 상태에서 `#book`을 열면 `html`에 속성이 없고 헤더가 `rgb(4,4,7)`(A)이다.

## 2026-11-07 — 새 트리 만들기 = 첫 여정(A안, 어두운 무대) · 컴2 로컬2 레인

`ai/com2-lt-first-journey-261107`. 새 트리를 여는 모든 경로를 어두운 무대의 첫 여정 화면 하나로 모으고, 순간 추가·이 순간 수정은 기존 오른쪽 패널에 남겼다. 저장 계약·스키마·인증·공통 헤더·`identity.css` 토큰 정의·`index.html` 워드마크는 바꾸지 않았다.
- PR #187: CI 결과는 이 PR에서 확인한다.

- 화면 `public/v41/views/first-journey.html`, 순수 로직 `public/v41/first-journey.mjs`(단계·검증·저장 계획·임시 보관·진입 판정). 셸 `public/v41/shell.mjs`는 `openFirstJourney` 하나로 진입을 모으고 `lt41-journey-save`/`-open-book`/`-close` 메시지만 처리한다.
- 진입: 로그아웃 첫 화면 `처음 시작하기` → 로그인 뒤 `openEditor('new')` → 첫 여정(트리 0개 계정), 첫 화면 가운데 `새 트리 만들기`(`openEditor()` → `new`), 헤더 주 버튼(책장에서 `new`), 작성 패널의 `새 트리` 탭, 둘러보기 `내 기록 새로 시작`(대상 이름을 첫 여정에 미리 채움). `순간 추가`·`이 순간 수정`은 `setEditorMode` 패널 그대로다.
- 저장: 02에서 `member.apply('new')` → `createTree`, 03에서 `member.apply('add', {…, relation}, {treeId, momentId})` → `addMoment(parentId=첫 순간)`. 새 저장 경로·필드 없음. “기억할 시점”=`date`, “이유”=`note`(없으면 01 마음 한마디), 미디어 메타데이터는 #182·#183 규칙 그대로.
- 04의 `내 러브트리 보기`는 방금 만든 첫 순간을 기억책으로 연다(`lt41-journey-open-book`).
- 임시 보관: `localStorage` `lovetree.v41.first-journey`에 try/catch. 다시 열면 “이어서 쓸까요?”를 묻는다. 트리 저장 뒤 닫았으면 `savedTreeId`/`savedMomentId`로 이어져 트리를 두 번 만들지 않는다. 화면은 서버를 직접 부르지 않고 셸만 저장하며, 셸이 로그인·쓰기 가능을 확인한다(비로그인 서버 저장 없음).
- 시험: `tests/v41-first-journey.test.mjs` 11건(단계 이동·나중에 잇기·저장 인자·진입 경로·임시 보관 복원·토큰/hex/keep-all). 전체 `npm test` 382건 345 pass/0 fail/37 skip, `npm run build` pass.
- 로컬 캡처: `out/first-journey/`에 1440(7장)·390(5)·360(5). CDP 실측 `innerWidth` 1440/390/360, 0~04 단계 가로 넘침 0. 단독 미리보기(가짜 세션)이며 로그인·운영 저장 왕복은 컴1 레인이 머지 후 확인한다. (헤드리스 Chrome은 창 최소 폭 500px 때문에 390/360을 그대로 못 잡아 CDP `setDeviceMetricsOverride`로 캡처했다.)
## 2026-11-07 — 모바일 헤더 탭 잘림 수정(컴1 레인, ai/com1-lt-mobile-tabs-261107)

#185로 트리 선택이 탭 묶음 앞으로 오면서 390·360에서 탭 7개가 폭을 넘어 기억 보드·관계 지도가 잘렸다(postdeploy `no-overflow-390` warn). 좁은 폭만 고쳤고 데스크톱 배치는 그대로다. 제품 코드 변경은 `public/v41/shell.css`·`public/v41/shell.mjs` 두 파일뿐이다.

- ≤780px 탭 줄: `overflow-x:auto` + 스크롤바 숨김 + `scroll-snap-type:x proximity`. 탭은 `flex:0 0 auto`로 줄어들지 않는다(예전 `nav>button{flex:1}`·`.tree-views{flex:3}` 제거).
- 화면 전환 때 현재 탭을 `scrollIntoView({inline:'center',block:'nearest'})`로 가운데에 보인다(`revealCurrentTab`, `flowNavigation`에서 호출). `prefers-reduced-motion`이면 `auto`.
- 넘치는 쪽 끝에만 `--lt-stage` 기반 페이드(`fade-start`/`fade-end`, `mask-image`). 스크롤·리사이즈에 반응해 켜고 끈다(`updateNavFade`).
- 트리 선택은 ≤780px에서 `max-width:112px` 말줄임(420 이하도 112px 유지).

시험: `tests/v41-header-tabs-mobile.test.mjs` 8건 추가(CSS 규칙·데스크톱 무영향·현재 탭 노출·페이드 토글·탭 7개). 전체 `npm test` 371건 334 pass/0 fail, `npm run build` pass. 로컬 390/360/1440 실측 `tabs-check.mjs`: 가로 페이지 넘침 0, 7개 탭 모두 스크롤로 닿음, 현재 탭 보임, 1440은 스크롤·페이드 없음.

저장소 밖 도구: `postdeploy.mjs`에서 스크롤 컨테이너 안 요소는 넘침으로 세지 않게 고치고, `no-overflow-*`를 warn→fail로 올렸다. 좁은 폭에 `tabs-390`·`tabs-360` 검사(7개 도달성·현재 탭 노출)를 추가하고 360 화면도 검사한다.

## 2026-11-07 — 상단 메뉴 재구성과 첫 화면 버튼 상태(컴1 레인, ai/com1-lt-header-ia-261107)

대표 결정(2026-11-07)으로 4.1 상단 메뉴 배치를 바꿨다. 색·금테·무대·알약 모양은 그대로 두고 배치와 버튼 무게만 손댔다. 새 색 hex는 쓰지 않았고 `--lt-*` 토큰만 썼다.

바뀐 배치(데스크톱): `러브트리 4.1 │ 첫 화면 · 내 책장 · 둘러보기 │ [트리명 ▾] 기억책 · 기억 보드 · 관계 지도` … `(주 버튼) · 계정`.

- 트리 선택(`#record-menu`)을 오른쪽 알약 묶음에서 뒤쪽 탭 묶음(`#tree-views`) 바로 앞으로 옮겼다. 현재 트리 이름을 보여 주고(길면 말줄임) 트리가 없으면 `트리 고르기`다. 트리가 없을 때 세 탭은 계속 비활성이다.
- 주 버튼은 `#write-menu` 하나뿐이고 금색 강조(`--lt-gold-line`/`--lt-gold`)를 쓴다. 문구 규칙은 `public/v41/header-state.mjs`의 `writeMenuLabel` 하나로 모았다.
- 계정: 로그인 상태는 이름(또는 이메일) 첫 글자 동그라미 44×44 + 작은 메뉴(계정 이메일 · 내 계정/백업 · 로그아웃), 로그아웃 상태는 기존 `로그인` 알약이다. 작은 메뉴의 로그아웃은 기존 records 패널 `#logout`을 그대로 클릭해 부른다. 인증 로직은 새로 만들지 않았다.
- 연결 보기는 헤더에서 뺐다. 관계 지도 화면 도구 줄(`.top-actions`)에 같은 다이얼로그를 여는 `#connection-tool`을 셸이 붙인다(원본 화면 파일 무변경).
- 화면 안 도구 줄은 높이 36·터치 영역 44로 한 단계 작게 해 두 번째 메뉴 줄로 보이지 않게 했다. 네 화면 공통이다.
- 첫 화면 가운데 버튼 3개는 자리·개수를 그대로 두고 흰색 강조와 첫 버튼 문구만 상태로 바꾼다(`v41/home-center.js` + `homeCenterState`). 로그아웃 `처음 시작하기`(next=/v41/) / 로그인·트리 0은 `이어 보던 순간` 비활성 + `새 트리 만들기` 강조 / 로그인·트리 있음은 `이어 보던 순간` 강조. 강조는 언제나 하나다.
- 셸이 `body[data-member]`·`body[data-tree-count]`로 회원 상태를 첫 화면 프레임에 알려 준다. 트리가 0개인 로그인 상태는 `LT41`이 비어 있어 그것만으로 로그아웃과 구분되지 않기 때문이다.

시험: `tests/v41-header-ia.test.mjs` 13건(로그인/로그아웃 계정 표시, 트리 유무별 트리 선택 문구, 주 버튼 문구, 첫 화면 세 상태의 강조 유일성, 로그인 next). 전체 `npm test` 363건 326 pass/0 fail/37 skip, `npm run build` pass.

저장소 밖 도구: `D:\PADIEM\tools\lovetree-postdeploy\postdeploy.mjs`의 헤더 기준을 새 배치로 고쳤다(백업 `postdeploy.mjs.bak-261107`). 바뀐 기준 — 트리 선택이 탭 묶음 앞인지, 주 버튼 금색인지, 연결 보기가 헤더에 없는지, 계정 동그라미 44×44와 `aria-label` 형식, 로그인 상태에서 로그인 알약이 같이 보이지 않는지. 로그인 판별도 `내 계정` 글자 대신 동그라미 `aria-label`을 본다.
## 2026-11-06 — 미디어 메타데이터 서버 저장 복구(#182 → #183)와 운영 확인 마무리

#182(`937354a`)는 4.1 클라이언트(`public/v41/domain.mjs`)에서만 제목·채널·출처 캐시를 저장했다. 운영 실측(21:46, 시험 계정)에서 브라우저가 보낸 `PUT /api/workspace` 본문에는 `mediaMetadata`가 있고 200을 받았지만 같은 순간의 `GET`에는 필드가 없었다. 요청을 처리하는 `server/workspace-service.js` → `src/domain.js` `validateState`가 순간을 `{...validateMomentInput(m), id, parentId, links, createdAt}`로 다시 만들며 알 수 없는 필드를 잘라냈기 때문이다(#14 본문이 미리 경고한 형태). 단위 시험이 초록이었던 이유는 시험이 클라이언트 사본을 가져다 써 서버 경계를 지나지 않았기 때문이다.

#183(`e3c2302`)으로 같은 규칙(`normalizeMediaMetadata`: 제목 240자·채널 160자·출처는 순간 링크에서 재계산, 링크가 바뀌면 캐시 삭제)을 `src/domain.js`에 연결하고 `tests/storage-api.test.mjs` 4건·`tests/domain.test.mjs` 1건을 바운더리에서 묶었다. 직전 버전으로 되돌리면 그 4건만 실패한다(37 pass/4 fail). **저장 계약에 필드를 추가할 때는 클라이언트 사본 시험이 아니라 `validateState`를 지나는 시험으로 묶는다** — 다음 모델이 반복하지 않아야 할 함정이다.

배포: `src/domain.js`·`server/*` 변경은 COM2의 10분 자동 배포 타이머(`deploy/host-com2/lovetree-api/autodeploy.sh`, migration 필요 시 자동 설치 금지)가 main에서 가져간다. 레인에서 COM2에 접속하지 않고 반영됐으며, 21:57(구 배포·재부하 후 캡션 소실) → 22:02(신 배포·재부하 후 캡션 유지)로 운영에서 확인했다.

운영 확인(#14·#144 닫힘, 근거는 각 이슈 댓글과 `out/live-20261106/`의 f2-*.json·61~101 png): 이메일 로그인 개통(`/v41/` → `auth.padiem.net/login`의 `이메일로 로그인`), 미디어 정보 저장→로그아웃 401→재로그인 유지, 백업 내보내기→새 시험 트리 가져오기 보존, 화면별 1440·390(기억책·보드·관계 지도·상세·공유 미리보기·비로그인 공개 공유), 영상 실패 대체와 원본 열기·시점 1:23, 클릭 전 외부 요청 0건·재로그인 후 oEmbed 재요청 0건·`ftp`/`javascript`/자격증명 포함 링크 차단·`http`는 원본 링크만. 세션 만료 직후 커뮤니티 댓글(401→안내→재로그인→201→삭제 0건)과 기록 저장(401→안내→재로그인→복원 안내→다시 시도 200, `pending-write` 키 소거)도 실측했다. 시험 자료는 트리 0·순간 0·첨부 0(usedBytes 0)·활성 공유 0·댓글 0으로 정리했고 실제 사용자 기록은 건드리지 않았다. `npm test` 350건 313 pass/0 fail/37 skip, `npm run build` pass.

남은 것은 #44(실기기·소프트키보드·스크린리더·밀집 관계 지도) 4건 — 대표 몫.

## 2026-11-06 — #144 세션 만료 후 작성 내용 복구

15분 access token 만료는 저장·공유·커뮤니티 요청에서 401 뒤 기존 공통 refresh와 동일 요청 재시도로 처리한다. refresh까지 거부되어 재로그인이 필요한 회원 저장은 같은 계정의 현재 탭에만 임시 초안을 `sessionStorage`로 보관한다. 재로그인 뒤 계정 subject가 같으면 서버 workspace를 먼저 읽고 초안을 복원해 사용자가 다시 저장할 수 있게 한다. 다른 계정에는 복원하지 않으며, 서버 revision이 달라졌으면 기존 충돌 선택을 따른다. 저장 성공 또는 서버 기록 열기에서 임시 초안을 지운다. access/refresh token은 저장하지 않으며, 이는 기기 전용 저장 모드가 아니다.

검증: 가짜 401→갱신→동일 workspace PUT 성공, 갱신 실패→401→같은 계정 재로그인→동일 내용 저장 성공, 다른 계정 복원 차단. 관련 인증·회원 세션·공유·커뮤니티 시험 31건 통과. 자연 만료 실계정 및 실시간 커뮤니티 쓰기는 별도 브라우저 실측으로 남긴다.

## 2026-11-06 — #174 로그인 전 공용 화면 /auth/refresh 차단

`refreshUnauthorized`(`public/v41/api.mjs`) 진입부에 `canRefresh` 힌트 게이트를 넣었다. 회원 셸 `shell.mjs`가 모듈 시작 때 `setMemberRefreshStarted(false)`로 닫고 `startMember()`에서 true로 켠다. `createWorkspaceApi`·`createCommunityApi`·`createShareApi` 세 클라이언트가 모두 `memberRefreshAllowed`를 넘겨 같은 함수를 거친다. 셸을 거치지 않는 단독 클라이언트·시험은 기본값 true로 기존 동작을 유지해 `tests/missing-marker-refresh.test.mjs`의 복구 시나리오(표시 쿠키 없이도 HttpOnly 갱신 쿠키로 세션 복구)를 깨지 않는다. 새 시험 `tests/v41-refresh-gate.test.mjs`: 회원 시작 전 401 → refresh 0회 / 회원 시작 뒤 401 → refresh 1회(세 클라이언트), 진입부 `canRefresh=false` 단축, shell 배선 확인. `functions/_lib/shared-auth.mjs`의 401 응답·padiem-auth·시각 통일 결과 무변경.

## 2026-11-05 — 상단 메뉴 완전 통일(첫 화면·둘러보기 포함)

대표 지적: "페이지 누를 때마다 상단 메뉴가 다르다." 6화면을 같은 크기로 찍어 보니 상단이 세 종류였다 — 첫 화면(원본 워드마크 + 알약 4개, 탭 없음), 안쪽 4화면(공통 헤더), 둘러보기(모달 패널 자체 머리글). 고친 것: `shell.css`의 `body.home-screen .app-header{display:none}` 제거로 공통 헤더를 첫 화면에도 표시, `v41/home.js`에서 첫 화면 안 워드마크·둘러보기·로그인 버튼 숨김과 고유 버튼(움직임 멈춤·순간 목록)을 오른쪽 위 도구 줄 자리로, 둘러보기 패널을 `#stage` 안 비모달(`dialog.show()`)로 옮겨 헤더 아래 금테 카드로 열리게(`index.html` 마크업 이동, 패널 머리글은 닫기만 남김, 화면 전환·Esc 시 닫힘, 둘러보기 탭 `aria-current`). 무대 프레임은 첫 화면에서 계속 뺀다. 원본 SRC064·네 화면 구조 무변경.

## 2026-11-05 — 4.1 시각 통일: 첫 화면(SRC064)이 디자인 원본

대표 결정(2026-11-05): 첫 화면의 이미지·스타일을 계속 가져가고, 나머지 화면도 그 스타일로 통일한다. 원본 네 화면(Track32/59/58/56)의 종이·폴라로이드·코르크·책등·구성·질감은 그대로 두고 어댑터 층만 바꿨다.

- `public/v41/identity.css`: 첫 화면 SRC064에서 뽑은 `--lt-*` 토큰(무대 `#040407`/`#0a0a11`, 진주 `#f5f1e9`, 금테 `#ffe6a6`·`rgba(238,190,104,.68)`, 로즈 `#d88f9c`, 종이 `#f5efe2`, 유리, 알약 999/패널 22/카드 14). 화면별로 원본 `:root` 변수와 무대 배경만 덮어쓴다 — 기억책 무대 검정, 보드 기본 테마(진주빛) 무대 검정·실/핀 색 네온→첫 화면 색, 관계 지도 배경 종이색·6그룹색 첫 화면 계열, 책장 로즈·어두운 무대 토큰. 어댑터 조작 UI(모바일 순간 선택 바, 미디어 불러오기, 비공개 업로드)의 보라 계열 제거.
- `public/v41/shell.css`: 플럼+연분홍 팔레트 → 무대 검정+금테+진주. 탭 선택 표시는 금테 1px, 패널(dialog)은 첫 화면 감상창과 같은 유리(`rgba(7,7,12,.9)`+blur), 버튼은 알약, 1차 버튼은 첫 화면과 같은 `#eee9e0`. 둘러보기의 황갈 포인트(`#d9a66f`/`#b99565`)는 금 토큰으로 흡수, 감상 허브 종이 카드는 금테 프레임. **안쪽 화면 iframe을 검은 무대 위 금테 카드 프레임 안에 둔다**(`body:not(.home-screen) #stage/iframe`). 첫 화면(`body.home-screen`)은 전면 구성 그대로.
- `public/v41/index.html`: 헤더 브랜드를 새싹 SVG 대신 첫 화면 워드마크 양식(11px·자간 .22em·700)의 `러브트리 4.1`로. 새싹은 파비콘에만 남는다. theme-color `#040407`.
- `public/v41/views/track58-pinboard.html`·`design/views/…`: 실·핀 색 상수(`colors`)를 `--lt-thread-*`에서 읽는다(없으면 원래 값). `track56-network.html`·`design/views/…`: 그룹색 `COLORS`와 범례 점을 `--lt-group-*`에서 읽는다(없으면 원래 값). 데이터·ID·연결·저장 형식 변경 없음.
- 검증: 컨테이너에서 `public/` 정적 서빙 + Playwright로 기억책·보드·관계 지도·책장·둘러보기·작성 패널을 1280×900/390×844 캡처, 콘솔 오류 0, `node --test` 334건(297 pass, 0 fail, 37 서버 의존 skip). 첫 화면·회원 모드·실기기는 Pages 미리보기에서 확인한다(PR 본문).
- 상단 메뉴 통일(같은 PR 2차 커밋, 대표 지적 2026-11-05 "페이지마다 상단 메뉴가 통일이 안 됨"): 확인 결과 ① 첫 화면 topbar(워드마크 11px + 14px 유리 알약 4개, 높이 92)와 shell 헤더(68px, 13px 탭, 12px 글자 버튼)가 서로 다른 문법이었고 ② shell 탭·연결 보기가 책장에서는 숨겨져 화면마다 개수가 달랐으며 ③ 안쪽 화면 도구 줄이 기억책(44px 유리 알약)·보드(36px·18px 모서리)·관계 지도(36px 흰 알약)로 제각각이었다. 고친 것: shell 헤더를 첫 화면 topbar 문법으로(높이 92, 여백 24/28, 워드마크 `러브트리 · MEMORY ORBIT 4.1`(모바일은 `러브트리 4.1`), 탭 14px, 오른쪽 행동 버튼은 첫 화면 `.menuBtn`과 같은 유리 알약), 탭과 연결 보기는 항상 같은 자리(트리 없음·읽기 화면 아님이면 비활성, `flowNavigation` hidden→disabled), 안쪽 도구 줄(`.tools .ui-btn`, `header .headbtn`, `.top-actions .pill`)을 같은 알약으로(켜짐 상태는 금테). 원본 구조 무변경.
- 3차 커밋(같은 PR): 보드 '시네마 보기'를 첫 화면 1차 버튼(크림), '순간 열기'를 금테, 관계 지도 '첫 순간 보기'를 종이 위 1차(잉크)로 — 원본의 보라·네온 그라데이션 제거. 화면 전환 시 안쪽 화면이 살짝 커지며 도착하는 `lt-arrive` 모션(iframe load 때 shell.mjs가 클래스 부여, `prefers-reduced-motion`이면 없음). 컴1 `D:\PADIEM\tools\lovetree-postdeploy\postdeploy.mjs`(저장소 밖)에 `checkVisualTokens` 추가 — 5화면의 헤더 배경·높이·탭 수·금테 프레임·행동 버튼 테두리·안쪽 `--lt-stage` 토큰·안쪽 배경 계산값을 검사(`visual-*` 항목). 남은 것: 책장·보드 왼쪽 패널 등 원본 조작부 모양은 원본 질감으로 두었다(의도).

## 2026-11-01 — 4.1 공유·커뮤니티 세션 갱신

만료된 세션으로 공유·커뮤니티 요청이 401을 받으면 기록 API와 동일한 탭 간 갱신 경로로 재확인하고, 갱신 성공 시 원래 요청을 반복한다. 댓글 요청 키는 재사용한다. 공개 링크 읽기는 갱신하지 않는다. 강제 401 단위 시험과 기존 저장 시험을 검증했으며 운영 실제 만료 후 쓰기는 별도 검증으로 남긴다.

## 2026-11-01 — 4.1 첫 화면 진입

도메인만 열 때 로그인 상태와 무관하게 첫 화면을 유지한다. 계정의 최근 트리·순간은 유지하며, 직접 연 기록 주소와 로그인 복귀 주소는 계속 복원한다. 관련 시험: v41-selection-location 및 v41-home-entry.

## 2026-11-01 — #138 도메인 실제 적용
PR #139 merge fb943b22fd0b365cb6ba904443e5032991bb1a49. Pages production 4f058e50-ca43-47e7-9a3c-b07177ffa9fb가 해당 main을 배포했으며 Ubuntu/Windows/PostgreSQL/Pages 검증이 성공했다. lovetree.padiem.net CNAME→lovetree-4-0.pages.dev 한 개만 추가했고 Pages domain/verification/validation active, SSL 사용됨을 API와 COM1 Tabbit 대시보드에서 대조했다. 새 루트 302→/v41/, /api/workspace 401 JSON을 확인했다. 원래 pages.dev 4.0 루트는 유지한다.

COM2는 설치 index.js/private-media.js가 기준 4dfed247와 바이트 동일함을 SHA-256으로 먼저 확인한 뒤 두 파일과 추가 origin만 적용했다. 원복 사본 /root/lovetree-domain-backup-20261101-015712, 서비스 active/enabled 및 localhost 미인증 401·env 0600 확인. DB 스키마·회원 문서·첨부 디렉터리·다른 서비스·터널은 변경하지 않았다. 시크릿 교체 없음.

PADIEM auth runtime에는 fresh 등록부에서 lovetree-4-0의 새 callback만 추가했다. 다른 client JSON/전체 binding 종류·이름이 보존됨을 검증. 차후 배포가 callback을 지우지 않도록 ai-revenue-lab PR #6503(c3dadfb813678fefd96f4928a4f64ee33647df74)에 동일 callback 한 개를 정본 설정에도 추가했다. auth Worker 재배포는 별도 필요 없다.

실계정 Google 선택/승인 후 업로드→재로그인→삭제는 아직 완료로 표시하지 않는다. #14/#138의 체크리스트와 실제 브라우저 결과를 기준으로 후속 확인한다. 로컬/자동 시험을 실기기·스크린리더 검증으로 확대하지 않는다. 시간당 자동 작업 중지는 유지한다.

## 2026-11-01 — #138 4.1 사용자 도메인
대표 요청으로 lovetree.padiem.net을 4.1 주소로 추가한다. 같은 Pages 프로젝트와 PADIEM lovetree-4-0 클라이언트·COM2 DB/파일 저장소를 재사용한다. pages.dev 루트의 4.0과 /v41/, 기존 회원 문서는 보존한다. 새 호스트의 루트만 /v41/로 보내며 데이터 복사·회원 병합·새 DB는 없다.

공통 인증은 두 정식 callback의 닫힌 목록에서 요청 origin에 맞는 것을 선택하고 봉인된 로그인 상태에도 callback을 묶는다. 쿠키는 계속 host-only라 새 호스트에서 한 번 로그인해야 하며, 기존 호스트 세션을 읽거나 넓은 Domain 쿠키로 바꾸지 않는다. PADIEM_AUTH_CLIENTS에는 lovetree-4-0의 새 callback만 추가하고 다른 클라이언트·키·바인딩을 보존한다.

COM2 LOVETREE_PUBLIC_ORIGIN은 기존 pages.dev로 유지하고 LOVETREE_ADDITIONAL_PUBLIC_ORIGINS=https://lovetree.padiem.net을 추가한다. 업로드/삭제는 명시 허용 origin과 canonical subject를 함께 확인하고 응답 파일 URL은 요청 frontend origin으로 만든다. 기존 기록의 절대 첨부 URL은 저장값을 바꾸지 않고 두 정식 호스트에서 현재 origin의 인증 API로 읽는다. 임의 호스트·닮은 이름·미등록 preview는 허용하지 않는다. 공개 DTO는 어느 호스트든 /api/media/를 계속 제외한다. 업로드 오류의 깨진 한글도 복구했다.

검증: 대상 회귀 20 pass/0 fail, 전체 282 tests(247 pass/0 fail/기존 환경 의존 35 skip), npm ci 뒤 Vite build 성공. 최초 빌드의 vite 미설치는 npm ci로 해결했다. 새 호스트 root/구 호스트 root 분리, state의 호스트 간 재사용 거부, 두 origin 저장소 공유·잘못된 origin 차단, 이전 첨부 URL 원문 보존을 확인했다. 실제 배포/DNS/브라우저 결과는 #138·해당 PR 기록을 따른다. 실제 Google 계정 업로드→재로그인→삭제 및 실기기/스크린리더는 이 시험 통과만으로 완료 처리하지 않는다.

재사용: 현재 shared-auth.mjs의 PKCE/서버 교환/host-only cookie, private-media.js의 주체별 파일 저장소, media-preview.js/private-upload.mjs의 명시적 로드·보관 목록을 확장했다. LoveBud/리모네의 과거 인증·DB·공개 기본값은 가져오지 않는다. UI/reference 원본은 수정하지 않았다. 복구는 새 DNS/Pages 도메인 및 새 callback과 추가 origin만 회수하고 이전 배포로 되돌리며 DB·파일 디렉터리는 삭제하지 않는다. 자동 작업은 중지 유지.

## 2026-11-01 Owner 확정 — 앞으로의 개발 기준은 4.1

- **신규 기능·UI/UX 개선·운영 검수의 기본은 러브트리 4.1**이다. 현재 운영·검수 진입 주소는 https://lovetree-4-0.pages.dev/v41/ 이다.
- 첫 화면은 4.0의 SRC064·금테·카메라·'러브트리 · MEMORY ORBIT'를 재사용하고, 안쪽은 Limone Track32/59/58/56 원본 디자인과 현재 공통 메뉴/용어를 유지한다.
- **UI/UX를 최우선**으로 한다. 실제로 막히는 버튼·작성·감상·화면 이동을 내부 정리보다 먼저 해결한다.
- 4.0 UI는 기존 사용과 호환 확인을 위해 보존한다. 새 기능을 두 UI에 중복 개발하지 않는다. #65의 4.0 전용 구조 잔여를 4.1 신규 개발의 선행 조건으로 삼지 않는다.
- PADIEM 공통 인증·COM2 기록 서버/DB·도메인 검증·동기화·소유권 계약은 재사용한다. 공통 src/server 수정은 가능하지만 두 UI의 데이터/ID/parentId/links/표지와 계정 격리 보존을 확인한다. 저장소 이름 lovetree-4.0은 그대로 쓴다.
- 개발 기준 확정과 루트 주소 전환은 구분한다. 현재 루트 /의 4.0 및 기존 hash 경로를 임의로 덮어쓰지 않는다. 기본 주소/로그인 복귀 전환은 #14의 실계정 업로드→재로그인→삭제 검증과 기존 경로 호환 확인 후 별도 변경으로 처리한다.
- #14 실회원 E2E와 #44 실기기·소프트키보드·스크린리더는 미검증으로 남긴다. 4.1 채택을 이 검증의 완료 근거로 삼지 않는다. 시간당 자동 작업은 중지 상태를 유지한다.

기준 코드: main 43c25d374072f9ff048c550a30eb5d3da1d38ed6까지 구현·운영 반영. 이번 변경은 운영 방향 문서만이며 앱/라우팅/인증/DB/시크릿 변경이 아니다. 완료 이슈 정리와 남은 검수는 이슈 #1을 정본 인덱스로 본다. 아래 과거의 미구현/적용 대기 서술은 당시 이력이며 현재 실행 지시가 아니다.

---

## 2026-11-01 — #9 같은 트리 안의 이전 순간 변경

구현 SHA `defd322b59cbb9c698b29a9bc36cc739580d2145`. 순간 수정에서 일반 내용 저장, 이전 순간 변경, 관련 순간 연결을 별도 작업으로 구분했다. 시작 순간은 옮길 수 없고 후보는 같은 트리에서 자기 자신과 모든 하위 순간을 제외한다. 새 연결 이유를 함께 저장하며 선택 순간, 그 아래 가지, 양방향 links와 ID는 그대로 둔다. 저장 직전과 서버 PUT에서 기존 전체 문서 `validateState`를 다시 거쳐 단일 루트·단일 parentId·순환/고아 없음이 유지된다. revision 충돌·동일 요청 재시도·계정 격리는 기존 4.1 sync/회원 저장 경계를 재사용했고 공개 기본값·인증·DB·과금·COM2는 변경하지 않았다.

재사용 대조: Limone `dd8394c5`의 트랜잭션/트리 잠금은 행 단위 DB 모델이라 이식하지 않고, LoveTree의 전체 문서 revision+정본 검증을 유지했다. LoveBud에는 같은 부모 재배선 구현이 없어 가져오지 않았다. 삭제 회귀도 재배선 뒤 다시 확인했다. SRC064 첫 화면·금테·러브트리 · MEMORY ORBIT와 Limone Track32/59/58/56 원본 디자인은 건드리지 않았다.

검증: 재배선 후보, 루트/자기/하위/없는 부모 거부, 이유·자식·links·선택 유지, 삭제, 저장 재시도와 새 세션 재로딩을 회귀 시험으로 추가했다. 대상 42건 전부 통과. 전체 `npm run check` 253 subtests / 252 tests + 1 suite(219 pass, 0 fail, 기존 환경 의존 33 skip), Vite build와 diff check 통과. COM1 공식 Tabbit 격리 fixture의 PC/390px에서 A→C 이동, 기억책·보드·관계 지도 반영, 후보 A/B 제외, 390px 가로 넘침 0, 44px 버튼, 분리된 재배선/관련 연결 UI와 페이지 오류 0을 확인하고 스크린샷을 직접 점검했다. 실제 Google 회원·실기기·소프트키보드·스크린리더 E2E는 미검증이며 완료 근거로 확대하지 않는다. PR #125 head `269d4b58942125cac0e2797607a1e17315b50812`, merge `5aaea6263f45cca8d60b80e803a5a1e0775a8595`. PR Check `41226325613`과 merge 후 Check `41226397605`의 Ubuntu/Windows/PostgreSQL이 모두 성공했다. Cloudflare Pages production `508b7e84-8952-422e-b6a7-e67976eba77a`가 main `5aaea62`를 배포했다. 운영 `/v41/`에서 domain/shell/index 200, 재배선 marker, PC/390px 첫 화면·금테·러브트리 · MEMORY ORBIT·가로 넘침/페이지 오류 0을 재확인했다.

## 2026-11-01 — #10 빠른 순간 작성 UX

작성 시작의 필수 입력을 줄였다. 새 트리는 좋아하는 대상만 계속 필수이며, 순간은 제목·마음·링크/첨부 중 하나만 있으면 저장된다. 제목을 비우면 마음 첫 줄(40자 제한), 사진/영상 파일명, 링크 호스트 순으로 기존 title 필드에 안전한 표시 제목을 만들므로 스키마·ID·parentId·links·회원 격리는 바꾸지 않는다. 빈 순간은 계속 차단한다. 새 트리는 대상, 추가/수정은 마음 입력에 첫 초점을 두고 현재 순간 문맥과 자동 제목 안내를 표시한다. #36의 미저장 확인·저장 실패 재시도·중복 저장 방지와 #40의 첫 저장 안내, #14의 비공개 첨부 URL 흐름을 그대로 재사용했다. 공개 기본값·과금·인증·DB·COM2는 변경하지 않았다.

회귀: note-only/link-only 제목 생성, 완전 빈 입력 차단, 저장 왕복, 첫 순간→사진 링크 순간의 parentId/treeId 보존을 추가. npm run check 251 subtests(217 pass, 0 fail, 기존 환경 의존 33 skip + suite), Vite build·shell 구문·diff check 통과. COM1 공식 Tabbit 격리 fixture에서 PC 저장 503→재시도, 빈 입력 오류, 사진 URL 자동 제목, 부모 보존, 작성 취소 확인을 검증했다. 390×844에서는 새 트리의 대상만 required, 제목/마음 선택, note-only 첫 저장 뒤 추가 창의 마음 초점, 390px 가로 넘침 없음, 44px 저장 버튼, 자동 제목 안내를 확인하고 스크린샷을 직접 점검했다. 실제 Google 회원·실기기·소프트키보드·스크린리더 E2E는 미검증이며 성공으로 확대하지 않는다. 운영 PR/SHA/Pages 배포 결과는 #10과 해당 PR에 기록한다.

## 2026-11-01 — #14 회원 사진·영상 비공개 업로드
기존 url 필드에 같은 Pages origin의 /api/media/<UUID>.<ext>를 저장한다. 스키마·ID·parentId/links·기존 외부 링크는 변경하지 않는다. 작성창에서 사진/영상 선택 → 파일 보관 → 미리보기 → 순간 저장을 구분한다. 파일만 올린 뒤 취소하면 보관 목록에 남아 다시 첨부하거나 삭제할 수 있다. 순간/트리 삭제는 파일을 자동 삭제하지 않는다. 명시적 파일 삭제는 사용 중인 순간 수와 복구 불가 경고를 확인하며, 글/연결은 남고 해당 파일 링크는 404가 된다. JSON 내보내기는 URL만 보존하고 첨부 바이트를 포함하지 않는다.

COM2 단일 Node 프로세스의 전용 StateDirectory(/var/lib/lovetree-api/media), 계정·제품 해시 디렉터리(0700), 원자적으로 확정하는 파일(0600)을 사용. 기존 PADIEM authenticate/parsePrincipal로 매 요청 확인하며 다른 계정/제품은 읽지 못한다. 쓰기·삭제는 공개 origin과 expected canonical subject 헤더를 검사한다. UUID 재시도는 같은 파일만 재사용, 다른 내용은 409. JPG/PNG/GIF/WebP 4MiB, MP4/WebM 8MiB; MIME+시그니처 검사(백신/완전한 미디어 디코더 검증은 아님). 계정당 100MiB/200개, 소유자별 직렬 quota 검사. 멀티 프로세스/공유 파일시스템으로 확장하려면 저장소 잠금/용량 계약을 먼저 교체해야 한다. SVG/HTML/임의 경로/서버 URL 수집·공개 공유 없음. private,no-store/nosniff. 삭제·목록·파일 GET/POST만 닫힌 Pages 프록시에 추가, 8MiB 응답 상한 유지, 미디어는 본문 완료까지 60초·실제 취소. 기존 workspace 한도/15초 프록시는 유지.

운영: systemd StateDirectory와 LOVETREE_MEDIA_DIR을 함께 설치하고 Node를 재시작한다. 기존 .env/인증/DB/터널을 바꾸지 않는다. DB 백업만으로 미디어는 복구되지 않으므로 파일 디렉터리도 별도로 백업/복원해야 한다(현재 자동 백업 작업 추가 없음). 코드 롤백 때 디렉터리는 삭제하지 않는다. 자동 purge/공개 링크/계정 전체 삭제 정책은 추가하지 않았다.

재사용 대조: LoveBud b80647f1 js/utils/media.js의 URL 판별은 기존 #122를 유지. 같은 SHA functions/_shared/private-storage-entitlement-neon.js는 Firebase+Neon의 유료 비공개 권한 경계라 이식하지 않음. 리모네 dd8394c5 app/components/MomentComposerModal.tsx는 sourceUrl 입력/저장 흐름이며 실제 비공개 업로드 서버로 간주하지 않는다. 현재 PADIEM 신원·Pages 고정 목적지 프록시·4.1 작성/보관 URL 계약을 재사용해 부족한 파일 저장 경계만 추가했다.

격리 검증: 저장·재시작 복원·A/B/제품 격리·소유자 삭제·같은 요청 재생·다른 파일 409·동시 quota·형식/크기/경로·변조 파일·origin/subject 검사·실제 Node/프록시 바이너리 왕복·8MiB 초과 413·클라이언트 취소를 신규 7시험에서 확인. 전체 248 tests: 215 pass/0 fail/33 기존 환경 의존 skip, build 통과. COM1 Tabbit 1280/390px: 사진 760px/영상 2초(자동재생 안 함), 파일 URL 저장→새로고침·동일 순간 ID 복원, 부모 연결 보존, 목록/삭제·A/B 격리, 가로 넘침/페이지 오류 0. 인증은 격리 A/B를 쓰고 workspace 저장은 메모리 repo이므로 실제 운영 Google/PG 저장 E2E로 확대하지 않는다. 운영 배포/확인 결과는 PR과 이슈에 별도로 기록한다. 실기기·스크린리더는 미검증.

## 2026-10-31 — 공통 세션 갱신 대기 종료와 이전 판정 정정

COM1 Tabbit 운영 재현: GET /api/workspace 401(149ms) → 재확인 401(42ms) → POST /auth/refresh **204 성공**(858ms) → GET /api/workspace **200**(748ms). 같은 204 요청에 Tabbit가 ERR_ABORTED 이벤트도 기록했지만 앱은 갱신을 성공 처리하고 회원 문서를 읽었다. 그 이벤트만으로 갱신 실패라고 했던 앞선 보고는 정정한다. 새로고침 후에도 GET 200(254ms), source=server를 확인. PUT 0. 앞서 관찰한 다른 502까지 정상 응답으로 재분류하는 것은 아니다.

실제 결함: 4.0 src/sync.js와 4.1 api.mjs는 fetch AbortController를 쓰면서 Web Locks 대기에는 signal을 넘기지 않았다. 다른 탭의 refresh 잠금 뒤에 줄 서 있으면 8초가 지나도 API가 끝나지 않을 수 있었다. 같은 signal을 잠금 요청에도 전달해 시간 초과 때 대기열에서 빠지게 했다. 잠금을 얻기 전 갱신/재전송은 실행하지 않는다. 정상 갱신·인증 판단·저장 요청 키·기존 제한시간은 유지.

회귀 2건은 수정 전 둘 다 무한 대기 watchdog 실패, 수정 후 timeout으로 종료. 기존 다중 탭 시험도 올바른 state(version:1) 문서와 ok=true 검증으로 보강(503이어도 통과하던 느슨한 조건 제거). npm run check 236건 중 203 pass/0 fail/33 기존 서버 의존 skip, build 통과. 공통 신원기관/Cloudflare 설정/DB/사용자 기록은 변경하지 않았고 새 Google OAuth·저장/로그아웃 E2E 성공으로 확대하지 않는다.

## 2026-10-31 — 보기 메뉴·동작 이름 정리

버튼이 아닌 '이 트리 보기' 설명을 제거. 선택한 트리가 있으면 책장에서도 세 보기 탭을 유지하고, 없으면 숨기는 대신 비활성/이유 표시. 하단 중복 문맥은 '선택한 트리 + 제목 + 예시 여부' 한 줄로 줄임. 우측 '내 기록'은 '트리 선택', '이어서 기록하기'는 '순간 추가'로 기능을 명시하고 작성창 제목도 맞춤. 트리 선택 패널은 트리 목록을 먼저, 계정 불러오기를 다음에 배치. 새로운 게스트 비밀번호/인증 우회는 추가하지 않음. 회원 검수는 격리 fixture이며 실제 로그인 E2E와 구분.

## 2026-10-31 — 첫 화면 원래 워드마크 복원

대표 선호에 따라 SRC064 왼쪽 위의 기존 '러브트리 · MEMORY ORBIT' 워드마크/크기/자간/배치를 복원. 첫 화면에 공통 새싹 로고를 복제하던 4.1 어댑터만 제거. 안쪽 화면 공통 로고·서체·트리/선택 문맥은 유지하며 원본/카메라/인증/저장은 무변경. 첫 화면은 공통 로고 규칙의 의도적 예외다.

## 2026-10-31 — 4.1 브랜드·서체·화면 이동의 연속성

대표 요청: 첫 화면과 보드 전환의 위화감, 화면마다 다른 글꼴과 러브트리/LOVETREE/LOVE TREE 중복을 정리. 서비스 표시는 **러브트리 4.1** 한 곳으로 통일. 첫 화면의 SRC064 갤러리/금테/카메라는 그대로 쓰고 4.1 어댑터에서 공통 로고를 재사용. 안쪽 원본 화면은 브랜드를 반복하지 않고 도구만 유지한다. 공통 상단에는 예시/내 트리 구분, 트리 제목, 현재 보기, 선택 순간을 계속 표시하며 선택 변경도 따라간다.

Pretendard Variable은 로고·메뉴·조작·설명의 공통 글꼴, MaruBuri는 책/기록 제목과 기억책 감상 본문. 이미 배포한 public/fonts 정식 자산·라이선스를 재사용하고 identity.css를 회원/예시 네 화면과 첫 화면에 적용. 원본의 책장/종이/보드/관계망 배경과 구성은 유지. 이미지·reference 원본·사용자 제목/본문/ID·저장 형식·4.0 src·인증/DB는 변경하지 않는다. 앱이 만든 혼합 장식 문구 'LOVE 순간 TREE' 등만 정정.

기존 home-actions 및 shell의 예시 열기 경로를 재사용: 회원 첫 화면의 예시 보드 요청도 예시 기억책과 같은 명시 경로로 처리. 회원 순간 선택을 예시 ID로 바꾸지 않는 회귀 시험 1건 추가.

검증: npm run check 234건(201 pass, 0 fail, 기존 서버 의존 33 skip), build 통과. COM1 Tabbit 1280/390px에서 첫 화면→기억책→보드·관계 지도·책장 왕복, UI/감상 글꼴 실제 로드, 중복 로고 숨김, 가로 넘침 0, 선택과 문맥 유지. 회원 fixture의 영어 브랜드 포함 제목은 원문 그대로 표시, PUT 0. 실제 회원 로그인·저장 E2E/실기기/스크린리더는 이 UI 조각의 완료 근거에 포함하지 않음.

## 2026-10-31 — 4.1 책장·기억책 읽기와 보드 조작명

Track32 책 표지/레일과 Track59 종이/펼침책을 유지하며 어댑터에만 보완. 책장은 소개 높이를 줄여 목록을 먼저 보이게 하고, 모바일 장식 무대를 접음. 기억책의 메모/편지/링크 제목은 한 번만 표시. 모바일은 종이 내부 스크롤을 없애 문서 스크롤로 읽고, 넘김 뒤 페이지 위로 복귀. 장식 binding-light의 포인터 가로채기를 해제. 목차의 Esc 닫기·초점 복귀와 닫힌 패널 inert를 추가. 보드/시네마의 이전·다음·일시정지 등 조작명을 한글로 통일. 회원/예시 템플릿에 같은 보완을 적용.

격리 Tabbit 검증: 1280/390px, 긴 본문, 제목 단일 표시, 종이 내부 scrollTop=0/문서 스크롤, 다음 페이지 상단 복귀, 목차 Enter/Esc/닫기 초점, 시네마 재생·정지·이전·다음·처음부터, 서버 PUT 0. npm run check 233건(200 pass, 0 fail, 33 서버 의존 skip), build 통과.

백업 버튼의 실제 생성 Blob을 격리 fixture의 검증된 정본과 비교: 2트리·7순간의 본문/url/id/parentId/links 보존. 그 바이트를 시험 파일로 만들어 파일 입력으로 다시 열어 source=file·책장 2권·기억책 표시, PUT 0 확인. 브라우저의 네이티브 다운로드 완료/파일 저장 위치는 자동화 연결에서 확인하지 못함. 따라서 다운로드 완료 검증으로 확대하지 않음. 이 파일 열기는 메모리 읽기이며 서버 복원/덮어쓰기 기능이 아님.

#65는 기존 4.0 src/*의 공통 shell·저장 소유권 잔여다. 4.1은 이미 public/v41/shell.mjs와 member-session.mjs가 전환/선택/회원 저장을 소유한다. 이번 UI 조각은 4.0 구조 완료 또는 #65 해결로 취급하지 않는다. 실기기·소프트키보드·스크린리더·새 Google 로그인/회원 저장·로그아웃 E2E는 미검증 유지. 운영 인증/DB/4.0/reference 원본은 변경하지 않음.

## 2026-10-31 — 모바일 보드 너비 변경 뒤 읽기 배율 유지

운영 검수에서 좁은 너비끼리 변경할 때 원본 resize의 fitAll이 선택 카드 배율을 덮는 것을 추가 발견. 기존 resize 뒤에 모바일 선택 카드 재중심을 실행해 첫 진입과 같은 읽기 크기를 유지. PC·시네마 재생 중 동작은 그대로.

## 2026-10-31 — 4.1 관계 지도 데이터·모바일 읽기 보완

Track58의 focusBoardMoment/상세 보기와 Track56의 selectMoment/전체 조망을 재사용. 모바일 보드는 선택 카드를 1배로 열고 이름 선택·순간 읽기를 제공. 관계 지도에는 실제 순간이 있는 그룹만 만들며, 회원/예시 모두 정본 연결 목록을 표시하고 이름 선택에서 기억책까지 이어짐. 공통 mobile-moments.js는 DOM 텍스트로 이름을 표시하며 PC에서는 숨김. 1/8/40개 경계와 실제 부모·관련 연결을 브라우저로 확인. 원본 reference·첫 화면·회원 저장/인증/DB는 변경하지 않음.

## 2026-10-31 — 4.1 버튼 동선·페이지 UI 감사

운영 자산을 COM1 Tabbit의 격리 시험 문서로 검수. 실제 회원 저장/로그아웃은 호출하지 않음. 다섯 화면의 이동·목차·연결·필터·감상·시네마·작성/수정 검증과 화면별 문제/한계를 docs/QA_V41_UI_20261031.md에 기록. 우선순위는 관계 지도 빈 그룹 제거, 모바일 보드 읽기 배율, 모바일 관계 지도 선택 설명. 제품 코드 수정은 이번 문서에 포함하지 않음.

## 2026-10-31 — 4.1 전체 화면 용어 정리

첫 화면·책장·기억책·기억 보드·관계 지도·작성창의 UI 표기를 PRODUCT 기준으로 정리. Moment/챕터는 순간, WHY NEXT는 연결 이유, 화면 명칭과 행동을 구분. 데이터 필드/ID/함수명·회원 제목/본문·4.0 화면·원본 reference는 보존. 로그인 알림의 표시 여부는 보류 지시를 유지.

## 2026-10-31 — 4.1 책장부터 읽기까지 한 경로로

불러온 모든 트리를 책장에 표시하고 선택한 트리/순간을 shell에서 검증. Track32 표지 전환 후 Track59 기억책으로 바로 이동(기존 4.0 shelf.js 연결 방식 재사용). 첫 화면/내 책장 용어 통일, 읽는 중에만 같은 트리의 기억책·보드·관계 지도 전환 표시. 새 트리 작성 후 해당 순간 읽기로 연결. 원본 reference/CSS·서버·인증·기록 스키마 불변. 로그인 알림 수정은 Owner 지시로 보류.

## 2026-10-31 — 4.1 로그인 후 첫 화면 구도 보존

첫 화면은 회원 기록 수와 관계없이 원래 금테 예시 갤러리를 유지. 회원 이어보기·책장은 실제 선택으로 이동하고 예시 감상은 회원 선택을 바꾸지 않음. 예시 기억책은 명시적 감상 행동에서만 전환. 회원 문서/인증/DB 저장 변경 없음.

## 2026-10-31 — 4.1 첫 화면 전체 화면 구도 복구

4.1 공통 헤더가 첫 화면 높이를 PC 68px/390px 106px 줄이던 차이를 제거. 첫 화면만 헤더를 숨기고 기존 4.0 topbar의 authHtml 자리에 로그인/계정 행동을 연결한다. 다른 네 화면과 빈 기록 화면은 공통 메뉴를 유지. 기존 공통 인증/저장 계약은 그대로다.

## 2026-10-31 — 4.1 첫 화면/로그인 복귀 정정

- 첫 화면은 v41/home.html에서 현재 4.0 mountOrbit를 직접 재사용(금테·깊이 카메라·멈춤·팝업·폰트). 순간 선택/감상/작성만 4.1 행동으로 연결. 4.0 기본 동작은 유지.
- #103의 next=/v41/?account=1은 공통 인증의 경로 전용 검사에 걸려 /로 복귀했음. next=/v41/ + 공유 세션 marker로 서버 기록 자동 확인. marker가 인증 권한을 주지 않으며 서버 확인·계정 바인딩은 그대로.
- 연결 보기에 실제 이전/다음/관련 순간과 이유 표시. 4.0 카드의 ID·제목·연결을 4.1 예시와 대조하는 회귀 및 실제 공유 callback 복귀 회귀 추가. 공통 인증/DB/COM2 설정 변경 없음.
- 실제 Google 계정 로그인 후 운영 저장/복원/로그아웃은 미검증.

## 4.1 completed design promotion — 2026-10-31

## 2026-10-31 — 4.1 회원 기록 편집

- public/v41/member-session.mjs: 기존 domain/sync 규칙 재사용. 새 트리·이어쓰기·수정·삭제·관련 연결 및 revision 저장. 예시/파일은 업로드하지 않음.
- 실패 시 메모리 보존·재시도·충돌 선택·JSON 백업·이탈 경고. GET features=bound-writes capability가 없으면 편집 금지; PUT expectedSubject는 검증된 현재 주체와 일치할 때만 저장. 기존 4.0 계약/DB 변경 없음.
- 검증: npm run check 221건 중 188 pass, fail 0, 기존 서버 의존 skip 33. 신규 회귀 7건. PC/390px 작성·이어쓰기·수정 및 실제 제목/연결 표시 브라우저 확인. 실회원 Google 왕복과 실기기 터치는 미검증.
- COM2 server/http.js 배포도 필요. 기존 설치 해시 일치 확인 후 단일 파일 백업/교체/재시작; 인증 설정·DB·터널은 유지.


Promoted the exact forty-moment/forty-two-edge Limone demonstration (comparison source bcebf09dce72c30c09cd71658f4f8ee536a399ec) into the default /v41/ example view. Original five adapters are isolated under public/v41/design; account and file records continue through validated reader adapters and existing same-origin auth/API. The demo graph is not coerced into the member single-parent model and is never sent to the server. No new ChatGPT Site, database/auth configuration or 4.0 UI changes.

## 4.1 UI correction — 2026-10-31

Replaced the development toolbar with a compact shared header and full remaining viewport for all five Limone-derived views. Record loading/import and actual-edge navigation now live in modal panels. A 12-moment example with artwork reused from the original comparison sample opens on entry; its media is never applied to server/file records, even for matching IDs. Server API/auth contracts and member data remain unchanged. Mobile board tools/details no longer cover the canvas on entry; network overview now renders actual parent/related edges and fits the data at both widths.

## 4.1 same-origin reader preparation — 2026-10-31

Added isolated public/v41 assets from the Limone comparison Site (source 8ea4122e5f6095b1188336a9f92939a46868348f) with current 4.0 workspace API and domain validation reused. /v41/ uses existing /auth/login?next=/v41/, GET /api/workspace and POST /auth/logout on the same origin. No PUT, migration, auth policy or backend config changes. Login/account boundary clears imported records before each server read; stale reads cannot restore records after logout. Static demonstration images were removed from the text-only record reader. Imported record rendering and common auth browser roundtrip still require final browser validation before merge/deployment.

## 하단 저장 상태 줄 제거 — 2026-10-30
정상 상태 줄을 없애고 저장 실패 시에만 재시도 안내를 잠깐 표시한다. 비로그인 저장 시 상단 로그인 버튼을 안내하며 미저장 종료 경고는 유지한다. 운영 브라우저 확인은 배포 뒤 필요하다.

## 로그인 사용자 서버 저장 — 2026-10-30

기기 기록 경로를 제거하고 기존 브라우저 기록은 읽지 않는다. 로그인한 화면에서 서버에 저장하며 실패는 미저장으로 알린다. 실패한 입력은 화면 메모리에만 있으며 닫기 전 경고한다. 로컬 테스트 169 pass / 33 skip, 빌드 통과. 운영 UI 확인은 배포 후 필요하다.

## 로그인 초기 확인 표시 — 2026-10-30

세션 확인 전에는 상단 로그인 버튼 자리를 유지하고 숨긴다. 확인 뒤 로그인·로그아웃을 표시한다. 저장·인증 계약은 변경하지 않았다. npm test와 빌드 통과(서버 의존 33건 별도).

AD

## 기억책 모바일 페이지 이동 UX — 2026-10-29

main `2ee507f` 위에서 별도 worktree·브랜치로 진행했다. `src/views/book.js`만 고쳤고(그림자 안 기억책 전용 CSS 포함) `styles.css`·`sync.js`·orbit·shelf는 건드리지 않았다. 리모네 Track59 원본의 읽기 UI(책 아래 알약 `.nav-pill`: 이전/다음·페이지 표시)를 재사용했다.

- 390px에서 이전/다음이 긴 본문 아래 절대 위치에 있어 넘기려면 본문 끝까지 내려가야 했다. ≤820px에서 `.nav-pill`을 `position:sticky; bottom:0`으로 바꿔 읽는 동안 시점 하단에 붙인다. 짧은 기록은 책 바로 아래 흐름 위치에 있고 긴 기록에서는 하단에 고정되며, 문서 끝에서는 흐름에 안착해 마지막 내용을 가리지 않는다. 안전 영역(`env(safe-area-inset-bottom)`) 패딩을 더했다.
- 페이지를 넘길 때(이전/다음·목차·가지·관련 칩·방향키) 모바일에서는 책 상단으로 돌아가 새 페이지의 처음부터 읽게 했다. 데스크톱(>820px)은 절대 위치·동작 그대로다.
- 알약 z-index를 auto로 낮춰 저장·동기화 안내 `#toast`(z 9999)가 위에 그려지게 했다. 대화상자(목차·기록 폼)는 최상위 레이어라 영향이 없고, 동기화 안내 바는 모바일에서 문서 상단에 있어 겹치지 않는다. #84(44px 터치 대상)·#85(선택·읽던 위치 유지)의 로직·주소·저장 형식은 그대로다.
- 검증(로컬 4491, Playwright 390x844 hasTouch·1280x900, 시드 트리 2권): 25항목 통과 — 긴 본문(480자) 열람 중 알약 하단 고정·가시, 넘김 뒤 책 상단 정렬(stage.top 0), 목차 top-layer·이동, 책장 왕복·새로고침 뒤 4/7 유지, toast가 알약 위에 그려짐(z 9999>auto), 동기화 바 미겹침, 방향키 4→5→4, 터치 대상 44px, 390px 가로 넘침 0, 문서 끝 흐름 안착, 짧은 기록 다음 비활성, 예시 기억책 동작, 데스크톱 절대 위치·scrollY 0, 콘솔 오류 0(로컬 preview `/api/workspace` 404는 서버 미구동 조건). `npm test` 192개(159 pass·33 skip은 기존 서버 의존)·`npm run build` 통과. 스크린샷·검증 스크립트는 커밋하지 않았다.
- 남은 것: 실기기 터치 확인. 가로 스와이프 넘김(원본 Track59에 있으나 미이식)은 후보.

## 화면 간 선택·읽던 위치 유지 — 2026-10-29

main `cf2faea` 위에서 별도 worktree·브랜치로 진행했다. `src/main.js`·`src/views/memory.js`·`src/views/book.js`·`src/views/contract.js`(주석)·`docs/VIEW_CONTRACT.md`·테스트 1개만 고쳤고 `styles.css`·`sync.js`·orbit은 건드리지 않았다.

- 재현한 불일치 두 가지를 고쳤다. ① 트리에서 고른 순간은 새로고침하면 사라지고 첫 순간으로 돌아갔다(기억책의 읽던 위치와 불일치). ② 기억책에서 페이지를 넘긴 뒤 뒤로가기하면 트리는 진입 시 선택에 머물렀다.
- 역할 정리: 주소는 화면·트리를 소유하고(변경 없음), `selectedId`가 앱의 현재 순간 선택이다. 기억책은 페이지를 넘길 때 `actions.selectMoment`으로 그 선택을 보고하고(읽기 전용 제외), 트리 화면은 렌더 때 선택을 읽던 위치에 기록한다. 시작할 때 선택이 비어 있으면 `memory.js` `lastRead`(이 트리의 읽던 위치)부터 복원하고 없으면 첫 순간으로 둔다. 책장 선택·기억책 resume의 기존 동작은 그대로고 저장 형식·주소 형식 변경은 없다.
- 제외: 공통 shell·새 화면·선택 소유권 일원화(계약 문서의 '다음 조각'), 책장 back-link 선택(자연 경로에서 재현되지 않아 보존).
- 검증: `npm run check` 테스트 192개(lastRead 회귀 3개 포함)·0 fail·빌드 성공. 브라우저 12항목 통과(로컬 preview 4176): 새로고침 복원, 기억책 페이지↔트리 선택 일치(뒤로가기·앞으로가기), 기존 경로 회귀(선택 순간으로 기억책 열기·보기 전환·책장 '다시 펼칠 순간'·다른 트리 첫 방문은 첫 순간·데모는 선택 미변경), 콘솔 오류 0.
- 남은 것: 실기기 터치 미검증. 책장 back-link의 간접 경로 불일치 가능성은 관찰 사항으로 남긴다(재현 조건이 흔들려 이번 범위 제외).

## #43 트리 상세·기억책 반복 본문·보조 글자 정리 — 2026-10-29

main `98be779` 위에서 별도 worktree·브랜치로 진행했다. `src/main.js`·`src/styles.css`·`src/views/book.js`만 고쳤고 orbit·인증·서버·구조 스택(#70/#72/#74)은 건드리지 않았다. 이전 세션이 남긴 미커밋 변경의 의도(diff·문법·중복 적용)를 확인해 그대로 보존했고, 남았던 기억책 검증을 이어서 끝냈다.

- 트리 상세: 이미지 없는 순간의 인용 카드(`.detail-quote`)를 없애 같은 메모가 본문에 한 번만 나오게 했다(기록 데이터는 그대로다). 본문 12→14px, 날짜 9→11px, 연결 노트·키퍼 보조 글자를 함께 올렸다. 행동 버튼(`이 순간에서 이어가기`·순간 수정·삭제)을 연결 노트 바로 아래로 옮겼다 — 실측상 액션 블록은 패널 상단에서 536px 지점(인계 기록 기준 이전에는 1036px대 최하단), 기록 본문과의 갭 173px.
- 기억책: 이미지 없는 기록의 표지 카드가 제목을 반복하지 않고 감정만 표시한다. 제목은 아래 `h1.memory-title` 한 곳에만 있어 대상·기록 식별은 그대로다. meta 12→13px, 연결 사유 보조 글자 12px.
- 검증: `npm run check` 테스트 141 pass·빌드 성공. 브라우저 실측(로컬 preview 4173, 긴 제목·본문 픽스처 2순간) 37항목 전부 통과 — 인용 카드 0·본문 1회·본문 14px·날짜 11px·액션 위치·가로 넘침 0(PC 1280·390)·표지 감정=meta 감정·제목 h1 1회·meta 13px·페이지 이동·목차(현재 위치·점프·닫기 초점 복귀)·기억책↔트리 선택 유지·읽던 위치 복귀·수정창 Esc 취소 시 입력 유지와 버튼 초점 복귀(상세·기억책)·삭제 확인 1회·취소 보존. 콘솔 오류 0(로컬 preview의 `/api/workspace` 404는 서버 API 미구동일 때의 정상 탐색 실패다). 전후 캡처 8장과 재검증 4장은 컴1 기준 폴더 `.zwork/detail-book-shots`(저장소 미포함).
- 남은 것: 실기기 터치 미검증. 병합·운영 배포는 별도 단계.

## #65 화면 등록·전환 책임 분리(3) — 2026-10-28

`#72 dd1173b` 위 별도 브랜치. `render()`의 if/else 사슬을 화면 등록표로 바꿔, 경로 해석과 mount/dispose 호출을 한 자리에서 처리한다. hash 주소·뒤로가기·선택 유지·readOnly·행동은 그대로다.

- `src/views/registry.js`의 `createScreenRegistry([{id, matches(route) | fallback: true, activate()}])`. 먼저 선언된 화면이 이기고(기존 if/else 순서 보존: shelf → workspace → book → 대체 workspace → orbit), **대체 화면은 `fallback: true` 표시로 하나만** 두며 받지 못한 경로는 모두 그 화면으로 간다. `matches` 술어의 전칭성을 표본으로 검사하지 않는다 — 누락은 표시로 막는다. `activate()`가 돌려준 dispose를 `disposeView`로 쓴다.
- `src/main.js`의 `render()`만 바뀌었다. `#app`에 새 `#main`을 만들어 mount하는 두 줄 패턴은 `mountShadow()` 하나로 모았다. 세 화면 모듈·`lifecycle.js`·`contract.js`는 건드리지 않았다.
- 선택/저장 주인 통합과 공통 shell은 이번 범위가 아니다(다음 조각).
- 검증: `tests/screen-registry.test.mjs` 4건, `npm run check` 152 tests / 122 pass. 브라우저 왕복 3랩: **화면을 떠날 때마다 이전 dispose(abort)가 정확히 1회**(3랩 9회), 살아 있는 document/window 리스너 증가 0, 궤도 이탈 후 프레임 루프 0, `#main`·shadow root 각 1개, 뒤로가기 복원, 예시 readOnly 경로 유지, 390px 넘침 0, 콘솔 오류 0.

## #65 화면 문맥·행동 계약 통일(2) — 2026-10-28

`#70 71f13d3`(생명주기 계약) 위 별도 브랜치. 궤도·책장·기억책이 같은 모양으로 입력을 받고 같은 통로로만 바깥에 알리게 했다. 외형·URL·저장 형식·새 화면은 바꾸지 않았다.

- `src/views/contract.js`의 `viewContext({treeId, momentId, readOnly})`가 고정(freeze) 문맥을 만든다. 궤도의 `example`과 기억책의 `demo`는 `readOnly` 하나로 수렴했고(값 동일), 책장은 선택 시작값만 `context.treeId`로 받는다.
- 행동은 `actions` 하나로 모았다: `navigate('home'|'trees')`, `openBook(treeId, momentId, readOnly)`, `openWorkspace(...)`, `requestMoment('new'|'add'|'edit', id)`, `library(action, id)`. `src/main.js`에서는 mount 세 곳과 열기 도우미 인자 이름만 바뀌었고 기존 콜백 매핑을 그대로 옮겼다 — 동작 변화 없음.
- 기억책에서 '내 트리'로 갈 때 그 트리가 선택되는 동작은 `navigate('trees')`의 화면별 구현으로 남겼다(공통 navigate가 다른 화면에 부작용을 만들지 않게).
- 검증: `npm run check` 148 tests / 118 pass, 브라우저에서 세 화면의 13개 행동(새 트리·내 트리·기억책·연결 보기·처음으로·이어가기·수정·예시 읽기 전용 경로)과 책장 library(백업 다운로드·삭제 확인·새 트리) 확인. 390px 가로 넘침 0.

## #65 화면 연결 방식 정리(1) — 2026-10-28

`#64 b30029b` 위 별도 worktree·브랜치. `#66` 로드맵의 "B. 화면 연결 기반" 첫 조각으로, 외형·문구·동작·주소 변화 없이 세 화면의 생명주기만 통일했다.

- `src/views/lifecycle.js`의 `createView(host)`가 shadow root·AbortController·정리 목록을 한 자리에서 만든다. `dispose()`는 멱등이고 등록의 역순으로 정리하며, 정리 하나가 던져도 나머지를 계속한다. **mount는 새 host에만** 한다(한 host에 shadow root는 하나) — 이전 화면 dispose와 새 host 준비는 호출자가 맡는다. 세 화면의 dispose는 모두 이 계약을 따른다.
- 궤도는 RAF·dialog를, 책장은 ResizeObserver를 `track()`으로 넘기고, 기억책은 shadow root 이벤트와 **목차 dialog의 close 콜백**에도 `{signal}`을 붙였다(정리가 먼저 리스너를 끊고 dialog를 닫으므로 이전 opener로 초점을 돌려주는 콜백이 남지 않는다). `src/main.js`는 건드리지 않았다.
- 리모네 `TreeViewShell`/`ViewSwitcher`(같은 트리의 여러 보기, `?moment=`로 선택 유지, `isOwner` 게이트)와 4.0 세 화면 비교표·최소 계약은 `docs/VIEW_CONTRACT.md`에 있다. 문맥(`treeId`·`momentId`·`readOnly`)과 행동 콜백 수렴은 다음 조각.
- 검증: `tests/view-contract.test.mjs` 6건, `npm run check`, 브라우저 화면 순회에서 프레임 루프가 남지 않는지(rAF 계수) 확인.


## 구조 스택 통합(#70→#72→#74 → main 4aab220) — 2026-10-29

- `ai/com1-screen-registry-20261028-141624`(= #70 `ae64b94`·`71f13d3` → #72 `7912765`·`dd1173b` → #74 `bc93145`·`9bca923` 전체 포함)를 main `4aab220` 위 브랜치로 merge해 통합했다. main에 이미 들어간 스택 조각은 없었고(merge-base `b30029b`), 빠진 6커밋 전부가 이번에 들어왔다.
- 충돌 4파일 해결: `render()`는 스택의 화면 등록표 구조를 채택하고 세 그림자 화면 마운트에 #78 로그인 진입(`authHtml:authEntry(...)` — shelf ghost·book ui-btn·orbit menuBtn)을 얹었다. 뷰 3개는 스택의 context/actions·createView 계약에 `authHtml` 인자만 추가했다. #79 카메라 코드와 #80 상세/기억책 렌더는 diff상 한 줄도 바뀌지 않았다(정적 확인). `styles.css`·`sync.js`·`index.html`은 만지지 않았다(COM2 #81 범위 보호).
- 범위 제한: lifecycle·context/actions·registry 통합만 했다. 선택/저장 소유권 통합과 공통 shell은 추가하지 않았다(스택 문서의 '다음 조각' 그대로 남김).
- 검증: `npm run check` 테스트 189개(스택 신규 15개 포함)·0 fail·빌드 성공. 브라우저 33항목 통과(로컬 preview 4175): 화면 왕복(orbit→shelf→tree→book)·뒤로가기 5단계·앞으로가기 3단계 복귀와 트리 선택 유지·예시 3화면 읽기 전용·네 화면 로그인 진입 클릭→`/auth/login?next=/`·왕복 2랩에서 host 1개·열린 dialog 0·콘솔 오류 0(로컬 preview `/api/workspace` 404는 서버 API 미구동 시 정상). #79 마우스 반응 실측(카드 변형 변화) 확인.
- 남은 것: PR 병합은 Owner 검수 후. 개별 PR #70·#72·#74는 이 통합이 병합되면 정리 대상.
## 운영 연결 진행 — 2026-10-28 (COM1)

PADIEM 공통 인증과 러브트리 저장 API를 잇는 운영 작업의 실제 상태. 값·주소 기준은 아래 항목과 ai-revenue-lab main이다.

- **identity Worker 재배포 완료**: ai-revenue-lab #5963(코드 pin에 lovetree-4-0 추가) 병합 후 b54 게이트로 exact main `ee4499805` 재배포 성공(3잡 success). pin+배포 설정 `{b62, b54-padiem-claw, lovetree-4-0}` 일치.
- **인증 스택 main 반영**: #5965·#5977·#5984·#5988이 각자의 base 사이드 브랜치로 병합되는 실수가 있었고, 스택 끝 브랜치→main 복구 PR #6070(`309a6f3`)으로 반영했다. force push 없음.
- **migration 재번호 073→076**: main에 이미 적용된 `073_pc_device_link_pause`와 #5984의 `073_lovetree_login_handoff`가 서수로 겹쳐 유일성 검사가 실패했다. production 장부는 건드리지 않고 러브트리 쪽 파일·참조를 076으로 옮겼다. b62-d1-migrate-gate(readonly→apply)로 `076_lovetree_login_handoff.sql`만 운영 D1에 적용했고 장부에 기록됐다(`lovetree_login_handoffs` 표 존재 실측). 게이트가 파일을 'wide destructive'로 표시한 것은 CHECK 절의 `ON DELETE CASCADE` DELETE 토큰 때문이며 drop-guard(DROP TABLE/COLUMN/INDEX)와는 무관하다.
- **Chat(b62) 운영 재배포 완료**(exact main `99e147ea3`): `chat.padiem.net/auth/lovetree/start` 라이브 실측 — pages.dev origin+state는 302→Google OAuth, 외부 origin은 400 `invalid_lovetree_return_origin`.
- **중계 Worker 2개**: 읽기 `lovetree-authority-caller`·발급·폐기 `lovetree-auth-caller` 배포(직전 세션)·헬스 200 확인. 둘 다 `LOVETREE_CALLER_SECRET` 등록됐으나 값은 읽을 수 없고 컴1 로컬 사본도 없다(생성 경로: 직전 세션 wrangler stdin, 잔존 파일·셸 이력 없음). 안전한 기기 간 전달 경로 확정 전 재생성 보류 중.
- **Pages 설정**: production `LOVETREE_API_ORIGIN=https://lovetree-api.padiem.net` 설정 완료(다음 Pages 배포부터 적용). Pages 주소와 COM2 `LOVETREE_PUBLIC_ORIGIN`은 서로 다른 값이다.
- **상단 로그인 진입 구현**(이 브랜치): 네 화면 상단 바에 로그인·로그아웃 진입을 추가했다. 새 인증 체계 없이 sync 컨트롤러(`owned`·`act('login'|'logout')`)를 재사용하고, orbit .menuBtn·shelf .ghost·book .ui-btn·공통 .button을 그대로 쓴다. 그림자 경계 클릭은 composedPath 위임 하나로 받는다. 검증: 테스트 141 pass·0 fail(+신규 8), 로컬 브라우저 12항목(PC·390 겹침 0·가로 넘침 0·클릭 시 `/auth/login?next=/` 이동) 통과. shelf 390px에서 로그인 버튼이 메뉴 둘째 줄로 흐르는 것은 이 뷰의 원래 줄바꿈 허용 설계 안이다(겹침 0).
- **스택 빈틈 메움 — 폐기 write transport**: `server/index.js` buildLogin이 `createAuthorityWriteCall(env)`을 요구하는데 그 구현이 저장소에 없었다(테스트는 가짜 call 주입이라 미검출). `server/authority-relay-write-transport.js`를 추가했다: `LOVETREE_MINT_URL`의 중계(발급·폐기 같은 Worker)로 `/revoke-session`만 중계하고, 발급 RPC(mint 없는 구성 경로)는 닫아 둔다. 시험 4개.
- **남은 것**: ① COM2 .env 추가 값 반영·재시작(요청서 전달됨), ② `LOVETREE_CALLER_SECRET` 세 곳(두 중계+COM2) 일치 — 전달 경로 확정 필요, ③ #75 후보 단일 병합 + 이 브랜치 통합(인증·COM2 배선 확인 뒤, Pages 자동 배포), ④ 운영 판정(401/404 JSON, 버튼→인증 화면, 실계정 로그인→저장→복원→로그아웃→이전 자격 거부, A/B 격리는 두 실계정 가능할 때, 관리자 미부여 200 admin:false·roles 403, 클릭 없는 마우스 패럴랙스 운영 확인).

## #40 첫 저장 후 다음 순간 연결 안내 — 2026-10-28

main `84e3a54` 위에서 별도 worktree·브랜치로 진행했다. #59(프런트 동기화)와 `src/main.js`가 겹쳐 범위를 먼저 조율했고(#59 댓글), #59가 점유한 import 줄·`commit()` 본문·파일 최하단은 건드리지 않았다.

- 첫 저장의 도착지를 기억책에서 트리 화면으로 바꿨다(#40 본문이 "기본 진입 순서는 이 흐름 기준으로 판단"이라고 명시). 그 외 저장은 있던 화면에 머문다.
- 트리 화면 상단에 한 줄 안내를 뒀다: 주 행동은 `이 순간에서 이어가기`(방금 저장한 순간을 부모로 고정한 `add` 작성창), 보조 행동은 `기억책으로 읽기`, 그리고 닫기. 문구는 #39의 `src/terms.js`를 그대로 쓰고 새 온보딩은 만들지 않았다.
- 안내는 방금 저장한 트리 id(`guideTreeId`)에만 붙는다. 다른 트리를 열면 뜨지 않고, 두 번째 순간이 저장되면 사라지며, 새로고침 후에는 다시 표시하지 않는다.
- PC·390px 실측: 첫 저장 후 `#tree/…` 도착, `role=status`, 초기 포커스 안내 안, 주 행동 `mode=add`·부모=첫 순간, 두 번째 저장 후 순간 2개·안내 소멸, 보조 행동 `#book/…` 이동, 닫기 후 `add` 버튼 포커스 복귀, #36의 입력 보호(폐기 확인 1회·입력 유지)와 폰트(`Pretendard Variable`) 유지, 콘솔 오류 0, `npm run check` 테스트 24 pass.
- 390px에서 `.graph-sizer`·`.graph-canvas`·`svg` 3개가 뷰포트 오른쪽 밖으로 나가는 것은 main부터 있던 트리 화면 동작이다(`.graph-scroll{overflow:auto}` 안에서 배율 1로 확대되는 캔버스). 안내 표시·숨김·새로고침 세 상태에서 동일했고 문서 가로 넘침은 0(390/390)이었다.

## #42 내 트리 화면 상단 압축과 선택 기록의 주요 행동 노출 — 2026-10-28

main `84e3a54` 위에서 별도 worktree·브랜치로 진행했다. `src/views/shelf.js`·`src/views/shelf.css`만 고쳤고, `shelf-source.css` 원본 자산·#55 폰트·#39 용어는 그대로 뒀다.

- 기록이 있으면(재방문) 소개를 `.hero.is-compact` 한 줄 밴드로 압축했다: 왼쪽은 눈길표·본문 문단 없이 제목 한 줄 + `n개의 트리 · n개의 순간`, 오른쪽 다크 칩은 미니 표지(글자 생략) + `다시 펼칠 순간 · 대상` + 순간 제목 + `기억책으로 읽기`. 트리가 0개면 기존 큰 소개를 그대로 쓴다(PC 305px / 390px 530px 유지).
- 선택 기록 스트립은 읽기 행동(`기억책으로 읽기`, `첫 순간부터`)과 관리 행동(`트리 연결 보기`, `이 트리 백업`, `트리 삭제`)을 구분선으로 나누고 한 줄로 정렬했다. 삭제는 기존처럼 `.minor.danger`로 덜 두드러지게 유지했다.
- 트리가 하나면 쓰지 않는 좌우 화살표를 숨기고 레일을 좁혔다(PC 390→352px, 390px 360→300px).
- 실측(PC 1280×900 / 390×844, 트리 1개·3개 두 상태): 소개 305→146px, 선택 스트립 상단 927→717px, PC는 주요 행동 4/4가 첫 화면 안, 문서 높이 1214→955(1개)·993(3개). 390px은 소개 500→155px, 검색·선택 카드·주요 행동 3/4가 첫 화면 안이고 `트리 삭제`만 폴드 경계에 4px 걸린다.
- 회귀 확인: 표지/목록 전환·검색·검색 해제 모두 같은 선택 유지, `다시 펼칠 순간` → 같은 순간 복귀, 카드를 한 번 더 눌러 기억책 열림, 3개일 때 화살표 이동, 트리 삭제 확인 1회·취소 시 3개 유지, 콘솔 오류 0, 렌더 `Pretendard Variable`, `npm run check` 테스트 24 pass.

## 기존 두 저장소 비교·이슈 반영 — 2026-10-28

LoveBud b80647f·리모네 dd8394c·4.0 84e3a54 및 PR #59 9b7c9da의 관련 코드 27개를 비교했다. 출처·재사용/예시/미연결 구분은 `reference/SOURCES.md`의 기존 두 저장소 비교 절을 따른다. #42는 기존 선택 패널/모바일 흐름, #14는 미디어, #57은 소유자별 캐시와 응답 유실 재시도, #40은 첫→다음 연결 재사용을 담당한다. #9·#13·#1·#38도 최신 비교 내용으로 갱신했으며 중복 이슈는 만들지 않았다. 코드 존재를 운영 완료로 해석하지 않는다. 이번 PR은 문서만이며 컴1 거버넌스는 확인·수정하지 않았다.

## #55 한글 타이포 적용(Pretendard + 기억책 제목 MaruBuri) — 2026-10-28

PR #54 head `a69e1df` 위에 별도 worktree·브랜치로 적용했다(이 PR의 base는 PR #54 분기). 문서 PR #56과 같은 결정의 구현편이며, 문구·저장·인증은 바꾸지 않았다.

- 글꼴은 공식 배포본을 수정 없이 자체 호스팅한다 — npm `pretendard@1.3.9`의 dynamic-subset CSS + woff2 92개, 그리고 네이버 공식 CSS가 가리키는 `MaruBuri-Regular.woff2` 한 종. 출처·SHA-256·라이선스 전문은 `public/fonts/README.md`와 `public/fonts/LICENSE-*.txt`에 뒀다. GitHub 미러의 MaruBuri 파일은 쓰지 않았다.
- `src/styles.css`에 `--ui`(Pretendard)·`--reading`(MaruBuri)를 두고 `:root`와 `--serif`를 `--ui`로 수렴시켰다. 그림자 DOM은 각 뷰의 프로젝트 소유 CSS(orbit `extraCSS`, book 인라인 `css`, `shelf.css`)에서 `--ui-sans`·`--book-serif`·`--hand`·`--display`·`--body`·`--latin`을 `--ui`로 덮어쓴다. `*-source.css` 원본 자산은 수정하지 않았고, `.memory-title`만 `--reading`을 쓴다. Google Fonts @import는 삭제했다.
- 실제 렌더는 CDP로 확인했다. 첫 화면·책장·트리·작성창·기억책 본문과 메뉴는 `Pretendard Variable`, 기억책 감상 제목만 `MaruBuriOTF`(공식 파일의 내부 이름). 교체 전에는 첫 화면과 기억책이 `Malgun Gothic`/`Times New Roman` 시스템 폴백이었다.
- 전송량(1280×900 화면 순회 실측): 교체 전 82,360b → 단일 변수 파일 2,487,260b → **dynamic-subset 840,904b**(Pretendard 411,332b + 기억책을 열 때만 MaruBuri 429,572b). 첫 화면은 259,128b.
- 글꼴 교체 자체만으로는 레이아웃 이동이 없었다(작성창 필드 높이 72/44/91/46/45 그대로, 날짜 일괄 700 없음). 이후 #55 출발값대로 작성창 본문·입력을 16px로 올렸다(PC 12px→16px, 390px은 이미 16px였고 중복 규칙 삭제). 레이블·감정 칩·버튼 크기와 날짜 굵기는 그대로 뒀고, 설명·버튼 14~16px/500~600의 나머지 출발값은 화면 비교 후 별도 반영.
- PC·390px 7화면 문서 가로 넘침 0, 버튼 잘림 0, 팝업 폐기 확인·포커스 복귀·분기 2선택지 → 2/2 동작 전과 동일, 콘솔 오류 0, `npm run check` 테스트 24 pass. #41 중앙 가독성은 같은 카드 위상에서 제목 18.06/9.91/11.86, 설명 8.54/4.97/8.54로 대등하다.
- MaruBuri는 공식 배포본 파일에 라이선스 전문(name 13/14)이 들어 있지 않아 네이버 공식 페이지의 저작권 안내·영문 전문을 그대로 동봉하고, 표준 OFL 1.1 핵심 17항과 대조해 전부 일치함을 확인했다(`public/fonts/LICENSE-MaruBuri.txt`).
- docs PR #56의 결정 문서를 이 브랜치에 병합해 `docs/PRODUCT.md`의 타이포그래피 절과 HANDOFF의 결정·구현 두 문단을 모두 보존했다.

## 타이포 선택 확정·적용 대기 — 2026-10-28

공통 조작 UI는 Pretendard, 기억책 감상 제목만 MaruBuri로 결정했다. 적용 범위·라이선스·검증 기준은 `docs/PRODUCT.md`의 타이포그래피 절과 이슈 #55를 따른다. 이번 변경은 문서만이며 폰트 파일·제품 코드·main·운영 배포는 변경하지 않았다. 잘못된 v4 경로/폰트 조사 결과를 현재 4.0 기준으로 승계하지 않는다.

## #41 첫 화면 중앙 가독성·마우스 패럴랙스 — 2026-10-28

PR #53 head `2cc4a1b` 위(이 PR의 base는 PR #53 분기)에서 첫 화면(orbit)만 다뤘다. 데이터·저장·서버 규칙은 그대로다.

- 흰 메모 카드가 중앙 문구 뒤를 지나도 읽히도록 카드 레이어(`.world`, z 3)와 문구 레이어(`.center`) 사이에 부드러운 어두운 타원 그라데이션 `.center-scrim`(z 10)을 넣었다. z-index나 글자 그림자가 아니라 배경 자체를 어둡게 하는 별도 레이어이고, 문구·버튼은 그 위 독립 레이어(z 22)에 남는다. SRC064의 가장자리 감쇠와 바깥 사진은 그대로다.
- 같은 카드 위치(reduced-motion으로 위상 고정 + 드래그로 4개 위상)에서 문구 뒤 배경을 실제로 화면 캡처해 채도 보정 밝기로 재면, 최고 밝기 화소 대비가 제목 2.76→11.16, 설명 1.27→5.28, 평균 대비 제목 12.3→17.4·설명 5.3→8.2다. 상단 제어는 밝은 카드가 지나갈 때 최악이 4.72까지 내려갔다가 반투명 알약 배경으로 8.36 이상을 유지한다(어두운 배경에서는 평균 18.6→16.7로 조금 낮아진다 — 바닥을 올려주는 대신이다).
- Owner 보완 지시로 390px 설명문의 최저 대비가 4.34였던 구간을 끌어올렸다. `@media(max-width:650px)` 안의 `.center-scrim` 알파 램프만 `.88/.74/.38` → `.93/.84/.46`으로 최소 조정했고(범위·지오메트리·PC 규칙 그대로), 같은 카드 4위상 재측정에서 설명 최저 최악치가 **4.34 → 5.12**(제목 9.17→10.52, 예시 안내 12→12.64), PC 1280의 전 항목 수치는 변경 전과 완전히 동일했다.
- 마우스 패럴랙스는 `.world`에 중심 기준 ±14px 제한 변위를 0.07 보간으로 적용한다. phase를 누적하지 않아 같은 지점에서 30회를 움직여도 값이 같고, 문구·버튼·상단 메뉴 좌표는 움직이지 않는다. 움직임 멈춤·reduced-motion·팝업 열림·백그라운드 탭에서 정지하고 멈춤 때 중립으로 돌아가며, 실마우스아웃(pointerleave)에서 0px 복귀를 확인했다. 드래그로 위상 이동·좌표 클릭으로 감상 열기는 전과 동일하고, 터치 컨텍스트에서는 `(pointer:fine)` 조건 때문에 걸리지 않는다.
- 안내는 행동 가까이로 옮겼다. `N개의 순간 · 이 브라우저에 보관`과 `리모네 예시 · 내 기록에는 저장되지 않아요`를 좌하단 작은 글자에서 버튼 아래(전용 레이어)로, 우하단 `DRAG · TAP TO OPEN`은 `드래그 · 눌러서 감상`으로 바꿨고 상단 정지·목록은 알약형 배경·테두리·44px 높이로 보완했다. #39 용어를 그대로 쓴다.
- 검증: PC 1280·390px 문서 가로 넘침 0, 콘솔 오류 0, 키보드 진입 경로(skip → 정지 → 목록 → 카드)와 Enter 토글·`aria-pressed`·포커스 유지는 수정 전과 동일. `npm run check` 테스트 24개·빌드 성공. 캡처 `cap-41-*.png`(작업 폴더, 저장소 미포함). 실기기·스크린리더 미검증. 로그인 진입은 이번 범위가 아니다(인증 #13/#49/#52 통합 시 공통 상단 메뉴 우측으로 검토).

## #39 공통 메뉴·용어 통일 — 2026-10-28

PR #51 head `372aa19` 위(이 PR의 base는 PR #51 분기)에서 첫 화면·책장·기억책·트리 화면의 이름을 맞췄다. 전면 재디자인이 아니라 용어 정리이며 서버·인증·저장 형식은 그대로다.

- `src/terms.js`에 공통 용어를 모았다. 서비스 이름 `러브트리`, 시작 화면 `처음으로`, 저장한 묶음 `내 트리`, 읽기 진입 `기억책으로 읽기`, 작업 화면 `트리 연결 보기`, 생성 행동 `새 트리 만들기`, 추가 행동 `이 순간에서 이어가기`. 네 화면이 같은 값을 쓴다.
- 기억책은 새 서비스가 아니라 같은 트리를 읽는 방식이다. 책장 첫 화면과 트리 화면에 그 한 줄을 두고, `책으로 감상`·`기억책 펼치기`·`이어서 읽기`·`책으로 보기`를 `기억책으로 읽기`로 합쳤다. 기억책 헤더에는 `기억책 · 같은 트리를 읽는 방식`과 지금 읽는 트리 제목을 표시한다.
- 생성과 추가를 구분했다. `순간 남기기`·`새 순간 남기기`·`나의 트리 만들기`·`첫 순간 심기`는 `새 트리 만들기`로, `이 순간에서 기록 이어가기`·`순간 이어 붙이기`는 `이 순간에서 이어가기`로 통일. 첫 화면에서 비예시 기록의 이어쓰기 버튼은 실제로는 트리 화면 이동이라 `트리 연결 보기`로 고쳤다.
- 책장의 권수 표현(`2권의 책`, `권 / 권`, `책 삭제`, `이 책 백업`, `책장` 전환)은 트리 기준(`2개의 트리`, `개 / 개`, `트리 삭제`, `이 트리 백업`, `표지` 전환)으로 바꿨고, 표지 그림과 영문 장식 문구는 기존 자산 그대로 뒀다. 540px 이하에서 첫 링크를 숨기던 규칙은 없앴다(측정: 320px에서도 brand 100 + nav 172가 한 줄에 들어가고 가로 넘침 0).

검증(PR #51 head 빌드와 동일 시나리오 비교, 로컬 preview 4601·4602, 가상 기록 2개 + 분기 2개 + 60자 대상·80자 제목): PC 1280·390px에서 첫 화면→책장→트리→기억책→예시 이동과 두 작성 대화상자 확인, 문서 가로 넘침 0, 콘솔 오류 0. 팝업·초점·경로는 전과 동일(열릴 때 `subject` 포커스, 입력 중 Esc 취소 시 입력 유지, 폐기 승인 시 닫히고 포커스 복귀, 분기 2선택지 → 2/2 → 이전 1/2). `npm run check` 테스트 24개·빌드 성공. 캡처 `cap-39-*.png`(컴1 기준 폴더, 저장소 미포함). #40 첫 저장 안내, #41~#43 화면 개선, 390px에서 헤더 작성 버튼 숨김(기존 레이아웃)은 이번 범위에 넣지 않았다.

## 큰 기록 점검·맞춤 안내 — 2026-10-27

순간 상한(300개)에 가까운 기록으로 네 보기와 상호작용을 직접 측정했다(12줄기×21순간 + 가지 40, 관련 연결 20쌍, 293순간, 저장 58KB).

- 보기 전환 39~79ms(보드가 가장 느림, 293장 카드), 순간 선택 49ms, 맞춤 59ms, 관련 순간 대화상자 열기 36ms·닫기 19ms. DOM은 트리 3,100·보드 2,600 노드 수준이다. 즉 상한 안에서는 입력 지연이 체감되지 않는다.
- 293순간 트리의 전체 크기는 6,490×10,770px로 최소 배율 18%에서도 한 화면에 들어오지 않는다(내부 스크롤 446×1,468px). 이전에는 아무 안내 없이 그 배율에서 멈췄다. 이제 `맞춤`이 다 담지 못할 때만 하단 바에 `한 화면에 다 담지 못해 18%까지만 줄였어요. 줄기로 보기에서 전체 흐름을 볼 수 있어요.`를 표시한다(40순간 초과일 때만 줄기 안내, 작은 트리에서는 표시 없음).
- 검증: 큰 트리에서 안내 1개·하단 바·문서 가로 넘침 0, 6순간 트리는 맞춤 38%·내부 스크롤 0·안내 없음, 390px 넘침 0, 콘솔 오류 0. 테스트 24개·빌드 통과.

## #9 줄기로 보기 — 2026-10-27

56 관계망의 클러스터 조망을 4.0 데이터에 있는 단위로 옮겼다. **줄기**는 첫 순간에서 직접 갈라진 가지이며, 각 줄기의 모든 순간을 날짜순으로 모아 보여 준다. 원본의 6클러스터는 합성 데이터에 박힌 주제 상수라 그대로 옮기지 않았고, 새 분류를 만들지도 않았다.

- `stemGroups(tree)`(`src/domain.js`)가 `START`(첫 순간) 카드와 첫 순간의 자식마다 한 줄기를 돌려준다. 줄기 순서는 첫 순간의 날짜순이고, 줄기 안의 순간은 부모→자식 순서다.
- 작업공간 보기 전환에 `줄기로 보기`를 더했다. 카드마다 순간 수·날짜 범위와 순간 목록(날짜·제목·감정)을 보여 주고, 고른 순간이 속한 줄기에 테두리를 준다. 순간을 누르면 오른쪽 상세가 같은 `treeId/momentId`로 바뀌고, 다른 보기로 가도 선택이 유지된다.
- 확대/축소는 트리 보기에만 둔다. 줄기 보기에서는 날짜순 경로 안내 문구를 보여 준다.
- 좁은 화면(≤540 CSS px)에서는 보기 버튼의 글자를 숨기고 아이콘만 남긴다(각 버튼에 `aria-label` 유지). 820px 이하에서는 보드 도구줄이 줄바꿈된다.

검증(로컬 4453, 첫 순간 + 줄기 2개(3·1순간)): START·01(3순간, 2026.09.14~10.11)·02(1순간) 카드와 날짜순 정렬, 선택 순간이 속한 줄기만 `on-stem` 표시, 줄기 행 클릭·Enter로 상세·경로(2/2)·관련 순간 칩이 함께 갱신, 보기 전환 후 버튼 포커스 유지, 예시 트리(`#demo/demo-voice`) 줄기 3장, 390px에서 아이콘 4개가 한 줄(69px×4)·문서 가로 넘침 0·줄기 보드 세로 스크롤만 131px, 콘솔 오류 0. `npm run check` 테스트 24개(줄기 1개 추가)·빌드 성공.

## #9 관련 순간 잇기 — 2026-10-27

58의 `connections[]`와 55의 재배선 중 4.0의 구조를 깨지 않는 부분만 옮겼다. 순간은 여전히 부모 하나를 가지며 트리 경로·읽기 순서·삭제 규칙은 그대로다. 대신 두 순간을 **부모 관계와 별개로** 서로 이어 둘 수 있다.

- 스키마: 순간의 선택 필드 `links`(같은 트리의 순간 id 배열, 최대 `MAX_LINKS` 20). `links`가 없는 예전 기록은 불러올 때 `[]`로 채운다. 없는 id·자기 자신·개수 초과·배열이 아닌 값은 거부한다.
- `linkMoments`/`unlinkMoments`는 양쪽에 같은 연결을 남기고, `relatedMoments`는 한쪽만 남은 데이터도 양방향으로 읽는다. `removeMoment`는 지운 순간을 가리키는 연결을 함께 정리하고, `importTrees`는 연결 id를 새 사본의 id로 다시 매핑한다.
- UI: 상세 패널 `관련 순간`(칩과 끊기), `관련 순간 잇기` 대화상자(트리에서 이어진 위치는 그대로라고 안내), 트리 보기의 점선 연결선, 보드 카드의 `관련 n`, 기억책의 `함께 떠오른 순간`. 예시 트리는 읽기 전용이라 숨긴다.
- 55의 **부모 재배선**(한 순간에 부모 여럿)은 하지 않았다. 트리 경로·읽기 순서·분기 규칙을 함께 바꾸는 결정이라 별도 합의가 필요하다.

검증(로컬 4451, 4순간 테스트 트리): 잇기 대화상자에서 자기 자신은 목록에 없고, 잇은 뒤 저장값이 `m3→m4`·`m4→m3`로 같으며 점선 연결선은 1개(중복 제거), 상세 `관련 순간 1`·칩 1개, 새로고침 뒤에도 유지. 끊기 뒤 양쪽 `links`가 비고 점선·칩이 사라지며 포커스는 `관련 순간 잇기`로 돌아온다. 보드 카드에 `관련 1`(aria-label 포함), 기억책에 `함께 떠오른 순간` 칩, 예시 트리(`#demo/voice-2`)에는 관련 블록과 잇기 버튼이 없음. 390px: 대화상자 폭 303px·내부 넘침 0, 칩이 상세 패널 안에 머물고 문서 가로 넘침 0, 콘솔 오류 0. `npm run check` 테스트 23개(관련 연결 3개 추가)·빌드 성공.

## #9 조망 맞춤·경로 따라가기 — 2026-10-27

작업공간 하단에 **경로 따라가기**를 붙이고 확대/축소에 **맞춤**을 추가했다. 56 관계망의 "전체 조망"·"경로 재생" 중 4.0의 한 부모 트리로 표현되는 부분만 옮겼고, 데이터·저장 규칙은 바꾸지 않았다.

- `pathTo(tree, id)`(`src/domain.js`)가 시작 순간에서 선택한 순간까지의 부모 사슬을 순서대로 돌려준다. 없는 id는 빈 배열이다.
- 하단 바의 `← 3 / 5 →`는 그 사슬을 한 순간씩 오간다. 양 끝에서는 해당 버튼이 비활성이고, 누른 쪽이 비활성이 되면 반대쪽으로 포커스를 옮긴다. 사슬 길이가 1이면(시작 순간) 바가 사라지고 선택 카드가 포커스를 받는다. 트리·시간순·보드 보기 모두에서 같은 선택을 움직인다.
- 상세 패널의 `여기까지 온 길`은 조상 순간을 01… 번호로 보여 주고 누르면 그 순간으로 이동한다.
- `맞춤`은 트리 전체가 보드에 들어오도록 배율을 계산한다(18~100%). 배율은 `.tree-board` 너비와 `.graph-scroll` 높이로 계산해 스크롤바가 생기고 사라져도 값이 흔들리지 않고, 창 크기가 바뀌면 다시 맞춘다. 확대/축소를 누르면 그 배율에서 이어 간다.
- 56의 6클러스터·경로 재생 애니메이션·모바일 리본은 가져오지 않았다. 원본의 클러스터는 합성 데이터의 임의 상수라 4.0의 한 부모 트리에 같은 단위가 없고, 조상 사슬을 직접 오가는 편이 실제 기록과 어긋나지 않는다.

검증(로컬 127.0.0.1:4447, 6순간·한 갈래 테스트 트리): 1280px에서 `맞춤` 81%로 내부 스크롤 0, 다시 렌더·선택을 바꿔도 배율 81% 유지, `경로 4/4`에서 이전/다음 이동과 포커스 유지(사슬 끝에서 반대 버튼으로 이동), 시작 순간에서 바가 사라지고 카드로 포커스, 보드 보기의 경로 강조 3장·선택 1장 일치, 키보드 Enter로 경로 이동, 순간 추가 뒤에도 맞춤 유지(45%, 5/5). 390px: 맞춤 18%, 문서·하단 바 가로 넘침 0, 경로 라벨은 숨고 `← 4 / 4 →`와 `− 18% + 맞춤`이 한 줄에 들어감, 콘솔 오류 0. `npm run check` 테스트 20개(경로 1개 추가)·빌드 통과. Playwright 기본 스크린샷은 Google Fonts 대기로 시간 초과되어 CDP 캡처로 화면을 확인했다.

## #9 58 보드 보기 — 2026-10-27

작업공간(`#tree/…`, `#demo/…`)의 보기 전환에 **보드로 보기**를 추가했다. 58 핀보드의 배치형 보드와 경로 강조를 4.0 스키마(한 부모)에 맞게 단순화한 것으로, 데이터·저장 규칙은 바꾸지 않았다.

- 순간을 날짜순 카드 그리드로 보여 주고, 날짜·제목·메모·감정·이어온 순간 제목을 함께 표시한다.
- 선택한 순간까지의 조상 경로를 왼쪽 띠로 강조하고, 선택 카드는 테두리로 표시한다. 카드를 누르거나 Enter로 선택하면 오른쪽 상세가 같은 `treeId/momentId`로 갱신된다.
- 보기 전환(트리·시간순·보드) 사이에 선택이 유지되고, 보드에서는 확대/축소 대신 경로 안내 문구를 보여 준다.
- 58의 핀 드래그·시네마 재생·`connections[]` 다중 연결은 가져오지 않았다. 다중 연결은 #9·#12 결정 전까지 보류다. 56 전체 조망은 트리 보기의 `맞춤` 배율, 경로 따라가기, 그리고 `줄기로 보기`로 대응한다(위 `#9 조망 맞춤·경로 따라가기`, `#9 줄기로 보기`).

검증(로컬 preview 4432, 예시 트리 3순간): 카드 3개·선택 1개·경로 강조 2개(루트+선택), 상세 제목 일치, 카드 포커스 후 Enter 선택 정상, 시간순 보기로 전환해도 선택 유지, 390px에서 1열·가로 넘침 없음, 콘솔 오류 0. `npm run check` 테스트 19개·빌드 통과.

## #8 old 비교 미리보기 — 2026-10-27

58·56·66·55 원본을 `reference/originals/`에 추가 보존했다. 복사 전후 SHA-256이 `reference/OLD_ASSET_CATALOG.md` 기록과 일치함을 확인했고 출처·크기는 `reference/SOURCES.md`에 적었다. 지금 보존본은 64·59·32·58·56·66·55 일곱 개다.

비교 화면은 `reference/compare/index.html`이며 `npm run reference`(`scripts/serve-reference.mjs`, 의존성 없음)로 `http://127.0.0.1:4450/reference/compare/`에서 연다. old 원본과 4.0 대응 화면(`#trees`, `#demo-book/demo-voice`, `#demo/demo-voice`, 첫 화면)을 iframe으로 나란히 띄우고, 화면별 판단(재사용·보완·보류)과 근거, 파일 크기·SHA-256, 확인할 지점을 함께 적었다. 4.0 주소는 입력창에서 바꿀 수 있어 다른 포트의 로컬 빌드와도 비교된다.

검증: 로컬 4450에서 7개 카드와 원본 iframe 7개가 모두 `complete`(제목 확인: SRC064·Track59·Track32·58·56·66·55), `원본만`/`나란히` 전환과 4.0 주소 적용이 동작, 콘솔 오류 0, 1440px 가로 넘침 없음. 제품 번들(`public`·`dist`)에는 들어가지 않아 기존 테스트·배포에 영향이 없다. old 원본이 참조하는 외부 폰트·이미지는 여전히 원본 의존성이며 4.0 기능이 아니다.

## 접근성·복구·감정 보존 수정 — 2026-10-27

**#7 첫 화면 키보드 진입**: 원인은 그림자 호스트 `<main id="main" tabindex="-1">`였다. Chromium은 호스트가 탭 정지점일 때 그 그림자 트리로 순차 포커스 이동을 하지 않는다. 호스트에서 `tabindex`를 빼고(그림자 뷰 3곳), skip link는 마운트된 뷰의 첫 컨트롤로 포커스를 옮긴다. 검증(로컬 preview 4430): Tab 순서가 `본문으로 바로가기 → 움직임 멈춤 → 순간 목록 → 카드`로 진입하고, skip link Enter는 `움직임 멈춤`에 포커스를 둔다. 책장(`#trees`)·기억책(`#book/…`)도 내부 컨트롤로 진입하며 콘솔 오류는 0이다.

**#11 복구 사본 내보내기**: `hasRecovery()`는 이미 `RECOVERY_KEY`를 보므로 새로고침 뒤에도 참이지만, 내보내기 버튼은 책장에만 있었다. 첫 화면에도 `복구 파일 내보내기` 버튼을 추가하고 기존 내보내기 경로(`exportRecovery`)를 공유한다. 검증: RECOVERY_KEY를 남긴 채 재방문 → 첫 화면에 버튼 표시 → 클릭 시 `lovetree-recovery.json` blob 다운로드 확인, 390px에서 가로 넘침 0.

**#12 가져온 감정 보존**: `validateState`가 모르는 감정을 `설렘`으로 바꿔 리모네 기록의 의미가 조용히 바뀌었다. `normalizeEmotion`으로 12자 이내의 정상 문자열은 그대로 보존하고, 비어 있거나 너무 긴 값만 `설렘`으로 둔다. 수정 폼에서는 그 값을 `(가져온 값)`으로 표시해 선택 해제되지 않게 했다. 테스트 19개(감정 왕복 1개 추가)와 빌드가 통과한다. 감정별 색상 클래스는 알 수 없는 값에서 기본 스타일로 떨어진다.

## #10 첫 기록 UX 마무리 — 2026-10-27

기존 화면/문구를 유지한 채 빈 브라우저에서 첫 순간 작성 → 저장 → 다음 순간 연결 → 다시 열기를 확인했다. `이 순간에서 이어가기` 버튼은 기억책 상단과 트리 상세 패널에 노출된다.

- 중복 저장 방지: 저장 버튼을 비활성화하고 `formSubmitting` 가드를 둬 연속 클릭·Enter 연타에서도 한 번만 저장된다.
- 브라우저 뒤로가기·앞으로가기·해시 변경: 작성 중 이동 시 확인 대화상자. 취소하면 히스토리 인덱스로 `history.go(delta)`를 사용해 원래 방문 기록으로 되돌려 기존 뒤로가기/앞으로가기 기록과 입력·작성 대상 트리를 유지(배경은 한 번만 렌더), 승인하면 닫음. 저장 성공에 따른 화면 이동에는 확인을 띄우지 않음. 다른 트리에 저장되지 않음.
- 저장 실패: 입력을 보존하고 오류 문구를 보여 주며 버튼을 다시 활성화한다. 트리가 없는 라우트에서는 안내 문구로 처리한다.
- 초점 이동: 저장 성공 후 기억책/트리의 다음 행동 버튼(`이 순간에서 이어가기`)으로 초점을 옮긴다. Esc·닫기 버튼의 dirty 확인과 포커스 복원은 유지했다.
- 필수값 오류는 브라우저 기본 검증과 첫 오류 필드 포커스로 처리한다(재작성 없음).

검증: 새 브라우저 빈 상태 흐름(첫 순간 1개 → 두 번째 연결 → 새로고침 재방문), Esc/닫기/뒤로가기, 필수값 오류, 저장 실패, 연속 클릭, 390px 모바일 확인. `npm run check` 테스트 24개·빌드 통과. 293순간 성능·이미지 해시·의존성 감사는 반복하지 않았다.

남은 범위: 다중 부모(#9에서 열어 둔 결정), 실기기 터치/CGI 재검증은 미확인이다.

## #45 팝업 바깥 클릭 닫기 — 2026-10-27

작성창·관련 순간 연결창의 백드롭 클릭으로 닫는다. dirty 상태에서는 기존 폐기 확인을 재사용하고(취소 시 입력·초점 유지, 승인 시 닫기), 내부 클릭·내부에서 시작한 드래그는 닫지 않으며 배경 버튼/링크는 실행되지 않는다. 모달 열림 시 body overflow 잠금 + wheel 조작 전후 scrollY 비교로 차단 확인, 닫은 뒤 복원. 모달 내부 스크롤은 유지. 폐기 확인 취소 시 잠금 유지. `npm run check` 테스트 24개·빌드 통과.

## #46 작성창 닫은 뒤 원래 버튼으로 초점 복귀 — 2026-10-27

책장·기억책·트리에서 창을 연 실제 버튼(Shadow DOM 내부 포함)을 추적해 Esc·닫기·바깥 클릭으로 닫으면 그 버튼으로 초점 복귀(preventScroll). 폐기 확인 취소 시 작성창 안의 직전 초점 유지. 원래 버튼이 사라졌다면 대체 위치로 복귀. 저장 성공 시 기존 ‘다음 행동 버튼’ 초점 유지. 새 작성창 최초 초점은 첫 입력란, 수정창은 제목 입력란. `npm run check` 테스트 24개·빌드 통과.

## #47 이전 순간 이동 후에도 다음 탐색 유지 — 2026-10-27

경로 탐색 중 선택한 경로(navPath)를 유지해 이전으로 이동해도 다음 순간으로 돌아갈 수 있다. 첫 순간에서도 컨트롤을 유지하고 이전 버튼만 비활성화. 분기에서 다음 경로가 정해지지 않으면 임의 이동 없이 사용자가 자식을 선택. 캔버스 직접 선택 시 경로를 그 선택에 맞춤. 순간 삭제·트리 변경 시 오래된 경로 참조 정리. 관련 연결(links)은 부모 경로(pathTo)와 구분. `npm run check` 테스트 24개·빌드 통과. pathTo가 순간 ID뿐 아니라 순간 객체도 받도록 보강(회귀 테스트 추가). 첫 순간 직접 선택 시 탐색 컨트롤 유지, 다음 자식 1개면 자동 이동, 여러 개면 제목이 표시된 선택 UI 제공(임의 이동 금지), 자식 없으면 비활성화. 선택한 분기는 이전/다음 왕복 중 유지.

## main 병합과 프로덕션 전환 — 2026-10-27

통합 검토 PR #27을 `main`에 **merge**로 병합했다(병합 커밋 `27a9736`). 포함된 PR #16·#17·#18·#19·#21·#24·#25의 head가 모두 `main` 이력에 있는 것을 `git merge-base --is-ancestor`로 확인했고, 열린 PR은 0개가 됐다. 이슈 #6·#20·#22·#23·#26은 완료로 닫았고, #7은 아래 키보드 문제 때문에 열어 두었다.

검증: 병합 head `1ce8648`에서 `npm run check` — 테스트 18개 통과, `vite 8.3.5` 빌드 성공(JS 151.42 kB / gzip 42.73 kB, CSS 30.85 kB / gzip 7.67 kB). 병합 커밋의 GitHub CI(ubuntu·windows)·GitGuardian·Pages 검사 통과. 저장소가 public이므로 추적 파일 71개에 비밀값·개인 백업 JSON이 없는지 확인했다.

Cloudflare Pages 프로덕션 분기를 `ai/com1-integration-review-20261027-071356-cf87f3`에서 `main`으로 바꿨다(API `production_branch=main`). 이제 `main` push가 프로덕션 배포다.

키보드·모션 확인(배포 주소, Chromium): `prefers-reduced-motion: reduce`에서 애니메이션 0개·0.1초 초과 transition 0개로 모션 감소가 동작하고, 포커스 링 스타일은 첫 화면·책장·기억책에 모두 있다. 다만 첫 화면 그림자 DOM 안의 버튼(움직임 멈춤·순간 목록·카드 40개)은 skip link 다음 Tab으로 진입하지 않고 body로 되돌아갔다(6회 반복 확인). 그림자 루트 내부에 포커스를 두면 Tab 이동은 정상이다(움직임 멈춤 → 순간 목록). 원인은 아래 `접근성·복구·감정 보존 수정`에서 확정해 해결했다.

## Cloudflare Pages 배포 — 2026-10-27

통합본을 인터넷에서 볼 수 있게 Cloudflare Pages 프로젝트 `lovetree-4-0`(Charliekant 계정)을 GitHub `skerishKang/lovetree-4.0`에 Git 연결했다. 주소는 **https://lovetree-4-0.pages.dev/** 다. Pages 프로젝트 이름에는 소문자·숫자·대시만 쓸 수 있어 점이 들어간 `lovetree-4.0.pages.dev`는 만들 수 없다.

- 처음에는 프로덕션 분기를 `ai/com1-integration-review-20261027-071356-cf87f3`로 두고 통합본을 먼저 배포했다(첫 배포 `8af4b7e`, 성공). 빌드 명령 `npm run build`, 출력 `dist`, 자동 배포 켜짐.
- 병합 뒤 프로덕션 분기를 `main`으로 바꿨다. 이 주소는 이제 `main` 내용이며, `main`에 push하면 다시 빌드·배포된다.
- 정적 프런트만 배포했다. 기록은 방문자 브라우저 localStorage에만 저장되고 서버 저장·로그인·공유·DB는 없다(개발 서버와 달리 정적 호스팅이다).
- 배포 확인: 배포된 JS `index-C-W9KDHd.js`(151,425 B)·CSS `index-C13j1MO_.css`(30,853 B)와 이미지가 로컬 `dist` 빌드와 해시·크기까지 일치, 첫 화면과 `#trees` 책장이 렌더링되고 콘솔 오류가 없다. 사이트 화면을 직접 조작하는 회귀 확인(책장→트리 연결, 390px 등)은 로컬 `127.0.0.1:4420`에서 한 결과와 같고, 배포 주소에서는 렌더링까지만 확인했다.

## 통합 검토 — 2026-10-27

이슈 #26의 통합 브랜치 `ai/com1-integration-review-20261027-071356-cf87f3`(base `origin/main` `bb6c784`)에서 완료 PR 7개를 **merge**로 합쳤다: #16 저장·가져오기 오류 안내(`48c5d1b`) · #17 결정·백로그 문서(`cb00582`) · #18 old 자산 카탈로그(`431afed`) · #19 SRC064 첫 화면·기억책 UI(`6173f88`) · #21 Vite 8.3.5(`02824d1`) · #24 예시 이미지 분리(`1744911`, #19 다음에 merge) · #25 Track32 책장 연결(`8757010`, #19 위에 쌓인 브랜치). cherry-pick 없이 각 PR의 전체 이력을 보존했다. 실제 충돌은 #25 merge의 `docs/HANDOFF.md` 1건뿐이었고 코드 충돌은 없었다(#25는 #19 위에 쌓인 브랜치라 `src/main.js`·`src/views/book.js`도 자동 병합). 양쪽 문단을 모두 보존하고 책장 문단을 통합 상태에 맞게 고쳐 해결했다.

검증: #16~#24 통합 시 `npm ci`(0건) · `npm run check`(테스트 18개·`vite 8.3.5` 빌드) · `npm audit`(0건), 이미지 31개·JSON 참조 33개 유지, 별도 포트 preview에서 31개 모두 200·`image/*`·크기 일치. #25 추가 후에는 `package.json`·lock이 바뀌지 않아 `npm ci`·`npm audit`·이미지 해시 조사를 반복하지 않고 `npm run check`만 다시 실행해 **테스트 18개 유지**·빌드 성공을 확인했다(JS 151.42 kB / gzip 42.73 kB). 브라우저(COM1 `http://127.0.0.1:4420/`, 테스트 기록 2권만 사용)에서 첫 화면 → 책장(2권) → 선택 책 `트리 연결 보기`가 같은 트리 id·제목 표시 → `기억책 펼치기` → `내 책장` 복귀 시 같은 책 선택 유지, 검색(`두 번째` → 1권/2권)·대상 필터(1권/2권)·결과 없음 상태와 복원, 390px 세로 배치(가로 넘침 없음, 필터·보기 전환·권수 표시 접근 가능)를 확인했다. 실기기 터치 드래그와 CGI 장비 재검증은 미확인이다. main 병합과 개별 PR 정리는 최종 병합 판단 때 한다.

## Track32 책장 연결 — 2026-10-27

`#trees`를 Track32 v2.1의 입체 표지·책장 배치를 활용한 실제 트리 목록으로 연결했다. 책 한 권은 기존 트리 한 개의 표현이며, 순간·연결이 제품의 중심이라는 방향과 데이터 모델은 그대로다. 대상별 필터·순간 제목 검색·목록 전환·선택 복원·기억책 이어 읽기와 첫 순간부터 읽기를 제공한다. 선택 영역에서 트리 연결 보기로 직접 이동한다. 같은 대상의 여러 트리는 첫 순간 제목으로 구분한다. 백업·가져오기·삭제·복구 안내는 기존 기능에 연결했다. Track32의 옛 reader·customBooks 저장·외부 폰트는 이식하지 않았다.

책장 브랜치 자체 검증: 테스트 16개 및 빌드 통과. 브라우저에서 새 기록, 같은 대상 2권 필터, 검색 없음, 목록 전환, 방향키/Enter, 기억책 복귀, 선택 새로고침 복원, 단일 백업→가져오기→테스트 사본 삭제, 390px 화면을 확인했다. 빈 책장과 복구 안내는 격리 fixture로 표시 및 콜백을 확인했으며 실기기 터치 드래그는 미확인이다. 그 브랜치에는 #21(Vite)·#24(이미지 분리) 변경이 없었고, 이 통합에서 두 PR과 같은 트리 위에 합쳐졌다. 통합본 재검증 결과는 위 `통합 검토` 항목에 있다.

## UI 연결 작업 — 2026-10-27

SRC064의 원본 CSS·5개 궤도 투영식·40개 예시 자산을 첫 화면에 적용했다. 첫 방문은 예시, 재방문은 실제 브라우저 기록을 표시한다(첫 화면 최대 48장, 목록에서 전체 접근). 순간 감상 → Track59 스타일 기억책 → 기록 추가/수정 → 기존 연결 작업 공간을 같은 데이터로 연결했다. 기억책은 종이·표지·좌우 페이지 레이아웃을 재사용하고 새 데이터 렌더러를 적용했다. 원본의 전체 물리적 페이지 뒤집기·돋보기는 이식하지 않았으며 페이지 전환 애니메이션과 모바일 세로 읽기를 제공한다. 예시 영상은 포스터라고 표시한다. 예시 데이터는 사용자 저장소에 넣지 않는다. SRC064 예시의 다음/분기는 원본 연결대로 감상하며, 다중·순환 연결을 한 부모 트리로 오인하지 않도록 이 예시에서는 연결 그래프 메뉴를 제공하지 않는다.

감상 위치는 선택적 UI 저장값이며, 기록 저장 실패와 분리했다. 복구본 버튼은 정상 상태로 재방문해도 복구 키가 남아 있으면 표시한다. 도메인/저장 코드 및 로컬 모델의 PR #16은 변경하지 않았다. 16개 테스트와 빌드가 통과했고, 브라우저의 첫 기록·다음 기록·연결 이유·새로고침 복원·이어 보기 및 390px 화면을 확인했다. 원본 예시의 inline 이미지는 이슈 #22에서 파일로 분리했다. 이미지 31개·1,016,859바이트를 `public/media/orbit/`에 내용 해시 파일명으로 저장하고 JSON의 이미지 값만 `/media/orbit/…` 경로로 바꿨다(JSON 1,520,551 → 28,909바이트, 카드 40개·비이미지 필드 동일). JS 번들은 약 1.62MB(압축 약 1.14MB)에서 약 125KB(압축 약 35KB)로 줄었지만, 전체 전송량이 같은 비율로 줄지는 않는다(이미지는 개별 요청·개별 캐시). 서버 DB·사진 업로드·58/56 UI는 미구현이다.


old 조사 PR #18은 후보 선택의 근거다. 64 → 59 흐름을 먼저 완성하고 32 책장은 위 작업으로 연결했고 57 상세 화면은 다음 검토 대상이다. 55의 자유 연결을 그대로 가져오려고 현재 한 부모 규칙을 바꾸지는 않는다. #8의 비교 미리보기는 조사 문서와 별도로 남아 있다.

## 로그인·저장 운영 적용 순서 — 2026-10-28

적용한 것은 아직 없다(병합·배포·migration·시크릿·운영 설정 변경은 이번 범위가 아니다). 아래는 순서대로 적용할 때의 계획이고, 각 칸의 대상·설정 이름·검증·복구를 묶었다. 값은 적지 않는다 — 필요 설정은 이름만 적는다.

### 의존 순서와 현재 head (2026-10-28 확인)

`lovetree-4.0`(COM1 저장소) 사슬과 `ai-revenue-lab`(PADIEM 정본) 사슬은 서로를 향한다. 아래 순서대로 합치고 배포한다.

| 순서 | 저장소 | PR | base | head | 내용 |
| --- | --- | --- | --- | --- | --- |
| 1 | ai-revenue-lab | #5963 | main | `c51f6dbef` | 제품 `lovetree-4-0`을 검토 제품 집합에 등록(+ 계약 pin·회귀 시험) |
| 2 | ai-revenue-lab | #5965 | #5963 브랜치 | `db8210d2f` | 읽기 전용 중계 Worker(세션 확인 두 RPC만) |
| 3 | ai-revenue-lab | #5977 | #5965 브랜치 | `7a56d8e74` | 폐기 전용 중계 Worker |
| 4 | ai-revenue-lab | #5984 | #5977 브랜치 | `c5685a8f3` | 1회용 handoff 표로 발급 개방 + 표를 만든 로그인 요청에 견착 + migration 073 |
| 5 | ai-revenue-lab | #5988 | #5984 브랜치 | `33a6ac4cd` | 채팅 로그인 콜백의 handoff 생산(Google) + password 폼 배선 + 시험 하네스 |
| 6 | lovetree-4.0 | #75 | #73 브랜치 | `HEAD`(최종 SHA는 PR 본문에 기록) | **운영 적용 후보 하나** — #71 `7e6f6c7`(= #64 `b30029b6b` 통합본 + Pages 프록시 #69 `2ee5605`) ⊂ #73 `39fc0b3`(관리자 기반 #67·`resolveListen`) ⊂ 이 브랜치(COM2 실행 구성·스키마 적용 경로) |

비교용 #68 `e2884e6`은 보존하되 다시 병합하지 않는다. 컴1 구조 작업 #70 `71f13d32b` → #72 → #74(`9bca923`)는 이번 운영 후보에 섞지 않고 별도 사슬로 둔다(포함 관계 확인: 세 SHA 모두 이 후보에 **없음**).

1~5는 한 번에 모이면 안 된다 — 같은 저장소 스택이라 위→아래로 합친다. 러브트리 쪽은 개별 PR을 다시 순차 병합하지 않는다 — 배포 대상은 위 6번 브랜치 하나다. 6은 1~5가 배포된 뒤에도 단독으로 켜지지 않는다(러브트리는 확인 경로가 없으면 저장을 열지 않는다).

**검증 판정 순서**: 1(제품 등록) → 3(migration 073) → 2·4(중계 배포) → 5(채팅 handoff)가 실제 로그인 검증보다 먼저다. 6·7의 저장 API 설치 준비와 DB·서비스 구성, 9의 역할 표는 미리 놓을 수 있으나 **선행 인증 연결(1·2·3·4·5)이 끝나기 전에는 로그인 사슬 성공으로 판정하지 않는다** — 그 자리에서 나는 503 `auth_unavailable`과 401은 정상이다.

### 단계별 적용·검증·복구

1. 제품 등록 — 대상: Control Plane identity authority Worker. **먼저 현재 값을 확인한다**: 배포된 DO의 `CONTROL_PLANE_ALLOWED_PRODUCTS`와 정본 `ai-revenue-lab` main의 `_ALLOWED_PRODUCTS`(확인 시각 `21cd8c239` = `b62`·`b54-padiem-claw`)를 읽어 적는다. 그 다음 `lovetree-4-0`를 **합집합으로 더하고 절대 덮어쓰지 않는다** — 오래된 PR의 pin(#5963 `c51f6dbef`는 `{b62, b54-padiem-claw, lovetree-4-0}`를 견딘다)을 그대로 올리면 그 뒤에 등록된 다른 제품을 지운다. #5963을 현재 main에 rebase 해 pin과 env를 함께 옮기고, 코드의 pin과 env가 같아야 DO 생성이 통과한다(다르면 실패). 검증: gate·계약 시험(`IDENTITY_PRODUCTS` pin), 채팅 e2e env가 같은 집합인지, 그리고 배포 후 DO의 실제 집합에서 확인한 제품이 지워지지 않고 `lovetree-4-0`가 늘었는지. 복구: 이전 집합 값으로 되돌린 뒤 해당 Worker 재배포.
2. 읽기 중계 배포 — 대상: Cloudflare Worker `lovetree-authority-caller`. 필요 설정: `LOVETREE_CALLER_SECRET`, `IDENTITY_AUTHORITY` service binding. 검증: `LoveTree Authority Caller CI`(읽기 11건 skip=0), 배포 후 `/health`, `/auth-check`, 유효 세션 1건 resolve 200·위조 401. 복구: 이전 버전으로 롤백(공개 표면은 이 중계 하나가 새로 늘어난 자리라 제거는 Worker 배포를 되돌린다).
3. migration 073 적용 — 대상: `padiem-chat-db`(D1). **발급 중계를 검증하기 전에** 적용한다 — `/mint-session`은 handoff 행을 실제로 클레임하므로 표 자리가 먼저 있어야 한다. 필요 설정: 없음(스키마). 검증: D1 gate의 일반 마이그레이션 창(073은 seed=추가 전용으로 분류, apply 창·파괴적 목록에 없음), `lovetree_login_handoffs` 존재·CHECK. 복구: 테이블은 추가 전용이라 남기고 라우트·중계만 되돌린다(드롭은 별도 승인).
4. 발급·폐기 중계 배포 — 대상: Cloudflare Worker `lovetree-auth-caller`. 필요 설정: `LOVETREE_CALLER_SECRET`(러브트리는 두 중계에 같은 env 이름 하나로 서명하므로 **두 중계가 같은 값**이어야 한다), `IDENTITY_AUTHORITY`, `LOVETREE_LOGIN_DB`(D1). 검증: 같은 CI(발급 11건·읽기 11건·D1 gate 18건·cross-lane guard 11건), 배포 후 `/auth-check` methods 확인, 존재하지 않는 표로 `/mint-session` 401. 복구: 롤백은 **이전 배포·이전 설정을 되돌리는 것**이다. `LOVETREE_LOGIN_DB`·시크릿을 빼는 것은 검증을 못 하게 막는 긴급 차단 수단이지 롤백이 아니다. 표 소비는 상태를 `claimed`로 바꾸는 단일 UPDATE이고 **행은 남는다** — 만료는 `expires_at` 조건으로 재사용을 막을 뿐 삭제가 아니며, 지난 행을 지우는 일은 별도 정리(purge) 결정이다(러브트리는 발급 중계가 없어도 조회·폐기를 유지한다).
5. 채팅 handoff 생산 배포 — 대상: `apps/padiem-chat` Worker. 필요 설정: 기존 `session_secret` 재사용(새 시크릿 불요), 코드 소유 allowlist origin에 실제 러브트리 주소 포함 여부 확인. 검증: B62 full regression·browser QA lane, 배포 후 `/auth/lovetree/start`가 기존 Google authorize로 302(redirect_uri 무변경), 로그인 완료 시 러브트리 콜백로만 되돌아감. 복구: 라우트 등록 해제(revert 커밋) — 이미 만든 행은 만료(120초)로 **더 이상 쓸 수 없을 뿐**이고 저절로 삭제되지 않는다(만료 ≠ 삭제). 지우는 일은 별도 정리 결정이다.
6. 러브트리 저장 API 배포 — 대상: COM2 Node 서비스(WSL Ubuntu). 실행 구성은 이 브랜치에 있다(`deploy/host-com2/lovetree-api/`): 유닛은 127.0.0.1:8790 루프백 전용, 노드는 실측 경로 `/usr/local/bin/node`(v22.18.0 — `/usr/bin/node`는 v18이라 `check_config.mjs`가 닫는다), `install.sh`는 dry-run 기본(`--apply`로만 설치하고 시작·활성화·터널 변경·컨테이너 생성은 항상 NO), `check_config.mjs`는 값 출력 없이 깃발만 답한다. 필요 설정 이름: `LOVETREE_PRODUCT_ID`, `LOVETREE_DATABASE_URL`, `LOVETREE_AUTHORITY_TRANSPORT=relay`, `LOVETREE_AUTHORITY_RELAY_URL`, `LOVETREE_CALLER_SECRET`, `LOVETREE_CREDENTIAL_MODULE=./server/credentials/lovetree-credential-module.js`, `LOVETREE_SESSION_SECRET`, `LOVETREE_SESSION_SOURCE`/`LOVETREE_SESSION_COOKIE`, `LOVETREE_AUTHORITY_WRITE_TRANSPORT`, `LOVETREE_LOGIN_PROVIDER_MODULE=./server/padiem-login-provider.js`, `LOVETREE_PADIEM_HANDOFF_START_URL`, `LOVETREE_PUBLIC_ORIGIN`, `LOVETREE_STATE_STORE=postgres`, `LOVETREE_MINT_URL`, `LOVETREE_MAX_BODY_BYTES`, `PORT`(유닛이 8790으로 준다). DB 준비: `server/db/schema.sql`의 다섯 테이블(`lovetree_workspaces`, `lovetree_request_claims`, `lovetree_login_states`, `lovetree_product_roles`, `lovetree_product_role_audit`) — 모두 추가 전용, 적용 경로는 `scripts/apply-schema.mjs --apply` 한 개. 인스턴스는 **러브트리 전용 컨테이너 하나**로 따로 둔다(`postgres.compose.yml` + `postgres.env.example` — 볼륨·네트워크·DB·역할이 전부 독립, 127.0.0.1:5433 루프백만, 기존 `n8n-postgres`에는 DB·역할을 추가하지 않고 포트도 열지 않는다). 검증(배포 전): `npm run check`, PostgreSQL job skip=0, 로컬 두 저장소 연결 시험 6건. 검증(배포 후): 브라우저에서 로그인 → 저장 → 새로고침 → 로그아웃 → 이전 자격 증명 거부, 회원 A/B 격리. 단 1~5가 먼저다 — 인증 선행이 되기 전 이 자리의 정상 응답은 503 `auth_unavailable`·401이고, 그 상태를 로그인 사슬 성공으로 적지 않는다. 복구: 롤백은 이전 배포·이전 설정 복원이다. `LOVETREE_MINT_URL`·`LOVETREE_LOGIN_PROVIDER_MODULE`·확인 경로 env를 빼는 것은 저장과 로그인을 닫는 **긴급 차단** 수단이지 롤백으로 적지 않는다(닫히면 저장은 fail-closed로 열리지 않는다).
7. 프런트 서버 저장 연결 — **구현됨(#57 → PR #59, head `35d1caec8`)**. 화면은 `/auth/login?next=/`로 로그인하고 `GET/PUT /api/workspace`·`POST /auth/logout`을 같은 원진의 상대 경로로 부른다. 동기화는 트리·순간 id와 연결을 보존하고, id 재발급은 파일을 새 사본으로 가져오는 `importTrees`에서만 일어난다. 서버 문서를 덮어쓰는 결정(최초 업로드·채택·충돌 해결)은 사용자 확인을 요구하고, 확인하지 않은 채 서버가 먼저 갱신되면 다시 묻는다. 읽기 응답은 검증된 주체 식별자(`subject`)를 함께 준다 — 올리지 못한 사본을 계정별로 따로 두기 위함이고, 새 설정이나 시크릿은 필요 없다. `#36`은 첫 기록 UX·입력 폼 작업(완료)이고 로그인 UI·서버 동기화와 무관하다.
8. Pages 앞원진 프록시 — **방식은 (b)로 정했고 구현은 #69 `2ee5605`에 있다(#71 `7e6f6c7`을 지나 이 브랜치에 포함).** 화면은 여전히 상대 경로를 부르고, Pages Function이 `/api/workspace`와 필요한 `/auth/*`만 COM2 Node 서비스로 넘긴다(`functions/_lib/proxy.js`가 유일한 규칙이고, `functions/api/[[path]].js`·`functions/auth/[[path]].js`가 진입점, `public/_routes.json`이 SPA 폴백이 이 경로를 삼키지 못하게 한다). 같은 경로에 프록시가 두 개(#68·#69) 생겼고 남은 구현은 하나다 — 기한·읽기 취소·응답 상한·형식 검사는 #68에서, 메서드 제한과 라우팅·로컬 앞원진 검증은 #69에서 왔다(`docs/API-PROXY.md`의 통합 출처). 대상: Cloudflare Pages(러브트리 프런트) Functions + COM2 Node 서비스. 필요 설정: Pages 프로젝트 환경 변수 `LOVETREE_API_ORIGIN`(COM2의 scheme+host만 — scheme·userinfo·query·fragment·path를 거부하고 틀리면 추측하지 않고 닫는다), 두 값은 **같지 않다** — Pages `LOVETREE_API_ORIGIN` = `https://<컴2 API 호스트>`, COM2 `LOVETREE_PUBLIC_ORIGIN` = `https://lovetree-4-0.pages.dev`. 터널 항목 템플릿은 `deploy/host-com2/lovetree-api/tunnel-ingress.example.yml`에 있다 — 운영자가 가진 설정을 덮어쓰지 않고 빠진 호스트네임만 추가하고 offline `ingress validate`를 통과시킨다(HostName은 여기서 정하지 않는다). 브라우저가 보는 주소는 Pages 하나이고 Function이 안에서 COM2로 전달하므로 로그인 시작·콜백·쿠키는 Pages 주소를 기준으로 돈다. 붙이는 경로는 닫힌 목록뿐(`/api/workspace` GET·PUT, `/api/admin/session` GET, `/api/admin/roles` GET, `/auth/login` GET, `/auth/callback` GET·POST, `/auth/logout` POST)이고 그 밖은 프록시가 JSON 404·405로 거둔다. 메서드·query·본문·상태 코드·`Location`·`Set-Cookie`(여러 개)를 재작성 없이 넘기고 302를 따라가지 않는다. 서버 간 중계 비밀은 이 경로를 지나지 않는다 — 서명은 COM2가 자기 발신에 쓴다. 쿠키와 `Location` 재작성은 계약상 필요 없다: COM2는 절대 URL을 요청 Host가 아니라 설정된 공개 origin에서 만들고 Set-Cookie에 Domain을 싣지 않으므로 앞원진에 그대로 붙는다. 검증: `tests/pages-proxy.test.mjs` 16건, 로컬 앞원진(`LOVETREE_DEV_FRONT_PORT=… node scripts/dev-auth-chain.mjs`)에서의 로그인→저장→새로고침 복원→로그아웃→이전 자격 증명 거부와 A/B 격리, 장애가 HTML 성공으로 바뀌지 않는 것(설정 없음 503 JSON, 목록 밖 404 JSON, COM2 정지 502 JSON). 실행 순서: **이 브랜치가 main에 들어가면 CI가 Pages를 자동 배포한다**(별도의 프런트 배포 수순이 없다). Pages에 `LOVETREE_API_ORIGIN`을 등록한 뒤에는 새 배포(redeploy 또는 기존 build 재추적)가 한 번 더 돌아야 Function이 그 값을 읽는다 — 설정만 넣고 배포하지 않으면 프록시는 이전 값을 쓴다. 복구: 롤백은 Function·`_routes.json`과 설정을 이전 배포로 되돌리는 것이고, `LOVETREE_API_ORIGIN`을 지우는 것은 프록시를 닫는 **긴급 차단**이다(닫히면 프런트는 자기 origin의 HTML을 받아 `이 기기에만 저장` 로컬 전용으로 물러서고 서버·기기 기록은 남는다).
9. 최초 관리자 지정(#67) — **외부 HTTP로 첫 관리자를 등록하는 자리는 없다.** 프록시·서버가 여는 관리자 경로는 `GET /api/admin/session`·`GET /api/admin/roles` 둘뿐이고 둘 다 읽기 전용이다. 첫 행은 서버 위에서 운영자가 **감사 이력을 함께 쓰는 저장소 호출**로 싣는다 — `createAdminRoleRepo(pool).assign({ productId, subjectId, role: 'admin', grantedBy: 'operator:<운영자>', reason: '최초 등록' })`. 이 경로는 `lovetree_product_roles` 행과 `lovetree_product_role_audit` 행을 같은 호출로 남긴다. **`INSERT INTO lovetree_product_roles`를 직접 놓는 것은 일반 절차로 권장하지 않는다** — 이력이 남지 않아 되물을 근거가 없다(저장소가 죽은 응급 시에만 별도 승인, 복구 후 이력 메꾸는 기록). 근거는 언제나 서버가 확인한 canonical subject이고, 확인된 subject 값은 비공개 운영 절차에 둔다.
   - 대상: COM2 PostgreSQL `lovetree_product_roles`(+ `lovetree_product_role_audit`). 필요 설정: 없음(역할 등록은 env가 아니라 행이다).
   - 검증: 등록 후 `GET /api/admin/session`이 `admin:true`, 다른 계정은 `admin:false`이고 `/api/admin/roles`는 403. 부여·회수는 두 번째부터 관리자 본인만(`server/admin-roles.js`의 `assign`·`revoke`)이고 이력으로 남는다.
   - 금지: 지정 이메일·실제 subject·시크릿을 저장소나 공개 이슈에 적지 않는다(승인된 비공개 운영 절차에 남긴다). 브라우저가 보낸 이메일·헤더·localStorage는 근거가 아니다.
   - 복구: 행을 DELETE 하면 즉시 역할이 사라지고(감사 행은 남는다), 테이블 자체는 추가 전용이라 되돌림도 라우트·배포 단위다.

### 이미 준비된 것과 아직 필요한 것

- 준비됨: 위 1~5의 코드·시험·CI(발급 11/읽기 11/gate 18/guard 11/B62 full regression pass), 러브트리(#37/#49/#52) 코드와 CI(ubuntu·windows·Pages·GitGuardian·PostgreSQL), 두 저장소 연결 시험 6건(실제 push된 SHA 청결 확인 포함), 실제 브라우저 판정(로그인→저장→새로고침 복원→로그아웃→세션 없음 거부, 회원 A/B 격리) — 국소 composition, 스텁 Google/모형 권위.
- 아직 필요: PR 병합(어떤 것도 main에 없다), 두 Worker·채팅·러브트리 배포, migration 073 실행, `LOVETREE_LOGIN_DB` 바인딩, 시크릿 생성·등록(`LOVETREE_CALLER_SECRET`·`LOVETREE_SESSION_SECRET`), COM2 PostgreSQL **전용 컨테이너 생성**과 `scripts/apply-schema.mjs --apply`로 표 다섯 개 적용(유일한 경로 — 아직 실행하지 않았다), 서비스 설치(`install.sh --apply`)와 `.env` 값 채우기, allowlist에 실제 배포 origin 확정, **기존 `cloudflared-padiem` 터널에 러브트리 API 호스트네임 1개 추가**(실 설정은 `/opt/padiem/cloudflared/config.yml`에 이미 `files`·`b14`·`mesh` 세 항과 catch-all 404가 걸어져 있다 — 덮어쓰지 말고 한 항만 더하고 offline `ingress validate`), **Pages Function 배포와 두 설정** — Pages `LOVETREE_API_ORIGIN` = `https://<컴2 API 호스트>`, COM2 `LOVETREE_PUBLIC_ORIGIN` = `https://lovetree-4-0.pages.dev`(서로 다른 두 값이고, 브라우저는 Pages 주소만 본다. 설정을 넣은 뒤에는 Pages 재배포가 한 번 더 필요하다). 이 브랜치가 main에 들어가면 Pages는 자동 배포된다, 실제 Google 계정으로 1회 왕복(크로스 사이트 쿠키 포함), password leg의 실제 화면 왕복. 프런트 서버 저장 연결(`#57`)은 #59로 구현되어 위 사슬의 7번째 칸에 있고 운영 후보(위 6번)에 이미 포함된다.
- 이번 브라우저 판정에서 확인하지 못한 것: (a) 운영 Google 화면·운영 채팅 셸을 지난 왕복 — 로컬 스텁authorize·하네스 API라 채팅 셸(`/`)이 없어 대화상자 왕복은 자동 시험으로만 확인했고, (b) 폐기된 canonical 세션 id를 직접 넣어 받는 거부는 브라우저가 Cookie 헤더를 덮어쓸 수 없어 자동 시험(서버측)이 담당한다.

### 실행 기록 (2026-10-28)

- 두 저장소 연결 시험: lovetree-4.0 `15d7b07d123b0aa8a51490531698f320d3fc51cd`, ai-revenue-lab `33a6ac4cd45702403b602f1da6f9d0f25d991369` 6 pass / 0 fail.
- 위 시험 이후 #52에 추가된 커밋은 이 문서의 수정뿐이다(`git diff --stat 15d7b07..HEAD` → `docs/HANDOFF.md` 한 파일). 코드가 같으므로 연결 시험을 되풀이하지 않고 이 사실만 남긴다.
- 실제 브라우저(로컬 런너 `scripts/dev-auth-chain.mjs`): 회원 A 로그인→저장(revision 1)→새로고침 후 동일 문서→로그아웃→비로그인 401; 회원 B는 빈 문서(revision 0)에서 시작해 자기 저장만 하고, A의 문서는 B의 저장으로 옮지 않음.
- 연결 시험 재실행(통합 head `7301686`에서): 중계 Worker 지정 시험 21 pass / 0 fail(`authority-link` 11 + `login-issuance-flow` 10), 두 저장소 교차 시험 6 pass / 0 fail. #52가 `15d7b07` 이후 문서 외 코드가 달라지지 않았고, 이후 #59가 읽기 응답에 `subject`를 추가한 자리가 이 시험들의 통과 범위에 포함된다. CI의 `check`·`PostgreSQL` job은 Worker·교차 시험을 실행하지 않는다(env 미설정 → 스킵).
- Pages 앞원진 프록시 판정(로컬): 앞원진 8795 + COM2 8791로 로그인→저장(revision 1)→새로고침 복원→로그아웃→이전 자격 증명 401 거부, B는 revision 0 빈 문서에서 시작해 자기 순간만 저장, A 복귀 시 A 문서 revision 1 그대로. 목록 밖 `/api/other`는 404 JSON, `/auth/logout` GET은 405 JSON, 설정 없으면 503 JSON — HTML 성공 응답으로 바뀌는 일은 없다.
- 계정 경계 브라우저 판정(#59 `77dd201` 이후): A 미전송 기록 → 900ms 안 로그아웃 → 사본은 A 주체로만 보관되고 작업 사본은 비움 → B 로그인은 빈 문서에서 시작(화면·업로드 후보·자동 PUT에 A 없음) → B 정상 저장 → A 복귀 시 보관 사본 복원. 응답만 유실된 저장은 같은 요청 키 재시로 복제 회신(revision 유지, 409 착각 없음).
- 화면 판정(PR #64 `859301d`에서 검토자 직접 확인 통과): PC 기억책 페이지 이동 가림 해소(짧음·김 두 상태 모두 가림 0·첫 화면 안), 모바일 390px 흐름 배치 유지. 같은 브랜치에 후속 견고화 `b30029b`(검증 실패한 서버 문서도 서버 기록으로 읽지 않음)이 올라 head는 `b30029b6b`.
- 컴2 실측(2026-10-28, 이 기계의 WSL Ubuntu가 COM2 — 읽기 전용 확인만 했다): `cloudflared-padiem.service`는 active·enabled(로컬 관리형)이고 실 설정 `/opt/padiem/cloudflared/config.yml`에 `files.padiem.net→127.0.0.1:8788`·`b14.padiem.net→127.0.0.1:8789`·`mesh.padiem.net→127.0.0.1:4443` + catch-all 404가 이미 걸려 있다. `padiem-file-lane.service`도 active·enabled(127.0.0.1:8788 청취, `.env` 139바이트). 노드는 `/usr/local/bin/node`가 v22.18.0이고 `/usr/bin/node`는 v18.19.1 — 유닛과 인스톨러는 앞의 경로 하나만 부른다. 8790과 5433은 청취 없다. Docker에 `postgres:15-alpine`이 이미 받아져 있고 `n8n-postgres`가 healthy로 도나 5432를 호스트로 공개하지 않고 기본 역할도 아니다 — 러브트리는 그 인스턴스를 같이 쓰지 않고 전용 컨테이너(볼륨·네트워크·DB·역할 분리)로 떨어둔다. **미확인**: `n8n-postgres`의 기존 DB·역할 목록(조회하려면 자격 증명이 필요해 하지 않았다), 터널의 DNS 라우팅 방식과 Cloudflare에 붙은 실제 레코드, `padiem-command-center`(100.124.21.64)가 같은 박스인지 별도 박스인지.
- 이전 정정: `COM2_HOST_FACTS_20261026.md`의 "cloudflared 미가동"·"`/opt/padiem/cloudflared/.env` 0바이트"·"PostgreSQL 없음"은 10-26 스냅샷이고 10-27 설치로 상황이 바뀌었다. 저장소 기록만으로 host의 현재를 단정하지 말고, host 실측과 구분해 적는다.

## Owner가 정한 방향

러브버드 2.0과 러브트리-리모네 3.0의 자산을 참고하되 새로 설계할 수 있다. 팬이 좋아하는 대상과 관련된 순간·감정·이유를 기록하고 연결하는 경험에 집중한다. 범용 생각 정리/지식/업무 서비스는 별도 서비스로 분리한다. 첫 화면은 SRC064 부유 카드로 선택했다. 후속 화면은 old 자산을 우선 재사용한다. 기존 DB의 회원은 Owner가 만든 테스트 데이터이며 이전 의무가 없다.

COM1의 지정 폴더가 기준 로컬, GitHub main이 공유 이력이다. CGI에는 별도 clone을 둔다. 각 AI 작업은 장비/작업별 branch + worktree에서 진행한다. COM2의 PADIEM 서버와 기존 배포는 이번 작업 대상이 아니다.

## 이번 버전에서 실제로 되는 것

- 첫 순간 작성: 대상, 제목, 짧은 기록, 감정, 날짜, 선택 원본 링크.
- 선택한 순간에서 다음 순간 연결, 연결 이유 기록, 트리/시간순 보기, 확대/축소, 수정/삭제.
- 내 트리 목록과 검색. 가상 샘플 트리 3개는 읽기 전용이다.
- 브라우저 localStorage 저장과 새로고침 복원, JSON 내보내기와 새 사본 가져오기.
- 잘못된 가져오기 검증, 손상 데이터 보존, 여러 탭의 덮어쓰기 방지, 저장 실패 알림.

로그인, 서버 DB, 다른 기기 간 자동 동기화, 실제 사용자 공개 피드, 이미지 업로드, 결제는 구현하지 않았다. 브라우저 데이터를 지우면 기록을 잃을 수 있으므로 JSON 백업이 필요하다. Git 동기화는 코드 동기화이며 이용자 기록을 동기화하지 않는다.

## 구조와 검증

Vite + 표준 JavaScript 모듈. `src/domain.js`는 데이터 규칙, `src/storage.js`는 저장 경계, `src/main.js`는 화면/이벤트, `src/styles.css`는 디자인이다. 인증과 서버 저장이 필요해지면 저장 어댑터를 확장한다. 미리 특정 프레임워크나 COM2 서버에 종속시키지 않았다.

`npm run check`는 데이터 규칙/복구/충돌 방지, 저장·가져오기 오류 안내(PR #16), 감상 UI 보조 함수(PR #19)를 포함한 테스트 24개와 프로덕션 빌드를 실행한다. 브라우저에서 첫 트리 작성 → 두 번째 순간 연결 → 새로고침 복원, 시간순 보기와 순간 수정을 확인했다. HTTP 미리보기에서 발견한 UUID 생성 호환성 문제를 수정하고 회귀 테스트를 추가했다. GitHub CI는 Windows와 Linux에서 같은 검증을 수행한다. Windows 예약 이름 `com1`이 Git ref의 단독 폴더가 되지 않도록 작업 브랜치는 `ai/com1-작업명-고유값` 형태를 사용한다.

원본 HTML 5개는 `reference/originals/`에 바이트 그대로 보관했다. 출처와 Git blob SHA는 `reference/SOURCES.md`에 있다. 참고 HTML은 제품 번들에 포함하지 않는다. 옛 문서의 공개 기본값/비공개 유료화/임의 통계는 현재 정책으로 승계하지 않는다.

## 다음 작업의 권장 순서

1. 실제 팬의 순간 3~5개로 첫 입력의 부담과 연결 이유의 유용성을 검토한다. 필요하면 문구와 화면을 조정한다.
2. 대상 단위의 트리, 순간 분기, 공개 범위의 제품 규칙을 정한다. 지금의 트리는 단일 시작점과 한 부모를 갖는 구조다.
3. 로그인과 서버 저장을 붙이고 권한·백업·삭제 규칙을 검증한다. Cloudflare Worker/D1 등 구체적 운영 선택은 이 단계에서 확정한다.
4. 기록이 충분히 쌓이는지 확인한 뒤 선택적 공유와 발견 기능을 추가한다.

각 AI는 먼저 `AGENTS.md`, `docs/PRODUCT.md`, `docs/DEVELOPMENT.md`를 읽는다. 최신 상태는 이 문서의 날짜보다 `git log`, `git status`, 현재 브랜치와 PR을 우선 확인한다. 검증하지 않은 기능을 완료로 기록하지 않는다.

2026-10-27 KST 초기 구축 확인: COM1·CGI 기준 사본과 각 AI worktree에 동일 소스를 연결했다. 양쪽 설치/테스트 13개/빌드, GitHub push 권한과 로컬 HTTP 응답을 확인했다. 소스 커밋 `8e787e2`의 GitHub Windows/Linux CI도 성공했다. 390px 모바일 폭에서 발견한 첫 화면 가로 넘침을 수정하고 다시 확인했다. 실행 경로와 시작 방법은 `docs/DEVELOPMENT.md`에 있다.

2026-10-27 KST 저장 기능 점검(COM1): 첫 기록·연결·수정·삭제·저장/복원·JSON 가져오기 규칙을 테스트로 재확인했고 핵심 로직은 정상이었다. 세 가지 결함을 범위 안에서만 수정했다. ① 신뢰할 수 없는 JSON의 트리/순간 항목이 `null`이면 영문 TypeError가 그대로 노출되던 것을 안내 문구로 바꿨다. ② 순간 수정이 검증 전 원본 `relation`을 다시 다듬어 숫자 등 문자열이 아닌 값에서 예외가 나던 것을 검증된 값 사용으로 바꿨다. ③ `saveState`가 저장소 읽기 실패를 안내 없이 던지던 것을 `loadState`와 같은 문구로 맞췄다. 테스트 15개와 빌드가 통과한다. 남은 것: 손상 복구 사본 내보내기 버튼은 손상이 감지된 그 화면에서만 보이므로, 새로고침 뒤에도 복구본을 내보낼 수 있게 할지는 UI 담당이 정한다.

## 2026-10-31 — 4.1 UI 통일성 보완 (#116)

4.1 어댑터 범위에서 책장 --latin을 Pretendard로 통일하고 조작 글자 14px·보조 표시 11~12px, 관계 지도 글자 대비를 보완. 기억책 열기 명칭과 예시/책 표기를 맞추고 관계 지도 설명을 간결하게 교정. 모바일 보드는 공통 shell/선택창에 화면명이 있으므로 팬되는 캔버스 중복 제목을 숨겨 겹침을 제거. 표지 제목은 단어 단위 줄바꿈. 첫 화면의 기존 SRC064 로고·금테·카메라는 유지하고 4.1 홈 어댑터에서 버튼 글자와 좁은 화면 메뉴 줄바꿈만 보완.

검증: npm run check 236건 중 203 pass·0 fail·33 환경 의존 skip, build 통과. COM1 Tabbit CSS viewport 1280×900 / 390×844에서 다섯 화면을 캡처해 육안 검수, 가로 넘침 0·서체/메뉴 크기 확인. 다운로드·회원 데이터 쓰기 없음. 실기기·스크린리더는 이번 검증에 포함하지 않음. 원본 reference, 4.0 src 화면, 인증/DB 계약 변경 없음.

## 2026-11-01 — #14 회원 미디어의 URL 기반 표시

기존 src/media.js의 LoveBud 기반 YouTube/시점 파서를 4.1 정적 어댑터에 재사용(public/v41/media-preview.js), 동작 동일성 회귀로 대조. 기존 url만 사용하므로 도메인/서버/DB/백업 형식을 바꾸지 않음. 직접 HTTPS 사진(png/jpg/jpeg/webp/avif/gif)·영상(mp4/webm/ogv) URL과 YouTube를 구분하며 확장자가 없는 URL은 일반 원본 링크로 유지. 직접 링크의 유지 수명은 원본 사이트에 따름. 파일 업로드는 이 조각에 없음.

기억책·보드·관계 지도 상세와 공통 작성창에서 사용자가 불러오기를 누른 뒤에만 사진/영상/YouTube 썸네일 요청. 영상은 controls·수동 재생, YouTube 영상은 원본 링크 + 시작 시점. 실패 시 재시도와 원본 링크를 유지하고 재생 성공으로 위장하지 않음. 예시 디자인 파일/첫 화면 금테·카메라는 미변경. 회원 URL을 예시 이미지로 대체하지 않음.

검증: npm run check 241건(208 pass·0 fail·33 환경 의존 skip), inline scripts 7개 구문 검사. 격리 파일 fixture로 Tabbit PC/390px의 사진·영상·시점·깨진 링크와 자동 요청/재생 방지 확인. 현재 #14는 파일 업로드·별도 저장 경로/한도/삭제 수명 결정과 연결이 남아 있어 닫지 않음. 운영 회원 데이터 쓰기·JSON 다운로드 없이 검수.

## 2026-11-06 — #14 외부 미디어 요청 정책 코드 기준

초기 마크업에는 미디어 `src`나 iframe을 만들지 않으며, 사진·영상·썸네일 요청은 사용자가 불러오기를 누른 뒤 시작한다. 원본 링크는 새 탭에서 `noopener noreferrer`와 `no-referrer`를 사용하고, 이미지 원소도 `no-referrer`를 명시한다. 영상 원소에는 현재 별도 referrer 정책이 설정되지 않으므로 실제 요청 헤더와 브라우저별 개인정보 영향은 로그인 가능한 시험 계정으로 확인해야 한다. 이는 코드 기준 기록이며 실회원 화면에서의 운영 검증 완료를 뜻하지 않는다.

## 2026-11-01 — LoveTree 4.1 책장 관리 완료 (#118)

책장을 서버가 소유하고 현재 계정이 쓸 수 있는 트리만 관리하도록 연결했다. 트리 제목·대상(subject)·대표 순간(선택적 비공개 업로드 사진 포함)을 한 흐름에서 수정하고, 닫을 때 미저장 변경을 확인하며, 트리 삭제는 순간 편집기에서 책 관리 화면으로 옮겼다. 대표 순간 삭제와 가져오기 ID 재매핑 때 coverMomentId를 안전하게 정리한다. Track32 실제 책장은 실제 대상 메타데이터와 검색만 사용하고 근거 없는 K-pop/배우/작품·캐릭터 고정 분류를 제거했다. 외부 사진·영상·링크는 자동 요청하지 않고 금테 장식 표지로 대체해 #14 비공개 미디어 원칙을 유지한다.

구현 PR #127: head `b67ed23d02c66d58163515d77eb792ed734324b4`, merge `80288c2c6184544edc56cdce65aa0d0d51f5e27b`, main CI `41228425641`, Pages `a4a2c45a-180d-42c7-aec3-0163f026c85f`. 최초 운영 검증에서 디자인 예시 iframe의 `LTMedia is not defined` 및 남은 고정 필터를 발견해 완료 처리하지 않고 후속 PR #128로 수정했다. 후속 head `8ec979ee5910bd0a5a8951b622e87861b7ee0594`, merge `a1463ffd210eedaca584174316081f6179658f60`, PR/branch CI `41228928592`·`41228913176`, main CI `41229034060`, Pages `2f67dc06-2bd3-4d3a-89d6-7845fb245277`.

최종 전체 `npm run check`: 256 subtests / 255 tests + 1 suite, 222 pass, 0 fail, 33 환경 의존 skip, Vite build 성공. 공식 Tabbit CLI로 운영 `https://lovetree-4-0.pages.dev/v41/#shelf`를 1440×900·390×844에서 재검증했고 책 카드 1, 고정 필터 0, 가로 넘침 0, pageerror 0이었다. 격리 fixture에서 긴 제목·사진 대표·대표 없음·영상 대체 표지, 대상 검색 3→1, 관리 dialog와 44px 조작 영역을 확인했다. 실제 Google 로그인·실회원 저장 E2E, 실기기·스크린리더 검증은 사람 조작이 필요한 미검증 범위이며 완료로 간주하지 않는다. 기존 실제 사용자 기록과 COM2는 변경하지 않았다.

## 2026-11-01 — LoveTree 4.1 선택·읽던 위치/주소 완료 (#119)

4.1 회원 기록은 로그인 주체별로 마지막 트리·순간·보기를 포인터만 저장하고, 새로고침·재진입 때 같은 위치로 돌아간다. 소유자 전용 주소는 `#my/<view>?tree=…&moment=…`이며 선택·보기 변경을 history에 남겨 뒤로/앞으로도 같은 위치를 복원한다. URL ID는 현재 계정의 서버 workspace 안에서 다시 검증한다. 삭제·미존재·현재 계정에 없는 ID는 최근 위치 또는 트리 시작 순간으로 대체하고 안내한다. `#share/…`는 공개 범위로 분리해 account 쿼리나 로그인 쿠키 조건이 있어도 비공개 workspace를 자동으로 읽지 않는다. 저장 포인터와 로그인 왕복용 sessionStorage에는 subject/treeId/momentId/view만 두고 기록 본문·인증 비밀은 넣지 않았다. 서버 state 스키마와 COM2는 변경하지 않았다.

PR #130: head `fa93ac1f202687882aee8bdcc29ae62418f0dbe0`, merge `0ddb67e2bc6064b710a301a1bfe6f3bbefd7258c`. PR/branch CI `41231028832`·`41231005514`, main CI `41231110576` 모두 PostgreSQL·Ubuntu·Windows 성공. Cloudflare preview `04bc91d5-1237-408c-bc67-55ab45bd13e0`, production `3eb33d71-c4b8-46b3-8648-0bfa44a31ab1`.

전체 `npm run check`: 261 subtests / 260 tests + 1 suite, 227 pass, 0 fail, 33 환경 의존 skip, Vite build 성공. 공식 Tabbit CLI 격리 fixture에서 1440×900·390×844, 직접 주소, 새로고침, 트리 왕복, 순간 삭제, 뒤로/앞으로, 계정 A/B 전환을 확인했고 가로 넘침 0, 390px 조작 높이 44px, pageerror 0이었다. 운영에서는 `https://lovetree-4-0.pages.dev/v41/?account=1#share/prod-smoke/book`가 workspace 요청 0·비공개 컨텍스트 null임을 PC/390px에서 확인했고, 소유자 주소는 강제 401 실패 fixture에서 로그인 안내와 포인터만 유지했다. 실제 Google 로그인·실회원 재로그인 E2E, 실기기·스크린리더는 사람 조작이 필요한 미검증 범위이며 완료로 간주하지 않는다.


## 2026-11-01 — LoveTree 4.1 명시적 공유·회수 완료 (#120)

공유는 기본 비공개를 유지하고 소유자가 미리보기한 한 권의 트리만 명시적으로 발행한다. 공개 응답은 서버가 최신 workspace에서 해당 트리만 투영하며, 다른 트리·계정 주체·비공개 업로드 URL은 포함하지 않는다. 미리보기 토큰이 없거나 그 뒤 내용이 바뀌면 발행을 거절한다. 공개 주소는 기억책·기억 보드·관계 지도 및 선택한 순간으로 바로 들어가며, 소유자 수정은 새로고침에 반영되고 회수 직후 다음 원본 요청부터 410과 `no-store`로 차단된다. 오래된 공개 기본값·과금·최소 공개 순간 규칙은 승계하지 않았고 발견/커뮤니티는 #121의 별도 opt-in 범위로 남겼다.

구현 PR #132: head `c0e1261f07fd053761b9a8b2824b8b2ea6a35953`, merge `20eff7a43fcea02b87b6b30d579ab6455d1838eb`. PR/branch CI `41233355246`·`41233316387`, main CI `41233425407`, preview Pages `d23575f2-a423-4bc3-83c2-8daac7b0c7d0`. 배포 전 스키마 적용 검사가 새 테이블을 확인하지 않는 문제를 별도 PR #133으로 보완했다: head `6400c32e5fe95838421b985437ddfc1484e9f34a`, merge `977a55f818f12be1f3e3212e037d558e99039e88`, CI `41233585544`·`41233648543`, 최종 main CI `41233714485`, preview Pages `8208e699-7db4-40cb-a8a4-741385cac390`, production Pages `dbac8c22-8f83-4757-b9d2-b7812f90784f`.

구현 worktree 전체 `npm run check`는 268 subtests / 267 tests + 1 suite, 233 pass, 0 fail, 34 환경 의존 skip 및 Vite build 성공. 공유 집중 시험은 23 tests, 22 pass, 0 fail, 로컬 PostgreSQL 1 skip였고 CI PostgreSQL lane은 skip 없이 성공했다. 배포 보완 회귀 시험 1건도 통과했다. 격리 fixture와 공식 Tabbit에서 미리보기→발행→비회원 감상→선택 보기 전환→회수→410, 공개 화면의 workspace 요청 0건·비공개 미디어 0건·다른 트리 0건, PC 1440×900·390×844 문서 가로 넘침 0과 모바일 핵심 조작 44px를 확인했다. 공유 화면에서 HTML `hidden`보다 강한 표시 규칙 때문에 소유자 버튼이 보이던 실제 오류도 `[hidden]` 규칙으로 수정 후 재검증했다.

COM2에는 최종 merge `977a55f818f12be1f3e3212e037d558e99039e88`의 서버를 적용하고 `lovetree_shares`를 포함한 6개 테이블 검사를 모두 통과했으며 `lovetree-api.service` active와 설치 파일 일치를 확인했다. 운영 `https://lovetree-4-0.pages.dev/v41/`에서는 공식 Tabbit으로 잘못된 주소 `share_invalid`와 미존재 주소 `share_not_found`의 구분된 404·`no-store`, 공개 오류 화면의 소유자 기능 0·workspace 요청 0, PC/390px 문서 가로 넘침 0을 확인했다. 첫 화면의 `러브트리 · MEMORY ORBIT`, 40개 오빗 카드, 첫 순간, 금테(`rgb(242, 205, 124)`)와 광택도 보존됐다.

실제 Google 로그인·실회원으로 운영 발행→비회원 감상→회수 E2E, 실기기·스크린리더 검증은 사람 조작이 필요해 수행하지 않았다. 인증 우회나 기존 실제 사용자 기록의 변경·삭제·자동 공개는 하지 않았다.


## 2026-11-01 — LoveTree 4.1 발견·커뮤니티 완료 (#121)

발견은 링크 공유와 분리된 소유자 명시 동의 기능이다. 공유 링크를 만들거나 기존 공개 링크가 있다는 이유만으로 발견 목록에 올라가지 않으며, 기본값과 기존 행은 비공개다. 소유자가 활성 공유를 발견에 올리거나 내릴 수 있고, 목록은 최신 공개 순만 제공하며 인기·추천 순위와 자동 승계 과금은 없다. 검색·감정 필터·페이지 이동, 원본 공유를 가리키는 즐겨찾기·반응·댓글·신고·차단을 추가했다. “내 기록 새로 시작”은 원본을 복제하지 않고 대상 이름만 채운 새 비공개 트리를 만든다. 회수·삭제·관리자 숨김은 발견과 상호작용에서 즉시 제외되며, 관리자는 원본 기록을 수정하지 않고 발견 노출·댓글만 감사 기록과 함께 조정한다. 커뮤니티 테이블은 workspace JSON과 분리했고 공개 DTO에서 계정 주체·정규 ID·비공개 미디어 URL을 제거했다.

PR #135: head `e4e7ce98678cb3c53c672a5ef080566d248c5aac`, merge `6900df8aa446dfe0201d01997457fae04c4abe16`. PR CI `41236824880`·`41236853936`, main CI `41237225649`에서 PostgreSQL·Ubuntu·Windows가 모두 성공했다. Cloudflare preview `1489634c-4c81-49a9-bbef-b8f9f05ff4bb`, production `5456487d-d44b-4841-af3c-5ca3338b5db2`. 로컬 전체 `npm run check`는 279 subtests / 278 tests + 1 suite, 243 pass, 0 fail, 35 환경 의존 skip 및 Vite build 성공이었고, CI PostgreSQL lane은 실제 격리 DB에서 동시 댓글 idempotency·숨김/복원·감사·차단을 skip 없이 검증했다.

COM2에는 merge `6900df8aa446dfe0201d01997457fae04c4abe16`의 변경 서버 파일만 적용했다. 적용 전 파일은 `/opt/padiem/lovetree-api/.deploy-backups/20261101-issue121-pre-6900df8aa446dfe0201d01997457fae04c4abe16`에 보존했다. 설치 파일은 가져온 commit과 byte 비교했고, `lovetree_shares`의 발견 열 및 7개 커뮤니티 테이블을 포함한 필수 13개 테이블 검사를 모두 통과했다. `lovetree-api.service`는 재시작 뒤 active·NRestarts 0·127.0.0.1:8790 listen이며 익명 `GET /api/community/shares?limit=1`은 200 JSON, `no-store`로 응답했다.

공식 Tabbit CLI로 운영 `https://lovetree-4-0.pages.dev/v41/`을 1440×900·390×844에서 검증했다. 첫 SRC064 화면에서 발견 진입이 보이고, PC·모바일 모두 40개 오빗 카드, `러브트리 · MEMORY ORBIT` 로고, 금테 `rgb(242, 205, 124)`와 기존 광택, 문서 가로 넘침 0, 보이는 상단 조작 44px 이상을 확인했다. 운영 발견 목록은 기존 공유를 자동 공개하지 않아 0개이며, “공개에 동의한 트리만”과 최신 공개 순·비추천 안내가 정상 표시되고 pageerror가 없었다. preview에서 COM2 반영 전 발생한 503은 서버 배포 뒤 운영 200으로 해소했다.

실제 Google 로그인·실회원의 발견 opt-in→비회원 발견→반응/댓글/회수 E2E, 실기기·스크린리더 검증은 사람 조작이 필요해 수행하지 않았다. 인증 우회, 기존 사용자 기록 변경·삭제·자동 공개, 관리자 권한 가장은 하지 않았다. 서버 쓰기 속도 제한은 현재 프로세스 인스턴스별이다.


### 2026-11-01 4.1 주소 및 인증 복구

- `lovetree.padiem.net/`에서 4.1을 내부 제공하여 주소 이동 없이 사용한다. 기존 pages.dev의 4.0 및 `/v41/` 링크는 유지한다.
- API가 401을 반환하면 표시용 쿠키 유무와 관계없이 세션 갱신을 시도한다. 갱신 실패 시 로그인 재확인 안내를 표시한다.
- 표시용 쿠키가 사라진 원인과 실제 Google 회원의 업로드·재로그인 왕복은 별도 실측이 필요하다.


### 2026-11-01 — 보관 파일 목록 중복 표시

실제 회원 시험에서 목록 자동 조회와 수동 새로고침이 겹치면 파일 하나가 두 행으로 표시됐다. 최신 목록 요청만 표시하고 창 닫기·초기화 후 늦은 응답을 무시한다. 역순 응답 회귀 시험을 추가했다. COM1 연결 지연으로 실제 브라우저 재검증은 아직 필요하다.


### 2026-11-01 — 첫 작성 진입과 공유 주소 안내

첫 순간 작성은 비로그인 시 로그인 안내를 열고, 로그인과 서버 기록 확인 후 새 트리 작성창으로 이어진다. 손님에게 계정 기록 불러오기·로그아웃을 숨긴다. 예시의 마지막 순간에서 첫 순간으로 이어지던 부모 연결은 4.0 첫 화면과 4.1 예시 두 곳에서 함께 제거했다. 공유 링크 첫 진입 시 예시 프레임이 주소를 바꾸지 않도록 하고, 잘못된/회수된 주소 안내를 유지한다.

검증: 관련 회귀 시험과 전체 check, 모바일 손님 흐름·가짜 계정 로그인 복귀 및 회수 주소 브라우저 점검. 실제 Google 신규 회원의 전체 가입 왕복과 실기기는 별도 확인이 필요하다. 관계 지도 가독성, 모바일 상단 정리, 발견 빈 화면, 영어 표기 및 인증 쿠키 만료 사례는 추가 확인 항목이다.


### 2026-11-01 — 관계 지도 초기 초점

관계 지도를 열 때 선택한 순간을 화면 중앙에 확대해 보여 주고 모바일에도 해당 순간 이름을 표시한다. 전체 보기 버튼으로 기존 전체 조망을 복원할 수 있다. 리모네 원본의 시각 구성과 실제 연결은 유지하며 390px 및 PC 브라우저로 확인했다. 복잡한 트리의 모든 글자 겹침 방지는 추가 점검이 필요하다.


### 2026-11-01 — 모바일 상단 메뉴

780px 이하에서 작성·로그인은 상단에 두고 발견·트리 선택·공유·연결은 더보기로 묶는다. PC에서는 기존 기능을 모두 바로 노출한다. 390px 및 PC 브라우저에서 메뉴·트리 선택·Esc/초점 복귀·가로 넘침을 확인했으며 실기기 검증은 남는다.


### 2026-11-01 — 만료된 인증 갱신 응답 구분

운영에서 잘못된 갱신 정보의 `/auth/refresh`가 503을 반환하는 현상을 재현했다. 공통 인증 서버의 `400 invalid_grant`만 401 로그인 필요로 바꾸고 해당 호스트의 만료된 인증 쿠키를 지운다. 잘못된 클라이언트 설정과 실제 인증 서버 장애는 503으로 남긴다. 모의 인증 서버로 세 경우를 검증했으며 실제 회원의 자연 만료 15분 경과는 별도 확인한다.


### 2026-11-01 — 예시 연결과 표기 후속

예시의 FAN CAM→기억해 둔 표정 연결이 만든 두 번째 순환을 4.0 첫 화면·4.1 예시에서 함께 제거하고 전체 방향 연결의 순환을 검사한다. 예시 제목과 패널 표기를 한국어로 정리하되 대표가 고른 첫 화면 로고·금테는 유지한다. 첨부 용량은 MB/KB로 실제 바이트를 환산하고, 지도 최초 안내가 선택 도구를 가리지 않도록 제거했다. 없는 공유 주소의 사용자 안내를 정리했다. 실기기와 실제 회수된 공유 주소는 별도 확인이 필요하다.


### 2026-11-03 — 접속·요청·감사 로그 90일 보관

`lovetree_request_claims`, `lovetree_product_role_audit`, `lovetree_community_moderation_audit`만 매일 제한 배치로 정리하는 PostgreSQL 작업과 systemd oneshot/timer 예시를 추가했다. 콘텐츠, 제품 권한 현재 상태, 계정 탈퇴 증거, 결제 기록은 보존 목록에 두었다. API stdout/stderr는 journald 예시(호스트 전체 적용)를 기록했고, Pages Functions 자체 로그가 없어 Cloudflare 관측 로그 보관은 대시보드/계정 설정 항목으로 남겼다. 새 timer는 설치 예시에 포함되나 설치기가 시작·활성화하지 않는다. 상세 분류는 `docs/ACCESS_LOG_RETENTION_20261103.md`.

## 2026-11-08 첫 화면 카드 출처 (#261108 후속)
- `v41/home-cards.js`가 모드·저장·구성 규칙, `v41/home-moments.js`가 사진/글 선별, `v41/home-popular.js`가 기존 공개 API 수집을 맡는다. `v41/home.js`는 `카드: <모드> ▾` 메뉴를 도구 줄에 두고 모드 변경 시 새로고침한다.
- 예시는 선명도 보정 없이 원래 값이고, 내 카드에만 `.card.mine` 금빛 토큰 표시가 붙는다.
- 인기 모드는 새 API·DB 없이 `/api/community/shares` + `/api/public/shares/:id`만 쓴다. 공개 순간에 같은 출처 썸네일이 없으면 예시로 채우고 부족 안내를 보여 준다.
- 컴1 확인: 실제 계정에서 내 것만/섞어서 카드와 금빛 표시, 390 도구 줄 넘침, 인기 카드 클릭의 공개 트리 이동, 클릭 전 외부 요청 0.

## 2026-11-08 기억책 사용성 1~9 (ai/lt-book-usability-261108)
- 규칙은 `public/v41/book-usability.mjs` 한 파일에 모으고, 두 벌의 화면 파일(`views/`·`design/views/track59-sketchbook.html`)에는 `scripts/apply-book-usability.mjs`가 같은 어댑터(`<style id="lt-book-usability">` + `<script type="module">`)를 넣는다. 스크립트는 두 번 돌려도 "변경 없음"이다.
- 셸은 `openEditor(mode,parentId)`·`setEditorMode(mode,parentId)`로 부모를 받고, `lt41-write` 메시지의 `parentId`를 그대로 넘긴다. 제목 고치기는 `lt41-select` 뒤 `lt41-write`(`edit`)로 지금 순간을 먼저 고른다.
- 시험: `tests/v41-book-usability.test.mjs`(1~9 각각 + 두 벌 동기화). 전체 `npm test` 437 pass / 0 fail, `vite build` 성공.
- 컴1 확인(브라우저, 1440·390): 클릭 전 외부 요청 0, embed `start=83`·`rel=0`, 안쪽 스크롤 0, 빈 오른쪽 페이지 문구·단추, 돋보기 기본 꺼짐/저장, 상세 위치·Esc 초점 복귀, 머리 표시 감춤, 연결 안내 숨김·대체 문구.
- 실제 계정이 필요한 확인(대표 계정으로): 제목 고치기가 그 순간 편집기로 열리는지, "다음 순간 남기기"가 부모를 그 순간으로 저장하는지. 예시 모드에서는 기존 규칙대로 로그인 안내가 열린다.

### 2026-11-08 기억책 글꼴 확정 + 로그인 안내 창 제거 후속 (ai/lt-book-font-261108)
- 대표 결정: 밤(기본)은 기억책 큰 제목까지 전부 Pretendard(`--lt-ui`), 마루부리 없음. 정원(`data-lt-theme=garden`)만 큰 제목에 마루부리(한글 포함). 규칙은 `book-usability.mjs`의 `BOOK_TITLE_FONT`·`bookTitleFont(theme)` 한 곳에 있고, `scripts/apply-book-usability.mjs`가 그 값을 그대로 CSS에 넣어 두 벌 화면이 같은 값을 쓴다.
- 적용 스크립트가 스타일·스크립트를 "있으면 같은 자리에서 새 내용으로 교체"하도록 바꿨다. 규칙을 고친 뒤 두 번 실행하면 파일이 맞춰지고, 세 번째는 "변경 없음"이다.
- #215로 `#login-start`가 사라진 뒤 로그아웃 예시 모드 확인: "제목 고치기"·"다음 순간 남기기"가 안내 창 없이 바로 `/auth/login?next=/v41/%3Fintent%3Dnew-tree&lt_theme=<theme>`로 간다(밤·정원 모두). 화면 코드에 `login-start` 참조는 0(시험으로 고정).
- 실측(1440): 밤 = 큰 제목·정보 줄·태그·페이지 번호·상세 제목 모두 Pretendard, 마루부리 상태 `unloaded`. 정원 = 큰 제목·페이지 번호·상세 제목만 MaruBuri, 정보 줄·태그는 Pretendard.

## 2026-11-08 401이면 화면도 로그아웃으로 (#213 1번)
- 원인: `flowNavigation()`이 로그인 여부를 보지 않고 `window.LT41`(예시 트리)만 보고 트리 보기 탭과 "트리: <이름>"을 켰다. 서버가 401인데도 화면이 로그인 상태처럼 보였다.
- `header-state.mjs`의 `treePickerText`·`treeViewsVisible`이 로그인 여부로 문구와 탭을 정한다. 로그아웃은 "트리 고르기", 브라우저에만 남은 미저장 기록은 "저장 안 된 기록"이다.
- `sync-controller.mjs`의 `hasPendingDraft`는 남은 미저장 기록을 지우지 않고 찾아 표시만 한다.
- #215가 없앤 `#login-start` 안내 창과 무관하게 #144(쓰기 중 만료 → 입력 보존 → 다시 로그인 안내 → 재로그인 후 이어서 저장)는 `#save-feedback` 안내로 그대로 동작한다. `tests/v41-header-ia.test.mjs`가 두 계약을 함께 고정한다.
- 컴1 확인: 첫 화면 401 상태에서 "로그인"·"트리 고르기"·카드 메뉴 예시/인기만(1440·390), 390·360 가로 넘침 0.
- `tools/postdeploy/postdeploy.mjs`는 로그인 여부로 기대 탭 수를 정한다(로그아웃 4, 로그인 7). 로그아웃이면 트리 보기 탭이 없고 트리 선택 글자가 "트리 고르기"인지 함께 본다. 빈 프로필 운영 실행 결과 pass=17 fail=0 warn=5 skip=3.

## 2026-11-08 화면 전환 깜빡임 제거 (#211, ai/lt-view-flicker-261108)
- 측정(운영, 로그아웃 예시, 1440, 밤·정원): 전환마다 새 iframe이 **먼저 표시된 채** 문서를 갈아 끼워, 그 화면의 기본 배경(검정 `rgb(0,0,0)`·종이색 `rgb(245,239,226)`)이 무대색과 다른 프레임이 전환당 7~225프레임, 내용이 빈 프레임이 최대 120개(네트워크→첫 화면) 관측. 화면마다 `document.fonts.status`가 `loaded → loading`으로 돌아가며 글자가 늦게 바뀌었고, 전환당 글꼴 요청이 15~20건(대부분 304)이었다. 로그아웃 예시 모드에서는 `/api/` 재요청 0건(재요청은 원인이 아니었다).
- 고치기: 무대에 iframe 두 장(`#view`, `#view-next`)을 겹쳐 두고, 새 화면은 **뒤에서** `load` + `document.fonts.ready` + 본문 내용이 그려질 때까지 기다린 뒤 앞뒤(z-index·id)만 바꾼다. 이전 화면은 그 순간까지 그대로 보이고, 600ms 뒤 `about:blank`로 정리한다. `#stage`·`iframe` 바탕은 `--lt-stage`, `lt-arrive`는 투명도 없이 크기만 쓴다(투명에서 시작하면 무대가 비쳤다). 글꼴은 화면이 드러나기 전에 준비되므로 전환 시 글자 교체가 보이지 않는다.
- 실측(로컬 빌드, 같은 하네스): 빈 바탕 프레임 0(책→보드, 보드→관계 지도, 첫 화면→기억책), 관계 지도→첫 화면은 첫 화면이 원래 대부분 빈 무대라 균일도 판정이 '빈 화면'으로 잡히지만 실제 내용 프레임은 120→7~12개로 줄었다. `/api/` 재요청 0 유지.
- 시험: `tests/v41-journey-garden.test.mjs`의 iframe load 계약을 두 장 교대 방식으로 갱신. `npm test` 441 pass / 0 fail, `vite build` 성공.

## 2026-11-08 상태별 노출 정리 + 첫 트리 말풍선 (#213 3번, ai/lt-header-states-261108)
- `header-state.mjs`에 `headerState({owned,treeCount,publicReading})`·`headerParts(state)`를 두고, 상태를 넷으로 나눴다: 로그아웃(`out`)·로그인 트리 없음(`in-empty`)·트리 있음(`in-trees`)·공유 감상(`share`).
  - `out`: 첫 화면·내 책장·둘러보기 + 로그인. 트리 선택·트리 보기 탭·순간 남기기·공유는 **숨김**.
  - `in-empty`: 계정 동그라미 + "새 트리 만들기". 트리 선택·트리 보기 탭·공유 **숨김**.
  - `in-trees`: "트리: 이름 ▾"·기억책·보드·관계 지도·순간 남기기·공유 **표시**.
  - `share`: 트리 관련 전부 숨김.
- 셸은 이 표를 그대로 적용한다(`flowNavigation`). 예전처럼 트리 탭을 `disabled`로 두지 않고 아예 숨긴다.
- 첫 트리를 만든 직후 한 번만 뜨는 말풍선(`#tree-tips`, role=dialog) 2개: "여기서 순간을 더 남겨요", "기억책·보드·관계 지도로 다르게 봐요". 닫으면 `localStorage['lt41.tips.firstTree']='1'`(try/catch), Esc로 닫고 포커스는 보던 곳으로 돌아간다(#204 규칙). 밤·정원 모두 `--lt-*` 토큰만 쓰고 390·360에서 좌우 12px로 붙는다.
- 시험: `tests/v41-header-states.test.mjs` 9개(상태 표·숨김/표시 배선·말풍선 1회·저장 실패·넘침). `npm test` 450 pass / 0 fail, build 성공.
- `tools/postdeploy`: 로그아웃 탭 기대값 4 → 3, 트리 선택·순간 남기기가 로그아웃에 보이면 fail로 잡게 했다.
## 2026-11-08 첫 화면 도구 줄 "보기" 메뉴 (#213 2번)
- 도구 줄은 이제 버튼 둘이다: "보기 ▾"·"순간 목록". 시각 높이 36·누르는 영역 44.
- 보기 메뉴 항목: 움직임 켜기/멈춤(menuitemcheckbox) · 테마 밤/정원(menuitemradio) · 카드 출처(로그인 4 / 로그아웃 예시·인기). 규칙은 `v41/home-view-menu.js` 한 파일에 있다.
- 동작·저장값은 그대로다(테마 `lt41.theme`, 카드 `lt41.homeCards`, 셸에 알리는 `lt41-theme` 메시지). 열기/닫기는 마우스·ArrowDown·Enter/Space·Home/End·Esc·바깥 클릭(기존 `clickWithin`)로 된다.
- 움직임 상태는 `src/views/orbit.js`가 `dispose.motion`으로 내보내고 메뉴가 읽고 바꾼다(도구 줄 버튼은 없앴다). 첫 화면 안에 중복으로 있던 둘러보기·로그인 버튼은 DOM에서 지웠다.
- 카드 출처 안내(aria-live, #201)는 그대로다. `tools/postdeploy`의 첫 화면 검사는 새 메뉴 기준(테마 항목·카드 항목·도구 줄 2버튼)으로 바꿨다.

## 2026-11-08 헤더 트리 이름에 자동 접미사 제거 연결 (#212 후속, ai/lt-tree-title-261108)
- `public/v41/tree-name.mjs`의 `displayTreeTitle()`을 셸이 처음으로 쓴다(`import`). 저장 데이터는 그대로 두고 표시만 바꾼다: `", 나의 순간들"`로 정확히 끝나고 앞부분이 비어 있지 않을 때만 뗀다.
- 연결한 곳: 헤더 "트리: <이름> ▾"(`#source-label`), 화면 위 문맥 줄(`#context-tree`), 트리 선택 목록(`#trees` option), 트리 보기 탭 묶음의 접근성 이름, 공유 미리보기 요약, 트리 삭제 확인 문구, 둘러보기 목록·미리보기 카드 제목(`community-panel.mjs`).
- 책 정보 편집 입력(`#tree-form` title)은 **저장값 그대로** 둔다(여기서 줄이면 저장이 바뀐다).
- 긴 이름은 헤더에서 말줄임(`max-width:190px` + `text-overflow:ellipsis`), 1440·390·360에서 페이지 넘침 0.
- 시험: `tests/v41-shell-tree-title.test.mjs` 5개. `npm test` 477 pass / 0 fail / 37 skip, build 성공.
