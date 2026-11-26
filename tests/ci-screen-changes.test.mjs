// 이슈 947 뒤 사줄: 화면 바뀜 판정(tools/ci/screen-changes.mjs)의 작은 시험.
// 시험만 바뀐 PR(#958 계열 — 화면 잡이 실행하지 않는 API·소스 시험)에서는 판정이 거짓이고,
// 화면 시험 파일을 건드린 PR에서는 참이어야 한다. 화면 시험 목록은 워크플로에서 자동으로 뽑는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { screenTestFiles, helperFiles, classify } from '../tools/ci/screen-changes.mjs';

const tests = screenTestFiles();
const helpers = new Set(helperFiles(tests));
const screen = new Set(tests);

test('화면 시험 목록은 워크플로의 화면 잡 구간에서 뽑는다', () => {
  assert.ok(tests.includes('tests/v41-screen-audit.test.mjs'), '화면 공통 검사기가 목록에 있다');
  assert.ok(!tests.includes('tests/v41-share-api.test.mjs'), '화면 잡이 실행하지 않는 API 시험은 목록에 없다');
  assert.ok(helpers.has('tests/helpers/screen-audit.mjs'), '화면 시험 파일이 import하는 helpers도 목록에 있다');
});

test('시험만 바뀐 PR(#958 계열)은 판정 거짓 — 화면 잡을 건너뛴다', () => {
  const r = classify(
    ['tests/shared-auth-pages.test.mjs', 'tests/v41-community.test.mjs', 'tests/v41-share-api.test.mjs', 'tests/v41-share-readonly.test.mjs'],
    screen, helpers,
  );
  assert.equal(r.changed, false, `판정: ${JSON.stringify(r.reasons)}`);
});

test('화면 시험 파일·helpers를 건드린 PR은 판정 참 — 화면 잡이 돈다', () => {
  for (const f of ['tests/v41-screen-audit.test.mjs', 'tests/helpers/screen-audit.mjs', 'tests/v41-map-theme-flow.test.mjs']) {
    const r = classify([f], screen, helpers);
    assert.equal(r.changed, true, `${f}: ${JSON.stringify(r.reasons)}`);
  }
});

test('나머지 규칙은 그대로다 — 화면·화면 밖·애미', () => {
  assert.equal(classify(['public/v41/shell.css'], screen, helpers).changed, true, 'public은 화면');
  assert.equal(classify(['src/views/orbit/orbit.js'], screen, helpers).changed, true, 'src/views는 화면');
  assert.equal(classify(['.github/workflows/preview-check.yml'], screen, helpers).changed, true, '워크플로 자체는 화면');
  assert.equal(classify(['.github/workflows/ci.yml'], screen, helpers).changed, false, '다른 워크플로만 바뀌면 화면 밖');
  assert.equal(classify(['docs/HANDOFF.md'], screen, helpers).changed, false, '문서는 화면 밖');
  assert.equal(classify(['src/server/community-service.js'], screen, helpers).changed, false, '서버는 화면 밖');
  assert.equal(classify(['src/new-thing.js'], screen, helpers).changed, true, '애매하면 바뀜');
});

test('#1069 화면 잡의 Playwright 버전은 잠금 파일에서 읽는다', () => {
  const workflow = readFileSync(new URL('../.github/workflows/preview-check.yml', import.meta.url), 'utf8');
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const version = lock.packages['node_modules/playwright'].version;
  assert.ok(!/1\.49\.1/.test(workflow), '옛 하드코딩 버전이 남아 있지 않다');
  assert.ok(workflow.includes("hashFiles('package-lock.json')"), '캐시 키가 잠금 파일에서 유도된다');
  const installs = workflow.match(/playwright@\$\(node -p "require\('\.\/package-lock\.json'\)\.packages\['node_modules\/playwright'\]\.version"\)/g) || [];
  // #1413: 셸 화면 잡을 둘로 나누고(3단계) 지도 대비 잡에서 서재·날짜 잡을 떼어 내(4단계) Playwright 설치 구간은 15곳이다.
  // 밤 측정 쪽도 같은 규칙을 지킨다.
  assert.equal(installs.length, 15, `PR 화면 잡 15곳이 모두 잠금 파일 버전을 쓴다(실측 ${installs.length})`);
  const nightly = readFileSync(new URL('../.github/workflows/nightly-screen-perf.yml', import.meta.url), 'utf8');
  assert.ok(!/playwright@\d/.test(nightly) && nightly.includes("hashFiles('package-lock.json')"), '밤 측정도 하드코딩 버전 없이 잠금 파일을 쓴다');
  const actual = execFileSync(process.execPath, ['-p', "require('./package-lock.json').packages['node_modules/playwright'].version"], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim();
  assert.equal(actual, version, `실제로 읽힌 버전(${actual})이 잠금 파일(${version})과 같다`);
});

// #1070: 서버·함수·일반 도구만 바뀐 PR은 화면 잡 13개를 돌지 않는다. 화면 잡이 쓰는 도구는 여전히 화면.
test('판정 표: 서버·함수·도구는 화면 밖, 화면 도구는 화면', () => {
  const table = [
    [['server/http.js'], false, '서버만 바뀐 PR'],
    [['functions/index.js'], false, '함수만 바뀐 PR'],
    [['server/http.js', 'functions/index.js', 'docs/PRODUCT.md'], false, '서버·함수·문서'],
    [['tools/ci/screen-changes.mjs'], true, '판정 도구 자체'],
    [['tools/postdeploy/postdeploy.mjs'], true, '미리보기 검사 도구'],
    [['tools/visual-baseline/visual-baseline.mjs'], true, '캡처 비교 도구'],
    [['tools/v41-modulepreload.mjs'], true, '화면 빌드 검사 도구'],
    [['tools/random-helper.mjs'], false, '일반 도구'],
    [['src/server/community-service.js'], false, '기존 서버 경로'],
    [['public/v41/shell.css'], true, '화면 파일']
  ];
  for (const [files, expected, label] of table) {
    const r = classify(files, screen, helpers);
    assert.equal(r.changed, expected, `${label}(${files.join(',')}): ${JSON.stringify(r.reasons)}`);
  }
});

test('지도(추후 개발) 시험은 지도 파일이 바뀐 PR에서만 돈다', async () => {
  const { mapChanged } = await import('../tools/ci/screen-changes.mjs');
  assert.equal(mapChanged(['public/v41/views/network/network.js']), true, '지도 화면');
  assert.equal(mapChanged(['public/v41/network.css']), true, '지도 스타일');
  assert.equal(mapChanged(['tests/v41-map-contrast.test.mjs']), true, '지도 시험');
  assert.equal(mapChanged(['tests/helpers/map-contrast.mjs']), true, '지도 시험 보조');
  assert.equal(mapChanged(['public/v41/identity.css']), true, '지도가 쓰는 테마 공통');
  assert.equal(mapChanged(['.github/workflows/preview-check.yml']), true, '화면 워크플로');
  assert.equal(mapChanged(['public/v41/shell/auth.mjs']), false, '셸 로그인');
  assert.equal(mapChanged(['public/v41/views/board/board.js']), false, '보드');
  assert.equal(mapChanged(['public/v41/sitemap.xml']), false, '지도와 무관한 이름');
});

// 2026-11-24: 한 화면 안에서만 바뀐 PR은 그 화면 잡만 고른다. 애매하면 전부다.
test('화면 잡 고르기: 보드만 바뀌면 보드 잡, 공용 파일이 섞이면 전부', async () => {
  const { selectJobs, jobTestFiles, screenTestFiles, helperFiles } = await import('../tools/ci/screen-changes.mjs');
  const tests = screenTestFiles();
  const screen = new Set(tests), helpers = new Set(helperFiles(tests)), jobs = jobTestFiles();
  assert.ok(jobs['screen-board'].has('tests/v41-board-pinboard-582.test.mjs'), '보드 잡의 시험 파일을 읽는다');
  assert.equal(selectJobs(['public/v41/views/board/board.js', 'public/v41/views/track58-pinboard.html'], jobs, screen, helpers), 'screen-board');
  assert.equal(selectJobs(['tests/v41-board-pinboard-582.test.mjs', 'docs/a.md', 'server/x.js'], jobs, screen, helpers), 'screen-board', '화면 밖 파일은 고르기에 영향이 없다');
  assert.equal(selectJobs(['tests/v41-book-single-537.test.mjs'], jobs, screen, helpers), 'screen-book');
  assert.equal(selectJobs(['tests/v41-explore-moments-1025.test.mjs'], jobs, screen, helpers), 'screen-home');
  assert.equal(selectJobs(['tests/v41-home-screen-952.test.mjs'], jobs, screen, helpers), 'screen-home');
  assert.equal(selectJobs(['tests/v41-account-settings.test.mjs'], jobs, screen, helpers), 'screen-shell-extra', '분리된 셸 설정 시험만 바뀌면 새 잡을 고른다');
  assert.equal(selectJobs(['tests/v41-970-cleanup-fab.test.mjs'], jobs, screen, helpers), 'screen-shell', '원래 셸 시험은 기존 잡을 고른다');
  assert.equal(selectJobs(['public/v41/views/board/board.js', 'public/v41/shell.css'], jobs, screen, helpers), 'all', '공용 CSS가 섞이면 전부');
  assert.equal(selectJobs(['tests/helpers/screen-audit.mjs'], jobs, screen, helpers), 'all', 'helpers는 전부');
  assert.equal(selectJobs(['src/views/orbit.js'], jobs, screen, helpers), 'all');
  assert.equal(selectJobs(['.github/workflows/preview-check.yml'], jobs, screen, helpers), 'all', '워크플로가 바뀌면 전부');
  assert.equal(selectJobs(['tests/v41-screen-audit.test.mjs'], jobs, screen, helpers), 'none', '공통 검사기 시험만 바뀌면 고를 잡 없음(빈 값 아님)');
});

// #1413 4단계: 지도 대비 잡에 함께 있던 서재·날짜 시험은 새 잡(screen-shelf)으로, 둘러보기 칩·머리줄 시험은 공통 검사기 a로 옮겼다.
test('서재·날짜 잡 떼어 내기: 시험 위치·고르기·모음 잡', async () => {
  const { selectJobs, jobTestFiles, screenTestFiles, helperFiles, mapChanged } = await import('../tools/ci/screen-changes.mjs');
  const tests = screenTestFiles();
  const screen = new Set(tests), helpers = new Set(helperFiles(tests)), jobs = jobTestFiles();
  const shelf = 'tests/v41-970-shelf-date.test.mjs';
  assert.ok(jobs['screen-shelf'].has(shelf), '서재·날짜 시험은 새 잡이 돌린다');
  assert.ok(!jobs['screen-map-a'].has(shelf), '지도 대비 잡에는 서재·날짜 시험이 없다');
  assert.deepEqual([...jobs['screen-map-a']].sort(), ['tests/v41-map-contrast.test.mjs', 'tests/v41-map-fan-open.test.mjs'], '지도 대비 잡에는 지도 시험만 남는다');
  for (const f of ['tests/v41-community-chips-784.test.mjs', 'tests/v41-header-ia.test.mjs']) {
    assert.ok(jobs['screen-audit-a'].has(f), `${f}는 공통 검사기 a가 돌린다`);
    assert.equal(Object.entries(jobs).filter(([, files]) => files.has(f)).length, 1, `${f}는 한 잡에서만 돈다`);
  }
  assert.ok(helpers.has('tests/helpers/screen-audit.mjs') && screen.has(shelf), '새 잡의 시험과 helpers가 화면 판정에 들어간다');
  assert.equal(selectJobs([shelf], jobs, screen, helpers), 'screen-shelf', '서재·날짜 시험만 바뀌면 새 잡만 고른다');
  assert.equal(mapChanged([shelf]), false, '서재·날짜 시험만 바뀌면 지도 시험은 돌지 않는다');
  assert.equal(selectJobs(['public/v41/views/shelf/shelf-views.mjs'], jobs, screen, helpers), 'all', '서재 소스는 다른 화면 잡도 지나므로 전부(새 잡 포함)');
  assert.equal(selectJobs(['tests/v41-map-contrast.test.mjs'], jobs, screen, helpers), 'none', '지도 시험만 바뀌면 고를 잡 없음 — 새 잡은 건너뛴다');
  assert.equal(mapChanged(['tests/v41-map-contrast.test.mjs']), true, '지도 시험만 바뀌면 지도 대비는 돈다');
  const workflow = readFileSync(new URL('../.github/workflows/preview-check.yml', import.meta.url), 'utf8');
  const needs = workflow.slice(workflow.indexOf('  preview:')).match(/needs: \[([^\]]+)\]/)[1].split(',').map((s) => s.trim());
  assert.ok(needs.includes('screen-shelf') && needs.includes('screen-map-a') && needs.includes('screen-audit-a'), '새 잡·지도 대비·공통 검사기 a가 모음 잡 needs에 있다');
  assert.match(workflow, /\n    name: 화면 시험 — 서재·날짜\n/, '새 잡 이름');
  assert.match(workflow, /\n    name: 미리보기 postdeploy\(로그아웃\)\n/, '필수 검사 이름은 그대로다');
});

test('결과 모으기: 고르지 않은 화면 잡의 건너뜀만 통과', async () => {
  const { checkScreenResults } = await import('../tools/ci/screen-results.mjs');
  const gate = (jobs) => ({ result: 'success', outputs: { changed: 'true', jobs } });
  const ok = checkScreenResults({ 'screen-changes': gate('screen-board'), 'screen-board': { result: 'success' }, 'screen-book': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(ok.ok, true, ok.failures.join(','));
  const home = checkScreenResults({ 'screen-changes': gate('screen-home'), 'screen-home': { result: 'success' }, 'screen-home-followup': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(home.ok, false);
  const other = checkScreenResults({ 'screen-changes': gate('screen-board'), 'screen-home-followup': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(other.ok, true);
  const bad = checkScreenResults({ 'screen-changes': gate('screen-board'), 'screen-board': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(bad.ok, false, '고른 잡이 건너뛰면 실패');
  const all = checkScreenResults({ 'screen-changes': gate('all'), 'screen-book': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(all.ok, false, '전부일 때 건너뜀은 실패');
  const old = checkScreenResults({ 'screen-changes': gate(''), 'screen-book': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(old.ok, false, 'jobs가 빈 값(옛 가지 판정 도구)이면 건너뜀은 실패');
  const none = checkScreenResults({ 'screen-changes': gate('none'), 'screen-book': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(none.ok, true, "'none'이면 고른 잡이 없어 건너뜀 통과");
  const extraFails = checkScreenResults({ 'screen-changes': gate('all'), 'screen-shell': { result: 'success' }, 'screen-shell-extra': { result: 'failure' }, deploy: { result: 'success' } });
  assert.equal(extraFails.ok, false, '새 셸 잡 실패는 필수 집계 실패');
  const extraSkipped = checkScreenResults({ 'screen-changes': gate('screen-shell'), 'screen-shell': { result: 'success' }, 'screen-shell-extra': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(extraSkipped.ok, true, '새 셸 잡이 선택되지 않았을 때만 건너뜀을 통과시킨다');
  const shelfFails = checkScreenResults({ 'screen-changes': gate('all'), 'screen-map-a': { result: 'success' }, 'screen-shelf': { result: 'failure' }, deploy: { result: 'success' } });
  assert.equal(shelfFails.ok, false, '서재·날짜 잡 실패는 필수 집계 실패');
  const shelfCancelled = checkScreenResults({ 'screen-changes': gate('all'), 'screen-shelf': { result: 'cancelled' }, deploy: { result: 'success' } });
  assert.equal(shelfCancelled.ok, false, '서재·날짜 잡 취소도 필수 집계 실패');
  const shelfPickedSkipped = checkScreenResults({ 'screen-changes': gate('screen-shelf'), 'screen-shelf': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(shelfPickedSkipped.ok, false, '서재·날짜 잡을 골랐는데 건너뛰면 실패');
  const shelfNotPicked = checkScreenResults({ 'screen-changes': gate('none'), 'screen-map-a': { result: 'success' }, 'screen-shelf': { result: 'skipped' }, deploy: { result: 'success' } });
  assert.equal(shelfNotPicked.ok, true, '고르지 않은 서재·날짜 잡의 건너뜀은 통과');
});
