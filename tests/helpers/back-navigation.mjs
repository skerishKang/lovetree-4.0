// 뒤로 가기 점검(#1298) 공통 도우미 — 동작 분류와 '누름 → 뒤로 가기 → 바로 전 상태' 기록 stack.
export const BACK_KINDS = Object.freeze({
  screen: true, panel: true, moment: true, viewer: true,
  theme: false, sort: false, viewOption: false, hint: false
});
export function records(kind) { return BACK_KINDS[kind] === true; }
export function createHistoryStack({ hash = '#home', state = null } = {}) {
  const entries = [{ url: hash, state }];
  let index = 0;
  const location = {
    origin: 'https://lovetree-4-0.pages.dev',
    get hash() { return entries[index].url; },
    set hash(value) { entries[index].url = String(value); }
  };
  const history = {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    pushState(next, _title, url) { entries.splice(index + 1); entries.push({ url: String(url ?? entries[index].url), state: next ?? null }); index += 1; },
    replaceState(next, _title, url) { entries[index] = { url: String(url ?? entries[index].url), state: next ?? null }; },
    back() { if (index > 0) index -= 1; return entries[index]; },
    forward() { if (index < entries.length - 1) index += 1; return entries[index]; }
  };
  return { location, history, current: () => ({ ...entries[index] }), depth: () => index, entries: () => entries.map(e => ({ ...e })), back: () => history.back(), forward: () => history.forward() };
}
export function assertRecord(stack, kind, before, after) { return records(kind) ? after > before : after === before; }
