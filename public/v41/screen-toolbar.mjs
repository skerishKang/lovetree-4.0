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
  const main = document.querySelector('main');
  if (main) main.prepend(bar); // 랜드마크 안에 둔다(화면 내용이 main 밖에 남지 않게).
  else (header || document.body).after(bar);

  // 좌우 여백과 세로 자리는 상단 메뉴의 실제 계산값을 따른다(화면별 하드코딩 없음).
  const align = () => {
    if (!header) return;
    const bottom = Math.round(header.getBoundingClientRect().bottom) + 4;
    bar.style.setProperty('--lt-toolbar-top', `${bottom}px`);
    bar.style.setProperty('--lt-toolbar-pad', getComputedStyle(header).paddingLeft);
    const height = Math.round(parseFloat(getComputedStyle(bar).height) || 52);
    document.documentElement.style.setProperty('--lt-content-top', `${bottom + height}px`);
    document.documentElement.style.setProperty('--lt-toolbar-top', `${bottom}px`);
    document.documentElement.style.setProperty('--lt-toolbar-height', `${height}px`);
  };
  align();

  const sync = () => { title.textContent = (titleFrom?.textContent || '').trim(); };
  sync();
  if (titleFrom && typeof MutationObserver === 'function') {
    new MutationObserver(sync).observe(titleFrom, { childList: true, characterData: true, subtree: true });
  }

  for (const tool of tools) if (tool) group.append(tool);

  let stashed = [];
  const reflow = () => {
    align();
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
