// #429 1부: 공용 썸네일 내려가기 모듈(thumb-fallback.mjs)과 전 화면 연결 시험.
// 동작은 함수 직접 호출로, 마크업·공용 모듈 배선은 구조 검사로 고정한다(docs/TESTING.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GRAY_THUMB_WIDTH,
  GRAY_THUMB_HEIGHT,
  VIDEO_UNAVAILABLE_TEXT,
  ADD_TITLE_LABEL,
  safeYoutubeThumb,
  youtubeIdFrom,
  thumbnailCandidates,
  isGrayThumbnail,
  nextThumbnailStep,
  fallbackCardData,
  fallbackCardMarkup,
  thumbFallbackAttrs,
  coverFallbackAttrs,
  applyThumbOutcome,
  mountThumbFallback,
  needsFallbackCard,
} from '../public/v41/thumb-fallback.mjs';
import * as serverDomain from '../src/domain.js';
import * as webDomain from '../public/v41/domain.mjs';
import { fetchVideoMetadata } from '../public/v41/video-title.mjs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('#429 후보 순서: 저장된 썸네일 주소 → [세로 원본] → hqdefault → mqdefault, 중복 제거·외부 차단', () => {
  // 1) 저장된 oEmbed 썸네일이 있으면 1순위 → hqdefault → mqdefault
  const withSaved = thumbnailCandidates({
    url: 'https://www.youtube.com/watch?v=abc123DEF45',
    mediaMetadata: { thumbnail: 'https://i9.ytimg.com/vi/abc123DEF45/maxresdefault.jpg' },
  });
  assert.deepEqual(withSaved, [
    'https://i9.ytimg.com/vi/abc123DEF45/maxresdefault.jpg',
    'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
    'https://i.ytimg.com/vi/abc123DEF45/mqdefault.jpg',
  ]);

  // 2) 저장된 썸네일이 이미 hqdefault면 중복 없이 [hqdefault, mqdefault]
  const savedHq = thumbnailCandidates({
    url: 'https://youtu.be/abc123DEF45',
    mediaMetadata: { thumbnail: 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg' },
  });
  assert.deepEqual(savedHq, [
    'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
    'https://i.ytimg.com/vi/abc123DEF45/mqdefault.jpg',
  ]);

  // 3) 세로 쇼츠(저장본 없음)는 oardefault → hqdefault → mqdefault
  const shorts = thumbnailCandidates({ url: 'https://www.youtube.com/shorts/9NXOCr-T8LU' });
  assert.deepEqual(shorts, [
    'https://i.ytimg.com/vi/9NXOCr-T8LU/oardefault.jpg',
    'https://i.ytimg.com/vi/9NXOCr-T8LU/hqdefault.jpg',
    'https://i.ytimg.com/vi/9NXOCr-T8LU/mqdefault.jpg',
  ]);

  // 4) 공유·예시·로그아웃(autoLoad=false)이나 일반 사이트 링크는 외부 요청 0
  assert.deepEqual(thumbnailCandidates({ url: 'https://youtu.be/abc123DEF45' }, { autoLoad: false }), []);
  assert.deepEqual(thumbnailCandidates({ url: 'https://blog.example.com/post/1' }, { autoLoad: true }), []);

  // 5) 닮은 호스트·http 썸네일은 허용하지 않는다(https + ytimg.com만)
  assert.equal(safeYoutubeThumb('https://ytimg.com.evil.example/vi/abc123DEF45/hqdefault.jpg'), '');
  assert.equal(safeYoutubeThumb('http://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg'), '');
  assert.equal(youtubeIdFrom('https://youtube.com.evil.example/watch?v=abc123DEF45'), '');
});

test('#429 회색 그림(120×90) 판정과 단계별 내려가기 전이 표', () => {
  assert.equal(GRAY_THUMB_WIDTH, 120);
  assert.equal(GRAY_THUMB_HEIGHT, 90);
  assert.equal(isGrayThumbnail({ naturalWidth: 120, naturalHeight: 90 }), true, 'YouTube 기본 회색 상자');
  assert.equal(isGrayThumbnail({ naturalWidth: 0, naturalHeight: 0 }), true, '깨진 이미지');
  assert.equal(isGrayThumbnail({ naturalWidth: 480, naturalHeight: 360 }), false, 'hqdefault 정상');
  assert.equal(isGrayThumbnail({ naturalWidth: 320, naturalHeight: 180 }), false, 'mqdefault 정상');
  assert.equal(isGrayThumbnail({ naturalWidth: 405, naturalHeight: 720 }), false, '세로 쇼츠 정상');

  const cands = [
    'https://i.ytimg.com/vi/abc123DEF45/maxresdefault.jpg',
    'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
    'https://i.ytimg.com/vi/abc123DEF45/mqdefault.jpg',
  ];
  // 0번 회색(120×90) → 1번(hqdefault)
  const s1 = nextThumbnailStep(cands, 0, { naturalWidth: 120, naturalHeight: 90 });
  assert.deepEqual(s1, { status: 'retry', src: cands[1], index: 1 });
  // 1번 회색(120×90) → 2번(mqdefault)
  const s2 = nextThumbnailStep(cands, 1, { naturalWidth: 120, naturalHeight: 90 });
  assert.deepEqual(s2, { status: 'retry', src: cands[2], index: 2 });
  // 2번 정상(320×180) → 유지
  const ok = nextThumbnailStep(cands, 2, { naturalWidth: 320, naturalHeight: 180 });
  assert.deepEqual(ok, { status: 'ok', src: cands[2], index: 2 });
  // 2번도 회색(120×90) 또는 네트워크 실패 → fallback(글 카드·최소 카드)
  assert.deepEqual(nextThumbnailStep(cands, 2, { naturalWidth: 120, naturalHeight: 90 }), { status: 'fallback', src: '', index: 3 });
  assert.deepEqual(nextThumbnailStep(cands, 2, { error: true }), { status: 'fallback', src: '', index: 3 });
});

test('#429 글 카드 vs 최소 카드 판정 표: 사용자 제목 > 저장된 영상 제목·채널 > 최소 카드', () => {
  // 1) 사용자 제목 + 영상 메타데이터 → 사용자 제목이 큰 글씨, 영상 제목·채널이 보조, "영상을 볼 수 없어요"
  const userCard = fallbackCardData({
    id: 'm1',
    title: '처음 반한 직캠',
    url: 'https://youtu.be/deleted1234',
    emotion: '설렘',
    date: '2026-11-12',
    mediaMetadata: { title: '원본 무대 영상', channel: '공식 채널' },
  }, { writable: true });
  assert.equal(userCard.kind, 'text');
  assert.equal(userCard.title, '처음 반한 직캠');
  assert.equal(userCard.sub, '원본 무대 영상 · 공식 채널');
  assert.equal(userCard.notice, VIDEO_UNAVAILABLE_TEXT);
  assert.equal(userCard.tone, 1);
  assert.equal(userCard.canAddTitle, false);

  // 2) 자동 도메인 제목(또는 영상 제목 복사본) + 저장된 영상 제목·채널 → 영상 제목·채널로 글 카드
  const metaCard = fallbackCardData({
    id: 'm2',
    title: 'youtu.be에서 간직한 순간',
    url: 'https://youtu.be/deleted1234',
    emotion: '그리움',
    date: '2026-11-10',
    mediaMetadata: { title: '사라진 라이브 클립', channel: '아티스트 채널' },
  }, { writable: true });
  assert.equal(metaCard.kind, 'text');
  assert.equal(metaCard.title, '사라진 라이브 클립');
  assert.equal(metaCard.sub, '아티스트 채널');
  assert.equal(metaCard.notice, '영상을 볼 수 없어요');
  assert.equal(metaCard.tone, 2);

  // 3) 제목도 못 받은 지워진 YouTube → 최소 카드(YouTube + 저장 날짜 + 감정 색 + "제목 달기")
  const minYt = fallbackCardData({
    id: 'm3',
    title: 'youtu.be에서 간직한 순간',
    url: 'https://youtu.be/deleted9999',
    emotion: '위로',
    date: '2026-11-11',
    mediaMetadata: null,
  }, { writable: true });
  assert.equal(minYt.kind, 'minimal');
  assert.equal(minYt.siteName, 'YouTube');
  assert.equal(minYt.date, '2026. 11. 11');
  assert.equal(minYt.tone, 3);
  assert.equal(minYt.canAddTitle, true);

  // 4) 다른 사이트 제목 없는 링크 → 최소 카드(도메인 + 저장 날짜 + 감정 색 + "제목 달기", 영상 아님 안내 없음)
  const minLink = fallbackCardData({
    id: 'm4',
    title: 'blog.naver.com에서 간직한 순간',
    url: 'https://blog.naver.com/post/42',
    emotion: '고마움',
    date: '2026-11-12',
  }, { writable: true });
  assert.equal(minLink.kind, 'minimal');
  assert.equal(minLink.siteName, 'blog.naver.com');
  assert.equal(minLink.date, '2026. 11. 12');
  assert.equal(minLink.notice, '');
  assert.equal(minLink.tone, 5);
  assert.equal(minLink.canAddTitle, true);

  // 5) 공유 감상(writable=false)에서는 "제목 달기"를 노출하지 않는다
  const readonlyMin = fallbackCardMarkup({
    id: 'm4',
    title: 'blog.naver.com에서 간직한 순간',
    url: 'https://blog.naver.com/post/42',
    emotion: '고마움',
    date: '2026-11-12',
  }, { writable: false });
  assert.doesNotMatch(readonlyMin, /data-lt-title-edit/);
  assert.doesNotMatch(readonlyMin, new RegExp(ADD_TITLE_LABEL));

  // 일반 사용자 메모(링크 없음, 제목/메모 있음)는 fallback 대상이 아니다
  assert.equal(needsFallbackCard({ id: 'memo1', title: '공연 후기', note: '잊지 못할 밤' }, { autoLoad: false }), false);
  assert.equal(needsFallbackCard({ id: 'link1', title: 'example.com에서 간직한 순간', url: 'https://example.com/a' }, { autoLoad: true }), true);
});

test('#429 DOM 내려가기 실행: 회색(120×90) 연속 발생 시 카드·표지·목록 칸을 각각 올바르게 바꾼다', () => {
  const cands = [
    'https://i.ytimg.com/vi/deleted1234/hq2.jpg',
    'https://i.ytimg.com/vi/deleted1234/hqdefault.jpg',
    'https://i.ytimg.com/vi/deleted1234/mqdefault.jpg',
  ];
  const fallbackHtml = fallbackCardMarkup({
    id: 'm1',
    treeId: 't1',
    title: 'youtu.be에서 간직한 순간',
    url: 'https://youtu.be/deleted1234',
    emotion: '설렘',
    date: '2026-11-12',
  }, { writable: true });

  let playRemoved = false;
  const host = { innerHTML: '' };
  const card = {
    classList: { added: [], add(cls) { this.added.push(cls); } },
    querySelector: (sel) => (sel === '.playGlyph' ? { remove() { playRemoved = true; } } : null),
  };
  const attrs = {
    'data-lt-candidates': JSON.stringify(cands),
    'data-lt-cand-index': '0',
    'data-lt-fallback-mode': 'card',
    'data-lt-fallback-html': fallbackHtml,
  };
  const img = {
    src: cands[0],
    dataset: {},
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = String(v); },
    closest: (sel) => (sel === '[data-lt-thumb-host]' ? host : sel === '.card' ? card : null),
    remove() {},
  };

  // 1단계: 저장 주소가 120×90 회색 → hqdefault로 교체
  applyThumbOutcome(img, { naturalWidth: 120, naturalHeight: 90 });
  assert.equal(img.src, cands[1]);
  assert.equal(host.innerHTML, '');

  // 2단계: hqdefault도 120×90 회색 → mqdefault로 교체
  applyThumbOutcome(img, { naturalWidth: 120, naturalHeight: 90 });
  assert.equal(img.src, cands[2]);
  assert.equal(host.innerHTML, '');

  // 3단계: mqdefault도 120×90 회색 → 최소 카드로 교체하고 재생 기호 제거
  applyThumbOutcome(img, { naturalWidth: 120, naturalHeight: 90 });
  assert.match(host.innerHTML, /data-lt-fallback="minimal"/);
  assert.match(host.innerHTML, /YouTube/);
  assert.match(host.innerHTML, /2026\. 11\. 12/);
  assert.match(host.innerHTML, /data-lt-title-edit="m1"/);
  assert.equal(playRemoved, true);

  // 표지(cover) 모드: 모두 실패하면 <img>만 치워 색 표지만 남긴다
  let coverRemoved = false;
  const coverAttrs = {
    'data-lt-candidates': JSON.stringify([cands[1], cands[2]]),
    'data-lt-cand-index': '1',
    'data-lt-fallback-mode': 'cover',
  };
  const coverImg = {
    src: cands[2],
    dataset: {},
    getAttribute: (k) => coverAttrs[k] ?? null,
    setAttribute: (k, v) => { coverAttrs[k] = String(v); },
    remove() { coverRemoved = true; },
  };
  applyThumbOutcome(coverImg, { naturalWidth: 120, naturalHeight: 90 });
  assert.equal(coverRemoved, true);
});

test('#429 "제목 달기" 클릭·키보드는 지정 순간 편집을 열고 읽기 전용에서는 막는다', () => {
  const listeners = {};
  const root = {
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener() {},
    querySelectorAll: () => [],
  };
  const calls = [];
  let ro = false;
  const dispose = mountThumbFallback(root, {
    isReadOnly: () => ro,
    onEditTitle: (payload) => calls.push(payload),
  });
  const btn = {
    dataset: { ltTitleEdit: 'm42', ltTreeId: 'tree-inbox' },
    getAttribute(k) {
      if (k === 'data-lt-title-edit') return 'm42';
      if (k === 'data-lt-tree-id') return 'tree-inbox';
      return null;
    },
  };
  let prevented = 0;
  listeners.click({
    target: { closest: (sel) => (sel === '[data-lt-title-edit]' ? btn : null) },
    preventDefault() { prevented += 1; },
    stopPropagation() {},
    stopImmediatePropagation() {},
  });
  assert.deepEqual(calls, [{ momentId: 'm42', treeId: 'tree-inbox' }]);
  assert.equal(prevented, 1);

  // Enter 키보드로도 동작
  listeners.keydown({
    key: 'Enter',
    target: { closest: (sel) => (sel === '[data-lt-title-edit]' ? btn : null) },
    preventDefault() { prevented += 1; },
    stopPropagation() {},
    stopImmediatePropagation() {},
  });
  assert.equal(calls.length, 2);

  // 읽기 전용(공유)에서는 호출되지 않는다
  ro = true;
  listeners.click({
    target: { closest: () => btn },
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
  });
  assert.equal(calls.length, 2);
  dispose();
});

test('#429 도메인 두 벌은 oEmbed ytimg 썸네일 주소만 저장하고 임의 외부 이미지 주소는 버린다', async () => {
  const now = '2026-11-12T00:00:00.000Z';
  for (const domain of [serverDomain, webDomain]) {
    const saved = domain.createTree({
      subject: '리센느',
      url: 'https://www.youtube.com/shorts/9NXOCr-T8LU',
      mediaMetadata: {
        title: '쇼츠 무대',
        channel: '공식 채널',
        thumbnail: 'https://i.ytimg.com/vi/9NXOCr-T8LU/oar2.jpg',
      },
    }, now);
    assert.deepEqual(saved.moments[0].mediaMetadata, {
      title: '쇼츠 무대',
      channel: '공식 채널',
      source: 'www.youtube.com',
      thumbnail: 'https://i.ytimg.com/vi/9NXOCr-T8LU/oar2.jpg',
    });
    const roundtrip = domain.validateState({ version: 1, trees: [saved] });
    assert.equal(roundtrip.trees[0].moments[0].mediaMetadata.thumbnail, 'https://i.ytimg.com/vi/9NXOCr-T8LU/oar2.jpg');

    // ytimg가 아닌 외부 주소는 저장하지 않는다
    const stripped = domain.createTree({
      subject: '리센느',
      url: 'https://www.youtube.com/watch?v=abc123DEF45',
      mediaMetadata: {
        title: '무대',
        thumbnail: 'https://evil.example/steal.jpg',
      },
    }, now);
    assert.equal('thumbnail' in stripped.moments[0].mediaMetadata, false);
  }

  const meta = await fetchVideoMetadata('9NXOCr-T8LU', async () => ({
    ok: true,
    json: async () => ({
      title: ' 쇼츠 제목 ',
      authorName: ' 채널명 ',
      thumbnailUrl: 'https://i.ytimg.com/vi/9NXOCr-T8LU/oar2.jpg',
    }),
  }));
  assert.deepEqual(meta, {
    title: '쇼츠 제목',
    channel: '채널명',
    thumbnail: 'https://i.ytimg.com/vi/9NXOCr-T8LU/oar2.jpg',
  });
});

test('#429 전 화면이 같은 공용 모듈(thumb-fallback.mjs)을 쓰고, 표지 속성도 공용 함수를 거친다', () => {
  // 이슈 #466 T1: 파일에 'thumb-fallback.mjs' 글자만 있으면(죽은 import·주석 포함) 통과하던 시험을
  // 실제 호출부(함수 이름 뒤 '(' )가 있는지로 강화한다 — 화면이 import만 남기고 호출을 끊어도 잡는다.
  const CALLS = /thumbFallbackAttrs\(|fallbackCardMarkup\(|needsFallbackCard\(|coverFallbackAttrs\(|thumbnailCandidates\(|mountThumbFallback\(/;
  for (const file of [
    'v41/home-moments.js',
    'src/views/orbit.js',
    'public/v41/shell.mjs',
    'public/v41/views/shelf/shelf-model.mjs',
    'public/v41/views/shelf/shelf.js',
    'public/v41/views/shelf/shelf-reader.js',
    'public/v41/views/book/book-extra.js',
    'public/v41/views/tree-title.mjs',
  ]) {
    const source = read(file);
    assert.match(source, /thumb-fallback\.mjs/, `${file} 공용 모듈 연결`);
    assert.match(source, CALLS, `${file}가 공용 모듈 함수를 실제로 호출한다(import만 남은 죽은 배선이 아니다)`);
  }
  assert.match(coverFallbackAttrs(['https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg']), /data-lt-fallback-mode="cover"/);
  assert.match(thumbFallbackAttrs({ id: 'm1', url: 'https://youtu.be/abc123DEF45' }), /hqdefault\.jpg.*mqdefault\.jpg/);
});
