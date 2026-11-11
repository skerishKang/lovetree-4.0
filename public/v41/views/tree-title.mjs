// #417: 보드·지도 머리의 트리 제목 ▾ — 책(#416)과 같은 내용·키보드 동작.
// 목록은 셸이 넘긴 window.parent.LT41(tree·trees)에서 읽고(board.js 관례), 이동은 셸이 듣는
// lt41-open-view 메시지(messages.mjs)로 같은 보기(보드·지도)를 연다. 셸 파일은 부르기만 한다.
// 공유·예시(읽기 전용)에서는 ▾와 ← 내 트리를 숨긴다(셸의 트리 선택도 로그인한 내 기록에서만 보인다).
import {treeTitleText} from '/v41/book-usability.mjs';
import {coverChoice, COVER_PALETTE} from '/v41/views/shelf/shelf-model.mjs';

const t = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function context() {
  try { if (window.parent === window) return null; return window.parent.LT41 || null; } catch { return null; }
}
// 읽기 전용 판정: 셸의 트리 선택(로그인한 내 기록에서만 보임)과 보드 저장 판정(board.js)을 따른다.
function readOnly() {
  const c = context();
  return !c || c.source !== 'server' || c.writable !== true;
}
function describeUrl(value) {
  try { return window.parent.LTMedia?.describe(value) || {kind: 'none', privateFile: false, loadUrl: ''}; }
  catch { return {kind: 'none', privateFile: false, loadUrl: ''}; }
}
// 표지 판정은 책장과 같은 규칙(shelf-model coverChoice)에 맞춘 최소 모양으로 넘긴다.
function coverMomentOf(tree) {
  const raw = (tree.moments || []).find(m => m.id === tree.coverMomentId) || null;
  if (!raw) return null;
  const media = describeUrl(raw.url || '');
  const type = media.kind === 'photo' ? 'photo' : (media.kind === 'video' || media.kind === 'youtube') ? 'video' : raw.url ? 'link' : 'memo';
  const image = media.kind === 'photo' && media.privateFile ? media.loadUrl : (raw.image || '');
  return {id: raw.id, type, image};
}
// 셸 트리 드롭다운(#380)·책(#416)과 같은 순서: 정리 전 트리가 먼저.
function treeRows() {
  const c = context();
  if (!c?.tree) return [];
  const list = Array.isArray(c.trees) && c.trees.length ? c.trees : [c.tree];
  return list.map(tree => ({
    id: tree.id,
    title: tree.title,
    inbox: tree.inbox === true,
    count: tree.moments?.length || 0,
    cover: coverMomentOf(tree),
    coverDesign: tree.coverDesign || '',
    coverMode: tree.coverMode || '',
    coverMomentId: tree.coverMomentId || ''
  })).sort((a, b) => Number(b.inbox) - Number(a.inbox));
}
const countText = row => row.inbox ? '정리 전 ' + row.count : row.count + '개의 순간';
function coverSpan(row, index) {
  const choice = coverChoice({coverMode: row.coverMode, coverMomentId: row.coverMomentId, coverDesign: row.coverDesign, moments: row.cover ? [row.cover] : []}, index, COVER_PALETTE);
  const thumb = choice.coverMedia ? '<img src="' + t(choice.coverMedia) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '';
  return '<span class="tree-cover"' + (choice.design ? ' data-cover-design="' + t(choice.design) + '"' : '') + ' style="background-color:' + t(choice.color) + '" aria-hidden="true">' + thumb + '</span>';
}

export function mountTreeTitle({view}) {
  const trigger = document.getElementById('treeTitleBtn');
  const menu = document.getElementById('treeMenuPanel');
  const title = document.getElementById('treeTitleText');
  const back = document.getElementById('shelfBackBtn');
  if (!trigger || !menu || !title) return;
  const ro = readOnly();
  const caret = trigger.querySelector('.tree-title-caret');
  if (ro) { if (caret) caret.hidden = true; if (back) back.hidden = true; }
  const name = treeTitleText(context()?.tree?.title || '');
  if (name) title.textContent = name;
  // ← 내 트리: 내 트리 전체 보기(책장). 셸이 이미 듣고 있는 lt41-navigate 메시지로 간다.
  if (back && !ro) back.addEventListener('click', () => { parent.postMessage({type: 'lt41-navigate', view: 'track32-bookshelf.html'}, location.origin); });
  // 이 화면을 감춘 채(#view-next) 불러올 때 셸의 접근성 도구가 상세 닫기 단추에 초점을 옮기면,
  // 브라우저가 초점을 '보이는 자리'로 가져오겠다고 .app(overflow:hidden)을 몰래 굴린다. 그러면
  // 머리(← 내 트리·제목)가 화면 위쪽 밖으로 밀려난다. .app은 원래 굴리지 않는 자리이므로
  // 굴림이 생기면 0으로 되돌린다. 근본 고침(숨은 화면에는 초점을 옮기지 않기)은 셸 쪽 몫.
  const app = document.querySelector('.app');
  if (app) app.addEventListener('scroll', () => { if (app.scrollLeft || app.scrollTop) app.scrollTo(0, 0); });
  if (ro) return; /* 공유·예시에서는 트리를 고르지 못한다(셸과 같다) */
  const currentId = () => context()?.tree?.id || '';
  function close() { if (menu.hidden) return; menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  function open() {
    const rows = treeRows();
    if (!rows.length) return;
    const cur = currentId();
    menu.innerHTML = rows.map((row, index) => '<button type="button" role="menuitemradio" class="tree-item" data-tree-id="' + t(row.id) + '" aria-checked="' + (row.id === cur) + '">' + coverSpan(row, index) + '<span class="tree-name">' + t(treeTitleText(row.title)) + '</span><span class="tree-count">' + t(countText(row)) + '</span>' + (row.id === cur ? '<span class="tree-check" aria-hidden="true">✓</span>' : '') + '</button>').join('');
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  }
  trigger.addEventListener('click', e => { e.stopPropagation(); if (menu.hidden) open(); else close(); });
  menu.addEventListener('click', e => {
    const row = e.target.closest('[data-tree-id]');
    if (!row) return;
    close();
    const id = row.dataset.treeId;
    if (!id || id === currentId()) return;
    parent.postMessage({type: 'lt41-open-view', treeId: id, view}, location.origin);
  });
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.tree-title')) close(); });
  // 캡처 단계에서 듣는다 — 메뉴가 열려 있으면 맨 위 겹이므로, 셸이 화면에 붙이는 Esc 닫기
  // (view-a11y의 상세 패널 닫기)보다 먼저 가져간다. 그렇지 않으면 그 닫기 클릭이 '바깥 누르기'로
  // 메뉴까지 닫아 초점을 잃는다.
  document.addEventListener('keydown', e => {
    // Esc: 닫기 전에 단추로 초점을 옮긴다 — 숨긴 뒤에 옮기면 숨겨진 행의 초점 정리가 이긴다.
    if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); e.stopPropagation(); trigger.focus(); close(); return; }
    if (menu.hidden) return;
    const items = [...menu.querySelectorAll('button')], at = items.indexOf(document.activeElement);
    if (at < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'Down') { e.preventDefault(); e.stopPropagation(); items[(at + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'Up') { e.preventDefault(); e.stopPropagation(); items[(at - 1 + items.length) % items.length].focus(); }
  }, true);
}

// 보드·지도 화면만 스스로 붙는다(책은 #416의 자기 구현을 그대로 쓴다).
const screen = document.documentElement.dataset.v41Screen;
if (screen === 'board' || screen === 'network') mountTreeTitle({view: screen});
