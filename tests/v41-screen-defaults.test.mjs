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
  // book-usability가 스타일을 도메인 한 벌로 고른다.
  assert.match(usability, /import \{normalizeDateStyle\} from '\.\/domain\.mjs';/);
  assert.match(usability, /const chosen = normalizeDateStyle\(style\);/);
});

test('날짜 표기 배선: 책·보드·지도·첫 화면 목록이 같은 한 벌을 따르고, 바꾸면 다시 그린다', () => {
  // 책: book-extra가 스타일을 attribute에서 읽어 창 함수에 심고, 메시지로 다시 그린다.
  // 스타일은 프레임 속성 → 기기 캐시(lt41.dateStyle) → 기본 순으로 읽는다. 첫 그림(파싱 시점)에도 올바르고,
  // 이후 바뀌면 lt41-date-style 메시지로 다시 그린다(보드·지도·첫 화면 목록과 같은 순서).
  assert.match(bookExtra, /const cached=localStorage\.getItem\('lt41\.dateStyle'\);if\(cached\)return cached;/);
  assert.match(bookExtra, /const styledDate=v=>formatDisplayDate\(v,ltDateStyle\(\)\);/);
  // momentContent 재정의(제목 고치기 칸)의 날짜칸도 같은 스타일을 따른다.
  assert.equal((bookExtra.match(/formatDisplayDate\(m\.date\)/g) || []).length, 0, '스타일 없는 날짜 호출 잔재 없다');
  assert.ok(bookExtra.includes('formatDisplayDate(m.date,ltDateStyle())'), '재정의 템플릿도 스타일을 따른다');
  assert.match(shell, /localStorage\.setItem\('lt41\.dateStyle',b\.dataset\.dateStyle\)/);
  assert.match(bookExtra, /window\.LTBookTitle=\{view:titleViewFor,date:styledDate\}/);
  assert.match(bookExtra, /type!=='lt41-date-style'/);
  assert.match(bookExtra, /renderSpread\(current,LTDEMO\.get\(\),false\)/);
  // 보드: track58의 LTTitle이 스타일을 따르고, 보드는 다시 그림 이벤트를 듣는다.
  assert.match(boardHtml, /formatDisplayDate:v=>formatDisplayDate\(v,ltDateStyle\(\)\)/);
  assert.match(boardHtml, /dispatchEvent\(new Event\('lt-date-style-changed'\)\)/);
  assert.match(read('public/v41/views/board/board-extras.js'), /addEventListener\('lt-date-style-changed',\(\)=>\{try\{renderCards\(\)\}catch\{\}try\{renderThreads\(\)\}catch\{\}\}\);/);
  // 지도: track56이 같은 한 벌을 심고, network 상세 날짜가 dateText를 쓴다.
  assert.match(networkHtml, /window\.LTTitle=Object\.assign\(window\.LTTitle\|\|\{\},\{formatDisplayDate:v=>formatDisplayDate\(v,ltDateStyle\(\)\)\}\)/);
  assert.match(network, /const dateText=v=>\{try\{return window\.LTTitle\?\.formatDisplayDate\?\.\(v\)\|\|v\|\|''\}catch\{return v\|\|''\}\};/);
  assert.match(network, /\$\('detailDate'\)\.textContent=dateText\(n\.date\);/);
  // 첫 화면 순간 목록(home-moments)도 같은 한 벌.
  assert.match(homeMoments, /import \{ formatDisplayDate \} from '\.\.\/public\/v41\/book-usability\.mjs';/);
  assert.match(homeMoments, /date: text\(formatDisplayDate\(moment\?\.date, ltDateStyle\(\)\)\)/);
  // 셸: 프레임 속성+메시지(페이지 넘김과 같은 방식), 새 화면에도 알린다.
  assert.match(shell, /function applyDateStyleToFrame\(frame\)\{[\s\S]*?setAttribute\('data-lt-date-style',currentDateStyle\(\)\)[\s\S]*?postMessage\(\{type:'lt41-date-style',value:currentDateStyle\(\)\}/);
  assert.match(shell, /applyPageTurnToFrame\(frame\);applyDateStyleToFrame\(frame\);/);
  assert.match(shell, /try\{member\.apply\('setPrefs',\{dateStyle:b\.dataset\.dateStyle\}\);/);
  // 이슈 #466 M5: 로그인 onState에서 기기 미러(localStorage lt41.dateStyle)를 계정값으로 채운다 —
  // 다른 기기의 첫 그림이 기본(dot)에서 멈춰 있던 결함.
  assert.match(shell, /try\{localStorage\.setItem\('lt41\.dateStyle',normalizeDateStyle\(state\.prefs\?\.dateStyle\)\);\}catch\{\}/);
});

test('처음 보여 줄 곳: 첫 화면·내 트리 전체 보기·이어 읽기(기본), 주소가 이기면 그 주소다', () => {
  assert.match(html, /data-start-place="resume"[^>]*>이어 읽기</);
  assert.match(html, /data-start-place="home"[^>]*>첫 화면</);
  assert.match(html, /data-start-place="shelf"[^>]*>내 트리 전체 보기</);
  assert.equal(normalizeStartPlace(undefined), 'resume', '옛 저장본은 지금 동작(이어 읽기)이다');
  // 셸 진입 경로에서만 처리하고, 주소(해시·owner 경로)가 있으면 설정보다 이긴다.
  assert.match(shell, /const startPlace=\(\(\)=>\{try\{return normalizeStartPlace\(state\.prefs\?\.startPlace\)\}catch\{return 'resume'\}\}\)\(\);/);
  assert.match(shell, /if\(startPlace!=='resume'&&!route&&active\?\.scope!=='owner'&&\!\(active\?\.scope==='screen'&&active\.explicit\)&&!pending\)view=startPlace==='shelf'\?'shelf':'home';/);
  assert.match(shell, /view=startPlace==='shelf'\?'shelf':'home';/);
  assert.doesNotMatch(shell, /orbit\.js/, 'orbit.js는 건드리지 않는다');
});

test('보기 기본값 묶음: 관계 지도 기본 보기(이 기기)만 두고, 보드 기본 테마는 선택지가 없어 행이 없다', () => {
  assert.match(html, /id="settings-look-title"[^>]*>보기 기본값</);
  assert.match(html, /data-network-view="network"[^>]*>그물</);
  assert.match(html, /data-network-view="concentric"[^>]*>동심원</);
  // network.js가 쓰는 같은 키·같은 값이다.
  assert.match(network, /const VIEW_KEY='lt41\.network\.view';/);
  assert.match(shell, /const NETWORK_VIEW_KEY='lt41\.network\.view';/);
  assert.match(network, /if\(\(e\.data\.value==='network'\|\|e\.data\.value==='concentric'\)&&state\.view!==e\.data\.value\)setView\(e\.data\.value\);/);
  // 보드 테마 행 없음을 마크업 주석으로 남긴다(보고 근거).
  assert.match(html, /보드 기본 테마는 지금 고를 수 있는 값이 없어/);
  const look = html.slice(html.indexOf('account-settings-look"'), html.indexOf('account-settings-share"'));
  assert.equal(/data-board-theme/.test(look), false, '보드 기본 테마 행은 없다');
});

test('공유 기본값: 공유 창이 처음 열 보기·둘러보기 올림을 설정값으로 시작한다(서버 API 변경 없음)', () => {
  assert.match(html, /id="settings-share-title"[^>]*>공유</);
  // #453 C5: 설정의 공유 이름은 화면 탭과 같은 말(책·보드·지도)을 쓴다.
  assert.match(html, /data-share-view="book"[^>]*>책</);
  assert.match(html, /data-share-view="board"[^>]*>보드</);
  assert.match(html, /data-share-view="network"[^>]*>지도</);
  assert.doesNotMatch(html, />기억책</);
  assert.match(html, /data-share-discover="off"[^>]*>기본 꺼짐</);
  assert.match(html, /data-share-discover="on"[^>]*>기본 켬</);
  assert.equal(normalizeShareView(undefined), 'book');
  assert.equal(normalizeShareDiscover(undefined), false, '옛 저장본도 둘러보기 기본 꺼짐이다');
  // 셸이 설정값을 공급하고, 공유 창 열기 때 처음 열 보기가 그 값을 따른다.
  assert.match(shell, /getShareDefaults:\(\)=>\(\{view:currentShareView\(\),discover:currentShareDiscover\(\)\}\)/);
  assert.match(messages, /const getShareDefaults = deps\.getShareDefaults \|\| \(\(\) => \(\{view: 'book', discover: false\}\)\);/);
  assert.match(messages, /\$\('share-view'\)\.value = getShareDefaults\(\)\.view;/);
  // #480 M7: 둘러보기 올림은 링크를 만든 뒤에 정한다. '기본 켬'은 확인창을 한 번 띄우는 제안이고,
  // 확인 없이 체크박스만 켜지 않는다(켜짐인데 실제로는 주소로만 공개이던 거짓 상태를 없앴다).
  assert.doesNotMatch(messages, /\$\('share-discover'\)\.checked = getShareDefaults\(\)\.discover;/);
  assert.match(messages, /if \(getShareDefaults\(\)\.discover\) await setDiscoverable\(answer\.share\.id, true, \{ask: true\}\);/);
  assert.match(shell, /try\{member\.apply\('setPrefs',\{shareView:b\.dataset\.shareView\}\);/);
  assert.match(shell, /member\.apply\('setPrefs',\{shareDiscover:b\.dataset\.shareDiscover==='on'\}\);/);
});

test('내 데이터: 보관 파일 용량은 보관 파일 창과 같은 값·같은 형식이고, 새 API는 없다', () => {
  assert.match(html, /id="settings-usage" class="panel-note" hidden/);
  // private-upload.mjs의 사용량 줄과 같은 형식(usedBytes/quotaBytes · items/maxItems).
  assert.match(read('public/v41/private-upload.mjs'), /\(data\.usedBytes\/1000000\)\.toFixed\(1\)\+' \/ '\+\(data\.quotaBytes\/1000000\)\+' MB · '\+data\.items\.length\+' \/ '\+data\.maxItems\+'개'/);
  // #453 C4: 설정 용량은 '0 MB / 105 MB 사용 · n / 200개'로 읽힌다(보관 파일 창과 같은 값).
  assert.match(shell, /async function paintSettingsUsage\(\)\{[\s\S]*?accountApi\.listMedia\(\)[\s\S]*?Math\.round\(data\.usedBytes\/1000000\)\+' MB \/ '\+Math\.round\(data\.quotaBytes\/1000000\)\+' MB 사용 · '\+data\.items\.length\+' \/ '\+data\.maxItems\+'개'/);
  assert.match(shell, /void paintSettingsUsage\(\);/);
});

test('계정 묶음: 탈퇴 안내가 둘러보기 말로 통일됐다(#369 후속)', () => {
  assert.match(html, /공유 링크와 둘러보기 노출, 즐겨찾기·좋아요/);
  assert.doesNotMatch(html, /발견 목록 노출/);
});
