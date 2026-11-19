// #477: "메시지를 받아 다시 띄우는 코드는 '뜰 때마다 보내는 쪽'과 함께 흐름으로 시험한다".
// 셸은 프레임이 뜰 때마다 같은 값을 보내는 메시지가 있고, 화면은 그 메시지를 받아 location.reload() 하거나
// location.href/src를 다시 넣는 곳이 있다 — "뜰 때마다 보내는 쪽"과 "받으면 무조건 다시 띄우는 쪽"이
// 짝을 이루면 프레임 다시 뜨기 고리가 생긴다(2026-11-12 본 주소 사고 = lt41-date-style 고리).
// 이 시험은 그 흐름을 그대로 돌려 프레임 다시 뜬 횟수를 센다(tools/postdeploy/frame-reload.mjs와 같은 판정).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dateStyleOf, shouldReloadForDateStyle } from '../v41/home-moments.js';
import { titleDisplayOf, shouldReloadForTitleDisplay } from '../public/v41/book-usability.mjs';

const HOME = readFileSync(new URL('../v41/home.js', import.meta.url), 'utf8');
const SHELL = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
const SHELF = readFileSync(new URL('../public/v41/views/shelf/shelf.js', import.meta.url), 'utf8');
const BOOK = readFileSync(new URL('../public/v41/views/book/book-extra.js', import.meta.url), 'utf8');
const BOARD = readFileSync(new URL('../public/v41/views/board/board-extras.js', import.meta.url), 'utf8');
const NETWORK = readFileSync(new URL('../public/v41/views/network/network.js', import.meta.url), 'utf8');
const PINBOARD = readFileSync(new URL('../public/v41/views/track58-pinboard.html', import.meta.url), 'utf8');
const NETWORK_HTML = readFileSync(new URL('../public/v41/views/track56-network.html', import.meta.url), 'utf8');

// #477 훑기 기준: 다시 띄우기(reload·src 재설정)는 "뜰 때마다 보내는 쪽"과 짝일 때 위험하다.
// 지금 살아 있는 위험한 짝은 하나뿐이다 — lt41-title-display: 셸이 프레임이 뜰 때마다(load마다) 보내고,
// 첫 화면(v41/home.js)·책장(shelf.js)은 그 값을 무조건 location.reload()로 받는다. 값 비교가 없어 어긋남이
// 이어지면 계속 다시 뜬다. 그 외는 값으로 막아져 있거나 한 번만 보내거나 무조건 다시 그리지 않는다.

test('lt41-date-style 고리(2026-11-12 사고)가 다시 생기지 않는다 — 흐름 시험', () => {
  // 셸은 프레임이 뜰 때마다(그리고 1.6초 뒤 한 번 더) 같은 값을 보낸다(shell.mjs onFrameReady).
  // #481 T6: 반복 전송도 frameReadyMessages 목록으로 돈다.
  // 첫 화면은 값이 실제로 바뀌었을 때만 다시 띄운다. "뜰 때마다 보내는 쪽"과 짝이어도 멈춘다.
  // 흐름 시뮬레이션(날짜 표기 한 벌 기준): 어떤 값 조합에서도 새로고침은 많아야 한 번 더.
  const run = (shellValues, mirror, judge = shouldReloadForDateStyle, maxLoads = 50) => {
    let loads = 0, i = 0;
    while (loads < maxLoads) {
      loads += 1;
      const rendered = dateStyleOf(mirror ?? undefined);
      let reloaded = false;
      for (let k = 0; k < 2 && !reloaded; k += 1) {
        const value = shellValues[Math.min(i, shellValues.length - 1)];
        i += 1;
        if (judge({ value, rendered, mirror })) reloaded = true;
      }
      if (!reloaded) break;
    }
    return loads;
  };
  for (const v of ['dot', 'dash', 'long']) {
    assert.equal(run([v], v), 1, `${v}: 한 번 뜨고 끝`);
  }
  assert.equal(run(['dot'], null), 1, '로그아웃(미러 없음): 한 번 뜨고 끝');
  assert.equal(run(['long'], null), 1, '값이 달라도 미러가 없으면 다시 띄우지 않는다');
  // 예전 판정(받으면 무조건)은 같은 흐름에서 상한까지 돈다 = 사고 그대로.
  assert.equal(run(['dot'], null, () => true), 50, '세기 증명: 무조건 다시 띄우는 판정은 멈추지 않는다');
});

test('#481 lt41-title-display — 흐름 시험: 셸이 뜰 때마다 보내도 다시 뜸은 한 번을 넘지 않는다', () => {
  // 셸이 (가정상) 프레임이 뜰 때마다 두 번씩 같은 값을 보내는 흐름을 그대로 돌린다.
  const run = (shellValues, mirror, renderedAt, judge = shouldReloadForTitleDisplay, maxLoads = 50) => {
    let loads = 0, i = 0, rendered = renderedAt;
    while (loads < maxLoads) {
      loads += 1;
      let reloaded = false;
      for (let k = 0; k < 2 && !reloaded; k += 1) { // 뜰 때 + 1.6초 뒤
        const value = shellValues[Math.min(i, shellValues.length - 1)];
        i += 1;
        if (judge({ value, rendered, mirror })) { reloaded = true; rendered = titleDisplayOf(mirror ?? value); }
      }
      if (!reloaded) break;
    }
    return loads;
  };
  // 세 값 모두, 미러가 같으면 한 번 뜨고 끝(받을 때마다 다시 뜨지 않는다).
  for (const v of ['both', 'mine', 'video']) {
    assert.equal(run([v], v, v), 1, `${v}: 한 번 뜨고 끝`);
  }
  // 값이 실제로 바뀌면 딱 한 번 더 뜨고 멈춘다(설정을 바꾸면 한 번 다시 그려진다).
  assert.equal(run(['mine'], 'mine', 'both'), 2, '바뀐 값을 만나면 한 번 더 뜬다');
  // 미러가 없으면(저장소 차단·계정 값 미확인) 다시 띄우지 않는다.
  assert.equal(run(['video'], null, 'both'), 1, '미러 없음: 다시 띄우지 않는다');
  // 예전 판정(받으면 무조건)은 같은 흐름에서 상한까지 돈다 = 사고 그대로(세기 증명).
  assert.equal(run(['both'], 'both', 'both', () => true), 50, '무조건 다시 띄우는 판정은 멈추지 않는다');
});

