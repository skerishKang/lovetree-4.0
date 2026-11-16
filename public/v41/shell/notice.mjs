// 셸 안내(토스트) 한 벌 (#353 후속): 담기·중복·로그인 필요 안내가 상태 안내보다 먼저 보인다.
// 상태 안내('내 기록을 불러왔어요.' 등)는 다음 상태 변화에 다시 올 수 있는 정보지만, 방금 한 행동의
// 결과 안내는 한 번뿐이다. 그래서 결과 안내는 holdMs 동안 지키고, 그동안 상태 안내는 덮지 않는다.
// 시계·타이머를 주입해 시험에서 실제로 기다리지 않는다.
export const NOTICE_HOLD_MS = 3000;
export const NOTICE_HIDE_MS = 6500;

// #549: 'synced' 상태 안내 문구 한 벌. 기록(순간)이 0개인 새 계정에 '내 기록을 불러왔어요.'는
// 어색하므로 첫 순간 안내로 바꾼다. momentCount는 모든 트리의 순간 수 합계다.
export function syncedNoticeText({ writable = false, previousDirty = false, momentCount = 0 } = {}) {
  if (!writable) return '기록을 읽었어요. 서버 편집 연결은 아직 준비되지 않았어요.';
  if (previousDirty) return '서버에 저장됐어요.';
  return momentCount > 0 ? '내 기록을 불러왔어요.' : '반가워요. 첫 순간을 남겨 보세요.';
}

// 2026-11-15 보고(게스트 책·자동 공개 안내): 자동 공개 안내 한 벌.
// 서버(#538 저장 훅)가 저장 뒤 자동 공유 행(origin='auto')을 만들고, 둘러보기 목록 SQL은
// moment_count>=3(순간 3개)부터 소개한다. 그래서 '자동 공개가 새로 일어난 저장'은
// 둘러보기 소개 기준(순간 3개, #538 SQL moment_count>=3과 같다). 2026-11-16 결정으로
// '공개됐어요' 토스트(#718)는 남기지 않는다 — 3개에 도달한 저장은 셸의 질문 창(discover-ask)이 대신 묻는다.
export const AUTO_PUBLISH_MIN_MOMENTS = 3;
// 직전 기기 스냅샷(before: {트리 아이디: 순간 수})과 저장 뒤(after)를 비교해
// 순간 3개에 처음 도달한 트리만 돌려준다. before에 없던 트리는 이 기기에서 처음
// 관측한 것이므로 prev=0으로 본다(기기 첫 관측이 3개 이상이면 대상).
export function newlyPublishedTrees(before, after, minCount = AUTO_PUBLISH_MIN_MOMENTS) {
  const rows = [];
  for (const [treeId, count] of Object.entries(after || {})) {
    const prev = Number.isFinite(Number(before?.[treeId])) ? Number(before?.[treeId]) : 0;
    if (count >= minCount && prev < minCount) rows.push({ treeId, momentCount: count });
  }
  return rows;
}

// #666: beforeShow는 알림 줄을 실제로 띄우기 직전에 부른다 — 셸이 화면 아래에 붙은 것들(링크 줄·＋ 단추·
// 새 소식 카드)을 재서 그 위로 자리를 옮긴다. 재는 일은 셸이 하고, 이 파일은 언제 부를지만 정한다.
export function createNotifier({ $, now = () => Date.now(), holdMs = NOTICE_HOLD_MS, hideMs = NOTICE_HIDE_MS, setTimer = setTimeout, clearTimer = clearTimeout, beforeShow = () => {} } = {}) {
  let holdUntil = 0;
  let timer = null;
  // hold=true는 사용자의 방금 행동에 대한 결과 안내다. holdMs가 지나기 전에는 다른 안내로 덮지 않는다.
  function notify(text, { hold = false, action = null } = {}) {
    const at = now();
    if (hold) holdUntil = at + holdMs;
    else if (at < holdUntil) return false;
    // #368: 설정 창이 열려 있으면 창 안 상태 줄에, 아니면 토스트로 보여 준다.
    // #453 C2: 설정과 무관한 지난 안내가 창 안에 남지 않도록, 설정이 열려 있을 때만 그 줄에 쓴다.
    if ($('settings-feedback') && $('account-settings')?.open) $('settings-feedback').textContent = text;
    paintToast($('toast'), text, action);
    if ($('account-settings')?.open) $('toast').hidden = true;
    else { beforeShow(); $('toast').hidden = false; }
    clearTimer(timer);
    timer = setTimer(() => { $('toast').hidden = true; }, hideMs);
    return true;
  }
  return { notify, holdUntil: () => holdUntil };
}

// 단추가 붙는 안내(자동 공개)는 문장과 단추를 한 줄로 그린다. 시험의 가짜 DOM처럼
// replaceChildren을 갖추지 않은 요소는 기존 글자 길(textContent)을 그대로 탄다.
function paintToast(toast, text, action) {
  if (!toast) return;
  if (!action || typeof toast.replaceChildren !== 'function' || typeof toast.append !== 'function') { toast.textContent = text; return; }
  const span = document.createElement('span');
  span.textContent = text;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-action';
  btn.textContent = action.label;
  btn.addEventListener('click', () => action.run());
  toast.replaceChildren(span, btn);
}
