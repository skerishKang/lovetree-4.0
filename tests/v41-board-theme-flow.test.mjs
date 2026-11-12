// #467: 보드·지도 판 테마(종이/밤) 배선 및 대비(contrast) 검증 시험
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FRAME_MESSAGE_TYPES, frameMessage, shouldReloadOnFrameMessage
} from '../public/v41/frame-wiring.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('보드·지도 판 테마 메시지: night/paper 정규화 및 모르는 값은 paper 기본', () => {
  assert.equal(FRAME_MESSAGE_TYPES.boardTheme, 'lt41-board-theme');
  assert.deepEqual(frameMessage('boardTheme', 'night'), { type: 'lt41-board-theme', value: 'night' });
  assert.deepEqual(frameMessage('boardTheme', 'paper'), { type: 'lt41-board-theme', value: 'paper' });
  assert.deepEqual(frameMessage('boardTheme', 'invalid'), { type: 'lt41-board-theme', value: 'paper' }, '모르는 값은 기본 종이 판');
  assert.deepEqual(frameMessage('boardTheme', undefined), { type: 'lt41-board-theme', value: 'paper' });
});

test('보드·지도 판 테마 수신: 어떤 화면에서도 다시 띄우지 않는다(location.reload 없음, 인플레이스 반영)', () => {
  const msg = frameMessage('boardTheme', 'night');
  for (const screen of ['home', 'shelf', 'book', 'board', 'network']) {
    assert.equal(
      shouldReloadOnFrameMessage(screen, msg, { rendered: 'paper', mirror: 'night' }),
      false,
      `${screen}: 보드·지도 판 테마로 다시 띄우지 않고 열린 채로 그린다`
    );
  }
});

test('설정 창 화면 묶음: 보드·지도 판(종이/밤) 행이 있고 이 기기에만 저장된다', () => {
  const html = read('public/v41/index.html');
  const screen = html.slice(html.indexOf('account-settings-screen"'), html.indexOf('account-settings-write"'));
  assert.match(screen, /id="settings-board-theme-label">보드·지도 판<\/span>/);
  assert.match(screen, /data-board-theme="paper"[^>]*>종이<\/button>/);
  assert.match(screen, /data-board-theme="night"[^>]*>밤<\/button>/);
  assert.match(screen, /aria-labelledby="settings-board-theme-label"[\s\S]*?class="settings-scope">이 기기에만<\/span>/);
});

test('보드 화면 마크업: 도구 줄 및 패널에 종이/밤 전환 단추가 있다', () => {
  const boardHtml = read('public/v41/views/track58-pinboard.html');
  assert.match(boardHtml, /class="boardThemeSwitch"/);
  assert.match(boardHtml, /data-board-theme="paper"[^>]*>종이<\/button>/);
  assert.match(boardHtml, /data-board-theme="night"[^>]*>밤<\/button>/);
  assert.match(boardHtml, /id="themeBadge"/);
});

test('셸 배선: 보드·지도 판 테마를 프레임에 알리고 메시지를 주고받는다', () => {
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /applyBoardThemeToFrame\(frame\)/);
  assert.match(shell, /const message=frameMessage\('boardTheme',currentBoardTheme\(\)\)/);
  assert.match(shell, /setAttribute\('data-lt-board-theme',message\.value\)/);
  assert.match(shell, /localStorage\.setItem\(BOARD_THEME_KEY,next\)/);
  assert.match(shell, /lt41-board-theme/);
});

// 대비는 tests/v41-board-card-contrast.test.mjs가 실제 그려진 화면에서 카드 종류별로 잰다(변수 값끼리 계산하지 않는다).

test('보드 배선: 판 바꾸기는 [종이|밤] 단추만 받고, 원본 보드 테마(body[data-theme])는 건드리지 않는다', () => {
  const board = read('public/v41/views/board/board.js');
  const extras = read('public/v41/views/board/board-extras.js');
  assert.match(board, /closest\?\.\('button\[data-board-theme\]'\)/, '문서 클릭은 button[data-board-theme]에만 반응한다');
  assert.doesNotMatch(board, /closest\('\[data-board-theme\]'\)/, '속성만 보는 closest는 body·html 속성에 걸려 모든 클릭을 판 바꾸기로 읽는다');
  assert.match(extras, /document\.body\.dataset\.theme='pearl';/, '원본 보드 테마 기본(진주빛) 그대로');
  assert.doesNotMatch(extras, /dataset\.theme\s*=\s*[^;]*'night'/, '밤 판이라고 원본 "밤" 보드 테마(어두운 카드)를 켜지 않는다');
  assert.doesNotMatch(board, /#ff7da7|#7ee4ff|#ffd67d|#c4b0ff/, '밤 실 색은 CSS 한 곳(board.css)에만 둔다');
});

test('고급 도구의 보드 테마 6종은 그대로 있다', () => {
  const html = read('public/v41/views/track58-pinboard.html');
  for (const [k, label] of [['pearl', '진주빛'], ['cork', '따뜻한 코르크'], ['letter', '편지'], ['blossom', '꽃잎'], ['night', '밤'], ['mint', '민트']]) {
    assert.match(html, new RegExp(`class="themeBtn[^"]*" data-theme="${k}">${label}</button>`));
  }
});

test('밤 판 CSS: 카드는 밝은 종이 카드, 판 규칙은 board-extra.css 맨 끝 한 덩어리', () => {
  const css = read('public/v41/views/board/board-extra.css');
  const at = css.indexOf('=== #467 밤 판');
  assert.ok(at > 0, '밤 판 블록이 있다');
  const block = css.slice(at);
  assert.match(block, /\[data-lt-board-theme="night"\] body \.card\{background:linear-gradient\(145deg,#fffdf9,#f4eee6\)/);
  assert.match(block, /\[data-lt-board-theme="night"\] body \.card h3,/);
  assert.equal(css.lastIndexOf('[data-lt-board-theme') >= at, true);
});
