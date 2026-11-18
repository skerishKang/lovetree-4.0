// #465 작은 것 묶음 — 실행 계약 (1 책장·4 동그라미·5 둘러보기 말투).
// 2(설정 움직임)·3(계정 메뉴 설명)은 #458·#467(PR #499)가 고치는 index.html·설정 창 파일, 4는 헤더 시험 파일(v41-shell-header)로 옮겼다. 6(밤 테마 보드 판)은 대표 결정 전이라 이슈대로 손대지 않았다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const shelf = read('public/v41/views/shelf/shelf.js');
const shelfExtraCss = read('public/v41/views/shelf/shelf-extra.css');
const community = read('public/v41/community-panel.mjs');

test('#465 1: 책장 — 넘길 책이 없으면 화살표를 숨긴다(261118: 책등 목차는 지워졌다)', () => {
  // 렌더 때 목록 길이로 화살표를 숨긴다(검색 필터가 1권으로 줄어도 같다).
  assert.match(shelf, /var prevArrow=\$\('#shelfPrev'\),nextArrow=\$\('#shelfNext'\);/);
  assert.match(shelf, /if\(prevArrow\)prevArrow\.hidden=list\.length<=1;/);
  assert.match(shelf, /if\(nextArrow\)nextArrow\.hidden=list\.length<=1;/);
  // 숨김 확실 가드. 소개 상자 높이 규칙은 이어 보기 띠(261118 대표 지적 4)로 바뀌었다.
  assert.match(shelfExtraCss, /#shelfPrev\[hidden\],#shelfNext\[hidden\]\{display:none\}/);
});

test('#465 5: 둘러보기 안내를 사람 말로 — 빈 상태 안내는 가운데 카드 한 곳, 있으면 정렬에 맞는 말(#824)', () => {
  assert.match(community, /\(sortSelect\?\.value==='popular'\)\?'많이 담긴 순서예요\.'\:'새로 공개된 순서예요\.'/);
  assert.doesNotMatch(community, /공개 허용된 트리/);
  assert.doesNotMatch(community, /인기·추천 순위가 아니에요/);
});

test('#465 2: 설정 "움직임"은 켬/끔 스위치(role=switch)와 설명 한 줄을 가진다', () => {
  const html = read('public/v41/index.html');
  assert.match(html, /<button type="button" role="switch" id="settings-motion" aria-checked="true" aria-describedby="settings-motion-desc">켬<\/button>/);
  assert.match(html, /id="settings-motion-desc">카드 움직임을 멈추거나 다시 재생해요/);
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /motion\.setAttribute\('aria-checked',String\(!motionPaused\)\)/);
  assert.match(shell, /motion\.textContent=motionPaused\?'끔':'켬';/);
  // 프레임 알림(첫 화면 카드 멈춤)은 기존 배선을 그대로 쓴다 — 새로운 reload 유발 코드 없다.
  assert.match(shell, /postMessage\(\{type:'lt41-motion',paused:motionPaused\},location\.origin\)/);
  assert.match(read('public/v41/shell.css'), /\.settings-choice button\[role=switch\]\{min-width:76px;justify-content:center\}/);
});

test('#465 3: "고급 기능 보기"에 무엇이 달라지는지 한 줄 설명이 있다(2026-11-16: 계정 메뉴 → 설정 화면 탭 더 보기(고급))', () => {
  const html = read('public/v41/index.html');
  // 스위치는 설정 '화면' 탭의 더 보기(고급) 안에 있고, 켬/끔 글자로 상태가 보인다(#465 2의 role=switch 규칙과 같다).
  assert.match(html, /id="settings-advanced" aria-checked="false" aria-describedby="settings-advanced-desc">끔</);
  assert.match(html, /id="settings-advanced-desc">보드에서 편집 도구·되돌리기·이어 그리기가 늘어나요/);
  // 설명 글은 13px panel-note(#548 작은 글자 0 기준선)이고, 계정 메뉴에는 이제 스위치가 없다.
  assert.doesNotMatch(html, /id="account-advanced"/);
  // 설명 내용은 실제 고급 모드가 여는 것과 일치한다(보드 편집 도구·이어 그리기).
  assert.match(read('public/v41/views/board/board-extra.css'), /lt-advanced/);
});
