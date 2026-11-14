// #480 M8: 정리 창(순간 정리)도 다른 창과 같이 '쓰다 만 입력'이 있으면 닫을 때 한 번 묻는다.
// 전: 정리 창은 공통 닫기 틀(PANEL_DIRTY)에 없어서 새 트리 이름을 적거나 순간을 골라 둔 채
//     Esc·바깥 클릭·× 로 닫아도 묻지 않고 그대로 닫혔다(입력이 조용히 사라짐).
// 후: 새 트리 이름을 적었거나, 순간 고름·옮길 트리가 창을 열 때와 달라졌으면 "저장하지 않고 닫을까요?"를 한 번 묻는다.
//     순간 상세의 '옮기기'로 열 때 미리 골라진 순간은 '쓰다 만 입력'이 아니다 — 열자마자 닫아도 묻지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCleanup } from '../public/v41/shell/cleanup.mjs';
import { createDialogs } from '../public/v41/shell/dialogs.mjs';

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
  globalThis.document = {
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
    // <select>처럼 지금 고른 항목을 읽는다(sync가 targetLabel을 만든다).
    if (id === 'cleanup-target' && !el.selectedOptions) el.selectedOptions = [{ textContent: '다른 트리' }];
    if (id === 'cleanup-target') el.value ||= '';
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
    h.get('cleanup-target').value = 'tree2';
    assert.equal(h.cleanup.dirty(), true);
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

test('공통 틀 배선: 정리 창이 PANEL_DIRTY에 들어 있고 셸이 판정을 넘긴다', async () => {
  const fs = await import('node:fs');
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const dialogs = read('public/v41/shell/dialogs.mjs');
  const shell = read('public/v41/shell.mjs');
  const cleanup = read('public/v41/shell/cleanup.mjs');
  assert.match(dialogs, /PANEL_DIRTY\['cleanup-panel'\] = \(\) => deps\.isCleanupDirty\?\.\(\) === true;/);
  assert.match(shell, /isCleanupDirty:\(\)=>shellCleanup\.dirty\(\),/);
  // 열 때의 상태를 기억하고, 마쳤을 때 다시 잡는다.
  assert.match(cleanup, /let baseState = \{ picked: '', name: '', target: '' \};/);
  assert.match(cleanup, /baseState = readState\(\);\s*\n\s*sync\(\);\s*\n\s*panel\('cleanup-panel'\);/);
  assert.match(cleanup, /baseState = readState\(\);\s*\n\s*\$\('cleanup-panel'\)\.close\(\);/);
  // 반환 모양(open·openMove…)은 소스 글자 대신 동작 시험으로 본다 — #644 옮기기 함수 시험.
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
  globalThis.document = {
    createElement: (tag) => fakeElement({ tagName: tag.toUpperCase() }),
    getElementById: (id) => (els[id] ||= fakeElement({ id })),
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const member = {
    snapshot: () => ({ owned: true, writable: true }),
    apply: (action, input, selection) => {
      applied.push([action, input, selection]);
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
    choose: (id, momentId) => chosen.push([id, momentId]),
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
    assert.deepEqual(h.applied[0], ['moveMoment', { toTreeId: 'tree2' }, { treeId: 'tree1', momentId: 'm2' }], '기존 moveMoment 한 길');
    assert.deepEqual(h.chosen, [['tree2', 'm2']], '옮겨진 트리의 그 순간을 보여 준다');
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
    assert.deepEqual(h.applied[1], ['moveMoment', { toTreeId: 'tree1', parentId: 'm1' }, { treeId: 'tree2', momentId: 'm2' }], '원래 부모(m1) 아래로');
    const back = h.state.trees.find(t => t.id === 'tree1').moments.find(m => m.id === 'm2');
    assert.equal(back.parentId, 'm1', '원래 자리(원래 부모 아래)로 돌아온다');
    assert.equal(h.els['move-feedback'].hidden, true, '안내를 거둔다');
    assert.deepEqual(h.chosen.at(-1), ['tree1', 'm2'], '원래 트리로 되돌아가 본다');
  } finally { h.restore(); }
});

test('#644 옮기기: 트리가 하나뿐이면 목록 대신 새 트리 만들어 옮기기(정리 창)를 연다', () => {
  const h = moveHarness({ moments: [{ id: 'm1', title: '첫 순간', parentId: null }], others: [] });
  try {
    assert.equal(h.cleanup.openMove({ momentId: 'm1' }), true);
    assert.ok(h.panels.includes('cleanup-panel'), '기존 정리 창(treeFromMoments 길)을 연다');
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
