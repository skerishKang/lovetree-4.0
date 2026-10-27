import { RECOVERY_KEY, STORAGE_KEY } from '../storage.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function hasRecovery(storage, loaded = {}) {
  try { return storage.getItem(RECOVERY_KEY) !== null || Boolean(loaded.recovery); }
  catch { return Boolean(loaded.recovery); }
}
export function recoveryData(storage, loaded = {}) {
  return storage.getItem(RECOVERY_KEY) ?? (loaded.recovery ? storage.getItem(STORAGE_KEY) : null);
}
const POSITION_KEY = 'lovetree.v4.reading-position.v1';
export function remember(storage, treeId, momentId) {
  try { storage.setItem(POSITION_KEY, JSON.stringify({treeId, momentId})); } catch { /* Reading position is optional; records use the main storage boundary. */ }
}
export function resume(storage, trees) {
  try {
    const p = JSON.parse(storage.getItem(POSITION_KEY));
    const tree = trees.find(t => t.id === p?.treeId);
    const moment = tree?.moments.find(m => m.id === p.momentId);
    if (moment) return {tree, moment};
  } catch { /* An unavailable or stale position falls back to a current record. */ }
  const tree = [...trees].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return tree ? {tree, moment: tree.moments.at(-1)} : null;
}
export function readingOrder(tree) {
  const children = new Map();
  for (const m of tree.moments) { const list = children.get(m.parentId) || []; list.push(m); children.set(m.parentId, list); }
  const result = [], seen = new Set();
  function walk(m) { if (seen.has(m.id)) return; seen.add(m.id); result.push(m); for (const c of children.get(m.id) || []) walk(c); }
  for (const m of children.get(null) || []) walk(m);
  return result;
}
export function orbitRecords(trees) {
  return trees.flatMap(tree => tree.moments.map(moment => ({...moment, key: `${tree.id}/${moment.id}`, treeId: tree.id, subject: tree.subject})))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
