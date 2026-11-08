# LoveTree auth skin (밤·정원)

로그인·회원가입 화면을 러브트리 4.1 첫 화면과 같은 디자인으로 맞추기 위한 정적 시안입니다.
공용 로그인 팀이 이 표와 HTML/CSS를 그대로 참고해 실제 `auth.padiem.net` 화면 CSS를 만들 수 있게 정리했습니다.

## 파일

- `login-night.html` · `login-garden.html` — 로그인 시안(Google, 이메일, 비밀번호, 오류 문구 자리, 회원가입 링크)
- `signup-night.html` · `signup-garden.html` — 회원가입 시안(이름 선택, 이메일, 비밀번호, 오류 문구 자리)
- `auth-skin.css` — 두 테마의 공통 레이아웃과 토큰
- `screenshots/` — `*-1440.png`, `*-390.png` 8장
- `assets/` — 궤도 카드 이미지 3장(webp), Gowun Batang woff2, OFL

모든 이미지·글꼴은 저장소 안의 로컬 파일만 씁니다. HTML/CSS에서 외부 URL 요청은 0건입니다.
밤 테마의 Pretendard는 저장소 `public/fonts/pretendard`를 상대 경로로 읽고, 없으면 시스템 글꼴로 대체됩니다.
정원 제목은 `assets/fonts/GowunBatang-Bold.latin.woff2`를 씁니다.

## 토큰 표

| 토큰 | 밤 | 정원 | 쓰임 |
| --- | --- | --- | --- |
| `--lt-stage` | `#040407` | `#f7f0e8` | 바깥 무대·페이지 배경 |
| `--lt-stage-2` | `#0a0a11` | `#fbf8f1` | 무대 radial 중심 |
| `--lt-pearl` | `#f5f1e9` | `#403536` | 기본 글자·보조 링크 |
| `--lt-muted` | `#9b98a6` | `#6f605a` | 설명·작은 글씨 |
| `--lt-gold` | `#ffe6a6` | `#98505e` | 워드마크·포커스 링·강조 |
| `--lt-gold-deep` | `#e6b14c` | `#98505e` | 짙은 금테 |
| `--lt-gold-line` | `rgba(255,230,166,.45)` | `rgba(152,80,94,.38)` | 카드·입력 테두리 |
| `--lt-gold-glow` | `rgba(238,190,104,.68)` | `rgba(200,110,121,.32)` | 카드 빛·그림자 |
| `--lt-rose` | `#d88f9c` | `#c86e79` | 오류·감정 포인트 |
| `--lt-rose-ink` | `#bd5d72` | `#98505e` | 밝은 배경 위 오류 글자 |
| `--lt-paper` | `#f5efe2` | `#fffdf8` | 카드 종이 |
| `--lt-ink` | `#433a34` | `#403536` | 종이 위 글자 |
| `--lt-glass` | `rgba(10,10,16,.78)` | `rgba(255,253,248,.92)` | 보조 유리 |
| `--lt-glass-strong` | `rgba(7,7,12,.9)` | `rgba(255,253,248,.98)` | 로그인 카드 |
| `--lt-line` | `rgba(255,255,255,.14)` | `rgba(119,91,82,.18)` | 입력·보조 테두리 |
| `--lt-primary` | `#eee9e0` | `#98505e` | 주 버튼 배경 |
| `--lt-primary-ink` | `#0a090d` | `#fffdf8` | 주 버튼 글자 |
| `--lt-r-pill` | `999px` | `999px` | 알약 버튼 |
| `--lt-r-panel` | `22px` | `22px` | 로그인 카드 |
| `--lt-r-card` | `14px` | `14px` | 입력·작은 카드 |
| `--lt-garden-edge` | — | `#eee3d5` | 정원 카드 가장자리 |
| `--lt-garden-shadow` | — | `0 18px 40px rgba(75,51,42,.16)` | 정원 따뜻한 그림자 |

## 크기·모양

| 항목 | 값 |
| --- | --- |
| 로그인 카드 | `width: min(440px, 100%)` |
| 카드 안쪽 | `36px` (≤680px: `25px 22px`) |
| 카드 모서리 | `22px` (≤680px: `18px`) |
| 카드 테두리 | `1px solid var(--lt-gold-line)` |
| 밤 카드 그림자 | `0 32px 96px rgba(0,0,0,.58), 0 0 0 1px var(--lt-gold-line), 0 0 34px var(--lt-gold-glow)` |
| 정원 카드 그림자 | `var(--lt-garden-shadow), 0 0 0 1px var(--lt-gold-line)` |
| 주·보조 버튼 높이 | `48px`, `border-radius: var(--lt-r-pill)` |
| 입력 높이 | `48px`, `border-radius: 12px` |
| 포커스 | `outline: 2px solid var(--lt-gold); outline-offset: 3px` (입력은 금색 테두리 + `0 0 0 3px var(--lt-gold-line)`) |
| 제목 | 밤 `clamp(28px,4vw,34px)`, 정원 `clamp(30px,4.2vw,36px)` Gowun Batang |
| 궤도 카드 | 3장, `opacity: .58`(밤) / `.48`(정원), blur 없음 |
| 390 | 카드 `100%`, 바깥 여백 `16px`, 궤도 카드 가장자리 배치 |

## 공용 로그인 팀 연결

- `html[data-lt-theme="garden"]`(또는 동등한 `body.garden`)에서 정원 토큰으로 바꾸고, 밤은 기본 토큰을 씁니다.
- 제목은 "LoveTree에 로그인", 그 아래 "PADIEM 계정으로 Chat 등 다른 서비스도 함께 쓸 수 있어요"를 유지합니다.
- 요소는 현재 auth 화면과 같습니다: Google로 계속, 이메일·비밀번호, 이메일로 로그인, 이메일로 회원가입, 오류 문구 자리. 회원가입은 이름(선택)·이메일·비밀번호·회원가입입니다.
- 러브트리 쪽은 `/auth/login`으로 보낼 때 `lt_theme=night|garden`만 붙입니다. 인증 쪽이 아직 무시해도 동작에 영향이 없습니다.
- 로그인 직전 안내 창의 `next`에는 `intent=new-tree|shelf`만 붙습니다. 로그인·가입 뒤 `next`를 보존하면 첫 여정/내 책장으로 바로 이어집니다.
- `next`는 로컬 경로만 허용하고, `intent`는 `new-tree`·`shelf` 외 값을 무시합니다.

## 스크린샷

| 화면 | 1440 | 390 |
| --- | --- | --- |
| 로그인·밤 | `screenshots/login-night-1440.png` | `screenshots/login-night-390.png` |
| 로그인·정원 | `screenshots/login-garden-1440.png` | `screenshots/login-garden-390.png` |
| 회원가입·밤 | `screenshots/signup-night-1440.png` | `screenshots/signup-night-390.png` |
| 회원가입·정원 | `screenshots/signup-garden-1440.png` | `screenshots/signup-garden-390.png` |

오류 문구 자리는 실제 오류가 들어올 자리를 보여 주기 위해 예시 문구를 넣었습니다.
