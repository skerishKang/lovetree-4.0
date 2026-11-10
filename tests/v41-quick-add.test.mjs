import test from 'node:test';
import assert from 'node:assert/strict';
// #327 ② 빠른 추가: 판정·추출·문구·분기는 함수 직접 호출로 본다(docs/TESTING.md).
// DOM 연결은 tests/v41-quick-add-flow.test.mjs가 fake DOM으로 확인한다.
import { readFileSync } from 'node:fs';
import {
  extractDropUrl, hasDropPayload, firstImageFile, parseQuickUrl, dropRoute,
  previewState, previewTag, noticeSummary, savedNoticeText,
  QUICK_INBOX_LABEL, QUICK_SAVED_TEXT, QUICK_REFINE_LABEL, DROP_VEIL_TEXT,
  QUICK_EMPTY_ERROR, QUICK_INVALID_ERROR, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE,
  QUICK_PASTE_LABEL, QUICK_CLEAR_LABEL, QUICK_EMPTY_PREVIEW, QUICK_INVALID_PREVIEW,
  QUICK_PASTE_EMPTY, QUICK_PASTE_ERROR
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

// #343 상태별 표시 규칙: 카드가 무엇을 그릴지·꼬리표·안내 줄 문구는 순수 함수가 정하고 표로 고정한다.
test('previewState: 빈 값·지원 주소·지원 안 함을 미리보기 카드 상태로 나눈다', () => {
  const table = [
    [{ status: 'empty', kind: 'none' }, 'empty'],
    [null, 'empty'],
    [{ status: 'ok', kind: 'youtube' }, 'youtube'],
    [{ status: 'ok', kind: 'link' }, 'link'],
    [{ status: 'ok', kind: 'photo' }, 'link'],
    [{ status: 'ok', kind: 'video' }, 'link'],
    [{ status: 'invalid', kind: 'invalid' }, 'invalid']
  ];
  for (const [input, expected] of table) assert.equal(previewState(input), expected, JSON.stringify(input));
});

test('previewTag: YouTube는 Shorts·Live 모양까지, 다른 링크는 호스트 이름을 쓴다', () => {
  const table = [
    ['https://www.youtube.com/watch?v=abc12345678', 'YOUTUBE'],
    ['https://youtu.be/abc12345678', 'YOUTUBE'],
    ['https://m.youtube.com/watch?v=abc', 'YOUTUBE'],
    ['https://www.youtube.com/shorts/9NXOCr-T8LU', 'YOUTUBE · SHORTS'],
    ['https://youtube.com/shorts/xyz', 'YOUTUBE · SHORTS'],
    ['https://www.youtube.com/live/abc', 'YOUTUBE · LIVE'],
    ['https://example.com/some/post', 'example.com'],
    ['https://www.example.com/a', 'example.com'],
    ['notaurl', ''],
    ['javascript:alert(1)', '']
  ];
  for (const [input, expected] of table) assert.equal(previewTag(input), expected, `주소 "${input}"`);
  assert.equal(previewTag('https://www.youtube.com/shorts/xyz', 'link'), 'YOUTUBE · SHORTS', 'kind보다 주소 모양이 먼저다');
});

test('savedNoticeText: 담은 뒤 안내 줄은 ✓와 제목 요약 한 줄이다', () => {
  assert.equal(savedNoticeText('하루나 직캠'), '✓ 담았어요 · 하루나 직캠');
  assert.equal(savedNoticeText('  여러   줄\n제목  '), '✓ 담았어요 · 여러 줄 제목', '공백은 한 칸으로 접는다');
  assert.equal(savedNoticeText(''), '✓ 담았어요', '제목이 없으면 담긴 사실만');
  assert.equal(savedNoticeText('   '), '✓ 담았어요');
  const long = 'ㄱ'.repeat(40);
  assert.equal(noticeSummary('ㄱ'.repeat(32)), 'ㄱ'.repeat(32), 'max 이하면 그대로');
  assert.equal(savedNoticeText(long), `✓ 담았어요 · ${'ㄱ'.repeat(32)}…`, 'max를 넘으면 32자 + 말줄임');
});

test('붙여넣기·미리보기 문구는 계약 그대로다', () => {
  assert.equal(QUICK_PASTE_LABEL, '붙여넣기');
  assert.equal(QUICK_CLEAR_LABEL, '지우기');
  assert.equal(QUICK_EMPTY_PREVIEW, '주소를 넣으면 여기 미리보기가 보여요');
  assert.equal(QUICK_INVALID_PREVIEW, '이 주소는 담을 수 없어요. YouTube 영상이나 http(s) 링크 주소를 넣어 주세요.');
  assert.equal(QUICK_PASTE_EMPTY, '붙여 넣을 주소가 없어요.');
  assert.equal(QUICK_PASTE_ERROR, '주소를 읽지 못했어요. 직접 붙여 넣어 주세요.');
});

// 마크업·CSS 값 검사(값 자체가 요구사항이라 글자로 고정한다): #343 시안의 두 줄 설명·버튼 하나·안내 줄·높이 고정.
test('#343 마크업: 두 줄 설명·크림 버튼 하나·고정 안내 줄·맨 아래 보관 안내', () => {
  const html = readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');
  assert.match(html, /<p class="quick-lede"><span>주소만 붙여 넣으면 모아둔 순간에 담겨요\.<\/span><span>제목과 감상은 나중에 다듬어도 돼요\.<\/span><\/p>/, '설명 두 줄 고정');
  assert.match(html, /id="quick-submit" type="submit" disabled>모아둔 순간에 담기</, '아래 큰 버튼 하나');
  assert.match(html, /내 계정에만 보관 · 105MB·200개까지/, '맨 아래 작은 글씨');
  assert.doesNotMatch(html, /data-close="quick-add">닫기</, '아래 닫기 버튼은 두지 않는다(오른쪽 위 ✕만)');
  assert.match(html, /id="quick-notice"[^>]*role="status"/, '담은 뒤 안내 줄은 상태 안내');
  assert.match(html, /id="quick-refine"[^>]*>지금 다듬기 →</, '지금 다듬기는 안내 줄 안의 금색 링크');
  assert.match(html, /<p class="quick-or" aria-hidden="true">또는<\/p>/, '또는 구분선');
  assert.match(html, /placeholder="YouTube·사진·링크 주소"/, '금테 입력창 안내');
});

test('#343 CSS: 머리글 금색·미리보기/안내 줄 높이 고정·점선 사진 칸·숨긴 파일 input', () => {
  const css = readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
  assert.match(css, /#quick-add \.eyebrow\{color:var\(--lt-gold\)\}/, '밤 테마 머리글은 금색');
  assert.match(css, /\.quick-preview\{[^}]*height:300px/, '미리보기 카드 높이 고정');
  assert.match(css, /@media\(max-width:780px\)\{#quick-add\{width:100%\}\.quick-preview\{height:220px\}\}/, '좁은 화면도 높이 고정');
  assert.match(css, /\.quick-notice-row\{[^}]*min-height:44px/, '안내 줄 높이 고정');
  assert.match(css, /\.quick-photo \.file-label\{[^}]*border:1px dashed var\(--lt-gold-line\)/, '점선 사진 칸');
  assert.match(css, /\.quick-photo input\[type=file\]\{[^}]*clip-path:inset\(50%\)/, '실제 파일 input은 숨기되 폼에는 남긴다');
  assert.match(css, /\.quick-submit\{[^}]*width:100%/, '크림 버튼은 폭 전체');
});

// CSS 값 검사(마크업·CSS 값은 글자로 고정한다): 정원의 고르기 창 1차 버튼 보조 글자는
// opacity 0.75로 두면 #98505e 위 3.97:1로 모자라다(axe 운영 실측 2026-11-09). 새 hex 없이 토큰만.
test('고르기 창 스타일: 정원 1차 버튼의 보조 글자는 옅게 하지 않는다', () => {
  const css = readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-lt-theme=garden\] \.write-choice button\.primary span\{opacity:1\}/);
});
