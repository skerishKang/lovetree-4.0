import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// #453 CTO 점검 1차 PR 2: 설정 창 정리(C) · 자세한 추가 파일 단추(B-2) · 빈 화면 정리(D) · 예시 책 제목(E).
// 화면 배선은 글자로, 순수 규칙은 함수로 고정한다.
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const shell = read('public/v41/shell.mjs');
const html = read('public/v41/index.html');
const css = read('public/v41/shell.css');
const screens = read('public/v41/shell/screens.mjs');
const community = read('public/v41/community-panel.mjs');
const notice = read('public/v41/shell/notice.mjs');
const upload = read('public/v41/private-upload.mjs');

test('C1·C2: 설정 창은 맨 위에서 열리고, 지난 안내는 남지 않는다', () => {
  assert.match(shell, /openAccountSettings\(\{section=''[\s\S]{0,80}?\)\{/, '기본값은 맨 위(빈 구역)다');
  assert.match(shell, /if\(!section\)return;/, '구역을 지정했을 때만 그 묶음으로 스크롤한다');
  assert.match(shell, /settings-feedback'\)\.textContent=''/, '열 때 지난 안내를 비운다');
  assert.match(notice, /if \(\$\('settings-feedback'\) && \$\('account-settings'\)\?\.open\)/, '설정이 열려 있을 때만 그 줄에 쓴다');
});

test('C3·C4·C5: 이름·용량·공유 보기 이름', () => {
  const nameLine = shell.slice(shell.indexOf('function paintSettingsProfile'), shell.indexOf('function paintSettingsProfile') + 700);
  assert.match(nameLine, /displayName/, '표시 이름을 먼저 쓴다');
  assert.equal((nameLine.match(/@/g) || []).length <= 1, true, '이메일은 한 번만 쓴다');
  assert.match(shell, /Math\.round\(data\.usedBytes\/1000000\)\+' MB \/ '\+Math\.round\(data\.quotaBytes\/1000000\)\+' MB 사용/);
  assert.match(html, /data-share-view="book"[^>]*>책</);
  assert.match(html, /data-share-view="network"[^>]*>지도</);
  assert.doesNotMatch(html, />기억책</);
  assert.match(css, /@media\(min-width:900px\)\{#account-settings\{padding-inline:max\(24px,calc\(\(100% - 720px\)\/2\)\)\}\}/, '넓은 화면은 720px 안팎 가운데');
});

test('B-2: 사진·영상은 디자인 단추 + 고른 파일 이름으로 고른다', () => {
  assert.match(upload, /class="file-pick"/);
  assert.match(upload, /class="file-pick-button"/, '보이는 것은 단추다');
  assert.match(upload, /class="file-pick-name"/, '고른 파일 이름 자리');
  assert.match(upload, /<span class="file-pick">[\s\S]{0,240}?<input type="file"/, '실제 input은 같은 칸 안에 그대로 둔다');
  assert.match(upload, /function setName\(/);
  assert.match(css, /\.file-pick input\[type=file\]\{display:none\}/, '실제 칸은 숨긴다');
  assert.match(css, /\.file-pick-button\{[^}]*min-height:44px/, '누를 수 있는 크기');
  assert.match(upload, /<button type="button" class="file-pick-button" data-file-open>/, '단추는 키보드로 눌린다');
  assert.match(upload, /querySelector\('\[data-file-open\]'\)|\[data-file-open\]/, '단추가 실제 input을 연다');
});

test('D1: 빈 화면에서는 어느 탭도 "지금 보는 곳"이 아니다', () => {
  assert.match(screens, /document\.querySelectorAll\('\[data-view\]'\)\.forEach\(b => b\.setAttribute\('aria-current', 'false'\)\);/);
  assert.match(community, /const emptyShown=!document\.getElementById\('empty'\)\?\.hidden;/, '빈 화면이면 닫을 때 되살리지 않는다');
  assert.match(community, /if\(!emptyShown\)t\.setAttribute\('aria-current','true'\)/);
});

test('D2: 빈 화면 문구·단추는 계정 상태에 맞춘다', () => {
  assert.match(shell, /function paintEmptyCopy\(\)/);
  assert.match(shell, /owned\?'아직 트리가 없어요\.':'다시 펼칠 순간을 기다리고 있어요\.'/);
  // #463: 트리 0개(로그인)는 ＋ 첫 트리 만들기가 주 버튼이다.
  assert.match(shell, /\$\('empty-records'\)\.textContent=owned\?'＋ 첫 트리 만들기':'내 기록 불러오기'/);
  assert.match(shell, /\$\('empty-file'\)\.hidden=owned;/, '로그인 상태에서는 백업 파일 열기를 숨긴다');
  assert.match(shell, /if\(kind!=='share'\)\{[\s\S]{0,120}?paintEmptyCopy\(\);/);
});

test('D3: 공개 트리가 0개면 미리보기 칸을 숨기고 빈 안내만 가운데', () => {
  assert.match(community, /function previewCollapses\(\)\{return !items\.length&&!loading;\}/);
  assert.match(community, /if\(previewCollapses\(\)\)preview\.hidden=true;else preview\.hidden=false;/);
  assert.match(css, /\.community-layout:has\(#community-preview\[hidden\]\)\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /\.community-layout:has\(#community-preview\[hidden\]\) \.community-empty\{[^}]*text-align:center/);
});
