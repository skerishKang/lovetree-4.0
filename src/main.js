import './styles.css';
import { createTree, addMoment, editMoment, removeMoment, importTrees, MAX_TREES, EMOTIONS, treeLayout } from './domain.js';
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
  return kind === 'demo' ? EXAMPLES.find(t => t.id === id) : state.trees.find(t => t.id === id);
}
const isDemo = () => location.hash.startsWith('#demo/');
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
function heroCollage() {
  return `<div class="hero-art" aria-label="세 순간이 연결된 러브트리 예시">
    <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-caption">MY LITTLE LOVE STORY</span>
    <svg class="hero-branches" viewBox="0 0 600 560" fill="none" aria-hidden="true"><path d="M300 550C305 440 320 330 280 210M310 410C250 360 180 350 130 300M300 320C365 300 410 250 445 208" stroke="#84917b" stroke-width="3"/><path d="M306 460C265 462 254 441 265 434c18-11 34 5 41 26Zm-20-92c-34 3-53-18-45-29 21-4 41 10 45 29Zm40-60c30-29 56-23 59-10-14 17-36 18-59 10Z" fill="#a6b39a"/><circle cx="312" cy="403" r="5" fill="#f7f5ef" stroke="#88977e"/><circle cx="299" cy="317" r="5" fill="#f7f5ef" stroke="#88977e"/></svg>
    <button class="memory-paper paper-main" data-action="open-demo" data-id="demo-voice" data-moment="voice-1"><span class="paper-tape"></span>${art('stage')}<span class="paper-content"><span class="paper-eyebrow">MY FIRST SPARK <span>✧</span></span><strong>우연히 멈춰 선 그 노래</strong><span class="paper-note">그 목소리를 처음 만났던 밤.</span><span class="emotion emotion-설렘">설렘</span></span></button>
    <button class="memory-paper paper-side" data-action="open-demo" data-id="demo-voice" data-moment="voice-2">${art('sky')}<span class="paper-content"><small>2026. 09. 18</small><strong>가사 한 줄이 건넨 위로</strong><span class="paper-note">오늘의 나에게 꼭 필요했던 말.</span></span></button>
    <button class="memory-paper paper-note-card" data-action="open-demo" data-id="demo-voice" data-moment="voice-3"><span class="scribble-heart">♡</span><span class="paper-content"><small>DEAR MY MOMENT</small><strong>같은 노래를<br>함께 부른 날</strong><span class="paper-note">혼자 좋아하던 마음이<br>우리의 기억이 되었다.</span><span class="emotion emotion-벅참">벅참</span></span></button>
    <span class="floating-note">작은 순간이, 하나의 이야기가 되는 곳 ${icon('flower')}</span>
  </div>`;
}
function exampleCard(tree, index) {
  return `<button class="example-card ${tree.theme}" data-action="open-demo" data-id="${tree.id}"><div class="example-visual">${art(index === 1 ? 'sky' : 'stage')}<span class="example-label">${index === 1 ? '좋아하는 작품' : '좋아하는 아티스트'}</span><div class="tiny-note"><span>${icon(index === 1 ? 'sun' : 'heart')}</span><p>${index === 0 ? '이 마음의 시작을<br>오래 기억하고 싶어서.' : index === 1 ? '나도 몰랐던 마음을<br>발견한 순간.' : '조금씩, 오래도록<br>좋아하고 싶은 마음.'}</p></div></div><div class="example-content"><span class="overline">STORY 0${index + 1} <span>가상 예시</span></span><h3>${escape(tree.title)}</h3><p>${escape(tree.caption)}</p><span class="example-bottom"><span>${tree.moments.length}개의 순간 · ${escape(tree.subject)}</span>${icon('arrow')}</span></div></button>`;
}
function landing() {
  return `${header(location.hash === '#examples' ? 'examples' : 'start')}<main id="main" tabindex="-1"><section class="hero wrap"><div class="hero-copy"><div class="eyebrow"><span></span> 좋아하는 마음을 위한 작은 정원</div><h1>좋아하는 순간이<br><em>나만의 이야기</em>로.</h1><p class="hero-description">우연히 만난 장면, 오래 남은 한마디.<br>흩어진 순간을 이어, 나만의 러브트리를 키워 보세요.</p><div class="hero-actions"><button class="button primary large" data-action="new">나의 첫 순간 남기기 ${icon('arrow')}</button><button class="text-button" data-action="open-demo" data-id="demo-voice">${icon('play')} 어떤 모습인지 볼까요?</button></div><p class="gentle-note">${icon('leaf')} 처음 좋아했던 날이 아니어도 괜찮아요.</p><div class="hero-footnote"><span>기록하고</span><i></i><span>이어 보고</span><i></i><span>다시 느끼고</span></div></div>${heroCollage()}</section>
    <section class="invitation wrap" aria-label="러브트리에 담는 마음"><span class="invitation-mark">✳</span><p>잊고 싶지 않은 순간에 <strong>마음을 붙여 보세요.</strong><br><span>나의 기록이 쌓이면, 좋아하는 마음의 길이 보이기 시작해요.</span></p><span class="invitation-drawing">${icon('tree')}</span></section>
    <section class="examples wrap" id="examples"><div class="section-heading"><div><span class="eyebrow">A LITTLE INSPIRATION</span><h2>마음은 이런 모습으로 자라요.</h2></div><p>세 개의 순간으로 미리 만나보는 러브트리</p></div><div class="example-grid">${EXAMPLES.map(exampleCard).join('')}</div></section>
    <section class="bottom-invite wrap"><span class="eyebrow">YOUR STORY STARTS HERE</span><h2>오늘, 어떤 순간을 간직하고 싶나요?</h2><button class="button secondary" data-action="new">작은 순간 하나 남기기 ${icon('plus')}</button></section></main>${footer()}`;
}
function treeCard(tree) {
  const first = tree.moments.find(m => m.parentId === null);
  return `<article class="saved-tree"><a href="#tree/${escape(tree.id)}" class="saved-tree-link"><div class="saved-tree-art">${icon('tree')}<span>${escape(first.emotion)}</span><p>${escape(first.note)}</p></div><div class="saved-tree-content"><small>${escape(tree.subject)}</small><h2>${escape(tree.title)}</h2><p>${tree.moments.length}개의 순간 <span>마지막 기록 ${dateLabel(tree.updatedAt.slice(0, 10))}</span></p></div></a><div class="saved-tree-actions"><button class="text-button small" data-action="export-tree" data-id="${escape(tree.id)}">${icon('download')} 파일로 보관</button><button class="icon-button subtle" aria-label="${escape(tree.title)} 트리 삭제" data-action="delete-tree" data-id="${escape(tree.id)}">${icon('trash')}</button></div></article>`;
}
function filteredTrees(query = '') {
  const trees = [...state.trees].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter(t => `${t.title} ${t.subject}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return trees.length ? trees.map(treeCard).join('') : `<div class="empty-state"><span>${icon(query ? 'search' : 'leaf')}</span><h2>${query ? '아직 이 이름의 트리가 없어요.' : '이곳에 나만의 마음이 자라요.'}</h2><p>${query ? '다른 이름으로 찾아보세요.' : '좋아하는 순간 하나면 충분해요.<br>첫 기록을 남기고, 나의 이야기를 시작해 보세요.'}</p>${query ? '' : '<button class="button primary" data-action="new">첫 순간 남기기</button>'}</div>`;
}
function treesPage() {
  return `${header('trees')}<main id="main" class="wrap my-trees" tabindex="-1"><div class="section-heading"><div><span class="eyebrow">MY LITTLE GARDEN</span><h1>다시 펼쳐 보는, 나의 마음.</h1><p>좋아했던 순간들이 여기에서 기다리고 있어요.</p></div><button class="button primary" data-action="new">${icon('plus')} 새 트리 시작하기</button></div><div class="library-toolbar"><label class="search-field">${icon('search')}<input id="tree-search" type="search" placeholder="트리 이름이나 좋아하는 대상 찾기" aria-label="내 트리 검색" /></label><div class="toolbar-actions"><button class="text-button" data-action="import">${icon('upload')} 파일 가져오기</button><button class="text-button" data-action="export-all" ${state.trees.length ? '' : 'disabled'}>${icon('download')} 전체 백업</button></div></div><div class="storage-notice">${icon('check')} <span>기록은 <strong>지금 사용하는 브라우저</strong>에 보관돼요. 다른 기기로 옮기거나 안전하게 보관하려면 파일로 백업해 주세요.</span></div>${loaded.error ? `<div class="notice" role="alert">${escape(loaded.error)} ${loaded.recovery ? '<button class="text-button" data-action="recovery">복구 파일 내보내기</button>' : ''}</div>` : ''}<div class="trees-grid" id="tree-results">${filteredTrees()}</div></main>${footer()}`;
}
function nodeCard(moment, pos, selected) {
  return `<button class="graph-node ${selected ? 'selected' : ''}" style="left:${pos.x}px;top:${pos.y}px" data-action="select-moment" data-id="${escape(moment.id)}" aria-pressed="${selected}"><span class="node-date">${moment.parentId ? dateLabel(moment.date) : `${icon('leaf')} 이 마음의 시작`}</span><strong>${escape(moment.title)}</strong><span class="node-note">${escape(moment.note)}</span><span class="node-footer"><span class="emotion emotion-${escape(moment.emotion)}">${escape(moment.emotion)}</span>${icon('arrow')}</span></button>`;
}
function graph(tree) {
  const { positions, width, height } = treeLayout(tree);
  let edges = '';
  for (const m of tree.moments) {
    if (!m.parentId) continue;
    const parent = positions.get(m.parentId), child = positions.get(m.id);
    if (!parent || !child) continue;
    const x1 = parent.x + 225, y1 = parent.y + 80, x2 = child.x, y2 = child.y + 80;
    edges += `<path d="M${x1} ${y1}C${x1 + 34} ${y1} ${x2 - 34} ${y2} ${x2} ${y2}"/><circle cx="${x2}" cy="${y2}" r="4"/>`;
  }
  return `<div class="graph-scroll" tabindex="0" role="region" aria-label="순간 연결 트리. 방향키나 스크롤로 이동할 수 있습니다."><div class="graph-sizer" style="width:${width * zoom}px;height:${height * zoom}px"><div class="graph-canvas" style="width:${width}px;height:${height}px;transform:scale(${zoom})"><svg class="graph-edges" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${edges}</svg>${tree.moments.map(m => nodeCard(m, positions.get(m.id), m.id === selectedId)).join('')}</div></div></div>`;
}
function timeline(tree) {
  return `<div class="moment-timeline">${[...tree.moments].sort((a,b) => a.date.localeCompare(b.date)).map(m => `<button class="timeline-moment ${m.id === selectedId ? 'selected' : ''}" data-action="select-moment" data-id="${escape(m.id)}" aria-pressed="${m.id === selectedId}"><span class="timeline-dot"></span><time>${dateLabel(m.date)}</time><strong>${escape(m.title)}</strong><p>${escape(m.note)}</p><span class="emotion emotion-${escape(m.emotion)}">${escape(m.emotion)}</span></button>`).join('')}</div>`;
}
function detail(tree, moment, demo) {
  const parent = tree.moments.find(m => m.id === moment.parentId);
  return `<aside class="moment-detail" aria-label="선택한 순간"><div class="detail-kicker"><span>${moment.parentId ? '이어진 순간' : '이 마음의 시작'}</span>${icon('heart')}</div>${moment.art ? art(moment.art, 'detail-art') : `<div class="detail-quote">“<p>${escape(moment.note)}</p>”</div>`}<time>${dateLabel(moment.date)}</time><h2>${escape(moment.title)}</h2><span class="emotion emotion-${escape(moment.emotion)}">${escape(moment.emotion)}</span><p class="detail-note">${escape(moment.note)}</p>${parent ? `<div class="connection-note">${icon('tree')}<div><small>${escape(parent.title)}에서 이어진 마음</small><p>${escape(moment.relation || '이 마음에서 다음 순간이 이어졌어요.')}</p></div></div>` : ''}${moment.url ? `<a class="button secondary full" href="${escape(moment.url)}" target="_blank" rel="noopener noreferrer">${icon('external')} 원본 링크 열기</a>` : ''}<div class="detail-actions">${demo ? '<button class="button primary full" data-action="new">나의 이야기 시작하기 '+icon('plus')+'</button>' : `<button class="button primary full" data-action="add" data-id="${escape(moment.id)}">이 순간에서 이어가기 ${icon('plus')}</button><div class="detail-small-actions"><button class="text-button" data-action="edit" data-id="${escape(moment.id)}">${icon('edit')} 순간 수정</button><button class="text-button danger" data-action="delete-moment" data-id="${escape(moment.id)}">${icon('trash')} 삭제</button></div>`}</div></aside>`;
}
function workspace() {
  const tree = currentTree(), demo = isDemo();
  if (!tree) return `${header('trees')}<main id="main" class="wrap empty-state" tabindex="-1"><h1>이 트리를 찾을 수 없어요.</h1><p>다른 브라우저의 기록이라면 백업 파일을 가져와 주세요.</p><a class="button primary" href="#trees">내 트리로 돌아가기</a></main>${footer()}`;
  if (activeTreeId !== tree.id) { activeTreeId = tree.id; zoom = 1; }
  if (!tree.moments.some(m => m.id === selectedId)) selectedId = tree.moments.find(m => m.parentId === null).id;
  const selected = tree.moments.find(m => m.id === selectedId);
  return `${header(demo ? 'examples' : 'trees')}<main id="main" class="workspace wrap" tabindex="-1"><a href="${demo ? '#examples' : '#trees'}" class="back-link">${icon('back')} ${demo ? '예시 둘러보기' : '내 트리'}</a><div class="workspace-heading"><div><div class="eyebrow">${escape(tree.subject)} <span class="mode-badge">${demo ? '가상 예시 · 체험' : '내 브라우저에 보관'}</span></div><h1>${escape(tree.title)}</h1><p>${demo ? '순간을 눌러, 이어지는 마음을 따라가 보세요.' : '순간을 고르고, 그 마음에서 다음 이야기를 이어 보세요.'}</p></div>${demo ? '<button class="button secondary" data-action="new">나의 트리 만들기 '+icon('plus')+'</button>' : `<button class="button secondary" data-action="export-tree" data-id="${escape(tree.id)}">${icon('download')} 파일로 보관</button>`}</div><div class="workspace-grid"><section class="tree-board" aria-label="트리 작업 공간"><div class="board-toolbar"><div class="view-switch" aria-label="보기 방식"><button data-action="view" data-view="tree" aria-pressed="${viewMode === 'tree'}">${icon('tree')} 트리로 보기</button><button data-action="view" data-view="list" aria-pressed="${viewMode === 'list'}">${icon('list')} 시간으로 보기</button></div><span class="moment-count">${tree.moments.length}개의 소중한 순간</span></div>${viewMode === 'tree' ? graph(tree) : timeline(tree)}<div class="board-bottom"><span>${icon('leaf')} ${demo ? '당신의 마음도 이렇게 자랄 수 있어요.' : '작은 순간들이 모여, 나만의 이야기가 돼요.'}</span>${viewMode === 'tree' ? `<div class="zoom-controls"><button data-action="zoom-out" aria-label="트리 축소" ${zoom <= .5 ? 'disabled' : ''}>−</button><button data-action="zoom-reset" aria-label="트리 배율 초기화">${Math.round(zoom*100)}%</button><button data-action="zoom-in" aria-label="트리 확대" ${zoom >= 1.4 ? 'disabled' : ''}>+</button></div>` : ''}</div></section>${detail(tree, selected, demo)}</div></main>${footer()}`;
}
function render() {
  const route = location.hash.slice(1);
  $('#app').innerHTML = route === 'trees' ? treesPage() : /^(tree|demo)\//.test(route) ? workspace() : landing();
  if (route === 'examples') requestAnimationFrame(() => $('#examples')?.scrollIntoView({ behavior: 'smooth' }));
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
  opener = document.activeElement;
  formDirty = false;
  dialog.innerHTML = `<form id="moment-form" data-mode="${mode}" data-id="${escape(id || '')}"><div class="dialog-top"><span class="eyebrow">${mode === 'new' ? 'A LITTLE BEGINNING' : 'ONE MORE MOMENT'}</span><button type="button" class="icon-button" data-action="close-dialog" aria-label="닫기">${icon('close')}</button></div><h2 id="dialog-title">${mode === 'new' ? '간직하고 싶은 순간이 있나요?' : mode === 'edit' ? '그날의 마음을 다듬어 볼까요?' : '이 마음에서, 다음 순간으로.'}</h2><p class="dialog-intro">${mode === 'new' ? '처음 좋아했던 날이 아니어도 좋아요. 지금 떠오르는 장면부터.' : '작은 기록 하나가 나의 이야기를 조금 더 자라게 해요.'}</p>${mode === 'new' ? '<label class="field">누구를, 무엇을 좋아하나요?<input name="subject" maxlength="60" required placeholder="아티스트, 배우, 작품 이름…" autocomplete="off" /></label>' : ''}<label class="field">이 순간에 이름을 붙여 주세요<input name="title" maxlength="80" required value="${escape(m?.title || '')}" placeholder="예: 그 목소리를 처음 만났던 밤" /></label><label class="field">왜 이 순간을 간직하고 싶나요?<textarea name="note" rows="3" maxlength="500" required placeholder="그때의 마음을 짧게 남겨 주세요.">${escape(m?.note || '')}</textarea></label><fieldset class="emotion-field"><legend>그날의 마음</legend><div>${EMOTIONS.map(e => `<label class="emotion-choice"><input type="radio" name="emotion" value="${e}" ${emotion === e ? 'checked' : ''} /><span>${e}</span></label>`).join('')}</div></fieldset><div class="form-row"><label class="field">순간의 날짜<input name="date" type="date" required value="${m?.date || today}" /></label><label class="field">원본 링크 <span>선택</span><input name="url" type="url" maxlength="2048" value="${escape(m?.url || '')}" placeholder="https://…" /></label></div>${mode === 'add' ? `<label class="field">어느 순간에서 이어지나요?<select name="parentId">${tree.moments.map(p => `<option value="${escape(p.id)}" ${p.id === id ? 'selected' : ''}>${escape(p.title)}</option>`).join('')}</select></label>` : ''}${mode === 'add' || m?.parentId ? `<label class="field">두 순간이 이어진 이유 <span>선택</span><input name="relation" maxlength="100" value="${escape(m?.relation || '')}" placeholder="예: 다른 무대도 찾아보고 싶어져서" /></label>` : ''}<p class="form-error" role="alert" id="form-error"></p><div class="dialog-bottom"><span>${icon('check')} 이 브라우저에 저장돼요</span><button class="button primary" type="submit">${mode === 'edit' ? '수정한 마음 저장하기' : mode === 'new' ? '첫 순간 심기' : '순간 이어 붙이기'} ${icon('arrow')}</button></div></form>`;
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
    go(`#tree/${tree.id}`);
    toast(form.dataset.mode === 'edit' ? '그날의 마음을 다시 담았어요.' : '새로운 순간이 트리에 자랐어요.');
  } catch (error) { $('#form-error').textContent = error.message; }
});

function download(data, filename, raw = false) {
  const objectUrl = URL.createObjectURL(new Blob([raw ? data : JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = objectUrl; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
document.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); $('#main')?.focus(); return; }
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
    else if (action.startsWith('zoom-')) { zoom = action === 'zoom-reset' ? 1 : Math.round(Math.min(1.4, Math.max(.5, zoom + (action === 'zoom-in' ? .1 : -.1))) * 10) / 10; render(); $(`[data-action="${action}"]`)?.focus(); }
    else if (action === 'add' || action === 'edit') openMoment(action, id);
    else if (action === 'delete-moment') {
      if (!confirm('이 순간을 지울까요? 이어진 순간들은 남기고 연결을 정리합니다.')) return;
      updateTree(removeMoment(currentTree(), id)); selectedId = null; render(); toast('순간을 지웠어요.');
    }
    else if (action === 'delete-tree') {
      const tree = state.trees.find(t => t.id === id);
      if (!tree || !confirm(`“${tree.title}”와 ${tree.moments.length}개의 순간을 지울까요? 필요하면 먼저 파일로 백업해 주세요.`)) return;
      commit({ ...state, trees: state.trees.filter(t => t.id !== id) }); render(); toast('트리를 지웠어요.');
    }
    else if (action === 'export-tree') { const tree = state.trees.find(t => t.id === id); if (tree) download({ version: 1, trees: [tree] }, `lovetree-${id.slice(0, 8)}.json`); }
    else if (action === 'export-all') download(state, `lovetree-backup-${new Date().toISOString().slice(0,10)}.json`);
    else if (action === 'import') $('#import-file').click();
    else if (action === 'recovery') download(storage.getItem(RECOVERY_KEY) || storage.getItem(STORAGE_KEY) || '{}', 'lovetree-recovery.json', true);
  } catch (error) { toast(error.message); }
});
document.addEventListener('input', event => { if (event.target.id === 'tree-search') $('#tree-results').innerHTML = filteredTrees(event.target.value); });
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
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  if (dialog.open) { toast('다른 탭에서 기록이 바뀌었어요. 작성 중인 내용을 복사한 뒤 새로고침해 주세요.'); return; }
  const next = loadState(storage);
  if (!next.error) { state = next.state; expectedRaw = event.newValue; render(); }
  else toast(next.error);
});
render();
if (loaded.error) toast(loaded.error);
