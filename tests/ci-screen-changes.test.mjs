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
  // #1413: 셸 화면 잡을 둘로 나누고(3단계) 지도 대비 잡에서 서재·날짜 잡을 떼어 내(4단계) 보드 잡을 둘로 나눠(5단계)
  // Playwright 설치 구간은 16곳이다.
  // 밤 측정 쪽도 같은 규칙을 지킨다.
  assert.equal(installs.length, 16, `PR 화면 잡 16곳이 모두 잠금 파일 버전을 쓴다(실측 ${installs.length})`);
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
  assert.equal(selectJobs(['tests/v41-explore-moments-1025.test.mjs'], jobs, screen, helpers), 'screen-reload', '#1413 5단계: 둘러보기 순간 보기 시험은 저장 재적재 잡이 돈다');
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
  assert.deepEqual([...jobs['screen-map-a']].sort(), ['tests/v41-community-chips-784.test.mjs', 'tests/v41-header-ia.test.mjs', 'tests/v41-map-contrast.test.mjs', 'tests/v41-map-fan-open.test.mjs'], '지도 대비 잡에는 지도 시험과 칩·머리줄 시험만 있다');
  // #1413 5단계: 칩·머리줄 시험은 공통 검사기 a에서 지도 대비 잡으로 되돌렸다(지도 바뀜과 무관하게 돈다).
  for (const f of ['tests/v41-community-chips-784.test.mjs', 'tests/v41-header-ia.test.mjs']) {
    assert.ok(jobs['screen-map-a'].has(f), `${f}는 지도 대비 잡이 돌린다`);
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

// #1413 5단계: 필수 검사의 가장 긴 길이던 보드·첫 화면·첫 화면 후속·책·감상·공통 검사기 c 잡의 시험 단계를 짧은 잡으로
// 옮기고 보드 잡을 둘로 나눴다. 시험은 하나도 빼지 않았고, 옮긴 시험은 한 잡에서만 돈다.
test('#1413 5단계: 옮긴 시험 위치·보드 둘째 잡 고르기·공통 검사기 나눔·겉모습 캡처 동시', async () => {
  const { selectJobs, jobTestFiles, screenTestFiles, helperFiles, JOB_TOKEN, tokenOf } = await import('../tools/ci/screen-changes.mjs');
  const { checkScreenResults } = await import('../tools/ci/screen-results.mjs');
  const tests = screenTestFiles();
  const screen = new Set(tests), helpers = new Set(helperFiles(tests)), jobs = jobTestFiles();
  const moved = {
    'screen-board-b': ['tests/v41-a11y-514-remaining.test.mjs', 'tests/v41-local-date-547.test.mjs', 'tests/v41-tree-layout-777.test.mjs',
      'tests/v41-932-937-board-legend.test.mjs', 'tests/v41-bottom-links-850.test.mjs', 'tests/v41-a11y-views.test.mjs', 'tests/v41-orbit-535-float-overlap.test.mjs'],
    'screen-reload': ['tests/v41-explore-moments-1025.test.mjs', 'tests/v41-1286-moments.test.mjs', 'tests/v41-explore-sort-search-1363.test.mjs'],
    'screen-book-screen': ['tests/v41-share-guest-635.test.mjs', 'tests/v41-book-long-note.test.mjs'],
  };
  for (const [job, files] of Object.entries(moved)) for (const f of files) {
    const owners = Object.entries(jobs).filter(([, set]) => set.has(f)).map(([name]) => name);
    assert.deepEqual(owners, [job], `${f}는 ${job} 한 잡에서만 돈다(실제 ${owners.join(',')})`);
  }
  // 보드 둘째 잡은 보드 잡과 같은 고르기 이름을 쓴다 — 보드만 바뀐 PR에서도, 옮긴 시험만 바뀐 PR에서도 두 잡이 함께 돈다.
  assert.equal(JOB_TOKEN['screen-board-b'], 'screen-board');
  assert.equal(tokenOf('screen-board'), 'screen-board');
  assert.equal(selectJobs(['public/v41/views/board/board.js'], jobs, screen, helpers), 'screen-board');
  assert.equal(selectJobs(['tests/v41-orbit-535-float-overlap.test.mjs'], jobs, screen, helpers), 'screen-board', '#535 시험만 바뀌면 보드 둘째 잡이 골린다');
  assert.equal(selectJobs(['tests/v41-share-guest-635.test.mjs'], jobs, screen, helpers), 'screen-book-screen');
  assert.equal(selectJobs(['tests/v41-1284-home.test.mjs'], jobs, screen, helpers), 'screen-home', '첫 화면 휴대폰 시험만 바뀌면 그 잡(첫 화면 이름)이 골린다');
  const workflow = readFileSync(new URL('../.github/workflows/preview-check.yml', import.meta.url), 'utf8');
  const jobBody = (key) => { const s = workflow.indexOf(`\n  ${key}:\n`); const rest = workflow.slice(s + 1); const m = rest.slice(3).search(/\n  [a-z0-9-]+:\n/); return m < 0 ? rest : rest.slice(0, m + 3); };
  const header = (body) => body.slice(0, body.indexOf('\n    steps:'));
  const board = jobBody('screen-board'), boardB = jobBody('screen-board-b');
  assert.equal(header(boardB).match(/runs-on: .*/)[0], header(board).match(/runs-on: .*/)[0], '보드 둘째 잡은 보드 잡과 같은 실행기 선택식을 쓴다');
  assert.match(header(boardB), /contains\(format\(',\{0\},', needs\.screen-changes\.outputs\.jobs\), ',screen-board,'\)/, '보드 둘째 잡은 screen-board가 골릴 때 돈다');
  for (const [job, token] of Object.entries(JOB_TOKEN)) {
    assert.ok(header(jobBody(job)).includes(`',${token},'`), `${job}의 if는 고르기 이름 ${token}을 본다`);
  }
  const needs = workflow.slice(workflow.indexOf('  preview:')).match(/needs: \[([^\]]+)\]/)[1].split(',').map((s) => s.trim());
  assert.ok(needs.includes('screen-board-b'), '보드 둘째 잡이 모음 잡 needs에 있다');
  assert.ok(!needs.includes('visual'), '겉모습 비교(알림용)는 필수 검사가 기다리지 않는다');
  // 모음 잡: 보드 둘째 잡도 실패·취소는 실패, 고른 이름에서 건너뛰면 실패, 고르지 않았을 때만 건너뜀 통과.
  const gate = (j) => ({ result: 'success', outputs: { changed: 'true', jobs: j } });
  assert.equal(checkScreenResults({ 'screen-changes': gate('all'), 'screen-board-b': { result: 'failure' }, deploy: { result: 'success' } }).ok, false);
  assert.equal(checkScreenResults({ 'screen-changes': gate('screen-board'), 'screen-board-b': { result: 'skipped' }, deploy: { result: 'success' } }).ok, false, '보드를 골랐는데 보드 둘째가 건너뛰면 실패');
  assert.equal(checkScreenResults({ 'screen-changes': gate('screen-home'), 'screen-board-b': { result: 'skipped' }, deploy: { result: 'success' } }).ok, true, '보드를 고르지 않았으면 건너뜀 통과');
  // 공통 검사기: a는 이름 거르기 없이 파일 전부(새 시험도 여기서 돈다), b·c는 #657 두 시험만 각자 조합으로 돈다.
  const audit = {};
  for (const s of ['a', 'b', 'c']) {
    const runs = jobBody(`screen-audit-${s}`).match(/LT_SCREEN_AUDIT_SHARD=\w .*tests\/v41-screen-audit\.test\.mjs/g) || [];
    assert.equal(runs.length, 1, `공통 검사기 ${s}는 검사 파일을 한 번 돈다`);
    assert.ok(runs[0].startsWith(`LT_SCREEN_AUDIT_SHARD=${s} `), `공통 검사기 ${s}는 자기 조합을 고른다`);
    audit[s] = runs[0];
  }
  // a는 '#657 후속'만 빼고 전부(새 시험도 a), b는 #657 두 시험만, c는 #657 두 시험과 '#657 후속'. 셋을 합치면 파일 전부다.
  assert.equal((audit.a.match(/--test-(name|skip)-pattern='[^']*'/g) || []).join(' '), "--test-skip-pattern='^#657 후속'", 'a는 #657 후속만 뺀다');
  assert.equal((audit.b.match(/--test-(name|skip)-pattern='[^']*'/g) || []).join(' '), "--test-name-pattern='^#657 화면 공통 검사기'", 'b는 #657 두 시험만 돈다');
  assert.equal((audit.c.match(/--test-(name|skip)-pattern='[^']*'/g) || []).join(' '), "--test-name-pattern='^#657 화면 공통 검사기' --test-name-pattern='^#657 후속'", 'c는 #657 두 시험과 #657 후속을 돈다');
  const auditSrc = readFileSync(new URL('./v41-screen-audit.test.mjs', import.meta.url), 'utf8');
  const auditNames = [...auditSrc.matchAll(/^test\('([^']+)'/gm)].map((m) => m[1]);
  const shardTests = auditNames.filter((n) => /^#657 화면 공통 검사기/.test(n));
  assert.equal(shardTests.length, 2, '#657 거르기에 걸리는 시험은 조합을 나눠 도는 두 시험뿐이다');
  const followTests = auditNames.filter((n) => /^#657 후속/.test(n));
  assert.ok(followTests.length >= 1 && followTests.every((n) => !/^#657 화면 공통 검사기/.test(n)), 'c로 넘긴 #657 후속 시험이 있고 두 거르기는 겹치지 않는다');
  assert.ok(auditSrc.includes('process.env.LT_SCREEN_AUDIT_SHARD'), '두 시험은 shard 환경값으로 조합을 고른다');
  // 겉모습 비교(알림용): deploy 하나만 기다리고, before·after 캡처를 한 단계에서 동시에 찍은 뒤 둘 다 기다린다.
  const visual = jobBody('visual');
  assert.match(header(visual), /\n    needs: deploy\n/, '알림용 잡은 deploy만 기다린다');
  assert.match(visual, /shoot before "\$BEFORE_BASE" visual-before & p1=\$!\n\s+shoot after "\$AFTER_BASE" visual-after & p2=\$!\n\s+wait \$p1; wait \$p2/, 'before·after를 동시에 찍고 둘 다 기다린다');
  assert.match(visual, /timeout -k 15 420 node tools\/visual-baseline\/visual-baseline\.mjs capture/, '캡처 명령 상한 7분은 그대로다');
  // 동시 캡처로 before가 5분 상한 안에 한 장 덜 찍던 것(19 → 18장)을 되돌린다: 이 단계에 한해 장 수 상한을 늘린다.
  // 도구 기본값(5분)보다 짧아지지 않고, 상한 + 마지막 한 장(SHOT_BUDGET_MS) + 준비 30초가 명령 상한 420초 안에 든다.
  const tool = readFileSync(new URL('../tools/visual-baseline/visual-baseline.mjs', import.meta.url), 'utf8');
  const toolDefault = Number(tool.match(/process\.env\.LT_VISUAL_BUDGET_MS \|\| (\d+)/)[1]);
  const shotBudget = Number(tool.match(/const SHOT_BUDGET_MS = (\d+);/)[1]);
  const budget = Number((visual.match(/\n          LT_VISUAL_BUDGET_MS: '(\d+)'\n/) || [])[1]);
  assert.ok(budget > toolDefault, `동시 캡처 단계의 장 수 상한(${budget})이 도구 기본값(${toolDefault})보다 길다`);
  assert.ok(budget + shotBudget + 30000 <= 420000, `장 수 상한 ${budget} + 한 장 ${shotBudget} + 준비 30초가 명령 상한 420초 안에 든다`);
  assert.ok(!/capture-(before|after)/.test(visual), '옛 단계 출력 이름이 남지 않는다');
  assert.match(visual, /steps\.capture\.outputs\.before_status[\s\S]*steps\.capture\.outputs\.after_status/, '요약 표가 두 캡처의 종료 코드를 읽는다');
});
