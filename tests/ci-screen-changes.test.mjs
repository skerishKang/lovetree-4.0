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

test('#1611 unowned tests run all rather than silently skip', async () => {
  const { selectJobs } = await import('../tools/ci/screen-changes.mjs');
  assert.equal(selectJobs(['tests/shared-auth-pages.test.mjs','tests/v41-community.test.mjs','tests/v41-share-api.test.mjs','tests/v41-share-readonly.test.mjs']),'all');
});

test('화면 시험 파일·helpers를 건드린 PR은 판정 참 — 화면 잡이 돈다', () => {
  for (const f of ['tests/v41-screen-audit.test.mjs', 'tests/helpers/screen-audit.mjs', 'tests/v41-map-theme-flow.test.mjs']) {
    const r = classify([f], screen, helpers);
    assert.equal(r.changed, true, `${f}: ${JSON.stringify(r.reasons)}`);
  }
});

test('#1611 source and workflow changes are conservative, docs alone are not', () => {
  for(const f of ['public/v41/shell.css','src/views/orbit.js','.github/workflows/preview-check.yml','.github/workflows/ci.yml','src/server/community-service.js','src/new-thing.js']) assert.equal(classify([f],screen,helpers).changed,true,f);
  assert.equal(classify(['docs/HANDOFF.md'],screen,helpers).changed,false);
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
test('#1611 shared server, API, build, tools, workflow and unknown paths run all', async () => {
  const { selectScreens,selectJobs } = await import('../tools/ci/screen-changes.mjs');
  for(const f of ['server/http.js','functions/index.js','src/server/community-service.js','tools/random-helper.mjs','tools/postdeploy/postdeploy.mjs','tools/visual-baseline/visual-baseline.mjs','tools/v41-modulepreload.mjs','public/v41/shell.css','package-lock.json','vite.config.js','.github/workflows/ci.yml','tests/unknown.test.mjs']) {
    assert.equal(selectScreens([f]),'all',f); assert.equal(selectJobs([f]),'all',f);
  }
  assert.equal(selectJobs([]),'all');
  assert.equal(selectJobs(['docs/a.md','README.md']),'none');
});

test('#1611 map selection follows screen ownership and shared fallback', async () => {
  const { mapChanged } = await import('../tools/ci/screen-changes.mjs');
  for(const f of ['public/v41/views/network/network.js','tests/v41-map-contrast.test.mjs','tests/helpers/map-contrast.mjs','public/v41/identity.css','.github/workflows/preview-check.yml','public/v41/shell/auth.mjs','public/v41/sitemap.xml']) assert.equal(mapChanged([f]),true,f);
  assert.equal(mapChanged(['public/v41/views/board/board.js']),false);
  assert.equal(mapChanged(['docs/a.md']),false);
});

test('화면 잡 고르기: 보드만 바뀌면 보드 잡, 공용 파일이 섞이면 전부', async () => {
  const { selectJobs, jobTestFiles, screenTestFiles, helperFiles } = await import('../tools/ci/screen-changes.mjs');
  const tests = screenTestFiles();
  const screen = new Set(tests), helpers = new Set(helperFiles(tests)), jobs = jobTestFiles();
  assert.ok(jobs['screen-board'].has('tests/v41-board-pinboard-582.test.mjs'), '보드 잡의 시험 파일을 읽는다');
  assert.ok(selectJobs(['public/v41/views/board/board.js', 'public/v41/views/track58-pinboard.html'], jobs, screen, helpers).split(',').includes('screen-board'));
  assert.equal(selectJobs(['tests/v41-board-pinboard-582.test.mjs', 'docs/a.md', 'server/x.js'], jobs, screen, helpers), 'all');
  assert.ok(selectJobs(['tests/v41-book-single-537.test.mjs'], jobs, screen, helpers).split(',').includes('screen-book'));
  assert.ok(selectJobs(['tests/v41-explore-moments-1025.test.mjs'], jobs, screen, helpers).split(',').includes('screen-reload'));
  assert.ok(selectJobs(['tests/v41-home-screen-952.test.mjs'], jobs, screen, helpers).split(',').includes('screen-home'));
  assert.ok(selectJobs(['tests/v41-account-settings.test.mjs'], jobs, screen, helpers).split(',').includes('screen-shell-extra'));
  assert.ok(selectJobs(['tests/v41-970-cleanup-fab.test.mjs'], jobs, screen, helpers).split(',').includes('screen-shell'));
  assert.equal(selectJobs(['public/v41/views/board/board.js', 'public/v41/shell.css'], jobs, screen, helpers), 'all');
  assert.equal(selectJobs(['tests/helpers/screen-audit.mjs'], jobs, screen, helpers), 'all');
  assert.ok(selectJobs(['src/views/orbit.js'], jobs, screen, helpers).split(',').includes('screen-home'));
  assert.equal(selectJobs(['.github/workflows/preview-check.yml'], jobs, screen, helpers), 'all');
  assert.equal(selectJobs(['tests/v41-screen-audit.test.mjs'], jobs, screen, helpers), 'all');
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
  assert.ok(selectJobs([shelf], jobs, screen, helpers).split(',').includes('screen-shelf'));
  assert.equal(mapChanged([shelf]), false, '서재·날짜 시험만 바뀌면 지도 시험은 돌지 않는다');
  assert.ok(selectJobs(['public/v41/views/shelf/shelf-views.mjs'], jobs, screen, helpers).split(',').includes('screen-shelf'));
  assert.ok(selectJobs(['tests/v41-map-contrast.test.mjs'], jobs, screen, helpers).split(',').includes('screen-map-a'));
  assert.equal(mapChanged(['tests/v41-map-contrast.test.mjs']), true, '지도 시험만 바뀌면 지도 대비는 돈다');
  const workflow = readFileSync(new URL('../.github/workflows/preview-check.yml', import.meta.url), 'utf8');
  const needs = workflow.slice(workflow.indexOf('  preview:')).match(/needs: \[([^\]]+)\]/)[1].split(',').map((s) => s.trim());
  assert.ok(needs.includes('screen-shelf') && needs.includes('screen-map-a') && needs.includes('screen-audit-a'), '새 잡·지도 대비·공통 검사기 a가 모음 잡 needs에 있다');
  assert.match(workflow, /\n    name: 화면 시험 — 서재·날짜\n/, '새 잡 이름');
  assert.match(workflow, /\n    name: 미리보기 postdeploy\(로그아웃\)\n/, '필수 검사 이름은 그대로다');
});

test('#1611 aggregate accepts only complete selected results', async () => {
  const { SELECTABLE_JOBS } = await import('../tools/ci/screen-changes.mjs');
  const { checkScreenResults } = await import('../tools/ci/screen-results.mjs');
  const build = (jobs, changed = 'true') => ({
    'screen-changes': {result:'success',outputs:{changed,jobs}},
    deploy:{result:'success'},
    ...Object.fromEntries(SELECTABLE_JOBS.map(j => [j,{result:jobs==='all'||jobs.split(',').includes(j)?'success':'skipped'}]))
  });
  for (const jobs of ['screen-board','screen-home,screen-home-1284','all']) {
    assert.equal(checkScreenResults(build(jobs)).ok,true);
    const picked=jobs==='all'?'screen-home-1284':jobs.split(',')[0];
    for (const result of ['failure','cancelled','skipped']) {
      const n=build(jobs); n[picked]={result}; assert.equal(checkScreenResults(n).ok,false);
    }
    const n=build(jobs); delete n[picked]; assert.equal(checkScreenResults(n).ok,false);
  }
  assert.equal(checkScreenResults(build('none','false')).ok,true);
  assert.equal(checkScreenResults(build('none')).ok,false);
  assert.equal(checkScreenResults(build('unknown')).ok,false);
  assert.equal(checkScreenResults(build('')).ok,false);
  const n=build('screen-board'); n['screen-book']={result:'failure'}; assert.equal(checkScreenResults(n).ok,false);
});

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
  assert.equal(tokenOf('screen-board-b'), 'screen-board-b');
  assert.equal(tokenOf('screen-board'), 'screen-board');
  assert.ok(selectJobs(['public/v41/views/board/board.js'], jobs, screen, helpers).split(',').includes('screen-board'));
  assert.ok(selectJobs(['tests/v41-orbit-535-float-overlap.test.mjs'], jobs, screen, helpers).split(',').includes('screen-board-b'));
  assert.equal(selectJobs(['tests/v41-share-guest-635.test.mjs'], jobs, screen, helpers), 'all');
  assert.ok(selectJobs(['tests/v41-1284-home.test.mjs'], jobs, screen, helpers).split(',').includes('screen-home-1284'));
  const workflow = readFileSync(new URL('../.github/workflows/preview-check.yml', import.meta.url), 'utf8');
  const jobBody = (key) => { const s = workflow.indexOf(`\n  ${key}:\n`); const rest = workflow.slice(s + 1); const m = rest.slice(3).search(/\n  [a-z0-9-]+:\n/); return m < 0 ? rest : rest.slice(0, m + 3); };
  const header = (body) => body.slice(0, body.indexOf('\n    steps:'));
  const board = jobBody('screen-board'), boardB = jobBody('screen-board-b');
  assert.equal(header(boardB).match(/runs-on: .*/)[0], header(board).match(/runs-on: .*/)[0], '보드 둘째 잡은 보드 잡과 같은 실행기 선택식을 쓴다');
  assert.ok(header(boardB).includes("',screen-board-b,'"));
  for (const [job, token] of Object.entries(JOB_TOKEN)) {
    assert.ok(header(jobBody(job)).includes(`',${token},'`), `${job}의 if는 고르기 이름 ${token}을 본다`);
  }
  const needs = workflow.slice(workflow.indexOf('  preview:')).match(/needs: \[([^\]]+)\]/)[1].split(',').map((s) => s.trim());
  assert.ok(needs.includes('screen-board-b'), '보드 둘째 잡이 모음 잡 needs에 있다');
  assert.ok(!needs.includes('visual'), '겉모습 비교(알림용)는 필수 검사가 기다리지 않는다');
  // 모음 잡: 보드 둘째 잡도 실패·취소는 실패, 고른 이름에서 건너뛰면 실패, 고르지 않았을 때만 건너뜀 통과.
  const gate = (j) => ({ result: 'success', outputs: { changed: 'true', jobs: j } });
  const complete = (j, override) => ({'screen-changes':gate(j),deploy:{result:'success'},...Object.fromEntries(Object.keys(jobs).map(k=>[k,{result:j==='all'||j.split(',').includes(k)?'success':'skipped'}])),...override});
  assert.equal(checkScreenResults(complete('all', {'screen-board-b':{result:'failure'}})).ok, false);
  assert.equal(checkScreenResults(complete('screen-board,screen-board-b', {'screen-board-b':{result:'skipped'}})).ok, false, '보드를 골랐는데 보드 둘째가 건너뛰면 실패');
  assert.equal(checkScreenResults(complete('screen-home', {'screen-board-b':{result:'skipped'}})).ok, true, '보드를 고르지 않았으면 건너뜀 통과');
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
  assert.match(header(visual), /\n    needs: \[deploy, screen-changes\]\n/);
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


test('#1611 schedule, visual selection and every original screen command are preserved', async () => {
  const { visualScenes, selectScreens, SELECTABLE_JOBS } = await import('../tools/ci/screen-changes.mjs');
  const { screenCommandContract } = await import('../tools/ci/screen-commands.mjs');
  const baseline = JSON.parse(readFileSync(new URL('../tools/ci/screen-commands.baseline.json',import.meta.url),'utf8'));
  const after = readFileSync(new URL('../.github/workflows/preview-check.yml', import.meta.url),'utf8');
  assert.equal(baseline.sourceRevision,'9896d3a1397dfac19ef7f20cdcf14001fb952cd6','기준은 승인된 9896d3a1 워크플로');
  assert.match(after, /cron: "0 2,10,18 \* \* \*"/);
  assert.match(after, /workflow_dispatch:/);
  assert.match(after, /--scenes "\$SCENES"/);
  assert.match(after, /screens: \$\{\{ steps\.diff\.outputs\.screens \}\}/);
  assert.equal(visualScenes('home'), 'home');
  assert.equal(visualScenes('map'), 'network');
  assert.equal(visualScenes('none'), '');
  assert.equal(visualScenes('shell'), 'home,shelf,book,board,network,account');
  assert.equal(selectScreens(['docs/notes.md']), 'none');
  assert.deepEqual(Object.keys(baseline.jobs).sort(),[...SELECTABLE_JOBS].sort(),'기존 16개 잡의 누락·추가를 막는다');
  const current = screenCommandContract(after,SELECTABLE_JOBS);
  for (const job of SELECTABLE_JOBS)
    assert.deepEqual(current[job],baseline.jobs[job],job+': 9896d3a1 기준 시험 파일·명령·timeout·retry 보존');
  // #1620 자체 실행기별 npm 캐시 준비는 테스트 명령이 아니며 그대로 남겨야 한다.
  assert.match(after,/run: echo "npm_config_cache=\$HOME\/\.npm-runner-\$RUNNER_NAME" >> "\$GITHUB_ENV"/);
});

test('#1616 dedicated home source picks five owner jobs, A/B/C and only home visuals', async () => {
  const { selectScreens, selectJobs, visualScenes, jobTestFiles } =
    await import('../tools/ci/screen-changes.mjs');
  const { TEST_OWNERS } = await import('../tools/ci/screen-owners.mjs');
  const homeJobs = [
    'screen-board-b','screen-home','screen-home-followup','screen-home-1284','screen-shell',
    'screen-audit-a','screen-audit-b','screen-audit-c'
  ];
  for (const source of [
    'src/views/orbit.js','src/views/orbit-canvas.js','src/views/orbit-source.css',
    'src/views/orbit-samples.json'
  ]) {
    assert.equal(selectScreens([source]), 'home', source);
    assert.ok(homeJobs.every(job => selectJobs([source]).split(',').includes(job)), source);
    assert.equal(visualScenes(selectScreens([source])),'home',source);
  }
  assert.deepEqual(TEST_OWNERS['tests/v41-home-card-1077.test.mjs'],['home','shell']);
  assert.deepEqual(TEST_OWNERS['tests/v41-orbit-535-float-overlap.test.mjs'],['home']);
  assert.ok(TEST_OWNERS['tests/v41-logo-home.test.mjs'].includes('shell'));
  const jobTests=jobTestFiles();
  assert.ok(jobTests['screen-shell'].has('tests/v41-home-card-1077.test.mjs'));
  assert.ok(jobTests['screen-board-b'].has('tests/v41-orbit-535-float-overlap.test.mjs'));
  assert.ok(jobTests['screen-shell-extra'].has('tests/v41-logo-home.test.mjs'));
  assert.ok(selectJobs(['src/views/orbit.js']).split(',').includes('screen-shell-extra'));
});

test('#1616 dedicated board/book/shelf/map, shared shell, and shell ownership contracts', async () => {
  const { selectScreens, selectJobs, visualScenes } =
    await import('../tools/ci/screen-changes.mjs');
  const { TEST_OWNERS } = await import('../tools/ci/screen-owners.mjs');
  const cases = [
    {file:'public/v41/views/board/board.js',screen:'board',visual:'board',
      jobs:['screen-board','screen-board-b','screen-home-followup','screen-shell-extra','screen-audit-a','screen-audit-b','screen-audit-c','screen-book-screen']},
    {file:'public/v41/views/book/book.js',screen:'book',visual:'book',
      jobs:['screen-home-followup','screen-book','screen-audit-a','screen-audit-b','screen-audit-c','screen-reload','screen-map-b','screen-book-screen']},
    {file:'public/v41/views/shelf/shelf.js',screen:'shelf',visual:'shelf',
      jobs:['screen-shell-extra','screen-audit-a','screen-audit-b','screen-audit-c','screen-shelf']},
    {file:'public/v41/views/network/network.js',screen:'map',visual:'network',
      jobs:['screen-board','screen-audit-a','screen-audit-b','screen-audit-c','screen-map-a','screen-map-b']}
  ];
  for (const {file,screen,visual,jobs} of cases) {
    assert.equal(selectScreens([file]),screen,file);
    assert.ok(jobs.every(job=>selectJobs([file]).split(',').includes(job)),file);
    assert.equal(visualScenes(selectScreens([file])),visual,file);
    const nonAudit=jobs.filter(x=>!x.startsWith('screen-audit-'));
    assert.ok(nonAudit.length >= 2, file+' non-audit group');
  }
  assert.equal(selectScreens(['public/v41/shell.css']),'all');
  assert.equal(selectJobs(['public/v41/shell.css']),'all');
  assert.equal(selectScreens(['public/v41/shell/header.mjs']),'all');
  assert.equal(selectJobs(['public/v41/shell/header.mjs']), 'all');
  assert.equal(selectJobs(['public/v41/shell/header.mjs']).split(',').length, 1);
  for (const [name,owners] of Object.entries(TEST_OWNERS)) {
    assert.ok(owners.length>0,name);
    assert.ok(owners.every(x=>['home','board','book','shelf','map','shell','explore/settings','common'].includes(x)),name);
  }
});

test('#1616 shared modules imported by multiple screen areas always select all', async () => {
  const { selectScreens, selectJobs } = await import('../tools/ci/screen-changes.mjs');
  const { readdirSync } = await import('node:fs');
  const { relative, resolve } = await import('node:path');
  const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const seen = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes:true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(?:js|mjs)$/.test(entry.name)) seen.push(full);
    }
  };
  visit(resolve(root, 'public/v41'));
  const shared = [
    'public/v41/book-usability.mjs',
    'public/v41/home-route.js',
    'public/v41/home-title-state.mjs'
  ];
  for (const file of shared) {
    const filename = file.split('/').at(-1);
    const importers = seen.filter(p => p !== resolve(root,file) &&
      readFileSync(p,'utf8').includes(filename));
    if (file.endsWith('book-usability.mjs')) assert.ok(importers.length >= 2, file + ': real consumers missing');
    assert.equal(selectScreens([file]),'all',file);
    assert.equal(selectJobs([file]),'all',file);
  }
});

test('#1616 all explicit page openings in screen tests belong to their owner screens', async () => {
  const { TEST_OWNERS } = await import('../tools/ci/screen-owners.mjs');
  const { jobTestFiles } = await import('../tools/ci/screen-changes.mjs');
  const paths = {
    'track58-pinboard.html':'board','track59-sketchbook.html':'book',
    'track32-bookshelf.html':'shelf','track56-network.html':'map'
  };
  const tested = new Set(Object.values(jobTestFiles()).flatMap(files=>[...files]));
  for (const file of tested) {
    if (!file.endsWith('.test.mjs')) continue;
    const body = readFileSync(new URL('../'+file,import.meta.url),'utf8');
    const required = new Set();
    for (const [route, owner] of Object.entries(paths))
      if (body.includes(route)) required.add(owner);
    for (const owner of required) {
      assert.ok(TEST_OWNERS[file]?.includes(owner) || TEST_OWNERS[file]?.includes('common'),
        file+' opens '+owner+' without ownership');
    }
  }
  assert.deepEqual(TEST_OWNERS['tests/v41-tree-line-view-row.test.mjs'],
    ['book','board','shelf','map','shell']);
});

test('#1616 command preservation detects a deliberate mutation', async () => {
  const { screenCommandContract } = await import('../tools/ci/screen-commands.mjs');
  const baseline = JSON.parse(readFileSync(new URL('../tools/ci/screen-commands.baseline.json',import.meta.url),'utf8'));
  const after = readFileSync(new URL('../.github/workflows/preview-check.yml',import.meta.url),'utf8');
  const job = 'screen-book';
  const commands = text => screenCommandContract(text,[job])[job];
  assert.deepEqual(commands(after),baseline.jobs[job],'정상 화면 시험 명령은 고정 기준과 일치');
  const mutated = after.replace(/(  screen-book:[\s\S]*?node --test)(?=[^\n]*tests\/v41-book-)/,(_,prefix)=>prefix+' --test-concurrency=999');
  assert.notEqual(mutated,after,'실제 시험 명령 한 줄을 바꾼다');
  assert.notDeepEqual(commands(mutated),baseline.jobs[job],'고정 기준 파일로 변경을 검출한다');
});

test('#1616 cross-screen imports cannot narrow root modules to one screen', async () => {
  const { selectScreens } = await import('../tools/ci/screen-changes.mjs');
  const { readdirSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const base = new URL('../public/v41/',import.meta.url);
  const modules = readdirSync(base).filter(name => /\.(?:mjs|js)$/.test(name));
  const consumers = [];
  const walk = url => {
    for (const item of readdirSync(url,{withFileTypes:true})) {
      const next = new URL(item.name+(item.isDirectory()?'/':''),url);
      if(item.isDirectory())walk(next);
      else if(/\.(?:mjs|js)$/.test(item.name))consumers.push({path:next.pathname,text:readFileSync(next,'utf8')});
    }
  };
  walk(new URL('views/',base));
  for(const module of modules) {
    const usedBy = new Set(consumers.filter(c=>c.text.includes(module)).map(c=>{
      const match = c.path.match(/\/views\/([^/]+)\//);
      return match?.[1];
    }).filter(Boolean));
    if(usedBy.size>=2) assert.equal(selectScreens(['public/v41/'+module]),'all',module);
  }
});
