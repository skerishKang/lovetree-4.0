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
// (261116: 둘러보기 카드 10·11px(#540·#611 3번)도 12px 이상으로 고쳐 KNOWN에서 뺐다 — #705 후속. KNOWN 4→3건.)
const KNOWN = [
  // #666 2번의 새 상태가 처음 그린 자리 — 첫 화면 '최근 순간' 카드(src/views/orbit.js:80)의 아래 두 줄이 11px다
  // (레거시 첫 화면 모양. 트리가 있어야 뜨므로 지금까지 잰 적이 없었다). 이 이슈에서는 손대지 않는다.
  { 화면: '계정 메뉴·첫 트리 안내', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548(12px 기준)·레거시 첫 화면' },
  { 화면: '계정 메뉴 닫힘·첫 트리 안내', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548(12px 기준)·레거시 첫 화면' },
  // '첫 화면 글자 카드' 상태(261116, #728 후속)가 처음 잰 자리 — 레거시 첫 화면·SRC064 원본의 기존 모양.
  { 화면: '첫 화면 글자 카드', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548·레거시 첫 화면(계정 메뉴 상태와 같은 줄)' },
  { 화면: '첫 화면 글자 카드', 항목: '작은글자', 찾을: 'div.memo(Kicker|Foot)', 이슈: 'SRC064 궤도 메모 카드 원본 9px(#728 후속 — 이 이슈에서 손대지 않는다)' },
  { 화면: '첫 화면 글자 카드', 항목: '겹침', 찾을: 'span.lt-fallback-date × strong.lt-fallback-title', 이슈: '#728 후속 — legacy box의 rect 보고(그림은 3줄 말줄임 — 2070·1440 줌 실측)' },
  { 화면: '첫 화면 글자 카드', 항목: '겹침', 찾을: '(span.lt-fallback-emotion × (strong|small)|strong.lt-fallback-title × button.subtleBtn|small.lt-fallback-notice × button.subtleBtn|div.firstMark × small)', 이슈: '궤도 카드가 가운데 UI 뒤를 지나가는 3D 원본 배치(#728 후속 — 궤도 배치 불변)' },
  // 지도 — Track56 원본 모양: 안내 문구가 캔버스 뒤에 깔려 있다(원본 보존 커밋 b2567fe — 원본 구조는 바꾸지 않는다).
  { 화면: '지도', 항목: '가려짐', 찾을: 'p ← canvas#stage', 이슈: 'Track56 원본(b2567fe)' },
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

// #678 후속(회차 지적): 둘러보기 상태 — 반응이 하나도 없는 공개 트리 카드. 0짜리 칩 7개 대신
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
let firstTree = createTree({ subject: '시험', title: '시험 트리', note: '기록', emotion: '설렘', date: '2026-11-15', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, '2026-11-15T00:00:00.000Z');
// #627 PR B: '꼬리표 줄이 열린 상세'·'꼬리표 정리 화면' 상태에 쓰는 모양 — 첫 순간에는 꼬리표가 있고(종류 표시와 옛 낱말 섞음),
// 둘째 순간에는 없어 '제목에서 꼬리표 한 번에 제안받기'의 대상이 된다. 도메인 규칙을 통과하는 값만 쓴다.
firstTree.moments[0].keywords = ['노래:Super Shy', '무대'];
// #678 후속(꼬리표 걸러 보기): 걸러 보기 상태 전용 트리 — 둘째 순간(꼬리표 없음)이 있어야
// 칩을 눌렀을 때 목록이 2건→1건으로 줄어드는 것을 검사할 수 있다. addMoment는 불변이므로 반환 트리를 쓴다.
const twoMomentTree = addMoment(firstTree, { subject: '시험', title: '뉴진스 Super Shy 직캠 @인기가요 23716', note: '기록', emotion: '설렘', date: '2026-11-15', url: '' }, firstTree.moments[0].id, '2026-11-15T00:01:00.000Z');
if (!twoMomentTree?.moments || twoMomentTree.moments.length !== 2) throw new Error('시험 트리의 둘째 순간을 만들지 못했다');

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
// 첫 화면 글자 카드(261116): 내려간 영상(없는 id → 회색 120×90)의 '영상을 볼 수 없어요' 카드를
// 궤도에서 그리기 위한 시험 트리 — 긴 사용자 제목 1건(3줄 높이 절단 대상)·영상 제목+채널 1건(보조 줄)·사진 1건.
const thumbTree = (() => {
  const V = 'https://www.youtube.com/watch?v=';
  let t = createTree({ subject: '시험', title: '글자 카드 시험 트리', note: '기록', emotion: '설렘', date: '2026-11-11', url: V + 'zz404zz404a' }, '2026-11-16T00:00:00.000Z');
  t.moments[0].title = 'CHAERYEONG Moonlit Club 퍼포먼스를 보고 그 밤의 무대 조명이 꽃처럼 피어 올랐던 기억을 길고 담백하게 적어 본다';
  t.moments[0].url = V + 'zz404zz404a';
  t.moments[0].mediaMetadata = { thumbnail: '', width: 1920, height: 1080 };
  t.moments[0].createdAt = '2026-11-13T09:00:00.000Z'; t.moments[0].updatedAt = t.moments[0].createdAt;
  t = addMoment(t, { subject: '시험', title: '내려간 직캠 영상', note: '기록', emotion: '그리움', date: '2026-11-12', url: V + 'zz404zz404b' }, t.moments[0].id, '2026-11-16T00:01:00.000Z');
  t.moments[1].mediaMetadata = { title: '유튜브에서 내려간 무대 직캠 영상', channel: 'KBS Kpop', thumbnail: '', width: 1920, height: 1080 };
  t.moments[1].createdAt = '2026-11-12T09:00:00.000Z'; t.moments[1].updatedAt = t.moments[1].createdAt;
  t = addMoment(t, { subject: '시험', title: '사진 순간(정상)', note: '기록', emotion: '즐거움', date: '2026-11-10', url: '' }, t.moments[0].id, '2026-11-16T00:02:00.000Z');
  t.moments[2].mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8a5a6e"/></svg>').toString('base64') };
  t.moments[2].createdAt = '2026-11-10T09:00:00.000Z'; t.moments[2].updatedAt = t.moments[2].createdAt;
  return t;
})();
// 그래프 보기는 지금 주소(#my/graph)로만 열리는 화면이라 셸 상태 대신 호스트가 LT41을 직접 넘긴다(share-host와 같은 틀).
const graphHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>그래프 호스트</title></head>
<body data-member="in" data-record-source="file"><script>window.LT41={source:'file',writable:false,owned:true,momentId:'m01',prefs:{},tree:${JSON.stringify(graphTree)},trees:[${JSON.stringify(graphTree)}]};</script>
<iframe src="/v41/views/graph/track60-graph.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// 2026-11-16 CTO 지적: 묶음 0개 그래프 — 꼬리표 값이 하나뿐인 순간 둘(허브 규칙은 같은 꼬리표 2개 이상)이라
// 판 가운데가 비어 보인다. 빈 판 안내(같은 꼬리표 2개 이상이면 묶임 + 제안받기 단추)를 단정하는 상태의 호스트.
const graphEmptyTree = (() => {
  const t = createTree({ subject: '시험', title: '시험 트리', note: '기록', emotion: '설렘', date: '2026-11-16', url: 'https://www.youtube.com/watch?v=aaa11111111' }, '2026-11-16T00:00:00.000Z');
  t.moments[0].keywords = ['노래:Super Shy'];
  const second = addMoment(t, { subject: '시험', title: '다른 노래 무대', note: '기록', emotion: '즐거움', date: '2026-11-16', url: 'https://www.youtube.com/watch?v=bbb22222222' }, t.moments[0].id, '2026-11-16T00:01:00.000Z');
  second.moments.at(-1).keywords = ['무대:쇼챔피언'];
  return second;
})();
const graphEmptyHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>그래프 빈 묶음 호스트</title></head>
<body data-member="in" data-record-source="file"><script>window.LT41={source:'file',writable:false,owned:true,momentId:'m01',prefs:{},tree:${JSON.stringify(graphEmptyTree)},trees:[${JSON.stringify(graphEmptyTree)}]};</script>
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
  const server = await serve({ '/share-host.html': shareHost, '/home-host.html': homeHost, '/graph-host.html': graphHost, '/graph-empty-host.html': graphEmptyHost });
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
    // 2026-11-16 대표 결정: 읽기 전용(예시) 보드에서는 '진주빛 보드 · 읽기 전용' 표시가 그대로 보인다.
    const readOnlyBadge = await boardFrame.evaluate(() => { const el = document.getElementById('themeBadge'); return { hidden: el.hidden, text: el.textContent }; });
    assert.equal(readOnlyBadge.hidden, false, '읽기 전용 보드에서는 테마 표시를 그대로 둔다');
    assert.ok(readOnlyBadge.text.includes('진주빛 보드 · 읽기 전용'), '읽기 전용 표시가 그대로다 — 실측=' + readOnlyBadge.text);
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
    // 2026-11-16 대표 결정: 보기 고르기에 [그래프]가 셋째로 붙는다 — 390에서도 세 단추가 머리줄에 들어간다(넘침·겹침 0).
    const mapHeader = await page3.evaluate(() => {
      const frame = [...document.querySelectorAll('iframe')].find((f) => { try { return /track56-network/.test(f.contentWindow.location.href); } catch { return false; } });
      if (!frame) return null;
      const doc = frame.contentDocument;
      const bar = doc.querySelector('.topbar');
      const switchBtns = [...doc.querySelectorAll('.view-switch .pill')];
      const btns = [...doc.querySelectorAll('.top-actions button')].filter((b) => b.getBoundingClientRect().width > 0);
      const rects = btns.map((b) => b.getBoundingClientRect());
      const pairTexts = [];
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) pairTexts.push(btns[i].textContent.trim() + '×' + btns[j].textContent.trim());
      }
      return {
        switchCount: switchBtns.length,
        labels: switchBtns.map((b) => b.textContent.trim()),
        netPressed: doc.getElementById('viewNet')?.getAttribute('aria-pressed'),
        graphPressed: doc.getElementById('viewGraph')?.getAttribute('aria-pressed'),
        overflowX: Math.max(0, bar.scrollWidth - bar.clientWidth),
        outOfFrame: btns.filter((b) => b.getBoundingClientRect().right > doc.documentElement.clientWidth + 1).map((b) => b.textContent.trim()),
        pairTexts
      };
    }).catch(() => null);
    assert.ok(mapHeader, '지도 머리줄을 잰다');
    assert.deepEqual(mapHeader.labels, ['그물형', '동심원형', '그래프'], `보기 고르기 세 단추(실제 ${JSON.stringify(mapHeader.labels)})`);
    assert.equal(mapHeader.netPressed, 'true', '현재 보기(그물형) aria-pressed=true');
    assert.equal(mapHeader.graphPressed, 'false', '그래프 단추는 지도에서 눌리지 않은 상태');
    assert.equal(mapHeader.overflowX, 0, `지도 머리줄 가로 넘침 0(실제 ${mapHeader.overflowX})`);
    assert.deepEqual(mapHeader.outOfFrame, [], '머리줄 단추가 화면 밖으로 나가지 않는다');
    assert.deepEqual(mapHeader.pairTexts, [], `머리줄 단추 겹침 0(실제 ${JSON.stringify(mapHeader.pairTexts)})`);
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
    // 자동 공개 안내 상태(2026-11-15 보고) — notice.mjs 한 벌(셸 notify와 같은 모듈)로 토스트에
    // 문장+[비공개로 바꾸기] 한 줄을 띄운 자리. 자리 잡기(beforeShow)는 셸 placeToast와 같은 길 —
    // 셸 내부 함수가 모듈 밖으로 나오지 않아 시험 안에서 같은 길을 잠시 그린다(#666 raiseToast와 같은 원칙).
    await page4.evaluate(async () => {
      const notice = await import('/v41/shell/notice.mjs');
      const place = () => { let above = 0; for (const el of document.querySelectorAll('.home-links,#mobile-add,.updates-card')) { if (el.hidden) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue; above = Math.max(above, document.documentElement.clientHeight - r.top + 10); } const style = document.documentElement.style; if (above > 0) style.setProperty('--lt-toast-bottom', Math.round(above) + 'px'); else style.removeProperty('--lt-toast-bottom'); };
      const notifier = notice.createNotifier({ $: (id) => document.getElementById(id), beforeShow: place });
      notifier.notify(notice.autoPublishNoticeText(), { hold: true, action: { label: notice.AUTO_PUBLISH_ACTION_LABEL, run: () => {} } });
    });
    await page4.waitForFunction(() => { const t = document.getElementById('toast'); return !!t && !t.hidden && !!t.querySelector('.toast-action'); }, null, { timeout: 5000 });
    await page4.waitForTimeout(300);
    await take(page4, '셸·자동 공개 안내');
    await lowerToast(page4);
    await page4.evaluate(() => document.getElementById('community-menu')?.click());
    await page4.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    // #678 후속(회차 지적): 반응이 없는 카드는 0짜리 칩 대신 '반응 남기기' 한 개만 보인다(수치로 판정).
    await page4.waitForFunction(() => !!document.querySelector('.community-reaction-open'), null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(400);
    const reactions = await page4.evaluate(() => ({
      open: document.querySelectorAll('.community-reaction-open').length,
      zeroChips: [...document.querySelectorAll('.community-reaction')].filter((b) => / 0$/.test(b.textContent.trim())).length
    }));
    assert.ok(reactions.open >= 1, '반응이 없으면 반응 남기기 단추가 보인다');
    assert.equal(reactions.zeroChips, 0, '0짜리 반응 칩은 보이지 않는다');
    await take(page4, '둘러보기');
    // 하은 1회차(261116,#728 후속): 새벽(KST 0~9시, UTC 전날)에 담은 순간의 둘러보기 카드 날짜가
    // UTC 절단('2026. 11. 15')으로 나왔다 — Asia/Seoul 시간대 문맥에서 한국 날짜로 보이는지 수치로 단정한다.
    const ctxDate = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', timezoneId: 'Asia/Seoul' });
    await ctxDate.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctxDate.route('**://i.ytimg.com/**', THUMB);
    await ctxDate.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const CROSSING = '2026-11-15T20:00:00.000Z'; // UTC로는 11-15, 한국 시간으로는 11-16 05:00(0~9시 구간)
    await ctxDate.route('**/api/community/shares*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [Object.assign({}, COMMUNITY_CARDS[0], { createdAt: CROSSING, momentCount: 3 })], totalVisible: 1 }) }));
    const pageDate = await ctxDate.newPage();
    await pageDate.goto(`${base}/v41/`, { waitUntil: 'load' });
    await pageDate.waitForTimeout(1200);
    await pageDate.evaluate(() => document.getElementById('community-menu')?.click());
    await pageDate.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await pageDate.waitForFunction(() => !!document.querySelector('.community-card'), null, { timeout: 8000 }).catch(() => {});
    await pageDate.waitForTimeout(400);
    const cardDate = await pageDate.evaluate((crossing) => {
      const meta = [...document.querySelectorAll('.community-muted')].map((p) => p.textContent).find((t) => /개 순간/.test(t)) || '';
      const d = new Date(crossing);
      const localToday = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { meta, localToday };
    }, CROSSING);
    const utcCut = '2026. 11. 15';
    assert.ok(cardDate.meta.includes(cardDate.localToday.replace(/-/g, '. ')), `새벽 순간의 카드 날짜는 지역(한국) 날짜다 — 실제 "${cardDate.meta}" / 기대 ${cardDate.localToday}`);
    assert.ok(!cardDate.meta.includes(utcCut), `카드 날짜가 UTC 절단(어제)으로 나온다: "${cardDate.meta}"`);
    await pageDate.screenshot({ path: 'E:/lovetree-qa/lane/local3-graph/audit-community-date-' + width + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
    await ctxDate.close();
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
    // #678 후속(회차 지적): 내 의견 머리 줄에 운영센터와 같은 의견 번호(#N)가 작게 보인다.
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

    // #743: 운영센터 '한눈에' — 카드 7+7이 1440·1920에서 각각 한 줄, 390은 지금처럼 줄바꿈(가로 넘침 0),
    // 모든 카드가 같은 누름 모양(role·tabindex·44px 이상)이고, 탭이 있는 카드는 그 탭을 조건으로 열며
    // 탭이 없는 카드는 내역을 펼친다(다시 누르면 접힘). 관리자 세션은 가짜 API(응답 모형)로 만든다.
    const ctxAdm = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctxAdm.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctxAdm.route('**://i.ytimg.com/**', THUMB);
    await ctxAdm.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctxAdm.route('**/api/admin/session', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: true, admin: true, role: 'admin' }) }));
    await ctxAdm.route('**/api/admin/feedback', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, feedback: [
      { id: 'f1', kind: 'opinion', status: 'received', replyCount: 0, createdAt: '2026-11-14T09:00:00.000Z', displayTitle: '꼬리표가 안 붙어요', issueNumber: 741 },
      { id: 'f2', kind: 'opinion', status: 'fixed', replyCount: 2, createdAt: '2026-11-13T09:00:00.000Z', displayTitle: '편집 창 꼬리표', issueNumber: 736 },
      { id: 'f3', kind: 'journal', status: 'reviewing', replyCount: 0, createdAt: '2026-11-12T09:00:00.000Z', displayTitle: '오늘 사용 일지', issueNumber: null }
    ] }) }));
    await ctxAdm.route('**/api/admin/journals', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, journals: [] }) }));
    await ctxAdm.route('**/api/community/admin/reports', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, reports: [
      { id: 'r1', status: 'open', reason: '시험 신고', shareId: 'share-1', createdAt: '2026-11-14T10:00:00.000Z', hidden: false }
    ] }) }));
    await ctxAdm.route('**/api/admin/stats', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stats: {
      checkedAt: '2026-11-16T00:00:00.000Z', window: { days: 7, since: '2026-11-09T00:00:00.000Z' },
      accounts: { total: 8, real: 2, aiTester: 4, tester: 2, new: { total: 3, real: 1, aiTester: 1, tester: 1 } },
      trees: { total: 9, real: 4, aiTester: 3, tester: 2, titles: ['가을 노래', '겨울 산책', '봄의 기록'], public: { total: 3, real: 2, aiTester: 1, tester: 0, titles: ['가을 노래', '봄의 기록'] }, featured: { total: 1, real: 1, aiTester: 0, tester: 0, titles: ['가을 노래'] } },
      moments: { total: 40, real: 21, aiTester: 12, tester: 7, new: { total: 6, real: 3, aiTester: 2, tester: 1 } }
    } }) }));
    await ctxAdm.route('**://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ number: 736, title: '시험 이슈', state: 'open' }) }));
    const pageAdm = await ctxAdm.newPage();
    await pageAdm.goto(`${base}/admin.html`, { waitUntil: 'load' });
    await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-stats .lt-stat').length === 7 && document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 7, null, { timeout: 20000 });
    await pageAdm.waitForTimeout(400);
    const adminCards = await pageAdm.evaluate(() => {
      const stat = [...document.querySelectorAll('.lt-stats .lt-stat')];
      const todo = [...document.querySelectorAll('.lt-ov-cards .lt-ov-card')];
      const all = [...stat, ...todo];
      const rects = all.map((el) => el.getBoundingClientRect());
      const flat = (el) => el.textContent.replace(/\s+/g, ' ').trim();
      return {
        statCount: stat.length, todoCount: todo.length,
        statTops: [...new Set(stat.map((el) => Math.round(el.getBoundingClientRect().top)))],
        todoTops: [...new Set(todo.map((el) => Math.round(el.getBoundingClientRect().top)))],
        minW: Math.round(Math.min(...rects.map((r) => r.width))), minH: Math.round(Math.min(...rects.map((r) => r.height))),
        roles: all.map((el) => el.getAttribute('role')), tabs: all.map((el) => el.getAttribute('tabindex')),
        cursors: [...new Set(all.map((el) => getComputedStyle(el).cursor))],
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        firstStatText: flat(stat[0]),
        treeCardText: flat(stat.find((el) => el.dataset.statToggle === 'featured-trees'))
      };
    });
    assert.equal(adminCards.statCount, 7, '전체 숫자 카드 7개');
    assert.equal(adminCards.todoCount, 7, '처리할 일 카드 7개');
    if (width >= 1440) {
      assert.equal(adminCards.statTops.length, 1, `전체 숫자 카드가 한 줄이다(카드 위 좌표 ${JSON.stringify(adminCards.statTops)})`);
      assert.equal(adminCards.todoTops.length, 1, `처리할 일 카드가 한 줄이다(카드 위 좌표 ${JSON.stringify(adminCards.todoTops)})`);
    }
    assert.equal(adminCards.overflow, 0, `운영센터 가로 넘침 0(실제 ${adminCards.overflow}px)`);
    assert.ok(adminCards.minH >= 44 && adminCards.minW >= 44, `카드 누름 영역 44px 이상(최소 ${adminCards.minW}×${adminCards.minH}px)`);
    assert.deepEqual(adminCards.roles, Array(14).fill('button'), '모든 카드가 role=button이다');
    assert.deepEqual(adminCards.tabs, Array(14).fill('0'), '모든 카드가 tabindex=0이다(키보드로 연다)');
    assert.deepEqual(adminCards.cursors, ['pointer'], `모든 카드가 같은 누름 모양(커서 ${JSON.stringify(adminCards.cursors)})`);
    // 숫자 뜻: 큰 숫자가 '실제 고객'이고, 전체 = 실제 + AI + 시험을 카드 안에 함께 적는다.
    assert.ok(adminCards.firstStatText.includes('실제 고객'), `큰 숫자가 무엇을 세는지 카드 안에 적는다(실측: ${adminCards.firstStatText})`);
    assert.ok(adminCards.firstStatText.includes('전체 8') && adminCards.firstStatText.includes('AI 4') && adminCards.firstStatText.includes('시험 2'), `전체 = 실제+AI+시험을 함께 적는다(실측: ${adminCards.firstStatText})`);
    assert.ok(adminCards.treeCardText.includes('전체 1'), `둘러보기 소개 카드도 전체를 함께 적는다(실측: ${adminCards.treeCardText})`);
    await take(pageAdm, '운영센터 한눈에');

    // 1920에서도 두 묶음이 각각 한 줄이다(#743 대표 요청).
    if (width >= 1440) {
      await pageAdm.setViewportSize({ width: 1920, height: 1080 });
      await pageAdm.waitForTimeout(400);
      const wide = await pageAdm.evaluate(() => ({
        statTops: [...new Set([...document.querySelectorAll('.lt-stats .lt-stat')].map((el) => Math.round(el.getBoundingClientRect().top)))],
        todoTops: [...new Set([...document.querySelectorAll('.lt-ov-cards .lt-ov-card')].map((el) => Math.round(el.getBoundingClientRect().top)))],
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
      }));
      assert.equal(wide.statTops.length, 1, `1920 전체 숫자 한 줄(실측 ${JSON.stringify(wide.statTops)})`);
      assert.equal(wide.todoTops.length, 1, `1920 처리할 일 한 줄(실측 ${JSON.stringify(wide.todoTops)})`);
      assert.equal(wide.overflow, 0, `1920 가로 넘침 0(실제 ${wide.overflow}px)`);
      await pageAdm.setViewportSize({ width, height });
      await pageAdm.waitForTimeout(300);
    }

    // 탭이 없는 카드(전체 숫자)는 내역이 펼쳐지고, 다시 누르면 접힌다. Enter로도 열린다.
    const expand = await pageAdm.evaluate(() => {
      const card = document.querySelector('[data-stat-toggle="trees"]');
      card.click();
      const detail = document.getElementById('stat-detail-trees');
      const open = { hidden: detail.hidden, expanded: card.getAttribute('aria-expanded'), titles: detail.querySelectorAll('.lt-stat-titles li').length, split: detail.querySelectorAll('.lt-stat-split li').length, text: detail.textContent.replace(/\s+/g, ' ').trim() };
      card.click();
      const closed = { hidden: detail.hidden, expanded: card.getAttribute('aria-expanded') };
      return { open, closed };
    });
    assert.deepEqual([expand.open.hidden, expand.open.expanded], [false, 'true'], '탭이 없는 카드를 누르면 내역이 펼쳐진다');
    assert.equal(expand.open.titles, 3, `트리 카드 내역에 제목 목록(최대 20)이 보인다(실측 ${expand.open.titles}개)`);
    assert.equal(expand.open.split, 3, '내역에 실제 고객·AI 명예회원·시험 계정 갈래 수가 있다');
    assert.ok(expand.open.text.includes('AI 명예회원') && !/@/.test(expand.open.text), '내역에 이메일 같은 개인정보는 없다');
    assert.deepEqual([expand.closed.hidden, expand.closed.expanded], [true, 'false'], '다시 누르면 내역이 접힌다');
    await pageAdm.focus('[data-stat-toggle="accounts"]');
    await pageAdm.keyboard.press('Enter');
    await pageAdm.waitForTimeout(200);
    const byEnter = await pageAdm.evaluate(() => ({ hidden: document.getElementById('stat-detail-accounts').hidden, expanded: document.querySelector('[data-stat-toggle="accounts"]').getAttribute('aria-expanded') }));
    assert.deepEqual([byEnter.hidden, byEnter.expanded], [false, 'true'], 'Enter로도 내역이 펼쳐진다');
    await pageAdm.keyboard.press('Enter');
    await pageAdm.waitForTimeout(200);

    // 탭이 있는 카드는 그 탭을 해당 조건으로 걸러 연다(주소에 조건이 남는다).
    const jump = async (selector) => {
      await pageAdm.evaluate(() => { location.hash = '#overview'; });
      await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 7, null, { timeout: 8000 });
      await pageAdm.click(selector);
      await pageAdm.waitForFunction(() => location.hash !== '#overview', null, { timeout: 8000 });
      await pageAdm.waitForTimeout(200);
      return pageAdm.evaluate(() => ({ hash: location.hash, filterNote: !!document.querySelector('[data-clear-filter]') }));
    };
    const pending = await jump('[data-ov-view="board"][data-ov-status="pending"]');
    assert.equal(pending.hash, '#board?status=pending', `처리 대기 카드 → 고객 글 탭의 처리 대기(실제 ${pending.hash})`);
    const unanswered = await jump('[data-ov-unanswered="1"]');
    assert.equal(unanswered.hash, '#board?unanswered=1', `답글 0 카드 → 답글 0만 거른 고객 글(실제 ${unanswered.hash})`);
    assert.equal(unanswered.filterNote, true, '거른 조건을 지우는 단추가 함께 보인다');
    const reports = await jump('[data-ov-view="reports"][data-ov-status="open"]');
    assert.equal(reports.hash, '#reports?status=open', `신고 대기 카드 → 신고 탭의 검토 대기(실제 ${reports.hash})`);
    const issues = await jump('[data-ov-view="issues"][data-ov-status="closed"]');
    assert.equal(issues.hash, '#issues?status=closed', `닫힌 이슈 카드 → 고치는 일 탭의 닫힌 이슈(실제 ${issues.hash})`);
    // 키보드(Space)로도 카드가 열린다.
    await pageAdm.evaluate(() => { location.hash = '#overview'; });
    await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 7, null, { timeout: 8000 });
    await pageAdm.focus('[data-ov-view="issues"][data-ov-status="open"]');
    await pageAdm.keyboard.press(' ');
    await pageAdm.waitForFunction(() => location.hash.startsWith('#issues'), null, { timeout: 8000 });
    assert.equal(await pageAdm.evaluate(() => location.hash), '#issues?status=open', 'Space로도 카드가 열린다');
    await ctxAdm.close();

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
    // #678 후속(꼬리표 걸러 보기): 트리 메뉴의 내 순간 전체 보기로 홈 보기를 열면 순간 목록이
    // 처음부터 열린다(#394 경로). 꼬리표 칩으로 걸러 보는 것까지 수치로 본다(둘째 순간은 꼬리표가 없어
    // 칩을 누르면 남는 순간이 줄어든다). 셸의 보기 프레임은 src가 빈 채 내용이 채워지므로
    // 프레임을 URL이 아니라 내용(orbit 순간 목록 단추)으로 찾는다 — 매 단계 다시 찾는다.
    // 이 상태에서만 둘째 순간(꼬리표 없음)이 있는 트리를 서브한다 — 걸러 보기로 목록이 줄어드는 것을 보려면.
    // 앞 상태들(첫 트리 안내)은 '트리 하나·순간 하나'가 조건이라 원래 가짜를 그대로 쓰고, 끝나면 되돌린다.
    const twoMomentRoute = (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [twoMomentTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    });
    await ctx5.route('**/api/workspace**', twoMomentRoute);
    const page5b = await ctx5.newPage();
    await page5b.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page5b.waitForFunction(() => { const a = document.getElementById('account-avatar'); return a && !a.hidden; }, null, { timeout: 20000 });
    await page5b.click('#record-menu');
    await page5b.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 8000 });
    await page5b.click('#tree-popover [data-tree-action="moments"]');
    const orbitFrameOf = async () => {
      for (const f of page5b.frames()) {
        if (f === page5b.mainFrame()) continue;
        let ok = false;
        try {
          ok = await Promise.race([
            f.evaluate(() => Boolean(document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=index]'))),
            page5b.waitForTimeout(2000).then(() => false)
          ]);
        } catch { ok = false; }
        if (ok) return f;
      }
      return null;
    };
    const frameEval = async (fn) => {
      const f = await orbitFrameOf();
      if (!f) return null;
      try {
        return await Promise.race([f.evaluate(fn), page5b.waitForTimeout(2000).then(() => null)]);
      } catch { return null; }
    };
    let chips0 = null;
    for (let i = 0; i < 24; i++) {
      const list = await frameEval(() => Boolean(document.getElementById('orbit')?.shadowRoot?.querySelector('.index-list .indexTagChip')));
      if (!list) {
        const f = await orbitFrameOf();
        if (f) await f.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=index]').click()).catch(() => {});
        await page5b.waitForTimeout(400);
      }
      chips0 = await frameEval(() => {
        const sr = document.getElementById('orbit')?.shadowRoot;
        return {
          chips: sr ? [...sr.querySelectorAll('.index-list .indexTagChip')].map((b) => b.textContent.trim()) : [],
          rows: sr ? sr.querySelectorAll('.index-list [data-lt-moment-row]').length : 0
        };
      });
      if (chips0 && chips0.chips.some((t) => t.includes('노래 · Super Shy'))) break;
      await page5b.waitForTimeout(400);
    }
    assert.ok(chips0 && chips0.chips.some((t) => t.includes('노래 · Super Shy')), '꼬리표 칩에 노래 · Super Shy가 있다 — 실측=' + JSON.stringify(chips0));
    let picked = null;
    for (let i = 0; i < 16; i++) {
      picked = await frameEval(() => {
        const sr = document.getElementById('orbit')?.shadowRoot;
        if (!sr) return null;
        return {
          picked: sr.querySelectorAll('.index-list .indexTagPicked').length,
          rows: sr.querySelectorAll('.index-list [data-lt-moment-row]').length,
          minH: Math.min(...[...sr.querySelectorAll('.index-list .indexTagChip')].map((b) => Math.round(b.getBoundingClientRect().height)))
        };
      });
      if (picked && picked.picked >= 1 && picked.rows >= 1 && picked.rows < chips0.rows) break;
      const f = await orbitFrameOf();
      if (f) await f.evaluate(() => { const sr = document.getElementById('orbit')?.shadowRoot; const b = sr && [...sr.querySelectorAll('.index-list .indexTagChip')].find((b) => b.textContent.includes('노래 · Super Shy')); if (b) b.click(); }).catch(() => {});
      await page5b.waitForTimeout(400);
    }
    assert.ok(picked && picked.picked >= 1, '고른 꼬리표가 위에 모여 보인다 — 실측=' + JSON.stringify(picked));
    assert.ok(picked.rows >= 1 && picked.rows < chips0.rows, '걸러 보기로 순간 수가 준다');
    assert.ok(picked.minH >= 44, '칩 누름 영역 44px 이상');
    await take(page5b, '순간 목록 꼬리표 걸러 보기');
    await ctx5.unroute('**/api/workspace**', twoMomentRoute);
    await page5b.close();
    // #627 PR B: 꼬리표 줄이 열린 상세(보드) — 확정 칩·직접 입력이 보이는 자리에서 겹침·잘림·작은 글자를 잰다.
    // 같은 문맥에서 보드를 새로 연다(주소에 보기까지 넣는다 — 셸은 불러올 때의 주소로 보기를 정한다).
    const page6 = await ctx5.newPage();
    await page6.goto(`${base}/v41/?account=1#board`, { waitUntil: 'load' });
    await frameOf(page6, /views\/track/);
    await page6.waitForTimeout(1500);
    const tagBoard = await frameOf(page6, /track58-pinboard/);
    assert.ok(tagBoard, '보드 프레임이 열린다(꼬리표 줄 상태)');
    // 2026-11-16 대표 결정: 쓰기 가능한 내 보드에서는 고급 기능의 원본 테마 이름('진주빛 보드') 글자를 숨긴다.
    // 고급 기능을 켠 상태·끈 상태 모두(배지는 고급 표시와 무관하므로 두 상태를 모두 단정한다).
    const pearlHidden = await tagBoard.evaluate(() => { const el = document.getElementById('themeBadge'); return { hidden: el.hidden, text: el.textContent }; });
    assert.equal(pearlHidden.hidden, true, '쓰기 가능한 보드에서 테마 표시를 숨긴다');
    assert.ok(!pearlHidden.text.includes('진주빛'), '쓰기 가능한 보드에 진주빛 글자가 없다');
    await tagBoard.evaluate(() => document.body.classList.add('lt-advanced'));
    const pearlAdvanced = await tagBoard.evaluate(() => { const el = document.getElementById('themeBadge'); return { hidden: el.hidden, text: el.textContent }; });
    assert.equal(pearlAdvanced.hidden, true, '고급 기능을 켠 보드에서도 테마 표시를 숨긴다');
    assert.ok(!pearlAdvanced.text.includes('진주빛'), '고급 기능을 켠 보드에도 진주빛 글자가 없다');
    await tagBoard.evaluate(() => document.body.classList.remove('lt-advanced'));
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
    // #716: 390 두 줄 도구 줄 — 카드가 도구 줄 밑으로 들어가 꼬리표·제목이 비치지 않는다(교차 면적 0·바탕 알파 1),
    // 도구 줄이 옆으로 넘치거나 단추가 잘리지 않고, '선택한 순간' 고르기 칸도 도구 줄과 겹치지 않는다.
    if (width === 390) {
      const bar = await tagBoard.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, rt: r.right }; };
        const header = document.querySelector('header');
        const hb = box(header);
        const cs = getComputedStyle(header);
        const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) || [];
        const alphas = stops.map((s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return 1; const p = m[1].split(',').map((v) => parseFloat(v)); return p.length > 3 ? p[3] : 1; });
        if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') alphas.push(1);
        const items = [...header.querySelectorAll('button, .boardThemeSwitch, .boardModeSwitch, .tree-title')].filter((el) => {
          const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0;
        }).map((el) => ({ text: (el.textContent || '').trim().slice(0, 12), ...box(el) }));
        const vw = innerWidth;
        const texts = [...document.querySelectorAll('#cardLayer .card h3, #cardLayer .card .cardMeta, #cardLayer .card .keywordOnCard, #cardLayer .card .videoTitle, #cardLayer .card .domain, #cardLayer .card small, #cardLayer .card .firstTag')].filter((el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; });
        const frame = box(document.getElementById('viewport'));
        let area = 0;
        for (const el of texts) {
          const r = box(el);
          // 판(.boardFrame)은 overflow:hidden 이라 위로 삐져나온 카드는 잘려 보이지 않는다 —
          // 도구 줄 뒤로 '보이는' 겹침만 잡는다(텍스트 ∩ 도구 줄 ∩ 판 보이는 영역).
          const w = Math.min(hb.rt, r.rt, frame.rt) - Math.max(hb.l, r.l, frame.l);
          const h = Math.min(hb.b, r.b, frame.b) - Math.max(hb.t, r.t, frame.t);
          if (w > 0 && h > 0) area += w * h;
        }
        const frameTop = Math.round(frame.t);
        const picker = document.querySelector('.lt-moment-picker');
        const pb = picker ? box(picker) : null;
        const pickerOverlap = pb ? Math.max(0, Math.min(hb.b, pb.b) - Math.max(hb.t, pb.t)) : 0;
        return {
          alphas, overlapArea: Math.round(area),
          overflowRight: Math.round(Math.max(0, ...items.map((i) => i.rt - vw))),
          cut: items.filter((i) => i.rt > vw + 0.5 || i.l < -0.5).map((i) => i.text).join(','),
          frameTop, headerBottom: Math.round(hb.b), pickerOverlap: Math.round(pickerOverlap)
        };
      });
      assert.equal(bar.alphas.some((a) => a < 1), false, `390 도구 줄 바탕은 불투명하다(정지 색 알파 ${JSON.stringify(bar.alphas)})`);
      assert.equal(bar.overlapArea, 0, `390 도구 줄 뒤로 카드 글자가 들어가지 않는다(교차 면적 ${bar.overlapArea}px²)`);
      assert.equal(bar.overflowRight, 0, `390 도구 줄이 가로로 넘치지 않는다(넘침 ${bar.overflowRight}px)`);
      assert.equal(bar.cut, '', `390 잘린 단추가 없다(잘림: ${bar.cut || '없음'})`);
      assert.ok(bar.frameTop >= bar.headerBottom, `390 판이 도구 줄 아래끝(${bar.headerBottom}px)부터 시작한다(실제 ${bar.frameTop}px)`);
      assert.equal(bar.pickerOverlap, 0, `390 '선택한 순간' 고르기 칸이 도구 줄과 겹치지 않는다(겹침 ${bar.pickerOverlap}px)`);
    }
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
    // 보드 첫 진입 두 안내(390) — 셸 알림('내 기록을 불러왔어요.')과 보드 안내 말풍선('순간을 선택해…')이
    // 같은 자리에 포개지지 않는다. 보드는 ≤700px에서 말풍선을 화면 아래 중앙(bottom 95px)에 띄우고,
    // 셸 알림도 #666 규칙으로 아래 중앙(--lt-toast-bottom)에 뜬다. 보드는 셸 알림이 떠 있는 동안
    // 기다렸다 말풍선을 띄운다 — 두 상자가 동시에 보이는 동안에는 겹침 면적이 0이어야 한다.
    // 1440은 말풍선(오른쪽 아래)·알림(아래 중앙)이 다른 모서리라 기하학적으로 겹치지 않고, 선택 복원으로
    // 상세 판이 열려 안내가 뜨지 않는 폭이어서 390에서만 잰다.
    // 새 문맥으로 띄운다(저장된 보기·선택이 없어야 첫 진입 흐름 — 900ms 뒤 말풍선, 셸 알림은 약 3초 — 이 재현된다).
    if (width === 390) {
      const ctxNotice = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxNotice.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxNotice.route('**://i.ytimg.com/**', THUMB);
      await ctxNotice.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxNotice.route('**/api/workspace**', (r) => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ revision: 1, state: { version: 1, trees: [firstTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
      }));
      const pageNotice = await ctxNotice.newPage();
      await pageNotice.goto(`${base}/v41/?account=1#board`, { waitUntil: 'domcontentloaded' });
      await frameOf(pageNotice, /track58-pinboard/);
      const twoNotices = await pageNotice.evaluate(async () => {
        const boxOf = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, rt: r.right }; };
        const overlapArea = (a, b) => Math.max(0, Math.min(a.rt, b.rt) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
        // 보드 문서는 #view·#view-next 가운데 지금 #cardLayer(보드)를 든 쪽이다(셸이 두 프레임을 갈아끼운다).
        const boardToast = () => {
          for (const id of ['view', 'view-next']) {
            const doc = document.getElementById(id)?.contentDocument;
            const toast = doc && doc.getElementById('toast');
            if (toast && doc.getElementById('cardLayer')) return toast;
          }
          return null;
        };
        let sawShell = false, sawBoard = false, maxArea = 0, bothAt = -1;
        for (let i = 0; i < 18; i++) {
          const shell = document.getElementById('toast');
          const board = boardToast();
          const shellUp = !!shell && !shell.hidden;
          const boardUp = !!board && board.classList.contains('show');
          if (shellUp) sawShell = true;
          if (boardUp) sawBoard = true;
          if (shellUp && boardUp) {
            bothAt = i;
            maxArea = Math.max(maxArea, overlapArea(boxOf(shell), boxOf(board)));
          }
          await new Promise((r) => setTimeout(r, 400));
        }
        return { sawShell, sawBoard, maxArea: Math.round(maxArea), bothAt };
      });
      assert.ok(twoNotices.sawShell, '390 셸 알림(기록 불러오기 안내)이 떠 있는 자리를 본다(빈손 통과 금지)');
      assert.ok(twoNotices.sawBoard, '390 보드 안내 말풍선이 뜨는 자리를 본다(빈손 통과 금지)');
      assert.equal(twoNotices.maxArea, 0, `390 셸 알림과 보드 안내 말풍선이 같은 자리에 포개지지 않는다(겹침 ${twoNotices.maxArea}px², 동시 노출: ${twoNotices.bothAt < 0 ? '없음' : twoNotices.bothAt + '번째 관찰'})`);
      await pageNotice.close();
      await ctxNotice.close();
    }
    // 2026-11-16 대표 결정: 지도→그래프→동심원형→그물형 왕복 — 기존 화면 전환 메시지(lt41-navigate) 한 길로
    // 오가고, 지금 트리·순간이 유지되는지(같은 트리·같은 순간·그래프 표시의 순간 수)까지 잰다.
    // 쓰기 가능 문맥(ctx5 — 예시가 아니라 지금 트리를 부른 자리)에서만 의미가 있어 여기서 한다.
    const pageMap = await ctx5.newPage();
    await pageMap.goto(`${base}/v41/?account=1#network`, { waitUntil: 'load' });
    await frameOf(pageMap, /track56-network/);
    await pageMap.waitForTimeout(1500);
    const treeBeforeTrip = await pageMap.evaluate(() => ({ id: window.LT41?.tree?.id || '', moments: (window.LT41?.tree?.moments || []).length, momentId: window.LT41?.momentId || '' }));
    assert.ok(treeBeforeTrip.id, '지금 트리가 부른 상태에서 왕복을 본다');
    const mapFrameTrip = () => [...pageMap.frames()].find((f) => { try { return /track56-network/.test(f.url()); } catch { return false; } });
    const graphFrameTrip = () => [...pageMap.frames()].find((f) => { try { return /track60-graph/.test(f.url()); } catch { return false; } });
    await mapFrameTrip().evaluate(() => document.getElementById('viewGraph').click());
    await pageMap.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => { try { return /track60-graph/.test(f.contentWindow.location.href); } catch { return false; } }), null, { timeout: 10000 });
    // 그래프 모듈이 그려질 때까지(배지가 채워질 때까지) 기다린다 — 프레임 주소만으로는 그리기 전이다.
    await pageMap.waitForFunction(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => { try { return /track60-graph/.test(x.contentWindow.location.href); } catch { return false; } });
      return Boolean(f && (f.contentDocument.getElementById('gBadge')?.textContent || '').length > 0);
    }, null, { timeout: 10000 });
    const gFrameTrip = graphFrameTrip();
    assert.ok(gFrameTrip, '지도의 [그래프] 단추로 그래프 보기가 열린다(기존 lt41-navigate 한 길)');
    const tripGraph = await gFrameTrip.evaluate(() => {
      const b = [...document.querySelectorAll('.g-view-switch .pill')];
      return { n: b.length, pressed: b.map((x) => x.getAttribute('aria-pressed')), badge: document.getElementById('gBadge')?.textContent || '' };
    });
    assert.equal(tripGraph.n, 3, '그래프 머리줄 보기 고르기 세 단추');
    assert.deepEqual(tripGraph.pressed, ['false', 'false', 'true'], '현재 보기(그래프)만 aria-pressed=true');
    assert.ok(tripGraph.badge.startsWith(`순간 ${treeBeforeTrip.moments}`), `그래프 표시의 순간 수가 지금 트리와 같다(실제 ${tripGraph.badge})`);
    const navCurrent = await pageMap.evaluate(() => document.querySelector('.tree-views [data-view="track56-network.html"]')?.getAttribute('aria-current'));
    assert.equal(navCurrent, 'true', '그래프 보기에서 위쪽 메뉴(책·보드·지도)의 지도가 켜진 상태다');
    await gFrameTrip.evaluate(() => document.getElementById('gViewConc').click());
    await pageMap.waitForFunction(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => { try { return /track56-network/.test(x.contentWindow.location.href); } catch { return false; } });
      return Boolean(f && f.contentDocument?.body && f.contentDocument.body.dataset.ltView === 'concentric');
    }, null, { timeout: 10000 });
    const mapAfterConc = await mapFrameTrip().evaluate(() => ({ view: document.body.dataset.ltView, concPressed: document.getElementById('viewConc')?.getAttribute('aria-pressed'), stored: localStorage.getItem('lt41.network.view') }));
    assert.equal(mapAfterConc.view, 'concentric', '그래프의 [동심원형]으로 지도가 동심원형 보기로 열린다');
    assert.equal(mapAfterConc.concPressed, 'true', '동심원형이 눌린 상태(aria-pressed=true)');
    assert.equal(mapAfterConc.stored, 'concentric', '지도 보기 저장 키(lt41.network.view)가 바뀐다');
    await mapFrameTrip().evaluate(() => document.getElementById('viewNet').click());
    await pageMap.waitForTimeout(1200);
    const treeAfterTrip = await pageMap.evaluate(() => ({ id: window.LT41?.tree?.id || '', moments: (window.LT41?.tree?.moments || []).length, momentId: window.LT41?.momentId || '' }));
    const mapAfterNet = await mapFrameTrip().evaluate(() => ({ view: document.body.dataset.ltView, netPressed: document.getElementById('viewNet')?.getAttribute('aria-pressed') }));
    assert.equal(mapAfterNet.view, 'network', '지도의 [그물형]으로 그물 보기로 돌아온다');
    assert.equal(mapAfterNet.netPressed, 'true', '그물형이 눌린 상태(aria-pressed=true)');
    assert.deepEqual(treeAfterTrip, treeBeforeTrip, '왕복 뒤에도 지금 트리·순간이 유지된다');
    await pageMap.close();
    await ctx5.close();

    // #627 PR3: 그래프 보기 — 지금은 주소(#my/graph)로만 열리는 화면이라 호스트가 LT41을 직접 넘긴다
    // (share-host와 같은 틀, 실제 트리 = 셸이 넘기는 순간들과 같은 모양). 허브 이름 상자 겹침 0·
    // 가로 넘침 0·고리 썸네일 동그라미 보임을 수치로 단정한다.
    const ctx7 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx7.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx7.route('**://i.ytimg.com/**', THUMB);
    await ctx7.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    // #627 3단계 '다른 팬 보기' 가짜 응답: 무대 허브 꼬리표는 5건(AI 명예회원 1건), 그 외 꼬리표는 빈 응답 —
    // 3개 미리보기·'더 보기'·빈 상태 문구를 한 상태에서 단정한다. (playwright는 나중에 등장한 경로가 먼저 맞는다.)
    const fansFixture = [
      { shareId: 'fan1', link: '/t/fan1', treeTitle: '시험 사용자의 기억 나무', title: '데뷔쇼 직관 기록', url: 'https://www.youtube.com/watch?v=aaa11111111', thumbnail: 'https://i.ytimg.com/vi/aaa11111111/hqdefault.jpg', date: '2026-01-10', aiTester: false },
      { shareId: 'fan2', link: '/t/fan2', treeTitle: 'AI 명예회원 나무', title: '데뷔쇼 다시 보기', url: '', thumbnail: '', date: '2026-01-20', aiTester: true },
      { shareId: 'fan3', link: '/t/fan3', treeTitle: '은지의 앨범', title: '데뷔쇼 엔딩 멘트', url: 'https://www.youtube.com/watch?v=bbb22222222', thumbnail: 'https://i.ytimg.com/vi/bbb22222222/hqdefault.jpg', date: '2026-01-12', aiTester: false },
      { shareId: 'fan4', link: '/t/fan4', treeTitle: '민의 사담', title: '데뷔쇼 리허설 후기', url: '', thumbnail: '', date: '2026-01-11', aiTester: false },
      { shareId: 'fan5', link: '/t/fan5', treeTitle: '서현의 순간', title: '데뷔쇼 첫 소환', url: '', thumbnail: '', date: '2026-01-09', aiTester: false }
    ];
    await ctx7.route('**/api/public/tag-moments**', (r) => {
      const tag = new URL(r.request().url()).searchParams.get('tag') || '';
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tag, items: tag.startsWith('무대:') ? fansFixture : [] }) });
    });
    const page7 = await ctx7.newPage();
    await page7.goto(`${base}/graph-host.html`, { waitUntil: 'domcontentloaded' });
    const graphFrame = await frameOf(page7, /track60-graph/);
    assert.ok(graphFrame, '그래프 프레임이 열린다');
    await page7.waitForTimeout(700);
    // 2026-11-16 대표 결정: 그래프 머리줄에도 지도와 같은 모양의 보기 고르기가 있고 그래프가 눌린 상태다.
    const graphSwitch = await graphFrame.evaluate(() => {
      const b = [...document.querySelectorAll('.g-view-switch .pill')];
      return {
        n: b.length,
        labels: b.map((x) => x.textContent.trim()),
        pressed: b.map((x) => x.getAttribute('aria-pressed')),
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
      };
    }).catch(() => null);
    assert.ok(graphSwitch, '그래프 머리줄 보기 고르기를 잰다');
    assert.deepEqual(graphSwitch.labels, ['그물형', '동심원형', '그래프'], `보기 고르기 세 단추(실제 ${JSON.stringify(graphSwitch.labels)})`);
    assert.deepEqual(graphSwitch.pressed, ['false', 'false', 'true'], '현재 보기(그래프)만 aria-pressed=true');
    assert.equal(graphSwitch.overflow, 0, `그래프 머리줄에서 가로 넘침 0(실제 ${graphSwitch.overflow})`);
    // 2026-11-16 CTO 지적: 묶음이 있는 그래프에서는 빈 판 안내가 보이지 않는다(있으면 안내는 사라진다).
    const hubGuideHubful = await graphFrame.evaluate(() => { const e = document.getElementById('gEmpty'); return { shown: !e.hidden, text: e.textContent || '' }; });
    assert.equal(hubGuideHubful.shown, false, '묶음이 있는 그래프에서는 빈 판 안내가 보이지 않는다');
    assert.ok(!hubGuideHubful.text.includes('묶여요'), '묶음이 있는 그래프에 안내 문구가 없다');
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
        badge: doc.getElementById('gBadge')?.textContent || '',
        // CTO 지적(#714 후속): 이름 상자가 빈 곳만 피하는지로는 부족하다 — 아래 세 가지를 잰다.
        narrow: doc.documentElement.clientWidth < 700,
        hubDots: [...doc.querySelectorAll('.g-hubdot')].map((c) => {
          const r = c.getBoundingClientRect();
          return { key: c.parentElement?.getAttribute('data-hub-key'), cr: Number(c.parentElement?.getAttribute('data-cr') || 0), x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }),
        nameBoxes: [...doc.querySelectorAll('.g-hubname')].filter((x) => !x.classList.contains('g-hubsub') && x.getBoundingClientRect().width > 0).map((x) => {
          const r = x.getBoundingClientRect();
          return { key: x.parentElement?.getAttribute('data-hub-key'), cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height, t: x.textContent };
        }),
        rings: [...doc.querySelectorAll('.g-ring')].map((c) => { const r = c.getBoundingClientRect(); return { key: c.getAttribute('data-key'), x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; }),
        counts: [...doc.querySelectorAll('.g-stackcount')].map((x) => {
          const box = x.getBoundingClientRect();
          const dot = x.parentElement?.querySelector('circle');
          const dr = dot ? dot.getBoundingClientRect() : null;
          return { t: x.textContent, x: box.left + box.width / 2, y: box.top + box.height / 2, h: box.height, dotX: dr ? dr.left + dr.width / 2 : null, dotY: dr ? dr.top + dr.height / 2 : null, dotR: dr ? dr.width / 2 : null };
        })
      };
    });
    // ① 각 허브 이름의 중심은 자기 고리 중심에서 (고리 반지름 + 이름 높이 + 여유) 안에 있다(좁은 화면).
    if (graphCheck.narrow) {
      const tooFar = graphCheck.nameBoxes.map((n) => {
        const dot = graphCheck.hubDots.find((d) => d.key === n.key);
        if (!dot) return n.t + ' ← 자기 고리를 못 찾음';
        const dist = Math.hypot(n.cx - dot.x, n.cy - dot.y);
        const limit = dot.cr + n.h + 12;
        return dist <= limit ? null : `${n.t} 거리 ${Math.round(dist)} > ${Math.round(limit)}`;
      }).filter(Boolean);
      assert.deepEqual(tooFar, [], `390 허브 이름은 자기 고리 바로 아래에 있어야 한다: ${JSON.stringify(tooFar)}`);
      // ③ 좁은 화면에서는 허브 이름을 숨기지 않는다.
      const hidden = graphCheck.hubDots.length - graphCheck.nameBoxes.length;
      assert.equal(hidden, 0, `390에서 숨겨진 허브 이름 0(실제 ${hidden}개 숨김)`);
    }
    // ② 고리끼리 겹침 0(원-원 거리, 2px 여유).
    const ringPairs = [];
    for (let i = 0; i < graphCheck.rings.length; i++) for (let j = i + 1; j < graphCheck.rings.length; j++) {
      const a = graphCheck.rings[i], b = graphCheck.rings[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < a.r + b.r - 2) ringPairs.push(`${a.key}×${b.key} @거리${Math.round(dist)} < r${Math.round(a.r)}+${Math.round(b.r)}`);
    }
    assert.deepEqual(ringPairs, [], `고리끼리 겹침 0: ${JSON.stringify(ringPairs)}`);
    // '×N' 개수 표시는 점과 원 거리로 판정한다(상자 겹침이 아니라) — 점 표면에서 떨어져 있어야 한다.
    const countTouch = graphCheck.counts.map((c) => {
      if (c.dotX == null) return null;
      const dist = Math.hypot(c.x - c.dotX, c.y - c.dotY);
      return dist >= c.dotR + c.h / 2 + 1 ? null : `${c.t} 점 표면에서 ${Math.round(dist - c.dotR)}px`;
    }).filter(Boolean);
    assert.deepEqual(countTouch, [], `무더기 개수(×N)가 점에 닿지 않게 떨어져 있다: ${JSON.stringify(countTouch)}`);
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
    // #627 3단계: 허브 상세의 '같은 노래를 담은 다른 팬' 칸 — 가짜 응답(무대=5건·AI 1건, 그 외=빈 응답)으로
    // 3개 미리보기·AI 명예회원 표시·'더 보기'·빈 상태 문구·판 안 배치(겹침·넘침 0)를 단정한다.
    const fansCheck = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const hub = [...doc.querySelectorAll('#gsvg g[role="button"]')].find((g) => (g.getAttribute('aria-label') || '').startsWith('무대'));
      hub?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 700));
      const box = doc.querySelector('.d-fans');
      const cardR = doc.getElementById('detailCard').getBoundingClientRect();
      const rows = box ? [...box.children].filter((x) => x.querySelector?.('.d-fans-row')) : [];
      const rowRects = rows.map((x) => x.getBoundingClientRect());
      let rowPairs = 0;
      for (let i = 0; i < rowRects.length; i++) for (let j = i + 1; j < rowRects.length; j++) {
        const a = rowRects[i], b = rowRects[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) rowPairs++;
      }
      const outside = rows.filter((x) => { const r = x.getBoundingClientRect(); return r.width === 0 || r.left < cardR.left - 1 || r.right > cardR.right + 1; }).length;
      return {
        head: doc.querySelector('.d-fanshead')?.textContent || '',
        rows: rows.length,
        rowPairs,
        outside,
        aiBadge: doc.querySelector('.d-fans-ai')?.textContent || '',
        aiOnRow: rows[1]?.querySelector('.d-fans-ai')?.textContent || '',
        links: rows.map((x) => x.querySelector('a')?.getAttribute('href') || ''),
        more: doc.querySelector('.d-fans-more')?.textContent || '',
        thumbs: rows.filter((x) => x.querySelector('.d-fans-thumb')).length
      };
    });
    assert.match(fansCheck.head, /같은 무대를 본 다른 팬/, `칸 제목은 소스 상수(실제 "${fansCheck.head}")`);
    assert.equal(fansCheck.rows, 3, `처음엔 3개만 보인다(실제 ${fansCheck.rows})`);
    assert.equal(fansCheck.rowPairs, 0, `다른 팬 줄끼리 겹침 0(실제 ${fansCheck.rowPairs})`);
    assert.equal(fansCheck.outside, 0, `다른 팬 줄이 상세 판 안에 있다(벗어난 줄 ${fansCheck.outside})`);
    assert.equal(fansCheck.aiBadge, 'AI 명예회원', 'AI 명예회원 표시가 있다');
    assert.equal(fansCheck.aiOnRow, 'AI 명예회원', 'AI 표시는 aiTester 줄(fixture 2번째)에 붙는다');
    assert.ok(fansCheck.links.every((l) => l.startsWith('/t/')), `줄이 공개 트리 링크(/t/…)다: ${JSON.stringify(fansCheck.links)}`);
    assert.ok(fansCheck.thumbs >= 1, '썸네일 줄이 있다(썸네일 없는 줄은 자리를 비우지 않는다)');
    assert.match(fansCheck.more, /더 보기/, "나머지는 '더 보기'로");
    const afterMore = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      doc.querySelector('.d-fans-more')?.click();
      await new Promise((res) => setTimeout(res, 250));
      return [...doc.querySelectorAll('.d-fans > li')].filter((x) => x.querySelector('.d-fans-row')).length;
    });
    assert.equal(afterMore, 5, `'더 보기'로 나머지가 보인다(실제 ${afterMore})`);
    const emptyCheck = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const hub = [...doc.querySelectorAll('#gsvg g[role="button"]')].find((g) => (g.getAttribute('aria-label') || '').startsWith('노래'));
      hub?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 700));
      return {
        empty: doc.querySelector('.d-fans-empty')?.textContent || '',
        head: doc.querySelector('.d-fanshead')?.textContent || '',
        overflow: Math.max(0, doc.documentElement.scrollWidth - doc.documentElement.clientWidth)
      };
    });
    assert.equal(emptyCheck.head, '같은 노래를 담은 다른 팬', '노래 허브의 칸 제목(소스 상수)');
    assert.equal(emptyCheck.empty, '아직 같은 노래를 담은 다른 팬이 없어요', `빈 상태 문구(실제 "${emptyCheck.empty}")`);
    assert.equal(emptyCheck.overflow, 0, `다른 팬 칸이 있어도 가로 넘침 0(실제 ${emptyCheck.overflow})`);
    // 2026-11-16 CTO 지적: 묶음 0개 그래프 — 빈 무대를 고장으로 본다. 짧은 안내 + 바로 할 수 있는
    // 단추(꼬리표 한 번에 제안받기)가 보이고, 누른 목록 제목도 실제 뜻('아직 묶음에 안 든 순간')이다.
    const ctx7b = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx7b.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx7b.route('**://i.ytimg.com/**', THUMB);
    await ctx7b.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page7b = await ctx7b.newPage();
    await page7b.goto(`${base}/graph-empty-host.html`, { waitUntil: 'domcontentloaded' });
    const emptyGraphFrame = await frameOf(page7b, /track60-graph/);
    assert.ok(emptyGraphFrame, '묶음 0개 그래프가 열린다');
    await page7b.waitForTimeout(700);
    const hubGuide = await emptyGraphFrame.evaluate(() => {
      const e = document.getElementById('gEmpty');
      const b = e.querySelector('.g-empty-cta');
      return { shown: !e.hidden, text: e.textContent || '', cta: b?.textContent || '', badge: (document.getElementById('gBadge') || {}).textContent || '' };
    });
    assert.equal(hubGuide.shown, true, '묶음 0개 그래프에서는 빈 판 안내가 보인다');
    assert.ok(hubGuide.text.includes('2개 이상이면 여기에 묶여요'), `안내가 묶음 규칙을 알려준다(실제 ${hubGuide.text})`);
    assert.equal(hubGuide.cta, '꼬리표 한 번에 제안받기', '안내에는 바로 할 수 있는 단추가 있다');
    assert.ok(hubGuide.badge.includes('묶음 0'), `묶음 0이 표시에도 보인다(실제 ${hubGuide.badge})`);
    // 2026-11-16 CTO 지적: 안내의 단추와 선반의 단추가 두 번 연달아 보이지 않게 — 빈 판 안내가 떠 있는
    // 동안에는 제안 단추가 한 개만 보인다(선반은 '아직 묶음에 안 든 순간 N' 글자만 남긴다).
    const ctaCount = await emptyGraphFrame.evaluate(() => [...document.querySelectorAll('.g-empty-cta, .g-shelf-hint')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden'; }).length);
    assert.equal(ctaCount, 1, `제안 단추는 한 개만 보인다(실제 ${ctaCount})`);
    await emptyGraphFrame.evaluate(() => document.querySelector('.g-empty-cta').click());
    await page7b.waitForTimeout(400);
    const suggestHead = await emptyGraphFrame.evaluate(() => (document.querySelector('#detailCard .d-kicker') || {}).textContent || '');
    assert.match(suggestHead, /^아직 묶음에 안 든 순간 2/, `제안 목록 제목도 실제 뜻으로(실제 ${suggestHead})`);
    const shelfLabel = await emptyGraphFrame.evaluate(() => (document.getElementById('shelfLabel') || {}).textContent || '');
    assert.match(shelfLabel, /^아직 묶음에 안 든 순간 /, `선반 이름도 실제 뜻으로(실제 ${shelfLabel})`);
    await take(page7b, '그래프·묶음 0개 안내');
    await ctx7b.close();
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
    // 프레임이 열렸어도 주소가 틀리면 배포가 4.0 첫 화면으로 되돌려 준다(2026-11-16 보고) — 문서 표시까지 본다.
    assert.match(graphByHash.url(), /views\/graph\/track60-graph\.html$/, '#my/graph 프레임 주소에 그래프 하위 폴더가 있다');
    assert.equal(await graphByHash.evaluate(() => document.documentElement.getAttribute('data-v41-screen')), 'graph', '#my/graph 프레임 문서가 그래프 화면이다');
    await ctx8.close();

    // 첫 화면 글자 카드(261116): 내려간 영상(회색 120×90)의 '영상을 볼 수 없어요' 카드가 #orbit
    // shadowRoot 안에서 줄(감정·날짜·제목·알림)을 지키는지 — 제목이 3줄 높이 안(max-height 절단)·카드 안 배치·
    // '첫 순간' 배지와 감정 칩 겹침 0을 수치로 단정한다. 카드는 그림자 안에 있으므로 shadowRoot로
    // 스코핑한다(#730과 같은 판정). 셸이 lt41-date-style 동기화로 프레임을 다시 띄우므로 매번 전 프레임 검사.
    const ctx9 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx9.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); localStorage.setItem('lt41.homeCards', 'mine'); } catch {} }, theme);
    await ctx9.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#282828"/><text x="60" y="52" font-size="18" fill="#777" text-anchor="middle">...</text></svg>' }));
    await ctx9.route('**/api/**', (r) => {
      if (/api\/workspace/.test(r.request().url())) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [thumbTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-16T00:00:00.000Z' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    });
    const page9 = await ctx9.newPage();
    await page9.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    let homeFrame = null;
    for (let i = 0; i < 80 && !homeFrame; i++) {
      for (const fr of page9.frames()) {
        if (fr === page9.mainFrame()) continue;
        try { if (await fr.evaluate(() => !!document.getElementById('orbit')?.shadowRoot?.querySelector('.card .lt-fallback-title'))) { homeFrame = fr; break; } } catch {}
      }
      if (!homeFrame) await page9.waitForTimeout(300);
    }
    assert.ok(homeFrame, '첫 화면 글자 카드가 그려진다(내려간 영상 → 글 카드)');
    const cardCheck = await homeFrame.evaluate(() => {
      const sh = document.getElementById('orbit').shadowRoot;
      const cards = [...sh.querySelectorAll('.card .lt-fallback-card, .recent-media .lt-fallback-card')];
      const bad = [];
      for (const card of cards) {
        const cr = card.getBoundingClientRect();
        const title = card.querySelector('.lt-fallback-title');
        if (!title) { bad.push('제목 칸이 없다'); continue; }
        const tcs = getComputedStyle(title);
        const limit = parseFloat(tcs.fontSize) * parseFloat(tcs.lineHeight) * 3 + 2;
        if (title.clientHeight > limit) bad.push(`제목이 3줄 높이를 넘는다(${title.clientHeight}px > ${Math.round(limit)}px — max-height 3줄 절단)`);
        const inside = (el) => { const r = el.getBoundingClientRect(); return r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1 && r.left >= cr.left - 1 && r.right <= cr.right + 1; };
        for (const sel of ['.lt-fallback-head', '.lt-fallback-title', '.lt-fallback-notice']) {
          const el = card.querySelector(sel);
          if (el && !inside(el)) bad.push(sel + '이(가) 카드 밖으로 나온다');
        }
        const emo = card.querySelector('.lt-fallback-emotion');
        const date = card.querySelector('.lt-fallback-date');
        if (emo && date) {
          const er = emo.getBoundingClientRect(), dr = date.getBoundingClientRect();
          /* 감정 칩 박스는 패딩을 포함해 날짜 칸과 최대 4px 맞닿을 수 있다(글자 충돌 아님 — 2070 줌 실측).
             판정은 '날짜가 감정보다 한 줄 아래에서 시작하는가'(각자 다른 줄)로 한다. */
          if (!(dr.top >= er.top + parseFloat(getComputedStyle(emo).fontSize) - 1)) bad.push('감정과 날짜가 같은 줄에 붙어 있다(감정 ' + Math.round(er.top) + ' / 날짜 ' + Math.round(dr.top) + ')');
        }
        /* 4px 이하는 절대 위치 알림(하단 고정)·반올림 한계 — 시각 결함이 아니다(2070·1440 실측). */
        if (card.scrollHeight > card.clientHeight + 4) bad.push(`카드 내용이 카드 밖으로 넘친다(${card.scrollHeight - card.clientHeight}px)`);
      }
      for (const fm of [...sh.querySelectorAll('.card .firstMark')]) {
        const fb = fm.parentElement?.querySelector('.surface .lt-fallback-card');
        const emo = fb?.querySelector('.lt-fallback-emotion');
        if (!fb || !emo) continue;
        const a = fm.getBoundingClientRect(), b = emo.getBoundingClientRect();
        const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (ox * oy > 0) bad.push(`'첫 순간' 배지와 감정 칩이 겹친다(${Math.round(ox * oy)}px²)`);
      }
      return { cards: cards.length, bad, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) };
    });
    assert.ok(cardCheck.cards >= 1, `첫 화면 글자 카드 수(실제 ${cardCheck.cards})`);
    assert.deepEqual(cardCheck.bad, [], `첫 화면 글자 카드 줄·말줄임·배치: ${JSON.stringify(cardCheck.bad)}`);
    assert.equal(cardCheck.overflow, 0, `첫 화면 가로 넘침 0(실제 ${cardCheck.overflow})`);
    await take(page9, '첫 화면 글자 카드');
    await ctx9.close();

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

// #713 후속(2026-11-16 보고): #my/graph가 그래프가 아니라 첫 화면으로 열렸다 — screenUrl이 그래프의
// 하위 폴더(views/graph/)를 빠뜨려 없는 주소를 배포가 4.0 첫 화면(SPA 폴백)으로 되돌려 줬다.
// 세 경우 모두 iframe 파일 이름·프레임 문서 표시(data-v41-screen)·주소를 문자로 기록해 단정한다(눈 판단 없음).
test('#my/graph는 로그인 진입·로그인 왕복·hash 이동 세 경우 모두 그래프 화면을 연다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const GRAPH_FRAME = /views\/graph\/track60-graph\.html/;
  const workspace = (r, owned) => r.fulfill({
    status: owned ? 200 : 401, contentType: 'application/json',
    body: owned
      ? JSON.stringify({ revision: 1, state: { version: 1, trees: [graphTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' })
      : '{"error":"auth"}'
  });
  const frameShown = (file) => () => {
    const f = document.getElementById('view');
    return !!f && !f.hidden && new RegExp(file).test(f.contentWindow?.location?.href || '');
  };
  const graphState = async (page) => {
    const f = await frameOf(page, GRAPH_FRAME);
    const screen = f ? await f.evaluate(() => document.documentElement.getAttribute('data-v41-screen') || '') : '';
    return { frame: f ? f.url() : '(프레임 없음)', screen, hash: await page.evaluate(() => location.hash) };
  };
  try {
    // ① 로그인된 상태에서 주소창에 #my/graph 입력(새 페이지 로드).
    const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await ctx1.route('**://i.ytimg.com/**', THUMB);
    await ctx1.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx1.route('**/api/workspace**', (r) => workspace(r, true));
    const page1 = await ctx1.newPage();
    await page1.goto(`${base}/v41/#my/graph`, { waitUntil: 'load' });
    await page1.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got1 = await graphState(page1);
    assert.match(got1.frame, GRAPH_FRAME, '① 로그인 상태 #my/graph: iframe 파일이 views/graph/track60-graph.html이다');
    assert.equal(got1.screen, 'graph', '① 프레임 문서가 그래프 화면이다(data-v41-screen)');
    assert.match(got1.hash, /^#my\/graph/, '① 주소가 #my/graph로 남는다');
    await ctx1.close();

    // ② 로그아웃 상태에서 #my/graph로 들어와 로그인을 거쳐 돌아온 경우 — 같은 탭이 hash 없이 돌아오고
    // 보관 경로(pending-owner-route)로 그래프를 되살린다. 로그인 왕복은 ?account=1 돌아옴 + 회원 응답으로 흉내 낸다.
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    let owned = false;
    await ctx2.route('**://i.ytimg.com/**', THUMB);
    await ctx2.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx2.route('**/api/workspace**', (r) => workspace(r, owned));
    const page2 = await ctx2.newPage();
    await page2.goto(`${base}/v41/#my/graph`, { waitUntil: 'load' });
    await page2.waitForTimeout(1200);
    const stash = await page2.evaluate(() => sessionStorage.getItem('lovetree.v41.pending-owner-route.v1') || '');
    assert.equal(stash, '#my/graph', '② 로그인 전 보관 경로가 남는다');
    owned = true;
    await page2.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page2.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got2 = await graphState(page2);
    assert.match(got2.frame, GRAPH_FRAME, '② 로그인 왕복 뒤에도 그래프 화면을 연다');
    assert.equal(got2.screen, 'graph', '② 프레임 문서가 그래프 화면이다');
    assert.match(got2.hash, /^#my\/graph/, '② 돌아온 뒤 주소가 #my/graph로 쓰인다');
    await ctx2.close();

    // ③ 다른 화면(책)에 있다가 hash만 #my/graph로 바꾼 경우.
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await ctx3.route('**://i.ytimg.com/**', THUMB);
    await ctx3.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx3.route('**/api/workspace**', (r) => workspace(r, true));
    const page3 = await ctx3.newPage();
    await page3.goto(`${base}/v41/#my/book`, { waitUntil: 'load' });
    await page3.waitForFunction(frameShown('track59-sketchbook'), null, { timeout: 20000 });
    await page3.evaluate(() => { location.hash = '#my/graph'; });
    await page3.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got3 = await graphState(page3);
    assert.match(got3.frame, GRAPH_FRAME, '③ hash만 바꿔도 그래프 화면을 연다');
    assert.equal(got3.screen, 'graph', '③ 프레임 문서가 그래프 화면이다');
    assert.match(got3.hash, /^#my\/graph/, '③ 주소가 #my/graph다');
    await ctx3.close();
  } finally {
    await browser.close();
    server.close();
  }
});
