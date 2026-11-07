// 첫 화면 카드 출처 모드 — 순수 계산과 저장만 담당한다.
// 2026-11-08 대표 지시: 사용자가 예시/인기/내 것만/섞어서를 고르고, 예시는 어떤 모드에서도 선명하다.
import {HOME_ORBIT_LIMIT, HOME_TEXT_LIMIT, HOME_PHOTO_MIN, homeMomentCards} from './home-moments.js';

export const HOME_CARDS_KEY = 'lt41.homeCards';
export const HOME_CARD_MODES = ['example', 'popular', 'mine', 'mix'];
export const HOME_CARD_LABELS = {example: '예시', popular: '인기', mine: '내 것만', mix: '섞어서'};
export const HOME_CARDS_POPULAR_MIN = 10;

const loggedInOnly = mode => mode === 'mine' || mode === 'mix';

export function normalizeHomeCardsMode(value) {
  return HOME_CARD_MODES.includes(value) ? value : '';
}

// 저장값이 없거나 막히면 로그인=섞어서, 로그아웃=예시. 로그아웃에 내 것만/섞어서가 남아 있으면 예시.
export function readHomeCardsMode(storage, {loggedIn = false} = {}) {
  let stored = '';
  try { stored = normalizeHomeCardsMode(storage?.getItem(HOME_CARDS_KEY)); } catch { stored = ''; }
  if (stored && !loggedIn && loggedInOnly(stored)) return 'example';
  return stored || (loggedIn ? 'mix' : 'example');
}

export function writeHomeCardsMode(storage, mode) {
  const next = normalizeHomeCardsMode(mode) || 'example';
  try { storage?.setItem(HOME_CARDS_KEY, next); } catch { return 'example'; }
  return next;
}

export function homeCardsMenu({loggedIn = false} = {}) {
  return HOME_CARD_MODES.filter(mode => loggedIn || !loggedInOnly(mode));
}

export function homeCardsLabel(mode) {
  return HOME_CARD_LABELS[normalizeHomeCardsMode(mode) || 'example'];
}

// 모드별 궤도 구성. exampleCount는 예시 카드 수(최대 40), cards는 내/공개 카드.
export function homeCardsPlan({mode, loggedIn = false, context = null, popular = [], limit = HOME_ORBIT_LIMIT} = {}) {
  let effective = normalizeHomeCardsMode(mode) || (loggedIn ? 'mix' : 'example');
  if (!loggedIn && loggedInOnly(effective)) effective = 'example';
  if (effective === 'example') {
    return {mode: effective, kind: 'example', cards: [], examples: limit, note: null};
  }
  if (effective === 'popular') {
    const cards = (Array.isArray(popular) ? popular : []).slice(0, limit);
    const short = cards.length < HOME_CARDS_POPULAR_MIN;
    return {
      mode: effective,
      kind: 'popular',
      cards,
      examples: short ? limit - cards.length : 0,
      note: short ? '아직 공개된 순간이 적어요' : '',
    };
  }
  const {photos, memos} = homeMomentCards(context, limit);
  if (effective === 'mine') {
    const cards = [...photos, ...memos.slice(0, HOME_TEXT_LIMIT)].slice(0, limit);
    return {
      mode: effective,
      kind: cards.length ? 'mine' : 'mine-empty',
      cards,
      examples: 0,
      note: cards.length ? '' : '아직 남긴 순간이 없어요 · 첫 순간 남기기',
    };
  }
  // mix: 사진·영상 순간이 3장 미만이면 내 카드를 올리지 않고 예시만 보여 준다.
  if (photos.length < HOME_PHOTO_MIN) {
    return {mode: effective, kind: 'mix-empty', cards: [], examples: limit, note: null};
  }
  const cards = [...photos, ...memos.slice(0, HOME_TEXT_LIMIT)].slice(0, limit);
  return {
    mode: effective,
    kind: 'mix',
    cards,
    examples: Math.max(0, limit - cards.length),
    note: '금빛 카드는 내가 남긴 순간이에요',
  };
}
