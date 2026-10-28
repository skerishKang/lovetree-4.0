import { createHash } from 'node:crypto';
import { EMPTY_STATE, validateState } from '../src/domain.js';
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

export function createWorkspaceService({ repo, productId }) {
  return {
    async read(principal) {
      const stored = await repo.load({ productId: principal.productId, subjectId: principal.subjectId });
      // subject는 검증된 주체 식별자만 되돌린다. 이 기기에 남은 미전송 기록이
      // 어느 계정의 것인지 다음 로그인에 가려 읽기 위한 최소 정보다.
      if (!stored) return { revision: 0, savedAt: null, state: EMPTY_STATE(), subject: principal.subjectId };
      try {
        return { revision: stored.revision, savedAt: stored.savedAt, state: validateState(stored.doc), subject: principal.subjectId };
      } catch {
        throw new ApiError(500, 'stored_document_invalid', '보관된 기록을 읽을 수 없어요.');
      }
    },

    async write(principal, payload) {
      const { validated, expectedRevision, clientKey } = parseWriteInput(payload);
      const outcome = await repo.commit({
        productId: principal.productId,
        subjectId: principal.subjectId,
        doc: validated,
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
      return { revision: outcome.revision, savedAt: outcome.savedAt };
    }
  };
}
