import { createHash, randomBytes } from 'node:crypto';
import { validateState, coverModeOf, normalizeCoverDesign } from '../src/domain.js';
import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';
import { ROLE_AI_CUSTOMER } from './admin-roles.js';

const SHARE_ID = /^[A-Za-z0-9_-]{20,64}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TREE_ID = /^[A-Za-z0-9_-]{1,80}$/;
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
  // #425 2번: 올린 사진 표지(coverMode=photo)는 공개 응답에서만 디자인 표지로,
  // 디자인이 없으면 기본 색 표지로 바꾼다. 저장본은 건드리지 않는다.
  if (coverModeOf(source) === 'photo') tree.coverMode = normalizeCoverDesign(source.coverDesign) ? 'design' : 'basic';
  return { tree, omittedPrivateMedia };
}
function selectEntry(tree, value) {
  if (typeof value === 'string' && RECORD_ID.test(value) && tree.moments.some(moment => moment.id === value)) return value;
  return tree.moments.find(moment => moment.parentId === null)?.id || tree.moments[0]?.id || null;
}
function shareSummary(row) {
  return { id: row.shareId, treeId: row.treeId, entryMomentId: row.entryMomentId, view: row.view, status: row.status, createdAt: row.createdAt, revokedAt: row.revokedAt || null, discoverable: row.discoverable === true, discoverableAt: row.discoverableAt || null, origin: row.origin || 'owner', momentCount: Number(row.momentCount ?? 0) };
}

export function createShareService({ shareRepo, workspaceRepo, visibilityRepo = null, admin = null, productId, plusEntitled = () => false, makeId = () => randomBytes(18).toString('base64url') }) {
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
  async function treeVisibility(subjectId, treeId) {
    if (!visibilityRepo) return 'public';
    return (await visibilityRepo.get({ productId, subjectId, treeId })).visibility;
  }
  return {
    projection,
    async create(subjectId, input) {
      const preview = await projection(subjectId, input);
      if (typeof input?.previewToken !== 'string' || input.previewToken !== preview.previewToken)
        throw new ApiError(409, 'share_preview_stale', '공개 내용이 바뀌었어요. 다시 미리 본 뒤 링크를 만들어 주세요.');
      let row;
      for (let attempt = 0; attempt < 4 && !row; attempt += 1) {
        row = await shareRepo.create({ productId, subjectId, shareId: makeId(), treeId: preview.tree.id, entryMomentId: preview.entryMomentId, view: preview.view, momentCount: preview.tree.moments.length });
      }
      if (!row) throw new ApiError(503, 'share_unavailable', '공유 주소를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      return { share: shareSummary(row), preview };
    },
    async list(subjectId) {
      return (await shareRepo.list({ productId, subjectId })).map(shareSummary);
    },
    async setDiscoverable(subjectId, shareId, discoverable) {
      if (!SHARE_ID.test(shareId)) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      const existing = await shareRepo.load({ productId, shareId });
      if (!existing) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      if (existing.subjectId !== subjectId) throw new ApiError(403, 'share_forbidden', '다른 계정의 공유는 바꿀 수 없어요.');
      // #538: 자동 공개 행의 소개 여부는 서버가 조건으로 판단한다 — 스위치로 바꾸지 않는다.
      if (existing.origin === 'auto') throw new ApiError(409, 'share_auto_managed', '자동으로 공개된 트리는 둘러보기 스위치로 바꿀 수 없어요.');
      if (existing.status !== 'active') throw new ApiError(409, 'share_revoked', '취소된 공유는 발견에 공개할 수 없어요.');
      const changed = await shareRepo.setDiscoverable({ productId, subjectId, shareId, discoverable });
      return shareSummary(changed);
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
      // #538: 비공개 트리는 공개 읽기 경로에서도 서버가 막는다(화면 잠금만으로 막지 않는다).
      if (await treeVisibility(row.subjectId, row.treeId) === 'private')
        throw new ApiError(403, 'share_private', '소유자가 이 트리를 비공개로 바꿨어요.');
      const stored = await workspaceRepo.load({ productId, subjectId: row.subjectId });
      if (!stored) throw new ApiError(410, 'share_removed', '공유된 트리가 삭제되었거나 더 이상 존재하지 않아요.');
      const { tree, omittedPrivateMedia } = projectSharedTree(stored.doc, row.treeId);
      if (!tree.moments.length) throw new ApiError(422, 'share_empty', '공유할 순간이 아직 없어요.');
      const shared = { share: shareSummary(row), tree, omittedPrivateMedia };
      // #611 3번: AI 테스터 기록은 공개 읽기 결과에 'AI 테스터' 배지 한 비트만 내린다.
      // 사본 화면(내 트리)에서는 붙이지 않는다 — 여기 read()는 남에게 보이는 공개 응답뿐이다.
      if (admin && await admin.roleFor({ productId, subjectId: row.subjectId }) === ROLE_AI_CUSTOMER) shared.aiTester = true;
      return shared;
    },
    // #538: /api/workspace 저장 성공 뒤 같은 훅에서 부른다.
    // ① 살아 있는 공유 행(주인 만든 행 포함)의 moment_count 를 갱신하고,
    // ② 공유 행이 없는 트리(순간 1개 이상)에 자동 공개 행(origin='auto')을 만들며,
    // ③ 문서에서 사라진 트리의 자동 공개 행은 즉시 내린다.
    async syncSharesAfterSave(subjectId, doc) {
      const counts = new Map();
      for (const tree of (doc?.trees || [])) counts.set(tree.id, Array.isArray(tree.moments) ? tree.moments.length : 0);
      const existing = await shareRepo.list({ productId, subjectId });
      const activeTrees = new Set(existing.filter(row => row.status === 'active').map(row => row.treeId));
      for (const [treeId, momentCount] of counts) {
        if (momentCount <= 0) continue;
        await shareRepo.updateMomentCount({ productId, subjectId, treeId, momentCount });
        if (activeTrees.has(treeId)) continue;
        const tree = doc.trees.find(item => item.id === treeId);
        const entry = tree.moments.find(moment => moment.parentId === null) || tree.moments[0];
        await shareRepo.upsertAutoShare({ productId, subjectId, shareId: makeId(), treeId, entryMomentId: entry.id, momentCount });
      }
      await shareRepo.revokeAutoSharesNotIn({ productId, subjectId, treeIds: [...counts.keys()] });
    },
    // #538: 트리 공개 상태. 비공개는 Plus 전용 — 판단은 서버가 한다.
    async setTreeVisibility(subjectId, treeId, visibility) {
      if (!TREE_ID.test(treeId || '')) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
      if (visibility !== 'public' && visibility !== 'private') throw new ApiError(400, 'visibility_invalid', '공개 상태 값을 확인해 주세요.');
      const stored = await workspaceRepo.load({ productId, subjectId });
      if (!stored) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
      let doc;
      try { doc = validateState(stored.doc); }
      catch { throw new ApiError(500, 'stored_document_invalid', '보관된 기록을 읽을 수 없어요.'); }
      if (!doc.trees.some(tree => tree.id === treeId)) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
      if (visibility === 'private' && !plusEntitled(subjectId))
        throw new ApiError(403, 'plus_required_private', '비공개는 Plus 전용이에요. 지금은 모든 트리가 공개로 유지돼요.');
      if (visibilityRepo) await visibilityRepo.set({ productId, subjectId, treeId, visibility });
      return { treeId, visibility };
    },
    async getTreeVisibility(subjectId, treeId) {
      if (!TREE_ID.test(treeId || '')) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
      const stored = await workspaceRepo.load({ productId, subjectId });
      if (!stored) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
      return { treeId, visibility: await treeVisibility(subjectId, treeId) };
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
    const discovery = path.match(/^\/api\/shares\/([^/]+)\/discovery$/);
    if (discovery) {
      if (method !== 'PUT' && method !== 'DELETE') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
      return { status: 200, body: { share: await service.setDiscoverable(subjectId, discovery[1], method === 'PUT') }, headers: NO_STORE };
    }
    // #538: 트리 공개 상태. 비공개 지정은 Plus 전용 — 서버가 판단한다.
    const visibility = path.match(/^\/api\/trees\/([^/]+)\/visibility$/);
    if (visibility) {
      if (method === 'PUT') {
        const body = jsonBody(request);
        return { status: 200, body: await service.setTreeVisibility(subjectId, visibility[1], body?.visibility), headers: NO_STORE };
      }
      if (method === 'GET') return { status: 200, body: await service.getTreeVisibility(subjectId, visibility[1]), headers: NO_STORE };
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
