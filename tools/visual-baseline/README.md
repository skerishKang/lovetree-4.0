# visual-baseline — 리팩터링 전후 화면 비교 (#231)

```bash
node tools/visual-baseline/visual-baseline.mjs capture --out /mnt/e/base-before           # 로그아웃 예시 모드 28장
node tools/visual-baseline/visual-baseline.mjs compare --before /mnt/e/base-before --after /mnt/e/base-after   # 차이 % 표 + diff-*.png
```

- `--base`(기본 `https://lovetree-4-0.pages.dev/v41/`)로 로컬 미리보기(`http://127.0.0.1:5173/v41/`)도 찍는다. `--threshold`(기본 0.1%)를 넘으면 종료 코드 1.
- 같은 조건에서 흔들리지 않게: 테마 고정·`Math.random` 고정 씨앗·CSS 애니메이션 일시정지·rAF 중단·토스트 숨김 + 두 번 연속 같은 그림일 때만 저장.
- **알려진 한계**: 로그아웃 상태에서는 `#shelf`·`#book`·`#board`·`#network`·`#journey` 딥링크가 안쪽 화면을 열지 않고 첫 화면에 머무른다(첫 화면·계정 자리 8장은 안정적으로 0%). 안쪽 화면 기준선이 필요하면 로그인 상태 촬영 모드를 추가해야 한다.
- 크로미움은 `CHROME_PATH` → `~/.cache/ms-playwright/chromium-*` 순으로 찾고, playwright-core는 `tools/postdeploy/node_modules` 것을 재사용한다(새 의존성 없음).
