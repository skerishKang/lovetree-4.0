// #469: 보드 처음 배치(treeSpread) — 12칸 + 밴드별 실사용 줄 간격의 실행 계약.
// 옛 규칙(7칸 고정 + '전체 잎 줄 수 + 1' 간격)은 긴 트리에서 줄 사이 빈 칸을 만들어
// 예시 40순간 전체 보기가 13%까지 작아졌다. 이 파일은 새 배치를 수치로 고정하고,
// 예전 배치로 되돌리면(7칸·전역간격) 아래 배율·높이 계약이 빨강이 된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleTree } from '../public/v41/example.mjs';
// 화면과 같은 조건: 일반 스크립트가 window.LT58Model 하나를 남긴다(v41-board-model.test.mjs와 같다).
globalThis.window = globalThis;
await import('../public/v41/views/board/board-model.js');
const LT58Model = globalThis.LT58Model;

const CARD_W = 242, CARD_H = 260, GAP_W = 300, GAP_H = 460; // #548: 카드 글자 기준선 올림에 따라 세로 간격 420→460

function boxOf(pos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pos.values()) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + CARD_W); y1 = Math.max(y1, p.y + CARD_H);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function overlapPairs(pos) {
  const list = [...pos.values()], out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (Math.abs(a.x - b.x) < CARD_W && Math.abs(a.y - b.y) < 340) out.push([i, j]);
  }
  return out;
}

// 전체 보기 배율(#468과 같은 판정): contentBox(여백 40)를 최대 0.92로 맞춘다.
function overviewZoom(pos, vw = 1440, vh = 900) {
  const cards = [...pos.values()].map(p => ({ x: p.x, y: p.y, w: CARD_W, h: CARD_H }));
  const box = LT58Model.contentBox(cards, 40);
  return Math.min((vw - 40) / box.w, (vh - 40) / box.h, 0.92);
}

// 동떨어진 카드: y를 정렬했을 때 이웃 줄 사이 간격이 두 칸(840px)을 넘으면 떨어진 것으로 본다.
function detachedCount(pos) {
  const ys = [...new Set([...pos.values()].map(p => p.y))].sort((a, b) => a - b);
  let n = 0;
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > GAP_H * 2) n += 1;
  return n;
}

const chain = (n, p = 'c') => ({
  ids: Array.from({ length: n }, (_, i) => p + i),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ kind: 'parent', from: p + i, to: p + (i + 1) }))
});

test('#469 예시 40순간: 12칸·실사용 줄 간격으로 펼쳐 전체 보기 25% 이상, 동떨어진 카드 0', () => {
  const ids = exampleTree.moments.map(m => m.id);
  const pos = LT58Model.treeSpread(ids, exampleTree.edges);
  assert.equal(pos.size, ids.length, '모든 순간이 자리를 받는다');
  assert.deepEqual(overlapPairs(pos), [], '카드끼리 겹치지 않는다(#395)');
  const box = boxOf(pos);
  assert.ok(box.w <= 3692 + 1, `판 가로 ${Math.round(box.w)} (12칸)`);
  assert.ok(box.h <= 3040 + 1, `판 세로 ${Math.round(box.h)} (실사용 줄 간격 460px — 옛 배치 5910)`);
  const z = overviewZoom(pos);
  assert.ok(z >= 0.25, `전체 보기 배율 ${(z * 100).toFixed(1)}% ≥ 25% (옛 배치 13~16%)`);
  assert.equal(detachedCount(pos), 0, '동떨어진 카드 0장');
});

test('#469 사슬 40·깊은 가지: 겹침 0, 옛 배치보다 세로가 짧다', () => {
  const { ids, edges } = chain(40);
  const pos = LT58Model.treeSpread(ids, edges);
  assert.deepEqual(overlapPairs(pos), []);
  const box = boxOf(pos);
  assert.ok(box.h <= 2360 + 1, `사슬 40 세로 ${Math.round(box.h)} (옛 배치 4460)`);
  assert.ok(overviewZoom(pos) >= 0.25, '사슬 40도 전체 보기 25% 이상');

  // 깊은 가지: 잎이 줄로 쌓이는 건 나무 모양의 본질이지만, 겹침 없이 모두 자리를 받는다.
  const deepIds = ['r'];
  for (let b = 0; b < 3; b++) deepIds.push('b' + b);
  for (let b = 0; b < 3; b++) for (let d = 1; d <= 3; d++) deepIds.push(`b${b}n${d}`);
  for (let b = 0; b < 3; b++) for (let l = 0; l < 9; l++) deepIds.push(`b${b}l${l}`);
  const deepEdges = [];
  for (let b = 0; b < 3; b++) deepEdges.push({ kind: 'parent', from: 'r', to: 'b' + b });
  for (let b = 0; b < 3; b++) deepEdges.push({ kind: 'parent', from: 'b' + b, to: `b${b}n1` });
  for (let b = 0; b < 3; b++) for (let d = 1; d < 3; d++) deepEdges.push({ kind: 'parent', from: `b${b}n${d}`, to: `b${b}n${d + 1}` });
  for (let b = 0; b < 3; b++) for (let l = 0; l < 9; l++) deepEdges.push({ kind: 'parent', from: `b${b}n3`, to: `b${b}l${l}` });
  const deep = LT58Model.treeSpread(deepIds, deepEdges);
  assert.equal(deep.size, deepIds.length);
  assert.deepEqual(overlapPairs(deep), []);
});

test('#469 순간 5개·15개 트리: 지금과 같거나 더 낫다(겹침 0·높이 유지)', () => {
  const { ids: flatIds } = chain(5, 'f');
  const flat = LT58Model.treeSpread(flatIds, []);
  assert.equal(flat.size, 5);
  assert.deepEqual(overlapPairs(flat), []);
  const flatBox = boxOf(flat);
  assert.ok(flatBox.h <= 2120 + 1, `따로 5 세로 ${Math.round(flatBox.h)} (#548 간격 460px 기준 2120)`);

  const treeIds = Array.from({ length: 15 }, (_, i) => 's' + i);
  const treeEdges = treeIds.slice(1).map((id, i) => ({ kind: 'parent', from: i < 5 ? treeIds[i] : treeIds[i - 5], to: id }));
  const spread = LT58Model.treeSpread(treeIds, treeEdges);
  assert.deepEqual(overlapPairs(spread), []);
  const treeBox = boxOf(spread);
  assert.ok(treeBox.h <= 2580 + 1, `트리 15 세로 ${Math.round(treeBox.h)} (#548 간격 460px 기준 2580)`);
  assert.ok(treeBox.w >= 2042 - 1 && treeBox.w <= 3692 + 1);
});

test('#469 셸 계약: 자리를 저장한 순간은 board.js가 저장값을 그대로 쓴다', () => {
  // board.js의 배선을 소스로 고정한다 — treeSpread 자리는 x·y가 없는 순간에만 쓰인다.
  const board = fsRead('public/v41/views/board/board.js');
  assert.match(board, /x:Number\.isFinite\(m\.x\)\?m\.x:pos\.x,y:Number\.isFinite\(m\.y\)\?m\.y:pos\.y/);
  // 12칸·실사용 줄 간격 계약(board-model.js).
  const model = fsRead('public/v41/views/board/board-model.js');
  assert.match(model, /const cols = 12;/);
  assert.match(model, /bandRows\.set\(b, cur\);/);
  assert.match(model, /acc \+= \(maxR - minR\) \+ 1;/);
  assert.doesNotMatch(model, /wrap \* \(nextRow \+ 1\)/, '옛 전역 간격 규칙 잔재 없다');
});

import fs from 'node:fs';
function fsRead(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}
