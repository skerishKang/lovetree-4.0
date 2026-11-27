import { logServerError } from './error-log.js';
import { createHash, randomBytes } from 'node:crypto';
import { coverModeOf, normalizeCoverDesign } from '../src/domain.js';
import { normalizeTreeOpenView } from '../public/v41/tree-open-view.mjs';
import { safePublicThumbnail } from '../public/v41/public-thumbnail.mjs';
import { isPrivateMediaUrl, projectPublicStats, projectPublicTree, projectPublicVisitPrefs } from './public-projection.js';
import { youtubeIdFrom, youtubeStageThumbUrl } from '../public/v41/youtube-id.mjs';
import { ApiError } from './errors.js';
import { readStoredDocument } from './workspace-service.js';
import { refreshStageIndex } from './stage-index-refresh.js';
import { parsePrincipal } from './principal.js';
import { aiTesterFor } from './admin-roles.js';
import { isHiddenShare } from './hidden-share.js';

const SHARE_ID = /^[A-Za-z0-9_-]{20,64}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TREE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const VIEWS = new Set(['book', 'board', 'network']);
const NO_STORE = { 'cache-control': 'no-store, max-age=0', pragma: 'no-cache', 'x-content-type-options': 'nosniff' };
const VISIT_NO_STORE = { 'cache-control': 'private, no-cache', pragma: 'no-cache', 'x-content-type-options': 'nosniff' };

function jsonBody(request) {
  if (!String(request?.headers?.['content-type'] || '').toLowerCase().startsWith('application/json'))
    throw new ApiError(415, 'unsupported_media_type', 'JSON으로만 요청할 수 있어요.');
  try { return JSON.parse(typeof request.body === 'string' ? request.body : String(request.body || '')); }
  catch { throw new ApiError(400, 'invalid_json', '공유 요청 형식을 읽을 수 없어요.'); }
}
function visitResponse(request, body) {
  const etag = '"' + createHash('sha256').update(JSON.stringify(body)).digest('base64url') + '"';
  const headers = { ...VISIT_NO_STORE, etag };
  if (request?.headers?.['if-none-match'] === etag) return { status: 304, body: undefined, headers };
  return { status: 200, body, headers };
}
function cleanView(value) { return VIEWS.has(value) ? value : 'book'; }
// #1067: 이미 검증한 주인 문서 사본으로 트리 공개 사본을 만든다(요청 안에서만 재사용).
export function projectSharedTreeFromScan(scan, treeId, publicId = '') {
  // #986: 저장된 문서에 격리 트리가 섞여 있어도, 읽을 수 있는 트리의 공유는 그대로 동작한다.
  // 문서 전체를 검사하면 트리 하나 때문에 공유 만들기·공개 읽기·커뮤니티 카드가 함께 실패한다.
  if (!scan) throw new ApiError(500, 'stored_document_invalid', '보관된 기록을 읽을 수 없어요.');
  const source = scan.state.trees.find(tree => tree.id === treeId);
  if (!source) throw new ApiError(410, 'share_removed', '공유된 트리가 삭제되었거나 더 이상 존재하지 않아요.');
  const omittedPrivateMedia = source.moments.filter(moment => isPrivateMediaUrl(moment.url) || isPrivateMediaUrl(moment.mediaMetadata?.thumbnail)).length;
  const tree = projectPublicTree(source);
  tree.id = publicId || source.id;
  // #425 2번: 올린 사진 표지(coverMode=photo)는 공개 응답에서만 디자인 표지로,
  // 디자인이 없으면 기본 색 표지로 바꾼다. 저장본은 건드리지 않는다.
  if (coverModeOf(source) === 'photo') tree.coverMode = normalizeCoverDesign(source.coverDesign) ? 'design' : 'basic';
  return { tree, omittedPrivateMedia };
}
export function projectSharedTree(document, treeId, publicId = '') {
  return projectSharedTreeFromScan(readStoredDocument(document), treeId, publicId);
}
function selectEntry(tree, value) {
  if (typeof value === 'string' && RECORD_ID.test(value) && tree.moments.some(moment => moment.id === value)) return value;
  return tree.moments.find(moment => moment.parentId === null)?.id || tree.moments[0]?.id || null;
}
function shareSummary(row) {
  return { id: row.shareId, treeId: row.treeId, entryMomentId: row.entryMomentId, view: row.view, status: row.status, createdAt: row.createdAt, revokedAt: row.revokedAt || null, discoverable: row.discoverable === true, discoverableAt: row.discoverableAt || null, origin: row.origin || 'owner', momentCount: Number(row.momentCount ?? 0) };
}
function publicShareSummary(row) {
  return { id: row.shareId, entryMomentId: row.entryMomentId, view: row.view };
}
function shelfCover(tree) {
  const cover = tree.moments.find(moment => moment.id === tree.coverMomentId) || tree.moments[0];
  if (!cover) return null;
  const videoId = youtubeIdFrom(cover.url);
  return {
    momentId: cover.id,
    title: cover.title,
    url: cover.url,
    type: videoId ? 'youtube' : cover.url ? 'link' : '',
    thumbnailUrl: safePublicThumbnail(cover.mediaMetadata?.thumbnail) || (videoId ? youtubeStageThumbUrl(videoId, 'mqdefault') : '')
  };
}
function shelfItem(tree, shareId) {
  return {
    shareId,
    title: tree.title,
    subject: tree.subject,
    momentCount: tree.moments.length,
    updatedAt: tree.updatedAt,
    openView: normalizeTreeOpenView(tree.openView),
    cover: shelfCover(tree)
  };
}

export function createShareService({ shareRepo, workspaceRepo, visibilityRepo = null, discoverRepo = null, communityRepo = null, admin = null, stageIndex = null, pendingShowSync = null, visitCounts = null, productId, makeId = () => randomBytes(18).toString('base64url') }) {
  const refreshStages = subjectId => refreshStageIndex(stageIndex, { productId, subjectId });
  // #1163(#1068 2단계): 응답 뒤에 시작되는 보임 동기화의 진행 중 Promise — 시험·종료 정리가 기다린다.
  const showTasks = new Set();
  const showBusy = new Map();

  // 저장 응답 전(숨김): 문서에서 사라진 트리의 공유 행(자동·주인 모두)을 즉시 내리고, 그 트리의 소개 행도 지운다.
  // 늦게 반영되면 숨긴 게 잠깐 보일 수 있으므로 저장 응답 전에 전체 대조로 끝낸다.
  async function hideStaleShares(subjectId) {
    if (shareRepo.withCurrentWorkspace) {
      await shareRepo.withCurrentWorkspace({ productId, subjectId }, (doc, shares, discover) => {
        const scan = readStoredDocument(doc);
        if (!scan) return;
        const keptIds = [...scan.state.trees, ...scan.quarantined].map(tree => tree?.id).filter(id => typeof id === 'string');
        return Promise.all([
          shares.revokeSharesNotIn({ productId, subjectId, treeIds: keptIds }),
          discover ? discover.deleteNotIn({ productId, subjectId, treeIds: keptIds }) : null
        ]);
      });
    } else {
      const stored = await workspaceRepo.load({ productId, subjectId });
      const scan = stored ? readStoredDocument(stored.doc) : null;
      if (!scan) return;
      const keptIds = [...scan.state.trees, ...scan.quarantined].map(tree => tree?.id).filter(id => typeof id === 'string');
      await shareRepo.revokeSharesNotIn({ productId, subjectId, treeIds: keptIds });
      if (discoverRepo) await discoverRepo.deleteNotIn({ productId, subjectId, treeIds: keptIds });
    }
  }

  // 저장 응답 뒤(보임): ① 살아 있는 공유 행(주인 만든 행 포함)의 moment_count를 갱신하고,
  // ② 공유 행이 없는 트리(순간 1개 이상)에 자동 공개 행(origin='auto')을 만들며 — 주인이 취소한 행은
  // 되살리지 않는다(#1046). B-12(#1068): 바뀐 트리 목록(changedTreeIds)을 받으면 갱신 질의를
  // (바뀐 트리) ∪ (활성 공유 행이 없는 트리)로 좁혀 질의 수가 바뀐 트리 수에 비례하게 한다 — 활성
  // 행이 없는 트리는 바뀌지 않았어도 다시 시도해 자동 공개 행을 채운다. 집합을 받지 않는 재시도는
  // 모든 트리를 갱신한다. 끝나면 색인 재조정을 한 번 더 돌려 새 소속을 무대 색인에 들게 한다.
  // 실패하면 계정별 표식을 남겨 다음 저장·조회 요청에서 다시 시도한다(#1163). 표식 저장소가 없는
  // 예전 모형(기존 시험)은 로그만 남긴다.
  async function syncVisibleShareRows(subjectId, changedTreeIds = null) {
    const touched = changedTreeIds ? new Set(changedTreeIds) : null;
    try {
      const writeRows = async (scan, shares) => {
        const trees = scan.state.trees;
        const existing = await shares.list({ productId, subjectId });
        const activeTrees = new Set(existing.filter(row => row.status === 'active').map(row => row.treeId));
        for (const tree of trees) {
          const treeId = tree.id, momentCount = tree.moments.length;
          if (!momentCount && !activeTrees.has(treeId)) continue;
          if (touched && !touched.has(treeId) && activeTrees.has(treeId)) continue;
          await shares.updateMomentCount({ productId, subjectId, treeId, momentCount });
          if (activeTrees.has(treeId)) continue;
          const entry = tree.moments.find(moment => moment.parentId === null) || tree.moments[0];
          await shares.upsertAutoShare({ productId, subjectId, shareId: makeId(), treeId, entryMomentId: entry.id, momentCount });
        }
      };
      if (shareRepo.withCurrentWorkspace) {
        await shareRepo.withCurrentWorkspace({ productId, subjectId }, (doc, shares) => {
          const scan = readStoredDocument(doc);
          if (scan) return writeRows(scan, shares);
        });
      } else {
        const stored = await workspaceRepo.load({ productId, subjectId });
        const scan = stored ? readStoredDocument(stored.doc) : null;
        if (scan) await writeRows(scan, shareRepo);
      }
      await refreshStages(subjectId);
      if (pendingShowSync) await pendingShowSync.clear({ productId, subjectId });
    } catch {
      if (pendingShowSync) {
        try { await pendingShowSync.mark({ productId, subjectId }); }
        catch { console.error('[lovetree-share] 보임 동기화 표식 남기기에도 실패'); }
      }
      console.error('[lovetree-share] 저장 뒤 보임 동기화 실패 — 표식을 남겨 다음 요청에서 다시 한다');
    }
  }

  // 같은 계정의 보임 동기화는 겹쳐 돌지 않는다(#1163): 진행 중이면 새로 시작하지 않고 '끝나면 한 번
  // 더'만 남긴다 — 저장이 연달아 와도 마지막 상태로 전체 대조가 한 번 더 도는 정도다.
  function beginVisibleSync(subjectId, changedTreeIds) {
    const busy = showBusy.get(subjectId);
    if (busy) { busy.again = true; return busy.task; }
    const entry = { again: false };
    const task = syncVisibleShareRows(subjectId, changedTreeIds).finally(() => {
      showBusy.delete(subjectId);
      showTasks.delete(task);
      if (entry.again) beginVisibleSync(subjectId, null);
    });
    entry.task = task;
    showBusy.set(subjectId, entry);
    showTasks.add(task);
    return task;
  }
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
  // 둘러보기 소개 표시(2026-11-16 대표 결정 — 기본 꺼짐, 고객이 켠다. 무료).
  // 저장소가 없는 예전 모형(기존 시험)은 켜짐으로 본다 — 운영 서버는 늘 저장소를 넣는다.
  async function treeDiscover(subjectId, treeId) {
    if (!discoverRepo) return { discover: true };
    return discoverRepo.get({ productId, subjectId, treeId });
  }
  async function sharedTree(row) {
    if (await treeVisibility(row.subjectId, row.treeId) === 'private')
      throw new ApiError(403, 'share_private', '소유자가 이 트리를 비공개로 바꿨어요.');
    const stored = await workspaceRepo.load({ productId, subjectId: row.subjectId });
    if (!stored) throw new ApiError(410, 'share_removed', '공유된 트리가 삭제되었거나 더 이상 존재하지 않아요.');
    const { tree, omittedPrivateMedia } = projectSharedTree(stored.doc, row.treeId, row.shareId);
    if (!tree.moments.length) throw new ApiError(422, 'share_empty', '공유할 순간이 아직 없어요.');
    const aiTester = await aiTesterFor({ admin, productId, subjectId: row.subjectId }) === true;
    return { tree, omittedPrivateMedia, aiTester, stored };
  }
  async function ownTree(subjectId, treeId) {
    if (!TREE_ID.test(treeId || '')) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
    const stored = await workspaceRepo.load({ productId, subjectId });
    if (!stored) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
    let doc;
    try { doc = readStoredDocument(stored.doc)?.state ?? null; }
    catch { doc = null; }
    if (!doc) throw new ApiError(500, 'stored_document_invalid', '보관된 기록을 읽을 수 없어요.');
    if (!doc.trees.some(tree => tree.id === treeId)) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
    return doc;
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
      await refreshStages(subjectId);
      return { share: shareSummary(row), preview };
    },
    async list(subjectId) {
      const rows = await shareRepo.list({ productId, subjectId });
      // 공유 상태 응답에 소개 여부(discover)를 넣는다 — 화면이 켜고 끄는 스위치의 현재 값을 여기서 본다.
      return Promise.all(rows.map(async row => ({ ...shareSummary(row), discover: (await treeDiscover(subjectId, row.treeId)).discover })));
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
      const row = await shareRepo.revoke({ productId, subjectId, shareId });
      await refreshStages(subjectId);
      return shareSummary(row);
    },
    async read(shareId) {
      if (!SHARE_ID.test(shareId)) throw new ApiError(404, 'share_invalid', '공유 주소 형식이 올바르지 않아요.');
      const row = await shareRepo.load({ productId, shareId });
      if (!row) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      if (row.status !== 'active') throw new ApiError(410, 'share_revoked', '소유자가 이 공유를 취소했어요.');
      if (await isHiddenShare(communityRepo, { ...row, productId })) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      const { tree, omittedPrivateMedia, aiTester } = await sharedTree(row);
      const shared = { share: publicShareSummary(row), tree, omittedPrivateMedia };
      // #611 3번: AI 명예회원 기록은 공개 읽기 결과에 'AI 명예회원' 배지 한 비트만 내린다.
      // 사본 화면(내 트리)에서는 붙이지 않는다 — 여기 read()는 남에게 보이는 공개 응답뿐이다.
      if (aiTester) shared.aiTester = true;
      return shared;
    },
    async readVisit(shareId, visitor = {}) {
      if (!SHARE_ID.test(shareId)) throw new ApiError(404, 'share_invalid', '공유 주소 형식이 올바르지 않아요.');
      const row = await shareRepo.load({ productId, shareId });
      if (!row) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      if (row.status !== 'active') throw new ApiError(410, 'share_revoked', '소유자가 이 공유를 취소했어요.');
      if (await isHiddenShare(communityRepo, { ...row, productId })) throw new ApiError(404, 'share_not_found', '공유 주소를 찾을 수 없어요.');
      const { tree, omittedPrivateMedia, aiTester, stored } = await sharedTree(row);
      const shelf = [shelfItem(tree, row.shareId)];
      const shelfShareIds = new Map([[row.treeId, row.shareId]]);
      if ((await treeDiscover(row.subjectId, row.treeId)).discover) {
        const summaries = communityRepo?.listDiscoverableSummaries
          ? await communityRepo.listDiscoverableSummaries({ productId, viewerSubjectId: null, limit: 240 })
          : null;
        const candidates = summaries
          ? summaries.map(summary => summary.share)
          : await shareRepo.list({ productId, subjectId: row.subjectId });
        const seen = new Set([row.treeId]);
        for (const candidate of candidates) {
          if (shelf.length >= 24) break;
          if (!candidate || candidate.subjectId !== row.subjectId || candidate.status !== 'active' || seen.has(candidate.treeId)) continue;
          seen.add(candidate.treeId);
          if (!summaries && !(await treeDiscover(candidate.subjectId, candidate.treeId)).discover) continue;
          if (await treeVisibility(candidate.subjectId, candidate.treeId) === 'private') continue;
          let projected;
          try { projected = projectSharedTree(stored.doc, candidate.treeId, candidate.shareId); }
          catch { continue; }
          if (!projected.tree.moments.length) continue;
          shelf.push(shelfItem(projected.tree, candidate.shareId));
          shelfShareIds.set(candidate.treeId, candidate.shareId);
        }
      }
      const stats = communityRepo?.stats
        ? await communityRepo.stats({ productId, shareId: row.shareId, viewerSubjectId: null })
        : {};
      return {
        visit: {
          shareId: row.shareId,
          view: normalizeTreeOpenView(tree.openView),
          entryMomentId: selectEntry(tree, row.entryMomentId),
          momentCount: tree.moments.length,
          updatedAt: tree.updatedAt,
          aiTester,
          ownerLabel: '',
          prefs: projectPublicVisitPrefs(stored.doc.prefs, shelfShareIds),
          omittedPrivateMedia
        },
        tree,
        shelf,
        stats: { ...projectPublicStats(stats), visits: visitCounts ? await visitCounts.record(shareId, visitor) : 0 }
      };
    },
    // === 저장 성공 뒤 공유 동기화(#538, B-12 2단계 #1163) ===
    // 응답 전에 숨김(회수·소개 정리·무대 색인 재조정)을 끝내고 응답을 돌려 준다 — 보임(수 갱신·자동
    // 공개 행·새 색인 소속)은 응답 뒤로 미룬다. 실패하면 계정별 표식이 남아 다음 요청에서 다시 한다.
    async afterSave(subjectId, changedTreeIds = null) {
      await hideStaleShares(subjectId);
      await refreshStages(subjectId);
      beginVisibleSync(subjectId, changedTreeIds);
    },
    // 표식이 있는 계정의 다음 저장·조회 요청에서 보임 동기화를 다시 시도한다. 응답을 기다리지 않는다.
    async retryPendingVisibleSync(subjectId) {
      if (!pendingShowSync) return;
      try { if (!(await pendingShowSync.has({ productId, subjectId }))) return; }
      catch { return; }
      beginVisibleSync(subjectId, null);
    },
    // 진행 중인 보임 동기화가 모두 끝날 때까지 기다린다 — '끝나면 한 번 더' 재시작까지 커버한다(시험·종료 정리용).
    async waitForShowSync() {
      while (showTasks.size) await Promise.allSettled([...showTasks]);
    },
    // #538: 트리 공개 상태. 비공개는 누구나 무료로 바꿀 수 있다 — 본인 트리만 바꿀 수 있다(#830).
    // 응답에 소개 여부(discover)를 함께 돌려준다 — 화면이 두 값을 한 번에 본다.
    async setTreeVisibility(subjectId, treeId, visibility) {
      if (visibility !== 'public' && visibility !== 'private') throw new ApiError(400, 'visibility_invalid', '공개 상태 값을 확인해 주세요.');
      await ownTree(subjectId, treeId);
      if (visibilityRepo) await visibilityRepo.set({ productId, subjectId, treeId, visibility });
      await refreshStages(subjectId);
      return { treeId, visibility, discover: (await treeDiscover(subjectId, treeId)).discover };
    },
    async getTreeVisibility(subjectId, treeId) {
      if (!TREE_ID.test(treeId || '')) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
      const stored = await workspaceRepo.load({ productId, subjectId });
      if (!stored) throw new ApiError(404, 'tree_not_found', '트리를 찾을 수 없어요.');
      return { treeId, visibility: await treeVisibility(subjectId, treeId), discover: (await treeDiscover(subjectId, treeId)).discover };
    },
    // 둘러보기 소개 켜기·끄기(2026-11-16 대표 결정). 본인 트리만, 무료다.
    // 응답에 지금 상태를 돌려준다 — 화면은 응답값으로 스위치를 세운다.
    async getTreeDiscover(subjectId, treeId) {
      await ownTree(subjectId, treeId);
      return { treeId, discover: (await treeDiscover(subjectId, treeId)).discover };
    },
    async setTreeDiscover(subjectId, treeId, discover) {
      if (typeof discover !== 'boolean') throw new ApiError(400, 'discover_invalid', '소개 설정 값을 확인해 주세요.');
      await ownTree(subjectId, treeId);
      if (discoverRepo) await discoverRepo.set({ productId, subjectId, treeId, discover });
      await refreshStages(subjectId);
      return { treeId, discover };
    }
  };
}

export function createShareHandler({ authenticate, service, productId, visitProxyTrusted = () => false }) {
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
    const visitMatch = path.match(/^\/api\/public\/visits\/([^/]+)$/);
    if (visitMatch) {
      if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
      let visitor = {};
      if (visitProxyTrusted(request)) {
        const cookie = String(request.headers?.cookie || '');
        const hasCredential = /(?:^|;\s*)__Host-lovetree-access=/.test(cookie) || !!request.headers?.authorization;
        visitor = { trusted: true, clientIp: request.headers?.['x-lovetree-client-ip'], authKnown: !hasCredential };
        if (hasCredential) {
          try { visitor.subjectId = await owner(request); visitor.authKnown = true; } catch { /* 확인되지 않은 로그인은 세지 않는다. */ }
        }
      }
      return visitResponse(request, await service.readVisit(visitMatch[1], visitor));
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
    // #538: 트리 공개 상태. 비공개는 누구나 무료 — 본인 트리만 바꿀 수 있다(#830).
    const visibility = path.match(/^\/api\/trees\/([^/]+)\/visibility$/);
    if (visibility) {
      if (method === 'PUT') {
        const body = jsonBody(request);
        return { status: 200, body: await service.setTreeVisibility(subjectId, visibility[1], body?.visibility), headers: NO_STORE };
      }
      if (method === 'GET') return { status: 200, body: await service.getTreeVisibility(subjectId, visibility[1]), headers: NO_STORE };
      throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
    }
    // 둘러보기 소개 켜기·끄기(2026-11-16 대표 결정). 본인 트리만, 무료. 응답에 지금 상태를 돌려준다.
    const treeDiscover = path.match(/^\/api\/trees\/([^/]+)\/discover$/);
    if (treeDiscover) {
      if (method === 'PUT') {
        const body = jsonBody(request);
        return { status: 200, body: await service.setTreeDiscover(subjectId, treeDiscover[1], body?.discover), headers: NO_STORE };
      }
      if (method === 'GET') return { status: 200, body: await service.getTreeDiscover(subjectId, treeDiscover[1]), headers: NO_STORE };
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
      logServerError(error, 'lovetree-share');
      return { status: 500, body: { error: { code: 'internal_error', message: '서버에서 처리하지 못했어요.' } }, headers: NO_STORE };
    }
  };
}
