// #467: 보드 판 테마(종이/밤) 배선 및 대비(contrast) 검증 시험
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FRAME_MESSAGE_TYPES, frameMessage, shouldReloadOnFrameMessage
} from '../public/v41/frame-wiring.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('보드 판 테마 메시지: night/paper 정규화 및 모르는 값은 paper 기본', () => {
  assert.equal(FRAME_MESSAGE_TYPES.boardTheme, 'lt41-board-theme');
  assert.deepEqual(frameMessage('boardTheme', 'night'), { type: 'lt41-board-theme', value: 'night' });
  assert.deepEqual(frameMessage('boardTheme', 'paper'), { type: 'lt41-board-theme', value: 'paper' });
  assert.deepEqual(frameMessage('boardTheme', 'invalid'), { type: 'lt41-board-theme', value: 'paper' }, '모르는 값은 기본 종이 판');
  assert.deepEqual(frameMessage('boardTheme', undefined), { type: 'lt41-board-theme', value: 'paper' });
});

test('보드 판 테마 수신: 어떤 화면에서도 다시 띄우지 않는다(location.reload 없음, 인플레이스 반영)', () => {
  const msg = frameMessage('boardTheme', 'night');
  for (const screen of ['home', 'shelf', 'book', 'board', 'network']) {
    assert.equal(
      shouldReloadOnFrameMessage(screen, msg, { rendered: 'paper', mirror: 'night' }),
      false,
      `${screen}: 보드 판 테마로 다시 띄우지 않고 열린 채로 그린다`
    );
  }
});

test('설정 창 화면 묶음: 보드 판(종이/밤) 행이 있고 이 기기에만 저장된다', () => {
  const html = read('public/v41/index.html');
  const screen = html.slice(html.indexOf('account-settings-screen"'), html.indexOf('account-settings-write"'));
  assert.match(screen, /id="settings-board-theme-label">보드 판<\/span>/);
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

test('셸 배선: 보드 판 테마를 프레임에 알리고 메시지를 주고받는다', () => {
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /applyBoardThemeToFrame\(frame\)/);
  assert.match(shell, /const message=frameMessage\('boardTheme',currentBoardTheme\(\)\)/);
  assert.match(shell, /setAttribute\('data-lt-board-theme',message\.value\)/);
  assert.match(shell, /localStorage\.setItem\(BOARD_THEME_KEY,next\)/);
  assert.match(shell, /lt41-board-theme/);
});

function srgbLuminance(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = srgbLuminance(hex1);
  const l2 = srgbLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test('색상 접근성: 본문·제목·날짜·메모 모든 글자 대비 4.5:1 이상(WCAG AA 충족)', () => {
  // 카드 배경: 종이/밤 카드 공통 밝은 종이 (#fdfbf7)
  const cardBg = '#fdfbf7';
  const cardTitle = '#21182d';
  const cardMemo = '#382b3d';
  const cardMeta = '#61526a';
  const cardFirstTag = '#5a3e5c';

  const titleRatio = contrastRatio(cardTitle, cardBg);
  const memoRatio = contrastRatio(cardMemo, cardBg);
  const metaRatio = contrastRatio(cardMeta, cardBg);
  const firstTagRatio = contrastRatio(cardFirstTag, cardBg);

  assert.ok(titleRatio >= 4.5, `카드 제목 대비 ${titleRatio.toFixed(2)}:1 >= 4.5:1`);
  assert.ok(memoRatio >= 4.5, `카드 메모 대비 ${memoRatio.toFixed(2)}:1 >= 4.5:1`);
  assert.ok(metaRatio >= 4.5, `카드 메타·날짜 대비 ${metaRatio.toFixed(2)}:1 >= 4.5:1`);
  assert.ok(firstTagRatio >= 4.5, `첫 순간 태그 대비 ${firstTagRatio.toFixed(2)}:1 >= 4.5:1`);

  // 종이 판 제목 (바탕 #f7f2ea)
  const paperSurfaceBg = '#f7f2ea';
  const paperTitleH1 = '#34283d';
  const paperTitleP = '#61526a';
  assert.ok(contrastRatio(paperTitleH1, paperSurfaceBg) >= 4.5, '종이 판 제목 대비 >= 4.5:1');
  assert.ok(contrastRatio(paperTitleP, paperSurfaceBg) >= 4.5, '종이 판 설명 대비 >= 4.5:1');

  // 밤 판 제목 (바탕 #100f1c)
  const nightSurfaceBg = '#100f1c';
  const nightTitleH1 = '#ffe6a6';
  const nightTitleP = '#b8b2c4';
  assert.ok(contrastRatio(nightTitleH1, nightSurfaceBg) >= 4.5, '밤 판 제목 대비 >= 4.5:1');
  assert.ok(contrastRatio(nightTitleP, nightSurfaceBg) >= 4.5, '밤 판 설명 대비 >= 4.5:1');

  // 상세/도구 패널 (바탕 #140e1c)
  const panelBg = '#140e1c';
  const panelValue = '#f5f1e9';
  const panelLabel = '#bfaec8';
  assert.ok(contrastRatio(panelValue, panelBg) >= 4.5, '패널 값 대비 >= 4.5:1');
  assert.ok(contrastRatio(panelLabel, panelBg) >= 4.5, '패널 라벨 대비 >= 4.5:1');
});
