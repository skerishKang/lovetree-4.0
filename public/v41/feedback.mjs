// 고객 의견 창구 (#540) — 사이트 안 '의견 보내기'. 로그인·로그아웃 모두 같은 창을 쓴다.
// 자동 정보(지금 화면·화면 크기·테마·앱 버전·로그인 여부·내 트리 id)는 보내기 전에 보이고 끌 수 있다.
// 화면 그림 첨부는 2차로 미룬다.

export const FEEDBACK_CATEGORIES = Object.freeze([
  {value: 'bug', label: '이상해요'},
  {value: 'inconvenient', label: '불편해요'},
  {value: 'feature', label: '이런 기능이 있으면 좋겠어요'},
  {value: 'other', label: '그 밖에'}
]);

export function createFeedbackApi({fetchImpl = (...args) => fetch(...args)} = {}) {
  async function send(payload) {
    try {
      const response = await fetchImpl('/api/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {accept: 'application/json', 'content-type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return {ok: false, status: response.status, code: body?.error?.code || 'request_failed', message: body?.error?.message || ''};
      return {ok: true, status: response.status, ...body};
    } catch (error) {
      return {ok: false, status: 0, code: error?.name === 'AbortError' ? 'timeout' : 'offline', message: ''};
    }
  }
  return {send};
}

// getContext(): {screen, viewport, theme, version, loggedIn, treeId} — 셸이 넘긴다.
// show(): 창을 여는 함수(셸의 공통 틀 panel()).
export function createFeedbackDialog({$, notify, getContext, show, api = createFeedbackApi()}) {
  const dialog = $('feedback-panel');
  if (!dialog) return {open() {}};
  const form = $('feedback-form');
  const done = $('feedback-done');
  const error = $('feedback-error');
  const body = $('feedback-body');
  const count = $('feedback-count');
  const send = $('feedback-send');
  const treeField = $('feedback-tree-field');

  function selectedContext() {
    const base = (typeof getContext === 'function' ? getContext() : {}) || {};
    const out = {};
    for (const box of dialog.querySelectorAll('[data-ctx]')) {
      const key = box.dataset.ctx;
      if (box.checked && base[key] !== undefined && base[key] !== null && base[key] !== '') out[key] = base[key];
    }
    return out;
  }

  function reset() {
    form.reset();
    error.textContent = '';
    if (count) count.textContent = '0';
    done.hidden = true;
    form.hidden = false;
    if (send) send.disabled = false;
    // 내 트리를 보던 중이 아니면(트리 id가 없으면) 트리 id 칸을 숨긴다.
    const base = (typeof getContext === 'function' ? getContext() : {}) || {};
    if (treeField) treeField.hidden = !base.treeId;
  }

  function open() {
    reset();
    if (typeof show === 'function') show(); else dialog.showModal();
    body?.focus();
  }

  body?.addEventListener('input', () => { if (count) count.textContent = String(body.value.length); });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const category = form.querySelector('[name="category"]')?.value || '';
    const text = body.value.trim();
    if (!text) { error.textContent = '의견을 입력해 주세요.'; body.focus(); return; }
    send.disabled = true;
    error.textContent = '';
    const result = await api.send({category, body: text, context: selectedContext()});
    send.disabled = false;
    if (!result.ok) {
      error.textContent = result.message || '보내지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      return;
    }
    form.hidden = true;
    done.hidden = false;
    done.querySelector('button')?.focus();
    if (typeof notify === 'function') notify('의견을 보냈어요. 고마워요.');
  });

  return {open, selectedContext};
}