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

test('기억책: 넘김 판정은 움직임 줄이기가 우선이고, 고른 값은 다음 넘김부터 적용된다', () => {
  // 읽기는 한 장/두 장 보기(lt41-book-view)와 같은 localStorage 직접 읽기다.
  // 넘김 경로가 전부 한 벌 판정을 쓴다(선언 1 + 면·내용 2·두 장 준비·시간·이징 등 6곳 = 7).
  assert.equal((book.match(/smoothTurn\(\)/g) || []).length, 7, 'reduced를 직접 쓰던 넘김 경로는 smoothTurn 한 벌로 간다');
  // 실시간 변경: book-extra가 메시지를 받아 book.js의 설정 함수로만 값을 바꾼다.
});

test('설정 항목의 저장 위치: 코드는 그대로고, 줄 표시는 탭 맨 아래 한 줄로 모았다(2026-11-16)', () => {
  // 실제 저장 위치와 일치하는지 — 코드 기준: 테마·움직임·카드·탭·페이지 넘김은 기기, 제목 보기·프로필은 계정. 저장 키·방식은 바뀌지 않았다.
  // 줄마다 붙던 '이 기기에만 / 계정에 저장' 표시는 없다 — 트리마다 공개/비공개 줄 묶음이라 상태 표시 칸은 없다(#830 후속).
  const rows = [...html.matchAll(/class="settings-scope"[^>]*>([^<]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(rows, [], '줄 표시는 트리별 줄로 바뀌어 상태 칸이 없다');
  // 대신 탭마다 한 줄 설명에 모았다.
});
