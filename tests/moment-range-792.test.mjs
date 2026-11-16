// #792 1단계-가: 순간 시작·끝 구간 데이터 약속. 화면 없이 규칙·순수 함수·저장 왕복만 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createTree, addMoment, validateState, validateMomentInput as serverValidate } from '../src/domain.js';
import { validateMomentInput as browserValidate } from '../public/v41/domain.mjs';
import * as server from '../src/moment-range.js';
import * as browser from '../public/v41/domain.mjs';

const BASE = { title: '기억할 순간', date: '2026-11-17', url: '' };
const START_ERROR = '시작 시간은 01:30 또는 01:02:30 형식으로 적어 주세요.';
const END_ERROR = '끝 시간은 시작 시간보다 뒤여야 해요.';

for (const [name, lib] of [['서버', server], ['화면', browser]]) {
  test(`${name}: parseTimecode는 분·시 형식과 초 숫자를 초로 바꾼다`, () => {
    assert.equal(lib.parseTimecode('01:30'), 90);
    assert.equal(lib.parseTimecode('1:02:30'), 3750);
    assert.equal(lib.parseTimecode('90'), 90);
    assert.equal(lib.parseTimecode('0'), 0);
    assert.equal(lib.parseTimecode('12:00:00'), 43200);
    for (const bad of ['1:60', '1:02:60', '12:00:01', '-1', '43201', '1:2:3:4', 'abc', '1:30s', '', null]) {
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
