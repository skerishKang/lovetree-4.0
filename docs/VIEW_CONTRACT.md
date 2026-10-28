# 화면 연결 계약 (제안)

`#65`(구조 확장) 첫 조각. `#66` `docs/EXTENSION_ROADMAP.md`의 "B. 화면 연결 기반"을 실제 코드로 옮기기 전에, 기존 구현을 비교하고 최소 계약만 정한다. 이 문서는 구현 상태를 함께 적는다 — 제안과 구현을 섞지 않는다.

## 1. 리모네에서 확인한 공통 연결

- `app/components/TreeViewShell.tsx` — 화면 공통 shell. props: `treeId`, `activeView`, `momentId`, `isOwner`, `onAddMoment`, `userLabel`. shell이 상단 메뉴·보기 전환 바·소유자용 `+ 새 순간`을 소유하고, 화면(children)은 본문만 그린다.
- `app/components/ViewSwitcher.tsx` — 보기 목록과 주소 규칙. `/trees/<treeId><viewPath>?moment=<momentId>`로 **같은 트리의 다른 보기**를 오가고, 선택한 순간을 쿼리로 실어 나른다. `ownerOnly` 보기(studio)는 소유자에게만 노출한다.
- 시사점: 트리 하나를 여러 표현으로 보는 구조에서 (a) 선택(momentId)은 주소가 소유하고, (b) 화면 전환은 shell이 제공하며, (c) 편집 노출은 `isOwner` 하나로 갈린다.

## 2. 현재 4.0 세 화면 비교

| 항목 | 궤도(`orbit.js`) | 책장(`shelf.js`) | 기억책(`book.js`) |
| --- | --- | --- | --- |
| 입력 | `trees` 전체, `example` | `trees` 전체, `view`(가변), `error`, `recovery` | `tree` 하나, `selectedId`, `demo` |
| 선택 | 내부 `focus()`만, 외부 선택 없음 | 내부 `selection` + `view.selectedId` + `localStorage`(`shelf-selection`) | `selectedId`(읽던 위치) + 내부 페이지 `index` |
| 이동 | 카드 클릭·드래그(위상), `onBook`/`onWorkspace` | 좌우 화살표·드래그·방향키, `onBook`/`onWorkspace` | 좌우 방향키·페이지 넘김, `onHome`/`onShelf`/`onWorkspace` |
| 쓰기 | `remember()`로 읽던 위치 기록 | 선택 id를 `localStorage`에 직접 기록 | `remember()`로 읽던 위치 기록 |
| mount | `attachShadow` + `AbortController` | `attachShadow` + `AbortController` | `attachShadow` 만 |
| dispose | `abort.abort()` + `cancelAnimationFrame` + `dialog.close()` | `abort.abort()` + `ResizeObserver.disconnect()` | `modal.close()` 만(이벤트 정리 없음) |
| 읽기 전용 | `example` | 없음(항상 편집 노출) | `demo` |

차이의 실질적 위험은 셋이다.

1. **dispose 규율이 화면마다 다르다** — 기억책은 이벤트를 정리하지 않고, 궤도·책장은 각자 다른 목록을 손으로 정리한다. 지금은 `render()`가 `#app`을 통째로 갈아 끼워 우연히 안전하지만, 화면을 재사용하거나 지연 로딩하면 곧바로 새는 지점이 된다.
2. **선택의 주인이 셋으로 갈렸다** — `main.js`의 `selectedId`, 책장 내부 `view.selectedId`+저장소, 기억책의 읽던 위치. 같은 트리를 다른 표현으로 볼 때 선택을 이어 붙일 단일 규칙이 없다.
3. **읽기 전용 표시가 화면마다 다른 이름**(`example`/`demo`/없음)이고, 책장은 읽기 전용 개념 자체가 없다.

## 3. 최소 공통 계약 (제안)

전부를 지금 만들지 않는다. **이번 PR은 1번(생명주기)만 구현**하고, 2~4는 다음 조각으로 미룬다.

1. **생명주기 (구현됨)** — `src/views/lifecycle.js`
   ```js
   const { root, signal, track, dispose } = createView(host);
   ```
   - `root`: shadow root. `signal`: 모든 이벤트 등록에 쓴다.
   - `track(fn)`: observer·RAF·dialog처럼 signal로 정리되지 않는 자원.
   - `dispose()`: `signal` 해제 → 등록의 역순 정리. 여러 번 불러도 한 번만 실제 정리하고, 정리 중 하나가 던져도 나머지를 계속한다.
   - **mount는 새 host에만 한다.** 한 host에는 shadow root가 하나뿐이라 같은 요소에 다시 붙일 수 없다. 화면 교체 시 이전 화면 `dispose`와 새 host 준비는 호출자(`render`)가 맡는다 — 현재 앱이 `#app`을 갈아 끼우는 방식과 같다. 같은 host 재사용은 지원하지 않는다.
2. **문맥 (구현됨)** — `src/views/contract.js`의 `viewContext({treeId, momentId, readOnly})`. `main.js`가 화면마다 한 번 만들어 넘긴다. 궤도의 `example`, 기억책의 `demo`는 **`readOnly` 하나로 수렴**했고(값 동일), 책장은 자기 기록이므로 `readOnly:false`이며 선택 시작값만 `treeId`로 받는다. 문맥은 고정(freeze)이라 화면이 바꿀 수 없다.
3. **행동 (구현됨)** — 화면별 콜백을 의미 이름 하나로 모았다(`actions`). 화면은 저장소를 직접 쓰지 않고 이 통로로만 바깥에 알린다.
   ```js
   navigate(where)                        // 'home' | 'trees'
   openBook(treeId, momentId, readOnly)   // 기억책으로 (읽기 전용이면 demo-book)
   openWorkspace(treeId, momentId, readOnly)   // 트리 연결 보기 (읽기 전용이면 demo)
   requestMoment(kind, id)                // 'new' | 'add' | 'edit'
   library(action, id)                    // 백업·가져오기·복구·삭제
   ```
   `main.js`의 기존 `onBook`·`onShelf`·`onAdd`·`onAction`·`onNew`·`onRecovery` 매핑을 그대로 옮겨 **동작 변화는 없다**. 기억책에서 '내 트리'로 갈 때 그 트리가 선택되는 동작은 `navigate('trees')`의 화면별 구현으로 남겼다.
4. **화면 등록 (구현됨)** — `src/views/registry.js`의 `createScreenRegistry([{id, matches(route), activate()}])`. `render()`의 if/else 사슬을 등록표로 바꿨다. 먼저 선언된 화면이 이기고, 마지막 항목은 모든 경로를 받는 대체 화면이어야 하며(아니면 경로가 새어 나간다), id는 중복될 수 없다. `activate()`는 붙인 화면의 dispose를 돌려주고, 호출자가 이전 화면을 dispose한 뒤 새 화면을 붙인다.
5. **소유 경계 (다음 조각)** — 공통 shell(메뉴·동기화 상태·팝업·여백)은 `main.js`가 소유하고, 화면은 자기 shadow root 밖을 만지지 않는다. 읽기 전용에서 편집 단추를 숨기는 것은 UX일 뿐이며 최종 판정은 서버가 한다.

주소는 지금의 hash(`#start`·`#trees`·`#tree/<id>`·`#book/<id>`)를 유지한다. 리모네식 쿼리(`?moment=`)로 바꾸는 것은 이번 범위가 아니다.

## 4. 진행 상태

- **1차(#70, `71f13d3`)**: `createView()` 생명주기 도입·채택. 외형·문구·동작·주소 변화 없음.
- **2차(#72)**: 문맥(`viewContext`)과 행동(`actions`) 통일. `src/main.js`는 mount 세 곳과 열기 도우미 인자 이름만 바뀌었다. 외형·URL·저장 형식 변화 없음.
- **3차(이 PR)**: 화면 등록표(`createScreenRegistry`)로 경로 해석과 mount/dispose 호출을 한 자리로 모음. hash 주소·뒤로가기·선택 유지·readOnly·행동은 그대로.
- **남은 것**: 화면이 저장소를 직접 쓰는 부분(읽던 위치·책장 선택 기록)을 `main.js` 한 곳으로 모으기, 공통 shell 소유 경계, 보기 전환의 선택 유지 규칙. 새 화면·커뮤니티·프레임워크 교체는 범위 밖.
