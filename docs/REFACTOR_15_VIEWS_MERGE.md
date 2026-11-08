# 1.5단계 설계 조사 — 안쪽 화면 두 벌을 한 벌로 (2026-11-08)

추적 이슈: #231 · 선행 조사: #230(두 벌은 중복이 아니라 변형) · 계획: [REFACTOR_PLAN_20261108.md](REFACTOR_PLAN_20261108.md)

코드 변경 없는 설계 문서다. `public/v41/` 아래 파일은 이번 레인에서 한 줄도 바꾸지 않았다.

## 0. 지금 상태(한 줄)
| 판본 | 누가 여는가 | 스크립트 | 특징 |
|---|---|---|---|
| `public/v41/design/views/` | 예시·파일·공유 기록(`source==='example'`) | `shared.js`(예시 데이터) | 정적 예시, 실시간 갱신 없음 |
| `public/v41/views/` | 실제 기록(`source==='server'`) | `runtime.js`(+`media-preview.js`) | `parent.LT41` 실시간 선택, 읽기 스크롤, 돋보기 예외 |

경로 선택 지점은 한 곳뿐이다: `public/v41/shell/navigation.mjs:29` `screenUrl()` — `source === 'example' ? 'design/views/' : 'views/'`.

## 1. 화면별 차이(전부)

### 1-1. src064-orbit.html (첫 화면 궤도) — 5덩어리, ±17/15줄
| 차이 | 종류 | 내용 |
|---|---|---|
| `shared.js` → `runtime.js` | (a) | 예시는 `shared.js`, 실제 기록은 `runtime.js` |
| `BASE_CARDS` 고정 배치 + `escapeRecord` 이스케이프 | (d)(e) | 실제 기록 판본은 카드 배치 기본값을 코드에 두고 제목·날짜를 이스케이프 |
| `CARDS=LTDEMO.moments.map(...)` 조립 | (b) | 실제 기록은 런타임 데이터로 카드 생성(첫 카드 메뉴 라벨도 갱신) |
| 이전 순간 판정 `LTDEMO.edges` 기반 | (b) | 예시 판본은 `x.next===id || x.branch===id` |
| `continuePath`·`branchMarkup` 차이 | (b)(d) | 실제 기록은 미디어 뷰어 닫기·연결 요약을 런타임 데이터로 |

### 1-2. track32-bookshelf.html (내 책장) — 15덩어리, ±59/35줄
| 차이 | 종류 | 내용 |
|---|---|---|
| `runtime.js` + `media-preview.js` | (a) | 실제 기록 전용 |
| 표지·제목 이스케이프(`escapeRecord`) | (e) | 사용자 입력을 그대로 넣지 않음 |
| 정렬·필터·개수 표시가 런타임 목록 기준 | (b) | 예시는 고정 목록 |
| 빈 상태 문구·개수 문구 분기 | (d) | 3곳 |
| `parent.LT41` 연동(선택 동기화) | (b) | 양쪽 모두 1곳 있으나 사용 방식이 다름 |

### 1-3. track56-network.html (관계 지도) — 6덩어리, ±10/13줄
| 차이 | 종류 | 내용 |
|---|---|---|
| `runtime.js` + `media-preview.js` | (a) | — |
| 좌측 범례 제목 `주요 경로 그룹` → `순간 위치 그룹` | (d) | **문구 차이(겉모습)** |
| 작은 트리(≤36개)일 때 클러스터 세로 배치·범례 숨김 보정 | (c) | 실제 기록 데이터 크기 대응 |
| `startPlayback` 안내 문구(`경로 안의 순간` → `순간`)와 실제 연결 안내 | (d) | **문구 차이(겉모습)** |
| `drawEdge`/`edgeAlpha` 모바일 분기 | (c)(e) | — |

### 1-4. track58-pinboard.html (기억 보드) — 10덩어리, ±28/32줄
| 차이 | 종류 | 내용 |
|---|---|---|
| `runtime.js` + `media-preview.js` | (a) | — |
| `example` 문자열 분기 6곳 | (b)(d) | 예시/실제 문구·동작 분기 |
| 실·핀 좌표 기본값(하드코딩 배치) vs 런타임 배치 | (b) | 실제 기록은 데이터에서 좌표 계산 |
| 빈 상태·개수 안내 | (d) | — |
| `LTDEMO.select` 호출 2곳 동일 | (b) | — |

### 1-5. track59-sketchbook.html (기억책) — 7덩어리, ±23/21줄
| 차이 | 종류 | 내용 |
|---|---|---|
| `runtime.js` + `media-preview.js` | (a) | — |
| `member-reading-scroll` 스타일 블록(500자 노트 스크롤) | (c) | 실제 기록 전용 |
| 페이지 조립에서 `b=moments[i*2+1]` → 없으면 합성 `companion` 페이지 | (c) | 홀수 개 기록 대응 |
| `synthetic` 분기 8 → 10곳 | (c) | 합성 페이지에서 제목·메타 숨김 |
| `finishTurn`에서 `LTDEMO.select(...)` 호출 | (b) | 실제 기록은 선택 상태를 부모와 동기화 |
| 돋보기에서 `.lt-media` 위에서는 숨김 | (c) | 실제 기록 미디어 위 예외 |
| `connectionSummary`가 `LTDEMO.edges` 사용 | (b) | 예시는 `next`/`branch` 필드 |
| 연결 이유 기본 문구 `연결 이유 · CONNECTION` → `이어진 마음` | (d) | **문구 차이(겉모습)** |

### 1-6. 공통(5쌍 전부)
- 상대 경로 깊이: `../` vs `../../`(`identity.css`, `reader-layout.css`, `labels.js`, `mobile-moments.js`, `view-navigation.js`) — (e) 단순 경로.
- `views/`에만 `media-preview.js`(5/5), `runtime.js`(5/5). `design/views/`에만 `shared.js`(5/5).

## 2. 실제 기록 판본 하나로 합칠 때의 흡수 방법

| 차이 종류 | 흡수 방법 | 예시 화면 겉모습 변화 |
|---|---|---|
| (a) 스크립트 | `runtime.js`만 남기고, 예시 모드에서는 `shared.js`가 하던 "예시 데이터 주입"을 `runtime.js`가 `source==='example'`일 때 대신 수행 | 없음(데이터 출처만 다름) |
| (b) `parent.LT41` 실시간 연결 | 코드는 그대로 두고, 예시 모드에서는 부모가 선택 이벤트를 보내지 않으면 무동작(이미 그렇게 동작) | 없음 |
| (c) 실제 기록 전용 동작(읽기 스크롤·합성 페이지·돋보기 예외·작은 트리 보정) | 조건을 `source==='example'`이 아니라 **데이터 상태**(노트 길이, 홀수 개수, 미디어 유무, 트리 크기)로 바꿔 두 모드가 같은 코드를 타게 | 없음 — 단, 예시 데이터가 그 조건에 걸리면 동작이 생김(현재 예시 데이터는 500자 노트·홀수 개수 없음 → 확인 필요) |
| (d) 문구·스타일 | **실제 기록 판본 문구를 기준**으로 통일 | **있음(4곳)**: 관계 지도 범례 제목·재생 안내, 기억책 연결 이유 문구, (보드 예시 분기 문구) |
| (e) 경로·이스케이프 | `views/` 깊이로 고정, 이스케이프는 항상 적용 | 없음 |

합칠 때 필요한 런타임 분기는 **`runtime.js` 안의 `source==='example'` 한 곳**(예시 데이터 로딩)뿐이며, 화면 HTML에는 모드 분기를 남기지 않는다.

## 3. 셸 쪽 영향
- `public/v41/shell/navigation.mjs:29` `screenUrl()`의 `source === 'example' ? 'design/views/' : 'views/'` → `'views/'` 한 줄로. **이 함수 하나만 바꾸면 된다**(셸의 다른 곳은 경로를 만들지 않음, `screens.mjs:131`이 유일한 호출부).
- 함께 볼 것: `screenUrl`을 시험하는 테스트(경로 기대값), `scripts/apply-book-usability.mjs`(두 벌 주입 → 한 벌), `tests/v41-book-usability.test.mjs:8`·`tests/v41-touch-targets.test.mjs:9-19`·`tests/v41-workspace-model.test.mjs:43`(두 벌 참조).
- `design/views/`를 지우면 Pages의 옛 주소(`/v41/design/views/...`)가 404가 된다. 예시 모드가 `views/`로 바뀌므로 사용자 경로에는 영향이 없지만, 외부에 공유된 옛 주소가 있으면 리다이렉트가 필요하다(확인 필요).

## 4. 합치는 순서(위험 작은 화면부터)와 예상 PR 크기
| 순서 | 화면 | 이유 | 예상 변경 |
|---|---|---|---|
| 1 | **track56-network** | 차이 6덩어리·±23줄, 캔버스라 DOM 영향 작음 | `views/` 1파일 + `design/views/` 삭제 + 시험 1~2개, ~60줄 |
| 2 | **src064-orbit** | 차이 5덩어리, 첫 화면이라 회귀 위험은 중간 | ~70줄 |
| 3 | **track58-pinboard** | `example` 분기 6곳 정리 필요 | ~90줄 |
| 4 | **track32-bookshelf** | 차이 최대(±94줄), 정렬·필터·빈 상태 | ~140줄 |
| 5 | **track59-sketchbook** | 합성 페이지·읽기 스크롤·돋보기·`LTDEMO.select`가 얽힘 | ~150줄 |
| 6 | 셸 경로 한 줄 + `design/views/` 삭제 + 어댑터/시험 정리 | 마지막에 한 번 | ~80줄 |

각 PR은 앞의 "원칙 3"대로 같은 조건 스크린샷 비교(`tools/visual-baseline`, board 0.3%·나머지 0.1%)와 `npm test`·build·postdeploy fail 0을 통과해야 한다.

## 5. 남은 확인 거리 (2026-11-08 ①network 확인 완료)
1. **확인함** — 예시 트리는 40개 순간(>36)이라 작은 트리 보정(`≤36`)이 걸리지 않고, 500자 노트·홀수 개수도 없어 (c) 조건에 걸리지 않는다. 예시 데이터 40개·짝수라 합성 페이지 분기도 타지 않는다. 상세 패널도 미디어 블록이 생기지 않음을 확인(`#detailNote` 형제 구성 동일, `.lt-media` 없음).
2. **확인함** — 공유 링크는 `#share/...` 형식이라 옛 `design/views/` 주소에 의존하지 않는다.
3. **확인함** — `runtime.js`에 `tree.demoData` 분기를 넣어 예시 모드에서 처음 돌 때도 초기화 순서 문제가 없다(예시 40개 노드·`example:true` 확인, 화면 문구·DOM 동일).

## 6. 진행 결과
| 화면 | 상태 | 비고 |
|---|---|---|
| track56-network | **완료(#231, PR #246, `b94b3be`)** | 두 벌 바이트 동일, 자원 경로 `/v41/` 절대, `LTDEMO.example`로 재생 안내 분기. 예시 겉모습 변화는 범례 제목 1곳(설계서 (d) 항목) |
| src064-orbit | **완료(#231, PR #247, `b38afd1`)** | 두 벌 바이트 동일, 경로 `/v41/` 절대. `BASE_CARDS` 기본 배치·카드 개수 표시·목록 번호·이어가기 갈래 선택·책으로 보기는 `LTDEMO.example`로 갈라 **예시 겉모습·동작 그대로(홈 4장 차이 0)** |
| 나머지 3화면 | 예정 | 순서대로 pinboard → bookshelf → sketchbook |

