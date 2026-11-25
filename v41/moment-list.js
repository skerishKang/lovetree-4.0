// #394: 첫 화면 "순간 목록"의 순수 계산 한 벌.
// 모든 트리의 순간을 최근 순으로 모으고, 트리별로 걸러 보기와 상세 창 제목 규칙을 여기서 정한다.
// 데이터는 v41/home.js가, 그리기는 src/views/orbit.js가 이 결과로 한다. 조건·문구는 시험이 고정한다.
import { cardOf, otherMomentThumb } from './home-moments.js';
import { pickerLabel, isInboxTree, shelfOrder } from '../public/v41/inbox-model.mjs';
import { titleView } from '../public/v41/book-usability.mjs';
const text = value => (typeof value === 'string' ? value.trim() : '');

/** 순간 목록 위 트리 고르기 칸 목록. [전체]는 화면이 붙이고, 여기서는 모아둔 순간 먼저·나머지 기존 순서다. */
export function momentListTrees(trees) {
  // 트리마다 고정 색(2026-11-16 대표 지적) — 모아둔 순간 먼저·기존 순서(shelfOrder)의 자리가 고정이다.
  // 색은 identity.css의 --lt-tree-1..6 토큰(낮은 채도 — 이름 글자는 기본색 그대로 두고 점으로만 구분한다).
  return shelfOrder(Array.isArray(trees) ? trees : [])
    .map((tree, index) => ({ id: text(tree?.id), label: pickerLabel(tree), inbox: isInboxTree(tree), color: 'var(--lt-tree-' + (index % 6 + 1) + ')' }))
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
        ...cardOf(treeId, moment, origin, youtube, otherMomentThumb(tree.moments, id, origin)),
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

/**
 * 트리 칩 순서(2026-11-17, 대표 결정): 계정에 저장한 순서(prefs.treeChipOrder)를 앞에 두고,
 * 저장 목록에 없는 트리는 기존 순서(선반 자리) 그대로 뒤에 붙인다. '전체' 칩은 목록 UI가 맨 앞에 고정한다(여기서 다루지 않는다).
 */
export function orderedTrees(trees, chipOrder) {
  const list = Array.isArray(trees) ? trees : [];
  const order = Array.isArray(chipOrder) ? chipOrder : [];
  const pos = new Map();
  order.forEach((id, i) => { if (!pos.has(id)) pos.set(id, i); });
  return list
    .map((tree, i) => ({ tree, rank: pos.has(tree?.id) ? pos.get(tree?.id) : order.length + i }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.tree);
}
