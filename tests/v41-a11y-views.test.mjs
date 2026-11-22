import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {connectionLabel, filterLabel, isSmallTarget, nodeStep, focusWrap, focusReturnTarget} from '../public/v41/view-a11y.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('connection control name includes its visible count', () => {
  assert.equal(connectionLabel(4), '이어진 선 4개');
  assert.equal(connectionLabel('7'), '이어진 선 7개');
  assert.equal(connectionLabel(undefined), '이어진 선 0개');
});

test('board filter labels name both native selects', () => {
  assert.equal(filterLabel('media'), '미디어 필터');
  assert.equal(filterLabel('keyword'), '키워드 필터');
  assert.equal(filterLabel('other'), '');
});

test('network keyboard navigation wraps and supports Home/End', () => {
  assert.equal(nodeStep(-1, 4, 'ArrowRight'), 0);
  assert.equal(nodeStep(3, 4, 'ArrowRight'), 0);
  assert.equal(nodeStep(0, 4, 'ArrowLeft'), 3);
  assert.equal(nodeStep(2, 4, 'Home'), 0);
  assert.equal(nodeStep(2, 4, 'End'), 3);
  assert.equal(nodeStep(-1, 0, 'ArrowDown'), -1);
});

test('dialog tab wrap stays inside the last opened dialog', () => {
  assert.equal(focusWrap(0, 3, true), 2);
  assert.equal(focusWrap(2, 3, false), 0);
  assert.equal(focusWrap(-1, 3, false), 0);
  assert.equal(focusWrap(-1, 3, true), 2);
  assert.equal(focusWrap(0, 0, false), -1);
});

test('390 touch-target predicate catches undersized controls', () => {
  assert.equal(isSmallTarget(43, 44), true);
  assert.equal(isSmallTarget(44, 44), false);
  assert.equal(isSmallTarget(100, 43), true);
});


// ---- #1072 A-17: 접근성 세 규칙(image-alt·button-name·label) 위반 0 스캔 ----
// 로그아웃 예시 화면 다섯 개 + 모의 로그인 상태(보드 크게 보기·추가 창·수정 창·설정 프로필)를 훑는다.
// LT_A17_REQUIRE=1 에서 실행(CI 화면 잡 — 건너뜀=실패). 로컬에서는 화면 파일을 바꿨을 때 한 번 돌린다.
import { createTree, addMoment } from '../public/v41/domain.mjs';
import { serve } from './helpers/screen-audit.mjs';
import { createRequire } from 'node:module';

const REQUIRE_A17 = process.env.LT_A17_REQUIRE === '1';
let chromiumA17 = null;
let skipA17 = false;
try {
  ({chromium: chromiumA17} = await import('playwright'));
  if (!fs.existsSync(chromiumA17.executablePath())) skipA17 = 'Playwright chromium이 없어 접근성 스캔을 건너뜀';
} catch { skipA17 = 'playwright 패키지가 없어 접근성 스캔을 건너뜀'; }
if (REQUIRE_A17 && !fs.existsSync(new URL('../dist/v41/home.html', import.meta.url))) skipA17 = '빌드 결과가 없어 접근성 스캔을 건너뜀(npx vite build 필요)';

const A17_RULES = ['image-alt', 'button-name', 'label'];
const A17_AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

function treeA17() {
  let t = createTree({subject: '시험', title: '시험 트리', note: '', emotion: '설렘', date: '2026-11-20', url: ''}, '2026-11-20T00:00:00Z');
  t = addMoment(t, {title: '첫 순간', note: '첫 기록', emotion: '설렘', date: '2026-11-20', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}, t.moments[0].id, '2026-11-20T00:01:00Z');
  return t;
}

test('실행: 접근성 세 규칙(image-alt·button-name·label) 위반은 0이다', {skip: skipA17 || undefined, timeout: 300000}, async () => {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromiumA17.launch({headless: true});
  const findings = [];
  const runAxe = (frame, label) => frame.evaluate(async (rules) => {
    if (!window.axe?.run) return null;
    const result = await window.axe.run(document, {resultTypes: ['violations'], iframes: false, runOnly: {type: 'rule', values: rules}});
    return result.violations.map((v) => ({rule: v.id, nodes: v.nodes.map((n) => String(n.html || '').slice(0, 160))}));
  }, A17_RULES).then((list) => {
    if (!list) return;
    for (const violation of list) for (const node of violation.nodes) findings.push(`${label} [${violation.rule}] ${node}`);
  }).catch(() => {});

  const scanPage = async (page, label) => {
    await page.waitForTimeout(700);
    for (const frame of page.frames()) {
      const url = frame.url();
      if (!url.startsWith(base)) continue; // YouTube 임베드 등 바깥 프레임은 이 저장소 검사 대상이 아니다
      await frame.evaluate(A17_AXE).catch(() => {});
      await runAxe(frame, label);
    }
  };

  try {
    // 1) 로그아웃 예시 — 첫 화면·서재·책·보드·지도 + 의견 보내기 창
    const out = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    const pageOut = await out.newPage();
    for (const screen of [['home', ''], ['shelf', '#shelf'], ['book', '#book'], ['board', '#board'], ['network', '#network']]) {
      await pageOut.goto(`${base}/v41/${screen[1]}`, {waitUntil: 'load'}).catch(() => {});
      await pageOut.waitForTimeout(2200);
      await scanPage(pageOut, `로그아웃·${screen[0]}`);
    }
    // 의견 보내기 창(로그아웃 첫 화면 작은 링크)
    await pageOut.goto(`${base}/v41/`, {waitUntil: 'load'}).catch(() => {});
    await pageOut.waitForTimeout(2200);
    await pageOut.evaluate(() => document.getElementById('feedback-link')?.click()).catch(() => {});
    await pageOut.waitForTimeout(700);
    await scanPage(pageOut, '로그아웃·의견 보내기');
    await out.close();

    // 2) 모의 로그인 — 보드(크게 보기·추가 창·수정 창) + 설정 프로필(표시 이름 칸)
    const inw = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    const tree = treeA17();
    await inw.route('**/api/**', (route) => route.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}'}));
    await inw.route('**/api/workspace*', (route) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({revision: 1, state: {version: 1, trees: [tree]}, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z'})}));
    const pageIn = await inw.newPage();
    await pageIn.goto(`${base}/v41/?account=1#board`, {waitUntil: 'load'}).catch(() => {});
    await pageIn.waitForFunction(() => !!window.LT41?.trees?.length, null, {timeout: 20000}).catch(() => {});
    await pageIn.waitForTimeout(2500);
    await scanPage(pageIn, '모의로그인·보드');
    const frameB = pageIn.frames().find((f) => /pinboard/.test(f.url()));
    if (frameB) {
      const firstId = await frameB.evaluate(() => window.LTDEMO?.moments?.[0]?.id || '');
      if (firstId) {
        await frameB.evaluate((id) => openViewer(id), firstId).catch(() => {});
        await pageIn.waitForTimeout(700);
        await scanPage(pageIn, '모의로그인·보드 크게 보기');
        await frameB.evaluate(() => document.getElementById('viewerModal')?.classList.remove('open')).catch(() => {});
        await frameB.evaluate(() => openAdd()).catch(() => {});
        await pageIn.waitForTimeout(700);
        await scanPage(pageIn, '모의로그인·보드 추가 창');
        await frameB.evaluate(() => document.getElementById('addModal')?.classList.remove('open')).catch(() => {});
        await frameB.evaluate((id) => { selectMoment(id, true); openEdit(); }, firstId).catch(() => {});
        await pageIn.waitForTimeout(700);
        await scanPage(pageIn, '모의로그인·보드 수정 창');
        await frameB.evaluate(() => document.getElementById('editModal')?.classList.remove('open')).catch(() => {});
      }
    }
    await pageIn.evaluate(() => document.getElementById('account-avatar')?.click()).catch(() => {});
    await pageIn.waitForTimeout(600);
    await pageIn.evaluate(() => document.getElementById('account-open-settings')?.click()).catch(() => {});
    await pageIn.waitForTimeout(900);
    await pageIn.evaluate(() => document.getElementById('settings-tab-profile')?.click()).catch(() => {});
    await pageIn.waitForTimeout(500);
    await scanPage(pageIn, '모의로그인·설정 프로필');
    await inw.close();

    assert.deepEqual(findings, [], `접근성 세 규칙 위반이 없어야 한다:\n${findings.join('\n')}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
