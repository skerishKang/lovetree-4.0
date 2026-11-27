// 공통 앱 안 확인 창 — 브라우저 기본 확인 창 대신 창 모양 통일(#1109)의 부품을 쓴다.
// 일반 스크립트와 모듈이 같은 함수를 쓰게 전역에 등록한다. 취소가 기본 초점이다.
(function () {
  let dialog = null;
  let pending = null;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'lt-confirm';
    dialog.className = 'lt-confirm';
    dialog.setAttribute('data-lt-panel', 'card');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const message = document.createElement('p');
    message.className = 'lt-confirm-message';
    const row = document.createElement('div');
    row.className = 'button-row';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.id = 'lt-confirm-cancel';
    cancel.textContent = '취소';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.id = 'lt-confirm-ok';
    ok.className = 'primary';
    ok.textContent = '확인';
    row.append(cancel, ok);
    dialog.append(message, row);
    document.body.append(dialog);

    const settle = (value) => {
      const done = pending;
      pending = null;
      if (dialog.open) dialog.close();
      if (typeof done === 'function') done(value);
    };
    cancel.addEventListener('click', () => settle(false));
    ok.addEventListener('click', () => settle(true));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); settle(true); }
      if (event.key === 'Escape') event.stopPropagation();
    });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); settle(false); });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) settle(false); });
    return dialog;
  }

  function ask(message) {
    const el = ensureDialog();
    const text = String(message ?? '').trim();
    el.setAttribute('aria-label', text);
    el.querySelector('.lt-confirm-message').textContent = text;
    if (pending) { const previous = pending; pending = null; previous(false); }
    return new Promise((resolve) => {
      pending = resolve;
      if (!el.open) el.showModal();
      el.querySelector('#lt-confirm-cancel').focus();
    });
  }

  globalThis.LT41Confirm = { ask };
})();
