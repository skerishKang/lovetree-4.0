// #601 관계 지도 다듬기 — 실행형 시험.
// ① 새 순간 기본 연결(가 결정): 이전 순간을 고르지 않으면 첫 순간이 아니라 가장 최근 순간 다음에 잇는다.
// ② 점 이름표: 자동 제목('youtube.com에서 간직한 순간')이 제목 자리를 차지하지 않고, 썸네일이 붙는다.
// ③ 왼쪽 판 통일: 그물형·동심원형 두 보기에서 묶음 판+탐색 판이 같은 자리에 같이 보인다.
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
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
      // ② 썸네일: 그림이 읽히면 이름표 앞에 붙는다(이름표 넓이에 반영).
      await page.waitForFunction(() => window.__lt.labels().find(l => l.id === 'm01')?.tw > 0, null, { timeout: 8000 });
      // ④ 묶음 판: 감정별 행 — 이름·개수가 있고 빈 행이 없다.
      const rows = await page.evaluate(() => [...document.querySelectorAll('.legend-row')].filter(r => !r.hidden).map(r => r.textContent.trim()));
      assert.ok(rows.length >= 2 && rows.length <= 6, `묶음 행 개수: ${rows.length}`);
      assert.ok(rows.every(t => /·\s*\d+개$/.test(t) && !/·\s*0개/.test(t)), `빈 행·이름 없는 행 없음: ${rows.join(' / ')}`);
      // ③ 두 보기에서 왼쪽 판(묶음+탐색)이 같은 자리에 보인다.
      for (const view of ['network', 'concentric']) {
        await page.evaluate(v => { document.body.dataset.ltView = v; }, view);
        const vis = await page.evaluate(() => {
          const show = s => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().width > 1; };
          return { legend: show('.legend'), controls: show('.controls'), minus: !!document.querySelector('#zoomOut'), plus: !!document.querySelector('#zoomIn'), reset: document.querySelector('#resetFocus')?.textContent?.trim() };
        });
        assert.ok(vis.legend && vis.controls, `${view}: 묶음 판과 탐색 판이 같이 보인다`);
        assert.ok(vis.minus && vis.plus, `${view}: [−][＋] 단추`);
        assert.equal(vis.reset, '전체 보기', `${view}: 전체 보기 단추 문구`);
      }
    } finally { await ctx.close(); await browser.close(); }

    // ④ 감정이 하나뿐인 부채꼴 나무는 묶음 판을 숨긴다(빈 묶음 대신).
    {
      const one = flat26();
      one.demo = one.demo.map(m => ({ ...m, emotion: '설렘' }));
      one.moments = one.moments.map(m => ({ ...m, emotion: '설렘' }));
      const { ctx, page, browser } = await openMap(base, { width: 1440, stub: lt41Stub(one, 'm01') });
      try {
        const hidden = await page.evaluate(() => document.querySelector('.legend')?.hidden === true);
        assert.ok(hidden, '묶음이 한 가지면 묶음 판을 숨긴다');
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
    assert.equal(Number(pill.replace(/\D/g, '')), drawn, `약속 숫자(${pill}) = 그려진 연결 ${drawn}개`);
    await context.close(); await browser.close();
  } finally { server.close(); }
});
