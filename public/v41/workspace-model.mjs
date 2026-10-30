import { validateState } from './domain.mjs';

// Read-only projection. No example records, inferred media, or write-back mapping.
export function workspaceModel(document, selection = {}) {
  if (!document || !Number.isSafeInteger(document.revision) || document.revision < 0)
    throw new Error('저장 번호를 확인할 수 없어요.');
  const state = validateState(document.state);
  const trees = state.trees.map(tree => ({
    ...tree,
    moments: tree.moments.map(moment => ({ ...moment, links: [...moment.links] })),
    edges: [
      ...tree.moments.filter(m => m.parentId !== null).map(m => ({
        kind: 'parent', from: m.parentId, to: m.id, reason: m.relation
      })),
      ...tree.moments.flatMap(m => m.links.map(to => ({kind: 'related', from: m.id, to})))
        .filter((edge, index, all) => all.findIndex(other =>
          [other.from, other.to].sort().join('\0') === [edge.from, edge.to].sort().join('\0')) === index)
    ]
  }));
  const tree = trees.find(t => t.id === selection.treeId) || trees[0] || null;
  const moment = tree?.moments.find(m => m.id === selection.momentId)
    || tree?.moments.find(m => m.parentId === null) || null;
  return {revision: document.revision, trees,
    selection: {treeId: tree?.id || null, momentId: moment?.id || null}};
}
