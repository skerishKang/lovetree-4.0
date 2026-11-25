// 빠른 담기 입구: 셸 문서 어디서나 붙여넣기, 공유 시트로 들어온 주소 (2026-11-10).
// 판정·문구·추적은 ../quick-intake.mjs의 순수 함수가 맡는다(docs/TESTING.md).
// 저장은 로컬1 계약(member.apply('quickAdd', {url, mediaMetadata?}))을 그대로 부른다 — 화면은 이름만 쓴다.
import {
  QUICK_INVALID_ERROR, QUICK_SAVED_TEXT, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE, extractDropUrl, parseQuickUrl,
} from '../quick-add.mjs';
import {
  INTAKE_LOGIN_RETRY_TEXT, INTAKE_STEP_LOGIN, INTAKE_STEP_NOTICE, INTAKE_STEP_SKIP, INTAKE_STEP_WAIT,
  classifyIntake, createLoginAttemptSlot, createPendingSlot, findSameVideoInTree, intakeStep, intakeValueProblem, loginAttempted,
  readIntakeParams, resolveIntakeCandidate, resolveMediaMetadata, treesWithSameVideo,
} from '../quick-intake.mjs';
import {formatDisplayDate} from '../book-usability.mjs';
import {displayTreeTitle} from '../tree-name.mjs';

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

  function intakeSave(url, via, options = {}) {
    // #788: 미리보기(서버 없음)에서는 로그인으로 보내지 않고, 주소를 채운 창만 체험으로 보여준다.
    if (via === 'share' && deps.isDemo?.()) {
      deps.openQuickWithUrl?.(url, { demo: true });
      slot.clear(); attempts.clear();
      return;
    }
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
    // #788: 로그인 뒤에도 바로 저장하지 않고, 공유 주소가 채워진 쉬운 추가 창을 연다.
    if (via === 'share' && deps.openQuickWithUrl) {
      deps.openQuickWithUrl(url, { demo: false });
      slot.clear(); attempts.clear();
      return;
    }
    const member = deps.getMember?.();
    const snap = member?.snapshot?.();
    if (!snap?.writable) { notify(DROP_READONLY_NOTICE); return; }
    let trees = [];
    try { trees = member.state?.()?.trees ?? []; } catch { trees = []; }
    // #876(규칙 1·4): 붙여넣기·공유로 담을 때(담을 곳은 '모아둔 순간')도 같은 규칙 — 같은 영상·같은 장면이
    // 이미 있으면 조용히 막지 말고 안내 창으로 한 번 알려 준다. [그래도 담기]를 누르면(force) 이 판정을
    // 다시 보지 않고 담는다. 창을 닫으면 아무것도 담지 않고 끝낸다(붙여넣기 값은 이미 소비했다).
    const inboxTree = trees.find(tree => tree?.inbox === true) || null;
    if (!options.force) {
      const dup = inboxTree ? findSameVideoInTree(inboxTree, url) : null;
      if (dup) {
        slot.clear(); attempts.clear();
        deps.videoDup?.open({
          treeId: String(inboxTree.id || ''),
          momentId: String(dup.id || ''),
          treeName: displayTreeTitle(String(inboxTree?.title || inboxTree?.subject || '') || '모아둔 순간'),
          dateText: formatDisplayDate(dup.date, 'long'),
          onContinue: () => { intakeSave(url, via, { force: true }); },
        });
        return;
      }
    }
    const commit = (media) => {
      try {
        // #1001 마지막: 첫 화면 담기도 이미 있는 모아둔 순간 트리에 붙이면 모델만 갱신한다.
        // inbox가 없어 새 트리를 만드는 경우에는 재적재를 유지한다.
        member.apply('quickAdd', { url, ...media }, undefined, inboxTree ? {moment:true} : undefined);
        slot.clear(); attempts.clear();
        // #876 규칙 3: 다른 트리에 같은 영상이 있으면 막지 않고 담은 뒤 한 줄 알린다 — 담았다는 안내와 한 줄로.
        const others = treesWithSameVideo(trees, { excludeTreeId: String(trees.find(tree => tree?.inbox === true)?.id || ''), url });
        const names = others.map(tree => displayTreeTitle(String(tree?.title || tree?.subject || '') || '트리'));
        const otherLine = !names.length ? '' : names.length === 1 ? `'${names[0]}' 트리에도 있어요` : `'${names[0]}' 외 ${names.length - 1}개 트리에도 있어요`;
        notify(otherLine ? `${QUICK_SAVED_TEXT}. ${otherLine}` : QUICK_SAVED_TEXT);
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
    if (intakeValueProblem(found.url, found.text, found.title)) { notify(QUICK_INVALID_ERROR); return; }   // #788: 긴 값·스크립트 섞인 값은 통째로 막는다
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
