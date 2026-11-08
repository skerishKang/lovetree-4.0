// 1.5단계 ②: 첫 화면(src064-orbit) 두 벌 합치기(#231).
// 실제 기록 판본을 기준으로 합치되, 예시 판본에서 보이던 것(카드 기본 배치·목록 번호·이어가기 갈래 선택·책으로 보기)은
// 데이터 상태(LTDEMO.example)로 갈라 그대로 유지한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');
const SERVER = read('views/src064-orbit.html');
const RUNTIME = read('runtime.js');

test('design/views/에 화면 사본이 없다(한 벌만 남았다)', () => {
  assert.equal(fs.existsSync(new URL(`../public/v41/design/views/src064-orbit.html`, import.meta.url)), false);
});

test('합친 첫 화면은 런타임 한 벌만 부른다(예시 전용 shared.js 없음)', () => {
  assert.match(SERVER, /src="\/v41\/runtime\.js"/);
  assert.doesNotMatch(SERVER, /shared\.js/);
});

test('깊이가 다른 두 폴더에서도 같은 파일을 쓰도록 자원 경로는 /v41/ 절대 경로', () => {
  const refs = SERVER.match(/(?:src|href)="[^"]+"/g) || [];
  for (const ref of refs) {
    assert.ok(!ref.includes('"../'), ref);
  }
  assert.ok(SERVER.includes('"/v41/runtime.js"'));
});

test('카드 기본 배치와 개수 표시는 데이터 모양으로 갈린다(예시 여부 분기 없음)', () => {
  // 배치값을 스스로 가진 순간(예시)은 그대로, 없는 순간(실제 기록)만 기본 배치를 돌려 쓴다.
  assert.match(SERVER, /const hasLayout=m=>typeof m\.ring==='string'&&'baseAngle' in m;/);
  assert.match(SERVER, /\.\.\.\(hasLayout\(m\)\?\{\}:BASE_CARDS\[i%BASE_CARDS\.length\]\)/);
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
