import test from 'node:test';
import assert from 'node:assert/strict';
import { createTree, addMoment, editMoment, removeMoment, validateState, importTrees, treeLayout, pathTo, linkMoments, unlinkMoments, relatedMoments, MAX_LINKS, safeUrl, newId } from '../src/domain.js';
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
test('import rejects malformed entries in an untrusted file', () => {
  for (const broken of [null, 5, 'text']) assert.throws(() => validateState({ version: 1, trees: [broken] }), /트리 데이터/);
  const tree = createTree(input());
  assert.throws(() => validateState({ version: 1, trees: [{ ...tree, moments: [null] }] }), /순간 데이터/);
  assert.throws(() => validateState({ version: 1, trees: [{ ...tree, moments: [tree.moments[0], null] }] }), /순간 데이터/);
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
test('editing a connected moment keeps its parent and reason, and ignores a non-text reason', () => {
  const tree = createTree(input());
  const connected = addMoment(tree, { ...input('이어진 순간'), relation: '그날의 이유' }, tree.moments[0].id);
  const kept = editMoment(connected, connected.moments[1].id, { ...input('고친 제목'), relation: ' 고친 이유 ' });
  assert.equal(kept.moments[1].parentId, tree.moments[0].id);
  assert.equal(kept.moments[1].relation, '고친 이유');
  validateState(stateOf(kept));
  const coerced = editMoment(connected, connected.moments[1].id, { ...input('숫자 이유'), relation: 5 });
  assert.equal(coerced.moments[1].relation, '');
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
  const unreadable = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} };
  assert.throws(() => saveState(unreadable, stateOf(createTree(input())), null), /저장소에 접근/);
});
test('emotions outside the app list survive import and export unchanged', () => {
  const base = createTree(input());
  const imported = { version: 1, trees: [{ ...base, moments: [{ ...base.moments[0], emotion: '행복' }] }] };
  assert.equal(validateState(imported).trees[0].moments[0].emotion, '행복');
  const merged = importTrees({ version: 1, trees: [] }, imported);
  assert.equal(merged.trees[0].moments[0].emotion, '행복');
  assert.equal(JSON.parse(JSON.stringify(merged)).trees[0].moments[0].emotion, '행복');
  const withEmotion = emotion => validateState({ version: 1, trees: [{ ...base, moments: [{ ...base.moments[0], emotion }] }] }).trees[0].moments[0].emotion;
  assert.equal(withEmotion('  '), '설렘');
  assert.equal(withEmotion('가'.repeat(30)), '설렘');
  assert.equal(withEmotion(undefined), '설렘');
});
test('the route to a moment is the single parent chain from the start', () => {
  let tree = createTree(input());
  const root = tree.moments[0].id;
  tree = addMoment(tree, input('둘'), root);
  const second = tree.moments[1].id;
  tree = addMoment(tree, input('셋'), second);
  const third = tree.moments[2].id;
  tree = addMoment(tree, input('옆가지'), root);
  assert.deepEqual(pathTo(tree, third).map(m => m.id), [root, second, third]);
  assert.deepEqual(pathTo(tree, tree.moments[3].id).map(m => m.title), ['첫 목소리', '옆가지']);
  assert.deepEqual(pathTo(tree, root).map(m => m.id), [root]);
  assert.deepEqual(pathTo(tree, 'missing'), []);
  assert.deepEqual(pathTo(removeMoment(tree, second), third).map(m => m.id), [root, third]);
});
test('related moments link both sides without changing the parent route', () => {
  let tree = createTree(input());
  const root = tree.moments[0].id;
  tree = addMoment(tree, input('가을의 무대'), root);
  const left = tree.moments[1].id;
  tree = addMoment(tree, input('겨울의 인터뷰'), root);
  const right = tree.moments[2].id;
  const linked = linkMoments(tree, left, right);
  assert.deepEqual(linked.moments.find(m => m.id === left).links, [right]);
  assert.deepEqual(linked.moments.find(m => m.id === right).links, [left]);
  assert.equal(linked.moments.find(m => m.id === right).parentId, root);
  assert.deepEqual(pathTo(linked, right).map(m => m.id), [root, right]);
  assert.deepEqual(relatedMoments(linked, left).map(m => m.id), [right]);
  assert.deepEqual(relatedMoments(linked, right).map(m => m.id), [left]);
  assert.equal(linkMoments(linked, left, right), linked);
  assert.deepEqual(unlinkMoments(linked, left, right).moments.filter(m => m.links.length), []);
  assert.throws(() => linkMoments(tree, left, left), /같은 순간/);
  assert.throws(() => linkMoments(tree, left, 'missing'), /찾을 수 없어요/);
  let crowded = tree;
  for (let i = 0; i < MAX_LINKS; i++) {
    crowded = addMoment(crowded, input(`동료 ${i}`), root);
    crowded = linkMoments(crowded, left, crowded.moments.at(-1).id);
  }
  const extra = addMoment(crowded, input('한 명 더'), root);
  assert.throws(() => linkMoments(extra, left, extra.moments.at(-1).id), /20개/);
});
test('deleting or importing a moment keeps related links consistent', () => {
  let tree = createTree(input());
  const root = tree.moments[0].id;
  tree = addMoment(tree, input('봄의 무대'), root);
  const left = tree.moments[1].id;
  tree = addMoment(tree, input('여름의 인터뷰'), root);
  const right = tree.moments[2].id;
  const linked = linkMoments(tree, left, right);
  validateState(stateOf(linked));
  const afterDelete = removeMoment(linked, right);
  assert.deepEqual(afterDelete.moments.find(m => m.id === left).links, []);
  validateState(stateOf(afterDelete));
  const merged = importTrees({ version: 1, trees: [] }, stateOf(linked));
  const copy = merged.trees[0];
  const copiedLeft = copy.moments.find(m => m.title === '봄의 무대'), copiedRight = copy.moments.find(m => m.title === '여름의 인터뷰');
  assert.deepEqual(relatedMoments(copy, copiedLeft.id).map(m => m.id), [copiedRight.id]);
  assert.throws(() => validateState(stateOf({ ...linked, moments: linked.moments.map(m => m.id === left ? { ...m, links: ['missing'] } : m) })), /파일에 없어요/);
  assert.throws(() => validateState(stateOf({ ...linked, moments: linked.moments.map(m => m.id === left ? { ...m, links: [left] } : m) })), /관련 순간/);
  assert.throws(() => validateState(stateOf({ ...linked, moments: linked.moments.map(m => m.id === left ? { ...m, links: 'nope' } : m) })), /관련 순간/);
});
test('older records without related links stay valid', () => {
  const tree = createTree(input());
  const stripped = { ...tree, moments: tree.moments.map(({ links, ...rest }) => rest) };
  const loaded = validateState(stateOf(stripped));
  assert.deepEqual(loaded.trees[0].moments[0].links, []);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded)).trees[0].moments[0].links, []);
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
