// 1.5단계 ④: 내 책장(track32-bookshelf) 두 벌 합치기(#231). 예시 분기 0곳.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');
const SERVER = read('views/track32-bookshelf.html');
const EXAMPLE = read('design/views/track32-bookshelf.html');

test('내 책장 두 벌은 바이트 단위로 같다', () => {
  assert.equal(SERVER, EXAMPLE);
});

test('런타임 한 벌만 부르고 자원 경로는 /v41/ 절대 경로', () => {
  assert.match(SERVER, /src="\/v41\/runtime\.js"/);
  assert.match(SERVER, /src="\/v41\/media-preview\.js"/);
  assert.match(SERVER, /src="\/v41\/view-navigation\.js"/);
  assert.doesNotMatch(SERVER, /shared\.js/);
  const refs = SERVER.match(/(?:src|href)="[^"]+"/g) || [];
  for (const ref of refs) assert.ok(!ref.includes('"../'), ref);
});

test('예시 분기를 남기지 않는다(문구·표시는 실제 기록 판본 하나로 통일)', () => {
  assert.equal((SERVER.match(/LTDEMO\.example/g) || []).length, 0);
  assert.doesNotMatch(SERVER, /source===['"]example['"]/);
});

test('책 목록은 런타임 데이터에서 만들고 표지 이름은 표시 규칙 하나를 쓴다', () => {
  assert.match(SERVER, /var books = LTDEMO\.library\.map\(/);
  assert.match(SERVER, /LTTreeName\.displayTreeTitle/);
  assert.match(SERVER, /--lt-cover-1/);
});

test('#212 개선(표지 사진·줄임·중앙 카드 잘림 방지)이 두 모드 공통 코드로 남는다', () => {
  assert.match(SERVER, /book-cover-media/);
  assert.match(SERVER, /-webkit-line-clamp: 3/);
  assert.match(SERVER, /absolute===0\?1\.06/);
  assert.match(SERVER, /absolute===0\?6:/);
});

test('셸 연결(lt41-* 메시지·DOM id)은 그대로다', () => {
  for (const id of ['shelfRail', 'shelfViewport', 'readerTitle', 'coverTitle', 'newBookModal']) {
    assert.ok(SERVER.includes(`id="${id}"`), id);
  }
  assert.match(SERVER, /parent\.LT41|LTDEMO\.select/);
});
