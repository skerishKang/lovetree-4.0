# LoveTree 4.0 — 핸드오프

> **main 보호 규칙(2026-11-09, 룰셋 "main 보호 (PR·필수 검사)")**: main은 PR로만 바꾼다(직접 푸시·force push·삭제 금지, 관리자도 예외 없음 — 비상시 대표가 룰셋 enforcement를 잠깐 끈다). 필수 검사: `check (ubuntu-latest)`·`check (windows-latest)`·`미리보기 postdeploy(로그아웃)` — 셋 다 paths 필터가 없어 문서만 바뀐 PR에서도 항상 돈다. 승인 수 0(레인이 스스로 머지). Deploy Bundle Boot Test는 paths 필터가 있어 필수에 넣지 않았다.

> **빨간 필수 검사 규칭(2026-11-12 사고 뒤)**: 필수 검사가 빨강이면 **재실행은 1회까지**. 같은 항목이 또 빨강이면 멈추고 원인을 찾는다 — 재실행·빈 커밋으로 초록을 만들지 않는다. "간헐적·환경 탓"이라고 적으려면 **같은 시각 이 변경이 없는 브랜치(main 또는 다른 PR)** 에서도 같은 실패가 나는지 대조한 결과를 함께 적는다. 메시지를 받아 화면을 다시 띄우는 코드는 '뜰 때마다 보내는 쪽'과 짝으로 흐름 시험을 하고, 머지 전 미리보기 첫 화면을 5초 이상 직접 본다.

## 2026-11-15 — 지도 다듬기: 새 순간 기본 연결·점 이름표·판 통일·뜻 있는 묶음·이어진 선 (#601, 로컬3 레인, ai/local3-map601-261115, main 841be90 기준, PR #617 → main 36b1332)

- **새 순간 잇기('가' 결정)**: 빠른 추가·자세한 추가에서 부모를 고르지 않으면 **가장 최근 순간**(날짜 최신 → createdAt 최신, `latestMomentId()` — `src/domain.js`와 `public/v41/domain.mjs` 양쪽)에 이어진다. 기존 연결은 그대로(데이터 이동 없음), 서버는 클라이언트가 검증한 상태를 저장이라 규칙 추가 불필요. 부모를 정확히 고른 추가(편집기 parentChoice·책 '다음 순간 추가')는 그 순간을 그대로 쓴다.
- **점마다 이름**: 점 이름표를 한 줄 제목으로(`LT56Model.labelTitle` — `youtu.be에서 간직한 순간`류 자동 제목은 mediaMetadata.title→본문→사이트 이름 순으로 바로잡는다), 사진 있으면 16px 썸네일을 앞에 그린다(`network-thumb.mjs` — 보드의 thumb-fallback 재사용, `lt41-map-thumbs-ready` 이벤트로 첫 그림 뒤 로드를 재그리기). 선택·가리킴 때는 줄임 없이 전체 제목.
- **왼쪽 판 통일**: 그물형·동심원형 같은 판(묶음+탐색). 확대 단추를 보드와 같은 `[−][＋][전체 보기]`로(모양만 — 보드 파일 미수정), 모바일 도구 줄에도 같은 단추.
- **순간 묶음**: 7개 자르기를 감정·월 묶음으로(`pickGroups` — 퍼진 나무(한 갈래 8개 이상)는 감정, 사슬·깊은 나무는 월(6개 이하로 합침), 묶음 하나면 판 숨김). 묶음 보기는 **묶음 안에서 실제 이어진 선**만 밝힌다 — 흩어진 묶음은 점만 밝히고 지도를 가로지르는 가짜 길을 그리지 않는다.
- **'이어진 선 N개'**: 지도에 실제로 그어진 선 수(양 끝이 있는 변)로 센다 — 단추를 캐시해 프레임 다시 뜸에도 유지(`shell.mjs`).
- **시험**: 신규 `tests/v41-map-relations-601.test.mjs`(도메인 2·모델 2·브라우저 2, `LT_MAP_RELATIONS_REQUIRE=1`) — preview-check 지도 도구 줄 잡(screen-map-b)에 대비 잡과 같은 나란히 돌리기로 붙였다(#591 진단 패턴). 기존 시험 갱신: inbox-data(가 결정)·network-model(키 목록)·merge-network·panels-flow·shell-panels·video-title(부모 규칙 반영).
- **대비 시험 보강**: `tests/helpers/map-contrast.mjs` — 점 썸네일을 점·이름표와 같은 가림 요소로 추가(사진 뒤 선은 가린 것으로 본다).
- **트러블슈팅**: (1) CI 만 나는 390 묶음 보기 대비 미달 — 원인은 종이 판의 `--lt-map-edge-alpha-min:.95`(흐린 선도 .95로 그려 회색보가 됨) + 묶음이 감정·월처럼 흩어져 선이 지도 전체에 퍼진 것. 좁은 화면 묶음 보기에서는 묶음 안 실제 이어진 선만 그려 해소(eddf9e7). (2) 첫 CI 실패 2건은 main 드리프트(로컬2 #618 병합 뒤 워크플로우가 기리키는 `v41-board-pinboard2-601.test.mjs`가 내 브랜치에 없음) — main 병합(b5d8953)으로 해소. (3) `v41-font-floor-548`은 로컬 Windows에서 base와 같게 실패(showModal null — 환경, CI 초록).
- **머지**: PR #617 → main `36b1332`, 필수 검사 전부 초록. 스크린샷 flat26·chain10·mixed3x4 × 1440·390 × 밤·정원 전/후 24장 → `E:\lovetree-qa\map-601\`.
- **남긴 것**: 묶음 재생(경로 재생)은 묶음 안에 실제 선이 없으면 점프할 수 있다(예시 데이터 전용 기능 — 필요하면 별도 이슈로). 실기기(컴2) 확인은 이 레인에서 못 했다.

## 2026-11-15 — 핀보드 2차: 날짜순|내 배치·카드 훑기·상세 감상·확대 단추·트리 칸 고정폭 (#601, 로컬2 레인, ai/com2-lt601-pinboard2-261115, main b10130e 기준, PR #605→4f7eca6·#607→a41cc35·#610→c3c39ed·#612→675ebc0·#616→544647f)

- **과제 5건**: ① 머리글 '날짜순|내 배치' 전환 — 근본 수리로 옛 관계배치의 x·y를 저장 자리로 세지 않음(`board-model.js` `isPinboardSlot`: 칸 x=150+col*300, ±2px 스냅만 인정; 값은 보존). 'date' 모드는 보여 주기만 재꽂고 저장은 x·y 원본(#395 계약 유지). 끌면 자동 '내 배치'(`setBoardMode('mine',{replace:false})`, 트리별 localStorage 키). ② 카드 훑기용 간소화 — 공용 `LTMedia.markup(...,{compact:true})` + 제목 2줄 clamp + 감정·날짜 한 줄; 마지막 줄 판 밖 overflow 수리(예약높이 330/440/330). ③ 상세 재구성 — 자동 재생 플레이어·'내 마음'·이어진 순간 카드·단추 한 줄; 메모는 상세로. ④ 확대 −·＋·전체 보기 단추 + 누를 때 말풍선(`data-lt-tip`). ⑤ 셸 트리 칸 고정폭 11em(`shell.css`).
- **끌기 결함 3단 수리(미리보기 계정 04 실측에서 발견)**: 카드 한가운데 재생 단추가 끌기를 가로맦다(#607 — 보드 카드에서만 오른쪽 위 모서리 표로) → 그림 위 브라우저 기본 끌기가 이벤트를 잡아먹음(#610 — `.card img{-webkit-user-drag:none}` + cardLayer dragstart 차단) → 공용 `media-preview.js`가 캡처 단계 pointerdown을 전부 stopPropagation해 카드에 이벤트가 안 닿음(#612 — `.card` 안에서는 막음 해제, 다른 화면 그대로; 책 시험 29건 재통과).
- **좁은 폭 머리글(#616)**: ≤580px에서 머리글을 두 줄로 감싸고 배치 전환을 둘째 줄 오른쪽으로(`board-extra.css`), 판 시작 위치 100px. 390·560·600·700·1440 겹침 0쌍 실측.
- **실측**: fps 같은 격자 시나리오 공정 비교 — 끌기 26.8→25.0, 판 이동 29.6→28.9, 확대 38.9→39.9(동급). 계정 04 배포본 전 과정(시드→격자·date 켜짐→끌기→mine 자동 전환→원래대로 trees 0) 통과. 스크린샷 `E:\lovetree-qa\601\`.
- **시험**: 신규 `tests/v41-board-pinboard2-601.test.mjs`(10건, LT_BOARD_601_REQUIRE + preview-check.yml 연결), 기존 6개 시험 갱신. 알려진 동시 실행 플레이크: book-play-584·board-yt-overlap-553(단독 통과).
- **주의**: `media-preview.js`는 공용 — 책·보드 양쪽 시험을 함께 돌릴 것. 워크스페이스 PUT은 매번 다른 clientKey 필요(같은 키면 409 client_key_conflict).

## 2026-11-14 — 저장소 점검: CI 에서 돌지 않던 화면 시험 4개 연결, 운영센터 배경 (CTO)

- **점검 결과**: main 필수 검사 초록, 로컬 전체 npm test 1,595건 fail 0. workflow 가 부르는 시험 파일은 모두 존재. 그런데 **크롬이 필요한 화면 시험 4개가 미리보기 검사에 연결되지 않아 CI 에서 조용히 건너뛰어졌다**: v41-board-pinboard-582(#582), v41-board-cursor-detail(#583), v41-tree-tips-549(#549), v41-tree-rename-tips-571(#571).
- **고침**: 앞의 둘은 '보드·접근성·날짜' 잡, 뒤의 둘은 '책 대비·초점' 잡에 '건너뜀=실패' 단계로 연결. #583·#549 시험에 REQUIRE 플래그(LT_BOARD_583_REQUIRE·LT_TREE_TIPS_549_REQUIRE)를 붙였다.
- **새 화면 시험을 만드는 레인 규칙**: 크롬이 필요한 시험은 반드시 `LT_…_REQUIRE` 플래그를 두고 같은 PR 에서 preview-check.yml 에 단계로 연결한다. 연결 여부는 `grep -l "REQUIRE" tests/*.mjs` 와 workflow 대조로 확인.
- **운영센터 배경(#595)**: 빌드 뒤 admin.css 가 styles.css 보다 먼저 실려 :root 크림이 이겼다 → `html:root` 로 명시도를 올림.

## 2026-11-15 — 첫 화면 끌기 성능: 원인 규명과 저위험 완화 (#586, 로컬3 레인, ai/local3-orbit-fps-261115, main cf5ad94 기준)

- **측정으로 밝힌 정확한 원인(Performance.getMetrics·CDP 트레이스, 도구·기록 E:\lovetree-qa\orbit-fps)**: 첫 화면은 가만히 있어도 렌더러 메인 스레드가 코어 하나의 80~100%를 씁니다(RecalcStyleDuration ~850–1000ms/s). 프레임마다 카드 28장의 transform·z-index·filter 를 다시 쓰기 때문이고, 이때 스타일 재계산이 카드 하나당 ~1.2ms(28장 한 배치 ~16–37ms) 걸립니다 — 같은 쓰기를 그림자 스타일시트를 떼면 ~0.03ms 로 떨어져, 규칙 일치·재계산 자체가 병목입니다. 유휴와 끄기의 CPU 가 같아 "끄는 동안만 무거운 것"이 아니라 "항상 이만큼 쓰는 것"이 끌기 44fps 의 한계였습니다.
- **이번 PR(저위험 완화)**: ① z-index 를 64 단계 밴드로만 다시 쓰기(매 프레임 z 쓰기는 재계산을 몇 배로 무겁게 만드는 상태를 이어갔음 — 실측) ② 끄는 동안(data-lt-busy) hover 모양 고정(테두리·번짐·그림자 다시 계산·다시 칠하기 억제) ③ 패럴랙스 rect 캐시(pointermove마다 getBoundingClientRect 하지 않음) ④ 첫 화면 문서가 src/styles.css 를 통째로 읽지 않게(--ui 토큰만 home.html 인라인, 문서 스타일시트 수 축소).
- **정직한 결과**: 이 기계(CPU 100% 부하 상태) 실측 A/B 에서 fps·CPU 개선이 소음 범위였습니다(1440 drag 전 ~35–41 / 후 ~31–48fps, 1920 drag 전 ~53.9 / 후 ~55.0fps). 근본 해법은 매 프레임 스타일 쓰기를 없애는 구조(CSS/WAAPI 애니메이션으로 유휴 부유를 돌리고 끌기 때만 JS 쓰기)이고, 이는 별도 이슈로 합니다 — #429/#457/#491/#535 의 겹침·밀어내기·상한 계약을 지키며 손대야 하는 큰 작업입니다.
- **시험**: tests/v41-orbit-586-perf.test.mjs(신규, 소스 계약 4 + 실행 계약 3 — 유휴 4초 z-index 쓰기 수, pointermove 40번에 rect 재기 0회, 글꼴 토큰 유지). preview-check screen-home-book 잡에 LT_ORBIT586_REQUIRE=1 단계 추가. #535 시험 6/6, 전체 npm test 초록(한 개 소스 계약을 #586 변경에 맞게 갱신).
- **남은 것**: 대표 실기기 확인(끄는 흐름·hover 사라짐이 눈에 띄지 않는지), 근본 해법 이슈 작성.

## 2026-11-14 — 책 YouTube 개선 4+2(이슈 #584, 로컬1 레인, ai/local1-lt-584-book-play-261115, main 8092d28 기준)

- **▶ 재생(1)**: 재생 단추 이름 '여기서 재생'→'▶ 재생'(시작 시점 있으면 '▶ 재생 · 1:23'), 안내 문구 '바로 재생할 수 없어요…'로 맞춤. `media-preview.js`(공용)·`src/views/orbit.js`.
- **링크 한 줄(2)**: YouTube ↗(왼쪽)·크게 보기(오른쪽)를 카드 아래 `.media-links` 한 줄로 — 영상 위 '크게 보기'(`yt-expand`) 겹침 제거. `book-extra.js`·`book-usability.css`.
- **오류 153 수정(3)**: iframe `referrerpolicy` `no-referrer`→`strict-origin-when-cross-origin`(`media-preview.js` 그 자리 재생·크게 보기 두 자리). 실측: 같은 영상이 no-referrer에서 '플레이어 구성 오류(153)', 바꾸면 그 자리·크게 보기 모두 재생됨. **공용 파일이라 보드 YouTube 카드에도 같이 적용됨(#582와 공유).**
- **넓은 화면 두 장 모드(4)**: 책 높이 한도 650→920px(`calc(100vh - 215px)`), 넘치면 영상 틀을 220px(세로)/180px(가로) 아래로 줄여 스크롤 없이 맞춤 — 글자는 줄이지 않음(#548 기준선). 세로 판정 보강: **oEmbed는 가로세로 정보가 없다(항상 200×113, 2026-11-14 실측)** → oardefault 썸네일 실측(`probeVertical`·`upgradeVerticals`, 세로 영상에만 존재·CORS 없이 naturalWidth/Height 읽기 가능)으로 세로 칸을 9:16 틀로 올려 고침. 내 기록일 때만(공유·예시 화면 '누르기 전 외부 요청 0' #327 유지). 390 한 장 모드(#537)는 그대로.
- **1장|2장 묶음(5)·돋보기 아이콘·이어진 순간(6)**: 보기 단추를 한 테두리 안 두 칸으로(고른 칸만 금색 — #464의 '눌리지 않은 쪽 배경' 규칙을 '묶음 바탕 + 투명 칸'으로 갱신), 돋보기는 SVG 아이콘(켜지면 금색), '여기까지 온 길'→'이어진 순간'. 단추 설명은 브라우저 title 대신 작은 말풍선(`mountTips` — 올림·초점·휴대폰 0.5초 길게 누름, aria-label과 같은 말).
- **시험**: 신규 `tests/v41-book-play-584.test.mjs`(정적 8 + 실행 6, 세로 픽스처 `tests/fixtures/vertical-1x2.png`) — preview-check.yml '첫 화면·책' 잡에 연결. 기존 시험 9개 갱신. `npm test` 1,577건 1,535 pass / 1 fail(`v41-map-contrast` 알려진 간헐 — 재실행 통과). 머지 뒤 main f0fb5c4에서 build·modulepreload --check·관련 시험 32건 통과.
- **머지·배포**: PR #588 머지 → main `f0fb5c4`, 필수 검사 전부 초록. 스크린샷 전/후 1440·1920·2560 × 밤·정원 + 세로 사례 + 실제 재생 2장 → `E:\lovetree-qa84\`. 이슈 #584 보고 댓글 후 닫음.
- **남긴 것**: 실기기(컴2 tabbit) 재생 확인은 이쪽에서 못 했다 — 로컬 Chromium(headed playwright) 실측으로 대체했고 같은 엔진이라 같은 결과를 기대하지만, 배포 뒤 컴2에서 한 번 열어 보는 것을 권한다.

## 2026-11-15 — 보드를 핀보드로: 바둑판 배치·끌어 꽂기·줄은 지도에 (#582, 로컬2 레인, ai/com2-lt582-pinboard-grid-20261115, main ee8172a 기준)

- **배치**: treeSpread(관계 기준 펼치기)를 버리고 날짜 최신순 바둑판. 칸 수는 화면 폭이 정한다(1440 4칸·390 1칸·1920 6칸 상한), 카드 크기는 #548 기준선 그대로. 저장 자리(#395 계약)는 그대로 남고 나머지를 빈 칸에 채운다.
- **끌어 꽂기**: 카드를 끌면 가장 가까운 빈 칸에 스냅되고 x·y를 기존 저장 방식(lt41-board-sync) 그대로 저장. '정렬 되돌리기' 단추로 날짜순 바둑판 복귀. 판 끌기 중 카드 pointer-events 를 꺼 성능 확보.
- **줄 없음**: 보드에서 실·핀 연결·'이어진 이유' 창·연결 배너 제거 — 관계도는 지도가 맡는다. 이어 주기는 순간 추가의 '이전 순간 고르기'와 지도에서.
- **상세**: 이전·다음 순간 링크 유지(#583), '지도에서 관계 보기' 단추 신설 — 셸 메시지 lt41-open-network 로 `#my/network?tree=…&moment=…` 약속대로 열기(messages.mjs 한 조각, 지도 파일 미수정). extras selectMoment 의 다음 순간 목록을 board.js 와 같은 3개 규칙으로 통일.
- **용어**(이슈 댓글 반영): '＋ 순간 꽂기'→'＋ 순간 추가', '기억판에 꽂기'→'보드에 추가', 토스트·기본값·이어진 이유 기본 문자열도 '추가'로. 카드 끌기 설명은 '끌어서 자리 옮기기'(title). 숨김 고급 도구(DEFAULT PIN·CARD)는 화면에 안 남아 유지.
- **시험**: 신규 `tests/v41-board-pinboard-582.test.mjs` 7건. 관계 배치에 묶였던 기존 시험을 바둑판 기준으로 갱신(spread-469·board-model·553·536·cursor-detail·merge-pinboard·touch-targets — board-model 의 실 3건·연결 지우기는 기능 소멸로 삭제). 서버·DB 변경 없음.
- **fps(1440, 26순간, 헤드리스)**: 판 끌기 17.9~36.3 → 45.1~49.5, 확대 25.5~58.6 → 58.7~60.5. 스크린샷(1440·390 × 종이·밤 전/후 + 상대): `E:\lovetree-qa\582\`
- **트러블슈팅 기록**: (1) 이전 세션 전체 npm test 의 2건 실패는 환경 탓 — #548 글자 기준선은 worktree 의 `dist/` 가 지워진 상태(빈 페이지 → dialog null), 지도 대비는 오래된 dist 기준. 재빌드 후 둘 다 통과. (2) 첫 CI 실패 3건은 브랜치가 main 뒤쳐져 새 시험 파일(v41-orbit-586-perf·v41-map-fan-open)이 없었던 것 — 워크플로우는 PR head 를 체크아웃하므로 main 병합으로 해소. (3) 미리보기 postdeploy 의 503(youtube-oembed·콘솔)은 미리보기 Functions 미준비 — 운영은 401/200 정상 대조로 #582 무관 확인.
- **머지**: PR #594 → main `ab21965`, 필수 검사 전부 초록. 이슈 #582 보고 댓글 후 닫음.

## 2026-11-15 — 보드 마감: 금색 커서 동그라미 제거 + 상세 다음·이전 순간 단추화 (로컬2 레인, ai/com2-lt-cursor-detail-20261115-0830-3a7c, main 8092d28 기준)

- **커서 동그라미 완전 제거**: 따라오는 금색 동그라미(`cursorRing`·`cursorInner`·`cursorFX`·`cursor-burst/ripple/drop`)를 HTML 요소·board.css 스타일·board-extras.js 배선·board-model.js 판정 함수(`cursorMode`·`cursorHover`·`cursorScale`·`cursorEffectAllowed`·`cursorPresence`)까지 치웠다. 원래 마우스 커서를 쓰고, 상태는 CSS cursor로 알린다 — 판 `grab`(끌 때 `grabbing`, `#viewport.panning`), 카드 `grab`(끌 때 `grabbing`, `.card.dragLift`), 핀 연결 중 `crosshair`(`#cardLayer.linking`), 핀·단추 `pointer`. `public/v41` 전체에 `cursor:none` 없음(시험이 검사).
- **상세 다음·이전 순간 단추화**: `#dConn`의 '→ 순간 제목' 목차 글씨를 실제 `<button class="connLink" data-cid data-dir>`로 바꿨다(board.js open()과 board-extras selectMoment 둘 다, `connRow` 한 벌). 누르면 이벤트 위임(#dConn.onclick)으로 다음은 `moveViaConnection`(실을 따라 흐른 뒤 `focusBoardMoment`)·이전은 `pulseConnection`→`focusBoardMoment(c.a)` — 판이 그 카드로 부드럽게 이동하고 카드가 선택되며 상세가 바뀐다. 이유(why) 글은 단추 아래 작은 글씨(`.connWhy`)로 그대로, 3개 넘으면 '나머지 N개 보기' `<details>`도 그대로. 실제 button이라 Tab·Enter 접근 가능.
- **시험**: 신규 `tests/v41-board-cursor-detail.test.mjs` 4건 — (1) 커서 흔적 없음(5개 파일·public/v41 전체 `cursor:none` 걷기) + 상태 커서 규칙, (2) 단추 규칙, (3) 실제 브라우저 다음 단추 클릭 → 판 이동(transform 변화)·선택·상세 전환 + Enter, (4) 이전 단추. board-model 시험의 커서 시험 5건(19~24)은 함수 소멸로 함께 거둠. 관련 시험 49건 통과(board-model·신규·#553 겹침·#536 넓게·터치 영역), build·modulepreload 유지 확인.
- **fps(1440, 사슬 40순간, 헤드리스 playwright)**: 판 끌기 40→43~44, 확대 56→58 — 같거나 소폭 빠름(동그라미 그리기·기억을 덜어서). 스크린샷·수치: `E:\lovetree-qaoard-cursor\`(detail-next-button.png, fps 기록).
- **머지**: PR #583 → main. 보드 배치(treeSpread·cardPosition)는 건드리지 않았다.
## 2026-11-14 — AI 고객 페르소나 '자주 쓰는 곳·익숙한 디자인' + 일지 디자인 느낌 틀 (#590, 로컬5 레인)

- **운영센터**: `PERSONA_FIELDS`(src/admin-view.js)에 `habits`('자주 쓰는 곳·익숙한 디자인', 여러 줄 칸)를 '쓰는 모습' 뒤에 추가 — admin.js 폼은 PERSONA_FIELDS 공용(row 높이 자동 계산)이라 코드 무변경. 운영센터·내보내기 md 가 같은 순서 7항목.
- **서버 무변경 확인**: intro 는 jsonb 통과 — `savePersona`가 키를 거르지 않아(DB 변경 없음). `board-service` 시험에 habits 저장→불러오기 왕복 단언 추가.
- **일지 쓰기 창**: `public/v41/index.html` journal-panel 내용 칸 뒤에 '(선택) 디자인 느낌 — 내가 자주 쓰는 ○○와 비교해서: 익숙했던 점 / 어색했던 점' 안내 한 줄(본문 틀 예시). 시험 `v41-journal-design-hint-590`(마크업 글자).
- **내보내기**: `renderIntroMarkdown` 같은 항목 — 시험 갱신(7개 항목·여러 줄 값·빈 값 '—'). 머지 뒤 `E:\lovetree-qa\export-tool\` 사본 재복사 + `schtasks /run` 0 확인. 윤제 소개의 habits 내용은 페르소나 레인 몫(여기서 채우지 않음).
## 2026-11-14 — 운영센터 '사용 일지' 탭 + 일지 본문 8000자 (#596, 로컬5 레인)

- **머리줄 탭**: 고객 글 · **사용 일지** · 신고 · 고치는 일. 탭 상태는 주소 `#journals` 로 남겨 새로고침·뒤로가기 유지(#564·#570 방식 — parseHash·viewHash·viewToTab 에 journals 추가). 고객 글 탭의 '일지' 거르기는 그대로(중복 허용).
- **사용 일지 탭**: 위에 오늘 요약(활동 고객 수·오늘 일지 수·평균 다시 올 점수·떠남 위험 수 — 떠남 규칙은 최근 두 기록일 점수가 연속 2 이하, 운영 기준 6.4 지표), 아래 고객별 줄(이름·단계·최근 점수·날짜별 점수 흐름 점·마지막 기록일 — 단계는 일지 기록일 수 기준 시작 1일/꾸준 2~4일/정착 5일 이상, 마지막 접속 기록이 따로 없어 기록일로 대표). 줄을 누르면 그 고객 일지를 날짜 내림차순으로 펼쳐 읽기 — 본문 줄바꿈 유지(richParagraph), 같은 날 그 고객이 보낸 의견 링크(#feedback/<id>).
- **읽기 API 하나 추가(관리자만)**: `GET /api/admin/journals` — kind='journal' 만 journal_date 내림차순(feedback-postgres listJournals + memory 저장소 동형 구현 + service.adminJournals + proxy 허용 목록). 기존 /api/admin/feedback·persona 는 그대로.
- **일지 본문 한도 2000→8000**: 서버 createJournal 만 MAX_JOURNAL_BODY 8000(의견은 MAX_BODY 2000 유지) + DB CHECK 를 kind 로 나눠 일지만 8000(schema.sql + `migrations/feedback-body-8000-261114.sql` — 재실행 안전 DROP IF EXISTS→ADD). **migration 은 자동 설치 금지 대상 — 컴2 수동 적용 후 --accept-migrations 1회**(AUTODEPLOY.md 절차).
- **시험**: admin-view(요약 계산·고객별 정렬·떠남 규칙·단계·주소 왕복)·board-service(한도 8000 저장·의견 2000 유지·읽기 API 401/403/200)·feedback-postgres(DB CHECK — journal 8000 허용·8001/opinion 2001 거절·listJournals). 전체 npm test 1,605건 1,563 pass/0 fail/42 skip, build 통과.
- **화면 확인**: 모의 관리자 API + 헤드리스 1440·390 — 탭 4개·요약 값·고객 줄 3·펼치기·날짜 정렬·줄바꿈·의견 링크(#feedback/55)·가로 넘침 0·새로고침 주소 유지(스크린샷 .tmp-596/). 윤제 소개의 habits 내용은 페르소나 레인 몫(#590).

- **운영 답변 보조**(컴2 root, #596 후속): `wsl -e node /opt/padiem/lovetree-api/tools/ops-reply.mjs --id <의견 번호> --reply <답변 파일> --status <fixed|closed|...> --issue <번호>` — 운영센터 API 와 같은 서버 함수(feedback-service.reply·update)로 고객 답변·상태·연결 이슈를 처리하고, 이미 답글이 있으면 건너뜀(종료 3). 설치 목록·CI 진단 같은 모양 유지.

## 2026-11-14 — 지도 대비 시험 간헐 실패 수리: 말풍선 시차 + CI 진단 출력 (#591, 로컬5 레인)

- **원인(로컬 재현·dbg 실측)**: 점을 누르면 '연결 이유' 말풍선(#366)이 3.2초 고정되고 토스트는 2.3초 — 스크린샷(표시 중)과 겹침 계산(사라진 뒤) 사이가 워커 병렬 부하로 벌어지면 말풍선 밑 선을 패널색(#211b2b, 1.08~1.16:1)으로 재서 실패. 어느 조합·선이 떨어지는지는 타이밍마다 달랐다(02:38 CI 실패·로컬 2회 — 02:38 실패는 wait 가 bash -e 로 죽어 진단이 안 남았다).
- **수리**: `tests/helpers/map-contrast.mjs` — 겹침 사각형을 스크린샷 직전에 재서(overlayRectsInPage → measureMapPixelsInPage 전달) 스크린샷 시점과 같은 겹침으로 거른다. 제품(말풍선·토스트) 변경 없음 — 측정 조건 수리.
- **CI**: `preview-check.yml` 지도 대비 잡의 `wait $p1; r1=$?` 가 bash -e 에서 즉시 사망해 진단이 안 남던 것 — 종료 코드를 받아 두고 두 로그를 항상 출력한 뒤 마지막에 판정. 같은 모양 다른 잡 없음(전수 확인).

## 2026-11-14 — 지도 대비 시험: 같은 원인 독립 도달 + 스크린샷 신선함 검증 얹기 (#591, 로컬1 레인, ai/local1-preview-diag-261115, main 5f87fe6 기준, PR #599 → aca4408)

- **중복 발견**: 이 레인도 같은 원인(스크린샷 뒤에 겹침 계산이 도는 시차)에 독립적으로 도달했고, 진단 중 로컬5 레인의 #598 이 먼저 머지됐다 — 규칙대로 main 을 합쳐 그쪽 workflow 단계를 살리고, 헬퍼는 두 판을 합쳤다(좌표 수집은 캡처 직전 유지).
- **얹은 것(신선함 검증)**: 헤드리스 크로미움은 캔버스를 그린 뒤 화면에 올리기를 미룬다(부하 아래 실측 8회 연속 스틸, 2.4초+) — 스틸 프레임을 재면 좌표와 픽셀이 어긋난다. `#stage` 에 번역 없는 transform(`translateZ(0)`)을 캡처 직후에 잠깐 걸어 합성을 강제하고, 모서리 한 픽셀(CSS 0.5,0.5 — 측정 표본 제외 자리)에 심은 신호 색(#010203)이 스크린샷에 찍혔는지로 최신 프레임임을 확인한다(안 찍히면 화면이 멈출 때까지 기다렸다 최대 10번 재시도, 고정 대기 없음).
- **검증**: 로컬 같은 커밋 — 대비 시험 동시 3회 + 차례 3회 모두 통과(88~105초; 수정 전 같은 비교는 동시 1/3·차례 0/3 통과로 경합 재현). CI 지도 대비 잡 **3회 연속 초록**(같은 커밋 c243f0f 재실행 attempt 1·2·3, 잡 1분51초 — 2분 안).

## 2026-11-15 — 보드 순간 수정 창에서도 날짜를 바꾼다 (#608, 로컬1 레인, ai/local1-lt608-board-edit-date-261115, main a41cc35 기준, PR #613 → ee0cadc·뒤충 #614 → 7db0b14)

- **원인(왜 날짜가 고정이었나)**: 수정 창의 살아 있는 정의는 board-detail.js가 로드 때 board-extras.js를 덮어 쓰는 오버레이가 갖는다(같은 이름 openEdit·editPreviewState·saveEdit·updateEditPreview를 함수 할당으로 대체 — 나중에 로드된 쪽이 이긴다). 그 saveEdit에 관계도 시절(2026-11-06 #184 무렵)의 `invariant={id,date,privacy,x,y,rot,first,createdOrder}`가 그대로 남아 매 저장마다 날짜를 되돌려 놓았다('미디어를 교체해도 순간 ID·날짜·Connection은 그대로'가 그 시절 이유). 핀보드(#582)는 이미 '날짜순'(날짜로 다시 꽂기)과 '내 배치'(저장 자리 유지 #395)로 배치 규칙을 나눴으므로 날짜 고정의 이유는 더 이상 유효하지 않다 — 신원에서 **날짜만** 빼고 나머지 provenance 보존은 그대로 둔다.
- **고침**: board-detail.js 수정 창에 책과 같은 `<input type="date" id="editDate">`(레이블 DATE), editPreviewState가 그 값을 읽고, saveEdit는 책의 editMoment·validateMomentInput과 같은 규칙(YYYY-MM-DD + toISOString 왕복, 어긋나면 '날짜를 확인해 주세요.'로 저장 전에 막음 — 도메인도 boardSync→validateState에서 같은 규칙)으로 미리 걷는다. 날짜가 바뀌면 placeAll로 '날짜순' 바둑판을 다시 꽂는다('내 배치'의 저장 자리는 placeAll이 건드리지 않는다). board.css `#editDate{color-scheme:dark}`(창은 늘 어두운 판). #547(지역 날짜)·#548(글자 기준선) 그대로. 서버·DB 변경 없음.
- **시험**: 신규 `tests/v41-board-date-edit-608.test.mjs` 3건 — 정적(살아 있는 정의 기준), 도메인(책 경로 edit과 보드 경로 boardSync가 같은 날짜를 받고 잘못된 날짜 3종을 둘 다 거름), 크롬 화면(수정 창이 그 순간 날짜로 시작 → 바꿔 저장 → 카드 글·날짜순 첫 칸 재배치·저장 메시지의 날짜 → 끌어 '내 배치' 뒤 재변경 시 자리·x·y 유지). preview-check '화면 시험 — 보드·접근성·날짜' 잡에 `LT_BOARD_608_REQUIRE=1` 단계 추가(건너뜀=실패). 주의: 보드의 '수정' 단추는 고급 모드(body.lt-advanced, 셸이 lt41-advanced 메시지로 켬)에서만 보인다 — 시험 호스트가 같은 판을 켠다. 처음 판에는 저장 메시지 경합이 있었다(카드 위치 갱신이 persistBoard보다 먼저 보일 수 있음) → 뒤충 PR #614로 메시지 도착을 기다리게 고침(로컬 4/4).
- **검증**: 로컬 전체 npm test는 기준선(stash)과 동일 결과 — 차이 건(#553·지도 판 흐름·#571)은 동시 실행 잡음으로 단독 실행 시 전부 통과, 공통 실패(a11y 인자 2건·#548·#400)는 이 환경의 기존 사정. 머지 뒤 main에서 608 3/3·인접 보드 11/11·build·modulepreload --check 통과. CI 필수 검사 19 전부 초록.

## 2026-11-14 — AI 고객 내보내기: 쿠키 없이 컴2 DB에서 (로컬5 레인, ai/local5-lt-ai-export-db-261114, main b79752d 기준)

- **무엇**: 매일 07:00 AI 고객 내보내기의 원본을 컴2 운영 DB(읽기만)로 바꿨다. 관리자 세션 쿠키 방식은 폐지(쿠키 만료로 조용히 멈추는 문제·쿠키 파일 보관 문제).
- **컴2 판독기** `tools/export-ai-customer-db.mjs`(신규): API 서비스와 같은 .env(LOVETREE_DATABASE_URL·LOVETREE_PRODUCT_ID, 값 출력 금지)를 읽고 `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` 로 SELECT 만 — `lovetree_ai_personas` ⋈ `lovetree_product_roles(role='ai_customer')` 고객 + `lovetree_feedback`(답글 포함)을 관리자 API 응답 모양(camelCase) JSON 으로 stdout 으로. subject·이메일·전화번호 계열 필드는 아예 넣지 않고(maskPersonal 규칙 재적용), 고객 구분은 페르소나 이름+내부 번호(no)만.
- **컴1 md 작성** `tools/export-ai-customer.mjs`: 입력을 `--from-json <파일|->` 로 바꾸고 쿠키·fetch 방식 코드는 지움(옛 방식 잔재 없음). 일지·소개 렌더 함수·KST 날짜 판정은 그대로. 같은 이름 페르소나 둘이면 폴더 `이름_no` 로 겹치지 않게.
- **컴1 실행 스크립트** `tools/run-ai-customer-export.ps1`(신규): Git 번들 ssh(Windows 내장 ssh.exe 가 깨져 있음 — `ssh -V` 도 255·무출력, 2026-11-14 실측) → comp2 → `wsl -e /usr/local/bin/node 판독기 --b64`(인용·파이프 없는 명령 — powershell.exe 5.1 예약 작업이 겹따옴표·| 를 깨뜨려 판독기에 --b64 모드를 넣음, 실측) → 디코드해 임시 JSON → md 작성 → 임시 삭제. 로그 `E:\lovetree-qa\export-log\ai-customer-YYMMDD.log` 맨 윗줄이 이유 한 줄(성공 요약/실패 이유), 실패 시 종료 코드 1.
- **설치 목록**: `install.sh` 가 판독기를 `/opt/padiem/lovetree-api/tools/` 에 넣고, `autodeploy.sh` 의 API 변경 판정에 `tools/export-ai-customer-db.mjs` 를 추가(이 파일만 바뀌어도 설치). migration 변경 없음 — 자동 설치 대상.
- **시험** `tests/export-ai-customer.test.mjs` 12건(문장 READ ONLY·쓰기 키워드 없음, subject·이메일 없음, 가림, JSON→md, 이름 중복 폴더). `npm test` 전체는 PR당 1회 실행(결과는 PR 본문).
- **수정(2026-11-14, 머지 cf5ad94 뒤 실데이터 실행에서 발견)**: 판독기 posts SELECT에 `subject_id` 칼럼이 빠져 받아온 글을 고객에 묶지 못해 일지가 비었음(posts=0) — 칼럼을 결과에 추가하고 시험에 SELECT 절 단언을 넣음(테스트 입력에 subject_id 가 있어 미쳐지지 않았던 빠짐).
- **컴1 고정 위치(2026-11-14 마무리)**: 예약 작업 `LoveTreeAICustomerExport0700`은 레인 작업 폴더가 아니라 `E:\lovetree-qa\export-tool\`(ps1+mjs 복사본 — export-ai-customer.mjs 는 node 내장만 import 해 두 파일이면 충분, ps1 은 $PSScriptRoot 기준이라 스크립트 수정 없음)에서 돈다. 저장소 tools 스크립트를 고치면 그 폴더에 다시 복사해 둔다.
- **주의**: 컴2 ssh 는 Windows 셸(cmd)이고 예약 작업은 powershell.exe 5.1 — 겹따옴표·`|`·작은따옴표가 원격 전달에서 깨진다(2026-11-14 실측) → 원격 명령은 인용·파이프 없이 `wsl -e node 판독기 --b64` 한 줄(base64 는 판독기가 출력). WSL 기본 사용자 root — .env 읽기 가능. JSON 은 base64 한 줄로만 전달(한글·줄바꿈 안전). 판독기 오류 이유는 값 없이 한 줄만 stderr 로.

## 2026-11-14 — 운영센터 2차 다듬기: 탭 거르기·고치는 일 (#570, 로컬3 레인, ai/local3-admin-570-261115, main f605e81 기준)

- **머리줄**: '러브트리로 돌아가기' 단추는 로고와 같은 일을 두 번 하는 셈이라 없애고 로고(LoveTree 4.1)만 남겼다. 로고에 `title`·`aria-label` '러브트리로'. 탭 이름은 게시판→'고객 글', 이슈→'고치는 일'(신고 그대로) — 상세의 '← 게시판'도 '← 고객 글'로 맞춤.
- **탭 거르기(#570 2)**: 드롭다운 두 개를 숫자 붙은 탭 줄로 — 상태 '새 글 N·확인 중 N·고침 N·다음에 N·닫음(숫자 없음)', 종류 '전체 N·의견 N·일지 N'. 기본은 '닫음 뺀 전체', 탭을 다시 누르면 해제. 탭 상태는 주소에 남는다(`#board?status=..&kind=..`, 모르는 값은 버림) — 뒤로 가기·새로 고침 유지. '받음'은 운영센터에서 '새 글'로(서버 값 received 그대로, 고객 쪽 표시 변경 없음). 운영센터에 select가 남지 않았다(드롭다운 글자 안 보임 문제 소멸). 목록은 서버에서 한 번에 읽고 `filterRows`(admin-view)로 거른다 — 탭 숫자를 같이 세려고.
- **고치는 일 탭(#570 4)**: GitHub 이슈 전체 목록 대신 고객 글 '연결 이슈 번호'의 이슈만(`linkedIssueNumbers`, 번호 내림차순). 한 줄 `#549 제목 — 고치는 중/고침 완료`(`issueStateLabel`) + 연결된 고객 글(누르면 상세). 고침 완료인데 글이 '고침'이 아니면 [고침으로 바꾸기] 단추(`needsFixButton`, PATCH — 자동 변경 없음). GitHub은 공개 읽기만(토큰 없음, 이슈마다 개별 fetch — PR 번호는 건너뜀), 실패 시 '이슈 상태를 불러오지 못했어요' 한 줄 + 고객 글 목록 유지.
- **시험**: `tests/admin-view.test.mjs` 16건(탭 숫자 계산·기본 닫음 제외·탭↔주소 왕복·연결 이슈 추리기·이름 바꾸기·단추 조건). `npm test` 1,555건 fail 0(`v41-map-contrast` 이 환경 기존 타임아웃 — 첫 실행에선 통과, 변경 파일과 무관), build·modulepreload --check 통과. 서버·DB 변경 없음.
- **머지·배포**: PR #573 머지 → main `8874147`, 필수 검사 전부 초록. 이슈 #570 보고 댓글 후 닫음.
- **실화면(모의 관리자 API, #540·#564 선례 방식)**: before(main f605e81)/after 비교 — 머리줄 단추 제거·탭 숫자·기본 닫음 제외·탭 누르기/해제·주소 왕복·새로 고침·고치는 일(#549/548/547 실제 GitHub 상태: 고침 완료/고치는 중/고침 완료, [고침으로 바꾸기]는 #549 줄에만)·390 진짜 렌더 가로 넘침 0. 스크린샷 `E:\lovetree-qa\admin-ui-570\{before,after}\`(1440·390 × 고객 글 기본·상태 탭 고름·고치는 일; 390은 헤드리스 playwright).
- **남긴 것**: 컴2 tabbit 대표 세션이 풀려 있어(401) 라이브 운영센터 '보기' 확인은 대표 로그인 뒤 — 비밀번호 입력 금지 규칙대로 이 쪽에서 하지 않았다. [고침으로 바꾸기] 실제 PATCH 동작은 시험·모의 화면까지만 확인(운영 데이터 상태 변경 금지 규칙).

## 2026-11-14 — 운영센터 해시 라우팅 (#564, 로컬3 레인, ai/local3-admin-564-261114, main d6c0f69 기준)

- **주소가 곧 화면**: 운영센터(src/admin.js)를 순수 모듈 src/admin-view.js의 조각으로 고쳤다. `#board`·`#feedback/<id>`·`#persona/<id>`·`#reports`·`#issues` — 뒤로 가기·새로 고침·링크 공유가 화면 상태를 그대로 따른다. 화면이 직접 가지는 상태는 종류·상태 거르기뿐이다.
- **#564 항목 반영**: 날짜 '11.14 06:31'(초 없음), 본문·답글 줄바꿈 유지, '닫음'(closed) 상태 추가 + 목록 기본에서 숨김(상태를 골랐을 때는 서버 결과 그대로), 상태 바꿈 알림 문구('으로/로' 받침), GitHub 이슈는 본문 복사 대신 '새 이슈' 쓰기 화면 열기(제목·본문만, 계정·트리 정보 없음), 연결 이슈 번호를 숫자일 때만 GitHub 링크로. 모르는 해시는 게시판으로 돌린다.
- **시험**: 신규 `tests/admin-view.test.mjs` 10건(주소 왕복·탭 표시·날짜·줄바꿈·'닫음' 거르기·문구·이슈 주소·이슈 링크). `npm test` fail 0, `npm run build` 통과. 서버 쪽 `FEEDBACK_STATUSES`에 closed 추가 + `tests/feedback-service.test.mjs` closed 시험, `schema.sql` CHECK에 closed, `server/db/migrations/feedback-closed-261114.sql`(CHECK 교체, md5 `5a1c08de7509966b928de06e7fd91d80`). 고객 '내 의견' 화면(`public/v41/feedback-board.mjs`)에 closed='처리 끝' 표시 + closed에도 이슈 번호 표시. 12번 배경은 첫 커밋에서 `html` 선택자가 styles.css `:root` 명시도에 못 이겨 `:root,body` 무대색으로 고친 뒤 브라우저에서 `rgb(4,4,7)` 재확인(커밋 353da67).
- **머지·배포 완료(2026-11-14)**: PR #565 머지 → main `b2c986b`. 필수 검사 전부 초록. 컴2 백엔드: autodeploy `needs_manual_migration` 확인 → 마이그레이션 /tmp 전송·md5 일치 → `SET ROLE lovetree_owner` + `ON_ERROR_STOP=1` 적용(ALTER 2) → `lovetree_feedback_status_check`가 closed 포함·표 소유자 `lovetree_owner` 확인 → `AUTODEPLOY_ACCEPT_MIGRATIONS=1` 1회 → `result=installed` sha `b2c986b` = main, 서비스 active. 라이브 프런트(pages.dev) `feedback-board.mjs`에 closed='처리 끝' 확인. 운영 DB id=1 '[시험] 의견 창구 확인'을 closed로 바꿈(UPDATE 통과 = CHECK 실동작).
- **실화면 확인(모의 관리자 API, 컴2 tabbit)**: 실세션 401을 우회하려고 이전 레인(#540) 방식의 모의 admin API 로컬 서버로 before(main d6c0f69)/after(이 브랜치)를 비교했다. 해시 뒤로 가기 3단계(`#persona/yunje`→`#feedback/6`→`#board`→앱 밖), 새로 고침 상세 유지, '닫음' 목록 기본 숨김+거르기에서 보임, '← 목록' 금테 단축·머리줄 높이 31px, '메모·이슈 저장'·운영 메모 설명·답글 종류 큰 선택 두 개+안내·'답글 남기기' 오른쪽 정렬, 페르소나 textarea+저장 단추 아래로, 390 진짜 렌더 가로 넘침 0(scrollWidth=clientWidth=390) — 모두 확인. 스크린샷 `E:\lovetree-qa\admin-ui-564\{before,after}\`(1440·390 × 목록·상세·페르소나, 헤드리스 playwright로 픽셀 정확하게 다시 찍음 — tabbit 창 최소폭이 약 260 CSS px라 창 스크린샷은 390 렌더를 못 만든다). 확인 결과는 PR #565 댓글로 남김.
- **남긴 것**: 대표 관리자 세션(컴2)으로 라이브 운영센터에서 '닫음' 글이 목록에 안 보이는 눈 확인 — DB·모의 화면·시험으로는 확인됐다. 라이브 id=1은 closed 상태로 남겨 두었다(대표 확인용).

## 2026-11-14 — 운영 시작 준비: 관리자 권한·운영센터 입구·디자인 통일·AI 고객 등록·매일 내보내기 (이슈 #540 마무리, 로컬3 레인, ai/local3-lt-540c-ops-261114, main 69cb042 기준)

- **관리자·AI 고객 역할 부여(컴2 운영 작업)**: 대표 계정 1개에 `admin`, AI 고객(윤제) 계정 1개에 `ai_customer` 역할을 부여했다. 둘 다 `createAdminRoleRepo(pool).assign(...)` 저장소 호출로만 — `lovetree_product_roles` 2행 + `lovetree_product_role_audit` 2행(이메일·subject 값은 어디에도 기록하지 않았다). 대표가 관리자 화면을 열면 게시판이 보이는지는 대표 로그인 확인 몫이다.
- **운영센터 입구(앱 안)**: `server/account-service.describe` 가 `admin` 플래그를 더 돌려주고(`public/v41/api.mjs` 파싱), 오른쪽 위 계정 메뉴와 설정 화면에 '운영' 항목이 생겼다 — 계정 메뉴 '운영센터'(관리자에게만 보임, `/admin.html` 새 탭), 설정 '운영' 묶음 '운영센터 열기'(같은 판정, 열림 때마다 서버 응답으로 다시 판정). 관리자가 아니면 둘 다 보이지 않는다.
- **관리자 화면 디자인 통일**: 머리줄을 앱(shell.css의 `.app-header`·`.brand`)과 같은 모양으로 — 'app으로'는 '러브트리로 돌아가기', 제목 옆 점(brand-dot) 제거. 권한 없음·로그인 필요 화면의 4.0 연베이지 상자·초록 글씨(`storage-notice`·`notice`)를 금테 카드 + `--lt-*` 안내 모양으로 바꾸고, 권한 없음 문구는 '운영센터는 관리자 계정만 볼 수 있어요' + '러브트리로 돌아가기' 단추. 전·후 스크린샷(390·1440 × 목록·상세·답글·페르소나·이슈 탭·권한 없음)은 `E:\lovetree-qa\admin-ui-261114\{before,after}\`(저장소 밖) — '전'은 pages.dev 라이브 화면에서 대표가 지적한 4가지(연베이지 상자·초록 글씨·제목 옆 점·'app으로')가 모두 보임을 확인.
- **AI 고객 윤제 등록(컴2, 저장소 호출)**: `lovetree_ai_personas`에 윤제 페르소나(소개.md 내용을 who/why/how/satisfied/disappointed/now 키로). `lovetree_feedback`에 일지 1건(kind=journal, journal_date 2026-11-14, 다시 올 점수 4, 제목 '첫날 — 가입하고 리센느·하츠투하츠 트리 만들기')과 의견 4건(새벽 날짜→#547·고침, 작은 글씨→#548·확인 중, '감상 없이' 문구→#548·확인 중, '0일 전'→#549·확인 중). 일지 아래 '운영센터 답글'은 '감상 없이' 문구 의견의 고객에게 보이는 답변(customer reply)으로. 원본 일지·소개는 거버넌스 `_원본보관\\`에 보관.
- **내보내기·예약**: 거버넌스 윤제 폴더 원본을 `_원본보관\\`로 복사한 뒤 `tools/export-ai-customer.mjs` 실데이터 1회 실행 — `일지_261114.md`·`소개.md`가 사이트 내용으로 다시 써짐을 확인. 컴1 작업 스케줄러에 매일 07:00 등록, 로그 `E:\lovetree-qa\\export-log\\`. 관리자 세션 쿠키는 계정비밀_대장 규칙대로 파일로만 보관(출력·커밋 금지).
- **시험**: `npm test` 전부 통과(브라우저 지도 대비 제외 환경), `npm run build`·`node tools/v41-modulepreload.mjs --check` 통과. 설정 '운영' 묶음·계정 메뉴 항목은 서버 응답 기반 표시라 모의 `/api/account`로 DOM 확인.
- **남긴 것**: 대표의 실제 관리자 화면 확인(게시판 보임)·`skerish@naver.com` 계정 관리자 권한은 대표 지시 대기. 내보내기 예약의 쿠키 만료(세션 최대 나이) 시 갱신 절차 필요.

## 2026-11-15 — 지도 부채꼴·'이 순간 열기' 주소 약속 (로컬4, ai/local4-map-relations-261115, main cf5ad94 기준)

- **주소 약속(보드 레인이 쓰는 것)**: 셸 주소 `#my/network?tree=<treeId>&moment=<momentId>`(기존 selection-location 규칙 그대로)로 지도를 열면, 셸이 지도 프레임 주소에 `?open=<momentId>`를 붙여 보내고(`shell/screens.mjs` show(), 요청은 `shell.mjs`의 networkOpen 플래그로 한 번만) 지도는 그 순간을 **선택 상태(상세 판 열림)·화면 가운데·배율 맞춤**으로 연다(`views/network/network.js` 시작 부분). 주소의 순간을 못 찾으면 기존대로 시작 순간 안내만 하고, `?open=`이 없으면 예전대로 전체 보기(배율 1)로 뜬다. `#my/network?moment=…` → 요청 연결은 `shell/location.mjs`, 프레임 주소 붙임은 `shell/screens.mjs` — 소자 시험 `tests/v41-shell-location.test.mjs`·`tests/v41-shell-screens.test.mjs`.
- **평평한 나무의 부채꼴 배치**: 한 순간에 8개 이상 이어진 그물형 나무(대표 트리 '모아둔 순간'과 같은 모양)는 묶음 칸으로 쪼개지 않고, **가장 많이 이어진 순간(첫 순간)을 상자 가운데 두고 나머지를 상자에 맞춘 타원 고리 위에 BFS 순서(12시부터)로 펼친다**(`network-model.js` `fanLayout` — `networkLayout`이 `fanHeavy`면 쓴다). 선은 가운데에서 고리로 뻗는 방사형이라 서로 교차하지 않고, 묶음 점·범례는 치운다. 처음 보기는 화면 맞춤(배율 1). 동심원형·작은 나무·40개 예시는 예전 배치 그대로.
- **진단·수정 결과**: 세 모양(평평한 26·사슬 10단·섞인 3×4) × 1440·390 × 밤·정원 × 두 보기 24행 측정 — 수정 전 flat26 그물형은 첫 순간에서 뻗는 25개 선이 화면을 가로지르며 엉킴(390 특히), 수정 후 24행 모두 노드·이름표 겹침·잘림·밖점·선교차 0. 스크린샷 `E:\lovetree-qa\map-relations\{before,after}\`(측정 스크립트·도우미는 `tests/helpers/map-shapes.mjs`만 저장소에 남긴다).
- **시험**: 신규 `tests/v41-map-fan-open.test.mjs`(실행형 2건 — 평평한 26순간 부채꼴 겹침 0·화면 맞춤, `?open=`로 열면 선택·가운데)을 미리보기 검사 '지도 대비' 잡에서 대비 시험과 **나란히** 실행(`LT_MAP_FAN_REQUIRE=1`, 잡 2분 안). #366 시작 줄 소자 시험은 주소 열기 예외를 반영해 갱신(평소 뜰 때 자동 맞춤 금지 가드 유지). 대비 시험 첫 그리기 대기 15→30초(전체 자리 붐빔 대비, 단언·측정 그대로). `npm test` 전체는 전 레인 기준 1회 실행 — 지도 소자·흐름 시험 전부 통과, 대비 시험은 단독·나란히 통과(전체 자리에서 첫 그리기 15초 초과 1회 — 대기 넉네히 함), build·modulepreload --check 통과.

## 2026-11-14 — 미리보기 검사 동시 실행 (CTO)

- 화면 시험이 한 잡에 줄지어 18분 걸려서, `.github/workflows/preview-check.yml`을 잡 6개(보드·접근성·날짜 / 첫 화면·책 / 지도 대비 / 지도 도구 줄·판 흐름·책 이동 / 책 대비·초점 / 미리보기 배포 검사)로 나눠 동시에 돌린다. 시험 단계 내용은 그대로 옮겼다.
- 필수 검사 이름 **'미리보기 postdeploy(로그아웃)'은 맨 아래 모음 잡**이 쓴다. 다섯 잡 중 하나라도 실패·취소면 모음 잡이 실패한다.
- 겉모습 비교(알림용 before/after 캡처)는 `public/`·`src/`·`index.html`·`vite.config`·`package.json`이 바뀐 PR에서만 돈다.
- **새 화면 시험을 붙일 때**: 가장 짧은 잡에 단계로 붙인다(각 잡 요약에 초가 적힌다). 한 잡이 6분을 넘으면 잡을 하나 더 나눈다.
- **2026-11-14 후속(#568, 지도 잡 단축)**: 지도 대비 시험의 조합(크기×테마×판 8개)을 한 브라우저에서 둘씩 동시에 측정하고(단언·기준값 그대로), 글자 마스크를 글자 상자 크기 캔버스로 만들고(읽는 픽셀 동일), 배경색 행 훑기에서 elementFromPoint를 생략하고(최다 색 bin이라 배경 추정 불변 — 해석 시간 3~8배 단축), 지도 판 흐름 시험을 '지도 도구 줄·판 흐름·책 이동' 잡으로 옮겼다. 스크린샷↔픽셀 해석 사이 지도가 다시 그려져 이행 중 색을 잘못 재는 간헐 실패는 앞·뒤 그리기 기록(`__mapPaint`)이 같은지 확인해 어긋나면 settle 뒤 다시 잰다(최대 3번). 지도 대비 잡 5분 47초(캐시 온 뒤 4분 47초) → **1분 35초~1분 43초**(같은 커밋 3회 연속), 지도 도구 줄·판 흐름 잡 1분 → 2분 11초~3분 02초, 전체 미리보기 검사 4분 53초 → **3분 36초~4분 12초**(병목은 이제 보드 잡 3분 11초~3분 54초 — 실행기 편차).
- **2026-11-15 후속(#575, 책 시험 연결)**: check 잡에서만 조용히 건너뛰던 책 화면 시험(#515·#516 이유 줄·알약·페이지 수 대비, #522 좌우 페이지 번호 대비, #519 닫힌 창 초점)을 새 잡 '화면 시험 — 책 대비·초점'에서 REQUIRE=1(건너뜀=실패)로 돌린다. 잡 57초(세 시험 합계 35초), 전체 미리보기 검사 3분 39초. 책 돋보기 루프 시험(`v41-book-lens-loop`)은 브라우저가 필요 없는 소자 정규식 시험이라 건너뜀 경로가 없고 check 잡 npm test에서 이미 매번 실제로 돈다. **남은 빈틈 없음** — `tests/v41-view-a11y-panel.test.mjs`(LT_VIEW_A11Y_REQUIRE, 보드·책 겹 패널 초점 계약)도 **#579(2026-11-15)로 '책 대비·초점' 잡에 연결됐다**(로컬 REQUIRE=1 10초, 잡 1분 17초). 이로써 REQUIRE를 쓰는 화면 시험은 전부 미리보기 검사에서 건너뜀=실패로 돈다.


## 2026-11-14 — 공개가 기본 (#538, 로컬4 레인, ai/local4-lt-538-public-default-261114, main 4351565 기준)

- **방침**: 트리는 공개가 기본. 저장 성공 뒤 같은 훅에서 공유 행의 `moment_count`를 갱신하고, 둘러보기 SQL이 `moment_count>=3`으로 거른다(서비스층 LIMIT 뒤 거르기 없음). 직접 올린 사진만 있는 순간도 순간 수에 세고, 공개 카드 대표 그림은 공개 가능한 것(YouTube 썸네일 등)만 쓰며 없으면 기본 표지(#427 전까지 올린 사진은 계속 제외). 비공개는 Plus 전용 — 판단은 서버가 한다(화면 잠금만으로 막지 않는다).
- **표**: `lovetree_shares`에 `origin`('owner'|'auto', CHECK `lovetree_shares_origin_check`)·`moment_count` 칸 추가, 트리당 자동 공개 행 1개 제약 `lovetree_shares_auto_unique_idx`(origin='auto' 부분 유니크). 새 표 `lovetree_tree_visibility`(product·subject·tree 키, visibility public/private — **행이 없으면 공개**인 스파스 운용). `schema.sql` + `server/db/migrations/tree-visibility-261114.sql` 한 벌, 기존 공유 행의 moment_count를 저장 문서에서 채우는 UPDATE 포함(이전 — 기존 트리도 공개). 계정 탈퇴 `ACCOUNT_USER_TABLES`에 `lovetree_tree_visibility` 추가. `scripts/apply-schema.mjs` TABLES에 추가.
- **서버**: `share-service.js` — `syncSharesAfterSave`(살아 있는 공유 행 moment_count 갱신 → 공유 행 없는 트리에 origin='auto' 행 생성 → 문서에서 사라진 트리의 auto 행 즉시 내림), `setTreeVisibility`(비공개 지정 시 plusEntitled 아니면 403 `plus_required_private`), `getTreeVisibility`, auto 행의 discovery PUT/DELETE는 409 `share_auto_managed`, 공개 읽기에서 비공개 트리 403 `share_private`. `workspace-service.js` — 저장·트리 삭제 성공 뒤 `onCommit` 훅(실패해도 응답을 막지 않고 로그만). `community-service.js` — 비공개 트리의 댓글·반응·신고·차단 경로 전체를 404로 차단. 둘러보기 SQL(community-postgres)은 `moment_count>=3 AND (origin='auto' OR discoverable=true)` + 트리당 한 행(DISTINCT ON, auto 우선) + 숨김은 트리 단위 + 비공개 트리 제외. `discoverable` 열은 보존만 하고 참조는 '옛 스위치 행' 호환용으로만 남김. `functions/_lib/proxy.js`에 `/api/trees/:id/visibility` GET/PUT 추가.
- **화면(v41)**: 공유 창에 순간 수 안내(`share-moment-hint`)와 공개 상태 칸(`share-visibility`, 비공개 전환 단추 — 403이면 Plus 안내), '둘러보기에도 올리기' 스위치·확인창 제거, 공유 목록에서 auto 행 비표시, 설정의 공유 행을 '트리 공개(공개(기본)·비공개 잠금 Plus 전용)'로 교체, 둘러보기 목록 설명 문구 변경, 첫 순간 저장 뒤 안내 1회는 localStorage(`lt41.publicNoticeShown`).
- **시험**: 신규 `tests/public-default-538.test.mjs` 8건(공개 기본·자동 행, 2개/3개 경계·올린 사진 순간 포함, 비공개 403, 트리 삭제 즉시 내림, moment_count 추가·삭제 갱신·주인 만든 행 포함, 신고·차단 유지, 계정 이름·아이디·이메일 미노출, auto 행 스위치 거부). `tests/community-postgres.test.mjs`에 둘러보기 SQL 시험 1건 추가(기존 2건의 INSERT에 moment_count 3 반영). 스위치 시험 `v41-share-discover-confirm.test.mjs`는 기능 제거로 삭제, `v41-share-steps`·`v41-share-list`·`v41-share-api`·`v41-community`·`v41-screen-defaults`·`v41-page-turn`·`v41-shell-messages`를 새 계약에 맞게 갱신. `npm test` fail 5 — 모두 main 4351565 워크트리 대조에서 같게 실패하는 기존 실패(a11y 2·postdeploy 2·#400 home 빌드 1, 환경성), 신규 실패 0.
- **배포 실측(2026-11-14, 완료)**: PR #557 머지(8a764e0) → autodeploy `needs_manual_migration` 확인 → 컴2에서 `tree-visibility-261114.sql` 수동 적용(md5 대조 일치, SET ROLE lovetree_owner, 표 소유자 lovetree_owner·origin/moment_count 칸·auto 유니크 인덱스 확인; 기존 공유 행 28건 전부 revoked라 채울 행 0 — 데이터 이전 공백 없음) → `AUTODEPLOY_ACCEPT_MIGRATIONS=1` 1회 → `result=installed` sha=8a764e0, 서비스 active. 운영 실측(계정 01, postdeploy 로그인 모드 프로필 재사용, 헤드리스): 순간 3개 시험 트리 저장만으로 둘러보기 자동 소개(momentCount 3, 대표 그림은 올린 사진 대신 기본 표지), 비공개 지정 403 `plus_required_private` 후 공개 유지, 순간 2개 트리는 자동 공개 행만 만들어지고 미소개, 트리 삭제 즉시 둘러보기 내림·auto 행 revoked, 응답 어디에도 계정 이름·아이디·이메일 없음 — 18/18 통과. 끝나고 시험 트리 삭제·기록 원상 복구(트리 0·순간 0, 활성 공유 행 0).
- **남긴 것**: sitemap의 공개 조건은 #541의 `collectSitemapShares`가 아직 `discoverable=true`만 보므로(로컬5 영역) 자동 공개 행이 sitemap에 안 들어간다 — #541 설계 당시 '#538 뒤에 거기서 바꾼다'는 메모대로 로컬5 후속이 필요하다. 화면 문구 4곳은 시험(v41-share-steps·share-api·screen-defaults)으로 검증했고 운영 화면 육안 확인은 대표 몫(컴2 tabbit).

## 2026-11-14 — 서비스 시작 전 검색 닫기 (CTO, #541 후속)

- **대표 결정**: 서비스 시작 전이라 운영 주소도 검색에 걸리지 않게 막는다. `functions/_lib/search-meta.mjs` 의 **`SEARCH_OPEN = false`** 한 줄이 스위치다.
- false 동안: robots.txt 는 운영·개발 주소 모두 `Disallow: /`, sitemap.xml 은 모두 404(서버도 부르지 않음), 루트·/v41/ 문서와 `/t/<id>` 공유 카드에 noindex.
- **링크 미리보기(카톡·페이스북 등 og 카드)는 검색과 별개라 그대로 나간다.**
- 서비스를 열 때: 이 한 줄을 true 로 바꾸는 PR → 배포 확인 → 대표가 서치어드바이저·서치 콘솔 등록·sitemap 제출. 아래 #541 항목의 '운영 주소는 Allow' 설명은 그때부터 적용된다.

## 2026-11-14 — 공유 링크 미리보기 카드 + 검색 준비 1차 (이슈 #541, 로컬5 레인)

- **/t/<공유 id>**: `functions/t/[[path]].js` + `functions/_lib/tree-preview.mjs`. 사람은 지금 공유 주소 형식(`#share/<id>/<view>`, 운영 주소 루트·그 밖은 /v41/)으로 302, 링크 미리보기·검색 봇(facebookexternalhit·Twitterbot·Discordbot·kakao·Googlebot 등)은 og 메타 HTML. 카드 내용은 서버 공개 공유 읽기(GET /api/public/shares/:id): 제목=트리 제목, 설명='순간 N개 · 좋아하는 대상'+'“첫 순간 제목”'(첫 순간 기준은 entryMomentId→루트→첫 카드, community-service card()와 같은 순서), 그림=저장 ytimg 썸네일→첫 순간 링크 YouTube hqdefault→기본 카드 그림. 취소·삭제·없음(404/410/422)·형식 밖은 '공유가 취소되었어요' 카드(noindex)+사람은 첫 화면, 서버 응답 실패는 중립 기본 카드(noindex)+사람은 공유 주소. og:url·canonical 은 운영 주소 고정. 계정 이름·아이디·이메일·내부 id(트리/순간 id·subjectId)는 HTML 어디에도 없음, /api/media/ 사진은 ytimg만 허용하는 그림 규칙으로 차단. 시험 `tests/pages-search-preview.test.mjs`(17건).
- **기본 카드 그림**: `public/og/lovetree-card.png`(1200×630, 약 264KB) — 첫 화면(SRC064) 빈 나무 그림 결(금테 카드 세 장+금테 실), identity.css 토큰 색(#040407/#0a0a11/#ffe6a6/#f5f1e9/#d88f9c/#a99ac9/#7892c9/#e6b14c), '러브트리 · 좋아하는 순간을 모아 두는 곳'. 저장소 밖 임시 스크립트+Playwright(Chrome)로 렌더한 결과물만 저장소에 넣음(생성 스크립트는 커밋 안 함).
- **앱 주소**: `public/v41/shell/messages.mjs` shareUrlFor 가 `/t/<id>` 를 돌려준다(복사·열어 보기 모두). 기존 `#share/<id>/<view>` 주소도 그대로 열린다(앱 안 이동·둘러보기는 그 형식 유지). 시험 3건 기대값 갱신(`v41-shell-messages`·`v41-share-list`·`v41-share-steps`).
- **검색 준비**: `functions/robots.txt.js`(host 를 봐서 운영 주소는 Allow+Sitemap 안내, pages.dev 등 나머지는 Disallow: /), `functions/sitemap.xml.js`+'`functions/_lib/search-meta.mjs` collectSitemapShares'(운영 주소만, 둘러보기에 공개된 공유=status active && discoverable 만 — **조건은 이 함수 한 곳**, #538 뒤에 거기서 바꾼다; 서버 discover 목록을 limit 24·cursor 로 최대 200건), `functions/v41/index.js`+`functions/index.js`(개발 주소(*.pages.dev) 문서에 X-Robots-Tag noindex — /v41/·루트(4.0)), `public/_routes.json` include 에 `/v41/`·`/t/*`·`/robots.txt`·`/sitemap.xml` 추가. `public/v41/index.html` head 에 description·og·twitter·canonical(운영 주소)+확인용 메타 두 칸(naver-site-verification·google-site-verification, 값 비움 — 대표가 서치어드바이저·서치 콘솔 등록 때 채움). **본문은 건드리지 않음.**
- **선례 확인(AGENTS 규칙)**: LoveBud(b80647f)·lovetree-limone(aae492e)에서 og 메타·공유 미리보기·sitemap 구현을 찾지 못했다(_headers·CSP는 있으나 og 카드·sitemap 없음) → 신규 작성. thumb-fallback.mjs youtubeIdFrom 과 같은 규칙의 youtubeVideoId 를 함수 묶음용으로 뒀고 두 벌 판정 일치를 시험으로 견준다(클라 모듈 통째 import 회피).
- **주의/남긴 것**: ① `/v41/` (끝 슬래시) 요청이 functions/v41/index.js 로 걸리는지는 배포 뒤 curl 로 확인 필요 — 걸리지 않으면 robots.txt 차단만 남는다(기능 영향 없음). ② 실제 공유 1개로 카드 curl 검증은 미완료 — 시험 계정 03이 2026-11-09 대표 결정으로 삭제돼 있고(.secrets 에 01·02·04 키만 있음), 다른 레인 몫 계정은 쓰지 않는 규칙이라 여기서 멈춤. ③ sitemap 은 discoverable 공유가 지금 0개라 빈 urlset 이 나온다. ④ 카카오·페이스북 공유 디버거 화면 확인은 로그인이 필요해 대표 확인 항목으로 남긴다. ⑤ `npm test` 1,483건 1,444 pass/0 fail/39 skip, build·modulepreload --check 통과. 기존 `domain-routing.test.mjs` 는 pages.dev 루트가 next() 로 가던 옛 기대를 새 noindex 동작에 맞게 갱신.

## 2026-11-14 — #553 보드: 썸네일이 실린 긴 YouTube 카드가 줄 간격(420px)을 넘어 위아래 카드와 겹침 (로컬2, ai/com1-lt553-board-yt-overlap-20261114-075350-876bda, main d6c0f69 기준)

- **원인**: treeSpread의 줄 간격이 고정 420px인데 썸네일이 실린 YouTube 카드는 실세로 465px(세로 Shorts 648px)라 같은 열 위아래 카드와 28px씩 겹쳤다(모아둔 순간 26 구조에서 인접 겹침 22쌍, 390 면적 153,337px²·1440 98,136px²). #536 전 배치에도 있던 특성.
- **고침(두 층)**: ① `treeSpread(ids, edges, heights)` — 화면이 카드 종류별 예약 높이(board.js: YouTube 가로 480·세로 680, 기본 260 — CSS가 정한 최대 높이+여유)를 넘기면 밴드의 최대 높이+여백 160px가 줄 간격이 된다. 기본 카드뿐인 트리는 420px로 같아 예시 40순간 배치가 그대로다(시험이 좌표까지 고정). ② `settleColumnGaps`(모델)+`settlePlacedCards`(화면) — 카드를 그린 뒤 offsetHeight를 재어 같은 열 안 남은 겹침(긴 메모 등)을 top만 고쳐 벌린다. innerHTML 다시 쓰기 없음·깜빡임 없음, 저장 자리 카드는 그대로(#395), 썸네일이 실린 뒤 한 번만 다시 잰다.
- **실측(시험 데이터 재현, 계정 사용 없음 — 셸과 같은 LT41 문맥을 호스트로 흉내)**: 모아둔 26(자식 전부 YouTube) 겹침 22쌍 → 0쌍(390·1440 × 종이·밤 4조합 전부), 390 줌 100%·1440 0.8배 유지. 예시 40순간 처음 보기: 줌 80%·카드 줄 y [150,570,990,1410]·무대 2200px 그대로. 혼합 종류(가로·세로 유튜브+긴 메모 733px+저장 자리 카드)에서도 겹침 0·저장 자리 유지. 확대 중 fps 1440: 전/후 같음(43fps, 헤드리스 소프트웨어 렌더링 기준 — 전후 동일이 본 뜻). 스크린샷·수치 E:\lovetree-qa\553\.
- **시험**: 신규 `tests/v41-board-yt-overlap-553.test.mjs` 5건(모델 3+실행형 2, 미리보기 검사 '화면 시험 — 보드·접근성·날짜' 잡에 단계 추가, `LT_BOARD_YT_REQUIRE=1`). 옛 코드로 되돌리면 3건 빨강. `v41-board-model` export 목록에 settleColumnGaps 추가. `npm test` 1,535건 0 fail(지도 대비 300초 타임아웃은 이 환경의 알려진 문제 — HANDOFF 2026-11-13 참고, 지도 파일은 이번 변경 밖), build·modulepreload --check 통과.
- **남긴 것**: 저장 자리가 이미 저장된 트리(보드 동기화로 x·y가 저장된 경우)는 저장값을 그대로 쓰는 #395 계약대로라 이번 규칙이 다시 놓지 않는다 — 저장 자리 카드와 배치 카드가 섞인 열은 settleColumnGaps가 저장 카드를 피해 벌린다. 실제 계정 로그인 화면 확인은 이번엔 불필요(호스트 흉내가 셸과 같은 문맥) — 필요하면 컴2 tabbit로.

## 2026-11-14 — 고객 의견 2차: 관리자 게시판 + AI 고객 사용 일지 (이슈 #540, 로컬3 레인)

- **DB**: `server/db/migrations/board-261114.sql` + `schema.sql`. `lovetree_product_roles` CHECK 에 `ai_customer` 추가. `lovetree_feedback` 에 `kind`(opinion/journal)·`title`·`score`(1~5)·`journal_date` 추가. 신규 `lovetree_feedback_replies`(customer/internal)·`lovetree_ai_personas`(이름+intro jsonb). 계정 탈퇴 경로에 replies·personas 포함.
- **서버**: `server/feedback-service.js` 확장 — `POST /api/board`(AI 고객 하루 1건, 다시 쓰면 고침)·`GET /api/board/mine`·`GET /api/board/journal/today`·`GET /api/admin/feedback`(목록, kind·status 거르기)·`GET /api/admin/feedback/:id`(상세+답글+페르소나)·`POST /api/admin/feedback/:id/reply`·`GET·PUT /api/admin/persona/:id`. `admin-roles.js` 에 `ai_customer` 역할. `account-service.describe` 에 `aiCustomer`. proxy 허용 목록·라우팅 추가.
- **운영센터**: `src/admin.js` 를 게시판으로 재작성(목록→상세→답글[고객 답변/내부 메모]→글쓴이 페르소나·이슈 탭[GitHub 공개 저장소]). 신고 검토 칸 유지. `admin.css` 를 --lt-* 토큰·검은 무대·금테 카드로. `admin.html` 에 identity.css 로드.
- **사이트**: `public/v41/feedback-board.mjs`(AI 고객 '오늘 사용 일지' 글쓰기 + '내 의견'), 계정 메뉴 버튼(AI 고객 전용 '오늘 사용 일지', 로그인 사용자 '내 의견'). `shell.mjs` 배선.
- **내보내기**: `tools/export-ai-customer.mjs`(컴1 node, 관리자 API) — AI 고객별 `일지_YYMMDD.md`·`소개.md`. 예약 등록은 대표 확인 뒤.
- **시험**: `tests/board-service.test.mjs` 9건, `tests/export-ai-customer.test.mjs` 4건, `tests/feedback-postgres.test.mjs` +1(게시판). `npm test` 1,439 pass/0 fail(브라우저 지도 대비 제외), build·modulepreload 통과. 관리자 게시판 실화면(모의 관리자 API): 390·1440 목록·상세+답글·페르소나, 가로 넘침 0.
- **남긴 것**: 실 PTgreSQL·배포·머지는 CI/컴2. 내보내기 실데이터 실행은 AI 고객·일지 데이터가 아직 없어 미실행(스크립트·포맷 시험만). 로그인 상태 사이트 플로우는 OAuth·비밀값 필요해 미확인.

## 2026-11-14 — #536 보드: 넓은 화면 판 쏠림·별 모양 기둥 배치·머리줄 [종이|밤]·읽기 전용 표시 (로컬3, ai/local3-lt536-boardwide-261114, main 3c21387 기준)

- **판이 오른쪽에만 차는 원인**: `startView`의 `clampAxis`는 판(흰 판 ∪ 순간 묶음)이 화면보다 좁은 축에서는 아무 정렬을 하지 않아, `fitBox`가 순간 묶음을 보이는 칸에 가운데 둔 자리가 그대로 남았다 — 2560에서 순간 1개면 판 left 863px(화면의 34%). 고침: `coverView` — 덮을 수 있으면 clamp(빈 곳 없이), 못 덮으면 그 축은 화면 가운데. 기억한 자리(저장된 보기)도 같은 규칙을 거치게 `LT58Model.startView({saved})`로 넘긴다(배율·자리 기억 #490·#492는 유지 — 판이 화면을 덮으면 밀고, 덮지 못하면 가운데).
- **카드가 한 기둥으로 쏠리는 원인**: 빠른 추가·'새 트리로 만들기'가 순간을 전부 한 뿌리의 자식으로 만들어(src/domain.js quickAdd·treeFromMoments) 깊이가 1뿐이고, 열=깊이 규칙(#498)이 한 열에 N장을 쌓았다(모아둔 26 = 폭 449px 기둥·세로 10460px). 고침: treeSpread에서 밴드가 7줄을 넘게 쓰면 DFS 순서대로 열 우선 칸에 나눠 담는다(예시 40순간·사슬·#395 14순간은 7줄 이하라 그대로).
- **속도**: 휠 확대 중 장식 애니메이션(실 점선·핀)을 멈춘다(#346 판정에 휠이 빠져 있었다) — 확대 fps 27~38 → 57~58. 카드 끌기의 실 다시 그리기는 핀 읽기를 먼저 다 하고 d 속성을 한 번에 써, 프레임당 강제 배치를 연결 수만큼 → 1회로(콜백 최대 6~7ms → 4ms). 카드 그림자·판 질감은 디자인 그대로.
- **머리줄 [종이|밤]**: 도구 줄에서 머리줄('전체 보기' 옆)로 옮겼다 — 고급을 켜지 않은 기본 화면에서도 보이고 한 벌뿐이다. 값·저장 키(lt41.boardTheme)·postMessage 흐름은 그대로(설정 '보드·지도 판'·지도와 같은 값). 390 머리줄 넘침 0(단순·고급 × 쓰기 가능·예시), #521 표시·선택 줄 겹침 0 유지.
- **'진주빛 보드 · 읽기 전용'**: 자기 기록(쓰기 가능)에는 '읽기 전용'을 붙이지 않고, 예시·공유에는 유지한다(#531 계약).
- 시험: 신규 `tests/v41-board-wide-view-536.test.mjs` 6건(실행형, 미리보기 검사에 `LT_BOARD_WIDE_REQUIRE=1` 단계 등록). `npm test` 0 fail(37 skip), build·modulepreload --check 통과.
- 실측(계정 01 시험 트리, 확인 뒤 삭제): 2560×1080 순간 1개 판 left 862→128px(채움 66→90%), 모아둔 26 묶음 폭 449→954px·겹침 0, 기억한 자리(z 0.38)는 가운데 복원. 1440·1920·순간 40개 처음 보기는 이전과 같다.
## 2026-11-14 — 고객 의견 창구 1차 (이슈 #540, 로컬3 레인)


- **표**: `lovetree_feedback`(id, product_id, subject_id[로그아웃이면 NULL], category[bug/inconvenient/feature/other], body[1~2000], context jsonb, status[received/reviewing/fixed/later], memo, issue_number, created_at, updated_at). `schema.sql` + `server/db/migrations/feedback-261114.sql`(둘 다 IF NOT EXISTS). 계정 탈퇴 경로 `ACCOUNT_USER_TABLES`에 `lovetree_feedback`(subject_id) 추가.
- **서버**: `server/feedback-service.js`(검사·개인정보 가림·로그아웃 10분 3회 제한·관리자 권한), `server/db/feedback-postgres.js`, `server/index.js` 배선. 경로 `POST /api/feedback`(로그인·로그아웃), `GET /api/admin/feedback`, `PATCH /api/admin/feedback/:id`(관리자). `functions/_lib/proxy.js` 허용 목록 추가 + Cloudflare 접속 IP를 `x-lovetree-client-ip`로 서버에 전달(로그아웃 제한용).
- **운영센터**: `src/admin.js`에 '고객 의견' 칸(최신 순·종류/상태 거르기·상태 변경·운영 메모·연결 이슈 번호·'GitHub 이슈 글 만들기' 복사 — 계정·트리 내용 제외). `src/admin.css`에 입력样式.
- **사이트 창**: `public/v41/feedback.mjs`(창·API), `public/v41/index.html`(계정 메뉴 '의견 보내기'·첫 화면 아래 작은 링크·`feedback-panel` 창), `public/v41/shell.mjs`(배선·자동 정보), `shell.css`. 자동 정보(지금 화면·화면 크기·테마·앱 버전·로그인 여부·내 트리 id)는 보내기 전에 보이고 끌 수 있다.
- **시험**: `tests/feedback-service.test.mjs` 8건(저장·검사·PII 가림·로그아웃 제한·관리자 목록/변경), `tests/feedback-postgres.test.mjs` 2건(저장·거르기·업데이트·컬럼·빈 context). CI `ci.yml` postgres job에 `tests/feedback-postgres.test.mjs` 추가, `scripts/apply-schema.mjs` TABLES에 `lovetree_feedback` 추가.
- **실화면(모의 서버, 로그아웃)**: 390·1440에서 작은 링크→창 열림→보내기→'받았어요. 살펴보고 고칠게요.' 확인. 390 창 358×756(화면 안, 스크롤), 1440 460×812(화면 안). 자동 정보 `screen/viewport/theme/version/loggedIn` 전송, 로그아웃이라 treeId 없음. 계정 메뉴 '의견 보내기'·로그아웃 링크 DOM 확인. 라이브 프런트(pages.dev) 배포 후 `feedback-link`·`feedback-panel`·`account-feedback`·`feedback.mjs` 확인.
- **머지/배포(2026-11-14)**: PR #543 스쿼시 머지 → main `51b39e9`. 필수 검사 4개(ubuntu·windows·미리보기 postdeploy·PostgreSQL 저장·로그인 상태 검증) 초록. **프런트(Cloudflare Pages) 배포 완료** — pages.dev/v41/ 에 `feedback-link`·`feedback-panel`·`account-feedback`·`feedback.mjs` 라이브.
- **백엔드(컴2) 배포 완료(2026-11-14)**: SSH(컴1→컴2, `id_rsa`)로 `lovetree-api-autodeploy status` → `needs_manual_migration` 확인. 적용 전 `lovetree_feedback` MISSING·`lovetree_workspaces` 소유자 `lovetree_owner` 확인. `feedback-261114.sql`(md5 `38757e3a7e6f4439f1dda25d11017e2f`) /tmp 전송·일치 확인 후 `SET ROLE lovetree_owner` + `ON_ERROR_STOP=1`로 적용(CREATE TABLE·INDEX 2), 열 11·소유자 `lovetree_owner`·색인 3 확인. `AUTODEPLOY_ACCEPT_MIGRATIONS=1 ... run` 1회 → `result=installed`, installed_sha `51b39e9` = main.
- **실동작(로그아웃)**: 라이브 `POST /api/feedback` '[시험] 의견 창구 확인' → 201(id=1, received). DB 확인(건수 1, category=other, anon=t). 관리자 받은함은 로그인 권한이 없어 DB 조회로 확인(본문·계정 미출력). id=1 상태를 '다음에'(later)로 변경.
- **남긴 것/주의**: 로그인 상태 1건·관리자 화면 UI 실확인은 **미확인**(시험 계정 05 로그인은 OAuth·비밀값 취급이 필요해 이 레인에서 진행하지 않음 — 로그아웃 흐름만 확인). 2차(관리자 게시판·AI 고객 일지·페르소나·내보내기)는 별도 작업. 로컬 5→3 경로 수정. `v41/home.js`·`src/views/orbit.js`(로컬2)·`board.*`(로컬4)·`book.*`(로컬1)는 건드리지 않음(겹침 없음). `v41-map-contrast.test.mjs`는 이 환경에서 Chromium 렌더링이 300초를 넘어 타임아웃(내 변경과 무관, 다른 1,415건 통과).

## 2026-11-13 — 전 화면 접근성 재점검(레인 B): 닫힌 겹이 탭으로 들어가던 것 수리

- **점검**: 로그아웃 예시 + 로컬 빌드(dist)에서 첫 화면·책장·책·보드(판 종이/밤)·지도(그물/동심원)·둘러보기·설정·순간 추가·공유 창을 1440·390 × 밤·정원 전 조합으로 axe 점검(72행, tools/a11y와 같은 판정) — **serious 0 · critical 0**(#510 수리 뒤 기준). 설정·순간 추가·공유 창은 로그아웃 메뉴에 입장이 없어 showModal로 강제해 열어 검사했다(#462 선례).
- **수리(유일한 serious)**: 보드·책의 겹 몇몇(#detail·#overview·#postAdd)은 display:none 대신 transform·opacity로 치워 둬서 **닫혀도 탭이 들어왔다** — 보드에서는 뜰 때 첫 순간 상세가 저절로 열려 닫은 뒤에도 초점이 보이지 않는 단추(다음 순간 보기)에 남았다(WCAG 2.4.3·2.4.7). `view-a11y.mjs` updateDialogs에서 닫힌 겹에 `inert`, 열 때 제거하고, 닫힐 때 연 곳이 없으면(저절로 열린 겹) **고른 순간 카드**로 초점을 돌려준다. 연 곳이 있으면(책 목차 등) 기존처럼 그곳으로.
- **시험**: 신규 `tests/v41-view-a11y-panel.test.mjs` 3건(보드 1440 Esc·inert·카드 복귀·탭 차단, 390 닫힘 inert, 책 목차는 기존 복귀 유지) — 어댑터를 되돌리면 보드 2건이 빨강. `#460` 문자열 시험을 새 복귀 경로에 맞게 갱신. `npm test` 0 fail(37 skip), build·modulepreload --check 통과.
- **눌러 보기**: 보드 상세를 밤·정원 × 1440·390으로 열고 다음 순간 보기(갈림길 고르기 위 겹)→Esc 2회→카드 복귀 확인, 페이지 오류 0.
- **남긴 것**: moderate 이하는 이슈로 묶음(heading-order·landmark-unique·meta-viewport·region·empty-heading). 캔버스에 그려진 지도 이름표 대비는 axe가 볼 수 없어 별도 측정 필요. 390 보드는 뜰 때 상세가 열렸다 닫혔다가 타이밍에 따라 갈린다(판의 자체 흐름, 키보드 계약은 두 상태 다 지켜짐).
## 2026-11-13 — 지도 판 종이/밤, 보드와 같은 선택·실제 화면 대비

- 설정 행은 **보드·지도 판**, 저장 키는 기존 `lt41.boardTheme`다. 보드 도구 줄에서 고른 값도 열린 지도에 전달한다. `frame-wiring.mjs` 메시지와 `data-lt-board-theme` 속성을 쓰며, 지도는 색 캐시만 비워 변경당 한 번 다시 그린다. 같은 값 반복·유휴 그리기 0, 프레임 다시 뜨기 0.
- `network.css` 맨 끝의 `--lt-map-*` 한 벌을 캔버스가 읽는다. 밤 판은 캔버스·묶음 목록·탐색·상세·모바일 선택 줄·도구 줄을 함께 어둡게 한다. 저장 후 열기와 즉시 전환은 캔버스 픽셀 SHA-256·패널 계산색이 같다.
- **종이 픽셀 차이는 0이 아니다.** main `9685f5c`(#510·#511 포함)와 동일 조건 비교: 1440 3.41~6.37%, 390 9.01~15.41%(RGB 한 채널이라도 다르면 셈). 옅은 점·선·안내 원·첫 순간 고리와 일부 글자가 기존 1~2:1이라 대비를 보정한 차이다. 바탕·점/묶음/이름표 좌표·글자 내용·#461 계산은 같다. 색을 토큰으로 옮기기만 한 단계는 0~0.0017%였다. 원래 색과 대비 기준을 동시에 유지할 수 없어 화면 승인 대상으로 남긴다.
- 실제 화면 40장면(1440·390 × 밤·정원 × 종이·밤, 그물 전체/순간/묶음·동심원 전체/순간): DOM 글자 최저 5.00:1, 캔버스 글자·번호 6.67:1, 점 3.09:1, 선·화살표 3.41:1, 원·첫 순간 고리 3.63:1. 선택한 길은 묶음색과 빛 효과, 나머지는 대비를 유지하는 중성색으로 구분한다.
- 시험: `v41-map-contrast.test.mjs` + `helpers/map-contrast.mjs`(DOM 계산색·캡처 PNG 픽셀), `v41-map-theme-flow.test.mjs`(실제 설정·저장 복원·점/묶음·보기·확대/축소·상세·전체·창 크기 변경). 미리보기 검사에서 `LT_MAP_CONTRAST_REQUIRE=1`로 실제 실행하며 건너뜀은 실패다. 밤 글자·점 색을 바탕색으로 망가뜨린 별도 로컬 사본은 글자 1.02:1로 실패, 브라우저 없음 대조도 2 fail/0 skip.
- 기존 묶음 원 클릭이 빠지던 분류를 누르기에서만 바로잡았다. 원래 묶음 객체를 유지해 창 크기를 바꿔도 새 상자 가운데로 간다. 배치 함수는 바꾸지 않았다.
- 최신 main #511 병합 후 재검증: `npm test` 1,425건(1,388 pass / 0 fail / 37 skip — 지도 대비·흐름은 실제 실행), build·modulepreload 통과. 캡처·실측을 최신 낱말 기준으로 갱신했다.
- [네 조합 비교·종이 전후·역할별 실측과 재현 방법](design/map-theme-261113/README.md). 로그아웃 예시만 사용, 각 스크립트 브라우저 1개와 임시 서버는 `finally`에서 닫음. PR은 CTO 화면 검토를 위해 머지하지 않는다.

## 2026-11-13 — #467 보드 판 테마 종이/밤 두 벌 (PR #499, 지도는 #461 머지 뒤)

- **두 벌**: ① 종이(기본) = main 모양 그대로 ② 밤 = 판만 어둡고(금빛 테두리) 카드는 모든 종류가 밝은 종이 카드·짙은 글씨. 대표 비교용.
- **켜는 곳**: 설정 "화면 › 보드 판"(이 기기에만, `localStorage lt41.boardTheme`) · 보드 도구 줄 [종이|밤](고급 보기에서 보임). 셸은 프레임에 `html[data-lt-board-theme]` 속성과 `lt41-board-theme` 메시지를 보내고 다시 띄우지 않는다(`shouldReloadOnFrameMessage` false).
- **구조(CTO 검토 뒤 다시 짬)**:
  - 밤 판의 판·카드 색은 `board-extra.css` 맨 끝 한 덩어리(`html[data-v41-screen=board][data-lt-board-theme="night"] body …`). 원본 "밤" 보드 테마(`body[data-theme=night]`, 어두운 카드)·정원 규칙보다 위에 선다. 도구 창·상세 창·머리는 앱 테마(밤·정원) 그대로.
  - 실 색은 `board.css`의 `html[data-lt-board-theme="night"]`가 `--lt-thread-*`를 밝은 값으로 바꾸고, `board.js`는 그 변수를 다시 읽어 실·핀을 칠한다(같은 hex를 JS에 두지 않는다).
  - 원본 보드 테마(고급 도구의 진주빛·코르크·편지·꽃잎·밤·민트)와 판 테마는 따로다. `board-extras.js`는 여전히 `body[data-theme]=pearl`로 시작한다.
  - 판 바꾸기 클릭은 `button[data-board-theme]`만 받는다(속성만 보는 `closest('[data-board-theme]')`는 html/body 속성에 걸려 모든 클릭이 판 바꾸기가 됐다).
  - 종이 판에서 바뀐 것은 카드 날짜·표식·영상 제목·도메인 글자색(#8b7c91·#8e7a93·#947b9c → #61526a, 3.2→4.9:1)뿐. main과 화면 차이 0.03~0.04%(정원 0%).
- **대비는 실제 그려진 색으로 잰다**: `tests/v41-board-card-contrast.test.mjs` + `tests/helpers/board-contrast.mjs` — 셸째 연 보드에서 카드 종류(보통·첫 순간·마음 한마디 × 사진·포스트잇·메모지·둥근·필름·티켓)마다 getComputedStyle 글자색과 카드 바탕(반투명은 판 위에 겹친 색)으로 4.5:1 이상. 크롬이 없으면 건너뛴다(CI check 잡은 지금 건너뜀). `LT_BOARD_CONTRAST_ROOT=<dist>`로 다른 빌드 대조 — 고치기 전 커밋은 1.04:1로 빨강.
- **지도 테마에 넘길 메모**: 같은 방식으로 `html[data-lt-…-theme]` 속성 + 맨 끝 한 덩어리 CSS + 실제 화면 대비 시험(헬퍼 재사용)을 권한다.


## 2026-11-13 — #461 관계 지도를 화면에 맞게 펼치기·이름표·알기 쉬운 말 (ai/lane-lt-461-map-261113, main b28cdbd 기준)

- 무엇(지도 화면 `public/v41/views/network/`만): ① 배치를 화면 좌표로 — 지도를 덮는 도구(머리·안내 문구·순간 고르기 줄·왼쪽 패널·아래 묶음 줄)를 재어 남는 상자(`LT56Model.fitBox`)를 만들고, 두 보기 모두 그 상자에 맞춰 펼친다. 배율 1이 전체 보기다(예전 고정 무대 1700×4800·`smallTreeLayout`·`mobileFit` 제거). ② 그물형(`networkLayout(moments,{box})`): 묶음을 화면 비율에 맞는 칸(`gridFor`)에 지그재그로 앉히고(넓으면 가로, 좁고 길면 세로, 덜 찬 마지막 줄은 가운데), 묶음 안 순간은 칸에 맞춘 타원 위에. 묶음은 7개 안팎·최대 6개(`groupSizeFor` — 작은 트리는 억지로 6묶음으로 쪼개지 않는다). ③ 동심원형(`concentricLayout(...,{box})`): 부모 없는 다른 시작 순간은 첫 순간에 기대어 1단계 갈래로(예전엔 하나마다 바깥 원을 새로 만들어 40개 예시가 30겹), 자식 하나뿐인 순간은 부채꼴 안에서 돌아가며 놓고, 실제 범위를 상자에 맞춰 키운다(가로·세로 따로, 납작함 2배까지, 범위 가운데를 상자 가운데로). 단계마다 옅은 안내 원. ④ 점 반지름 한 곳(`dotRadius`) — 그리기·누르기·측정이 같은 값(예전 동심원 겹침은 그린 점이 배치가 가정한 점보다 커서였다). ⑤ 이름표(`placeLabels`): 멀리서는 첫 순간("여기서 시작 · 첫인상")·선택한 길·갈림길·묶음 이름만, 1.35배 이상 확대하면 모든 순간. 다른 이름표·점과 겹치는 자리에는 붙이지 않는다. 글씨 12px. ⑥ 말: 묶음 이름 "순간 01–07" → "첫인상부터 7개", 범례 "순간 위치 그룹" → "순간 묶음"(색 점 유지), 안내 토스트의 "위치 그룹" → "묶음". ⑦ 지금 고른 보기(그물형/동심원형)를 `--lt-primary` 눌린 색으로(도구 줄 알약 규칙보다 구체적이어야 보인다). ⑧ 세로 진행 막대 숨김(지도가 다 들어와 쓸 일이 없고 오른쪽 빈 띠였다).
- 주의: 화면 문서 끝의 `<style>`(모바일 안내 문구 자리)은 스크립트 뒤에 읽힌다 — 덮개는 DOMContentLoaded·load·글꼴 뒤 한 번씩 다시 잰다(유휴 반복 없음).
- 측정(로그아웃 예시 트리 5·15·40개 × 1440·1024·390 × 두 보기 = 18조합, 헤드리스 1개·저장소 밖 임시 폴더): 전 — 그물형 화면 폭 6~25%만 사용(1440·40개 5.8%), 1024·40개 순간 5개 화면 밖·글자 3개 잘림, 390·40개 4개가 아래 줄에 가림, 동심원 40개 점 겹침 19~45쌍·5개는 폭 0%, 캔버스 글씨 8~10px. 후 — 18조합 모두 화면 밖 0·가림 0·점 겹침 0·글자 겹침 0·글자-점 0, 상자 사용 83~99%, 상자 기준 쏠림 ≤9%, 글씨 12px, 유휴 rAF 0, 페이지 오류 0.
- 시험: 신규 `tests/v41-map-fit-461.test.mjs` 21건(실제 예시 트리로 실행: 상자 안·겹침·70%·쏠림·이름표·배선) — 예전 코드(main b28cdbd)에 그대로 돌리면 21건 모두 빨강(동심원은 상자 밖·첫 순간 고리 겹침으로 실패). 갱신 `v41-network-model`(0·2·3·4·6·8·14~17)·`v41-network-fit-261112`(문자열 → 실행)·`v41-negative-radius-449`·`v41-merge-network`. `npm test` 1362건 1325 pass/0 fail/37 skip, build·modulepreload --check 통과.
- 남은 것: 도구 줄 "연결 보기 0"은 셸(`shell.mjs` mountConnectionTool·`view-a11y.mjs` connectionLabel)이 붙이는 단추라 이번(지도 파일만) 범위 밖 — 말 바꾸기("이어진 선 n개")는 셸 담당 레인에서.
## 2026-11-13 — #462 순간 추가 창: 탭 클릭이 기본 탭을 바꾸지 않게 · 모바일 정리 (ai/lane-lt-462-write-panel-261113, main b28cdbd 기준)

- **기본 탭(대표 결정)**: `lt41.writeTab`은 설정 "순간 추가 › 먼저 보일 탭"에서만 바뀐다. 탭을 눌러 보거나(마우스·키보드) 저장까지 해도 이번 열림에만 적용된다(`write-panel.mjs choose()`가 더는 저장하지 않음). 저장하는 곳이 설정 행 한 곳뿐인지 시험이 `public/v41` 전체를 훑어 고정한다.
- **＋는 늘 새 순간**: '이 순간 수정'을 열었다 닫은 뒤 ＋ 순간 추가 → 자세한 추가로 저장하면 그 순간을 **고쳐 버리던** 결함(제목도 '순간 수정'으로 남음)을 `panels.startQuickSession()`에서 수정 상태를 비워 막았다. 처음 연 자세한 추가에 수정 전용 묶음(이전 순간 변경·관련 연결·이 순간 삭제)이 보이던 것도 `#moment-management`를 마크업 기본 `hidden`으로.
- **문구**: 입력 칸 "YouTube 같은 링크 주소", 쉬운 추가의 보관 용량 글씨 삭제, 자세한 추가 용량 한 줄 "사진 4MB, 영상 8MB까지 · 사진은 나만 볼 수 있어요"(권리 안내는 "직접 찍었거나 쓸 권리가 있는 사진만 올려 주세요"만 남김), 맨 위 안내 상자(`.quick-entry-lead`) 삭제 — 아래 안내 줄과 같은 말. 빈 주소일 때의 긴 주소 안내도 비움(`#url-media-hint:empty` 숨김). 업로드 오류 문구(`SIZE_PROBLEM` 약 4.2MB)와 표지 업로더(imagesOnly) 안내는 손대지 않았다.
- **모바일(≤780px)**: 탭 44px, 빈 미리보기 칸 숨김(주소를 넣으면 보임), 끌어다 놓기 안내는 `pointer:fine`이 아닌 기기에서 숨김+`aria-describedby` 해제(`quick-add.mjs`), 키보드: `write-panel.mjs`가 `visualViewport` 높이·위치를 `--lt-vv-h/--lt-vv-top`로 창에 넘기고 담기·저장하기를 창 아래에 붙였다(sticky). 1440은 창 위치·폭(450,44,540×812)·탭 40px 그대로.
- 시험: 신규 `tests/v41-write-tab-462.test.mjs` 8건(실제 모듈 셋을 셸 순서로 엮은 흐름). 예전 `write-panel.mjs`로 되돌리면 4건, 소스 전부 되돌리면 7건 빨강(입력 유지 1건은 원래 지켜지던 동작이라 초록). `npm test` 1347건 0 fail/37 skip, build·modulepreload 통과.
- 실측(로그아웃, 창은 `showModal()`로 강제로 열어 측정, 크롬 1회): 390·360 작은 누름 영역 2→0, 가로 넘침 0, 키보드 흉내(보이는 높이 508/480)에서 저장 단추 가림→보임, 탭 클릭 뒤 `lt41.writeTab` 'detailed'→그대로(null), 자세한 추가 내용 높이 1852→1012px.
- 로그인 없이 못 본 것: 실제 계정에서 ＋ 입구로 연 창·저장 흐름(실행형 시험으로 대신), 실기기 소프트키보드(iOS·Android)에서의 `visualViewport` 동작.

## 2026-11-12 — 사고: 본 주소 첫 화면 무한 새로고침(19:49~21:19 KST, 수리 #476, 후속 #477)

- 증상: 첫 화면(`/v41/home`) 프레임이 초당 약 6회 끝없이 다시 떴다(로그인·로그아웃 모두). 카드가 자리를 잡기 전에 문서가 다시 떠서 화면이 비거나 깜박였다. 책·보드·지도는 정상.
- 원인: 셸은 프레임이 뜰 때마다(+1.6초 뒤) `lt41-date-style`을 보낸다(`shell.mjs` onFrameReady). #470에서 첫 화면이 이 메시지를 받으면 무조건 `location.reload()` 하게 됐다 → 뜸 → 메시지 → 새로고침.
- 수리(#476): `shouldReloadForDateStyle`(`v41/home-moments.js`) — 지금 그려진 값과 다르고 기기 미러(`lt41.dateStyle`)가 이미 그 값일 때만 다시 띄운다. 흐름 시험 `tests/v41-home-date-style-loop.test.mjs`.
- **검사는 이 고장을 잡고 있었다.** 미리보기 postdeploy의 `visual/visual-theme` 실패가 바로 이 증상이었다(첫 화면이 계속 다시 떠서 ◐ 단추 클릭이 사라짐). 미리보기 검사 실행 기록(2026-11-12):
  - #470 변경이 **없는** 커밋 4개(#468, #471 첫 커밋, #473 첫 커밋, #476): 전부 1회에 통과.
  - #470 변경이 **있는** 커밋 11개: 1회에 통과한 것은 2개뿐(#473 병합 커밋, #475 둘째 커밋). 나머지는 재실행 끝에 통과(#470 3회째, #472 3회째, #471 병합 커밋 2회째, #474 마지막 커밋 2회째)하거나 끝까지 실패(#474 커밋 3개, #475 첫 커밋).
  - 즉 "Cloudflare 콜드스타트로 보이는 간헐 실패"가 아니라 그 변경이 만든 실패였고(고리 속에서도 클릭이 가끔 먹혀 통과하기도 한다), 재실행으로 초록이 된 채 머지됐다. 위 '빨간 필수 검사 규칙'은 여기서 나왔다.
- 남은 일: #477(프레임이 계속 다시 뜨는지 postdeploy가 직접 세게 — 지금은 테마 검사가 우연히 걸러 줄 뿐이다).

## 2026-11-12 — PR #396~#452 레인 사이 교차 결함 깊은 리뷰(이슈 #466, ai/local5-lt-crossreview-261112 외)

- 범위: 2026-11-11~12 머지분(약 35개 PR)을 7관점(중복 코드·CSS 누출·죽은 배선·설정 전달 경로·공통 틀 규칙·서버/클라 두 벌·약한 시험)으로 리뷰. 표는 이슈 #466. #453(빈 틀 숨김·write-panel 가짜 더러움·설정 창 다듬기 등)은 로컬2가 수리 중이라 범위에서 뺐다.
- 발견: 높음 0 · 중간 9 · 낮음 15. 서버/클라(`src/domain.js`↔`public/v41/domain.mjs`) 두 벌은 오늘 추가분 전부 동일 — 어긋남 없음.
- **PR A**(#470, 머지): 날짜 표기(dateStyle) 설정이 첫 화면·공용 썸네일 fallback 카드·새 기기 첫 그림에서 무시되던 결함 한 벌 마감. `src/views/orbit.js`가 server-only-contract 때문에 localStorage를 직접 못 읽어, 읽기는 `v41/home-moments.js`의 `ltDateStyle()`(새 export)이 맡고 `mountOrbit`에 `dateStyle` 옵션으로 주입.
- **PR B**(#472, 머지): 첫 화면 "최근 순간 카드"의 `role="button"` div가 안의 ▶ 재생 단추·"제목 달기"와 중첩 상호작용(axe nested-interactive)이 되던 구조를 해소 — 뒤에 깔린 투명 `<button class="recent-open">`가 열기를 전담, 모양·클릭·Enter·Space 동작은 그대로.
- **PR C**(#474): 고아 모듈 `v41/home-view-menu.js`+전용 시험, 이어 보던 순간 제거 뒤 남은 `actions.resume`/`canResume`, #417 머리 개편 뒤 남은 죽은 `.brand`/`.crumb` CSS, 특이도에서 항상 밀리는 중복 규칙 정리. 동작·화면 무변경(헤드리스 크롬으로 가로 넘침 0 확인).
- **PR D**(#475, 머지): 약한 시험 보강 — 썸네일 공용 모듈 배선 시험을 문자열 포함에서 실제 호출부 검사로, 공유 목록 시험에 실제 share-service 산출물 왕복 추가, normalizePrefs 두 벌 비교에 비기본값 조합 추가.
- 결정 필요(이슈 #466에 남김): 공유 "둘러보기에도 올리기" 기본값이 실제 적용 안 됨(표시만 켜짐), 정리 창(cleanup-panel) 더러움 확인 미등록, 책 컴포저 썸네일 호스트 드리프트(`img.youtube.com` vs 정본 `i.ytimg.com`), 책장·둘러보기·공유 목록의 자체 날짜 포맷(통일하면 기본 화면도 바뀜).
- 참고(정정, CTO): 이 리뷰 PR들에서 미리보기 postdeploy `visual/visual-theme`가 여러 번 실패한 것은 Cloudflare 콜드스타트가 아니라 **PR A(#470)가 만든 첫 화면 무한 새로고침** 때문이었다 — 위 사고 기록 참고.

## 2026-11-12 — CTO 점검 1차(#453): PR 1 A·B, PR 2 C·B-2·D

- **PR 1 A(예시 둘러보기에서 화면 틀·순간 추가가 숨던 문제)**: 예시 입구 `sample()`이 `leaveMember()`로 로그인 세션 자체를 버려 body가 `out`이 되고, #431 "빈 틀 숨김" 규칙에 걸려 `.tree-frame`·`#write-menu`가 함께 숨었다(규칙 문제 아님). `pauseMember()`(저장 연결만 dispose, 계정 표시 유지)로 바꾸고, 예시 상태에서 순간 추가·편집기를 누르면 로그인 화면 대신 `resumeMember(intent)`로 계정을 되살린 뒤 이어서 창을 연다(`panels.openEditor`·`quick-add.ensureWritable` 가드).
- **PR 1 B(자세한 추가 탭만 눌러도 "저장하지 않고 닫을까요?"가 뜨던 문제)**: ＋ 순간 추가는 쉬운 추가 탭으로 열려 자세한 폼의 기준값이 비어 늘 더러움 판정이 났다. `write-panel.mjs`에 `onTab`/`setTabHook`, `panels.mjs`에 `startQuickSession()`·`onWriteTab(tab)` — 처음 자세한 탭이 보일 때 기본값(감정 설렘·오늘 날짜)을 채우고 그때 기준값을 잡는다(기준값이 없을 때만). 탭 전환·편집기 초기화 때 `resetEditorBaseline`. 실제로 쓴 뒤 닫으면 한 번 묻는 규칙은 그대로.
- **PR 2 C(설정 창)**: 맨 위에서 열기(`openAccountSettings({section:''})`, `focusSettingsSection`은 구역 지정 때만 스크롤 — 내 데이터 입구만 그 묶음으로), 열 때 지난 안내 비움(`settings-feedback`) + 안내는 설정이 열려 있을 때만 그 줄에, 이름 없으면 '이름 없음'(이메일 한 번), 용량 '0 MB / 105 MB 사용 · n / 200개', 공유 "처음 열 보기" 이름을 화면 탭과 같은 책·보드·지도, 900px 이상에서 내용 폭 720px 안팎 가운데(390은 꽉).
- **PR 2 B-2**: 자세한 추가의 사진·영상 파일 칸을 디자인 단추('파일 고르기')+고른 파일 이름으로 바꿨다. 실제 `input[type=file]`은 같은 칸 안에 두고 `display:none`, 단추(`button[data-file-open]`)가 그 input을 연다(키보드 가능, 44px).
- **PR 2 D**: 빈 화면(`#book` 등)에서 맨 위 탭의 '지금 보는 곳' 표시를 지운다(둘러보기 창을 닫을 때도 되살리지 않음). 로그인 빈 화면 문구는 "아직 트리가 없어요." + 예시 둘러보기·첫 트리 만들기(백업 파일 열기는 로그아웃에만). 공개 트리가 0개면 둘러보기 오른쪽 미리보기 칸을 숨기고 빈 안내만 가운데.
- **E(예시 책 제목 뒤 "·")**: 재현하지 못했다 — 로그인 상태 예시 책(DOM)에서 `topbar innerText`가 "← 내 트리 / 좋아하는 순간들 / ▾ / …"이고, 보이는 글자 중 '·'로 끝나는 노드가 0건이었다(책 iframe 전체 스캔). 근거를 이슈에 남기고 손대지 않았다.
- 시험: `npm test` 1230건 1193 pass/0 fail/37 skip, `npm run build` pass, `node tools/v41-modulepreload.mjs --check` exit 0. 신규 `tests/v41-cto-453-a-b.test.mjs` 3건·`tests/v41-cto-453-cde.test.mjs` 6건, 갱신 `v41-quick-add-flow`·`v41-panel-mode`·`v41-account-settings`·`v41-screen-defaults`·`v41-shell-notice`.
- 실측: PR 1 `.tmp-453/check-pr1.mjs` **56/56**(1440·390 × 밤·정원, 로그아웃 예시는 숨김 유지·로그인 예시는 트리 틀(▾="좋아하는 순간들")·책/보드/지도 전환·순간 추가 보임, 예시→순간 추가 시 source=server 복귀, 탭만+Esc confirm 0·메모 쓴 뒤 1, 390 동그라미 261~305px·☰ 311~355px, 넘침 0·오류 0). PR 2 `.tmp-453/check-pr2.mjs` **66/66**(빈 화면 탭 표시 0·문구·단추, 둘러보기 미리보기 숨김·빈 안내 가운데 ±40px, 설정 맨 위·지난 안내 없음·용량 형식·이름 한 번·720px·390 꽉, 파일 단추 44px·input 숨김, 넘침 0·오류 0).
- 계정 04: 이번 두 PR은 mock 서버 계정만 써서 실제 계정 04에는 시험 데이터를 만들지 않았다(원복 불필요).

## 2026-11-12 — 하루 전체 점검(#449): postdeploy 기대값·접근성·속도·화면 오류 (ai/local2-lt-audit-261112, main e38f51a)

- 점검 범위: 본 주소 로그아웃 + 계정 04 로그인. postdeploy(로그아웃 20 pass/0 fail, 로그인 1 fail), a11y 104건(serious 2·critical 0), 속도(1440 5화면 × 3회 중앙값 + 전환 3회 + `/api/workspace` 3회), 화면 5종 × 1440·390 + 설정·순간 추가 창 열고 닫기.
- **고친 것 ①(도구 기대값)**: postdeploy `screen-settings`가 설정 "화면" 묶음 행 수를 `home-view-menu.js`의 보기 메뉴 항목(7)으로 계산해, #368·#441 뒤 실제 7행(테마·움직임·제목·페이지 넘김·날짜 표기·처음 보여 줄 곳·첫 화면 카드)을 10개 버튼으로 세며 실패했다. 화면의 `.settings-row .settings-label`을 그대로 세도록 바꾸고 `SCREEN_SETTINGS_ROWS` 한 곳에 이름을 적었다(보기 메뉴 함수 의존 제거).
- **고친 것 ②(제품 결함, 한 파일)**: 관계 지도에서 창이 낮을 때(준비 중 iframe 높이 < 300px) `overview`/`mobileOverview`의 `Math.min(...)`이 음수 배율을 내고, 그 값이 `drawHub`의 `createRadialGradient` 반지름(`hubR*scale*2.5`)까지 가 `r1 provided is less than 0` 페이지 오류가 났다(390·1440 모두). 배율 바닥값 `.12`·허브 반지름 바닥값 `.5`로 고쳤다. 짧은 창(390×260·1440×240) 배율 0.12·오류 0 확인. 시험 `tests/v41-network-fit-261112.test.mjs` 2건.
- 실측: 같은 조건 재측정 — `npm test` 1216건 0 fail(37 skip), `npm run build` pass, `node tools/v41-modulepreload.mjs --check` exit 0. postdeploy 로그인 실행은 이 PR 배포 뒤 `console-errors`까지 0이 되는 것을 머지 후 확인한다.
- 속도(본 주소, 1440, 3회 중앙값): 뼈대/전부 로드 = 첫 화면 149/448, 책 156/447, 보드 130/568, 지도 136/325, 책장 124/286ms. `/api/workspace` 40ms. 화면 전환 책→보드 278ms·보드→지도 216ms·지도→책 195ms. #400 기록은 로컬 dist 값이라 재는 자리가 달라 절대비교하지 않는다.
- 남긴 것(다른 레인 몫, 이슈 #449에 적음): 최근 순간 카드 `label-content-name-mismatch`(serious, `src/views/orbit.js` = 로컬1 #443 몫), 보드·지도 머리 임시 가드 정리(로컬3 #428 몫).
- 계정 04: 점검용 시험 트리(a11y 3권·속도/오류 1권)를 만들었다가 모두 지웠다(마지막 트리 0개·revision 191).

## 2026-11-12 — #366 관계 지도 다듬기: 안내 한 줄·연결 이유·키보드·길 강조 (로컬2, ai/local2-lt-366-map-261112, main 1d309f2→55aadb2 병합 기준)

- 점검(둘 다 보기 × 1440/390 × 밤/정원 × 로그아웃(예시)/로그인, 실측 209항목): 7항목 중 ② 첫 순간 강조(크게·금빛 후광·"여기서 시작"·자리 고정)·⑤ 동심원(첫 순간 가운데, 바깥으로 단계)·⑥ 보기 버튼과 기억(`lt41.network.view`)·⑦ 배치 한 벌(`LT56Model.networkLayout`·`concentricLayout`·`originPath`·`relationText`)은 이미 됨. ①·③·④는 안 됨/일부여서 고쳤다.
- ① 안내 한 줄: 첫 로드에 부팅 코드가 `centerOn`(자동 맞춤)을 불러 `.hero`("첫 순간에서 어떻게 이어졌는지 보는 지도예요")가 opacity 0.07로 흐려졌다 — 자동 맞춤만 뺐다(선택은 그대로 두어 길 강조·상세는 이전과 같다).
- ③ 연결 이유: 화면이 `LTDEMO.edges`를 그래프로 옮길 때 `reason`을 버려 툴팁이 늘 비어 있었다(부모 선 5개 중 이유 0개) — 옮길 때 `reason`을 함께 넘긴다. 그리고 동심원처럼 선이 짧은 배치에서는 선 위에 정확히 올리기 어려워 노드가 먼저 잡히므로, **순간에 올리거나 눌러도 그 순간으로 들어온 선의 이유**를 띄운다(같은 `edges`·`relationText` 한 벌, 이유가 비면 표시 생략). 캔버스에 `tabindex="0"`·`aria-describedby="mapKbHint"`(sr-only 안내)·툴팁을 `role="status" aria-live="polite"`로 바꾸고 초점 테두리를 더했다. 키보드: Esc(풀기)·Home/End·방향키(순간 이동, 감싸 돎)·Enter/Space(그 순간 열기) — 이동할 때마다 들어온 선의 이유를 툴팁과 낭독기로 함께 알린다. 키보드는 `scheduleDraw` 한 번만 쓴다(#346 유휴 rAF 0 유지).
- ④ 지나온 길: 두 보기가 같은 `originPath`·`pathEmphasis` 한 벌을 쓴다는 계약을 시험으로 고정(동심원에서도 밝은 노드·선 수가 경로와 정확히 일치). 구현 변경은 없다.
- 시험: `npm test` 1214건 1177 pass/0 fail/37 skip(main #443 병합 후), `npm run build` pass, `node tools/v41-modulepreload.mjs --check` exit 0. 신규 `tests/v41-map-366-261112.test.mjs` 5건(① 자동 맞춤 없음·③ reason 전달/호버·터치·순간 위 이유·키보드/낭독, ④ 같은 계산 한 벌, 유휴 rAF 0).
- 실측(.tmp-366, dist 단독 + `window.LT41` 6순간 주입, 크롬 1회·4249 포트, try/finally): **209/209** — 2보기 × 1440/390 × 밤/정원 × 로그아웃/로그인마다 ① 안내 opacity 1·문구 일치 ② 첫 순간 r 10>나머지 ③ 마우스(선 위/순간 위)·누름(터치)·키보드(Home→m1, →→m2, 이유 표시, Enter로 열림) ④ 밝은 노드·선 수=경로 길이(3선 모두 부모) ⑤ 첫 순간 중심·단계 3 ⑥ 버튼 aria-pressed·기억 ⑦ 모델 함수 한 벌, 가로 넘침 0·유휴 rAF 0·페이지 오류 0.
- 남은 것: 없음. 나무형 보기는 이슈에 적힌 대로 "나중에"(이번에 하지 않음).

## 2026-11-12 — #426 첫 화면 "마지막 순간"을 YouTube 썸네일 카드로 (로컬2, ai/local2-lt-426-recent-261112, main 41d97c6→a2c8d7c 병합 기준)

- 무엇: 로그인 첫 화면 제목 아래 두 줄 안내("마지막 순간 「…」 · N일 전")를 최근 순간 카드 한 장으로 바꿨다. `src/views/orbit.js`의 `recentMarkup` — 썸네일 크게(16:9·세로 9:16), 아래 "마지막 순간 · N일 전"·한 줄 제목·"트리 이름 · 이어 보기 →", 테두리·이중선·금빛 번짐은 궤도의 금빛 내 카드(`.card.mine`)와 같은 토큰. 데이터원은 순간 목록 한 벌(`momentList.entries[0]`, 최신순·트리 이름 포함) — 궤도가 예시 모드(섞어서·사진 3장 미만)여도 순간만 있으면 카드가 나오고, 로그아웃은 momentList가 없어 카드가 없다. 썸네일은 공용 모듈(#435) 그대로(thumbFallbackAttrs·fallbackCardMarkup·needsFallbackCard) — 지워진 영상은 글 카드·최소 카드로 내려간다. ▶를 누르면 그때만 embed iframe(autoplay, book-usability `embedUrl`)을 만들고, 다시 누르면 정지(썸네일 복귀·▶/■·aria-label 재생/정지). 첫 화면이 열릴 때는 플레이어 요청 0건(썸네일 그림만). 카드 본문 클릭·Enter·Space는 그 순간 열기(궤도 카드와 같은 onOpen→lt41-open-book 경로), ▶ 클릭은 stopPropagation으로 분리. "이어 보던 순간" 버튼은 뺐다 — 로그인 후 버튼은 [＋ 순간 추가·둘러보기] 두 개(home-center LABELS/KEYS·header-state homeCenterState·applyHomeCenter는 남는 자리 hidden), home.js의 resume 배선 제거, 둘째 줄은 안내 한 줄만(label이 null이면 br·문구를 아예 붙이지 않게 고침 — append(null) 버그 함께 수정). 사진은 ▶ 없는 사진 카드, 글은 글 카드, 순간이 없으면 카드 없음(기존 첫 순간 안내·버튼 흐름 그대로).
- 안전 구역·모바일: 카드가 .center 안에 있어 #440의 안전 구역 측정에 함께 잡힌다(궤도 카드 침범 0). 390에서는 카드 폭=화면-32px, 세로 썸네일 높이 38dvh 제한으로 버튼이 화면 안에 유지된다.
- 시험: `npm test` 1203건 1166 pass/0 fail/37 skip(main #442 병합 후), build·modulepreload pass. 신규 `tests/v41-home-recent-261112.test.mjs` 7건, 갱신 `v41-header-ia`·`v41-home-hero-261111`(버튼 2개·homeSecondLine null)·`v41-auth-skin`(resume 배선 제거).
- 실측(.tmp-426, dist home.html + 서버가 LT41 장면 주입, 크롬 1회·4246 포트, try/finally): **80/80** — 1440·390 × 밤·정원(가로 영상 최신): 카드·16:9·썸네일 로드·로드 시 embed 요청 0건·▶ 뒤 iframe+요청 1건·정지 복귀·카드 클릭/Enter→lt41-open-book(tree1/v-h)·버튼 2개·둘째 줄 안내만·안전 구역 침범 0(드래그 3시점)·넘침 0. 쇼츠: 9:16·390 카드 폭 358px·높이 321px=38dvh·버튼 화면 안. 지워진 영상: fallback 글 카드("영상을 볼 수 없어요")·▶ 없음. 사진·글·순간 없음·로그아웃 각각 확인, 페이지 오류 0.
- 성능 전/후(41d97c6 vs 이 브랜치, dist/v41/home.html 단독, 서버 첫 응답 뺀 3회 중앙값, 번갈아 2회): 뼈대 완성(DCL) 51/47ms → 46/39ms, 전부 로드 306/316ms → 269/257ms — 나빠지지 않았다.
- 남은 것: 없음(이슈 #426 요건 전부). 본 주소 실제 확인(계정 04)은 머지·배포 뒤 필요하면 한다.

## 2026-11-12 — #429 PR 2: 첫 화면 카드 겹침 — 불투명·크기·밝기 깊이·가운데 안전 구역·폭별 카드 수 상한 (로컬2, ai/local2-lt-429-layout-261112, main b64e8ee 기준)

- 무엇: 첫 화면 궤도(`src/views/orbit.js`)만 고쳤다. ① 카드는 언제나 불투명 — 프레임마다 `el.style.opacity`로 깊이를 내던 것을 없애고(opacity 인라인 0), blur도 쓰지 않는다(재생 표식의 `backdrop-filter`까지 제거). ② 깊이는 크기(기존 scale)와 밝기로만 — 뒤쪽 카드는 `brightness(0.78~1)`(원형 배치 8장 이하는 밝기 1). ③ 카드끼리 살짝 겹치는 것은 그대로 허용. ④ 가운데 안전 구역: 제목·문구·버튼 묶음(`.center`) 사각형+여백 32px을 재어(`measureSafeZone`, 창 크기·글꼴 도착 뒤 다시 측정) 카드 사각형이 겹치면 가장 얇은 쪽으로 민다. 카드 사각형은 rotateX·Y·Z 합성 회전→scale→원근(1200px) 투영을 네 귀퉁이로 계산(원근 원점은 화면 중심 — 카드 중심도 함께 투영됨)하고, 프레임 사이 변화를 덮는 12px 여유를 더 둔다. 옛 고정 타원 밀어내기(`Math.hypot(x/520,y/260)`)는 대체. ⑤ 폭별 카드 수 상한 `CARD_CAPS`: 1280 이상 28장 / 900~1279 20장 / 650~899 14장 / 그 아래(390 포함) 10장 — frame마다 폭으로 다시 판정해 넘치는 카드는 `display:none`(창이 넓어지면 다시 보임). ⑥ 둘러보기 감상자 차단 문구의 "발견"을 "둘러보기"로(`community-panel.mjs` 확인·완료 메시지 2곳).
- 성능 보호(#400): 카드 크기 측정(`offsetWidth`)·안전 구역 측정(`getBoundingClientRect`)은 강제 레이아웃이라 첫 프레임에서만 하고(둘째 프레임부터 밀어내기 적용), `document.fonts.ready` 접근은 뼈대 완성(DCL)을 ~90ms 늦추는 것을 실측해 1.5초 타이머로 대체했다.
- 시험: `npm test` 1188건 1151 pass/0 fail/37 skip, `npm run build` pass, `node tools/v41-modulepreload.mjs --check` exit 0. 신규 `tests/v41-home-layout-261112.test.mjs` 5건(상한표·숨김/복원·불투명·밝기·안전 구역·문구), `tests/v41-home-cards.test.mjs` 궤도 계약 갱신(opacity 인라인 금지·brightness·카드 규칙 blur 금지).
- 실측(dist 단독 home.html + `window.LT41` 주입 40순간, 크롬 1회·4242 포트, try/finally): 1440·390 × 밤·정원 36/36 — 안전 구역 침범 0(드래그로 궤도를 돌린 3시점씩), 카드 opacity<1 0개, 카드 blur 0개, 보이는 카드 수=상한(1440 28·390 10), 밝기 최소 0.78·최대 0.99, 가로 넘침 0, FIRST 표식·금빛 내 카드·드래그·움직임 줄이기(숨긴 카드 제외 전부 배치) 유지, 페이지 오류 0.
- 성능 전/후(b64e8ee vs 이 브랜치, dist/v41/home.html 단독, 서버 첫 응답 뺀 3회 중앙값, 번갈아 2회): 뼈대 완성(DCL) 44/36ms vs 42/47ms, 전부 로드(load) 301/238ms vs 275/275ms — 나빠지지 않음.
- 남은 것: 없음(이슈 #429 두 PR로 마감). 카드 수 상한 값은 위 ⑤의 값으로 PR 본문에도 적는다.

## 2026-11-12 — #368 2차: 프로필 편집·페이지 넘김·저장 위치 표시 (로컬3, ai/local3-lt-368-2nd-261112, PR #436, main 6613f3a→b9f8960 병합 기준)

- 무엇: ① 설정 "프로필"에서 표시 이름(20자·공백 정리)·동그라미 색(기본+7색) 편집 — 저장은 새 API 없이 계정 기록의 설정 칸(`state.prefs`, setPrefs 재사용). 서버 `src/domain.js`·클라이언트 `public/v41/domain.mjs` 두 벌의 `normalizePrefs`에 `displayName`·`accentColor` 규칙을 추가했고 옛 저장본(값 없음)은 빈 값으로 그대로 읽힌다. 동그라미 글자는 표시 이름 첫 글자→이메일 첫 글자→나(#424), 색은 고른 색(없으면 기본색)이며 맨 위 계정 버튼·계정 메뉴·설정 프로필에 즉시 반영. 색 토큰은 `identity.css`의 `--lt-accent-*` 7색. 쓰다 만 프로필은 공통 틀이 "저장하지 않고 닫을까요?"를 한 번 묻는다(`PANEL_DIRTY['account-settings']` — 브라우저 실측에서 등록 누락을 잡아 수정).
  ② 설정 "화면"에 "페이지 넘김: 종이처럼(기본) / 부드럽게"(#368 댓글 2) — 이 기기 저장(`lt41.pageTurn`, try/catch). 기억책은 한 장/두 장 보기와 같은 localStorage 읽기 + `lt41-page-turn` 메시지로 다음 넘김부터 적용. 시스템 움직임 줄이기가 있으면 무조건 부드럽게(0.35초 페이드) — book.js의 `smoothTurn()` 한 벌로 넘김 경로 6곳 통일.
  ③ 설정 8개 항목마다 "계정에 저장 / 이 기기에만" 표시 — 실제 저장 위치 확인 후 부착(제목 보기·프로필=계정, 테마·움직임·페이지 넘김·카드·탭=기기).
- 병합: 작업 중 main 두 번 이동(#434 공유 창·#435 썸네일) — 첫째는 병합으로(충돌 0, 패널 더러움 계약 갱신), 둘째는 GitHub 머지가 처리. 머지 후 main 트리에서 `npm test` 1182건 0 fail 재확인.
- 시험: `npm test` 1175건(브랜치)·1182건(머지 후 main) 모두 0 fail/37 skip, `npm run build` 통과, `node tools/v41-modulepreload.mjs --check` exit 0. 신규 `tests/v41-page-turn.test.mjs` 4건, `v41-title-prefs` +2건(두 벌 같음·옛 저장본·PUT→GET), `v41-account-settings`(프로필 폼·더러움 등록), `v41-book-turn`·`v41-book-view-mode`(smoothTurn 계약), prefs 형태 고정 8파일 갱신.
- 실측: 로컬(포트 4300, 헤드리스 크롬 1회, 1440·390) 18/18 — 새로고침 후 이름·색 유지, 동그라미 '윤'+teal 즉시 반영, 이전 저장본 읽기, 더러움 Esc 1회·아니오 유지, 넘김 부드럽게=reduced 면 437ms/종이처럼=종이 면 715ms, 움직임 줄이기 우선, 8행 표시, 가로 넘침 0, 페이지 오류 0.
- 라이브(pages.dev 운영, 계정 01): 이름 '윤슬 지기 2차'+teal 저장 → 동그라미 '윤'/teal 즉시 반영 → 새 세션 재로그인 후 유지 → 원래 값(빈 이름·기본색, 동그라미 'K') 복원 확인. 9/9, 페이지 오류 0, 시크릿 출력 없음. 참고: 브랜치 프리뷰에서는 auth 릴레이가 503(저장 주소 미설정·콜백이 운영 주소 고정)이라 로그인 불가 — 라이브 확인은 머지 후 운영에서 수행했다.
- 남은 #368 항목: 날짜 표기, 첫 화면에서 처음 보여 줄 곳, 보드 기본 테마·관계 지도 기본 보기(#366), 공유 기본값, 썸네일 자동 표시(#330), 보관 파일 용량, 로그인 배경(#364)·가져가기 허락(#367). 설정 창 틀·행 추가 방식은 이번 PR까지로 고정됐으므로 같은 방식의 후속 1~2개 PR로 마감 가능.

## 2026-11-12 — #368 3차(마지막): 날짜 표기·처음 보여 줄 곳·보기 기본값·공유 기본값·용량 보기 (로컬3, ai/local3-lt-368-3rd-261112, PR #441, main b64e8ee→41d97c6 병합 기준)

- 무엇: 설정 창에 같은 행 추가 방식으로 마지막 항목을 채웠다. 각 행에 계정에 저장/이 기기에만 표시(총 13행).
  ① **날짜 표기**(계정, state.prefs.dateStyle): dot(2026. 11. 10, 기본=지금)·dash(2026-11-10)·long(11월 10일). 표시는 book-usability `formatDisplayDate(value, style)` 한 벌로 모았다 — 책(book-extra LTBookTitle 훅 + momentContent 재정의 템플릿의 날짜칸)·보드(track58 LTTitle)·지도 상세(track56 LTTitle 주입 + network dateText)·첫 화면 순간 목록(v41/home-moments import; orbit.js는 건드리지 않음). 전달은 페이지 넘김과 같은 속성+lt41-date-style 메시지에 **기기 캐시 미러(lt41.dateStyle)**를 더해 화면이 그려진 뒤 설정이 도착해도 첫 그림이 맞다. 저장 형식 무변경.
  ② **로그인 후 처음 보여 줄 곳**(계정, startPlace): 이어 읽기(기본=지금 동작)/첫 화면/내 트리 전체 보기(책장). 셸 진입 경로(startMember onState)에서만 처리, 주소(#my/… 등)가 이기면 그 주소. orbit.js·home*.js 미수정.
  ③ **보기 기본값**(새 묶음): 관계 지도 기본 보기 그물/동심원(이 기기, network.js의 `lt41.network.view` 같은 키 + lt41-network-view 메시지). **보드 기본 테마는 선택지가 없어 행 없음**(마크업 주석).
  ④ **공유**(새 묶음, 계정): 처음 열 보기(book 기본)/둘러보기에도 올리기 기본(꺼짐 유지·켬 선택). 공유 창(#434)이 열릴 때 이 값으로 시작 — 서버 API 무변경.
  ⑤ **내 데이터**: 보관 파일 용량 줄(보관 파일 창과 같은 /api/media 값·같은 형식, 새 API 없음).
  ⑥ **계정**: 탈퇴 안내 '발견 목록 노출'→'둘러보기 노출'(#369 후속).
- 도메인: src/domain.js·public/v41/domain.mjs 두 벌의 normalizePrefs에 dateStyle/startPlace/shareView/shareDiscover 규칙 추가. 옛 저장본은 전부 지금 동작 그대로(dot·resume·book·꺼짐) — 시험 고정.
- 병합: 작업 중 main 이동(#440 첫 화면 배치) — 충돌 0으로 병합 후 재검증.
- 시험: `npm test` 1196건 1159 pass/0 fail/37 skip(병합 후), build·modulepreload --check 통과. 신규 `tests/v41-screen-defaults.test.mjs` 7건, v41-title-prefs +1(두 벌 같음·옛 저장본), prefs 형태 고정 9파일 갱신.
- 실측(로컬 4300, 헤드리스 크롬 1회, 1440·390): 18/18 — 날짜 dash 저장→새로고침 유지→책·보드 반영, 지도 LTTitle 실측, 처음 보여 줄 곳 shelf→재로그인 책장 먼저·해시 우선, 공유 창 시작값 board, 용량 줄, 둘러보기 통일, 가로 넘침 0, 페이지 오류 0. 실측에서 잡은 결함 2건 수정: momentContent 재정의 템플릿 날짜칸이 설정을 무시 / 화면 그린 뒤 도착하는 설정(기기 캐시 미러 해결).
- 라이브(운영 pages.dev, 계정 01): 머지 직후엔 API 번들 재배포 전이라 재로그인 유지가 안 됐고(서버 prefs에 3차 키 부재 확인 — 증거 남김), **API 자동 배포 완료 후 재실행 8/8** — dash·첫 화면·공유(board·켬) 저장→새 세션 유지→원래 값(dot·resume·book·꺼짐) 복원. 페이지 오류 0, 시크릿 출력 없음.
- 검사: 필수 4개(check ubuntu·windows, 미리보기 postdeploy(로그아웃), PostgreSQL 저장·로그인 상태 검증) + PostgreSQL migrations 시험 + Deploy Bundle Boot Test(lovetree-api bundle-only boot) 전부 pass.
- **#368 마감 가능**: 대표 정의 항목 전부 채움. 남은 것은 고급 설정(#330 등)과 각자 이슈인 "나중" 항목(#364·#367)뿐.

## 2026-11-12 — #428 숨은 다음 화면 iframe의 초점 침입으로 .app이 밀림 — 셸 근본 수정 (로컬3, ai/local3-lt-428-frame-focus-261112, PR #443)

- 무엇: 화면 교대용 숨은 iframe(#view-next, #219 두 장 교대)이 불러오는 동안 안쪽 문서가 autofocus·focus()로 초점을 청하면 크로미움이 .app(overflow:hidden)을 몰래 굴려 머리가 밀렸다(#420에서 보드·지도에 '.app 굴림 0 복귀' 가드를 임시 방지).
- 근본 수정(shell/screens.mjs): 숨은 프레임은 inert+aria-hidden+tabindex=-1로 두고, 보여 주는 순간(revealFrame)에만 풀어 가려지는 장은 다시 막는다. 불러온 문서가 아무리 focus()를 해도 초점 자체가 일어나지 않아 .app이 굴지 않는다. about:blank 빈 화면 판정(#219·#415)과 두 장 교대 규칙은 그대로다. reveal 직후 안쪽 autofocus가 자리 잡아 밀 수 있는 잔여 경로를 위해 보여 준 딱 그 순간 한 번만 .app을 0으로 되돌린다(setTimeout 0·150, 뷰 코드 미수정).
- #420 임시 가드(tree-title.mjs의 .app scroll 리스너) 걷음. view-a11y의 상세 Esc 위임이 열린 트리 제목 메뉴에 명시적으로 양보(등록 순서 의존 제거; 메뉴의 캡처 Esc는 그대로).
- 재현·수치(로컬 vite 4300, 헤드리스 크롬 1회): 고치기 전 — 자연 전환 10회에서 .app 스크롤 0(#420 가드가 증상을 가림), 숨은 장에서 상세 열림 2/4·focus() 호출 가능(초점 침입 경로 열림), 상위 activeElement가 프레임 호스트인 샘플 136/213(클릭 경로 포함). 고친 뒤 — 전환 10회(보드·지도·책·책장·트리 전환 포함) .app/문서 스크롤 0, 초점이 숨은 프레임으로 들어간 샘플 0, 숨은 장 inert 228/228 샘플 참, 로드 중 안쪽 focus() 차단(inert) 실측, 390도 동일, 페이지 오류 0. 1440·390 가로 넘침 0.
- 시험: 신규 tests/v41-frame-focus.test.mjs 4건(inert 가드·reveal 해제·빈 화면 판정 유지·가드 제거), v41-shell-screens의 가짜 프레임에 setAttribute/removeAttribute/inert 추가. `npm test` 1200건 1163 pass/0 fail/37 skip, build·modulepreload --check 통과.
- 주의: 셸 바깥 iframe(원본 화면들)의 구조는 건드리지 않았다. 숨은 장의 inert는 셸이 관리한다.

## 2026-11-12 — #369 공유 창 쉽게: 단계 표시·복사 안내·둘러보기 스위치·지난 주소 접기 (로컬2, ai/local2-lt-369-share-261112, PR #434)

- 무엇: 공유 창(#share-panel)을 단계 중심으로 바꿨다. ① 보여 줄 것 고르기 ② 미리보기 ③ 링크 만들기를 `#share-steps`(①②③·현재 금테·끝난 ✓)와 "다음에 할 일" 안내 줄(`#share-next`, role=status)로 보여 주고, 링크 만들기가 막힌 이유("먼저 미리보기를 확인해 주세요.")를 버튼 옆에 띄운다. 링크가 생기면 복사·열어 보기 버튼을 바로 보여 주고 복사하면 "복사했어요."(role=status `#share-copy-note`). "둘러보기에도 올리기"는 링크를 만든 뒤 켜는 스위치(role=switch, 기본 꺼짐·켤 때 확인 1회)로 바꾸고 공유 창의 "발견" 문구를 모두 "둘러보기"로 통일했다. "공개되는 범위"는 한두 줄 + "자세히" 접힘("올린 사진은 나만 볼 수 있어요" 포함). 주소 목록은 살아 있는 주소만 위에, 취소된 주소는 "지난 주소 N개" 접힘 안에, 살아 있는 주소마다 만든 날짜·처음 열 보기·복사·취소(확인 1회).
- 유지: 서버 코드 변경 0(share-service·community-service 그대로, discovery PUT/DELETE 재사용), #315 공유 읽기 전용·#432 사진 비공개·공통 틀 닫기 규칙(`isShareDirty` 그대로)·`--lt-*` 토큰.
- 시험: `npm test` 1157건 1120 pass/0 fail/37 skip(문구 기대값 1건 갱신: `tests/v41-share-api.test.mjs`), build·modulepreload pass. 로컬 DOM(dist+가짜 API 계정 04 역할, 크롬 1회·4236 포트): 1440·390에서 37/37 — 단계 판정·이유 문구·키보드 미리보기→링크 만들기·복사 안내·스위치 기본 꺼짐→PUT discovery·지난 주소 접힘·취소 확인 1회→DELETE·가로 넘침 0·페이지 오류 0·axe serious·critical 0(공유 창).
- 남은 것: 둘러보기 화면 쪽 `community-panel.mjs`의 "내 발견 목록에서 숨기기"(감상자 차단 문구)와 설정 탈퇴 안내의 "발견 목록 노출"은 이번 범위(공유 창) 밖 — 말 통일 후속이 필요하면 별도 이슈로. 본 주소(계정 04)에서 실제 링크 생성·취소 확인은 머지·배포 뒤 한다.

## 2026-11-12 — 러브트리 #425 PR 2: 올린 사진 나만 보기·쉬운 추가 사진 칸 정리 (로컬2, ai/local2-lt-425-photo-261112)

- 무엇: #425 2번 마감. 쉬운 추가 탭의 '또는' 구분선·사진 올리기 칸을 없애 사진 드롭은 늘 자세한 추가 업로더로 간다(`dropRoute` image → editor 고정, `shell/quick-add.mjs`의 quickUploads 제거). 자세한 추가에 '직접 찍었거나 쓸 권리가 있는 사진만 올려 주세요 · 사진은 나만 볼 수 있어요' 안내. 서버는 `projectSharedTree`가 사진 표지(coverMode=photo)를 공개 응답에서만 디자인/기본으로 바꾸고(저장본 무손), `community-service.js card()`는 coverModeOf 판정으로 '순간에서'일 때만 표지 주소를 보낸다. 공유 감상 화면에 '올린 사진 N장은 나만 볼 수 있어요' 안내.
- 시험: `npm test` 1143(1106 pass·37 skip·0 fail — a11y·postdeploy 가드 4건은 공유 node_modules에 axe-core·playwright-core가 없어 실패하던 기존 환경 문제, `--no-save`로 잠금 버전 설치해 통과), `npm run build` pass, `node tools/v41-modulepreload.mjs --check` pass, 로컬 DOM(크롬·격리 컨텍스트·포트 4200): 쉬운 추가 사진 칸 0·안내 문구·드롭→자세한 추가·1440/390 넘침 0. 스크린샷 `.tmp-261112/`.
- 주의: 로컬1 #431(views css)·#429(썸네일 공용 모듈)와 책장·표지·둘러보기 카드가 겹칠 수 있어 PR 전에 main을 다시 받았다.

## 2026-11-12 — #368 1차: 설정 창 5묶음 + 내 기록 창 폐지 + 계정 메뉴 정리 (로컬3, ai/local3-lt-368-settings-261112, main eee95a8 기준, #432 병합 후 CTO 결정 반영)

- 무엇: 설정 창(`dialog#account-settings`, 전체 화면 공통 틀)을 **프로필 → 화면 → 순간 추가 → 내 데이터 → 계정** 순서의 묶음 5개로 재구성했다. 저장 키·기본값·동작은 전부 기존 그대로(자리 이동만).
  - **프로필**: 동그라미 + 이메일 전체(없으면 "내 계정") 표시만 한다. 이름·색 편집은 다음 PR. `header.mjs renderAccount`가 `onEmailChange` 콜백으로 설정 프로필도 같이 칠한다.
  - **화면**: 테마·움직임·제목 보기·첫 화면 카드 유지. **순간 추가**: "먼저 보일 탭"(data-write-tab)을 화면 묶음에서 이리로 옮김.
  - **내 데이터**: 기록 백업(내보내기)·계정 기록 불러오기(#server)·내 보관 파일 열기(#settings-assets-open)가 바로, 고급 접힘 안에 기록 가져오기(#advanced-import)·화면 비우기(#clear)·예시로 돌아가기(#sample). CTO 결정(2026-11-12): 설정의 "백업 파일 열기"는 기록 가져오기와 같은 JSON 선택 창이라 빼고, 로그아웃 빈 화면의 백업 파일 열기(#empty-file)만 남긴다. `#file` input은 창 밖으로 꺼내 설정이 닫혀 있어도 선택 창이 열린다.
  - **계정**: 로그아웃(#logout) + 맨 아래 접힌 계정 탈퇴(기존 확인 문구 흐름·form 그대로). `openAccountSettings({section})`가 해당 묶음 제목으로 스크롤·초점을 옮기고, 로그아웃 상태에서는 열지 않는다(기존 숨김 규칙 유지).
- **내 기록 창(`dialog#records`) 폐지**: 트리 고르기(#trees select·record-description)는 트리 ▾ 드롭다운이 이미 하므로 삭제. 남은 기능의 행선지 — 읽기 전용 안내(panels·quick-add·journey 게이트·usePrivateAsset·빈 화면 "내 기록 불러오기")는 `openAccountData()`로: 로그인 상태면 설정 "내 데이터", 로그아웃이면 로그인(둘러보기 "내 기록 새로 시작"은 intent=new-tree). 순수 게이트 `journeyEntry`의 screen 값도 `records`→`settings`로 바꿨다. 공지 줄(#record-feedback)은 설정 창 안 `#settings-feedback` + 토스트 한 벌로 통합(notice·auth).
- **계정 메뉴 순서**: 맨 위 이메일 전체(#account-email, strong) → 설정 → 내 보관 파일 → 고급 기능 보기 → 로그아웃. "내 계정" 정적 라벨·옛 `account-records`/`account-backup`/`account-settings-open` 흔적 제거. 로그아웃·공유·예시에서는 계정 동그라미 자체가 없어 설정 입구도 없다(규칙 유지). 로그아웃 테마 전환은 첫 화면 ◐ 단추(PR #423 그대로).
- 로그아웃 상태 보전: 빈 화면에 "백업 파일 열기"(#empty-file)를 추가해 계정 없이도 4.0 JSON을 열 수 있다. "예시로 돌아가기"는 설정 내 데이터(고급)에 있고, 로그아웃에서는 빈 화면 "예시 둘러보기"가 같은 동작(sample)을 한다.
- 병합: #432(쉬운 추가 사진 칸 정리·사진 나만 보기)를 이 브랜치에 병합 — HANDOFF.md만 수동 충돌(양쪽 항목 유지), 코드는 자동 병합 뒤 양쪽 변경 재확인.
- 시험: 신규 `tests/v41-account-settings.test.mjs`(묶음 순서·프로필·항목 배치·records 잔재 없음·메뉴 순서·배선·입구 행선지). 갱신: shell-notice(설정 상태 줄)·shell-auth·first-journey/journey-flow(settings 게이트)·panel-mode(공통 틀 밖 dialog 0)·panels-flow/quick-add-flow/shell-panels(openSettingsData)·shell-connections(id 목록 37개)·shell-dialogs(옛 바깥 클릭 규칙 제거)·theme-ab·shell-header. `npm test`·`npm run build`·`node tools/v41-modulepreload.mjs --check` 통과(수치는 PR 본문).
- 실측(로컬 vite 4300번대 + Playwright 스텁 `/api/workspace`·`/api/account`, 1440·390): 계정 메뉴 이메일·순서, 설정 5묶음·프로필 이메일/초점, 고급·탈퇴 접힘, 내 보관 파일 겹침→닫으면 설정 버튼 초점 복귀, 내 데이터 스크롤·초점, 테마 전환·저장, 예시 복귀, 빈 화면 3버튼, 로그아웃→로그인 이동, 쉬운 추가 사진 칸 0(#432 유지), 가로 넘침 0, 페이지 오류 0.
- 남은 것(다음 PR): 프로필 이름·동그라미 색 편집, 댓글 2의 "페이지 넘김: 종이처럼 / 부드럽게"(#393 후속) 설정 "화면" 항목 추가.

## 2026-11-11 — 컴2 러브트리 DB 실제 구성 문서화 (로컬4, ai/local4-lt-db-docs-261111, 이슈 #403 → PR #405)

- 무엇: 컴2 러브트리 Postgres는 compose 컨테이너가 아니라 **WSL Ubuntu 네이티브 PostgreSQL 16**(127.0.0.1:5432, DB `lovetree`, 소유자·앱 역할 `lovetree_owner`, Docker 데몬 꺼짐 — 컨테이너 없음)이다. `AUTODEPLOY.md`에 실제 구성과 migration 수동 적용 → `--accept-migrations` 1회까지 한 흐름으로 기록했다. `postgres.compose.yml`·`postgres.env.example`은 "지금 미사용·참고용" 머리 주석을 붙였다(삭제하지 않음).
- 배경: 이날 `account-emails-261111.sql`을 실제 DB에 적용하고 `--accept-migrations` 1회로 `1b23ed68` 설치를 끝냈다. 로그인 → 콜백 → `/internal/account/email` → 표 적재 → `/api/account` 이메일 제공까지 동작 확인(자세한 증거는 PR #402 코멘트).
- 시험: 문서만 바꾼다(코드 동작 변경 0). `postgres.compose.yml` 참조는 `postgres.env.example`와 docs/HANDOFF.md의 이력 항목(2026-10-28 실측·초기 배포 계획)뿐이라 이력은 그대로 두고 새 기록으로 정정한다.

## 2026-11-11 — 계정 이메일 저장: 공통 로그인 이메일을 계정 테이블로 (로컬1, ai/local1-lt-account-email-store-261111, PR #389 → 0c4ce9f)

- 무엇: 토큰 교환 응답이 실어 오는 `profile.email`을 로그인 콜백에서 모아 계정 단위로 저장하고, `/api/account`의 확인 값·표시에 쓴다. #368 가림 제거(PR #385)로 "이메일 전체가 본인 화면에 보이는" 단계까지 열렸으니, 이제 "이메일이 오는 경로"를 마감.
- 구현: `server/db/schema.sql` + 마이그레이션 `account-emails-261111.sql`의 `lovetree_account_emails(product_id, subject_id, email, updated_at)`. 새 내부 경로 `/internal/account/email`(공개 프록시 목록 밖)는 access 토큰(JWKS)을 검증해 그 토큰이 인증한 accountId와 본문 subject가 일치할 때만 기록한다. 계정 삭제 시 표를 함께 지운다(`ACCOUNT_USER_TABLES` + 메모리 모형). `describe`/탈퇴 확인 값은 검증 패스너드 → 저장값 → 고정 문구 순으로 고른다. 콜백 반영은 최선 노력이고 실패해도 로그인을 막지 않는다.
- 전제: access 토큰에는 email 클레임이 없어(2026-11-11 확인) 저장값이 있어야 동작하고, 그 값은 공통 로그인의 프로필 클레임 허용 설정이 켜져야 콜백에 닿는다. 꺼져 있으면 표가 빈 채 기존 흐름이 그대로 맞다.
- 검증: `npm test` 963 pass/0 fail/37 skip(로컬 PostgreSQL·릴레이 환경 없음), `npm run build` 통과. 신규·갱신 테스트: 서버 핸들러 계약, 저장·삭제 통합, Pages 콜백, 스키마 컬럼/업서트 검사. CI 검사(ubuntu·windows·미리보기 postdeploy(로그아웃)·PostgreSQL 저장·로그인 상태 검증·마이그레이션 실행 시험) 통과.
- 참고: `Deploy Bundle Boot Test`가 PR #389에서 실패한 것은 실행 환경 문제가 아니라 실제 결함이었다 — `server/db/account-postgres.js`의 반환 객체에 `emailFor`/`upsertEmail`이 빠져 서버 시작 때 `server/account-email-store.js` 가드에서 죽었다. 서비스 시험이 메모리 repo만 써서 놓쳤다.
- 후속 수정(같은 날, ai/local1-lt-account-email-fix-261111): 반환 객체에 두 함수를 넣고, `createAccountRepo` 반환값 기준으로 두 서비스가 요구하는 함수가 모두 있는지 확인하는 계약 시험(`tests/account-repo-contract.test.mjs`)과 내부 경로가 그 repo로 실제 기록하는 시험을 추가했다.
- 남은 것: 프로필 클레임 동의 후 다음 로그인에서 실제 저장 확인(계정 02, 헤드리스). 동의 전 빈 값은 정상이며 기존 표시·탈퇴 흐름 그대로다. 임시 작업장/브랜치 정리 예정.

## 2026-11-11 — #368 1·2 계정 메뉴 이메일 가림 제거 (로컬1, ai/local1-lt-account-email-261111, PR #385)

- 무엇: 계정 메뉴가 "내•••"(가림)를 보이고 동그라미가 이메일 첫 글자가 아니라 subject 첫 글자("S")가 보이던 증상. `public/v41/shell/header.mjs` `renderAccount`의 `maskEmail`을 제거해 본인만 보는 계정 메뉴에 `#account-email`이 전체 이메일(없으면 "내 계정")을 보여 준다. aria도 `accountPresentation`의 `view.ariaLabel`(가림 없음)을 쓴다. `loadAccountEmail`은 성공 응답이 없어도 렌더해 이메일 부재 시 "내 계정" 표시를 갱신.
- 동그라미 첫 글자(#368 4): `header-state.mjs accountPresentation`이 이미 이메일 첫 글자(대문자)·없을 때 subject 폴백을 맞히므로(기존 시험 `v41-header-ia.test.mjs`) 재구현하지 않았다.
- 끊긴 지점(외부 경계, 미수정): 계정 02로 본 주소에서 실제 access JWT(`__Host-lovetree-access`, 검증 통과) 클레임을 확인한 결과 `account_id, amr, aud, exp, iat, iss, sid, sub, token_use`이며 **email 클레임이 없다**(`aud=lovetree-4-0`, `iss=https://auth.padiem.net`). 그래서 `/api/account`가 `{confirmKind:"phrase"}`(email 없이)를 돌려 화면이 이메일을 못 받는다. 공통 로그인(auth.padiem.net)이 이메일을 안 주는 것이므로 지시대로 인증 경계(`padiem-access-verify.mjs`·`padiem-authority-auth.js`·`server/account-service.js`)는 건드리지 않고 증거만 남긴다.
- 본 주소 확인(머지 후, 계정 02, 헤드리스): `#account-email` "내•••"→"내 계정"(가림 제거)·aria 가림 없음·동그라미 "S"=subject 첫 글자(이메일 없을 때 규칙). 4개 판정 전부 일치(maskingRemoved·ariaUnmasked·circleMatchesSubjectFirst·emailShownOrCorrectFallback). server가 이메일을 주면 전체 표시, 안 주면 "내 계정"이 옳은 표시(둘 다 가림 없음이 합격).
- 시험: `tests/v41-shell-header.test.mjs` +3(전체 이메일/마스킹 부재·이메일 없을 때 subject 첫 글자·loadAccountEmail 갱신/부재). header+ia+account-deletion 41/41. `npm test` 985건 944 pass/4 fail/37 skip — 4 fail은 모두 `tools-account-choice.test.mjs`(a11y·postdeploy, 계정 03/04+브라우저 필요)로 변경 전 main에서도 동일 실패(기존 로컬 환경, CI 통과). `npm run build` pass.
- 머지: squash `07817bb` (2026-11-10 22:26 UTC). 필수 검사 4개(ubuntu·windows·미리보기 postdeploy·PostgreSQL 저장·로그인 상태 검증) 전부 pass.

## 2026-11-11 — #372 후속 기억 보드 꾸미기 되살리기 (로컬1, ai/local1-board-revival-261110, PR #375)

- 무엇: 보드 보기 전용 규칙 제거(숨김 인라인 스타일·`.pin` pointer-events 차단 해제), 셸 `applyAdvanced`의 `lt41-advanced` postMessage로 단순/고급 모드(`board-mode.mjs` 신규·`body.lt-advanced` CSS 게이트, 셸 미수정), 보드 배치(x·y·rot·pinStyle·cardStyle·color·keywords)를 `boardLayoutOf` 허용 목록으로 검증해 `lt41-board-sync`→셸 `boardSync` action→`PUT /api/workspace`로 저장, `#replayFrom` 제거.
- 옛 서버 호환(로컬 시뮬레이션 `.tmp-261109/old-server-compat.mjs`): 일반 저장은 배치 칸 미실림(200). 보드 저장은 배치 칸을 실어도 옛 검증기(허용 목록)가 400 대신 조용히 버려 200·데이터 무손실. 400 거절 시뮬레이션에서는 셸 '미저장 기록' 표시·보드 로컬 상태 유지·JS 오류 0.
- 측정(CDP 1440·카드 8): idle rAF p50/p90 main 43.9/50.1·50.0/56.3 vs 분기 43.8/50.0·43.8/50.1, Long Task 0, pan p50 6.3 동일(p90는 노이즈).
- 버튼 감사(#372 방식, `.tmp-261109/audit-buttons.mjs`): server 1440/390×단순/고급 + 예시 1440×단순/고급, 보드 수준 ERROR 0. 이전 의도(보기 전용) 항목이 고급에서 정상, 단순에서는 의도 숨김. `#fitBtn`은 단순 1440/390 기능 확인(`check-fitbtn.mjs`). saveWhy NO_CHANGE는 기존 도달 불가 한계. 390 셸 화면 전환 버튼 HIDDEN은 #374 더보기 메뉴(main 동일 행동).
- 주의: postdeploy 시각 5건·계정 메뉴 1건은 live main(#374 헤더)과 도구 규칙 불일치로 사전 실패(본 분기 무관). CI PostgreSQL 저장·로그인 상태 검증은 main `45dcc5a`부터 동일 실패.
- 시험: `tests/v41-board-revival.test.mjs` 9건. `npm test` 958/921 pass/0 fail/37 skip, build pass.

## 2026-11-10 — #362 기억책 '← 내 책장' 복귀 + 빈 타이포 알약 제거 (로컬2, ai/local2-lt-book-back-261110)

- 구현: 기억책 topbar 맨 왼쪽에 `← 내 책장`(`.ui-btn.shelf-back`, 44px). 클릭은 기존 `lt41-navigate(track32-bookshelf.html)` 재사용. `LT59Model.shelfReturn({source,embedded})`가 `shelf|none`을 정하고 공유 감상(`source==='share'`)이면 버튼을 숨긴다. 정원은 `--lt-paper/--lt-ink/--lt-line-paper` 토큰.
- 브라우저 뒤로가기(예시): `#shelf`→책 열기→`goBack` → `#shelf` 복귀·`.book-card.is-center` 1. 로그아웃에서 버튼 클릭은 기존 셸 규칙대로 로그인(`intent=shelf`)으로 보낸다(새 규칙 없음).
- 잔여 제거: `track59` `#typoNote`, `book.js` `?typo=B`, `book.css` `body.typo-b`·`.typo-note` 2곳, `src/views/book-source.css` 동일 잔여. `reference/originals/` 미변경.
- 시험: `v41-book-model.test.mjs` 15건(판정 표·세기·배선/CSS/타이포 부재). 강도 증명: 공유 판정 뒤집기 → 14 pass/1 fail, 원복 → 15 pass. `npm test` 936건 899 pass/0 fail/37 skip, build pass.
- 실측(Edge, 1440·390, 밤/정원): 버튼 94×44px, x=28/12, 문서 가로 넘침 0(1438/1438·388/388), 정원 배경 `#fffdf8`·글자 `#403536`·테두리 `rgba(119,91,82,.3)`, 공유 문맥 `hidden=true`. axe 셸 0, 책 `meta-viewport` 1건은 기존 항목.

## 2026-11-10 — #361 보드 커서 링 v2: 프레임당 1회 translate3d·반응·누름/끌기 (로컬2, ai/local2-lt-board-cursor-261110)

- 구현: `board-extras.js` 커서를 left/top 갱신에서 rAF 1회/프레임 + `translate3d`로 바꿨다(위치 transition 없음, `elementFromPoint` 1회/프레임). 카드·핀·실·버튼 위 1.6배+내부 채움, 입력/텍스트 위 숨김, down 0.8배, up에서 물결+물방울(감소모션·동시 묶음 상한), 드래그 중 13.2px 어두운 점. 터치·coarse·시네마 끔, `prefers-reduced-motion` 위치만, `aria-hidden`. 밤/정원 `--lt-*`.
- 판정은 `LT58Model`(`cursorMode`·`cursorHover`·`cursorScale`·`cursorEffectAllowed`)로 옮기고 시험 24건(export 목록 갱신·표·세기·효과 한도·배선/CSS 가드, 강도 증명 2회). `npm test` 929건 892 pass/0 fail/37 skip, build pass.
- 실측(Edge headless 1440×900, 예시 카드 40, 수정 전 main 5d51e67 라우트 주입): 포인터-링 중심 오차 0/0px(전 밤 −0.007/−0.005, 정원 −0.001/−0.010). 유휴 10초 rAF 0/0(전후 동일), Script 0ms, Task 364.1ms(전 371.1ms). 패닝 rAF p50/p90 6.3/6.3ms(전후 동일, p99 단발 스파이크). 입력 위 숨김(전 유지), 끌기 13.2px(전 56px).
- a11y(axe): 셸 0, 보드 `meta-viewport` 1건은 기존 항목. 계정 04 운영 확인(#360 2단계 로그인 반영): auto-login 성공(auth:email)·세션 pass. 빈 계정(트리 0)에서 `visual/visual-book` 1건이 iframe 미로드로 fail — 도구의 빈 계정 공백(제품 회귀 아님). pass 19/fail 1/warn 6/skip 4.

## 2026-11-10 — #346 2단계 B: 패닝·드래그 중 장식 애니메이션 정지 (로컬1, ai/local1-346b-pan-motion)

- 트레이스(운영, 예시 카드 40, 1440 밤, 패닝): 장식 CSS 애니메이션 실행 중 총작업 15.1s(span 9.8s) vs 일시정지 2.45s(span 7.0s) — **-84%**, Paint 44.2→4.8ms(-89%), Raster 367.9→40.7ms(-89%), Layout 136.3→14.5ms(-89%), Composite 204.2→72.4ms(-65%). 패닝 비용의 최대 레버는 장식 애니메이션(threadFlow 점선 흐름·pinBreath)이 만드는 매 프레임 SVG 페인트였다.
- 구현: `board-model.js` `decorationMotion`(pan·pinch·drag·touch → paused), `board-extras.js`가 pointerdown/up에서 `body.decor-paused`를 토글(같은 판정 한 벌), `board.css`가 `.threadWave`·`.pin::after`만 `animation-play-state:paused`. 손을 떼면 다시 흐르고, 시네마·드래그·연결 동작은 그대로.
- 시험: 판정 표 + 배선/CSS 가드(19건). 강도 증명 3회(정지 판정 제거·클래스 토글 제거·CSS 규칙 제거 각 1실패) 후 원복(cmp). `npm test` 916건 879 pass/0 fail/37 skip, build pass.
- 수정 후 패닝 실측·시각 비교는 머지·자동 배포 뒤 기록한다.

## 2026-11-10 — #346 2단계 A: a11y 로그인 상태 안쪽 4화면 검사 복구 — 빈 계정 자동 픽스처 (로컬1, ai/local1-a11y-fixture)

- 배경: a11y `--account 02` 실행에서 로그인 상태의 책장·기억책·보드·지도가 "화면이 열리지 않음"으로 빠졌다(모든 in 조건, 16행 결손). 운영에서 390·정원·로그인으로 재현: 두 iframe hidden·`#empty` 표시. 원인은 제품 버그가 아니라 **의도된 빈 상태** — 셸 `screens.mjs:120`이 트리가 없으면 안쪽 화면 대신 빈 패널을 보여 준다. a11y README의 시험 자료(트리 3권) 전제가 빠졌고, 도구가 그 건너뜀을 집계하지도 않았다(요약 '건너뜀 0').
- 수정: `tools/a11y/fixture.mjs`(빈 계정 판정·트리 3권 상태 생성), `a11y-run.mjs`가 로그인 상태 검사 전에 빈 계정이면 자동으로 넣고 끝나면 빈 상태로 복원, `skippedScreens` 집계·보고서 기록, README 갱신.
- 시험: `tests/v41-a11y-fixture.test.mjs` 3건(저장 규칙 통과·시작 순간 1·연결 2, 배선 글자 가드·TDZ 순서). 강도 증명 4회(빈 계정 판정 제거·시작 순간 2개·복원 호출 제거·건너뜀 집계 누락 각 1실패) 후 원복(cmp).
- 실측: 좁힌 실행(390·정원·in)에서 이전에 빠졌던 shelf/book/board/network 4화면이 검사됨(17건 serious 0·critical 0), 픽스처 복원 put 200 → 트리 0. `npm test` 916건 879 pass/0 fail/37 skip, build pass.

## 2026-11-10 — #346 기억 보드 느려짐: 상시 rAF 루프 제거 + 큰 흐림 배경 정적화 (로컬1, ai/local1-346-board-perf)

- 기준 측정(운영 pages.dev, 1440×900, rAF 상한 457/3초 별도 확인): 유휴 10초 — 계정02(카드 10·연결 9) 밤 Task 0.801s·Script 0.133s·rAF 198, 정원 Task 1.179s·rAF 313 / 로그아웃 예시(40·40) 밤 Task 0.938s·rAF 73, 정원 Task 1.162s·rAF 95. 패닝 p50/p90 — 서버 밤 43.8/50.1ms·정원 31.3/37.6ms, 예시 밤 131.3/156.3ms·정원 100.1/118.8ms. 보드를 떠나면 iframe이 사라져 rAF 0(원인 6은 기준에서 재현 안 됨).
- 계정02 자료: 카드 10·연결 9 — 트리 검증이 "시작 순간 하나"를 강제해 카드 10이면 연결 9가 최소·유일(8은 만들 수 없음).
- 구현: `board-extras.js`의 `livingThreadLoop` 제거 → `LT58Model.threadRedrawStep`(예약 중복·숨김·시네마 → 건너뜀) + `scheduleThreadFrame`(프레임당 1회). 드래그 이동·데이터 변경·창 크기 변경 때만 다시 그리고, 실 좌표는 world 좌표라 패닝/줌은 `#world` transform이 함께 옮겨 재그리기 없음. `board.css` `.spaceGlow`의 무한 애니메이션 제거(blur(30px) 정적). 3·4·5번은 재측정으로 판정, 5번은 이미 `loading="lazy"`(media-preview.js:153).
- 시험: `tests/v41-board-model.test.mjs` 판정 표 + 루프·애니메이션 부재 가드. 강도 증명 4회(숨김 판정·드래그 즉시 그리기·상시 루프 재도입·글로우 애니메이션 재도입 각 1실패) 후 원복(cmp). `npm test` 905건 868 pass/0 fail/37 skip, build pass. 수정 전 시각 24장 캡처(board-1440-garden은 고정 실패 = 루프 흔들림).
- 수정 후 실측·시각 비교는 머지·자동 배포 뒤 #346 댓글에 기록한다.

## 2026-11-10 — 기억책 순간 면 + '경로 한눈에' → '여기까지 온 길'(#345, 로컬2, ai/local2-lt-book-timeline-261110)

대표 피드백(설렘 옆 도메인 표기·버튼처럼 보이는 칩과 '제목 고치기'·알 수 없는 '경로 한눈에')을 시안대로 정리했다. 저장·스키마·공유/예시의 쓰기 금지 동작은 그대로다.

- **순간 면**(`book-extra.js` paintTitle): 영상 바로 아래 한 줄 `▶ 영상 제목 · 채널 … YouTube ↗`(원본 링크) — 제목이 없으면 링크만(#344 mediaMetadata). 날짜는 제목 위 작게, 제목이 주인공. 감정은 `● 설렘`(색 점+글자, --lt-group 토큰). '제목 고치기' 버튼 제거 → 제목 단추 + 작은 `✎ 고치기`(데스크톱 hover/포커스, 390 항상 보임)와 제목 눌러 편집. 빈 마음은 `이 순간에 남기고 싶은 마음을 적어 보세요…`(누르면 기존 편집 경로). 공유에는 편집 손잡이·안내 없음(editAffordances 순수 함수).
- **자동 제목**: #344가 저장한 영상 제목(mediaMetadata.title과 같은 title)은 큰 제목에서 빼고 출처 줄에만 — `withoutAutoTitle` 확장(표시 단계만, 데이터 불변). buildSpreads의 whyNext 대체 문구는 면에 그리지 않고 실제 마음(memo)만 쓴다 — 빈 자리는 안내. 예시/실제 구분은 `LTDEMO.example` 분기 없이 데이터 상태로만 갈린다(기존 불변식).
- **여기까지 온 길**(`book-model.js` `journeyTimeline`·`journeyDays`·`emotionTone` + `book-extra.js`): 버튼·제목 이름과 설명 변경, 세로 타임라인(썸네일·날짜·제목·감정, 금색 선, 현재는 금색 점+`지금 보는 순간`), 칸 사이 `↳ 연결 이유`(실제 연결 우선, 없으면 생략), 칸 클릭 → 그 장으로 이동+창 닫힘, 아래 `N단계 · N일`. 390 세로 스크롤, 공유/예시 동작 유지. 카드·글자는 --lt-* 토큰만(닫기 버튼 대비 실측 17.9/11.6:1).
- **시험**: book-model +4(타임라인·이유 우선/생략·썸네일/감정 색·날짜 차), book-usability +2(출처 줄·편집 손잡이 / #345 마크업), 공유 시험 1건 갱신. 강도 증명 3회(현재까지만 자르기 제거 1실패·공유 편집 손잡이 개방 1실패·영상 제목 억제 제거 1실패) 후 `cmp` 원복. `npm test` 919건 882 pass / 0 fail / 37 skip, build pass.
- **로컬 실측(가짜 세션=만든 기록을 dist에 재생)**: 12/12 — 출처 줄·도메인 0·hover ✎(0→0.72)·390 항상 보임·빈 마음 안내·타임라인 3칸/이유 2줄/현재 표시/'3단계 · 9일'/썸네일 3·칸 클릭 이동·12칸 390 스크롤·axe serious·critical 0·pageerror 0. 캡처 `.tmp-261109/shots-345-local/`.
- **운영 실측(계정 04, 머지·배포 뒤)**: 결과와 시안 비교는 #345 댓글에 남긴다.

## 2026-11-10 — #353 후속: 공유·붙여넣기 저장에도 영상 제목 + 담기 안내 우선 (로컬1, ai/local1-353-followup)

- 배경: #353 운영 실측 2건 — ① `?qtext=`·붙여넣기 저장은 제목이 영상 제목이 아니라 도메인 규칙(`youtube.com에서 간직한 순간`)이었다(`intakeSave`가 mediaMetadata 없이 quickAdd 호출). ② 담기·중복·로그인 필요 안내가 같은 동기 상태 갱신의 상태 안내에 덮여 R3 중복·R8 재시도 문구가 최종 화면에 남지 않았다.
- 구현: `public/v41/quick-intake.mjs` `resolveMediaMetadata`(기존 `fetchVideoTitle` oEmbed 재사용, 상한 4초·실패 시 주소만) → `shell/quick-intake.mjs`가 저장 전에 받아 `quickAdd {url, mediaMetadata}`로 넘기고 같은 주소는 기다리는 동안 한 번만 담는다(inFlight). `public/v41/shell/notice.mjs` 신규 `createNotifier` — 결과 안내(hold 3초)가 상태 안내보다 먼저 보인다(상태 안내는 다음 상태 변화에 다시 오므로 보류 큐 없이 억제만 하는 방식).
- 시험: 함수 4건 + 가짜 DOM 5건 + 안내 4건(가짜 시계·DOM, shell 배선 글자 가드). 강도 증명 5회(mediaMetadata 제거 4실패·저장 media 전달 제거 3실패·inFlight 제거 1실패·hold 억제 제거 2실패·hold 배선 제거 1실패) 후 원복(cmp).
- 검증: `npm test` 904건 866 pass/0 fail/37 skip, `npm run build` pass. 운영 실측은 머지·자동 배포 뒤 계정 02로 이어서 한다.
## 2026-11-10 — 빠른 추가 창 디자인: 높이 고정·미리보기 카드·버튼 하나(#343, 로컬2, ai/local2-lt-quick-add-design-261110)

대표 운영 확인의 5가지 문제(미리보기가 생기면 버튼이 밀림·담기 전에도 지난 안내가 보임·머리글 분홍·설명 줄바꿈·파일 선택 기본 모양)를 CTO 시안대로 정리했다. 저장·끌어다 놓기·사진 업로드·연속 추가·로그아웃/공유 동작은 그대로다.

- **머리글**: `#quick-add .eyebrow{color:var(--lt-gold)}` — 밤 테마 장미색 금지 규칙(이슈 195)을 지킨다. 정원은 같은 속성이 정원 토큰을 쓴다.
- **높이 고정(핵심)**: 설명 두 줄, 금테 입력창+붙여넣기/지우기 알약, 미리보기 카드(1440 300px·390 220px), 오류 줄 18px, 안내 줄 44px을 모두 고정 → 빈 상태·입력(가로 영상·Shorts·지원 안 함)·담은 뒤에서 '담기' 버튼 y가 같다.
- **순수 함수**(`public/v41/quick-add.mjs`): `previewState`(empty/invalid/youtube/link)·`previewTag`(YOUTUBE · SHORTS / YOUTUBE · LIVE / 호스트)·`savedNoticeText`(✓ 담았어요 · 32자 요약). 미리보기 제목과 저장 제목은 같은 값 — #344의 `titleCache`를 그대로 쓰고, 못 받았으면 둘 다 `suggestMomentTitle`로 물러난다(화면·저장이 어긋나지 않게 domain 한 벌 재사용).
- **안내 줄**: 담은 뒤에만 "✓ 담았어요 · 제목 요약 · 지금 다듬기 →"(금색 링크). `renderPreview`가 새 입력마다 비운다 — 담기 전에 지난 안내가 남던 버그 수정.
- **사진**: 기존 업로더 그대로(imagesOnly·onUploaded). label을 점선 칸으로, 실제 input은 visually hidden(포커스 유지·`:focus-within` 금테), 상태 줄 2줄 고정, 업로더 자체 보관 안내는 숨기고 맨 아래 "내 계정에만 보관 · 105MB·200개까지" 한 줄로. 업로더가 전송 뒤 submit을 다시 켜는 계약 때문에 `setTimeout(syncSubmitState,0)`으로 '주소 없으면 흐림'을 한 번 더 맞춘다.
- **버튼**: 아래 크림색 큰 버튼 하나 '모아둔 순간에 담기'(담을 수 없는 주소면 disabled=흐림). 닫기는 오른쪽 위 ✕만(아래 닫기·별도 지금 다듬기 버튼 제거).
- **시험**: `v41-quick-add` +10(상태 표·꼬리표 표·안내 문구·마크업/CSS 고정), `v41-quick-add-flow` +2(안내 비움·붙여넣기 알약, 미리보기/저장 갱신). 강도 증명 2회 — `previewState`의 지원 안 함 분기 파괴 → 2건 실패, `renderPreview`의 `clearSavedNotice` 제거 → 1건 실패 — 후 `cmp` 동일 확인. `npm test` 898건 861 pass / 0 fail / 37 skip, `npm run build` pass.
- **로컬 실측(가짜 세션=계정 04 운영 스냅숏 재생, dist)**: 1440·390 × 밤·정원 4조합 × 5상태에서 담기 버튼 y 동일(1440 771.97 · 390 682.97), 카드 높이 300/220 고정, 담은 뒤 안내·새 입력 시 비움 확인, pageerror 0·가로 넘침 0. 스크린샷 `.tmp-261109/shots-343-local/`, axe serious·critical 0(`.tmp-261109/axe-343-local/`).
- **운영 실측(계정 04, 머지·배포 뒤)**: 결과와 스크린샷은 #343 댓글에 남긴다.

## 2026-11-10 — 미리보기 Functions 준비 대기(#337 후속): /api/account가 404가 아닌 응답까지 최대 60초 (로컬1, PR #338 머지 `3d50c09`)

- 배경: #337 실측 — 미리보기 배포 직후 정적 자산만 열리고 Pages Functions가 붙기 전 /api/*가 404를 내는 창이 있어, 그 창에 검사가 걸리면 예외 허용 목록으로도 못 넘기는 진짜 실패가 된다. 미리보기 /api의 503은 의도된 상태이고, 미리보기에 `LOVETREE_API_ORIGIN`은 설정하지 않는다(운영 데이터 쓰기 위험) — 이 변경에도 설정 변경 없음.
- 신규 `tools/postdeploy/preview-ready.mjs`: 미리보기 주소 확보 후 허용 목록 안 경로 하나(/api/account)가 404가 아닌 응답(401·503 등)을 줄 때까지 최대 60초·3초 간격 대기한 뒤 검사를 시작한다. 404는 성공으로 세지 않고 예외 허용 목록에도 넣지 않았다. 시간이 넘으면 검사를 막지 않고 요약 한 줄을 남긴다. 요청 1회가 멈춰도 총 기한을 넘기지 않도록 남은 기한만큼 상한을 뒀고 시도·경과를 log로 남긴다.
- 수정 `tools/postdeploy/preview-url.mjs`: 대기 호출 + log 연결(미리보기 검사 로그에서 대기 동작 확인 가능), 실패 요약 문구는 상수(`READY_TIMEOUT_MS`)에서 계산.
- 게이트 변경 없음: `preview-gate.mjs`의 503 예외 목록은 그대로다.
- 시험 `tests/preview-ready.test.mjs` 9건(가짜 fetch: 404→503 전환/계속 404/네트워크 오류/주소 고정/주소 없음/호출 배선/요청 상한 + 404 규칙 글자 확인). 강도 증명 2회 — 404를 준비로 오인 → 3건 실패, 로그 연결 제거 → 1건 실패 — 후 원복(해시 확인).
- 검증: `npm test` 833건 796 pass / 0 fail / 37 skip, `npm run build` pass, PR 검사 전부 초록(미리보기 postdeploy 4m24s 포함).
- 미리보기 검사 로그의 대기 흔적: "Functions 준비 확인: 1번째 시도(74ms 경과)에서 응답 503".
- 통합: squash 머지 `3d50c09` (#338).

## 2026-11-10 — 빠른 담기 입구: 셸 붙여넣기 + 휴대폰 공유 시트(매니페스트·판정 모듈) (로컬1, PR #342 머지 `4c74868`)

- 배경(대표 방향 2026-11-09 "일단 막 담고 나중에 정리"): 빠른 추가(#329)는 주소·끌어다 놓기(데스크톱)뿐, 휴대폰엔 끌어다 놓기 대응이 없었다. `member.apply('quickAdd', {url})` 재사용.
- 조사(A): 저장소에 manifest·service worker·`share_target`·`rel=manifest`·`navigator.share`·붙여넣기 처리 **없음**(rg 전수). Web Share Target = **설치된 PWA**를 OS 공유 시트 대상에 등록(manifest `share_target`). 브라우저 매트릭스(MDN/BCD, 2026-10 확인): **Chrome Android 76+ · Chrome/Edge 데스크톱 89+ · Samsung 12+**; **Safari(iOS/macOS)·Firefox·Android WebView 미지원**("Limited availability", WebKit 미구현) → iPhone 공유 시트 연동은 원리적으로 불가, 기기 체크리스트에 한계·대안 기록.
- 구현: `public/v41/quick-intake.mjs`(순수: 파라미터 소비·분류·주소 정규화·inbox 중복 판정·탭 단위 세션 보관) + `public/v41/shell/quick-intake.mjs`(`createQuickIntake`: 붙여넣기 리스너·부팅 소비·로그인 라운드트립 flush). 공유 타깃은 **method `GET`/action `./`/params {url:"quickadd"}** → 서비스 워커 불요 → **캐시 수명·옛 화면 표면 없음**. 로그아웃 공유 진입 = sessionStorage 단기 보관(소비 즉시 삭제, 로그·리포트 미기록) 후 기존 로그인 흐름 재사용; 신규 intent·공통 인증·서버 변경 없음. 이미 담아둔 주소·읽기 전용 소스·비주소 텍스트는 미수용/안내.
- 시험: 18건 직접 호출 + 강도 증명(게이트·중복 판정 파괴 → 실패 확인 → 원복). `npm test` 851건 814 pass/0 fail/37 skip, `npm run build` pass, 검사 전부 초록(PR #342, 자동 배포된 미리보기 포함).
- 아이콘: 기존 `public/favicon.svg` 마크 래스터화(192/512) — 새 그림 없음.
- 브라우저 실측(계정 02·페이지스.dev, 이번 세션 범위): 로그아웃 상태에서 ① 공유 진입 — 파라미터 1회 소비·주소 정리 확인 ② 붙여넣기 — 기본 동작 차단 + "로그인한 뒤 순간을 담을 수 있어요." 표시, 1440·390 스크린샷(`.tmp-261109/shots-342/`). **로그인 후 담기·inbox 중복 차단은 자격값 취급 없이 라이브 자동화 불가 → 시험(상태 전이) + 기기 체크리스트로 이관**(다음 실측 후보). 아이콘/공유표시는 디바이스 확인.
- 미검증/잔여: 실제 휴대폰 공유 시트 노출(iOS는 구조적 불가), 설치 전이 공유 시트 미노출, 매니페스트 반영 주기 — `docs/DEVICE_CHECKLIST.md` 5번에 항목 추가.
(#327, 로컬2, ai/local2-lt-quick-add-261109, PR #329 머지 `8040276` + 정원 대비 후속 PR #332 머지 `fc14d00`)

## 2026-11-09 — 빠른 추가 ②: '순간 남기기'에서 고르고, 주소 하나로 모아둔 순간에 담는다(#327, 로컬2, ai/local2-lt-quick-add-261109, PR #329 머지 `8040276` + 정원 대비 후속 PR #332 머지 `fc14d00`)

로컬1의 데이터 규칙(#328, `quickAdd`·`inbox`·`INBOX_SUBJECT`) 위에 화면을 얹었다. 이전 세션이 사용량 한도로 멈춘 지점(마크업·모듈·연결까지)에서 이어받아 시험·검증·PR까지 마쳤다.

- **진입**: `순간 남기기`(#write-menu) → **고르기 창**(빠른 추가/자세한 추가). 책 안 "다음 순간 남기기" 등 문맥 진입은 기존처럼 자세한 추가로 바로 간다(`chooseDetailed` — 책장이면 'new', 나머지는 'add', 기존 #245 규칙 그대로). 연결은 panels.mjs에서 shell.mjs로 옮겼고, 구조 시험으로 고정(#245 전례 방지).
- **빠른 추가 모달**: 주소 칸 하나. 붙여 넣으면 `parseQuickUrl`이 즉시 판정해 미리보기 — YouTube는 썸네일(`LTMedia.describe`의 loadUrl 재사용, 새 판정 함수 만들지 않음) + 서버 oEmbed 프록시 제목(`/api/youtube/oembed`, 실패는 조용히), 일반 링크는 라벨. Enter/추가 → `member.apply('quickAdd',{url})` 한 번 → "모아둔 순간에 담았어요 · 지금 다듬기". 저장 뒤 칸을 비우고 초점을 유지해 연속 추가.
- **끌어다 놓기**(pointer:fine, 셸 문서 + iframe `mountFrame`): `dropRoute` 한 벌이 어디로 갈지 정한다 — 셸에 놓으면 "놓으면 모아둔 숨간에 담아요" 덮개 → 바로 저장 + 아래 안내판(썸네일·지금 다듬기, 20초 뒤 숨김). 빠른 추가 모달 위에 놓으면 그 칸에 넣어 미리보기만, 자세한 추가가 열려 있으면 그 주소 칸에 넣고 미리보기만(저장은 사용자가). 이미지 파일은 사진 업로더로(기존 업로더 재사용, `fileLabel` 옵션 추가 — 기본 호출은 그대로, 시험 고정). dataTransfer는 `text/uri-list` → `text/plain` 순(RFC 2483 주석 줄 제외). 공유 모드(#315)는 기본 동작만 막고 받지도 안내도 하지 않고, 로그아웃·예시·파일은 기존 로그인 안내, 읽기 전용은 안내+기록 패널.
- **구조**: `public/v41/quick-add.mjs`(순수 계산 한 벌 — 판정·추출·분기·문구) + `public/v41/shell/quick-add.mjs`(DOM만, `createQuickAdd(deps)`). dialogs.mjs 초점 가두기·배경 클릭 닫기 예외에 새 창 2개 추가. shell.css는 --lt-* 토큰만(새 hex 없음), 오류 글자는 밤 `--lt-rose` / 정원 `--lt-rose-ink`.
- **시험**: `tests/v41-quick-add.test.mjs` 8건(판정 표·uri-list 추출·끌기 분기 표·문구 계약·정원 대비 규칙), `tests/v41-quick-add-flow.test.mjs` 12건(createQuickAdd를 가짜 DOM으로 직접 호출 — 진입 가드 3종·고르기 분기·저장 1회 호출과 연속 추가·도메인 오류 문구·안내판·끌기 분기·덮개·연결 구조). 강도 증명 2회: ① `apply('quickAdd')`→`apply('add')`로 깨기 → 2건 실패 ② 저장 뒤 초점 유지 제거 → 2건 실패, 둘 다 복구 확인. 기존 write-menu 연결 시험 2건은 새 위치에 맞게 갱신. `npm test` **801건 764 pass / 0 fail / 37 skip**, `npm run build` pass.
- **a11y**: 도구의 '숨간 남기기' 검사가 편집기만 보던 것을 고르기 창·빠른 추가 모달까지 훑게 교체(tools/a11y/a11y-run.mjs). 운영 실측(계정 03, 70행): 첫 실측에서 정원 고르기 창 1차 버튼 보조 글자 3.97:1(`opacity:.75`) serious 1건 → `html[data-lt-theme=garden] .write-choice button.primary span{opacity:1}`로 수정(#332) → 재실측 **serious 0 · critical 0**.
- **운영 실측(계정 03, `https://lovetree-4-0.pages.dev/v41/`, 머지·배포 뒤, `.tmp-261109/verify-329.json` 12/12 PASS)**: ① 붙여 넣기 빠른 추가 3회 연속 → 안내·칸 비움·초점 유지 각각 확인, 모아둔 순간 트리 1개에 3개 ② 합성 DataTransfer 끌어다 놓기 → 덮개 문구 → 4번째 + 안내판(일반 링크라 썸네일 없음 — YouTube는 썸네일이 붙는다) ③ 새로고침 유지 4개 ④ 다섯 번째 담고 '지금 다듬기' → 편집기가 그 순간으로 열림 → 제목 수정 저장 확인 ⑤ 자세한 추가 화면에 끌어다 놓기 → 주소 칸 채움·미리보기·저장 안 함(개수 불변) ⑥ 1440·390 × 밤·정원 스크린샷 `.tmp-261109/shots-329/` ⑦ 끝에 트리 0개·보관 0개 정리. 사용자 조작 중 콘솔 오류 0.
- **사고 기록**: 중간 커밋에서 `git add -A`가 브라우저 프로필(tools/postdeploy/.profile-03, 275파일 — 계정 03 세션 쿠키 포함 가능)을 커밋해 머지 전 브랜치에서 즉시 제거하고 .gitignore에 넣었다(머지된 main에는 한 번도 없음). 이후 문서 PR에서 .gitignore 규칙이 함께 들어간다.

## 2026-11-09 — 사진 순간 '불러오기' 버튼: 중첩 버튼·정원 대비 수정(#325, 로컬3, ai/local3-a11y-media-moments-261109, PR #326)

#319 운영 재점검에서 나온 새 serious 5노드. 원인은 사진·미디어 순간이 책·보드에 그려질 때만 드러난다.

- **책 카드 중첩 버튼**: `view-a11y.mjs`가 모든 순간 카드에 `role=button`을 주는데, 안에 media-preview의 `button[data-lt-load]`("사진 불러오기")가 있으면 중첩 상호작용이 된다. 이제 카드 안에 실제 버튼·링크가 있으면 래퍼에 role/tabindex를 주지 않고, 카드 맨 앞에 **실제 '순간 열기' 버튼**(`lt-a11y-open`, 평소 1px 숨김·키보드 포커스에서만 보임)을 둔다. 일반 카드는 기존 그대로(role=button·Enter/Space). 책 돋보기 복제본(`#lens`·`#mobileInspect`)은 `inert`로 포커스·낭독 대상에서 뺐다(복제본이 두 번째 노드였다).
- **정원 대비**: `.lt-media-body button` 글자가 정원에서 `--lt-pearl`(잉크 #403536)이라 어두운 버튼(#1a1620) 위 1.5:1이었다. `html[data-lt-theme=garden] .lt-media-body button{color:var(--lt-paper)}` → 16.6:1. 새 hex 없음, 밤 규칙 그대로.
- **390이 0이던 이유**: 좁은 화면 책은 펼침면의 main 순간만 본문으로 그리고 반대쪽은 `mobile-support` 요약 카드로만 보여 준다(`book.js` `mobileSpreadContent`). 사진 순간이 main이 아니면 '불러오기' 버튼이 DOM에 없다. 1440 펼침면은 양쪽 모두 본문이라 재현된다.
- 검증: 로컬 가짜 세션(비공개 사진 순간) axe 10행 — before **5 serious**(nested 4·contrast 1, 운영과 동일) → after **0**. 버튼 클릭·Enter 모두 상세 사이드 패널이 열림. 겉모습 비교 24장 최대 0.008%(보드 캔버스 흔들림, 기준 이내). `npm test` 762건 725 pass/0 fail/37 skip, `npm run build` pass. 회귀 시험 `tests/v41-a11y-media-moments.test.mjs` 5건(래퍼 role 제거·열기 버튼·일반 카드 유지·inert·정원 대비).

## 2026-11-09 — 정원 색 대비 3곳 수정: 로그아웃 재점검 12 → 0(#319, 로컬3, ai/local3-a11y-garden-contrast-261109, PR #322 머지 `3700a58`)

- 셸 `#context-kind`(**정원 한정**) `--lt-rose` → `--lt-rose-ink`(3.32 → 5.43:1), 책장 `--muted`(**정원 한정**) `#8d7d77` → `var(--lt-muted)`(소개 문단 3.79→5.78, 결과 수 3.49→5.31). 새 hex 없음, 밤 규칙·`:root` 값 그대로.
- 같은 `--muted` 토큰을 쓰던 글자(`.crumbs`·카드 정보 줄·검색 돋보기·독자/모달 보조 글자)도 함께 진해짐 — 전부 크림 배경 위라 대비 개선(계산색 15개 요소+의사요소 1). `.filter`는 예시 화면에 없어 미실측.
- 밤 변화 0: 계산색 변경 0건, 겉모습 비교 안정 쌍 밤 12장 0.000%(같은 빌드 재촬영 24장 0.000%).
- 검증: 로그아웃 axe 40행 12 serious → 0, `npm test` 751건 714 pass/0 fail/37 skip, `npm run build` pass. 회귀 시험 `tests/v41-a11y-garden-contrast.test.mjs` 3건.
- **`3700a58` Pages 배포 누락 → 다음 머지로 재배포**(CTO 확인: 이 커밋에만 "Cloudflare Pages" 검사가 없음). 로그인 몫 a11y와 `docs/A11Y_AUDIT_20261109.md`의 로그인 칸은 배포 뒤 채운다.

## 2026-11-09 — 접근성 자동 점검: serious·critical 155 → 16, 남은 16은 디자인 색(#319) (로컬3, ai/local3-a11y-*)

- 도구: `axe-core` devDependency + `tools/a11y/a11y-run.mjs` + `npm run a11y`([PR #313](https://github.com/skerishKang/lovetree-4.0/pull/313)). 화면(셸+iframe 안쪽)·셸 대화상자·로그인 스킨 원본을 훑고 `serious`·`critical`만 `a11y.json`에 남긴다.
- 범위: 1440·390 × 밤·정원 × 로그아웃·로그인(계정 01, 트리 3권·사진 표지) × 화면 6개 + 계정 메뉴·책 정보 관리(표지 고르기)·순간 남기기. 오늘 들어간 책등 목차·이어 읽기 칸·표지 고르기 창 포함.
- 고침: 셸 브랜드·`#record-menu` 이름, 계정 메뉴 테마 `menuitemcheckbox`([#317](https://github.com/skerishKang/lovetree-4.0/pull/317)), 첫 화면 카드 이름([#318](https://github.com/skerishKang/lovetree-4.0/pull/318)). 각 PR `npm test` 708 pass·build pass·겉모습 24장 0.000%.
- 남음: 정원 테마 색 대비 3곳(전 155 중 16) → [#319](https://github.com/skerishKang/lovetree-4.0/issues/319) 후보 색·대비값. 지시대로 코드로 고치지 않았다.
- 표·방법·재측정 명령: `docs/A11Y_AUDIT_20261109.md`. 첫 여정은 로그인 상태에서만 열려 로그아웃 표에는 없다.
- 계정 01 정리: 트리 0개·보관 파일 0개.

## 2026-11-09 — 책 정보 관리: 다른 책에서 고른 디자인 표지가 남던 문제(#314, 로컬2, ai/local2-lt-cover-stale-261109)

책 A에서 고른 디자인 표지가, 디자인이 없는 책 B의 책 정보 창에 그대로 남아 그대로 저장되던 문제. 원인은 `openTreeManager`의 `RadioNodeList.value = tree.coverDesign || ''` — **Chromium 1254 실측**으로 빈 문자열·없는 값 대입은 아무것도 바꾸지 않고(있는 비어 있지 않은 값만 그 라디오를 체크), 이전 체크가 남는다.

- `public/v41/shell/panels.mjs` `openTreeManager`: 라디오마다 `checked = (radio.value === (tree.coverDesign || ''))`로 **명시적으로** 정한다. 같은 창에서 책을 바꿔 열어도 이전 책 선택이 남지 않는다.
- 함께 고침: 창을 열 때 `coverUploads.reset()` — 이전 책에서 고르던 파일·전송 결과 안내(`[data-upload-status]`)·진행 중 업로드를 비운다(진행 중 업로드가 다른 책에 표지로 붙는 것도 막는다). 제목·대상·표지 select·새 사진 제목 칸·사진 표지 안내·힌트 문구는 기존 코드가 이미 책마다 다시 정하고 있었고, 시험으로 전부 고정했다.
- 시험: `tests/helpers/fake-dom.mjs`에 **`fakeRadioGroup`**(Chromium 실측 그대로: 빈 값·없는 값 대입 무시, 있는 값만 체크) 추가. `v41-panels-flow` +2(A→B→A 연속 열기 표·사진 표지 뒤 저장), `v41-shell-panels` +1(A→B→사진 업로드→저장 전체 경로), `v41-cover-design`의 옛 대입문 구조 단언을 새 루프 단언으로 교체. 강도 증명 2회: ① 루프를 옛 `.value =` 대입으로 되돌림 → 4건 실패(B가 `texture-3` 유지·저장에 섞임), ② `coverUploads.reset()` 제거 → 1건 실패(이전 책 업로드 안내 잔존). 둘 다 복구 후 `cmp`로 동일 확인.
- 검증: `npm test` **747건 710 pass / 0 fail / 37 skip**(main 기준 744), `npm run build` pass.
- 운영 실측(계정 03, `https://lovetree-4-0.pages.dev/v41/`, 1440): ① 배포본 그대로 A(`하루의 조각`)에 격자(texture-3) 저장 → B(`겨울 정원`) 창에서 `checked=["texture-3"]`, 그대로 저장하면 서버 `B.coverDesign="texture-3"` **(이슈 재현)**. ② 수정 본문(`panels.mjs`, sha256 `b0aa3eb2c84f…`)을 **운영 출처에만 주입**(다른 파일·서버 변경 0)하고 같은 순서: B 창 `checked=[""]`, 제목·대상·표지·제목 칸·사진 표지 안내·업로드 안내 전부 B 값 → 저장 `B.coverDesign=""`, A는 `texture-3` 유지. ③ B에서 실제 PNG 업로드(새 사진으로 표지 만들기) → `checked=[""]` 유지 → 책 정보 저장 → `B.coverDesign=""` + `coverMomentId`=새 사진 순간, A 불변. ④ A를 다시 열었다가 B를 다시 열어도 업로드 안내·파일 없음. 끝나고 트리 0개·보관 파일 0개 정리 확인. 기록 `.tmp-261109/measure-314.json`(미커밋, 23/23 PASS).
- 배포 전 실측임을 명시한다: ②③은 배포본이 아니라 **수정 본문을 운영 출처에 주입한** 측정이다(서버·계정·API는 실운영). 머지 뒤 배포본 확인은 다음 레인 몫.

## 2026-11-09 — 표지 고르기 2단계: 창에서 새 사진을 표지로 만들기(#256-3 2단계, 로컬3, ai/lt-cover-upload-261109, PR #310 머지 `5f384d4`)

“내 사진 올리기”를 (가)안으로 구현 — **스키마·서버 변경 0**. 올린 사진으로 순간을 하나 만들고 기존 `coverMomentId`(판정 1순위)로 가리킨다.

- `private-upload.mjs`: `mountPrivateUpload`에 `onUploaded(url)`·`imagesOnly` 옵션. **옵션 없으면 기존 순간 폼 동작 100% 동일**(시험 고정). `assets:null`도 받는다. `imagesOnly`는 영상을 기존 형식 문구로 거부.
- 책 정보 관리 창(`index.html` + `shell/panels.mjs`): `새 사진으로 표지 만들기` fieldset(기본 hidden — 예시·로그아웃에선 창 자체가 안 열리는 기존 분기와 겹겹). 필수 안내 “올린 사진은 이 책의 새 순간으로도 남아요.” 제목은 선택(비우면 자동 “사진으로 남긴 순간”). 흐름: 업로드 → `apply('add', {url, 제목?}, 루트 아래)` → `apply('editTree', {coverMomentId, 이름·대상·coverDesign 보존})` — sync가 한 번의 PUT으로 묶어 보낸다. 부분 실패 안내: “사진은 보관 파일로 남았어요…” / “사진은 순간으로 남았지만 표지 지정은 실패했어요 — 위 책 표지에서 직접 골라 저장할 수 있어요”. 성공 뒤 표지 선택지 재채움(`fillTreeCoverOptions()` 한 곳 정리) + 기준값 갱신.
- 시험: `private-upload-race` +3(onUploaded 경로/옵션 없음 동일/imagesOnly), `v41-shell-panels` +6(두 번 저장·제목 선택·부분 실패 2종·예시 숨김·선택지 재채움), `v41-cover-design` +1(구조). 강도 증명: editTree의 coverMomentId를 ''로 깨서 1건 실패 확인 후 복구. 전체 `npm test` 703 pass/0 fail/37 skip, build pass.
- 운영 실측(계정 01, 머지 뒤): 창에서 실제 파일 올리기 → 새 순간(자동 제목·루트 아래) 생성 + 표지 반영(책장·이어 읽기 칸 사진 표지)·새로고침 유지·정원에서도 동일·표지 순간 삭제 시 디자인 표지(texture-3)로 복귀. 끝나고 트리 0개·보관 파일 0개 정리. 캡처 `out/cover-upload-261109/`(가짜 세션 창·결과 책장 + 운영 창·책장, 미커밋).
- 다음 남은 것: #256의 4번(AI 추천). 영상 썸네일 표지·공유 받은 화면의 표지 사진(공유 투영이 개인 미디어를 벗기므로 안 보임 — 기존 규칙)은 별도 논의.

## 2026-11-09 — 전체 사용 흐름 실기기 전 점검(계정 03)과 #44 체크리스트 (로컬2, ai/com2-lt-flow-audit-261109)

운영 `pages.dev/v41`에서 계정 03으로 로그인 → 첫 여정 → 순간 4개(사진 1) → 기억책·기억 보드·관계 지도·책장(3권 목차·이어 읽기) → 책 정보 관리(디자인 표지·새 사진 표지) → 새로고침·재로그인 → 공유(로그아웃 열람) → 정리를 1440/390·밤/정원으로 확인했다. 저장·표지·재로그인 유지·공유(개인 미디어가 벗겨지는 기존 규칙) 모두 통과했고, 사용자 조작 중 콘솔 오류는 0이었다(검사 도구의 내비게이션 중단·세션 갱신 401 제외).

- **#314**: 책 정보 관리에서 디자인 표지가 없는 다른 책을 열어도 이전 책의 디자인이 라디오에 남아, 그대로 저장하면 잘못된 디자인이 저장된다. `panels.mjs:153`의 `form.elements.coverDesign.value = tree.coverDesign || ''`가 빈 값일 때 이전 체크를 해제하지 않는다.
- **#315**: 로그아웃 공유 감상 화면에 `제목 고치기`·`다음 순간 남기기`가 보이고, 누르면 `auth.padiem.net` 로그인으로 이동한다. 공유 화면은 읽기 전용이어야 한다.
- 작은 표시 수정: 계정 아바타 aria-label 조사(`내 계정로`→`내 계정으로`), 디자인 표지 이름 `점무누`→`점무늬`, 이어 읽기 문구가 자동 제목의 끝 마침표를 붙이지 않게.
- `docs/DEVICE_CHECKLIST.md`: #44용 10~15분 실기기 체크리스트(iOS·Android 공통, 소프트키보드·VoiceOver/TalkBack·이상 기록 칸).
- 검증: `npm test` 704 pass / 0 fail / 37 skip, `npm run build` pass. 전체 기록 `out/flow-261109/flow-report.json`(미커밋).
- 첫 사용자 경험(#297)은 보류 지시대로 손대지 않았다. 관찰: 첫 트리를 만든 뒤 안내 카드가 자동으로 뜨고 닫기 전까지 유지된다.

## 2026-11-09 — 책(트리)마다 표지 고르기: coverDesign 필드 + 디자인 표지 6종(#256-3, 로컬3, ai/lt-cover-design-261109)

이슈 #256의 3번. 책마다 표지를 고를 수 있게 했다. 사진 표지(기존 `coverMomentId`) > 디자인 표지 > 기본(책장 순서 색) 순서다.

- **데이터**: 트리 화이트리스트에 `coverDesign` 하나만 추가(`src/domain.js`·`public/v41/domain.mjs` 같은 규칙). 허용 값은 `''` 또는 `texture-1..6`(`COVER_DESIGN_IDS`·`normalizeCoverDesign`·`coverDesignPaletteIndex` 내보냄). 모르는 값·타입은 저장 거부 없이 `''`로. 순간 화이트리스트·다른 필드 변경 0. 옛 클라이언트(필드를 모르는)가 저장하면 디자인이 기본 표지로 돌아간다 — 데이터 손상 아님, 허용.
- **판정 한 벌**: `public/v41/views/shelf/shelf-model.mjs`의 `coverChoice(tree, index, palette)` — 사진 > 디자인 > 기존 규칙. 책장 카드(`shelf.js`)·펼친 책(`shelf-reader.js`의 `#bookCoverFace`와 넘어감 애니메이션)이 같은 `book` 객체를 쓴다. 사진·디자인이 둘 다 없으면 color·coverMedia가 기존과 같아 화면 변화 0. 디자인 색은 `texture-1..4` → `--lt-cover-1..4`, `texture-5·6` → 1·2색 + 다른 질감.
- **질감 CSS는 identity.css 한 곳**(`[data-cover-design="texture-N"]` + 책 정보 창 칩 `#tree-design .cover-design-chip`). 외부 이미지·새 hex 없음(중성 white/black 덧칠만이라 밤·정원 모두에서 보인다). `#tree-design`에도 `--lt-cover-N` 값을 같이 둔다(값 중복 없음).
- **고르는 곳**: 기존 책 정보 관리 창(`v41/index.html` dialog + `shell/panels.mjs`)에 디자인 표지 라디오(칩 미리보기 6종 + 기본) 추가. 사진 순간을 고르면 “사진 표지 사용 중 — 사진 표지가 디자인 표지보다 우선해요” 안내 + “사진 빼기” 버튼. 디자인 줄은 disabled로 막지 않는다(막으면 라디오가 전송에서 빠져 저장 때 고른 값이 지워진다). 새 창·새 저장 경로 없음 — `member.apply('editTree')` 그대로.
- **주입 연결**: `view-navigation.js`가 `LTDEMO.library`를 만들 때 `coverDesign`을 전달(빠지면 책장이 전부 기본 표지가 된다).
- 시험: `tests/v41-cover-design.test.mjs` 12건(두 벌 허용 목록 일치·normalize·validateState 보존/잘라내기·createTree·editTree·coverChoice 우선순위·기존 화면 동일·구조·칩) + `tests/server-cover-design.test.mjs` 4건(**서버 경계**: 배포될 같은 서버 코드로 PUT→GET 왕복 유지·목록 밖 ''·필드 생략 '' — #182 전례 대비). 강도 증명: coverChoice 사진 우선을 일부러 깨서 2건 실패 확인 후 복구. 전체 `npm test` 694건 pass/0 fail/37 skip, `npm run build` pass.
- 캡처(가짜 세션, `out/cover-design-261109/`): 기본(변화 0)·디자인(texture-1·4·6)·사진 우선 × 밤/정원 × 1440/390 = 12장. 실측: 디자인 속성·배경색·질감이 카드에 적용되고 사진이 있으면 사진이 이기고(photoLoaded true), 가로 넘침 0, 콘솔 오류 0.
- **배포 순서 주의**: 서버(Pages 프록시 뒤 COM2)도 `src/domain.js`를 쓴다. 머지되면 COM2 autodeploy(10분 타이머)가 서버를 재기동하기 전까지는 운영 서버가 `coverDesign`을 잘라낸다(디자인 표지가 기본으로 돌아옴). 프런트는 머지 즉시 CI가 배포한다. 머지 후 실계정 왕복 확인은 이어서 한다.
- 계정 01: 검증 후 트리 0개·보관 파일 0개로 정리 완료.
- **리베이스(#307·#308 머지 후)**: shelf-extra.css 충돌만 손으로 합치고 나머지는 자동 합병(#308의 renderSpines·syncSpines·spineScrollLeft, #307의 resumeCard·renderResumeCard 보존). 이어 읽기 칸 표지(`#resumeCover`)도 같은 판정(`book.design`)을 쓰고, identity.css의 같은 질감 규칙에 `.resume-cover[...]` 선택자를 재사용(복사 없음). 책등(#308)은 `spineItems`가 `book.color`를 쓰므로 디자인 색이 그대로 반영된다(질감 불필요). 시험 1건 추가(v41-cover-design 13건). 캡처 재촬영: 디자인 표지 책이 책장·이어 읽기 칸·책등에 함께 보이는 상태 12장(1440·390 × 밤·정원).

## 처음 오는 레인이 먼저 읽을 것 (10줄, 2026-11-09)

1. **화면은 한 벌**이다. 안쪽 화면은 `public/v41/views/*.html` + 화면별 폴더(`views/shelf/`·`views/book/`·`views/journey/`·`views/board/`·`views/network/`·`views/orbit/`)이고, `design/views/` 두 번째 벌은 없다.
2. **셸**은 `public/v41/shell.mjs`(배선) + `public/v41/shell/*.mjs`(화면·헤더·패널·메시지·여정·테마)로 나뉘어 있고, 각 파일 300줄 이하다.
3. **원칙 7**: 옮기기만 하는 작업은 조건·문구·id·순서·저장 키·`lt41-*` 메시지·URL 형식을 바꾸지 않는다.
4. **원칙 8**: 머지 전에 PR 미리보기 자동 검사(기능 + 겉모습 비교)를 통과해야 하고, 미리보기 Functions 503만 예외다(근거 링크 필요).
5. **시험 계정은 레인별 전용**이다 — 로컬1 `--account 02`, 로컬2 `--account 04`, 로컬3 `--account 01`. 자기 계정만 쓰고, 끝나면 트리 0개·보관 파일 0개로 정리한다(`tools/postdeploy/README.md`).
6. **시험 원칙**: 동작은 함수 호출로, 마크업·CSS 값·문구만 글자 검사(`docs/TESTING.md`). 새 시험은 한 곳을 깨뜨려 실패를 확인한 뒤 되돌린다(강도 증명).
7. **검증 명령**: `npm test` · `npm run build` · `node tools/postdeploy/postdeploy.mjs <주소> --account NN --auto-login`.
8. **금지**: 값(비밀번호·이메일 원문)·`out/`·비밀 폴더 커밋, 다른 레인 파일 동시 수정. **`git add -A`·`git add .` 금지(2026-11-09 대표 결정)** — 파일을 하나씩 지정해 add하고, 커밋 전 `git status`로 올라간 파일을 눈으로 확인한다. `tests/forbidden-paths.test.mjs`가 금지 경로(프로필·`.tmp-*`·`out/`)가 트래킹되면 CI를 실패시킨다.
9. **이 문서**는 날짜별 기록이다. 구조·규칙을 알려면 이 10줄과 아래 "파일 지도" 절을 보면 되고, 지난 기록은 이력으로만 읽는다.
10. 되돌리기·릴리스 판단은 `docs/REFACTOR_PLAN_20261108.md`(이유·계획)와 `docs/REFACTOR_15_VIEWS_MERGE.md`(한 벌 통합 결과)를 따른다.


- **원칙 8 자동화(2026-11-08)**: PR마다 `.github/workflows/preview-check.yml`이 Cloudflare Pages 미리보기 주소를 찾아 `tools/postdeploy`(로그아웃)를 돌리고, `tools/postdeploy/preview-gate.mjs`가 판정한다(visual·페이지 오류 0, 미리보기 Functions 503만 예외). 미리보기 배포가 없으면 실패가 아니라 건너뜀. 레인은 체크 요약만 확인한다.

## 2026-11-10 — 자동 제목을 영상 제목으로: 빠른 추가·자세한 추가(#344, 로컬2, ai/local2-video-title-344-261110)

- **문제**: 빠른 추가로 담은 YouTube 순간 제목이 모두 "youtube.com에서 간직한 순간"이라 기억책·보드·지도·'경로 한눈에'(기억책 목차)에서 구분이 안 됐다(#344 대표 피드백의 근본 원인).
- **규칙(도메인 두 벌 동일)**: `suggestMomentTitle` 우선순위 — 사용자 입력 > 영상 제목(`mediaMetadata.title`, 80자 자르기) > 마음 한마디 첫 줄 > 기존 도메인 규칙. oEmbed를 못 받으면(빈 값·실패) 기존 규칙으로 물러난다. 영상 제목은 저장값에 mediaMetadata로도 남아 기억책 작은 글씨(#327)와 같은 값을 쓴다. `validateMomentInput`은 mediaMetadata를 제목 판정 전에 정규화하고, `quickAdd` 입력에 mediaMetadata를 받는다(빠른 추가·드롭·붙여넣기·#350 공유 받기 공용). **기존 순간 제목은 바꾸지 않는다**(cacheMomentMediaMetadata 불변).
- **조회 한 벌**: `public/v41/video-title.mjs fetchVideoTitle` — 서버 oEmbed 프록시(/api/youtube/oembed)만 쓰고 실패는 조용히 ''. 빠른 추가의 기존 조회(loadYouTubeTitle)도 이 한 벌로 바꿨다.
- **배선**: 빠른 추가(`shell/quick-add.mjs`)는 미리보기 때 받아 둔 제목(titleCache)을 `apply('quickAdd', {url, mediaMetadata?})`로 넘긴다(응답이 늦으면 넘기지 않고 기존 규칙). 자세한 추가(`shell/panels.mjs`)는 편집기 미리보기에서 oEmbed 제목을 받아 두고 저장 입력에 함께 넘긴다(사용자 입력 우선은 도메인 판정, 안내 문구도 같은 규칙).
- **시험**: `tests/v41-video-title.test.mjs` 6건(우선순위·80자·fallback 매트릭스 **두 벌 동일** 확인, quickAdd 저장값, fetchVideoTitle 안전성, **서버 경계 PUT→GET**(member session + validateState/validateReader 왕복), 배선 글자 검사). 강도 증명: 영상 제목 우선순위 제거 시 4건 실패 확인 후 복구. 전체 `npm test` **874건 837 pass / 0 fail / 37 skip**, `npm run build` pass. 실측은 머지 뒤 운영 반영(컴2 자동 배포)을 확인하고 진행(계정 04).

## 2026-11-10 — 도구 계정 선택 한 벌: --account 인자 우선·없으면 시작 전 정지(#344 대표 지시, 로컬2, ai/local2-a11y-account-arg-261110)

- **문제(실측 확인)**: `tools/a11y/a11y-run.mjs`가 `--account` 인자를 무시하고 `LT_ACCOUNT` 환경변수·기본값 '01'로 시크릿 키·보고서 계정을 골랐다 — `--account 04`로 돌려도 보고서 account가 '01'이었다(실제로 계정 04 a11y 실행이 계정 01(읽기만, 기록 없음)으로 돌아간 것이 이 버그). postdeploy의 `normaliseAccount('')`도 조용한 '01'이었다.
- **규칙 한 벌**: `tools/account-choice.mjs` — `--account` 인자 > `LT_ACCOUNT` 환경변수 > 둘 다 없으면 선택 없음(''), **계정을 쓰는 실행은 시작 전에 멈춘다**(기본 계정으로 조용히 진행하지 않음). 정규화(1→01·tutorial4→04·03 폐기 거절)도 한 벌에서 하고 postdeploy `accounts.mjs`는 위임.
- **훑기 결과**: `a11y-run.mjs`(항상 계정으로 로그인 → 가드 한 곳, 시크릿 키·보고서 계정 모두 선택 계정 따름), `postdeploy.mjs`(`--auto-login`·`--auth-flows`만 계정 사용 → 그 두 모드에서 멈춤, 로그인 없는 읽기·수동 검사는 계정 '' — 프로필 기본값 동일), `visual-baseline`(계정을 쓰지 않음 — 변경 없음). README·도움말에 규칙 기록.
- **시험**: `tests/tools-account-choice.test.mjs` 7건(우선순위·정규화·a11y/postdeploy **실제 실행** 가드 — child_process로 브라우저 띄우기 전 정지·종료 코드·인자 우선 확인·배선 글자 검사), `tests/postdeploy-accounts.test.mjs` 빈 값 단언을 새 규칙으로 갱신. 강도 증명: chooseTestAccount를 조용한 '01'로 되돌리면 4건 실패 확인 후 복구. 전체 `npm test` **868건 831 pass / 0 fail / 37 skip**, `npm run build` pass.

## 2026-11-10 — 첫 화면 카드: 내 기록 YouTube 순간을 썸네일 카드로(#340, 로컬2, ai/local2-home-youtube-cards-261110)

빠른 추가(#329)로 담은 YouTube 순간이 첫 화면에서 글자 카드로만 분류돼 '사진 3장 미만' 예시로 물러나던 문제. 지난 세션에 ai-revenue-lab #7313에 잘못 올린 같은 내용은 **skerishKang/lovetree-4.0 #340**으로 옮기고(잘못 올림 댓글 후 원 이슈는 닫음) — **앞으로 러브트리 이슈는 lovetree-4.0에만 올린다**.

- **CTO 결정(#340에 기록)**: 내 기록(`source==='server'`, 소유자)일 때만 YouTube 순간을 썸네일 카드로 센다. 판정은 #330의 한 벌(media-preview `autoLoadMedia`)을 재사용하고, 썸네일 주소도 `LTMedia.describe`의 `loadUrl` 한 벌에서 가져온다(quick-add와 같은 재사용 규칙). '사진·영상 3장 미만이면 예시' 기준(mix-empty, #297 보류)·예시·공유 모드는 그대로다. **표지(책장·이어 읽기 칸)는 YouTube 썸네일을 쓰지 않는다(#256 외부 이미지 표지 금지)** — 코드 변경 없이 현행 유지.
- **계산은 home-moments 한 벌**: `v41/home-moments.js` `cardOf`가 youtube 묶음(`{describe, auto}`)을 받아 사진 이미지가 없는 YouTube 순간에 `image=loadUrl`·`type 'video'`·`youtubeThumb:true`(저장 값이 보낸 같은 이름 값은 덮어쓴다)를 붙이고 photos 배열로 세어진다. `v41/home-cards.js` `homeCardsPlan`에 `youtube` 옵션이 추가됐다. `v41/home.js`는 `LTMedia.currentContext()`로 셸 기록 상태를 읽어 `autoLoadMedia(source, owned)` 판정을 묶음으로 만들어 넘긴다(첫 화면 iframe도 media-preview.js를 함께 읽는다).
- **궤도 렌더러**: `src/views/orbit.js`는 `youtubeThumb` 카드만 video 타입으로 세워 기존 `.card.video .playGlyph` CSS 한 벌로 재생 표시(aria-hidden ▶)를 붙이고, 썸네일 img에는 #330과 같은 `referrerpolicy=no-referrer·loading=lazy`를 붙인다. '영상 포스터 예시' 문구는 demo·example 카드에만 붙게 판정에 기록 상태를 넣었다(내 카드가 예시로 읽히지 않게). 예시·demo·인기 카드 렌더는 그대로다.
- **시험**: `tests/v41-home-youtube-cards.test.mjs` 10건 — 사진·YouTube·글 × 소유자·예시·공유·파일 판정 매트릭스, mix 3장(내 카드)/2장(mix-empty), 2 YouTube+1 사진, 내 것만 순서, 외부 링크·다른 출처·비공개 mp4 차단, `?t=90`, 궤도·배선 글자 검사. **media-preview의 실제 `autoLoadMedia`·`describe`를 vm으로 직접 불러 쓴다.** 강도 증명: cardOf의 auto 게이트를 빼면 '소유자 판정' 시험이 실패하는 것을 확인하고 되돌렸다. 전체 `npm test` **843건 806 pass / 0 fail / 37 skip**, `npm run build` pass.
- **실측(운영 계정 04 → PR 코드 재생, 미리보기 Functions는 로그인 불가 — 원칙 8 예외 패턴)**: 운영에서 빠른 추가(실제 UI)로 YouTube 3개(`?t=90` 포함)를 담고, 그 실제 응답을 dist 로컬 서버에 재생해 첫 화면을 실측: 내 카드 3장·ytimg 썸네일 3·재생 표시 3·no-referrer·가로 넘침 0·pageerror 0(1440·390 × 밤·정원), 카드 누름 → `#my/book?tree=…&moment=…`(기존 동작), 순간 2개로 줄이면 mix-empty(지금처럼 예시). 재생 URL에는 회원 기록 로드 마커 `?account=1`이 필요하다(빼먹으면 예시로만 렌더된다 — 프로브로 확인). 끝나고 운영 기록 **트리 0개·보관 0개** 정리 확인. 캡처: `.tmp-261109/shots-340/`(스냅숏 파일은 검증 뒤 삭제).

## 2026-11-09 — 책이 많아지면 책등 목차(#256 2번, 컴2로컬2, ai/com2-lt-shelf-toc-261109)

책이 3권 이상이면 책등을 목차처럼 한 줄로 세워 아래 책장의 목차로 쓴다. 1~2권은 숨긴다.

- **계산은 한 벌**: `views/shelf/shelf-model.mjs`에 `spineVisible(권수)`(3권부터 참)·`spineItems(책들)`(책장 순서 그대로의 책등 목록)·`spineStyle`(표지 색 변수+기울임)·`spineTargetIndex(책들, id)`(누른 책 → 아래 넘기기가 갈 자리)·`spineScrollLeft(줄 폭, 내용 폭, 책등 위치, 책등 폭)`(활성 책등을 가운데로 모는 가로 위치, 줄 안에서만 자르기)를 두고, 화면(`shelf.js`)은 렌더·이벤트만 한다. 시험은 `tests/v41-shelf-spines.test.mjs` 7건 — 0·1·2·3·12권과 스크롤 위치 계산을 함수 호출로 확인하고, 화면 연결·누르는 영역(46×118px ≥44px)·가로 넘김 규격만 글자로 본다. 강도 증명: 임곗값을 2권으로, 위치 계산의 자르기를 빼서 각각 실패를 확인하고 되돌렸다.
- **누르면 이동**: 책등을 누르면 아래 넘기기(캐러셀)가 그 책으로 이동한다(책을 바로 열지는 않는다). 레일이 드래그·화살표로 움직이면 목차의 선택 표시(`aria-current`)와 가로 위치가 따라간다. 키보드는 기본 button 포커스·Enter로 이동한다.
- **넘침 처리**: 책이 많아도(12권) 390에서 화면 가로 넘침이 없다. 목차 줄만 `overflow-x: auto`로 가로로 넘긴다 — 줄바꿈을 선택하지 않은 이유: 책등은 원래 책장 한 줄에 서 있는 모양인데 줄바꿈하면 두 줄의 진열장이 되어 목차 순서가 읽히지 않고, 아래 캐러셀도 좌우로 움직이므로 같은 방향의 넘김이 자연스럽다. 활성 책등은 목차 줄의 `scrollTo`로 따라온다(아래 CTO 검토 기록).
- **CTO 검토 후속(머지 전 수정)**: 첫 버전은 활성 책등에 `scrollIntoView`를 썼는데, 이는 목차 줄뿐 아니라 스크롤 가능한 조상(책장 문서·셸 부모 문서)까지 움직인다. 목차가 화면 밖으로 나간 상태에서 책을 바꾸면 문서가 목차 쪽으로 튀는 것을 실측으로 확인(390: iframe scrollY 264→61, 1440: 215→43)하고, **목차 줄의 가로 스크롤만** 움직이게 고쳤다. 위치 계산은 `shelf-model.mjs`의 `spineScrollLeft(줄 폭, 내용 폭, 책등 위치, 책등 폭)` 한 벌(0 이상·최대값 이하로 자르기), 이동은 `row.scrollTo({left, behavior})` — 첫 렌더는 `behavior:'auto'`, 그 뒤는 `smooth`. 재실측(12권, 같은 시나리오): 390·1440 모두 첫 진입 scrollY 0/0, 다음·이전 버튼과 드래그로 책을 바꿔도 셸·책장 문서 scrollY 변화 0, 목차 줄 `scrollLeft`만 바뀐다(390에서 3번 넘기면 0→12). 계정 03 로그인 12권에서도 1440·390 × 밤·정원 4조합 모두 scrollY 변화 0.
- **책등 모양**: 지금 책장 디자인을 따른다 — 카드 칸 없이 책등만 띄워 세우고, 표지와 같은 `--lt-cover-N` 색·질감·책등 광택 줄, 눌린(현재) 책등은 위로 살짝 뜬다. 표시 글꼴은 `--lt-font-display`(밤=Pretendard·정원=MaruBuri). 밤 덧칠은 `identity.css` 밤 책장 블록(진주 글자·금테), 정원은 `shelf.css` 기본 모양이다. 정원 테마가 셸 헤더 내비게이션용으로 정한 `nav button:hover`·`[aria-current=true]` 규칙이 책등에 스며들지 않게 같은 속성을 더 높은 구체성으로 다시 새웠다.
- 검증: `npm test` **709건 672 pass / 0 fail / 37 skip**, `npm run build` pass.
- 캡처(가짜 주입 — 로그아웃(예시) 책장에 트리만 끼워 넣은 상태, headless Chromium + 로컬 dist 서버): `out/shelf-toc/` 32장(전·후 × 1·2·3·12권 × 1440·390 × 밤·정원) + 감점 기록 `toc-{before,after}-audit.json`. 실측: 0·1·2권 목차 숨김, 3·12권 표시, 책등 클릭 → 레일 이동(6번째 책등 → 가운데 6), Enter → 같은 이동, 글꼴 밤=Pretendard·정원=MaruBuri, 12권 390에서 목차 줄만 가로 스크롤(문서 가로 넘침 0), 콘솔 오류 0.
- 로그인(--account 03) 확인: PR 미리보기 Functions는 `LOVETREE_API_ORIGIN`이 없어 로그인 자체가 불가능(원칙 8의 미리보기 503 예외 사례)해서, **운영 주소에서 계정 03으로 실제 로그인 → `/api/workspace` PUT으로 트리 2·3·12권을 실제로 만들고 → 그 실제 응답을 PR 코드(dist 로컬 서버)에 그대로 재생해 캡처**했다. `out/shelf-toc/account03/` 12장(2·3·12권 × 1440·390 × 밤·정원) + `account03-audit.json`: 2권 목차 숨김, 3·12권 표시·책등 누르기 이동·글꼴·390 가로 넘침 0 동일 확인, pageerror 0. 끝나고 운영 기록을 **트리 0개**로 정리 확인(보관 파일은 건드리지 않았다). 스냅숏 파일(이메일 포함 가능)은 검증 뒤 즉시 지웠다.
- PR 미리보기 검사(원칙 8)는 초록(로그아웃 postdeploy + 겉모 비교 포함 전 체크 pass). 머지는 CTO 승인 후.

## 2026-11-08 — 내 책장을 첫 화면과 맞추기: 밤 테마·책 카드 정보·트리 이름 접미사·예시 그림(#212, 컴1, ai/lt-shelf-unify-261108)

이슈 #212의 1~4번을 **내 책장 화면과 트리 생성 경로** 범위에서 처리했다.

- **테마**: `track32-…` iframe이 이제 테마를 넘겨받는다(`header-state.mjs`의 `appliedTheme`에 `shelf` 추가, 셸 `themedView`가 책장을 `shelf`로 판정). 밤은 `identity.css`의 밤 블록에서 어두운 무대(`--lt-stage`)·진주 글자(`--lt-pearl`)·금 포인트(`--lt-gold-deep`)·Pretendard를 쓰고 **장미 토큰을 쓰지 않는다**. "한 권의 책" 강조는 진주 계열 흐린 톤(`--lt-muted`). 정원은 지금 크림 책장·글꼴 그대로다(기존 `:root` 값이 그대로 남고, 표지 색만 `[data-lt-theme=garden]`에서 되돌린다). 기억책·기억 보드·관계 지도는 계속 A다.
- **표지 색**: 밤은 보드·지도 구분색(`--lt-group-*`), 정원은 기존 표지 색(`#a84f5d`·`#627ba2`·`#8d705e`·`#6d8979`)을 `--lt-cover-1..4` 한 곳에 둔다. 장미 계열은 밤에서 쓰지 않는다.
- **책 카드**: 표지에 이름 한 번만. 표지 아래는 `순간 N개 · 마지막 YYYY-MM-DD` 하나(마지막 날짜는 그 트리 순간 날짜의 최댓값). `책 · 02`·`기본 표지` 같은 내부 표시는 마크업에서 없앴다. 선택 카드가 표지 윗부분이 잘리던 문제는 캐러셀 수치(중앙 배율 1.12→1.06, 위 이동 -9px→+6px)로 고쳤다 — 레일 높이 375px보다 카드가 커서 위로 뜨면 `overflow:hidden`에 잘렸다.
- **트리 이름 자동 접미사**: 표시 규칙을 `public/v41/tree-name.mjs`(모듈)와 `public/v41/tree-name.js`(클래식)에 두고, 자동 문구 `, 나의 순간들`과 **정확히 일치할 때만** 뗀다(앞부분이 비면 그대로). 저장 데이터는 바꾸지 않는다. 생성 경로(`public/v41/domain.mjs`의 `createTree`)는 이제 접미사를 붙이지 않고 대상 이름을 그대로 제목으로 쓴다. (2026-11-09 갱신: 셸 헤더·트리 목록은 `shell.mjs`가 `displayTreeTitle`을 직접 쓴다 — 연결 완료. 기억책 표시도 같은 규칙을 쓴다.)
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

## 2026-11-08 기억책 트리 이름 연결 (#212 마무리, ai/lt-book-tree-title-261108)
- 기억책(트랙59) 두 벌 화면이 트리 이름을 보여 주기 시작했다. 규칙은 `tree-name.mjs`의 `displayTreeTitle()` 하나이고, 어댑터(`book-usability.mjs`)가 `treeTitleText()`로 감싼다(자동 접미사 `", 나의 순간들"`은 표시 단계에서만 제거, 저장값 불변).
- 이름이 보이는 곳: 책 위쪽 갈래 글자(`.crumb`, 원래 "같은 트리 보기")와 순간 목차 머리 아래 한 줄(`.archive-tree`). 두 테마 모두 UI 글꼴(Pretendard).
- 어댑터 주입 방식 그대로: `scripts/apply-book-usability.mjs`가 두 벌에 같은 스크립트·스타일을 넣고, 재실행하면 "변경 없음"이다. 원본 화면 파일은 손으로 고치지 않는다.
- 기억 보드·관계 지도는 화면에 트리 이름을 그리는 자리가 없다(`기억 보드` 제목·`처음의 마음에서,` 문구뿐) → 이번에 연결할 곳 없음.
- 시험: `tests/v41-book-usability.test.mjs`에 11번 추가("리센느, 나의 순간들" → "리센느", 직접 쓴 이름 그대로, 두 벌 배선). `npm test` 478 pass / 0 fail / 37 skip, build 성공.
- 브라우저 확인(1440·390, 예시 트리 `좋아하는 순간들`): `.crumb`·`.archive-tree` 모두 "좋아하는 순간들", Pretendard, 넘침 0. 실제 화면에서 `treeTitleText('리센느, 나의 순간들')==='리센느'`.

## 2026-11-08 로그인 뒤 사이트 루트로 떨어지던 결함 (#213 후속)
- 원인: `functions/_lib/shared-auth.mjs`의 `validNext`가 `/^\/[A-Za-z0-9_./-]*$/`만 통과시켜, 첫 화면이 보내는 `next=/v41/?intent=new-tree|shelf`(#215)가 거부되고 콜백이 `/`로 복귀했다.
- 수정: `validNext`를 URL 파싱 + 허용 목록으로 바꿨다. 경로는 영문·숫자·`_ . -` 조각만, 쿼리는 `intent=new-tree|shelf` 하나만. `//evil.com`·`/\evil`·`https://…`·`#해시`·`..`·모르는 쿼리는 모두 기본값 `/v41/`로 떨어진다(기본값도 `/`에서 `/v41/`로).
- 계정 동그라미 메뉴에는 이미 맨 아래에 `#account-logout`(role=menuitem)이 있고 `#logout` 클릭으로 기존 로그아웃 경로를 부른다. 없던 게 아니라 확인 때 선택자를 잘못 잡았던 것 — 그래서 마크업·배선을 시험으로 고정했다.

## 2026-11-08 기억책 실제 계정 결함 2건 (ai/lt-book-play-garden-261108)
- **그 자리 재생이 실제 기록에서 안 되던 문제**: 사이트응답 헤더에 CSP가 없다(`public/_headers` 자체가 없고, Pages 응답에 `Content-Security-Policy` 없음) → `frame-src` 차단은 원인이 아니다. 어댑터의 재생 리스너는 `click` 캡처 하나뿐이어서, 카드 위 겹침(`.moment-title` 등)이나 다른 리스너의 `stopPropagation`에 걸리면 아무 일도 일어나지 않았다(증상: iframe 0, 외부 요청 0). 이제 `pointerdown` 캡처에서 먼저 잡고(`playInline()`), 재생 단추를 겹침 위(`z-index:3`)로 올리고, 제목 겹침은 `pointer-events:none`(제목 고치기 단추만 auto), 재생 주소를 못 만들면 원본 링크를 새 창으로 연다. 두 번 만들지 않는다.
- **정원에서 기억책 제목이 명조가 아니던 문제**: `appliedTheme()`이 home·journey·shelf만 정원을 넘겼다. `appliedTheme`에 `book`을 더하고 셸 `themedView()`가 기억책(`track59-sketchbook.html`)을 `book`으로 보낸다. 셸이 iframe `documentElement`에 `data-lt-theme=garden`을 붙이므로 #217의 정원 글꼴 규칙이 그대로 적용된다. 기억 보드·관계 지도는 계속 밤.
- 확인(가짜 서버 기록: `url` + `mediaMetadata`가 있는 YouTube 순간): 1440·390, 밤·정원 모두 실제 마우스 클릭으로 `iframe.yt-frame` 1개 생성(임베드 `start=83`), 밤 큰 제목 Pretendard · 정원 큰 제목 MaruBuri, 넘침 0. 셸 경유(`#book`)에서도 iframe 테마가 garden으로 전달된다.
- 시험: `tests/v41-book-usability.test.mjs` 12·13번, `tests/v41-journey-garden`·`v41-theme-ab`의 기대값 갱신(기억책·보드·지도=정원 허용(#274로 보드·지도도 정원), 그 밖의 안쪽 화면=밤 고정). `npm test` 483 pass / 0 fail / 37 skip, build 성공.

## 2026-11-09 기억책 계산 전부 LT59Model 한 벌 — 여섯 화면 계산 정리 완료 (ai/lt-book-model-261109)

- 기억책의 순수 계산은 `public/v41/views/book/book-model.js`의 **`window.LT59Model` 한 벌**만 쓴다: `buildSpreads`(펼침면·동반 페이지·갈래)·`folioLabel`(쪽번호)·`turnAngle`(넘김 각도·휨)·`connectionSummary`(연결 요약)·`nextMomentOf`(다음 순간).
- 표시 규칙은 이미 `public/v41/book-usability.mjs`가 한 벌로 갖고 있어 그대로 둔다: `displayTitle`·`connectionLine`·`detailPlacement`·`tapIntent`(#299)·`pageOverflows`(#301).
- `book.js`·`book-extra.js`는 같은 계산을 다시 구현하지 않고 모델을 먼저 부른다(`track59-sketchbook.html`에서 `book-model.js` → `book.js` 순서). 시험 `tests/v41-book-model.test.mjs`가 옛 계산 부재 + 호출 존재를 함께 검사.
- 이로써 **여섯 화면(홈·책장·기억책·기억 보드·관계 지도·계정)의 순수 계산이 모두 화면이 실제로 쓰는 한 벌**이 됐다(보드 `LT58Model`·지도 `LT56Model`·기억책 `LT59Model`·나머지는 각 화면/`book-usability.mjs`).

## 2026-11-09 관계 지도 계산 전부 LT56Model 한 벌 (ai/lt-network-model-261109)

- 관계 지도의 순수 계산은 `public/v41/views/network/network-model.js`의 **`window.LT56Model` 한 벌**만 쓴다: `branchPoint`(갈래 점)·`groupSizeFor`·`clusterSpan`(묶음 나누기·이름)·`smallTreeLayout`(작은 트리 보정)·`bezierGeometry`(연결선 조절점)·`mobileFit`(손가락 맞춤)·`routeEdges`(경로 순서).
- `network.js`는 같은 계산을 다시 구현하지 않고 모델을 먼저 부른다(`track56-network.html`에서 `network-model.js` → `network.js` 순서). 시험 `tests/v41-network-model.test.mjs`가 옛 계산 부재 + 호출 존재를 함께 검사.
- 예시 판본 판단(`canPlay`)은 그대로 `network.js` 한 곳에 남아 있다.

## 2026-11-09 기억 보드 계산 전부 LT58Model 한 벌 (ai/lt-board-filters-model-261109)

- 기억 보드의 순수 계산은 이제 **`public/v41/views/board/board-model.js`의 `window.LT58Model` 한 벌**만 쓴다: `escapeHTML`·`cardPosition`·`threadPath`·`fitZoom`·`removeConnection`·`editGuard`(#292) · `collectPath`·`nextConnections`·`detailButtonState`·`cinemaBeats`(#298) · `filterVisible`·`maxCreatedOrder`(필터, 이번).
- `board.js`·`board-extras.js`는 같은 계산을 다시 구현하지 않는다(시험 7·12·14번이 부재+호출을 함께 검사). 화면은 DOM 반영(클래스 토글·버튼 상태 적용)만 맡는다.
- 필터 판정: 미디어(전체·first·unconnected·recent·종류) × 키워드(AND) — 조건·순서는 예전 그대로, 예시/실제 기록으로 갈리지 않는다.

## 2026-11-09 첫 화면(src064-orbit) 파일 지도 (원본 정리, ai/lt-orbit-source-261109)

| 파일 | 줄 수 | 내용 |
|---|---|---|
| `public/v41/views/src064-orbit.html` | 49 | 마크업 + `orbit.css`·`orbit.js` 연결만 (75KB → 5.0KB) |
| `public/v41/views/orbit/orbit.css` | 254 | 화면 스타일(원본 `<style>` 그대로, 공백만 정리) |
| `public/v41/views/orbit/orbit.js` | 279 | 궤도 계산·그리기·포커스·뷰어·목록·입력(ES 모듈, `import`로 아래 두 파일 사용) |
| `public/v41/views/orbit/orbit-cards.mjs` | 55 | 기본 카드 배치 `BASE_CARDS`(배치값 없는 실제 기록에만 쓰는 값) |
| `public/v41/views/orbit/orbit-model.mjs` | 12 | 순수 함수 `escapeRecord`·`hasLayout`·`momentSeq` — node에서 import해 시험 |

- 원칙 7: 조건·문구·id·순서·동작 변경 0. 스크립트는 **공백만 넣어** 줄을 나눴고(문자열·템플릿·정규식 밖에서만), `#286`에서 정리한 예시 분기 2곳은 자리만 옮겼다.
- 화면 스크립트는 `type="module"`이다(순수 함수를 실제로 import하기 위해서). `runtime.js`는 그보다 먼저 실행되어 `window.LTDEMO`를 만든다.
- 확인: home 4장(1440·390 × 밤·정원) **0.000%**, 24장 24/24 기준 이내, `npm test` **610 pass / 0 fail**.

## 2026-11-08 postdeploy visual/visual-theme 기대값 = 제품 함수 (ai/lt-postdeploy-garden-all-261108)

- `tools/postdeploy/postdeploy.mjs`의 visual-theme 판정이 "기억책만 정원, 보드·지도는 A 고정"으로 박혀 있었다(#274로 보드·지도도 정원을 받아 실패).
- 이제 **화면별 기대 테마를 제품 함수로 계산**한다: `appliedTheme('garden', view)`(`public/v41/header-state.mjs`) 결과가 `garden`이면 `data-lt-theme=garden`, `night`이면 속성 없음. 대상: `shelf`·`book`·`board`·`network`.
- 도구를 저장소 밖에서 단독 실행하면 제품 파일이 없을 수 있어, 그때만 밤(속성 없음)으로 물러난다.
- 화면별 기대 목록을 도구에 다시 박지 않는다 — 테마 대상이 늘면 `appliedTheme`만 고치면 된다.

## 2026-11-08 관계 지도·기억 보드 파일 지도 (3단계, #231)

| 화면 | 파일 | 줄 수 | 내용 |
|---|---|---|---|
| 관계 지도 | `public/v41/views/track56-network.html` | 28 | 마크업 + 파일 연결 |
| | `public/v41/views/network/network.css` | 46 | 화면 고유 스타일 |
| | `public/v41/views/network/network.js` | 119 | 본문 동작(노드·경로·상세·재생 안내) |
| 기억 보드 | `public/v41/views/track58-pinboard.html` | 51 | 마크업 + 파일 연결 |
| | `public/v41/views/board/board.css` | 54 | 무대(보드·카드·실·핀·툴바) 스타일 |
| | `public/v41/views/board/board-extra.css` | 30 | 상세·패널·모바일 보정 |
| | `public/v41/views/board/board.js` | 338 | 무대 동작(카드·실·핀·카메라·연결·시네마) |
| | `public/v41/views/board/board-extras.js` | 107 | 상태·저장·유튜브·경로·필터·작성기 보조 |
| | `public/v41/views/board/board-detail.js` | 145 | 상세 카드·다음 순간·키워드·편집 미리보기 |

- 관계 지도 예시 분기 1곳(재생 안내), 기억 보드 예시 분기 3곳(연결 지우기·말풍선 버튼·연결 색)은 **자리만 옮겼고 내용·조건 그대로**.
- `board.js`는 압축 해제만 하고 **한 파일 338줄**이다(300줄 초과 이유: 무대 동작이 서로 얽혀 있어 기능 경계로 더 쪼개면 문장 사이가 갈라진다). 나머지 보조 코드는 `board-extras.js`로 분리.
- 파일을 나눌 때는 **원래 순서 그대로** `<link>`·`<script src>`를 나열한다(캐스케이드·실행 순서 보존).

## 2026-11-09 시험 계정 규칙: "한 번에 한 레인" → **레인별 전용 계정** (#300, `accounts.mjs`)

같은 계정을 두 레인이 동시에 쓰면 ① 한쪽 정리가 다른 쪽 트리를 지우고 ② 로그아웃 검사가 상대 세션을 끊고 ③ 트리 개수에 따라 화면이 달라져 결과가 오염된다. 그래서 계정을 나눈다.

| 레인 | 계정 | 실행 | .secrets 키 |
| --- | --- | --- | --- |
| 로컬1 | **02** | `--account 02` | `PADIEM_TUTORIAL02_EMAIL`·`_PASSWORD` |
| 로컬2 | **04** | `--account 04` | `PADIEM_TUTORIAL04_EMAIL`·`_PASSWORD` |
| 로컬3 | **01**(기존) | `--account 01`(기본) | `PADIEM_TUTORIAL01_*` |

- 규칙: **자기 계정만** 사용하고, 끝나면 트리 0개·보관 파일 0개까지 정리한다. 다른 레인 계정으로는 로그인하지 않는다.
- 계정 값이 `.secrets`에 없으면 `--auto-login`은 로그인을 건너뛰고 **warn**만 남긴다(실패 아님). 값은 화면·로그·리포트·커밋에 쓰지 않는다.
- 브라우저 프로필은 계정별로 분리(`.profile`, `.profile-02`, `.profile-04`) → **두 레인이 동시에 돌아도** 세션이 엉키지 않는다.
- **계정 생성은 레인이 한다**(2026-11-09 완료). Chat QA 계정 도구(ai-revenue-lab `provision_qa_smoke_account.ps1`)와 같은 방식 — `POST https://chat.padiem.net/api/auth/password/register` → 409 `account_exists`면 가입 생략 → `POST .../api/auth/password/login`으로 쌍 검증. 이메일 인증 없이 점검 전용 주소(`@test.dev`)를 쓴다.
- 02·04 계정·`.secrets` 값 준비 완료(값은 컴1 `C:\Users\limone\.secrets\.env`). 두 계정 동시 `--auto-login`에서 **로그인 완료·트리 0개**를 확인했다. 계정을 새로 만들 때도 같은 순서(가입 → **`.secrets` 저장 → 로그인 검증** → `--auto-login` fail 0)를 지킨다.
- **계정 03 삭제·04 신설(2026-11-09 밤, 대표 결정)**: PR 작업 중 브라우저 프로필(`tools/postdeploy/.profile-03`)이 커밋·푸시됐다(커밋 `64c4e2c2e9d932463d96326f4f314dde0f2b0aa0`, 브랜치 `ai/local2-lt-quick-add-261109`, 푸시 2026-11-09 22:46:48 +0900). 푸시된 커밋은 SHA로 계속 열릴 수 있어 세션을 노출로 보고, 계정 03을 레인 권한으로 탈퇴·삭제했다(러브트리 기록 트리 0·보관 0 확인 후, `/api/account/delete` 고정 문구 확인, 삭제 후 옛 쿠키 `/api/workspace`·`/api/account` **401** 확인, 미디어 정리 확인). 공통 계정은 다른 서비스 연결이 남아 자동 삭제되지 않았다(`commonAccountDeleted=false`) → **공통 계정 정리 요청: ai-revenue-lab #7304**(2026-11-09 밤 레인이 요청 — 계정 03 공통 계정 + 04 발급 때 비밀번호를 잃은 계정, 삭제·세션/리프레시 토큰 무효화. 담당 확인 후 결과 댓글 예정). 로컬 `.profile-03` 폴더와 `.secrets`의 `PADIEM_TUTORIAL03_*`도 지웠다. 새 계정 **04**(점검 전용 `@test.dev` 주소)를 같은 방식으로 만들고 `--auto-login`을 통과시켰다. 자연 유도 주소(03 주소의 03→04) 하나는 생성 도중 비밀번호를 잃어 못 쓰게 됐다(로그인 불가 — 재사용 금지).

## 2026-11-09 내 책장 파일 지도 (보충, #231 · PR #290 `c517fd5`)

| 파일 | 줄 수 | 내용 |
|---|---|---|
| `public/v41/views/track32-bookshelf.html` | 125 | **마크업 + 파일 연결만** (73,535 → 8,312 B) |
| `public/v41/views/shelf/shelf.css` | 168 | 변수·프레임·책장 레일·카드·표지 |
| `public/v41/views/shelf/shelf-reader.css` | 181 | 펼친 책(3D) 화면 |
| `public/v41/views/shelf/shelf-extra.css` | 46 | #256/#257 칸 제거·표지 정리 덧입히기(identity.css 뒤) |
| `public/v41/views/shelf/shelf.js` | 172 | 책장 화면 + 배선(`<script type="module">`) |
| `public/v41/views/shelf/shelf-reader.js` | 256 | 읽기 동작(펼침·장 넘김·끌기) — `createReader(deps)` |
| `public/v41/views/shelf/shelf-model.mjs` | 137 | 순수 계산(표지·이름·정보 줄·검색·카드 배치·페이지·YouTube ID·두 쪽 마크업) |

- **원칙 7**: 값·선택자·코드 순서 변경 0 — 파일 분리와 줄바꿈만. CSS 순서는 원래 자리 그대로(기본 → `reader-layout.css` → `identity.css` → 덧입히기).
- 2026-11-09 모듈화(`f42faa6`, PR #293): 계산은 `shelf-model.mjs`, 읽기 화면은 `shelf-reader.js`
  `createReader(deps)`로 나가고 `shelf.js`가 **실제 import**한다(#291 궤도와 같은 방식, `<script type="module">`).
  함수 시험 11건 = `tests/v41-shelf-flow.test.mjs`. 화면 동작을 고칠 때는 `shelf-reader.js`를 본다.
- 시험은 마크업 + 옮긴 파일을 합쳐서 본다(`v41-merge-bookshelf`·`v41-shelf-unify`·`v41-workspace-model`).
- 검증: 미리보기 겉모습 비교 **shelf 4장 0.000(동일)**, 운영 postdeploy `pass=17 fail=0`.

## 2026-11-08 기억책 파일 지도 (2단계 ①·②, ai/lt-book-source-261108 · ai/lt-book-inject-261108, #231)

기억책(track59)은 이제 화면 뼈대 + 네 파일이다. **고칠 때 어디를 보면 되는지**

| 파일 | 줄 수(대략) | 무엇이 들어 있나 |
|---|---|---|
| `public/v41/views/track59-sketchbook.html` | 35 | 마크업(책·페이지·상세·모달·목차)과 파일 연결만 |
| `public/v41/views/book/book.css` | 325 | 화면 고유 스타일(종이·표지·페이지·돋보기·패널·모바일) |
| `public/v41/views/book/book-usability.css` | 112 | 사용성 규칙 1~9(글꼴·상세 배치·다음 순간 안내·모바일) |
| `public/v41/views/book/book.js` | 79 | 본문 동작(스프레드·페이지 넘김·돋보기·상세·목차·갈림길) |
| `public/v41/views/book/book-extra.js` | 202 | 사용성 보조(제목 고치기·다음 순간 남기기·제자리 재생·트리 이름) |

- 주입 스크립트 `scripts/apply-book-usability.mjs`와 `public/v41/design/shared.js`는 **없앴다**. 화면이 위 네 파일을 직접 싣는다(`<link>`·`<script src>`, 모두 `/v41/` 절대 경로).
- 재생 단추는 `isPrimaryButton()`(`public/v41/book-usability.mjs`)을 거쳐 **왼쪽 클릭·탭에만** 반응한다(오른쪽·가운데 클릭은 브라우저 기본 동작 유지).
- 규칙(문구·판정 함수)은 계속 `public/v41/book-usability.mjs` 한 곳에 둔다 — 화면 파일에 규칙을 복사하지 않는다.

## 2026-11-08 안쪽 화면 원본은 `public/v41/views/` 한 벌 (ai/lt-views-single-path-261108, #231 ⑥)

1.5단계(두 벌 → 한 벌)를 마쳤다. **앞으로 안쪽 화면을 고칠 때는 `public/v41/views/`만 고친다.**

| 항목 | 지금 상태 |
|---|---|
| 셸 경로 | `public/v41/shell/navigation.mjs` `screenUrl()` — 예시·실제 기록 모두 `/v41/views/`, 첫 화면은 `/v41/home.html` |
| 화면 사본 | `public/v41/design/views/` **삭제**(orbit·bookshelf·network·pinboard·sketchbook 5개). `public/v41/design/shared.js`만 남음(예시 다리 시험용, 2단계 정리 대상) |
| 옛 주소 | `public/_redirects`: `/v41/design/views/* /v41/views/:splat 301` — 옛 공유 링크도 같은 화면으로 열린다 |
| 주입 | `scripts/apply-book-usability.mjs` 대상은 `public/v41/views/track59-sketchbook.html` 한 파일, 모듈 경로는 `/v41/book-usability.mjs`(두 번 돌려도 "변경 없음") |
| 자원 경로 | 다섯 화면 모두 `/v41/` 절대 경로라 어느 폴더에서 열어도 같은 파일을 쓴다 |
| 시험 | "두 벌 바이트 동일" → "`design/views/`에 화면 사본이 없음" 으로 교체(`tests/v41-merge-*.test.mjs`), `v41-shell-screens` 기대 경로 `/v41/views/` |
| 예시 분기 | 화면 코드에 `LTDEMO.example` 분기 없음 — network 1(재생 안내)만 남고 orbit·pinboard는 데이터 상태로 갈린다 |

## 2026-11-08 안쪽 화면 두 벌(views/ · design/views/) 조사 — 중복 아님 (ai/lt-refactor-views-dedupe-261108)
**결론: 두 벌은 같은 파일의 복사본이 아니라 서로 다른 변형(예시용·실제 기록용)이라, 한 벌로 합치면 동작·겉모습이 바뀐다. 이번 레인에서는 코드를 지우지 않았다.**

### 누가 어느 경로를 여는가
| 부르는 곳 | 경로 | 근거 |
|---|---|---|
| 셸 화면 이동 | 예시 모드(예시·파일·공유 기록)는 `design/views/<이름>.html`, 실제 기록(`source==='server'`)은 `views/<이름>.html` | `public/v41/shell.mjs:214` `show()`의 `source==='example'?'design/views/':'views/'` |
| 셸 첫 화면 | `home.html` | 같은 줄 |
| 셸 첫 여정 | `views/first-journey.html` (design 판본 없음) | `first-journey` 참조는 `public/v41/views` 쪽에만 존재 |
| 책 사용성 어댑터 | 두 벌 모두 주입 | `scripts/apply-book-usability.mjs:15-16` |
| 시험 | `views/`·`design/views/` 둘 다 읽음 | `tests/v41-book-usability.test.mjs:8`, `tests/v41-touch-targets.test.mjs:9-19`, `tests/v41-workspace-model.test.mjs:43` |
| 빌드·Pages | `public/`를 그대로 정적 복사(vite `publicDir`) → 두 경로 모두 배포됨 | `vite.config.js` |

### 왜 하나로 못 합치나
| 화면 | views/ 줄 | design/views/ 줄 | 다른 줄 | 차이의 성격 |
|---|---|---|---|---|
| src064-orbit.html | 228 | 226 | 32 | 예시는 `shared.js`, 실제는 `runtime.js` |
| track32-bookshelf.html | 895 | 872 | 95 | 기록 읽기·정렬·빈 상태가 서버 판에만 |
| track56-network.html | 191 | 195 | 24 | 예시 판은 고정 그래프 |
| track58-pinboard.html | 405 | 408 | 61 | 서버 판은 `member-reading-scroll`·실시간 갱신 |
| track59-sketchbook.html | 477 | 475 | 44 | 서버 판만 `runtime.js`·`LTDEMO` 실시간 선택, `.lt-media` 돋보기 예외 |

- 공통: `identity.css`·`reader-layout.css`·`labels.js`·`media-preview.js`·`view-navigation.js`는 두 벌이 같은 파일을 상대 경로만 다르게 부른다.
- 실제 기록 판본은 `parent.LT41`·`runtime.js`로 서버 데이터를 그리는 코드가 본문에 들어 있어, 예시 판본으로 통일하면 실제 계정 화면이 바뀐다(금지 조건: 동작·겉모습 변경 0).

### 다음에 합치려면 (선행 조건)
1. 셸의 경로 선택(`source==='example'`)을 한 벌로 바꾸는 결정 — `shell.mjs`는 다른 레인이 정리 중이라 이번 범위 밖.
2. 두 변형의 차이를 데이터·설정으로 흡수(예: `runtime.js` 유무를 런타임 분기로) — 동작 변경이라 별도 레인.
3. 그 뒤 `scripts/apply-book-usability.mjs`와 "두 벌 동기화" 시험을 한 벌 기준으로 바꾼다.

### 기준 스크린샷(현재 상태, 변경 없음)
- `/mnt/e/lt-refactor-shots/before-{home,shelf,book,board,network,journey}-{1440,390}-{night,garden}.png` (24장, 로그아웃 예시 모드)
- 예시 모드에서 실제로 불러온 화면 파일: `views/track32-bookshelf.html`, `views/track56-network.html`, `views/track58-pinboard.html`, `views/track59-sketchbook.html`, `first-journey`(셸 경유) — 예시 트리를 열면 `design/views/` 판본이 열린다(같은 하네스에서 확인).

## 2026-11-08 리팩터링 계획 문서 (#231, ai/lt-refactor-plan-doc-261108)
- 이유·원칙·단계별 계획: [REFACTOR_PLAN_20261108.md](REFACTOR_PLAN_20261108.md) · 추적 이슈 https://github.com/skerishKang/lovetree-4.0/issues/231
- 1-A(두 벌 조사, #230) 결과 위에 1-B(셸 모듈 분리)·1.5단계(두 변형 한 벌)·2단계(기억책)3단계(보드·지도) 순서를 적었다. 기능·문구·디자인 변경 0.

## 2026-11-09 사고: 순간 남기기(#write-menu) 연결 누락 — 로그아웃 검사가 못 잡는 자리 (PR #252, ai/lt-fix-write-menu-261108)

#245(e4c78f2)에서 셸을 모듈로 나눌 때 옛 `shell.mjs`(e508302) 460행의 `$('write-menu').onclick = () => openEditor(current==='track32-bookshelf.html'?'new':undefined)`가 어디에도 옮겨지지 않고 사라졌다. 같은 줄 뒤의 `[data-mode]` 연결만 `shell/panels.mjs`로 갔다. 운영에서 `document.getElementById('write-menu').onclick === null` — **로그인 상태에서만 보이는 버튼이라 로그아웃 기준 postdeploy·visual-baseline(24장)이 잡지 못했다.**

- 수정: `shell/panels.mjs`의 `[data-mode]` 연결 바로 아래에 원래 줄을 그대로 복구(`getCurrent` deps 사용). PR #252, 머지 `f08916f`.
- 확인: 미리보기 `typeof onclick` = `function`(수정 전 운영은 `object`=null), 머지 뒤 운영도 `function`, 운영 postdeploy `pass=17 fail=0`.
- 재발 방지: `tests/v41-shell-connections.test.mjs` — 리팩터링 전 셸이 연결하던 **39개 요소 id 목록**(e508302 기준)을 고정하고, 셸 전체(`shell.mjs` + `shell/*.mjs`)에 각 id 연결이 남아 있는지 본다. 연결을 지우면 그 id를 지목해 실패한다.
- 교훈: 모듈 분리 PR에서 `$('id').onclick=`처럼 **한 줄에 붙은 여러 연결**을 옮길 때는, 해당 줄 전체를 목록으로 만들어 대조해야 한다. 로그아웃 검사만으로는 로그인 전용 UI를 지킬 수 없다.

## 2026-11-08 셸 메시지·여정 분리 (#231 1-B③-3, ai/lt-refactor-shell-messages-261108, PR #247)
`shell.mjs` 384 → 330줄(35,443B, 500자 넘는 줄 9개). 공유·둘러보기·메시지 수신과 첫 여정 연결을 두 모듈로 나눴다.

- `public/v41/shell/messages.mjs`(234줄): `addEventListener('message', …)`의 `lt41-*` 분기 전부, 공유 패널(`sharePayload`·`shareFailure`·`renderShareList`·`loadShareList`·`invalidateSharePreview`·`openSharePanel`과 미리보기/만들기/복사 연결), 둘러보기(`mountCommunity` 연결·`onOpenShare`·`onShareOwn`·`onStartRecord`).
- `public/v41/shell/journey.mjs`(154줄): `journeyReply`·`writeJourneyLocation`·`noteJourneyStep`·`gotoJourneyStep`·`leaveJourney`·`finishJourney`·`openFirstJourney`·`saveFirstJourney`·`openJourneyBook`·`closeFirstJourney`와 그 상태(`journeyReturn`·`journeyStep`·`journeySaved`·`journeyRouteOpened`).
- 셸에 남긴 것: `applyBrowserLocation`(주소 → 화면), `showPublicRoute`·`publicProblem`(공유 읽기), `startMember`(로그인·세션), 얇은 래퍼(`openFirstJourney`·`saveFirstJourney`·`noteJourneyStep`·`gotoJourneyStep`·`leaveJourney`·`finishJourney`·`openJourneyBook`·`closeFirstJourney`·`openSharePanel`), `saved`는 `shellJourney.saved()`로 읽는다.
- 시험: `tests/v41-shell-messages.test.mjs` 12건(가짜 DOM·가짜 message 이벤트): 메시지 분기·출처 검증, 공유 미리보기 게이트·만들기·목록, 여정 저장 `member.apply(new→add)`·로그아웃 안내·history·뒤로가기. 글자 시험 6개 파일은 옮긴 파일을 함께 읽게 고쳤다. `npm test` 552건 515 pass/0 fail/37 skip, build pass.
- 남은 것: 셸 대화상자 Tab 순환·Esc 복귀(접근성)는 `shell.mjs`에 남아 있다.

## 2026-11-08 셸 패널 분리 (#231 1-B③-2, ai/lt-refactor-shell-panels-261108, PR #245)
`shell.mjs` 413 → 384줄. 순간 패널·편집기·책 정보를 `public/v41/shell/panels.mjs`(268줄)로 그대로 옮겼다.

- 옮긴 것: `setEditorMode`·`openEditor`·`updateTreeCoverHint`·`openTreeManager`·`updateMediaPreview`·`updateQuickEntryHint`, 폼 상태(`formDirty`·`treeDirty`·`parentDirty`·`parentValue`)와 그 기준값(`editorMode`·`formBaseline`·`parentBaseline`·`treeBaseline`·`parentChoice`), `moment-form`·`tree-form`·`editor`·`[data-mode]` 연결.
- 셸에 남긴 것: `panel()`·`backup`·`openAssets`·`usePrivateAsset`(계정·보관 파일 성격), 얇은 래퍼 `openEditor`·`updateMediaPreview`·`updateQuickEntryHint`·`formDirty`·`treeDirty`.
- 시험: `tests/v41-shell-panels.test.mjs` 8건(가짜 DOM 함수 직접 호출). 글자 시험은 옮긴 파일을 함께/대신 읽게 고쳤다. `npm test` 540건 503 pass/0 fail/37 skip, build pass.
- 미리보기 `https://c1b66c19.lovetree-4-0.pages.dev/v41/` postdeploy: visual 6/6 pass, page 오류 0, fail 2건은 모두 미리보기 Functions 503(`storage_unavailable`) — `/api/community/shares`·`/api/youtube/oembed`가 미리보기에서 503, 운영에서는 200/401(curl 확인).
- 남은 것: 공유·둘러보기·`lt41-*` 메시지 수신 → `shell/messages.mjs`, 첫 여정 연결.

## 2026-11-08 셸 모듈 지도 (#231 1-B, 브랜치 ai/lt-refactor-shell-261108)
`public/v41/shell.mjs`(약 480줄)를 기능별 모듈로 나눈다. 동작·겉모습·이름·저장 키는 그대로다.

| 기능 | 파일 |
| --- | --- |
| 화면 목록·경로 선택(예시 → `design/views/`, 실제 기록 → `views/`)·테마 대상 계산 | `public/v41/shell/navigation.mjs` (분리 완료) |
| 테마 적용·표시(테마 버튼, 로그인 링크 href) | `public/v41/shell/theme.mjs` (분리 완료) |
| 화면 전환·iframe 두 장 교대(#219·#211)·도착 표시·화면 클릭 위임 | `public/v41/shell/screens.mjs` (분리 완료) |
| 헤더 상태·탭·트리 선택(#222)·탭 페이드·계정 메뉴(`flowNavigation`·`updateNavFade`·`revealCurrentTab`·`renderAccount`·`openAccountMenu`·`closeAccountMenu`·`loadAccountEmail`·`updateAccountControls`) | `public/v41/shell/header.mjs` (분리 완료) |
| 로그인 시작·의도(pendingLoginIntent)·401·만료 연결(#215·#218·#227·#144 안내 줄) | `public/v41/shell/auth.mjs` (분리 완료) |
| 순간 패널·편집기(추가/수정 모드·폼 기준값·저장 연결)·책 정보 관리 | `public/v41/shell/panels.mjs` (분리 완료) |
| 첫 여정(진입·저장·단계 history·뒤로가기) | `public/v41/shell/journey.mjs` (분리 완료) |
| 공유 패널·둘러보기 연결·`lt41-*` 메시지 수신(window message) | `public/v41/shell/messages.mjs` (분리 완료) |
| 접근성·포커스(#204) — 셸 대화상자 Tab 순환, Esc 복귀 | `shell.mjs` (`view-a11y.mjs`와 함께) |

- `shell.mjs`는 진입점으로 남기고, 옮긴 이름(`themedView`·`applyTheme`·`toggleTheme`·`screens` 등)은 얇은 래퍼·재수출로 유지한다.
- 기준 스크린샷(`/mnt/e/lt-refactor-shots/before-*.png` 24장) 대비: 헤더 상단 80px 차이 0(18장), 완전 동일 6장. 나머지 차이는 iframe 안쪽 카드 회전·관계 지도 배치의 촬영 시점 차이.
- **겉모습 비교(2026-11-08)**: `미리보기 검사`가 `tools/visual-baseline`로 **운영(before) vs PR 미리보기(after)** 24장을 비교해 PR 체크 요약에 장별 차이 %를 표로 남긴다. **알림만** 하고 실패로 만들지 않는다(기준 초과는 "확인 필요"). diff 이미지는 artifact.

## 2026-11-15 — 새 소식·AI 테스터 표시·내 의견 손질 (#611, 컴1 레인, ai/com1-lt611-updates-261115 + ai/com1-lt611-b-261115, main 9bbb193 기준, PR #621 → main 9bbb193, PR #622 → main 4b7fd36)

- **새 소식 원본**: `public/v41/updates.json` + 화면 `public/v41/updates.mjs` + `AGENTS.md` 한 줄 규칙 "새 소식 원본은 public/v41/updates.json … 다음 버전 항목 한 줄". 알림은 "접속 때 한 번" — 첫 화면에서만 띄우고 닫으면 그 버전은 다시 안 뜸(브라우저 저장, 서버 없음). 로그아웃에도 뜸. 연결용 `issue` 필드는 화면 문구에 나오지 않음.
- **첫 버전 4.1.3(2026.11.14)**: 핀보드·책·지도·첫 화면·공개·공유 미리보기 카드 + 새벽 날짜·'오늘-어제'·작은 글씨. 고친 것(3건) 전부 AI 테스터 윤제 출처. 화면 문구에 이슈번호·개발용어·"여러분이 알려 주신" 없음(시험으로 금지어 검사).
- **AI 테스터 표시**: ai_customer 역할 기록이 남에게 보이는 곳(둘러보기 카드·감상 허브 미리보기·공유 /t/<id> 화면·미리보기 카드(og) 설명 '· AI 테스터')에만 `aiTester: true` 비트. 서버 공개 응답(community discover·public share)에 계정 정보 0(시험으로 확인). 본인 화면엔 표시 없음. 운영센터는 이름 앞 'AI'(목록·상세·일지 탭).
- **내 의견**: 새 답글 알림은 계정 단추 점 + '내 의견' 옆 숫자(안 본 답글만, 열어 보면 사라짐 — 브라우저 `lt41.replySeen` 저장). 고객 덧붙이기: 본인 의견 아래 '덧붙일 말' 칸 — 저장 모양은 기존 답글(authorType=customer)이라 운영센터에 '고객 덧붙임'으로 보임, 고침·닫음이면 '다시 열림'(reviewing). 남의 글·일지는 404. '새 소식에도 올렸어요 — 4.1.3 보기' 링크는 의견의 연결 이슈와 updates.json의 issue 매칭(고침·닫음 상태일 때만).
- **ops-reply --status-only**: 답변 파일 없이 상태·연결 이슈만 — 답글이 이미 있어도 처리. 컴2 고정 위치(/opt/padiem/lovetree-api/tools/ops-reply.mjs)사본은 머지 뒤 수동으로 최신으로 교체함(autodeploy 설치 대상 아님).
- **트러블슈팅**: (1) 서버 index.js에서 shareService가 admin보다 먼저 생성돼 Deploy Bundle Boot에서 `Cannot access 'admin' before initialization` — CI가 잡아 admin 선언을 위로 이동(c270d90). (2) 헤더 토큰 시험이 CSS 끝부분(#0008·주석 #611 hex 오인)에서 실패 — 알림 카드 배경을 토큰으로, 주석 '이슈 611'로 고침. (3) 지도 판 흐름 시험에서 알림 카드가 '#overviewBtn'을 가려 막힘 — 알림은 첫 화면에서만.
- **배포**: Pages 자동 배포. 서버는 A·B 두 번 autodeploy — 최종 installed_sha 4b7fd36 확인(2026-11-14 14:05). content-reports 자동메시지 머지는 일정 때문에 생김(별도 이슈).
- **실측**: 계정 02 배포본 로그인 — 390·1440 첫 화면 알림 카드+새 소식 창 확인, 둘러보기 카드 2건 중 1건 aiTester 실측, 공개 공유 읽기 aiTester:true 실측. 스크린샷 `E:\lovetree-qa\611\`(home·updates-panel·signed-in·community·share-ai). postdeploy 로그인: fail=0 warn=4(390·360 겹침 5쌍 — 4 쌍은 커뮤니티 패널 기존 것, 1 쌍은 알림 닫기×둘러보기 닫기가 모달 가림상자 겹침).
