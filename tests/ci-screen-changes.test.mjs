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
  assert.equal(installs.length, 12, `화면 잡 12곳이 모두 잠금 파일 버전을 쓴다(실측 ${installs.length})`);
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
