import { EMPTY_STATE, validateState } from './domain.mjs';
import { guardWorkspaceState } from './workspace-guard.mjs';
import { readCachedWorkspace, readLoginSubject, rememberLoginSubject, forgetLoginSubject, writeCachedWorkspace, clearCachedWorkspace } from './workspace-cache.mjs';

const LABELS = {
  checking: '서버 확인 중', login: '저장하려면 로그인해 주세요',
  synced: '서버와 동기화됨', syncing: '서버에 저장 중',
  offline: '서버 연결을 확인할 수 없어요', conflict: '서버 기록이 먼저 바뀌었어요',
  rejected: '서버가 이 저장을 받지 않았어요'
};
function status({ phase, detail = null, actions = [], changes = 0 }) {
  return { phase, label: LABELS[phase], detail, actions, changes };
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
export function createSyncController({getState, replaceState, api, draftStorage = null, cacheStorage = null,
  resolveRevisionConflict = null, makeClientKey = () => `front-${crypto.randomUUID()}`,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onGuard = () => {}, onChange = () => {}, navigate = url => globalThis.location.assign(url)}) {
  let current = status({phase:'checking'}), listener = () => {};
  let owned = false, revision = null, dirty = false, generation = 0, activeSubject = null;
  let queued = 0, inflight = false, attempt = null, seenRevision = null;
  // #977: 형식이 어긋난 트리는 읽을 때 트리 하나씩 검사해 빼고 연다(#986에서 원본 보존은
  // 서버 몫이 됐다 — 서버가 저장할 때 격리 원본을 다시 붙이고, 응답에는 빠진 개수만 온다).
  const adoptState = (raw, quarantined = 0) => {
    const read = guardWorkspaceState(raw);
    // 서버가 읽지 못해 빼 둔 트리는 개수만 응답에 온다. 화면에서도 그 개수로 안내한다.
    if (Number.isSafeInteger(quarantined) && quarantined > 0) read.quarantined = quarantined;
    if (read.skipped.length || read.repaired.length || read.quarantined) onGuard(read);
    replaceState(read.state);
    return read;
  };
  // 이슈 644 3번: 마지막으로 서버에 저장된 뒤 이 화면에서 고친 횟수. 충돌 띠가 "고친 N개"로 알릴 때 쓴다.
  let editCount = 0;
  // 보관본 세대는 로컬 편집마다 증가한다. 늦게 끝난 전송은 뒤 편집의 보관본을 덮지 않는다.
  let draftGeneration = 0;
  let draftBackupFailed = false;
  // 이슈 644 3번: 충돌 띠 문구는 쉬운 말 한 벌만 쓴다 — 고친 개수가 있으면 개수를, 없으면 내용만 말한다.
  const conflictDetail = () => editCount > 0
    ? `다른 곳에서 기록이 바뀌었어요. 이 화면에서 고친 ${editCount}개는 따로 보관해 둘게요.`
    : '다른 곳에서 기록이 바뀌었어요. 이 화면에서 고친 내용은 따로 보관해 둘게요.';
  // 저장본 먼저 그리기는 이 컨트롤러의 첫 start()에서만 한다(재시도가 화면을 옛 기록으로 되돌리지 않게).
  let cachePainted = false;
  const emit = value => { current = value; onChange(value); listener(value); return value; };
  const actions = { login: [{name:'login',label:'로그인'}], logout: [{name:'logout',label:'로그아웃'}],
    retry: [{name:'retry',label:'다시 시도'}], backup: [{name:'backup',label:'백업 내려받기'}] };

  function clearPendingDraft(subject = activeSubject) {
    const key = pendingDraftKey(subject);
    if (!draftStorage || !key) return;
    try { draftStorage.removeItem(key); } catch { /* session storage may be unavailable */ }
  }

  function savePendingDraft(sent, reason = 'auth', savedGeneration = draftGeneration) {
    const key = pendingDraftKey(activeSubject);
    if (!draftStorage || !key) return false;
    // 숨김으로 이미 쓴 최신 세대는 앞 요청의 늦은 401로 교체하지 않는다.
    const previous = readPendingDraft(activeSubject);
    if (previous && previous.draftGeneration > savedGeneration) return true;
    if (previous && previous.draftGeneration === savedGeneration &&
        previous.serial === sent.serial && previous.expectedRevision === sent.expected) return true;
    try {
      draftStorage.setItem(key, JSON.stringify({
        version: 1, subject: activeSubject, expectedRevision: sent.expected,
        clientKey: sent.key, state: JSON.parse(sent.serial), reason, editCount,
        draftGeneration: savedGeneration
      }));
      return true;
    } catch { return false; }
  }

  function clearAcknowledgedDraft(serial) {
    // 성공한 요청 본문과 같은 보관본만 지운다. 그 뒤의 편집은 서버에 저장된 적이 없다.
    const pending = readPendingDraft(activeSubject);
    if (pending?.serial === serial) clearPendingDraft();
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
      return { key, state, serial: JSON.stringify(state), expectedRevision: draft.expectedRevision, clientKey: draft.clientKey,
        reason: draft.reason === 'hide' ? 'hide' : 'auth', editCount: Number.isSafeInteger(draft.editCount) ? draft.editCount : 0,
        draftGeneration: Number.isSafeInteger(draft.draftGeneration) && draft.draftGeneration >= 0 ? draft.draftGeneration : 0 };
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
    editCount = draft.editCount;
    draftGeneration = Math.max(draftGeneration, draft.draftGeneration);
    attempt = { serial: draft.serial, expected: draft.expectedRevision, key: draft.clientKey };
    // #1045: 창을 닫을 때 기기에 적어 둔 분은 같은 개정이면 곧바로 이어 보낸다.
    // 서버가 이미 앞서면 일반 저장 충돌과 같은 띠·선택지를 보여 준다(자동 덮어쓰기 없음).
    if (draft.reason === 'hide') {
      seenRevision = serverRevision;
      if (draft.expectedRevision === serverRevision) {
        void push();
        return true;
      }
      return emit(status({phase:'conflict',detail:conflictDetail(),changes:editCount,
        actions:[{name:'pull',label:'최신 기록 불러오기'},{name:'force',label:'이 화면 것으로 덮어쓰기'}]}));
    }
    if (draft.expectedRevision === serverRevision) {
      return emit(status({phase:'rejected',detail:'로그인 전에 저장하지 못한 내용을 복원했어요. 다시 저장해 주세요.',actions:actions.retry}));
    }
    seenRevision = serverRevision;
    return emit(status({phase:'conflict',detail:'로그인 전에 저장하지 못한 내용을 복원했어요. 서버 기록을 확인한 뒤 선택해 주세요.',changes:editCount,
      actions:[{name:'pull',label:'최신 기록 불러오기'},{name:'force',label:'복원한 내용으로 덮어쓰기'}]}));
  }

  async function start() {
    const gen = generation;
    emit(status({phase:'checking'}));
    if (!cachePainted) {
      cachePainted = true;
      // A-18: 로그인 표식의 계정과 저장본 계정이 같을 때만 먼저 그린다. 다르거나 모르면 그리지 않고
      // 서버 응답을 기다린다(빈 틀 그대로) — 같은 브라우저를 다른 계정이 쓰면 옛 기록이 잠깐 보였다.
      const cached = readCachedWorkspace(cacheStorage, readLoginSubject(cacheStorage));
      // 저장본은 서버 응답 전 첫 화면용일 뿐이다. phase은 checking 그대로 → 편집 잠금·서버본 우선.
      if (cached) replaceState(cached.state);
    }
    const result = await api.get();
    if (gen !== generation) return current;
    if (!result.ok) {
      owned = false; revision = null; dirty = false; attempt = null;
      replaceState(EMPTY_STATE());
      if (result.status === 401 || result.code === 'unauthenticated') {
        // 인증이 없으면 저장본과 로그인 표식도 남기지 않는다(공용 컴퓨터).
        clearCachedWorkspace(cacheStorage);
        forgetLoginSubject(cacheStorage);
        return emit(status({phase:'login',actions:actions.login}));
      }
      return emit(status({phase:'offline',detail:'서버를 확인하지 못했어요. 다시 시도해 주세요.',actions:[...actions.retry,...actions.login]}));
    }
    owned = true; revision = result.revision; dirty = false; attempt = null; seenRevision = null; editCount = 0; activeSubject = result.subject || null;
    // 서버가 확인한 계정을 로그인 표식으로 남긴다 — 다음 접속에서 같은 계정일 때만 저장본을 먼저 그린다.
    rememberLoginSubject(cacheStorage, activeSubject);
    adoptState(result.state, result.quarantined);
    writeCachedWorkspace(cacheStorage, activeSubject, getState());
    if (restorePendingDraft(activeSubject, revision)) return current;
    return emit(status({phase:'synced',actions:actions.logout}));
  }

  async function push(options = {}) {
    if (!owned || revision === null || inflight || !dirty || current.phase === 'conflict') return current;
    inflight = true;
    const gen = generation;
    const serial = JSON.stringify(getState());
    if (!attempt || attempt.serial !== serial || attempt.expected !== revision)
      attempt = {serial, expected:revision, key:makeClientKey()};
    const sent = attempt;
    emit(status({phase:'syncing'}));
    let answer;
    try { answer = await api.put({state:JSON.parse(sent.serial),expectedRevision:sent.expected,clientKey:sent.key}, {keepalive:options.keepalive === true}); }
    catch { answer = {ok:false,status:0}; }
    inflight = false;
    if (gen !== generation) return current;
    if (answer.ok) {
      revision = answer.revision; attempt = null; editCount = 0;
      const latestSerial = JSON.stringify(getState());
      dirty = latestSerial !== sent.serial;
      if (dirty) {
        // 앞 PUT만 성공했다. 숨김 보관본의 뒷편집은 새 서버 개정으로 이어 보내되
        // 그 응답까지 보관본을 유지한다(먼저 온 성공 응답은 뒤 내용을 지우지 못한다).
        const pending = readPendingDraft(activeSubject);
        if (pending?.reason === 'hide') {
          attempt = {serial:latestSerial,expected:revision,key:makeClientKey()};
          if (!savePendingDraft(attempt, 'hide')) draftBackupFailed = true;
        }
        return push();
      }
      clearAcknowledgedDraft(sent.serial);
      draftBackupFailed = false;
      return emit(status({phase:'synced',actions:actions.logout}));
    }
    if (answer.status === 401 || answer.code === 'unauthenticated') {
      // 응답 대기 중 새 편집이 생겼다면 오래된 sent가 아니라 화면의 현재 본문을 보관한다.
      const serialNow = JSON.stringify(getState());
      const pending = readPendingDraft(activeSubject);
      const key = pending?.serial === serialNow && pending.expectedRevision === sent.expected
        ? pending.clientKey : serialNow === sent.serial ? sent.key : makeClientKey();
      const kept = savePendingDraft({serial:serialNow,expected:sent.expected,key});
      draftBackupFailed = !kept;
      owned = false; revision = null; attempt = null;
      return emit(status({phase:'login',detail:kept
        ? '로그인이 만료되어 서버에 저장하지 못했어요.'
        : '로그인이 만료되었고 기기 보관에도 실패했어요. 이 화면을 닫지 말고 기록을 백업해 주세요.',actions:actions.login}));
    }
    if (answer.status === 409 && answer.code === 'revision_conflict') {
      // 회원 테마의 충돌만 별도로 해결한다. 콜백 없는 기존 동기화는 그대로 유지한다.
      // 해결 중 추가 편집이 생기면 예전 본문으로 새 편집을 지우지 않는다.
      if (resolveRevisionConflict && !options.themeRebased && JSON.stringify(getState()) === sent.serial) {
        let fixed = null;
        inflight = true;
        try {
          fixed = await resolveRevisionConflict({
            state: JSON.parse(sent.serial), expectedRevision: sent.expected,
            currentRevision: answer.currentRevision
          });
        } catch { /* 안전하게 기존 충돌 처리로 돌아간다. */ }
        finally { inflight = false; }
        if (gen !== generation) return current;
        if (fixed && Number.isSafeInteger(fixed.revision) && fixed.revision >= 0 &&
            JSON.stringify(getState()) === sent.serial) {
          fixed.accepted?.();
          revision = fixed.revision; attempt = null; seenRevision = null;
          adoptState(fixed.state, fixed.quarantined);
          writeCachedWorkspace(cacheStorage, activeSubject, getState());
          dirty = fixed.retry === true;
          if (dirty) return push({themeRebased:true});
          editCount = 0;
          clearPendingDraft();
          return emit(status({phase:'synced',actions:actions.logout}));
        }
      }
      // 테마 병합 뒤 서버가 다시 바뀌어도 전체 기록 덮어쓰기를 권하지 않는다.
      // 다음 명시적인 재시도에서 최신 번호와 다시 견준다.
      if (options.themeRebased) return emit(status({
        phase:'rejected',detail:'서버가 다시 바뀌어 테마를 저장하지 못했어요. 다시 시도해 주세요.',
        actions:actions.retry
      }));
      seenRevision = answer.currentRevision;
      // 이슈 644 3번: 띠는 쉬운 말로, 고친 개수를 함께 알린다. 주 단추는 하나(최신 기록 불러오기)이고
      // 덮어쓰기는 셸이 '자세히' 안에 넣는다 — 저장 규칙(개정 번호·충돌 판정)은 그대로다.
      return emit(status({phase:'conflict',detail:conflictDetail(),changes:editCount,
        actions:[{name:'pull',label:'최신 기록 불러오기'},{name:'force',label:'이 화면 것으로 덮어쓰기'}]}));
    }
     if (answer.status === 409 && answer.code === 'client_key_conflict') attempt = null;
     // #1056: 400·413은 다시 보내도 달라지지 않는다 — 서버가 준 문구와 백업 내려받기를 보여 준다.
     // 연결 문제(status 0)와 그 밖의 일시적 오류만 다시 시도로 안내한다.
     if (answer.status === 400 || answer.status === 413) return emit(status({
       phase:'rejected', detail:answer.message || LABELS.rejected, actions:actions.backup
     }));
     return emit(status({phase:answer.status === 0 ? 'offline' : 'rejected',
       detail:draftBackupFailed
         ? '서버 저장과 기기 보관 모두 실패했어요. 이 화면을 닫지 말고 백업해 주세요.'
         : '서버에 저장되지 않았어요. 이 화면을 닫기 전에 다시 시도해 주세요.',
       actions:draftBackupFailed ? [...actions.retry,...actions.backup] : actions.retry}));
  }

  // 숨김·닫힘 때의 마지막 저장(창 닫힘 유실 막음): 900ms 저장 대기 중에 창이 닫히면(탭 닫기·앱 전환·휴대폰 화면 꺼짐)
  // 아직 서버에 못 보낸 바뀜이 영영 사라진다 — 담은 직후 꼬리표 칩을 확정하고 곧장 창을 닫으면 칩은 '확정'으로 보였지만
  // 서버에는 꼬리표가 없었다(운영센터 의견 #35). 페이지가 숨거나 닫히는 순간 keepalive로 즉시 보낸다 — 같은 요청 키로
  // 같은 내용을 보내면 서버가 같은 요청으로 묶으니(되묻기 안전) 눌러 보내도 어긋나지 않고, 창이 살아 돌아오면 이 push가
  // 답을 받아 상태를 맞춘다. keepalive 몸통 한도(64KB)를 넘는 큰 기록이나 요청이 이미 나간 중이면
  // 보내지 않는 대신 미전송분을 기기 보관함에 동기로 적는다(#1045) — 다음 접속이 개정을 견줘 이어 보낸다.
  function flushOnHide() {
    if (!owned || revision === null || !dirty || current.phase === 'conflict') return false;
    const serial = JSON.stringify(getState());
    if (!attempt || attempt.serial !== serial || attempt.expected !== revision)
      attempt = {serial, expected:revision, key:makeClientKey()};
    // 숨기기 전에 먼저 동기 보관한다. 작은 keepalive도 네트워크가 끊기면 도달하지 않는다.
    const saved = savePendingDraft(attempt, 'hide');
    draftBackupFailed = !saved;
    if (!saved) emit(status({phase:'rejected',
      detail:'기기에 기록을 보관하지 못했어요. 이 화면을 닫지 말고 백업해 주세요.',actions:actions.backup}));
    // keepalive는 글자 수가 아니라 전체 PUT 본문의 UTF-8 바이트로 판단한다.
    // 64KiB 한도에 헤더·부가 필드를 위한 여유를 둔다.
    const bytes = new TextEncoder().encode(JSON.stringify({
      state:JSON.parse(serial),expectedRevision:revision,clientKey:attempt.key,expectedSubject:activeSubject
    })).byteLength;
    if (inflight || bytes > 60000) return false;
    void push({ keepalive: true });
    return true;
  }

  // 이슈 644 3번: 다른 곳에서 기록이 바뀌었는지 조용히 확인한다. 이 화면에서 고친 게 없을 때만 서버 기록을
  // 그대로 받아 온다(띠·확인 없음). 고친 게 있으면 아무것도 하지 않는다 — 충돌 판정은 저장(push) 때 그대로 한다.
  async function check() {
    if (!owned || revision === null || dirty || inflight || current.phase === 'conflict') return current;
    const gen = generation, result = await api.get();
    if (gen !== generation || dirty || inflight) return current;
    if (!result.ok || result.revision === revision) return current;
    revision = result.revision; seenRevision = null;
    adoptState(result.state, result.quarantined);
    writeCachedWorkspace(cacheStorage, activeSubject, getState());
    return emit(status({phase:'synced',actions:actions.logout}));
  }

  function markLocalSave() {
    if (!owned || revision === null) return emit(status({phase:'login',actions:actions.login}));
    if (current.phase === 'conflict') { dirty = true; editCount += 1; return emit(current); }
    dirty = true; editCount += 1; draftGeneration += 1; const gen = generation, ticket = ++queued;
    emit(status({phase:'syncing'}));
    void (async () => { await delay(900); if(gen === generation && ticket === queued) await push(); })();
    return current;
  }

  async function act(name) {
    if (name === 'login') {
      // A-18: 새 로그인은 지금 확인된 계정이 없다는 뜻 — 표식을 비우고 로그인 화면으로 보낸다.
      generation++;
      forgetLoginSubject(cacheStorage);
      navigate('/auth/login?next=/');
      return current;
    }
    if (name === 'check') return check();
    if (name === 'retry') return dirty ? push() : start();
    if (name === 'pull') {
      const gen = generation, result = await api.get();
      if (gen !== generation) return current;
      if (!result.ok) return emit(status({phase:'offline',detail:'서버 기록을 불러오지 못했어요.',actions:actions.retry}));
      revision = result.revision; dirty = false; attempt = null; seenRevision = null; editCount = 0;
      clearPendingDraft();
      adoptState(result.state, result.quarantined);
      writeCachedWorkspace(cacheStorage, activeSubject, getState());
      return emit(status({phase:'synced',actions:actions.logout}));
    }
    if (name === 'force') {
      const gen = generation, result = await api.get();
      if (gen !== generation) return current;
      if (!result.ok) return emit(status({phase:'conflict',detail:'서버 기록을 다시 확인하지 못했어요.',actions:[{name:'force',label:'다시 확인'}]}));
      if (Number.isSafeInteger(seenRevision) && result.revision !== seenRevision) {
        seenRevision = result.revision;
        return emit(status({phase:'conflict',detail:'확인하는 동안 서버가 다시 바뀌었어요. 이 화면에서 고친 내용은 따로 보관해 둘게요.',changes:editCount,
          actions:[{name:'pull',label:'최신 기록 불러오기'},{name:'force',label:'이 화면 것으로 덮어쓰기'}]}));
      }
      revision = result.revision; attempt = null; editCount = 0;
      emit(status({phase:'rejected'}));
      return push();
    }
    if (name === 'logout') {
      if (dirty || inflight) return emit(status({phase:'rejected',detail:'저장되지 않은 변경이 있어요. 먼저 다시 저장해 주세요.',actions:actions.retry}));
      const gen = ++generation, answer = await api.logout();
      if (gen !== generation) return current;
      if (!answer.ok) return emit(status({phase:'rejected',detail:'로그아웃하지 못했어요.',actions:actions.logout}));
      clearCachedWorkspace(cacheStorage, activeSubject);
      forgetLoginSubject(cacheStorage);
      owned = false; revision = null; editCount = 0; replaceState(EMPTY_STATE()); navigate('#start');
      // 4.0의 act('logout')과 같은 알림 — 빠지면 셸이 로그인 상태로 남아 계정 동그라미가 지워지지 않는다.
      return emit(status({phase:'login',actions:actions.login}));
    }
    return current;
  }
  return {start, act, check, markLocalSave, flushOnHide, status:() => current,
    subscribe:fn => {listener=fn}, snapshot:() => ({owned,revision,dirty})};
}
