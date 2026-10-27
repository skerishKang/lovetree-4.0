import './styles.css';
import { mountOrbit, ORBIT_EXAMPLE } from './views/orbit.js';
import { mountBook } from './views/book.js';
import { mountShelf } from './views/shelf.js';
import { hasRecovery as recoveryAvailable, recoveryData } from './views/memory.js';
import { createTree, addMoment, editMoment, removeMoment, importTrees, MAX_TREES, EMOTIONS, treeLayout, pathTo } from './domain.js';
import { loadState, saveState, STORAGE_KEY, RECOVERY_KEY } from './storage.js';
import { EXAMPLES } from './examples.js';

const $ = (selector, root = document) => root.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${({
  leaf: '<path d="M12 21V9m0 7C3 16 2 8 3 4c7-1 12 4 9 12Zm0-4c0-7 5-10 10-9 0 7-4 10-10 9Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  heart: '<path d="m12 20-8-8C-1 5 7 0 12 7c5-7 13-2 8 5Z"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  tree: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 12c6 0 5-7 10-7M7 12c6 0 5 7 10 7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  edit: '<path d="m14 4 6 6M3 21l5-1L21 7l-5-5L3 15Z"/>',
  link: '<path d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  check: '<path d="m5 12 4 4L20 5"/>', back: '<path d="m12 4-8 8 8 8M4 12h16"/>',
  external: '<path d="M14 3h7v7m0-7-12 12M10 3H3v18h18v-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  flower: '<path d="M12 8C5-2 0 8 8 12c-10 7 0 12 4 4 7 10 12 0 4-4 10-7 0-12-4-4Z"/><circle cx="12" cy="12" r="2"/>'
})[name] || ''}</svg>`;

let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error(); }, setItem() { throw new Error(); } }; }
const loaded = loadState(storage);
let state = loaded.state;
let expectedRaw;
try { expectedRaw = storage.getItem(STORAGE_KEY); } catch { expectedRaw = undefined; }
let selectedId = null;
let viewMode = 'tree';
let zoom = 1;
let activeTreeId = null;
let toastTimer;
let disposeView = () => {};
const shelfView = {query: '', subject: '', mode: 'shelf', selectedId: null};
const DEMOS = [...EXAMPLES, ORBIT_EXAMPLE];
let opener;
let formDirty = false;
const dialog = $('#moment-dialog');

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500);
}
function commit(next) {
  if (loaded.blocked) throw new Error(loaded.error);
  expectedRaw = saveState(storage, next, expectedRaw);
  state = next;
}
function currentTree() {
  const route = location.hash.slice(1);
  const [kind, id] = route.split('/');
  return ['demo','demo-book'].includes(kind) ? DEMOS.find(t => t.id === id) : state.trees.find(t => t.id === id);
}
const isDemo = () => /^#demo(?:-book)?\//.test(location.hash);
function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}
function dateLabel(date) { return date.replaceAll('-', '.'); }
function header(active) {
  return `<header class="site-header"><a href="#start" class="brand" aria-label="LoveTree 시작">${icon('leaf')}<span>lovetree<span class="brand-dot">.</span></span></a>
    <nav aria-label="주 메뉴"><a href="#start" ${active === 'start' ? 'aria-current="page"' : ''}>마음의 시작</a><a href="#trees" ${active === 'trees' ? 'aria-current="page"' : ''}>내 트리${state.trees.length ? `<span class="nav-count">${state.trees.length}</span>` : ''}</a><a href="#examples" ${active === 'examples' ? 'aria-current="page"' : ''}>예시 둘러보기</a></nav>
    <button class="button primary header-cta" data-action="new">${icon('plus')}<span>순간 남기기</span></button></header>`;
}
function footer() { return `<footer class="site-footer"><a class="footer-brand" href="#start">${icon('leaf')} lovetree.</a><p>좋아하는 마음은, 이어질수록 자라니까.</p><span>당신의 작은 순간을 소중히.</span></footer>`; }
function art(kind, cls = '') { return `<div class="art art-${kind} ${cls}" aria-hidden="true"><img src="/art/${kind === 'stage' ? 'stage' : 'sky'}.svg" alt="" /></div>`; }
function hasRecovery() { return recoveryAvailable(storage, loaded); }
function nodeCard(moment, pos, selected) {
  return `<button class="graph-node ${selected ? 'selected' : ''}" style="left:${pos.x}px;top:${pos.y}px" data-action="select-moment" data-id="${escape(moment.id)}" aria-pressed="${selected}"><span class="node-date">${moment.parentId ? dateLabel(moment.date) : `${icon('leaf')} 이 마음의 시작`}</span><strong>${escape(moment.title)}</strong><span class="node-note">${escape(moment.note)}</span><span class="node-footer"><span class="emotion emotion-${escape(moment.emotion)}">${escape(moment.emotion)}</span>${icon('arrow')}</span></button>`;
}
function fitScale(tree) {
  const { width, height } = treeLayout(tree);
  const board = $('.tree-board');
  const box = $('.graph-scroll');
  // Measure the board and the box outline, so a scrollbar never feeds back into the fitted scale.
  const availableWidth = Math.max(240, (board?.clientWidth || 930) - 30);
  const availableHeight = Math.max(180, (box?.offsetHeight || 485) - 30);
  return Math.max(.18, Math.min(1, Math.floor(Math.min(availableWidth / width, availableHeight / height) * 100) / 100));
}
function graph(tree, scale) {
  const { positions, width, height } = treeLayout(tree);
  let edges = '';
  for (const m of tree.moments) {
    if (!m.parentId) continue;
    const parent = positions.get(m.parentId), child = positions.get(m.id);
    if (!parent || !child) continue;
    const x1 = parent.x + 225, y1 = parent.y + 80, x2 = child.x, y2 = child.y + 80;
    edges += `<path d="M${x1} ${y1}C${x1 + 34} ${y1} ${x2 - 34} ${y2} ${x2} ${y2}"/><circle cx="${x2}" cy="${y2}" r="4"/>`;
  }
  return `<div class="graph-scroll" tabindex="0" role="region" aria-label="순간 연결 트리. 방향키나 스크롤로 이동할 수 있습니다."><div class="graph-sizer" style="width:${width * scale}px;height:${height * scale}px"><div class="graph-canvas" style="width:${width}px;height:${height}px;transform:scale(${scale})"><svg class="graph-edges" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${edges}</svg>${tree.moments.map(m => nodeCard(m, positions.get(m.id), m.id === selectedId)).join('')}</div></div></div>`;
}
function timeline(tree) {
  return `<div class="moment-timeline">${[...tree.moments].sort((a,b) => a.date.localeCompare(b.date)).map(m => `<button class="timeline-moment ${m.id === selectedId ? 'selected' : ''}" data-action="select-moment" data-id="${escape(m.id)}" aria-pressed="${m.id === selectedId}"><span class="timeline-dot"></span><time>${dateLabel(m.date)}</time><strong>${escape(m.title)}</strong><p>${escape(m.note)}</p><span class="emotion emotion-${escape(m.emotion)}">${escape(m.emotion)}</span></button>`).join('')}</div>`;
}
function board(tree) {
  const selected = tree.moments.find(m => m.id === selectedId) || tree.moments[0];
  const path = new Set();
  let current = selected;
  while (current) {
    path.add(current.id);
    current = current.parentId ? tree.moments.find(m => m.id === current.parentId) : null;
  }
  const cards = [...tree.moments].sort((a, b) => a.date.localeCompare(b.date)).map(moment => {
    const parent = moment.parentId ? tree.moments.find(m => m.id === moment.parentId) : null;
    return `<div role="listitem"><button class="board-card ${moment.id === selectedId ? 'selected' : ''} ${path.has(moment.id) ? 'on-path' : ''}" data-action="select-moment" data-id="${escape(moment.id)}" aria-pressed="${moment.id === selectedId}"><span class="board-date">${moment.parentId ? dateLabel(moment.date) : `${icon('leaf')} 이 마음의 시작`}</span><strong>${escape(moment.title)}</strong><span class="board-note">${escape(moment.note)}</span><span class="board-foot"><span class="emotion emotion-${escape(moment.emotion)}">${escape(moment.emotion)}</span>${parent ? `<small>${escape(parent.title)}에서</small>` : ''}</span></button></div>`;
  }).join('');
  return `<div class="moment-board" role="list" aria-label="순간 보드. 선택한 순간까지의 경로가 강조됩니다.">${cards}</div>`;
}
function routeNav(tree, moment) {
  const route = pathTo(tree, moment.id);
  if (route.length < 2) return '';
  const index = route.findIndex(m => m.id === moment.id);
  return `<div class="route-nav" role="group" aria-label="경로 따라가기"><button class="route-step" data-action="route-prev" aria-label="이전 순간으로" ${index === 0 ? 'disabled' : ''}>${icon('back')}</button><span class="route-position" aria-live="polite">${index + 1} / ${route.length}</span><button class="route-step" data-action="route-next" aria-label="다음 순간으로" ${index === route.length - 1 ? 'disabled' : ''}>${icon('arrow')}</button><small>여기까지 온 길</small></div>`;
}
function routeList(tree, moment) {
  const route = pathTo(tree, moment.id);
  if (route.length < 2) return '';
  return `<nav class="detail-route" aria-label="이 순간까지 온 길"><span class="detail-route-title">여기까지 온 길</span><ol>${route.map(m => `<li>${m.id === moment.id ? `<span aria-current="true">${escape(m.title)}</span>` : `<button class="text-button small" data-action="select-moment" data-id="${escape(m.id)}">${escape(m.title)}</button>`}</li>`).join('')}</ol></nav>`;
}
function detail(tree, moment, demo) {
  const parent = tree.moments.find(m => m.id === moment.parentId);
  return `<aside class="moment-detail" aria-label="선택한 순간"><div class="detail-kicker"><span>${moment.parentId ? '이어진 순간' : '이 마음의 시작'}</span>${icon('heart')}</div>${moment.art ? art(moment.art, 'detail-art') : `<div class="detail-quote">“<p>${escape(moment.note)}</p>”</div>`}<time>${dateLabel(moment.date)}</time><h2>${escape(moment.title)}</h2><span class="emotion emotion-${escape(moment.emotion)}">${escape(moment.emotion)}</span><p class="detail-note">${escape(moment.note)}</p>${parent ? `<div class="connection-note">${icon('tree')}<div><small>${escape(parent.title)}에서 이어진 마음</small><p>${escape(moment.relation || '이 마음에서 다음 순간이 이어졌어요.')}</p></div></div>` : ''}${routeList(tree, moment)}${moment.url ? `<a class="button secondary full" href="${escape(moment.url)}" target="_blank" rel="noopener noreferrer">${icon('external')} 원본 링크 열기</a>` : ''}<div class="detail-actions">${demo ? '<button class="button primary full" data-action="new">나의 이야기 시작하기 '+icon('plus')+'</button>' : `<button class="button primary full" data-action="add" data-id="${escape(moment.id)}">이 순간에서 이어가기 ${icon('plus')}</button><div class="detail-small-actions"><button class="text-button" data-action="edit" data-id="${escape(moment.id)}">${icon('edit')} 순간 수정</button><button class="text-button danger" data-action="delete-moment" data-id="${escape(moment.id)}">${icon('trash')} 삭제</button></div>`}</div></aside>`;
}
function workspace() {
  const tree = currentTree(), demo = isDemo();
  if (!tree) return `${header('trees')}<main id="main" class="wrap empty-state" tabindex="-1"><h1>이 트리를 찾을 수 없어요.</h1><p>다른 브라우저의 기록이라면 백업 파일을 가져와 주세요.</p><a class="button primary" href="#trees">내 트리로 돌아가기</a></main>${footer()}`;
  if (activeTreeId !== tree.id) { activeTreeId = tree.id; zoom = 1; }
  if (!tree.moments.some(m => m.id === selectedId)) selectedId = tree.moments.find(m => m.parentId === null).id;
  const selected = tree.moments.find(m => m.id === selectedId);
  const graphScale = zoom === 'fit' ? fitScale(tree) : zoom;
  return `${header(demo ? 'examples' : 'trees')}<main id="main" class="workspace wrap" tabindex="-1"><a href="${demo ? '#examples' : '#trees'}" class="back-link">${icon('back')} ${demo ? '예시 둘러보기' : '내 트리'}</a><div class="workspace-heading"><div><div class="eyebrow">${escape(tree.subject)} <span class="mode-badge">${demo ? '가상 예시 · 체험' : '내 브라우저에 보관'}</span></div><h1>${escape(tree.title)}</h1><p>${demo ? '순간을 눌러, 이어지는 마음을 따라가 보세요.' : '순간을 고르고, 그 마음에서 다음 이야기를 이어 보세요.'}</p></div>${demo ? '<button class="button secondary" data-action="new">나의 트리 만들기 '+icon('plus')+'</button>' : `<button class="button secondary" data-action="export-tree" data-id="${escape(tree.id)}">${icon('download')} 파일로 보관</button>`}</div><div class="workspace-grid"><section class="tree-board" aria-label="트리 작업 공간"><div class="board-toolbar"><div class="view-switch" aria-label="보기 방식"><button data-action="view" data-view="tree" aria-pressed="${viewMode === 'tree'}">${icon('tree')} 트리로 보기</button><button data-action="view" data-view="list" aria-pressed="${viewMode === 'list'}">${icon('list')} 시간으로 보기</button><button data-action="view" data-view="board" aria-pressed="${viewMode === 'board'}">${icon('grid')} 보드로 보기</button></div><a class="text-button small" href="#${demo ? 'demo-book' : 'book'}/${escape(tree.id)}">책으로 감상</a><span class="moment-count">${tree.moments.length}개의 순간</span></div>${viewMode === 'tree' ? graph(tree, graphScale) : viewMode === 'list' ? timeline(tree) : board(tree)}<div class="board-bottom"><span class="board-hint">${icon('leaf')} ${viewMode === 'board' ? (demo ? '선택한 순간까지의 길을 따라가 볼 수 있어요.' : '선택한 순간까지 이어진 경로를 강조했어요.') : (demo ? '당신의 마음도 이렇게 자랄 수 있어요.' : '작은 순간들이 모여, 나만의 이야기가 돼요.')}</span><div class="board-tools">${routeNav(tree, selected)}${viewMode === 'tree' ? `<div class="zoom-controls"><button data-action="zoom-out" aria-label="트리 축소" ${graphScale <= .18 ? 'disabled' : ''}>−</button><button data-action="zoom-reset" aria-label="트리 배율 초기화">${Math.round(graphScale*100)}%</button><button data-action="zoom-in" aria-label="트리 확대" ${graphScale >= 1.4 ? 'disabled' : ''}>+</button><button class="zoom-fit" data-action="zoom-fit" aria-label="전체가 보이도록 맞추기" aria-pressed="${zoom === 'fit'}">맞춤</button></div>` : ''}</div></div></section>${detail(tree, selected, demo)}</div></main>${footer()}`;
}
function render() {
  disposeView(); disposeView = () => {};
  const route = location.hash.slice(1);
  const showBook = (treeId, momentId, demo=false) => { selectedId=momentId; go(`#${demo?'demo-book':'book'}/${treeId}`); };
  const showWorkspace = (treeId, momentId, demo=false) => { selectedId=momentId; go(`#${demo?'demo':'tree'}/${treeId}`); };
  if (route === 'trees') {
    $('#app').innerHTML='<main id="main"></main>';
    disposeView=mountShelf($('#main'), {trees:state.trees,storage,view:shelfView,error:loaded.error,recovery:hasRecovery(),onBook:showBook,onWorkspace:showWorkspace,onNew:()=>openMoment('new'),onAction:libraryAction});
  }
  else if (/^(tree|demo)\//.test(route)) $('#app').innerHTML=workspace();
  else if (/^(book|demo-book)\//.test(route) && currentTree()) {
    $('#app').innerHTML='<main id="main"></main>';
    disposeView=mountBook($('#main'), {tree:currentTree(),selectedId,storage,demo:isDemo(),onHome:()=>go('#start'),onShelf:()=>{shelfView.selectedId=currentTree().id;go('#trees')},onWorkspace:showWorkspace,onNew:()=>openMoment('new'),onAdd:id=>openMoment('add',id),onEdit:id=>openMoment('edit',id)});
  } else if (/^(book|demo-book)\//.test(route)) $('#app').innerHTML=workspace();
  else {
    $('#app').innerHTML='<main id="main"></main>';
    disposeView=mountOrbit($('#main'),{trees:state.trees,storage,example:route==='examples',onNew:()=>openMoment('new'),onTrees:()=>go('#trees'),onBook:showBook,onWorkspace:showWorkspace,error:loaded.error,recovery:hasRecovery(),onRecovery:exportRecovery});
  }
}
function updateTree(tree) { commit({ ...state, trees: state.trees.map(t => t.id === tree.id ? tree : t) }); }

function openMoment(mode, id) {
  if (loaded.blocked) return toast(loaded.error);
  if (mode === 'new' && state.trees.length >= MAX_TREES) return toast(`트리는 ${MAX_TREES}개까지 보관할 수 있어요.`);
  const tree = currentTree();
  if (mode !== 'new' && (!tree || isDemo())) return;
  const m = mode === 'edit' ? tree.moments.find(m => m.id === id) : null;
  if (mode === 'edit' && !m) return;
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10);
  const emotion = m?.emotion || '설렘';
  const emotionOptions = EMOTIONS.includes(emotion) ? EMOTIONS : [emotion, ...EMOTIONS];
  opener = document.activeElement;
  while (opener?.shadowRoot?.activeElement) opener = opener.shadowRoot.activeElement;
  formDirty = false;
  dialog.innerHTML = `<form id="moment-form" data-mode="${mode}" data-id="${escape(id || '')}"><div class="dialog-top"><span class="eyebrow">${mode === 'new' ? 'A LITTLE BEGINNING' : 'ONE MORE MOMENT'}</span><button type="button" class="icon-button" data-action="close-dialog" aria-label="닫기">${icon('close')}</button></div><h2 id="dialog-title">${mode === 'new' ? '간직하고 싶은 순간이 있나요?' : mode === 'edit' ? '그날의 마음을 다듬어 볼까요?' : '이 마음에서, 다음 순간으로.'}</h2><p class="dialog-intro">${mode === 'new' ? '처음 좋아했던 날이 아니어도 좋아요. 지금 떠오르는 장면부터.' : '작은 기록 하나가 나의 이야기를 조금 더 자라게 해요.'}</p>${mode === 'new' ? '<label class="field">누구를, 무엇을 좋아하나요?<input name="subject" maxlength="60" required placeholder="아티스트, 배우, 작품 이름…" autocomplete="off" /></label>' : ''}<label class="field">이 순간에 이름을 붙여 주세요<input name="title" maxlength="80" required value="${escape(m?.title || '')}" placeholder="예: 그 목소리를 처음 만났던 밤" /></label><label class="field">왜 이 순간을 간직하고 싶나요?<textarea name="note" rows="3" maxlength="500" required placeholder="그때의 마음을 짧게 남겨 주세요.">${escape(m?.note || '')}</textarea></label><fieldset class="emotion-field"><legend>그날의 마음</legend><div>${emotionOptions.map(e => `<label class="emotion-choice"><input type="radio" name="emotion" value="${escape(e)}" ${emotion === e ? 'checked' : ''} /><span>${escape(e)}${EMOTIONS.includes(e) ? '' : ' (가져온 값)'}</span></label>`).join('')}</div></fieldset><div class="form-row"><label class="field">순간의 날짜<input name="date" type="date" required value="${m?.date || today}" /></label><label class="field">원본 링크 <span>선택</span><input name="url" type="url" maxlength="2048" value="${escape(m?.url || '')}" placeholder="https://…" /></label></div>${mode === 'add' ? `<label class="field">어느 순간에서 이어지나요?<select name="parentId">${tree.moments.map(p => `<option value="${escape(p.id)}" ${p.id === id ? 'selected' : ''}>${escape(p.title)}</option>`).join('')}</select></label>` : ''}${mode === 'add' || m?.parentId ? `<label class="field">두 순간이 이어진 이유 <span>선택</span><input name="relation" maxlength="100" value="${escape(m?.relation || '')}" placeholder="예: 다른 무대도 찾아보고 싶어져서" /></label>` : ''}<p class="form-error" role="alert" id="form-error"></p><div class="dialog-bottom"><span>${icon('check')} 이 브라우저에 저장돼요</span><button class="button primary" type="submit">${mode === 'edit' ? '수정한 마음 저장하기' : mode === 'new' ? '첫 순간 심기' : '순간 이어 붙이기'} ${icon('arrow')}</button></div></form>`;
  dialog.showModal();
}
function closeDialog() {
  if (formDirty && !window.confirm('작성 중인 내용이 있어요. 저장하지 않고 닫을까요?')) return;
  dialog.close();
}
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
dialog.addEventListener('close', () => { formDirty = false; opener?.focus?.(); });
dialog.addEventListener('input', () => { formDirty = true; });
dialog.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const input = Object.fromEntries(new FormData(form));
  try {
    let tree;
    if (form.dataset.mode === 'new') {
      tree = createTree(input);
      commit({ ...state, trees: [...state.trees, tree] });
      selectedId = tree.moments[0].id;
    } else {
      const current = currentTree();
      tree = form.dataset.mode === 'edit' ? editMoment(current, form.dataset.id, input) : addMoment(current, input, input.parentId);
      updateTree(tree);
      selectedId = form.dataset.mode === 'edit' ? form.dataset.id : tree.moments.at(-1).id;
    }
    formDirty = false;
    dialog.close();
    go(`#${form.dataset.mode === 'new' || /book\//.test(location.hash) ? 'book' : 'tree'}/${tree.id}`);
    toast(form.dataset.mode === 'edit' ? '그날의 마음을 다시 담았어요.' : '새로운 순간이 트리에 자랐어요.');
  } catch (error) { $('#form-error').textContent = error.message; }
});

function exportRecovery() {
  const raw = recoveryData(storage, loaded);
  if (raw === null) return toast('보관된 복구 사본이 없어요.');
  download(raw, 'lovetree-recovery.json', true);
}
function download(data, filename, raw = false) {
  const objectUrl = URL.createObjectURL(new Blob([raw ? data : JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = objectUrl; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
function libraryAction(action, id) {
  try {
    if (action === 'delete-tree') {
      const tree = state.trees.find(t => t.id === id);
      if (!tree || !confirm(`“${tree.title}”와 ${tree.moments.length}개의 순간을 지울까요? 필요하면 먼저 파일로 백업해 주세요.`)) return;
      commit({ ...state, trees: state.trees.filter(t => t.id !== id) }); render(); toast('트리를 지웠어요.');
    }
    else if (action === 'export-tree') { const tree = state.trees.find(t => t.id === id); if (tree) download({ version: 1, trees: [tree] }, `lovetree-${id.slice(0, 8)}.json`); }
    else if (action === 'export-all') download(state, `lovetree-backup-${new Date().toISOString().slice(0,10)}.json`);
    else if (action === 'import') $('#import-file').click();
    else if (action === 'recovery') exportRecovery();
  } catch (error) { toast(error.message); }
}
document.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    const host = $('#main');
    // Chromium only tabs into a shadow tree when its host is not a tab stop, so focus the first control inside it.
    const inner = host?.shadowRoot?.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (inner || host)?.focus();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  try {
    if (action === 'new') openMoment('new');
    else if (action === 'close-dialog') closeDialog();
    else if (action === 'open-demo') { selectedId = button.dataset.moment || null; go(`#demo/${id}`); }
    else if (action === 'select-moment') {
      const scroll = $('.graph-scroll'); const position = scroll ? [scroll.scrollLeft, scroll.scrollTop] : null;
      selectedId = id; render();
      if (position && $('.graph-scroll')) { $('.graph-scroll').scrollLeft = position[0]; $('.graph-scroll').scrollTop = position[1]; }
      $(`[data-action="select-moment"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    }
    else if (action === 'view') { viewMode = button.dataset.view; render(); $(`[data-view="${viewMode}"]`)?.focus(); }
    else if (action.startsWith('zoom-')) {
      const scale = zoom === 'fit' ? fitScale(currentTree()) : zoom;
      zoom = action === 'zoom-fit' ? 'fit' : action === 'zoom-reset' ? 1 : Math.round(Math.min(1.4, Math.max(.18, scale + (action === 'zoom-in' ? .1 : -.1))) * 10) / 10;
      render(); $(`[data-action="${action}"]`)?.focus();
    }
    else if (action === 'route-prev' || action === 'route-next') {
      const route = pathTo(currentTree(), selectedId);
      const index = route.findIndex(m => m.id === selectedId);
      const target = route[index + (action === 'route-next' ? 1 : -1)];
      if (!target) return;
      selectedId = target.id; render();
      // Keep the keyboard on the same side of the route; disabled steps cannot hold focus.
      const sameSide = $(`[data-action="${action}"]`);
      const otherSide = $(`[data-action="${action === 'route-next' ? 'route-prev' : 'route-next'}"]`);
      (sameSide && !sameSide.disabled ? sameSide : otherSide && !otherSide.disabled ? otherSide : $(`[data-action="select-moment"][data-id="${CSS.escape(selectedId)}"]`))?.focus();
    }
    else if (action === 'add' || action === 'edit') openMoment(action, id);
    else if (action === 'delete-moment') {
      if (!confirm('이 순간을 지울까요? 이어진 순간들은 남기고 연결을 정리합니다.')) return;
      updateTree(removeMoment(currentTree(), id)); selectedId = null; render(); toast('순간을 지웠어요.');
    }
    else libraryAction(action, id);
  } catch (error) { toast(error.message); }
});
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하의 러브트리 JSON 파일을 선택해 주세요.');
    const incoming = JSON.parse(await file.text());
    const next = importTrees(state, incoming);
    commit(next); go('#trees'); toast(`${incoming.trees.length}개의 트리를 새 사본으로 가져왔어요.`);
  } catch (error) { toast(error instanceof SyntaxError ? '올바른 JSON 파일이 아니에요.' : error.message); }
  finally { event.target.value = ''; }
});
window.addEventListener('hashchange', () => { render(); if (location.hash !== '#examples') window.scrollTo({ top: 0 }); });
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  // The fitted overview depends on the visible board size, which changes with the layout breakpoints.
  resizeTimer = setTimeout(() => { if (zoom === 'fit' && viewMode === 'tree' && !dialog.open && /^(tree|demo)\//.test(location.hash.slice(1))) render(); }, 160);
});
window.addEventListener('storage', event => {
  if (event.key === RECOVERY_KEY && location.hash === '#trees' && !dialog.open) { render(); return; }
  if (event.key !== STORAGE_KEY) return;
  if (dialog.open) { toast('다른 탭에서 기록이 바뀌었어요. 작성 중인 내용을 복사한 뒤 새로고침해 주세요.'); return; }
  const next = loadState(storage);
  if (!next.error) { state = next.state; expectedRaw = event.newValue; render(); }
  else toast(next.error);
});
render();
if (loaded.error) toast(loaded.error);
