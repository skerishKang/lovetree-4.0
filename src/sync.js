import { EMPTY_STATE, validateState } from './domain.js';

const LABELS = {
  checking: '서버 확인 중', login: '저장하려면 로그인해 주세요',
  synced: '서버와 동기화됨', syncing: '서버에 저장 중',
  offline: '서버 연결을 확인할 수 없어요', conflict: '서버 기록이 먼저 바뀌었어요',
  rejected: '서버가 이 저장을 받지 않았어요'
};
function status({ phase, detail = null, actions = [] }) {
  return { phase, label: LABELS[phase], detail, actions };
}

// No browser storage is consulted. Unsaved edits live only in this page and
// must be explicitly retried after a failed server write.
export function createSyncController({getState, replaceState, api,
  makeClientKey = () => `front-${crypto.randomUUID()}`,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onChange = () => {}, navigate = url => globalThis.location.assign(url)}) {
  let current = status({phase:'checking'}), listener = () => {};
  let owned = false, revision = null, dirty = false, generation = 0;
  let queued = 0, inflight = false, attempt = null, seenRevision = null;
  const emit = value => { current = value; onChange(value); listener(value); return value; };
  const actions = { login: [{name:'login',label:'로그인'}], logout: [{name:'logout',label:'로그아웃'}],
    retry: [{name:'retry',label:'다시 시도'}] };

  async function start() {
    const gen = generation;
    emit(status({phase:'checking'}));
    const result = await api.get();
    if (gen !== generation) return current;
    if (!result.ok) {
      owned = false; revision = null; dirty = false; attempt = null;
      replaceState(EMPTY_STATE());
      if (result.status === 401 || result.code === 'unauthenticated')
        return emit(status({phase:'login',actions:actions.login}));
      return emit(status({phase:'offline',detail:'서버를 확인하지 못했어요. 다시 시도해 주세요.',actions:[...actions.retry,...actions.login]}));
    }
    owned = true; revision = result.revision; dirty = false; attempt = null; seenRevision = null;
    replaceState(validateState(result.state));
    return emit(status({phase:'synced',actions:actions.logout}));
  }

  async function push() {
    if (!owned || revision === null || inflight || !dirty || current.phase === 'conflict') return current;
    inflight = true;
    const gen = generation;
    const serial = JSON.stringify(getState());
    if (!attempt || attempt.serial !== serial || attempt.expected !== revision)
      attempt = {serial, expected:revision, key:makeClientKey()};
    const sent = attempt;
    emit(status({phase:'syncing'}));
    let answer;
    try { answer = await api.put({state:JSON.parse(sent.serial),expectedRevision:sent.expected,clientKey:sent.key}); }
    catch { answer = {ok:false,status:0}; }
    inflight = false;
    if (gen !== generation) return current;
    if (answer.ok) {
      revision = answer.revision; attempt = null;
      dirty = JSON.stringify(getState()) !== sent.serial;
      if (dirty) return push();
      return emit(status({phase:'synced',actions:actions.logout}));
    }
    if (answer.status === 401 || answer.code === 'unauthenticated') {
      owned = false; revision = null; attempt = null;
      return emit(status({phase:'login',detail:'로그인이 만료되어 서버에 저장하지 못했어요.',actions:actions.login}));
    }
    if (answer.status === 409 && answer.code === 'revision_conflict') {
      seenRevision = answer.currentRevision;
      return emit(status({phase:'conflict',detail:'서버 기록이 바뀌었어요. 서버 기록을 열거나 현재 입력으로 덮어쓰기를 선택해 주세요.',
        actions:[{name:'pull',label:'서버 기록 열기'},{name:'force',label:'현재 입력으로 덮어쓰기'}]}));
    }
    if (answer.status === 409 && answer.code === 'client_key_conflict') attempt = null;
    return emit(status({phase:answer.status === 0 ? 'offline' : 'rejected',
      detail:'서버에 저장되지 않았어요. 이 화면을 닫기 전에 다시 시도해 주세요.',actions:actions.retry}));
  }

  function markLocalSave() {
    if (!owned || revision === null) return emit(status({phase:'login',actions:actions.login}));
    if (current.phase === 'conflict') { dirty = true; return emit(current); }
    dirty = true; const gen = generation, ticket = ++queued;
    emit(status({phase:'syncing'}));
    void (async () => { await delay(900); if(gen === generation && ticket === queued) await push(); })();
    return current;
  }

  async function act(name) {
    if (name === 'login') { generation++; navigate('/auth/login?next=/'); return current; }
    if (name === 'retry') return dirty ? push() : start();
    if (name === 'pull') {
      const gen = generation, result = await api.get();
      if (gen !== generation) return current;
      if (!result.ok) return emit(status({phase:'offline',detail:'서버 기록을 불러오지 못했어요.',actions:actions.retry}));
      revision = result.revision; dirty = false; attempt = null; seenRevision = null;
      replaceState(validateState(result.state));
      return emit(status({phase:'synced',actions:actions.logout}));
    }
    if (name === 'force') {
      const gen = generation, result = await api.get();
      if (gen !== generation) return current;
      if (!result.ok) return emit(status({phase:'conflict',detail:'서버 기록을 다시 확인하지 못했어요.',actions:[{name:'force',label:'다시 확인'}]}));
      if (Number.isSafeInteger(seenRevision) && result.revision !== seenRevision) {
        seenRevision = result.revision;
        return emit(status({phase:'conflict',detail:'확인하는 동안 서버가 다시 바뀌었어요.',actions:[{name:'pull',label:'서버 기록 열기'},{name:'force',label:'현재 입력으로 덮어쓰기'}]}));
      }
      revision = result.revision; attempt = null;
      emit(status({phase:'rejected'}));
      return push();
    }
    if (name === 'logout') {
      if (dirty || inflight) return emit(status({phase:'rejected',detail:'저장되지 않은 변경이 있어요. 먼저 다시 저장해 주세요.',actions:actions.retry}));
      const gen = ++generation, answer = await api.logout();
      if (gen !== generation) return current;
      if (!answer.ok) return emit(status({phase:'rejected',detail:'로그아웃하지 못했어요.',actions:actions.logout}));
      owned = false; revision = null; replaceState(EMPTY_STATE()); navigate('#start');
      return emit(status({phase:'login',actions:actions.login}));
    }
    return current;
  }
  return {start, act, markLocalSave, status:() => current,
    subscribe:fn => {listener=fn}, snapshot:() => ({owned,revision,dirty})};
}

/** 서버 저장 API의 fetch 경계. 응답 형상은 `server/http.js`가 주는 닫힌 JSON 그대로 다룬다. */
// 확인·저장을 기다리는 상한. Pages 프록시 자체 상한(15초, `functions/_lib/proxy.js`)보다 짧게 두어
// 서버가 자기 문구를 먼저 닫고, 화면은 그 전에 실패 안내와 재시도·로그인 진입을 되찾는다.
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

export function createWorkspaceApi({ fetchImpl = (...args) => globalThis.fetch(...args), base = '', timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  async function call(path, init, { requiresRevision = false, requiresState = false } = {}) {
    // 타이머는 응답 본문까지 읽고 나서 해제한다. 본문을 다 읽지 못한 채 끝나면 아직 성공이 아니다.
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let expired = false;
    const timer = controller ? setTimeout(() => { expired = true; controller.abort(); }, Math.max(0, timeoutMs)) : null;
    try {
      const request = () => fetchImpl(`${base}${path}`, { credentials: 'same-origin', ...init, ...(controller ? { signal: controller.signal } : {}) });
      let response = await request();
      // Web Locks serializes refresh across tabs: retry after acquiring the lock
      // first, since another tab might already have rotated the credential.
      const sharedSession = /(?:^|;\s*)__Host-lovetree-shared=1(?:;|$)/.test(globalThis.document?.cookie || '');
      if (response.status === 401 && path.startsWith('/api/') && sharedSession) {
        const refreshAndRetry = async () => {
          const retry = await request();
          if (retry.status !== 401) return retry;
          const refreshed = await fetchImpl(`${base}/auth/refresh`, { method: 'POST', credentials: 'same-origin', ...(controller ? { signal: controller.signal } : {}) });
          return refreshed.ok ? request() : retry;
        };
        response = globalThis.navigator?.locks?.request
          ? await globalThis.navigator.locks.request('lovetree-shared-auth-refresh', refreshAndRetry)
          : await refreshAndRetry(); // Server grace covers overlapping tabs without Web Locks.
      }
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
      // 모양뿐 아니라 문서 검증까지 통과해야 서버 기록으로 다룬다.
      const documentOk = (state) => { try { validateState(state); return true; } catch { return false; } };
      const shaped = Number.isSafeInteger(payload?.revision) && (!requiresState || documentOk(payload.state));
      if (response.ok && requiresRevision && !shaped) {
        // 정적 프리뷰는 없는 API 경로에 index.html을 200으로 돌려준다. 문서가 아닌 응답을
        // 성공으로 읽으면 없는 서버 기록을 들이밀게 되므로 미설정으로 다룬다.
        return { ok: false, status: 503, code: 'storage_unavailable', message: null, currentRevision: undefined, revision: undefined, subject: null, savedAt: null, state: null };
      }
      return {
        ok: response.ok,
        status: response.status,
        code: payload?.error?.code ?? null,
        message: payload?.error?.message ?? null,
        currentRevision: payload?.error?.currentRevision ?? undefined,
        revision: Number.isSafeInteger(payload?.revision) ? payload.revision : undefined,
        subject: typeof payload?.subject === 'string' && payload.subject ? payload.subject : null,
        savedAt: payload?.savedAt ?? null,
        state: payload?.state ?? null
      };
    } catch (error) {
      // AbortError는 우리가 시간을 넘긴 자리다. 저장(PUT)에서 이 경로를 타면 요청 키를
      // 유지한 채 다시 보내므로, 서버가 이미 커밋한 경우는 복제 회신으로 끝난다.
      const timedOut = expired || error?.name === 'AbortError';
      return { ok: false, status: 0, code: timedOut ? 'timeout' : 'network', message: null };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  return {
    get: () => call('/api/workspace', { method: 'GET', headers: { accept: 'application/json' } }, { requiresRevision: true, requiresState: true }),
    put: (body) => call('/api/workspace', {
      method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body)
    }, { requiresRevision: true }),
    logout: () => call('/auth/logout', { method: 'POST', headers: { accept: 'application/json' } })
  };
}

// Save failures are temporary notices; normal sync states do not occupy the page.
export function mountSync({ controller, notify = () => {} }) {
  controller.subscribe(state => {
    if (!controller.snapshot().dirty || !['offline', 'rejected', 'conflict', 'login'].includes(state.phase)) return;
    const message = state.phase === 'login'
      ? '저장하지 못했어요. 오른쪽 위 로그인 버튼을 눌러 주세요.'
      : state.detail || '저장하지 못했어요. 다시 시도해 주세요.';
    const actions = state.actions.filter(action => ['retry', 'pull', 'force'].includes(action.name));
    notify(message, actions, name => controller.act(name));
  });
}
