// 첫 화면(SRC064) 가운데 버튼의 상태별 표시 (대표 지시 2026-11-07 · #380 2026-11-11 댓글 반영 · #426 2026-11-12).
// #426: '이어 보던 순간' 버튼을 뺀다 — 최근 순간 카드가 이어 보기 역할을 맡아 로그인 후 버튼은 [＋ 순간 추가·둘러보기] 두 개. 자리가 남으면 숨긴다.
// 흰 강조(primary-cta)는 언제나 첫째 하나.
// 로그인 전 [＋ 첫 순간 남기기·둘러보기·어떻게 쓰나요] / 로그인 후 [＋ 순간 추가·둘러보기].
// '새 트리 만들기'·'내 책장 보기'는 이 줄에서 뺀다(헤더·도구 줄 소관).

import {homeCenterState, homeStartLoginUrl, readTheme} from '../public/v41/header-state.mjs';

const KEY_TO_DO={start:'start',add:'add',community:'community',guide:'guide'};
const LABELS={
  out:['＋ 첫 순간 남기기','둘러보기','어떻게 쓰나요'],
  'in-empty':['＋ 순간 추가','둘러보기'],
  'in-trees':['＋ 순간 추가','둘러보기']
};
const KEYS={
  out:['start','community','guide'],
  'in-empty':['add','community'],
  'in-trees':['add','community']
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
    button.textContent = labels[index] || button.textContent;
    button.dataset.do = KEY_TO_DO[keys[index]] || keys[index];
    button.classList.toggle('primary-cta', index === 0);
    button.removeAttribute('title');
  });
  return plan;
}

// 로그아웃 상태의 첫 버튼: 로그인/가입으로 보내고 next는 4.1 첫 화면으로 돌아온다.
export function homeStartTarget() {
  return homeStartLoginUrl(readTheme(globalThis.localStorage));
}
