import { EMPTY_STATE, validateState } from './domain.mjs';

const LABELS = {
  checking: '서버 확인 중', login: '저장하려면 로그인해 주세요',
  synced: '서버와 동기화됨', syncing: '서버에 저장 중',
  offline: '서버 연결을 확인할 수 없어요', conflict: '서버 기록이 먼저 바뀌었어요',
  rejected: '서버가 이 저장을 받지 않았어요'
};
function status({ phase, detail = null, actions = [] }) {
  return { phase, label: LABELS[phase], detail, actions };
}

const PENDING_DRAFT_PREFIX = 'lovetree.v41.pending-write:';
function pendingDraftKey(subject) {
  return typeof subject === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(subject)
    ? `${PENDING_DRAFT_PREFIX}${subject}` : null;
}

// 브라우저(sessionStorage)에만 남은 미저장 기록이 있는지 본다. 지우지 않고 표시만 한다.
// 계정을 모르면(로그아웃 401) 남아 있는 키 중 하나라도 있으면 참이다.
export function hasPendingDraft(storage, subject = null) {
  if (!storage) return false;
  try {
    if (subject) {
      const key = pendingDraftKey(subject);
      return !!key && storage.getItem(key) !== null;
    }
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(PENDING_DRAFT_PREFIX)) return true;
    }
    return false;
  } catch { return false; }
}

// A failed, authenticated write may cross a full-page re-login. Keep its
// one-tab retry buffer in sessionStorage, scoped to the same account only.
export function createSyncController({getState, replaceState, api, draftStorage = null,
  makeClientKey = () => `front-${crypto.randomUUID()}`,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onChange = () => {}, navigate = url => globalThis.location.assign(url)}) {
  let current = status({phase:'checking'}), listener = () => {};
  let owned = false, revision = null, dirty = false, generation = 0, activeSubject = null;
  let queued = 0, inflight = false, attempt = null, seenRevision = null;
  const emit = value => { current = value; onChange(value); listener(value); return value; };
  const actions = { login: [{name:'login',label:'로그인'}], logout: [{name:'logout',label:'로그아웃'}],
    retry: [{name:'retry',label:'다시 시도'}] };

  function clearPendingDraft(subject = activeSubject) {
    const key = pendingDraftKey(subject);
    if (!draftStorage || !key) return;
    try { draftStorage.removeItem(key); } catch { /* session storage may be unavailable */ }
  }

  function savePendingDraft(sent) {
    const key = pendingDraftKey(activeSubject);
    if (!draftStorage || !key) return;
    try {
      draftStorage.setItem(key, JSON.stringify({
        version: 1, subject: activeSubject, expectedRevision: sent.expected,
        clientKey: sent.key, state: JSON.parse(sent.serial)
      }));
    } catch { /* quota or browser policy: keep the in-page retry state */ }
  }

  function readPendingDraft(subject) {
    const key = pendingDraftKey(subject);
    if (!draftStorage || !key) return null;
    let raw;
    try { raw = draftStorage.getItem(key); } catch { return null; }
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw);
      if (draft?.version !== 1 || draft.subject !== subject ||
          !Number.isSafeInteger(draft.expectedRevision) || draft.expectedRevision < 0 ||
          typeof draft.clientKey !== 'string' || !draft.clientKey || draft.clientKey.length > 200) throw new Error('invalid_pending_draft');
      const state = validateState(draft.state);
      return { key, state, serial: JSON.stringify(state), expectedRevision: draft.expectedRevision, clientKey: draft.clientKey };
    } catch {
      clearPendingDraft(subject);
      return null;
    }
  }

  function restorePendingDraft(subject, serverRevision) {
    const draft = readPendingDraft(subject);
    if (!draft) return false;
    replaceState(draft.state);
    dirty = true;
    attempt = { serial: draft.serial, expected: draft.expectedRevision, key: draft.clientKey };
    if (draft.expectedRevision === serverRevision) {
      return emit(status({phase:'rejected',detail:'로그인 전에 저장하지 못한 내용을 복원했어요. 다시 저장해 주세요.',actions:actions.retry}));
    }
    seenRevision = serverRevision;
    return emit(status({phase:'conflict',detail:'로그인 전에 저장하지 못한 내용을 복원했어요. 서버 기록을 확인한 뒤 선택해 주세요.',
      actions:[{name:'pull',label:'서버 기록 열기'},{name:'force',label:'복원한 내용으로 덮어쓰기'}]}));
  }

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
    owned = true; revision = result.revision; dirty = false; attempt = null; seenRevision = null; activeSubject = result.subject || null;
    replaceState(validateState(result.state));
    if (restorePendingDraft(activeSubject, revision)) return current;
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
      clearPendingDraft();
      dirty = JSON.stringify(getState()) !== sent.serial;
      if (dirty) return push();
      return emit(status({phase:'synced',actions:actions.logout}));
    }
    if (answer.status === 401 || answer.code === 'unauthenticated') {
      savePendingDraft(sent);
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
      clearPendingDraft();
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
