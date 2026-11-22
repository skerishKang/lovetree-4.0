// 셸의 로그인 시작과 세션 연결 (#231 1-B ③-1).
// 2026-11-08 리팩터링: 동작·겉모습·문구·주소 형식 변경 0. shell.mjs에서 조건·조회 방식을 그대로 옮겼다.
// 로그인 화면으로 가는 주소 규칙(테마 lt_theme, 의도 intent)은 member-entry.mjs·header-state.mjs가 그대로 맡는다.
import {memberLoginUrl} from '../member-entry.mjs';
import {readTheme, readLoginIntent, LOGIN_INTENTS} from '../header-state.mjs';

export function createAuth(deps) {
  const {$} = deps;
  const getMember = deps.getMember;
  const notify = deps.notify;
  const closeAccountMenu = deps.closeAccountMenu;
  const openEditor = deps.openEditor;
  const showScreen = deps.showScreen;

  // 로그인 의도(intent)는 주소에서 한 번만 읽고 주소에서는 지운다(새로고침·공유 때 되살아나지 않게).
  let pendingLoginIntent = readLoginIntent(location.search);
  {
    const params = new URLSearchParams(location.search);
    if (params.has('intent')) {
      params.delete('intent');
      const query = params.toString();
      history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
    }
  }
  let pendingLoginIntentShown = pendingLoginIntent;

  // 로그아웃 상태에서 로그인이 필요한 진입점은 안내 창 없이 바로 /auth/login으로 간다(#215).
  // 테마(lt_theme)와 의도(intent)는 주소에 유지한다.
  function startLogin(intent = '') {
    const target = LOGIN_INTENTS.includes(intent) ? intent : '';
    location.assign(memberLoginUrl(readTheme(localStorage), target));
  }
  function openLoginStart(intent = 'first') {
    startLogin(intent === 'first' ? '' : intent);
  }

  // #1134 후속: 401(갱신 재시도 뒤)이 나도 바로 로그아웃 처리하지 않는다. 2초·5초 뒤 두 번 세션을 다시 확인해
  // 둘 다 401일 때만 로그아웃 상태로 바꾸고 안내한다. 중간에 성공하면 아무 표시 없이 그대로 둔다.
  // 다시 확인하는 동안 같은 401이 여러 번 와도 확인은 한 벌만 한다.
  let rechecking = false;
  let recheckPromise = null;
  const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const checkSession = deps.checkSession || (async () => false);
  async function recheckTwice() {
    await sleep(2000);
    if (await checkSession().catch(() => false)) return true;
    await sleep(3000);
    if (await checkSession().catch(() => false)) return true;
    return false;
  }
  function applyAuthExpired() {
    deps.onAuthRequired?.();
    $('account-entry').textContent = '로그인';
    $('account-entry').hidden = false;
    $('account-avatar').hidden = true;
    closeAccountMenu();
    // #368: 안내 줄은 설정 창 상태 줄·토스트(notify)가 한 벌로 맡는다.
    notify('로그인 확인이 필요해요. 다시 로그인해 주세요.');
  }
  function authRequired() {
    if (!getMember()?.snapshot().owned) return Promise.resolve();
    if (rechecking) return recheckPromise;
    rechecking = true;
    recheckPromise = recheckTwice().then(ok => { rechecking = false; if (!ok) applyAuthExpired(); });
    return recheckPromise;
  }

  // 로그인하고 돌아왔을 때 의도한 화면으로 이어 준다(new-tree → 첫 여정, shelf → 내 트리).
  function consumeLoginIntent(snapshot) {
    if (!pendingLoginIntent) return '';
    const intent = pendingLoginIntent;
    pendingLoginIntent = '';
    if (intent === 'new-tree' && snapshot.writable) openEditor('new');
    else if (intent === 'shelf') showScreen('track32-bookshelf.html');
    return intent;
  }

  return {
    startLogin,
    openLoginStart,
    authRequired,
    consumeLoginIntent,
    pendingIntent: () => pendingLoginIntent,
    pendingIntentShown: () => pendingLoginIntentShown
  };
}
