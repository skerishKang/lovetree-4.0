// #477: 배포 직후 검사기(tools/postdeploy)가 "프레임이 계속 다시 뜨는 고장"을 잡는지 고정한다.
// 2026-11-12 본 주소 사고(초당 약 6회 다시 뜸)는 수리(#476) 전 4055286 빌드에서 재현되고, 지금 main에서 멈춰 있다.
// 이 시험은 검사기 쪽 계약(세는 곳·기준 횟수·화면 목록·첫 화면 카드 판정)이 사라지지 않게 붙든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FRAME_LOAD_COUNTER, FRAME_RELOAD_LIMIT, HOME_CARD_STATE, INCIDENT_RELOADS_PER_SECOND, RELOAD_SCREENS, reloadCheckId,
} from '../tools/postdeploy/frame-reload.mjs';

const TOOL = readFileSync(new URL('../tools/postdeploy/postdeploy.mjs', import.meta.url), 'utf8');
const SHELL = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
const SCREENS = readFileSync(new URL('../public/v41/shell/screens.mjs', import.meta.url), 'utf8');

test('검사 이름·기준: 화면 다섯 개를 stability/frame-reload-<화면>으로 보고, 2회 넘으면 fail', () => {
  assert.equal(FRAME_RELOAD_LIMIT, 2);
  assert.deepEqual(RELOAD_SCREENS.map((s) => s.key), ['home', 'book', 'board', 'map', 'shelf']);
  assert.equal(reloadCheckId('home'), 'frame-reload-home');
  // 셸의 화면 목록(public/v41/shell/navigation.mjs)과 같은 파일 이름을 쓴다 — 이름이 바뀌면 검사가 헛돈다.
  const NAV = readFileSync(new URL('../public/v41/shell/navigation.mjs', import.meta.url), 'utf8');
  for (const screen of RELOAD_SCREENS) {
    assert.ok(NAV.includes(`'${screen.file}'`), `${screen.key}: ${screen.file} 이 셸 화면 목록에 있다`);
  }
  // 사고 눈금(초당 6회)은 참고값으로 남긴다(README·보고에 쓰는 비교 숫자).
  assert.equal(INCIDENT_RELOADS_PER_SECOND, 6);
});

test('세는 곳: 안쪽 프레임 #view·#view-next의 load이고, about:blank로 비우는 순간은 세지 않는다', () => {
  // 셸은 화면 교대 때 이전 장을 about:blank로 비운다(screens.mjs). 그것을 '다시 뜬 것'으로 세면 거짓 fail이 난다.
  assert.match(SCREENS, /contentWindow\.location\.replace\('about:blank'\)/);
  assert.match(FRAME_LOAD_COUNTER, /'view', 'view-next'/);
  assert.match(FRAME_LOAD_COUNTER, /about:blank/);
  assert.match(FRAME_LOAD_COUNTER, /addEventListener\('load'/);
});

test('첫 화면 카드 판정: transform 빈 카드 0장, 가운데 안전 구역 침범 0장', () => {
  // 궤도 안전 구역은 .center + 여백 32px이다(src/views/orbit.js measureSafeZone).
  assert.match(HOME_CARD_STATE, /SAFE_MARGIN = 32/);
  assert.match(HOME_CARD_STATE, /button\.card/);
  // 띄운 뒤 5초를 보고, 첫 화면은 카드까지 함께 판정한다.
  assert.match(TOOL, /const WATCH_MS = 5000;/);
  assert.match(TOOL, /const cardsOk = !!c\.ready && c\.cards > 0 && c\.unplaced === 0 && c\.inSafeZone === 0;/);
  assert.match(TOOL, /record\(id, 'stability', status, detail, extra\)/);
});

test('로그아웃에서 돈다: 계정이 필요 없고 --frame-reload 로 그 검사만 돌린다', () => {
  assert.match(TOOL, /case '--frame-reload': opts\.frameReload = true; break;/);
  assert.match(TOOL, /--frame-reload/);
  // 기본 실행에서는 '아직 로그아웃일 때만' 돈다(로그인 세션 검사와 섞이지 않게).
  assert.match(TOOL, /!oembed\.loggedIn && !\(await sessionLoggedIn\(page, 2000\)/);
  // 이 검사는 대표 브라우저·세션(CDP)을 쓰지 않는다 — 자기 프로필로 한 브라우저만 띄운다.
  assert.doesNotMatch(TOOL.slice(TOOL.indexOf('async function checkFrameReloads'), TOOL.indexOf('async function checkVisualTokens')), /connectOverCDP|opts\.cdp/);
});
