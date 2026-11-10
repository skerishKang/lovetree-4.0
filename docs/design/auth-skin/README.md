# LoveTree auth skin (밤·정원)

로그인·회원가입 화면을 러브트리 4.1 첫 화면과 같은 디자인으로 맞추기 위한 정적 시안입니다.
공용 로그인 팀이 이 표와 HTML/CSS를 그대로 참고해 실제 `auth.padiem.net` 화면 CSS를 만들 수 있게 정리했습니다.

## 파일

- `login-night.html` · `login-garden.html` — 로그인 시안(Google, 이메일, 비밀번호, 오류 문구 자리, 회원가입 링크)
- `signup-night.html` · `signup-garden.html` — 회원가입 시안(이름 선택, 이메일, 비밀번호, 오류 문구 자리)
- `auth-skin.css` — 두 테마의 공통 레이아웃과 토큰
- `screenshots/` — `*-1440.png`, `*-390.png` 8장(기본 = 궤도 사진 "중")
- `screenshots/compare/` — #347 전/중/강 비교(1440 밤·정원, 1920 밤)
- `assets/` — 궤도 카드 이미지 3장(webp), Gowun Batang woff2, OFL
- `assets/googleg-standard-color.svg` — Google이 배포하는 표준 색상 `G` 로고(가공 없음)
- `assets/fonts/Roboto-Medium.latin.woff2` · `-latin-ext.woff2` — Google 버튼 지정 서체
- `tools/shoot.mjs` — 스크린샷 8장 재생성 + 외부 요청 0건 검사
- `tools/check-colors.mjs` — 계산된 색으로 밤 시안 장미색 0건·Google 버튼 규격 검사

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
| `--lt-rose` | `#d88f9c` | `#c86e79` | 정원 전용 감정 포인트(밤 화면에서는 쓰지 않음) |
| `--lt-rose-ink` | `#bd5d72` | `#98505e` | 정원 전용, 밝은 배경 위 오류 글자 |
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
| `--lt-google-fill` | `#131314` | `#ffffff` | Google 버튼 바탕(가이드라인 고정값) |
| `--lt-google-stroke` | `#8e918f` | `#747775` | Google 버튼 테두리(가이드라인 고정값) |
| `--lt-google-font` | `#e3e3e3` | `#1f1f1f` | Google 버튼 글자(가이드라인 고정값) |

## 밤 테마 색 규칙

밤(night)은 첫 화면과 같은 무채색(검정·진주색·금테)이 원칙입니다(#195). 장미색(`--lt-rose` 계열)은
정원(garden)에서만 씁니다. 밤 시안에서 장미색을 빼면서 바뀐 자리는 두 곳입니다.

| 자리 | 전 | 후 |
| --- | --- | --- |
| `PADIEM 계정` 머리글(`.eyebrow`) | `--lt-rose` `#d88f9c` | `--lt-muted` `#9b98a6` |
| 오류 문구(`.error`) | `--lt-rose` `#d88f9c` | `--lt-pearl` `#f5f1e9` |

정원 시안의 같은 자리는 그대로입니다(머리글·오류 모두 `--lt-rose-ink` `#98505e`).
밤 오류 문구를 진주색으로 둔 이유는 무채색 원칙을 지키면서 본문 글자와 같은 대비(약 15:1)를
유지하기 위해서입니다. 금색 계열(`--lt-gold` `#ffe6a6`)도 같은 원칙에 맞지만, 오류를 강조색으로
읽히게 하려면 금테가 이미 화면 곳곳에 쓰이고 있어 진주색이 더 분명합니다.

## Google 버튼

출처: Google Identity, **"Sign in with Google" 브랜드 가이드라인**
(<https://developers.google.com/identity/branding-guidelines>, 영문·한국어판 모두 확인, 확인일 2026-11-08).

- 로고: `assets/googleg-standard-color.svg` — Google이 `fonts.gstatic.com`으로 배포하는 표준 색상 `G`
  (`https://fonts.gstatic.com/s/i/productlogos/googleg/v6/48px.svg`). 색·모양을 바꾸지 않고 18px로만 축소했습니다.
  가이드라인은 "G 로고의 크기나 색상을 바꿀 수 없고 표준 색상 버전이어야 한다"고 정합니다.
- 문구: `Google 계정으로 계속` — 가이드라인의 한국어 표기 중 "Google 계정으로 계속"을 썼습니다.
- 서체: `Roboto Medium` 14px / 20px(가이드라인 지정). 한글 글리프는 Roboto에 없어 `--lt-ui`로 넘어갑니다.

| 테마 | 바탕 | 테두리 | 글자 |
| --- | --- | --- | --- |
| 밤(어두운 버튼) | `#131314` | `#8e918f` 1px | `#e3e3e3` |
| 정원(밝은 버튼) | `#ffffff` | `#747775` 1px | `#1f1f1f` |

모양은 지금 시안 그대로입니다: 높이 `48px`, `border-radius: var(--lt-r-pill)`(알약).
가이드라인은 크기 조절을 허용하면서 비율 유지와 알약/직사각형 형태를 함께 허용합니다.
가이드라인이 금지하는 것들(단색 G, 직접 만든 아이콘, 유색 배경 위 표준 G)은 쓰지 않았습니다.

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
| Google 버튼 | 높이 `48px`, 알약, 로고 `18px`, 글자 `Roboto Medium 14px/20px` |
| 입력 높이 | `48px`, `border-radius: 12px` |
| 포커스 | `outline: 2px solid var(--lt-gold); outline-offset: 3px` (입력은 금색 테두리 + `0 0 0 3px var(--lt-gold-line)`) |
| 제목 | 밤 `clamp(28px,4vw,34px)`, 정원 `clamp(30px,4.2vw,36px)` Gowun Batang |
| 하단 한 줄 | `.foot` 11px, `--lt-muted`, 1440은 아래 18px 고정·390은 카드 아래 흐름 |
| 궤도 카드 | 3장, 높이 `clamp(220px, 30vw, 420px)`·폭 0.76, opacity `.8`(밤) / `.7`(정원), blur 없음 |
| 390 | 카드 `100%`, 바깥 여백 `16px`, 궤도 카드 가장자리 배치 |

## 공용 로그인 팀 연결

- `html[data-lt-theme="garden"]`(또는 동등한 `body.garden`)에서 정원 토큰으로 바꾸고, 밤은 기본 토큰을 씁니다.
- 제목은 "LoveTree에 로그인", 그 아래 설명 줄 없이 바로 로그인 버튼이 옵니다.
- 하단 한 줄은 네 화면(로그인·가입 × 밤·정원) 모두 같습니다:
  "PADIEM 계정으로 로그인합니다 · 하나의 계정으로 PADIEM 서비스를 이용할 수 있어요".
  이전의 제목 아래 설명 줄("PADIEM 계정으로 Chat 등 다른 서비스도 함께 쓸 수 있어요" /
  "PADIEM 계정 하나로 LoveTree와 Chat을 함께 써요")과 하단 "LoveTree 4.1 · PADIEM"은 없어졌습니다.
- 요소는 현재 auth 화면과 같습니다: Google 계정으로 계속, 이메일·비밀번호, 이메일로 로그인, 이메일로 회원가입, 오류 문구 자리. 회원가입은 이름(선택)·이메일·비밀번호·회원가입입니다.
- 러브트리 쪽은 `/auth/login`으로 보낼 때 `lt_theme=night|garden`만 붙입니다. 인증 쪽이 아직 무시해도 동작에 영향이 없습니다.
  `functions/_lib/shared-auth.mjs`의 `/auth/login` 처리에서 들어온 `lt_theme`가 `night`·`garden`일 때만
  `auth.padiem.net/login` 주소에 그대로 붙입니다. 그 외 값·없음·중복이면 붙이지 않아 공용 쪽 기본(night)을 따릅니다.
  `client_id`·`redirect_uri`·`state`·`code_challenge`와 state 봉인·`next` 검사는 그대로입니다.
- 로그인 직전 안내 창의 `next`에는 `intent=new-tree|shelf`만 붙습니다. 로그인·가입 뒤 `next`를 보존하면 첫 여정/내 책장으로 바로 이어집니다.
- `next`는 로컬 경로만 허용하고, `intent`는 `new-tree`·`shelf` 외 값을 무시합니다.

## 궤도 사진 단계 — 중(기본)·강 (#347)

대표 요청: 카드(`width: min(440px, 100%)`)는 그대로 두고, 배경 사진을 더 크고 잘 보이게.
기본은 **중**이고, `body.orbit-strong` 클래스를 붙이면 **강**이 된다.

| 값 | 전(main) | 중(기본) | 강 |
| --- | --- | --- | --- |
| 사진 높이 | `clamp(190px, 27vw, 330px)` | `clamp(220px, 30vw, 420px)` | `clamp(240px, 33vw, 460px)` |
| 사진 폭 | 높이 × 0.76 | 같음 | 같음 |
| 투명도(밤) | `.58` | `.8` | `.9` |
| 투명도(정원) | `.48` | `.7` | `.8` |
| 가장자리 어둡게 · 투명 구간 | 42% | 50% | 58% |
| 가장자리 어둡게 · 끝 | 무대색 82%(불투명) | 78% 지점 · 72% 농도 | 72% 지점 · 62% 농도 |
| 위치 | 가장자리 기준(o1 3.5%·o2 5%·o3 14%) | 카드 양옆 48px 간격 | 같음(사진만 커짐) |
| 카드 | `min(440px, 100%)` | 그대로 | 그대로 |
| ≤680px | 카드 우선 | 그대로(픽셀 비교 밤 0px·정원 최대 ±1) | 그대로 |

- 위치는 `calc(50% ± (카드 반폭 220px + 48px) ± 사진 폭)`으로 잡아 1280·1440·1920에서 카드와 겹치지 않는다(회전 bounding box 포함 겹침 0).
- 카드 글자 대비는 그대로다: 밤 제목 `#f5f1e9` / 카드 `rgba(7,7,12,.9)` ≈ 17.84:1, 정원 `#403536` / `#fffdf8` ≈ 11.6:1.
- 가장자리 어둡게는 `color-mix(in srgb, var(--lt-stage) 72%, transparent)`처럼 무대색의 농도만 낮춰 새 색을 만들지 않는다.

## 스크린샷

| 화면 | 1440 | 390 |
| --- | --- | --- |
| 로그인·밤 | `screenshots/login-night-1440.png` | `screenshots/login-night-390.png` |
| 로그인·정원 | `screenshots/login-garden-1440.png` | `screenshots/login-garden-390.png` |
| 회원가입·밤 | `screenshots/signup-night-1440.png` | `screenshots/signup-night-390.png` |
| 회원가입·정원 | `screenshots/signup-garden-1440.png` | `screenshots/signup-garden-390.png` |

위 8장은 궤도 사진 **중**(기본) 기준이다. 강은 `body.orbit-strong`으로 찍는다.
전/중/강 비교는 `screenshots/compare/`에 있다.

| 비교 | 파일 |
| --- | --- |
| 1440 밤 전·중·강 | `screenshots/compare/compare-1440-night.png` |
| 1440 정원 전·중·강 | `screenshots/compare/compare-1440-garden.png` |
| 1920 밤 중·강 | `screenshots/compare/compare-1920-night.png` |

오류 문구 자리는 실제 오류가 들어올 자리를 보여 주기 위해 예시 문구를 넣었습니다.

## 다시 만들기

```
node docs/design/auth-skin/tools/shoot.mjs         # 스크린샷 8장 + 외부 요청 0건 검사
node docs/design/auth-skin/tools/check-colors.mjs  # 계산된 색 검사(밤 장미색 0건, Google 버튼 규격)
```

두 스크립트는 저장소 의존성에 playwright를 넣지 않고 전역 설치본을 씁니다. 경로가 다르면
`PLAYWRIGHT_ROOT`에 설치 경로를 지정합니다. 브라우저는 기본 Chrome 채널이고,
Chrome이 없는 환경에서는 `PW_CHANNEL=msedge`로 설치된 Edge를 씁니다.
