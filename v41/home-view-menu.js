// 2026-11-08 #213 2번: 첫 화면 오른쪽 위 도구 줄을 "보기 ▾" 메뉴 하나로 묶는다.
// 메뉴 안: 움직임 켜기/멈춤 · 테마 밤/정원 · 카드 출처(로그인 4 / 로그아웃 예시·인기).
// 동작과 저장값은 그대로다(움직임=pause 상태, 테마=lt41.theme, 카드=lt41.homeCards).
import {HOME_CARD_LABELS, homeCardsMenu, normalizeHomeCardsMode} from './home-cards.js';

export const VIEW_MENU_ID = 'home-view-menu';
export const VIEW_MENU_LABEL = '보기';

// 메뉴 항목. 움직임만 체크박스(menuitemcheckbox)이고 나머지는 하나만 켜지는 라디오(menuitemradio)다.
export function viewMenuItems({theme = 'night', paused = false, cardsMode = 'example', loggedIn = false} = {}) {
  const garden = theme === 'garden';
  // 로그아웃에는 예시·인기만 있으므로 남아 있는 "내 것만/섞어서" 저장값은 예시로 떨어진다(readHomeCardsMode와 같은 규칙).
  const modes = homeCardsMenu({loggedIn});
  const requested = normalizeHomeCardsMode(cardsMode);
  const activeMode = modes.includes(requested) ? requested : (loggedIn ? 'mix' : 'example');
  return [
    {
      kind: 'motion', value: paused ? 'on' : 'off', role: 'menuitemcheckbox',
      label: paused ? '움직임 켜기' : '움직임 멈춤', checked: !!paused
    },
    {kind: 'theme', value: 'night', role: 'menuitemradio', label: '밤', checked: !garden},
    {kind: 'theme', value: 'garden', role: 'menuitemradio', label: '정원', checked: garden},
    ...modes.map(mode => ({
      kind: 'cards', value: mode, role: 'menuitemradio',
      label: HOME_CARD_LABELS[mode], checked: mode === activeMode
    }))
  ];
}

// 메뉴 안 구분선: 움직임 / 테마 / 카드 출처 세 묶음.
export function viewMenuGroups(options = {}) {
  const items = viewMenuItems(options);
  return [
    {name: '움직임', items: items.filter(item => item.kind === 'motion')},
    {name: '테마', items: items.filter(item => item.kind === 'theme')},
    {name: '카드 출처', items: items.filter(item => item.kind === 'cards')}
  ];
}

// 메뉴를 열 때 초점을 줄 항목: 지금 고른 카드 출처를 먼저 보여 준다(없으면 첫 항목).
export function viewMenuInitialIndex(items) {
  const index = items.findIndex(item => item.kind === 'cards' && item.checked);
  return index >= 0 ? index : 0;
}

// 키보드 규칙: ArrowDown/ArrowUp 순환, Home/End, Esc 닫기, Enter/Space 실행.
export function viewMenuKey(key, index, count) {
  if (key === 'Escape') return {type: 'close'};
  if (!count) return {type: 'none'};
  const current = Number.isInteger(index) && index >= 0 ? index : 0;
  if (key === 'ArrowDown') return {type: 'focus', index: (current + 1) % count};
  if (key === 'ArrowUp') return {type: 'focus', index: (current - 1 + count) % count};
  if (key === 'Home') return {type: 'focus', index: 0};
  if (key === 'End') return {type: 'focus', index: count - 1};
  if (key === 'Enter' || key === ' ') return {type: 'activate', index: current};
  return {type: 'none'};
}

// 메뉴가 다루는 값: 테마는 밤/정원 두 값만, 움직임은 지금 상태의 반대.
export function viewMenuValue(item, current = {}) {
  if (!item) return null;
  if (item.kind === 'theme') return item.value === 'garden' ? 'garden' : 'night';
  if (item.kind === 'motion') return !current.paused;
  if (item.kind === 'cards') return normalizeHomeCardsMode(item.value) || 'example';
  return null;
}
