// 첫 화면(SRC064) 가운데 버튼의 상태별 표시 (대표 지시 2026-11-07 · #380 2026-11-11 댓글 반영 · #426 2026-11-12 · 261116 PR 2).
// 261116 PR 2(대표 확정): 로그인 상태의 '+ 순간 추가'는 글귀 바로 아래 위쪽 단추(밝은 채움)로 올라가고,
// 가운데 세트는 [순간 목록·둘러보기·서재] 테두리형(같은 무게·같은 폭) — primary-cta는 세트에 없다. 261117 대표 확정: '내 트리' → '서재'.
// 로그아웃의 세 자리[＋ 첫 순간 추가·둘러보기·어떻게 쓰나요]는 지금처럼 첫 버튼만 흰 강조다.
// 로그아웃 문구는 이 화면이 쓴다(4.0 첫 화면의 말투 그대로). 로그인 상태 문구는 header-state 의 homeCenterState 와 같게 둔다.

import {homeCenterState, homeStartLoginUrl, readTheme} from '../public/v41/header-state.mjs';

// 상태별 문구와 강조는 헤더 상태 함수 한 곳에서 정한다.

// mountOrbit이 만든 버튼에 상태를 입힌다. buttons: 순서대로의 실제 DOM 버튼. 라벨 수가 적으면 남은 버튼은 숨긴다.
export function applyHomeCenter(buttons, state) {
  const plan = homeCenterState(state);
  buttons.forEach((button, index) => {
    if (!button) return;
    const item=plan.buttons[index];
    if (!item) { button.hidden = true; button.removeAttribute('title'); return; }
    button.hidden = false;
    button.textContent = item.label;
    button.dataset.do = item.key;
    button.classList.toggle('primary-cta',item.emphasis);
    button.removeAttribute('title');
  });
  return plan;
}

// 로그아웃 상태의 첫 버튼: 로그인/가입으로 보내고 next는 4.1 첫 화면으로 돌아온다.
export function homeStartTarget() {
  return homeStartLoginUrl(readTheme(globalThis.localStorage));
}
