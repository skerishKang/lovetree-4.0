// 첫 화면(SRC064) 가운데 버튼 3개의 상태별 표시 (대표 지시 2026-11-07 · #380 2026-11-11 댓글 반영).
// 자리·개수는 그대로(3개), 흰 강조(primary-cta)는 언제나 첫째 하나.
// 로그인 전 [＋ 첫 순간 남기기·둘러보기·어떻게 쓰나요] / 로그인 후 [＋ 순간 추가·이어 보던 순간·둘러보기].
// '새 트리 만들기'·'내 책장 보기'는 이 줄에서 뺀다(헤더·도구 줄 소관).

import {homeCenterState, homeStartLoginUrl, readTheme} from '../public/v41/header-state.mjs';

const KEY_TO_DO={start:'start',add:'add',resume:'resume',community:'community',guide:'guide'};
const LABELS={
  out:['＋ 첫 순간 남기기','둘러보기','어떻게 쓰나요'],
  'in-empty':['＋ 순간 추가','이어 보던 순간','둘러보기'],
  'in-trees':['＋ 순간 추가','이어 보던 순간','둘러보기']
};
const KEYS={
  out:['start','community','guide'],
  'in-empty':['add','resume','community'],
  'in-trees':['add','resume','community']
};

// mountOrbit이 만든 세 버튼에 상태를 입힌다. buttons: [첫째,둘째,셋째] 순서의 실제 DOM 버튼.
export function applyHomeCenter(buttons, state) {
  const plan = homeCenterState(state);
  const s = plan.state;
  const labels = LABELS[s] || LABELS['in-trees'];
  const keys = KEYS[s] || KEYS['in-trees'];
  buttons.slice(0, 3).forEach((button, index) => {
    if (!button) return;
    button.textContent = labels[index] || button.textContent;
    button.dataset.do = KEY_TO_DO[keys[index]] || keys[index];
    button.classList.toggle('primary-cta', index === 0);
    const disabled = index === 1 && s === 'in-empty';
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
    if (disabled) button.title = plan.buttons[0]?.title || '아직 이어 볼 순간이 없어요';
    else button.removeAttribute('title');
  });
  return plan;
}

// 로그아웃 상태의 첫 버튼: 로그인/가입으로 보내고 next는 4.1 첫 화면으로 돌아온다.
export function homeStartTarget() {
  return homeStartLoginUrl(readTheme(globalThis.localStorage));
}
