import { EMPTY_STATE, validateState } from './domain.js';

const LOCAL_BACKUP_KEY = 'lovetree.v4.local-before-server.v1';
const SERVER_BACKUP_KEY = 'lovetree.v4.server-before-overwrite.v1';
// 계정을 떠나 보낸 미전송 사본과, 지금 화면 사본이 어느 계정의 것인지 적어 두는 자리.
const PARKED_KEY = 'lovetree.v4.parked-unsent.v1';
const ACCOUNT_KEY = 'lovetree.v4.device-account.v1';

const PHASE_LABEL = {
  local: '이 기기에만 저장',
  localUnavailable: '이 기기 저장도 막혀 있어요',
  checking: '서버 확인 중',
  synced: '서버와 동기화됨',
  syncing: '서버에 저장 중',
  uploadOffered: '이 기기 기록을 서버에 올릴 수 있어요',
  adoptOffered: '서버에 다른 기록이 있어요',
  conflict: '서버 기록이 먼저 바뀌었어요',
  offline: '서버 연결을 확인할 수 없어요',
  checkFailed: '서버 확인을 끝까지 받지 못했어요',
  rejected: '서버가 이 저장을 받지 않았어요'
};

function status({ phase, detail = null, actions = [] }) {
  return { phase, label: PHASE_LABEL[phase], detail, actions };
}

/**
 * 서버 저장 경계와 이 기기 저장을 잇는 층.
 *
 * 규칙은 다섯 개다.
 * 1) 화면의 기준 문서는 항상 이 기기의 로컬 사본이고, 서버는 그 사본을 따른다.
 *    서버 확인이 실패해도 로컬 저장은 중단되지 않는다.
 * 2) 업로드·동기화는 트리·순간 id와 연결을 그대로 보낸다 — id를 다시 만들지 않는다.
 * 3) 서버 문서를 덮어쓰는 결정(최초 업로드·서버 기록 채택·충돌 해결)은 전부 사용자 동작을
 *    요구한다. 자동 재날림이 없다. 단 서버에 아무 문서 없고 이 기기에만 있을 때의 최초
 *    업로드 제안도 버튼 확인을 거친다.
 * 4) 로그아웃·계정 전환에서는 서버 문서를 그 세션의 것으로만 다룬다. 동기화가 끝난 뒤에는
 *    이 기기 사본을 비워 다음 계정에 이전 기록이 보이지 않게 하고, 남은 변경이 있으면
 *    지우지 않고 알린다.
 * 5) `expectedRevision: 0`은 서버에 문서가 없음을 확인한 뒤에만 쓴다.
 */
export function createSyncController(deps) {
  const {
    getState,
    replaceState,
    api,
    storage,
    makeClientKey = () => `front-${Math.random().toString(36).slice(2, 12)}`,
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onChange = () => {},
    navigate = (url) => { globalThis.location.assign(url); }
  } = deps;

  let current = status({ phase: 'local', actions: [{ name: 'login', label: '로그인' }] });
  let listener = () => {};
  let owned = false;
  let revision = null;
  let dirty = false;
  let suppress = false;
  let queued = 0;
  let lastIntended = null;
  // 세션 세대. 로그아웃·다시 로그인은 세대를 올리고, 그 전에 출발한 응답은 버린다.
  // 늦게 도착한 A의 응답이 B의 화면·번호를 채우거나 B 계정으로 올리는 일을 막는다.
  let generation = 0;
  let seenRevision = null;
  let ownerSubject = null;

  const publish = (next) => { current = next; onChange(next); listener(next); return next; };
  const stale = (gen) => gen !== generation;

  function show(next) {
    if (next.phase === 'synced' && dirty) return publish(status({ phase: 'offline', actions: [{ name: 'retry', label: '다시 시도' }] }));
    return publish(next);
  }

  function localDocHasRecords() {
    try { return getState().trees.length > 0; } catch { return false; }
  }

  async function readServer() {
    const answer = await api.get();
    if (answer.ok) return answer;
    if (answer.status === 401 || answer.code === 'unauthenticated') {
      owned = false; revision = null;
      return { closed: 'local' };
    }
    if (answer.status === 503 || answer.code === 'auth_unavailable') return { closed: 'unconfigured' };
    // 시간을 넘긴 것도 연결 확인을 못 한 것과 같은 자리에 둔다 — 다만 문구로 '기다림을 끝냈다'는
    // 사실과 재시도 가능성을 분명히 남긴다.
    if (answer.code === 'timeout') return { closed: 'offline', detail: '확인 응답을 기다리는 시간을 넘겼어요. 다시 시도할 수 있고, 그동안 기록은 이 기기에 안전하게 남아요.' };
    // 401·503 이외의 실패(500·502·504 등)는 '이 기기에만 저장'으로 삼키지 않는다. 서버에 닿았지만
    // 확인이 끝나지 않았다는 사실과 재시도·로그인 진입을 따로 보여 준다.
    if (answer.status === 0) return { closed: 'offline' };
    return { closed: 'rejected', detail: answer.message };
  }

  function adoptLocalOnly(reason, detail) {
    owned = false;
    revision = null;
    ownerSubject = null;
    const fallback = {
      unconfigured: '서버 저장이 아직 켜지지 않았어요. 기록은 이 기기에만 저장돼요.',
      offline: '연결을 확인한 뒤 다시 시도할 수 있어요. 그동안 기록은 이 기기에 안전하게 남아요.',
      rejected: '서버 확인을 끝까지 받지 못했어요. 기록은 이 기기에 안전하게 남아요.'
    };
    return show(status({
      phase: reason === 'offline' ? 'offline' : reason === 'rejected' ? 'checkFailed' : 'local',
      detail: detail ?? fallback[reason] ?? null,
      actions: reason === 'login' || reason === 'local'
        ? [{ name: 'login', label: '로그인' }]
        : [{ name: 'retry', label: '다시 시도' }, { name: 'login', label: '로그인' }]
    }));
  }

  async function start() {
    const gen = generation;
    show(status({ phase: 'checking' }));
    const answer = await readServer();
    if (stale(gen)) return current;
    if (answer.closed) return adoptLocalOnly(answer.closed, answer.detail);

    owned = true;
    revision = answer.revision;
    seenRevision = null;
    ownerSubject = typeof answer.subject === 'string' && answer.subject ? answer.subject : null;
    if (ownerSubject) {
      // 다른 계정으로 갈아탈 때 앞 계정의 사본을 화면에 남기지 않는다.
      const previous = deviceAccount();
      if (previous && previous !== ownerSubject && localDocHasRecords() && !sameDocument(getState(), answer.state) && parkUnsent(previous, getState())) {
        suppress = true;
        try { replaceState(EMPTY_STATE()); } finally { suppress = false; }
      }
      const parked = peekParked(ownerSubject);
      if (parked && !sameDocument(parked, getState())) {
        suppress = true;
        try { replaceState(parked); } finally { suppress = false; }
        dropParked(ownerSubject);
      }
      writeJson(ACCOUNT_KEY, { owner: ownerSubject });
    }
    const serverEmpty = answer.revision === 0;
    const localHas = localDocHasRecords();

    if (serverEmpty && !localHas) return show(status({ phase: 'synced', actions: [{ name: 'logout', label: '로그아웃' }] }));
    if (serverEmpty && localHas) {
      return show(status({
        phase: 'uploadOffered',
        detail: '이 기기에 기록이 있어요. 계정의 서버 기록으로 올릴지는 당신이 정해요.',
        actions: [{ name: 'uploadLocal', label: '서버에 올리기' }, { name: 'logout', label: '로그아웃' }]
      }));
    }
    if (!localHas) return adoptServer(answer.state, { silent: true });
    if (sameDocument(answer.state, getState())) return show(status({ phase: 'synced', actions: [{ name: 'logout', label: '로그아웃' }] }));
    seenRevision = answer.revision;
    return show(status({
      phase: 'adoptOffered',
      detail: '서버에 이미 기록이 있어요. 무엇을 기준으로 고르든 다른 쪽 사본은 이 기기에 백업으로 남아요.',
      actions: [{ name: 'useServer', label: '서버 기록 열기' }, { name: 'useLocal', label: '이 기기 기록 계속 쓰기' }, { name: 'logout', label: '로그아웃' }]
    }));
  }

  function sameDocument(left, right) {
    try { return JSON.stringify(validateState(left)) === JSON.stringify(validateState(right)); } catch { return false; }
  }

  function backupLocal() {
    if (!storage) return false;
    try { storage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(getState())); return true; } catch { return false; }
  }

  // 서버 문서를 덮어쓰는 사용자 결정(계속 쓰기·내 기록으로 덮어쓰기) 직전에만 부른다.
  // 서버에서 방금 읽어 온 문서이므로 저장 실패 여부를 기다리지 않고 조용히 넘긴다.
  function backupServer(serverState) {
    if (!storage || !serverState) return false;
    try { storage.setItem(SERVER_BACKUP_KEY, JSON.stringify(serverState)); return true; } catch { return false; }
  }

  function readJson(key) {
    if (!storage) return null;
    try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function writeJson(key, value) {
    if (!storage) return false;
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }
  function parkedMap() {
    const map = readJson(PARKED_KEY);
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  }
  // 미전송 사본은 계정 식별자로만 보관한다. 다른 계정의 시작·제안·PUT 대상이 되지 않는다.
  function parkUnsent(owner, state) {
    if (!owner || !state) return false;
    const map = parkedMap();
    map[owner] = { state };
    return writeJson(PARKED_KEY, map);
  }
  function peekParked(owner) {
    const row = owner ? parkedMap()[owner] : null;
    if (!row) return null;
    try { return validateState(row.state); } catch { return null; }
  }
  function dropParked(owner) {
    const map = parkedMap();
    if (!Object.prototype.hasOwnProperty.call(map, owner)) return true;
    delete map[owner];
    return writeJson(PARKED_KEY, map);
  }
  function deviceAccount() {
    const row = readJson(ACCOUNT_KEY);
    return row && typeof row.owner === 'string' && row.owner ? row.owner : null;
  }

  function adoptServer(serverState, { silent = false } = {}) {
    suppress = true;
    try {
      backupLocal();
      replaceState(validateState(serverState));
    } finally { suppress = false; }
    dirty = false;
    seenRevision = null;
    return show(status({
      phase: 'synced',
      detail: silent ? null : '서버 기록을 기준으로 삼았어요. 이 기기 기록은 백업으로 남겨 두었어요.',
      actions: [{ name: 'logout', label: '로그아웃' }]
    }));
  }

  function conflictMessage(answer) {
    const step = Number.isSafeInteger(answer.currentRevision) ? ` 서버는 ${answer.currentRevision}번까지 진행됐어요.` : '';
    return `${answer.message ?? '다른 곳에서 먼저 저장했어요.'}${step} 무엇을 남길지 고르면 나머지는 이 기기에 백업으로 남아요.`;
  }

  // 서버는 같은 요청 키·같은 내용이면 첫 결과를 그대로 되돌려 준다(요청 키 멱등).
  // 따라서 응답만 유실된 저장은 같은 키로 다시 보내 conflict가 아니라 복제로 끝난다.
  function attemptFor(expected, serialized) {
    const previous = lastIntended?.kind === 'synced' ? lastIntended.attempt : null;
    if (previous && previous.expected === expected && previous.serialized === serialized) return previous.clientKey;
    return makeClientKey();
  }

  async function push(expected) {
    if (!Number.isSafeInteger(expected)) return start();
    const gen = generation;
    const serialized = JSON.stringify(getState());
    const clientKey = attemptFor(expected, serialized);
    const attempt = { expected, serialized, clientKey };
    show(status({ phase: 'syncing', actions: [] }));
    const answer = await api.put({ state: getState(), expectedRevision: expected, clientKey });
    // 로그아웃·계정 전환 뒤에 도착한 응답은 화면도 번호도 고치지 않는다.
    if (stale(gen)) return current;
    if (answer.ok) {
      revision = answer.revision;
      dirty = false;
      lastIntended = null;
      seenRevision = null;
      return show(status({ phase: 'synced', actions: [{ name: 'logout', label: '로그아웃' }] }));
    }
    if (answer.status === 409 && answer.code === 'revision_conflict') {
      lastIntended = { kind: 'force' };
      seenRevision = Number.isSafeInteger(answer.currentRevision) ? answer.currentRevision : null;
      return show(status({
        phase: 'conflict',
        detail: conflictMessage(answer),
        actions: [{ name: 'pull', label: '서버 최신 기록 열기' }, { name: 'force', label: '내 기록으로 덮어쓰기' }, { name: 'retry', label: '다시 시도' }]
      }));
    }
    if (answer.status === 409 && answer.code === 'client_key_conflict') {
      dirty = true;
      lastIntended = { kind: 'synced' };
      return show(status({ phase: 'rejected', detail: answer.message, actions: [{ name: 'retry', label: '새 요청으로 다시 저장' }] }));
    }
    if (answer.status === 400 || answer.status === 422) {
      dirty = true;
      lastIntended = { kind: 'synced' };
      return show(status({ phase: 'rejected', detail: answer.message ?? '기록 형식을 확인해 주세요.', actions: [{ name: 'retry', label: '다시 시도' }] }));
    }
    dirty = true;
    lastIntended = { kind: 'synced', attempt };
    return show(status({
      phase: answer.status === 0 ? 'offline' : 'rejected',
      detail: answer.status === 0 ? '네트워크에 닿지 않아 이 기기에만 저장한 상태로 남겼어요.' : answer.message,
      actions: [{ name: 'retry', label: '다시 시도' }]
    }));
  }

  async function syncNow() {
    if (!owned || revision === null) return current;
    if (current.phase === 'conflict' || current.phase === 'adoptOffered' || current.phase === 'uploadOffered') return current;
    const gen = generation;
    queued += 1;
    const myTicket = queued;
    await delay(900);
    if (myTicket !== queued) return current;
    if (stale(gen) || !owned) return current;
    if (!dirty) return current;
    return push(revision);
  }

  function markLocalSave() {
    if (suppress) return current;
    dirty = true;
    if (!owned) return current;
    void syncNow();
    return current;
  }

  // 덮어쓰기 직전에 서버를 다시 읽는다. 사용자가 마지막에 본 번호와 다르면
  // 보지 못한 문서를 지우지 않는다 — PUT도 백업도 없이 다시 묻는다.
  async function confirmOverwrite(gen) {
    const fresh = await readServer();
    if (stale(gen)) return { abort: current };
    if (!fresh.ok) return { abort: show(status({ phase: 'offline', detail: '서버 기록을 다시 확인하지 못해 이 기기 기록을 그대로 뒀어요.', actions: [{ name: 'retry', label: '다시 시도' }] })) };
    if (Number.isSafeInteger(seenRevision) && fresh.revision !== seenRevision) {
      seenRevision = fresh.revision;
      return { abort: show(status({
        phase: 'conflict',
        detail: `확인하는 동안 서버가 다시 바뀌었어요. 서버는 ${fresh.revision}번까지 진행됐어요. 무엇을 남길지 다시 골라 주세요.`,
        actions: [{ name: 'pull', label: '서버 최신 기록 열기' }, { name: 'force', label: '내 기록으로 덮어쓰기' }, { name: 'retry', label: '다시 시도' }]
      })) };
    }
    backupServer(fresh.state);
    return { revision: Number.isSafeInteger(fresh.revision) ? fresh.revision : 0 };
  }

  async function act(name) {
    if (name === 'login') {
      generation += 1;
      navigate('/auth/login?next=/');
      return current;
    }
    if (name === 'retry') {
      if (lastIntended?.kind === 'force') return act('force');
      if (lastIntended?.kind === 'synced' && Number.isSafeInteger(revision)) return push(revision);
      return start();
    }
    if (name === 'uploadLocal') {
      if (!dirty && !localDocHasRecords()) return current;
      lastIntended = { kind: 'synced' };
      return push(0);
    }
    if (name === 'useServer' || name === 'pull') {
      const gen = generation;
      const answer = await readServer();
      if (stale(gen)) return current;
      if (!answer.ok) return show(status({ phase: 'offline', detail: '서버 기록을 불러오지 못해 이 기기 기록을 그대로 뒀어요.', actions: [{ name: 'retry', label: '다시 시도' }] }));
      revision = answer.revision;
      return adoptServer(answer.state);
    }
    if (name === 'useLocal' || name === 'force') {
      const step = await confirmOverwrite(generation);
      if (step.abort) return step.abort;
      lastIntended = { kind: 'synced' };
      return push(step.revision);
    }
    if (name === 'logout') {
      const gen = ++generation;
      const answer = await api.logout();
      if (stale(gen)) return current;
      const parked = answer.ok && dirty && ownerSubject ? parkUnsent(ownerSubject, getState()) : false;
      const cleared = answer.ok && (!dirty || parked);
      if (cleared) {
        suppress = true;
        try { replaceState(EMPTY_STATE()); } finally { suppress = false; }
        // 화면이 방금 지운 트리를 가리킨 채 남지 않도록 시작 화면으로 돌아간다.
        navigate('#start');
      }
      owned = false;
      revision = null;
      dirty = false;
      lastIntended = null;
      seenRevision = null;
      ownerSubject = null;
      return show(status({
        phase: 'local',
        detail: cleared
          ? (parked
            ? '로그아웃했어요. 올리지 못한 변경은 이 기기에서 방금 계정의 기록으로 따로 보관했어요. 그 계정으로 다시 들어오면 돌아옵니다.'
            : '로그아웃했어요. 서버 기록은 계정에 남고 이 기기 사본은 비웠어요. 다른 계정으로 들어와도 이전 기록은 보이지 않습니다.')
          : answer.ok ? '동기화되지 않은 변경이 있어 이 기기 기록은 지우지 않았어요. 다른 계정으로 들어와도 보이지 않게 하려면 그 계정으로 다시 들어와 정리해 주세요.' : '서버에서 로그아웃하지 못해 이 기기 기록을 그대로 둡니다.',
        actions: [{ name: 'login', label: '다시 로그인' }]
      }));
    }
    return current;
  }

  // 연결이 돌아왔을 때만 확인한다. 충돌·채택 제안은 사용자가 고르기 전까지 그대로 둔다.
  globalThis.addEventListener?.('online', () => { if (current.phase === 'offline') void start(); });

  return {
    start,
    act,
    markLocalSave,
    status: () => current,
    subscribe: (fn) => { listener = fn; },
    snapshot: () => ({ owned, revision, dirty }),
    backupKey: LOCAL_BACKUP_KEY,
    serverBackupKey: SERVER_BACKUP_KEY,
    sameDocument
  };
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
      const response = await fetchImpl(`${base}${path}`, { credentials: 'same-origin', ...init, ...(controller ? { signal: controller.signal } : {}) });
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

/**
 * 최소 UI. `#toast`처럼 렌더에 지워지지 않는 자리를 골라 한 번만 붙인다.
 * 새 디자인·폰트·용어를 만들지 않고 이미 있는 클래스(`.storage-notice`, `.notice`, `.button small`)만 재사용한다.
 *
 * 자리는 항상 문서 흐름 안이다. 아래에 붙이는 띠는 화면 끝의 행동을 덮는다 —
 * 390px에서는 책장 선택 행동(#63), PC에서는 기억책 페이지 이동 nav와 번호(#64 검토)가 가려졌다.
 * 상태 문구로 높이가 일정하지 않은 오버레이는 여백 조정으로 보장할 수 없다.
 * 넓은 화면은 문서 끝(본문 아래)에 두어 앱이 짜 놓은 화면 높이를 그대로 두고,
 * 좁은 화면은 본문 위에 두어 상태와 로그인 단추가 첫 화면에 남는다.
 */
const NARROW_QUERY = '(max-width: 820px)';
// 서버가 돌려주는 문장은 우리 글이지만, 마크업으로 해석되지 않게 그대로 두지 않는다.
const text = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function mountSync({ controller, doc = globalThis.document, onAdopted = () => {}, onLocalOnly = () => {} }) {
  let bar = doc.getElementById('sync-bar');
  if (!bar) {
    bar = doc.createElement('div');
    bar.id = 'sync-bar';
    bar.className = 'storage-notice';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
  }
  const narrow = () => globalThis.matchMedia?.(NARROW_QUERY)?.matches ?? false;
  const place = () => {
    const wanted = narrow() ? 'narrow' : 'wide';
    if (bar.dataset.syncWidth === wanted && bar.isConnected) return;
    bar.style.cssText = wanted === 'narrow'
      ? 'margin:12px auto 0;width:calc(100% - 36px);flex-wrap:wrap'
      : 'margin:18px auto 24px;width:min(1400px,calc(100% - 80px));flex-wrap:wrap';
    const app = doc.getElementById('app');
    if (wanted === 'narrow' && app) { if (bar !== app.previousElementSibling) doc.body.insertBefore(bar, app); }
    else if (bar !== doc.body.lastElementChild) doc.body.append(bar);
    bar.dataset.syncWidth = wanted;
  };
  globalThis.matchMedia?.(NARROW_QUERY)?.addEventListener?.('change', place);
  globalThis.addEventListener?.('resize', place);
  const paint = (state) => {
    place();
    const actions = state.actions.map((action) => `<button type="button" class="button small sync-action" data-sync-action="${action.name}">${text(action.label)}</button>`).join('');
    bar.innerHTML = `<span class="sync-phase">${text(state.label)}</span>${state.detail ? `<span class="notice">${text(state.detail)}</span>` : ''}${actions}`;
    onAdopted(state);
    onLocalOnly(state);
  };
  bar.dataset.syncPhase = controller.status().phase;
  controller.subscribe?.((state) => { bar.dataset.syncPhase = state.phase; paint(state); });
  // 위임은 document에 건다: 렌더가 body를 다시 채워도 사라지지 않는다.
  doc.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-sync-action]');
    if (button) void controller.act(button.dataset.syncAction);
  });
  paint(controller.status());
  return bar;
}
