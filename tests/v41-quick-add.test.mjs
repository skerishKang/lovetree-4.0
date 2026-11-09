import test from 'node:test';
import assert from 'node:assert/strict';
// #327 ② 빠른 추가: 판정·추출·문구·분기는 함수 직접 호출로 본다(docs/TESTING.md).
// DOM 연결은 tests/v41-quick-add-flow.test.mjs가 fake DOM으로 확인한다.
import { readFileSync } from 'node:fs';
import {
  extractDropUrl, hasDropPayload, firstImageFile, parseQuickUrl, dropRoute,
  QUICK_INBOX_LABEL, QUICK_SAVED_TEXT, QUICK_REFINE_LABEL, DROP_VEIL_TEXT,
  QUICK_EMPTY_ERROR, QUICK_INVALID_ERROR, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE
} from '../public/v41/quick-add.mjs';

// LTMedia.describe와 같은 모양의 최소 판정(화면이 실제로 쓰는 전역과 같은 계약).
const describeLike = (url) => {
  const value = String(url ?? '');
  if (!value.trim()) return { kind: 'none', original: value, label: '', openUrl: '' };
  let parsed;
  try { parsed = new URL(value); } catch { return { kind: 'invalid', original: value, label: '', openUrl: '' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { kind: 'invalid', original: value, label: '', openUrl: '' };
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const v = parsed.searchParams.get('v') || parsed.pathname.slice(1);
    if (!v) return { kind: 'link', original: value, label: host, openUrl: parsed.href };
    return { kind: 'youtube', original: value, videoId: v, label: 'YouTube 영상', openUrl: `https://www.youtube.com/watch?v=${v}`, loadUrl: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` };
  }
  return { kind: 'link', original: value, label: host, openUrl: parsed.href };
};

test('parseQuickUrl: 빈 값·지원 주소·지원하지 않는 주소를 구분한다', () => {
  const table = [
    ['', 'empty'],
    ['   ', 'empty'],
    ['https://www.youtube.com/watch?v=abc12345678', 'ok'],
    ['https://youtu.be/abc12345678', 'ok'],
    ['https://example.com/어떤-글', 'ok'],
    ['notaurl', 'invalid'],
    ['ftp://example.com/a', 'invalid'],
    ['javascript:alert(1)', 'invalid']
  ];
  for (const [input, expected] of table) {
    assert.equal(parseQuickUrl(input, describeLike).status, expected, `입력 "${input}" → ${expected}`);
  }
});

test('parseQuickUrl: YouTube는 videoId와 썸네일(기존 describe의 loadUrl)을 그대로 옮긴다', () => {
  const parsed = parseQuickUrl('https://www.youtube.com/watch?v=abc12345678', describeLike);
  assert.equal(parsed.kind, 'youtube');
  assert.equal(parsed.videoId, 'abc12345678');
  assert.equal(parsed.thumb, 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg', '썸네일 판정은 LTMedia.describe 한 벌을 쓴다');
  const link = parseQuickUrl('https://example.com/a', describeLike);
  assert.equal(link.thumb, '', '일반 링크에는 썸네일이 없다');
});

test('extractDropUrl: text/uri-list를 먼저, 없으면 text/plain을 본다(RFC 2483 주석 줄 제외)', () => {
  const make = (map) => ({ getData: (type) => map[type] ?? '', types: Object.keys(map) });
  assert.equal(extractDropUrl(make({ 'text/uri-list': 'https://a.test/one' })), 'https://a.test/one');
  assert.equal(extractDropUrl(make({ 'text/uri-list': '# 코멘트 줄\r\n\r\nhttps://b.test/two' })), 'https://b.test/two');
  assert.equal(extractDropUrl(make({ 'text/uri-list': 'https://a.test/first\r\nhttps://a.test/second' })), 'https://a.test/first', '여러 줄이면 첫 줄');
  assert.equal(extractDropUrl(make({ 'text/plain': 'https://c.test/plain' })), 'https://c.test/plain', 'uri-list가 없으면 plain');
  assert.equal(extractDropUrl(make({ 'text/uri-list': 'https://a.test/x', 'text/plain': 'https://c.test/plain' })), 'https://a.test/x', 'uri-list가 이긴다');
  assert.equal(extractDropUrl(make({ 'text/plain': '그냥 글자' })), '', '주소가 아니면 빈 값');
  assert.equal(extractDropUrl(null), '');
  assert.equal(extractDropUrl({ getData: () => { throw new Error('deny'); } }), '', 'getData가 막혀도 던지지 않는다');
});

test('hasDropPayload: 받을 수 있는 끌기(주소·파일)만 참이다', () => {
  assert.equal(hasDropPayload({ types: ['text/uri-list'] }), true);
  assert.equal(hasDropPayload({ types: ['text/plain'] }), true);
  assert.equal(hasDropPayload({ types: ['Files'] }), true);
  assert.equal(hasDropPayload({ types: ['application/x-something'] }), false);
  assert.equal(hasDropPayload({ types: [], files: [{ type: 'image/png' }] }), true, 'types가 비어도 files로 본다');
  assert.equal(hasDropPayload(null), false);
});

test('firstImageFile: 끌어 온 파일 중 첫 이미지를 고른다', () => {
  const png = { type: 'image/png' }, mp4 = { type: 'video/mp4' };
  assert.equal(firstImageFile({ files: [mp4, png] }), png);
  assert.equal(firstImageFile({ files: [mp4] }), null);
  assert.equal(firstImageFile({ files: [] }), null);
  assert.equal(firstImageFile(null), null);
});

test('dropRoute: 어디로 갈지 한 표로 고정한다', () => {
  const rows = [
    [{ source: 'share' }, 'ignore'],
    [{ source: 'example' }, 'login'],
    [{ source: 'file' }, 'login'],
    [{ source: 'server', owned: false }, 'login'],
    [{ source: 'server', owned: true, writable: false }, 'readonly'],
    [{ source: 'server', owned: true, writable: true }, 'quick'],
    [{ source: 'server', owned: true, writable: true, quickOpen: true }, 'modal'],
    [{ source: 'server', owned: true, writable: true, editorOpen: true }, 'editor'],
    [{ source: 'server', owned: true, writable: true, image: true }, 'photo'],
    [{ source: 'server', owned: true, writable: true, image: true, editorOpen: true }, 'photo'],
    [{ source: 'server', owned: true, writable: true, image: true, quickOpen: true }, 'photo']
  ];
  for (const [input, kind] of rows) assert.equal(dropRoute(input).kind, kind, JSON.stringify(input));
  // 사진은 열려 있는 화면을 따른다: 편집기가 열려 있으면 그 업로더, 아니면 빠른 추가 업로더.
  assert.equal(dropRoute({ source: 'server', owned: true, writable: true, image: true, editorOpen: true }).target, 'editor');
  assert.equal(dropRoute({ source: 'server', owned: true, writable: true, image: true }).target, 'quick');
  // 공유 모드는 덮개 문구도 없다(#315 읽기 전용 — 받지 않는다).
  assert.equal(dropRoute({ source: 'share' }).veil, '');
});

test('안내 문구는 계약 그대로다(로컬1 INBOX_SUBJECT와 같은 어휘)', () => {
  assert.equal(QUICK_INBOX_LABEL, '모아둔 순간');
  assert.equal(QUICK_SAVED_TEXT, '모아둔 순간에 담았어요');
  assert.equal(QUICK_REFINE_LABEL, '지금 다듬기');
  assert.equal(DROP_VEIL_TEXT, '놓으면 모아둔 순간에 담아요');
  assert.equal(QUICK_EMPTY_ERROR, '주소를 먼저 붙여 넣어 주세요.');
  assert.equal(QUICK_INVALID_ERROR, '링크 형식을 확인해 주세요.');
  assert.equal(DROP_LOGIN_NOTICE, '로그인한 뒤 순간을 담을 수 있어요.');
  assert.equal(DROP_READONLY_NOTICE, '서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');
});

// CSS 값 검사(마크업·CSS 값은 글자로 고정한다): 정원의 고르기 창 1차 버튼 보조 글자는
// opacity 0.75로 두면 #98505e 위 3.97:1로 모자라다(axe 운영 실측 2026-11-09). 새 hex 없이 토큰만.
test('고르기 창 스타일: 정원 1차 버튼의 보조 글자는 옅게 하지 않는다', () => {
  const css = readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-lt-theme=garden\] \.write-choice button\.primary span\{opacity:1\}/);
});
