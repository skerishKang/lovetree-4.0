import { listenOnSafePort } from './helpers/safe-port.mjs';
// #601 관계 지도 다듬기 — 실행형 시험.
// ① 새 순간 기본 연결(가 결정): 이전 순간을 고르지 않으면 첫 순간이 아니라 가장 최근 순간 다음에 잇는다.
// ② 점 이름표: 자동 제목('youtube.com에서 간직한 순간')이 제목 자리를 차지하지 않고, 썸네일이 붙는다.
// ③ 왼쪽 판 통일(#951 ⑥ 갱신): 두 보기에서 묶음 판+아래 단추 줄이 같이 보이고, 큰 탐색 판은 숨는다.
// ④ 순간 묶음: 데이터에 맞는 묶음(부채꼴 나무는 감정별, 사슬은 월별; 빈 묶음 없음, 한 묶음이면 판을 숨김).
// ⑤ '이어진 선 N개': 지도에 실제 그린 연결 선 수(양 끝이 있는 연결)와 같다.
// 크롬이 없는 곳에서는 브라우저 몫을 건너뛰고, LT_MAP_RELATIONS_REQUIRE=1에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flat26, chain10, mixed3x4, lt41Stub } from './helpers/map-shapes.mjs';

globalThis.window = globalThis;
await import('../public/v41/views/network/network-model.js');
const M = globalThis.LT56Model;

const ROOT = path.resolve(process.env.LT_MAP_RELATIONS_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_MAP_RELATIONS_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 지도 관계 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 지도 관계 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
async function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
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
  await listenOnSafePort(server, '127.0.0.1');
  return server;
}
// 지도 한 장을 셸 없이 직접 연다(셸이 LT41로 넘기는 문맥을 같은 모양으로 심는다).
async function openMap(base, { width, stub }) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 852 : 900 }, reducedMotion: 'reduce', locale: 'ko-KR' });
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('lt41.theme', 'night'); localStorage.setItem('lt41.boardTheme', 'night'); } catch {}
    window.LT41 = s;
  }, stub);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto(`${base}/v41/views/track56-network.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lt?.dots?.().length > 0, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { ctx, page, errors, browser };
}

// ── ① 기본 연결(가 결정): 도메인 두 벌(서버·클라이언트)이 같은 규칙 ──
test('① quickAdd는 가장 최근 순간 다음에 잇는다(두 벌의 도메인, 서버 포함)', async () => {
  const server = await import('../src/domain.js');
  const web = await import('../public/v41/domain.mjs');
  for (const d of [server, web]) {
    // 순간 3개: a(11-09) ← b(11-11) ← c(11-10) — 만든 순서와 날짜가 다르다.
    const mk = (id, parentId, date, createdAt) => ({ id, parentId, links: [], title: id, note: '', emotion: '설렘', date, relation: '', url: '', createdAt });
    const t = { id: 't1', subject: '윤슬', title: '윤슬, 나의 순간들', coverMomentId: '', coverDesign: '', inbox: true, createdAt: '2026-11-09T09:00:00.000Z', updatedAt: '2026-11-11T09:00:00.000Z', moments: [mk('ma', null, '2026-11-09', '2026-11-09T09:00:00.000Z'), mk('mb', 'ma', '2026-11-11', '2026-11-10T09:00:00.000Z'), mk('mc', 'mb', '2026-11-10', '2026-11-11T09:00:00.000Z')] };
    const state = { version: 1, trees: [t] };
    const r = d.quickAdd(state, { url: 'https://example.com/new' }, '2026-11-12T09:00:00.000Z');
    const added = r.state.trees[0].moments.find(m => m.id === r.momentId);
    assert.equal(added.parentId, 'mb', '날짜가 가장 늦은 b(11-11) 다음에 잇는다 — 첫 순간 a가 아니다');
    assert.doesNotThrow(() => d.validateState(r.state));
    // 이미 저장된 연결은 그대로다(데이터 이주 없음).
    assert.equal(r.state.trees[0].moments.find(m => m.id === 'mc').parentId, 'mb', '기존 연결 유지');
  }
});

// ── ④ 묶음 나누기(모델) ──
test('④ pickGroups: 부채꼴 나무는 감정별, 사슬 나무는 월별 — 빈 묶음 없음, 6벌을 넘지 않음', () => {
  // 부채꼴(평평한 나무, 대표 트리 모양): 감정별.
  const flat = flat26();
  const fan = M.pickGroups(flat.moments, flat.edges);
  assert.ok(fan.length >= 2 && fan.length <= 6, `부채꼴 묶음 개수: ${fan.length}`);
  assert.ok(fan.every(g => g.ids.length > 0), '부채꼴: 빈 묶음 없음');
  assert.ok(fan.some(g => g.name === '설렘'), '부채꼴: 감정 이름');
  // 사슬(깊은 나무): 월별 — 감정이 사슬을 따라 섞여 감정별로는 흩어진다.
  const chain = chain10();
  const month = M.pickGroups(chain.moments, chain.edges);
  assert.ok(month.length >= 1 && month.length <= 6, `사슬 묶음 개수: ${month.length}`);
  assert.ok(month.every(g => g.ids.length > 0), '사슬: 빈 묶음 없음');
  assert.match(month[0].name, /^\d{4}년/, `사슬: 월 이름(${month[0].name})`);
  for (const groups of [fan, month]) {
    const seen = [];
    for (const g of groups) {
      assert.ok(!seen.includes(g.name), '묶음 이름 겹침 없음');
      seen.push(g.name);
      for (const id of g.ids) assert.ok(chain.moments.some(m => m.id === id) || flat.moments.some(m => m.id === id), '묶음의 순간이 트리에 있다');
    }
  }
  assert.equal(fan.flatMap(g => g.ids).length, flat.moments.length, '부채꼴: 모든 순간이 한 묶음에');
  assert.equal(month.flatMap(g => g.ids).length, chain.moments.length, '사슬: 모든 순간이 한 묶음에');
  // 감정이 하나뿐인 부채꼴 나무: 묶음도 하나 — 화면은 이때 판을 숨긴다(아래 브라우저 몫).
  const one = M.pickGroups(flat.moments.map(m => ({ ...m, emotion: '설렘' })), flat.edges);
  assert.equal(one.length, 1);
  assert.equal(one[0].name, '설렘');
});

// ── ② 이름표 제목(모델) ──
test('② labelTitle: 자동 제목은 제목이 아니므로 영상 제목·마음 한마디를 먼저 쓴다', () => {
  assert.equal(M.labelTitle({ title: 'youtube.com에서 간직한 순간', mediaMetadata: { title: '밤새 다시 본 직캠' } }), '밤새 다시 본 직캠');
  assert.equal(M.labelTitle({ title: 'youtube.com에서 간직한 순간', note: '이 장면이 계속 생각난다' }), '이 장면이 계속 생각난다');
  assert.equal(M.labelTitle({ title: 'youtube.com에서 간직한 순간' }), 'youtube.com', '정말 없을 때만 사이트 이름(짧게)');
  assert.equal(M.labelTitle({ title: '내가 쓴 제목' }), '내가 쓴 제목', '직접 쓴 제목은 그대로');
  assert.equal(M.labelTitle({ title: 'youtu.be에서 간직한 순간' }), 'youtu.be');
});

// ── ④ 배치: 감정 묶음으로 그물 배치 ──
test('④ networkLayout(groups): 묶음별 허브와 점 — 유한한 좌표, 묶음 크기는 가장 큰 묶음', () => {
  const shape = mixed3x4();
  const groups = M.emotionGroups(shape.moments);
  const out = M.networkLayout(shape.moments.map((m, i) => ({ id: m.id, first: i === 0 })), { box: { x: 0, y: 0, w: 1200, h: 800 }, dotR: 5, firstR: 20, gap: 8, hubR: 9, groups: groups.map(g => g.ids) });
  assert.equal(out.hubs.length, groups.length, '묶음마다 허브 하나');
  for (const p of Object.values(out.points)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  assert.equal(out.groupSize, Math.max(...groups.map(g => g.ids.length)));
});

// ── 브라우저 몫 ──
test('②③④ 지도 화면: 이름표·썸네일·묶음 판·두 보기 판 일치', { skip: skip && !REQUIRE ? skip : false }, async () => {
  if (skip) throw new Error(skip);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // chain10: 그물 배치가 나오는 깊은 사슬. 첫 순간에 자동 제목·썸네일을 심어 본다.
    const shape = chain10();
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    shape.demo[0].title = 'youtube.com에서 간직한 순간';
    shape.demo[0].mediaMetadata = { title: '밤새 다시 본 직캠' };
    shape.demo[0].image = PNG;
    const { ctx, page, errors, browser } = await openMap(base, { width: 1440, stub: lt41Stub(shape, 'm01') });
    try {
      assert.deepEqual(errors, [], '지도 화면 오류 없음');
      // ② 이름표: 자동 제목 대신 영상 제목이 보인다('youtub…' 버그).
      const first = await page.evaluate(() => window.__lt.labels().find(l => l.id === 'm01') || null);
      assert.ok(first, '첫 순간 이름표');
      assert.ok(first.text.includes('밤새 다시 본 직캠'), `자동 제목 대신 영상 제목: ${first.text}`);
      assert.ok(!/에서 간직한 순간/.test(first.text), '자동 제목 문구가 이름표에 없다');
      // ② 썸네일(#951 ③: 이름표 앞 → 점 자리 원형): 그림이 읽히면 그 순간 점 자리에 작은 원으로 온다.
      await page.waitForFunction(() => (window.__lt.thumbRects?.() || []).length > 0, null, { timeout: 8000 });
      const thumb = await page.evaluate(() => {
        const d = window.__lt.dots().find(x => x.id === 'm01'), r = (window.__lt.thumbRects() || [])[0];
        return r && d ? { dx: Math.round(Math.hypot(r.x + r.w / 2 - d.x, r.y + r.h / 2 - d.y)), d: Math.round(r.w) } : null;
      });
      assert.ok(thumb && thumb.dx <= 2, `그림이 점 자리 가운데에 있다(${JSON.stringify(thumb)})`);
      // ④ 묶음 판: 감정별 행 — 이름·개수가 있고 빈 행이 없다.
      const rows = await page.evaluate(() => [...document.querySelectorAll('.legend-row')].filter(r => !r.hidden).map(r => r.textContent.trim()));
      assert.ok(rows.length >= 2 && rows.length <= 6, `묶음 행 개수: ${rows.length}`);
      assert.ok(rows.every(t => /·\s*\d+개$/.test(t) && !/·\s*0개/.test(t)), `빈 행·이름 없는 행 없음: ${rows.join(' / ')}`);
      // ③ 세 보기에서 묶음 판+아래 단추 줄이 같이 보인다(#951 ⑥: 큰 탐색 판은 숨고 단추 줄이 그 자리를 맡는다).
      for (const view of ['network', 'tag', 'time']) {
        await page.evaluate(v => { document.body.dataset.ltView = v; }, view);
        const vis = await page.evaluate(() => {
          const show = s => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().width > 1; };
          const ribBtns = [...document.querySelectorAll('#mobileRibbon button')].map(b => b.textContent.trim());
          return { legend: show('.legend'), ribbon: show('.mobile-ribbon'), controls: show('.controls'), minus: !!document.querySelector('#mobileRibbon button[aria-label="지도 축소(−)"]'), plus: !!document.querySelector('#mobileRibbon button[aria-label="지도 확대(＋)"]'), reset: ribBtns[ribBtns.length - 1] };
        });
        if (view === 'time') assert.ok(!vis.legend && vis.ribbon && !vis.controls, `${view}: 시간 순은 범례 없이 단추 줄이 보인다`);
        else assert.ok(vis.legend && vis.ribbon && !vis.controls, `${view}: 묶음 판과 단추 줄이 같이 보이고 큰 탐색 판은 숨는다`);
        assert.ok(vis.minus && vis.plus, `${view}: [−][＋] 단추`);
        const rows = await page.evaluate(() => [...document.querySelectorAll('#mobileRibbon button')].map(b => b.textContent.trim()));
        assert.equal(vis.reset, '전체 맞춤', `${view}: 마지막 단추 문구(390과 같은 줄) — 실제 렌더링값 ${JSON.stringify(rows)}`);
      }
    } finally { await ctx.close(); await browser.close(); }

    // ④ 감정이 하나뿐인 부채꼴 나무: 묶음 1개 → 범례 숨김(#951 ⑥ — 단추 줄이 같은 정보를 맡는다).
    {
      const one = flat26();
      one.demo = one.demo.map(m => ({ ...m, emotion: '설렘' }));
      one.moments = one.moments.map(m => ({ ...m, emotion: '설렘' }));
      const { ctx, page, browser } = await openMap(base, { width: 1440, stub: lt41Stub(one, 'm01') });
      try {
        const m = await page.evaluate(() => ({ hidden: document.querySelector('.legend').hidden, rows: [...document.querySelectorAll('.legend-row')].filter(r => getComputedStyle(r).display !== 'none').length, ribbon: getComputedStyle(document.querySelector('.mobile-ribbon')).display !== 'none' }));
        assert.ok(m.hidden && m.rows === 0, '묶음이 한 가지면 범례는 숨는다');
        assert.ok(m.ribbon, '범례가 숨아도 아래 단추 줄은 보인다');
      } finally { await ctx.close(); await browser.close(); }
    }
    // ④ 감정이 두 가지인 부채꼴 나무: 묶음 2개 → 범례가 이름·개수로 보인다(보이는 쪽도 데이터로 확인).
    {
      const two = flat26();
      const emo = (m, i) => ({ ...m, emotion: i % 2 ? '몰입' : '설렘' });
      two.demo = two.demo.map(emo);
      two.moments = two.moments.map(emo);
      const { ctx, page, browser } = await openMap(base, { width: 1440, stub: lt41Stub(two, 'm01') });
      try {
        const rows = await page.evaluate(() => [...document.querySelectorAll('.legend-row')].filter(r => getComputedStyle(r).display !== 'none').map(r => ({ text: r.textContent.trim(), dot: !!r.querySelector('.swatch') })));
        assert.equal(rows.length, 2, '묶음이 두 가지면 범례에 2줄이 보인다');
        assert.ok(rows.every(r => r.text && r.dot), '묶음 행은 색 점과 이름이 든다');
        assert.ok(rows.some(r => r.text.includes('설렘')) && rows.some(r => r.text.includes('몰입')), `감정 이름(${rows.map(r => r.text).join(' / ')})`);
      } finally { await ctx.close(); await browser.close(); }
    }
  } finally { server.close(); }
});

// ── ⑤ '이어진 선 N개' = 지도에 그린 연결 선 수(셸을 통해 지도를 연다 — 버튼은 셸이 심는다) ──
test('⑤ 이어진 선 약속 숫자는 그려진 연결 수와 같다', { skip: skip && !REQUIRE ? skip : false }, async () => {
  if (skip) throw new Error(skip);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', locale: 'ko-KR' });
    const page = await context.newPage();
    await page.goto(`${base}/v41/#network`, { waitUntil: 'load' });
    let frame = null;
    for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find(f => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
    assert.ok(frame, '지도 프레임이 열린다');
    await frame.waitForFunction(() => /\d+/.test(document.getElementById('connection-tool')?.textContent || ''), null, { timeout: 20000 });
    const pill = await frame.evaluate(() => document.getElementById('connection-tool').textContent.trim());
    const drawn = await page.evaluate(() => window.LT41.tree.edges.length);
    assert.match(pill, /이어진 선 \d+개/);
    // #951 ①: 이 글자는 이제 '순간 N · 이어진 선 M개'다 — 연결 수는 '이어진 선' 뒤 숫자만 읽는다.
    const shown = Number(/이어진 선 (\d+)개/.exec(pill)?.[1]);
    assert.equal(shown, drawn, `약속 숫자(${pill}) = 그려진 연결 ${drawn}개`);
    await context.close(); await browser.close();
  } finally { server.close(); }
});

// #1001 (3): 지도의 같은 트리 안 순간 변경(고치기·삭제·연결)은 모델만 갱신하고 화면을 다시 띄우지 않는다 —
// lt41-moments-saved 알림을 받아 지도가 점·선·묶음을 결정적 배치로 같은 자리에 다시 그리고, 고른 순간·보기·
// 배율·열린 상세 판을 그대로 둔다(보드 boardSync·#997 editTree와 같은 방식). 재적재 0.
test('1001b 실행: 지도 순간 변경(고치기·연결·삭제) — 재적재 0·선택/보기/배율/상세 보존', { skip: skip || !REQUIRE ? skip || 'LT_MAP_RELATIONS_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const { createTree: makeTree, addMoment: growTree, linkMoments: linkTree } = await import('../public/v41/domain.mjs');
  const { serve: serveApp } = await import('./helpers/screen-audit.mjs');
  const { waitForShownScreen: waitShown } = await import('./helpers/visible-frame.mjs');
  let tree = makeTree({ subject: '시험', title: '지도 트리', note: '', emotion: '설렘', date: '2026-11-01', url: '' }, '2026-11-01T00:00:00Z');
  const root = tree.moments[0].id;
  tree = growTree(tree, { title: '둘 순간', note: '둘 마음', emotion: '몰입', date: '2026-11-02', url: '' }, root, '2026-11-02T00:00:00Z');
  const m2 = tree.moments.at(-1).id;
  tree = growTree(tree, { title: '셋 순간', note: '셋 마음', emotion: '그리움', date: '2026-11-03', url: '' }, root, '2026-11-03T00:00:00Z');
  const m3 = tree.moments.at(-1).id;
  tree = growTree(tree, { title: '넷 순간', note: '넷 마음', emotion: '벅참', date: '2026-11-04', url: '' }, m2, '2026-11-04T00:00:00Z');
  const m4 = tree.moments.at(-1).id;
  tree = linkTree(tree, m2, m3);
  const server = await serveApp();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    let rev = 1, stored = JSON.parse(JSON.stringify(tree));
    const puts = [];
    await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', r => {
      const req = r.request();
      if (req.method() === 'PUT') { const body = JSON.parse(req.postData() || '{}'); puts.push(1); const ed = body?.state?.trees?.find(t => t.id === tree.id); if (ed) stored = ed; rev += 1; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: rev, subject: '시험계정' }) }); }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: rev, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z', state: { version: 1, trees: [stored], prefs: {} } }) });
    });
    const page = await ctx.newPage();
    const navs = []; let counting = false;
    page.on('framenavigated', f => { if (counting && /\/v41\/(views\/|home\.html)/.test(f.url())) navs.push(f.url()); });
    page.on('dialog', d => d.accept());
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.locator('.tree-views [data-view="track56-network.html"]').click();
    await waitShown(page, { path: 'track56-network' }, 8000);
    await page.waitForTimeout(1200);
    const frame = page.frames().find(f => /views\/track56-network/.test(f.url()));
    assert.ok(frame, '지도 프레임이 열린다');
    await frame.evaluate(() => { window.__doc1001b = 'alive'; window.__msg1001b = 0; addEventListener('message', e => { if (e.data?.type === 'lt41-moments-saved') window.__msg1001b += 1; }); });
    await frame.evaluate(id => { const n = window.__lt.nodes.find(n => n.id === id); window.__lt.selectMoment(n, true); }, m3);
    await page.waitForTimeout(500);
    const before = await frame.evaluate(() => ({ sel: window.__lt.state.selected?.id, view: window.__lt.state.view, scale: window.__lt.state.scale, nodes: window.__lt.nodes.length, detailOpen: document.querySelector('#detail').classList.contains('open'), detailTitle: document.querySelector('#detailTitle').textContent }));
    assert.equal(before.sel, m3, '셋 순간이 선택된다');
    assert.ok(before.detailOpen, '상세 판이 열린다');
    const openEditor = async (id) => { await frame.evaluate(x => parent.postMessage({ type: 'lt41-write', mode: 'edit', momentId: x }, location.origin), id); await page.waitForFunction(() => document.querySelector('#write-panel')?.open === true, null, { timeout: 8000 }); await page.waitForTimeout(200); };
    const waitPut = async (n) => { const dl = Date.now() + 10000; while (Date.now() < dl && puts.length < n) await page.waitForTimeout(150); };
    counting = true;
    // ① 고치기: 제목 변경 — 선택·보기·배율·상세 판이 그대로이고 상세 제목만 새 값으로 다시 그려진다.
    await openEditor(m3);
    await page.evaluate(() => { const f = document.querySelector('#moment-form'); f.elements.title.value = '지도 고친 제목'; f.elements.title.dispatchEvent(new Event('input', { bubbles: true })); f.requestSubmit(); });
    await waitPut(1); await page.waitForTimeout(1800);
    const afterEdit = await frame.evaluate(() => ({ doc: window.__doc1001b, msg: window.__msg1001b, sel: window.__lt.state.selected?.id, view: window.__lt.state.view, scale: window.__lt.state.scale, nodes: window.__lt.nodes.length, detailOpen: document.querySelector('#detail').classList.contains('open'), detailTitle: document.querySelector('#detailTitle').textContent }));
    assert.equal(afterEdit.doc, 'alive', '고치기 뒤에도 같은 문서다(재적재 없음)');
    assert.ok(afterEdit.msg >= 1, 'lt41-moments-saved 알림이 지도에 도착한다');
    assert.equal(afterEdit.sel, m3, '고른 순간이 그대로다');
    assert.equal(afterEdit.view, before.view, '보기(그물/동심원)가 그대로다');
    assert.ok(Math.abs(afterEdit.scale - before.scale) < 0.01, '배율이 그대로다');
    assert.equal(afterEdit.nodes, before.nodes, '점 개수가 그대로다');
    assert.ok(afterEdit.detailOpen, '열린 상세 판이 그대로다');
    assert.equal(afterEdit.detailTitle, '지도 고친 제목', '상세 판 제목이 새 값으로 다시 그려진다');
    // ② 연결: 재적재 0.
    await openEditor(m3); await page.evaluate(id => { const s = document.querySelector('#related-target'); s.value = id; s.dispatchEvent(new Event('change', {bubbles: true})); document.querySelector('#moment-form').requestSubmit(); }, m4); await waitPut(2); await page.waitForTimeout(1500);
    const afterLink = await frame.evaluate(() => ({ doc: window.__doc1001b, sel: window.__lt.state.selected?.id, msg: window.__msg1001b }));
    assert.equal(afterLink.doc, 'alive', '연결 뒤에도 같은 문서다');
    assert.equal(afterLink.sel, m3, '연결 뒤에도 고른 순간이 그대로다');
    // ③ 삭제: 점이 사라지고 재적재 0.
    await openEditor(m3); await page.click('#delete-moment'); await waitPut(3); await page.waitForTimeout(1800);
    const afterDelete = await frame.evaluate(() => ({ doc: window.__doc1001b, nodes: window.__lt.nodes.length }));
    assert.equal(afterDelete.doc, 'alive', '삭제 뒤에도 같은 문서다');
    assert.equal(afterDelete.nodes, before.nodes - 1, '점이 하나 줄어든다');
    assert.equal(navs.length, 0, `저장 흐름에서 화면 파일 항해는 0회여야 한다(실측 ${navs.length}: ${JSON.stringify(navs)})`);
    await ctx.close();
  } finally { await browser.close(); server.close(); }
});
