// 화면 접근성 어댑터. 원본 뷰의 구조·시각 결과는 바꾸지 않고,
// 셸이 iframe을 불러온 뒤 이름·키보드·포커스만 보완한다.
export const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export const DIALOGS = Object.freeze([
  ['#archivePanel', 'open'], ['#detail', 'open'], ['#viewer', 'open'], ['#linkModal', 'open'],
  ['#branchModal', 'open'], ['#overview', 'open'], ['#newBookModal', 'hidden'],
  ['#viewerModal', 'open'], ['#addModal', 'open'], ['#editModal', 'open'], ['#whyModal', 'open'],
  ['#nextChooser', 'open'], ['#postAdd', 'show'], ['#branchChooser', 'open']
]);

export const connectionLabel = count => `연결 보기 ${Number.isSafeInteger(Number(count)) ? Number(count) : 0}`;
export const filterLabel = kind => kind === 'media' ? '미디어 필터' : kind === 'keyword' ? '키워드 필터' : '';
export const isSmallTarget = (width, height) => width < 44 || height < 44;

export function nodeStep(index, length, key) {
  if (!length) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (['ArrowRight', 'ArrowDown'].includes(key)) return (Math.max(-1, index) + 1) % length;
  if (['ArrowLeft', 'ArrowUp'].includes(key)) return (index <= 0 ? length : index) - 1;
  return Math.max(0, Math.min(index, length - 1));
}

export function focusWrap(index, length, backward = false) {
  if (!length) return -1;
  if (index < 0) return backward ? length - 1 : 0;
  if (backward) return (index - 1 + length) % length;
  return (index + 1) % length;
}

// 닫힌 뒤 돌아갈 곳: 연결되어 있고 화면에 보이는 opener를 우선하고, 아니면 fallback.
export function focusReturnTarget(opener, fallback) {
  try {
    if (opener?.isConnected && opener.getClientRects?.().length) return opener;
  } catch { /* detached opener */ }
  return fallback;
}

const isOpen = (el, mode) => {
  if (!el) return false;
  if (mode === 'hidden') return !el.classList.contains('hidden') && el.getClientRects().length > 0;
  return el.classList.contains(mode) && el.getClientRects().length > 0;
};
const focusables = root => {
  const view = root.ownerDocument?.defaultView;
  return [...root.querySelectorAll(FOCUSABLE)]
    .filter(el => !el.disabled && el.getClientRects().length > 0 && view?.getComputedStyle(el).visibility !== 'hidden');
};

function installStyle(doc) {
  if (doc.getElementById('lt-a11y-view-style')) return;
  const style = doc.createElement('style');
  style.id = 'lt-a11y-view-style';
  style.textContent = `.lt-a11y-focusable:focus-visible,#stage:focus-visible{outline:2px solid var(--lt-gold,#ffe6a6);outline-offset:3px}.lt-a11y-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}`;
  doc.head.append(style);
}

export function applyViewAccessibility(doc, win = doc?.defaultView) {
  if (!doc?.documentElement || !win || doc.documentElement.dataset.ltA11y === 'on') return;
  doc.documentElement.dataset.ltA11y = 'on';
  installStyle(doc);
  const all = (selector, root = doc) => [...root.querySelectorAll(selector)];

  // 책장: 카드의 접근 가능한 이름은 화면에 보이는 제목·설명에서 그대로 만든다.
  const fixShelf = () => all('button[data-book-id]').forEach(button => button.removeAttribute('aria-label'));
  fixShelf();
  const shelf = doc.querySelector('#shelfViewport');
  if (shelf) new MutationObserver(fixShelf).observe(shelf, { childList: true, subtree: true });

  // 기억책: 가장자리 페이지 넘김 영역은 포인터 보조 영역이므로 이름을 제거한다.
  all('#prevEdge,#nextEdge').forEach(edge => {
    edge.removeAttribute('aria-label');
    edge.setAttribute('aria-hidden', 'true');
  });

  const decorateBookMoments = () => all('#book [data-moment],#mobilePage [data-moment]').forEach(piece => {
    if (piece.dataset.ltA11yMoment === '1') return;
    piece.dataset.ltA11yMoment = '1';
    piece.tabIndex = 0;
    piece.setAttribute('role', 'button');
    piece.classList.add('lt-a11y-focusable');
    piece.addEventListener('keydown', event => {
      if (!['Enter', ' ', 'Spacebar'].includes(event.key)) return;
      event.preventDefault();
      const id = piece.dataset.moment;
      if (typeof win.showDetail === 'function') win.showDetail(id);
      else piece.click();
    });
  });
  decorateBookMoments();
  const book = doc.querySelector('#book');
  if (book) new MutationObserver(decorateBookMoments).observe(book, { childList: true, subtree: true });

  // 기억 보드: 네이티브 select의 이름을 제공한다.
  const media = doc.querySelector('#mediaFilter');
  const keyword = doc.querySelector('#keywordFilter');
  if (media) media.setAttribute('aria-label', filterLabel('media'));
  if (keyword) keyword.setAttribute('aria-label', filterLabel('keyword'));

  const decorateCards = () => all('#cardLayer article.card').forEach(card => {
    if (card.dataset.ltA11yCard === '1') return;
    card.dataset.ltA11yCard = '1';
    card.tabIndex = 0;
    card.classList.add('lt-a11y-focusable');
    card.addEventListener('keydown', event => {
      if (!['Enter', ' ', 'Spacebar'].includes(event.key)) return;
      event.preventDefault();
      const id = card.dataset.id;
      if (typeof win.selectMoment === 'function') win.selectMoment(id, true);
      else card.click();
    });
  });
  decorateCards();
  const cardLayer = doc.querySelector('#cardLayer');
  if (cardLayer) new MutationObserver(decorateCards).observe(cardLayer, { childList: true });

  // 관계 지도: canvas 노드를 화살표 키로 이동하고 이름을 라이브 영역으로 읽는다.
  const canvas = doc.querySelector('#stage[aria-label]');
  if (canvas && win.__lt) {
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', '관계 지도. 화살표 키로 순간을 이동하고 Enter로 순간을 엽니다.');
    let status = doc.getElementById('lt-a11y-node-status');
    if (!status) {
      status = doc.createElement('p');
      status.id = 'lt-a11y-node-status';
      status.className = 'lt-a11y-sr-only';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      doc.body.append(status);
    }
    canvas.setAttribute('aria-describedby', status.id);
    let index = -1;
    const nodes = () => (win.__lt.nodes || []).filter(node => node?.kind === 'moment');
    const announce = node => {
      if (!node) return;
      status.textContent = `${node.title}. ${node.emotion} · ${node.date}. ${index + 1}/${nodes().length}`;
    };
    canvas.addEventListener('keydown', event => {
      const list = nodes();
      if (!list.length || !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Spacebar'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        if (list[index]) win.__lt.selectMoment?.(list[index], true);
        return;
      }
      index = nodeStep(index, list.length, event.key);
      const node = list[index];
      win.__lt.state.hover = node;
      announce(node);
    });
  }

  // 대화상자: 열릴 때 첫 조작 요소로, Tab은 내부에서 순환하고 닫히면 연 곳으로 돌아간다.
  const traps = [];
  const tabHandler = event => {
    if (event.key !== 'Tab' || !traps.length) return;
    const current = traps[traps.length - 1];
    const list = focusables(current.el);
    if (!list.length) { event.preventDefault(); return; }
    const at = list.indexOf(doc.activeElement);
    if (event.shiftKey && at <= 0) { event.preventDefault(); list[list.length - 1].focus(); }
    else if (!event.shiftKey && (at < 0 || at === list.length - 1)) { event.preventDefault(); list[0].focus(); }
  };
  doc.addEventListener('keydown', tabHandler, true);
  // 2026-11-08 #202 후속: 상세 패널은 Esc로도 닫는다. 닫기는 화면의 기존 닫기 버튼과 같은 경로를 타서
  // updateDialogs가 연 곳으로 포커스를 되돌리게 한다. 위에 다른 대화상자가 있으면 건드리지 않는다.
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const current = traps[traps.length - 1];
    if (!current || current.el.id !== 'detail') return;
    const close = current.el.querySelector('.close');
    if (!close) return;
    event.preventDefault();
    close.click();
  }, true);
  const updateDialogs = () => {
    for (const [selector, mode] of DIALOGS) {
      const el = doc.querySelector(selector);
      if (!el) continue;
      const open = isOpen(el, mode);
      const at = traps.findIndex(item => item.el === el);
      if (open && at < 0) {
        const entry = { el, opener: doc.activeElement };
        traps.push(entry);
        if (el.getAttribute('role') === 'dialog' && !el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');
        setTimeout(() => {
          if (traps.includes(entry)) (focusables(el)[0] || el).focus?.();
        }, 0);
      } else if (!open && at >= 0) {
        const [entry] = traps.splice(at, 1);
        if (!traps.length && entry.opener?.isConnected) setTimeout(() => entry.opener.focus?.(), 0);
      }
    }
  };
  updateDialogs();
  new MutationObserver(updateDialogs).observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'inert', 'aria-hidden'] });
}
