// 셸 안내(토스트) 한 벌 (#353 후속): 담기·중복·로그인 필요 안내가 상태 안내보다 먼저 보인다.
// 상태 안내('내 기록을 불러왔어요.' 등)는 다음 상태 변화에 다시 올 수 있는 정보지만, 방금 한 행동의
// 결과 안내는 한 번뿐이다. 그래서 결과 안내는 holdMs 동안 지키고, 그동안 상태 안내는 덮지 않는다.
// 시계·타이머를 주입해 시험에서 실제로 기다리지 않는다.
export const NOTICE_HOLD_MS = 3000;
export const NOTICE_HIDE_MS = 6500;

export function createNotifier({ $, now = () => Date.now(), holdMs = NOTICE_HOLD_MS, hideMs = NOTICE_HIDE_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let holdUntil = 0;
  let timer = null;
  // hold=true는 사용자의 방금 행동에 대한 결과 안내다. holdMs가 지나기 전에는 다른 안내로 덮지 않는다.
  function notify(text, { hold = false } = {}) {
    const at = now();
    if (hold) holdUntil = at + holdMs;
    else if (at < holdUntil) return false;
    // #368: 설정 창이 열려 있으면 창 안 상태 줄에, 아니면 토스트로 보여 준다.
    // #453 C2: 설정과 무관한 지난 안내가 창 안에 남지 않도록, 설정이 열려 있을 때만 그 줄에 쓴다.
    if ($('settings-feedback') && $('account-settings')?.open) $('settings-feedback').textContent = text;
    $('toast').textContent = text;
    $('toast').hidden = !!$('account-settings')?.open;
    clearTimer(timer);
    timer = setTimer(() => { $('toast').hidden = true; }, hideMs);
    return true;
  }
  return { notify, holdUntil: () => holdUntil };
}
