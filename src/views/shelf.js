import sourceCSS from './shelf-source.css?inline';
import css from './shelf.css?inline';
import {escape as esc, resume} from './memory.js';
import {SERVICE, GO_HOME, GO_TREES, GO_EXAMPLES, READ_BOOK, VIEW_TREE, NEW_TREE, BOOK_IS_READING} from '../terms.js';
import {createView} from './lifecycle.js';

const SELECTION_KEY = 'lovetree.v4.shelf-selection.v1';
const COLORS = ['#a8586b', '#627ba2', '#8d705e', '#6d8979', '#80708f', '#567e88'];
const date = value => new Intl.DateTimeFormat('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(value)).replaceAll(' ', '').replace(/\.$/, '');
const firstMoment = tree => tree.moments.find(m => m.parentId === null);
function color(tree) {
  const hash = [...tree.id].reduce((n, char) => (n * 31 + char.codePointAt(0)) >>> 0, 0);
  return COLORS[hash % COLORS.length];
}
// #42 — 기록이 있는 재방문 상태의 소개는 한 줄로 압축하고, 첫 방문의 소개만 큰 면적으로 남긴다.
function hero(trees, totalMoments, last, sorted) {
  const counts = `<div class="hero-note"><strong>${trees.length}개의 트리</strong><span>· ${totalMoments}개의 순간을 간직하고 있어요</span></div>`;
  if (!trees.length) return `<section class="hero" aria-labelledby="shelf-title"><div class="hero-copy"><p class="eyebrow">MY LOVETREE</p><h1 id="shelf-title">좋아한 마음마다,<br><em>하나의 트리로 이어져요.</em></h1><p>이어 쓴 순간이 한 그루의 트리가 돼요.<br>기억책은 ${BOOK_IS_READING}이에요.</p>${counts}</div>
    <div class="hero-stage"><span class="book-cover" style="--cover:#9d6878" aria-hidden="true"><span class="cover-number">YOUR FIRST TREE</span><span class="cover-symbol"><span>♡</span></span><strong class="cover-title">어떤 마음으로<br>채워질까요?</strong></span><div class="reading-copy"><small>아직 쓰이지 않은 첫 장</small><h2>지금 떠오르는<br>순간 하나면 충분해요.</h2><p>처음 좋아했던 날부터 시작하지 않아도 괜찮아요.</p><button class="ghost" data-do="new">${NEW_TREE} ↗</button></div></div></section>`;
  return `<section class="hero is-compact" aria-labelledby="shelf-title"><div class="hero-copy"><p class="eyebrow">MY LOVETREE</p><h1 id="shelf-title">좋아한 마음마다, <em>하나의 트리로 이어져요.</em></h1>${counts}</div>
    <div class="hero-stage">${cover(last.tree, sorted.indexOf(last.tree) + 1)}<div class="reading-copy"><small>다시 펼칠 순간 · ${esc(last.tree.subject)}</small><h2>${esc(last.moment.title)}</h2><button class="ghost" data-do="resume">${READ_BOOK} ↗</button></div></div></section>`;
}
function cover(tree, number) {
  return `<span class="book-cover" style="--cover:${color(tree)}"><span class="cover-number">TREE · ${String(number).padStart(2, '0')}</span><span class="cover-symbol" aria-hidden="true"><span>✦</span></span><strong class="cover-title">${esc(tree.subject)}</strong><span class="cover-subtitle">${tree.moments.length}개의 순간</span></span>`;
}

export function mountShelf(host, {trees, storage, view, context, actions, authHtml = ''}) {
  const {root, signal, track, dispose} = createView(host);
  const sorted = [...trees].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const last = resume(storage, trees);
  const subjects = [...new Set(trees.map(t => t.subject))].sort((a, b) => a.localeCompare(b, 'ko'));
  let selection = context.treeId || view.selectedId, list = [], drag = null, suppressClick = false;
  if (!selection) { try { selection = storage.getItem(SELECTION_KEY); } catch { /* optional view state */ } }
  if (!trees.some(t => t.id === selection)) selection = last?.tree.id || sorted[0]?.id;
  if (!subjects.includes(view.subject)) view.subject = '';
  const totalMoments = trees.reduce((n, tree) => n + tree.moments.length, 0);
  root.innerHTML = `<style>${sourceCSS}\n${css}\n.auth-entry{white-space:nowrap}@media(max-width:540px){.auth-entry{min-height:34px;padding:0 11px;font-size:11px}}</style><div class="app">
    <header class="topbar"><a class="brand" href="#start" aria-label="${SERVICE} ${GO_HOME}"><span class="brand-mark" aria-hidden="true"><i></i><b></b></span><span><strong>${SERVICE}</strong><small>LOVE MOMENT LIBRARY</small></span></a><span class="crumbs">${GO_TREES}</span><nav class="top-actions" aria-label="${GO_TREES} 메뉴"><a class="ghost" href="#start">${GO_HOME}</a><a class="ghost example-link" href="#examples">${GO_EXAMPLES}</a><button class="ghost primary" data-do="new">${NEW_TREE} +</button>${authHtml}</nav></header>
    <div class="page">${hero(trees, totalMoments, last, sorted)}
    <div class="shelf-controls"><label class="search"><span class="sr-only">${GO_TREES} 검색</span><input type="search" aria-label="${GO_TREES} 검색" placeholder="대상, 트리 제목, 순간 제목으로 찾기" value="${esc(view.query || '')}"></label><select class="subject-select" aria-label="좋아하는 대상별 보기"><option value="">모든 대상</option>${subjects.map(subject => `<option value="${esc(subject)}" ${view.subject === subject ? 'selected' : ''}>${esc(subject)}</option>`).join('')}</select><div class="view-toggle" role="group" aria-label="${GO_TREES} 보는 방식"><button data-mode="shelf">표지</button><button data-mode="list">목록</button></div><span class="count" role="status" aria-live="polite"></span></div>
    <section class="shelf-viewport" aria-label="${GO_TREES}"><button class="shelf-arrow left" data-move="-1" aria-label="이전 트리">‹</button><div class="shelf-rail"></div><button class="shelf-arrow right" data-move="1" aria-label="다음 트리">›</button><div class="shelf-base" aria-hidden="true"></div></section><p class="shelf-hint"></p><section class="selected-book" aria-label="선택한 트리"></section>
    <footer class="backup-bar"><p>기록은 <strong>서버에 저장</strong>돼요.<br>필요하면 파일로 백업할 수 있어요.</p><div class="backup-actions"><button class="ghost" data-action="import">파일 가져오기</button><button class="ghost" data-action="export-all" ${trees.length ? '' : 'disabled'}>전체 백업 ↓</button></div></footer></div></div>`;
  const rail = root.querySelector('.shelf-rail'), viewport = root.querySelector('.shelf-viewport');
  const panel = root.querySelector('.selected-book');

  function selectedTree() { return list.find(t => t.id === selection); }
  function rememberSelection() {
    view.selectedId = selection;
    if (selection) { try { storage.setItem(SELECTION_KEY, selection); } catch { /* records remain independent */ } }
  }
  function updateSelection(focus = false) {
    const current = list.findIndex(t => t.id === selection), asList = view.mode === 'list';
    const small = rail.clientWidth < 600;
    rail.querySelectorAll('.book-card').forEach((card, index) => {
      const distance = index - current, absolute = Math.abs(distance), button = card.querySelector('button');
      card.classList.toggle('is-center', distance === 0);
      const hidden = !asList && absolute > (small ? 1 : 3);
      card.setAttribute('aria-hidden', String(hidden)); card.inert = hidden;
      button.tabIndex = asList || distance === 0 ? 0 : -1;
      button.setAttribute('aria-pressed', String(distance === 0));
      card.style.pointerEvents = hidden ? 'none' : 'auto';
      const values = {'--x':`${distance * (small ? 114 : 158) + Math.sign(distance) * Math.min(absolute * 8, 22)}px`, '--y':`${absolute === 0 ? -3 : Math.min(absolute * 8, 28)}px`, '--z':`${-absolute * 78}px`, '--scale':absolute === 0 ? 1.04 : absolute === 1 ? .82 : absolute === 2 ? .66 : .54, '--rot':`${Math.sign(distance) * -22}deg`, '--alpha':hidden ? 0 : absolute === 0 ? 1 : absolute === 1 ? .9 : absolute === 2 ? .66 : .35};
      for (const [key, value] of Object.entries(values)) card.style.setProperty(key, value);
    });
    root.querySelector('[data-move="-1"]').disabled = current <= 0;
    root.querySelector('[data-move="1"]').disabled = current >= list.length - 1;
    const tree = selectedTree();
    panel.hidden = !tree;
    if (tree) {
      viewport.style.setProperty('--shelf-accent', color(tree)); viewport.dataset.selectedBook = tree.id;
      const first = firstMoment(tree), reading = resume(storage, [tree])?.moment || first;
      panel.innerHTML = `<div class="selected-copy"><small>${esc(tree.subject)} · ${tree.moments.length}개의 순간 · 마지막 기록 ${date(tree.updatedAt)}</small><h2>${esc(first.title)}</h2><p>${esc(tree.title)}<br>첫 순간의 마음 · ${esc(first.emotion)}</p></div><div class="selected-actions"><button class="ghost primary" data-do="open" title="${BOOK_IS_READING}">${READ_BOOK} ↗</button>${reading.id !== first.id ? '<button class="ghost" data-do="first">첫 순간부터</button>' : ''}<span class="action-sep" aria-hidden="true"></span><button class="ghost" data-do="workspace">${VIEW_TREE}</button><button class="minor" data-action="export-tree" data-id="${esc(tree.id)}">이 트리 백업 ↓</button><button class="minor danger" data-action="delete-tree" data-id="${esc(tree.id)}" aria-label="${esc(first.title)} 트리 삭제">트리 삭제</button></div>`;
    }
    root.querySelector('.shelf-hint').textContent = !list.length ? '' : asList ? '트리를 고른 뒤 한 번 더 누르면 기억책으로 읽혀요.' : `${current + 1} / ${list.length} · 좌우로 끌거나 방향키로 고르고, 선택한 트리를 한 번 더 눌러 기억책을 펼쳐 보세요.`;
    if (focus) rail.querySelector('.is-center button')?.focus({preventScroll: true});
  }
  function draw() {
    const query = (view.query || '').trim().toLocaleLowerCase();
    list = sorted.filter(tree => (!view.subject || tree.subject === view.subject) && (!query || [tree.subject, tree.title, ...tree.moments.map(m => m.title)].join(' ').toLocaleLowerCase().includes(query)));
    if (!list.some(t => t.id === selection)) selection = list[0]?.id;
    const asList = view.mode === 'list';
    viewport.classList.toggle('list-view', asList); viewport.classList.toggle('is-empty', !list.length);
    // #42 — 움직일 트리가 하나뿐이면 쓰지 않는 좌우 화살표를 감추고 레일을 좁혀 선택 기록을 위로 올린다.
    viewport.classList.toggle('is-single', list.length < 2);
    root.querySelector('.count').textContent = `${list.length}개 / ${trees.length}개`;
    root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === (asList ? 'list' : 'shelf'))));
    rail.innerHTML = list.length ? list.map(tree => `<article class="book-card"><button data-book="${esc(tree.id)}" aria-label="${esc(tree.subject)} · ${esc(firstMoment(tree).title)} 트리 선택">${cover(tree, sorted.indexOf(tree) + 1)}<span class="book-card-meta"><strong>${esc(firstMoment(tree).title)}</strong><span>${tree.moments.length}개의 순간 · ${date(tree.updatedAt)}</span></span></button></article>`).join('') : `<div class="empty"><strong>${trees.length ? '이 이름의 트리는 아직 없어요.' : '첫 트리를 기다리는 자리예요.'}</strong><p>${trees.length ? '다른 이름으로 찾거나 대상 필터를 바꿔 보세요.' : '좋아하는 대상과 간직하고 싶은 순간을 남겨 보세요.<br>저장한 순간이 이곳에서 트리로 자라요.'}</p><button class="ghost primary" data-do="${trees.length ? 'clear' : 'new'}">${trees.length ? '검색과 필터 지우기' : NEW_TREE}</button></div>`;
    updateSelection();
  }
  function move(delta, focus = false) {
    if (!list.length) return;
    const index = Math.max(0, Math.min(list.length - 1, list.findIndex(t => t.id === selection) + delta));
    selection = list[index].id; rememberSelection(); updateSelection(focus);
  }
  function open(tree, fromStart = false) {
    if (!tree) return;
    rememberSelection();
    const moment = fromStart ? firstMoment(tree) : resume(storage, [tree])?.moment || firstMoment(tree);
    actions.openBook(tree.id, moment.id);
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.book) {
      if (suppressClick) { suppressClick = false; return; }
      if (selection === button.dataset.book) open(selectedTree());
      else { selection = button.dataset.book; rememberSelection(); updateSelection(true); }
    } else if (button.dataset.move) move(Number(button.dataset.move));
    else if (button.dataset.mode) { view.mode = button.dataset.mode; draw(); }
    else if (button.dataset.action) actions.library(button.dataset.action, button.dataset.id);
    else if (button.dataset.do === 'new') actions.requestMoment('new');
    else if (button.dataset.do === 'resume') actions.openBook(last.tree.id, last.moment.id);
    else if (button.dataset.do === 'open') open(selectedTree());
    else if (button.dataset.do === 'first') open(selectedTree(), true);
    else if (button.dataset.do === 'workspace') { const tree = selectedTree(); if (tree) { rememberSelection(); actions.openWorkspace(tree.id, firstMoment(tree).id); } }
    else if (button.dataset.do === 'clear') { view.query = ''; view.subject = ''; root.querySelector('input').value = ''; root.querySelector('select').value = ''; draw(); root.querySelector('input').focus(); }
  }, {signal});
  root.querySelector('input').addEventListener('input', event => { view.query = event.target.value; draw(); }, {signal});
  root.querySelector('select').addEventListener('change', event => { view.subject = event.target.value; draw(); }, {signal});
  rail.addEventListener('keydown', event => {
    if (view.mode === 'list') return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1, true); }
  }, {signal});
  rail.addEventListener('pointerdown', event => {
    if (view.mode === 'list' || event.button !== 0) return;
    suppressClick = false; drag = {x:event.clientX, y:event.clientY, id:event.pointerId};
  }, {signal});
  rail.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) { suppressClick = true; move(dx < 0 ? 1 : -1); }
    drag = null;
  }, {signal});
  rail.addEventListener('pointercancel', () => { drag = null; suppressClick = false; }, {signal});
  const resize = new ResizeObserver(() => updateSelection()); resize.observe(rail);
  draw();
  track(() => resize.disconnect());
  return dispose;
}
