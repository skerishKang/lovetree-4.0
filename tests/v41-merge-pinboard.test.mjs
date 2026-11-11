// 1.5단계 ③: 기억 보드(track58-pinboard) 두 벌 합치기(#231). 예시 분기는 2곳만 남긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');
// #231 3단계: 화면 고유 스타일·스크립트는 views/board/ 아래 파일이다. 화면+파일을 한 소스로 본다.
const SERVER = ['views/track58-pinboard.html','views/board/board.css','views/board/board-extra.css',
  'views/board/board.js','views/board/board-extras.js','views/board/board-detail.js'].map(read).join('');

test('design/views/에 화면 사본이 없다(한 벌만 남았다)', () => {
  assert.equal(fs.existsSync(new URL(`../public/v41/design/views/track58-pinboard.html`, import.meta.url)), false);
});

test('런타임 한 벌만 부르고 자원 경로는 /v41/ 절대 경로', () => {
  assert.match(SERVER, /src="\/v41\/runtime\.js"/);
  assert.doesNotMatch(SERVER, /shared\.js/);
  const refs = SERVER.match(/(?:src|href)="[^"]+"/g) || [];
  for (const ref of refs) assert.ok(!ref.includes('"../'), ref);
});

test('연결은 데이터(LTDEMO.edges)에서 만들고 실제 기록 문구를 기준으로 쓴다', () => {
  assert.match(SERVER, /let connections=LTDEMO\.edges\.map\(/);
  assert.ok(!SERVER.includes('감상 예시'));
  assert.ok(!SERVER.includes('부모·자식 연결'));
  assert.ok(!SERVER.includes('공개 예시'));
});

test('예시 판본 판단은 한 곳에만 둔다(연결 지우기 동작·말풍선 버튼·연결 색이 같은 값을 본다)', () => {
  const branches = SERVER.match(/LTDEMO\.example/g) || [];
  assert.equal(branches.length, 1);
  assert.match(SERVER, /const canEditBoard=LTDEMO\.example\|\|boardSaveEnabled\(\);/);
  assert.match(SERVER, /function deleteSelectedConnection\(\)\{const guard=LT58Model\.editGuard\(canEditBoard\);if\(guard\.blocked\)\{/);
  assert.match(SERVER, /\$\{canEditBoard\?' <button id="deleteConnBubble">/);
  assert.match(SERVER, /'cyan':\(canEditBoard\?\['rose','violet','cyan','amber'\]\[Math\.max\(0,moments\.findIndex/);
  assert.doesNotMatch(SERVER, /source===['"]example['"]/);
});

test('읽기 전용에서는 연결 변경 안내만 하고 지우지 않는다', () => {
  // 안내 문구는 계산 한 벌(board-model.js)이 갖고, 화면은 그 문구를 그대로 띄운다.
  const MODEL = fs.readFileSync(new URL('../public/v41/views/board/board-model.js', import.meta.url), 'utf8');
  assert.match(MODEL, /'읽기 전용에서는 연결을 변경할 수 없어요\.'/);
  assert.match(SERVER, /if\(guard\.blocked\)\{toast\(guard\.message\);/);
  assert.match(SERVER, /connections=LT58Model\.removeConnection\(connections,selectedConn\)/);
});
