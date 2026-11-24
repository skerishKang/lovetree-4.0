// 뒤로 가기 점검(#1298) 공통 도우미 — 동작 분류와 '누름 → 뒤로 가기 → 바로 전 상태' 기록 stack.
// 화면별 시험이 같은 기준을 쓰도록 한 벌로 둔다(러1이 만든 최소 형태).

export const BACK_KINDS = Object.freeze({
  screen: true,      // 화면 이동(탭·로고·화면 안 이동)
  panel: true,       // 창·판 열기(목록·목차·상세·설정)
  moment: true,      // 순간 열기
  viewer: true,      // 크게 보기·가로 보기
  theme: false,      // 테마
  sort: false,       // 정렬
  viewOption: false, // 보기 방식(1장·2장·목록 등)
  hint: false        // 안내·말풍선
});

/** 기준에 따라 기록함/안 함을 돌려준다. 모르는 종류는 넣지 않는다(기준을 낮추지 않음). */
export function records(kind) {
  return BACK_KINDS[kind] === true;
}

/** 위치·상태·열린 쪽을 포함한 아주 작은 기록 stack. 실제 브라우저 대신 함수 시험에 쓴다. */
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
    pushState(next, _title, url) {
      entries.splice(index + 1);
      entries.push({ url: String(url ?? entries[index].url), state: next ?? null });
      index += 1;
    },
    replaceState(next, _title, url) {
      entries[index] = { url: String(url ?? entries[index].url), state: next ?? null };
    },
    back() { if (index > 0) index -= 1; return entries[index]; },
    forward() { if (index < entries.length - 1) index += 1; return entries[index]; }
  };
  return {
    location,
    history,
    current: () => ({ ...entries[index] }),
    depth: () => index,
    entries: () => entries.map(entry => ({ ...entry })),
    back: () => history.back(),
    forward: () => history.forward()
  };
}

/** 기록함 동작은 한 칸 늘고, 안 함 동작은 늘지 않는지 확인한다. */
export function assertRecord(stack, kind, before, after) {
  const grew = after > before;
  if (records(kind)) return grew;
  return !grew;
}
