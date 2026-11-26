// #792 1단계-가: 순간 시작·끝 구간 데이터 약속. 화면 없이 규칙·순수 함수·저장 왕복만 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createTree, addMoment, validateState, validateMomentInput as serverValidate, quickAdd as serverQuickAdd } from '../src/domain.js';
import { validateMomentInput as browserValidate, quickAdd as browserQuickAdd } from '../public/v41/domain.mjs';
import * as server from '../src/moment-range.js';
import * as browser from '../public/v41/domain.mjs';
import {CAPTURE_DEFAULT_SECONDS, capturedRange, endForDuration, endTextForDuration, loopBoundaryReached, createSegmentCapture} from '../public/v41/segment-capture.mjs';

const BASE = { title: '기억할 순간', date: '2026-11-17', url: '' };
const START_ERROR = '시작 시간은 01:30 또는 01:02:30 형식으로 적어 주세요.';
const END_ERROR = '끝 시간은 시작 시간보다 뒤여야 해요.';

for (const [name, lib] of [['서버', server], ['화면', browser]]) {
  test(`${name}: parseTimecode는 분·시 형식과 초 숫자를 초로 바꾼다`, () => {
    assert.equal(lib.parseTimecode('01:30'), 90);
    assert.equal(lib.parseTimecode('1:02:30'), 3750);
    assert.equal(lib.parseTimecode('90'), 90);
    assert.equal(lib.parseTimecode('0'), 0);
    assert.equal(lib.parseTimecode('1m35s'), 95);
    assert.equal(lib.parseTimecode('12:00:00'), 43200);
    for (const bad of ['1:60', '1:02:60', '12:00:01', '-1', '43201', '1:2:3:4', 'abc', '1:30s', '1m60s', '', null]) {
      assert.equal(lib.parseTimecode(bad), null, `${JSON.stringify(bad)}는 틀린 값`);
    }
  });

  test(`${name}: formatRange는 '0:42–1:08' 또는 '0:42부터'로 적는다`, () => {
    assert.equal(lib.formatRange(42, 68), '0:42–1:08');
    assert.equal(lib.formatRange(42, null), '0:42부터');
    assert.equal(lib.formatRange(0, 42), '0:00–0:42');
    assert.equal(lib.formatRange(3723, 3750), '1:02:03–1:02:30');
    assert.equal(lib.formatRange(68, 42), '1:08부터', '끝이 앞서면 끝을 붙이지 않는다');
    assert.equal(lib.formatRange(null, 42), '');
  });

  test(`${name}: formatTimecode는 초를 입력 칸 표기(1:30·1:02:30)로 되돌린다`, () => {
    assert.equal(lib.formatTimecode(0), '0:00');
    assert.equal(lib.formatTimecode(42), '0:42');
    assert.equal(lib.formatTimecode(90), '1:30');
    assert.equal(lib.formatTimecode(3723), '1:02:03');
    assert.equal(lib.formatTimecode(null), '');
    assert.equal(lib.formatTimecode('90'), '1:30');
  });

  test(`${name}: fillStartFromUrl은 빈 시작 칸만 주소의 t=로 채운다`, () => {
    assert.equal(lib.fillStartFromUrl('https://youtu.be/x?t=90s', ''), 90);
    assert.equal(lib.fillStartFromUrl('https://www.youtube.com/watch?v=x&start=1:30', '  '), 90);
    assert.equal(lib.fillStartFromUrl('https://youtu.be/x?t=90s', '1:00'), null, '이미 적은 값은 건드리지 않는다');
    assert.equal(lib.fillStartFromUrl('https://youtu.be/x', ''), null);
  });

  test(`${name}: youtubeRangeEmbedUrl은 끝이 시작보다 클 때만 end를 붙인다`, () => {
    assert.equal(lib.youtubeRangeEmbedUrl('abcdefghijk', 42, 68), 'https://www.youtube.com/embed/abcdefghijk?start=42&end=68&rel=0');
    assert.equal(lib.youtubeRangeEmbedUrl('abcdefghijk', 42, 42), 'https://www.youtube.com/embed/abcdefghijk?start=42&rel=0');
    assert.equal(lib.youtubeRangeEmbedUrl('abcdefghijk', 42, null), 'https://www.youtube.com/embed/abcdefghijk?start=42&rel=0');
    assert.equal(lib.youtubeRangeEmbedUrl('', 42, 68), '');
  });

  test(`${name}: startFromUrl은 t=·start=를 물음표와 해시에서 읽는다`, () => {
    assert.equal(lib.startFromUrl('https://www.youtube.com/watch?v=abcdefghijk&t=90s'), 90);
    assert.equal(lib.startFromUrl('https://www.youtube.com/watch?v=abcdefghijk&start=1:30'), 90);
    assert.equal(lib.startFromUrl('https://www.youtube.com/watch?v=abcdefghijk#t=42'), 42);
    assert.equal(lib.startFromUrl('https://www.youtube.com/watch?v=abcdefghijk'), null);
  });

  test(`${name}: validateRange는 선택 값이고 경계·오류 문구를 지킨다`, () => {
    assert.deepEqual(lib.validateRange(BASE), {}, '둘 다 없으면 키를 만들지 않는다');
    assert.deepEqual(lib.validateRange({ ...BASE, startSeconds: '01:30' }), { startSeconds: 90 });
    assert.deepEqual(lib.validateRange({ ...BASE, endSeconds: '1:08' }), { startSeconds: 0, endSeconds: 68 }, '끝만 있으면 시작 0');
    assert.deepEqual(lib.validateRange({ ...BASE, startSeconds: '', url: 'https://youtu.be/x?t=42' }), { startSeconds: 42 }, '주소에서 시작 채움');
    assert.deepEqual(lib.validateRange({ ...BASE, startSeconds: '12:00:00' }), { startSeconds: 43200 });
    assert.throws(() => lib.validateRange({ ...BASE, startSeconds: '1:60' }), { message: START_ERROR });
    assert.throws(() => lib.validateRange({ ...BASE, startSeconds: '01:30', endSeconds: '01:30' }), { message: END_ERROR });
    assert.throws(() => lib.validateRange({ ...BASE, endSeconds: 'evil' }), { message: END_ERROR });
  });
}

test('두 사본의 순수 함수는 같은 입력에 같은 값을 준다', () => {
  const samples = ['0', '01:30', '1:02:30', '90', '12:00:00', '1:60', 'abc', null];
  for (const value of samples) assert.equal(server.parseTimecode(value), browser.parseTimecode(value), `parseTimecode ${value}`);
  for (const seconds of [0, 42, 90, 3723, null, '90']) assert.equal(server.formatTimecode(seconds), browser.formatTimecode(seconds), `formatTimecode ${seconds}`);
  for (const [url, value] of [['https://youtu.be/x?t=90s', ''], ['https://youtu.be/x', ''], ['https://youtu.be/x?t=90s', '1:00']]) {
    assert.equal(server.fillStartFromUrl(url, value), browser.fillStartFromUrl(url, value), `fillStartFromUrl ${url} ${value}`);
  }
  const ranges = [[42, 68], [42, null], [0, 42], [3723, 3750], [null, 42]];
  for (const [a, b] of ranges) {
    assert.equal(server.formatRange(a, b), browser.formatRange(a, b));
    assert.equal(server.youtubeRangeEmbedUrl('abcdefghijk', a, b), browser.youtubeRangeEmbedUrl('abcdefghijk', a, b));
  }
  const inputs = [BASE, { ...BASE, startSeconds: '1:30' }, { ...BASE, endSeconds: '1:08' }, { ...BASE, startSeconds: '', url: 'https://youtu.be/x?t=42' }];
  for (const input of inputs) {
    assert.deepEqual(server.validateRange(input), browser.validateRange(input));
    assert.deepEqual(server.rangeFields(input), browser.rangeFields(input));
  }
});

for (const [name, validate] of [['서버', serverValidate], ['화면', browserValidate]]) {
  test(`${name}: validateMomentInput은 구간 키를 결과에 넣고, 없으면 넣지 않는다`, () => {
    const plain = validate(BASE);
    assert.ok(!Object.prototype.hasOwnProperty.call(plain, 'startSeconds'));
    assert.ok(!Object.prototype.hasOwnProperty.call(plain, 'endSeconds'));
    const ranged = validate({ ...BASE, startSeconds: '01:30', endSeconds: '02:08' });
    assert.equal(ranged.startSeconds, 90);
    assert.equal(ranged.endSeconds, 128);
  });
}

test('불러오기 정규화는 틀린 구간 필드만 버리고 순간은 살린다', () => {
  const clock = '2026-11-17T00:00:00.000Z';
  const tree = createTree({ ...BASE, subject: '시험' }, clock);
  const grown = addMoment(tree, { ...BASE, title: '둘째', relation: '기억나서' }, tree.moments[0].id, clock);
  const state = { version: 1, trees: [{ ...grown, moments: grown.moments.map((m, i) => i === 0 ? { ...m, startSeconds: '틀림', endSeconds: -1 } : m) }] };
  const normalized = validateState(state);
  assert.equal(normalized.trees[0].moments.length, 2, '순간은 그대로다');
  assert.ok(!Object.prototype.hasOwnProperty.call(normalized.trees[0].moments[0], 'startSeconds'));
  assert.ok(!Object.prototype.hasOwnProperty.call(normalized.trees[0].moments[0], 'endSeconds'));
});

test('저장→불러오기 왕복: 서버가 startSeconds·endSeconds를 지우지 않는다', async () => {
  const repo = createMemoryWorkspaceRepo();
  const service = createWorkspaceService({ repo, productId: 'lovetree-4-0' });
  const principal = { productId: 'lovetree-4-0', subjectId: 'sub_range0000001' };
  const clock = '2026-11-17T00:00:00.000Z';
  const tree = createTree({ ...BASE, subject: '시험' }, clock);
  const grown = addMoment(tree, { ...BASE, title: '둘째', relation: '기억나서' }, tree.moments[0].id, clock);
  const state = { version: 1, trees: [{ ...grown, moments: grown.moments.map((m, i) => i === 0 ? { ...m, startSeconds: 42, endSeconds: 68 } : m) }] };
  const write = await service.write(principal, { state, expectedRevision: 0, clientKey: 'range-roundtrip-1' });
  const read = await service.read(principal);
  assert.equal(write.revision, 1);
  assert.equal(read.state.trees[0].moments[0].startSeconds, 42);
  assert.equal(read.state.trees[0].moments[0].endSeconds, 68);
  assert.equal(typeof read.state.trees[0].moments[1].startSeconds, 'undefined', '값이 없는 순간은 키 자체가 없다');
});


test('#792 2단계: 재생 위치를 시작으로 담고 길이 단추별 끝·반복 경계를 만든다', () => {
  assert.deepEqual(capturedRange(90.7), { start: 90, end: 100 }, '지금 위치(내림)+기본 10초');
  assert.deepEqual(capturedRange(89.9, 5), { start: 89, end: 94 });
  assert.equal(CAPTURE_DEFAULT_SECONDS, 10);
  assert.equal(endForDuration(90, '5'), 95);
  assert.equal(endForDuration(90, '10'), 100);
  assert.equal(endForDuration(90, '15'), 105);
  assert.equal(endForDuration(90, 'none'), null, '끝 없이는 책갈피');
  assert.equal(endTextForDuration(90, '5'), '1:35');
  assert.equal(endTextForDuration(90, '15'), '1:45');
  assert.equal(endTextForDuration(90, 'none'), '', '끝 칸을 비운다');
  assert.equal(loopBoundaryReached(99.8, 90, 100), true, '끝에 닿으면 시작으로');
  assert.equal(loopBoundaryReached(99.0, 90, 100), false);
  assert.equal(loopBoundaryReached(100, 100, 100), false, '끝이 시작과 같으면 반복하지 않는다');
  assert.equal(loopBoundaryReached(100, 90, 90), false);
});


test('#792 2단계: 재생기에서 담기·길이 단추·반복이 칸 값을 바꾼다', async () => {
  const listeners = new Map();
  const element = (extra = {}) => ({
    hidden: false, value: '', checked: false, textContent: '', dataset: {},
    addEventListener(type, fn) { const list = listeners.get(this)?.get(type) || []; list.push(fn); listeners.set(this, (listeners.get(this) || new Map()).set(type, list)); },
    setAttribute(name, value) { this[name] = String(value); },
    querySelectorAll() { return []; },
    fire(type) { for (const fn of listeners.get(this)?.get(type) || []) fn({}); },
    ...extra
  });
  const start = element(), end = element();
  const loop = element({ checked: false });
  const status = element({ hidden: true });
  const capture = element();
  const durations = ['5', '10', '15', 'none'].map((value) => element({ dataset: { segmentDuration: value } }));
  const block = element();
  block.querySelectorAll = () => durations;
  const byId = { 'segment-capture': block, 'segment-loop': loop, 'segment-status': status, 'segment-capture-start': capture };
  const scope = { querySelector: (selector) => byId[selector.slice(1)] || null };
  const form = { elements: { startSeconds: start, endSeconds: end } };
  let time = 90, plays = 0;
  const seeks = [];
  const player = { getCurrentTime: () => time, seekTo: (seconds) => { seeks.push(seconds); time = seconds; }, playVideo: () => { plays += 1; } };
  const controller = createSegmentCapture({ player, form, scope });
  assert.ok(controller, '컨트롤을 연결한다');

  capture.fire('click');
  assert.equal(start.value, '1:30', '지금 위치(90초)가 시작');
  assert.equal(end.value, '1:40', '기본 10초 뒤가 끝');
  assert.equal(status.hidden, false);

  durations[0].fire('click');
  assert.equal(end.value, '1:35', '5초');
  durations[2].fire('click');
  assert.equal(end.value, '1:45', '15초');
  durations[3].fire('click');
  assert.equal(end.value, '', '끝 없이 — 끝 칸을 비운다');
  durations[1].fire('click');
  assert.equal(end.value, '1:40', '10초');

  start.value = '1:30'; end.value = '1:40';
  loop.checked = true;
  loop.fire('change');
  assert.equal(seeks.at(-1), 90, '반복을 켜면 시작으로 돌아간다');
  time = 100;
  await new Promise((resolve) => setTimeout(resolve, 320));
  assert.equal(seeks.at(-1), 90, '끝에 닿으면 시작으로 돌아간다');
  assert.ok(plays >= 2, '반복 재생한다');
  controller.destroy();
});

test('#1316 쉬운 추가는 주소의 시작 초를 일반 추가와 같은 해석으로 저장한다', () => {
  const clock = '2026-11-26T00:00:00.000Z';
  const cases = [
    ['https://youtu.be/abcdefghijk?t=95', 95],
    ['https://youtu.be/abcdefghijk?t=95s', 95],
    ['https://www.youtube.com/watch?v=abcdefghijk&t=1m35s', 95],
    ['https://www.youtube.com/watch?v=abcdefghijk&start=95', 95],
    ['https://youtu.be/abcdefghijk', 0],
    ['https://youtu.be/abcdefghijk?t=abc', 0],
  ];
  for (const [name, quickAdd] of [['서버', serverQuickAdd], ['화면', browserQuickAdd]]) {
    for (const [url, expected] of cases) {
      const saved = quickAdd({ version: 1, trees: [], prefs: {} }, { url }, clock).state.trees[0].moments[0];
      assert.equal(saved.startSeconds ?? 0, expected, `${name} ${url}`);
      assert.equal(saved.url, url, `${name} 주소는 그대로`);
    }
  }
  const tree = createTree({ ...BASE, subject: '시험' }, clock);
  const normal = addMoment(tree, { ...BASE, title: '둘째', startSeconds: '01:35' }, tree.moments[0].id, clock);
  assert.equal(normal.moments.at(-1).startSeconds, 95, '일반 추가는 명시한 시작 초를 지킨다');
});
