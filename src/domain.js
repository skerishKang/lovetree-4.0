export const EMOTIONS = ['설렘', '위로', '벅참', '그리움', '고마움', '즐거움'];
export const MAX_MOMENTS = 300;
export const MAX_TREES = 50;
export const EMPTY_STATE = () => ({ version: 1, trees: [] });

export function newId(provider = globalThis.crypto) {
  if (typeof provider?.randomUUID === 'function') return provider.randomUUID();
  // getRandomValues is also available on local HTTP preview origins.
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function requireText(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}을(를) 1~${max}자로 적어 주세요.`);
  return value.trim();
}
export function safeUrl(value = '') {
  if (!value.trim()) return '';
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('https://로 시작하는 올바른 링크를 입력해 주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('http 또는 https 링크만 사용할 수 있어요.');
  if (url.href.length > 2048) throw new Error('링크가 너무 길어요.');
  return url.href;
}
export function validateMomentInput(input) {
  const title = requireText(input.title, '순간 제목', 80);
  const note = requireText(input.note, '마음 한마디', 500);
  const emotion = EMOTIONS.includes(input.emotion) ? input.emotion : '설렘';
  const date = input.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('날짜를 확인해 주세요.');
  const relation = typeof input.relation === 'string' ? input.relation.trim() : '';
  if (relation.length > 100) throw new Error('연결 이유는 100자까지 적을 수 있어요.');
  return { title, note, emotion, date, relation, url: safeUrl(input.url || '') };
}
export function createTree(input, clock = new Date().toISOString()) {
  const subject = requireText(input.subject, '좋아하는 대상', 60);
  const moment = { ...validateMomentInput(input), id: newId(), parentId: null, relation: '', createdAt: clock };
  return { id: newId(), subject, title: `${subject}, 나의 순간들`, createdAt: clock, updatedAt: clock, moments: [moment] };
}
export function addMoment(tree, input, parentId, clock = new Date().toISOString()) {
  if (tree.moments.length >= MAX_MOMENTS) throw new Error(`한 트리에는 ${MAX_MOMENTS}개의 순간까지 담을 수 있어요.`);
  if (!tree.moments.some(m => m.id === parentId)) throw new Error('이어질 순간을 먼저 선택해 주세요.');
  const moment = { ...validateMomentInput(input), id: newId(), parentId, createdAt: clock };
  return { ...tree, updatedAt: clock, moments: [...tree.moments, moment] };
}
export function editMoment(tree, id, input, clock = new Date().toISOString()) {
  const current = tree.moments.find(m => m.id === id);
  if (!current) throw new Error('이 순간을 찾을 수 없어요.');
  return { ...tree, updatedAt: clock, moments: tree.moments.map(m => m.id === id ? { ...m, ...validateMomentInput(input), relation: m.parentId ? input.relation?.trim() || '' : '' } : m) };
}
export function removeMoment(tree, id, clock = new Date().toISOString()) {
  const target = tree.moments.find(m => m.id === id);
  if (!target) throw new Error('이 순간을 찾을 수 없어요.');
  if (tree.moments.length === 1) throw new Error('마지막 순간이에요. 트리 전체를 지우려면 내 트리에서 삭제해 주세요.');
  let parentId = target.parentId;
  const remaining = tree.moments.filter(m => m.id !== id);
  if (parentId === null) {
    const successor = remaining.find(m => m.parentId === id);
    if (!successor) throw new Error('순간 연결을 확인해 주세요.');
    parentId = successor.id;
    return { ...tree, updatedAt: clock, moments: remaining.map(m => m.id === successor.id ? { ...m, parentId: null, relation: '' } : m.parentId === id ? { ...m, parentId, relation: '' } : m) };
  }
  return { ...tree, updatedAt: clock, moments: remaining.map(m => m.parentId === id ? { ...m, parentId, relation: '' } : m) };
}

export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.trees) || value.trees.length > MAX_TREES) throw new Error('지원하지 않는 러브트리 파일이에요.');
  const treeIds = new Set();
  const idValid = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
  const time = v => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
  const trees = value.trees.map(tree => {
    if (!idValid(tree.id) || treeIds.has(tree.id) || !Array.isArray(tree.moments) || !tree.moments.length || tree.moments.length > MAX_MOMENTS || !time(tree.createdAt) || !time(tree.updatedAt)) throw new Error('트리 데이터가 올바르지 않아요.');
    treeIds.add(tree.id);
    const ids = new Set();
    const moments = tree.moments.map(m => {
      if (!idValid(m.id) || ids.has(m.id) || !time(m.createdAt) || (m.parentId !== null && !idValid(m.parentId))) throw new Error('순간 데이터가 올바르지 않아요.');
      ids.add(m.id);
      return { ...validateMomentInput(m), id: m.id, parentId: m.parentId, createdAt: m.createdAt };
    });
    if (moments.filter(m => m.parentId === null).length !== 1) throw new Error('트리의 시작 순간은 하나여야 해요.');
    const byId = new Map(moments.map(m => [m.id, m]));
    for (const moment of moments) {
      let current = moment;
      const seen = new Set();
      while (current.parentId !== null) {
        if (seen.has(current.id)) throw new Error('순간 연결이 원을 이루고 있어요.');
        seen.add(current.id);
        current = byId.get(current.parentId);
        if (!current) throw new Error('연결된 순간이 파일에 없어요.');
      }
    }
    return { id: tree.id, subject: requireText(tree.subject, '대상', 60), title: requireText(tree.title, '트리 제목', 100), createdAt: tree.createdAt, updatedAt: tree.updatedAt, moments };
  });
  return { version: 1, trees };
}

export function importTrees(current, incoming) {
  const safe = validateState(incoming);
  if (current.trees.length + safe.trees.length > MAX_TREES) throw new Error(`트리는 ${MAX_TREES}개까지 보관할 수 있어요.`);
  const copies = safe.trees.map(tree => {
    const ids = new Map(tree.moments.map(m => [m.id, newId()]));
    return { ...tree, id: newId(), moments: tree.moments.map(m => ({ ...m, id: ids.get(m.id), parentId: m.parentId === null ? null : ids.get(m.parentId) })) };
  });
  return { version: 1, trees: [...current.trees, ...copies] };
}

export function treeLayout(tree) {
  const children = new Map(tree.moments.map(m => [m.id, []]));
  for (const m of tree.moments) if (m.parentId) children.get(m.parentId)?.push(m);
  const root = tree.moments.find(m => m.parentId === null);
  const positions = new Map();
  let nextLeaf = 0;
  let maxDepth = 0;
  function visit(m, depth) {
    maxDepth = Math.max(maxDepth, depth);
    const kids = children.get(m.id);
    const rows = kids.map(child => visit(child, depth + 1));
    const row = rows.length ? (rows[0] + rows.at(-1)) / 2 : nextLeaf++;
    positions.set(m.id, { x: 55 + depth * 290, y: 55 + row * 205 });
    return row;
  }
  if (root) visit(root, 0);
  return { positions, width: Math.max(880, 110 + (maxDepth + 1) * 290), height: Math.max(470, 110 + nextLeaf * 205) };
}
