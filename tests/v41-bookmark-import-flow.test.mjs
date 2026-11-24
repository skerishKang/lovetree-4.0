import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// #822 1단계 북마크에서 가져오기: 창 연결은 createBookmarkImport를 가짜 DOM으로 직접 불러 본다(docs/TESTING.md).
// 판정·추출 계산은 tests/v41-bookmark-import.test.mjs가 표로 고정한다. 시험 자료는 가짜 북마크 파일뿐이다.
import { createBookmarkImport, BOOKMARK_PANEL_ID, BOOKMARK_TEXT, noVideoText } from '../public/v41/shell/bookmark-import.mjs';
import { mountBookmarkEntry, BOOKMARK_ENTRY_ID, BOOKMARK_ENTRY_LABEL, BOOKMARK_ENTRY_LEAD } from '../public/v41/shell/write-panel.mjs';
import { BOOKMARK_FILE_MAX_BYTES } from '../public/v41/bookmark-import.mjs';
import { DROP_READONLY_NOTICE } from '../public/v41/quick-add.mjs';
import { fakeDocument, fakeText, fakeFind, fakeEl } from './helpers/fake-dom.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/bookmarks/${name}.html`, import.meta.url), 'utf8');
const fileOf = (text, size = text.length) => ({ size, text: async () => text });

// 이미 담아 둔 트리 흉내: 'FAKEvid0003'(크롬 가짜 북마크의 쇼츠)이 첫 트리에 들어 있다.
const TREES = () => [
  { id: 'tree-1', title: '첫 트리', inbox: false, moments: [{ id: 'm1', parentId: null, date: '2026-11-01', createdAt: '2026-11-01T00:00:00Z', url: 'https://youtu.be/FAKEvid0003', title: '이미 담은 쇼츠' }] },
  { id: 'tree-2', title: '둘째 트리', inbox: false, moments: [{ id: 'm2', parentId: null, date: '2026-11-02', createdAt: '2026-11-02T00:00:00Z', url: '', title: '글 순간' }] },
];

function harness({ source = 'server', owned = true, writable = true, finePointer = true, trees = TREES(), titleLimit, titleOf = (id) => `영상 제목 ${id.slice(-4)}`, dateStyle = 'dot' } = {}) {
  const doc = fakeDocument();
  const calls = { notify: [], login: [], resume: [], settings: 0, shown: 0, fetch: [] };
  const member = { snapshot: () => ({ owned, writable, subject: 'sub_test', dirty: false }) };
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
    listTrees: () => trees,
    dateStyle: () => dateStyle,
    titleGapMs: 0,
    ...(titleLimit === undefined ? {} : { titleLimit }),
    // 영상 제목 조회(서버 oEmbed 프록시) 흉내 — 부른 주소를 모두 적어 둔다.
    fetchImpl: async (url) => {
      calls.fetch.push(String(url));
      const id = new URL(String(url), 'https://lovetree.test').searchParams.get('v');
      const title = titleOf(id);
      return title === null ? { ok: false } : { ok: true, json: async () => ({ title }) };
    },
  });
  return { api, doc, calls, refs: api.refs, dialog: api.refs.dialog };
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
