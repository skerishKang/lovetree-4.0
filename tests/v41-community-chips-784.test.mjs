import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_CHIPS_REQUIRE === '1';
const SHOT = process.env.LT_CHIPS_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

const MINE = ['BTS', 'RESCENE'];
const cardOf = (shareId, title, groups) => ({
  shareId, title, subject: '시험 무대', summary: '공개 순간',
  momentCount: 3, createdAt: '2026-11-18T09:00:00.000Z', lastActivityAt: '2026-11-18T09:00:00.000Z',
  cover: { title: '대표 순간', thumbnailUrl: 'https://i.ytimg.com/vi/mock/mqdefault.jpg', type: 'photo', emotion: '설렘' },
  emotions: ['설렘'], view: 'book', entryMomentId: 'm1',
  stats: { hearts: 3, favorites: 0, hearted: false, favored: false, reactions: { heart: 3 }, mine: [] },
  groups
});
const CARDS = [
  cardOf('c1', 'BTS 첫 무대', ['BTS']),
  cardOf('c2', 'RESCENE 직캠', ['RESCENE']),
  cardOf('c3', '아이브 무대', ['아이브']),
  cardOf('c4', 'BTS 두 번째 무대', ['BTS'])
];
const GROUP_ORDER = [
  { value: '아이브', count: 20 },
  { value: 'RESCENE', count: 15 },
  { value: 'BTS', count: 10 },
  { value: '뉴진스', count: 5 }
];
const GROUP_BY_TITLE = Object.fromEntries(CARDS.map(card => [card.title, card.groups]));

function tree() {
  let t = createTree({ subject: '시험', title: '시험 트리', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  t.moments[0].keywords = [`가수:${MINE[0]}`];
  t = addMoment(t, { title: '둘째', note: '', emotion: '설렘', date: '2026-11-17', url: '' }, t.moments[0].id, '2026-11-18T00:00:01Z');
  t.moments.at(-1).keywords = [`가수:${MINE[1]}`];
  return t;
}

const measure = (page) => page.evaluate((groupByTitle) => {
  const rail = document.getElementById('community-groups');
  const chipNodes = [...rail.querySelectorAll('.community-group-chip')];
  const chips = chipNodes.map(chip => (chip.textContent || '').trim());
  const chipGroups = chips.filter(label => label !== '전체');
  const cards = [...document.querySelectorAll('#community-list .community-card')];
  const cardGroups = [...new Set(cards.flatMap(card => groupByTitle[card.querySelector('.community-card-title')?.textContent || ''] || []))];
  const feedback = document.getElementById('community-feedback')?.textContent || '';
  const listText = document.getElementById('community-list')?.textContent || '';
  return {
    chips, chipGroups,
    cardCount: cards.length,
    cardGroups,
    missingChips: chipGroups.filter(group => !cardGroups.includes(group)),
    emptyNotices: ((feedback + ' ' + listText).match(/공개(된)? 트리가 없/g) || []).length,
    rows: new Set(chipNodes.map(chip => Math.round(chip.getBoundingClientRect().top))).size,
    pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    minHeight: Math.min(...chipNodes.map(chip => Math.round(chip.getBoundingClientRect().height))),
    flexWrap: getComputedStyle(rail).flexWrap
  };
}, GROUP_BY_TITLE);

test('#784 칩은 지금 목록에 있는 그룹만·빈 상태 안내 한 곳·한 줄·페이지 넘침 0', { skip: skip || !REQUIRE ? skip || 'LT_CHIPS_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  async function run(width, { empty = false, selected = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
    await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
    await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', (r) => {
      const state = { version: 1, trees: [tree()], prefs: {} };
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) });
    });
    await ctx.route('**/api/community/shares**', (r) => {
      const artist = new URL(r.request().url()).searchParams.get('artist') || '';
      const items = empty ? [] : CARDS.filter(card => !artist || card.groups.includes(artist));
      const groups = empty ? GROUP_ORDER : GROUP_ORDER.filter(group => !artist || items.some(card => card.groups.includes(group.value)));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, totalVisible: items.length, nextCursor: '', groups }) });
    });
    const page = await ctx.newPage();
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    if (await page.locator('#community-menu').isVisible()) await page.locator('#community-menu').click();
    else { await page.click('#mobile-more'); await page.click('#header-overflow button:text-is("둘러보기")'); }
    await page.waitForFunction(expected => document.getElementById('community-panel')?.open && document.querySelectorAll('#community-groups .community-group-chip').length === expected, empty ? 1 : 4, { timeout: 15000 });
    await page.evaluate(() => {
      const updates = document.getElementById('updates-card'); if (updates) updates.hidden = true;
      for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'community-panel') d.close();
    });
    const m = await measure(page);
    if (empty) {
      assert.equal(m.cardCount, 0, '빈 상태 카드 0개');
      assert.equal(m.chipGroups.length, 0, '빈 상태 그룹 칩 0개');
      assert.equal(m.emptyNotices, 1, '빈 상태 안내 문구 합계 1');
      console.log('CHIPS_EMPTY', width, JSON.stringify(m));
    } else {
      assert.equal(m.cardCount, 4, '전체 카드 4개');
      assert.equal(m.chipGroups.length, 3, '칩 그룹 3개');
      assert.equal(m.cardGroups.length, 3, '카드 그룹 3개');
      assert.equal(m.missingChips.length, 0, '목록에 없는 그룹 칩 0개');
      assert.deepEqual(m.chipGroups.slice(0, 2), MINE, '내 가수 먼저');
      assert.ok(m.chipGroups.every(group => !/\d/.test(group)), '칩에 숫자 없음');
      assert.equal(m.rows, 1, '칩 한 줄');
      assert.equal(m.flexWrap, 'nowrap');
      assert.equal(m.pageOverflow, 0, '페이지 가로 넘침 0');
      assert.ok(m.minHeight >= 44, '칩 누름 영역 44px');
      await page.locator('#community-groups .community-group-chip').first().waitFor({ state: 'visible' });
      if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: `${SHOT}/chips-${width}.png` }); }
      console.log('CHIPS', width, JSON.stringify(m));
      if (selected) {
        await page.locator('#community-groups .community-group-chip:text-is("BTS")').click();
        await page.waitForFunction(() => document.querySelectorAll('#community-list .community-card').length === 2, null, { timeout: 10000 });
        const s = await measure(page);
        assert.equal(s.cardCount, 2, '칩 누른 뒤 카드 2개');
        assert.deepEqual(s.chipGroups, ['BTS'], '칩 누른 뒤 그룹 칩 1개');
        assert.equal(s.cardGroups.length, 1, '칩 누른 뒤 카드 그룹 1개');
        assert.equal(s.missingChips.length, 0, '칩 누른 뒤 목록에 없는 그룹 칩 0개');
        if (SHOT) await page.screenshot({ path: `${SHOT}/chips-selected-${width}.png` });
        console.log('CHIPS_SELECTED', width, JSON.stringify(s));
      }
    }
    await ctx.close();
  }
  try {
    await run(1440, { selected: true });
    await run(390);
    await run(1440, { empty: true });
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});
