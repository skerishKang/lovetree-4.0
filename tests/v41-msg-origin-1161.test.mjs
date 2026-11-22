// #1161 화면이 받는 메시지의 보낸 곳 확인.
// 같은 출처의 부모 창에서 보낸 값은 반영하고, 다른 출처나 다른 창에서 보낸 값은 화면 상태를 바꾸지 않음을 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_MESSAGES, MSG, isShellMessage } from '../public/v41/frame-messages.mjs';

const ROOT = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, ROOT), 'utf8');

function withGlobals(locationOrigin, parentWindow, fn) {
  const savedLocation = globalThis.location;
  const savedWindow = globalThis.window;
  globalThis.location = { origin: locationOrigin };
  globalThis.window = { parent: parentWindow };
  try { fn(); } finally {
    if (savedLocation === undefined) delete globalThis.location; else globalThis.location = savedLocation;
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
  }
}

// 이슈 #1161 본문이 짚은 수신 분기 (화면과 메시지 이름).
const CASES = [
  ['public/v41/views/board/board-extras.js', 'titleDisplay'],
  ['public/v41/views/book/book-extra.js', 'treesRenamed'],
  ['public/v41/views/book/book-extra.js', 'treesSaved'],
  ['public/v41/views/book/book-extra.js', 'titleDisplay'],
  ['public/v41/views/book/book-extra.js', 'pageTurn'],
  ['public/v41/views/book/book-extra.js', 'dateStyle'],
  ['public/v41/views/network/network.js', 'networkView'],
  ['public/v41/views/shelf/shelf.js', 'shelfSelectTree'],
  ['public/v41/views/track56-network.html', 'dateStyle'],
  ['public/v41/views/track58-pinboard.html', 'dateStyle'],
  ['public/v41/views/shelf/shelf.js', 'shelfView'],
  ['public/v41/views/shelf/shelf.js', 'treesSaved'],
  ['public/v41/views/shelf/shelf.js', 'treesRenamed'],
  ['public/v41/views/book/book-extra.js', 'storySaved'],
  ['public/v41/views/book/book.js', 'momentsSaved'],
];

test('같은 출처의 부모 창에서 온 셸→화면 메시지는 모든 수신 분기에서 반영된다', () => {
  const origin = 'https://lovetree-4-0.pages.dev';
  const parentWindow = {};
  withGlobals(origin, parentWindow, () => {
    for (const [file, key] of CASES) {
      const entry = FRAME_MESSAGES[key];
      assert.ok(entry, `${file} ${key}: 표에 있다`);
      assert.ok(entry.from.includes('셸') && entry.to.includes('화면'), `${file} ${key}: 방향이 셸→화면이다`);
      assert.equal(MSG[key], entry.name, `${file} ${key}: 이름이 표와 같다`);
      const event = { origin, source: parentWindow, data: { type: MSG[key] } };
      assert.equal(isShellMessage(event), true, `${file} ${key}: 같은 출처·부모 창은 참이다`);
    }
  });
});

test('다른 출처에서 온 같은 이름 메시지는 모든 수신 분기에서 거부된다', () => {
  const origin = 'https://lovetree-4-0.pages.dev';
  const parentWindow = {};
  withGlobals(origin, parentWindow, () => {
    for (const [file, key] of CASES) {
      const event = { origin: 'https://evil.test', source: parentWindow, data: { type: MSG[key] } };
      assert.equal(isShellMessage(event), false, `${file} ${key}: 다른 출처는 거짓이다`);
    }
  });
});

test('다른 창에서 온 같은 이름 메시지는 모든 수신 분기에서 거부된다', () => {
  const origin = 'https://lovetree-4-0.pages.dev';
  const parentWindow = {};
  withGlobals(origin, parentWindow, () => {
    for (const [file, key] of CASES) {
      const event = { origin, source: {}, data: { type: MSG[key] } };
      assert.equal(isShellMessage(event), false, `${file} ${key}: 다른 창은 거짓이다`);
    }
  });
});

test('표에 없는 이름과 화면→셸 방향은 같은 출처·부모 창이어도 거부된다', () => {
  const origin = 'https://lovetree-4-0.pages.dev';
  const parentWindow = {};
  withGlobals(origin, parentWindow, () => {
    assert.equal(isShellMessage({ origin, source: parentWindow, data: { type: 'lt41-nope' } }), false, '표 밖 이름은 거짓이다');
    assert.equal(isShellMessage({ origin, source: parentWindow, data: { type: MSG.write } }), false, '화면→셸 종류는 거짓이다');
    assert.equal(isShellMessage({ origin, source: parentWindow, data: { type: MSG.select } }), false, '화면→셸 선택 종류는 거짓이다');
    assert.equal(isShellMessage(null), false, '없으면 거짓이다');
    assert.equal(isShellMessage({ origin, source: parentWindow, data: null }), false, '본문이 없으면 거짓이다');
  });
});

test('수신 분기마다 화면 상태를 바꾸기 전에 공통 확인을 거친다', () => {
  const board = read('public/v41/views/board/board-extras.js');
  assert.ok(board.includes('globalThis.LT41_MSG.titleDisplay') && board.includes('LT41_isShellMessage'), '보드 제목 보기 분기에 공통 확인이 있다');
  const bookExtra = read('public/v41/views/book/book-extra.js');
  for (const key of ['treesRenamed', 'treesSaved', 'titleDisplay', 'pageTurn', 'dateStyle', 'storySaved']) {
    assert.ok(bookExtra.includes(`MSG.${key}`), `책 ${key} 분기가 표 이름을 쓴다`);
  }
  assert.ok((bookExtra.match(/isShellMessage\(/g) || []).length >= 6, '책 화면 수신 분기 6곳이 공통 확인을 부른다');
  const shelf = read('public/v41/views/shelf/shelf.js');
  assert.ok(shelf.includes('isShellMessage(e)'), '서재 수신 분기가 공통 확인을 거친다');
  const book = read('public/v41/views/book/book.js');
  assert.ok(book.includes('LT41_isShellMessage'), '책 순간 저장 분기에 공통 확인이 있다');
  const network = read('public/v41/views/network/network.js');
  assert.ok(network.includes('LT41_MSG.networkView') && network.includes('LT41_isShellMessage'), '지도 기본 보기 분기에 공통 확인이 있다');
  // 지도 기능은 바꾸지 않는다 — 보기 정규화와 전환 호출이 그대로다.
  assert.match(network, /e\.data\.value\s*===\s*'concentric'\s*\?\s*'tag'\s*:\s*e\.data\.value/, '지도 보기 정규화가 그대로다');
  assert.ok(network.includes('setView(v)'), '지도 보기 전환 호출이 그대로다');
  for (const file of ['public/v41/views/track56-network.html', 'public/v41/views/track58-pinboard.html']) {
    const source = read(file);
    assert.ok(source.includes('isShellMessage(e)'), `${file}: 날짜 표기 분기에 공통 확인이 있다`);
  }
});
