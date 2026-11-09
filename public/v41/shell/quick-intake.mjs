// 빠른 담기 입구: 셸 문서 어디서나 붙여넣기, 공유 시트로 들어온 주소 (2026-11-10).
// 판정·문구·추적은 ../quick-intake.mjs의 순수 함수가 맡는다(docs/TESTING.md).
// 저장은 로컬1 계약(member.apply('quickAdd', {url}))을 그대로 부른다 — 화면은 이름만 쓴다.
import {
  QUICK_INVALID_ERROR, QUICK_SAVED_TEXT, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE, extractDropUrl, parseQuickUrl,
} from '../quick-add.mjs';
import {
  INTAKE_DUP_TEXT, classifyIntake, isInboxDuplicate, readIntakeParam, createPendingSlot,
} from '../quick-intake.mjs';

export function createQuickIntake(deps) {
  const doc = deps.document || (typeof document !== 'undefined' ? document : null);
  const loc = deps.location || (typeof location !== 'undefined' ? location : null);
  const hist = deps.history || (typeof history !== 'undefined' ? history : null);
  const describe = deps.describe || ((url) => { try { return globalThis.LTMedia?.describe?.(url) ?? null; } catch { return null; } });
  const slot = createPendingSlot(deps.storage);
  const notify = (text) => deps.notify?.(text);
  const loginStart = () => deps.openLoginStart?.();

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

  function intakeSave(url, via) {
    const member = deps.getMember?.();
    const snap = member?.snapshot?.();
    const source = deps.getSource?.();
    if (source !== 'server' || !snap?.owned) {
      if (via === 'share') { slot.write(url); loginStart(); } else { notify(DROP_LOGIN_NOTICE); }
      return;
    }
    if (!snap.writable) { notify(DROP_READONLY_NOTICE); return; }
    let trees = [];
    try { trees = member.state?.()?.trees ?? []; } catch { trees = []; }
    if (isInboxDuplicate(trees, url)) { slot.clear(); notify(INTAKE_DUP_TEXT); return; }
    try {
      member.apply('quickAdd', { url });
      slot.clear();
      notify(QUICK_SAVED_TEXT);
    } catch (error) {
      notify(typeof error?.message === 'string' ? error.message : String(error));
    }
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
    try { found = readIntakeParam(loc.search); } catch { found = null; }
    if (!found?.found) return;
    stripParam(found);                 // 한 번만 통하는 값 — 먼저 지운다
    if (!found.url) return;
    const cls = classifyIntake(found.url, describe);
    if (cls.status === 'ok') slot.write(cls.url);
    else if (cls.status === 'invalid') notify(QUICK_INVALID_ERROR);
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
  return { flush, pending: slot.read };
}
