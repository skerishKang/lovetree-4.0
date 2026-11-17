// #627 PR B: 꼬리표 정리 창 — 트리 메뉴의 기존 '정리' 옆에 두는 입구 한 곳.
// 계산은 tag-model.mjs 한 벌을 쓰고, 여기서는 읽기·그리기·누르기만 한다. 저장은 tag-save.mjs가
// 기존 워크스페이스 저장 경로(boardSync)로 keywords만 바꾼다(새 저장 경로·서버 변경 없음).
// 이름 바꾸기·합치기는 모든 순간에 반영되고, 옛 keywords(종류 표시 없는 것)도 하나의 꼬리표로 센다.
import { tagInventory, renamedMoments, mergedMoments, suggestForTree, momentsWithAddedTags, chipText } from '../tag-model.mjs';

const TOO_LONG_TEXT = '24자를 넘어요';

export function createTagManager(deps) {
  const $ = deps.$;
  const getMember = deps.getMember;
  const getSource = deps.getSource;
  const notify = deps.notify;
  const panel = deps.panel;
  const saveMoments = deps.saveMoments;
  let treeId = '';
  let editing = '';   // 이름 바꾸기를 펼친 꼬리표
  let merging = '';   // 합치기를 펼친 꼬리표
  let picked = new Set(); // 제안에서 확인한 것('순간\0꼬리표')

  function writable() {
    const snap = getMember()?.snapshot();
    return !!snap?.owned && !!snap?.writable;
  }
  function tree() { return window.LT41?.tree || null; }
  function fail(message) { $('tag-error').textContent = message || ''; }

  // 입구는 트리 ▾ 드롭다운의 '꼬리표 정리' 한 곳이다(기존 '정리' 옆).
  function open(opts = {}) {
    if (getSource() !== 'server' || !writable()) { notify('내 기록을 불러온 뒤 꼬리표를 정리할 수 있어요.'); return false; }
    const current = tree();
    if (!current) { notify('트리를 먼저 불러와 주세요.'); return false; }
    treeId = current.id;
    editing = ''; merging = ''; picked = new Set();
    render();
    panel('tag-panel');
    if (opts.suggest === true && !$('tag-suggest-box').hidden) onSuggest();
    return true;
  }

  function render() {
    const current = tree();
    if (!current || current.id !== treeId) return;
    const groups = tagInventory(current);
    $('tag-desc').textContent = groups.length
      ? `이 트리에서 쓴 꼬리표 ${groups.length}종이에요. 이름을 바꾸면 모든 순간에 반영돼요.`
      : '아직 꼬리표가 없어요. 아래에서 제목으로 꼬리표를 제안받아 붙일 수 있어요.';
    const host = $('tag-list');
    host.replaceChildren();
    if (!groups.length) {
      const empty = document.createElement('p');
      empty.className = 'tag-suggest-empty';
      empty.textContent = '아직 꼬리표가 없어요.';
      host.append(empty);
    }
    for (const g of groups) {
      const row = document.createElement('div');
      row.className = 'tag-manage-row';
      const chip = document.createElement('span');
      chip.className = 'tag-manage-chip';
      chip.textContent = chipText(g);
      const count = document.createElement('span');
      count.className = 'tag-manage-count';
      count.textContent = `순간 ${g.count}개`;
      const actions = document.createElement('span');
      actions.className = 'tag-manage-actions';
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.textContent = '이름 바꾸기';
      rename.addEventListener('click', () => { editing = editing === g.key ? '' : g.key; merging = ''; fail(''); render(); });
      const merge = document.createElement('button');
      merge.type = 'button';
      merge.textContent = '합치기';
      merge.addEventListener('click', () => { merging = merging === g.key ? '' : g.key; editing = ''; fail(''); render(); });
      actions.append(rename, merge);
      row.append(chip, count, actions);
      if (editing === g.key) row.append(renderRename(current, g));
      if (merging === g.key) row.append(renderMerge(current, g, groups));
      host.append(row);
    }
    // 꼬리표 없는 순간이 있으면 제안 입구를 보여 준다. 제안은 눌러 확인하기 전까지 저장하지 않는다.
    const withoutTags = (current.moments || []).filter((m) => !(Array.isArray(m.keywords) ? m.keywords : []).length);
    $('tag-suggest-box').hidden = !withoutTags.length;
    $('tag-suggest-list').replaceChildren();
    $('tag-suggest-save').hidden = true;
    fail('');
  }

  function renderRename(tree, g) {
    const form = document.createElement('div');
    form.className = 'tag-manage-edit';
    const input = document.createElement('input');
    input.value = g.value;
    input.maxLength = 24;
    input.setAttribute('aria-label', '새 꼬리표 이름');
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = '바꾸기';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '취소';
    form.append(input, ok, cancel);
    const apply = () => {
      const result = renamedMoments(tree, g, input.value);
      if (result.error) { fail(result.error === 'long' ? TOO_LONG_TEXT : result.error === 'same' ? '같은 이름이에요.' : '값을 적어 주세요.'); return; }
      const saved = saveMoments({ treeId, moments: result.moments, notice: '꼬리표 이름을 바꿨어요. 모든 순간에 반영했어요.' });
      if (!saved.ok) { fail(saved.error || '저장하지 못했어요.'); return; }
      editing = '';
      render();
    };
    ok.addEventListener('click', apply);
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); apply(); } });
    cancel.addEventListener('click', () => { editing = ''; render(); });
    return form;
  }

  function renderMerge(tree, g, groups) {
    const others = groups.filter((x) => x.key !== g.key);
    const form = document.createElement('div');
    form.className = 'tag-manage-edit';
    const label = document.createElement('span');
    label.textContent = '어떤 꼬리표로 합칠까요?';
    const select = document.createElement('select');
    select.setAttribute('aria-label', '합칠 꼬리표 고르기');
    for (const o of others) {
      const option = document.createElement('option');
      option.value = o.key;
      option.textContent = chipText(o);
      select.append(option);
    }
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = '합치기';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '취소';
    form.append(label, select, ok, cancel);
    ok.addEventListener('click', () => {
      const target = others.find((o) => o.key === select.value);
      const result = mergedMoments(tree, g, target);
      if (result.error) { fail(result.error === 'same' ? '같은 꼬리표예요.' : '합칠 꼬리표를 골라 주세요.'); return; }
      const saved = saveMoments({ treeId, moments: result.moments, notice: '두 꼬리표를 하나로 합쳤어요.' });
      if (!saved.ok) { fail(saved.error || '저장하지 못했어요.'); return; }
      merging = '';
      render();
    });
    cancel.addEventListener('click', () => { merging = ''; render(); });
    return form;
  }

  // '제목에서 꼬리표 한 번에 제안받기' — 꼬리표 없는 순간의 제목에서 후보를 모아 보여 준다.
  // 확인(체크)하기 전까지는 저장하지 않고, 저장은 확인한 것만 momentsWithAddedTags로 넘긴다.
  function onSuggest() {
    const current = tree();
    if (!current || current.id !== treeId) return;
    const rows = suggestForTree(current);
    const host = $('tag-suggest-list');
    host.replaceChildren();
    picked = new Set();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'tag-suggest-empty';
      empty.textContent = '제목에서 꼬리표로 쓸 만한 말을 찾지 못했어요. 순간 상세에서 직접 붙일 수 있어요.';
      host.append(empty);
      $('tag-suggest-save').hidden = true;
      return;
    }
    for (const row of rows) {
      const box = document.createElement('div');
      box.className = 'tag-suggest-moment';
      const title = document.createElement('b');
      title.textContent = row.title || '제목 없는 순간';
      box.append(title);
      for (const p of row.proposals) {
        // 24자를 넘어 붙일 수 없는 후보는 모델(suggestForTree)이 이미 걸러 보낸다 — 여기에 오는 제안은 모두 누를 수 있다.
        const label = document.createElement('label');
        const box2 = document.createElement('input');
        box2.type = 'checkbox';
        const key = `${row.momentId}\u0000${p.raw || p.value}`;
        box2.addEventListener('change', () => {
          if (box2.checked) picked.add(key); else picked.delete(key);
          $('tag-suggest-save').hidden = !picked.size;
        });
        label.append(box2, document.createTextNode(chipText(p)));
        box.append(label);
      }
      host.append(box);
    }
    $('tag-suggest-save').hidden = true;
  }

  function onSavePicks() {
    const current = tree();
    if (!current || current.id !== treeId) return;
    const picks = [...picked].map((key) => {
      const cut = key.indexOf('\u0000');
      return { momentId: key.slice(0, cut), raw: key.slice(cut + 1) };
    });
    const saved = saveMoments({ treeId, moments: momentsWithAddedTags(current, picks), notice: '확인한 꼬리표를 저장했어요.' });
    if (!saved.ok) { fail(saved.error || '저장하지 못했어요.'); return; }
    picked = new Set();
    render();
    deps.closePanel?.('tag-panel');
  }

  $('tag-suggest-open').addEventListener('click', onSuggest);
  $('tag-suggest-save').addEventListener('click', onSavePicks);
  return { open };
}
