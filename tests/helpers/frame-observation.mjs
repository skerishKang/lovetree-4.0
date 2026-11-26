import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTree, addMoment } from '../../public/v41/domain.mjs';

export const FRAME_SCREENS = [
  { id: 'home', label: '첫 화면', file: 'home.html', root: '#orbit' },
  { id: 'shelf', label: '서재', file: 'track32-bookshelf.html', root: '.shelf,#shelf,.bookshelf,main' },
  { id: 'book', label: '책', file: 'track59-sketchbook.html', root: '.moment,.mobile-page,.book-wrap,main' },
  { id: 'board', label: '보드', file: 'track58-pinboard.html', root: '#cardLayer .card,#stage,main' },
  { id: 'map', label: '지도', file: 'track56-network.html', root: '#stage,canvas,main' },
  { id: 'tree', label: '트리 보기', file: 'track61-tree.html', root: '#tree,.tree-stage,.tree-canvas,canvas,main' },
  { id: 'explore', label: '둘러보기', panel: '#community-panel', root: '#community-list .community-card' },
  { id: 'settings', label: '계정/설정', panel: '#account-settings', root: '#account-settings-records:not([hidden])' }
];

export const OBSERVATION_TREE_ID = 'b0000000-0000-4000-8000-000000000001';

export function observationTree() {
  const input = i => ({ subject: '화면 확인', title: '시험 순간 ' + (i + 1), date: '2026-11-' + String(i + 1).padStart(2, '0'), emotion: i % 2 ? '행복' : '설렘', note: '판 모양 확인을 위한 가짜 기록입니다.', url: '' });
  let generated = createTree(input(0), '2026-11-01T00:00:00Z');
  for (let i = 1; i < 4; i++) generated = addMoment(generated, input(i), generated.moments[0].id, '2026-11-0' + (i + 1) + 'T00:00:00Z');
  const ids = generated.moments.map((_, i) => 'b0000000-0000-4000-8000-' + String(i + 2).padStart(12, '0'));
  return {
    ...generated,
    id: OBSERVATION_TREE_ID,
    moments: generated.moments.map((moment, i) => ({ ...moment, id: ids[i], parentId: i === 0 ? null : ids[0] }))
  };
}

export function observationRoutes(tree) {
  const workspace = { revision: 1, state: { version: 1, trees: [tree], prefs: { displayName: '화면검사 시험계정' } }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z' };
  const shareId = 'c000000000000000000000a';
  const publicShare = { ok: true, share: { id: shareId, view: 'book', entryMomentId: tree.moments[0].id }, tree };
  const cards = [0, 1, 2].map(i => ({ shareId: 'c000000000000000000000' + String.fromCharCode(97 + i), title: '공개 트리 ' + (i + 1), subject: '바다와 달', summary: '첫 기록', momentCount: 3 + i, createdAt: '2026-11-2' + i + 'T09:30:00.000Z', publicDisplayName: '공개자' + (i + 1), cover: { emotion: '설렘', title: '첫 순간', type: 'photo', url: '' }, emotions: ['설렘'], stats: { hearts: 3, favorites: 1, hearted: false, favored: false, reactions: { heart: 3 }, mine: [] } }));
  return async route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/workspace') return route.fulfill({ status: 200, json: workspace });
    if (u.pathname === '/api/account') return route.fulfill({ status: 200, json: { ok: true, email: 'audit@example.invalid', subject: workspace.subject } });
    if (u.pathname === '/api/public/shares/' + shareId) return route.fulfill({ status: 200, json: publicShare });
    if (u.pathname.startsWith('/api/community/shares')) return route.fulfill({ status: 200, json: { ok: true, items: cards, totalVisible: 3, nextCursor: '', groups: [], groupsAll: [] } });
    if (u.pathname === '/api/community/stats') return route.fulfill({ status: 200, json: { trees: 17, moments: 1234 } });
    return route.fulfill({ status: 200, json: { ok: true, items: [] } });
  };
}

const THUMB = route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

export async function settleObservation(page, predicate, arg = null, { freezeClock = false } = {}) {
  await page.waitForFunction(predicate, arg, { timeout: 30000 });
  if (freezeClock) await page.clock.fastForward(0);
  await page.evaluate(async freeze => {
    const docs = [document];
    const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
    try { if (frame?.contentDocument) docs.push(frame.contentDocument); } catch {}
    await Promise.all(docs.map(doc => doc.fonts?.ready));
    const animations = docs.flatMap(doc => doc.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity));
    if (freeze) for (const animation of animations) { try { animation.finish(); } catch {} }
    else await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    if (!freeze) await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, freezeClock);
  if (freezeClock) {
    await page.clock.runFor(32);
    await page.clock.fastForward(0);
  }
}

export async function measureFrame(page, screen, theme, width, height) {
  return page.evaluate(({ screen, theme, width, height }) => {
    const round = n => Math.round(n * 1000) / 1000;
    const rect = e => { const r = e.getBoundingClientRect(); return { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height), bottom: round(r.bottom), right: round(r.right) }; };
    const style = e => {
      if (!e) return null;
      const s = getComputedStyle(e), r = rect(e);
      return { rect: r, display: s.display, position: s.position, zIndex: s.zIndex, borderWidth: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth], borderStyle: [s.borderTopStyle, s.borderRightStyle, s.borderBottomStyle, s.borderLeftStyle], borderColor: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor], borderRadius: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius], boxShadow: s.boxShadow, padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft], margin: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft], background: s.backgroundColor, backgroundImage: s.backgroundImage, overflowX: s.overflowX, overflowY: s.overflowY, flex: s.flex, order: s.order };
    };
    const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
    const panel = screen.panel ? document.querySelector(screen.panel) : null;
    const stage = document.getElementById('stage');
    const toast = document.getElementById('toast');
    const bodyRect = document.body.getBoundingClientRect(), toastRect = toast?.getBoundingClientRect();
    const toastCenterDelta = toastRect ? Math.abs((toastRect.left - bodyRect.left) - (bodyRect.right - toastRect.right)) : null;
    const toastHorizontalOverflow = toast ? toast.scrollWidth - toast.clientWidth : null;
    const toastWithinViewport = !!toastRect && toastRect.left >= bodyRect.left && toastRect.right <= bodyRect.right;
    const shell = { bodyClass: document.body.className, body: style(document.body), stage: style(stage), frame: style(frame), panel: panel ? { ...style(panel), open: panel.open } : null, toast: style(toast), toastCenterDelta, toastHorizontalOverflow, toastWithinViewport, toastHidden: toast?.hidden ?? null, visitorIntro: toast?.hasAttribute('data-visitor-intro') ?? null, children: [...document.body.children].map(e => ({ id: e.id, tag: e.tagName, className: String(e.className || ''), hidden: e.hidden, ...style(e) })) };
    const candidates = [];
    const collect = (doc, owner) => {
      for (const e of doc.querySelectorAll('body,body *')) {
        const s = doc.defaultView.getComputedStyle(e), r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0) || !/auto|scroll/.test(s.overflowY) || e.scrollHeight <= e.clientHeight + 1) continue;
        candidates.push({ owner, id: e.id, className: String(e.className || '').slice(0, 100), overflowY: s.overflowY, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, scrollTop: e.scrollTop, rect: rect(e) });
      }
      const root = doc.scrollingElement;
      if (root && doc.defaultView.getComputedStyle(root).overflowY !== 'hidden' && root.scrollHeight > root.clientHeight + 1) candidates.unshift({ owner, id: root.id, className: String(root.className || ''), overflowY: doc.defaultView.getComputedStyle(root).overflowY, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight, scrollTop: root.scrollTop, rect: rect(root) });
    };
    if (panel) collect(document, 'shell');
    if (frame) try { collect(frame.contentDocument, 'iframe'); } catch {}
    const world = frame?.contentDocument?.getElementById('world');
    if (world && ['board', 'map'].includes(screen.id)) candidates.unshift({ owner: 'world', id: 'world', className: String(world.className || ''), overflowY: 'pan-zoom', scrollHeight: world.scrollHeight, clientHeight: world.clientHeight, scrollTop: world.scrollTop, rect: rect(world) });
    candidates.sort((a, b) => (b.owner === 'world') - (a.owner === 'world') || b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight));
    const primary = screen.id === 'board' ? frame?.contentDocument?.getElementById('world')
      : screen.id === 'map' ? frame?.contentDocument?.getElementById('stage')
      : panel || (frame ? frame.contentDocument.scrollingElement : null);
    const selected = primary ? { id: primary.id || primary.tagName.toLowerCase(), className: String(primary.className || ''), owner: panel ? 'shell' : primary.id === 'world' ? 'world' : 'iframe', overflowY: primary === frame ? getComputedStyle(frame).overflowY : (primary.ownerDocument || document).defaultView.getComputedStyle(primary).overflowY } : candidates[0] || null;
    const backdrop = panel?.tagName === 'DIALOG' && panel.open ? (() => { const s = getComputedStyle(panel, '::backdrop'); return { background: s.backgroundColor, filter: s.filter, backdropFilter: s.backdropFilter }; })() : null;
    return { screen: screen.id, theme, viewport: { width, height }, shell: { ...shell, backdrop }, scroll: { owner: selected ? { id: selected.id, className: selected.className, owner: selected.owner, overflowY: selected.overflowY } : null, shellDocumentScrollable: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 1, frameDocumentScrollable: !!frame && frame.contentDocument.scrollingElement.scrollHeight > frame.contentDocument.scrollingElement.clientHeight + 1, candidates: candidates.slice(0, 8) } };
  }, { screen, theme, width, height });
}

async function finishBookObservation(page) {
  await page.evaluate(() => {
    const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
    const api = frame.contentWindow.__TRACK59__, state = api.getState();
    api.jump(state.page, api.momentAtPos(state.page)?.id);
  });
  await page.waitForFunction(() => [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length)?.contentDocument?.querySelector('.moment.focused'), null, { timeout: 30000 });
  await page.evaluate(() => {
    const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
    frame.contentWindow.dispatchEvent(new Event('lt41-tagline-ready'));
  });
  await page.clock.fastForward(0);
}

async function openMemberScreen(page, screen) {
  if (screen.id === 'home') return;
  if (screen.id === 'explore') {
    await page.locator('#community-menu').evaluate(e => e.click());
    await settleObservation(page, () => document.getElementById('community-panel')?.open && document.querySelectorAll('#community-list .community-card').length > 0);
    return;
  }
  if (screen.id === 'settings') {
    if (await page.locator('#community-panel').evaluate(e => e.open)) await page.locator('#community-panel').evaluate(e => e.close());
    await page.locator('#account-avatar').click();
    await page.locator('#account-open-settings').click();
    await settleObservation(page, () => document.getElementById('account-settings')?.open);
    await page.locator('#settings-tab-records').click();
    await settleObservation(page, () => !document.getElementById('account-settings-records')?.hidden && document.querySelector('#settings-tree-visibility-list .settings-row'));
    return;
  }
  await page.locator('[data-view="' + screen.file + '"]').first().evaluate(e => e.click());
  await settleObservation(page, ({ file, root }) => {
    const f = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
    return f?.contentWindow?.location?.pathname?.endsWith('/' + file) && f.contentDocument?.querySelector(root) &&
      !!f.contentDocument.querySelector('.lt-screen-toolbar[data-screen]') &&
      (file !== 'track59-sketchbook.html' || !!f.contentWindow.LTTagLine) &&
      (file !== 'track58-pinboard.html' || (typeof f.contentWindow.bootDetailPanel === 'function' && !!f.contentWindow.__LT58V12));
  }, { file: screen.file, root: screen.root });
  if (screen.id === 'book') await finishBookObservation(page);
  if (screen.id === 'board') {
    await page.clock.fastForward(0);
    await page.evaluate(() => {
      const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
      frame.contentWindow.bootDetailPanel();
    });
    await settleObservation(page, () => {
      const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
      const doc = frame?.contentDocument;
      return !!doc && !doc.getElementById('detail')?.classList.contains('open') && !!doc.querySelector('#cardLayer .card.selected');
    });
  }
}

export async function observeFrameMatrix({ browser, base, outputDir, shard = '' }) {
  mkdirSync(outputDir, { recursive: true });
  const tree = observationTree();
  const routeApi = observationRoutes(tree);
  const rows = [], errors = [];
  for (const [width, height] of [[390, 844], [1440, 900]]) for (const theme of ['night', 'garden']) {
    const ownShard = theme === 'night' ? (width === 1440 ? 'a' : 'b') : 'c';
    if (shard && shard !== ownShard) continue;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript(({ theme, treeId }) => { localStorage.setItem('lt41.theme', theme); localStorage.setItem('lt41.tips.firstTree', '1'); localStorage.setItem('lt41.video-consent', '1'); localStorage.setItem('lt41.discoverAsked', JSON.stringify([treeId])); }, { theme, treeId: tree.id });
    await context.route('**://i.ytimg.com/**', THUMB);
    await context.route('**/api/**', routeApi);
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-11-20T00:00:00Z') });
    page.on('pageerror', e => errors.push(String(e)));
    const capture = async (activePage, screen, { clockPaused = false } = {}) => {
      const name = `${width}-${theme}-${screen.id}`;
      await activePage.evaluate(() => {
        const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
        if (!frame) return;
        frame.style.willChange = 'transform';
        frame.contentDocument?.querySelectorAll('.lt-screen-toolbar,button,select,.pill,.mini,.action,.close,.edge-tip,.recent-card,.note-piece,.mobile-page,.mobile-content,.page-content,.photo-piece,.clipping,.letter,.film-piece')?.forEach(element => { element.style.willChange = 'transform'; if (element.matches('.recent-card')) element.style.transform = 'translateZ(0)'; });
      });
      if (screen.id === 'map') await activePage.evaluate(() => { const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length); frame.contentWindow.__lt?.resize(); });
      if (clockPaused) { await activePage.clock.runFor(32); await activePage.clock.fastForward(0); }
      else await activePage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await activePage.screenshot({ path: join(outputDir, name + '.png'), animations: 'disabled' });
      const target = screen.panel ? activePage.locator(screen.panel) : activePage.locator('#stage');
      const box = await target.boundingBox();
      if (box) {
        await activePage.screenshot({ path: join(outputDir, name + '-surface.png'), clip: box, animations: 'disabled' });
        const edge = Math.min(24, box.width, box.height);
        const edges = { top: { x: box.x, y: box.y, width: box.width, height: edge }, bottom: { x: box.x, y: box.y + box.height - edge, width: box.width, height: edge }, left: { x: box.x, y: box.y, width: edge, height: box.height }, right: { x: box.x + box.width - edge, y: box.y, width: edge, height: box.height } };
        for (const [side, clip] of Object.entries(edges)) await activePage.screenshot({ path: join(outputDir, name + '-roi-' + side + '.png'), clip, animations: 'disabled' });
      }
      const measured = await measureFrame(activePage, screen, theme, width, height);
      rows.push(measured);
      writeFileSync(join(outputDir, name + '.json'), JSON.stringify(measured, null, 2));
      console.log('관측', name);
    };
    try {
      await page.goto(base + '/v41/?account=1#home', { waitUntil: 'load' });
      await settleObservation(page, () => window.LT41?.trees?.length === 1 && document.body.dataset.member === 'in' && !document.getElementById('discover-ask')?.open && [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length)?.contentDocument?.getElementById('orbit') && [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length)?.contentWindow?.__LT_ORBIT_TEST__?.canvasSettled());
      await page.evaluate(() => {
        const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length);
        const orbit = frame.contentWindow.__LT_ORBIT_TEST__;
        orbit.hold(true);
        orbit.pauseFloat();
        orbit.seek(0);
      });
      for (const screen of FRAME_SCREENS) { await openMemberScreen(page, screen); const clockPaused = screen.id === 'book' || screen.id === 'board'; await capture(page, screen, { clockPaused }); if (clockPaused) await page.clock.resume(); }
    } finally { await context.close().catch(() => {}); }
    const guest = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await guest.addInitScript(({ theme, treeId }) => { localStorage.setItem('lt41.theme', theme); localStorage.setItem('lt41.tips.firstTree', '1'); localStorage.setItem('lt41.video-consent', '1'); localStorage.setItem('lt41.discoverAsked', JSON.stringify([treeId])); }, { theme, treeId: tree.id });
    await guest.route('**://i.ytimg.com/**', THUMB);
    await guest.route('**/api/**', routeApi);
    const guestPage = await guest.newPage();
    guestPage.on('pageerror', e => errors.push(String(e)));
    try {
      await guestPage.clock.install({ time: new Date('2026-11-20T00:00:00Z') });
      await guestPage.goto(base + '/v41/#share/c000000000000000000000a/book', { waitUntil: 'load' });
      await guestPage.waitForFunction(() => document.body.dataset.recordSource === 'share' && document.body.dataset.fabLift === 'book' && !document.getElementById('toast')?.hidden && document.getElementById('toast')?.hasAttribute('data-visitor-intro') && [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length)?.contentWindow?.location?.pathname?.endsWith('/track59-sketchbook.html') && [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length)?.contentDocument?.querySelector('.moment,.mobile-page,.book-wrap'), null, { timeout: 30000 });
      await guestPage.clock.fastForward(0);
      await settleObservation(guestPage, () => { const frame = [...document.querySelectorAll('#view,#view-next')].find(f => !f.hidden && f.getClientRects().length); return !!frame?.contentDocument?.querySelector('.lt-screen-toolbar[data-screen="book"]') && !!frame?.contentWindow?.LTTagLine; }, null, { freezeClock: true });
      await finishBookObservation(guestPage);
      await capture(guestPage, { id: 'share-guest', label: '공유 방문자 책', root: '.moment' }, { clockPaused: true });
    } finally { await guest.close().catch(() => {}); }
  }
  const report = { basis: '현재 제품 코드', fakeSession: true, errors, screens: rows };
  writeFileSync(join(outputDir, 'metrics.json'), JSON.stringify(report, null, 2));
  return report;
}

export async function compareScreenshotBuffers(browser, before, after) {
  if (before.equals(after)) return { changedPixels: 0, maxChannelDelta: 0, width: 0, height: 0 };
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ({ left, right }) => {
      const decode = async encoded => { const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)); const blob = new Blob([bytes], { type: 'image/png' }); const bitmap = await createImageBitmap(blob); const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data; bitmap.close(); return { data, width: canvas.width, height: canvas.height }; };
      const a = await decode(left), b = await decode(right);
      if (a.width !== b.width || a.height !== b.height) return { changedPixels: -1, maxChannelDelta: -1, width: a.width, height: a.height, other: [b.width, b.height] };
      let changedPixels = 0, maxChannelDelta = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        let pixel = 0;
        for (let c = 0; c < 4; c++) pixel = Math.max(pixel, Math.abs(a.data[i + c] - b.data[i + c]));
        if (pixel) changedPixels++;
        maxChannelDelta = Math.max(maxChannelDelta, pixel);
      }
      return { changedPixels, maxChannelDelta, width: a.width, height: a.height };
    }, { left: before.toString('base64'), right: after.toString('base64') });
  } finally { await page.close(); }
}
