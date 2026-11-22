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
// mixed=true면 가로·세로(쇼츠)를 섞는다 — 대표 트리와 같은 구조(#619-6).
const starTree = (n, old = false, mixed = false) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-0' + ((i % 9) + 1) + '-1' + (i % 9), emotion: '설렘', note: '메모 ' + (i + 1),
    parentId: i ? 's0' : null, relation: '',
    url: i ? (mixed && i % 2 === 0 ? 'https://www.youtube.com/shorts/dQw4w9WgXcQ' : 'https://youtu.be/dQw4w9WgXcQ') : '',
    keywords: [],
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
// 쇼츠의 oardefault 자리에 오는 회색 120×90 그림(#429 판정 대상).
const GRAY_THUMB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#bcbcc0"/></svg>';

async function openHost(browser, url, { width, height, grayOardefault = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.route('**/i.ytimg.com/**', (route) => {
    const u = route.request().url();
    return route.fulfill({ contentType: 'image/svg+xml', body: grayOardefault && u.includes('oardefault') ? GRAY_THUMB_SVG : YT_THUMB_SVG });
  });
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

// 화면(보이는 칸)에 걸친 카드 수 — #619-4 '전환 뒤 카드 안 보임' 판정.
const visibleCards = (frame) => frame.evaluate(() => {
  const vp = document.getElementById('viewport').getBoundingClientRect();
  return [...document.querySelectorAll('#cardLayer .card')].filter((c) => {
    const r = c.getBoundingClientRect();
    return r.right > vp.left + 4 && r.left < vp.right - 4 && r.bottom > vp.top + 4 && r.top < vp.bottom - 4;
  }).length;
});

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

// #952: 저장 자리·자동 재생·카드/상세 마크업·확대 단추·셸 칸을 파일 글자로 고정하던 단정들을 걷어냈다.
// 그 결과는 이 파일 아래 실브라우저 시험이 직접 잰다 — 상세 판의 주 단추/더 보기 구성(#662 실제 좌표 클릭),
// ＋/전체 보기 말풍선(13px·fixed), 마음 저장이 lt41-board-sync의 note로 가는지, 이어진 순간 카드 이동,
// 날짜순/내 배치와 저장 자리(v41-board-order-619·stack-619 모델 시험)까지.

// #1059 표 시험: 유튜브 주소 한 벌을 모든 진입 함수(정본·보드 화면)가 같은 id로 판정한다.
const YT_CORPUS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ?t=42',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://www.youtube.com/live/dQw4w9WgXcQ',
  'https://www.youtube.com/embed/dQw4w9WgXcQ',
  'http://m.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123',
  'https://www.youtube.com/playlist?list=PL123',
  'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
  'https://user:kate@example.test/watch?v=dQw4w9WgXcQ',
  'ftp://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/abcdefghijkEXTRA',
  'https://youtu.be/short',
  'https://www.youtube.com/watch?v=toolongid123456',
  'javascript:alert(1)'
];

test('#1059 화면: 보드 youtubeId 가 정본과 같은 판정이다(주소 표)', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(2);
  const server = await serve({ '/__host-1059.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, frame, problems } = await openHost(browser, `${base}/__host-1059.html`, { width: 1440, height: 900 });
    const diffs = await frame.evaluate(async (corpus) => {
      const { youtubeIdFrom } = await import('/v41/youtube-id.mjs');
      const out = [];
      for (const url of corpus) {
        const a = youtubeId(url);
        const b = youtubeIdFrom(url, { allowThumbnail: false });
        if (a !== b) out.push(`${url} :: board=${a} canon=${b}`);
      }
      return out;
    }, YT_CORPUS);
    assert.deepEqual(diffs, [], `보드 youtubeId 와 정본이 같다 (${diffs.join(' | ')})`);
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

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
    assert.ok(await visibleCards(frame) >= 1, '#619-4: 내 배치로 바뀐 직후에도 화면에 카드가 보인다');
    const g1 = await geometry(frame);
    assert.equal(g1.pairs, 0, '꽂은 뒤에도 겹침 0');
    // '날짜순'으로 돌아갔다가 다시 '내 배치' — 꽂은 자리가 그대로다(전환은 배치를 지우지 않는다).
    await frame.evaluate(() => document.querySelector('[data-board-mode="date"]').click());
    await page.waitForTimeout(900);
    const g2 = await geometry(frame);
    assert.equal(g2.cols, 4, '날짜순은 4칸 바둑판');
    assert.equal(g2.pairs, 0, '날짜순에서도 겹침 0');
    assert.ok(await visibleCards(frame) >= 1, '#619-4: 날짜순으로 바뀐 직후에도 화면에 카드가 보인다');
    await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').click());
    await page.waitForTimeout(900);
    const back = await frame.evaluate((id) => {
      const el = document.querySelector(`[data-id="${id}"]`);
      return { x: el.offsetLeft, y: el.offsetTop };
    }, from.id);
    assert.equal(back.x, dropped.x, '내 배치로 돌리면 꽂은 칸으로 돌아온다');
    assert.equal(back.y, dropped.y, '내 배치로 돌리면 꽂은 줄로 돌아온다');
    assert.ok(await visibleCards(frame) >= 1, '#619-4: 내 배치로 되돌린 직후에도 화면에 카드가 보인다');
    // 저장 값: #619-6 — 좌표가 아니라 순서(순위)로 저장한다. y는 순위 값이고 0부터 끊김 없이 간다.
    await frame.evaluate(() => document.querySelector('[data-board-mode="date"]').click());
    await page.waitForTimeout(600);
    const sync = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').at(-1));
    assert.ok(sync, '저장 메시지가 간다');
    const sent = sync.moments?.find((m) => m.id === from.id);
    assert.ok(sent, '저장 목록에 끌 카드가 있다');
    const sentRank = sent.y + 10000;
    assert.ok(Number.isInteger(sentRank) && sentRank >= 0 && sentRank < 26, `끈 카드의 순위가 있다(${sent.y})`);
    const all = new Set(sync.moments.map((m) => m.y));
    assert.equal(all.size, 26, '순위가 겹치지 않는다');
    assert.equal(Math.min(...all), -10000, '순위 0부터 시작한다');
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#619 화면: 1980 폭 26순간(가로·세로·옛 x·y) — 검은 테두리 없음·전환 뒤 카드 보임·썸네일 내려가기', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26, true, true);
  const server = await serve({ '/__host-619.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-619.html`, { width: 1980, height: 1080, grayOardefault: true });
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#cardLayer .card').length), 26, '26장이 모두 꽂힌다');
    assert.equal(await frame.evaluate(() => new Set([...document.querySelectorAll('#cardLayer .card')].map((c) => c.offsetLeft)).size), 6, '1980은 6칸 바둑판');
    // 5: 마지막 열 검은 테두리 — 꾸밈 카드 스타일(필름의 검은 테두리)은 서버 기록에 자동 배정하지 않는다.
    const blackFrames = await frame.evaluate(() => [...document.querySelectorAll('#cardLayer .card')]
      .map((c) => ({ id: c.dataset.id, cls: c.className, border: getComputedStyle(c).borderColor }))
      .filter((c) => /cardStyle-film/.test(c.cls) || c.border === 'rgb(39, 32, 45)'));
    assert.deepEqual(blackFrames, [], '검은 테두리(필름) 카드가 없다');
    assert.ok(await visibleCards(frame) >= 1, '처음 화면에 카드가 보인다');
    // 4: 화면을 멀리 옮겨 카드가 하나도 안 보이게 만든 뒤 배치 모드를 바꾼다 → 자동 맞춤으로 카드가 다시 보인다.
    for (let i = 0; i < 8 && (await visibleCards(frame)) > 0; i++) {
      const at = await frame.evaluate(() => {
        for (let y = 1070; y > 880; y -= 15) for (let x = 520; x < 1300; x += 60) {
          const el = document.elementFromPoint(x, y);
          if (!el || el.closest('.card,.toolbar,.cinemaBtn,button,a,aside')) continue;
          if (el.closest('#viewport') || el.classList.contains('surface')) return { x, y };
        }
        return null;
      });
      assert.ok(at, '옮길 빈 자리가 있다');
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(Math.max(40, at.x - 700), Math.max(80, at.y - 500), { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);
    }
    assert.equal(await visibleCards(frame), 0, '재현: 화면을 옮기면 카드가 하나도 안 보인다');
    await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').click());
    await page.waitForTimeout(700);
    assert.ok(await visibleCards(frame) >= 1, '#619-4: 내 배치로 바꾼 직후 자동 맞춤으로 카드가 보인다');
    await frame.evaluate(() => document.querySelector('[data-board-mode="date"]').click());
    await page.waitForTimeout(700);
    assert.ok(await visibleCards(frame) >= 1, '#619-4: 날짜순으로 되돌린 직후에도 카드가 보인다');
    // 3·6: 이어진 순간 썸네일 — 쇼츠의 회색 120×90에서 실제 썸네일(hqdefault)로 내려간다.
    await frame.evaluate(() => selectMoment('s0', true));
    await page.waitForTimeout(1500);
    const conn = await frame.evaluate(() => [...document.querySelectorAll('#dConn .connCard')].map((b) => {
      const img = b.querySelector('.connThumb img');
      return { id: b.dataset.cid, has: !!img, src: img?.getAttribute('src') || '', nw: img?.naturalWidth || 0, idx: img?.getAttribute('data-lt-cand-index') || '', cands: img?.getAttribute('data-lt-candidates') || '' };
    }).filter((c) => c.has && c.nw > 0));
    assert.ok(conn.length > 0, '이어진 순간 카드에 썸네일이 실린다(보이는 카드)');
    for (const c of conn) {
      assert.match(c.cands, /i\.ytimg\.com/, `공용 후보 목록이 붙는다(${c.id})`);
      assert.ok(c.nw > 120, `회색 120×90에 머물지 않는다(${c.id}: ${c.src})`);
    }
    assert.ok(conn.some((c) => c.src.includes('hqdefault.jpg') && Number(c.idx) >= 1), '쇼츠의 회색 그림은 다음 주소(hqdefault)로 내려간다');
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
    // #987: 날짜순 첫 줄부터 시작하므로 가장 오래된 첫 순간은 판을 그 카드로 옮긴 뒤 누른다.
    await frame.evaluate(() => focusBoardMoment(document.querySelector('#cardLayer .card').dataset.id, false));
    await page.waitForTimeout(400);
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
      // #891: 고정 줄은 주 단추 2개 + 더 보기 — 나머지(수정·지도·옮기기)는 더 보기 메뉴 안에 있다.
      actions: ['openMoment', 'cinemaFromMoment', 'detailMoreBtn'].map((id) => !!document.getElementById(id)),
      moreItems: ['editMomentBtn', 'detailMapBtn', 'detailMoveBtn'].map((id) => !!document.getElementById(id)),
      ytLink: !!document.getElementById('detailYtLink')
    }));
    assert.equal(detail.playerHasMedia, true, '플레이어가 있다');
    // #619-3: 상세 플레이어는 autoplay 를 제거했고, 누르면 재생 단추로 직접 재생한다.
    assert.equal(detail.hasAutoplay === false, true, '상세 플레이어는 autoplay 속성이 없다');
    assert.equal(detail.heartInputShown && detail.heartSaveShown, true, '마음이 비어 있으면 입력칸과 저장 단추가 보인다');
    assert.match(detail.basic, /설렘/, '감정이 보인다');
    assert.deepEqual(detail.actions, [true, true, true], '할 일 고정 줄: 크게 보기·여기부터 시네마·⋯ 더 보기(#891)');
    assert.deepEqual(detail.moreItems, [true, true, true], '더 보기 메뉴: 수정·지도에서 관계 보기·다른 트리로 옮기기');
    assert.equal(detail.ytLink, true, "'YouTube ↗' 작은 링크가 있다(#891)");
    // #952: 카드 모양(CSS 글자) 대신 화면에서 잰다 — 제목 2줄 말줄임·큰 썸네일·세로 영상 높이 상한.
    const cardStyle = await frame.evaluate(() => {
      const cards = [...document.querySelectorAll('#cardLayer .card')];
      const title = cards[0]?.querySelector('.cardTitle');
      const media = cards.map((c) => c.querySelector('.media')).find(Boolean) || null;
      return {
        clamp: title ? getComputedStyle(title).webkitLineClamp : 'none',
        mediaHeight: media ? Math.round(media.getBoundingClientRect().height) : 0,
        vertical: media ? media.querySelector('[data-lt-vertical="1"]') !== null : false
      };
    });
    assert.equal(cardStyle.clamp, '2', `카드 제목은 2줄에서 말 줄임(${cardStyle.clamp})`);
    if (cardStyle.mediaHeight) {
      const want = cardStyle.vertical ? [300] : [200];
      assert.ok(want.includes(cardStyle.mediaHeight), `썸네일 높이는 규칙대로(${cardStyle.mediaHeight}px, 세로=${cardStyle.vertical})`);
    }
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
    const tip = await frame.evaluate(() => { const b = document.getElementById('lt-tip-bubble'); const style = b && getComputedStyle(b); return b && !b.hidden ? { text: b.textContent, position: style.position, fontSize: style.fontSize } : null; });
    assert.match(tip?.text || '', /전체 보기/, '말풍선 설명이 뜬다');
    assert.equal(tip?.position, 'fixed', '보드 공통 말풍선은 화면 기준으로 뜬다');
    assert.equal(tip?.fontSize, '13px', '보드 말풍선 글자는 13px 이상이다');
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#644 화면: 보드 상세의 다른 트리로 옮기기 — 단추가 보이고 누르면 옮기기 요청이 셸에 간다(1440·390)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(6);
  const server = await serve({ '/__host-644.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const { context, page, frame, problems } = await openHost(browser, `${base}/__host-644.html`, { width, height });
      try {
        // 화면 안에 온전히 보이는 카드를 골라 상세를 연다.
        const card = await frame.evaluate(() => {
          for (const c of document.querySelectorAll('#cardLayer .card')) {
            const r = c.getBoundingClientRect();
            if (r.left >= 0 && r.right <= innerWidth && r.top >= 60 && r.bottom <= innerHeight - 60) {
              return { id: c.dataset.id, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
            }
          }
          return null;
        });
        assert.ok(card, `${width}px에서 누를 카드가 화면 안에 있다`);
        await page.mouse.click(card.x, card.y);
        await page.waitForTimeout(700);
        // #891: 옮기기 단추는 '⋯ 더 보기' 메뉴 안에 있다 — 메뉴를 열어 보이게 한 뒤 잰다.
        await frame.click('#detailMoreBtn');
        await page.waitForTimeout(250);
        // 상세의 '다른 트리로 옮기기' — 누르는 자리(44px)와 보임을 수치로 판정한다.
        const btn = await frame.evaluate(() => {
          const b = document.getElementById('detailMoveBtn');
          if (!b) return { found: false };
          b.scrollIntoViewIfNeeded?.();
          const r = b.getBoundingClientRect();
          return { found: true, text: b.textContent.trim(), hidden: !!b.hidden, h: Math.round(r.height), onScreen: r.top < innerHeight && r.bottom > 0 && r.width > 0 };
        });
        assert.equal(btn.found && !btn.hidden, true, `${width}px: 상세에 '다른 트리로 옮기기'가 있다`);
        assert.equal(btn.text, '다른 트리로 옮기기');
        assert.ok(btn.h >= 44, `${width}px: 누르는 자리 44px 이상(${btn.h}px)`);
        assert.equal(btn.onScreen, true, `${width}px: 단추가 화면에 보인다`);
        // 누르면 셸로 lt41-move(그 순간의 옮기기 요청)가 간다 — 셸이 트리 목록을 열어 옮긴다.
        await frame.click('#detailMoveBtn');
        await page.waitForTimeout(400);
        const sent = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-move').at(-1));
        assert.equal(sent?.momentId, card.id, `${width}px: 옮기기 요청이 그 순간으로 간다`);
        assert.equal(problems.length, 0, `${width}px: 화면 문제 없음 (${problems.join(' | ') || '없음'})`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); server.close(); }
});

test('#662 화면: 상세 판의 행동 단추를 실제 좌표 클릭으로 누른다 — 판 표면에 가로막히지 않는다(1440·390)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(6);
  const server = await serve({ '/__host-662.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const { context, page, frame, problems } = await openHost(browser, `${base}/__host-662.html`, { width, height });
      try {
        // 화면 안에 온전히 보이는 카드를 골라 상세를 연다(실제 마우스 클릭).
        const card = await frame.evaluate(() => {
          for (const c of document.querySelectorAll('#cardLayer .card')) {
            const r = c.getBoundingClientRect();
            if (r.left >= 0 && r.right <= innerWidth && r.top >= 60 && r.bottom <= innerHeight - 60) {
              return { id: c.dataset.id, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
            }
          }
          return null;
        });
        assert.ok(card, `${width}px에서 누를 카드가 화면 안에 있다`);
        await page.mouse.click(card.x, card.y);
        await page.waitForTimeout(700);
        // #891: 지도·옮기기 단추는 '⋯ 더 보기' 메뉴 안에 있다 — 메뉴를 열고 잰다.
        await frame.click('#detailMoreBtn');
        await page.waitForTimeout(250);
        // 각 행동 단추의 중심에서 elementFromPoint가 그 단추를 가리키는지 — 판 표면이 가로막으면 실패다(#601).
        const hit = await frame.evaluate(() => {
          return ['openMoment', 'cinemaFromMoment', 'detailMapBtn'].map((id) => {
            const b = document.getElementById(id);
            if (!b || b.hidden) return { id, skip: true };
            const r = b.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const top = document.elementFromPoint(x, y);
            return { id, x: Math.round(x), y: Math.round(y), onScreen: y > 0 && y < innerHeight, hit: top === b || b.contains(top) };
          });
        });
        for (const h of hit) {
          if (h.skip) continue;
          assert.equal(h.onScreen, true, `${width}px: #${h.id} 단추가 화면 안에 있다(@${h.x},${h.y})`);
          assert.equal(h.hit, true, `${width}px: #${h.id} 중심(@${h.x},${h.y})의 클릭이 단추에 온다 — 판 표면이 가로막지 않는다`);
        }
        // 실제 좌표 클릭으로 동작까지 확인한다.
        const center = (id) => frame.evaluate((i) => { const b = document.getElementById(i); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
        // 크게 보기 → 감상 창이 열린다.
        const om = await center('openMoment');
        await page.mouse.click(om.x, om.y);
        await page.waitForTimeout(500);
        assert.equal(await frame.evaluate(() => document.getElementById('viewerModal').classList.contains('open')), true, `${width}px: '크게 보기'를 실제 클릭으로 누르면 감상 창이 열린다`);
        await frame.evaluate(() => document.getElementById('viewerModal').classList.remove('open'));
        await page.waitForTimeout(200);
        // 지도에서 관계 보기 → 셸로 lt41-open-network이 간다(메뉴를 다시 연다 — 크게 보기 누름에서 닫혔다).
        await frame.click('#detailMoreBtn');
        await page.waitForTimeout(250);
        const mb = await center('detailMapBtn');
        await page.mouse.click(mb.x, mb.y);
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => window.LT41_MESSAGES.some((m) => m.type === 'lt41-open-network')), true, `${width}px: '지도에서 관계 보기'를 실제 클릭으로 누르면 셸에 요청이 간다`);
        // 여기부터 시네마 → 시네마가 켜진다(상세가 닫히므로 마지막에 누른다).
        const cm = await center('cinemaFromMoment');
        await page.mouse.click(cm.x, cm.y);
        await page.waitForTimeout(800);
        assert.equal(await frame.evaluate(() => document.getElementById('cinemaOverlay').classList.contains('active')), true, `${width}px: '여기부터 시네마'를 실제 클릭으로 누르면 시네마가 켜진다`);
        await frame.evaluate(() => document.getElementById('cinExit').click());
        await page.waitForTimeout(500);
        // 테마 꼬리표가 상세 판에 덮이지 않았는지.
        const badge = await frame.evaluate(() => {
          const b = document.getElementById('themeBadge');
          // 2026-11-16 대표 결정: 쓰기 가능한 내 보드에서는 배지를 숨긴다(hidden) — 숨겨져 있으면
          // 덮임 검사 대상이 아니고, 표시가 보이는(읽기 전용) 보드에서만 검사한다.
          if (!b || b.hidden) return { skip: true };
          const r = b.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const tag = (n) => n ? (n.id ? n.tagName + '#' + n.id : n.tagName + '.' + String(n.className).split(' ')[0]) : 'null';
          return { hit: top === b || b.contains(top), top: tag(top), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        });
        if (!badge.skip) assert.equal(badge.hit, true, `${width}px: 테마 꼬리표가 다른 요소에 덮이지 않는다 (@${badge.x},${badge.y} 위: ${badge.top})`);
        assert.equal(problems.length, 0, `${width}px: 화면 문제 없음 (${problems.join(' | ') || '없음'})`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); server.close(); }
});

// #1058: 보내기가 던지면 조용히 넘기지 않고 보드 알림 줄에 실패를 알린다(소스 글자 검사 없음).
test('#1058 보드 저장 보내기 실패 — 보드 알림 줄에 실패 문구가 보인다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(skip);
  const server = await serve({ '/host1058.html': hostHTML(starTree(4)) });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const { context, page, frame, problems } = await openHost(browser, `${origin}/host1058.html`, { width, height });
      try {
        await frame.evaluate(() => {
          window.toast('순간을 선택해 연결된 기록을 살펴보세요.');
          window.__origPost = window.parent.postMessage;
          window.parent.postMessage = () => { throw new Error('보내기 실패'); };
        });
        await frame.evaluate(() => window.persistBoard());
        await frame.waitForTimeout(450);
        const notice = await frame.evaluate(() => {
          const el = document.getElementById('saveFail');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const top = document.elementFromPoint(cx, cy);
          const cs = getComputedStyle(el);
          const lum = (c) => { const m = c.match(/[\d.]+/g) || []; const [r0,g0,b0] = m.map(Number); return 0.2126*r0 + 0.7152*g0 + 0.0722*b0; };
          const bgL = lum(cs.backgroundColor), fgL = lum(cs.color);
          const ratio = (Math.max(bgL,fgL) + 0.05) / (Math.min(bgL,fgL) + 0.05);
          return { text: el.textContent.trim(), show: el.classList.contains('show'),
            rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) },
            viewportH: innerHeight, viewportW: innerWidth,
            topIsSelf: top === el || (top && el.contains(top)),
            topTag: top ? top.tagName + '.' + top.className : '',
            bg: cs.backgroundColor, color: cs.color, contrast: Math.round(ratio*100)/100,
            opacity: Number(cs.opacity), pointerEvents: cs.pointerEvents, zIndex: cs.zIndex
          };
        });
        const sent = await page.evaluate(() => (window.LT41_MESSAGES || []).filter((m) => m.type === 'lt41-board-sync').length);
        console.log('#1058', width, JSON.stringify({ notice, sent }));
        assert.ok(notice, `${width}: 실패 알림 요소가 있다`);
        assert.equal(notice.show, true, `${width}: 보드 알림 줄이 떴다`);
    assert.ok(/저장에 실패/.test(notice.text), `${width}: 실패 문구가 보인다 — ${notice.text}`);
        assert.equal(notice.opacity, 1, `${width}: 알림이 불투명하다(opacity ${notice.opacity})`);
        assert.ok(notice.rect.bottom <= notice.viewportH && notice.rect.top >= 0, `${width}: 알림이 화면 안에 있다(${notice.rect.top}..${notice.rect.bottom} / ${notice.viewportH})`);
        assert.ok(notice.contrast >= 4.5, `${width}: 글자 대비 4.5:1 이상(${notice.contrast}:1, bg=${notice.bg}, fg=${notice.color})`);
        assert.equal(notice.topIsSelf, true, `${width}: 알림 가운데가 가장 위 층에 있다(top=${notice.topTag})`);
        // 5초 이상 보인다 — 0.5초 후에도 그대로인지 확인한다(전체 지속은 6000ms).
        await frame.waitForTimeout(500);
        assert.equal(await frame.evaluate(() => document.getElementById('saveFail')?.classList.contains('show')), true, `${width}: 0.5초 뒤에도 보인다(최소 5초)`);
        assert.equal(sent, 0, `${width}: 보내지 못했으므로 동기화 메시지 없음`);
        assert.deepEqual(problems, [], `${width}: 던진 예외가 밖으로 새지 않았다`);
        // #1058 후속: 실패 알림이 떠 있는 동안 안내를 숨겨 보이는 겹침 넓이가 0이어야 한다.
        const guide = await frame.evaluate(() => {
          const a = document.getElementById('saveFail'), b = document.getElementById('toast');
          const visibleRect = (el) => {
            if (!el) return null;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
            const r = el.getBoundingClientRect();
            return { l: r.left, r: r.right, t: r.top, b: r.bottom };
          };
          const ra = visibleRect(a), rb = visibleRect(b);
          const overlap = ra && rb ? Math.max(0, Math.min(ra.r, rb.r) - Math.max(ra.l, rb.l)) * Math.max(0, Math.min(ra.b, rb.b) - Math.max(ra.t, rb.t)) : 0;
          return { overlap, guideShown: b ? b.classList.contains('show') : false };
        });
        console.log('#1058 guide', width, JSON.stringify(guide));
        assert.equal(guide.guideShown, false, `${width}: 실패 알림이 떠 있는 동안 안내를 숨긴다`);
        assert.equal(guide.overlap, 0, `${width}: 실패 알림과 안내의 보이는 겹침 넓이 0`);
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
