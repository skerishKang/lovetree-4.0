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

### 2) 제품 코드를 고쳐야만 바꿀 수 있는 것 (16건) — 동작이지만 지금은 함수 호출 불가

| 파일 | 건수 | 왜 못 바꾸나 | 필요 작업 |
| --- | --- | --- | --- |
| `v41-home-view-menu.test.mjs` | 14 | `v41/home.js`는 **shadow DOM 페이지 스크립트**: `import '../src/styles.css'`(node 불가) + 최상위에서 바로 DOM을 만든다. 메뉴 열기/닫기·키보드 배선·바깥 클릭·`aria-*`가 모두 인라인 | `home.js`에서 `createViewMenu(deps)`를 `public/v41/home-view-menu.mjs`로 추출(패널·대화상자와 같은 방식) → 새 표로 전환 |
| `v41-home-view-menu.test.mjs` | 2 | `src/views/orbit.js`의 `dispose.motion` 게터/세터와 `viewButton.dataset.ltViewMenu` 배선 | 위 추출에 포함해 함께 시험 |
| `v41-journey-history.test.mjs` | 8 | `views/first-journey.html` **인라인 스크립트**(내보낸 함수 없음) | 페이지 스크립트를 `first-journey-page.mjs`로 분리 |

→ **"바꿔야 함"(지금 당장 바꿀 수 있는 동작 검사): 0건.** 남은 16건은 위처럼 **제품 코드 추출이 선행 조건**이다. 추출은 "동작·복사·디자인 변경 0"을 지키기 어려운 별도 레인이라 여기서 하지 않았다.

## 새 시험을 쓸 때

1. 확인하려는 것이 **동작**(분기·호출·응답·포커스 이동)이면 → 그 함수를 `import`해 직접 부르고 인자·반환·부수효과를 본다.
2. 확인하려는 것이 **마크업·CSS 값·문구**면 → 소스 글자 검사로 둔다(이때도 `assert.match`에 **이유**를 적는다).
3. 상태가 여러 개면 **표로 묶는다**(예: `v41-header-flow` 상태 4 × 화면 5, `v41-panels-flow` openEditor 6행, `v41-home-view-menu` 로그인 × 테마 × 멈춤 × 카드 8행).
4. 새 시험을 붙였으면 **한 곳을 일부러 깨뜨려 실패하는지** 확인하고 되돌린다(강도 증명). 통과하면 그 시험은 약하다.
5. 가짜 DOM은 `tests/helpers/fake-dom.mjs`를 늘려 쓴다 — 파일마다 새로 만들지 않는다.
6. **페이지 스크립트에만 있는 동작**은 글자 검사에 남기고, 그 줄 수를 이 문서에 적는다(지금 16건).
