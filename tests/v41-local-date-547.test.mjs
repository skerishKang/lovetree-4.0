// #547: 새벽에 남긴 순간이 하루 전 날짜로 찍히던 문제.
// '오늘'을 new Date().toISOString()(UTC)으로 만들면 한국 시간 0시~9시에는 하루 전이 된다.
// 여기서는 (1) 지역 날짜 함수를 시간대 경계에서 실제로 돌려 보고, (2) 순간 입력 기본값이 그 함수를 쓰는지,
// (3) 실제 브라우저(시간대 고정)에서도 그 기기의 오늘이 나오는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localDateOnly } from '../public/v41/local-date.mjs';
import { localDateOnly as serverLocalDateOnly, validateMomentInput as serverValidate } from '../src/domain.js';
import * as webDomain from '../public/v41/domain.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/* ── 1. 함수 자체: 지역 연·월·일을 그대로 적는다 ───────────────────── */
test('#547 지역 날짜 함수: 기기의 연·월·일을 두 자리로 적는다', () => {
  assert.equal(localDateOnly(new Date(2026, 10, 14, 0, 30)), '2026-11-14', '자정 직후도 그날');
  assert.equal(localDateOnly(new Date(2026, 10, 14, 23, 59)), '2026-11-14', '자정 직전도 그날');
  assert.equal(localDateOnly(new Date(2026, 0, 1, 0, 0)), '2026-01-01', '월·일 두 자리 채움');
  assert.equal(localDateOnly(new Date(2026, 11, 31, 12, 0)), '2026-12-31', '해 끝');
  assert.equal(localDateOnly(1763000000000).length, 10, '타임스탬프도 받는다');
  assert.match(localDateOnly(new Date('틀린 값')), /^\d{4}-\d{2}-\d{2}$/, '잘못된 값이면 지금으로 본다');
  // 서버가 쓰는 같은 규칙(src/domain.js)도 같은 답을 낸다.
  for (const at of [new Date(2026, 10, 14, 0, 30), new Date(2026, 2, 2, 8, 59)]) {
    assert.equal(serverLocalDateOnly(at), localDateOnly(at), '두 벌(클라이언트·서버) 같은 규칙');
  }
});

/* ── 2. 시간대 경계: 자식 프로세스에 TZ를 고정해 실제로 돌린다 ──────── */
function runInZone(tz, iso, expression) {
  const asUrl = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);
  const code = `import { localDateOnly } from ${asUrl('public/v41/local-date.mjs')};
import { validateMomentInput } from ${asUrl('public/v41/domain.mjs')};
const at = new Date(${JSON.stringify(iso)});
const answer = ${expression};
console.log(JSON.stringify(answer));`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
    cwd: ROOT
  });
  return JSON.parse(out.trim().split('\n').at(-1));
}

const CASES = [
  // [시간대, 그 지역 시각, 그 순간의 UTC 시각, 기대하는 그 지역 오늘]
  ['Asia/Seoul', '2026-11-14 00:30', '2026-11-13T15:30:00Z', '2026-11-14'],
  ['Asia/Seoul', '2026-11-14 00:59', '2026-11-13T15:59:00Z', '2026-11-14'],
  ['Asia/Seoul', '2026-11-14 08:59', '2026-11-13T23:59:00Z', '2026-11-14'],
  ['Asia/Seoul', '2026-11-14 09:00', '2026-11-14T00:00:00Z', '2026-11-14'],
  ['Asia/Seoul', '2026-11-14 23:59', '2026-11-14T14:59:00Z', '2026-11-14'],
  ['America/Los_Angeles', '2026-11-13 00:30', '2026-11-13T08:30:00Z', '2026-11-13'],
  ['America/Los_Angeles', '2026-11-13 23:59', '2026-11-14T07:59:00Z', '2026-11-13']
];

for (const [tz, label, iso, expected] of CASES) {
  test(`#547 ${tz} ${label} → 오늘은 ${expected}`, () => {
    assert.equal(runInZone(tz, iso, 'localDateOnly(at)'), expected, '기기의 지역 날짜');
  });
}

test('#547 고치기 전 계산(UTC)은 새벽에 하루 전이었다 — 고친 뒤에는 그날이 나온다', () => {
  // 한국 시간 2026-11-14 00:30 = UTC 2026-11-13 15:30. 예전 식은 11-13을 냈다.
  const old = runInZone('Asia/Seoul', '2026-11-13T15:30:00Z', 'at.toISOString().slice(0, 10)');
  const now = runInZone('Asia/Seoul', '2026-11-13T15:30:00Z', 'localDateOnly(at)');
  assert.equal(old, '2026-11-13', '예전(UTC) 식은 하루 전');
  assert.equal(now, '2026-11-14', '고친 식은 그날');
});

/* ── 3. 순간 입력 기본값이 그 함수를 쓴다 ───────────────────────────── */
test('#547 순간 만들기의 기본 날짜는 기기의 오늘이고, UTC 날짜와 다를 때는 UTC가 아니다', () => {
  const zone = pickZoneDifferingFromUtc();
  const answer = runInZone(zone, new Date().toISOString(), `(() => {
    const local = localDateOnly(new Date());
    const utc = new Date().toISOString().slice(0, 10);
    const moment = validateMomentInput({ title: '기본 날짜 확인' });
    return { local, utc, date: moment.date };
  })()`);
  assert.notEqual(answer.local, answer.utc, `고른 시간대(${zone})에서는 지역 날짜와 UTC 날짜가 다르다 — 시험이 뜻이 있으려면`);
  assert.equal(answer.date, answer.local, '순간 기본 날짜 = 기기의 오늘');
  assert.notEqual(answer.date, answer.utc, 'UTC 날짜가 아니다(이 자리에서 고친 결함)');
});

test('#547 두 벌(클라이언트·서버) 모두 기본 날짜가 지역 날짜 함수 결과와 같다', () => {
  const day = webDomain.validateMomentInput({ title: '클라이언트 기본 날짜' }).date;
  assert.equal(day, localDateOnly(), 'public/v41/domain.mjs');
  assert.equal(serverValidate({ title: '서버 기본 날짜' }).date, serverLocalDateOnly(), 'src/domain.js');
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
});

test('#547 날짜 형식 검사는 그대로다(오늘 계산이 아니라 입력 검사)', () => {
  assert.throws(() => webDomain.validateMomentInput({ title: 'x', date: '2026-02-30' }), /날짜/, '없는 날짜');
  assert.throws(() => webDomain.validateMomentInput({ title: 'x', date: '2026-1-1' }), /날짜/, '두 자리 아님');
  assert.equal(webDomain.validateMomentInput({ title: 'x', date: '2026-11-14' }).date, '2026-11-14', '맞는 날짜는 그대로');
});

test('#547 보드도 같은 한 벌을 쓴다 — 클래식 스크립트는 local-date.js(window.LTLocalDate)', () => {
  // 보드 화면은 클래식 스크립트라 모듈 대신 window.LTLocalDate를 읽는다. 규칙은 같은 파일 한 벌이다.
  const board = read('public/v41/views/board/board.js');
  assert.match(board, /date:LTLocalDate\.localDateOnly\(\),source:type==='photo'/, '새 순간 기본 날짜');
  assert.match(board, /Number\.isNaN\(d\.getTime\(\)\)\?LTLocalDate\.localDateOnly\(\):LTLocalDate\.localDateOnly\(d\)\}/, '날짜 표기의 오늘 기본값도 지역 날짜');
  assert.match(read('public/v41/views/board/board-extras.js'), /date:LTLocalDate\.localDateOnly\(\),source,memo/, '보드 추가 창');
  assert.match(read('public/v41/views/board/board-detail.js'), /date:LTLocalDate\.localDateOnly\(\)/, '보드 상세');
  for (const file of ['public/v41/views/board/board.js', 'public/v41/views/board/board-extras.js', 'public/v41/views/board/board-detail.js']) {
    assert.doesNotMatch(read(file), /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/, `${file}에 UTC 오늘 계산이 남아 있다`);
  }
  assert.match(read('public/v41/views/track58-pinboard.html'), /<script src="\/v41\/local-date\.js"><\/script><script src="\/v41\/views\/board\/board-model\.js">/, '클래식 스크립트보다 먼저 읽는다');
});

test('#547 규칙은 한 벌이다 — 클래식(local-date.js)과 모듈(local-date.mjs)이 같은 답', () => {
  const classic = read('public/v41/local-date.js');
  assert.doesNotMatch(classic, /^\s*(import|export)\s/m, '클래식 스크립트로도 읽히는 문법이어야 한다');
  assert.match(classic, /root\.LTLocalDate = \{localDateOnly, localDaysBetween, relativeDayLabel\};/, '#549에서 지난 날 규칙도 이 한 벌에 둔다');
  assert.match(read('public/v41/local-date.mjs'), /import '\.\/local-date\.js';/, '모듈은 클래식 한 벌을 그대로 쓴다');
  // 실제로 두 경로가 같은 답을 내는지 이 프로세스에서 확인한다(모듈이 클래식 파일을 먼저 읽는다).
  for (const at of [new Date(2026, 10, 14, 0, 30), new Date(2026, 10, 14, 23, 59)]) {
    assert.equal(globalThis.LTLocalDate.localDateOnly(at), localDateOnly(at), '클래식과 모듈 같은 답');
  }
});

test('#547 오늘을 UTC로 만드는 자리가 남아 있지 않다(보드 제외)', () => {
  const files = [
    'public/v41/domain.mjs',
    'public/v41/shell/panels.mjs',
    'public/v41/views/shelf/shelf.js',
    'src/domain.js',
    'src/main.js',
    'public/v41/views/board/board.js',
    'public/v41/views/board/board-extras.js',
    'public/v41/views/board/board-detail.js'
  ];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/, `${file}에 UTC 오늘 계산이 남아 있다`);
  }
  // 이번에 고친 파일들이 공통 함수를 쓴다.
  assert.match(read('public/v41/domain.mjs'), /import \{ localDateOnly \} from '\.\/local-date\.mjs'/);
  assert.match(read('public/v41/domain.mjs'), /const date = input\.date \|\| localDateOnly\(\)/);
  assert.match(read('public/v41/shell/panels.mjs'), /import \{localDateOnly\} from '\.\.\/local-date\.mjs'/);
  assert.match(read('public/v41/shell/panels.mjs'), /form\.elements\.date\.value = localDateOnly\(\)/);
  assert.match(read('public/v41/shell/panels.mjs'), /name === 'date' \? localDateOnly\(\)/);
  assert.match(read('public/v41/views/shelf/shelf.js'), /import \{ localDateOnly \} from '\.\.\/\.\.\/local-date\.mjs'/);
  assert.match(read('public/v41/views/shelf/shelf.js'), /lastDate:localDateOnly\(\)/);
  assert.match(read('src/domain.js'), /export function localDateOnly\(/, '서버 벌도 같은 함수');
});

/* ── 4. 실제 브라우저에서 시간대를 고정해 확인 ──────────────────────── */
async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    if (!mod.chromium || !existsSync(mod.chromium.executablePath())) return null;
    return mod;
  } catch {
    return null;
  }
}

// 시간대 이름은 브라우저가 계산한다 — 같은 순간(UTC)을 넣고 그 기기의 날짜가 나오는지 본다.
const BROWSER_CASES = [
  ['Asia/Seoul', '2026-11-13T15:30:00Z', '2026-11-14'],
  ['Asia/Seoul', '2026-11-13T23:59:00Z', '2026-11-14'],
  ['Asia/Seoul', '2026-11-14T00:00:00Z', '2026-11-14'],
  ['Asia/Seoul', '2026-11-14T14:59:00Z', '2026-11-14'],
  ['America/Los_Angeles', '2026-11-13T08:30:00Z', '2026-11-13'],
  ['America/Los_Angeles', '2026-11-14T07:59:00Z', '2026-11-13']
];

test('#547 실제 브라우저(Asia/Seoul·America/Los_Angeles): 그 기기의 오늘이 나온다', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) {
    if (process.env.LT_LOCAL_DATE_REQUIRE === '1') assert.fail('미리보기 검사에서는 이 시험의 건너뜀이 실패다 — Playwright Chromium이 없다');
    t.skip('Playwright Chromium이 없어 브라우저 시험을 건너뜀');
    return;
  }
  const { chromium } = pw;
  const server = await servePublic();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [timezoneId, iso, expected] of BROWSER_CASES) {
      const ctx = await browser.newContext({ timezoneId, viewport: { width: 800, height: 600 } });
      const page = await ctx.newPage();
      // 화면 파일을 열지 않고 모듈만 불러 확인한다(로그인·자료 없이 시간대만 본다).
      await page.goto(`${base}/v41/`, { waitUntil: 'domcontentloaded' });
      const answer = await page.evaluate(async ({ iso }) => {
        const mod = await import('/v41/local-date.mjs');
        const at = new Date(iso);
        return { local: mod.localDateOnly(at), utc: at.toISOString().slice(0, 10) };
      }, { iso });
      // 보드 화면의 클래식 스크립트 경로(window.LTLocalDate)도 같은 답인지 본다.
      await page.goto(`${base}/v41/views/track58-pinboard.html`, { waitUntil: 'domcontentloaded' });
      const classic = await page.evaluate(({ iso }) => {
        const api = globalThis.LTLocalDate;
        return api ? api.localDateOnly(new Date(iso)) : 'none';
      }, { iso });
      await ctx.close();
      assert.equal(answer.local, expected, `${timezoneId} ${iso}`);
      assert.equal(classic, expected, `보드 화면 ${timezoneId} ${iso}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
});

/* ── 도우미 ─────────────────────────────────────────────────────────── */
// 화면 파일을 그대로 서빙한다(빌드 없이 public/ 만).
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function servePublic() {
  const root = path.join(ROOT, 'public');
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(root, clean), path.join(root, clean, 'index.html')]) {
      if (!file.startsWith(root)) continue;
      try {
        if ((await stat(file)).isFile()) {
          res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
          createReadStream(file).pipe(res);
          return;
        }
      } catch {}
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
// 지금 이 순간 지역 날짜와 UTC 날짜가 다른 시간대를 하나 고른다(없으면 UTC와 늘 같은 시간대).
function pickZoneDifferingFromUtc() {
  const now = new Date();
  const utcDay = now.toISOString().slice(0, 10);
  const candidates = ['Asia/Seoul', 'Pacific/Kiritimati', 'Pacific/Midway', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC'];
  for (const zone of candidates) {
    const day = execFileSync(process.execPath, ['-e', 'console.log(new Date().toLocaleDateString("en-CA"))'], {
      env: { ...process.env, TZ: zone },
      encoding: 'utf8'
    }).trim();
    if (day !== utcDay) return zone;
  }
  return 'UTC';
}
