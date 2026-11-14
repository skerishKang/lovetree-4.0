// #601: 핀보드 2차 — 실행 계약.
// 1) 배치 모드: '날짜순 | 내 배치' 전환(기본 날짜순). 카드를 끌면 '내 배치'로 자동 전환·저장.
//    전환은 저장 자리를 지우지 않는다('정렬 되돌리기' 대체). 근본 수리: 옛 관계 배치의 x·y는
//    저장 자리로 세지 않는다(핀보드가 스냅한 칸 x만 — LT58Model.isPinboardSlot).
// 2) 카드는 훑기용: 큰 썸네일 + 제목 2줄 + 감정·날짜 한 줄. 두 번째 제목·사이트 주소·안내 글·
//    'YouTube에서 열기'·'크게 보기'는 상세가 맡는다. 마지막 줄 카드가 판 밖으로 나가지 않는다.
// 3) 상세는 감상·기록용: 플레이어가 맨 위에서 바로 재생, 내 마음을 크게(비면 입력칸),
//    이어진 순간은 작은 썸네일 카드, 할 일 단추는 한 줄(수정·YouTube에서 열기·크게 보기·지도·시네마).
// 4) 확대 단추: 지도처럼 [－][＋][전체 보기] + 말풍선 설명(#584와 같은 동작).
// 5) 셸 트리 칸 고정 폭(11em) — 트리를 바꿔도 책·보드·지도 탭이 흔들리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis;
await import('../public/v41/views/board/board-model.js');
const LT58Model = globalThis.LT58Model;

const REQUIRE = process.env.LT_BOARD_601_REQUIRE === '1';
const ROOT = path.resolve(process.env.LT_BOARD_601_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 핀보드 2차 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 핀보드 2차 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');

// 26순간 평평한 트리. old=true면 옛 관계 배치 시절의 x·y(스냅되지 않은 무작위 소수)를 남긴다 —
// #601 근본 수리의 대상: 이 값들이 '저장 자리'로 세어지면 처음 화면이 뭉개진다.
const starTree = (n, old = false) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-0' + ((i % 9) + 1) + '-1' + (i % 9), emotion: '설렘', note: '메모 ' + (i + 1),
    parentId: i ? 's0' : null, relation: '', url: i ? 'https://youtu.be/dQw4w9WgXcQ' : '', keywords: [],
    ...(old ? { x: 173.5 + i * 37.13, y: 218.7 + (i % 7) * 53.9, rot: (i % 5) - 2 } : { x: null, y: null, rot: 0 }), color: 'violet'
  }));
  const edges = [];
  for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n + (old ? 'old' : ''), title: '모아둔 ' + n, moments, edges };
};

function serve(extra = {}) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (extra[clean]) { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(extra[clean]); return; }
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (path.relative(ROOT, file).startsWith('..')) continue;
      try {
        if (!(await stat(file)).isFile()) continue;
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res); return;
      } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};window.LT41_MESSAGES=[];addEventListener('message',(e)=>{if(e.data&&e.data.type)window.LT41_MESSAGES.push({type:e.data.type,momentId:e.data.momentId,treeId:e.data.treeId,moments:e.data.moments})});</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const YT_THUMB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#8a7a92"/><path d="M700 350 L700 850 L1050 600 Z" fill="#fff"/></svg>';

async function openHost(browser, url, { width, height } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.route('**/i.ytimg.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: YT_THUMB_SVG }));
  const problems = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '보드 프레임이 열린다');
  try {
    await frame.waitForSelector('#cardLayer .card', { timeout: 20000 });
  } catch (e) {
    throw new Error(`보드 화면이 열리지 않았다(${width}×${height}): ${String(e).slice(0, 200)} / 화면 문제: ${problems.join(' | ') || '없음'}`);
  }
  await page.waitForTimeout(1500);
  return { context, page, frame, problems };
}

const geometry = (frame) => frame.evaluate(() => {
  const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ id: c.dataset.id, x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }));
  let pairs = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) pairs++;
  }
  const cols = [...new Set(cards.map((c) => c.x))].sort((a, b) => a - b);
  const surface = document.querySelector('.surface').getBoundingClientRect();
  const world = document.querySelector('.boardWorld').getBoundingClientRect();
  const z = world.width / document.querySelector('.boardWorld').offsetWidth;
  const maxBottom = cards.length ? Math.max(...cards.map((c) => (world.top + (c.y + c.h) * z) - surface.bottom)) : 0;
  return { n: cards.length, pairs, cols: cols.length, maxBottom: Math.round(maxBottom), maxH: Math.max(...cards.map((c) => c.h)) };
});

// === 모델: 옛 자리와 핀보드 자리를 구별한다 ===
test('#601 모델: isPinboardSlot — 칸 x(±2px 스냅)만 저장 자리다', () => {
  assert.equal(LT58Model.isPinboardSlot(150), true, '첫 칸');
  assert.equal(LT58Model.isPinboardSlot(450), true, '두 번째 칸');
  assert.equal(LT58Model.isPinboardSlot(151.8), true, '스냅 오차 2px 안');
  assert.equal(LT58Model.isPinboardSlot(152.1), false, '스냅 오차 2px 밖');
  assert.equal(LT58Model.isPinboardSlot(173.5), false, '옛 관계 배치의 x');
  assert.equal(LT58Model.isPinboardSlot(640.25), false, '옛 관계 배치의 x');
  assert.equal(LT58Model.isPinboardSlot(null), false);
  assert.equal(LT58Model.isPinboardSlot(NaN), false);
});

test('#601 화면: 저장 자리 판정·보존·복원이 한 벌을 쓴다', () => {
  const board = read('views/board/board.js');
  // 근본 수리: 처음 저장 판정은 핀보드 칸 x만 통과시킨다.
  assert.match(board, /const saved=Number\.isFinite\(m\.x\)&&Number\.isFinite\(m\.y\)&&LT58Model\.isPinboardSlot\(m\.x\)/);
  // '날짜순'에서 재꽂아도 저장 값을 지우지 않는다(savedXY 보존 → 저장 메시지는 원본 x·y).
  assert.match(board, /savedXY:saved\?\{x:m\.x,y:m\.y,rot:/);
  assert.match(board, /m\.savedPos&&m\.savedXY&&boardMode==='date'\?\{x:m\.savedXY\.x,y:m\.savedXY\.y,rot:m\.savedXY\.rot\}/);
  // '내 배치'로 돌아오면 저장 자리를 복원한다.
  assert.match(board, /if\(mode==='mine'\)for\(const m of moments\)\{if\(m\.savedPos&&m\.savedXY\)\{m\.x=m\.savedXY\.x/);
  // 모드는 트리별로 기억한다.
  assert.match(board, /const BOARD_MODE_KEY='lt41\.boardMode'/);
  assert.match(board, /function boardModeKey\(\)\{const id=boardTreeId\(\);return id\?BOARD_MODE_KEY\+':'\+id:BOARD_MODE_KEY\}/);
  // 판 크기: 카드 예약 높이로 자란다(마지막 줄이 판 밖으로 나가지 않는다).
  assert.match(board, /LT58Model\.boardSize\(moments\.map\(m=>\(\{x:m\.x,y:m\.y,h:reservedHeights\.get\(m\.id\)\|\|BASE_RESERVED_H\}\)\)\)/);
});

test('#601 화면: 카드는 훑기용 — 큰 썸네일·제목 2줄·감정·날짜 한 줄', () => {
  const extras = read('views/board/board-extras.js');
  const detail = read('views/board/board-detail.js');
  const css = read('views/board/board-extra.css') + read('views/board/board.css');
  for (const s of [extras, detail]) {
    assert.match(s, /class="cardTitle"/);
    assert.match(s, /class="cardMeta"/);
    assert.doesNotMatch(s, /class="eyebrow"/, '종류 라벨은 카드에서 치웠다');
    assert.doesNotMatch(s, /titleSubMarkup\(m\)/, '두 번째 제목은 카드에서 치웠다');
    assert.doesNotMatch(s, /class="memo"/, '마음은 상세가 맡는다');
    assert.doesNotMatch(s, /class="keywordOnCard"/, '키워드 묶음은 카드에서 치웠다');
    assert.doesNotMatch(s, /class="domain"/, '사이트 주소는 카드에서 치웠다');
    // 썸네일 한 장 — 안내 글·원본 링크·크게 보기는 상세가 맡는다(compact).
    assert.match(s, /LTMedia\.markup\([^)]*\{compact:true\}\)/);
  }
  assert.match(css, /\.card \.cardTitle\{[^}]*-webkit-line-clamp:2/, '제목은 2줄에서 말 줄임');
  assert.match(css, /\.card \.media\{height:200px\}/, '썸네일은 크게');
  assert.match(css, /\.card \.lt-media\[data-lt-vertical="1"\][^{]*\{[^}]*height:300px/, '세로 영상은 9:16, 높이 상한 300px');
});

test('#601 공용 마크업: compact — 카드에는 썸네일 한 장만', () => {
  const mp = read('media-preview.js');
  assert.match(mp, /momentMeta=null,opts=null\)/);
  assert.match(mp, /const compact=!!opts\?\.compact/);
  assert.match(mp, /const cached=\(caption&&!compact\)/);
  assert.match(mp, /const status=compact\?'':/);
  assert.match(mp, /const expand=canLoad&&!compact&&/);
  assert.match(mp, /\(compact\?\'\'\:'<p class="lt-media-status"/);
});

test('#601 상세: 플레이어가 맨 위, 내 마음은 크게, 이어진 순간은 카드, 할 일은 한 줄', () => {
  const html = read('views/track58-pinboard.html');
  const extras = read('views/board/board-extras.js');
  // 구조: 플레이어 → 내 마음(큰 글씨·입력칸) → 감정·날짜·트리 → 이어진 순간 → 할 단 한 줄.
  assert.match(html, /id="detailPlayer"/);
  assert.match(html, /id="dHeart" hidden/, '내 마음 큰 글씨');
  assert.match(html, /id="dHeartInput"[^>]*placeholder="이 순간에 남기고 싶은 마음을 적어 보세요"/);
  assert.match(html, /id="dHeartSave"[^>]*>마음 저장</);
  assert.match(html, /id="detailActions"/);
  assert.match(html, /id="editMomentBtn"[^>]*>수정</);
  assert.match(html, /id="detailYtBtn"[^>]*hidden>YouTube에서 열기</);
  assert.match(html, /id="openMoment"[^>]*>크게 보기</);
  assert.match(html, /id="cinemaFromMoment"[^>]*>여기부터 시네마</);
  assert.doesNotMatch(html, /id="nextMoment"/, "'다음 순간 보기' 단추는 이어진 순간 카드로 대체됐다");
  assert.doesNotMatch(html, /id="prevMoment"/);
  // 플레이어가 맨 위에서 바로 재생된다(재생 단추를 누른다).
  assert.match(extras, /function detailPlayerHTML\(m\)/);
  assert.match(extras, /querySelector\('\[data-lt-play\]'\);if\(b\)b\.click\(\)/);
  // 내 마음 저장은 기존 저장 경로(persistBoard → lt41-board-sync)로 간다.
  assert.match(extras, /\$\('#dHeartSave'\)\.onclick=[\s\S]{0,200}m\.memo=v;persistBoard\(\)/);
  // 이어진 순간: 작은 썸네일 카드(connCard), 누르면 판이 이동한다(#583 규칙 유지).
  assert.match(extras, /class="connCard" data-cid=/);
  assert.match(extras, /function connThumb\(t\)/);
  assert.match(extras, /b\.dataset\.dir==='next'\)moveViaConnection\(c\);else pulseConnection\(c,\(\)=>focusBoardMoment\(c\.a\)\)/);
  // 지도 단추는 할 일 줄에 놓인다.
  assert.match(extras, /\$\('#detailActions'\)\.append\(mapBtn\)/);
});

test('#601 확대 단추: [－][＋][전체 보기]와 말풍선 설명', () => {
  const html = read('views/track58-pinboard.html');
  const extras = read('views/board/board-extras.js');
  const css = read('views/board/board-extra.css');
  assert.match(html, /id="minusBtn"[^>]*data-lt-tip="작게 보기[^"]*"/);
  assert.match(html, /id="plusBtn"[^>]*data-lt-tip="크게 보기[^"]*"/);
  assert.match(html, /id="resetBtn"[^>]*>전체 보기</, "'보기 초기화'는 지도처럼 '전체 보기'로 부른다");
  assert.match(html, /id="resetBtn"[^>]*data-lt-tip="전체 보기[^"]*"/);
  // 말풍선: 마우스 올림·초점·길게 누름(#584와 같은 동작).
  assert.match(extras, /function showBoardTip\(el\)/);
  assert.match(extras, /id='lt-tip-bubble'|id="lt-tip-bubble"/);
  assert.match(css, /\.lt-tip-bubble\{position:fixed/);
});

test('#601 셸: 트리 칸은 고정 폭(11em) — 탭이 흔들리지 않는다', () => {
  const css = fs.readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
  const header = read('shell/header.mjs');
  assert.match(css, /nav #record-menu\{flex:0 0 auto;width:11em;/);
  assert.match(css, /nav #record-menu #source-label\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  // 좁은 폭에서는 여전히 줄어든다(112px 상한 유지).
  assert.match(css, /nav #record-menu\{width:auto;max-width:112px;/);
  // 마우스 올림·초점에 전체 이름(말줄임 보완).
  assert.match(header, /트리: \$\{displayTreeTitle\(window\.LT41\?\.tree\.title\|\|''\)\} — 다른 트리를 고릅니다\./);
});

// === 화면(실행) ===
test('#601 화면: 옛 관계 배치 x·y가 남아도 처음은 날짜순 바둑판이다(근본 수리)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26, true);
  const server = await serve({ '/__host-601a.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, frame, problems } = await openHost(browser, `${base}/__host-601a.html`, { width: 1440, height: 900 });
    const g = await geometry(frame);
    assert.equal(g.n, 26, '순간 26장이 모두 꽂힌다');
    assert.equal(g.pairs, 0, '겹침 0 — 옛 x·y가 저장 자리로 세어지지 않는다');
    assert.equal(g.cols, 4, '1440은 4칸 바둑판(한 줄 뭉치기 아니다)');
    assert.equal(await frame.evaluate(() => document.querySelector('[data-board-mode="date"]').getAttribute('aria-pressed')), 'true', '처음 모드는 날짜순');
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#601 화면: 끌면 내 배치로 자동 전환하고, 날짜순↔내 배치를 오가도 자리를 지키며, 저장 값은 원본을 보낸다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26, true);
  const server = await serve({ '/__host-601b.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-601b.html`, { width: 1440, height: 900 });
    // 보이는 카드를 골라 오른쪽 빈 칸으로 끌어 꽂는다. #601: 그림이 대부분인 카드도 그림 가운데에서 끌 수 있어야 한다 —
    // 그림 위 끌기는 브라우저 기본 끌기(pointercancel)에 잡아먹히지 않게 막아 둔다(재생 단추는 모서리 작은 표).
    const from = await frame.evaluate(() => {
      for (const c of document.querySelectorAll('#cardLayer .card')) {
        const r = c.getBoundingClientRect();
        if (!(r.top > 80 && r.bottom < 880 && r.left > 0 && r.right < 1100)) continue;
        const img = c.querySelector('.lt-yt-preview img');
        const mr = img ? img.getBoundingClientRect() : null;
        const x = mr ? (mr.left + mr.right) / 2 : (r.left + r.right) / 2;
        const y = mr ? (mr.top + mr.bottom) / 2 : (r.top + r.bottom) / 2;
        const hit = document.elementFromPoint(x, y);
        return { id: c.dataset.id, x, y, onButton: !!hit?.closest('button') };
      }
      return null;
    });
    assert.ok(from, '끌 카드가 보인다');
    assert.equal(from.onButton, false, '카드 그림 가운데는 단추가 아니어야 끌 수 있다(#601)');
    // #601: 그림 위 끌기는 브라우저 기본 끌기(pointercancel)에 잡아먹힌다 — 기본 끌기는 막혀 있어야 한다.
    // headless chromium은 실제 마우스 입력으로 기본 끌기를 재현하지 못하므로, 막음 자체를 계약으로 잰다.
    const noNativeDrag = await frame.evaluate(() => {
      const img = document.querySelector('#cardLayer .card .lt-yt-preview img');
      if (!img) return { hasImg: false };
      const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true });
      img.dispatchEvent(ev);
      return { hasImg: true, prevented: ev.defaultPrevented };
    });
    assert.equal(noNativeDrag.hasImg, true, '영상 카드 그림이 그려져 있다');
    assert.equal(noNativeDrag.prevented, true, '카드 그림의 기본 끌기(dragstart)는 막혀야 한다(#601)');
    const to = await frame.evaluate(() => {
      const c = document.querySelector('#cardLayer .card');
      const r = c.getBoundingClientRect(), z = r.width / c.offsetWidth;
      return { x: r.right + 242 * z * 0.6, y: (r.top + r.bottom) / 2 };
    });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    const dropped = await frame.evaluate((id) => {
      const el = document.querySelector(`[data-id="${id}"]`);
      return { x: el.offsetLeft, y: el.offsetTop };
    }, from.id);
    assert.equal(await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').getAttribute('aria-pressed')), 'true', '끌면 내 배치로 자동 전환');
    const g1 = await geometry(frame);
    assert.equal(g1.pairs, 0, '꽂은 뒤에도 겹침 0');
    // '날짜순'으로 돌아갔다가 다시 '내 배치' — 꽂은 자리가 그대로다(전환은 배치를 지우지 않는다).
    await frame.evaluate(() => document.querySelector('[data-board-mode="date"]').click());
    await page.waitForTimeout(900);
    const g2 = await geometry(frame);
    assert.equal(g2.cols, 4, '날짜순은 4칸 바둑판');
    assert.equal(g2.pairs, 0, '날짜순에서도 겹침 0');
    await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').click());
    await page.waitForTimeout(900);
    const back = await frame.evaluate((id) => {
      const el = document.querySelector(`[data-id="${id}"]`);
      return { x: el.offsetLeft, y: el.offsetTop };
    }, from.id);
    assert.equal(back.x, dropped.x, '내 배치로 돌리면 꽂은 칸으로 돌아온다');
    assert.equal(back.y, dropped.y, '내 배치로 돌리면 꽂은 줄로 돌아온다');
    // 저장 값: '날짜순'에서 보내는 x·y는 화면 자리가 아니라 꽂은 자리다(원본 보존).
    await frame.evaluate(() => document.querySelector('[data-board-mode="date"]').click());
    await page.waitForTimeout(600);
    const sync = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').at(-1));
    assert.ok(sync, '저장 메시지가 간다');
    const sent = sync.moments?.find((m) => m.id === from.id);
    assert.ok(sent, '저장 목록에 끌 카드가 있다');
    assert.equal(sent.x, dropped.x, '날짜순 화면 자리가 아니라 꽂은 자리를 저장한다');
    assert.equal(sent.y, dropped.y, '날짜순 화면 자리가 아니라 꽂은 자리를 저장한다');
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#601 화면: 카드 높이 상한·마지막 줄이 판 안, 상세는 플레이어·마음·이어진 순간·단추 한 줄', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26, true);
  tree.moments[0].note = ''; // 첫 순간은 마음이 비어 있다 — 입력칸이 보이는 상태를 검사한다.
  const server = await serve({ '/__host-601c.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-601c.html`, { width: 1440, height: 900 });
    const g = await geometry(frame);
    assert.ok(g.maxH <= 460, `카드 높이 상한 — 가장 큰 카드 ${g.maxH}px ≤ 460px`);
    assert.ok(g.maxBottom <= 4, `마지막 줄 카드가 흰 판 안에 있다(넘침 ${g.maxBottom}px ≤ 4px)`);
    // 카드에는 두 번째 제목·사이트 주소·마음이 없다.
    const cardBits = await frame.evaluate(() => {
      const c = document.querySelector('#cardLayer .card');
      return { eyebrow: !!c.querySelector('.eyebrow'), videoTitle: !!c.querySelector('.videoTitle'), memo: !!c.querySelector('.memo'), domain: !!c.querySelector('.domain'), status: !!c.querySelector('.lt-media-status'), expand: !!c.querySelector('[data-lt-expand]'), openLink: !!c.querySelector('.lt-media a[href*="youtube"]'), title: !!c.querySelector('.cardTitle'), meta: !!c.querySelector('.cardMeta') };
    });
    assert.equal(cardBits.eyebrow || cardBits.videoTitle || cardBits.memo || cardBits.domain || cardBits.status || cardBits.expand || cardBits.openLink, false, '카드에서 치운 것들이 없다');
    assert.equal(cardBits.title && cardBits.meta, true, '제목·감정·날짜는 있다');
    // 상세: 플레이어가 맨 위(첫 번째 내용), 내 마음은 비어 있으면 입력칸.
    const first = await frame.evaluate(() => {
      const c = document.querySelector('#cardLayer .card');
      const r = c.getBoundingClientRect();
      return { id: c.dataset.id, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    });
    await page.mouse.click(first.x, first.y);
    await page.waitForTimeout(700);
    const detail = await frame.evaluate(() => ({
      playerFirst: document.getElementById('detailPlayer').getBoundingClientRect().top < document.getElementById('dTitle').getBoundingClientRect().top + 200,
      playerHasMedia: !!document.querySelector('#detailPlayer .lt-media, #detailPlayer video, #detailPlayer img, #detailPlayer .detailNoteMedia'),
      hasAutoplay: (() => { const vid = document.querySelector('#detailPlayer video'); return vid ? vid.hasAttribute('autoplay') : false; })(),
      heartInputShown: !document.getElementById('dHeartInput').hidden,
      heartSaveShown: !document.getElementById('dHeartSave').hidden,
      basic: document.getElementById('dBasic').textContent,
      connCards: document.querySelectorAll('#dConn .connCard').length,
      actions: ['editMomentBtn', 'detailYtBtn', 'openMoment', 'detailMapBtn', 'cinemaFromMoment'].map((id) => !!document.getElementById(id))
    }));
    assert.equal(detail.playerHasMedia, true, '플레이어가 있다');
    // #619-3: 상세 플레이어는 autoplay 를 제거했고, 누르면 재생 단추로 직접 재생한다.
    assert.equal(detail.hasAutoplay === false, true, '상세 플레이어는 autoplay 속성이 없다');
    assert.equal(detail.heartInputShown && detail.heartSaveShown, true, '마음이 비어 있으면 입력칸과 저장 단추가 보인다');
    assert.match(detail.basic, /설렘/, '감정이 보인다');
    assert.deepEqual(detail.actions, [true, true, true, true, true], '할 일 단추 한 줄(수정·YouTube에서 열기·크게 보기·지도·시네마)');
    // 마음을 남기면 기존 저장 경로로 note가 간다.
    await frame.fill('#dHeartInput', '이 순간이 좋았어요');
    await frame.click('#dHeartSave');
    await page.waitForTimeout(700);
    const sync = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').at(-1));
    const sent = sync?.moments?.find((m) => m.id === first.id);
    assert.equal(sent?.note, '이 순간이 좋았어요', '마음은 기존 순간 저장 경로(note)로 간다');
    // 이어진 순간 카드를 누르면 판이 이동하고 상세가 바뀐다.
    const t1 = await frame.evaluate(() => document.getElementById('world').style.transform);
    await frame.evaluate(() => document.querySelector('#dConn .connCard[data-dir="next"]')?.click());
    await page.waitForTimeout(1200);
    const t2 = await frame.evaluate(() => document.getElementById('world').style.transform);
    assert.notEqual(t1, t2, '이어진 순간 카드가 판을 옮긴다');
    // 확대 단추: 누르면 배율이 바뀌고, 말풍선이 뜬다.
    const z1 = await frame.evaluate(() => document.getElementById('zoomLabel').textContent);
    await frame.evaluate(() => document.getElementById('plusBtn').click());
    await page.waitForTimeout(400);
    const z2 = await frame.evaluate(() => document.getElementById('zoomLabel').textContent);
    assert.notEqual(z1, z2, '＋ 단추가 배율을 바꾼다');
    await frame.evaluate(() => document.getElementById('resetBtn').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    await page.waitForTimeout(300);
    const tip = await frame.evaluate(() => { const b = document.getElementById('lt-tip-bubble'); return b && !b.hidden ? b.textContent : ''; });
    assert.match(tip, /전체 보기/, '말풍선 설명이 뜬다');
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});
