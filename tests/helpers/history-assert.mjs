// import { testBackNavigation } from './history-assert.mjs';
// await testBackNavigation(page, { frame, recorded: true, action: () => frame.click('#card') });
// await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('#themeGrid button') });
import assert from 'node:assert/strict';
import { evaluateWhenReady } from './visible-frame.mjs';

const HISTORY_WAIT_MS = 5000;
const OBSERVE_MS = 100;

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
    // iframe 탐색이 전체 history.length를 앞서 늘릴 수 있어 현재 문서의 탐색 위치로 기록 증가를 확인한다.
    historyLength: Number.isInteger(window.navigation?.currentEntry?.index) ? window.navigation.currentEntry.index + 1 : history.length,
    historyState: history.state
  };
}

async function visibleShellFrame(page) {
  const handle = await page.$('#view:not([hidden])');
  return handle ? handle.contentFrame() : null;
}

async function captureOnce(page, { frame = null, panels = [] } = {}) {
  const target = await visibleShellFrame(page) || frame;
  const selectors = [...DEFAULT_PANELS, ...panels];
  const shell = await page.evaluate(captureDocument, selectors);
  if (!target) return { ...shell, frame: null, frameHistoryLength: 0, frameUrl: '' };
  const inner = await target.evaluate(captureDocument, selectors);
  return {
    ...shell,
    frame: inner,
    frameHistoryLength: inner.historyLength,
    frameUrl: target.url(),
    panels: [...shell.panels.map(selector => `shell:${selector}`), ...inner.panels.map(selector => `frame:${selector}`)],
    selectedMoment: inner.selectedMoment || shell.selectedMoment,
    scroll: { shell: shell.scroll, frame: inner.scroll }
  };
}

export async function backState(page, options = {}) {
  const navigational = /Execution context was destroyed|most likely because of a navigation|Target closed|Frame was detached/;
  let last = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try { return await captureOnce(page, options); }
    catch (error) {
      last = error;
      if (!navigational.test(String(error?.message || error))) throw error;
      await page.waitForTimeout(50);
    }
  }
  throw last;
}

function comparable(state) {
  const { historyLength, frameHistoryLength, frameUrl, historyState, frame, ...rest } = state;
  if (!frame) return rest;
  const { historyLength: innerHistoryLength, historyState: innerHistoryState, ...inner } = frame;
  return { ...rest, frame: inner };
}

function sameState(a, b) {
  try { assert.deepEqual(comparable(a), comparable(b)); return true; } catch { return false; }
}

// #1298: 화면을 연 뒤 주소에 ?tree=…&moment=…를 덧붙이는 일이 끝날 때까지 기다린다.
// 고정 시간 대기가 아니라, 주소와 셸 기록이 연속 두 프레임 같은지를 본다.
async function settleShell(page, waitMs) {
  await page.evaluate(() => { delete window.__ltSettleKey; delete window.__ltSettleAt; });
  await page.waitForFunction(() => {
    const key = location.hash + '|' + history.length;
    if (key !== window.__ltSettleKey) {
      window.__ltSettleKey = key;
      window.__ltSettleAt = performance.now();
      return false;
    }
    return performance.now() - (window.__ltSettleAt || 0) >= 32;
  }, null, { timeout: waitMs, polling: 'raf' }).catch(() => {});
}

// 셸이 안쪽 메시지를 받은 뒤 기록을 늘린다 — 메시지 도착을 실제 신호로 본다(#1412 측정).
async function installObserver(target, { messages = false } = {}) {
  if (!target) return;
  await evaluateWhenReady(target, withMessages => {
    const root = document.documentElement;
    if (!root) return false;
    if (withMessages && !window.__ltHistoryMsgHook) {
      window.__ltHistoryMsgHook = true;
      window.__ltHistoryMsgSeen = 0;
      addEventListener('message', () => { window.__ltHistoryMsgSeen += 1; });
    }
    if (!window.__ltHistoryDomHook) {
      window.__ltHistoryDomHook = true;
      window.__ltHistoryDomSeen = 0;
      new MutationObserver(() => { window.__ltHistoryDomSeen += 1; })
        .observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
    }
    return true;
  }, messages);
}
const signalCounts = target => target
  ? target.evaluate(() => ({ msg: window.__ltHistoryMsgSeen || 0, dom: window.__ltHistoryDomSeen || 0 }))
  : Promise.resolve({ msg: 0, dom: 0 });

async function waitForGrowth(page, frame, before, waitMs) {
  const targets = [[page, before.historyLength]];
  if (frame) targets.push([frame, before.frameHistoryLength]);
  return Promise.any(targets.map(([target, length]) =>
    target.waitForFunction(n => {
      const index = window.navigation?.currentEntry?.index;
      return Number.isInteger(index) ? index + 1 > n : history.length > n;
    }, length, { timeout: waitMs }).then(() => true)
  )).then(() => true, () => false);
}

async function waitForProcessed(page, frame, before, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const [shell, inner] = await Promise.all([signalCounts(page), signalCounts(frame)]);
    if (shell.msg > before.shell.msg || shell.dom > before.shell.dom || inner.dom > before.inner.dom) return true;
    await page.waitForTimeout(25);
  }
  return false;
}

async function waitForPrevious(page, expected, options) {
  await settleShell(page, Math.min(options.timeoutMs || HISTORY_WAIT_MS, HISTORY_WAIT_MS));
  const deadline = Date.now() + (options.timeoutMs || 5000);
  let current = null;
  while (Date.now() < deadline) {
    current = await backState(page, options);
    if (sameState(current, expected)) return current;
    await page.waitForTimeout(50);
  }
  assert.deepEqual(comparable(current), comparable(expected), `뒤로 가기 한 번에 바로 전 상태로 돌아와야 한다 / 기록 상태: ${JSON.stringify({ before: expected.historyState, after: current.historyState })}`);
  return current;
}

export async function testBackNavigation(page, { frame = null, recorded, action, panels = [], timeoutMs = 5000 } = {}) {
  assert.equal(typeof action, 'function', 'action 함수가 필요하다');
  assert.equal(typeof recorded, 'boolean', '기록함 여부를 true/false로 선언해야 한다');
  const options = { frame, panels, timeoutMs };
  const waitMs = Math.min(timeoutMs || HISTORY_WAIT_MS, HISTORY_WAIT_MS);
  await installObserver(page, { messages: true });
  await installObserver(frame);
  const before = await backState(page, options);
  const signalsBefore = { shell: await signalCounts(page), inner: await signalCounts(frame) };
  await action();

  if (recorded) {
    const hashAfter = await page.evaluate(() => location.hash);
    if (hashAfter !== before.hash) {
      await page.waitForFunction(({ n, hash }) => history.length > n && location.hash === hash, { n: before.historyLength, hash: hashAfter }, { timeout: waitMs }).catch(() => {});
    }
    const grew = await waitForGrowth(page, frame, before, waitMs);
    await settleShell(page, waitMs);
    const afterAction = await backState(page, options);
    const sameFrame = before.frameUrl === afterAction.frameUrl;
    const shellGrowth = afterAction.historyLength - before.historyLength;
    const frameGrowth = sameFrame ? afterAction.frameHistoryLength - before.frameHistoryLength : 0;
    const lengths = {
      shellBefore: before.historyLength,
      shellAfter: afterAction.historyLength,
      frameBefore: before.frameHistoryLength,
      frameAfter: afterAction.frameHistoryLength
    };
    assert.equal(grew, true, `기록하는 동작 후 기록이 늘어나야 한다 / ${JSON.stringify({ ...lengths, messageSeen: (await signalCounts(page)).msg - signalsBefore.shell.msg })}`);
    assert.ok(
      shellGrowth >= 0 && frameGrowth >= 0 && shellGrowth <= 1 && frameGrowth <= 1 && (shellGrowth === 1 || frameGrowth === 1),
      `기록하는 동작은 history를 한 칸 늘린다 / ${JSON.stringify(lengths)}`
    );
    const backTarget = frameGrowth > 0 ? (await visibleShellFrame(page) || frame) : page;
    await backTarget.evaluate(() => history.back());
    const afterBack = await waitForPrevious(page, before, options);
    return { before, afterAction, afterBack };
  }

  await waitForProcessed(page, frame, signalsBefore, waitMs);
  await settleShell(page, waitMs);
  await page.waitForTimeout(OBSERVE_MS);
  const afterAction = await backState(page, options);
  assert.ok(
    afterAction.historyLength === before.historyLength && afterAction.frameHistoryLength === before.frameHistoryLength,
    `기록하지 않는 동작은 history.length를 늘리지 않는다 / ${JSON.stringify({ shellBefore: before.historyLength, shellAfter: afterAction.historyLength, frameBefore: before.frameHistoryLength, frameAfter: afterAction.frameHistoryLength })}`
  );
  return { before, afterAction, afterBack: null };
}

// #1298: 단순 옵션 변경에서 브라우저 방문 기록이 늘어나지 않는지 확인한다.
export async function expectNoHistoryGrowth(page, action, label) {
  await installObserver(page, { messages: true });
  const before = { length: await page.evaluate(() => history.length), signals: await signalCounts(page) };
  await action();
  const deadline = Date.now() + HISTORY_WAIT_MS;
  while (Date.now() < deadline) {
    const now = await signalCounts(page);
    if (now.msg > before.signals.msg || now.dom > before.signals.dom) break;
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(OBSERVE_MS);
  const after = await page.evaluate(() => history.length);
  assert.equal(after, before.length, label + ': 방문 기록 증가 0');
}
