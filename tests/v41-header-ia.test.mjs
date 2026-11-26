import { listenOnSafePort } from './helpers/safe-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  accountPresentation, firstLetter, treePickerLabel, treePickerText, treeViewsVisible, writeMenuLabel,
  homeCenterState, homeStartLoginUrl, HOME_LOGIN_NEXT
} from '../public/v41/header-state.mjs';
import {hasPendingDraft} from '../public/v41/sync-controller.mjs';
import {applyHomeCenter} from '../v41/home-center.js';
import {homePresentation} from '../v41/home-presentation.js';
import {createHomeActions} from '../v41/home-actions.js';
import { dismissDiscoverAskIfOpen } from './helpers/discover-ask.mjs';

const readSource = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

// 2026-11-07 상단 메뉴 재구성: 로그인/로그아웃 상태별 계정 표시와 트리 유무별 트리 선택 문구.

test('로그아웃 상태는 기존 로그인 알약, 로그인 상태는 첫 글자 동그라미', () => {
  const out = accountPresentation({owned: false});
  assert.equal(out.mode, 'login');
  assert.equal(out.label, '로그인');
  assert.equal(out.initial, '');
  assert.equal(out.ariaLabel, null, '로그아웃 상태에는 계정 메뉴 aria-label을 붙이지 않는다');

  const inState = accountPresentation({owned: true, email: 'kate@example.test'});
  assert.equal(inState.mode, 'avatar');
  assert.equal(inState.initial, 'K');
  assert.equal(inState.label, 'kate…');
  assert.equal(inState.title, 'kate@example.test', '전체 주소는 제목으로 읽는다');
  assert.equal(inState.ariaLabel, '내 계정 메뉴, kate@example.test으로 로그인됨');
  assert.equal(accountPresentation({owned: true, email: 'kate@example.test'}).ariaLabel, '내 계정 메뉴, kate@example.test으로 로그인됨');
});

test('계정 첫 글자는 이메일 앞부분의 첫 글자이고, 없으면 점으로 둔다', () => {
  assert.equal(firstLetter('kate@example.test'), 'K');
  assert.equal(firstLetter('  lee@example.test'), 'L');
  assert.equal(firstLetter('김범수@example.com'), '김');
  assert.equal(firstLetter(''), '·');
  assert.equal(firstLetter('   '), '·');
  assert.equal(firstLetter('.tess@example.test'), 'T', '기호는 건너뛰고 첫 글자를 쓴다');
});

// #368 보완 1·2: 동그라미 글자는 표시 이름 → 이메일 첫 글자 순서고 subject(usr_…) 첫 글자는 쓰지 않는다.
test('동그라미 글자는 표시 이름을 먼저 쓰고, 없으면 이메일 첫 글자를 쓴다', () => {
  assert.equal(accountPresentation({owned: true, name: '김범수', email: 'kate@example.test'}).initial, '김', '표시 이름이 있으면 그 첫 글자');
  assert.equal(accountPresentation({owned: true, email: 'fay@example.test'}).initial, 'F', '표시 이름이 없으면 이메일 첫 글자');
});

test('이메일이 없어도 subject 첫 글자는 쓰지 않고 점·내 계정으로 안전하게 둔다', () => {
  const view = accountPresentation({owned: true, subject: 'padiem|user-42'});
  assert.equal(view.mode, 'avatar');
  assert.equal(view.initial, '나', 'subject는 동그라미 글자가 아니다 — 이름·이메일이 없으면 나');
  assert.equal(view.label, '내 계정');
  assert.equal(view.ariaLabel, '내 계정 메뉴, 내 계정으로 로그인됨');
  const named = accountPresentation({owned: true, name: '러브트리', subject: 'usr_abc'});
  assert.equal(named.initial, '러', 'subject가 있어도 표시 이름을 먼저 쓴다');
});

test('트리 선택 문구는 트리가 있으면 이름, 없으면 트리 고르기', () => {
  assert.equal(treePickerLabel('그날의 공기'), '그날의 공기');
  assert.equal(treePickerLabel(''), '트리 고르기');
  assert.equal(treePickerLabel('   '), '트리 고르기');
  assert.equal(treePickerLabel(null), '트리 고르기');
  assert.equal(treePickerLabel(undefined), '트리 고르기');
});

test('헤더 주 버튼 문구는 로그인·트리·읽기 상태를 따른다', () => {
  assert.equal(writeMenuLabel({owned: false}), '처음 시작하기');
  assert.equal(writeMenuLabel({owned: true, hasTree: false}), '새 트리 만들기');
  assert.equal(writeMenuLabel({owned: true, hasTree: true, reading: false}), '순간 추가');
  assert.equal(writeMenuLabel({owned: true, hasTree: true, reading: true}), '순간 추가');
  // 이슈 644 3번: '미저장 기록'은 '저장 안 됨'으로 부른다 — 누르면 같은 설명을 연다.
  assert.equal(writeMenuLabel({owned: true, hasTree: true, reading: true, dirty: true}), '저장 안 됨');
  assert.equal(writeMenuLabel({owned: false, dirty: true}), '처음 시작하기', '로그아웃 상태에서는 미저장 표시를 쓰지 않는다');
});

test('첫 화면 로그아웃: 첫 버튼만 흰색 강조이고 문구는 처음 시작하기', () => {
  const plan = homeCenterState({member: 'out', treeCount: 0});
  assert.equal(plan.state, 'out');
  assert.equal(plan.buttons.length, 3, '버튼 개수는 그대로 3개');
  assert.deepEqual(plan.buttons.map(b => b.label), ['＋ 첫 순간 추가', '둘러보기', '어떻게 쓰나요']);
  assert.deepEqual(plan.buttons.map(b => b.emphasis), [true, false, false]);
  assert.deepEqual(plan.buttons.map(b => b.disabled), [false, false, false]);
});

test('첫 화면 로그인·트리 0: 세 자리 [순간 목록·둘러보기·내 트리] 테두리형(261116 PR 2)', () => {
  const plan = homeCenterState({member: 'in', treeCount: 2, momentCount: 0});
  assert.equal(plan.state, 'in-empty');
  assert.deepEqual(plan.buttons.map(b => b.label), ['＋ 첫 순간 추가', '둘러보기', '어떻게 쓰나요']);
  assert.deepEqual(plan.buttons.map(b => b.key), ['start', 'community', 'guide']);
  assert.deepEqual(plan.buttons.map(b => b.emphasis), [true, false, false]);
  assert.deepEqual(plan.buttons.map(b => b.disabled), [false, false, false]);
});

test('첫 화면 로그인·트리 있음: 아래 셋은 모두 밝은 단추(#1084)', () => {
  const plan = homeCenterState({member: 'in', treeCount: 2});
  assert.equal(plan.state, 'in-trees');
  assert.deepEqual(plan.buttons.map(b => b.label), ['순간 목록', '둘러보기', '서재']);
  assert.deepEqual(plan.buttons.map(b => b.emphasis), [false, false, false]);
  assert.deepEqual(plan.buttons.map(b => b.disabled), [false, false, false]);
});

test('자주색 단추는 한 화면에 하나 — 신규는 아래 첫 자리, 기존은 위쪽 \'+ 순간 추가\'(#1084)', () => {
  const out = homeCenterState({member: 'out'});
  assert.equal(out.buttons.filter(b => b.emphasis).length, 1, '로그아웃 첫 버튼');
  const empty = homeCenterState({member: 'in', treeCount: 0, momentCount: 0});
  assert.equal(empty.buttons.filter(b => b.emphasis).length, 1, '신규 첫 순간 추가');
  assert.equal(empty.buttons[0].label, '＋ 첫 순간 추가');
  const trees = homeCenterState({member: 'in', treeCount: 3});
  assert.equal(trees.buttons.filter(b => b.emphasis).length, 0, '기존은 아래 셋에 강조가 없다');
});

test('로그아웃 첫 버튼의 로그인 주소는 4.1 첫 화면으로 돌아온다', () => {
  assert.equal(HOME_LOGIN_NEXT, '/v41/');
  assert.equal(homeStartLoginUrl(), '/auth/login?next=%2Fv41%2F');
  const url = new URL(homeStartLoginUrl(), 'https://lovetree-4-0.pages.dev');
  assert.equal(url.pathname, '/auth/login');
  assert.equal(url.searchParams.get('next'), '/v41/', '공용 인증이 받는 로컬 경로 형식이어야 한다');
});

test('applyHomeCenter는 실제 버튼의 문구·강조·비활성을 상태에 맞춘다', () => {
  const make = () => {
    const attrs = {};
    return {
      textContent: '', dataset: {}, disabled: false, className: '',
      classList: {
        toggle(name, on) {
          const has = this._set?.has(name);
          this._set = this._set || new Set();
          if (on) this._set.add(name); else this._set.delete(name);
          return on;
        },
        contains(name) { return !!this._set?.has(name); }
      },
      setAttribute: (k, v) => { attrs[k] = v; },
      removeAttribute: (k) => { delete attrs[k]; },
      getAttribute: (k) => attrs[k],
      _attrs: attrs
    };
  };
  const buttons = [make(), make(), make()];
  const plan = applyHomeCenter(buttons, {member: 'in', treeCount: 0});
  assert.equal(plan.state, 'in-empty');
  assert.deepEqual(buttons.map(b => b.textContent), ['＋ 첫 순간 추가', '둘러보기', '어떻게 쓰나요']);
  assert.equal(buttons[2].hidden, false, '로그인한 화면도 셋째 자리를 쓴다(2026-11-14 대표 결정)');
  assert.equal(buttons[2].dataset.do, 'guide');
  assert.equal(buttons.some(b => b.disabled), false, '이어 보기 버튼이 없어 비활성 표시도 없다');
  assert.equal(buttons[0].classList.contains('primary-cta'), true);
  assert.equal(buttons[1].classList.contains('primary-cta'), false);
  assert.deepEqual([buttons[0].dataset.do, buttons[1].dataset.do, buttons[2].dataset.do], ['start', 'community', 'guide']);
  const logoutButtons = [make(), make(), make()];
  applyHomeCenter(logoutButtons, {member: 'out', treeCount: 0});
  assert.equal(logoutButtons[0].classList.contains('primary-cta'), true, '로그아웃 첫 버튼만 흰 강조');
});

test('첫 화면 표시 상태는 로그인·트리 수를 셸 컨텍스트에서 읽는다', () => {
  const out = homePresentation({source: 'example'});
  assert.equal(out.centerState.member, 'out');
  assert.equal(out.centerState.treeCount, 0);

  const empty = homePresentation({source: 'server', tree: null, trees: []});
  assert.equal(empty.centerState.member, 'in');
  assert.equal(empty.centerState.treeCount, 0);

  const withTree = homePresentation({source: 'server', tree: {id: 't1', moments: [{id: 'm1'}]}, trees: [{id: 't1'}, {id: 't2'}]});
  assert.equal(withTree.centerState.member, 'in');
  assert.equal(withTree.centerState.treeCount, 2);
});

test('첫 화면 로그아웃 첫 버튼은 셸에 로그인 시작을 요청한다', () => {
  const sent = [];
  const bridge = createHomeActions({getContext: () => null, send: m => sent.push(m)});
  bridge.actions.start();
  assert.deepEqual(sent, [{type: 'lt41-start'}]);
});

// #213 1번: 서버가 401이면 화면도 로그아웃으로 그린다.
test('트리 선택 글자는 로그인 상태에서만 "트리: 이름"이고 로그아웃은 "트리 고르기"다', () => {
  assert.equal(treePickerText({owned: true, treeTitle: '그날의 공기'}), '트리: 그날의 공기');
  assert.equal(treePickerText({owned: true, treeTitle: ''}), '트리 고르기');
  assert.equal(treePickerText({owned: true, treeTitle: '   '}), '트리 고르기');
  // 로그아웃이면 예시 트리가 열려 있어도 내 트리가 아니므로 이름을 보여 주지 않는다.
  assert.equal(treePickerText({owned: false, treeTitle: '좋아하는 순간들'}), '트리 고르기');
  // 브라우저에만 남은 미저장 기록은 지우지 않고 구분해 보여 준다.
  assert.equal(treePickerText({owned: false, pendingDraft: true}), '저장 안 된 기록');
  assert.equal(treePickerText({owned: false, treeTitle: '좋아하는 순간들', pendingDraft: true}), '저장 안 된 기록');
  // 로그인 상태에서는 서버 기록이 기준이다.
  assert.equal(treePickerText({owned: true, treeTitle: '그날의 공기', pendingDraft: true}), '트리: 그날의 공기');
});

test('서재·책·보드·지도 화면 탭은 로그인 여부·방문자 읽기와 무관하게 보인다', () => {
  assert.equal(treeViewsVisible({owned: true}), true);
  assert.equal(treeViewsVisible({owned: false}), true);
  // 방문자도 같은 책·보드·지도 탭을 쓰고 서재·트리 선택·쓰기만 별도로 숨긴다.
  assert.equal(treeViewsVisible({owned: true, publicReading: true}), true);
  assert.equal(treeViewsVisible({owned: false, publicReading: true}), true);
});

test('브라우저에만 남은 미저장 기록을 찾아낸다', () => {
  const make = entries => {
    const map = new Map(entries);
    return {
      get length() { return map.size; },
      key: index => [...map.keys()][index] ?? null,
      getItem: key => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: key => map.delete(key)
    };
  };
  const empty = make([]);
  assert.equal(hasPendingDraft(empty), false);
  assert.equal(hasPendingDraft(null), false);

  const withDraft = make([['lovetree.v41.pending-write:sub_member_a', '{"version":1}']]);
  assert.equal(hasPendingDraft(withDraft), true, '계정을 모를 때(401) 남은 키로 판단');
  assert.equal(hasPendingDraft(withDraft, 'sub_member_a'), true);
  assert.equal(hasPendingDraft(withDraft, 'sub_member_b'), false, '다른 계정의 기록은 내 것이 아니다');

  // 미저장 기록이 아닌 키는 세지 않는다.
  const other = make([['lt41.theme', 'night'], ['lt41.account.position:sub_member_a', '{}']]);
  assert.equal(hasPendingDraft(other), false);
  // 저장소를 읽을 수 없어도 던지지 않는다.
  assert.equal(hasPendingDraft({get length() { throw new Error('blocked'); }, key() { return null; }, getItem() { return null; }}), false);
});

// '세션 만료 저장 실패 안내' 소스 글자 시험(8 단정)은 지웠다(이슈 952) — 문구·단추 이름 나열은
// 문자열 고정이었다. 저장 실패 띠의 실제 표시는 아래 644 화면 시험이(충돌 띠 실측), 로그인 시작
// 동작은 tests/v41-shell-auth.test.mjs가 openLoginStart 직접 호출로 확인한다. 재로그인 후 이어
// 저장(#144 전체)은 실계정 검증(#14)으로 남는다.


// ─── 이슈 644 화면 시험: 두 탭 같은 계정 — 조용한 최신 불러오기·충돌 띠·계정 점·첫 포커스 ───
// 가짜 서버(/api/workspace·/auth)로 같은 계정을 두 탭이 열어 실제 저장 번호 충돌을 만든다.
// 대비 수치(토큰 계산)는 tests/v41-a11y-garden-contrast.test.mjs가 맡고, 여기서는 실제 화면에 적용된 색을 잰다.
import { createServer as createHttpServer644 } from 'node:http';
import { existsSync as existsSync644 } from 'node:fs';
import { createTree } from '../public/v41/domain.mjs';

const REQUIRE_644 = process.env.LT_HEADER_IA_REQUIRE === '1';
const SHOT_DIR_644 = process.env.LT_644_SHOT_DIR || '';
let pwChromium644, skip644 = false;
try {
  ({ chromium: pwChromium644 } = await import('playwright'));
  if (!existsSync644(pwChromium644.executablePath())) skip644 = 'Playwright Chromium이 없어 이슈 644 화면 시험을 건너뜀';
} catch { skip644 = 'playwright 패키지가 없어 이슈 644 화면 시험을 건너뜀'; }

const MIME644 = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
// 이슈 666: 빌드 결과(dist)가 있으면 그것을 먼저 쓴다. public 에는 빌드 진입점인 v41/home.html 이
// 없어서, public 만 서빙하면 화면 안 프레임이 404 본문('not found')을 그대로 그린다 — 캡처에
// 제품에 없는 글자가 찍히고 겹침 좌표도 404 본문을 재게 된다(공통 검사기와 같은 판정).
const ROOT644 = existsSync644(new URL('../dist/v41/home.html', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  ? new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  : new URL('../public', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PREFS644 = { titleDisplay: 'both', displayName: '', accentColor: '', dateStyle: 'dot', startPlace: 'resume', shareView: 'book', shareDiscover: false, treeChipOrder: [], bookDisplay: 'book', shelfView: 'shelf', homeMoment: { mode: 'last', treeId: '', momentId: '' } };

const doc644 = (trees) => ({ version: 1, trees, prefs: PREFS644 });
const tree644 = (subject, title) => createTree({ subject, title, note: '기록', emotion: '설렘', date: '2026-11-15', url: '' }, '2026-11-15T00:00:00.000Z');

async function serve644() {
  const state = { revision: 1, doc: doc644([tree644('시험', '시험 트리')]) };
  const puts = [];
  const ctrl = { putDelayMs: 0 };
  const server = createHttpServer644(async (req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && path === '/api/workspace') return send(200, { revision: state.revision, state: state.doc, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' });
    if (req.method === 'PUT' && path === '/api/workspace') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
      puts.push(body);
      const reply = () => {
        if (ctrl.putMode === '400') return send(400, { error: { code: 'invalid_document', message: '기록 형식을 확인해 주세요.' } });
        if (ctrl.putMode === '413') return send(413, { error: { code: 'payload_too_large', message: '보내는 기록이 너무 커요. 일부만 나눠서 저장해 주세요.' } });
        if (ctrl.failPut) return send(500, { error: { code: 'server', message: '서버가 잠시 멈췄어요.' } });
        if (body.expectedRevision !== state.revision) return send(409, { error: { code: 'revision_conflict', currentRevision: state.revision, message: '다른 곳에서 먼저 저장했어요.' } });
        state.doc = body.state; state.revision += 1;
        return send(200, { revision: state.revision, savedAt: '2026-11-15T09:00:00.000Z' });
      };
      if (ctrl.putDelayMs > 0) return setTimeout(reply, ctrl.putDelayMs);
      return reply();
    }
    if (req.method === 'POST' && (path === '/auth/refresh' || path === '/auth/logout')) return send(200, { ok: true });
    if (path.startsWith('/api/') || path.startsWith('/auth/')) return send(404, { error: { code: 'none', message: 'none' } });
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    for (const candidate of [join(ROOT644, path), join(ROOT644, path.replace(/\/$/, ''), 'index.html')]) {
      try {
        const data = await readFile(candidate);
        const ext = candidate.slice(candidate.lastIndexOf('.'));
        res.writeHead(200, { 'content-type': MIME644[ext] || 'application/octet-stream' });
        return res.end(data);
      } catch { /* 다음 후보 */ }
    }
    res.writeHead(404); res.end('none');
  });
  await listenOnSafePort(server, '127.0.0.1');
  return { server, state, puts, ctrl };
}
const wait644 = ms => new Promise(r => setTimeout(r, ms));
async function until644(fn, timeout = 20000, step = 120) {
  const end = Date.now() + timeout;
  for (;;) {
    if (fn()) return true;
    if (Date.now() > end) return false;
    await wait644(step);
  }
}
async function waitSynced644(page) {
  await page.waitForFunction(() => { const a = document.getElementById('account-avatar'); return a && !a.hidden; }, null, { timeout: 20000 });
}
async function quickAdd644(page, url) {
  const opener = (await page.locator('#write-menu').isVisible().catch(() => false)) ? '#write-menu' : '#mobile-add';
  await page.click(opener);
  await page.waitForFunction(() => document.getElementById('write-panel')?.open, null, { timeout: 5000 });
  await page.fill('#quick-url', url);
  await page.waitForFunction(() => !document.getElementById('quick-submit')?.disabled, null, { timeout: 5000 });
  await page.click('#quick-submit');
}
async function shot644(page, name) {
  if (!SHOT_DIR_644) return;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(SHOT_DIR_644, { recursive: true });
  writeFileSync(`${SHOT_DIR_644}/${name}.png`, await page.screenshot({ fullPage: false }));
}
// 보드 안쪽 화면은 적재 뒤에 셸이 테마 속성을 붙이므로, 색이 기대값에 도착할 때까지 기다린다.
async function boardColor644(page, id, expected, label) {
  await page.waitForFunction(({ id, expected }) => {
    const f = [...document.querySelectorAll('iframe')].find(x => /track58-pinboard/.test(x.contentWindow?.location?.href || ''));
    try { const el = f && f.contentDocument && f.contentDocument.getElementById(id); return !!el && getComputedStyle(el).color === expected; } catch { return false; }
  }, { id, expected }, { timeout: 15000 });
}

test('이슈 644 화면(1440): 두 탭 같은 계정 — 한쪽만 고치면 띠 없이 최신, 양쪽 다 고치면 쉬운 띠·주 단추 하나·백업 뒤 불러오기', { skip: REQUIRE_644 ? false : skip644, timeout: 300000 }, async () => {
  if (skip644) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip644}`);
  const { server, state, puts, ctrl } = await serve644();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pwChromium644.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const p1 = await context.newPage();
    const p2 = await context.newPage();
    await p1.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await waitSynced644(p1);
    await p2.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await waitSynced644(p2);

    // (준비) 저장 응답을 1.2초 늦춰 '저장 중' 구간을 확보한다 — '저장 안 됨' 표시와 설명 열기를 잰다.
    ctrl.putDelayMs = 1200;
    await quickAdd644(p1, 'https://example.com/p1.jpg');
    await p1.waitForFunction(() => document.getElementById('write-menu')?.textContent === '저장 안 됨', null, { timeout: 5000 });
    await p1.keyboard.press('Escape');
    await p1.waitForFunction(() => !document.getElementById('write-panel')?.open, null, { timeout: 5000 });
    assert.equal(await p1.evaluate(() => document.getElementById('save-feedback')?.hidden), true, '클릭 전에는 띠가 숨어 있다');
    await p1.click('#write-menu');
    await p1.waitForFunction(() => !document.getElementById('save-feedback')?.hidden, null, { timeout: 5000 });
    assert.match(await p1.evaluate(() => document.getElementById('save-message')?.textContent || ''), /바뀐 내용을 서버에 저장하고 있어요/, "'저장 안 됨'을 누르면 저장 중 설명이 열린다");
    await until644(() => state.revision === 2);
    await p1.waitForFunction(() => document.getElementById('save-feedback')?.hidden === true, null, { timeout: 8000 });
    await shot644(p1, '644-unsaved-notice-1440-night');

    // (a) p2는 고치지 않은 탭 — 앞으로 오면(가시성 이벤트) 조용히 최신 기록을 불러온다(띠 없음).
    // headless에서는 탭 전환 이벤트가 나지 않으므로 같은 이벤트를 화면에 보내 실제 경로를 검는다.
    await p2.bringToFront();
    await p2.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await p2.waitForFunction(() => document.getElementById('save-feedback')?.hidden === true, null, { timeout: 8000 });
    await quickAdd644(p2, 'https://example.com/p2.jpg');
    await until644(() => state.revision === 3);
    assert.equal(puts.at(-1).expectedRevision, 2, 'p2는 조용히 최신 저장 번호(2)를 받아 그대로 저장한다 — 충돌이 아니다');
    assert.equal(await p2.evaluate(() => document.getElementById('save-feedback')?.hidden), true, 'p2에 띠가 없다');

    // (b) p1은 뒤에서(확인 없이) 고친다 — 저장 번호가 어긋나 409 충돌이 된다.
    await quickAdd644(p1, 'https://example.com/p1-b.jpg');
    await p1.keyboard.press('Escape');
    await p1.waitForFunction(() => !document.getElementById('write-panel')?.open, null, { timeout: 5000 });
    await p1.waitForFunction(() => {
      const box = document.getElementById('save-feedback');
      return box && !box.hidden && document.getElementById('save-message')?.textContent.includes('다른 곳에서 기록이 바뀌었어요');
    }, null, { timeout: 20000 });
    await p2.bringToFront(); // 확인 이벤트가 있어도 충돌 띠는 그대로여야 한다.
    await p1.bringToFront();
    await p1.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await wait644(600);
    const kept = await p1.evaluate(() => ({
      message: document.getElementById('save-message')?.textContent || '',
      urls: (window.LT41?.trees || []).flatMap(t => t.moments.map(m => m.url))
    }));
    assert.match(kept.message, /다른 곳에서 기록이 바뀌었어요/, '고친 게 있으면 확인 이벤트가 와도 띠가 유지된다');
    assert.ok(kept.urls.includes('https://example.com/p1-b.jpg'), '확인 이벤트가 고친 내용을 지우지 않는다');
    const banner = await p1.evaluate(() => ({
      message: document.getElementById('save-message')?.textContent || '',
      buttons: [...document.querySelectorAll('#save-actions button')].map(b => ({ text: b.textContent, visible: !!(b.offsetParent || b.getClientRects().length) })),
      extraHidden: document.querySelector('#save-actions .save-extra')?.hidden
    }));
    assert.match(banner.message, /다른 곳에서 기록이 바뀌었어요\. 이 화면에서 고친 1개는 따로 보관해 둘게요\./, '띠는 쉬운 말로 고친 개수를 알린다');
    assert.equal(banner.buttons.filter(b => b.visible && b.text === '최신 기록 불러오기').length, 1, '주 단추는 최신 기록 불러오기 하나');
    assert.equal(banner.buttons.filter(b => b.visible && /덮어쓰기/.test(b.text)).length, 0, '덮어쓰기는 처음에는 보이지 않는다');
    assert.equal(banner.extraHidden, true, '자세히 칸은 접혀 있다');
    await shot644(p1, '644-conflict-banner-1440-night');
    // 자세히를 누르면 덮어쓰기·백업이 나온다.
    await p1.click('#save-actions button:has-text("자세히")');
    const extra = await p1.evaluate(() => ({
      hidden: document.querySelector('#save-actions .save-extra')?.hidden,
      texts: [...document.querySelectorAll('#save-actions .save-extra button')].map(b => b.textContent)
    }));
    assert.equal(extra.hidden, false, '자세히를 누르면 고급 동작이 열린다');
    assert.deepEqual(extra.texts, ['이 화면 것으로 덮어쓰기', '현재 기록 백업']);
    // 주 단추: 불러오기 전에 이 화면 기록을 자동으로 백업하고(다운로드), 최신 기록을 불러온다 — 손실 0.
    const downloadPromise = p1.waitForEvent('download', { timeout: 15000 });
    await p1.click('#save-actions button:has-text("최신 기록 불러오기")');
    const download = await downloadPromise;
    const backupPath = await download.path();
    const { readFileSync: readBackup } = await import('node:fs');
    const backup = JSON.parse(readBackup(backupPath, 'utf8'));
    const backupUrls = backup.trees.flatMap(t => t.moments.map(m => m.url));
    assert.ok(backupUrls.includes('https://example.com/p1-b.jpg'), '백업 파일에 이 화면에서 고친 순간이 남는다(손실 0)');
    await p1.waitForFunction(() => document.getElementById('save-feedback')?.hidden === true, null, { timeout: 8000 });
    const adopted = await p1.evaluate(() => (window.LT41?.trees || []).flatMap(t => t.moments.map(m => m.url)));
    assert.ok(adopted.includes('https://example.com/p2.jpg'), '불러온 최신 기록에는 다른 탭의 순간이 있다');
    assert.ok(!adopted.includes('https://example.com/p1-b.jpg'), '덮어쓰지 않았다 — 고친 것은 백업으로만 남는다');

    // (c) 새 소식 점: 아바타 점 + 계정 메뉴 항목 점·'새 소식 1' + 마우스 설명.
    assert.equal(await p1.evaluate(() => document.getElementById('account-avatar')?.classList.contains('has-dot')), true, '아바타에 점이 있다');
    assert.equal(await p1.evaluate(() => document.getElementById('account-avatar')?.title), '새 소식이 있어요', '아바타에 올리면 짧은 설명이 있다');
    await p1.click('#account-avatar');
    await p1.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 5000 });
    const menu = await p1.evaluate(() => ({
      updatesDot: document.getElementById('account-updates')?.classList.contains('has-dot'),
      countHidden: document.getElementById('account-updates-count')?.hidden,
      countText: document.getElementById('account-updates-count')?.textContent
    }));
    assert.equal(menu.updatesDot, true, "메뉴의 '새 소식' 항목에도 같은 점이 있다");
    assert.equal(menu.countHidden, false, "'새 소식 1' 개수가 보인다");
    assert.equal(menu.countText, '1');
    await shot644(p1, '644-account-menu-dot-1440-night');
    await p1.keyboard.press('Escape');
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('이슈 644 화면(1440·정원): 토스트·보드 트리 이름이 정원 토큰으로 바뀌고, 옮기기 창의 첫 포커스는 제목이다', { skip: REQUIRE_644 ? false : skip644, timeout: 300000 }, async () => {
  if (skip644) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip644}`);
  const { server, state } = await serve644();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pwChromium644.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p1 = await context.newPage();
    await p1.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await waitSynced644(p1);
    await p1.evaluate(() => localStorage.setItem('lt41.theme', 'garden'));
    await p1.reload({ waitUntil: 'load' });
    await waitSynced644(p1);
    assert.equal(await p1.evaluate(() => getComputedStyle(document.getElementById('toast')).color), 'rgb(255, 253, 248)', '정원 토스트 글자는 밝은 종이 색이다');
    await p1.click('nav button:has-text("보드")');
    await p1.waitForFunction(() => (window.LT41?.tree?.moments || []).length > 0 && [...document.querySelectorAll('iframe')].some(f => /track58-pinboard/.test(f.contentWindow?.location?.href || '')), null, { timeout: 20000 });
    const boardFrame = p1.frames().find(f => /track58-pinboard/.test(f.url()));
    assert.ok(boardFrame, '보드 화면이 열린다');
    await boardColor644(p1, 'treeTitleText', 'rgb(64, 53, 54)', '정원 보드 트리 이름');
    assert.equal(await boardFrame.evaluate(() => getComputedStyle(document.getElementById('treeTitleText')).color), 'rgb(64, 53, 54)', '정원 보드 트리 이름은 잉크색이다(연분홍 아님)');
    await shot644(p1, '644-board-garden-title-1440');
    // 트리 2개를 서버에 두고 다시 불러와 옮기기 창을 연다.
    state.doc = doc644([state.doc.trees[0], tree644('시험2', '옮길 트리')]);
    state.revision += 1;
    await p1.reload({ waitUntil: 'load' });
    await waitSynced644(p1);
    await p1.click('nav button:has-text("보드")');
    await p1.waitForFunction(() => (window.LT41?.tree?.moments || []).length > 0 && [...document.querySelectorAll('iframe')].some(f => /track58-pinboard/.test(f.contentWindow?.location?.href || '')), null, { timeout: 20000 });
    const frame2 = p1.frames().find(f => /track58-pinboard/.test(f.url()));
    const momentId = await p1.evaluate(() => window.LT41.tree.moments[0].id);
    await frame2.evaluate(id => parent.postMessage({ type: 'lt41-move', momentId: id }, location.origin), momentId);
    await p1.waitForFunction(() => document.getElementById('move-picker')?.open === true, null, { timeout: 8000 });
    assert.equal(await p1.evaluate(() => document.activeElement?.id), 'move-picker-title', '옮기기 창의 첫 포커스는 제목이다(X 아님)');
    await shot644(p1, '644-move-picker-focus-1440-garden');
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('이슈 644 화면(390·정원): 충돌 띠가 좁은 화면에서 넘치지 않고 주 단추가 44px다. 밤으로 돌리면 토스트·트리 이름이 밤 색이다', { skip: REQUIRE_644 ? false : skip644, timeout: 300000 }, async () => {
  if (skip644) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip644}`);
  const { server, state } = await serve644();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pwChromium644.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p1 = await context.newPage();
    await p1.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await waitSynced644(p1);
    await p1.evaluate(() => localStorage.setItem('lt41.theme', 'garden'));
    await p1.reload({ waitUntil: 'load' });
    await waitSynced644(p1);
    // 첫 화면에서는 ＋가 가운데만 남으므로(#1084) 다른 화면에서 충돌 띠를 만든다.
    await p1.evaluate(() => { location.hash = '#shelf'; });
    await p1.waitForTimeout(300);
    // 정원 390: 토스트 글자 + 충돌 띠(서버를 먼저 바꾸고 뒤에서 고치면 409가 난다).
    assert.equal(await p1.evaluate(() => getComputedStyle(document.getElementById('toast')).color), 'rgb(255, 253, 248)', '정원 토스트 글자(390)');
    state.doc = doc644([tree644('시험', '다른 탭이 바꾼 트리')]);
    state.revision += 1;
    await quickAdd644(p1, 'https://example.com/p390.jpg');
    await p1.keyboard.press('Escape');
    await p1.waitForFunction(() => !document.getElementById('write-panel')?.open, null, { timeout: 5000 });
    await p1.waitForFunction(() => {
      const box = document.getElementById('save-feedback');
      return box && !box.hidden && document.getElementById('save-message')?.textContent.includes('다른 곳에서 기록이 바뀌었어요');
    }, null, { timeout: 20000 });
    const layout = await p1.evaluate(() => {
      const box = document.getElementById('save-feedback');
      const primary = [...document.querySelectorAll('#save-actions button')].find(b => b.textContent === '최신 기록 불러오기');
      const r = primary.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        boxOverflow: box.scrollWidth > box.clientWidth + 1,
        primaryHeight: Math.round(r.height),
        primaryVisible: !!(primary.offsetParent || primary.getClientRects().length),
        message: document.getElementById('save-message')?.textContent || ''
      };
    });
    assert.equal(layout.overflow, false, '390에서 가로 넘침이 없다');
    assert.equal(layout.boxOverflow, false, '띠 안에서 글자가 잘리지 않는다');
    assert.equal(layout.primaryVisible, true, '주 단추가 보인다');
    assert.ok(layout.primaryHeight >= 44, `주 단추 누르는 자리 44px 이상(${layout.primaryHeight}px)`);
    assert.match(layout.message, /이 화면에서 고친 1개는 따로 보관해 둘게요\./);
    // 새 소식 카드 같은 떠 있는 카드가 충돌 안내를 덮지 않는다(기록 손실 안내가 더 중요하다).
    const covered = await p1.evaluate(() => {
      const msg = document.getElementById('save-message');
      if (!msg) return true;
      const r = msg.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(hit && msg.contains(hit));
    });
    assert.equal(covered, false, '충돌 안내 글자가 다른 떠 있는 카드에 가려지지 않는다');
    await shot644(p1, '644-conflict-banner-390-garden');
    // 정원 보드 트리 이름(390). 좁은 화면에서는 '보드' 단추가 넘침 메뉴 안으로 접히므로 화면 전환을 직접 부른다.
    await p1.evaluate(() => document.querySelector('[data-view="track58-pinboard.html"]').click());
    await p1.waitForFunction(() => (window.LT41?.tree?.moments || []).length > 0 && [...document.querySelectorAll('iframe')].some(f => /track58-pinboard/.test(f.contentWindow?.location?.href || '')), null, { timeout: 20000 });
    const frame390 = p1.frames().find(f => /track58-pinboard/.test(f.url()));
    await boardColor644(p1, 'treeTitleText', 'rgb(64, 53, 54)', '정원 보드 트리 이름(390)');
    assert.equal(await frame390.evaluate(() => getComputedStyle(document.getElementById('treeTitleText')).color), 'rgb(64, 53, 54)', '정원 보드 트리 이름(390)은 잉크색이다');
    await shot644(p1, '644-board-garden-title-390');
    // 밤으로 돌리면 원래 색으로 돌아온다(390·밤).
    await p1.evaluate(() => localStorage.removeItem('lt41.theme'));
    await p1.reload({ waitUntil: 'load' });
    await waitSynced644(p1);
    assert.equal(await p1.evaluate(() => getComputedStyle(document.getElementById('toast')).color), 'rgb(245, 241, 233)', '밤 토스트 글자(390)는 그대로다');
    await p1.evaluate(() => document.querySelector('[data-view="track58-pinboard.html"]').click());
    await p1.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /track58-pinboard/.test(f.contentWindow?.location?.href || '')), null, { timeout: 20000 });
    const frameNight = p1.frames().find(f => /track58-pinboard/.test(f.url()));
    await boardColor644(p1, 'treeTitleText', 'rgb(232, 222, 238)', '밤 보드 트리 이름(390)');
    assert.equal(await frameNight.evaluate(() => getComputedStyle(document.getElementById('treeTitleText')).color), 'rgb(232, 222, 238)', '밤 보드 트리 이름(390)은 그대로다');
    await shot644(p1, '644-board-night-title-390');
    await context.close();
  } finally { await browser.close(); server.close(); }
});

// #666 + 2026-11-16: '고급 기능 보기' 스위치는 계정 메뉴에서 설정 '화면' 탭의 더 보기(고급) 접힘 안으로 옮겨졌다.
// 누르는 규칙은 설정 줄의 다른 스위치(움직임, #465 2)와 같다 — role=switch · 끔/켬 글자 · 켜짐 색으로 상태가 갈린다.
const SWITCH_CONTRAST = `(() => {
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  return (fgColor, bgColor, baseColor) => {
    const bg = over(parse(bgColor), parse(baseColor) && parse(baseColor).a > 0 ? parse(baseColor) : { r: 0, g: 0, b: 0, a: 1 });
    const fg = over(parse(fgColor), bg);
    const [light, dark] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };
})()`;

test('이슈 666 화면: 고급 기능 스위치 — 설정 화면 탭 더 보기(고급) 안에서 끔·켬 글자와 색으로 갈리고 대비 3:1 이상, 설명은 스위치 아래 한 줄 12px', { skip: REQUIRE_644 ? false : skip644, timeout: 300000 }, async () => {
  if (skip644) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip644}`);
  const { server } = await serve644();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pwChromium644.launch({ headless: true });
  const rows = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      for (const theme of ['night', 'garden']) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        const page = await context.newPage();
        await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
        await waitSynced644(page);
        // 실제 길로 연다 — 계정 동그라미 → 메뉴 → 설정. 스위치는 화면 탭의 '더 보기(고급)' 접힘 안에 있다(2026-11-16 이동).
        await page.click('#account-avatar');
        await page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 8000 });
        await page.click('#account-open-settings');
        await page.waitForFunction(() => document.getElementById('account-settings')?.open, null, { timeout: 8000 });
        assert.equal(await page.evaluate(() => document.getElementById('settings-tab-screen')?.getAttribute('aria-selected')), 'true', `${width}·${theme} 설정은 화면 탭에서 열린다`);
        await page.click('#account-settings-screen-more > summary');
        await page.waitForFunction(() => document.getElementById('account-settings-screen-more')?.open, null, { timeout: 8000 });

        const read = () => page.evaluate(`${SWITCH_CONTRAST}`).then(() => page.evaluate(() => {
          const btn = document.getElementById('settings-advanced');
          const desc = document.getElementById('settings-advanced-desc');
          const row = btn.closest('.settings-row');
          const br = btn.getBoundingClientRect();
          const dr = desc.getBoundingClientRect();
          const rr = row.getBoundingClientRect();
          const dlg = document.getElementById('account-settings');
          const st = getComputedStyle(btn);
          return {
            checked: btn.getAttribute('aria-checked'),
            text: btn.textContent,
            advanced: document.body.classList.contains('lt-advanced'),
            button: { w: Math.round(br.width), h: Math.round(br.height) },
            color: st.color, bg: st.backgroundColor,
            desc: { px: Number.parseFloat(getComputedStyle(desc).fontSize), top: Math.round(dr.top) },
            rowBottom: Math.round(rr.bottom),
            dlgBg: getComputedStyle(dlg).backgroundColor,
            bodyBg: getComputedStyle(document.body).backgroundColor
          };
        }));

        const off = await read();
        // 꺼짐: 설정 줄 스위치 규칙(#465 2 role=switch — 움직임 스위치와 같은 모양) · 끔 글자 · 몸통에 lt-advanced 없음.
        assert.ok(off.button.h >= 34, `${width}·${theme} 스위치 단추 높이 34px 이상(${off.button.h}px)`);
        assert.equal(off.checked, 'false', `${width}·${theme} 처음은 꺼짐`);
        assert.equal(off.text, '끔', `${width}·${theme} 꺼짐 글자는 끔`);
        assert.equal(off.advanced, false, '몸통에 lt-advanced가 없다');
        assert.equal(off.desc.top >= off.rowBottom, true, '설명 글은 스위치 줄 아래에 놓인다');
        assert.ok(off.desc.px >= 12, `설명 글 12px 이상(${off.desc.px}px)`);

        await page.click('#settings-advanced');
        await wait644(250);
        const on = await read();
        // 켜짐: 글자·색·몸통이 함께 바뀐다.
        assert.equal(on.checked, 'true', `${width}·${theme} 누르면 켜짐`);
        assert.equal(on.text, '켬', `${width}·${theme} 켜짐 글자는 켬`);
        assert.equal(on.advanced, true, '몸통에 lt-advanced가 붙는다');
        assert.notEqual(on.bg, off.bg, `켜짐·꺼짐 색이 다르다(${off.bg} → ${on.bg})`);
        assert.equal(on.button.h, off.button.h, '켜져도 누를 자리 크기는 그대로다');

        // 대비 3:1 — 스위치 바탕이 반투명이면 설정 창 바탕 위에, 설정 창 바탕도 반투명이면 본문 바탕 위에 겹쳐 계산.
        const ratios = await page.evaluate(({ pairs, dlgBg, bodyBg }) => {
          const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
          const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
          const lum = (c) => { const ch = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b); };
          const stack = (...layers) => layers.reduce((base, top) => over(parse(top) || { r: 0, g: 0, b: 0, a: 1 }, base), { r: 0, g: 0, b: 0, a: 1 });
          return pairs.map(([fg, switchBg]) => {
            const base = stack(bodyBg, dlgBg, switchBg);
            const text = over(parse(fg), base);
            const [light, dark] = [lum(text), lum(base)].sort((x, y) => y - x);
            return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
          });
        }, { pairs: [[off.color, off.bg], [on.color, on.bg]], dlgBg: on.dlgBg, bodyBg: on.bodyBg });
        assert.ok(ratios[0] >= 3, `${width}·${theme} 꺼짐 스위치 대비 3:1 이상(${ratios[0]}:1, ${off.color})`);
        assert.ok(ratios[1] >= 3, `${width}·${theme} 켜짐 스위치 대비 3:1 이상(${ratios[1]}:1, ${on.color})`);
        rows.push({ 크기: `${width}`, 테마: theme, 꺼짐: `${off.text} ${off.color} ${ratios[0]}:1`, 켜짐: `${on.text} ${on.color} ${ratios[1]}:1`, 단추높이: off.button.h });

        if (width === 390 && theme === 'garden') await shot644(page, '666-advanced-switch-390-garden');
        if (width === 1440 && theme === 'night') await shot644(page, '666-advanced-switch-1440-night');
        await context.close();
      }
    }
  } finally { await browser.close(); server.close(); }
  console.log('#666 고급 기능 스위치 실측:\n' + rows.map((r) => `  ${r.크기}·${r.테마} 단추높이 ${r.단추높이}px · 꺼짐 ${r.꺼짐} · 켜짐 ${r.켜짐}`).join('\n'));
});

// 2026-11-17 계정 메뉴: '운영' 라벨 제거 + 항목 기본 배경(밤·정원) 수치 판정.
let menuChromium, menuSkip = '';
try {
  ({ chromium: menuChromium } = await import('playwright'));
  const candidates = [menuChromium.executablePath()];
  if (process.env.LT_MENU_BROWSER_EXE) candidates.push(process.env.LT_MENU_BROWSER_EXE);
  if (!candidates.some(p => p && existsSync644(p))) menuSkip = 'Playwright Chromium이 없어 계정 메뉴 시험을 건너뜀';
} catch { menuSkip = 'playwright 패키지가 없어 계정 메뉴 시험을 건너뜀'; }

test('계정 메뉴: 운영 라벨 없음·구분선 유지·기본 항목 배경은 투명, hover에서만 칠(밤·정원)', { skip: menuSkip || false, timeout: 120000 }, async () => {
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const port = server.address().port;
  let browser = null;
  try {
    browser = await menuChromium.launch({ headless: true,
      ...(process.env.LT_MENU_BROWSER_EXE ? { executablePath: process.env.LT_MENU_BROWSER_EXE } : {}) });
    for (const theme of ['night', 'garden']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`http://127.0.0.1:${port}/v41/`, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      await page.evaluate(t => {
        if (t === 'garden') document.documentElement.setAttribute('data-lt-theme', 'garden');
        else document.documentElement.removeAttribute('data-lt-theme');
        const pop = document.querySelector('#account-popover');
        pop.hidden = false;
        document.getElementById('account-ops-group').hidden = false;
      }, theme);
      const got = await page.evaluate(() => {
        const cs = el => getComputedStyle(el);
        const pop = document.querySelector('#account-popover');
        const group = document.getElementById('account-ops-group');
        return {
          labels: pop.querySelectorAll('.account-menu-group').length,
          divider: cs(group).borderTopWidth + ' ' + cs(group).borderTopStyle,
          order: !!group && !!(group.compareDocumentPosition(document.getElementById('account-logout')) & Node.DOCUMENT_POSITION_FOLLOWING),
          bgs: [...pop.querySelectorAll('button')].filter(b => !b.hidden).map(b => cs(b).backgroundColor),
          colors: [...pop.querySelectorAll('button')].filter(b => !b.hidden).map(b => cs(b).color),
          panelBg: cs(pop).backgroundColor
        };
      });
      assert.equal(got.labels, 0, theme + ': 운영 라벨 글자 없음');
      assert.equal(got.divider, '1px solid', theme + ': 구분선 유지');
      assert.equal(got.order, true, theme + ': 운영센터 → 로그아웃 순서');
      assert.ok(got.bgs.length >= 6, theme + ': 항목 수');
      assert.ok(got.bgs.every(bg => bg === 'rgba(0, 0, 0, 0)'), theme + ': 기본 항목 배경은 모두 투명(판 배경 그대로)');

      // 마우스로 열면 첫 항목에 초점이 있어도 칠이 0개여야 한다(키보드 :focus-visible만 칠한다).
      const mouseOpen = await page.evaluate(() => {
        const pop = document.querySelector('#account-popover');
        pop.dataset.ltOpenedBy = 'mouse';
        const first = pop.querySelector('button:not([hidden])');
        first.focus();
        return [...pop.querySelectorAll('button:not([hidden])')].map(b => getComputedStyle(b).backgroundColor);
      });
      assert.ok(mouseOpen.every(bg => bg === 'rgba(0, 0, 0, 0)'), theme + ': 마우스로 연 메뉴는 칠 0개(실제 ' + JSON.stringify(mouseOpen) + ')');

      const defaultBg = got.bgs[0];
      await page.hover('#account-open-settings');
      await page.waitForTimeout(120);
      const hoverBg = await page.evaluate(() => getComputedStyle(document.getElementById('account-open-settings')).backgroundColor);
      assert.notEqual(hoverBg, defaultBg, theme + ': hover에서만 옅은 칠');

      // 대비: 항목 글자색 × 판 배경(불투명 합성) ≥ 4.5:1
      const rgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
      const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const panel = rgb(got.panelBg), base = { r: 4, g: 4, b: 7, a: 1 };
      const flat = { r: panel.r * panel.a + base.r * (1 - panel.a), g: panel.g * panel.a + base.g * (1 - panel.a), b: panel.b * panel.a + base.b * (1 - panel.a) };
      for (const color of got.colors) {
        const a = lum(rgb(color)), b = lum(flat);
        assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, theme + ': 글자 대비 4.5:1 이상');
      }
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});

test('계정 메뉴 테두리: 마우스로 열면 0/none, 키보드 Enter로 열면 2px 실선(garden·night 1440)', { skip: menuSkip || false, timeout: 180000 }, async () => {
  if (menuSkip) assert.fail(`건너뜀=실패 — ${menuSkip}`);
  const { mkdirSync } = await import('node:fs');
  const shotDir = process.env.LT_MENU3_SHOT_DIR || path.join(tmpdir(), 'lt-menu3-shots');
  mkdirSync(shotDir, { recursive: true });
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await menuChromium.launch({ headless: true,
    ...(process.env.LT_MENU_BROWSER_EXE ? { executablePath: process.env.LT_MENU_BROWSER_EXE } : {}) });
  try {
    for (const theme of ['garden', 'night']) {
      for (const how of ['mouse', 'keyboard']) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        await ctx.addInitScript(t => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/workspace**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' }) }));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
        await page.waitForFunction(() => { const a = document.getElementById('account-avatar'); return a && !a.hidden; }, null, { timeout: 20000 });
        // 스크립트 click()/focus()로 메뉴를 열지 않는다 — 실제 포인터 클릭과 실제 키보드 입력만 쓴다.
        if (how === 'mouse') await page.locator('#account-avatar').click();
        else { await page.locator('#account-avatar').focus(); await page.keyboard.press('Enter'); }
        await page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 8000 });
        await page.waitForTimeout(150);
        const got = await page.evaluate(() => {
          const pop = document.querySelector('#account-popover');
          const b = pop.querySelector('button:not([hidden])');
          const cs = getComputedStyle(b);
          return {
            openedBy: pop.dataset.ltOpenedBy, focusVisible: b.matches(':focus-visible'),
            outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor,
            boxShadow: cs.boxShadow, background: cs.backgroundColor
          };
        });
        const label = `${theme}·${how}`;
        if (how === 'mouse') {
          assert.equal(got.openedBy, 'mouse', label + ': 마우스로 열림');
          assert.equal(got.focusVisible, false, label + ': :focus-visible 아님');
          assert.equal(got.outlineWidth, '0px', label + ': outline-width 0 (실제 ' + got.outlineWidth + ')');
          assert.equal(got.outlineStyle, 'none', label + ': outline-style none');
          assert.equal(got.boxShadow, 'none', label + ': box-shadow none');
          assert.equal(got.background, 'rgba(0, 0, 0, 0)', label + ': 칠 없음');
        } else {
          assert.equal(got.openedBy, 'keyboard', label + ': 키보드로 열림');
          assert.equal(got.focusVisible, true, label + ': :focus-visible');
          assert.equal(got.outlineWidth, '2px', label + ': outline-width 2px (실제 ' + got.outlineWidth + ')');
          assert.equal(got.outlineStyle, 'solid', label + ': outline-style solid');
          assert.equal(got.outlineColor, theme === 'garden' ? 'rgb(152, 80, 94)' : 'rgb(255, 230, 166)', label + ': 테두리 색');
        }
        await page.screenshot({ path: `${shotDir}/${theme}-${how}-1440.png` });
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
});

test('이슈 905 화면(1440): 자동 저장 성공은 알림이 없고, 저장 실패(가짜 500) 때만 띠·다시 시도가 뜬다', { skip: REQUIRE_644 ? false : skip644, timeout: 300000 }, async () => {
  if (skip644) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip644}`);
  const { server, state, ctrl } = await serve644();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pwChromium644.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p1 = await context.newPage();
    await p1.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await waitSynced644(p1);
    // 토스트 관측기: #905 검사는 '뜬 적이 없다'를 봐야 하므로 뜨는 순간마다 기록해 둔다.
    // #1320: '불러왔어요' 안내는 없어졌다(기록 0개 첫 순간 안내만 남음) — 저장 안내만 재기 위해 기록을 비운 뒤부터 잰다.
    const watchToasts = () => p1.evaluate(() => {
      window.__n905 = [];
      const t = document.getElementById('toast');
      const rec = () => { if (t && !t.hidden && t.textContent) window.__n905.push(t.textContent); };
      new MutationObserver(rec).observe(t, { attributes: true, childList: true, characterData: true, subtree: true });
      rec();
    });
    await p1.waitForFunction(() => document.getElementById('toast')?.hidden, null, { timeout: 15000 });
    await watchToasts();
    // (1) 배치 옮기기 성공: 보드 화면을 열고 안쪽 화면이 lt41-board-sync로 배치를 보낸다 — 토스트가 뜨지 않는다(#905).
    await p1.click('nav button:has-text("보드")');
    await p1.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /track58-pinboard/.test(f.contentWindow?.location?.href || '')), null, { timeout: 20000 });
    const frame = p1.frames().find(f => /track58-pinboard/.test(f.url()));
    assert.ok(frame, '기억 보드 화면이 열려 있다');
    await frame.waitForFunction(() => Array.isArray(window.LTDEMO?.moments) && LTDEMO.moments.length > 0, null, { timeout: 15000 });
    await frame.evaluate(() => {
      const moments = LTDEMO.moments.map(m => ({ ...m, x: (m.x || 0) + 3, y: (m.y || 0) + 3 }));
      window.parent.postMessage({ type: 'lt41-board-sync', treeId: window.parent.LT41.tree.id, moments }, location.origin);
    });
    await until644(() => state.revision === 2);
    await wait644(1200);
    assert.deepEqual(await p1.evaluate(() => window.__n905.filter(t => /저장/.test(t))), [], '배치 저장 성공에는 저장 토스트가 없다(#905) — 보드를 열 때의 안내 토스트는 별개다');
    // (2) 쉬운 추가(자동 저장) 성공 — 역시 토스트가 없다. 창 안의 '담았어요' 안내 줄은 추가 동작의 확인이다.
    await quickAdd644(p1, 'https://example.com/905-a.jpg');
    await until644(() => state.revision === 3);
    await wait644(1200);
    assert.deepEqual(await p1.evaluate(() => window.__n905.filter(t => /저장/.test(t))), [], '자동 저장 성공에는 저장 토스트가 없다(#905)');
    // #892: 담은 뒤 창은 '담았어요 · 지금 다듬기'를 보여 주며 열려 있다 — 다음 단계 전에 닫는다.
    await p1.keyboard.press('Escape');
    await p1.waitForFunction(() => !document.getElementById('write-panel')?.open, null, { timeout: 5000 });
    // (3) 저장 실패(가짜 500): 띠가 뜨고 '다시 시도' 단추가 있다.
    ctrl.failPut = true;
    await quickAdd644(p1, 'https://example.com/905-b.jpg');
    await p1.waitForFunction(() => !document.getElementById('save-feedback')?.hidden, null, { timeout: 20000 });
    assert.match(await p1.evaluate(() => document.getElementById('save-message')?.textContent || ''), /저장되지 않았어요/, '실패 안내가 뜬다(알림 1)');
    const retry = p1.locator('#save-actions button', { hasText: '다시 시도' });
    assert.equal(await retry.count(), 1, '다시 시도 단추가 하나 있다');
    // 저장이 실패한 동안 창은 닫히지 않는다(내용이 남아 있다) — 다시 시도를 누르려면 창을 먼저 닫는다.
    await p1.keyboard.press('Escape');
    await p1.waitForFunction(() => !document.getElementById('write-panel')?.open, null, { timeout: 5000 });
    // (4) 서버가 돌아오면 다시 시도가 저장한다 — 띠가 사라지고 성공 토스트도 없다.
    ctrl.failPut = false;
    await retry.click();
    await until644(() => state.revision === 4);
    await p1.waitForFunction(() => document.getElementById('save-feedback')?.hidden === true, null, { timeout: 10000 });
    await wait644(1200);
    assert.deepEqual(await p1.evaluate(() => window.__n905.filter(t => /저장/.test(t))), [], '재저장 성공 뒤에도 저장 토스트가 없다(#905)');
  } finally {
    await browser.close();
    server.close();
  }
});

// 이슈 185 후속(상단 계정 메뉴 흰 띠): 칩 모양 규칙이 판 안 단추까지 내려가 줄마다 뒤를 흐리게 하던 문제.
// 화면에서 잰다 — 판 안 단추는 backdrop-filter none, 상단 칩은 blur(8px) 유지.
test('#185 후속 화면(1440): 계정 메뉴 안 단추는 backdrop-filter가 없고 상단 칩은 blur를 유지한다', { skip: REQUIRE_644 ? false : skip644, timeout: 300000 }, async () => {
  if (skip644) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip644}`);
  const { server } = await serve644();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pwChromium644.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await waitSynced644(page);
    await page.click('#account-avatar');
    await page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 8000 });
    const bf = await page.evaluate(() => {
      const read = (el) => getComputedStyle(el).backdropFilter;
      const menu = [...document.querySelectorAll('#account-popover button')].map((b) => ({ id: b.id, bf: read(b) }));
      return {
        menu,
        chips: ['theme-toggle', 'write-menu', 'account-avatar'].map((id) => ({ id, bf: read(document.getElementById(id)) })),
      };
    });
    assert.ok(bf.menu.length >= 6, `계정 메뉴 단추가 열려 있다(${bf.menu.length}개)`);
    assert.deepEqual([...new Set(bf.menu.map((b) => b.bf))], ['none'], `메뉴 안 모든 단추 backdrop-filter none(${JSON.stringify(bf.menu)})`);
    assert.deepEqual([...new Set(bf.chips.map((b) => b.bf))], ['blur(8px)'], `상단 칩은 blur(8px)를 유지한다(${JSON.stringify(bf.chips)})`);
  } finally {
    await browser.close();
    server.close();
  }
});

// A-07(#1056): 400·413 거부는 서버 문구와 백업 단추 — 같은 본을 다시 보내는 재시도는 붙지 않는다.
test('저장 실패 안내: 400·413은 서버 문구와 백업, 연결 끊김은 재시도', { skip: REQUIRE_644 ? false : skip644, timeout: 300000 }, async () => {
  if (skip644) assert.fail(skip644);
  const { server, ctrl } = await serve644();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await pwChromium644.launch({ headless: true });
  try {
    for (const [mode, want, label] of [
      ['400', /기록 형식을 확인해 주세요/, '백업 내려받기'],
      ['413', /너무 커요/, '백업 내려받기']
    ]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      try {
        await context.addInitScript(() => { window.__blobs = []; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blobs.push(b.size); return orig.call(URL, b); }; });
        const page = await context.newPage();
        await page.goto(`${origin}/v41/?account=1#home`, { waitUntil: 'load' });
        await waitSynced644(page);
        await dismissDiscoverAskIfOpen(page);
        ctrl.putMode = mode;
        await quickAdd644(page, `https://example.com/1056-${mode}.jpg`);
        await wait644(800);
        await page.waitForFunction(() => !document.getElementById('save-feedback')?.hidden, null, { timeout: 20000 });
        const notice = await page.evaluate(() => ({
          message: document.getElementById('save-message')?.textContent || '',
          buttons: [...document.querySelectorAll('#save-actions button')].map((b) => b.textContent.trim())
        }));
        assert.match(notice.message, want, `${mode}: 서버 문구가 보인다 — ${notice.message}`);
        assert.ok(notice.buttons.includes(label), `${mode}: 백업 단추가 보인다 — ${JSON.stringify(notice.buttons)}`);
        assert.ok(!notice.buttons.includes('다시 시도'), `${mode}: 재시도 단추가 없다 — ${JSON.stringify(notice.buttons)}`);
        await page.evaluate(() => document.getElementById('write-panel')?.close());
        await page.locator('#save-actions button', { hasText: label }).click();
        await page.waitForFunction(() => (window.__blobs || []).length > 0, null, { timeout: 5000 });
        assert.ok((await page.evaluate(() => window.__blobs)).some((size) => size > 0), `${mode}: 백업 파일을 만든다`);
        ctrl.putMode = '';
      } finally { await context.close(); }
    }
    // 연결 끊김(status 0)은 지금처럼 재시도가 남는다.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/v41/?account=1#home`, { waitUntil: 'load' });
      await waitSynced644(page);
      await dismissDiscoverAskIfOpen(page);
      ctrl.failPut = true;
      await quickAdd644(page, 'https://example.com/1056-offline.jpg');
      await page.waitForFunction(() => !document.getElementById('save-feedback')?.hidden, null, { timeout: 20000 });
      assert.equal(await page.locator('#save-actions button', { hasText: '다시 시도' }).count(), 1, '연결 문제는 재시도 유지');
      ctrl.failPut = false;
    } finally { await context.close(); }
  } finally {
    await browser.close();
    server.close();
  }
});
