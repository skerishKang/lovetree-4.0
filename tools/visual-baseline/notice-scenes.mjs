// #1626: Separate, deterministic visual states. Never change the ordinary capture stabilizer.
export const NOTICE_SCENES = [
  { name: 'home-notices', hash: '', expect: '/v41/home', notices: true },
  { name: 'shelf-notices', hash: '#shelf', expect: 'track32-bookshelf', notices: true }
];

// Run only inside the dedicated notice scenes, after the ordinary scene is ready.
// Use real app elements and their production position rules, not drawn replacements.
export function showFixedNotices({ shift = 0 } = {}) {
  const toast = document.getElementById('toast');
  const update = document.getElementById('updates-card');
  const updateText = document.getElementById('updates-card-text');
  const status = document.getElementById('save-feedback');
  const statusText = document.getElementById('save-message');
  if (![toast, update, updateText, status, statusText].every(Boolean)) throw new Error('겉모습 알림 장면의 기존 요소가 없습니다');
  if (toast.textContent !== '시험 알림: 기록이 안전하게 저장되었습니다.') toast.textContent = '시험 알림: 기록이 안전하게 저장되었습니다.';
  if (updateText.textContent !== '시험 새 소식: 업데이트를 확인해 주세요.') updateText.textContent = '시험 새 소식: 업데이트를 확인해 주세요.';
  if (statusText.textContent !== '시험 상태: 저장을 완료했습니다.') statusText.textContent = '시험 상태: 저장을 완료했습니다.';
  const actions = document.getElementById('save-actions');
  if (actions?.childNodes?.length) actions.replaceChildren();
  if (update.hidden) update.hidden = false;
  if (status.hidden) status.hidden = false;
  if (toast.hidden) toast.hidden = false;
  document.documentElement.classList.add('visual-baseline-notices');
  let style = document.querySelector('style[data-visual-notices]');
  if (!style) {
    style = document.createElement('style');
    style.dataset.visualNotices = '1';
    document.documentElement.append(style);
  }
  const offset = Number.isFinite(Number(shift)) ? Math.max(-100, Math.min(100, Number(shift))) : 0;
  const css = `html.visual-baseline-notices #toast,html.visual-baseline-notices .toast,html.visual-baseline-notices [role="status"]{visibility:visible!important}html.visual-baseline-notices #updates-card{translate:0 ${offset}px!important}`;
  if (style.textContent !== css) style.textContent = css;
  return { toast: toast.textContent, update: updateText.textContent, status: statusText.textContent };
}
