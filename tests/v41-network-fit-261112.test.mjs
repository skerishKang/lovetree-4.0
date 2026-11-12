// #366 점검에서 잡은 지도 오류: 창이 아주 낮을 때(vh<300) overview/mobileOverview 의 scale 이 음수가 되고,
// 그 값이 drawHub 의 createRadialGradient 반지름(r*2.5)까지 가서 "r1 provided is less than 0" 페이지 오류가 났다.
// #461 뒤로는 배치가 화면 상자(fitBox)에 맞춘 화면 좌표라 전체 보기 배율은 늘 1이다. 낮은 창에서도
// 상자·배율·점 반지름이 0보다 큰지 실제 계산을 돌려 확인한다(문자열이 아니라 실행).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
await import('../public/v41/views/network/network-model.js');
const M = globalThis.LT56Model;
const js = readFileSync(new URL('../public/v41/views/network/network.js', import.meta.url), 'utf8');

const moments = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, first: i === 0, title: `t${i}` }));
const edges = moments.slice(1).map((m, i) => ({ kind: 'parent', from: `m${i % 5 === 4 ? i - 3 : i}`, to: m.id }));

test('지도 배율: 아주 낮은·좁은 창에서도 상자·배율·점 반지름이 양수이고 좌표가 유한하다', () => {
  for (const [vw, vh] of [[390, 260], [1440, 240], [200, 120], [40, 40]]) {
    const box = M.fitBox(vw, vh, { top: 180, left: vw > 980 ? 240 : 0, bottom: vw <= 640 ? 80 : 0 }, 16);
    assert.ok(box.w > 0 && box.h > 0, `${vw}×${vh} 상자 양수`);
    const net = M.networkLayout(moments, { box, dotR: 5, firstR: 20, gap: 8, hubR: 9 });
    assert.ok(net.dotR > 0 && net.rx > 0 && net.ry > 0, `${vw}×${vh} 그물 반지름 양수`);
    const conc = M.concentricLayout(moments, edges, { box, nodeR: 4.6, firstR: 20, gap: 8 });
    assert.ok(conc.dotR > 0 && conc.scale > 0 && conc.sx > 0 && conc.sy > 0, `${vw}×${vh} 동심원 축척 양수`);
    for (const p of [...Object.values(net.points), ...Object.values(conc.points)]) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('지도 배율: 전체 보기는 배율 1, 확대·축소는 0.5~4배로 묶는다(바닥값 있음)', () => {
  assert.match(js, /function fitView\(\)\{state\.scale=1;state\.tx=0;state\.ty=0\}/, '전체 보기 = 배율 1');
  assert.match(js, /state\.scale=Math\.max\(\.5,Math\.min\(4,state\.scale\*f\)\)/, '확대·축소 바닥값');
  // 바닥값 없는 min() 배율이 되살아나면 낮은 창에서 다시 음수가 될 수 있다.
  assert.doesNotMatch(js, /state\.scale=Math\.min\(/, '바닥값 없는 배율 계산 금지');
});

test('지도 배율: 그라디언트 반지름은 음수가 되지 않는다', () => {
  assert.match(js, /,r=Math\.max\(\.5,c\.hubR\*state\.scale\)/, '허브 반지름 바닥값');
});
