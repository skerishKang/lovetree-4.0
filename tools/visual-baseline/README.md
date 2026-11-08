# visual-baseline — 리팩터링 전후 화면 비교 (#231)

```bash
node tools/visual-baseline/visual-baseline.mjs capture --out /mnt/e/base-before           # 로그아웃 예시 모드 28장
node tools/visual-baseline/visual-baseline.mjs compare --before /mnt/e/base-before --after /mnt/e/base-after   # 차이 % 표 + diff-*.png
```

- `--base`(기본 `https://lovetree-4-0.pages.dev/v41/`)로 로컬 미리보기(`http://127.0.0.1:5173/v41/`)도 찍는다. `--threshold`(기본 0.1%)를 넘으면 종료 코드 1.
- 같은 조건에서 흔들리지 않게: 테마 고정·`Math.random` 고정 씨앗·CSS 애니메이션 일시정지·rAF 중단·토스트 숨김 + 두 번 연속 같은 그림일 때만 저장.
- 화면 도착 판정은 **보이는(#view·#view-next 중 hidden 아님) iframe의 주소**로 한다. Pages는 `.html` 없이 응답하므로 기대 이름도 확장자 없이 맞춘다. 셸 문서의 rAF·타이머는 건드리지 않고, 고정 장치는 화면이 다 열린 뒤 iframe 안쪽에만 건다(셸 화면 교체가 rAF 2회를 기다리기 때문).
- **알려진 한계(로그아웃 촬영)**: `#journey/00`은 소유한 트리가 있어야 열려 로그아웃 예시 모드에서는 열리지 않는다(`shell.mjs`의 `session.snapshot().owned` 조건). 390 폭에서도 일부 화면이 열리지 않는다(28장 중 16장만 도착). 로그인 상태 촬영 모드가 필요하다.
- 크로미움은 `CHROME_PATH` → `~/.cache/ms-playwright/chromium-*` 순으로 찾고, playwright-core는 `tools/postdeploy/node_modules` 것을 재사용한다(새 의존성 없음).
