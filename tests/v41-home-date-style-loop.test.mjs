// 2026-11-12 본 주소 사고: 첫 화면이 초당 약 6회 끝없이 새로고침됐다.
// 원인: 셸은 프레임이 뜰 때마다(그리고 1.6초 뒤 한 번 더) lt41-date-style을 보내는데(shell.mjs onFrameReady),
// 첫 화면이 그 메시지를 받을 때마다 location.reload() 했다 → 뜸 → 메시지 → 새로고침 → 뜸 …
// 이 시험은 "셸이 프레임이 뜰 때마다 보낸다"는 실제 흐름을 그대로 돌려 새로고침 횟수를 센다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dateStyleOf, shouldReloadForDateStyle } from '../v41/home-moments.js';

const HOME = fs.readFileSync(new URL('../v41/home.js', import.meta.url), 'utf8');
const SHELL = fs.readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');

// 셸·첫 화면 흐름 흉내: 프레임이 뜨면(문서가 그려지면) 셸이 값을 두 번(뜰 때·1.6초 뒤) 보낸다.
// 첫 화면은 판정이 참이면 다시 뜬다. 다시 뜬 문서는 기기 미러(없으면 기본 dot)로 그려진다.
function run({ shellValues, mirror, maxLoads = 50, judge = shouldReloadForDateStyle }) {
  let loads = 0;
  let i = 0;
  while (loads < maxLoads) {
    loads += 1;
    const rendered = dateStyleOf(mirror ?? undefined);
    let reloaded = false;
    for (let k = 0; k < 2 && !reloaded; k += 1) { // 뜰 때 + 1.6초 뒤
      const value = shellValues[Math.min(i, shellValues.length - 1)];
      i += 1;
      if (judge({ value, rendered, mirror })) reloaded = true;
    }
    if (!reloaded) break;
  }
  return loads;
}

test('같은 값을 몇 번 받아도 새로고침하지 않는다(사고 재현: 예전 판정이면 끝없이 돈다)', () => {
  // 예전 판정(받으면 무조건 새로고침)을 같은 흐름에 넣으면 상한(50회)까지 돈다 = 사고 그대로.
  assert.equal(run({ shellValues: ['dot'], mirror: null, judge: () => true }), 50, '세기 증명: 예전 판정은 멈추지 않는다');
  for (const v of ['dot', 'dash', 'long']) {
    assert.equal(run({ shellValues: [v], mirror: v }), 1, `${v}: 한 번 뜨고 끝`);
  }
  // 로그아웃·새 기기: 미러 없음, 셸은 기본 dot를 보낸다.
  assert.equal(run({ shellValues: ['dot'], mirror: null }), 1);
  assert.equal(run({ shellValues: [undefined], mirror: null }), 1);
});

test('값이 실제로 바뀌면 한 번만 다시 뜬다(설정에서 바꿈 — 셸이 미러를 먼저 쓴다)', () => {
  // 그려진 값 dot, 사용자가 long으로 바꿈 → 셸이 미러=long을 쓰고 long을 보낸다.
  assert.equal(shouldReloadForDateStyle({ value: 'long', rendered: 'dot', mirror: 'long' }), true);
  // 다시 뜬 문서는 미러(long)로 그려진다 → 같은 값이 또 와도 멈춘다.
  assert.equal(shouldReloadForDateStyle({ value: 'long', rendered: 'long', mirror: 'long' }), false);
});

test('다시 떠도 새 값으로 그려진다는 보장이 없으면 새로고침하지 않는다', () => {
  // 저장소를 못 쓰는 창: 미러를 못 읽는다 → 다시 떠도 dot로 그려지므로 끝없이 돌 뻔한 경우.
  assert.equal(shouldReloadForDateStyle({ value: 'long', rendered: 'dot', mirror: null }), false);
  assert.equal(run({ shellValues: ['long'], mirror: null }), 1);
  // 셸이 계정 값을 아직 못 읽고 기본 dot를 보낸 경우(미러는 long): 그대로 둔다. 곧 long이 오면 같은 값이라 멈춘다.
  assert.equal(shouldReloadForDateStyle({ value: 'dot', rendered: 'long', mirror: 'long' }), false);
  assert.equal(run({ shellValues: ['dot', 'long', 'long'], mirror: 'long' }), 1);
  // 이상한 값은 기본 dot로 본다.
  assert.equal(dateStyleOf('weird'), 'dot');
  assert.equal(shouldReloadForDateStyle({ value: 'weird', rendered: 'dot', mirror: 'dot' }), false);
  assert.equal(shouldReloadForDateStyle(), false);
});

test('어떤 경우에도 새로고침은 많아야 한 번 더(모든 조합)', () => {
  const vals = ['dot', 'dash', 'long', undefined];
  for (const a of vals) for (const b of vals) for (const m of ['dot', 'dash', 'long', null, '']) {
    const loads = run({ shellValues: [a, b, b, b], mirror: m });
    assert.ok(loads <= 2, `shell=${a}→${b} mirror=${m}: ${loads}회`);
  }
});

test('첫 화면은 이 판정을 쓰고, 셸은 프레임이 뜰 때마다 값을 보낸다(전제 고정)', () => {
  assert.match(HOME, /const renderedDateStyle=dateStyleOf\(ltDateStyle\(\)\);/);
  assert.match(HOME, /dateStyle:renderedDateStyle,/);
  assert.match(HOME, /shouldReloadForDateStyle\(\{value:event\.data\.value,rendered:renderedDateStyle,mirror\}\)\)location\.reload\(\)/);
  assert.doesNotMatch(HOME, /type==='lt41-date-style'\)\{location\.reload\(\);\}/);
  // 전제: 셸이 프레임 준비 때마다 + 1.6초 뒤 보낸다. 이 전제가 바뀌면 위 흐름 시험도 같이 본다.
  assert.match(SHELL, /applyPageTurnToFrame\(frame\);applyDateStyleToFrame\(frame\);/);
  assert.match(SHELL, /setTimeout\(\(\)=>applyDateStyleToFrame\(frame\),1600\);/);
  // 셸은 사용자가 바꿀 때 미러를 먼저 쓰고 알린다(다시 뜬 문서가 새 값으로 그려지는 근거).
  assert.match(SHELL, /localStorage\.setItem\('lt41\.dateStyle',b\.dataset\.dateStyle\)\}catch\{\}\s*\n\s*paintDateStyleControls\(\);for\(const f of frames\(\)\)applyDateStyleToFrame\(f\);/);
});
