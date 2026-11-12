// #366 점검에서 잡은 지도 오류: 창이 아주 낮을 때(vh<300) overview/mobileOverview 의 scale 이 음수가 되고,
// 그 값이 drawHub 의 createRadialGradient 반지름(r*2.5)까지 가서 "r1 provided is less than 0" 페이지 오류가 났다.
// 두 계산 모두 바닥값을 두어 어떤 창 크기에서도 0보다 큰 배율만 나오게 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../public/v41/views/network/network.js', import.meta.url), 'utf8');

test('지도 배율: overview·mobileOverview 는 0보다 큰 바닥값을 둔다', () => {
  assert.match(js, /state\.scale=Math\.max\(\.12,Math\.min\(\.5,\(vw-300\)\/WORLD\.w,\(vh-255\)\/WORLD\.h\)\)/, '데스크톱 전체 보기');
  assert.match(js, /state\.scale=Math\.max\(\.12,Math\.min\(\.3,\(vw-36\)\/WORLD\.w,\(vh-300\)\/WORLD\.h\)\)/, '모바일 전체 보기');
  // 바닥값 없는 min() 이 남아 있으면 낮은 창에서 다시 음수가 될 수 있다.
  assert.doesNotMatch(js, /state\.scale=Math\.min\(/, '바닥값 없는 배율 계산 금지');
});

test('지도 배율: 그라디언트 반지름은 음수가 되지 않는다', () => {
  // drawHub 은 hubR*scale 로 반지름을 만든다 — scale 이 양수임을 위 시험이 보장하지만,
  // 반지름 자체도 0 이상으로 잘라 두어 페이지 오류가 되살아나지 않게 한다.
  assert.match(js, /,r=Math\.max\(\.5,c\.hubR\*state\.scale\)/, '허브 반지름 바닥값');
});
