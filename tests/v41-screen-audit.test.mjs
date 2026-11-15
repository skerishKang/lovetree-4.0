// #657 — 화면 공통 검사기. 이슈마다 따로 짜 온 '겹침 0·NaN 없음·글자 12px 이상' 검사를 하나로 모은다.
// 검사 함수는 tests/helpers/screen-audit.mjs에 있다(①겹침·가려짐 #635 규칙 ②가로 넘침·잘림 ③흔적 값 넷 #635 ④글자 기준선 #548 ⑤알림 줄이 아래 링크 줄·＋ 단추·새 소식 카드를 덮지 않음 #666).
// 화면 목록: 첫 화면(예시)·책(공유 링크, 마지막 장 포함)·보드·지도·둘러보기·의견 보내기 창(보내기 전·후)·어떻게 쓰나요 안내.
// #666이 더한 상태: 알림 줄(토스트)이 떠 있는 셸 첫 화면·보드 — ＋ 단추(body.lt-fab-ok)와 새 소식 카드가 함께 뜬 자리에서 잰다.
// #666 2번이 더한 상태: 계정 메뉴가 열린 자리·닫힌 자리의 첫 트리 안내 — 메뉴가 열려 있는 동안 안내는 접혀 있고 겹침 0.
// 크기·테마: 390·1440 × 밤·정원. 앞으로 화면 수리는 아래 SCREENS에 화면이나 상태를 한 줄 더하는 것으로 끝낸다.
// #678 후속 B가 더한 상태: 내 의견 덧붙임 고치기 열림 — 내 덧붙임의 고치기 입력칸·단추·(고침) 표시가 함께 보이는 자리.
//
// 알려진 문제(기준을 낮추지 않는다): main에서 이미 나는 실패는 KNOWN에 화면·항목·이슈 번호와 함께 적고,
// 그 줄은 빨강이 아니라 보고로 넘긴다. KNOWN에 없는 실패만 이 시험을 빨갛게 만든다.
// 크롬(Playwright chromium)이 없는 곳에서는 건너뛴다 — CI(LT_SCREEN_AUDIT_REQUIRE=1)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_SCREEN_AUDIT_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 공통 검사를 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 공통 검사를 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 공통 검사를 건너뜀(npx vite build 필요)';

// — 알려진 문제 목록 — main에서 이미 나는 것(기준을 낮추지 않고 따로 기록한다. 목록 밖의 새 실패만 빨강이 된다) —
// 형식: { 화면(줄 맨 앞), 항목, 찾을: 줄에서 찾을 정규식, 이슈 }
// #662에서 보드·안내·책의 항목을 모두 고쳐 KNOWN에서 뺐다 — 이제 검사기가 지켜서 새로 생기면 빨강이 된다.
const KNOWN = [
  // #666 2번의 새 상태가 처음 그린 자리 — 첫 화면 '최근 순간' 카드(src/views/orbit.js:80)의 아래 두 줄이 11px다
  // (레거시 첫 화면 모양. 트리가 있어야 뜨므로 지금까지 잰 적이 없었다). 이 이슈에서는 손대지 않는다.
  { 화면: '계정 메뉴·첫 트리 안내', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548(12px 기준)·레거시 첫 화면' },
  { 화면: '계정 메뉴 닫힘·첫 트리 안내', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548(12px 기준)·레거시 첫 화면' },
  // 지도 — Track56 원본 모양: 안내 문구가 캔버스 뒤에 깔려 있다(원본 보존 커밋 b2567fe — 원본 구조는 바꾸지 않는다).
  { 화면: '지도', 항목: '가려짐', 찾을: 'p ← canvas#stage', 이슈: 'Track56 원본(b2567fe)' },
  // #678 후속: 둘러보기 상태에 처음 그려진 커뮤니티 카드(가짜 데이터) — main 기존 모양의 10·11px(이슈 540·611 3번 원본). 이 변경에서 손대지 않는다.
  { 화면: '둘러보기', 항목: '작은글자', 찾을: '(span.community-tag|p.community-subject|p.community-muted|summary "댓글)', 이슈: '#540·#611 3번 커뮤니티 카드 원본(10·11px — 이 변경에서 손대지 않음)' },
];

// #638: '내 의견 목록' 상태 — 상태 말 네 가지·답변·새 소식 링크가 한 화면에 보이게 하는 가짜 게시물.
// #678 후속 B: p5에는 내 덧붙임 둘(하나는 고친 것 — (고침) 표시)과 운영센터 답변 하나가 있다.
// 운영센터 답변도 authorType은 'customer'지만 canEdit·canDelete가 false라 고치기·지우기 단추가 그려지지 않아야 한다.
const MINE_POSTS = [
  { id: 1, kind: 'opinion', status: 'received', createdAt: '2026-11-10T09:00:00.000Z', title: '책 넘기기가 느려요', body: '책 넘기기가 느려요\n390 화면에서 특히 그래요', issueNumber: null, replies: [] },
  { id: 2, kind: 'opinion', status: 'reviewing', createdAt: '2026-11-11T09:00:00.000Z', title: '지도 글자가 작아요', body: '지도 글자가 작아요', issueNumber: null, replies: [{ id: 'r1', mine: false, body: '살펴보고 있어요' }] },
  { id: 3, kind: 'opinion', status: 'fixed', createdAt: '2026-11-12T09:00:00.000Z', title: '지도 날짜가 잘못 보여요', body: '지도 날짜가 잘못 보여요', issueNumber: 638, replies: [{ id: 'r2', mine: false, body: '4.1.4에서 고쳤어요' }] },
  { id: 4, kind: 'journal', status: 'closed', createdAt: '2026-11-13T09:00:00.000Z', title: '오늘 사용 일지', body: '오늘 사용 일지 내용', issueNumber: null, replies: [] },
  { id: 5, kind: 'opinion', status: 'reviewing', createdAt: '2026-11-15T09:00:00.000Z', title: '내 의견 덧붙임 고치기 화면 확인', body: '내 의견 덧붙임 고치기 화면을 확인하기 위한 시험 의견입니다', issueNumber: null, replies: [
    { id: 'f1', authorType: 'customer', mine: true, canEdit: true, canDelete: true, edited: false, body: '처음 남긴 덧붙임', createdAt: '2026-11-15T09:05:00.000Z' },
    { id: 'f2', authorType: 'customer', mine: true, canEdit: true, canDelete: true, edited: true, body: '고쳐서 저장한 덧붙임', createdAt: '2026-11-15T09:06:00.000Z' },
    { id: 'f3', authorType: 'customer', mine: false, canEdit: false, canDelete: false, edited: false, body: '운영센터가 남긴 답변입니다. 덧붙임이 아니라 단추가 보이지 않아요.', createdAt: '2026-11-15T09:07:00.000Z' }
  ] }
];

// #678 후속(윤제 4회차): 둘러보기 상태 — 반응이 하나도 없는 공개 트리 카드. 0짜리 칩 7개 대신
// '반응 남기기' 한 개만 보이는지 검사한다. 카드 글자 중 main에서 이미 10·11px인 것은 KNOWN으로 넘긴다.
const COMMUNITY_CARDS = [
  { shareId: 'c0000000000000000000000a', title: '화면 확인용 공개 트리', subject: '확인 대상', summary: '첫 순간 소개', createdAt: '2026-11-15T09:00:00.000Z', momentCount: 3, aiTester: false, emotions: ['설렘'], cover: { url: '', title: '첫 순간', emotion: '설렘' }, stats: { favorites: 0, hearts: 0, favored: false, hearted: false, reactions: { heart: 0, like: 0, love: 0, laugh: 0, wow: 0, sad: 0, angry: 0 }, mine: [] } }
];

const knownHit = (항목, 줄) => KNOWN.some((k) => 줄.startsWith(k.화면) && k.항목 === 항목 && new RegExp(k.찾을).test(줄));

// 썸네일 자리를 채우는 1px PNG — 외부 네트워크 없이 결정적으로(썸네일 카드 모양) 그린다.
const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

// 시험 트리(#635와 같은 모양 — 순간 3개 사슬, 첫 순간은 유튜브). 가짜 데이터다.
// 첫 순간이 두 갈래(e2·e3)를 나가므로 첫 장에 갈림길 탭이 보인다 — #700 후속 탭 글자 크기·잘림 검사 대상.
const VIDEO_TITLE = 'Super Shy — Official MV';
const tree = (() => {
  const moments = [
    { id: 'm1', title: 'super shy — official mv', date: '2026-11-01', emotion: '설렘', note: '첫 날의 글', parentId: null, relation: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaMetadata: { title: VIDEO_TITLE, channel: '예시 채널' }, x: null, y: null, rot: 0, color: 'rose', keywords: [], privacy: 'public' },
    { id: 'm2', title: '둘째 순간', date: '2026-11-02', emotion: '행복', note: '이어지는 글', parentId: 'm1', relation: '같이 들어서', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'sky', keywords: ['무대'], privacy: 'public' },
    { id: 'm3', title: '마지막 순간', date: '2026-11-03', emotion: '그리움', note: '끝의 글', parentId: 'm1', relation: '', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'gold', keywords: [], privacy: 'public' }
  ];
  const edges = [
    { id: 'e2', kind: 'parent', from: 'm1', to: 'm2', reason: '같이 들어서' },
    { id: 'e3', kind: 'parent', from: 'm1', to: 'm3', reason: '다른 경로' }
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
const firstTree = createTree({ subject: '시험', title: '시험 트리', note: '기록', emotion: '설렘', date: '2026-11-15', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, '2026-11-15T00:00:00.000Z');
// #627 PR B: '꼬리표 줄이 열린 상세'·'꼬리표 정리 화면' 상태에 쓰는 모양 — 첫 순간에는 꼬리표가 있고(종류 표시와 옛 낱말 섞음),
// 둘째 순간에는 없어 '제목에서 꼬리표 한 번에 제안받기'의 대상이 된다. 도메인 규칙을 통과하는 값만 쓴다.
firstTree.moments[0].keywords = ['노래:Super Shy', '무대'];
const tagSecond = addMoment(firstTree, { subject: '시험', title: '뉴진스 Super Shy 직캠 @인기가요 23716', note: '기록', emotion: '설렘', date: '2026-11-15', url: '' }, firstTree.moments[0].id, '2026-11-15T00:01:00.000Z');
if (!tagSecond?.moments?.length && !tagSecond?.tree?.moments?.length) throw new Error('시험 트리의 둘째 순간을 만들지 못했다');

// #627 PR3: '그래프 보기' 상태의 시험 트리 — 꼬리표 허브 8종(무대·노래·멤버·가수)·같은 영상 묶음(stacks)·
// 꼬리표 없는 순간 3개(선반·제안받기 대상). 도메인 규칙(createTree·addMoment)으로 만들어 셸이 그대로 받게 한다 —
// 호스트(LT41 직접 주입)와 셸 주소(#my/graph) 양쪽에서 같은 트리를 쓴다.
const graphTree = (() => {
  const V = 'https://www.youtube.com/watch?v=';
  const defs = [
    { title: '데뷔쇼 첫 무대', date: '2026-01-10', url: V + 'aaa11111111', keywords: ['가수:하츠투하츠', '무대:데뷔쇼'] },
    { title: '데뷔쇼 다시 보기', date: '2026-01-20', url: V + 'aaa11111111', keywords: ['가수:하츠투하츠', '무대:데뷔쇼'] },
    { title: '쇼챔 1주차', date: '2026-02-05', url: V + 'bbb22222222', keywords: ['가수:하츠투하츠', '무대:쇼챔피언', '노래:With'] },
    { title: '쇼챔 2주차', date: '2026-02-12', url: V + 'bbb22222222', keywords: ['가수:하츠투하츠', '무대:쇼챔피언', '노래:With', '멤버:제나'] },
    { title: '쇼챔 3주차', date: '2026-02-19', url: V + 'ccc33333333', keywords: ['가수:하츠투하츠', '무대:쇼챔피언', '노래:15-LOVE'] },
    { title: '제나 직캠', date: '2026-03-01', url: V + 'ddd44444444', keywords: ['가수:하츠투하츠', '멤버:제나'] },
    { title: '제나 직캠 세로', date: '2026-03-02', url: V + 'ddd44444444', keywords: ['가수:하츠투하츠', '멤버:제나'] },
    { title: '팬콘 하이투치', date: '2026-04-10', url: V + 'eee55555555', keywords: ['가수:하츠투하츠', '무대:팬콘'] },
    { title: '팬콘 앙코르', date: '2026-04-11', url: V + 'eee55555555', keywords: ['가수:하츠투하츠', '무대:팬콘'] },
    { title: '멜론 어워즈 무대', date: '2026-05-20', url: V + 'fff66666666', keywords: ['가수:하츠투하츠', '무대:멜론뮤직어워즈'] },
    { title: 'RESCENE 단체 컨셉', date: '2026-06-01', url: V + 'ggg77777777', keywords: ['가수:RESCENE'] },
    { title: 'RESCENE 비하인드', date: '2026-06-02', url: V + 'hhh88888888', keywords: ['가수:RESCENE'] },
    { title: 'With 연습실', date: '2026-02-22', url: '', keywords: ['노래:With'] },
    { title: '15-LOVE 무대 영상', date: '2026-03-15', url: V + 'iii99999999', keywords: ['노래:15-LOVE'] },
    { title: '벤치의 기억', date: '2026-02-01', url: '', keywords: [] },
    { title: '산책한 날', date: '2026-04-03', url: '', keywords: [] },
    { title: '창밖의 비', date: '2026-05-05', url: '', keywords: [] }
  ];
  let t = createTree({ subject: '시험', title: '시험 트리(꼬리표)', note: '기록', emotion: '설렘', date: defs[0].date, url: defs[0].url }, '2026-11-15T00:00:00.000Z');
  t.moments[0].keywords = defs[0].keywords;
  for (let i = 1; i < defs.length; i++) {
    t = addMoment(t, { subject: '시험', title: defs[i].title, note: '기록', emotion: '설렘', date: defs[i].date, url: defs[i].url }, t.moments[0].id, '2026-11-15T00:0' + Math.min(i, 9) + ':00.000Z');
    t.moments.at(-1).keywords = defs[i].keywords;
  }
  return t;
})();
// 그래프 보기는 지금 주소(#my/graph)로만 열리는 화면이라 셸 상태 대신 호스트가 LT41을 직접 넘긴다(share-host와 같은 틀).
const graphHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>그래프 호스트</title></head>
<body data-member="in" data-record-source="file"><script>window.LT41={source:'file',writable:false,owned:true,momentId:'m01',prefs:{},tree:${JSON.stringify(graphTree)},trees:[${JSON.stringify(graphTree)}]};</script>
<iframe src="/v41/views/graph/track60-graph.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const frameOf = async (page, test_) => {
  for (let i = 0; i < 80; i++) {
    const f = page.frames().find((f) => f !== page.mainFrame() && test_.test(f.url()));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  return null;
};

test('#657 화면 공통 검사기: 주요 화면 17 상태 × 390·1440 × 밤·정원에서 겹침·잘림·흔적 값·작은 글자가 0이다', { skip: REQUIRE ? false : skip, timeout: 900000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve({ '/share-host.html': shareHost, '/home-host.html': homeHost, '/graph-host.html': graphHost });
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
    // 장 넘김 애니메이션이 끝나기를 기다린다(#662 CI: 450ms 고정 대기는 넘김 중간에 검사해 img·clipping이 글자를 덮은 것으로 나왔다).
    const bookIdle = () => book.waitForFunction(() => { try { return machineState === 'IDLE'; } catch { return false; } }, null, { timeout: 5000 }).catch(() => {});
    await bookIdle();
    await page2.waitForTimeout(700);
    // #700 후속(갈림길 탭): 첫 장의 탭이 보이는 자리에서 글자 크기와 잘림을 직접 단정한다 —
    // 12px 기준(#548)에 단추 규칙(13px)을 적용하고, 무대(.stage) 밖으로 나가 잘리는 모양을 막는다.
    const branchTab = await book.evaluate(() => {
      const tab = document.getElementById('branchTab');
      if (!tab || tab.hidden) return null;
      const stage = document.querySelector('.stage');
      const tr = tab.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      return { font: parseFloat(getComputedStyle(tab).fontSize), tabRight: tr.right, stageRight: sr.right, text: tab.textContent.trim() };
    });
    assert.ok(branchTab, '첫 장에 갈림길 탭이 보인다(시험 트리의 첫 순간이 두 갈래를 나간다)');
    assert.ok(branchTab.font >= 13, `갈림길 탭 글자는 13px 이상이다(실측 ${branchTab.font}px)`);
    assert.ok(branchTab.tabRight <= branchTab.stageRight, `갈림길 탭이 무대 안쪽에 있어야 한다 — 잘림 0(탭 오른쪽 ${Math.round(branchTab.tabRight)}px / 무대 오른쪽 ${Math.round(branchTab.stageRight)}px)`);
    assert.ok(branchTab.text.includes('에서 갈라진 길'), `탭 문구는 그대로다(실측: ${branchTab.text})`);
    for (let i = 0; i < 12; i++) {
      await take(page2, i === 0 ? '책·공유 첫 장' : `책·공유 ${i + 1}장`);
      const next = book.locator('#nextBtn');
      if (await next.isDisabled()) break;
      await next.click();
      await bookIdle();
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
    // #662 후속(CTO 지시): 안내 풍선은 상세 판이 닫혀 있을 때만 뜬다 — 판은 로드 때 선택 복원으로 열려 있으므로 먼저 닫는다.
    // 닫힘 상태에서는 풍선이 캔버스 위에 뜬 상태로 겹침·대비를 풍선까지 잰다(풍선은 '도구×캔버스' 제외 대상이 아니다).
    const boardFrame = await frameOf(page3, /views\/track/);
    await boardFrame.evaluate(() => document.getElementById('detailClose').click());
    await boardFrame.waitForFunction(() => { const d = document.getElementById('detail'); if (!d || d.classList.contains('open')) return false; const r = d.getBoundingClientRect(); return r.left >= innerWidth || r.top >= innerHeight; }, null, { timeout: 5000 }).catch(() => {});
    await page3.waitForTimeout(300);
    await boardFrame.evaluate(() => toast('순간을 선택해 연결된 기록을 살펴보세요.'));
    await page3.waitForTimeout(400);
    await take(page3, '보드·안내·판 닫힘');
    // 판을 열면 안내는 치워진다(이미 순간을 선택했으므로) — 열림 상태에서도 겹침 0을 잰다.
    await boardFrame.evaluate(() => selectMoment(LTDEMO.get()));
    await page3.waitForTimeout(500);
    assert.equal(await boardFrame.evaluate(() => document.querySelector('.toast').classList.contains('show')), false, '상세 판이 열렸으면 보드 안내 풍선은 사라진다');
    await take(page3, '보드·안내·판 열림');
    await boardFrame.evaluate(() => document.getElementById('detailClose').click());
    // 판 닫힘 넘어가는 동안(0.35s transform)을 기다린다 — 중간에 검사하면 판 끝에 걸친 단추가 '가려짐'으로 잡힌다.
    await boardFrame.waitForFunction(() => { const d = document.getElementById('detail'); if (!d || d.classList.contains('open')) return false; const r = d.getBoundingClientRect(); return r.left >= innerWidth || r.top >= innerHeight; }, null, { timeout: 5000 }).catch(() => {});
    await page3.waitForTimeout(300);
    // #666: ＋ 단추(body.lt-fab-ok — 로그인해 내 기록을 쓰는 자리에서만 뜬다)를 함께 띄우고 알림 줄을 올린다.
    await page3.evaluate(() => document.body.classList.add('lt-fab-ok'));
    await raiseToast(page3);
    await take(page3, '보드·알림 줄');
    await lowerToast(page3);
    await page3.evaluate(() => document.body.classList.remove('lt-fab-ok'));
    await page3.evaluate(() => { location.hash = '#network'; });
    await page3.waitForTimeout(1800);
    await take(page3, '지도');
    // #638: 지도 390(조작 줄) — iframe 안 조작 줄이 셸의 링크 줄·＋ 단추와 겹치지 않고, 보기 전환 단추 대비 4.5:1.
    if (width === 390) {
      const ribbonCheck = await page3.evaluate(() => {
        const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(',').map((v) => parseFloat(v)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const mix = (t, b) => [t[0] * t[3] + b[0] * (1 - t[3]), t[1] * t[3] + b[1] * (1 - t[3]), t[2] * t[3] + b[2] * (1 - t[3]), 1];
        const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
        // iframe은 src 속성이 비어 있다(셸이 contentWindow.location.replace로 화면을 바꾼다) —
        // f.url()은 DOM iframe에 없어서 이 검사가 늘 빈손이었다(#638: contentWindow 주소로 찾는다).
        const frame = [...document.querySelectorAll('iframe')].find((f) => { try { return /track56-network/.test(f.contentWindow.location.href); } catch { return false; } });
        if (!frame) return null;
        const doc = frame.contentDocument;
        const ribbonEl = doc.getElementById('mobileRibbon');
        if (!ribbonEl || frame.contentWindow.getComputedStyle(ribbonEl).display === 'none') return null;
        const off = box(frame);
        const vp = (o) => o && { t: o.t + off.t, b: o.b + off.t, l: o.l + off.l, r: o.r + off.l };
        const ribbon = vp(box(ribbonEl));
        const links = box(document.querySelector('.home-links'));
        const fab = box(document.getElementById('mobile-add'));
        const ox = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = (a, b) => Math.min(a.b, b.b) - Math.max(a.t, b.t);
        const contrast = (el) => {
          if (!el || el.getBoundingClientRect().width < 2) return 0; // 좁은 화면에서 숨은 단추(왼쪽 판)는 대비를 재지 않는다
          const win = frame.contentWindow;
          const fg = rgb(win.getComputedStyle(el).color);
          const layers = [];
          for (let n = el; n; n = n.parentElement) { const bg = rgb(win.getComputedStyle(n).backgroundColor); if (bg) { layers.push(bg); if (bg[3] >= 1) break; } }
          let bgc = layers.length && layers[layers.length - 1][3] >= 1 ? layers[layers.length - 1] : [255, 255, 255, 1];
          for (let i = layers.length - 2; i >= 0; i--) bgc = mix(layers[i], bgc);
          const fge = fg[3] < 1 ? mix(fg, bgc) : fg;
          return Math.round((Math.max(lum(fge), lum(bgc)) + 0.05) / (Math.min(lum(fge), lum(bgc)) + 0.05) * 100) / 100;
        };
        return {
          cut: Math.max(0, ribbonEl.scrollWidth - ribbonEl.clientWidth),
          linksOverlap: links ? Math.max(0, ox(ribbon, links)) * Math.max(0, oy(ribbon, links)) : 0,
          fabOverlap: fab && fab.r > fab.l ? Math.max(0, ox(ribbon, fab)) * Math.max(0, oy(ribbon, fab)) : 0,
          contrastNet: contrast(doc.getElementById('viewNet')),
          contrastConc: contrast(doc.getElementById('viewConc'))
        };
      }).catch(() => null);
      if (ribbonCheck) {
        const tail = ` · ${width}·${theme}`;
        if (ribbonCheck.cut > 0) rows.push({ 항목: '잘림', 줄: `지도 390(조작 줄) 잘림 .mobile-ribbon ${Math.round(ribbonCheck.cut)}px 넘침${tail}` });
        if (ribbonCheck.linksOverlap > 0) rows.push({ 항목: '겹침', 줄: `지도 390(조작 줄) 겹침 .mobile-ribbon × .home-links ${Math.round(ribbonCheck.linksOverlap)}px²${tail}` });
        if (ribbonCheck.fabOverlap > 0) rows.push({ 항목: '겹침', 줄: `지도 390(조작 줄) 겹침 .mobile-ribbon × #mobile-add ${Math.round(ribbonCheck.fabOverlap)}px²${tail}` });
        for (const [id, v] of [['viewNet', ribbonCheck.contrastNet], ['viewConc', ribbonCheck.contrastConc]]) if (v > 0 && v < 4.5) rows.push({ 항목: '대비', 줄: `지도 390(조작 줄) 대비 #${id} ${v}:1 < 4.5:1${tail}` });
      }
    }
    await ctx3.close();

    // 둘러보기 → 의견 보내기 창 — 새로 뜬 셸에서(지도 잔상 상태에 좌우되지 않게)
    const ctx4 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx4.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx4.route('**://i.ytimg.com/**', THUMB);
    await ctx4.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    // #638: 내 의견 목록 — /api/board/mine만 가짜 게시물로 답한다(위의 포괄 목적 경로보다 나중에 등록한 것이 이긴다).
    await ctx4.route('**/api/board/mine*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, posts: MINE_POSTS }) }));
    await ctx4.route('**/api/community/shares*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: COMMUNITY_CARDS, totalVisible: COMMUNITY_CARDS.length }) }));
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
    // #678 후속(윤제 4회차): 반응이 없는 카드는 0짜리 칩 대신 '반응 남기기' 한 개만 보인다(수치로 판정).
    await page4.waitForFunction(() => !!document.querySelector('.community-reaction-open'), null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(400);
    const reactions = await page4.evaluate(() => ({
      open: document.querySelectorAll('.community-reaction-open').length,
      zeroChips: [...document.querySelectorAll('.community-reaction')].filter((b) => / 0$/.test(b.textContent.trim())).length
    }));
    assert.ok(reactions.open >= 1, '반응이 없으면 반응 남기기 단추가 보인다');
    assert.equal(reactions.zeroChips, 0, '0짜리 반응 칩은 보이지 않는다');
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
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(400);
    // #638: 새 소식 펼침 — 펼친 새 소식 목록에서 겹침·작은 글자가 0인지.
    await page4.evaluate(() => document.getElementById('updates-link')?.click());
    await page4.waitForFunction(() => !!document.getElementById('updates-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(500);
    await take(page4, '새 소식 펼침');
    // #638: '새로워진 것'·'고친 것' 제목은 한 버전에 한 번 — 출처 묶음마다 되풀이되지 않는다(수치로 판정).
    const repeats = await page4.evaluate(() => {
      const out = [];
      for (const v of document.querySelectorAll('.updates-version')) {
        const counts = new Map();
        for (const h of v.querySelectorAll('.updates-kind h3')) counts.set(h.textContent.trim(), (counts.get(h.textContent.trim()) || 0) + 1);
        for (const [t, n] of counts) if (n > 1) out.push(`${v.getAttribute('data-updates-version')} 버전 "${t}" ${n}번`);
      }
      return out;
    });
    for (const r of repeats) rows.push({ 항목: '되풀이', 줄: `새 소식 펼침 제목 되풀이 ${r} · ${width}·${theme}` });
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(400);
    // #638: 내 의견 목록 — 가짜 게시물로 상태 말·출처 묶음이 그려진 목록을 검사한다.
    await page4.evaluate(() => document.getElementById('account-my-posts')?.onclick?.());
    await page4.waitForFunction(() => !!document.getElementById('myposts-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(500);
    // #678 후속(윤제 4회차): 내 의견 머리 줄에 운영센터와 같은 의견 번호(#N)가 작게 보인다.
    const nos = await page4.evaluate(() => [...document.querySelectorAll('.myposts-no')].map((n) => n.textContent.trim()));
    assert.deepEqual(nos, ['#1', '#2', '#3', '#4', '#5'], '게시물마다 의견 번호(#N)가 보인다');
    await take(page4, '내 의견 목록');
    // #678 후속 B: 내 덧붙임 고치기 열림 — 고치기를 눌러 입력칸이 열린 자리. 내 덧붙임에만 단추가 있고
    // 고친 덧붙임에는 (고침) 표시가 붙으며, 운영센터 답변에는 단추가 없는 것까지 한 화면에서 본다.
    const editButtons = await page4.locator('.myposts-reply-btn[data-reply-edit]').count();
    assert.equal(editButtons, 2, '내 덧붙임 둘에만 고치기 단추가 있다(운영센터 답변에는 없다)');
    assert.equal(await page4.locator('.myposts-reply-edited').count(), 1, '고친 덧붙임에 (고침) 표시가 하나 있다');
    // 단추는 덧붙임 머리 줄 안에 있고, 겉모양은 작아도 누름 영역은 44px 이상이다(수치로 판정).
    const buttons = await page4.evaluate(() => {
      const list = [...document.querySelectorAll('.myposts-reply-head .myposts-reply-btn')];
      const rects = list.map(b => b.getBoundingClientRect());
      return { count: list.length, inHead: list.every(b => b.closest('.myposts-reply-head')), minH: Math.round(Math.min(...rects.map(r => r.height))), minW: Math.round(Math.min(...rects.map(r => r.width))) };
    });
    assert.equal(buttons.count, 4, '고치기·지우기 단추 네 개(내 덧붙임 둘)가 모두 머리 줄 안에 있다');
    assert.equal(buttons.inHead, true, '단추의 부모는 덧붙임 머리 줄이다');
    assert.ok(buttons.minH >= 44 && buttons.minW >= 44, `누름 영역 44px 이상(최소 ${buttons.minW}×${buttons.minH}px)`);
    await page4.locator('.myposts-reply-btn[data-reply-edit]').first().click();
    // 고치기 중에는 원래 덧붙임 카드가 숨는다(같은 글이 두 번 보이지 않게).
    await page4.waitForFunction(() => !!document.querySelector('.myposts-reply-edit input'), null, { timeout: 8000 });
    await page4.waitForTimeout(400);
    const editState = await page4.evaluate(() => {
      const editInput = document.querySelector('.myposts-reply-edit input');
      const hiddenBoxes = [...document.querySelectorAll('.myposts-reply')].filter(b => b.hidden);
      return { open: Boolean(editInput), hiddenCount: hiddenBoxes.length };
    });
    assert.equal(editState.open, true, '고치기 입력칸이 열려 있다');
    assert.equal(editState.hiddenCount, 1, '고치는 덧붙임 카드 하나가 숨는다');
    await take(page4, '내 의견 덧붙임 고치기 열림');
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
    // #627 PR B: 꼬리표 줄이 열린 상세(보드) — 확정 칩·직접 입력이 보이는 자리에서 겹침·잘림·작은 글자를 잰다.
    // 같은 문맥에서 보드를 새로 연다(주소에 보기까지 넣는다 — 셸은 불러올 때의 주소로 보기를 정한다).
    const page6 = await ctx5.newPage();
    await page6.goto(`${base}/v41/?account=1#board`, { waitUntil: 'load' });
    await frameOf(page6, /views\/track/);
    await page6.waitForTimeout(1500);
    const tagBoard = await frameOf(page6, /track58-pinboard/);
    assert.ok(tagBoard, '보드 프레임이 열린다(꼬리표 줄 상태)');
    await tagBoard.waitForFunction(() => !!document.getElementById('dTags') && document.getElementById('dTags').childNodes.length > 0, null, { timeout: 10000 }).catch(() => {});
    await tagBoard.evaluate(() => selectMoment(LTDEMO.moments[0].id));
    await page6.waitForTimeout(600);
    // 직접 입력 줄이 실제로 보이는지 단정한다(숨김 클래스를 쓰면 검사기 겹침만으로는 못 잡는다 — 실측에서 잡았던 결함).
    const tagInputSeen = await tagBoard.evaluate(() => ['.lt-tagline-kind', '.lt-tagline-value', '.lt-tagline-add'].map((s) => {
      const el = document.querySelector(`#dTags ${s}`);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none';
    }));
    assert.deepStrictEqual(tagInputSeen, [true, true, true], '꼬리표 직접 입력(종류·값·붙이기)이 상세 판에 보여야 한다');
    // #627 2차: '보드 1440 판 폭' — 보드 iframe이 셸 내용 폭을 다 쓰는지, 보드 안 .app이 가로로 밀려
    // (숨은 가로 스크롤) 오른쪽에 검은 빈 자리가 생기지 않는지 단정한다. 스크롤을 부르는 동작을 해도
    // 판이 밀리지 않아야 한다(overflow:clip으로 스크롤 컨테이너가 아니게 만들었다).
    const boardWidth = await page6.evaluate(() => ({
      stageW: document.getElementById('stage').clientWidth,
      frameW: Math.round(document.getElementById('view').getBoundingClientRect().width),
    }));
    assert.equal(boardWidth.frameW, boardWidth.stageW, `보드 iframe 폭 = 셸 내용 폭(실제: ${JSON.stringify(boardWidth)})`);
    const appScroll = await tagBoard.evaluate(() => {
      const app = document.getElementById('app');
      return { sl: app.scrollLeft, sw: app.scrollWidth, cw: app.clientWidth };
    });
    assert.equal(appScroll.sl, 0, '보드 .app이 가로로 밀려 있지 않다(검은 빈 자리 없음)');
    await tagBoard.evaluate(() => { document.getElementById('app').scrollLeft = 400; });
    assert.equal(await tagBoard.evaluate(() => document.getElementById('app').scrollLeft), 0, '보드 .app은 가로 스크롤 컨테이너가 아니다(overflow:clip — 밀어도 안 밀린다)');
    await tagBoard.evaluate(() => document.getElementById('dTags').scrollIntoView({ block: 'center' }));
    await page6.waitForTimeout(200);
    assert.equal(await tagBoard.evaluate(() => document.getElementById('app').scrollLeft), 0, '꼬리표 줄로 스크롤해도 보드 판이 가로로 밀리지 않는다');
    await take(page6, '꼬리표 줄이 열린 상세');
    // #627 PR B: 꼬리표 정리 화면 — 목록·개수와 '제목에서 꼬리표 한 번에 제안받기'가 그려진 자리를 잰다.
    await page6.evaluate(() => document.getElementById('record-menu')?.click());
    await page6.waitForTimeout(400);
    await page6.evaluate(() => document.querySelector('[data-tree-action="tags"]')?.click());
    await page6.waitForFunction(() => !!document.getElementById('tag-panel')?.open, null, { timeout: 8000 });
    await page6.waitForTimeout(300);
    await page6.evaluate(() => document.getElementById('tag-suggest-open')?.click());
    await page6.waitForTimeout(400);
    await take(page6, '꼬리표 정리 화면');
    // #627 후속: 책 쪽(카드)에도 확정 꾀리표가 그려지는지 단정한다 — 책 페이지는 book-extra.js가
    // momentContent를 덮어 써 paintTitle로 제목 줄을 다시 그리므로, 거기에 꾀리표가 없으면 책 카드에는
    // 끝내 보이지 않는다(실측에서 잡았던 결함). 첫 순간을 선택한 채 책으로 넘어가 칩을 센다.
    await page6.evaluate(() => { location.hash = '#my/book?tree=' + LT41.tree.id; });
    await frameOf(page6, /track59-sketchbook/);
    await page6.waitForTimeout(1500);
    const bookChips = await (await frameOf(page6, /track59-sketchbook/)).evaluate(() =>
      [...document.querySelectorAll('.moment-title .lt-tag-chip')].map((n) => n.textContent.trim()));
    assert.ok(bookChips.includes('Super Shy') && bookChips.includes('무대'), `책 쪽에 확정 꾀리표 칩이 그려져야 한다(실제: ${JSON.stringify(bookChips)})`);
    await ctx5.close();

    // #627 PR3: 그래프 보기 — 지금은 주소(#my/graph)로만 열리는 화면이라 호스트가 LT41을 직접 넘긴다
    // (share-host와 같은 틀, 실제 트리 = 셸이 넘기는 순간들과 같은 모양). 허브 이름 상자 겹침 0·
    // 가로 넘침 0·고리 썸네일 동그라미 보임을 수치로 단정한다.
    const ctx7 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx7.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx7.route('**://i.ytimg.com/**', THUMB);
    await ctx7.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page7 = await ctx7.newPage();
    await page7.goto(`${base}/graph-host.html`, { waitUntil: 'domcontentloaded' });
    const graphFrame = await frameOf(page7, /track60-graph/);
    assert.ok(graphFrame, '그래프 프레임이 열린다');
    await page7.waitForTimeout(700);
    await take(page7, '그래프 보기');
    const graphCheck = await page7.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const names = [...doc.querySelectorAll('.g-hubname')];
      const boxes = names.map((x) => x.getBoundingClientRect());
      let hubPairs = 0;
      const pairTexts = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
          hubPairs++;
          pairTexts.push(names[i].textContent + '×' + names[j].textContent + ' @' + Math.round(a.left) + ',' + Math.round(a.top));
        }
      }
      return {
        hubPairs,
        pairTexts,
        hubs: names.length,
        thumbs: doc.querySelectorAll('#gsvg image').length,
        stacks: [...doc.querySelectorAll('.g-stackcount')].map((x) => x.textContent),
        overflow: Math.max(0, doc.documentElement.scrollWidth - doc.documentElement.clientWidth),
        badge: doc.getElementById('gBadge')?.textContent || ''
      };
    });
    assert.equal(graphCheck.hubPairs, 0, `허브 이름 상자 겹침 0(실제 ${graphCheck.hubPairs}: ${JSON.stringify(graphCheck.pairTexts)})`);
    assert.equal(graphCheck.overflow, 0, `그래프 보기 가로 넘침 0(실제 ${graphCheck.overflow})`);
    assert.ok(graphCheck.hubs >= 4, `허브가 그려진다(실제 ${graphCheck.hubs})`);
    assert.ok(graphCheck.thumbs >= 3, `고리 썸네일 동그라미가 보인다(실제 ${graphCheck.thumbs})`);
    assert.ok(graphCheck.stacks.length >= 1, `같은 영상·같은 무대 무더기 개수가 표시된다(실제 ${JSON.stringify(graphCheck.stacks)})`);
    assert.match(graphCheck.badge, /순간 17/, '표시에 순간 수가 있다');
    // CTO 지적(#713 후속): 검사기가 이름 상자끼리만 재었다 — 이름↔허브 점·이름↔'처음/지금'·'×N'↔점도 0이어야 한다.
    const graphTouch = await page7.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const rect = (x) => x.getBoundingClientRect().toJSON();
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const out = { nameOnDot: [], nameOnMark: [], countOnDot: [] };
      const dots = [...doc.querySelectorAll('.g-hubdot')].map((c) => ({ key: c.parentElement.getAttribute('data-hub-key'), r: rect(c) }));
      const marks = [...doc.querySelectorAll('.g-mark')].map((x) => ({ r: rect(x) }));
      for (const name of [...doc.querySelectorAll('.g-hubname')]) {
        const nr = rect(name);
        const key = name.parentElement?.getAttribute('data-hub-key');
        const own = dots.find((d) => d.key === key);
        if (own && hit(nr, own.r)) out.nameOnDot.push(name.textContent + ' ← 자기 점 @' + Math.round(nr.left) + ',' + Math.round(nr.top) + ' w' + Math.round(nr.width) + ' | dot @' + Math.round(own.r.left) + ',' + Math.round(own.r.top) + ' w' + Math.round(own.r.width) + ' h' + Math.round(own.r.height));
        for (const mk of marks) if (hit(nr, mk.r)) out.nameOnMark.push(name.textContent + ' ← 처음/지금');
      }
      for (const count of [...doc.querySelectorAll('.g-stackcount')]) {
        const cr = rect(count);
        const dot = count.parentElement?.querySelector('circle');
        if (dot && hit(cr, rect(dot))) out.countOnDot.push(count.textContent + ' ← 점');
      }
      return out;
    });
    assert.deepEqual(graphTouch.nameOnDot, [], `허브 이름이 자기 점 위에 겹친다: ${JSON.stringify(graphTouch.nameOnDot)}`);
    assert.deepEqual(graphTouch.nameOnMark, [], `허브 이름이 '처음/지금' 표시와 겹친다: ${JSON.stringify(graphTouch.nameOnMark)}`);
    assert.deepEqual(graphTouch.countOnDot, [], `무더기 개수(×N)가 점 위에 겹친다: ${JSON.stringify(graphTouch.countOnDot)}`);
    assert.match(graphCheck.badge, /순간 17/, '표시에 순간 수가 있다');
    await ctx7.close();

    // 주소로 열리는지(#my/graph) — 셸이 그래프 보기를 화면 파일로 띄우는지 단정한다(메뉴 단추는 없다).
    const ctx8 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx8.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx8.route('**://i.ytimg.com/**', THUMB);
    await ctx8.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx8.route('**/api/workspace**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [graphTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    }));
    const page8 = await ctx8.newPage();
    await page8.goto(`${base}/v41/?account=1#my/graph`, { waitUntil: 'load' });
    const graphByHash = await frameOf(page8, /track60-graph/);
    assert.ok(graphByHash, '#my/graph 주소로 그래프 보기가 열린다(메뉴 연결 없이 주소로만)');
    await ctx8.close();

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
