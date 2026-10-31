const VIEWS = new Set(['home','shelf','book','board','network']);
const POSITION_KEY = 'lovetree.v41.account-positions.v1';
const PENDING_KEY = 'lovetree.v41.pending-owner-route.v1';

const safe = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= 256 && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
};
const viewName = value => VIEWS.has(value) ? value : 'home';
const rootMoment = tree => tree?.moments.find(moment => moment.parentId === null) || tree?.moments[0] || null;

export function parseSelectionRoute(hash = '') {
  const raw = String(hash).replace(/^#/, '');
  const [path, query = ''] = raw.split('?', 2);
  if (path.startsWith('my/')) {
    const treeId = safe(new URLSearchParams(query).get('tree'));
    const momentId = safe(new URLSearchParams(query).get('moment'));
    return {scope:'owner', view:viewName(path.slice(3)), treeId, momentId, explicit:true};
  }
  if (path.startsWith('share/')) {
    const parts = path.split('/');
    return {scope:'public', shareId:safe(parts[1]), view:viewName(parts[2] || 'book'), explicit:true};
  }
  return {scope:'screen', view:viewName(path), treeId:null, momentId:null, explicit:VIEWS.has(path)};
}

export function ownerSelectionRoute({view='home', treeId, momentId} = {}) {
  const params = new URLSearchParams();
  const tree = safe(treeId), moment = safe(momentId);
  if (tree) params.set('tree', tree);
  if (moment) params.set('moment', moment);
  const query = params.toString();
  return `#my/${viewName(view)}${query ? `?${query}` : ''}`;
}

export const isOwnerSelectionRoute = hash => parseSelectionRoute(hash).scope === 'owner';
export const isPublicSelectionRoute = hash => parseSelectionRoute(hash).scope === 'public';

function readPositions(storage) {
  try {
    const value = JSON.parse(storage?.getItem(POSITION_KEY));
    return value?.version === 1 && Array.isArray(value.entries) ? value.entries : [];
  } catch { return []; }
}

export function accountPosition(storage, subject) {
  const id = safe(subject);
  if (!id) return null;
  const entry = readPositions(storage).find(item => item?.subject === id);
  if (!entry) return null;
  return {treeId:safe(entry.treeId), momentId:safe(entry.momentId), view:viewName(entry.view)};
}

export function rememberAccountPosition(storage, subject, position = {}) {
  const id = safe(subject), treeId = safe(position.treeId), momentId = safe(position.momentId);
  if (!id || !treeId || !momentId) return false;
  try {
    const entries = readPositions(storage).filter(item => item?.subject !== id).slice(-19);
    entries.push({subject:id, treeId, momentId, view:viewName(position.view)});
    storage.setItem(POSITION_KEY, JSON.stringify({version:1, entries}));
    return true;
  } catch { return false; }
}

export function resolveAccountPosition(trees = [], requested = {}, fallback = {}) {
  const wantedTree = safe(requested.treeId);
  const requestedTree = trees.find(tree => tree.id === wantedTree);
  const fallbackTree = trees.find(tree => tree.id === safe(fallback.treeId));
  const tree = requestedTree || fallbackTree || trees[0] || null;
  const requestedMoment = requestedTree?.moments.find(moment => moment.id === safe(requested.momentId));
  const fallbackMoment = tree?.moments.find(moment => moment.id === safe(fallback.momentId));
  const moment = requestedMoment || fallbackMoment || rootMoment(tree);
  return {
    position:{treeId:tree?.id || null, momentId:moment?.id || null,
      view:viewName(requested.view || fallback.view)},
    treeMissing:Boolean(wantedTree && !requestedTree),
    momentMissing:Boolean(requestedTree && safe(requested.momentId) && !requestedMoment)
  };
}

export function stashPendingOwnerRoute(storage, hash) {
  if (!isOwnerSelectionRoute(hash)) return false;
  try { storage.setItem(PENDING_KEY, String(hash)); return true; } catch { return false; }
}

export function pendingOwnerRoute(storage) {
  try {
    const route = parseSelectionRoute(storage.getItem(PENDING_KEY) || '');
    return route.scope === 'owner' ? route : null;
  } catch { return null; }
}

export function takePendingOwnerRoute(storage) {
  const route = pendingOwnerRoute(storage);
  try { storage.removeItem(PENDING_KEY); } catch {}
  return route;
}

export const selectionStorageKeys = Object.freeze({position:POSITION_KEY, pending:PENDING_KEY});
