// 이슈 833: 재생 중인 영상 칸 모서리에 '크게 보기' 단추를 둔다(쇼츠는 YouTube가 좁은 칸에서 전체 화면 단추를 숨김).
//  ① 재생 중인 iframe 칸 모서리(바깥)에 크게 보기 단추(44px 이상)와 'YouTube에서 보기' 링크(새 창)를 둔다.
//  ② 누르면 requestFullscreen을 먼저 시도하고, 안 되면 화면을 덮는 창(LTMedia.openLightbox)으로 물러난다.
//  ③ 책(book-extra) 재생·'처음부터 보기', 미리보기(media-preview 그 자리 재생), 보드 상세 보기 창,
//     서재 읽기 재생 칸이 같은 도우미(public/v41/yt-expand.mjs)로 맞춘다.
//  ④ 전체 화면에서 나온 뒤 책 펼침이 다시 그려지며 넘어가지 않음(book.js fullscreenchange 보호).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const EXP = read('public/v41/yt-expand.mjs');
const EXTRA = read('public/v41/views/book/book-extra.js');
const MP = read('public/v41/media-preview.js');
const BOARD = read('public/v41/views/board/board-detail.js');
const SHELF = read('public/v41/views/shelf/shelf-reader.js');
const BOOK = read('public/v41/views/book/book.js');

test('833-1: 도우미는 재생 칸에 크게 보기 단추(44px)와 YouTube 링크(새 창)를 모서리에 둔다', () => {
  assert.match(EXP, /export function mountExpandControls\(host,/, '칸 만들기 함수');
  assert.match(EXP, /yt-video-corner/, '모서리 줄');
  assert.match(EXP, /min-height:44px/, '단추 최소 높이 44px');
  assert.match(EXP, /영상 크게 보기/, '낭독 이름');
  assert.match(EXP, /YouTube에서 보기 ↗/, 'YouTube 링크 이름');
  assert.match(EXP, /open\.target = '_blank'/, '새 창');
  assert.match(EXP, /noopener noreferrer/, '새 창 보안 속성');
  assert.match(EXP, /position:relative/, '칸이 모서리 기준');
  assert.match(EXP, /is-vertical/, '세로 표시');
  assert.match(EXP, /ytOpenUrl/, 'watch 주소 한 벌');
});

test('833-2: 누르면 실제 전체 화면을 먼저 시도하고 안 되면 덮는 창으로 물러난다', () => {
  assert.match(EXP, /requestFullscreen/, '실제 전체 화면 시도');
  assert.match(EXP, /openLightbox/, '안 되면 덮는 창');
  assert.match(EXP, /return 'fullscreen'/, '전체 화면 결과');
  assert.match(EXP, /return 'lightbox'/, '덮는 창 결과');
  assert.match(EXP, /:fullscreen/, '전체 화면 세로 비율 가운데');
});

test('833-3: 책·미리보기·보드·서재 재생 칸이 같은 도우미를 쓴다', () => {
  assert.match(EXTRA, /mountExpandControls\(host,/, '책 재생 칸(그 자리)');
  assert.match(EXTRA, /LTMedia\.openLightbox/, '책: 덮는 창 물러남');
  assert.match(EXTRA, /cell\.stage\.append\(frame\)/, '책: iframe을 무대에 직접 넣는다(옮기지 않음)');
  // '처음부터 보기' 재생 칸에도 같은 단추를 둔다(한 자리만으로는 충분하지 않다).
  const fromStartAt = EXTRA.indexOf('data-yt-from-start');
  assert.ok(fromStartAt >= 0, '처음부터 보기 자리가 있다');
  const afterFromStart = EXTRA.slice(fromStartAt);
  assert.match(afterFromStart, /mountExpandControls\(host,/, '책: 처음부터 보기 칸도 모서리 단추');
  assert.match(MP, /mountExpandControls\(body,/, '미리보기 재생 칸');
  assert.match(MP, /openLightbox\(u,t,v\)/, '미리보기: 덮는 창 물러남');
  assert.match(BOARD, /mountExpandControls\(holder,/, '보드 상세 보기 창 재생 칸');
  assert.match(SHELF, /mountExpandControls\(holder,/, '서재 읽기 재생 칸');
});

test('833-4: 전체 화면에서 나온 뒤 책이 다시 그려지며 넘어가지 않음(book.js 보호)', () => {
  assert.match(BOOK, /fullscreenchange/, '전체 화면 변화 감지');
  assert.match(BOOK, /!playingInBook\(\)/, '재생 중이면 다시 그리지 않음');
  assert.match(BOOK, /renderSpread\(current,null,false\)/, '재생이 아니면 현재 펼침을 유지');
});
