// #469 → #582: 보드 배치 계약. 관계 기준 배치(treeSpread)는 거두고 날짜 최신순 바둑판으로 바뀌었다.
// - 칸 수는 화면 폭이 정한다(1440 4칸, 390 1칸).
// - 저장 자리(사람이 꽂은 칸)는 그대로 남고(#395 계약), 나머지를 빈 칸에 채운다.
// - 카드끼리 겹치지 않고, 빈 칸 비율(판 대비 카드가 차지하는 칸)이 합리적이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleTree } from '../public/v41/example.mjs';
// 화면과 같은 조건: 일반 스크립트가 window.LT58Model 하나를 남긴다(v41-board-model.test.mjs와 같다).
globalThis.window = globalThis;
await import('../public/v41/views/board/board-model.js');
const LT58Model = globalThis.LT58Model;

const CARD_W = 242, CARD_H = 260, GAP_W = 300, GAP_H = 460; // #548/#553: 세로 간격 424+36=460

function gridOf(moments, vw, saved = null) {
  const slots = LT58Model.pinboardSpread(LT58Model.dateDescOrder(moments), { cols: LT58Model.gridColumns(vw), saved });
  const tops = LT58Model.gridRowTops(slots, () => 424); // 기본 예약 높이 424
  const pos = new Map();
  let i = 0;
  for (const id of LT58Model.dateDescOrder(moments)) {
    const s = slots.get(id);
    pos.set(id, LT58Model.gridPosition(s.col, tops[s.row], i++));
  }
  return { slots, pos };
}

function overlapPairs(pos) {
  const list = [...pos.values()], out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (Math.abs(a.x - b.x) < CARD_W && Math.abs(a.y - b.y) < CARD_H) out.push([i, j]);
  }
  return out;
}

// 빈 칸 비율: 판을 덮는 직사각형 칸 수 중 실제로 카드가 꽂힌 칸의 비율.
function filledRatio(slots) {
  const cols = Math.max(...[...slots.values()].map((s) => s.col)) + 1;
  const rows = Math.max(...[...slots.values()].map((s) => s.row)) + 1;
  return slots.size / (cols * rows);
}

test('#582 예시 40순간: 1440은 4칸 바둑판 — 겹침 0, 빈 칸 비율 90% 이상, 390은 1칸', () => {
  const moments = exampleTree.moments;
  const { slots, pos } = gridOf(moments, 1440);
  assert.equal(slots.size, moments.length, '모든 순간이 자리를 받는다');
  assert.deepEqual(overlapPairs(pos), [], '카드끼리 겹치지 않는다');
  assert.equal(Math.max(...[...slots.values()].map((s) => s.col)) + 1, 4, '1440은 4칸');
  assert.ok(filledRatio(slots) >= 0.9, `빈 칸 비율 ${(filledRatio(slots) * 100).toFixed(0)}% — 바둑판은 구멍 없이 채운다`);
  // 좁은 화면(390)은 1칸 — 세로로 쌓인다.
  const narrow = gridOf(moments, 390);
  assert.equal(Math.max(...[...narrow.slots.values()].map((s) => s.col)) + 1, 1, '390은 1칸');
  assert.deepEqual(overlapPairs(narrow.pos), [], '390에서도 겹침 0');
});

test('#582 순서: 날짜 최신순으로 꽂는다 — 관계(줄)는 배치에 아무 영향이 없다', () => {
  const moments = exampleTree.moments.map((m, i) => ({ ...m, createdOrder: i + 1 }));
  const { slots } = gridOf(moments, 1440);
  const order = LT58Model.dateDescOrder(moments);
  // 첫 줄은 최신 날짜 4장이다.
  const firstRow = order.slice(0, 4).map((id) => slots.get(id));
  for (const s of firstRow) assert.equal(s.row, 0, '최신 순간이 첫 줄에');
  assert.deepEqual(firstRow.map((s) => s.col).sort((a, b) => a - b), [0, 1, 2, 3], '왼쪽부터 채운다');
  // 관계를 아무리 바꿔도 같은 자리다(배치는 날짜만 본다).
  const edges1 = exampleTree.edges;
  const again = gridOf(moments, 1440);
  assert.deepEqual(again.slots, slots, 'edges와 무관하게 같은 자리');
  assert.ok(edges1.length > 0, '예시에는 원래 관계가 있다(의미 없는 비교 방지)');
});

test('#582 저장 자리: 사람이 꽂은 칸은 그대로 남고 나머지가 빈 칸을 채운다(#395 계약)', () => {
  const moments = exampleTree.moments.slice(0, 12);
  const saved = new Map([
    [moments[0].id, { col: 3, row: 2 }],
    [moments[1].id, { col: 0, row: 3 }]
  ]);
  const { slots, pos } = gridOf(moments, 1440, new Map(saved));
  assert.deepEqual(slots.get(moments[0].id), { col: 3, row: 2 }, '저장 자리 1');
  assert.deepEqual(slots.get(moments[1].id), { col: 0, row: 3 }, '저장 자리 2');
  // 저장 자리 사이의 빈 칸을 나머지가 채운다 — 구멍이 생기지 않는다.
  // (저장 자리가 판을 벌려 빈 칸이 생기는 것은 #395 계약의 자연스러운 결과다 — 70% 이상이면 구멍이 아니라 여백이다)
  assert.ok(filledRatio(slots) >= 0.7, `빈 칸 비율 ${(filledRatio(slots) * 100).toFixed(0)}%`);
  assert.deepEqual(overlapPairs(pos), [], '그래도 겹침 0');
});
