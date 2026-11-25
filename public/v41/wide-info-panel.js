// 넓은 화면에서 기록이 적을 때 보이는 트리 요약 및 최근 순간 안내.
(() => {
  if (innerWidth < 1200) return;
  const screen = document.documentElement.dataset.v41Screen;
  const data = globalThis.LTDEMO?.moments || [];
  const sparse = data.length <= 8;
  document.documentElement.classList.add('lt1359-wide');
  document.documentElement.classList.toggle('lt1359-sparse', sparse);
  if (!sparse) return;
  const mount = () => {
    const app = document.querySelector('.app');
    if (!app || app.querySelector('.lt1359-info')) return;
    const panel = document.createElement('aside');
    panel.className = 'lt1359-info';
    panel.setAttribute('aria-label', '트리와 최근 순간 안내');
    const header = document.createElement('h2');
    header.textContent = '내 트리 한눈에';
    const count = document.createElement('p');
    count.textContent = '기록한 순간 ' + data.length + '개';
    const heading = document.createElement('h3');
    heading.textContent = '최근 순간';
    const list = document.createElement('ol');
    [...data].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 3).forEach((moment) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.momentId = moment.id;
      button.textContent = String(moment.title || moment.name || '이름 없는 순간');
      button.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      });
      button.addEventListener('click', e => {
        e.stopPropagation();
        dispatchEvent(new CustomEvent('lt-wide-open-moment', { detail: { id: moment.id } }));
      });
      item.append(button);
      list.append(item);
    });
    const hint = document.createElement('p');
    hint.className = 'lt1359-next';
    hint.textContent = screen === 'board'
      ? '새 순간을 더하고 보드에서 관계를 이어 보세요.'
      : '순간을 연결하면 기억의 길이 지도에 펼쳐집니다.';
    panel.append(header, count, heading, list, hint);
    app.append(panel);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
