// #327 2부: 모아둔 순간(inbox) 표시·정리 화면의 순수 계산 한 벌.
// 화면(셸·책장·궤도·보기)은 이 결과를 그릴 뿐이다. 조건·문구는 시험(v41-inbox-display)이 고정한다.
import { displayTreeTitle } from './tree-name.mjs';

export const INBOX_LABEL = '모아둔 순간';

/** inbox 트리 판정. 모르는 값은 거짓(예시·공유 트리는 절대 inbox 아니다). */
export function isInboxTree(tree) {
  return tree?.inbox === true;
}

/** 책장 순서: 모아둔 순간을 맨 앞에 고정하고 나머지는 기존 순서를 유지한다. */
export function shelfOrder(trees) {
  const list = Array.isArray(trees) ? trees : [];
  return [...list.filter(isInboxTree), ...list.filter(tree => !isInboxTree(tree))];
}

/** 트리 고르기 목록·헤더 등 이름 한 줄. 기본 이름('모아둔 순간')이면 표시를 한 번만 붙인다. */
export function pickerLabel(tree) {
  const name = displayTreeTitle(tree?.title ?? '');
  if (!isInboxTree(tree)) return name;
  return name === INBOX_LABEL ? INBOX_LABEL : `${name} · ${INBOX_LABEL}`;
}

/** 헤더 표시(#context-kind). 서버 기록의 inbox 트리일 때만 '모아둔 순간'. */
export function headerBadge(tree) {
  return isInboxTree(tree) ? INBOX_LABEL : '';
}

/** 한글 받침에 따라 '으로'/'로'를 고른다. 받침이 없거나 ㄴ·ㄹ·ㅁ·ㅇ이면 '로', 한글이 아니면 '로'. */
export function josaRo(word) {
  const value = String(word ?? '').trim();
  if (!value) return '로';
  const code = value.charCodeAt(value.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return '로';
  const jong = (code - 0xac00) % 28;
  // 받침이 없거나 ㄹ(유니코드 종성 8)이면 '로'(길로·서울로), 다른 받침이면 '으로'(밤으로·손으로).
  return (jong === 0 || jong === 8) ? '로' : '으로';
}

/** 정리 화면에서 고를 수 있는 대상 트리 목록. 자기 자신은 뺀다. */
export function cleanupTargets(trees, fromTreeId) {
  return (Array.isArray(trees) ? trees : [])
    .filter(tree => tree && tree.id !== fromTreeId)
    .map(tree => ({ id: tree.id, label: pickerLabel(tree) }));
}

/**
 * 정리 화면 상태: 고른 순간·이름·대상으로 두 동작의 가능 여부와 단추 문구를 계산한다.
 * 새 트리 만들기는 이름만, 옮기기는 대상만 필요하다(둘 다 순간 1개 이상).
 */
export function cleanupState({ selectedIds = [], newTreeName = '', targetId = '', targetLabel = '' } = {}) {
  const ids = [...new Set(selectedIds)];
  const name = String(newTreeName ?? '').trim();
  return {
    count: ids.length,
    hasSelection: ids.length > 0,
    canCreate: ids.length > 0 && name.length > 0,
    canMove: ids.length > 0 && !!targetId,
    createLabel: ids.length ? `${ids.length}개의 순간으로 새 트리 만들기` : '새 트리 만들기',
    moveLabel: ids.length && targetLabel ? `${targetLabel}${josaRo(targetLabel)} 옮기기` : '옮기기',
    createHint: ids.length ? '' : '옮길 순간을 먼저 골라 주세요.',
    moveHint: ids.length ? '' : '옮길 순간을 먼저 골라 주세요.'
  };
}

/** 옮긴 뒤 안내. 현재 화면에 머물고 '가 보기'로 대상 트리를 열 수 있다. */
export function movedNotice({ targetLabel = '', isNew = false } = {}) {
  const label = String(targetLabel ?? '').trim();
  return {
    text: isNew ? `${label}${josaRo(label)} 새 트리를 만들었어요.` : `${label}${josaRo(label)} 옮겼어요.`,
    action: '가 보기'
  };
}

/** 정리 화면을 열 수 있는가: 내 기록(서버·로그인 소유자)의 inbox 트리일 때만. */
export function cleanupAvailable({ source = '', owned = false, tree = null } = {}) {
  return source === 'server' && owned === true && isInboxTree(tree);
}

/** 순간 상세의 '다른 트리로 옮기기'를 보여 줄 수 있는가: 내 기록이면 일반 트리에서도 보인다. */
export function moveAvailable({ source = '', owned = false } = {}) {
  return source === 'server' && owned === true;
}
