# 시험 작성 원칙 (LoveTree 4.0)

> **동작은 함수 호출로, 마크업·CSS 값만 글자 검사.**
> 새 시험을 쓸 때 소스 파일을 읽어 정규식으로 확인하는 것은 **마크업 구조·CSS 값·문구 자체**를 고정할 때만 쓴다.
> "이 코드가 이렇게 동작한다"를 확인하려면 **그 함수를 직접 불러 결과를 본다.**

## 왜

2026-11-08 셸 리팩터링(#231)에서 `shell.mjs`를 모듈로 옮기는 동안, 소스 글자만 보던 시험들이 **전부 통과했는데도 운영에서 '순간 남기기'가 무반응**이었다(#245 → #252). 글자 시험은 함수가 실제로 불리지 않아도, 연결이 빠져도, 조건이 뒤집혀도 통과한다.

그래서 옮긴 함수마다 **직접 호출 시험**을 붙이고(#241·#245·#250), 글자 시험을 하나씩 함수 시험으로 바꿔 왔다(#268·#270·#271·#273·이번).

## 공용 도우미

| 파일 | 쓰임 |
| --- | --- |
| `tests/helpers/fake-dom.mjs` | `fakeEl`·`fakeNav`·`fakeTabButton`·`createHeaderHarness` — 셸·헤더 시험용 최소 가짜 DOM |
| `tests/v41-journey-flow.test.mjs` | `createJourney` 하네스(가짜 history/location/iframe) |
| `tests/v41-panels-flow.test.mjs` | `createPanels` 하네스(편집기 폼·업로드·모드 표) |
| `tests/v41-view-a11y-flow.test.mjs` | `applyViewAccessibility` 하네스(가짜 문서 + keydown 실제 전송) |
| `tests/v41-home-view-menu-flow.test.mjs` | `createViewMenu` 하네스(가짜 shadowRoot·문서·저장소, 메뉴 열기/키보드/선택) |
| `tests/helpers/fake-dom.mjs` `fakeBrowser()` | 가짜 `location`·`history`(push/replace/go) + `popstate`·`hashchange` 실제 발생 |
| `tests/v41-shell-dialogs.test.mjs` · `v41-shell-location.test.mjs` | Tab 순환·Esc·포커스 복귀·주소 처리 |

## 글자 검사 최종 분류 (2026-11-09 7차, 101건 / 22파일)

기준: `assert.match(<소스 변수>, /…/)` 로 **파일 글자를 보는 줄**의 수. 7차까지 47건을 함수 시험으로 바꿨다(148 → 101).

### 1) 유지 — 마크업·CSS 값·문구 (85건)

| 파일 | 건수 | 무엇을 보나 |
| --- | --- | --- |
| `v41-theme-ab.test.mjs` | 11 | 테마 색 토큰·대비(색 값 자체가 요구사항) |
| `test_mobile_text_floor_261102.test.mjs` | 7 | 글자 크기 하한 |
| `v41-journey-night`(29)·`v41-journey-garden`(9) | 38 | 밤·정원 여정의 색·버튼 규격·대비 |
| `v41-first-journey`(11)·`v41-moment-panel`(7)·`v41-header-tabs-mobile`(1)·`v41-header-ia`(7)·`auth-entry`(7)·`v41-shell-tree-title`(11)·`v41-header-states`(2)·`v41-workspace-model`(2)·`v41-share-api`(2)·`v41-a11y-views`(3)·`v41-journey-history`(8) | 61 | 화면 마크업·토큰·정렬·`data-*` 훅·인라인 스크립트 문자열 |
| `v41-shelf-unify`(4)·`v41-community`(3)·`v41-auth-skin`(3)·`v41-asset-reattach`(5)·`v41-media-preview`(1)·`v41-refresh-gate`(1)·`domain-routing`(1)·`shared-auth-pages`(1)·`cross-repo-chain`(1) | 20 | 구조·엔드포인트·파일 배치 같은 계약 문자열 |

### 2) 2026-11-11에 해소된 항목 — 보기 메뉴(16 → 1)

`v41/home.js`의 인라인 메뉴 로직을 `public/v41/home-view-menu.mjs` `createViewMenu(deps)`로 옮겨 **15건을 함수 시험으로 전환**했다(`tests/v41-home-view-menu-flow.test.mjs` 8건). 남은 1건은 "첫 화면은 모듈을 연결만 한다"는 구조 검사다.

### 3) 2026-11-09에 해소 — 첫 여정 인라인 스크립트(8 → 0)

`views/first-journey.html`의 인라인 모듈을 `public/v41/views/journey/journey-page.mjs` `createJourneyPage(env)`로 옮겨 **8건을 함수 시험으로 전환**했다(`tests/v41-journey-page.test.mjs` 9건). HTML은 연결 3줄만 남았다.

→ **"제품 코드 필요" 0건. "지금 바꿀 수 있는 동작 검사" 0건 — 시험 전환 작업 완료.** 남은 글자 검사는 모두 **마크업·CSS 값·문구·구조**라 유지 사유가 있다(위 1번 표).

## 새 시험을 쓸 때

1. 확인하려는 것이 **동작**(분기·호출·응답·포커스 이동)이면 → 그 함수를 `import`해 직접 부르고 인자·반환·부수효과를 본다.
2. 확인하려는 것이 **마크업·CSS 값·문구**면 → 소스 글자 검사로 둔다(이때도 `assert.match`에 **이유**를 적는다).
3. 상태가 여러 개면 **표로 묶는다**(예: `v41-header-flow` 상태 4 × 화면 5, `v41-panels-flow` openEditor 6행, `v41-home-view-menu` 로그인 × 테마 × 멈춤 × 카드 8행).
4. 새 시험을 붙였으면 **한 곳을 일부러 깨뜨려 실패하는지** 확인하고 되돌린다(강도 증명). 통과하면 그 시험은 약하다.
5. 가짜 DOM은 `tests/helpers/fake-dom.mjs`를 늘려 쓴다 — 파일마다 새로 만들지 않는다.
6. **페이지 스크립트에만 있는 동작**은 글자 검사에 남기고, 그 줄 수를 이 문서에 적는다(지금 16건).
7. 페이지 스크립트를 모듈로 뺄 때는 **CSS import·최상위 DOM 생성 없이** `create...(deps)` 형태로 내보낸다(보기 메뉴가 그 예).
- **겉모습 비교(2026-11-08)**: `미리보기 검사`가 **PR 기준 커밋(merge-base)의 Cloudflare Pages 배포본(before)** vs **PR 미리보기(after)** 24장을 비교해 체크 요약에 장별 차이 %를 표로 남긴다. 기준 커밋 배포 주소를 못 찾으면 운영으로 대체하고 "차이에 다른 PR 변경이 섞였을 수 있음"을 표시한다. **알림만** 하고 실패로 만들지 않는다(기준 초과는 "확인 필요"). diff 이미지는 artifact.

