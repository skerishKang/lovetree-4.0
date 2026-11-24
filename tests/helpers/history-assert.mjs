// import { testBackNavigation } from './history-assert.mjs';
// await testBackNavigation(page, { frame, recorded: true, action: () => frame.click('#card') });
// await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('#themeGrid button') });
import assert from 'node:assert/strict';

const DEFAULT_PANELS = [
  'dialog[open]',
  '.detail.open',
  '#viewerModal.open',
  '#addModal.open',
  '#editModal.open',
  '#nextChooser.open',
  '#cinemaOverlay.active',
  '#leftPanel.mobileOpen',
  '.lt-toolbar-menu:not([hidden])',
  '.lt-bg-menu:not([hidden])',
  '.moreMenu:not([hidden])'
];

function captureDocument(panelSelectors) {
  const pathScreen = () => {
    const screen = document.documentElement?.dataset?.v41Screen || document.body?.dataset?.screen;
    if (screen) return screen;
    const current = document.querySelector('[data-view][aria-current="true"]')?.dataset?.view;
    if (current) return current;
    return location.pathname.replace(/\/+$/, '').split('/').pop() || '/';
  };
  const selected = window.LT41?.momentId || window.LTDEMO?.get?.() ||
    document.querySelector('.card.selected')?.dataset?.id ||
    document.querySelector('.lt-moment-picker select')?.value || '';
  const counts = new Map();
  const scrollers = [...document.querySelectorAll('*')].flatMap(element => {
    const style = getComputedStyle(element);
    if (!/(?:auto|scroll|hidden)/.test(`${style.overflowX} ${style.overflowY}`)) return [];
    const horizontal = element.scrollWidth - element.clientWidth;
    const vertical = element.scrollHeight - element.clientHeight;
    if (horizontal <= 4 && vertical <= 4) return [];
    const base = element.id || `${element.tagName.toLowerCase()}.${String(element.className || '').trim().split(/\s+/).join('.')}`;
    const index = counts.get(base) || 0;
    counts.set(base, index + 1);
    return [{ key: index ? `${base}#${index}` : base, left: element.scrollLeft, top: element.scrollTop }];
  });
  const visibleFrame = document.querySelector('#view:not([hidden])');
  let frameScreen = '';
  try {
    frameScreen = visibleFrame?.contentDocument?.documentElement?.dataset?.v41Screen ||
      new URL(visibleFrame?.contentWindow?.location.href || '').pathname.split('/').pop() || '';
  } catch {}
  return {
    hash: location.hash,
    screen: pathScreen(),
    frameScreen,
    panels: panelSelectors.filter(selector => document.querySelector(selector)),
    selectedMoment: selected,
    scroll: { x: window.scrollX, y: window.scrollY, elements: scrollers },
    historyLength: history.length,
    historyState: history.state
  };
}

async function visibleShellFrame(page) {
  const handle = await page.$('#view:not([hidden])');
  return handle ? handle.contentFrame() : null;
}

export async function backState(page, { frame = null, panels = [] } = {}) {
  const target = await visibleShellFrame(page) || frame;
  const selectors = [...DEFAULT_PANELS, ...panels];
  const shell = await page.evaluate(captureDocument, selectors);
  if (!target) return { ...shell, frame: null, frameHistoryLength: 0 };
  const inner = await target.evaluate(captureDocument, selectors);
  return {
    ...shell,
    frame: inner,
    frameHistoryLength: inner.historyLength,
    panels: [...shell.panels.map(selector => `shell:${selector}`), ...inner.panels.map(selector => `frame:${selector}`)],
    selectedMoment: inner.selectedMoment || shell.selectedMoment,
    scroll: { shell: shell.scroll, frame: inner.scroll }
  };
}

function comparable(state) {
  const { historyLength, frameHistoryLength, historyState, frame, ...rest } = state;
  if (!frame) return rest;
  const { historyLength: innerHistoryLength, historyState: innerHistoryState, ...inner } = frame;
  return { ...rest, frame: inner };
}

async function waitForPrevious(page, expected, options) {
  const deadline = Date.now() + (options.timeoutMs || 5000);
  let current = null;
  while (Date.now() < deadline) {
    current = await backState(page, options);
    try {
      assert.deepEqual(comparable(current), comparable(expected));
      return current;
    } catch {}
    await page.waitForTimeout(50);
  }
  assert.deepEqual(comparable(current), comparable(expected), `뒤로 가기 한 번에 바로 전 상태로 돌아와야 한다 / 기록 상태: ${JSON.stringify({ before: expected.historyState, after: current.historyState })}`);
  return current;
}

export async function testBackNavigation(page, { frame = null, recorded, action, panels = [], timeoutMs = 5000, settleMs = 100 } = {}) {
  assert.equal(typeof action, 'function', 'action 함수가 필요하다');
  assert.equal(typeof recorded, 'boolean', '기록함 여부를 true/false로 선언해야 한다');
  const options = { frame, panels, timeoutMs };
  const before = await backState(page, options);
  await action();
  await page.waitForTimeout(settleMs);
  const afterAction = await backState(page, options);
  const beforeHistory = Math.max(before.historyLength, before.frameHistoryLength);
  const afterHistory = Math.max(afterAction.historyLength, afterAction.frameHistoryLength);
  if (!recorded) {
    assert.equal(afterHistory, beforeHistory, '기록하지 않는 동작은 history.length를 늘리지 않는다');
    return { before, afterAction, afterBack: null };
  }
  assert.equal(afterHistory, beforeHistory + 1, `기록하는 동작은 history를 한 칸 늘린다 / ${JSON.stringify({ before: before.historyState, after: afterAction.historyState, beforeLength: beforeHistory, afterLength: afterHistory, frameBefore: before.frameHistoryLength, frameAfter: afterAction.frameHistoryLength })}`);
  const backTarget = afterAction.frameHistoryLength > before.frameHistoryLength ? (await visibleShellFrame(page) || frame) : page;
  await backTarget.evaluate(() => history.back());
  const afterBack = await waitForPrevious(page, before, options);
  return { before, afterAction, afterBack };
}

// #1298: 단순 옵션 변경에서 브라우저 방문 기록이 늘어나지 않는지 확인한다.
export async function expectNoHistoryGrowth(page, action, label) {
 const before = await page.evaluate(() => history.length);
 await action();
 const after = await page.evaluate(() => history.length);
 assert.equal(after, before, label + ': 방문 기록 증가 0');
}
