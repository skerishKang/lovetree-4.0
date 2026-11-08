# 기억 보드·관계 지도 정원 테마 (2026-11-08, Draft 승인용)

## 무엇을 바꿨나
- `header-state.mjs` `appliedTheme()`: `board`·`network`도 정원을 받는다(전에는 언제나 밤).
- `shell/navigation.mjs` `themedViewFor()`: `track58-pinboard.html` → `board`, `track56-network.html` → `network`.
- `views/board/board-extra.css`, `views/network/network.css`: `html[data-lt-theme=garden]` 아래에서 **identity.css의 `--lt-*` 토큰만** 쓴다. 새 색 없음.
  - 보드: 무대=종이(`--lt-stage`/`--lt-garden-edge`), 카드=흰 종이, 도구·상세·모달=`--lt-glass-strong`, 강조=`--lt-primary`/`--lt-gold-*`.
  - 지도: 무대 그라디언트를 종이로, 제목은 `--lt-font-display`(명조), 상단 알약·범례·레일은 흰 종이 + 잉크 글자.
- 밤 규칙은 한 줄도 건드리지 않았다(`html[data-lt-theme=garden]` 선택자만 추가).

## 전후 스크린샷 (1440·390 × 두 화면 = 4쌍)
| 화면 | 크기 | 전(오늘 운영: 정원을 골라도 밤으로 보임) | 후 |
|---|---|---|---|
| 기억 보드 | 1440 | `docs/garden-shots/board-garden-1440-before.png` | `docs/garden-shots/board-garden-1440-after.png` |
| 기억 보드 | 390 | `docs/garden-shots/board-garden-390-before.png` | `docs/garden-shots/board-garden-390-after.png` |
| 관계 지도 | 1440 | `docs/garden-shots/network-garden-1440-before.png` | `docs/garden-shots/network-garden-1440-after.png` |
| 관계 지도 | 390 | `docs/garden-shots/network-garden-390-before.png` | `docs/garden-shots/network-garden-390-after.png` |

## 24장 비교 (전 = 오늘 운영 234acd7, 후 = 이 브랜치 로컬)
- **밤 12장: 0.000~0.062%** (기준 이내) — 밤 화면 변화 없음.
- 정원 4장이 의도대로 크게 변함: board 76.0% / 53.7%, network 17.4% / 22.3%.
- 나머지(첫 화면·내 책장·기억책·계정) 0.000%.

## 남은 판단(승인 요청)
- 관계 지도의 가운데 큰 안내문은 원래도 앱 상태에 따라 `opacity`가 .07로 흐려진다(밤과 같은 동작). 정원에서는 종이 바탕이라 더 흐려 보인다. **동작을 바꾸지 말라는 조건이라 그대로 두었다.** 필요하면 별건으로 "정원에서 안내문 최소 대비"를 정할 수 있다.
