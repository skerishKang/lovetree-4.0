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
- 로그인: `.secrets/.env`의 `PADIEM_TUTORIAL01_EMAIL`·`PADIEM_TUTORIAL01_PASSWORD`를 읽는다(값은 출력하지 않는다).
- 시험 자료(계정 01): 트리 3권 + 사진 표지 1권. `npm test`·`npm run build`와 무관한 임시 자료이며,
  점검이 끝나면 트리 0개·보관 파일 0개로 정리한다.
- 결과: `<out>/a11y.json`(라벨별 위반·대상·색 대비 값)과 화면 캡처 `<out>/<화면>-<폭>-<테마>-<상태>.png`.
- `--width 1440|390`, `--theme night|garden`, `--state out|in`, `--screen home|shelf|book|board|network|first-journey`로 좁힐 수 있다.
