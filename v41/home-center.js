// 첫 화면(SRC064) 가운데 버튼의 상태별 표시 (대표 지시 2026-11-07 · #380 2026-11-11 댓글 반영 · #426 2026-11-12).
// 2026-11-14 대표 결정: 로그인한 첫 화면도 세 자리를 쓴다 — [＋ 순간 추가·둘러보기·내 트리].
// 로그아웃의 세 자리[＋ 첫 순간 추가·둘러보기·어떻게 쓰나요]와 같은 폭·여백(#505 의 .center .actions data-count)을 쓴다.
// 흰 강조(primary-cta)는 언제나 첫째 하나. 자리가 남으면 숨긴다.
// 로그아웃 문구는 이 화면이 쓴다(4.0 첫 화면의 말투 그대로). 로그인 상태 문구는 header-state 의 homeCenterState 와 같게 둔다.

import {homeCenterState, homeStartLoginUrl, readTheme} from '../public/v41/header-state.mjs';

const LABELS={
  out:['＋ 첫 순간 추가','둘러보기','어떻게 쓰나요'],
  'in-empty':['＋ 순간 추가','둘러보기','내 트리'],
  'in-trees':['＋ 순간 추가','둘러보기','내 트리']
};
const KEYS={
  out:['start','community','guide'],
  'in-empty':['add','community','trees'],
  'in-trees':['add','community','trees']
};

// mountOrbit이 만든 버튼에 상태를 입힌다. buttons: 순서대로의 실제 DOM 버튼. 라벨 수가 적으면 남은 버튼은 숨긴다.
export function applyHomeCenter(buttons, state) {
  const plan = homeCenterState(state);
  const s = plan.state;
  const labels = LABELS[s] || LABELS['in-trees'];
  const keys = KEYS[s] || KEYS['in-trees'];
  buttons.forEach((button, index) => {
    if (!button) return;
    if (index >= labels.length) { button.hidden = true; button.removeAttribute('title'); return; }
    button.hidden = false;
    button.textContent = labels[index];
    button.dataset.do = keys[index];
    button.classList.toggle('primary-cta', index === 0);
    button.removeAttribute('title');
  });
  return plan;
}

// 로그아웃 상태의 첫 버튼: 로그인/가입으로 보내고 next는 4.1 첫 화면으로 돌아온다.
export function homeStartTarget() {
  return homeStartLoginUrl(readTheme(globalThis.localStorage));
}
