// 1.5단계 ③: 기억 보드(track58-pinboard) 두 벌 합치기(#231). 예시 분기는 2곳만 남긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');
const SERVER = read('views/track58-pinboard.html');
const EXAMPLE = read('design/views/track58-pinboard.html');

test('기억 보드 두 벌은 바이트 단위로 같다', () => {
  assert.equal(SERVER, EXAMPLE);
});

test('런타임 한 벌만 부르고 자원 경로는 /v41/ 절대 경로', () => {
  assert.match(SERVER, /src="\/v41\/runtime\.js"/);
  assert.doesNotMatch(SERVER, /shared\.js/);
  const refs = SERVER.match(/(?:src|href)="[^"]+"/g) || [];
  for (const ref of refs) assert.ok(!ref.includes('"../'), ref);
});

test('연결은 데이터(LTDEMO.edges)에서 만들고 실제 기록 문구를 기준으로 쓴다', () => {
  assert.match(SERVER, /let connections=LTDEMO\.edges\.map\(/);
  assert.ok(SERVER.includes('감상 예시'));
  assert.ok(SERVER.includes('읽기 전용'));
  assert.ok(!SERVER.includes('공개 예시'));
});

test('예시 분기는 2곳만 남는다: 연결 지우기 동작·말풍선 버튼·연결 색', () => {
  const branches = SERVER.match(/LTDEMO\.example/g) || [];
  assert.equal(branches.length, 3);
  assert.match(SERVER, /function deleteSelectedConnection\(\)\{if\(!LTDEMO\.example\)\{/);
  assert.match(SERVER, /\$\{LTDEMO\.example\?' <button id="deleteConnBubble">/);
  assert.match(SERVER, /'cyan':\(LTDEMO\.example\?\['rose','violet','cyan','amber'\]\[Math\.max\(0,moments\.findIndex/);
  assert.doesNotMatch(SERVER, /source===['"]example['"]/);
});

test('읽기 전용에서는 연결 변경 안내만 하고 지우지 않는다', () => {
  assert.match(SERVER, /toast\('읽기 전용에서는 연결을 변경할 수 없어요\.'\)/);
});
