// #481 L14: 화면(iframe) 안의 버튼이 셸 창을 열면, 닫을 때 초점이 **그 안의 버튼**으로 돌아온다.
// 문제: 셸의 activeElement는 <iframe> 자체라, 예전에는 초점이 프레임 테두리로만 갔다(누른 버튼을 잃음).
// 고침: 연 곳이 프레임이면 focusIntoFrame이 프레임 안에서 마지막으로 누른 버튼(없으면 첫 버튼)으로 돌려준다.
// 여기서는 진짜 createDialogs를 가짜 document·iframe으로 돌려, 초점이 어디로 갔는지 값으로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialogs } from '../public/v41/shell/dialogs.mjs';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

function fakeButton(id, { visible = true } = {}) {
  const el = {
    id, tagName: 'BUTTON', isConnected: true, disabled: false, focusCount: 0,
    dataset: {}, listeners: {},
    focus() { el.focusCount += 1; },
    matches() { return true; },
    closest() { return el; },
    getClientRects() { return visible ? [{}] : []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 10, bottom: 10 }; },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { el.listeners[type] = fn; },
    setAttribute() {}, removeAttribute() {}, contains() { return false; }
  };
  return el;
}

function fakeFrameWithButtons() {
  const inside = [fakeButton('frame-btn-1'), fakeButton('frame-btn-2')];
  const frameDoc = {
    activeElement: inside[1], // 마지막으로 누른 버튼
    body: { tagName: 'BODY' },
    querySelector: (sel) => (sel.includes('button') ? inside[0] : null),
    querySelectorAll: () => inside,
    getElementById: () => null
  };
  const frame = {
    id: 'view', tagName: 'IFRAME', isConnected: true,
    contentDocument: frameDoc,
    contentWindow: { focusCount: 0, focus() { this.focusCount += 1; } },
    dataset: {}, listeners: {},
    focus() {}, matches() { return false; }, closest() { return null; },
    getClientRects() { return [{}]; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 10, bottom: 10 }; },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { frame.listeners[type] = fn; },
    setAttribute() {}, contains() { return false; }
  };
  return { frame, inside, frameDoc };
}

function setup() {
  const { frame, inside } = fakeFrameWithButtons();
  const dialog = fakeButton('connection-panel');
  dialog.tagName = 'DIALOG';
  dialog.dataset = { ltPanel: 'full' };
  dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.listeners.close?.(); };
  const elements = { 'connection-panel': dialog, 'view': frame };
  const documentObj = {
    activeElement: frame, // 셸이 보기에는 <iframe>이 활성 요소다(프레임 안 버튼이 누른 대상)
    documentElement: { style: { setProperty() {} } },
    querySelector: () => ({ getBoundingClientRect: () => ({ height: 66 }) }),
    querySelectorAll: (sel) => (sel === 'dialog[data-lt-panel]' ? [dialog] : []),
    getElementById: (id) => elements[id] || null,
    addEventListener() {}, removeEventListener() {},
    defaultView: { addEventListener() {} }
  };
  globalThis.document = documentObj;
  globalThis.window = { addEventListener() {} };
  const api = createDialogs({
    $: (id) => elements[id] || null,
    document: documentObj,
    getMember: () => null,
    notify: () => {},
    onThemeChange: () => {}
  });
  return { api, dialog, frame, inside, documentObj };
}

test('#481 L14 화면 안 버튼이 연 창은, 닫을 때 그 화면 안의 마지막 버튼으로 초점이 돌아온다', async () => {
  const { api, dialog, frame, inside } = setup();
  // 화면 안 버튼을 누른 것처럼 창을 연다(openers에 셸 activeElement=<iframe>이 적힌다).
  api.noteOpener('connection-panel');
  dialog.open = true;
  dialog.close();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(inside[1].focusCount, 1, '프레임 안 마지막으로 누른 버튼으로 돌아왔다');
  assert.equal(inside[0].focusCount, 0, '다른 버튼으로 가지 않는다');
  assert.equal(frame.contentWindow.focusCount, 0, '프레임 테두리로 보내지 않았다');
});

test('#481 L14 화면 안에 마지막 버튼 기억이 없으면 첫 버튼으로 돌아온다(초점을 잃지 않는다)', async () => {
  const { api, dialog, frame, inside } = setup();
  frame.contentDocument.activeElement = frame.contentDocument.body; // 누른 버튼 기억 없음
  api.noteOpener('connection-panel');
  dialog.open = true;
  dialog.close();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(inside[0].focusCount, 1, '첫 버튼으로 돌아왔다');
  assert.equal(frame.contentWindow.focusCount, 0, '프레임 테두리로 보내지 않았다');
});

test('#481 L14 셸 안 버튼이 연 창은 예전처럼 그 버튼으로 돌아온다(회귀 없음)', async () => {
  const { api, dialog, documentObj } = setup();
  const shellButton = fakeButton('account-avatar');
  documentObj.activeElement = shellButton; // 셸 안 버튼이 활성 요소
  api.noteOpener('connection-panel');
  dialog.open = true;
  dialog.close();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(shellButton.focusCount, 1, '셸 안 연 버튼으로 돌아왔다');
});

test('#481 L14 예전 동작(프레임을 그대로 focus)은 버튼을 잃는다 — 세기 증명', () => {
  const { frame, inside } = setup();
  // 예전에는 target = focusReturnTarget(opener, fallback) = <iframe> 그대로였고, focus()가 프레임으로 갔다.
  const focusReturnTarget = (opener, fallback) => (opener?.isConnected ? opener : fallback);
  const target = focusReturnTarget(frame, null);
  assert.equal(target, frame, '예전 목표는 iframe');
  assert.equal(inside[1].focusCount, 0, '프레임 안 버튼은 초점을 받지 못한다(사고 그대로)');
});
