# 접근성 자동 점검 (axe-core) — 4.1 화면 전체

```bash
npm run a11y -- --out .tmp-261109/a11y-before
npm run a11y -- --state in --width 1440 --theme night --out .tmp-261109/a11y-one
npm run a11y -- --screen shelf --out .tmp-261109/a11y-shelf
```

- 검사 범위: 첫 화면·첫 여정(`#journey/00`)·책장·기억책·기억 보드·관계 지도.
  셸(바깥 문서)과 iframe 안쪽 문서를 따로 본다. 첫 여정은 로그인 상태에서만 열린다(로그아웃이면 첫 화면으로 돌아간다).
- 셸 대화상자: 계정 메뉴·책 정보 관리(표지 고르기 포함)·순간 남기기(로그인 상태만).
  로그인 화면은 `auth.padiem.net`(저장소 밖 공용 인증)이 원본이라, 이 저장소의 스킨 원본
  `docs/design/auth-skin/login-{night,garden}.html`을 검사한다.
- 판정: `serious`·`critical`만 보고한다. 색을 바꿔야 하는 대비 문제는 **고치지 않고** 목록으로만 남긴다(디자인 판단).
- 실행 환경: Playwright Chromium 또는 이 PC의 Chrome/Edge(`CHROME_PATH`로 지정 가능).
  브라우저가 없으면 `npx playwright install chromium`.
- 로그인: `.secrets/.env`의 `PADIEM_TUTORIAL<NN>_EMAIL`·`_PASSWORD`를 읽는다(값은 출력하지 않는다).
- 계정 선택(#344, 2026-11-10): `--account` 인자 > `LT_ACCOUNT` 환경변수 > 둘 다 없으면 **시작 전에 멈춘다**(기본 계정 01로 조용히 진행하지 않는다, #300 레인 계정 규칙). 선택 규칙은 `tools/account-choice.mjs` 한 벌.
- 시험 자료: 로그인 상태 검사에 필요하다(셸은 트리가 없으면 안쪽 화면을 빈 패널로 대체한다 — `screens.mjs`의 `hasTree` 분기).
  빈 계정이면 검사 전에 트리 3권을 자동으로 넣고, 검사가 끝나면 원래(빈) 상태로 되돌린다(`tools/a11y/fixture.mjs`).
  기록이 이미 있으면 손대지 않는다. 건너뛴 화면은 요약의 `건너뜀 N`과 `a11y.json`의 `skippedScreens`에 센다.
- 사진 표지는 선택이다(디자인 표지 검사는 셸 대화상자 검사에 포함).
- 결과: `<out>/a11y.json`(라벨별 위반·대상·색 대비 값)과 화면 캡처 `<out>/<화면>-<폭>-<테마>-<상태>.png`.
- `--width 1440|390`, `--theme night|garden`, `--state out|in`, `--screen home|shelf|book|board|network|first-journey`로 좁힐 수 있다.
