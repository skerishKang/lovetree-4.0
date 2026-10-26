import test from 'node:test';
import assert from 'node:assert/strict';
import { createTree, addMoment, editMoment, removeMoment, validateState, importTrees, treeLayout, safeUrl, newId } from '../src/domain.js';
import { loadState, saveState, STORAGE_KEY, RECOVERY_KEY } from '../src/storage.js';

const input = (title = '첫 목소리') => ({ subject: '윤슬', title, note: '오래 기억하고 싶은 마음', emotion: '설렘', date: '2026-10-27', url: '' });
const stateOf = tree => ({ version: 1, trees: [tree] });
test('local HTTP preview can create records without crypto.randomUUID', () => {
  const provider = { getRandomValues: buffer => crypto.getRandomValues(buffer) };
  const ids = Array.from({ length: 20 }, () => newId(provider));
  assert.equal(new Set(ids).size, 20);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
test('create → connect → save → reload preserves the emotional path', () => {
  const first = createTree(input());
  const connected = addMoment(first, { ...input('함께 부른 노래'), relation: '직접 만나고 싶어서' }, first.moments[0].id);
  const storage = memoryStorage();
  saveState(storage, stateOf(connected), null);
  const reloaded = loadState(storage);
  assert.equal(reloaded.error, null);
  assert.equal(reloaded.state.trees[0].moments[1].parentId, first.moments[0].id);
  assert.equal(reloaded.state.trees[0].moments[1].relation, '직접 만나고 싶어서');
});
test('invalid parent and non-web URLs cannot be saved', () => {
  const tree = createTree(input());
  assert.throws(() => addMoment(tree, input(), 'missing'));
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'file:///c:/private', 'https://name:secret@example.com']) assert.throws(() => safeUrl(url));
  assert.equal(safeUrl('https://youtu.be/abc?t=32'), 'https://youtu.be/abc?t=32');
});
test('import rejects duplicate IDs, cycles and disconnected references', () => {
  const root = createTree(input());
  const branch = addMoment(root, input('두 번째'), root.moments[0].id);
  const tree = addMoment(branch, input('세 번째'), branch.moments[1].id);
  const cycle = structuredClone(tree);
  cycle.moments[1].parentId = cycle.moments[2].id;
  assert.throws(() => validateState(stateOf(cycle)), /원을/);
  const duplicate = structuredClone(tree);
  duplicate.moments[1].id = duplicate.moments[0].id;
  assert.throws(() => validateState(stateOf(duplicate)));
  const missing = structuredClone(tree);
  missing.moments[2].parentId = 'missing';
  assert.throws(() => validateState(stateOf(missing)), /없어요/);
  const invalidDate = structuredClone(tree);
  invalidDate.moments[0].date = '2026-02-31';
  assert.throws(() => validateState(stateOf(invalidDate)), /날짜/);
});
test('deleting the root promotes its first child and retains every other moment', () => {
  const first = createTree(input());
  const second = addMoment(first, input('A'), first.moments[0].id);
  const branched = addMoment(second, input('B'), first.moments[0].id);
  const result = removeMoment(branched, first.moments[0].id);
  assert.equal(result.moments.length, 2);
  assert.equal(result.moments[0].parentId, null);
  assert.equal(result.moments[1].parentId, result.moments[0].id);
  validateState(stateOf(result));
  assert.throws(() => removeMoment(first, first.moments[0].id), /마지막/);
});
test('deleting an intermediate moment preserves descendants and clears obsolete relation', () => {
  let tree = createTree(input());
  const rootId = tree.moments[0].id;
  tree = addMoment(tree, input('B'), rootId);
  const middleId = tree.moments[1].id;
  tree = addMoment(tree, { ...input('C'), relation: 'B의 다음 무대' }, middleId);
  tree = removeMoment(tree, middleId);
  assert.equal(tree.moments[1].parentId, rootId);
  assert.equal(tree.moments[1].relation, '');
  validateState(stateOf(tree));
});
test('editing content preserves identity and parent, without mutating original tree', () => {
  const tree = createTree(input());
  const changed = editMoment(tree, tree.moments[0].id, input('새 제목'));
  assert.equal(changed.moments[0].id, tree.moments[0].id);
  assert.equal(changed.moments[0].parentId, null);
  assert.equal(tree.moments[0].title, '첫 목소리');
});
test('import creates fresh identities and never overwrites existing trees', () => {
  const first = createTree(input());
  const source = addMoment(first, input('두 번째'), first.moments[0].id);
  const merged = importTrees(stateOf(source), stateOf(source));
  assert.equal(merged.trees.length, 2);
  assert.notEqual(merged.trees[0].id, merged.trees[1].id);
  assert.notEqual(merged.trees[0].moments[0].id, merged.trees[1].moments[0].id);
  assert.equal(merged.trees[1].moments[1].parentId, merged.trees[1].moments[0].id);
  validateState(merged);
});
test('corrupt local records are preserved in a recovery copy', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{broken' });
  const result = loadState(storage);
  assert.equal(result.recovery, true);
  assert.equal(storage.getItem(RECOVERY_KEY), '{broken');
  assert.equal(storage.getItem(STORAGE_KEY), '{broken');
});
test('an older recovery is never overwritten and saving remains blocked', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{new-broken', [RECOVERY_KEY]: '{old-broken' });
  const result = loadState(storage);
  assert.equal(result.blocked, true);
  assert.equal(storage.getItem(RECOVERY_KEY), '{old-broken');
});
test('two browser tabs cannot overwrite a newer saved state silently', () => {
  const storage = memoryStorage();
  const old = saveState(storage, stateOf(createTree(input())), null);
  const fresh = saveState(storage, stateOf(createTree(input('別の記録'))), old);
  assert.throws(() => saveState(storage, stateOf(createTree(input('stale'))), old), /別|다른 탭/);
  assert.equal(storage.getItem(STORAGE_KEY), fresh);
});
test('storage failures are reported instead of claiming a successful save', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.throws(() => saveState(storage, stateOf(createTree(input())), null), /공간/);
});
test('branched tree layout places every child after its parent', () => {
  let tree = createTree(input());
  tree = addMoment(tree, input('둘'), tree.moments[0].id);
  tree = addMoment(tree, input('셋'), tree.moments[0].id);
  const { positions } = treeLayout(tree);
  assert.equal(positions.size, 3);
  assert.ok(positions.get(tree.moments[1].id).x > positions.get(tree.moments[0].id).x);
  assert.notEqual(positions.get(tree.moments[1].id).y, positions.get(tree.moments[2].id).y);
});
