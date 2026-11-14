// #491 수리 계약: 390 첫 화면에서 카드가 전부 숨지 않게 한다.
// 1) 좁은 화면 충돌 판정은 실제로 그려지는 배율(sc×max(.58,fit))을 쓴다 — sc만 쓰면 실제보다 큰 사각형으로
//    판정해 띠에 들어갈 카드까지 숨겼다(390에서 카드 0~2장).
// 2) 띠 둘 다에 안 들어가는 카드는 숨기는 대신 더 큰 쪽 띠에 맞춰 그림 배율을 줄인다(0장은 안 된다).
// 3) 넓은 화면(1440)은 판정 배율이 그대로 sc라 동작이 변하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');

test('#491: 좁은 화면 충돌 판정은 그려지는 배율(cScale)을 쓴다', () => {
  assert.match(orbit, /const cScale=narrow\?sc\*Math\.max\(\.58,fit\):sc;/, 'cScale은 좁은 화면에서만 그림 배율을 따른다');
  assert.match(orbit, /x2\*cScale\)\*k/, '가로 투영이 cScale을 쓴다');
  assert.match(orbit, /y3\*cScale\)\*k/, '세로 투영이 cScale을 쓴다');
  // 옛 코드(sc 직접 투영)가 남지 않는다
  assert.doesNotMatch(orbit, /x2\*sc\)\*k/, '옛 sc 직접 투영이 남지 않는다');
});

test('#491: 띠에 못 들어가는 카드는 배율을 줄여 보여 준다(숨기지 않는다)', () => {
  assert.match(orbit, /if\(!upFits&&!downFits\)\{/, '못 들어갈 때 분기가 있다');
  assert.doesNotMatch(orbit, /!upFits&&!downFits\)\{el\.style\.display='none';return;\}/, '옛 즉시 숨김이 남지 않는다');
  assert.match(orbit, /band\/rectH/, '더 큰 쪽 띠 높이에 맞춰 줄인다');
  assert.match(orbit, /Math\.max\(\.5,Math\.min\(1,band\/rectH\)\)/, '줄임 바닥값 .5로 카드가 지나치게 작아지지 않는다');
  assert.match(orbit, /drawShrink\*=shrink;/, '줄임 배율을 그림에 반영한다');
});

test('#491: 줄임 배율은 transform scale에 곱해진다', () => {
  // #593: 그리는 배율은 배치 함수가 돌려주고(at.scale) 애니메이션·끌기 쓰기가 그 값을 쓴다.
  assert.match(orbit, /scale:sc\*\(!demo&&cards\.length<=8\?1:Math\.max\(\.58,fit\)\)\*drawShrink/, 'transform scale에 drawShrink가 곱해진다');
  assert.match(orbit, /let drawShrink=1,judge=null;/, '기본값 1(줄임 없음)');
});
