import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { EMPTY_STATE, MAX_TREES, validateState } from '../src/domain.js';
import { ApiError } from './errors.js';

const CLIENT_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GENERIC_DOCUMENT_MESSAGE = '기록 형식을 확인해 주세요.';

// domain.js의 검증 오류 문구는 애초에 사용자에게 보여 주는 문구다. TypeError·RangeError처럼
// 구현에서 발생한 문장은 응답에 그대로 실어 보내지 않는다.
function documentMessage(error) {
  if (error instanceof TypeError || error instanceof RangeError) return GENERIC_DOCUMENT_MESSAGE;
  const message = error?.message;
  return typeof message === 'string' && message.length <= 200 && !/[\u0000-\u001f]/.test(message) ? message : GENERIC_DOCUMENT_MESSAGE;
}

export function requestHashOf(validatedState, expectedRevision) {
  return createHash('sha256').update(`${JSON.stringify(validatedState)}\n${expectedRevision}`, 'utf8').digest('hex');
}

// #986: 규칙이 바뀐 예전 문서에는 도메인 규칙을 어긴 트리가 섞여 있을 수 있다. 문서 전체를
// 검사하면 트리 하나가 읽기(500)와 다시 저장(400)을 모두 막아 그 계정은 영영 저장하지 못한다.
// 그래서 저장된 문서는 트리 하나씩 검사한다 — 고칠 수 있는 값(시각·이름·표지)은 기본값으로
// 고쳐 읽고, 그래도 읽지 못하는 트리는 원본 그대로 격리한다. 격리 본문은 응답으로 보내지 않고
// 개수만 알리며, 저장할 때도 서버에 남은 원본을 손대지 않고 다시 붙여 보관한다(유실 0).
const timeValue = value => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
const lineValue = (value, fallback, max) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fallback;

function repairTreeValues(tree, now) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return tree;
  const moments = Array.isArray(tree.moments) ? tree.moments : [];
  const out = { ...tree };
  if (!timeValue(out.updatedAt)) out.updatedAt = timeValue(out.createdAt) ? out.createdAt : now;
  if (!timeValue(out.createdAt)) out.createdAt = out.updatedAt;
  if (typeof out.subject !== 'string' || !out.subject.trim() || out.subject.length > 60) out.subject = lineValue(out.title, '기록', 60);
  if (typeof out.title !== 'string' || !out.title.trim() || out.title.length > 100) out.title = lineValue(out.subject, '제목 없는 트리', 100);
  if (typeof out.coverMomentId !== 'string' || (out.coverMomentId && !moments.some(moment => moment?.id === out.coverMomentId))) out.coverMomentId = '';
  return out;
}

// 돌려주는 값: { state — 읽을 수 있는 트리만 담은 검증된 상태, quarantined — 뺀 트리의 원본 배열 }.
// 문서 뼈대 자체(version·trees)가 어긋나면 트리별 복구가 불가하므로 null을 돌려준다.
// 공유·커뮤니티처럼 저장된 문서를 읽는 다른 서비스도 같은 판정을 쓴다(#986).
export function readStoredDocument(doc, now = new Date().toISOString()) {
  if (!doc || doc.version !== 1 || !Array.isArray(doc.trees)) return null;
  const accepted = [], quarantined = [];
  for (const raw of doc.trees) {
    let single;
    try { single = validateState({ version: 1, trees: [repairTreeValues(raw, now)], prefs: doc.prefs }).trees[0]; }
    catch { quarantined.push(raw); continue; }
    // 같은 id 트리가 이미 읽혔으면 나중 것을 뺀다 — 저장 때 "새 것이 이긴다"는 규칙과 같은 셈이다.
    if (accepted.some(tree => tree.id === single.id) || accepted.length >= MAX_TREES) { quarantined.push(raw); continue; }
    accepted.push(single);
  }
  // 트리별 검증을 통과한 목록은 전체 검사도 통과한다 — 마지막 검사는 inbox 정리를 위한 것이다.
  return { state: validateState({ version: 1, trees: accepted, prefs: doc.prefs }), quarantined };
}

// 저장 본문·삭제 뒤 문서에 서버가 보관 중인 격리 트리 원본을 다시 붙인다. 사용자가 같은 id의
// 새 트리를 만들어 보내면 새 것이 이긴다(원본은 붙이지 않는다).
function withQuarantinedTrees(doc, quarantined) {
  if (!quarantined.length) return doc;
  const ids = new Set(doc.trees.map(tree => tree.id));
  const keep = quarantined.filter(raw => !(raw && typeof raw.id === 'string' && ids.has(raw.id)));
  return keep.length ? { ...doc, trees: [...doc.trees, ...keep] } : doc;
}

function parseWriteInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError(400, 'invalid_request', '요청 형식을 알 수 없어요.');
  const { state, expectedRevision, clientKey } = payload;
  if (!state || typeof state !== 'object') throw new ApiError(400, 'invalid_document', '문서 형식을 알 수 없어요.');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new ApiError(400, 'invalid_revision', '저장 번호를 바로 확인해 주세요.');
  if (typeof clientKey !== 'string' || !CLIENT_KEY.test(clientKey)) throw new ApiError(400, 'invalid_client_key', '요청 키 형식을 확인해 주세요.');
  let validated;
  try { validated = validateState(state); } catch (error) { throw new ApiError(400, 'invalid_document', documentMessage(error)); }
  return { validated, expectedRevision, clientKey };
}

// B-12(#1068): 저장 뒤 동기화가 바뀐 트리만 다시 쓰도록 이전 상태와 새 상태를 트리별로 비교한다.
// 이전에 읽지 못했던(격리) 트리가 이번에 살아나면 새 트리로 센다 — 비교는 같은 검증을 통과한 상태끼리다.
function changedTreeIdsOf(previous, next) {
  const before = new Map((previous?.trees ?? []).map(tree => [tree.id, tree]));
  const changed = [];
  for (const tree of next.trees) {
    if (!before.has(tree.id) || !isDeepStrictEqual(before.get(tree.id), tree)) changed.push(tree.id);
  }
  return changed;
}

export function createWorkspaceService({ repo, productId, onCommit = null, onAfterResponse = null }) {
  // #538: 저장이 성공한 뒤 같은 훅에서 공유 행(자동 공개·moment_count)을 동기화한다.
  // 저장 자체는 이미 끝났으므로 동기화 실패는 응답을 막지 않고 로그만 남긴다.
  // B-12(#1068): 훅에 이번 저장에서 바뀐 트리 목록(changedTreeIds)도 넘긴다 — 동기화 질의 수를
  // 바뀐 트리 수에 비례하게 줄이는 데 쓴다.
  async function afterCommit(subjectId, doc, changedTreeIds) {
    if (!onCommit) return;
    try { await onCommit({ subjectId, doc, changedTreeIds }); }
    catch { console.error('[lovetree-workspace] 저장 뒤 공유 동기화 실패'); }
  }
  // 응답 문맥이 있으면 일을 넘기고(응답 뒤 실행), 없으면 즉시 끝낸다(이전 호출처 호환).
  async function afterResponse(subjectId, task, context) {
    if (!task) return;
    if (context && Array.isArray(context.afterResponse)) { context.afterResponse.push(task); return; }
    try { await task(); } catch { console.error('[lovetree-workspace] 응답 뒤 공유 동기화 실패'); }
  }
  return {
    async read(principal, context = null) {
      const stored = await repo.load({ productId: principal.productId, subjectId: principal.subjectId });
      // subject는 검증된 주체 식별자만 되돌린다. 이 기기에 남은 미전송 기록이
      // 어느 계정의 것인지 다음 로그인에 가려 읽기 위한 최소 정보다.
      if (!stored) {
        await afterResponse(principal.subjectId, onAfterResponse ? () => onAfterResponse({ subjectId: principal.subjectId, retry: true }) : null, context);
        return { revision: 0, savedAt: null, state: EMPTY_STATE(), subject: principal.subjectId };
      }
      const scan = readStoredDocument(stored.doc);
      if (!scan) throw new ApiError(500, 'stored_document_invalid', '보관된 기록을 읽을 수 없어요.');
      const body = { revision: stored.revision, savedAt: stored.savedAt, state: scan.state, subject: principal.subjectId };
      // 빠진(격리된) 트리는 개수만 알린다 — 원본 내용은 응답에 보내지 않는다.
      if (scan.quarantined.length) body.quarantined = scan.quarantined.length;
      await afterResponse(principal.subjectId, onAfterResponse ? () => onAfterResponse({ subjectId: principal.subjectId, retry: true }) : null, context);
      return body;
    },

    async write(principal, payload, context = null) {
      const { validated, expectedRevision, clientKey } = parseWriteInput(payload);
      // 저장 본문은 지금처럼 전체 검사한다(어긋난 트리는 들어올 수 없다). 대신 저장할 때 서버에
      // 이미 보관된 격리 트리 원본을 손대지 않고 다시 붙여 보관한다 — 사용자가 저장해도 어긋난
      // 트리가 저장 한 번에 사라지지 않는다. 요청 해시는 본문(검증된 상태) 기준으로 두므로
      // 같은 내용의 되묻기는 격리 원본을 다시 붙이기 전과 똑같이 한 번으로 묶인다.
      const stored = await repo.load({ productId: principal.productId, subjectId: principal.subjectId });
      const scan = stored ? readStoredDocument(stored.doc) : null;
      const doc = withQuarantinedTrees(validated, scan ? scan.quarantined : []);
      const outcome = await repo.commit({
        productId: principal.productId,
        subjectId: principal.subjectId,
        doc,
        expectedRevision,
        clientKey,
        requestHash: requestHashOf(validated, expectedRevision)
      });
      if (outcome.status === 'revisionConflict') {
        throw new ApiError(409, 'revision_conflict', '다른 곳에서 먼저 저장했어요. 최신 기록을 불러온 뒤 다시 시도해 주세요.', { currentRevision: outcome.currentRevision });
      }
      if (outcome.status === 'keyConflict') {
        throw new ApiError(409, 'client_key_conflict', '같은 요청 키로 다른 내용을 보내려 해요. 새 키로 다시 시도해 주세요.');
      }
      const changedTreeIds = changedTreeIdsOf(scan ? scan.state : null, validated);
      await afterCommit(principal.subjectId, validated, changedTreeIds);
      await afterResponse(principal.subjectId, onAfterResponse ? () => onAfterResponse({ subjectId: principal.subjectId, changedTreeIds }) : null, context);
      return { revision: outcome.revision, savedAt: outcome.savedAt };
    }
  };
}
