// #480 L12: 썸네일은 세 화면(책에서 순간 쓰기·보드 씨앗·보드 상세) 모두 공용 한 벌(thumb-fallback.mjs)을 쓴다.
// 전: 보드(board-extras.js)가 자기 주소(img.youtube.com/hqdefault)와 자기 그림(인라인 SVG)을 따로 만들었다.
//     그래서 책·보관함·첫 화면과 다른 단계를 가졌고, 그림이 실패하면 한 번에 글 카드로 떨어졌다.
// 후: 공용 후보(저장 주소 → oardefault/hqdefault → mqdefault)와 공용 단계 판정을 그대로 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { thumbnailCandidates, nextThumbnailStep } from '../public/v41/thumb-fallback.mjs';
import { youtubeIdFrom, youtubeStageThumbUrl } from '../public/v41/youtube-id.mjs';
import { videoKey } from '../public/v41/same-stage.mjs';
import { cardImageFor } from '../functions/_lib/tree-preview.mjs';

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
});

test('보드: 그리기 쪽도 공용 후보·단계를 쓴다(한 번에 글 카드로 떨어지지 않는다)', () => {
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
});

test('보드 상세도 자체 SVG가 아니라 공용 한 벌을 쓴다(전: youtubePreviewAsset 참조 → 페이지 오류)', () => {
  const detail = read('public/v41/views/board/board-detail.js');
  const code = detail.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  // board-extras.js에서 youtubePreviewAsset을 없앴는데 detail이 그 이름을 부르면 즉시 페이지 오류가 난다(실제로 났다).
  assert.doesNotMatch(code, /youtubePreviewAsset/, '없앤 이름을 코드에서 부르지 않는다');
  assert.match(code, /const V12_FALLBACK = \(url\) => \{/, '공용 후보를 쓰는 대체 함수로 바뀌었다');
  assert.match(code, /api\.thumbnailCandidates\(\{ url: String\(url \|\| ''\) \}, \{ autoLoad: true \}\)/, '공용 후보에서 받는다');
  // 이 파일이 youtubeThumb·youtubeThumbUrl을 다시 정의하면 화면마다 주소가 달라진다 — 정의하지 않는다.
  assert.doesNotMatch(code, /youtubeThumbUrl\s*=/, '공용 값을 덮어쓰지 않는다');
  assert.doesNotMatch(code, /youtubeThumb\s*=/, '공용 값을 덮어쓰지 않는다');
});

// ── #1060 표 시험: 주소 형식 × 크기(옵션)로 정본과 각 자리 결과를 대조한다(#1127 방식) ──
const ID = 'dQw4w9WgXcQ';
const FORMS = [
  `https://www.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com/watch?v=${ID}&t=83s`,
  `https://youtu.be/${ID}`,
  `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/live/${ID}`,
  `https://www.youtube.com/embed/${ID}`,
  `https://m.youtube.com/watch?v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com/watch?v=${ID}&list=PL123`,
  `https://youtube.com.evil.test/watch?v=${ID}`,
  `https://user:pass@www.youtube.com/watch?v=${ID}`,
  'ftp://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=short',
  'javascript:alert(1)',
  '',
];
// 크기 옵션 → 정본이 만들어야 할 파일 이름. 알 수 없는 값은 종전처럼 hqdefault다.
const STAGES = [
  ['hqdefault', 'hqdefault.jpg'],
  ['mqdefault', 'mqdefault.jpg'],
  ['oardefault', 'oardefault.jpg'],
  ['maxresdefault', 'maxresdefault.jpg'],
  ['unknown-stage', 'hqdefault.jpg'],
];

const mediaScope = { window: {}, URL, URLSearchParams, LTYouTubeId: globalThis.LTYouTubeId };
vm.runInNewContext(read('public/v41/media-preview.js'), mediaScope);
const media = mediaScope.window.LTMedia;

test('#1060 크기 표: 단계 함수는 옵션마다 정본 주소를 만든다(보드 상세 maxres 포함)', () => {
  for (const [stage, file] of STAGES) {
    assert.equal(youtubeStageThumbUrl(ID, stage), `https://i.ytimg.com/vi/${ID}/${file}`, stage);
  }
  assert.equal(youtubeStageThumbUrl('bad-id', 'hqdefault'), '', '11자리 아니면 주소를 만들지 않는다');
});

test('#1060 주소 형식 × 자리 표: 정본·공유 카드·미리보기·그래프·후보가 같은 주소를 쓴다', () => {
  for (const url of FORMS) {
    const id = youtubeIdFrom(url);
    const hq = youtubeStageThumbUrl(id, 'hqdefault');
    const oar = youtubeStageThumbUrl(id, 'oardefault');
    // functions/ 공유 링크 카드(정본 hq)와 public/ 그래프(videoKey→정본 hq, 세로 구분 없음)가 같다.
    assert.equal(cardImageFor({ url }), hq, `공유 카드 ${url}`);
    assert.equal(youtubeStageThumbUrl(videoKey(url), 'hqdefault'), hq, `그래프 ${url}`);
    // 화면 미리보기는 세로 옵션만 골라 정본을 부른다.
    assert.equal(media.youtubeThumbUrl(id, false), hq, `미리보기 가로 ${url}`);
    assert.equal(media.youtubeThumbUrl(id, true), oar, `미리보기 세로 ${url}`);
    // 후보 목록도 같은 단계 함수를 쓴다(저장 주소가 없을 때 hq→mq, 세로면 oar→hq→mq).
    const list = thumbnailCandidates({ url }, { autoLoad: true });
    assert.deepEqual(list, id ? (list[0] === oar ? [oar, hq, youtubeStageThumbUrl(id, 'mqdefault')] : [hq, youtubeStageThumbUrl(id, 'mqdefault')]) : [], `후보 ${url}`);
  }
});

test('#1060 남은 자리도 같은 단계 옵션으로 정본을 부른다(주소 글자 직접 생성 없음)', () => {
  const files = {
    'board-detail': 'public/v41/views/board/board-detail.js',
    'board-extras': 'public/v41/views/board/board-extras.js',
    'book-model': 'public/v41/views/book/book-model.js',
    book: 'public/v41/views/book/book.js',
    'community-moments': 'public/v41/community-moments.mjs',
    graph: 'public/v41/views/graph/graph.js',
    'media-preview': 'public/v41/media-preview.js',
  };
  for (const [name, path] of Object.entries(files)) {
    const code = read(path).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /https:\/\/i\.ytimg\.com/, `${name}: ytimg 주소 글자를 직접 만들지 않는다`);
  }
  const detail = read(files['board-detail']);
  for (const stage of ['maxresdefault', 'hqdefault', 'mqdefault']) {
    assert.match(detail, new RegExp(`stageThumb\\(id,'${stage}'\\)`), `보드 상세가 ${stage} 옵션을 그대로 넘긴다`);
  }
  assert.match(read(files['community-moments']), /youtubeStageThumbUrl\(item\.videoId,'hqdefault'\)/, '둘러보기 포스터는 hq 옵션');
  assert.match(read(files.graph), /youtubeStageThumbUrl\(key, 'hqdefault'\)/, '그래프는 세로 구분 없이 hq 옵션');
});

test('#1060 일반 스크립트 정본: 첫 그리기부터 주소가 들어간다', () => {
  const scope = { window: {}, URL, URLSearchParams };
  // 보드가 싣는 일반 스크립트 정본을 먼저 실행한다(모듈 대기·다시 채우기 없음).
  vm.runInNewContext(read('public/v41/youtube-id.js'), scope);
  assert.equal(scope.LTYouTubeId.youtubeStageThumbUrl(ID, 'hqdefault'), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  vm.runInNewContext(read('public/v41/media-preview.js'), scope);
  const media = scope.window.LTMedia;
  const html = media.markup(`https://www.youtube.com/watch?v=${ID}`, '제목', null, 'm1', { source: 'server', owned: true });
  assert.match(html, /src="https:\/\/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg"/);
  assert.doesNotMatch(html, /src=""/, '빈 주소로 첫 그림을 끝내지 않는다');
});

