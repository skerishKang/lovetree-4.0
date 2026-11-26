// #480 M8: 정리 창(순간 정리)도 다른 창과 같이 '쓰다 만 입력'이 있으면 닫을 때 한 번 묻는다.
// 전: 정리 창은 공통 닫기 틀(PANEL_DIRTY)에 없어서 새 트리 이름을 적거나 순간을 골라 둔 채
//     Esc·바깥 클릭·× 로 닫아도 묻지 않고 그대로 닫혔다(입력이 조용히 사라짐).
// 후: 새 트리 이름을 적었거나, 순간 고름·옮길 트리가 창을 열 때와 달라졌으면 "저장하지 않고 닫을까요?"를 한 번 묻는다.
//     순간 상세의 '옮기기'로 열 때 미리 골라진 순간은 '쓰다 만 입력'이 아니다 — 열자마자 닫아도 묻지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCleanup } from '../public/v41/shell/cleanup.mjs';
import { createDialogs } from '../public/v41/shell/dialogs.mjs';
import { organizeMoments, undoOrganize, validateState } from '../public/v41/domain.mjs';

function fakeElement(props = {}) {
  const el = {
    id: props.id || '', open: false, hidden: false, disabled: false, value: '', textContent: '',
    dataset: {}, children: [], listeners: {},
    // 정리 창은 그리면서 classList·style·className·type을 만진다(실제 DOM과 같은 정도로 갖춘다).
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: { setProperty() {}, removeProperty() {} },
    className: '', type: '',
    addEventListener(type, fn) { (el.listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    dispatch(type) { for (const fn of el.listeners[type] || []) fn({target: el}); },
    setAttribute() {}, getAttribute() { return null; },
    replaceChildren(...kids) { el.children = kids; },
    append(...kids) { el.children.push(...kids); },
    close() { el.open = false; el.listeners.close?.(); },
    showModal() { el.open = true; },
    focus() {}, matches() { return false; },
    getClientRects() { return [{}]; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100 }; },
    querySelectorAll() { return el.checks || []; },
    ...props
  };
  return el;
}

const tree = { id: 'tree1', title: '윤슬', moments: [{ id: 'm1', title: '첫 순간' }, { id: 'm2', title: '둘째 순간' }] };

function harness({ confirmAnswer = true } = {}) {
  const saved = {};
  for (const key of ['window', 'document', 'confirm']) { saved[key] = globalThis[key]; delete globalThis[key]; }
  const els = {};
  const confirms = [];
  const applied = [];
  globalThis.confirm = (text) => { confirms.push(text); return confirmAnswer; };
  globalThis.window = { LT41: { tree, momentId: 'm1' } };
  globalThis.document = { createElementNS: (ns, tag) => ({ tagName: String(tag), namespaceURI: String(ns), attrs: {}, children: [], setAttribute(n,v){this.attrs[n]=String(v)}, getAttribute(n){return this.attrs[n]??null}, append(...k){this.children.push(...k)}, querySelector(){return null}, querySelectorAll(){return []} }), 
    createElement: (tag) => fakeElement({ tagName: tag.toUpperCase() }),
    getElementById: (id) => (els[id] ||= fakeElement({ id })),
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const get = (id) => {
    const el = (els[id] ||= fakeElement({ id }));
    // 고른 순간: DOM의 input:checked 대신 el.checks(체크된 상자 목록)로 흉내낸다.
    // 실제 DOM의 'input:checked'처럼, 행(label) 안에 든 상자를 찾아 지금 체크된 것만 돌려준다.
    if (id === 'cleanup-moments') el.querySelectorAll = () => (el.children || []).flatMap((row) => row.children || []).filter((n) => n.tagName === 'INPUT' && n.checked);
    return el;
  };
  const cleanup = createCleanup({
    $: get,
    getMember: () => ({ snapshot: () => ({ owned: true, writable: true }), apply: (action, input) => { applied.push([action, input]); return { treeId: 'made' }; } }),
    getSource: () => 'server',
    getTrees: () => [tree, { id: 'tree2', title: '다른 트리', moments: [] }],
    choose: () => {}, notify: () => {}, panel: (id) => get(id).showModal(),
    treeMomentThumb: () => '', thumbCandidatesOf: () => [], fallbackCardOf: () => null, emotionToneOf: () => 'tone'
  });
  const dialogs = createDialogs({
    $: get,
    closeTreeTips: () => {}, closeAccountMenu: () => {},
    isCleanupDirty: () => cleanup.dirty(),
    notify: () => {}
  });
  return {
    els, get, confirms, applied, cleanup, dialogs,
    // 사용자가 순간 상자를 누른 것과 같다(그린 행 안의 상자를 켜고 끈다).
    pick(ids) {
      const host = get('cleanup-moments');
      for (const row of host.children || []) {
        for (const box of row.children || []) {
          if (box.tagName === 'INPUT') box.checked = ids.includes(box.value);
        }
      }
      cleanup.sync();
    },
    // #1439: 대상 트리 고르기 칸을 켜고 끈다(사용자가 트리 줄을 누른 것과 같다).
    pickTargets(ids) {
      for (const row of get('cleanup-targets').children || []) {
        for (const box of row.children || []) {
          if (box.tagName === 'INPUT') box.checked = ids.includes(box.value);
        }
      }
      cleanup.sync();
    },
    // 공통 틀을 지나 닫는다(×·Esc·바깥 클릭과 같은 경로).
    async closePanel() { return dialogs.closePanel ? dialogs.closePanel(get('cleanup-panel')) : null; },
    restore() { for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; } }
  };
}

test('정리 창: 새 트리 이름을 적으면 닫을 때 한 번 묻는다(전: 묻지 않고 닫힘)', () => {
  const h = harness({ confirmAnswer: false });
  try {
    h.cleanup.open({});
    assert.equal(h.confirms.length, 0, '열 때는 묻지 않는다');
    h.get('cleanup-new-name').value = '새 트리 이름';
    assert.equal(h.cleanup.dirty(), true, '이름을 적었으면 쓰다 만 입력이다');
  } finally { h.restore(); }
});

test('정리 창: 순간을 새로 고르면 쓰다 만 입력, 미리 골라진 순간만으로는 아니다', () => {
  const h = harness();
  try {
    // 순간 상세의 '옮기기'로 열면 그 순간이 미리 골라져 있다.
    h.cleanup.open({ momentId: 'm1' });
    h.pick(['m1']);
    assert.equal(h.cleanup.dirty(), false, '열 때 있던 고름은 그대로면 더럽지 않다(열자마자 닫아도 된다)');
    h.pick(['m1', 'm2']);
    assert.equal(h.cleanup.dirty(), true, '순간을 더 고르면 더럽다');
  } finally { h.restore(); }
});

test('정리 창: 옮길 트리를 바꾸면 더럽다', () => {
  const h = harness();
  try {
    h.cleanup.open({});
    assert.equal(h.cleanup.dirty(), false);
    // #1439: 대상 트리는 고르기 칸 목록이다(예전 드롭다운). 처음에는 아무 트리도 골라져 있지 않다.
    h.pickTargets(['tree2']);
    assert.equal(h.cleanup.dirty(), true);
    h.pickTargets([]);
    assert.equal(h.cleanup.dirty(), false, '고름을 풀면 창을 연 상태로 돌아온다');
  } finally { h.restore(); }
});

test('정리 창: 이름을 적었다 지우면 다시 깨끗해진다(창을 연 상태로 돌아옴)', () => {
  const h = harness();
  try {
    h.cleanup.open({});
    h.get('cleanup-new-name').value = '아무거나';
    assert.equal(h.cleanup.dirty(), true);
    h.get('cleanup-new-name').value = '   ';
    assert.equal(h.cleanup.dirty(), false, '공백만 남으면 되돌아온 것으로 본다');
  } finally { h.restore(); }
});

test('정리 창: 일을 마치고 닫을 때는 묻지 않는다(적용 뒤 baseline을 다시 잡는다)', () => {
  const h = harness();
  try {
    h.cleanup.open({});
    h.get('cleanup-new-name').value = '새 트리';
    h.pick(['m1']);
    assert.equal(h.cleanup.dirty(), true);
    // '새 트리로 만들기'를 누르면 적용하고 창을 닫는다.
    h.get('cleanup-create').listeners.click[0]();
    assert.deepEqual(h.applied.map(a => a[0]), ['treeFromMoments'], '서버에 적용했다');
    assert.equal(h.get('cleanup-panel').open, false, '창이 닫혔다');
    assert.equal(h.cleanup.dirty(), false, '일을 마쳤으니 더럽지 않다 — 닫을 때 묻지 않는다');
  } finally { h.restore(); }
});

// ── #644 1: 순간 상세의 '다른 트리로 옮기기' — 트리 목록에서 고르면 바로 옮긴다 ──
// 적용은 기존 member.apply('moveMoment') 한 길이고, 이 하네스는 상태를 실제로 바꾸어
// 옮김·되돌림이 기록(트리)에 반대되는지까지 본다.
function moveHarness({ moments = [{ id: 'm1', title: '첫 순간', parentId: null }, { id: 'm2', title: '둘째 순간', parentId: 'm1' }], others = [{ id: 'tree2', title: '다른 트리', moments: [{ id: 'x1', title: '다른 트리 시작', parentId: null }] }] } = {}) {
  const saved = {};
  for (const key of ['window', 'document']) { saved[key] = globalThis[key]; delete globalThis[key]; }
  const els = {};
  const applied = [], chosen = [], notices = [], panels = [];
  const state = { trees: [
    { id: 'tree1', title: '윤슬', moments: moments.map(m => ({ ...m })) },
    ...others.map(t => ({ ...t, moments: (t.moments || []).map(m => ({ ...m })) }))
  ] };
  globalThis.window = { LT41: { tree: state.trees[0], momentId: state.trees[0].moments[0].id } };
  globalThis.document = { createElementNS: (ns, tag) => ({ tagName: String(tag), namespaceURI: String(ns), attrs: {}, children: [], setAttribute(n,v){this.attrs[n]=String(v)}, getAttribute(n){return this.attrs[n]??null}, append(...k){this.children.push(...k)}, querySelector(){return null}, querySelectorAll(){return []} }), 
    createElement: (tag) => fakeElement({ tagName: tag.toUpperCase() }),
    getElementById: (id) => (els[id] ||= fakeElement({ id })),
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const member = {
    snapshot: () => ({ owned: true, writable: true }),
    apply: (action, input, selection, meta) => {
      applied.push([action, input, selection, meta]);
      if (action === 'moveMoment') {
        const from = state.trees.find(t => t.id === selection.treeId);
        const to = state.trees.find(t => t.id === input.toTreeId);
        const moving = from.moments.find(m => m.id === selection.momentId);
        from.moments = from.moments.filter(m => m.id !== moving.id);
        const attach = input.parentId || to.moments.find(m => m.parentId === null)?.id || null;
        to.moments = [...to.moments, { ...moving, parentId: attach }];
        if (!from.moments.length) state.trees = state.trees.filter(t => t.id !== from.id);
      }
      return { treeId: input.toTreeId, momentId: selection.momentId };
    }
  };
  const cleanup = createCleanup({
    $: id => { const el = els[id] ||= fakeElement({ id }); if (id === 'cleanup-target' && !el.selectedOptions) el.selectedOptions = [{ textContent: '' }]; return el; },
    getMember: () => member,
    getSource: () => 'server',
    getTrees: () => state.trees,
    choose: (id, momentId, skipShow) => chosen.push([id, momentId, skipShow]),
    notify: text => notices.push(text),
    panel: id => { panels.push(id); (els[id] ||= fakeElement({ id })).showModal(); },
    treeMomentThumb: () => '', thumbCandidatesOf: () => [], fallbackCardOf: () => null, emotionToneOf: () => 'tone'
  });
  return {
    els, applied, chosen, notices, panels, cleanup, state,
    pickerButtons: () => (els['move-picker-list']?.children || []),
    restore() { for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; } }
  };
}

test('#644 옮기기: 상세의 옮기기는 다른 트리 목록을 보리고, 지금 트리는 뺀다', () => {
  const h = moveHarness();
  try {
    assert.equal(h.cleanup.openMove({ momentId: 'm1' }), true);
    assert.ok(h.panels.includes('move-picker'), '옮기기 목록 창을 연다');
    assert.deepEqual(h.pickerButtons().map(b => b.textContent), ['다른 트리'], '지금 트리는 목록에 없다');
  } finally { h.restore(); }
});

test('#644 옮기기: 고르면 바로 옮겨지고(대상 트리에 들어가고 원래 트리에서 빠진다) 안내가 뜬다', () => {
  const h = moveHarness();
  try {
    h.cleanup.openMove({ momentId: 'm2' });
    h.pickerButtons()[0].dispatch('click');
    assert.deepEqual(h.applied[0], ['moveMoment', { toTreeId: 'tree2' }, { treeId: 'tree1', momentId: 'm2' }, undefined], '기존 moveMoment 한 길(다른 트리는 모델 전용 아님)');
    assert.deepEqual(h.chosen, [['tree2', 'm2', undefined]], '옮겨진 트리의 그 순간을 보여 준다');
    const inTarget = h.state.trees.find(t => t.id === 'tree2').moments.some(m => m.id === 'm2');
    const outOfFrom = !h.state.trees.find(t => t.id === 'tree1').moments.some(m => m.id === 'm2');
    assert.equal(inTarget && outOfFrom, true, '대상 트리에 들어가고 원래 트리에서 빠진다');
    assert.match(h.els['move-message'].textContent, /다른 트리로 옮겼어요\./);
    assert.equal(h.els['move-actions'].children[0].textContent, '되돌리기');
  } finally { h.restore(); }
});

test('#644 되돌리기: 원래 트리의 원래 부모 아래로 돌린다', () => {
  const h = moveHarness();
  try {
    h.cleanup.openMove({ momentId: 'm2' });
    h.pickerButtons()[0].dispatch('click');
    h.els['move-actions'].children[0].onclick();
    assert.deepEqual(h.applied[1], ['moveMoment', { toTreeId: 'tree1', parentId: 'm1' }, { treeId: 'tree2', momentId: 'm2' }, { moment: true }], '원래 부모(m1) 아래로, 모델만 갱신');
    const back = h.state.trees.find(t => t.id === 'tree1').moments.find(m => m.id === 'm2');
    assert.equal(back.parentId, 'm1', '원래 자리(원래 부모 아래)로 돌아온다');
    assert.equal(h.els['move-feedback'].hidden, true, '안내를 거둔다');
    assert.deepEqual(h.chosen, [['tree2', 'm2', undefined]], '되돌리기는 지금 보기에 머문다(화면 다시 띄우지 않음)');
  } finally { h.restore(); }
});

test('#644 옮기기: 트리가 하나뿐이면 목록 대신 새 트리 만들어 옮기기(정리 창)를 연다', () => {
  const h = moveHarness({ moments: [{ id: 'm1', title: '첫 순간', parentId: null }], others: [] });
  try {
    assert.equal(h.cleanup.openMove({ momentId: 'm1' }), true);
    assert.equal(h.panels.includes('move-picker'), false, '목록은 열지 않는다');
  } finally { h.restore(); }
});

test('#644 되돌리기: 원래 트리가 사라졌으면(비어 지워졌으면) 되돌리기 없이 안내만 띄운다', () => {
  const h = moveHarness({ moments: [{ id: 'm1', title: '첫 순간', parentId: null }] });  try {
    h.cleanup.openMove({ momentId: 'm1' });
    h.pickerButtons()[0].dispatch('click');
    assert.equal(h.state.trees.some(t => t.id === 'tree1'), false, '빈 트리는 지워진다(domain 규칙)');
    assert.match(h.els['move-message'].textContent, /옮겼어요\./);
    assert.equal(h.els['move-actions'].children.length, 0, '되돌릴 길이 없으면 단추를 놓지 않는다');
  } finally { h.restore(); }
});

// ── #1439: 순간 정리 창의 복사하기·같은 순간 알림·되돌리기 ──
// 적용은 실제 도메인 함수(organizeMoments·undoOrganize)로 상태를 바꿔, 창 배선과 기록 결과를 함께 본다.

const CLOCK = '2026-11-26T10:00:00.000Z';
const ytUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
function organizeState() {
  const m = (id, parentId, extra = {}) => ({ id, parentId, links: [], title: '순간 ' + id, note: '메모 ' + id, emotion: '설렘', date: '2026-11-20', relation: parentId ? '이유 ' + id : '', url: '', createdAt: `2026-11-2${extra.seq || 0}T09:00:00.000Z`, ...extra.fields });
  const t = (id, title, moments) => ({ id, subject: title, title, coverMomentId: '', coverDesign: '', createdAt: CLOCK, updatedAt: CLOCK, moments });
  return validateState({ version: 1, trees: [
    t('tree1', '모아둔 순간', [m('m1', null), m('m2', 'm1', { seq: 1, fields: { url: ytUrl, startSeconds: 30 } }), m('m3', 'm1', { seq: 2 })]),
    t('tree2', '빌리 하루나', [m('x1', null, { fields: { url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 30 } })]),
    t('tree3', '윤슬', [m('y1', null, { fields: { url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 90 } })]),
  ] });
}
function organizeHarness({ answers = [] } = {}) {
  const saved = {};
  for (const key of ['window', 'document']) { saved[key] = globalThis[key]; delete globalThis[key]; }
  const els = {};
  const box = { state: organizeState() };
  const applied = [], asked = [], notices = [];
  let n = 0;
  globalThis.window = { LT41: { tree: box.state.trees[0], momentId: 'm1' } };
  globalThis.document = { createElement: (tag) => fakeElement({ tagName: tag.toUpperCase() }), getElementById: (id) => (els[id] ||= fakeElement({ id })), querySelectorAll: () => [], addEventListener() {} };
  const get = (id) => {
    const el = (els[id] ||= fakeElement({ id }));
    if (id === 'cleanup-moments') el.querySelectorAll = () => (el.children || []).flatMap((row) => row.children || []).filter((node) => node.tagName === 'INPUT' && node.checked);
    return el;
  };
  const member = {
    snapshot: () => ({ owned: true, writable: true }),
    apply: (action, input, selection, meta) => {
      applied.push([action, structuredClone(input), selection, meta]);
      if (action === 'organizeMoments') {
        const done = organizeMoments(box.state, { ...input, fromTreeId: selection.treeId }, CLOCK, () => `copy${++n}`);
        box.state = done.state;
        return { treeId: done.treeId, record: done.record, summary: done.summary };
      }
      if (action === 'undoOrganize') { const back = undoOrganize(box.state, input.record, CLOCK); box.state = back.state; return { treeId: back.treeId, exact: back.exact }; }
      throw new Error('예상하지 못한 작업: ' + action);
    }
  };
  // '이미 있음' 물음 창(#876 창을 같이 쓴다): 정해 둔 답을 차례로 누른다.
  const sameMoment = { open(info) { asked.push(info); const answer = answers.shift() || 'put'; if (answer === 'put') info.onContinue(); else if (answer === 'skip') info.onSkip(); else info.onCancel(); } };
  const cleanup = createCleanup({
    $: get, getMember: () => member, getSource: () => 'server', getTrees: () => box.state.trees,
    choose: () => {}, notify: (text) => notices.push(text), panel: (id) => get(id).showModal(), sameMoment,
    treeMomentThumb: () => '', thumbCandidatesOf: () => [], fallbackCardOf: () => null, emotionToneOf: () => 'tone'
  });
  const rows = (id) => (get(id).children || []);
  const check = (id, values) => { for (const row of rows(id)) for (const node of row.children || []) if (node.tagName === 'INPUT') node.checked = values.includes(node.value); cleanup.sync(); };
  return {
    box, els, get, applied, asked, notices, cleanup,
    pick: (ids) => check('cleanup-moments', ids),
    targets: (ids) => check('cleanup-targets', ids),
    badges: () => rows('cleanup-targets').map((row) => [row.children[0].value, row.children[2].hidden ? '' : row.children[2].textContent]),
    click: async (id) => { for (const fn of get(id).listeners.click || []) await fn(); await new Promise((r) => setImmediate(r)); },
    restore() { for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; } }
  };
}

test('#1439 정리 창: 옮기기 옆에 복사하기 — 옮기기는 트리 하나, 복사는 여러 트리', () => {
  const h = organizeHarness();
  try {
    h.cleanup.open({});
    assert.deepEqual(h.badges().map((b) => b[0]), ['tree2', 'tree3'], '지금 트리는 대상에서 빠진다');
    h.pick(['m3']);
    h.targets(['tree2']);
    assert.equal(h.get('cleanup-move').disabled, false);
    assert.equal(h.get('cleanup-move').textContent, '빌리 하루나로 옮기기');
    assert.equal(h.get('cleanup-copy').textContent, '빌리 하루나에 복사하기');
    h.targets(['tree2', 'tree3']);
    assert.equal(h.get('cleanup-move').disabled, true, '두 트리면 옮기기는 막힌다');
    assert.equal(h.get('cleanup-copy').disabled, false);
    assert.equal(h.get('cleanup-copy').textContent, '트리 2곳에 복사하기');
    assert.match(h.get('cleanup-target-hint').textContent, /트리 하나만/);
  } finally { h.restore(); }
});

test('#1439 여러 순간을 여러 트리에 한 번에 복사하고, 되돌리기로 사본을 모두 거둔다', async () => {
  const h = organizeHarness();
  try {
    const before = structuredClone(h.box.state);
    h.cleanup.open({});
    h.pick(['m1', 'm3']);
    h.targets(['tree2', 'tree3']);
    await h.click('cleanup-copy');
    assert.equal(h.asked.length, 0, '같은 순간이 없으면 묻지 않는다');
    assert.deepEqual(h.applied[0].slice(0, 3), ['organizeMoments', { mode: 'copy', momentIds: ['m1', 'm3'], toTreeIds: ['tree2', 'tree3'], skip: {} }, { treeId: 'tree1' }]);
    assert.deepEqual(h.applied[0][3], { tree: true }, '지금 트리는 그대로라 화면을 다시 띄우지 않는다');
    for (const id of ['tree2', 'tree3']) assert.deepEqual(h.box.state.trees.find((t) => t.id === id).moments.filter((m) => m.copiedFrom).map((m) => m.copiedFrom), ['m1', 'm3']);
    assert.equal(h.get('cleanup-panel').open, false, '창을 닫는다');
    assert.equal(h.els['move-message'].textContent, '트리 2곳에 2개 복사했어요.');
    assert.equal(h.els['move-feedback'].hidden, false);
    const undo = h.els['move-actions'].children[0];
    assert.equal(undo.textContent, '되돌리기');
    undo.onclick();
    assert.equal(h.applied[1][0], 'undoOrganize');
    assert.deepEqual(h.box.state, before, '복사 전과 같다');
    assert.equal(h.els['move-feedback'].hidden, true, '안내를 거둔다');
  } finally { h.restore(); }
});

test('#1439 이미 있음: 같은 영상·같은 시작 초가 있는 트리에만 미리 붙고, 시작 초가 다르면 붙지 않는다', () => {
  const h = organizeHarness();
  try {
    h.cleanup.open({});
    assert.deepEqual(h.badges(), [['tree2', ''], ['tree3', '']], '순간을 고르기 전에는 없다');
    h.pick(['m2']);
    assert.deepEqual(h.badges(), [['tree2', '이미 있음'], ['tree3', '']], 'tree3은 같은 영상이지만 시작 초가 달라 다른 순간');
    h.pick(['m2', 'm3']);
    assert.deepEqual(h.badges(), [['tree2', '이미 있음 1개'], ['tree3', '']], '여러 개 중 일부면 그 수');
  } finally { h.restore(); }
});

test('#1439 이미 있음 → 그래도 넣기는 넣고, 건너뛰기는 그 트리에서 그 순간만 뺀다', async () => {
  const put = organizeHarness({ answers: ['put'] });
  try {
    put.cleanup.open({});
    put.pick(['m2', 'm3']);
    put.targets(['tree2']);
    await put.click('cleanup-copy');
    assert.equal(put.asked.length, 1, '한 번 묻는다');
    assert.equal(put.asked[0].noun, '영상');
    assert.match(put.asked[0].detail, /'빌리 하루나' 트리 · 고른 2개 중 1개가 이미 있어요/);
    assert.equal(put.asked[0].showView, false, '정리에서는 그 순간 보기를 숨긴다');
    assert.deepEqual(put.applied[0][1].skip, {}, '그래도 넣기');
    assert.equal(put.els['move-message'].textContent, '빌리 하루나에 2개 복사했어요.');
  } finally { put.restore(); }
  const skip = organizeHarness({ answers: ['skip'] });
  try {
    skip.cleanup.open({});
    skip.pick(['m2', 'm3']);
    skip.targets(['tree2', 'tree3']);
    await skip.click('cleanup-copy');
    assert.equal(skip.asked.length, 1, '이미 있는 트리에만 묻는다(시작 초가 다른 tree3은 묻지 않는다)');
    assert.deepEqual(skip.applied[0][1].skip, { tree2: ['m2'] });
    assert.deepEqual(skip.box.state.trees.find((t) => t.id === 'tree2').moments.filter((m) => m.copiedFrom).map((m) => m.copiedFrom), ['m3']);
    assert.deepEqual(skip.box.state.trees.find((t) => t.id === 'tree3').moments.filter((m) => m.copiedFrom).map((m) => m.copiedFrom), ['m2', 'm3']);
    assert.equal(skip.els['move-message'].textContent, '트리 2곳에 2개 복사했어요. 이미 있는 1개는 건너뛰었어요.');
  } finally { skip.restore(); }
});

test('#1439 이미 있음 물음을 닫으면(×·Esc) 아무것도 하지 않고, 모두 건너뛰면 바뀐 것이 없다고 알린다', async () => {
  const cancel = organizeHarness({ answers: ['cancel'] });
  try {
    cancel.cleanup.open({});
    cancel.pick(['m2']);
    cancel.targets(['tree2']);
    await cancel.click('cleanup-move');
    assert.equal(cancel.applied.length, 0, '적용하지 않는다');
    assert.equal(cancel.get('cleanup-panel').open, true, '창은 그대로');
    assert.equal(cancel.get('cleanup-move').disabled, false, '다시 누를 수 있다');
  } finally { cancel.restore(); }
  const all = organizeHarness({ answers: ['skip'] });
  try {
    all.cleanup.open({});
    all.pick(['m2']);
    all.targets(['tree2']);
    await all.click('cleanup-copy');
    assert.equal(all.applied.length, 0);
    assert.match(all.get('cleanup-error').textContent, /바뀐 것이 없어요/);
  } finally { all.restore(); }
});

test('#1439 여러 순간 옮기기 → 되돌리기: 원래 트리·원래 자리로 통째로', async () => {
  const h = organizeHarness();
  try {
    const before = structuredClone(h.box.state);
    h.cleanup.open({});
    h.pick(['m1', 'm3']);
    h.targets(['tree3']);
    await h.click('cleanup-move');
    assert.deepEqual(h.applied[0][1], { mode: 'move', momentIds: ['m1', 'm3'], toTreeIds: ['tree3'], skip: {} });
    assert.equal(h.applied[0][3], undefined, '옮기기는 지금 트리가 바뀌므로 화면을 다시 그린다');
    assert.deepEqual(h.box.state.trees.find((t) => t.id === 'tree1').moments.map((m) => m.id), ['m2'], '두 순간이 빠진다');
    assert.equal(h.els['move-message'].textContent, '윤슬로 2개 옮겼어요.');
    h.els['move-actions'].children[0].onclick();
    assert.deepEqual(h.box.state, before, '원래 부모·순서·시작 순간까지 처음 모습');
    assert.match(h.notices.at(-1), /원래 자리로 돌렸어요/);
  } finally { h.restore(); }
});

test('#1439 안내 줄은 공통 타이머(#1273)로 단추 있으면 8초, 마우스를 올리면 멈춘다', async () => {
  const h = organizeHarness();
  try {
    h.cleanup.open({});
    h.pick(['m3']);
    h.targets(['tree2']);
    await h.click('cleanup-copy');
    const bar = h.els['move-feedback'];
    assert.equal(typeof globalThis.LTToastTimer?.createToastTimer, 'function', '공통 타이머 한 벌을 불러 쓴다');
    assert.equal(globalThis.LTToastTimer.ACTION_TOAST_MS, 8000);
    assert.ok((bar.listeners.mouseenter || []).length > 0 && (bar.listeners.focusin || []).length > 0, '올리면 멈추는 고리가 걸린다');
    h.els['move-actions'].children[0].onclick();
  } finally { h.restore(); }
});
