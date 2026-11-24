import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// #822 1단계 북마크에서 가져오기: 창 연결은 createBookmarkImport를 가짜 DOM으로 직접 불러 본다(docs/TESTING.md).
// 판정·추출 계산은 tests/v41-bookmark-import.test.mjs가 표로 고정한다. 시험 자료는 가짜 북마크 파일뿐이다.
import { createBookmarkImport, BOOKMARK_PANEL_ID, BOOKMARK_TEXT, noVideoText, saveLabel, failedTitle, continueLabel } from '../public/v41/shell/bookmark-import.mjs';
import { mountBookmarkEntry, BOOKMARK_ENTRY_ID, BOOKMARK_ENTRY_LABEL, BOOKMARK_ENTRY_LEAD } from '../public/v41/shell/write-panel.mjs';
import { BOOKMARK_FILE_MAX_BYTES, NEW_TREE_VALUE } from '../public/v41/bookmark-import.mjs';
import { createMemberSession } from '../public/v41/member-session.mjs';
import { createTree, addMoment, latestMomentId, MAX_MOMENTS } from '../public/v41/domain.mjs';
import { DROP_READONLY_NOTICE } from '../public/v41/quick-add.mjs';
import { fakeDocument, fakeText, fakeFind, fakeEl } from './helpers/fake-dom.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/bookmarks/${name}.html`, import.meta.url), 'utf8');
const fileOf = (text, size = text.length) => ({ size, text: async () => text });

// 이미 담아 둔 트리 흉내: 'FAKEvid0003'(크롬 가짜 북마크의 쇼츠)이 첫 트리에 들어 있다.
const TREES = () => [
  { id: 'tree-1', title: '첫 트리', inbox: false, moments: [{ id: 'm1', parentId: null, date: '2026-11-01', createdAt: '2026-11-01T00:00:00Z', url: 'https://youtu.be/FAKEvid0003', title: '이미 담은 쇼츠' }] },
  { id: 'tree-2', title: '둘째 트리', inbox: false, moments: [{ id: 'm2', parentId: null, date: '2026-11-02', createdAt: '2026-11-02T00:00:00Z', url: '', title: '글 순간' }] },
];

function harness({ source = 'server', owned = true, writable = true, finePointer = true, trees = TREES(), titleLimit, titleOf = (id) => `영상 제목 ${id.slice(-4)}`, dateStyle = 'dot',
  session = null, currentTreeId = '', preference = null, pause = () => Promise.resolve(), titleWaitMs } = {}) {
  const doc = fakeDocument();
  const calls = { notify: [], login: [], resume: [], settings: 0, shown: 0, fetch: [], hold: [], refresh: 0, openBook: [] };
  const member = session || { snapshot: () => ({ owned, writable, subject: 'sub_test', dirty: false }) };
  // 뒤로가기 흉내: 캡처 귀 → 보통 귀 순서로 부른다. 열린 창 목록은 이 창과 그 위에 겹친 창들이다.
  const popstate = { capture: [], bubble: [] };
  const fakeWindow = { addEventListener: (type, fn, capture) => { if (type === 'popstate') popstate[capture ? 'capture' : 'bubble'].push(fn); } };
  const above = [];
  const api = createBookmarkImport({
    document: doc,
    $: (id) => doc.getElementById(id),
    getMember: () => member,
    getSource: () => source,
    notify: (text) => calls.notify.push(text),
    openLoginStart: (intent) => calls.login.push(intent),
    resumeMember: (intent) => calls.resume.push(intent),
    openSettingsData: () => { calls.settings += 1; },
    onModalShown: () => { calls.shown += 1; },
    ensureStyle: () => {},
    isFinePointer: () => finePointer,
    listTrees: () => (session ? session.state().trees : trees),
    dateStyle: () => dateStyle,
    titleGapMs: 0,
    currentTreeId: () => currentTreeId,
    quickTargetPreference: () => preference,
    holdPanel: (id, on) => calls.hold.push([id, on]),
    refreshScreen: () => { calls.refresh += 1; },
    openBook: (treeId, momentId) => calls.openBook.push([treeId, momentId]),
    pause,
    syncPollMs: 1,
    syncWaitMs: 50,
    window: fakeWindow,
    ...(titleWaitMs === undefined ? {} : { titleWaitMs }),
    ...(titleLimit === undefined ? {} : { titleLimit }),
    // 영상 제목 조회(서버 oEmbed 프록시) 흉내 — 부른 주소를 모두 적어 둔다.
    fetchImpl: async (url) => {
      calls.fetch.push(String(url));
      const id = new URL(String(url), 'https://lovetree.test').searchParams.get('v');
      const title = titleOf(id);
      return title === null ? { ok: false } : { ok: true, json: async () => ({ title }) };
    },
  });
  api.refs.dialog.matches = () => true;
  doc.querySelectorAll = () => [...(api.refs.dialog.open ? [api.refs.dialog] : []), ...above];
  const back = () => { for (const fn of [...popstate.capture, ...popstate.bubble]) fn({}); };
  return { api, doc, calls, refs: api.refs, dialog: api.refs.dialog, back, above };
}
// 실제 저장 세션에 가짜 서버만 붙인다 — 담기가 기존 저장 경로(member.apply → PUT)로 가는지 본다.
async function startSession(trees) {
  const writes = [];
  const session = createMemberSession({
    api: {
      get: async () => ({ ok: true, status: 200, revision: 1, subject: 'trial-subject', writeSubjectBound: true, state: { version: 1, trees } }),
      put: async (body) => { writes.push(body); return { ok: true, status: 200, revision: writes.length + 1 }; },
      logout: async () => ({ ok: true, status: 200 }),
    },
    delay: () => Promise.resolve(),
    draftStorage: null,
    cacheStorage: null,
  });
  await session.start();
  return { session, writes };
}
function seedTree(subject, count = 1, url = '') {
  let tree = createTree({ subject, title: '시작 순간', note: '', date: '2026-11-01', url }, '2026-11-01T00:00:00.000Z');
  for (let i = 1; i < count; i += 1) tree = addMoment(tree, { title: `순간 ${i}`, note: '', date: '2026-11-02', url: '' }, tree.moments[0].id, '2026-11-01T00:00:00.000Z');
  return tree;
}
const optionsOf = (h) => h.refs.tree.children.map((option) => [option.getAttribute('value'), option.textContent]);
async function previewWith(options, name = 'chrome') {
  const h = harness(options);
  await h.api.open();
  await h.api.readFile(fileOf(fixture(name)));
  await settle(h);
  return h;
}
// 미리보기 목록의 줄들을 읽기 쉬운 모양으로: [폴더, [[고름, 제목, 날짜·딱지 글자들]]]
function listed(h) {
  return h.refs.groups.children.map((group) => {
    const [head, items] = group.children;
    return [
      head.children.filter((c) => c.tagName === 'SPAN').map((c) => c.textContent).join(' '),
      items.children.map((li) => {
        const [box, , text] = li.children[0].children;
        const [title, meta] = text.children;
        return [box.checked, title.textContent, meta.children.map((c) => c.textContent)];
      }),
    ];
  });
}
const boxes = (h) => fakeFind(h.refs.groups, (n) => n.tagName === 'INPUT' && n.parentNode?.className?.startsWith('bmi-item'));
const settle = async (h) => { for (let i = 0; i < 40 && !h.api.titles.idle(); i += 1) await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)); };

test('쉬운 추가 탭 아래에 입구 한 줄을 만들고, 누르면 여는 일만 부른다', () => {
  const doc = fakeDocument();
  const host = doc.createElement('section');
  let opened = 0;
  const button = mountBookmarkEntry({ $: (id) => (id === 'write-easy' ? host : null), document: doc, onOpen: () => { opened += 1; } });
  assert.equal(host.children.length, 1);
  assert.equal(fakeText(host), `${BOOKMARK_ENTRY_LEAD} ${BOOKMARK_ENTRY_LABEL}`);
  assert.equal(button.id, BOOKMARK_ENTRY_ID);
  assert.equal(button.type, 'button', '폼을 내지 않는 단추');
  button.click();
  assert.equal(opened, 1);
  assert.equal(mountBookmarkEntry({ $: () => null, document: doc }), null, '쉬운 추가 탭이 없으면 아무것도 만들지 않는다');
});

test('열기 가드는 쉬운 추가와 같은 순서·같은 문구다(로그인 → 내 기록으로 → 읽기 전용 안내)', async () => {
  const rows = [
    [{ owned: false }, 'login'],
    [{ source: 'example' }, 'resume'],
    [{ writable: false }, 'readonly'],
    [{}, 'open'],
  ];
  for (const [options, want] of rows) {
    const h = harness(options);
    const opened = await h.api.open();
    assert.equal(opened, want === 'open', want);
    assert.equal(h.dialog.open, want === 'open', want);
    assert.deepEqual(h.calls.login, want === 'login' ? ['new-tree'] : [], want);
    assert.deepEqual(h.calls.resume, want === 'resume' ? ['write'] : [], want);
    assert.deepEqual(h.calls.notify, want === 'readonly' ? [DROP_READONLY_NOTICE] : [], want);
    assert.equal(h.calls.settings, want === 'readonly' ? 1 : 0, want);
    assert.equal(h.calls.shown, want === 'open' ? 1 : 0, want);
  }
});

test('창은 문서에 한 번 붙고, 처음에는 파일 고르기와 안내가 보인다', async () => {
  const h = harness();
  assert.equal(h.doc.body.children.length, 1);
  assert.equal(h.dialog.id, BOOKMARK_PANEL_ID);
  assert.equal(h.dialog.getAttribute('data-lt-panel'), 'card', '공통 가운데 카드 틀');
  await h.api.open();
  assert.equal(h.refs.start.hidden, false);
  assert.equal(h.refs.preview.hidden, true);
  const shown = fakeText(h.dialog);
  for (const text of [BOOKMARK_TEXT.title, BOOKMARK_TEXT.lede, BOOKMARK_TEXT.pick, BOOKMARK_TEXT.helpTitle, ...BOOKMARK_TEXT.facts, ...BOOKMARK_TEXT.help.map((row) => row[0])]) {
    assert.ok(shown.includes(text), text);
  }
  assert.equal(h.refs.pick.focused, true, '열면 파일 고르기 단추에 초점');
  assert.equal(h.refs.file.type, 'file');
  assert.equal(h.refs.file.hidden, true);
  // 파일 고르기 단추는 숨은 파일 입력을 누른다.
  let clicked = 0;
  h.refs.file.click = () => { clicked += 1; };
  h.refs.pick.click();
  assert.equal(clicked, 1);
});

test('끌어다 놓기 안내는 마우스 기기에서만 보인다', async () => {
  for (const [finePointer, hidden] of [[true, false], [false, true]]) {
    const h = harness({ finePointer });
    await h.api.open();
    assert.equal(h.refs.dropHint.hidden, hidden);
  }
});

test('북마크 파일을 고르면 찾은 개수와, 폴더별로 묶은 미리보기 목록을 보여 준다', async () => {
  const h = harness({ titleLimit: 0 }); // 제목 조회 없이 처음 그림만 본다(조회는 아래 시험)
  await h.api.open();
  h.refs.file.files = [fileOf(fixture('chrome'))];
  h.refs.file.value = 'bookmarks.html';
  h.refs.file.dispatch('change', {});
  assert.equal(h.refs.file.value, '', '같은 파일을 다시 고를 수 있게 입력을 비운다');
  assert.equal(h.api.state().reading, true);
  assert.equal(h.refs.pick.disabled, true, '읽는 동안에는 다시 고르지 못한다');
  assert.equal(h.refs.status.textContent, BOOKMARK_TEXT.reading);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.api.state(), { view: 'preview', count: 4, reading: false, picked: ['b0', 'b1', 'b3'] });
  assert.equal(h.refs.start.hidden, true);
  assert.equal(h.refs.preview.hidden, false);
  assert.equal(h.refs.summary.textContent, '유튜브 영상 4개를 찾았어요. 재생목록 1개·채널 1개는 이번에는 담지 않아요. 같은 영상 1개는 하나로 모았어요.');
  assert.equal(h.refs.note.hidden, true);
  assert.equal(h.refs.another.focused, true);
  // 북마크 제목이 먼저 보이고, 이미 담은 영상은 딱지가 붙고 기본으로 빠진다.
  const d = (seconds) => { const at = new Date(seconds * 1000); return `${at.getFullYear()}. ${String(at.getMonth() + 1).padStart(2, '0')}. ${String(at.getDate()).padStart(2, '0')}`; };
  assert.deepEqual(listed(h), [
    ['북마크바 1개', [[true, '봄 무대 직캠 4K', [d(1710471600)]]]],
    ['북마크바 › 직캠 모음 2개', [[true, '여름 축제 직캠', [d(1712545200)]], [false, '연습실 쇼츠', [d(1714532400), '이미 있음 · 첫 트리']]]],
    ['폴더 없음 1개', [[true, '가을 무대 <리허설>', [d(1717210800)]]]],
  ]);
  assert.equal(h.refs.count.textContent, '3개 고름');
  assert.deepEqual([h.refs.all.checked, h.refs.all.indeterminate], [true, false], '새 영상을 모두 골랐으면 전체 칸이 켜진다');
  // 썸네일은 기존 썸네일 주소 규칙(영상 id → ytimg)으로만 만든다 — 그림을 받아 오지 않고 주소만 쓴다.
  const images = fakeFind(h.refs.groups, (n) => n.tagName === 'IMG');
  assert.deepEqual(images.map((img) => img.getAttribute('src')), ['FAKEvid0001', 'FAKEvid0002', 'FAKEvid0003', 'FAKEvid0004'].map((id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`));
  assert.ok(images.every((img) => img.getAttribute('loading') === 'lazy' && img.getAttribute('referrerpolicy') === 'no-referrer' && img.getAttribute('alt') === ''));
  // 유튜브가 아닌 북마크는 화면 어디에도 나오지 않는다.
  const shown = fakeText(h.dialog);
  for (const secret of ['example.test', '가짜 소식', '가짜 채널']) assert.ok(!shown.includes(secret), secret);
  assert.deepEqual(h.calls.fetch, [], '상한 0이면 제목을 묻지 않는다');
});

test('제목은 고른 영상만 기존 조회 경로로 차례로 받아 바꿔 넣고, 서버로는 영상 id만 간다', async () => {
  const h = harness({ titleOf: (id) => (id === 'FAKEvid0002' ? null : `영상 제목 ${id.slice(-4)}`) });
  await h.api.open();
  await h.api.readFile(fileOf(fixture('chrome')));
  await settle(h);
  assert.deepEqual(h.calls.fetch, ['FAKEvid0001', 'FAKEvid0002', 'FAKEvid0004'].map((id) => `/api/youtube/oembed?v=${id}`), '고른 영상만, 목록 순서대로 — 이미 담은 영상은 묻지 않는다');
  assert.deepEqual(listed(h).flatMap(([, items]) => items.map((item) => item[1])), ['영상 제목 0001', '여름 축제 직캠', '연습실 쇼츠', '영상 제목 0004'], '받은 제목으로 바꾸고, 못 받으면 북마크 제목 그대로');
  // 이미 담은 영상을 손으로 고르면 그때 그 제목을 받는다.
  const [, , existingBox] = boxes(h);
  existingBox.checked = true;
  existingBox.dispatch('change', {});
  await settle(h);
  assert.equal(h.calls.fetch.at(-1), '/api/youtube/oembed?v=FAKEvid0003');
  assert.equal(h.calls.fetch.length, 4, '받은 것·못 받은 것은 다시 묻지 않는다');
  // 북마크 내용(제목·폴더 이름·주소)은 요청에 실리지 않는다.
  for (const url of h.calls.fetch) assert.match(url, /^\/api\/youtube\/oembed\?v=[A-Za-z0-9_-]{11}$/);
});

test('제목 조회에는 상한이 있다 — 넘는 영상은 북마크 제목으로 둔다', async () => {
  const h = harness({ titleLimit: 2 });
  await h.api.open();
  await h.api.readFile(fileOf(fixture('chrome')));
  await settle(h);
  assert.equal(h.calls.fetch.length, 2);
  assert.deepEqual(listed(h).flatMap(([, items]) => items.map((item) => item[1])), ['영상 제목 0001', '영상 제목 0002', '연습실 쇼츠', '가을 무대 <리허설>']);
});

test('북마크 제목이 없는 영상은 확인 중 → 받은 제목(못 받으면 제목 없는 영상), 날짜가 없으면 오늘로 담는다고 알린다', async () => {
  const text = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n<DT><A HREF="https://youtu.be/FAKEvid0601">https://youtu.be/FAKEvid0601</A>\n<DT><A HREF="https://youtu.be/FAKEvid0602">YouTube</A>\n</DL><p>';
  const h = harness({ titleOf: (id) => (id === 'FAKEvid0601' ? '받은 제목' : null) });
  await h.api.open();
  const reading = h.api.readFile(fileOf(text));
  await reading;
  assert.deepEqual(listed(h), [['폴더 없음 2개', [[true, BOOKMARK_TEXT.titlePending, [BOOKMARK_TEXT.undated]], [true, BOOKMARK_TEXT.titlePending, [BOOKMARK_TEXT.undated]]]]]);
  await settle(h);
  assert.deepEqual(listed(h)[0][1].map((item) => item[1]), ['받은 제목', BOOKMARK_TEXT.noTitle]);
  // 조회 상한을 다 쓰면 남은 줄은 '확인 중'에 머물지 않는다.
  const capped = harness({ titleLimit: 1, titleOf: () => '받은 제목' });
  await capped.api.open();
  await capped.api.readFile(fileOf(text));
  await settle(capped);
  assert.deepEqual(listed(capped)[0][1].map((item) => item[1]), ['받은 제목', BOOKMARK_TEXT.noTitle]);
});

test('하나씩·폴더·전체 고르기: 칸 모양과 고른 수가 함께 바뀐다', async () => {
  const h = harness();
  await h.api.open();
  await h.api.readFile(fileOf(fixture('chrome')));
  await settle(h);
  const [first, second, existing, last] = boxes(h);
  const groupBoxes = h.refs.groups.children.map((group) => group.children[0].children[0]);
  const look = () => [h.refs.count.textContent, [h.refs.all.checked, h.refs.all.indeterminate], groupBoxes.map((b) => [b.checked, !!b.indeterminate]), boxes(h).map((b) => b.checked)];
  // 하나 풀기 → 그 폴더와 전체가 '일부'가 된다.
  second.checked = false; second.dispatch('change', {});
  assert.deepEqual(look(), ['2개 고름', [false, true], [[true, false], [false, false], [true, false]], [true, false, false, true]]);
  // 폴더 켜기 → 그 폴더의 새 영상만 고른다(이미 있음은 그대로 빠져 있다).
  groupBoxes[1].checked = true; groupBoxes[1].dispatch('change', {});
  assert.deepEqual(look(), ['3개 고름', [true, false], [[true, false], [true, false], [true, false]], [true, true, false, true]]);
  // 이미 있음을 손으로 고를 수 있다(다시 담기를 막지 않는다).
  existing.checked = true; existing.dispatch('change', {});
  assert.deepEqual(look()[0], '4개 고름');
  // 폴더 끄기 → 손으로 고른 이미 있음까지 그 폴더는 모두 풀린다.
  groupBoxes[1].checked = false; groupBoxes[1].dispatch('change', {});
  assert.deepEqual(look(), ['2개 고름', [false, true], [[true, false], [false, false], [true, false]], [true, false, false, true]]);
  // 전체 끄기 → 전체 켜기.
  h.refs.all.checked = false; h.refs.all.dispatch('change', {});
  assert.deepEqual(look(), ['고른 영상이 없어요', [false, false], [[false, false], [false, false], [false, false]], [false, false, false, false]]);
  h.refs.all.checked = true; h.refs.all.dispatch('change', {});
  assert.deepEqual(look(), ['3개 고름', [true, false], [[true, false], [true, false], [true, false]], [true, true, false, true]]);
  assert.deepEqual(h.api.state().picked, ['b0', 'b1', 'b3']);
  assert.ok(first && last);
});

test('새 영상이 없는 폴더의 고르기 칸은 꺼 두고, 썸네일을 못 받으면 빈 칸으로 둔다', async () => {
  const trees = TREES();
  trees[1].moments.push({ id: 'm9', parentId: 'm2', date: '2026-11-03', createdAt: '2026-11-03T00:00:00Z', url: 'https://www.youtube.com/watch?v=FAKEvid0001', title: '이미 담은 무대' });
  const h = harness({ trees });
  await h.api.open();
  await h.api.readFile(fileOf(fixture('chrome')));
  await settle(h);
  const groupBoxes = h.refs.groups.children.map((group) => group.children[0].children[0]);
  assert.deepEqual(groupBoxes.map((b) => !!b.disabled), [true, false, false], '북마크바 폴더의 하나뿐인 영상은 이미 둘째 트리에 있다');
  assert.equal(listed(h)[0][1][0][2].at(-1), '이미 있음 · 둘째 트리');
  const [image] = fakeFind(h.refs.groups, (n) => n.tagName === 'IMG');
  image.dispatch('error', {});
  assert.equal(image.hidden, true);
  assert.equal(image.parentNode.classList.contains('is-missing'), true);
});

test('읽지 못하는 파일은 까닭을 알리고 처음 화면에 머문다', async () => {
  const page = '<!doctype html><html><body><a href="https://www.youtube.com/watch?v=FAKEvid0001">영상</a></body></html>';
  const onlyLists = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n<DT><A HREF="https://www.youtube.com/playlist?list=PLfake01">목록</A>\n<DT><A HREF="https://www.youtube.com/@fake">채널</A>\n</DL><p>';
  const rows = [
    [fileOf(page), BOOKMARK_TEXT.notBookmark],
    [fileOf('<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n<DT><A HREF="https://example.test/">글</A>\n</DL><p>'), BOOKMARK_TEXT.noVideo],
    [fileOf(onlyLists), `${BOOKMARK_TEXT.noVideo} 재생목록 1개·채널 1개는 이번에는 담지 않아요.`],
    [fileOf('x', BOOKMARK_FILE_MAX_BYTES + 1), BOOKMARK_TEXT.tooLarge],
    [{ size: 10, text: async () => { throw new Error('읽기 실패'); } }, BOOKMARK_TEXT.unreadable],
  ];
  for (const [file, want] of rows) {
    const h = harness();
    await h.api.open();
    const ok = await h.api.readFile(file);
    assert.equal(ok, false, want);
    assert.equal(h.refs.error.textContent, want);
    assert.equal(h.refs.error.getAttribute('role'), 'alert');
    assert.deepEqual(h.api.state(), { view: 'start', count: 0, reading: false, picked: [] }, want);
    assert.equal(h.refs.pick.disabled, false, '다시 고를 수 있다');
  }
  assert.equal(noVideoText({}), BOOKMARK_TEXT.noVideo);
  // 너무 큰 파일은 읽기를 시작하지도 않는다.
  const h = harness();
  let read = 0;
  await h.api.readFile({ size: BOOKMARK_FILE_MAX_BYTES + 1, text: async () => { read += 1; return ''; } });
  assert.equal(read, 0);
});

test('다른 파일 고르기는 목록을 비우고 처음으로 돌아가며, 닫았다 열면 읽어 둔 목록이 남아 있다', async () => {
  const h = harness();
  await h.api.open();
  await h.api.readFile(fileOf(fixture('safari')));
  h.api.close();
  assert.equal(h.dialog.open, false);
  await h.api.open();
  assert.deepEqual([h.api.state().view, h.api.state().count], ['preview', 4], '실수로 닫아도 다시 고르지 않게 목록을 그대로 둔다');
  await h.api.readFile(fileOf('x'.repeat(10)));
  h.refs.another.click();
  assert.deepEqual(h.api.state(), { view: 'start', count: 0, reading: false, picked: [] });
  assert.equal(h.refs.groups.children.length, 0, '목록도 비운다');
  assert.equal(h.refs.error.textContent, '');
  assert.equal(h.refs.pick.focused, true);
});

test('이 창 위의 끌어다 놓기는 셸의 주소 담기로 새지 않고, 처음 화면에서만 파일을 받는다', async () => {
  const h = harness();
  await h.api.open();
  const event = (files = []) => {
    const e = { stopped: 0, prevented: 0, dataTransfer: { types: ['Files'], files, dropEffect: '' }, stopPropagation() { e.stopped += 1; }, preventDefault() { e.prevented += 1; } };
    return e;
  };
  for (const type of ['dragenter', 'dragover']) {
    const e = event();
    h.dialog.dispatch(type, e);
    assert.deepEqual([e.stopped, e.prevented, e.dataTransfer.dropEffect], [1, 1, 'copy'], type);
    const text = { stopped: 0, prevented: 0, dataTransfer: { types: ['text/plain'] }, stopPropagation() { text.stopped += 1; }, preventDefault() { text.prevented += 1; } };
    h.dialog.dispatch(type, text);
    assert.deepEqual([text.stopped, text.prevented], [1, 0], `${type}: 파일이 아니면 받지 않되 셸로 새지는 않는다`);
  }
  const drop = event([fileOf(fixture('firefox'))]);
  h.dialog.dispatch('drop', drop);
  assert.deepEqual([drop.stopped, drop.prevented], [1, 1]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual([h.api.state().view, h.api.state().count], ['preview', 4]);
  // 목록이 뜬 뒤에 놓은 파일은 받지 않는다(고른 것을 덮지 않게).
  const again = event([fileOf(fixture('edge'))]);
  h.dialog.dispatch('dragover', again);
  assert.equal(again.dataTransfer.dropEffect, 'none');
  h.dialog.dispatch('drop', again);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.refs.summary.textContent.includes('재생목록 1개·채널 1개'), true, '파이어폭스 목록 그대로');
});

test('닫기: × 단추와 창 밖 누르기로 닫히고, 닫히면 보이는 순간 추가 단추로 초점이 돌아간다', async () => {
  const h = harness();
  const visible = fakeEl({ getClientRects: () => [{ width: 10, height: 10 }] });
  const writeMenu = h.doc.createElement('button');
  writeMenu.id = 'write-menu';
  writeMenu.getClientRects = () => [{ width: 80, height: 44 }];
  h.doc.activeElement = fakeEl({ getClientRects: () => [] }); // 연 단추는 순간 추가 창과 함께 사라진다
  await h.api.open();
  h.refs.close.click();
  assert.equal(h.dialog.open, false);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(writeMenu.focused, true);
  // 연 단추가 그대로 보이면 그 단추로 돌아간다.
  h.doc.activeElement = visible;
  await h.api.open();
  h.dialog.getBoundingClientRect = () => ({ left: 100, right: 500, top: 100, bottom: 400 });
  h.dialog.dispatch('click', { target: h.dialog, clientX: 300, clientY: 200 });
  assert.equal(h.dialog.open, true, '창 안을 누르면 닫히지 않는다');
  h.dialog.dispatch('click', { target: h.refs.pick, clientX: 10, clientY: 10 });
  assert.equal(h.dialog.open, true, '창 안 요소에서 온 누름은 닫지 않는다');
  h.dialog.dispatch('click', { target: h.dialog, clientX: 10, clientY: 10 });
  assert.equal(h.dialog.open, false, '창 밖(덮개)을 누르면 닫힌다');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(visible.focused, true);
});

// ---- 4단계: 담을 트리 고르기와 한 번에 저장 ----

test('담을 트리: 내 트리들과 새 트리 만들기가 나오고, 처음 고르는 트리는 쉬운 추가와 같은 규칙이다', async () => {
  const trees = () => [seedTree('첫 트리'), { ...seedTree('모아둔 순간'), inbox: true }, seedTree('셋째 트리')];
  const list = trees();
  const rows = [
    [{}, list[1].id, '설정·지금 트리가 없으면 모아둔 순간'],
    [{ currentTreeId: list[2].id }, list[2].id, '지금 보고 있는 트리'],
    [{ currentTreeId: list[2].id, preference: { mode: 'fixed', treeId: list[0].id } }, list[0].id, '늘 같은 트리 설정이 먼저'],
    [{ currentTreeId: list[2].id, preference: { mode: 'fixed', treeId: 'gone' } }, list[2].id, '설정한 트리가 없어졌으면 지금 트리'],
  ];
  for (const [options, want, why] of rows) {
    const h = await previewWith({ trees: list, ...options });
    assert.equal(h.refs.foot.hidden, false, '미리보기에서 아래 줄이 보인다');
    assert.deepEqual(optionsOf(h), [[list[0].id, '첫 트리'], [list[1].id, '모아둔 순간'], [list[2].id, '셋째 트리'], [NEW_TREE_VALUE, BOOKMARK_TEXT.newTree]]);
    assert.equal(h.refs.tree.value, want, why);
    assert.equal(h.refs.newName.hidden, true);
    assert.equal(h.refs.save.textContent, saveLabel(4));
    assert.equal(h.refs.save.disabled, false);
  }
  // 트리가 하나도 없으면 새 트리 만들기뿐이고, 이름 칸이 바로 보인다.
  const empty = await previewWith({ trees: [] });
  assert.deepEqual(optionsOf(empty), [[NEW_TREE_VALUE, BOOKMARK_TEXT.newTree]]);
  assert.deepEqual([empty.refs.tree.value, empty.refs.newName.hidden], [NEW_TREE_VALUE, false]);
  // 고른 것이 없으면 담기 단추가 꺼진다.
  empty.refs.all.checked = false; empty.refs.all.dispatch('change', {});
  assert.deepEqual([empty.refs.save.disabled, empty.refs.save.textContent], [true, '담기']);
  // 처음·읽는 중에는 아래 줄이 없다.
  const fresh = harness();
  await fresh.api.open();
  assert.equal(fresh.refs.foot.hidden, true);
});

test('한 번에 저장: 진행을 보여 주고, 기존 저장 경로로 담고, 마치면 결과와 다음 걸음을 보여 준다', async () => {
  const first = seedTree('첫 트리', 2, 'https://youtu.be/FAKEvid0003');
  const { session, writes } = await startSession([first, seedTree('둘째 트리')]);
  let release = null;
  const gate = () => new Promise((resolve) => { release = resolve; });
  const h = await previewWith({ session, currentTreeId: first.id, pause: gate });
  assert.deepEqual(h.api.state().picked, ['b0', 'b1', 'b3'], '이미 담은 쇼츠(b2)는 빠져 있다');
  h.refs.save.click();
  await new Promise((resolve) => setImmediate(resolve));
  // 담는 중: 진행 표시가 보이고 닫히지 않는다.
  assert.equal(h.api.state().view, 'saving');
  assert.deepEqual([h.refs.saving.hidden, h.refs.preview.hidden, h.refs.foot.hidden, h.refs.done.hidden], [false, true, true, true]);
  assert.deepEqual(h.calls.hold, [[BOOKMARK_PANEL_ID, true]], '담는 동안 창을 붙잡는다');
  assert.equal(h.refs.progressCount.textContent, '0 / 3');
  assert.deepEqual([h.refs.progressBar.getAttribute('role'), h.refs.progressBar.getAttribute('aria-valuenow'), h.refs.progressBar.getAttribute('aria-valuemax')], ['progressbar', '0', '3']);
  assert.equal(h.refs.progressNow.textContent, '영상 제목 0001', '지금 담는 영상(날짜가 가장 이른 것)');
  assert.equal(h.refs.close.disabled, true);
  assert.equal(h.api.close(), false);
  assert.equal(h.dialog.open, true, '담는 중에는 닫히지 않는다');
  const esc = { prevented: 0, preventDefault() { esc.prevented += 1; } };
  h.dialog.dispatch('cancel', esc);
  assert.equal(esc.prevented, 1, 'Esc도 막는다');
  h.back();
  assert.equal(h.dialog.open, true, '뒤로가기도 닫지 않는다');
  assert.deepEqual(h.calls.notify, [BOOKMARK_TEXT.busy, BOOKMARK_TEXT.busy]);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.refs.progressCount.textContent, '1 / 3');
  assert.equal(h.refs.progressBar.getAttribute('aria-valuetext'), '1 / 3');
  release();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  for (let i = 0; i < 50 && h.api.state().view !== 'done'; i += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  // 마침.
  assert.equal(h.api.state().view, 'done');
  assert.deepEqual([h.refs.done.hidden, h.refs.saving.hidden, h.refs.foot.hidden], [false, true, true]);
  assert.equal(h.refs.doneTitle.textContent, '✓ 3개를 ‘첫 트리’에 담았어요');
  assert.equal(h.refs.doneTitle.focused, true);
  assert.equal(h.refs.doneNote.hidden, true, '서버 저장까지 끝났으면 덧붙이는 말이 없다');
  assert.equal(h.refs.failed.hidden, true);
  assert.equal(h.refs.more.hidden, true, '남은 새 영상이 없으면 이어서 고르기가 없다');
  assert.equal(h.refs.openTree.hidden, false);
  assert.equal(h.calls.refresh, 1, '뒤 화면은 끝에 한 번만 다시 그린다');
  // 기존 저장 경로로 담겼다: 순간 수, 날짜, 잇는 자리, 서버로 간 내용.
  const grown = session.state().trees.find((tree) => tree.id === first.id);
  assert.equal(grown.moments.length, 5, '저장 뒤 트리 순간 수 2 + 3');
  const added = grown.moments.slice(2);
  assert.deepEqual(added.map((m) => m.title), ['영상 제목 0001', '영상 제목 0002', '영상 제목 0004']);
  assert.deepEqual(added.map((m) => m.parentId), [latestMomentId(first), added[0].id, added[1].id]);
  assert.ok(added.every((m) => /^2024-/.test(m.date)), '순간 날짜는 북마크한 날');
  assert.equal(writes.at(-1).state.trees.find((tree) => tree.id === first.id).moments.length, 5, '서버로 간 마지막 저장에도 5개');
  assert.equal(session.state().trees[1].moments.length, 1, '다른 트리는 그대로');
  // 담은 영상은 이제 이미 있음이고 고름에서 빠진다.
  assert.deepEqual(h.api.state().picked, []);
  assert.ok(listed(h).flatMap(([, items]) => items).every((item) => item[0] === false && item[2].at(-1) === '이미 있음 · 첫 트리'));
  // 결과를 보는 동안에는 뒤로가기로 닫힌다. 닫히면 붙잡기를 푼다.
  h.back();
  assert.equal(h.dialog.open, false);
  assert.deepEqual(h.calls.hold.at(-1), [BOOKMARK_PANEL_ID, false]);
  // 남은 것이 없으니 다시 열면 처음부터다.
  await h.api.open();
  assert.equal(h.api.state().view, 'start');
  session.dispose();
});

test('결과 위에 다른 창이 겹쳐 있으면 뒤로가기는 그 창의 차례다', async () => {
  const { session } = await startSession([seedTree('첫 트리')]);
  const h = await previewWith({ session });
  await h.api.startSave();
  assert.equal(h.api.state().view, 'done');
  h.above.push({ open: true, matches: () => true }); // 저장 뒤 뜨는 둘러보기 소개 질문 같은 창
  h.back();
  assert.equal(h.dialog.open, true, '맨 위 창이 아니면 닫지 않는다');
  h.above.length = 0;
  h.back();
  assert.equal(h.dialog.open, false);
  session.dispose();
});

test('새 트리 만들기: 이름을 적어야 담기고, 담으면 그 이름의 트리가 생긴다', async () => {
  const { session, writes } = await startSession([seedTree('첫 트리')]);
  const h = await previewWith({ session });
  h.refs.tree.value = NEW_TREE_VALUE; h.refs.tree.dispatch('change', {});
  assert.equal(h.refs.newName.hidden, false);
  assert.equal(h.refs.newName.focused, true, '새 트리를 고르면 이름 칸으로');
  assert.equal(await h.api.startSave(), null);
  assert.equal(h.refs.footError.textContent, '새 트리 이름을 적어 주세요.');
  assert.equal(h.api.state().view, 'preview');
  assert.deepEqual(h.calls.hold, [], '막힌 담기는 창을 붙잡지 않는다');
  h.refs.newName.value = '가짜 직캠 모음'; h.refs.newName.dispatch('input', {});
  assert.equal(h.refs.footError.textContent, '', '고쳐 적으면 안내를 거둔다');
  // 이름 칸에서 Enter로도 담는다.
  const enter = { key: 'Enter', prevented: 0, preventDefault() { enter.prevented += 1; } };
  h.refs.newName.dispatch('keydown', enter);
  assert.equal(enter.prevented, 1);
  for (let i = 0; i < 50 && h.api.state().view !== 'done'; i += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  const made = session.state().trees.find((tree) => tree.subject === '가짜 직캠 모음');
  assert.equal(made.moments.length, 4, '저장 뒤 새 트리 순간 수');
  assert.equal(made.moments[0].parentId, null);
  assert.equal(h.refs.doneTitle.textContent, '✓ 4개를 ‘가짜 직캠 모음’에 담았어요');
  assert.equal(writes.at(-1).state.trees.length, 2);
  // 트리 보러 가기: 창을 닫고 담은 트리의 책을 처음 담은 순간에서 연다.
  h.refs.openTree.click();
  assert.equal(h.dialog.open, false);
  assert.deepEqual(h.calls.openBook, [[made.id, made.moments[0].id]]);
  session.dispose();
});

test('트리에 남은 자리보다 많이 고르면 담기 전에 알려 주고 담지 않는다', async () => {
  const nearlyFull = seedTree('거의 찬 트리', MAX_MOMENTS - 2);
  const { session, writes } = await startSession([nearlyFull]);
  const h = await previewWith({ session, currentTreeId: nearlyFull.id });
  assert.equal(await h.api.startSave(), null);
  assert.equal(h.refs.footError.textContent, `이 트리에는 2개만 더 담을 수 있어요(한 트리에 ${MAX_MOMENTS}개까지). 고른 영상을 줄이거나 다른 트리를 골라 주세요.`);
  assert.equal(writes.length, 0, '아무것도 저장하지 않는다');
  // 고른 것을 줄이면 안내가 사라지고 담긴다.
  const [first, second] = boxes(h);
  first.checked = false; first.dispatch('change', {});
  second.checked = false; second.dispatch('change', {});
  assert.equal(h.refs.footError.textContent, '');
  await h.api.startSave();
  assert.equal(session.state().trees[0].moments.length, MAX_MOMENTS);
  assert.equal(h.refs.doneTitle.textContent, '✓ 2개를 ‘거의 찬 트리’에 담았어요');
  assert.equal(h.refs.more.hidden, false);
  assert.equal(h.refs.more.textContent, continueLabel(2), '아직 담지 않은 새 영상이 남아 있다');
  // 이어서 고르기 → 미리보기로 돌아가고 남은 것만 골라져 있다.
  h.refs.more.click();
  assert.equal(h.api.state().view, 'preview');
  assert.deepEqual(h.api.state().picked, ['b0', 'b1']);
  assert.equal(h.refs.save.textContent, saveLabel(2));
  session.dispose();
});

test('담지 못한 영상은 까닭과 함께 목록으로 보여 주고, 다시 시도하면 그것만 다시 담는다', async () => {
  const { session } = await startSession([seedTree('첫 트리')]);
  let failing = true;
  const applied = [];
  const flaky = {
    snapshot: () => session.snapshot(),
    state: () => session.state(),
    apply: (action, input, ...rest) => {
      applied.push(input.url);
      if (failing && /FAKEvid000[24]/.test(input.url)) throw new Error('잠깐 저장 연결이 끊겼어요.');
      return session.apply(action, input, ...rest);
    },
  };
  const h = await previewWith({ session: flaky, currentTreeId: session.state().trees[0].id });
  await h.api.startSave();
  assert.equal(h.refs.doneTitle.textContent, '✓ 2개를 ‘첫 트리’에 담았어요');
  assert.equal(h.refs.failed.hidden, false);
  assert.equal(h.refs.failedTitle.textContent, failedTitle(2));
  assert.deepEqual(h.refs.failedList.children.map((li) => li.children.map((c) => c.textContent)), [['영상 제목 0002', '잠깐 저장 연결이 끊겼어요.'], ['영상 제목 0004', '잠깐 저장 연결이 끊겼어요.']]);
  assert.equal(session.state().trees[0].moments.length, 3);
  assert.equal(h.refs.more.textContent, continueLabel(2), '담지 못한 것은 아직 새 영상이다');
  // 다시 시도: 실패한 둘만 다시 담는다.
  failing = false;
  applied.length = 0;
  h.refs.retry.click();
  for (let i = 0; i < 50 && h.api.state().view !== 'done'; i += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(applied.length, 2);
  assert.ok(applied.every((url) => /FAKEvid000[24]/.test(url)));
  assert.equal(session.state().trees[0].moments.length, 5);
  assert.equal(h.refs.doneTitle.textContent, '✓ 2개를 ‘첫 트리’에 담았어요');
  assert.equal(h.refs.failed.hidden, true);
  assert.equal(h.refs.more.hidden, true);
  // 모두 실패하면 담았다고 말하지 않고, 뒤 화면도 다시 그리지 않는다.
  const none = await previewWith({ session: { ...flaky, apply: () => { throw new Error('저장할 수 없어요.'); } } }, 'edge');
  await none.api.startSave();
  assert.equal(none.refs.doneTitle.textContent, '담지 못했어요.');
  assert.deepEqual([none.refs.openTree.hidden, none.refs.failed.hidden, none.refs.failedList.children.length, none.calls.refresh], [true, false, 4, 0]);
  session.dispose();
});

test('서버 저장이 아직이거나 실패하면 담았다는 말에 그 사실을 덧붙인다', async () => {
  const { session } = await startSession([seedTree('첫 트리')]);
  for (const [phase, want] of [['syncing', BOOKMARK_TEXT.syncPending], ['offline', BOOKMARK_TEXT.syncFailed], ['conflict', BOOKMARK_TEXT.syncFailed]]) {
    const stuck = { state: () => session.state(), apply: (...args) => session.apply(...args), snapshot: () => ({ ...session.snapshot(), dirty: true, phase }) };
    const h = await previewWith({ session: stuck }, 'safari');
    const [box] = boxes(h);
    h.refs.all.checked = false; h.refs.all.dispatch('change', {});
    box.checked = true; box.dispatch('change', {});
    await h.api.startSave();
    assert.equal(h.refs.doneNote.textContent, want, phase);
    assert.equal(h.refs.doneNote.hidden, false);
  }
  session.dispose();
});

test('저장 때 제목: 받아 둔 것은 다시 묻지 않고, 없는 것만 차례로 묻고, 연달아 세 번 못 받으면 더 묻지 않는다', async () => {
  const many = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n' + Array.from({ length: 8 }, (_, i) => `<DT><A HREF="https://youtu.be/FAKEvid07${String(i).padStart(2, '0')}" ADD_DATE="${1710471600 + i * 86400}">북마크 제목 ${i}</A>`).join('\n') + '\n</DL><p>';
  const { session } = await startSession([seedTree('첫 트리')]);
  // 미리보기에서는 둘만 받는다(상한 2) — 0번은 받고 1번은 못 받는다. 저장 때 2번은 받고 3·4·5번은 연달아 못 받는다.
  const h = harness({ session, titleLimit: 2, titleOf: (id) => (['FAKEvid0700', 'FAKEvid0702'].includes(id) ? `영상 제목 ${id.slice(-2)}` : null) });
  await h.api.open();
  await h.api.readFile(fileOf(many));
  await settle(h);
  assert.deepEqual(h.calls.fetch.map((url) => url.slice(-2)), ['00', '01']);
  h.calls.fetch.length = 0;
  await h.api.startSave();
  assert.deepEqual(h.calls.fetch.map((url) => url.slice(-2)), ['01', '02', '03', '04', '05'], '받아 둔 0번은 다시 묻지 않고, 연달아 세 번(3·4·5) 못 받은 뒤에는 묻지 않는다');
  const titlesSaved = session.state().trees[0].moments.slice(1).map((m) => m.title);
  assert.deepEqual(titlesSaved, ['영상 제목 00', '북마크 제목 1', '영상 제목 02', '북마크 제목 3', '북마크 제목 4', '북마크 제목 5', '북마크 제목 6', '북마크 제목 7'], '못 받은 것은 북마크 제목으로 담는다');
  session.dispose();
});
