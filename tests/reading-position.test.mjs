import test from 'node:test';
import assert from 'node:assert/strict';
import { remember, lastRead } from '../src/views/memory.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
  };
};

const tree = (id, momentIds) => ({ id, moments: momentIds.map(id => ({ id, parentId: null })) });

test('lastRead는 이 트리의 읽던 위치를 돌려준다', () => {
  const storage = fakeStorage();
  const a = tree('a', ['m1', 'm2']);
  remember(storage, 'a', 'm2');
  assert.equal(lastRead(storage, a)?.id, 'm2');
});

test('lastRead는 다른 트리의 기록이 남아 있으면 null이다(전역 슬롯 한 칸)', () => {
  const storage = fakeStorage();
  remember(storage, 'b', 'mb');
  assert.equal(lastRead(storage, tree('a', ['m1'])), null);
});

test('lastRead는 기록이 없거나 사라진 순간이면 null이다', () => {
  const storage = fakeStorage();
  assert.equal(lastRead(storage, tree('a', ['m1'])), null);
  remember(storage, 'a', 'gone');
  assert.equal(lastRead(storage, tree('a', ['m1'])), null);
  storage.setItem('lovetree.v4.reading-position.v1', '{깨진 json');
  assert.equal(lastRead(storage, tree('a', ['m1'])), null);
});
