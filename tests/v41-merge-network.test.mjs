// 1.5단계 ①: 관계 지도 두 벌 합치기(#231). views/와 design/views/가 바이트 단위로 같고,
// 실제 기록 판본 동작(재생 안내)과 예시 판본 동작(경로 재생)이 데이터 상태로 갈리는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');
const SERVER = read('views/track56-network.html');
const EXAMPLE = read('design/views/track56-network.html');
const RUNTIME = read('runtime.js');

test('관계 지도 두 벌은 바이트 단위로 같다', () => {
  assert.equal(SERVER, EXAMPLE);
});

test('합친 관계 지도는 런타임 한 벌만 부른다(예시 전용 shared.js 없음)', () => {
  assert.match(SERVER, /src="\/v41\/runtime\.js"/);
  assert.doesNotMatch(SERVER, /shared\.js/);
  assert.match(SERVER, /src="\/v41\/media-preview\.js"/);
});

test('깊이가 다른 두 폴더에서도 같은 파일을 쓰도록 자원 경로는 /v41/ 절대 경로', () => {
  for (const name of ['identity.css', 'labels.js', 'mobile-moments.js', 'media-preview.js', 'runtime.js']) {
    assert.ok(SERVER.includes(`"/v41/${name}"`), name);
    assert.ok(!SERVER.includes(`"../${name}"`), name);
  }
});

test('실제 기록 판본 문구를 기준으로 통일했다(범례 제목·재생 안내)', () => {
  assert.ok(SERVER.includes('순간 위치 그룹'));
  assert.ok(SERVER.includes('먼저 순간을 선택하세요.'));
  assert.ok(!SERVER.includes('주요 경로 그룹'));
  assert.ok(!SERVER.includes('경로 안의 순간를 선택하세요'));
});

test('재생 안내는 source가 아니라 데이터 상태(예시 여부)로 갈린다', () => {
  assert.match(SERVER, /if\(!LTDEMO\.example\)\{toast\('실제 연결은 상단 부모·자식 및 관련 순간에서 선택하세요\.'\);return\}/);
  assert.doesNotMatch(SERVER, /source===['"]example['"]/);
  assert.match(RUNTIME, /example:!!demo/);
});

test('작은 트리 보정은 트리 크기(데이터) 조건으로 남는다', () => {
  assert.ok(SERVER.includes('if(LTDEMO.moments.length<=36){CLUSTERS.forEach'));
  assert.ok(SERVER.includes("document.querySelectorAll('.legend-row').forEach"));
});

test('runtime.js는 예시 모드에서 demoData를 그대로 쓴다(design/shared.js와 같은 모양)', () => {
  assert.match(RUNTIME, /const demo = tree\.demoData;/);
  assert.match(RUNTIME, /demo \? demo\.moments\.map\(m => \(\{\.\.\.m\}\)\)/);
});
