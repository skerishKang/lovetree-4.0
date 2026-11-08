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
| `tests/v41-shell-dialogs.test.mjs` · `v41-shell-location.test.mjs` | Tab 순환·Esc·포커스 복귀·주소 처리 |

## 남은 글자 검사 분류 (2026-11-09 기준 111건 / 22파일)

기준: `assert.match(<소스 변수>, /…/)` 로 **파일 글자를 보는 줄**의 수.

### A. 유지 — 마크업·CSS 값·문구 자체를 고정한다

| 파일 | 건수 | 무엇을 보나 | 왜 글자 검사가 맞나 |
| --- | --- | --- | --- |
| `v41-theme-ab.test.mjs` | 11 | 테마 색 토큰·대비 | CSS 값 자체가 요구사항(색·대비). 함수로 바꿔도 결국 문자열 비교 |
| `test_mobile_text_floor_261102.test.mjs` | 7 | 글자 크기 하한 | CSS 값 |
| `v41-journey-night`·`v41-journey-garden` | 29+9 | 밤·정원 여정의 색·모양·버튼 규격 | CSS 값 |
| `v41-shelf-unify`·`v41-community`·`v41-auth-skin`·`v41-asset-reattach`·`v41-media-preview`·`v41-refresh-gate`·`domain-routing`·`shared-auth-pages`·`cross-repo-chain` | 22 | 마크업 구조·엔드포인트 문자열·파일 배치 | 구조/계약 문자열 확인 |
| `v41-first-journey`(11)·`v41-moment-panel`(7)·`v41-a11y-views`(3)·`v41-header-tabs-mobile`(1)·`v41-header-ia`(7)·`auth-entry`(7)·`v41-shell-tree-title`(11)·`v41-header-states`(2)·`v41-workspace-model`(2)·`v41-share-api`(2) | 53 | 화면 마크업·토큰·정렬·`data-*` 훅 | 화면 구조와 값 |

### B. 남은 동작 검사 — 함수 시험으로 바꿔야 함

| 파일 | 건수 | 성격 |
| --- | --- | --- |
| `v41-journey-history.test.mjs` | 18 | 뒤로/앞으로·주소 복원 배선 → `createJourney`+`createLocation` 하네스로 (3차에서 만든 `v41-journey-flow`에 표만 늘리면 됨) |
| `v41-home-view-menu.test.mjs` | 16 | 메뉴 열기/닫기·키보드(Esc·화살표)·바깥 클릭 배선 — `v41/home.js`가 shadow DOM이라 가짜 문서 하네스가 더 필요 |

**남은 동작 검사: 34건 / 2파일.** 나머지 77건은 마크업·CSS 값이라 유지한다.

## 새 시험을 쓸 때

1. 확인하려는 것이 **동작**(분기·호출·응답·포커스 이동)이면 → 그 함수를 `import`해 직접 부르고 인자·반환·부수효과를 본다.
2. 확인하려는 것이 **마크업·CSS 값·문구**면 → 소스 글자 검사로 둔다(이때도 `assert.match`에 **이유**를 적는다).
3. 상태가 여러 개면 **표로 묶는다**(예: `v41-header-flow`의 상태 4 × 화면 5, `v41-panels-flow`의 openEditor 6행).
4. 새 시험을 붙였으면 **한 곳을 일부러 깨뜨려 실패하는지** 확인하고 되돌린다(강도 증명). 통과하면 그 시험은 약하다.
5. 가짜 DOM은 `tests/helpers/fake-dom.mjs`를 늘려 쓴다 — 파일마다 새로 만들지 않는다.
