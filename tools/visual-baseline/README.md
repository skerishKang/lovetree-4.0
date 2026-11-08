# visual-baseline — 리팩터링 전후 화면 비교 (#231)

```bash
node tools/visual-baseline/visual-baseline.mjs capture --out /mnt/e/base-before           # 로그아웃 예시 모드 28장
node tools/visual-baseline/visual-baseline.mjs compare --before /mnt/e/base-before --after /mnt/e/base-after   # 차이 % 표 + diff-*.png
```

- 기준치: 기본 0.1%, **기억 보드(board)만 0.5%** — 실·핀 선을 매 로드마다 미세하게 다시 그리고, 기울어진 사진 카드 테두리의 계단 현상으로 0.309%가 나온 사례가 있다(정리는 리팩터링 3단계 예정).
- `--base`(기본 `https://lovetree-4-0.pages.dev/v41/`)로 로컬 미리보기(`http://127.0.0.1:5173/v41/index.html` — vite는 `/v41/`만으로는 셸을 주지 않음)도 찍는다. `--threshold`(기본 0.1%)를 넘으면 종료 코드 1.
- 같은 조건에서 흔들리지 않게: 테마 고정·`Math.random` 고정 씨앗·CSS 애니메이션 일시정지·rAF 중단·토스트 숨김 + 두 번 연속 같은 그림일 때만 저장.
- 화면 도착 판정은 **보이는(#view·#view-next 중 hidden 아님) iframe의 주소**로 한다. Pages는 `.html` 없이 응답하므로 기대 이름도 확장자 없이 맞춘다. 셸 문서의 rAF·타이머는 건드리지 않고, 고정 장치는 화면이 다 열린 뒤 iframe 안쪽에만 건다(셸 화면 교체가 rAF 2회를 기다리기 때문).
- 기준선은 **5화면(첫 화면·내 책장·기억책·기억 보드·관계 지도) × 1440·390 × 밤·정원 = 20장 + 헤더 계정 자리 4장 = 24장**이다.
- **첫 여정은 로그아웃 기준선에서 뺐다**: `#journey/00`은 소유한 트리가 있어야 열리고(`shell.mjs`의 `session.snapshot().owned`), 로그아웃에서 열리지 않는 것이 의도된 동작이다. 로그인 상태 여정은 `tools/postdeploy --auto-login`이 확인한다.
- 장마다 **새 context·새 페이지**로 연다(크기·테마는 context 생성 시 고정). 도착 판정은 보이는 iframe의 주소가 기대 파일을 포함하고 `readyState==='complete'`일 때까지 200ms 간격으로 최대 8초 확인한다.
- 화면 교체 애니메이션이 소수점 배율로 남으면 픽셀이 흔들리므로, 다 열린 뒤 iframe 배율·투명도를 1로 고정하고 애니메이션은 0초가 아니라 **끝 상태**로 마무리한다(셸의 rAF·타이머는 그대로 둔다).
- 남은 흔들림: 기억 보드 1440(실·핀 영역에서 최대 0.15%), 390 아래쪽 카드 일부(0.01~0.07%). 같은 화면인데도 매 실행 미세하게 다시 그려진다.
- 크로미움은 `CHROME_PATH` → `~/.cache/ms-playwright/chromium-*` 순으로 찾고, playwright-core는 `tools/postdeploy/node_modules` 것을 재사용한다(새 의존성 없음).
