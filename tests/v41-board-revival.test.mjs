// #372 후속(대표 결정 1-나): 기억 보드 꾸미기 되살리기 — 보기 전용 규칙 제거·단순/고급·#replayFrom 제거.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyAdvancedMode, installAdvancedMode } from '../public/v41/views/board/board-mode.mjs';
import { validateState as validateV41 } from '../public/v41/domain.mjs';
import { validateState as validate40 } from '../src/domain.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HTML = read('public/v41/views/track58-pinboard.html');
const BOARD_JS = read('public/v41/views/board/board.js');
const EXTRAS_JS = read('public/v41/views/board/board-extras.js');

// 보기 전용 규칙(숨김 목록 + 핀 포인터 차단)이 있는지. 469c592 이후의 옛 규칙을 그대로 넣으면 true가 된다.
function hasViewOnlyRule(html) {
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
  const hiddenIds = /#addBtn\s*,\s*#toolAdd\s*,\s*#editMomentBtn\s*,\s*#undoBtn\s*,\s*#quickPin\s*,\s*#quickCard/.test(style);
  const pinBlocked = /\.pin\s*\{[^}]*pointer-events\s*:\s*none/.test(style);
  return hiddenIds || pinBlocked;
}

test('보기 전용 규칙이 없다 — 숨김 목록·핀 포인터 차단 제거, [hidden]만 유지', () => {
  assert.equal(hasViewOnlyRule(HTML), false);
  assert.match(HTML, /\[hidden\]\{display:none!important\}/);
  // 강도 증명: 옛 규칙을 되돌리면 이 시험이 실제로 잡는다.
  assert.equal(hasViewOnlyRule('<style>#addBtn,#toolAdd,#editMomentBtn,#undoBtn,#quickPin,#quickCard,[hidden]{display:none!important}.pin{pointer-events:none}</style>'), true);
  assert.equal(hasViewOnlyRule('<style>.pin{pointer-events:none}</style>'), true);
});

test('#replayFrom은 HTML·보드 스크립트에서 사라졌다', () => {
  assert.equal(HTML.includes('replayFrom'), false);
  assert.equal(BOARD_JS.includes('replayFrom'), false);
  assert.equal(EXTRAS_JS.includes('replayFrom'), false);
});

test('lt-advanced 메시지로 body 클래스가 켜지고 꺼진다 — 메시지가 없으면 단순', () => {
  const classes = new Set();
  const doc = { body: { classList: {
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    contains(name) { return classes.has(name); },
  } } };
  assert.equal(classes.has('lt-advanced'), false); // 기본 = 단순
  assert.equal(applyAdvancedMode(doc, true), true);
  assert.equal(classes.has('lt-advanced'), true);
  assert.equal(applyAdvancedMode(doc, false), false);
  assert.equal(classes.has('lt-advanced'), false);
  assert.equal(applyAdvancedMode(doc, 'yes'), false); // true일 때만 켠다
});

test('설치된 수신기는 같은 출처의 lt41-advanced만 적용한다', () => {
  const listeners = [];
  const classes = new Set();
  const doc = { body: { classList: {
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    contains(name) { return classes.has(name); },
  } } };
  const win = { location: { origin: 'https://example.test' }, addEventListener: (type, fn) => listeners.push(fn) };
  installAdvancedMode(win, doc);
  const fire = (origin, data) => listeners.forEach((fn) => fn({ origin, data }));
  fire('https://evil.test', { type: 'lt41-advanced', value: true });
  assert.equal(classes.has('lt-advanced'), false);
  fire('https://example.test', { type: 'other', value: true });
  assert.equal(classes.has('lt-advanced'), false);
  fire('https://example.test', { type: 'lt41-advanced', value: true });
  assert.equal(classes.has('lt-advanced'), true);
  fire('https://example.test', { type: 'lt41-advanced', value: false });
  assert.equal(classes.has('lt-advanced'), false);
});

const treeWith = (moment) => ({ version: 1, trees: [{ id: 't', subject: '대상', title: '나무', coverMomentId: '', coverDesign: '', inbox: false, createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z', moments: [{ id: 'm0', parentId: null, links: [], title: '순간', note: '', emotion: '설렘', date: '2026-11-10', url: '', createdAt: '2026-11-10T00:00:00.000Z', ...moment }] }] });

test('보드 배치(x·y·rot·pinStyle·cardStyle·color·keywords)가 저장 검증을 통과해 남는다', () => {
  for (const validate of [validateV41, validate40]) {
    const out = validate(treeWith({ x: 123.4, y: 456, rot: 2, pinStyle: 'heart', cardStyle: 'postit', color: 'rose', keywords: ['a', 'b'], evil: 'x' }));
    const m = out.trees[0].moments[0];
    assert.equal(m.x, 123);
    assert.equal(m.y, 456);
    assert.equal(m.rot, 2);
    assert.equal(m.pinStyle, 'heart');
    assert.equal(m.cardStyle, 'postit');
    assert.equal(m.color, 'rose');
    assert.deepEqual(m.keywords, ['a', 'b']);
    assert.equal('evil' in m, false);
  }
});

test('보드 배치 형식이 틀리면 그 항목만 버린다', () => {
  for (const validate of [validateV41, validate40]) {
    const out = validate(treeWith({ x: '1', y: 99999999, rot: 999, pinStyle: 'BAD STYLE!', cardStyle: '', color: 'rose', keywords: ['ok', 'x'.repeat(30), 'bad\u0001'] }));
    const m = out.trees[0].moments[0];
    assert.equal('x' in m, false);
    assert.equal('y' in m, false);
    assert.equal('rot' in m, false);
    assert.equal('pinStyle' in m, false);
    assert.equal('cardStyle' in m, false);
    assert.equal(m.color, 'rose');
    assert.deepEqual(m.keywords, ['ok']);
  }
});

test('보드 저장 다리: lt41-board-sync/boardSync가 연결되어 있다', () => {
  assert.match(BOARD_JS, /lt41-board-sync/);
  assert.match(BOARD_JS, /lt41-board-saved/);
  assert.match(read('public/v41/shell/messages.mjs'), /lt41-board-sync/);
  assert.match(read('public/v41/member-session.mjs'), /boardSync/);
});

// 옛 서버 호환: main의 검증기는 validateMomentInput 허용 목록이므로 모르는 칸(x·y·rot 등)을
// 400 대신 조용히 버린다. 이 허용 목록 행동은 main과 현재가 같아야 옛 서버·새 화면이 안전하다.
test('옛 서버 호환: 검증기 허용 목록이 모르는 배치 칸을 400 대신 버린다', async () => {
  const mods = [await import('../public/v41/domain.mjs'), await import('../src/domain.js')];
  for (const mod of mods) {
    const out = mod.validateMomentInput({ title: '제목', note: '메모', emotion: '설렘', date: '2026-11-11', url: '', x: 123, y: 45, rot: 9, pinStyle: 'heart', keywords: ['a'] });
    assert.equal('x' in out, false);
    assert.equal('y' in out, false);
    assert.equal('rot' in out, false);
    assert.equal('pinStyle' in out, false);
    assert.equal('keywords' in out, false);
    assert.equal(out.title, '제목');
  }
});

test('옛 서버가 저장한 문서(배치 칸 없음)도 현재 검증을 통과한다', () => {
  for (const validate of [validateV41, validate40]) {
    const out = validate(treeWith({}));
    const m = out.trees[0].moments[0];
    assert.equal('x' in m, false);
    assert.equal('keywords' in m, false);
    assert.equal(m.title, '순간');
  }
});
