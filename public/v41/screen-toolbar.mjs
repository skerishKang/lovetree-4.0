// #1091: 상단 메뉴 아래 화면 도구 줄 한 벌. 책·보드가 각자 그리던 줄 대신 이 부품을 호출한다.
// 서재는 #1154가 상단을 바꾸는 중이라 아직 붙이지 않는다.
export function mountScreenToolbar({ screen, titleFrom, tools = [] }) {
  const bar = document.createElement('div');
  bar.className = 'lt-screen-toolbar';
  bar.dataset.screen = screen;
  const title = document.createElement('span');
  title.className = 'lt-toolbar-title';
  const group = document.createElement('div');
  group.className = 'lt-toolbar-tools';
  const more = document.createElement('button');
  more.className = 'lt-toolbar-more';
  more.type = 'button';
  more.textContent = '…';
  more.hidden = true;
  const menu = document.createElement('div');
  menu.className = 'lt-toolbar-menu';
  menu.hidden = true;
  bar.append(title, group, more, menu);
  const header = document.querySelector('header');
  (header || document.body).after(bar);

  const sync = () => { title.textContent = (titleFrom?.textContent || '').trim(); };
  sync();
  if (titleFrom && typeof MutationObserver === 'function') {
    new MutationObserver(sync).observe(titleFrom, { childList: true, characterData: true, subtree: true });
  }

  for (const tool of tools) if (tool) group.append(tool);

  let stashed = [];
  const reflow = () => {
    for (const el of stashed) group.append(el);
    stashed = [];
    menu.replaceChildren();
    menu.hidden = true;
    more.hidden = true;
    if (group.scrollWidth <= group.clientWidth) return;
    const items = [...group.children];
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const el = items[i];
      menu.prepend(el);
      stashed.unshift(el);
      if (group.scrollWidth <= group.clientWidth) break;
    }
    more.hidden = false;
  };
  more.addEventListener('click', () => { menu.hidden = !menu.hidden; });
  if (typeof ResizeObserver === 'function') new ResizeObserver(reflow).observe(bar);
  else window.addEventListener('resize', reflow);
  reflow();

  return { bar, title, group, more, menu };
}
