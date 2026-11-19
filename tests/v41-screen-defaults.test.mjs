// #368 3차: 날짜 표기·처음 보여 줄 곳·보기 기본값·공유 기본값·용량 보기의 소스 계약.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatDisplayDate} from '../public/v41/book-usability.mjs';
import {normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeShareDiscover} from '../public/v41/domain.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const shell = read('public/v41/shell.mjs');
const messages = read('public/v41/shell/messages.mjs');
const html = read('public/v41/index.html');
const bookExtra = read('public/v41/views/book/book-extra.js');
const boardHtml = read('public/v41/views/track58-pinboard.html');
const networkHtml = read('public/v41/views/track56-network.html');
const network = read('public/v41/views/network/network.js');
const homeMoments = read('v41/home-moments.js');
const usability = read('public/v41/book-usability.mjs');

test('날짜 표기 3종: 한 벌(formatDisplayDate)이 2026. 11. 10 / 2026-11-10 / 11월 10일을 만든다', () => {
  const iso = '2026-11-10';
  assert.equal(formatDisplayDate(iso), '2026. 11. 10', '스타일을 주지 않으면 지금 표기(dot)다');
  assert.equal(formatDisplayDate(iso, 'dot'), '2026. 11. 10');
  assert.equal(formatDisplayDate(iso, 'dash'), '2026-11-10');
  assert.equal(formatDisplayDate(iso, 'long'), '11월 10일');
  assert.equal(formatDisplayDate('2026.11.9', 'long'), '11월 9일', '일 앞의 0은 떼고 부른다');
  assert.equal(formatDisplayDate('2026/03/05', 'dash'), '2026-03-05');
  assert.equal(formatDisplayDate('', 'dash'), '');
  assert.equal(formatDisplayDate('적지 않은 날짜', 'dash'), '적지 않은 날짜', '날짜가 아니면 그대로 둔다');
  // normalize는 도메인 한 벌(dot이 지금 표기).
  assert.equal(normalizeDateStyle('dash'), 'dash');
  assert.equal(normalizeDateStyle(undefined), 'dot');
  // 'book-usability가 도메인 한 벌을 고른다' import 배선 글자 2는 지웠다(이슈 952) —
  // 같은 한 벌을 쓰는 결과는 위 formatDisplayDate 값과 각 화면 시험의 날짜 표기로 확인한다.
});

// '날짜 표기 배선' 소스 글자 시험(20 단정)은 지웠다(이슈 952) — 셸이 프레임으로 보내는 값·시점·
// 다시 띄우기 판정은 tests/v41-settings-wiring-flow.test.mjs가 frame-wiring 함수를 실행해 확인하고,
// 책·보드·지도·첫 화면 목록이 같은 한 벌을 쓰는 결과는 각 화면의 시험(책 재생·보드·지도·첫 화면 감사)이
// 그려진 날짜로 확인한다. 기기 미러 채움(#466 M5)도 문자열 고정으로는 #477 같은 사고를 막지 못했다.

test('처음 보여 줄 곳: 첫 화면·서재 전체 보기·이어 읽기(기본), 주소가 이기면 그 주소다', () => {
  assert.equal(normalizeStartPlace(undefined), 'resume', '옛 저장본은 지금 동작(이어 읽기)이다');
  // '셸 진입 경로' 소스 글자 4와 설정 라디오 마크업 글자 3은 지웠다(이슈 952) — 주소(해시)가
  // 설정을 이기는 결과는 tests/v41-shell-location.test.mjs의 createLocation 시험과 첫 화면
  // 진입 화면 시험이 확인하고, 옵션 나열은 화면 카피라 글자로 고정하지 않는다.
});

// '보기 기본값' 소스 글자 시험(7 단정)은 지웠다(이슈 952) — 관계 지도 보기 전환의 실제 결과는
// tests/v41-map-theme-flow.test.mjs가(같은 키 lt41.network.view로 지도 보기가 바뀌는지) 화면에서 확인하고,
// 설정 마크업 문구는 화면 카피라 글자로 고정하지 않는다.

test('공유 기본값: 공유 창이 처음 열 보기를 설정값으로 시작한다(#538: 둘러보기 올림 설정은 공개 기본으로 정리)', () => {
  // 설정 마크업·문구 글자 검사 9는 지웠다(이슈 952) — 화면 카피·마크업 모양 고정이었다.
  // 트리마다 공개 줄 묶음(#830)의 동작은 share-steps·share-api 시험이 확인한다.
  assert.equal(normalizeShareView(undefined), 'book');
  assert.equal(normalizeShareDiscover(undefined), false, '옛 저장본의 shareDiscover 값은 읽기만 하고 화면은 없다');
  // '셸이 설정값을 공급하고 공유 창이 그 값을 따른다' 소스 글자 5는 지웠다(이슈 952) —
  // 공유 창의 실제 열림·기본 보기는 tests/v41-share-steps.test.mjs의 판 흐름 시험이 확인한다.
});

// '내 데이터 용량'(3 단정)·'탈퇴 안내 문구'(2 단정) 소스 글자 시험은 지웠다(이슈 952) —
// 용량 형식은 private-upload·보관 파일 창의 동작 시험과 화면 감사가, 안내 문구는 화면 카피라
// 글자로 고정하지 않는다.
