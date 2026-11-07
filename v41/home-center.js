// 첫 화면(SRC064) 가운데 버튼 3개의 상태별 표시(대표 지시 2026-11-07).
// 자리와 개수는 그대로 두고, 흰색 강조와 첫 버튼 문구만 바꾼다.
// 흰색 강조(primary-cta)는 언제나 정확히 하나다.
import {homeCenterState, homeStartLoginUrl} from '../public/v41/header-state.mjs';

const KEY_TO_DO = {start: 'start', resume: 'resume', new: 'new', trees: 'trees'};

// mountOrbit이 만든 세 버튼에 상태를 입힌다.
// buttons: [primary-cta, 둘째, 셋째] 순서의 실제 DOM 버튼.
export function applyHomeCenter(buttons, state) {
  const plan = homeCenterState(state);
  plan.buttons.forEach((spec, index) => {
    const button = buttons[index];
    if (!button) return;
    button.textContent = spec.label;
    button.dataset.do = KEY_TO_DO[spec.key] || spec.key;
    button.classList.toggle('primary-cta', spec.emphasis === true);
    button.disabled = spec.disabled === true;
    button.setAttribute('aria-disabled', String(spec.disabled === true));
    if (spec.title) button.title = spec.title;
    else button.removeAttribute('title');
  });
  return plan;
}

// 로그아웃 상태의 첫 버튼: 로그인/가입으로 보내고 next는 4.1 첫 화면으로 돌아온다.
export function homeStartTarget() {
  return homeStartLoginUrl();
}
