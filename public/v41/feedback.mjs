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
export function createFeedbackDialog({$, notify, getContext, show, openMyPosts, onSent, api = createFeedbackApi()}) {
  const dialog = $('feedback-panel');
  if (!dialog) return {open() {}};
  const form = $('feedback-form');
  const done = $('feedback-done');
  const error = $('feedback-error');
  const body = $('feedback-body');
  const count = $('feedback-count');
  const send = $('feedback-send');
  const treeField = $('feedback-tree-field');
  // #1072 A-16: 최근 오류 기록(최대 20건)을 '함께 보낼 정보'에서 끌 수 있다. 기록이 없으면 칸 자체를 숨긴다.
  const reportField = $('feedback-report-field');
  const category = $('feedback-category');
  const title = $('feedback-title');
  const note = $('feedback-note');
  const doneLoggedIn = $('feedback-done-logged-in');
  const doneLoggedOut = $('feedback-done-logged-out');
  const doneNo = $('feedback-done-no');
  const myPosts = $('feedback-open-myposts');
  const TITLE_FORM = '의견 보내기';
  const TITLE_DONE = '의견을 보냈어요';

  function loggedIn() {
    const base = (typeof getContext === 'function' ? getContext() : {}) || {};
    return Boolean(base.loggedIn);
  }

  function selectedContext() {
    const base = (typeof getContext === 'function' ? getContext() : {}) || {};
    const out = {};
    for (const box of dialog.querySelectorAll('[data-ctx]')) {
      const key = box.dataset.ctx;
      // #1072 A-16: 빈 목록(예: 아직 오류 기록이 없음)은 '함께 보낼 정보'에 실지 않는다.
      if (Array.isArray(base[key]) && !base[key].length) continue;
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
    if (doneNo) { doneNo.hidden = true; doneNo.textContent = ''; }
    if (send) send.disabled = false;
    // #631: 보낸 뒤 화면이 남지 않게 제목·안내·단추 글자를 보내기 전 모양으로 되돌린다.
    if (title) title.textContent = TITLE_FORM;
    if (note) note.hidden = false;
    const signed = loggedIn();
    if (doneLoggedIn) doneLoggedIn.hidden = !signed;
    if (doneLoggedOut) doneLoggedOut.hidden = signed;
    // 내 트리를 보던 중이 아니면(트리 id가 없으면) 트리 id 칸을 숨긴다.
    const base = (typeof getContext === 'function' ? getContext() : {}) || {};
    if (treeField) treeField.hidden = !base.treeId;
    if (reportField) reportField.hidden = !(Array.isArray(base.recentErrors) && base.recentErrors.length);
  }

  function open() {
    reset();
    if (typeof show === 'function') show(); else dialog.showModal();
    body?.focus();
  }

  body?.addEventListener('input', () => { if (count) count.textContent = String(body.value.length); });
  // #631: 보낸 뒤 '내 의견' 바로가기 — 창을 닫고 내 의견 목록을 연다(닫기는 셸이 맡는다).
  myPosts?.addEventListener('click', () => { if (typeof openMyPosts === 'function') openMyPosts(); });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const kind = category?.value || '';
    const text = body.value.trim();
    // #631: 처음에는 아무것도 골라져 있지 않다 — 고르지 않았으면 무엇을 고를지 알려 준다.
    if (!kind) { error.textContent = '어떤 의견인지 골라 주세요.'; category?.focus(); return; }
    if (!text) { error.textContent = '내용을 입력해 주세요.'; body.focus(); return; }
    send.disabled = true;
    error.textContent = '';
    const result = await api.send({category: kind, body: text, context: selectedContext()});
    send.disabled = false;
    if (!result.ok) {
      error.textContent = result.message || '보내지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      return;
    }
    form.hidden = true;
    done.hidden = false;
    // #631: 보낸 뒤에는 제목을 바꾸고 보내기 전 안내('함께 보낼 정보를 고를 수 있어요')를 감춘다.
    if (title) title.textContent = TITLE_DONE;
    if (note) note.hidden = true;
    // #678 후속(회차 지적): 운영센터와 같은 의견 번호를 보낸 직후에도 작게 알린다 — 고객이
    // '제가 보낸 #18번'처럼 말할 수 있게. 번호가 없는 응답(오래된 화면)이면 줄을 감춘다.
    if (doneNo) {
      const feedbackId = Number(result.id);
      doneNo.hidden = !Number.isSafeInteger(feedbackId) || feedbackId <= 0;
      doneNo.textContent = doneNo.hidden ? '' : `의견 #${feedbackId}로 받았어요`;
    }
    const signed = loggedIn();
    if (doneLoggedIn) doneLoggedIn.hidden = !signed;
    if (doneLoggedOut) doneLoggedOut.hidden = signed;
    done.querySelector('.button-row .primary')?.focus();
    // #1273 6번: 응답에 담긴 새 의견을 '내 의견' 목록에 곧바로 넣는다(다시 부르기 전에도 보인다).
    if (typeof onSent === 'function') onSent({id: result.id, status: result.status, createdAt: result.createdAt, kind: result.kind || 'opinion', category: result.category || kind, title: result.title, body: result.body || text});
    if (typeof notify === 'function') notify('의견을 보냈어요. 고마워요.');
  });

  return {open, selectedContext};
}