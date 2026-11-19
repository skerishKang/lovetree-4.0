// 2026-11-07 첫 화면 테마 A/B(밤/정원)와 워드마크 LoveTree 통일 1단계의 회귀 시험.
// 기본은 A, 저장·재방문은 유지, 저장 실패는 A, 안쪽 네 화면은 항상 A, 워드마크 문구와 외부 글꼴 요청 0건을 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { existsSync } from 'node:fs';
import {
  readTheme, writeTheme, nextTheme, themeButtonLabel, themeButtonAriaLabel, themePressed,
  appliedTheme, applyThemeAttribute, THEME_KEY
} from '../public/v41/header-state.mjs';


function memoryStorage(initial = {}) {
  const data = {...initial};
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); }
  };
}

function brokenStorage() {
  return {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
}

function fakeRoot() {
  const attributes = {};
  return {
    attributes,
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: key => { delete attributes[key]; },
    getAttribute: key => attributes[key] ?? null
  };
}

test('정원 대상: 책장·기억책·기억 보드·관계 지도(#212, 2026-11-08 정원 적용 레인)', async () => {
  assert.equal(appliedTheme('garden', 'book'), 'garden');
  for (const view of ['board', 'network']) {
    assert.equal(appliedTheme('garden', view), 'garden', view);
    assert.equal(appliedTheme('night', view), 'night', view);
  }
  assert.equal(appliedTheme('garden', 'shelf'), 'garden');
  assert.equal(appliedTheme('night', 'shelf'), 'night');
  assert.equal(appliedTheme('garden', 'inner'), 'night');
  // 문서 속성도 화면에 따라 정해진다.
  // #231 1-B: 화면별 테마 대상 계산은 shell/navigation.mjs가 맡는다 — 소스 글자 대신
  // themedViewFor를 직접 불러 입출력으로 확인한다(이슈 952).
  const { themedViewFor } = await import('../public/v41/shell/navigation.mjs');
  assert.equal(themedViewFor('src064-orbit.html'), 'home');
  assert.equal(themedViewFor('track59-sketchbook.html'), 'book');
  assert.equal(themedViewFor('track58-pinboard.html'), 'board');
  assert.equal(themedViewFor('track56-network.html'), 'network');
  assert.equal(themedViewFor('track32-bookshelf.html'), 'shelf');
  assert.equal(themedViewFor('없는-화면.html'), 'inner');
});

test('화면 테마는 설정 창의 "화면" 묶음에 있고 밤/정원 두 칸으로 aria-checked를 쓴다', () => {
  assert.equal(themeButtonLabel('night'), '정원');
  assert.equal(themeButtonLabel('garden'), '밤');
  assert.equal(themeButtonAriaLabel('night'), '정원 테마로 바꾸기');
  assert.equal(themeButtonAriaLabel('garden'), '밤 테마로 바꾸기');
  assert.equal(themePressed('night'), false);
  assert.equal(themePressed('garden'), true);
  assert.equal(nextTheme('night'), 'garden');
  assert.equal(nextTheme('garden'), 'night');
  // #380 5번(테마는 설정 창 "화면" 묶음에 있다)·#776(머리줄 단추 하나)·첫 화면 ◐ 없음의
  // 소스 글자 검사 13은 지웠다(이슈 952) — 테마 라디오의 실제 role·aria-checked는
  // tests/v41-a11y-shell-names.test.mjs의 실행 시험이, 밤/정원 적용 결과는 아래 실행 시험이
  // 화면에서 확인한다. 첫 화면 요소(◐·순간 목록)는 첫 화면 화면 시험이 확인한다.
});

// '워드마크 LoveTree + 4.1' 소스 글자 시험(4 단정)은 지웠다(이슈 952) — 브랜드 이름의
// 접근성 이름은 tests/v41-a11y-shell-names.test.mjs의 실행 시험이 실제 요소에서 확인하고,
// MEMORY ORBIT·새싹 없음은 첫 화면 화면 시험이 확인한다.

// '첫 그리기 전 테마 인라인 스크립트' 소스 글자 시험(4 단정)은 지웠다(이슈 952) —
// 이 배선이 지키려던 결과(첫 그림에 이미 밤/정원이 적용되어 있다)는 아래 실행 시험이
// 뜬 문서의 data-lt-theme과 무대 색으로 확인한다.

// '정원 색은 한 블록에만'(9 단정)·'움직임 줄이기면 전환 끔'(1 단정) CSS 글자 시험은 지웠다(이슈 952) —
// 색 값·블록 위치는 identity.css의 시각 통일 기준(--lt-* 토큰) 감사가 맡고, 정원 무대 색이
// 실제로 칠해지는 결과는 아래 실행 시험이 잰다.

test('글꼴은 저장소 안에서만 받고 외부 글꼴 요청이 0건이다', () => {
  // 소스 글자 스캔(6 단정)은 지웠다(이슈 952) — 외부 글꼴 요청 0건은 아래 실행 시험이
  // 실제 네트워크 요청 목록에서 센다.
  assert.ok(fs.existsSync(new URL('../public/fonts/gowun-batang/OFL.txt', import.meta.url)), 'OFL 라이선스가 함께 있어야 한다');
  assert.ok(fs.existsSync(new URL('../public/fonts/gowun-batang/GowunBatang-Bold.latin.woff2', import.meta.url)), 'woff2 서브셋이 저장소에 있어야 한다');
});

// '정원 워드마크만 Gowun Batang' CSS 글자 시험(2 단정)은 지웠다(이슈 952) —
// 아래 실행 시험이 정원·밤에서 .brand>span에 실제로 적용된 글꼴을 잰다.

/* ── 이슈 952: 지운 소스 글자 시험의 대체 실행 시험 ──
   밤이 기본이고, 저장한 정원이 다음 부팅에 그대로이며, 정원에서는 워드마크만 Gowun Batang이다.
   외부 글꼴 요청 0건은 실제 네트워크 요청 목록에서 센다(소스 글자 스캔 대신).
   LT_SHELL_952_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패). */
const REQUIRE952T = process.env.LT_SHELL_952_REQUIRE === '1';
let chromium952t = null;
let skip952t = false;
try {
  ({ chromium: chromium952t } = await import('playwright'));
  if (!existsSync(chromium952t.executablePath())) skip952t = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip952t = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE952T && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip952t = '빌드 결과가 없어 실행 시험을 건너뜀';

test('952 실행: 밤이 기본이고 정원 저장은 다음 부팅에 유지되며 외부 글꼴 요청이 없다', { skip: skip952t || undefined }, async () => {
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952t.launch();
  try {
    const cases = [
      { stored: null, want: 'night', gowun: false, stage: 'rgb(4, 4, 7)' },
      { stored: 'garden', want: 'garden', gowun: true, stage: 'rgb(247, 240, 232)' }
    ];
    for (const c of cases) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const urls = [];
      if (c.stored) await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, c.stored);
      await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [] }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      page.on('request', (r) => urls.push(r.url()));
      await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!document.querySelector('.brand > span'), null, { timeout: 15000 });
      const got = await page.evaluate(() => ({
        theme: document.documentElement.dataset.ltTheme,
        stage: getComputedStyle(document.documentElement).backgroundColor,
        brandFont: getComputedStyle(document.querySelector('.brand > span')).fontFamily
      }));
      // 밤은 data-lt-theme 속성이 없는 값이다(applyThemeAttribute: 정원만 속성을 남긴다).
      assert.equal(got.theme || 'night', c.want, `저장값이 없으면 밤, 정원을 저장했으면 정원(${c.stored})`);
      assert.equal(got.stage, c.stage, `${c.want}: 무대 색은 그 테마의 --lt-stage다`);
      assert.equal(got.brandFont.includes('Gowun Batang'), c.gowun, `${c.want}: 워드마크 글꼴 ${c.gowun ? 'Gowun Batang' : 'Gowun Batang 아님'}`);
      const external = urls.filter((u) => /fonts\.(googleapis|gstatic)\.com|^https?:\/\/fonts\./.test(u));
      assert.deepEqual(external, [], `${c.want}: 외부 글꼴 요청 0건 — ${JSON.stringify(external)}`);
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
});
