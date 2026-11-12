// #480 L12: 썸네일은 세 화면(책에서 순간 쓰기·보드 씨앗·보드 상세) 모두 공용 한 벌(thumb-fallback.mjs)을 쓴다.
// 전: 보드(board-extras.js)가 자기 주소(img.youtube.com/hqdefault)와 자기 그림(인라인 SVG)을 따로 만들었다.
//     그래서 책·보관함·첫 화면과 다른 단계를 가졌고, 그림이 실패하면 한 번에 글 카드로 떨어졌다.
// 후: 공용 후보(저장 주소 → oardefault/hqdefault → mqdefault)와 공용 단계 판정을 그대로 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thumbnailCandidates, nextThumbnailStep } from '../public/v41/thumb-fallback.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const BOARD_EXTRAS = read('public/v41/views/board/board-extras.js');
const BOARD_HTML = read('public/v41/views/track58-pinboard.html');

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SHORTS = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';

test('공용 후보: 저장 주소가 없으면 hqdefault → mqdefault 순서다', () => {
  assert.deepEqual(thumbnailCandidates({ url: VIDEO }, { autoLoad: true }), [
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
  ]);
});

test('공용 후보: 세로 영상은 oardefault가 먼저다(잘림 없음)', () => {
  const list = thumbnailCandidates({ url: SHORTS }, { vertical: true, autoLoad: true });
  assert.equal(list[0], 'https://i.ytimg.com/vi/dQw4w9WgXcQ/oardefault.jpg');
  assert.ok(list.includes('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'));
  assert.ok(list.includes('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'));
});

test('공용 후보: 저장된 썸네일이 있으면 그것이 먼저다', () => {
  const saved = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/oardefault.jpg';
  const list = thumbnailCandidates({ url: VIDEO, mediaMetadata: { thumbnail: saved } }, { autoLoad: true });
  assert.equal(list[0], saved, '저장 주소가 첫 후보다');
  assert.equal(list.length, new Set(list).size, '중복이 없다');
});

test('공용 단계: 그림이 깨지면 다음 후보로 내려가고, 다 떨어지면 글 카드로 간다', () => {
  const list = thumbnailCandidates({ url: VIDEO }, { autoLoad: true });
  assert.deepEqual(nextThumbnailStep(list, 0, { error: true }), { status: 'retry', src: list[1], index: 1 });
  assert.deepEqual(nextThumbnailStep(list, 1, { error: true }), { status: 'fallback', src: '', index: 2 });
  assert.equal(nextThumbnailStep(list, 0, { naturalWidth: 480, naturalHeight: 360 }).status, 'ok', '제대로 온 그림은 그대로 둔다');
  assert.equal(nextThumbnailStep(list, 0, { naturalWidth: 120, naturalHeight: 90 }).status, 'retry', 'YouTube 회색 그림은 실패로 본다');
});

// 주석은 빼고 코드만 본다(설명에 옛 주소 이름이 남는 것은 상관없다).
const BOARD_CODE = BOARD_EXTRAS.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

test('보드: 자기 주소(img.youtube.com)를 더 이상 만들지 않는다', () => {
  assert.doesNotMatch(BOARD_CODE, /img\.youtube\.com/, '예전 자체 주소를 쓰지 않는다');
  assert.doesNotMatch(BOARD_CODE, /youtubePreviewAsset/, '예전 자체 SVG 그림을 쓰지 않는다');
  // 대신 공용 한 벌(globalThis.LTThumbFallback)에서 후보를 받는다.
  assert.match(BOARD_EXTRAS, /function thumbApi\(\)\{return globalThis\.LTThumbFallback\|\|null\}/);
  assert.match(BOARD_EXTRAS, /const list=api\?api\.thumbnailCandidates\(moment,\{autoLoad:true\}\):\[\];/);
});

test('보드: 그리기 쪽도 공용 후보·단계를 쓴다(한 번에 글 카드로 떨어지지 않는다)', () => {
  assert.match(BOARD_EXTRAS, /function thumbRetryAttrs\(m\)/);
  assert.match(BOARD_EXTRAS, /api\.thumbnailCandidates\(\{url:String\(m\.url\|\|''\)\},\{autoLoad:true\}\)/);
  // 그림 자리 넷(카드·쓰기 미리보기·고치기 미리보기·크게 보기)이 모두 공용 단계를 쓴다.
  const uses = BOARD_EXTRAS.match(/thumbRetryAttrs\(/g) || [];
  assert.ok(uses.length >= 5, `공용 단계를 쓰는 자리가 다섯 곳 이상이어야 한다(지금 ${uses.length})`);
});

test('보드: 공용 한 벌을 먼저 불러 온다(일반 script보다 앞서 모듈로)', () => {
  const shim = BOARD_HTML.indexOf('/v41/views/board/board-thumb.mjs');
  const extras = BOARD_HTML.indexOf('/v41/views/board/board-extras.js');
  assert.ok(shim > -1, 'board-thumb.mjs를 싣는다');
  assert.ok(shim < extras, 'board-extras.js보다 먼저 싣는다');
  const shimSrc = read('public/v41/views/board/board-thumb.mjs');
  assert.match(shimSrc, /export \* from '\/v41\/thumb-fallback\.mjs';/);
});

test('책: 쓰기 미리보기는 이미 공용 한 벌을 쓴다(중복 없음)', () => {
  const bookExtra = read('public/v41/views/book/book-extra.js');
  assert.match(bookExtra, /import \{[^}]*thumbnailCandidates[^}]*\} from '\/v41\/thumb-fallback\.mjs';/);
  assert.match(bookExtra, /const candidates=auto\?thumbnailCandidates\(m,\{vertical,autoLoad:true\}\):\[\];/);
  // 책 미리보기는 media-preview의 markup을 거치고, 그 함수는 공용 한 벌이 있으면 그것을 쓴다.
  const mediaPreview = read('public/v41/media-preview.js');
  assert.match(mediaPreview, /const fb=globalThis\.LTThumbFallback\|\|null;/);
});
