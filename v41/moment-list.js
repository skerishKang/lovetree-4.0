// #394: 첫 화면 "순간 목록"의 순수 계산 한 벌.
// 모든 트리의 순간을 최근 순으로 모으고, 트리별로 걸러 보기와 상세 창 제목 규칙을 여기서 정한다.
// 데이터는 v41/home.js가, 그리기는 src/views/orbit.js가 이 결과로 한다. 조건·문구는 시험이 고정한다.
import { cardOf } from './home-moments.js';
import { pickerLabel, isInboxTree, shelfOrder } from '../public/v41/inbox-model.mjs';
import { titleView } from '../public/v41/book-usability.mjs';

const text = value => (typeof value === 'string' ? value.trim() : '');

/** 순간 목록 위 트리 고르기 칸 목록. [전체]는 화면이 붙이고, 여기서는 모아둔 순간 먼저·나머지 기존 순서다. */
export function momentListTrees(trees) {
  return shelfOrder(Array.isArray(trees) ? trees : [])
    .map(tree => ({ id: text(tree?.id), label: pickerLabel(tree), inbox: isInboxTree(tree) }))
    .filter(tree => tree.id);
}

/** 모든 트리의 순간을 한 줄씩. 최근 순(updatedAt→createdAt 내림차순, 같으면 기존 순서 유지). */
export function momentListEntries({ trees = [], origin = globalThis.location?.origin, youtube = null } = {}) {
  const entries = [];
  for (const tree of Array.isArray(trees) ? trees : []) {
    const treeId = text(tree?.id);
    if (!treeId || !Array.isArray(tree.moments)) continue;
    const label = pickerLabel(tree);
    for (const moment of tree.moments) {
      const id = text(moment?.id);
      if (!id) continue;
      // 카드 한 벌(cardOf)을 재사용해 썸네일·종류를 정한다. 마음 한마디는 제목으로 대체하지 않는다(#394 3번).
      entries.push({
        ...cardOf(treeId, moment, origin, youtube),
        note: text(moment?.note),
        relation: text(moment?.relation),
        treeLabel: label,
        inbox: isInboxTree(tree),
        subject: label
      });
    }
  }
  return entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** 트리별로 걸기. 'all'(또는 빈 값)이면 전체. */
export function filterMomentEntries(entries, treeId) {
  const list = Array.isArray(entries) ? entries : [];
  return treeId && treeId !== 'all' ? list.filter(entry => entry.treeId === treeId) : list;
}

/**
 * 목록·상세 창에 쓸 제목 한 줄(#394 3번 — 정리 화면과 같은 규칙).
 * 직접 쓴 제목이 없으면 자동 기본 문구("<도메인>에서 간직한 순간")를 표시하지 않고,
 * 마음 한마디를 큰 글씨로 쓴다(book-usability.displayTitle의 규칙). 둘 다 없으면 빈 값.
 */
export function momentHeadTitle(moment, titleDisplay = 'both') {
  const view = titleView(moment ?? {}, titleDisplay);
  const memo = text(moment?.note);
  if (view.main) return { main: view.main, sub: view.sub, memoAsMain: false };
  if (memo) return { main: memo, sub: '', memoAsMain: true };
  return { main: '', sub: '', memoAsMain: false };
}

/** 세로 영상 판정(#393과 같은 규칙): /shorts/ 주소 또는 영상 정보의 가로세로(세로가 더 길면 세로). */
export function verticalMoment(url, mediaMetadata = null) {
  const width = Number(mediaMetadata?.width), height = Number(mediaMetadata?.height);
  if (width > 0 && height > width) return true;
  try { return /^\/shorts\//.test(new URL(text(url)).pathname); } catch { return false; }
}
