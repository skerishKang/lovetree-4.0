// 이슈 1010(2026-11-20): 첫 화면 기존 사용자 — 예시 안내 줄·예시 카드 누름·숫자 줄 띄어쓰기·390 바닥 링크를
// 그려진 첫 화면에서 잰다(소스 글자 검사 없음 — 동작 검사만).
// - 안내 줄: 떠다니는 예시 카드가 보일 때만 보인다(390처럼 카드가 숨으면 숨김). 기존 사용자 문구에서 '금테'를 뺀다.
//   신규 사용자(로그아웃 예시)의 안내 줄은 이번에 바꾸지 않는다(#635 PR C의 글자를 그대로 쓴다).
// - 예시 카드 누름: onOpen이 데모 표본을 openMine으로 흘려 보내 조용히 무시됐다(#1009 실측) —
//   이제 궤도의 자세히 보기 창(감상 예시)이 열리고, 창의 '책 읽기'는 기존 lt41-example 경로로 예시 기억책을 연다.
// - 숫자 줄: '순간 3 ·모아둔 0' → 줄을 블록으로 바꾸고 글자 사이 공백(' · ')이 실제로 그려지게 한다(#994 묶음 구조 그대로).
// - 390 바닥 링크: 새 소식·의견 보내기·개인정보 처리방침·이용약관 넷 모두, 줄바꿈으로 왼쪽 아래에.
//   새 소식 카드는 ＋ 단추 위 8px 자리(#657 계약) 그대로 — 링크 두 줄은 카드 아래 자리(높이 66px 안)에 들어간다.
//   오른쪽 아래 ＋ 단추(#458)와 겹치지 않고, ＋ 단추는 그대로 둔다.
// - 이슈 1018: 떠다니는 예시 카드는 셸 바닥 링크 줄·새 소식 카드 자리(묶음 상자+여유 12px)를 지나가지 않는다.
//   1440·1920 × 밤·정원, 움직임 켬, 3초×0.5초 간격 교차 0(보이는 카드만). 카드를 자리 침범 위상에 놓고 재서 빈손 통과를 막는다.
// LT_HOME_1010_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE1010 = process.env.LT_HOME_1010_REQUIRE === '1';
let chromium1010 = null;
let skip1010 = false;
try {
  ({ chromium: chromium1010 } = await import('playwright'));
  if (!existsSync(chromium1010.executablePath())) skip1010 = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip1010 = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE1010 && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip1010 = '빌드 결과가 없어 실행 시험을 건너뜀';

const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

// mix-empty 기존 사용자 표본 — 사진·영상 순간 0장(전부 글 순간)이라 첫 화면 카드는 예시만 나온다(homeCardsPlan mix 규칙).
function tree1010({ subject, count, inbox = false }) {
  const input = i => ({ subject, title: '글 순간 ' + (i + 1), date: '2026-11-' + String(i + 1).padStart(2, '0'), emotion: '설렘', note: '화면 확인용 가짜 기록 — 사진·영상 없는 순간' });
  const clock = i => '2026-11-' + String(i + 1).padStart(2, '0') + 'T00:00:00.000Z';
  let t = createTree(input(0), clock(0));
  for (let i = 1; i < count; i++) t = addMoment(t, input(i), t.moments[0].id, clock(i));
  if (inbox) t = { ...t, inbox: true };
  return t;
}

// mix 기존 사용자 표본 — YouTube 순간 4장(#340 판정으로 썸네일 카드)이라 내 카드가 궤도에 나온다.
function treeMix1010({ subject, count }) {
  const input = i => ({ subject, title: '사진 순간 ' + (i + 1), date: '2026-11-' + String(i + 1).padStart(2, '0'), emotion: '설렘', note: '화면 확인용 가짜 기록', url: i % 2 === 0 ? 'https://www.youtube.com/watch?v=abc123DEF4' + i : '' });
  const clock = i => '2026-11-' + String(i + 1).padStart(2, '0') + 'T00:00:00.000Z';
  let t = createTree(input(0), clock(0));
  for (let i = 1; i < count; i++) t = addMoment(t, input(i), t.moments[0].id, clock(i));
  return t;
}

async function boot1010(browser, { width = 1440, member = true, mix = false, theme = '', motion = false } = {}) {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 1920 ? 1080 : 900 }, reducedMotion: motion ? 'no-preference' : 'reduce' });
  // 셸 문서가 받는 메시지를 기록한다 — 예시 카드 누름이 lt41-example로 이어지는지 잰다.
  await ctx.addInitScript(t => {
    window.__lt1010msgs = [];
    addEventListener('message', e => { try { window.__lt1010msgs.push(e.data); } catch {} });
    if (t) { try { localStorage.setItem('lt41.theme', t); } catch {} }
  }, theme);
  const trees = mix
    ? [treeMix1010({ subject: '좋아하는 순간들', count: 8 }), tree1010({ subject: '모아두는 곳', count: 2, inbox: true })]
    : [tree1010({ subject: '좋아하는 순간들', count: 5 }), tree1010({ subject: '모아두는 곳', count: 2, inbox: true })];
  const workspace = { revision: 1, state: { version: 1, trees, prefs: { displayName: '화면검사 시험계정' } }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z' };
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return u.hostname === 'i.ytimg.com' ? THUMB(route) : route.abort();
    if (u.pathname === '/api/workspace' && member) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) });
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    return route.continue();
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/v41/${member ? '?account=1' : ''}#home`, { waitUntil: 'load' });
  if (member) {
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    const ask = page.locator('#discover-ask-no');
    await ask.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    if (await ask.isVisible()) await ask.click();
  }
  await page.frameLocator('#view').locator('.center .actions').waitFor({ state: 'visible', timeout: 15000 });
  // 셸은 두 장(#view·#view-next)을 교대한다(#428) — 숨은 장이 about:blank로 비워질 때까지 기다린 뒤 보이는 장을 고른다.
  await page.waitForFunction(() => {
    const f = document.getElementById('view-next');
    try { return !f || f.contentWindow.location.href === 'about:blank'; } catch { return false; }
  }, null, { timeout: 15000 }).catch(() => {});
  const handle = await page.evaluateHandle(() => document.getElementById('view'));
  const frame = await handle.asElement().contentFrame();
  assert.ok(frame, '첫 화면 프레임을 찾았다: ' + page.frames().map(f => f.url()).join(' | '));
  return { server, ctx, page, frame, base };
}

async function close1010({ server, ctx }) {
  await ctx.close();
  await new Promise(r => server.close(r));
}

const noteState = (frame) => frame.locator('.center-note').evaluate(el => ({
  text: el.textContent,
  hidden: getComputedStyle(el).display === 'none',
  dataOff: el.hasAttribute('data-off'),
  hint: el.querySelector('.center-hint')?.textContent || ''
}));

test('#1010 기존 사용자(예시만 궤도) 안내 줄 — 금테를 빼고 떠다니는 카드를 가리킨다(1440, 카드가 보일 때)', { skip: REQUIRE1010 ? false : skip1010, timeout: 180000 }, async () => {
  if (skip1010) assert.fail(skip1010);
  const browser = await chromium1010.launch({ headless: true });
  try {
    const h = await boot1010(browser, { width: 1440 });
    try {
      const note = await noteState(h.frame);
      assert.ok(!note.hidden, '카드가 보이는 화면에서는 안내 줄도 보인다');
      assert.match(note.text, /뒤에 떠다니는 카드는 감상 예시예요/, '안내 줄이 떠다니는 예시 카드를 가리킨다: ' + note.text);
      assert.equal(note.hint, '눌러서 감상', '힌트는 누름을 안내한다: ' + note.hint);
      assert.doesNotMatch(note.text, /금테/, '안내 줄에 금테가 없다(마지막 순간 카드와 헷갈리지 않게): ' + note.text);
      assert.ok(note.text.includes('·'), '안내 줄에 가름점(·)이 그려진다 — 문구와 힌트 사이: ' + note.text);
      const visibleCards = await h.frame.locator('.card').evaluateAll(es => es.filter(e => !e.classList.contains('off')).length);
      assert.ok(visibleCards > 0, `떠다니는 예시 카드가 실제로 보인다(보이는 카드 ${visibleCards}장)`);
    } finally { await close1010(h); }
  } finally { await browser.close(); }
});

test('#1010 기존 사용자 390 — 떠다니는 예시 카드가 숨으면 안내 줄도 숨긴다', { skip: REQUIRE1010 ? false : skip1010, timeout: 180000 }, async () => {
  if (skip1010) assert.fail(skip1010);
  const browser = await chromium1010.launch({ headless: true });
  try {
    const h = await boot1010(browser, { width: 390 });
    try {
      const note = await noteState(h.frame);
      assert.ok(note.hidden && note.dataOff, '카드가 숨은 좁은 화면에서는 안내 줄도 숨는다: ' + JSON.stringify(note));
      const visibleCards = await h.frame.locator('.card').evaluateAll(es => es.filter(e => !e.classList.contains('off')).length);
      assert.equal(visibleCards, 0, '이 화면(390·로그인 예시)에서는 궤도 카드가 보이지 않는다(#780 후속): ' + visibleCards);
    } finally { await close1010(h); }
  } finally { await browser.close(); }
});

test('#1010 신규 사용자(로그아웃 예시) 안내 줄은 그대로다', { skip: REQUIRE1010 ? false : skip1010, timeout: 180000 }, async () => {
  if (skip1010) assert.fail(skip1010);
  const browser = await chromium1010.launch({ headless: true });
  try {
    const h = await boot1010(browser, { member: false });
    try {
      const note = await noteState(h.frame);
      assert.match(note.text, /감상 예시 · 내 기록에는 저장되지 않아요/, '신규 사용자 안내 줄 문구를 바꾸지 않는다: ' + note.text);
      assert.equal(note.hint, '드래그 · 금테 카드를 눌러 감상', '신규 사용자 힌트도 그대로다: ' + note.hint);
    } finally { await close1010(h); }
  } finally { await browser.close(); }
});

test('#1010 섞어서(내 카드가 있는) 기존 사용자의 안내 줄은 테두리 문구 그대로다', { skip: REQUIRE1010 ? false : skip1010, timeout: 180000 }, async () => {
  if (skip1010) assert.fail(skip1010);
  const browser = await chromium1010.launch({ headless: true });
  try {
    const h = await boot1010(browser, { mix: true });
    try {
      const note = await noteState(h.frame);
      assert.match(note.text, /테두리가 있는 카드는 내가 남긴 순간이에요/, '섞어서 안내는 이번에 바꾸지 않는다: ' + note.text);
      assert.doesNotMatch(note.text, /감상 예시/, '섞어서 화면에 예시 안내 줄이 덧씌워지지 않는다: ' + note.text);
    } finally { await close1010(h); }
  } finally { await browser.close(); }
});

test('#1010 예시 카드를 누르면 감상(자세히 보기)이 열리고, 책 읽기는 예시 기억책으로 간다', { skip: REQUIRE1010 ? false : skip1010, timeout: 180000 }, async () => {
  if (skip1010) assert.fail(skip1010);
  const browser = await chromium1010.launch({ headless: true });
  try {
    const h = await boot1010(browser, { width: 1440 });
    try {
      // 떠다니는 예시 카드(궤도)의 안쪽 .surface를 누른다 — .world가 포인터를 가로채므로 직접 클릭을 부른다(#952 #426과 같은 요령).
      const opened = await h.frame.locator('#orbit').evaluate(() => {
        const root = document.getElementById('orbit').shadowRoot;
        const surface = [...root.querySelectorAll('.card:not(.off) .surface')][0];
        if (!surface) return false;
        surface.click();
        const dialog = root.querySelector('dialog');
        return !!(dialog && dialog.open);
      });
      assert.ok(opened, '예시 카드를 누르면 자세히 보기 창이 열린다(수정 전에는 아무 반응이 없었다)');
      const label = await h.frame.locator('#orbit').evaluate(() => {
        const root = document.getElementById('orbit').shadowRoot;
        const dialog = root.querySelector('dialog');
        return { kicker: dialog.querySelector('.detail-copy small')?.textContent || '', book: dialog.querySelector('[data-do="book"]')?.textContent || '' };
      });
      assert.match(label.kicker, /감상 예시/, '창은 감상 예시임을 밝힌다: ' + label.kicker);
      await h.frame.locator('#orbit').evaluate(() => {
        const root = document.getElementById('orbit').shadowRoot;
        root.querySelector('dialog [data-do="book"]').click();
      });
      await h.page.waitForFunction(() => (window.__lt1010msgs || []).some(m => m && m.type === 'lt41-example'), null, { timeout: 8000 });
      const msg = await h.page.evaluate(() => (window.__lt1010msgs || []).find(m => m && m.type === 'lt41-example'));
      assert.equal(msg.view, 'track59-sketchbook.html', '책 읽기는 예시 기억책 화면을 청한다: ' + JSON.stringify(msg));
      assert.ok(msg.momentId, '어느 순간을 볼지 함께 넘긴다: ' + JSON.stringify(msg));
    } finally { await close1010(h); }
  } finally { await browser.close(); }
});

test('#1010 숫자 줄 띄어쓰기 — 순간 N · 모아둔 M(글자 사이 공백이 실제로 그려진다)', { skip: REQUIRE1010 ? false : skip1010, timeout: 180000 }, async () => {
  if (skip1010) assert.fail(skip1010);
  const browser = await chromium1010.launch({ headless: true });
  try {
    const h = await boot1010(browser, { mix: true });
    try {
      const line = await h.frame.locator('.home-action-group:has([data-do="moments"]) .home-count').evaluate(el => {
        const node = el.firstChild, dot = node.textContent.indexOf('·');
        const rect = (from, to) => { const r = document.createRange(); r.setStart(node, from); r.setEnd(node, to); return r.getBoundingClientRect(); };
        const word = rect(0, dot - 1), mark = rect(dot, dot + 1);
        const ir = document.createRange(); ir.selectNodeContents(el.lastChild);
        const inbox = ir.getBoundingClientRect();
        return { text: el.textContent, leftGap: mark.left - word.right, rightGap: inbox.left - mark.right };
      });
      assert.match(line.text, /순간 \d+ · 모아둔 \d+/, '숫자 줄이 "순간 N · 모아둔 M"이다: ' + line.text);
      assert.ok(line.leftGap >= 2 && line.rightGap >= 2, '가름점 양옆 공백이 실제로 그려진다(붙으면 0): ' + JSON.stringify(line));
    } finally { await close1010(h); }
  } finally { await browser.close(); }
});

test('#1010 390 바닥 링크 — 넷 모두 보이고 줄바꿈으로 왼쪽 아래에, ＋ 단추와 겹치지 않는다', { skip: REQUIRE1010 ? false : skip1010, timeout: 180000 }, async () => {
  if (skip1010) assert.fail(skip1010);
  const browser = await chromium1010.launch({ headless: true });
  try {
    const h = await boot1010(browser, { width: 390 });
    try {
      const links = await h.page.evaluate(() => {
        const row = document.querySelector('.home-links');
        const items = [...row.querySelectorAll('.feedback-link')].map(el => {
          const r = el.getBoundingClientRect();
          return { label: el.textContent, visible: r.width > 0 && r.height > 0, top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) };
        });
        const rowRect = row.getBoundingClientRect();
        const fab = document.getElementById('mobile-add');
        const fr = fab?.getBoundingClientRect();
        const fabVisible = !!fr && fr.width > 0;
        const overlap = fabVisible && items.some(i => i.visible && i.right > fr.left && i.top < fr.bottom && i.bottom > fr.top);
        return { items, rowH: Math.round(rowRect.height), rowTop: Math.round(rowRect.top), viewportH: innerHeight, fabVisible, fabLeft: fr ? Math.round(fr.left) : null, overlap, rowRight: Math.round(rowRect.right) };
      });
      const labels = links.items.filter(i => i.visible).map(i => i.label);
      for (const want of ['새 소식', '의견 보내기', '개인정보 처리방침', '이용약관']) {
        assert.ok(labels.includes(want), `390 첫 화면 바닥에 "${want}" 링크가 있다: ` + JSON.stringify(labels));
      }
      assert.ok(links.rowH >= 56 && links.rowH <= 66, `링크가 두 줄로 카드 아래 자리에 들어간다(줄 높이 ${links.rowH}px — 66px 안)`);
      assert.ok(links.rowTop >= links.viewportH - 76, `링크 줄이 새 소식 카드 자리(아래 76px) 아래에 있다(윗변 ${links.rowTop}px / ${links.viewportH - 76}px)`);
      assert.ok(!links.overlap, '링크 줄이 오른쪽 아래 ＋ 단추와 겹치지 않는다');
      assert.ok(!links.fabVisible, '첫 화면에서는 ＋가 가운데만 남는다(#1084)');
      if (links.fabVisible) assert.ok(links.rowRight <= links.fabLeft, `링크 줄이 ＋ 단추 왼쪽 끝(${links.fabLeft}px)을 넘지 않는다(끝 ${links.rowRight}px)`);
    } finally { await close1010(h); }
  } finally { await browser.close(); }
});

// 이슈 1018: 떠다니는 카드는 셸 바닥 링크 줄·새 소식 카드 자리를 지나가지 않는다(가드 확장 — 가운데 구역과 같은 방식).
// 판정: 1440·1920 × 밤·정원, 움직임 켬, 3초 동안 0.5초 간격 7회 — 보이는 카드(숨김 제외)×링크 글자 상자·링크 줄·새 소식 카드 교차 0.
// 빈손 통과 방지: 각 카드를 한 바퀴 중 바닥 자리를 가장 많이 겹치는 위상에 놓고 잰다(궤도 경로가 실제로 자리를 지나는지 단정).
const SAMPLE1018 = () => {
  const root = document.getElementById('orbit')?.shadowRoot;
  const all = root ? [...root.querySelectorAll('button.card')] : [];
  const rectOf = c => {
    const inner = c.querySelector('.surface img') || c.querySelector('.surface') || c;
    const r = inner.getBoundingClientRect();
    let k = 1; const t = getComputedStyle(inner).transform;
    if (t && t !== 'none') { const m = t.match(/^matrix\(([^)]+)\)/); if (m) { const v = m[1].split(',').map(Number); k = Math.hypot(v[0], v[1]) || 1; } }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = r.width / k, h = r.height / k;
    return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
  };
  const visible = all.filter(c => { const cs = getComputedStyle(c); return cs.display !== 'none' && cs.visibility !== 'hidden' && !c.classList.contains('off'); });
  const shell = parent.document;
  const fr = frameElement?.getBoundingClientRect(); const ox = fr?.left || 0, oy = fr?.top || 0;
  const vis = el => { if (!el) return null; const cs = parent.getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { l: r.left - ox, t: r.top - oy, r: r.right - ox, b: r.bottom - oy } : null; };
  const links = [...shell.querySelectorAll('.home-links a,.home-links button')].map(vis).filter(Boolean);
  const row = vis(shell.querySelector('.home-links'));
  const updates = vis(shell.getElementById('updates-card'));
  const zones = [...links, ...(row ? [row] : []), ...(updates ? [updates] : [])];
  const hit = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  let pairs = 0, maxArea = 0;
  for (const c of visible.map(rectOf)) for (const z of zones) { const a = hit(c, z); if (a > 0) { pairs++; maxArea = Math.max(maxArea, a); } }
  const track = all.find(c => !c.classList.contains('off'));
  const first = track ? rectOf(track) : null;
  return { visible: visible.length, links: links.length, updates: !!updates, pairs, maxArea: Math.round(maxArea), firstCenter: first ? [Math.round((first.l + first.r) / 2), Math.round((first.t + first.b) / 2)] : null };
};

test('#1018 떠다니는 카드는 바닥 링크 줄·새 소식 카드 자리를 지나가지 않는다(1440·1920 × 밤·정원, 움직임 켬, 3초×0.5초)', { skip: REQUIRE1010 ? false : skip1010, timeout: 300000 }, async () => {
  if (skip1010) assert.fail(skip1010);
  const browser = await chromium1010.launch({ headless: true });
  try {
    for (const theme of ['night', 'garden']) for (const width of [1440, 1920]) {
      const h = await boot1010(browser, { width, theme, motion: true });
      try {
        await h.frame.waitForFunction(() => { const r = document.getElementById('orbit')?.shadowRoot; return r && [...r.querySelectorAll('button.card')].some(c => !c.classList.contains('off') && getComputedStyle(c).display !== 'none'); }, null, { timeout: 20000 });
        await h.page.waitForFunction(() => { const c = document.getElementById('updates-card'); return c && !c.hidden && c.getBoundingClientRect().width > 0; }, null, { timeout: 8000 });
        await h.page.waitForTimeout(1200);
        const crossed = await h.frame.evaluate(() => {
          const root = document.getElementById('orbit').shadowRoot;
          const cards = [...root.querySelectorAll('button.card')].filter(c => !c.classList.contains('off') && getComputedStyle(c).display !== 'none');
          const shell = parent.document;
          const fr = frameElement?.getBoundingClientRect(); const ox = fr?.left || 0, oy = fr?.top || 0;
          const zoneOf = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 ? { l: r.left - ox - 12, t: r.top - oy - 12, r: r.right - ox + 12, b: r.bottom - oy + 12 } : null; };
          const zones = [zoneOf(shell.querySelector('.home-links')), zoneOf(shell.getElementById('updates-card'))].filter(Boolean);
          const rectOf = c => { const inner = c.querySelector('.surface img') || c.querySelector('.surface') || c; const r = inner.getBoundingClientRect(); let k = 1; const t = getComputedStyle(inner).transform; if (t && t !== 'none') { const m = t.match(/^matrix\(([^)]+)\)/); if (m) { const v = m[1].split(',').map(Number); k = Math.hypot(v[0], v[1]) || 1; } } const cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = r.width / k, h = r.height / k; return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 }; };
          const hit = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
          let maxCross = 0;
          for (const c of cards) {
            // #1086: lt-orbit은 WAAPI 애니메이션이 아니라 rAF에서 transform을 직접 쓴다.
            // 실제 그리기 경로(테스트용 seek)로 진행률 0~1을 훑어 궤도 경로의 최대 교차를 잰다.
            if (!window.__LT_ORBIT_TEST__) continue;
            let best = 0;
            for (let k = 0; k < 48; k++) {
              window.__LT_ORBIT_TEST__.seek(k / 48);
              const r = rectOf(c);
              const area = zones.reduce((n, z) => n + hit(r, z), 0);
              if (area > best) best = area;
            }
            maxCross = Math.max(maxCross, best);
          }
          window.__LT_ORBIT_TEST__.restore();
          return maxCross;
        });
        assert.ok(crossed > 0, `${width}·${theme}: 궤도 경로가 바닥 자리를 지난다(최대 교차 ${Math.round(crossed)}px²) — 빈손 통과가 아니다`);
        await h.page.waitForTimeout(150);
        const samples = [];
        for (let i = 0; i < 7; i++) { samples.push(await h.frame.evaluate(SAMPLE1018)); if (i < 6) await h.page.waitForTimeout(500); }
        const totalPairs = samples.reduce((n, s) => n + s.pairs, 0);
        const moved = samples[0].firstCenter && samples[6].firstCenter && Math.hypot(samples[0].firstCenter[0] - samples[6].firstCenter[0], samples[0].firstCenter[1] - samples[6].firstCenter[1]) > 3;
        console.log('#1018', width, theme, JSON.stringify({ crossed: Math.round(crossed), perSample: samples.map(s => s.pairs), visible: samples.map(s => s.visible), links: samples[0].links, updates: samples[0].updates, moved }));
        assert.ok(samples.every(s => s.links === 4 && s.updates), `${width}·${theme}: 바닥 링크 4개·새 소식 카드가 보이는 자리에서 잰다: ${JSON.stringify(samples[0])}`);
        assert.ok(moved, `${width}·${theme}: 움직임이 켜져 있다(3초 동안 카드 중심이 움직인다)`);
        assert.equal(totalPairs, 0, `${width}·${theme}: 3초×0.5초 간격 보이는 카드×바닥 자리 교차 ${totalPairs}쌍(최대 ${Math.max(...samples.map(s => s.maxArea))}px²)`);
      } finally { await close1010(h); }
    }
  } finally { await browser.close(); }
});

// #1026 E: 기존 사용자가 화면을 열 때 example.mjs(1MB 예시 데이터)를 요청하지 않는다.
// 실제 네트워크 요청 URL을 세는 동작 검사(소스 글자 검사 아님). 로그아웃 예시는 이번에 바꾸지 않는다.
test('기존 사용자 첫 화면·책·보드·지도·서재 — example.mjs 요청 0', { skip: skip1010 || !REQUIRE1010 ? skip1010 || 'LT_HOME_1010_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium1010.launch({ headless: true });
  try {
    for (const hash of ['', '#my/book', '#my/board', '#my/network', '#my/shelf']) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const trees = [treeMix1010({ subject: '좋아하는 순간들', count: 6 })];
      const workspace = { revision: 1, state: { version: 1, trees, prefs: {} }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z' };
      const requested = [];
      await ctx.route('**/*', route => {
        const u = new URL(route.request().url());
        requested.push(u.pathname.split('/').pop() || u.pathname);
        if (u.origin !== base) return u.hostname === 'i.ytimg.com' ? THUMB(route) : route.abort();
        if (u.pathname === '/api/workspace') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) });
        if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
        return route.continue();
      });
      const page = await ctx.newPage();
      await page.goto(`${base}/v41/?account=1${hash}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      const exampleRequests = requested.filter(f => f === 'example.mjs');
      assert.equal(exampleRequests.length, 0, `${hash || '#home'}: 예시 데이터 요청 ${exampleRequests.length}건 — 기존 사용자 화면에서는 0이어야 한다`);
      console.log('EXAMPLE_REQUESTS', hash || '#home', JSON.stringify({ example: exampleRequests.length, total: requested.length }));
      await ctx.close();
    }
  } finally { await browser.close(); await new Promise(ok => server.close(ok)); }
});

// #1026 E 2단계: 창 전용 모듈을 동적으로 받아도 여는 단추의 첫 클릭이 사라지지 않는다(동작 검사).
test('지연 창 모듈 — 정리·꼬리표 첫 클릭으로 창이 열린다', { skip: skip1010 || !REQUIRE1010 ? skip1010 || 'LT_HOME_1010_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  const browser = await chromium1010.launch({ headless: true });
  try {
    for (const [action, panelId, pickInbox] of [['tags', 'tag-panel', false], ['cleanup', 'cleanup-panel', true]]) {
      const h = await boot1010(browser, { member: true, mix: true, width: 1440 });
      try {
        if (pickInbox) {
          await h.page.click('#record-menu');
          await h.page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 10000 });
          await h.page.locator('#tree-popover [data-tree-id]').first().click();
          await h.page.waitForTimeout(700);
        }
        await h.page.click('#record-menu');
        await h.page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 10000 });
        const btn = h.page.locator(`#tree-popover [data-tree-action="${action}"]`);
        await btn.waitFor({ state: 'visible', timeout: 10000 });
        await btn.click();
        await h.page.waitForFunction(id => { const d = document.getElementById(id); return d && d.open && !d.hidden && d.getBoundingClientRect().width > 0; }, panelId, { timeout: 15000 });
        assert.equal(await h.page.locator(`#${panelId}`).evaluate(d => d.open), true, `${action}: 첫 클릭으로 창이 열렸다`);
        console.log('LAZY_PANEL_OPEN', action, panelId);
      } finally { await close1010(h); }
    }
  } finally { await browser.close(); }
});
