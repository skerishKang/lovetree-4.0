// 1.5단계 ②: 첫 화면(src064-orbit) 두 벌 합치기(#231).
// 실제 기록 판본을 기준으로 합치되, 예시 판본에서 보이던 것(카드 기본 배치·목록 번호·이어가기 갈래 선택·책으로 보기)은
// 데이터 상태(LTDEMO.example)로 갈라 그대로 유지한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');
const SCREEN = read('views/src064-orbit.html');
// #262·#266·#267 방식: 화면은 마크업과 연결만 두고, 스타일·동작은 views/orbit/ 아래 파일이 맡는다.
const CSS = read('views/orbit/orbit.css');
const SERVER = read('views/orbit/orbit.js') + read('views/orbit/orbit-cards.mjs') + read('views/orbit/orbit-model.mjs');
const RUNTIME = read('runtime.js');

test('design/views/에 화면 사본이 없다(한 벌만 남았다)', () => {
  assert.equal(fs.existsSync(new URL(`../public/v41/design/views/src064-orbit.html`, import.meta.url)), false);
});

test('합친 첫 화면은 런타임 한 벌만 부른다(예시 전용 shared.js 없음)', () => {
  assert.match(SCREEN, /src="\/v41\/runtime\.js"/);
  assert.doesNotMatch(SCREEN, /shared\.js/);
});

test('화면은 마크업과 연결만 두고 스타일·동작은 views/orbit/ 파일이 맡는다', () => {
  assert.match(SCREEN, /href="\/v41\/views\/orbit\/orbit\.css"/);
  assert.match(SCREEN, /<script type="module" src="\/v41\/views\/orbit\/orbit\.js"><\/script>/);
  assert.match(SCREEN, /id="app"/);
  assert.ok(SCREEN.split('\n').length < 60, '화면 HTML은 마크업만 남는다');
  // 인라인 스타일·스크립트가 남아 있지 않다.
  assert.doesNotMatch(SCREEN, /<style>/);
  assert.doesNotMatch(SCREEN, /<script>\s/);
});

test('깊이가 다른 두 폴더에서도 같은 파일을 쓰도록 자원 경로는 /v41/ 절대 경로', () => {
  const refs = SCREEN.match(/(?:src|href)="[^"]+"/g) || [];
  for (const ref of refs) {
    assert.ok(!ref.includes('"../'), ref);
  }
  assert.ok(SCREEN.includes('"/v41/runtime.js"'));
});

test('카드 기본 배치와 개수 표시는 데이터 모양으로 갈린다(예시 여부 분기 없음)', () => {
  // 배치값을 스스로 가진 순간(예시)은 그대로, 없는 순간(실제 기록)만 기본 배치를 돌려 쓴다.
  assert.match(SERVER, /const hasLayout=m=>typeof m\.ring==='string'&&'baseAngle' in m;/);
  assert.match(SERVER, /\.\.\.\(hasLayout\(m\)\?\s*\{\}\s*:\s*BASE_CARDS\[i%BASE_CARDS\.length\]\)/);
  // 화면에 적힌 수가 자료 수와 다를 때만 고쳐 쓴다.
  assert.match(SERVER, /el\.textContent\.trim\(\)!==String\(CARDS\.length\)/);
  assert.doesNotMatch(SERVER, /LTDEMO\.example\?\{\}/);
  assert.doesNotMatch(SERVER, /if\(!LTDEMO\.example\)document\.querySelector/);
});

test('목록 번호는 id 모양으로 갈린다(m01 → 01, 그 밖은 목록 자리)', () => {
  assert.match(SERVER, /function momentSeq\(c\)\{const n=\/\^m\(\\d\+\)\$\/\.exec\(String\(c\.id\)\)/);
  assert.match(SERVER, /return n\?c\.id\.slice\(1\):CARDS\.indexOf\(c\)\+1/);
  assert.match(SERVER, /<small>\$\{momentSeq\(c\)\}<\/small>/);
});

test('이어가기와 책으로 보기는 예시에서 원래 동작을 유지한다(데이터 상태 분기)', () => {
  assert.match(SERVER, /function continuePath\(\)\{if\(!LTDEMO\.example\)\{/);
  assert.match(SERVER, /branchChoice\.classList\.add\('open'\)/);
  assert.match(SERVER, /function openStoryBook\(\)\{if\(!LTDEMO\.example\)\{parent\.postMessage\(\{type:'lt41-navigate'/);
  assert.match(SERVER, /resolveTrack59Target\(\)/);
  assert.doesNotMatch(SERVER, /source===['"]example['"]/);
});

test('사용자 입력은 항상 이스케이프한다', () => {
  assert.match(SERVER, /const escapeRecord=/);
  assert.match(SERVER, /<b>\$\{escapeRecord\(c\.title\)\}<\/b>/);
});

test('runtime.js의 실제 기록 경로(트리에서 직접 만들기)는 그대로다', () => {
  assert.match(RUNTIME, /const demo = tree\.demoData;/);
  assert.match(RUNTIME, /demo \? demo\.moments\.map\(m => \(\{\.\.\.m\}\)\) : tree\.moments\.map\(m => \{/);
  assert.match(RUNTIME, /if\(context\.source==='server'\)addEventListener/);
});

test('순수 함수는 node에서 그대로 import해 시험할 수 있다(views/orbit/orbit-model.mjs)', async () => {
  const model = await import(new URL('../public/v41/views/orbit/orbit-model.mjs', import.meta.url).href);
  assert.equal(model.escapeRecord('<b>&"'), '&lt;b&gt;&amp;&quot;');
  assert.equal(model.hasLayout({ring: 'main', baseAngle: 0}), true);
  assert.equal(model.hasLayout({id: 'x'}), false);
  assert.equal(model.momentSeq({id: 'm07'}), '07');
  // 순번 모양(m07)은 id의 숫자, 그 밖은 목록 자리 — 목록(CARDS)은 화면 모듈이 정하므로 여기서는 모양만 본다.
  assert.match(String(model.momentSeq), /CARDS\.indexOf\(c\)\+1/);
});
