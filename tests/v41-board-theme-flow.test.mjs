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

test('설정 창 화면 탭: 보드·지도 판(테마 따라가기/종이/밤) 행이 있다(2026-11-16: 더 보기(고급) 접힘 안, 저장 위치는 탭 맨 아래 한 줄)', () => {
  const html = read('public/v41/index.html');
  const screen = html.slice(html.indexOf('id="account-settings-screen"'), html.indexOf('id="account-settings-profile"'));
  assert.match(screen, /id="settings-board-theme-label">보드·지도 판<\/span>/);
  assert.match(screen, /data-board-theme="auto"[^>]*>테마 따라가기<\/button>/);
  assert.match(screen, /data-board-theme="paper"[^>]*>종이<\/button>/);
  assert.match(screen, /data-board-theme="night"[^>]*>밤<\/button>/);
  // 줄마다 붙던 '이 기기에만' 표시는 없다 — 화면 탭 맨 아래 한 줄 설명에 모았다.
  assert.doesNotMatch(screen, /settings-scope">이 기기에만</);
  assert.match(screen, /테마·움직임·보드·지도 판·관계 지도 보기·페이지 넘김·첫 화면 카드·고급 기능 보기는 이 기기에만 저장되고/);
});

test('보드 화면 마크업: 머리줄은 배경 드롭 하나(#891) — 종이/밤 두 단추 나란히는 없다', () => {
  const boardHtml = read('public/v41/views/track58-pinboard.html');
  assert.match(boardHtml, /id="boardBgBtn"[^>]*>배경 ▾<\/button>/);
  assert.match(boardHtml, /id="boardBgMenu"[^>]*role="menu"/);
  assert.match(boardHtml, /data-bg="auto"[^>]*>테마 따라가기<\/button>/);
  assert.match(boardHtml, /data-bg="paper"[^>]*>종이<\/button>/);
  assert.match(boardHtml, /data-bg="night"[^>]*>밤<\/button>/);
  assert.doesNotMatch(boardHtml, /class="boardThemeSwitch"/);
  assert.match(boardHtml, /id="themeBadge"/);
});

test('지도 화면 마크업: 도구 줄에도 같은 배경 드롭이 있다(#891)', () => {
  const netHtml = read('public/v41/views/track56-network.html');
  assert.match(netHtml, /id="netBgBtn"[^>]*>배경 ▾<\/button>/);
  assert.match(netHtml, /id="netBgMenu"[^>]*role="menu"/);
  assert.match(netHtml, /data-bg="auto"[^>]*>테마 따라가기<\/button>/);
});

test('셸 배선: 판 상태 세 가지를 저장하고 프레임에는 해결된 판을 알린다(#891)', () => {
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /applyBoardThemeToFrame\(frame\)/);
  assert.match(shell, /frameMessage\('boardTheme',resolveBoardTheme\(\)\)/, '프레임에는 종이/밤으로 해결한 값을 넘긴다');
  assert.match(shell, /setAttribute\('data-lt-board-theme',message\.value\)/);
  assert.match(shell, /saveBoardTheme/, '고른 값은 한 곳(saveBoardTheme)에서 저장·반영한다');
  assert.match(shell, /lt41-board-theme-choice/, '보드·지도 드롭의 고르기 요청을 받는다');
  assert.match(shell, /lt41-board-theme/);
});

// 대비는 tests/v41-board-card-contrast.test.mjs가 실제 그려진 화면에서 카드 종류별로 잰다(변수 값끼리 계산하지 않는다).

test('보드 배선: 배경 드롭은 메뉴 항목만 받고, 원본 보드 테마(body[data-theme])는 건드리지 않는다(#891)', () => {
  const board = read('public/v41/views/board/board.js');
  const extras = read('public/v41/views/board/board-extras.js');
  assert.match(board, /#boardBgMenu \.lt-bg-item/, '고르기는 배경 드롭의 항목으로만 한다');
  assert.match(board, /lt41-board-theme-choice/, '고른 값은 셸에 요청으로 넘긴다(보드가 저장소에 직접 쓰지 않는다)');
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
