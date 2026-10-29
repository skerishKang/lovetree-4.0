/**
 * 상단 로그인 진입 — 네 화면 상단 바에 같은 행동 하나를 얹는 최소 조각.
 *
 * 새 인증 체계를 만들지 않는다. 상태와 이동은 이미 있는 sync 컨트롤러가 소유하고,
 * 이 조각은 그 상태를 버튼 하나로 보여 줄 뿐이다. 각 화면의 기존 버튼 클래스를
 * 그대로 재사용하므로(orbit .menuBtn·shelf .ghost·book .ui-btn·공통 .button)
 * 화면마다 새 디자인을 만들지 않는다.
 *
 * - `authEntry(snapshot, extraClass)`는 렌더 시점의 버튼 HTML을 돌려준다.
 *   owned(서버 기록을 다루는 자격)면 로그아웃, 아니면 로그인이고 확인·저장 중에는 막는다.
 * - `refreshAuthEntries(doc, snapshot)`는 상태가 바뀔 때 화면을 다시 그리지 않고
 *   열려 있는 버튼의 문구·속성만 맞춘다(#app 직접 자식의 open shadowRoot까지).
 * - 클릭은 main.js의 문서 수준 위임 하나가 받는다(data-auth-action). 그림자 경계를
 *   넘는 클릭이므로 composedPath로 판정한다.
 */

const LABEL = { login: '로그인', logout: '로그아웃' };

// 로그아웃은 확인·저장 중에 누르면 서버 요청이 중복되거나 진행 중인 저장 결과를 잃는다 — 막는다.
// 로그인은 반대다. 서버 확인이 늦거나 멈추면 로그인 진입이 그 상태를 빠져나오는 유일한 길이다 —
// 그러므로 확인 중에는 막지 않는다. 확인 중 클릭은 컨트롤러가 세대를 올려 이전 응답을 버리므로
// 늦게 도착한 답이 새 로그인 경로를 덮지 않는다(`sync.js`의 `generation`).
const LOGOUT_BUSY_PHASES = ['checking', 'syncing'];
const LOGIN_BUSY_PHASES = ['syncing'];

export function authEntryState({ owned = false, phase = 'local' } = {}) {
  const action = owned ? 'logout' : 'login';
  const busy = (action === 'logout' ? LOGOUT_BUSY_PHASES : LOGIN_BUSY_PHASES).includes(phase);
  return { action, label: LABEL[action], busy };
}

export function authEntry(snapshot, extraClass = '') {
  const { action, label, busy } = authEntryState(snapshot ?? {});
  const cls = extraClass ? `${extraClass} auth-entry` : 'auth-entry';
  return `<button class="${cls}" data-auth-action="${action}" aria-label="${label}"${busy ? ' disabled' : ''}>${label}</button>`;
}

export function applyAuthEntry(button, snapshot) {
  if (!button || typeof button.setAttribute !== 'function') return button;
  const { action, label, busy } = authEntryState(snapshot ?? {});
  button.setAttribute('data-auth-action', action);
  button.setAttribute('aria-label', label);
  button.textContent = label;
  button.disabled = busy;
  return button;
}

export function refreshAuthEntries(doc = globalThis.document, snapshot) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  let touched = 0;
  const update = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[data-auth-action]').forEach((button) => { applyAuthEntry(button, snapshot); touched += 1; });
  };
  update(doc);
  doc.querySelectorAll('#app > *').forEach((host) => update(host.shadowRoot));
  return touched;
}
