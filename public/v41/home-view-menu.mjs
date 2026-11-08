// 첫 화면 오른쪽 위 "보기 ▾" 메뉴 (#231 후속, 2026-11-11).
// 2026-11-08 #213 2번에서 v41/home.js 안에 인라인으로 있던 메뉴 로직을 그대로 옮겼다.
// 조건·문구·id·순서·저장 키·lt41-theme 메시지 모두 변경 0. node에서 불러올 수 있게
// 문서·그림자 루트·저장소·궤도만 deps로 받는다.
import {VIEW_MENU_ID, VIEW_MENU_LABEL, viewMenuGroups, viewMenuInitialIndex, viewMenuItems, viewMenuKey} from '../../v41/home-view-menu.js';

export function createViewMenu(deps) {
  const doc = deps.document;
  const shadow = deps.shadow;
  const storage = deps.storage;
  const readTheme = deps.readTheme;
  const writeTheme = deps.writeTheme;
  const applyTheme = deps.applyTheme;
  const clickWithin = deps.clickWithin;
  const getCardsMode = deps.getCardsMode;
  const isLoggedIn = deps.isLoggedIn;
  const getMotion = deps.getMotion;
  const sendTheme = deps.sendTheme;
  const reload = deps.reload;
  let motionPaused = !!getMotion()?.paused;

  const viewWrap = doc.createElement('span');
  viewWrap.className = 'view-menu-wrap';
  const viewButton = doc.createElement('button');
  viewButton.type = 'button';
  viewButton.className = 'menuBtn view-menu-toggle';
  viewButton.dataset.ltViewMenu = '';
  viewButton.textContent = `${VIEW_MENU_LABEL} ▾`;
  viewButton.setAttribute('aria-haspopup', 'menu');
  viewButton.setAttribute('aria-expanded', 'false');
  viewButton.setAttribute('aria-controls', VIEW_MENU_ID);
  viewButton.setAttribute('aria-label', '보기 설정: 움직임·테마·카드 출처');
  const viewMenu = doc.createElement('div');
  viewMenu.className = 'view-menu';
  viewMenu.id = VIEW_MENU_ID;
  viewMenu.setAttribute('role', 'menu');
  viewMenu.setAttribute('aria-label', '첫 화면 보기 설정');
  viewMenu.hidden = true;

  const currentItems = () => viewMenuItems({theme: readTheme(storage), paused: motionPaused, cardsMode: getCardsMode(), loggedIn: isLoggedIn()});
  const viewItems = () => [...viewMenu.querySelectorAll('[role^=menuitem]')];

  function runViewItem(item) {
    if (item.kind === 'motion') { motionPaused = !!getMotion()?.toggle(); closeViewMenu(true); return; }
    if (item.kind === 'theme') { const theme = writeTheme(storage, item.value === 'garden' ? 'garden' : 'night'); applyTheme(theme); sendTheme(theme); closeViewMenu(true); return; }
    if (item.kind === 'cards') { deps.writeCardsMode(storage, item.value); closeViewMenu(); reload(); }
  }

  function renderViewMenu() {
    viewMenu.replaceChildren();
    for (const [index, group] of viewMenuGroups({theme: readTheme(storage), paused: motionPaused, cardsMode: getCardsMode(), loggedIn: isLoggedIn()}).entries()) {
      if (index) { const sep = doc.createElement('div'); sep.className = 'view-menu-sep'; sep.setAttribute('role', 'separator'); viewMenu.append(sep); }
      for (const item of group.items) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.setAttribute('role', item.role);
        b.setAttribute('aria-checked', String(item.checked));
        b.dataset.ltViewItem = `${item.kind}:${item.value}`;
        b.tabIndex = -1;
        b.textContent = item.label;
        b.onclick = () => runViewItem(item);
        viewMenu.append(b);
      }
    }
  }

  function openViewMenu() {
    renderViewMenu();
    viewMenu.hidden = false;
    viewButton.setAttribute('aria-expanded', 'true');
    const items = viewItems();
    (items[viewMenuInitialIndex(currentItems())] || items[0])?.focus();
  }

  function closeViewMenu(refocus = false) {
    if (viewMenu.hidden) return;
    viewMenu.hidden = true;
    viewButton.setAttribute('aria-expanded', 'false');
    if (refocus) viewButton.focus();
  }

  viewButton.onclick = () => { if (viewMenu.hidden) openViewMenu(); else closeViewMenu(); };
  viewButton.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openViewMenu(); }
    else if (e.key === 'Escape') closeViewMenu();
  });
  viewMenu.addEventListener('keydown', e => {
    const items = viewItems(), index = items.indexOf(doc.activeElement), next = viewMenuKey(e.key, index, items.length);
    if (next.type === 'close') { e.preventDefault(); closeViewMenu(true); }
    else if (next.type === 'focus') { e.preventDefault(); items[next.index]?.focus(); }
    else if (next.type === 'activate') { e.preventDefault(); items[next.index]?.click(); }
  });
  // shadow DOM 바깥 클릭 판정은 카드 메뉴 때 쓰던 clickWithin을 그대로 쓴다(#196).
  doc.addEventListener('click', e => { if (!clickWithin(e, viewWrap)) closeViewMenu(); });
  viewWrap.append(viewButton, viewMenu);
  shadow.querySelector('.top-actions').append(viewWrap);

  return {
    element: viewWrap,
    button: viewButton,
    menu: viewMenu,
    openViewMenu,
    closeViewMenu,
    currentItems,
    isOpen: () => !viewMenu.hidden,
    motionPaused: () => motionPaused
  };
}
