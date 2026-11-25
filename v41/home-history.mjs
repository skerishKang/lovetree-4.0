export function createHomeHistory(root) {
  const stack = [];
  let restoring = false;
  const scrollState = () => ({
    windowY: window.scrollY,
    appY: root?.shadowRoot?.querySelector('.app')?.scrollTop || 0
  });
  const restoreScroll = value => {
    if (!value) return;
    const apply = () => {
      window.scrollTo(0, value.windowY || 0);
      const app = root?.shadowRoot?.querySelector('.app');
      if (app) app.scrollTop = value.appY || 0;
    };
    apply();
    requestAnimationFrame(apply);
  };
  const setPanel = id => {
    if (id) document.documentElement.dataset.ltHomePanel = id;
    else delete document.documentElement.dataset.ltHomePanel;
  };
  function open(id, close) {
    if (restoring || !id || stack.at(-1)?.id === id) return;
    const previous = history.state || {};
    if (!previous.ltHomeOverlay) history.replaceState({...previous, ltHomeScroll: scrollState()}, '', location.href);
    history.pushState({...history.state, ltHomeOverlay:id}, '', location.href);
    stack.push({id, close});
    setPanel(id);
  }
  function dismiss(id) {
    if (restoring || stack.at(-1)?.id !== id) return;
    if (history.state?.ltHomeOverlay === id) history.back();
    else {stack.pop();setPanel(stack.at(-1)?.id || '');}
  }
  window.addEventListener('popstate', event => {
    const target = event.state?.ltHomeOverlay || '';
    if (stack.length && stack.at(-1).id !== target) {
      const closing = stack.pop();
      restoring = true;
      try { closing.close?.(); } finally { restoring = false; }
      setPanel(stack.at(-1)?.id || '');
      restoreScroll(event.state?.ltHomeScroll);
    }
  });
  return {open,dismiss};
}
