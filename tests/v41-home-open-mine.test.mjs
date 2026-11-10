// #379 결함 회귀: 내 카드 클릭은 그 카드의 '트리·순간'을 그대로 들고 셸에 열려야 한다.
// 셸의 lt41-open-book 가 트리 전환 + 순간 선택 + 기억책 열기를 한 번에 처리한다
// (public/v41/shell/messages.mjs) — 예전 방식은 lt41-select(현재 트리 안에서만 통한다)
// + lt41-navigate 라서 다른 트리 카드가 무시되고 엉뚱한 순간이 열렸다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeActions} from '../v41/home-actions.js';

const tree=(id, momentIds, extra={}) => ({id, title:`트리 ${id}`, moments:momentIds.map(id=>({id})), ...extra});
const harness=(trees, extra={}) => {
  const sent=[];
  const actions=createHomeActions({getContext:()=>trees?{source:'server',member:'in',tree:null,trees}:null,send:m=>sent.push(m),gallery:true,...extra}).actions;
  return {sent, actions};
};
const openBookMessages=sent=>sent.filter(m=>m.type==='lt41-open-book');

test('다른 트리 내 순간 카드는 실 트리와 순간을 싣고 바로 기억책을 연다', () => {
  const {sent, actions}=harness([tree('tree-a',['m-a1']),tree('tree-b',['m-b1'])]);
  actions.openMine('tree-b','m-b1');
  assert.deepEqual(sent,[{type:'lt41-open-book',treeId:'tree-b',id:'m-b1'}]);
});

test('같은 트리 내 순간 카드도 트리·순간을 그대로 싣는다', () => {
  const {sent, actions}=harness([tree('tree-a',['m-a1','m-a2'])]);
  actions.openMine('tree-a','m-a2');
  assert.deepEqual(sent,[{type:'lt41-open-book',treeId:'tree-a',id:'m-a2'}]);
});

test('모아둔 순간(비어 있는 트리 처럼 보이지 않게 숨긴 inbox 트리)도 그대로 싣는다', () => {
  const {sent, actions}=harness([tree('tree-inbox',['m-i1'],{inbox:true})]);
  actions.openMine('tree-inbox','m-i1');
  assert.deepEqual(sent,[{type:'lt41-open-book',treeId:'tree-inbox',id:'m-i1'}]);
});

test('카드 그물이 합성 래퍼 treeId 여도 실제 트리·순간으로 풀어 보낸다', () => {
  const {sent, actions}=harness([tree('tree-a',['m-a1'])]);
  actions.openMine('home-cards','m-a1');
  assert.deepEqual(sent,[{type:'lt41-open-book',treeId:'tree-a',id:'m-a1'}]);
});

test('내 순간이 아니면 아무것도 보내지 않는다(없는 순간·빈 값)', () => {
  const {sent, actions}=harness([tree('tree-a',['m-a1'])]);
  actions.openMine('tree-a','ghost');
  actions.openMine(null,null);
  assert.deepEqual(sent,[]);
});

test('대화창의 기억책 버튼도 갤러리 내 순간이면 같은 메시지로 연다', () => {
  const {sent, actions}=harness([tree('tree-a',['m-a1'])]);
  actions.openBook('tree-a','m-a1');
  assert.deepEqual(sent,[{type:'lt41-open-book',treeId:'tree-a',id:'m-a1'}]);
});

test('셸 컨텍스트가 없으면 안전한 no-op 다', () => {
  const {sent, actions}=harness(undefined);
  actions.openMine('tree-a','m-a1');
  assert.deepEqual(sent,[]);
  assert.ok(openBookMessages(sent).length===0);
});
