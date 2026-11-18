// #869: 지도 그물형에서 순간 노드가 그래프 영역 맨 끝(좌 x≈274·우 x≈1405·아래 y≈920, 1440 기준)에 붙어
// 시작 순간에서 뻗는 선이 화면 끝까지 가고 하단 링크 줄에 닿았다. 원인은 묶음 칸이 상자 전체를 채우고
// 타원 반지름에서 고정 픽셀(12+5px)만 뺀 것 — 비례 여백이 없었다. 노드는 이제 영역 안쪽 여백
// (가로·세로 10% 이상) 안에 머물고, 묶음 점(타원 가운데)·시작 노드 근처에 모인다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
await import('../public/v41/views/network/network-model.js');
const M = globalThis.LT56Model;

const mk = (n) => {
  const moments = [{ id: 'm0', first: true, title: '처음' }];
  for (let i = 1; i < n; i++) moments.push({ id: `m${i}`, title: `t${i}` });
  const edges = [];
  for (let i = 1; i < n; i++) edges.push({ kind: 'parent', from: `m${i - 1}`, to: `m${i}` });
  return { moments, edges };
};

const within10pct = (fit, box) => {
  const mx = box.w * 0.1, my = box.h * 0.1;
  for (const p of Object.values(fit.points)) {
    assert.ok(p.x >= box.x + mx - 0.5, `왼쪽 여백 10%(${mx.toFixed(0)}px) 안 — x=${p.x.toFixed(0)}`);
    assert.ok(p.x <= box.x + box.w - mx + 0.5, `오른쪽 여백 10% 안 — x=${p.x.toFixed(0)}`);
    assert.ok(p.y >= box.y + my - 0.5, `위 여백 10% 안 — y=${p.y.toFixed(0)}`);
    assert.ok(p.y <= box.y + box.h - my + 0.5, `아래 여백 10% 안 — y=${p.y.toFixed(0)}`);
  }
};

test('그물형: 노드는 그래프 영역 안쪽 여백(가로·세로 10% 이상) 안에 머문다(3·10·40개)', () => {
  for (const n of [3, 10, 40]) {
    const { moments, edges } = mk(n);
    const box = { x: 0, y: 0, w: 1440, h: 960 };
    const fit = M.networkLayout(moments, { box, dotR: 5, firstR: 20, gap: 8, hubR: 9, edges });
    within10pct(fit, box);
    assert.ok(fit.dotR > 0 && fit.rx > 0 && fit.ry > 0, `${n}개 반지름 양수`);
  }
});

test('그물형: 좁은 화면(390)에서도 노드가 안쪽 여백 안에 머문다', () => {
  for (const n of [3, 10, 40]) {
    const { moments, edges } = mk(n);
    const box = M.fitBox(390, 844, { top: 180, bottom: 80 }, 16);
    const fit = M.networkLayout(moments, { box, dotR: 5, firstR: 20, gap: 8, hubR: 9, edges });
    within10pct(fit, box);
  }
});

test('부채꼴 나무(그물 보기): 한 순간에 8개 이상 이어진 나무도 안쪽 여백 안에 머문다', () => {
  // 첫 순간에 자식 12개(부채꼴 판정: 이웃 8개 이상) — 옛 식이면 타원이 상자 끝(여백 약 17px)까지 늘었다.
  const moments = [{ id: 'm0', first: true, title: '처음' }];
  for (let i = 1; i <= 12; i++) moments.push({ id: `m${i}`, title: `t${i}` });
  const edges = moments.slice(1).map((m) => ({ kind: 'parent', from: 'm0', to: m.id }));
  const box = { x: 0, y: 0, w: 1440, h: 960 };
  const fit = M.networkLayout(moments, { box, dotR: 5, firstR: 20, gap: 8, hubR: 9, edges });
  assert.ok(fit.fan, '부채꼴 배치가 적용된다');
  within10pct(fit, box);
});
