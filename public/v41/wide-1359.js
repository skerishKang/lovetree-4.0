// #1359: 넓은 화면 비교 시안. 운영 반영 전 검토용 코드.
(() => {
  if (innerWidth < 1200) return;
  const screen = document.documentElement.dataset.v41Screen;
  const data = globalThis.LTDEMO?.moments || [];
  const sparse = data.length <= 8;
  document.documentElement.classList.add('lt1359-wide');
  document.documentElement.classList.toggle('lt1359-sparse', sparse);
  if (screen === 'board' && !sparse && globalThis.LT58Model) {
    const original = LT58Model.gridColumns;
    LT58Model.gridColumns = width => width >= 1200
      ? Math.max(original(width), Math.floor((width - 44) / 265))
      : original(width);
  }
  if (screen === 'network' && !sparse && globalThis.LT56Model) {
    const original = LT56Model.networkLayout;
    LT56Model.networkLayout = (moments, opts) => {
      if (innerWidth < 1200 || moments.length <= 8) return original(moments, opts);
      const b = opts.box;
      const grow = Math.min(72, b.w * .045);
      return original(moments, { ...opts, box: { ...b, x: b.x - grow, w: b.w + grow * 2 } });
    };
  }
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
    data.slice(-3).reverse().forEach((moment) => {
      const item = document.createElement('li');
      item.textContent = String(moment.title || moment.name || '이름 없는 순간');
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
