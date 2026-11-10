// 빠른 담기 입구: 셸 문서 어디서나 붙여넣기, 공유 시트로 들어온 주소 (2026-11-10).
// 판정·문구·추적은 ../quick-intake.mjs의 순수 함수가 맡는다(docs/TESTING.md).
// 저장은 로컬1 계약(member.apply('quickAdd', {url, mediaMetadata?}))을 그대로 부른다 — 화면은 이름만 쓴다.
import {
  QUICK_INVALID_ERROR, QUICK_SAVED_TEXT, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE, extractDropUrl, parseQuickUrl,
} from '../quick-add.mjs';
import {
  INTAKE_DUP_TEXT, INTAKE_LOGIN_RETRY_TEXT, INTAKE_STEP_LOGIN, INTAKE_STEP_NOTICE, INTAKE_STEP_SKIP, INTAKE_STEP_WAIT,
  classifyIntake, createLoginAttemptSlot, createPendingSlot, intakeStep, isInboxDuplicate, loginAttempted,
  readIntakeParams, resolveIntakeCandidate, resolveMediaMetadata,
} from '../quick-intake.mjs';

export function createQuickIntake(deps) {
  const doc = deps.document || (typeof document !== 'undefined' ? document : null);
  const loc = deps.location || (typeof location !== 'undefined' ? location : null);
  const hist = deps.history || (typeof history !== 'undefined' ? history : null);
  const describe = deps.describe || ((url) => { try { return globalThis.LTMedia?.describe?.(url) ?? null; } catch { return null; } });
  const slot = createPendingSlot(deps.storage);
  const attempts = createLoginAttemptSlot(deps.storage);
  const notify = (text) => deps.notify?.(text);
  const loginStart = () => deps.openLoginStart?.();
  // 제목을 기다리는 동안 같은 주소를 두 번 담지 않는다(여러 번 흘려도 저장은 한 번).
  const inFlight = new Set();

  function inField(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.isContentEditable === true) return true;
    const el = target.nodeType === 1 ? target : target.parentElement;
    if (!el || typeof el !== 'object') return false;
    if (typeof el.closest === 'function' && el.closest('input,textarea,select,[contenteditable]')) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  }

  function stripParam(found) {
    if (!loc || !hist || typeof hist.replaceState !== 'function') return;
    const base = typeof loc.pathname === 'string' ? loc.pathname : '/';
    const hash = typeof loc.hash === 'string' ? loc.hash : '';
    try { hist.replaceState(null, '', `${base}${found.rest ? `?${found.rest}` : ''}${hash}`); } catch { /* 정리 못 해도 담기기는 계속된다 */ }
  }

  // 셸이 넘겨 준 세션 상태 — 확정 전에는 이 값들로만 판단한다(#342 후속).
  function sessionState() {
    const snap = deps.getMember?.()?.snapshot?.();
    return { source: deps.getSource?.(), owned: snap?.owned === true, phase: String(snap?.phase ?? '') };
  }

  function intakeSave(url, via) {
    const step = intakeStep(sessionState(), { attempted: loginAttempted(attempts.read(), url) });
    if (step === INTAKE_STEP_SKIP) return;                                // 공유 감상: 담지 않는다
    if (step === INTAKE_STEP_WAIT) {                                       // 아직 모름: 로그인도 담기도 미룬다
      if (via !== 'paste') return;
      if (deps.getMember?.()) slot.write(url);                           // 세션 확인 중: 확정 뒤에 담는다
      else notify(DROP_LOGIN_NOTICE);                                   // 세션이 없으면(로그아웃 화면) 옛 계약대로 안내만
      return;
    }
    if (step === INTAKE_STEP_NOTICE) {                                    // 두 번째 로그아웃: 다시 보내지 않는다(고리 차단)
      slot.clear(); attempts.clear(); notify(INTAKE_LOGIN_RETRY_TEXT); return;
    }
    if (step === INTAKE_STEP_LOGIN) {
      if (via === 'paste') { notify(DROP_LOGIN_NOTICE); return; }          // 붙여놓기는 안내만(옛 계약 그대로)
      slot.write(url); attempts.mark(url); loginStart(); return;          // 한 번만 로그인으로
    }
    const member = deps.getMember?.();
    const snap = member?.snapshot?.();
    if (!snap?.writable) { notify(DROP_READONLY_NOTICE); return; }
    let trees = [];
    try { trees = member.state?.()?.trees ?? []; } catch { trees = []; }
    if (isInboxDuplicate(trees, url)) { slot.clear(); attempts.clear(); notify(INTAKE_DUP_TEXT); return; }
    const commit = (media) => {
      try {
        member.apply('quickAdd', { url, ...media });
        slot.clear(); attempts.clear();
        notify(QUICK_SAVED_TEXT);
      } catch (error) {
        notify(typeof error?.message === 'string' ? error.message : String(error));
      }
    };
    // 제목은 빠른 추가 창과 같은 함수(oEmbed 프록시)로 받되, 기다림에 상한을 둔다 — 넘으면 주소만 저장한다.
    const parsed = parseQuickUrl(url, describe);
    const wantsTitle = parsed.status === 'ok' && parsed.kind === 'youtube' && !!parsed.videoId;
    if (!wantsTitle) { commit({}); return; }
    if (inFlight.has(url)) return;
    inFlight.add(url);
    void resolveMediaMetadata(url, { describe, timeoutMs: deps.titleWaitMs, fetchImpl: deps.fetchImpl })
      .then((media) => commit(media))
      .catch(() => commit({}))
      .finally(() => { inFlight.delete(url); });
  }

  function flush() {
    const pending = slot.read();
    if (!pending?.url) return;
    if (deps.getSource?.() === 'share') { slot.clear(); return; }
    intakeSave(pending.url, 'share');
  }
  function boot() {
    if (!loc) return;
    let found = null;
    try { found = readIntakeParams(loc.search); } catch { found = null; }
    if (!found?.found) return;
    stripParam(found);                              // 한 번만 통하는 값 — 먼저 지운다
    const candidate = resolveIntakeCandidate(found);
    if (!candidate) {                               // 세 값이 다 비었으면 소비만, 나머지는 안 쓸 주소다
      if ([found.url, found.text, found.title].some((value) => value !== '')) notify(QUICK_INVALID_ERROR);
      return;
    }
    const cls = classifyIntake(candidate, describe);
    if (cls.status === 'ok') slot.write(cls.url);
    else notify(QUICK_INVALID_ERROR);
  }

  function onPaste(event) {
    if (event?.defaultPrevented) return;
    if (inField(event?.target)) return;            // 입력 칸 안은 평소 붙여넣기 그대로
    const clipboard = event?.clipboardData;
    if (!clipboard?.getData) return;
    const readData = (type) => { try { return String(clipboard.getData(type) || ''); } catch { return ''; } };
    if (!readData('text/plain') && !readData('text/uri-list')) return;   // 빈 클립보드: 아무 일도 안 한다
    const url = extractDropUrl(clipboard);
    if (!url) { notify(QUICK_INVALID_ERROR); return; }
    let parsed = null;
    try { parsed = parseQuickUrl(url, describe); } catch { parsed = null; }
    if (!parsed || parsed.status !== 'ok') { notify(QUICK_INVALID_ERROR); return; }
    event.preventDefault?.();
    intakeSave(parsed.value, 'paste');
  }

  doc?.addEventListener?.('paste', onPaste);
  boot();
  return { flush, pending: slot.read, attempted: attempts.read };
}
