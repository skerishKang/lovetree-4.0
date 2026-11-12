// #368 2차(댓글 2): 페이지 넘김(종이처럼/부드럽게) — 기기 저장·움직임 줄이기 우선·기억책 전달 계약.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readPageTurn, writePageTurn, normalizePageTurn, PAGE_TURN_KEY, DEFAULT_PAGE_TURN} from '../public/v41/header-state.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const shell = read('public/v41/shell.mjs');
const book = read('public/v41/views/book/book.js');
const html = read('public/v41/index.html');
const css = read('public/v41/shell.css');

function storage(map = {}) {
  return {
    getItem: key => (key in map ? map[key] : null),
    setItem: (key, value) => { map[key] = String(value); },
    map
  };
}

test('페이지 넘김 값: 기본 종이처럼, 모르는 값도 종이처럼, 저장은 이 기기(lt41.pageTurn)', () => {
  assert.equal(PAGE_TURN_KEY, 'lt41.pageTurn');
  assert.equal(DEFAULT_PAGE_TURN, 'paper');
  assert.deepEqual(normalizePageTurn('smooth'), 'smooth');
  for (const bad of [undefined, null, '', 'PAPER', 'fade', 1, {}]) {
    assert.equal(normalizePageTurn(bad), 'paper', String(bad));
  }
  // 저장소가 비었거나 막혀도 종이처럼로 동작한다(try/catch 규칙).
  assert.equal(readPageTurn(storage()), 'paper');
  assert.equal(readPageTurn(null), 'paper');
  const throwing = {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }};
  assert.equal(readPageTurn(throwing), 'paper');
  assert.equal(writePageTurn(throwing, 'smooth'), 'smooth', '저장이 막혀도 고른 값을 돌려준다');
  // 저장→읽기 왕복.
  const map = storage();
  assert.equal(writePageTurn(map, 'smooth'), 'smooth');
  assert.equal(readPageTurn(map), 'smooth');
  assert.equal(writePageTurn(map, 'paper'), 'paper');
  assert.equal(readPageTurn(map), 'paper');
});

test('설정 화면: 페이지 넘김 행은 화면 묶음에 있고 누르면 저장→표시→기억책 전달을 한다', () => {
  assert.match(html, /data-page-turn="paper"[^>]*>종이처럼</);
  assert.match(html, /data-page-turn="smooth"[^>]*>부드럽게</);
  // 저장은 header-state 한 벌(readPageTurn/writePageTurn)로, 기본값은 종이처럼이다.
  assert.match(shell, /function currentPageTurn\(\)\{return readPageTurn\(localStorage\);\}/);
  assert.match(shell, /const next=writePageTurn\(localStorage,b\.dataset\.pageTurn\);/);
  // 전달은 테마와 같은 방식: 프레임 문서 속성 + lt41-page-turn 메시지(두 iframe 모두).
  // #481 T6: 페이지 넘김 메시지도 frame-wiring 한 곳에서 만든다(문자열을 셸에 직접 적지 않는다).
  assert.match(shell, /function applyPageTurnToFrame\(frame\)\{/);
  assert.match(shell, /const message=frameMessage\('pageTurn',currentPageTurn\(\)==='on'\);/);
  assert.match(shell, /setAttribute\('data-lt-page-turn',currentPageTurn\(\)\)/);
  assert.match(shell, /sendToFrame\(frame,message\)/);
  // 실행 확인은 tests/v41-settings-wiring-flow.test.mjs가 맡는다(보내는 시점·값을 실제로 돌린다).
  assert.doesNotMatch(shell, /type:'lt41-page-turn',value:/, '메시지를 직접 만들지 않는다');
  assert.match(shell, /for\(const f of frames\(\)\)applyPageTurnToFrame\(f\);/);
  // 새로 열린 화면에도 값을 알린다(기존 onFrameReady 경로).
  assert.match(shell, /mountConnectionTool\(d\);applyViewAccessibility\(d\);shellQuick\.mountFrame\(d\);/);
  // 고른 값은 aria-checked로 칠한다.
  assert.match(shell, /function paintPageTurnControls\(\)\{const value=currentPageTurn\(\);for\(const b of document\.querySelectorAll\('\[data-page-turn\]'\)\)b\.setAttribute\('aria-checked',String\(b\.dataset\.pageTurn===value\)\);\}/);
});

test('기억책: 넘김 판정은 움직임 줄이기가 우선이고, 고른 값은 다음 넘김부터 적용된다', () => {
  // 읽기는 한 장/두 장 보기(lt41-book-view)와 같은 localStorage 직접 읽기다.
  assert.match(book, /const PAGE_TURN_KEY='lt41\.pageTurn';/);
  assert.match(book, /let pageTurn='paper';try\{pageTurn=localStorage\.getItem\(PAGE_TURN_KEY\)==='smooth'\?'smooth':'paper'\}catch\{\}/);
  assert.match(book, /function smoothTurn\(\)\{return reduced\|\|pageTurn==='smooth'\}/, '시스템 움직임 줄이기가 고른 값보다 우선한다');
  // 넘김 경로가 전부 한 벌 판정을 쓴다(선언 1 + 면·내용 2·두 장 준비·시간·이징 등 6곳 = 7).
  assert.equal((book.match(/smoothTurn\(\)/g) || []).length, 7, 'reduced를 직접 쓰던 넘김 경로는 smoothTurn 한 벌로 간다');
  assert.equal(book.includes("dur=reduced?350:"), false);
  // 실시간 변경: book-extra가 메시지를 받아 book.js의 설정 함수로만 값을 바꾼다.
  assert.match(book, /function setPageTurnMode\(value\)\{pageTurn=value==='smooth'\?'smooth':'paper'\}/);
  assert.match(book, /window\.setPageTurnMode=setPageTurnMode;/);
  assert.match(read('public/v41/views/book/book-extra.js'), /type!=='lt41-page-turn'/);
});

test('설정 항목마다 저장 위치 표시가 있다(계정에 저장 / 이 기기에만)', () => {
  // 실제 저장 위치와 일치하는지 — 코드 기준: 테마·움직임·카드·탭·페이지 넘김은 기기, 제목 보기·프로필은 계정.
  assert.match(shell, /writeTheme\(localStorage,b\.dataset\.setTheme\)/, '테마는 이 기기');
  assert.match(shell, /member\.apply\('setPrefs',\{titleDisplay:value\}\)/, '제목 보기는 계정');
  assert.match(shell, /localStorage\.setItem\('lt41\.homeCards'/, '첫 화면 카드는 이 기기');
  assert.match(shell, /writeWriteTab\(localStorage,b\.dataset\.writeTab\)/, '먼저 보일 탭은 이 기기');
  assert.match(shell, /writePageTurn\(localStorage/, '페이지 넘김은 이 기기');
  assert.match(shell, /member\.apply\('setPrefs',patch\)/, '프로필은 계정');
  // 표시: 제목 보기·프로필 행은 "계정에 저장", 나머지 설정 행은 "이 기기에만". 여섯 행 모두 표시가 있다.
  const rows = [...html.matchAll(/<div class="settings-row"[\s\S]*?class="settings-scope">([^<]+)<\/span>/g)]
    .map(m => `${m[0]}|${m[1]}`);
  // 계정에 저장: 제목 보기·날짜 표기·처음 보여 줄 곳·프로필(이름·색)·공유 2행. 나머지는 이 기기에만.
  const accountRows = rows.filter(r => r.endsWith('|계정에 저장'));
  assert.equal(accountRows.length, 7, '계정에 저장 7행(제목·날짜·처음·이름·색·공유 2)');
  for (const frag of ['data-title-display', 'data-date-style', 'data-start-place', 'id="profile-name"', 'id="profile-color"', 'data-share-view', 'data-share-discover']) {
    assert.ok(rows.some(r => r.includes(frag)), `행이 있어야 한다: ${frag}`);
  }
  assert.ok(rows.some(r => r.includes('data-date-style') && r.endsWith('|계정에 저장')), '날짜 표기는 계정에 저장');
  assert.ok(rows.some(r => r.includes('data-start-place') && r.endsWith('|계정에 저장')), '처음 보여 줄 곳은 계정에 저장');
  assert.ok(rows.some(r => r.includes('data-network-view') && r.endsWith('|이 기기에만')), '관계 지도 기본 보기는 이 기기에만');
  assert.ok(rows.some(r => r.includes('data-board-theme') && r.endsWith('|이 기기에만')), '보드 판은 이 기기에만');
  // 프로필 2 + 화면 8(테마·보드 판·움직임·제목·페이지 넘김·날짜·처음·카드) + 보기 1 + 공유 2 + 순간 추가 1 = 14행.
  assert.equal(rows.length, 14, '열네 설정 행마다 표시가 있다');
  for (const row of rows) {
    const isAccount = /data-title-display=/.test(row) || /id="profile-name"/.test(row) || /id="profile-color"/.test(row)
      || /data-date-style=/.test(row) || /data-start-place=/.test(row) || /data-share-view=/.test(row) || /data-share-discover=/.test(row);
    const want = isAccount ? '계정에 저장' : '이 기기에만';
    assert.ok(row.endsWith('|' + want), `저장 위치 표시(${want}): ${row.slice(0, 70)}…`);
  }
  assert.match(css, /\.settings-scope\{margin-left:auto;flex:0 0 auto;font-size:11px;color:var\(--lt-muted\);white-space:nowrap\}/);
});
