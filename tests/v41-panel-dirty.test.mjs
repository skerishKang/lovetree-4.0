// #380 4 2차: 순간 잇기(connection-panel) 더러움 판정의 계산부 — 패널이 보여 준 연결과 지금 트리의 저장본을 비교한다.
// 같으면 더러움 없음(확인 없이 닫힘), 다르면 아직 저장되지 않은 고른 연결이 있으므로 공통 틀이 한 번 묻는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionSignature} from '../public/v41/shell/panel-dirty.mjs';

const tree = {
  id: 't1',
  moments: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
  edges: [
    {from: 'a', to: 'b', kind: 'sequence', reason: '이어짐'},
    {from: 'c', to: 'b', kind: 'related', reason: ''}
  ]
};

test('연결 시그니처는 트리·순간과 그 순간에 붙은 연결만 센다', () => {
  const a = connectionSignature(tree, 'a');
  assert.match(a, /^t1#a#/);
  assert.notEqual(a, connectionSignature(tree, 'b'), '순간이 다르면 서명이 다르다');
  // b에 붙은 연결은 둘(a→b·c→b)이고 a에 붙은 연결은 하나다(연결은 '|'로 이어 붙인다).
  const edgeCount = id => connectionSignature(tree, id).split('#')[2].split('|').filter(Boolean).length;
  assert.equal(edgeCount('b'), 2);
  assert.equal(edgeCount('a'), 1);
});

test('연결 순서가 달라도 같은 저장본이면 서명이 같다', () => {
  const flipped = {...tree, edges: [tree.edges[1], tree.edges[0]]};
  assert.equal(connectionSignature(tree, 'b'), connectionSignature(flipped, 'b'));
});

test('고른 연결이 저장 전이면(연결이 더해지거나 빠지면) 서명이 달라진다 — 더러움', () => {
  const shown = connectionSignature(tree, 'b');
  const saved = {...tree, edges: [...tree.edges, {from: 'b', to: 'c', kind: 'related', reason: '새로 고른 연결'}]};
  assert.notEqual(connectionSignature(saved, 'b'), shown, '저장 전 연결이 있으면 다르다');
  const removed = {...tree, edges: [tree.edges[0]]};
  assert.notEqual(connectionSignature(removed, 'b'), shown, '빠진 연결도 다르다');
  const reworded = {...tree, edges: [tree.edges[0], {...tree.edges[1], reason: '이유를 고침'}]};
  assert.notEqual(connectionSignature(reworded, 'b'), shown, '연결 이유가 바뀌어도 다르다');
});

test('트리가 없거나 비어 있으면 빈 서명으로 안전하게 돌려준다', () => {
  assert.equal(connectionSignature(null, 'a'), '');
  assert.equal(connectionSignature(undefined, undefined), '');
  assert.equal(connectionSignature({id: 't2', moments: []}, 'zzz'), 't2#zzz#');
});
