// #657 — 화면 공통 검사기. 이슈마다 따로 짜 온 '겹침 0·NaN 없음·글자 12px 이상' 검사를 하나로 모은다.
// 검사 함수는 tests/helpers/screen-audit.mjs에 있다(①겹침·가려짐 #635 규칙 ②가로 넘침·잘림 ③흔적 값 넷 #635 ④글자 기준선 #548 ⑤알림 줄이 아래 링크 줄·＋ 단추·새 소식 카드를 덮지 않음 #666).
// 화면 목록: 첫 화면(예시)·책(공유 링크, 마지막 장 포함)·보드·지도·둘러보기·의견 보내기 창(보내기 전·후)·어떻게 쓰나요 안내.
// #666이 더한 상태: 알림 줄(토스트)이 떠 있는 셸 첫 화면·보드 — ＋ 단추(body.lt-fab-ok)와 새 소식 카드가 함께 뜬 자리에서 잰다.
// #666 2번이 더한 상태: 계정 메뉴가 열린 자리·닫힌 자리의 첫 트리 안내 — 메뉴가 열려 있는 동안 안내는 접혀 있고 겹침 0.
// 크기·테마: 390·1440 × 밤·정원. 앞으로 화면 수리는 아래 SCREENS에 화면이나 상태를 한 줄 더하는 것으로 끝낸다.
//
// 알려진 문제(기준을 낮추지 않는다): main에서 이미 나는 실패는 KNOWN에 화면·항목·이슈 번호와 함께 적고,
// 그 줄은 빨강이 아니라 보고로 넘긴다. KNOWN에 없는 실패만 이 시험을 빨갛게 만든다.
// 크롬(Playwright chromium)이 없는 곳에서는 건너뛴다 — CI(LT_SCREEN_AUDIT_REQUIRE=1)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';
import { createTree } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_SCREEN_AUDIT_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 공통 검사를 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 공통 검사를 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 공통 검사를 건너뜀(npx vite build 필요)';

// — 알려진 문제 목록 — main에서 이미 나는 것(기준을 낮추지 않고 따로 기록한다. 목록 밖의 새 실패만 빨강이 된다) —
// 형식: { 화면(줄 맨 앞), 항목, 찾을: 줄에서 찾을 정규식, 이슈 }
const KNOWN = [
  // #635 PR B의 안내 패널 — 390에서 닫기 단추 상자(72×44)가 제목 줄 상자와 약 12px 포개진다(글자끼리는 부딪히지 않는다).
  { 화면: '어떻게 쓰나요 안내', 항목: '겹침', 찾을: 'button\\.close × h2', 이슈: '#635' },
  // 책·공유 — 영상 칸의 출처 표(▶)가 #357에서 의도한 10px다(#548 기준 12px와 어긋난다. #548은 공유 책을 재지 않았다).
  { 화면: '책·공유', 항목: '작은글자', 찾을: 'span\\.media-source-mark', 이슈: '#357' },
  // 보드 390 — 좁은 판에서 머리글·도구줄·카드 글자 상자가 포개지고 잘린다(track58은 #267에서 갈라졌고, 머리글은 #417 모양이다).
  { 화면: '보드', 항목: '겹침', 찾을: '(noteText|treeTitleText|cardTitle)', 이슈: '#267·#417' },
  { 화면: '보드', 항목: '가려짐', 찾을: '(div\\.noteText ← button\\.tool|h3\\.cardTitle ← select|div\\.firstTag ← img)', 이슈: '#267' },
  { 화면: '보드', 항목: '잘림', 찾을: '(span\\.connWhy|span#treeTitleText)', 이슈: '#267' },
  // 보드 상세 판(#601 상세 재구성) — 열린 판이 테마 꼬리표를 덮고, ×단추 상자가 '순간 상세' 줄과 포개지고,
  // 판에서 내민 단추의 실제 마우스 Hit가 핀판 표면에 가로막긴다(기존 시험은 evaluate 클릭이라 못 봤다).
  { 화면: '보드', 항목: '겹침', 찾을: 'button#detailClose × div\\.label', 이슈: '#601' },
  { 화면: '보드', 항목: '가려짐', 찾을: '(button#openMoment|button#cinemaFromMoment|button#detailMapBtn) ← div\\.surface', 이슈: '#601' },
  { 화면: '보드', 항목: '가려짐', 찾을: 'div#themeBadge ← aside#detail', 이슈: '#601' },
  // #666 2번의 새 상태가 처음 그린 자리 — 첫 화면 '최근 순간' 카드(src/views/orbit.js:80)의 아래 두 줄이 11px다
  // (레거시 첫 화면 모양. 트리가 있어야 뜨므로 지금까지 잰 적이 없었다). 이 이슈에서는 손대지 않는다.
  { 화면: '계정 메뉴·첫 트리 안내', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548(12px 기준)·레거시 첫 화면' },
  { 화면: '계정 메뉴 닫힘·첫 트리 안내', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548(12px 기준)·레거시 첫 화면' },
  // 지도 — Track56 원본 모양: 안내 문구가 캔버스 뒤에 깔려 있다(원본 보존 커밋 b2567fe — 원본 구조는 바꾸지 않는다).
  { 화면: '지도', 항목: '가려짐', 찾을: 'p ← canvas#stage', 이슈: 'Track56 원본(b2567fe)' },
];

const knownHit = (항목, 줄) => KNOWN.some((k) => 줄.startsWith(k.화면) && k.항목 === 항목 && new RegExp(k.찾을).test(줄));

// 썸네일 자리를 채우는 1px PNG — 외부 네트워크 없이 결정적으로(썸네일 카드 모양) 그린다.
const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

// 시험 트리(#635와 같은 모양 — 순간 3개 사슬, 첫 순간은 유튜브). 가짜 데이터다.
const VIDEO_TITLE = 'Super Shy — Official MV';
const tree = (() => {
  const moments = [
    { id: 'm1', title: 'super shy — official mv', date: '2026-11-01', emotion: '설렘', note: '첫 날의 글', parentId: null, relation: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaMetadata: { title: VIDEO_TITLE, channel: '예시 채널' }, x: null, y: null, rot: 0, color: 'rose', keywords: [], privacy: 'public' },
    { id: 'm2', title: '둘째 순간', date: '2026-11-02', emotion: '행복', note: '이어지는 글', parentId: 'm1', relation: '같이 들어서', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'sky', keywords: ['무대'], privacy: 'public' },
    { id: 'm3', title: '마지막 순간', date: '2026-11-03', emotion: '그리움', note: '끝의 글', parentId: 'm2', relation: '', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'gold', keywords: [], privacy: 'public' }
  ];
  const edges = [
    { id: 'e2', kind: 'parent', from: 'm1', to: 'm2', reason: '같이 들어서' },
    { id: 'e3', kind: 'parent', from: 'm2', to: 'm3', reason: '' }
  ];
  return { id: 't1', title: '시험 트리', moments, edges };
})();

// 공유(감상) 호스트 — 셸이 LT41.source='share'를 iframe에 넘기는 것과 같은 틀(#635).
const shareHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>호스트</title></head><body data-member="out" data-record-source="share">
<script>window.LT41={source:'share',writable:false,owned:false,momentId:'m1',prefs:{},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};</script>
<iframe src="/v41/views/track59-sketchbook.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// 첫 화면 호스트 — 로그아웃 상태(예시 데이터가 그려진다).
const homeHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>첫 화면 호스트</title></head><body data-member="out" data-record-source="file" data-tree-count="0">
<script>window.LT41={source:'file',member:'out',treeCount:0,trees:[],prefs:{}};</script>
<iframe src="/v41/home.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// #666: 알림 줄을 실제 사용자 길로 띄운다 — 기록 파일을 열면 셸이 '파일을 열었어요…'(또는 '불러오기 실패…') 안내를 올린다.
// 알림 줄은 셸(index.html)의 #toast이고, 아래 링크 줄·＋ 단추·새 소식 카드도 같은 문서에 있다.
const raiseToast = async (page) => {
  await page.setInputFiles('#file', { name: 'record.json', mimeType: 'application/json', buffer: Buffer.from('{"trees":"깨진 값"}') }).catch(() => {});
  await page.waitForFunction(() => { const t = document.getElementById('toast'); return !!t && !t.hidden; }, null, { timeout: 8000 });
  await page.waitForTimeout(200);
  // 알림 줄이 실제로 떠 있고, 자리가 아래에 붙은 것들 위로 잡혔는지 먼저 확인한다(검사가 빈손으로 통과하지 않게).
  const box = await page.evaluate(() => {
    const t = document.getElementById('toast');
    const r = t.getBoundingClientRect();
    return { hidden: t.hidden, top: Math.round(r.top), bottom: Math.round(r.bottom), gap: getComputedStyle(document.documentElement).getPropertyValue('--lt-toast-bottom').trim(), text: t.textContent };
  });
  assert.equal(box.hidden, false, '알림 줄이 떠 있다');
  assert.ok(box.text.trim().length > 0, '알림 줄에 글자가 있다');
  assert.ok(Number.parseFloat(box.gap) > 0, `알림 줄 자리를 아래에 붙은 것들 위로 잡았다(--lt-toast-bottom: ${box.gap || '없음'})`);
  return box;
};
const lowerToast = async (page) => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); };

// #666 2번: 첫 트리 안내와 계정 메뉴는 한 번에 하나만. 안내는 서버 기록·로그인 소유자가 첫 트리를
// 만든 자리에서만 뜨므로(tipsWanted), 가짜 /api/workspace로 그 자리를 만든다. 트리 하나·순간 하나.
// 기록 문서는 도메인 규칙을 통과해야 셸이 '내 기록'으로 받아 준다(손으로 만든 트리는 거절된다) — createTree로 만든다.
const firstTree = createTree({ subject: '시험', title: '시험 트리', note: '기록', emotion: '설렘', date: '2026-11-15', url: '' }, '2026-11-15T00:00:00.000Z');

const frameOf = async (page, test_) => {
  for (let i = 0; i < 80; i++) {
    const f = page.frames().find((f) => f !== page.mainFrame() && test_.test(f.url()));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  return null;
};

test('#657 화면 공통 검사기: 주요 화면 14 상태 × 390·1440 × 밤·정원에서 겹침·잘림·흔적 값·작은 글자가 0이다', { skip: REQUIRE ? false : skip, timeout: 900000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve({ '/share-host.html': shareHost, '/home-host.html': homeHost });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const known = [], fresh = [];
  const SIZES = [[1440, 900], [390, 844]];

  // 한 조합(크기·테마)을 돌고 실패 줄을 돌려준다.
  const runCombo = async ([width, height], theme) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await context.route('**://i.ytimg.com/**', THUMB); // 썸네일은 네트워크 없이 1px 그림으로 — 막으면 대체 카드(11px 글자)가 나와 검사가 아니라 모양이 된다
    await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page = await context.newPage();
    const rows = [];
    const take = async (p, screen) => rows.push(...failuresOf(await auditPage(p, screen), `${width}`, theme));

    // 첫 화면(예시) → 어떻게 쓰나요 안내
    await page.goto(`${base}/home-host.html`, { waitUntil: 'domcontentloaded' });
    const home = await frameOf(page, /home\.html/);
    assert.ok(home, '첫 화면 프레임이 열린다');
    await home.waitForFunction(() => !!document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=guide]'), null, { timeout: 20000 });
    await page.waitForTimeout(700);
    await take(page, '첫 화면(예시)');
    await home.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=guide]').click());
    await home.waitForFunction(() => !!document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[aria-label="어떻게 쓰나요"]')?.open, null, { timeout: 5000 });
    await page.waitForTimeout(400);
    await take(page, '어떻게 쓰나요 안내');
    await context.close();

    // 책(공유 링크) — 첫 장부터 마지막 장까지 넘기며 매 장 검사
    const ctx2 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx2.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx2.route('**://i.ytimg.com/**', THUMB);
    await ctx2.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page2 = await ctx2.newPage();
    await page2.goto(`${base}/share-host.html`, { waitUntil: 'domcontentloaded' });
    const book = await frameOf(page2, /track59-sketchbook/);
    assert.ok(book, '책 프레임이 열린다');
    await book.waitForFunction(() => !!document.querySelector('.moment'), null, { timeout: 20000 });
    await page2.waitForTimeout(700);
    for (let i = 0; i < 12; i++) {
      await take(page2, i === 0 ? '책·공유 첫 장' : `책·공유 ${i + 1}장`);
      const next = book.locator('#nextBtn');
      if (await next.isDisabled()) break;
      await next.click();
      await page2.waitForTimeout(450);
    }
    await take(page2, '책·공유 마지막 장');
    await ctx2.close();

    // 셸 화면 — 보드 → 지도 → 둘러보기(한 번 뜬 셸에서 주소와 패널만 바꿔 본다)
    const ctx3 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx3.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx3.route('**://i.ytimg.com/**', THUMB);
    await ctx3.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page3 = await ctx3.newPage();
    await page3.goto(`${base}/v41/#board`, { waitUntil: 'load' });
    await frameOf(page3, /views\/track/); // 안쪽 화면 프레임이 뜰 때까지(검사 누락 방지)
    await page3.waitForTimeout(1200);
    await take(page3, '보드');
    // #666: ＋ 단추(body.lt-fab-ok — 로그인해 내 기록을 쓰는 자리에서만 뜬다)를 함께 띄우고 알림 줄을 올린다.
    await page3.evaluate(() => document.body.classList.add('lt-fab-ok'));
    await raiseToast(page3);
    await take(page3, '보드·알림 줄');
    await lowerToast(page3);
    await page3.evaluate(() => document.body.classList.remove('lt-fab-ok'));
    await page3.evaluate(() => { location.hash = '#network'; });
    await page3.waitForTimeout(1800);
    await take(page3, '지도');
    await ctx3.close();

    // 둘러보기 → 의견 보내기 창 — 새로 뜬 셸에서(지도 잔상 상태에 좌우되지 않게)
    const ctx4 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx4.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx4.route('**://i.ytimg.com/**', THUMB);
    await ctx4.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page4 = await ctx4.newPage();
    await page4.goto(`${base}/v41/`, { waitUntil: 'load' });
    await page4.waitForTimeout(1200);
    // #666: 셸 첫 화면(링크 줄 + 새 소식 카드 + ＋ 단추)에서 알림 줄이 이것들을 덮지 않는지 잰다.
    await page4.evaluate(() => document.body.classList.add('lt-fab-ok'));
    await raiseToast(page4);
    await take(page4, '셸 첫 화면·알림 줄');
    await lowerToast(page4);
    await page4.evaluate(() => document.body.classList.remove('lt-fab-ok'));
    await page4.evaluate(() => document.getElementById('community-menu')?.click());
    await page4.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(600);
    await take(page4, '둘러보기');
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(300);
    await page4.evaluate(() => document.getElementById('feedback-panel').showModal());
    await page4.waitForTimeout(400);
    await take(page4, '의견 창·보내기 전');
    await page4.selectOption('#feedback-category', 'bug');
    await page4.fill('#feedback-body', '화면 공통 검사기 시험 문장입니다');
    await page4.click('#feedback-send');
    await page4.waitForFunction(() => !document.getElementById('feedback-done')?.hidden, null, { timeout: 8000 });
    await page4.waitForTimeout(300);
    await take(page4, '의견 창·보낸 뒤');
    await ctx4.close();

    // #666 2번: 계정 메뉴가 열린 자리에서 첫 트리 안내가 메뉴를 덮지 않는다(한 번에 하나만).
    // 안내가 뜨고 메뉴가 열리면 안내를 잠시 접고, 메뉴를 닫으면 다시 뜨는 것까지 확인한다.
    const ctx5 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx5.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx5.route('**://i.ytimg.com/**', THUMB);
    await ctx5.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx5.route('**/api/workspace**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [firstTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    }));
    const page5 = await ctx5.newPage();
    // ?account=1 은 '내 기록을 불러오는 자리'라는 표시다(shouldLoadMemberRecords) — 로그인 화면으로 가지 않고 기록을 읽는다.
    await page5.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page5.waitForFunction(() => { const a = document.getElementById('account-avatar'); return a && !a.hidden; }, null, { timeout: 20000 });
    await page5.waitForFunction(() => !document.getElementById('tree-tips')?.hidden, null, { timeout: 8000 });
    await page5.click('#account-avatar');
    await page5.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 8000 });
    await page5.waitForTimeout(300);
    const both = await page5.evaluate(() => ({ tips: !document.getElementById('tree-tips').hidden, pop: !document.getElementById('account-popover').hidden }));
    assert.equal(both.pop, true, '계정 메뉴가 열렸다');
    assert.equal(both.tips, false, '메뉴가 열려 있는 동안 첫 트리 안내는 접혀 있다(한 번에 하나만 보인다)');
    await take(page5, '계정 메뉴·첫 트리 안내');
    // 접었다고 '봤음'으로 적지 않는다 — 메뉴를 닫으면 안내가 그대로 돌아온다.
    await page5.click('#account-avatar');
    await page5.waitForTimeout(400);
    const after = await page5.evaluate(() => ({ tips: !document.getElementById('tree-tips').hidden, pop: !document.getElementById('account-popover').hidden, seen: localStorage.getItem('lt41.tips.firstTree') || '' }));
    assert.deepEqual({ tips: after.tips, pop: after.pop }, { tips: true, pop: false }, '메뉴를 닫으면 안내가 다시 뜬다(봤음 처리하지 않음)');
    assert.notEqual(after.seen, '1', '접었다고 봤음으로 적지 않는다');
    await take(page5, '계정 메뉴 닫힘·첫 트리 안내');
    await ctx5.close();

    await context.close();
    return rows;
  };

  try {
    // 두 조합씩 나란히(같은 브라우저의 다른 문맥) — 잡 시간을 지키기 위해서다.
    for (const theme of ['night', 'garden']) {
      const pairs = await Promise.all(SIZES.map((s) => runCombo(s, theme)));
      for (const rows of pairs) for (const row of rows) (knownHit(row.항목, row.줄) ? known : fresh).push(row);
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (known.length) console.log(`#657 알려진 문제(${known.length}건 — KNOWN 목록에 있다, 기준 그대로):\n` + known.map((r) => '  ' + r.줄).join('\n'));
  assert.deepEqual(fresh, [], `알려진 문제 밖의 새 화면 실패 ${fresh.length}건:\n` + fresh.map((r) => '  ' + r.줄).join('\n'));
});
