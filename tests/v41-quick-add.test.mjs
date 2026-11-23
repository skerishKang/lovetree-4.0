import { MSG } from '../public/v41/frame-messages.mjs';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
// #327 ② 빠른 추가: 판정·추출·문구·분기는 함수 직접 호출로 본다(docs/TESTING.md).
// DOM 연결은 tests/v41-quick-add-flow.test.mjs가 fake DOM으로 확인한다.
import { readFileSync, existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import {
  extractDropUrl, hasDropPayload, firstImageFile, parseQuickUrl, dropRoute,
  previewState, previewTag, noticeSummary, savedNoticeText,
  QUICK_INBOX_LABEL, QUICK_SAVED_TEXT, QUICK_REFINE_LABEL, DROP_VEIL_TEXT,
  QUICK_EMPTY_ERROR, QUICK_INVALID_ERROR, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE,
  QUICK_PASTE_LABEL, QUICK_CLEAR_LABEL, QUICK_EMPTY_PREVIEW, QUICK_INVALID_PREVIEW,
  QUICK_PASTE_EMPTY, QUICK_PASTE_ERROR
} from '../public/v41/quick-add.mjs';
import vm from 'node:vm';
import { fakeEl } from './helpers/fake-dom.mjs';
import { createQuickAdd } from '../public/v41/shell/quick-add.mjs';
import { quickAdd, cacheMomentMediaMetadata, validateState } from '../public/v41/domain.mjs';
import { quickTreeLineText, quickTreeAfterText, quickSubmitText, quickSavedTreeText } from '../public/v41/quick-add.mjs';
import '../public/v41/youtube-id.mjs'; // #1060: 정본 등록을 vm 시험에도 적용한다.
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 vm 에도 넣는다.

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
  // #425 2번: 올린 사진은 나만 보기 — 사진은 어느 탭이 열려 있어도 자세한 추가 업로더로 간다.
  for (const input of rows.map(([value]) => value).filter(value => value.image)) {
    assert.equal(dropRoute(input).target, 'editor', JSON.stringify(input));
    assert.equal(dropRoute(input).veil, '놓으면 이 순간에 사진을 붙여요', JSON.stringify(input));
  }
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
    [{ status: 'ok', kind: 'tiktok' }, 'tiktok'],
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
    ['https://www.tiktok.com/@user/video/7252913073450106158', 'TIKTOK'],
    ['https://vm.tiktok.com/ZGd3XTri5/', 'TIKTOK'],
    ['https://vt.tiktok.com/ZS1234abc/', 'TIKTOK'],
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

/* ── 이슈 952: 소스 글자 검사(#343 마크업·CSS, 한 창 탭)를 동작 검사로 바꾼 자리 ──────────
   첫 화면을 실제로 띄워 쉬운 추가 창의 결과(초기 상태·안내 역할·창 배치 수치)를 잰다.
   판정 기준은 느슨해지지 않았다 — 글자 대신 화면에서 같은 값을 확인한다. */
const REQUIRE952 = process.env.LT_MEDIA_952_REQUIRE === '1';
let chromium952 = null;
let skip952 = false;
try {
  ({ chromium: chromium952 } = await import('playwright'));
  if (!existsSync(chromium952.executablePath())) skip952 = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip952 = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}

test('952 실행: 쉬운 추가 창은 처음에 담기가 막혀 있고, 안내 줄·배치가 약속대로다(390)', { skip: skip952 || undefined }, async () => {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
    // 나중에 등록한 규칙이 이긴다 — 우선 전체 api 를 막고, 내 기록(workspace)만 진짜 모양으로 답한다.
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [] }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
    const page = await ctx.newPage();
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    // 부팅(예시 → 실제 기록 교대)이 끝난 뒤에 누른다.
    await page.waitForTimeout(2500);
    // 입구는 실제 사용자와 같은 길이다 — 390에서는 떠 있는 ＋(#458)가 #write-menu 와 같은 길을 연다.
    // 창 배치를 재는 시험이라 단추를 직접 누르는 대신 같은 처리기를 부른다.
    await page.evaluate(() => document.getElementById('write-menu').click());
    await page.waitForFunction(() => !!document.getElementById('quick-url') && document.getElementById('quick-url').getClientRects().length, null, { timeout: 10000 });
    const got = await page.evaluate(() => {
      const px = (el, prop) => (el ? getComputedStyle(el)[prop] : null);
      const submit = document.getElementById('quick-submit');
      const form = document.getElementById('quick-form');
      return {
        submitDisabled: submit?.disabled,
        noticeRole: document.getElementById('quick-notice')?.getAttribute('role'),
        closeBtn: !!document.querySelector('[data-close="quick-add"]'),
        placeholder: document.getElementById('quick-url')?.placeholder,
        previewHeight: px(document.querySelector('.quick-preview'), 'height'),
        noticeMinHeight: px(document.querySelector('.quick-notice-row'), 'minHeight'),
        submitWidth: submit?.offsetWidth,
        formWidth: form ? form.clientWidth - parseFloat(getComputedStyle(form).paddingLeft) - parseFloat(getComputedStyle(form).paddingRight) : null,
        tabGrow: [...document.querySelectorAll('.write-tabs [role=tab]')].map((t) => getComputedStyle(t).flexGrow)
      };
    });
    assert.equal(got.submitDisabled, true, '주소를 넣기 전에는 담기가 막혀 있다');
    assert.equal(got.noticeRole, 'status', '담은 뒤 안내 줄은 상태 안내');
    assert.equal(got.closeBtn, false, '아래 닫기 단추는 두지 않는다(오른쪽 위 ✕만)');
    assert.equal(got.placeholder, 'YouTube 같은 링크 주소', '금테 입력창 안내');
    assert.equal(got.previewHeight, '120px', '빈 미리보기 칸은 390에서도 120px(좁은 화면 규칙 포함)');
    assert.equal(got.noticeMinHeight, '44px', '안내 줄 높이 고정');
    assert.ok(Math.abs(got.submitWidth - got.formWidth) <= 1, `크림 단추는 폭 전체(${got.submitWidth}px ≈ ${got.formWidth}px)`);
    assert.deepEqual(got.tabGrow, ['1', '1'], '두 탭이 폭을 나눈다');
    await ctx.close();
  } finally { await browser.close(); server.close(); }
});

// ---- 이슈 638 ②: 주소 형태별 영상 ID (media-preview.js를 실제로 실행해 본다) ----
// #1060: 정본이 등록한 globalThis.LTYouTubeId 를 vm 에도 넣는다.
const scope = { LT41_MSG: MSG, window: {}, URL, URLSearchParams, LTYouTubeId: globalThis.LTYouTubeId, LTEscapeHtml: globalThis.LTEscapeHtml };
vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js', import.meta.url), 'utf8'), scope);
const media = scope.window.LTMedia;
const VIDEO_ID = 'dQw4w9WgXcQ';
const URL_FORMS = [
  ['www.watch', `https://www.youtube.com/watch?v=${VIDEO_ID}`],
  ['m.watch+꼬리', `https://m.youtube.com/watch?v=${VIDEO_ID}&t=76&si=xyz`],
  ['youtu.be+꼬리', `https://youtu.be/${VIDEO_ID}?si=xyz`],
  ['shorts+꼬리', `https://www.youtube.com/shorts/${VIDEO_ID}?feature=share`],
  ['music+꼬리', `https://music.youtube.com/watch?v=${VIDEO_ID}&si=abc`]
];

test('#638 주소 형태 여섯 가지가 같은 영상 ID로 풀린다', () => {
  for (const [name, url] of URL_FORMS) {
    const described = media.describe(url);
    assert.equal(described.kind, 'youtube', `${name}: YouTube로 판정한다`);
    assert.equal(described.videoId, VIDEO_ID, `${name}: 영상 ID가 같다`);
  }
  // &t= 시점은 openUrl에 살린다(m 주소의 t=76 → 76초).
  assert.match(media.describe(URL_FORMS[1][1]).openUrl, /t=76s/);
  // 프로토콜이 없는 주소는 기존 규칙 그대로 담을 수 없다(quick-intake도 http(s)만 받는다).
  assert.equal(media.describe('m.youtube.com/watch?v=' + VIDEO_ID).kind, 'invalid');
});

// ---- 이슈 638 ①: quickAdd 도메인 규칙 — 고른 트리 우선(#327의 '모아둔 순간 고정'을 바꾼 대표 결정 2026-11-15) ----
const inboxTree = { id: 't-inbox', subject: QUICK_INBOX_LABEL, title: QUICK_INBOX_LABEL, inbox: true, coverMomentId: '', coverDesign: '', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', moments: [{ id: 's0', parentId: null, links: [], createdAt: '2026-11-01T00:00:00Z', title: '첫 순간', note: '', emotion: '설렘', date: '2026-11-01', relation: '', url: 'https://youtu.be/abc123DEF45' }] };
const secondTree = { id: 't-second', subject: '두 번째 트리', title: '두 번째 트리', inbox: false, coverMomentId: '', coverDesign: '', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', moments: [{ id: 's9', parentId: null, links: [], createdAt: '2026-11-02T00:00:00Z', title: '담는 순간', note: '', emotion: '설렘', date: '2026-11-02', relation: '', url: '' }] };
const stateWithTwoTrees = { version: 1, trees: [inboxTree, secondTree], prefs: {} };

test('#638 quickAdd는 고른 트리(input.treeId)에 담고, 가장 최근 순간 다음에 잇는다', () => {
  const result = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45', treeId: 't-second' });
  const tree = result.state.trees.find(tree => tree.id === 't-second');
  assert.equal(result.treeId, 't-second');
  assert.equal(tree.moments.length, 2);
  assert.equal(tree.moments[1].parentId, 's9', '가장 최근 순간 다음에 잇는다(가 결정)');
  assert.equal(result.state.trees.find(tree => tree.id === 't-inbox').moments.length, 1, '첫 트리는 그대로');
  assert.deepEqual(validateState(result.state), result.state);
});

// ---- 이슈 671: '그 순간 다음에 담기' — 책의 '다음 순간 추가'가 넘긴 parentId로 저장한다 ----
test('#671 quickAdd는 input.parentId의 순간 바로 다음에 잇고, 못 찾으면 최근 순간으로 물러난다', () => {
  // 두 번째 트리의 '담는 순간'(s9)을 목적지로 보내면 그 순간 다음에 잇는다.
  const after = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45', treeId: 't-second', parentId: 's9' });
  assert.equal(after.treeId, 't-second', '트리는 고른 트리 규칙(#647)을 그대로 쓴다');
  const grownTree = after.state.trees.find(tree => tree.id === 't-second');
  assert.equal(grownTree.moments.length, 2);
  assert.equal(grownTree.moments[1].parentId, 's9', '목적지 순간 다음에 잇는다');
  assert.deepEqual(validateState(after.state), after.state);
  // 목적지가 고른 트리의 순간이 아니면(오래된 화면·지워진 순간·다른 트리의 순간) 최근 순간 다음으로 물러난다.
  const fallback = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45', treeId: 't-second', parentId: 'm-missing' });
  assert.equal(fallback.state.trees.find(tree => tree.id === 't-second').moments[1].parentId, 's9');
  const otherTree = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45', treeId: 't-second', parentId: 's0' });
  assert.equal(otherTree.state.trees.find(tree => tree.id === 't-second').moments[1].parentId, 's9', '다른 트리의 순간을 목적지로 쓰지 않는다');
});

test('#638 treeId가 없거나 찾지 못하면 기존 규칙(inbox)으로 물러난다', () => {
  const without = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45' });
  assert.equal(without.treeId, 't-inbox');
  const unknown = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45', treeId: 't-missing' });
  assert.equal(unknown.treeId, 't-inbox');
});

test('#638 트리가 0개면 treeId가 있어도 기본 트리(모아둔 순간)를 새로 만든다', () => {
  const result = quickAdd({ version: 1, trees: [], prefs: {} }, { url: 'https://youtu.be/abc123DEF45', treeId: 't-second' });
  assert.equal(result.state.trees.length, 1);
  assert.equal(result.state.trees[0].inbox, true);
  assert.equal(result.state.trees[0].subject, QUICK_INBOX_LABEL);
  assert.equal(result.treeId, result.state.trees[0].id);
});

test('#638 backfillTitles(cacheMomentMediaMetadata)는 title을 건드리지 않는다 — 사용자 제목 보호', () => {
  const grown = cacheMomentMediaMetadata(inboxTree, 's0', 'https://youtu.be/abc123DEF45', { title: '영상 제목' });
  const moment = grown.moments.find(m => m.id === 's0');
  assert.equal(moment.title, '첫 순간', '제목은 그대로');
  assert.equal(moment.mediaMetadata.title, '영상 제목');
  const userWritten = { ...inboxTree, moments: [{ ...inboxTree.moments[0], title: '내가 쓴 제목' }] };
  const kept = cacheMomentMediaMetadata(userWritten, 's0', 'https://youtu.be/abc123DEF45', { title: '영상 제목' });
  assert.equal(kept.moments.find(m => m.id === 's0').title, '내가 쓴 제목');
});

// ---- 이슈 638 ①: 쉬운 추가 화면 — 트리 한 줄·저장 배정·제목 경합 ----
const URL_OK = 'https://m.youtube.com/watch?v=abc12345678&t=76&si=xyz';
const VIDEO_TITLE = '테스트 영상 제목';

function harness638({ trees = [inboxTree, secondTree], currentTreeId = 't-second', applyImpl = null, fetchImpl = null, writeTab = 'easy', quickTarget = null } = {}) {
  // 하은 2회차 ③ 재현을 위해 문자열 대신 함수도 받는다 — 트리를 바꾸고 다시 여는 시험에서 쓴다.
  const nowTreeId = () => (typeof currentTreeId === 'function' ? currentTreeId() : currentTreeId);
  const calls = { apply: [], notify: [], editors: [], hold: [] };
  const els = {};
  const $ = id => { if (!els[id]) els[id] = fakeEl({ value: '', children: [], replaceChildren(...kids) { this.children = kids; }, append(...kids) { this.children.push(...kids); } }); return els[id]; };
  els['write-panel'] = fakeEl({ value: '', children: [], open: false, replaceChildren(...kids) { this.children = kids; }, append(...kids) { this.children.push(...kids); } });
  const doc = { createElement: tag => fakeEl({ tagName: tag, value: '', children: [], replaceChildren(...kids) { this.children = kids; }, append(...kids) { this.children.push(...kids); } }) };
  els['moment-form'] = fakeEl({ elements: { url: fakeEl() } });
  const member = {
    snapshot: () => ({ owned: true, writable: true, subject: 'sub_test0003' }),
    apply: (...args) => { calls.apply.push(args); if (applyImpl) return applyImpl(...args); return { treeId: nowTreeId() || 't-inbox', momentId: 'm-new' }; },
    state: () => null
  };
  let resolveTitle = null;
  const pendingFetch = new Promise(resolve => { resolveTitle = resolve; });
  const titleFetch = fetchImpl || ((url) => pendingFetch.then(title => ({ ok: true, json: async () => ({ title }) })));
  const api = createQuickAdd({
    $,
    document: doc,
    // 판정은 실제 한 벌(media-preview.js의 describe)을 쓴다 — m.youtube.com 주소도 그대로 통과하는지 함께 확인한다.
    describe: media.describe,
    getMember: () => member,
    getSource: () => 'server',
    getCurrent: () => 'track59-sketchbook.html',
    notify: text => calls.notify.push(text),
    panel: () => {},
    choose: () => {},
    openEditor: (mode, parentId) => calls.editors.push([mode, parentId]),
    resetEditorBaseline: () => {},
    openLoginStart: () => {},
    // 이슈 671: writePanel.open()은 '먼저 보일 탭'을 돌려준다(기본 쉬운 추가, writeTab으로 바꿔 본다).
    writePanel: { open: () => { els['write-panel'].open = true; return writeTab; } },
    momentTitle: moment => moment.title || '',
    requestClose: () => {},
    // #978: 담는 동안 열린 창을 붙잡았다가 끝나면 푸는지 본다(셸이 넘기는 holdPanel을 흉내 낸다).
    holdPanel: (id, on) => calls.hold.push([id, on]),
    currentTreeId: nowTreeId,
    listTrees: () => trees,
    // 2026-11-16 대표 요청: 쉬운 추가로 담을 곳 설정(늘 같은 트리) — 셸이 넘기는 한 벌을 흉내 낸다.
    quickTargetPreference: () => quickTarget,
    isFinePointer: () => false,
    fetchImpl: titleFetch
  });
  return { api, els, calls, resolveTitle: value => resolveTitle(value) };
}

test('#638 담기 창은 고른 트리 이름을 한 줄 보이고, 그 자리에서 바꿀 수 있다', () => {
  const h = harness638();
  h.api.openQuick();
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText('두 번째 트리'));
  assert.equal(h.els['quick-submit'].textContent, quickSubmitText('두 번째 트리'));
  const select = h.els['quick-tree-select'];
  assert.equal(select.hidden, false, '트리가 둘이면 고르기를 보인다');
  // 트리 메뉴와 같은 순서(inbox 먼저)·같은 이름 규칙이다.
  assert.deepEqual(select.children.map(option => option.textContent), [QUICK_INBOX_LABEL, '두 번째 트리']);
  assert.equal(select.value, 't-second', '지금 고른 트리가 담길 트리다');
  // 그 자리에서 바꾸면 줄·단추·저장 대상이 같이 바뀐다.
  select.value = 't-inbox';
  select.dispatch('change', {});
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText(QUICK_INBOX_LABEL));
  assert.equal(h.els['quick-submit'].textContent, quickSubmitText(QUICK_INBOX_LABEL));
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.equal(h.calls.apply[0][0], 'quickAdd');
  assert.equal(h.calls.apply[0][1].treeId, 't-inbox', '바꾼 트리에 담는다');
});

test('#638 두 번째 트리를 고른 상태에서 담으면 그 트리로 저장 입력을 보낸다', () => {
  const h = harness638();
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second' }, undefined, {moment:true}]);
});

test('#638 트리가 0개면 기본 트리 문구를 보이고 treeId를 보내지 않는다', () => {
  const h = harness638({ trees: [], currentTreeId: '' });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText(QUICK_INBOX_LABEL));
  assert.equal(h.els['quick-tree-select'].hidden, true, '트리가 없으면 고를 것도 없다');
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK }, undefined, undefined], '기존 규칙(기본 트리 생성)으로 저장한다');
});

test('#638 트리가 하나뿐이면 고르기를 숨기고 그 트리 이름을 보인다', () => {
  const h = harness638({ trees: [inboxTree], currentTreeId: 't-inbox' });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-select'].hidden, true);
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText(QUICK_INBOX_LABEL));
});

// #978: 담는 동안에는 열린 창이 닫히지 않게 붙잡고(저장 뒤 화면 다시 그리기가 창을 닫으려 한다),
// 저장이 끝나면 바로, 실패해도 반드시 푼다.
test('#978 담는 동안 쓰기 창을 붙잡았다가 끝나면(실패해도) 바로 푼다', () => {
  const h = harness638();
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.hold, [['write-panel', true], ['write-panel', false]], '앞뒤로 한 번씩 붙잡고/풀고');

  const bad = harness638({ applyImpl: () => { throw Error('boom'); } });
  bad.els['quick-url'].value = URL_OK;
  bad.api.renderPreview();
  bad.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(bad.calls.hold, [['write-panel', true], ['write-panel', false]], '저장이 실패해도 붙잡은 것은 반드시 푼다');
});

// ---- 이슈 671: 쓰기 창 열림이 목적지('그 순간 다음에 담기')를 받는다 ----
test('#671 openWrite는 목적지 순간 다음에 담기 문구를 보이고 저장에 parentId를 넘긴다', () => {
  const h = harness638();
  h.api.openWrite({ parentId: 's9' });
  assert.equal(h.els['write-panel'].open, true, '같은 쓰기 창을 연다');
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeAfterText('담는 순간', '두 번째 트리'));
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second', parentId: 's9' }, undefined, {moment:true}]);
});

test('#671 목적지 없이 열면 기존 한 줄로 열고 parentId를 보내지 않는다', () => {
  const h = harness638();
  h.api.openWrite({ parentId: 's9' });
  h.api.openWrite({});
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText('두 번째 트리'), '다시 열면 목적지를 지운다');
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second' }, undefined, {moment:true}]);
});

test('#671 목적지 순간을 못 찾으면 목적지 없이 열린다', () => {
  const h = harness638();
  h.api.openWrite({ parentId: 'm-missing' });
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText('두 번째 트리'));
  assert.deepEqual(h.calls.editors, []);
});

test('#671 먼저 보일 탭이 자세한 추가면 편집기의 이어 담기로 넘긴다', () => {
  const h = harness638({ writeTab: 'detailed' });
  h.api.openWrite({ parentId: 's9' });
  assert.deepEqual(h.calls.editors, [['add', 's9']], '자세한 탭은 편집기 규칙(setEditorMode)을 그대로 쓴다');
  assert.deepEqual(h.calls.apply, [], '쉬운 추가 저장을 부르지 않는다');
});

test('#671 트리 고르기를 바꾸면 목적지를 지운다', () => {
  const h = harness638();
  h.api.openWrite({ parentId: 's9' });
  const select = h.els['quick-tree-select'];
  select.value = 't-inbox';
  select.dispatch('change', {});
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText(QUICK_INBOX_LABEL), '다른 트리의 순간 다음이 아니게 된다');
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.equal(h.calls.apply[0][1].parentId, undefined, '바꾼 트리에는 목적지 없이 담는다');
});

test('#638 제목이 늦게 도착하면 방금 담은 순간의 영상 제목을 채운다(backfillTitles)', async () => {
  const h = harness638();
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview(); // 미리보기 때 제목 요청이 나간다(아직 응답 전)
  h.api.submitQuick({ preventDefault() {} }); // 제목을 못 받은 채 담는다 — 기본 문구로 저장됨
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second' }, undefined, {moment:true}]);
  assert.equal(h.calls.apply.length, 1, '제목이 오기 전에는 채우는 저장이 없다');
  h.resolveTitle(VIDEO_TITLE); // oEmbed 응답이 도착한다
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.apply.length, 2, '제목이 도착하면 한 번 더 저장한다');
  assert.deepEqual(h.calls.apply[1], ['backfillTitles', { items: [{ treeId: 't-second', momentId: 'm-new', url: URL_OK, mediaMetadata: { title: VIDEO_TITLE } }] }]);
});

test('#638 제목을 받아 둔 뒤 담으면 mediaMetadata가 저장 입력에 함께 간다(채움 저장 없음)', async () => {
  const h = harness638({ fetchImpl: async () => ({ ok: true, json: async () => ({ title: VIDEO_TITLE }) }) });
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second', mediaMetadata: { title: VIDEO_TITLE } }, undefined, {moment:true}]);
  assert.equal(h.calls.apply.length, 1);
});

test('#638 끌어다 놓기로 바로 담았을 때도(미리보기 요청이 없어도) 제목이 오면 채운다', async () => {
  const h = harness638();
  h.api.saveUrl(URL_OK); // 미리보기 없이 바로 담는다
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second' }, undefined, {moment:true}]);
  h.resolveTitle(VIDEO_TITLE);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.apply.length, 2);
  assert.equal(h.calls.apply[1][0], 'backfillTitles');
});

test('#638 담은 안내(떠 있는 알림)도 담긴 트리 이름을 따른다', () => {
  const h = harness638();
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.equal(h.els['quick-saved-text'].textContent, quickSavedTreeText('두 번째 트리'));
});

// ---- 2026-11-16 대표 요청: 설정 '쉬운 추가로 담을 곳' — 늘 같은 트리 / 지금 보고 있는 트리 ----
test('설정 늘 같은 트리(모아둔 순간): 다른 트리를 보다가 쉬운 추가를 열어도 그 트리가 골라져 있다', () => {
  const h = harness638({ currentTreeId: 't-second', quickTarget: { mode: 'fixed', treeId: 't-inbox' } });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText(QUICK_INBOX_LABEL), '줄은 지정한 트리 이름을 보인다');
  assert.equal(h.els['quick-tree-select'].value, 't-inbox', '지금 보는 트리(t-second)가 아니라 지정한 트리가 기본');
  assert.equal(h.els['quick-submit'].textContent, quickSubmitText(QUICK_INBOX_LABEL));
  // 창 안 드롭다운은 그대로 두어 그때그때 바꿀 수 있다.
  assert.equal(h.els['quick-tree-select'].hidden, false, '트리가 둘이면 그 자리에서 바꾸는 고르기가 보인다');
  const select = h.els['quick-tree-select'];
  select.value = 't-second';
  select.dispatch('change', {});
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText('두 번째 트리'), '그 자리에서 바꾸면 저장 대상도 바뀐다');
});

test('설정 기본값(지금 보고 있는 트리)이면 보던 트리가 골라져 있다', () => {
  const h = harness638({ currentTreeId: 't-second', quickTarget: { mode: 'current', treeId: '' } });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-select'].value, 't-second', '기본값은 지금 보는 트리');
});

test('설정에 고른 트리가 지워졌으면 지금 보고 있는 트리로 돌아간다', () => {
  const h = harness638({ currentTreeId: 't-second', quickTarget: { mode: 'fixed', treeId: 't-gone' } });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-select'].value, 't-second', '지워진 트리 대신 지금 보는 트리로 돌아간다');
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText('두 번째 트리'));
});

// '설정 줄과 안내 문구가 셸 문서에 있다' 글자 검사는 지웠다(이슈 952) — 설정이 실제로 하는 일
// (기본값·지운 트리 복귀·다시 열 때 다시 읽기)은 위 harness638 시험들이 동작으로 확인하고,
// 문구는 화면 카피라 글자로 고정하지 않는다.

// ── 하은 2회차(261116) ③: 쉬운 추가 '담을 트리' 설정이 다시 열 때는 안 먹는다 ───────────────
// 재현(하은 캡처 2d_쉬운추가·운영일지 2회차): 설정이 기본값('지금 보고 있는 트리')인데
//   트리를 바꾸고 쉬운 추가를 다시 열면 '모아둔 순간'으로 열린다 — 2·3번째가 옛 트리에 오담했다.
//   원인: renderTreeLine은 quickTreeId가 빈 값·없는 트리일 때만 다시 정한다 — 첫 열 때 정한
//   quickTreeId가 유효한 한 '지금 보고 있는 트리' 설정을 다시 읽지 않는다.
test('설정 지금 보고 있는 트리: 트리를 바꾸고 다시 열면 방금 보는 트리로 다시 골라진다(하은 2회차 ③)', () => {
  let now = 't-inbox';
  const h = harness638({ currentTreeId: () => now, quickTarget: { mode: 'current', treeId: '' } });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-select'].value, 't-inbox', '첫 열기: 지금 보는 트리(모아둔 순간)');
  now = 't-second';
  h.els['write-panel'].open = false; // 창을 닫고 다른 트리를 보다가 다시 연다(하은의 실제 흐름).
  h.api.openQuick();
  assert.equal(h.els['quick-tree-select'].value, 't-second', '다시 열면 지금 보는 트리를 다시 읽는다 — 모아둔 순간에 머물지 않는다');
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText('두 번째 트리'));
});

test('설정 늘 같은 트리: 다시 열어도 지정한 트리가 유지되고, 손으로 고른 것은 그 세션 안에서만 유지된다', () => {
  let now = 't-second';
  const h = harness638({ currentTreeId: () => now, quickTarget: { mode: 'fixed', treeId: 't-inbox' } });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-select'].value, 't-inbox', '지정한 트리가 기본');
  // 같은 세션(창이 열린 채 연속 담기)에서 손으로 두 번째 트리를 고른다.
  const select = h.els['quick-tree-select'];
  select.value = 't-second';
  select.dispatch('change', {});
  assert.equal(select.value, 't-second', '그 자리에서 바꾸면 유지된다');
  // 다시 열면(새 세션) 설정(늘 같은 트리)으로 돌아온다.
  h.els['write-panel'].open = false;
  h.api.openQuick();
  assert.equal(h.els['quick-tree-select'].value, 't-inbox', '다시 열면 설정이 이긴다');
});

// ── 하은 2회차 손질 ③: 트리 이름이 '트리'로 끝나면 '트리'가 두 번 보였다 ───────────────────
// '두 번째 트리 트리에 담겨요' → 이름을 그대로 쓰는 '‹이름›에 담겨요'로 통일한다(대표 결정).
test('트리 한 줄 문구: 이름을 그대로 쓰고, 이름이 트리로 끝나도 겹치지 않는다(하은 2회차 손질 ③)', () => {
  assert.equal(quickTreeLineText('모아둔 순간'), '모아둔 순간에 담겨요');
  assert.equal(quickTreeLineText('두 번째 트리'), '두 번째 트리에 담겨요');
  assert.equal(quickTreeAfterText('담는 순간', '두 번째 트리'), '담는 순간 다음에 두 번째 트리에 담겨요');
  assert.equal(quickTreeAfterText('담는 순간', '모아둔 순간'), '담는 순간 다음에 모아둔 순간에 담겨요');
});

// #1001 (b)①: 쉬운 추가(quickAdd) 뒤 자동 제목 보정(backfillTitles)이 같은 저장 흐름에서
// 화면을 두 번 다시 띄우던 결함 — 한 번만 다시 떠야 한다.
// 보정 조회(/api/youtube/oembed)를 쉬운 추가의 PUT 뒤까지 늦춰 두 동작이 한 흐름에 겹치게 한다.
// 전: quickAdd 재적재 + backfillTitles 재적재 = 2회. 후: quickAdd 1회 + 보정은 모델만 갱신 = 1회.
test('952/1001 최종 실행: 쉬운 추가 뒤 자동 제목 보정 — 같은 흐름에서 화면 재적재는 0회·새 순간이 책에 보인다', { skip: skip952 || !REQUIRE952 ? skip952 || 'LT_MEDIA_952_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  if (skip952) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip952}`);
  const { createTree: makeTree, addMoment: growTree } = await import('../public/v41/domain.mjs');
  const { serve: serveApp } = await import('./helpers/screen-audit.mjs');
  let tree = makeTree({ subject: '시험', title: '보정 흐름 트리', note: '', emotion: '설렘', date: '2026-11-01', url: '' }, '2026-11-01T00:00:00Z');
  tree = growTree(tree, { title: 'youtube.com에서 간직한 순간', note: '', emotion: '설렘', date: '2026-11-01', url: 'https://www.youtube.com/watch?v=OLDVIDEO123' }, tree.moments[0].id, '2026-11-01T00:00:00Z');
  const server = await serveApp();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    let rev = 1, stored = JSON.parse(JSON.stringify(tree));
    const puts = [];
    let releaseOld = null;
    const oldGate = new Promise(r => { releaseOld = r; });
    await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/youtube/oembed*', async r => {
      const url = r.request().url();
      if (url.includes('OLDVIDEO123')) {
        await oldGate;
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: '보정된 영상 제목', authorName: '시험 채널', thumbnailUrl: '' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: '새 미리보기 제목', authorName: '시험 채널', thumbnailUrl: '' }) });
    });
    await ctx.route('**/api/workspace**', r => {
      const req = r.request();
      if (req.method() === 'PUT') {
        const body = JSON.parse(req.postData() || '{}');
        puts.push({ at: Date.now() });
        const edited = body?.state?.trees?.find(t => t.id === tree.id);
        if (edited) stored = edited;
        rev += 1;
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: rev, subject: '시험계정' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: rev, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z', state: { version: 1, trees: [stored], prefs: {} } }) });
    });
    const page = await ctx.newPage();
    const navs = [];
    let counting = false;
    page.on('framenavigated', f => { if (counting && /\/v41\/(views\/|home\.html)/.test(f.url())) navs.push({ url: f.url(), at: Date.now() }); });
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.locator('.tree-views [data-view="track59-sketchbook.html"]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /track59-sketchbook/.test(f.contentWindow?.location?.href || '')), null, { timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.getElementById('write-menu').click());
    await page.waitForFunction(() => !!document.getElementById('quick-url') && document.getElementById('quick-url').getClientRects().length, null, { timeout: 10000 });
    await page.evaluate(() => {
      const input = document.getElementById('quick-url');
      input.value = 'https://www.youtube.com/watch?v=NEWVIDEO456';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => { const b = document.getElementById('quick-submit'); return b && !b.disabled; }, null, { timeout: 15000 });
    counting = true;
    await page.evaluate(() => document.getElementById('quick-submit').click());
    // 쉬운 추가의 PUT이 나간 뒤에 보정 조회를 풀어, 보정이 같은 흐름 뒤에 겹치게 한다.
    let deadline = Date.now() + 20000;
    while (Date.now() < deadline && puts.length < 1) await page.waitForTimeout(150);
    assert.ok(puts.length >= 1, '쉬운 추가 저장 PUT이 나간다');
    releaseOld();
    deadline = Date.now() + 20000;
    while (Date.now() < deadline && puts.length < 2) await page.waitForTimeout(150);
    assert.ok(puts.length >= 2, '자동 제목 보정 저장 PUT이 이어 나간다(보정이 실제로 흐름에 겹침)');
    await page.waitForTimeout(2500);
    const fixed = stored.moments.find(m => (m.url || '').includes('OLDVIDEO123'));
    assert.equal(fixed?.title, '보정된 영상 제목', '보정이 실제로 제목을 바로잡았다(흐름이 헛돌지 않음)');
    assert.equal(navs.length, 0, `같은 저장 흐름에서 화면 재적재는 0회여야 한다(실측 ${navs.length}: ${JSON.stringify(navs)})`);
    const added = stored.moments.find(m => (m.url || '').includes('NEWVIDEO456'));
    assert.ok(added?.id, '새 순간이 모델에 저장된다');
    const bookFrame = page.frames().find(f => /views\/track59-sketchbook/.test(f.url()));
    const pages = await bookFrame.evaluate(() => window.__TRACK59__.pageCount());
    await bookFrame.evaluate(i => window.__TRACK59__.jump(i), pages - 1);
    await bookFrame.waitForSelector(`[data-moment="${added.id}"]`, { timeout: 10000 });
    assert.ok(await bookFrame.evaluate(id => !!document.querySelector(`[data-moment="${id}"]`), added.id), '새 순간이 같은 책 문서에 그려진다(재적재 없이)');
    await ctx.close();
  } finally { await browser.close(); server.close(); }
});
