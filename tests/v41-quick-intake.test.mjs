import test from 'node:test';
import assert from 'node:assert/strict';
// 빠른 담기 입구의 순수 계산: 파라미터 소비·분류·중복 판정·세션 보관 (docs/TESTING.md).
// DOM 배선은 tests/v41-quick-intake-flow.test.mjs가 가짜 객체로 직접 부른다.
import {
  INTAKE_PARAM, INTAKE_DUP_TEXT,
  readIntakeParam, classifyIntake, canonicalUrl, isInboxDuplicate, createPendingSlot,
} from '../public/v41/quick-intake.mjs';

// LTMedia.describe와 같은 모양의 최소 판정(화면이 실제로 쓰는 전역과 같은 계약).
const describeLike = (url) => {
  const value = String(url ?? '');
  if (!value.trim()) return { kind: 'none', original: value, label: '', openUrl: '' };
  let parsed;
  try { parsed = new URL(value); } catch { return { kind: 'invalid', original: value, label: '', openUrl: '' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { kind: 'invalid', original: value, label: '', openUrl: '' };
  return { kind: 'link', original: value, label: parsed.hostname.replace(/^www\./, ''), openUrl: parsed.href };
};

test('readIntakeParam: 없으면 없고, 있으면 읽고 지운다(다른 파라미터는 남긴다)', () => {
  assert.deepEqual(readIntakeParam(''), { found: false, url: '', rest: '' });
  assert.deepEqual(readIntakeParam('?intent=new-tree'), { found: false, url: '', rest: 'intent=new-tree' });
  const row = [
    '?quickadd=https%3A%2F%2Fexample.com%2Fa',
    '?a=1&quickadd=https%3A%2F%2Fexample.com%2Fb&b=2',
    '?quickadd=%20%20https%3A%2F%2Fexample.com%2Fc%20%20',
    '?quickadd=',
  ];
  assert.deepEqual(readIntakeParam(row[0]), { found: true, url: 'https://example.com/a', rest: '' });
  assert.deepEqual(readIntakeParam(row[1]), { found: true, url: 'https://example.com/b', rest: 'a=1&b=2' });
  assert.deepEqual(readIntakeParam(row[2]), { found: true, url: 'https://example.com/c', rest: '' });
  assert.equal(readIntakeParam(row[3]).found, true, '빈 값도 소비 대상이다(호출자가 버리고 지운다)');
});

test('classifyIntake: 기존 판정 그대로 — 빈 값/주소/그 외를 구분한다', () => {
  assert.equal(classifyIntake('', describeLike).status, 'empty');
  assert.equal(classifyIntake('   ', describeLike).status, 'empty');
  assert.equal(classifyIntake('https://example.com/어떤-글', describeLike).status, 'ok');
  assert.equal(classifyIntake('notaurl', describeLike).status, 'invalid');
  assert.equal(classifyIntake('ftp://example.com/a', describeLike).status, 'invalid');
  assert.equal(classifyIntake('javascript:alert(1)', describeLike).status, 'invalid');
});

test('classifyIntake: 판정 함수가 막혀도 던지지 않는다', () => {
  const broken = () => { throw new Error('deny'); };
  assert.equal(classifyIntake('https://example.com', broken).status, 'invalid');
});

test('canonicalUrl: URL로 읽히면 정규화하고, 아니면 원문', () => {
  assert.equal(canonicalUrl('HTTPS://EXAMPLE.com/a'), 'https://example.com/a');
  assert.equal(canonicalUrl(' https://example.com/a '), 'https://example.com/a');
  assert.equal(canonicalUrl('그냥-글자'), '그냥-글자');
  assert.equal(canonicalUrl(''), '');
});

test('isInboxDuplicate: inbox의 같은 주소만 잡는다(모양이 나빠도 조용히 거짓)', () => {
  const trees = [
    { id: 't0', inbox: true, moments: [{ id: 'm0', url: 'https://example.com/a' }, { id: 'm1' }] },
    { id: 't1', inbox: false, moments: [{ id: 'm2', url: 'https://example.com/a' }] },
    { id: 't2', inbox: true, moments: [{ id: 'm3', url: 'HTTPS://EXAMPLE.com/a' }] },
  ];
  assert.equal(isInboxDuplicate(trees, 'https://example.com/a'), true, '이미 inbox에 있다');
  assert.equal(isInboxDuplicate(trees, 'https://EXAMPLE.com/a'), true, '정규화해서 비교한다(대문자 호스트)');
  assert.equal(isInboxDuplicate(trees, 'https://example.com/b'), false);
  assert.equal(isInboxDuplicate([trees[1]], 'https://example.com/a'), false, '일반 트리는 세지 않는다');
  assert.equal(isInboxDuplicate([{ id: 'x', inbox: true, moments: [{}] }], 'https://example.com/a'), false);
  assert.equal(isInboxDuplicate(null, 'https://example.com/a'), false);
  assert.equal(isInboxDuplicate(trees, ''), false);
  assert.equal(isInboxDuplicate(trees, '그냥-글자'), false);
});

test('createPendingSlot: 한 번 보관·덮어쓰기·지우기, 저장소를 못 쓰면 조용하다', () => {
  const file = new Map();
  const storage = { getItem: (k) => (file.has(k) ? file.get(k) : null), setItem: (k, v) => file.set(k, v), removeItem: (k) => file.delete(k) };
  const slot = createPendingSlot(storage);
  assert.equal(slot.read(), null);
  slot.write('https://example.com/a');
  assert.deepEqual(slot.read(), { url: 'https://example.com/a' });
  slot.write('https://example.com/b');
  assert.deepEqual(slot.read(), { url: 'https://example.com/b' });
  slot.clear();
  assert.equal(slot.read(), null);

  const broken = { getItem: () => { throw new Error('deny'); }, setItem: () => { throw new Error('deny'); }, removeItem: () => { throw new Error('deny'); } };
  const safe = createPendingSlot(broken);
  assert.equal(safe.read(), null);
  safe.write('https://example.com');
  safe.clear();

  const noop = createPendingSlot(null);
  noop.write('https://example.com');
  assert.equal(noop.read(), null);
  assert.equal(typeof INTAKE_DUP_TEXT, 'string');
  assert.ok(INTAKE_DUP_TEXT.length > 0);
  assert.equal(INTAKE_PARAM, 'quickadd');
});
