import { createHash, randomBytes } from 'node:crypto';
import { validateState } from '../src/domain.js';
import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';

const SHARE_ID = /^[A-Za-z0-9_-]{20,64}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{1,80}$/;
const VIEWS = new Set(['book', 'board', 'network']);
const NO_STORE = { 'cache-control': 'no-store, max-age=0', pragma: 'no-cache', 'x-content-type-options': 'nosniff' };

function jsonBody(request) {
  if (!String(request?.headers?.['content-type'] || '').toLowerCase().startsWith('application/json'))
    throw new ApiError(415, 'unsupported_media_type', 'JSON으로만 요청할 수 있어요.');
  try { return JSON.parse(typeof request.body === 'string' ? request.body : String(request.body || '')); }
  catch { throw new ApiError(400, 'invalid_json', '공유 요청 형식을 읽을 수 없어요.'); }
}
function cleanView(value) { return VIEWS.has(value) ? value : 'book'; }
function privateMedia(value) {
  if (typeof value !== 'string' || !value) return false;
  try { return new URL(value, 'https://lovetree.invalid').pathname.startsWith('/api/media/'); }
  catch { return true; }
}
export function projectSharedTree(document, treeId) {
  let state;
  try { state = validateState(document); }
  catch { throw new ApiError(500, 'stored_document_invalid', '보관된 기록을 읽을 수 없어요.'); }
  const source = state.trees.find(tree => tree.id === treeId);
  if (!source) throw new ApiError(410, 'share_removed', '공유된 트리가 삭제되었거나 더 이상 존재하지 않아요.');
  let omittedPrivateMedia = 0;
  const tree = {
    ...source,
    moments: source.moments.map(moment => {
      const url = privateMedia(moment.url) ? '' : moment.url;
      if (url !== moment.url) omittedPrivateMedia += 1;
      return { ...moment, url, links: [...moment.links] };
    })
  };
  return { tree, omittedPrivateMedia };
}
function selectEntry(tree, value) {
  if (typeof value === 'string' && RECORD_ID.test(value) && tree.moments.some(moment => moment.id === value)) return value;
  return tree.moments.find(moment => moment.parentId === null)?.id || tree.moments[0]?.id || null;
}
function shareSummary(row) {
  return { id: row.shareId, treeId: row.treeId, entryMomentId: row.entryMomentId, view: row.view, status: row.status, createdAt: row.createdAt, revokedAt: row.revokedAt || null };
}

export function createShareService({ shareRepo, workspaceRepo, productId, makeId = () => randomBytes(18).toString('base64url') }) {
  async function projection(subjectId, input) {
    if (!input || typeof input !== 'object' || !RECORD_ID.test(input.treeId || ''))
      throw new ApiError(400, 'invalid_share_request', '공유할 트리를 다시 선택해 주세요.');
    const stored = await workspaceRepo.load({ productId, subjectId });
    if (!stored) throw new ApiError(404, 'share_tree_missing', '공유할 내 트리를 찾을 수 없어요.');
    const { tree, omittedPrivateMedia } = projectSharedTree(stored.doc, input.treeId);
    if (!tree.moments.length) throw new ApiError(422, 'share_empty', '공유할 순간이 아직 없어요.');
    const entryMomentId=selectEntry(tree,input.entryMomentId),view=cleanView(input.view);
    const previewToken=createHash('sha256').update(JSON.stringify({revision:stored.revision,tree,entryMomentId,view})).digest('base64url');
    return { tree, omittedPrivateMedia, entryMomentId, view, previewToken };
  }
  return {
    projection,
    async create(subjectId, input) {
      const preview = await projection(subjectId, input);
      if (typeof input?.previewToken !== 'string' || input.previewToken !== preview.previewToken)
        throw new ApiError(409, 'share_preview_stale', '공개 내용이 바뀌었어요. 다시 미리 본 뒤 링크를 만들어 주세요.');
      let row;
      for (let attempt = 0; attempt < 4 && !row; attempt += 1) {
        row = await shareRepo.create({ productId, subjectId, shareId: makeId(), treeId: preview.tree.id, entryMomentId: preview.entryMomentId, view: preview.view });
      }
      if (!row) throw new ApiError(503, 'share_unavailable', '공유 주소를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      return { share: shareSummary(row), preview };
    },
    async list(subjectId) {
      return (await shareRepo.list({ productId, subjectId })).map(shareSummary);
    },
    async revoke(subjectId, shareId) {
      if (!SHARE_ID.test(shareId)) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      const existing = await shareRepo.load({ productId, shareId });
      if (!existing) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      if (existing.subjectId !== subjectId) throw new ApiError(403, 'share_forbidden', '다른 계정의 공유는 바꿀 수 없어요.');
      return shareSummary(await shareRepo.revoke({ productId, subjectId, shareId }));
    },
    async read(shareId) {
      if (!SHARE_ID.test(shareId)) throw new ApiError(404, 'share_invalid', '공유 주소 형식이 올바르지 않아요.');
      const row = await shareRepo.load({ productId, shareId });
      if (!row) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      if (row.status !== 'active') throw new ApiError(410, 'share_revoked', '소유자가 이 공유를 취소했어요.');
      const stored = await workspaceRepo.load({ productId, subjectId: row.subjectId });
      if (!stored) throw new ApiError(410, 'share_removed', '공유된 트리가 삭제되었거나 더 이상 존재하지 않아요.');
      const { tree, omittedPrivateMedia } = projectSharedTree(stored.doc, row.treeId);
      if (!tree.moments.length) throw new ApiError(422, 'share_empty', '공유할 순간이 아직 없어요.');
      return { share: shareSummary(row), tree, omittedPrivateMedia };
    }
  };
}

export function createShareHandler({ authenticate, service, productId }) {
  async function owner(request) {
    let verified;
    try { verified = await authenticate(request); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, 'auth_unavailable', '로그인 연결에 문제를 만났어요.'); }
    return parsePrincipal(verified, productId).subjectId;
  }
  async function handle(request) {
    const path = String(request?.path || ''), method = request?.method || 'GET';
    const publicMatch = path.match(/^\/api\/public\/shares\/([^/]+)$/);
    if (publicMatch) {
      if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
      return { status: 200, body: await service.read(publicMatch[1]), headers: NO_STORE };
    }
    const subjectId = await owner(request);
    if (path === '/api/shares/preview') {
      if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
      return { status: 200, body: { preview: await service.projection(subjectId, jsonBody(request)) }, headers: NO_STORE };
    }
    if (path === '/api/shares') {
      if (method === 'GET') return { status: 200, body: { shares: await service.list(subjectId) }, headers: NO_STORE };
      if (method === 'POST') return { status: 201, body: await service.create(subjectId, jsonBody(request)), headers: NO_STORE };
      throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
    }
    const item = path.match(/^\/api\/shares\/([^/]+)$/);
    if (item) {
      if (method !== 'DELETE') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
      return { status: 200, body: { share: await service.revoke(subjectId, item[1]) }, headers: NO_STORE };
    }
    throw new ApiError(404, 'not_found', '요청을 찾을 수 없어요.');
  }
  return async request => {
    try { return await handle(request); }
    catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: { code: error.code, message: error.message, ...(error.details || {}) } }, headers: NO_STORE };
      console.error('[lovetree-share] 요청 처리 실패', { path: request?.path, method: request?.method });
      return { status: 500, body: { error: { code: 'internal_error', message: '서버에서 처리하지 못했어요.' } }, headers: NO_STORE };
    }
  };
}
