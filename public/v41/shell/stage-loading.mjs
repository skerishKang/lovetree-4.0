// #1026 — 내용이 늦을 때 무대에 '불러오는 중'을 먼저 띄우고, 내용이 오면 한 번에 바꾼다.
// 빠른 조건(0.8초 안 도착)에서는 표시 자체가 뜨지 않는다. 자리 밀림(CLS)이 없도록 덮개는 Absolutely positioned.
export function createStageLoading(deps) {
  const $ = deps.$;
  const el = $('stage-loading');
  const text = $('stage-loading-text');
  const retry = $('stage-loading-retry');
  let delayTimer = 0, slowTimer = 0, pollTimer = 0;
  let active = false, kind = '';

  function clearTimers() {
    clearTimeout(delayTimer); clearTimeout(slowTimer); clearInterval(pollTimer);
    delayTimer = slowTimer = pollTimer = 0;
  }
  function contentReady() {
    if (kind === 'home') {
      try {
        const frame = $('view');
        const orbit = frame?.contentDocument?.querySelector('#orbit');
        return !!(orbit?.shadowRoot?.querySelector('.card'));
      } catch { return false; }
    }
    if (kind === 'explore') {
      const panel = document.querySelector('#community-panel[open]');
      if (!panel) return false;
      if (panel.querySelector('#community-list .community-card')) return true;
      const title = panel.querySelector('.moments-title');
      return !!title && !!(title.textContent || '').trim();
    }
    return false;
  }
  function show() {
    if (!active || !el) return;
    el.hidden = false;
    if (deps.isMotionOff?.()) el.classList.add('is-still');
    requestAnimationFrame(() => el.classList.add('is-on'));
  }
  function showSlow() {
    if (!active || !text || !retry) return;
    text.hidden = true;
    retry.hidden = false;
  }
  function ready() {
    if (!active) return;
    clearTimers();
    active = false;
    kind = '';
    if (!el) return;
    el.classList.remove('is-on');
    const done = () => {
      el.hidden = true;
      if (text) text.hidden = false;
      if (retry) retry.hidden = true;
      el.classList.remove('is-still');
    };
    if (deps.isMotionOff?.()) done();
    else setTimeout(done, 200);
  }
  function cancel() {
    clearTimers();
    active = false;
    kind = '';
    if (!el || el.hidden) return;
    el.classList.remove('is-on', 'is-still');
    el.hidden = true;
    if (text) text.hidden = false;
    if (retry) retry.hidden = true;
  }
  function start(next) {
    cancel();
    if (!el) return;
    kind = next;
    active = true;
    if (contentReady()) { ready(); return; }
    delayTimer = setTimeout(show, 800);
    slowTimer = setTimeout(showSlow, 10000);
    pollTimer = setInterval(() => { if (contentReady()) ready(); }, 120);
  }
  if (retry) retry.onclick = () => { try { location.reload(); } catch {} };
  return { start, ready, cancel };
}
