// #638: 쉬운 추가 트리 오배정 · 휴대폰 유튜브 주소 제목 · 지도 NaN 날짜 — 세 고장의 계산 시험.
// ① 쉬운 추가는 지금 고른 트리에 담긴다(고른 트리 우선 — #327의 '모아둔 순간 고정'을 바꾼 CTO 결정 2026-11-15).
// ② m.youtube.com·youtu.be·shorts·music 주소와 &t=·&si=·&feature= 꼬리는 같은 영상 ID로 풀린다.
// ③ 지도 월 묶음 이름은 실제 기록의 'YYYY-MM-DD' 날짜에서도 NaN이 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fakeEl } from './helpers/fake-dom.mjs';
import { createQuickAdd } from '../public/v41/shell/quick-add.mjs';
import { quickAdd, cacheMomentMediaMetadata, validateState } from '../public/v41/domain.mjs';
import { quickTreeLineText, quickSubmitText, quickSavedTreeText, QUICK_INBOX_LABEL } from '../public/v41/quick-add.mjs';

// ---- ② 주소 형태별 영상 ID (media-preview.js를 실제로 실행해 본다) ----
const scope = { window: {}, URL, URLSearchParams };
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

test('#638-2 주소 형태 여섯 가지가 같은 영상 ID로 풀린다', () => {
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

// ---- ① quickAdd 도메인 규칙: 고른 트리 우선 ----
const inboxTree = { id: 't-inbox', subject: QUICK_INBOX_LABEL, title: QUICK_INBOX_LABEL, inbox: true, coverMomentId: '', coverDesign: '', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', moments: [{ id: 's0', parentId: null, links: [], createdAt: '2026-11-01T00:00:00Z', title: '첫 순간', note: '', emotion: '설렘', date: '2026-11-01', relation: '', url: 'https://youtu.be/abc123DEF45' }] };
const secondTree = { id: 't-second', subject: '두 번째 트리', title: '두 번째 트리', inbox: false, coverMomentId: '', coverDesign: '', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', moments: [{ id: 's9', parentId: null, links: [], createdAt: '2026-11-02T00:00:00Z', title: '담는 순간', note: '', emotion: '설렘', date: '2026-11-02', relation: '', url: '' }] };
const stateWithTwoTrees = { version: 1, trees: [inboxTree, secondTree], prefs: {} };

test('#638-1 quickAdd는 고른 트리(input.treeId)에 담고, 가장 최근 순간 다음에 잇는다', () => {
  const result = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45', treeId: 't-second' });
  const tree = result.state.trees.find(tree => tree.id === 't-second');
  assert.equal(result.treeId, 't-second');
  assert.equal(tree.moments.length, 2);
  assert.equal(tree.moments[1].parentId, 's9', '가장 최근 순간 다음에 잇는다(가 결정)');
  assert.equal(result.state.trees.find(tree => tree.id === 't-inbox').moments.length, 1, '첫 트리는 그대로');
  assert.deepEqual(validateState(result.state), result.state);
});

test('#638-1 treeId가 없거나 찾지 못하면 기존 규칙(inbox)으로 물러난다', () => {
  const without = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45' });
  assert.equal(without.treeId, 't-inbox');
  const unknown = quickAdd(stateWithTwoTrees, { url: 'https://youtu.be/abc123DEF45', treeId: 't-missing' });
  assert.equal(unknown.treeId, 't-inbox');
});

test('#638-1 트리가 0개면 treeId가 있어도 기본 트리(모아둔 순간)를 새로 만든다', () => {
  const result = quickAdd({ version: 1, trees: [], prefs: {} }, { url: 'https://youtu.be/abc123DEF45', treeId: 't-second' });
  assert.equal(result.state.trees.length, 1);
  assert.equal(result.state.trees[0].inbox, true);
  assert.equal(result.state.trees[0].subject, QUICK_INBOX_LABEL);
  assert.equal(result.treeId, result.state.trees[0].id);
});

test('#638-2 backfillTitles(cacheMomentMediaMetadata)는 title을 건드리지 않는다 — 사용자 제목 보호', () => {
  const grown = cacheMomentMediaMetadata(inboxTree, 's0', 'https://youtu.be/abc123DEF45', { title: '영상 제목' });
  const moment = grown.moments.find(m => m.id === 's0');
  assert.equal(moment.title, '첫 순간', '제목은 그대로');
  assert.equal(moment.mediaMetadata.title, '영상 제목');
  const userWritten = { ...inboxTree, moments: [{ ...inboxTree.moments[0], title: '내가 쓴 제목' }] };
  const kept = cacheMomentMediaMetadata(userWritten, 's0', 'https://youtu.be/abc123DEF45', { title: '영상 제목' });
  assert.equal(kept.moments.find(m => m.id === 's0').title, '내가 쓴 제목');
});

// ---- ③ 지도 월 묶음: NaN 없음 ----
globalThis.window = globalThis;
await import('../public/v41/views/network/network-model.js');
const M = globalThis.LT56Model;

test('#638-3 월 묶음 이름은 실제 기록 날짜(YYYY-MM-DD)에서도 NaN이 없다', () => {
  const moments = [
    { id: 'a', date: '2026-11-03', emotion: '설렘' },
    { id: 'b', date: '2026-11-15', emotion: '설렘' },
    { id: 'c', date: '2026-12-01', emotion: '몰입' },
    { id: 'd', date: '2027-01-09', emotion: '그리움' }
  ];
  const groups = M.monthGroups(moments);
  assert.deepEqual(groups.map(group => group.name), ['2026년 11월', '2026년 12월', '2027년 1월']);
  for (const group of groups) {
    assert.doesNotMatch(group.name, /NaN|undefined/);
  }
  assert.deepEqual(groups.map(group => group.ids.length), [2, 1, 1]);
});

test('#638-3 예시 판본(YYYY.MM.DD)과 실제 기록(YYYY-MM-DD)이 섞여도 같은 월로 묶인다', () => {
  const groups = M.monthGroups([
    { id: 'a', date: '2026.11.05', emotion: '설렘' },
    { id: 'b', date: '2026-11-20', emotion: '몰입' }
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, '2026년 11월');
  assert.deepEqual(groups[0].ids, ['a', 'b']);
});

test('#638-3 월이 여섯 개를 넘으면 이어 붙이는데도 NaN이 없다', () => {
  const moments = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, date: `2026-${String(i + 1).padStart(2, '0')}-10`, emotion: '설렘' }));
  const groups = M.monthGroups(moments);
  assert.ok(groups.length <= 6);
  for (const group of groups) assert.doesNotMatch(group.name, /NaN|undefined/);
});

// ---- ① 쉬운 추가 화면: 트리 한 줄·저장 배정·제목 경합 ----
const URL_OK = 'https://m.youtube.com/watch?v=abc12345678&t=76&si=xyz';
const VIDEO_TITLE = '테스트 영상 제목';

function harness({ trees = [inboxTree, secondTree], currentTreeId = 't-second', applyImpl = null, fetchImpl = null } = {}) {
  const calls = { apply: [], notify: [] };
  const els = {};
  const $ = id => { if (!els[id]) els[id] = fakeEl({ value: '', children: [], replaceChildren(...kids) { this.children = kids; }, append(...kids) { this.children.push(...kids); } }); return els[id]; };
  els['write-panel'] = fakeEl({ value: '', children: [], open: false, replaceChildren(...kids) { this.children = kids; }, append(...kids) { this.children.push(...kids); } });
  const doc = { createElement: tag => fakeEl({ tagName: tag, value: '', children: [], replaceChildren(...kids) { this.children = kids; }, append(...kids) { this.children.push(...kids); } }) };
  els['moment-form'] = fakeEl({ elements: { url: fakeEl() } });
  const member = {
    snapshot: () => ({ owned: true, writable: true, subject: 'sub_test0003' }),
    apply: (...args) => { calls.apply.push(args); if (applyImpl) return applyImpl(...args); return { treeId: currentTreeId || 't-inbox', momentId: 'm-new' }; },
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
    openEditor: () => {},
    resetEditorBaseline: () => {},
    openLoginStart: () => {},
    writePanel: { open: () => { els['write-panel'].open = true; } },
    requestClose: () => {},
    currentTreeId: () => currentTreeId,
    listTrees: () => trees,
    isFinePointer: () => false,
    fetchImpl: titleFetch
  });
  return { api, els, calls, resolveTitle: value => resolveTitle(value) };
}

test('#638-1 담기 창은 고른 트리 이름을 한 줄 보이고, 그 자리에서 바꿀 수 있다', () => {
  const h = harness();
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

test('#638-1 두 번째 트리를 고른 상태에서 담으면 그 트리로 저장 입력을 보낸다', () => {
  const h = harness();
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second' }]);
});

test('#638-1 트리가 0개면 기본 트리 문구를 보이고 treeId를 보내지 않는다', () => {
  const h = harness({ trees: [], currentTreeId: '' });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText(QUICK_INBOX_LABEL));
  assert.equal(h.els['quick-tree-select'].hidden, true, '트리가 없으면 고를 것도 없다');
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK }], '기존 규칙(기본 트리 생성)으로 저장한다');
});

test('#638-1 트리가 하나뿐이면 고르기를 숨기고 그 트리 이름을 보인다', () => {
  const h = harness({ trees: [inboxTree], currentTreeId: 't-inbox' });
  h.api.openQuick();
  assert.equal(h.els['quick-tree-select'].hidden, true);
  assert.equal(h.els['quick-tree-line'].textContent, quickTreeLineText(QUICK_INBOX_LABEL));
});

test('#638-2 제목이 늦게 도착하면 방금 담은 순간의 영상 제목을 채운다(backfillTitles)', async () => {
  const h = harness();
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview(); // 미리보기 때 제목 요청이 나간다(아직 응답 전)
  h.api.submitQuick({ preventDefault() {} }); // 제목을 못 받은 채 담는다 — 기본 문구로 저장됨
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second' }]);
  assert.equal(h.calls.apply.length, 1, '제목이 오기 전에는 채우는 저장이 없다');
  h.resolveTitle(VIDEO_TITLE); // oEmbed 응답이 도착한다
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.apply.length, 2, '제목이 도착하면 한 번 더 저장한다');
  assert.deepEqual(h.calls.apply[1], ['backfillTitles', { items: [{ treeId: 't-second', momentId: 'm-new', url: URL_OK, mediaMetadata: { title: VIDEO_TITLE } }] }]);
});

test('#638-2 제목을 받아 둔 뒤 담으면 mediaMetadata가 저장 입력에 함께 간다(채움 저장 없음)', async () => {
  const h = harness({ fetchImpl: async () => ({ ok: true, json: async () => ({ title: VIDEO_TITLE }) }) });
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  h.api.submitQuick({ preventDefault() {} });
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second', mediaMetadata: { title: VIDEO_TITLE } }]);
  assert.equal(h.calls.apply.length, 1);
});

test('#638-2 끌어다 놓기로 바로 담았을 때도(미리보기 요청이 없어도) 제목이 오면 채운다', async () => {
  const h = harness();
  h.api.saveUrl(URL_OK); // 미리보기 없이 바로 담는다
  assert.deepEqual(h.calls.apply[0], ['quickAdd', { url: URL_OK, treeId: 't-second' }]);
  h.resolveTitle(VIDEO_TITLE);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.apply.length, 2);
  assert.equal(h.calls.apply[1][0], 'backfillTitles');
});

test('#638-2 담은 안내(떠 있는 알림)도 담긴 트리 이름을 따른다', () => {
  const h = harness();
  h.els['quick-url'].value = URL_OK;
  h.api.renderPreview();
  h.api.submitQuick({ preventDefault() {} });
  assert.equal(h.els['quick-saved-text'].textContent, quickSavedTreeText('두 번째 트리'));
});
