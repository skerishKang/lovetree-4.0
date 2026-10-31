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
