import {ApiError} from './errors.js';
import {parsePrincipal} from './principal.js';

// #1098 3단계 — 내 소식 서버 규칙(이번엔 서버만 — 상단 계정 단추 점·목록 창 화면은 다른 작업이 맡는다).
//  · 내 트리(공유 행)와 그 순간에 새로 남겨진 ♡·댓글·담기를 하루(KST) 단위로 묶어 한 줄로 내려준다.
//    같은 날 같은 순간의 ♡ 5개는 한 줄이다(화면에서 '♡ 5'로 보인다).
//  · 목록을 열면 그 시점까지 읽음으로 본다 — 계정별 마지막 읽은 시각 한 줄만 저장한다(새 표, 덧붙이기 마이그레이션).
//  · 시험 계정이 남긴 것은 소식도 안 읽은 수도 아니다. 내가 내 트리에 남긴 것도 아니다. 숨김·삭제된 댓글도 아니다.
//  · AI 명예회원이 남긴 것은 줄마다 aiCount 로 구분한다(계정 정보는 어디에도 내려가지 않는다 — #611·#936과 같은 한 비트 방식).
//  · 메일·푸시는 보내지 않는다(이슈 #1098 결정).
//  · 소식의 ♡는 heart 하나다 — 반응 표의 나머지 여섯 종은 소식이 아니다(순간 반응과 같은 판정).
const NO_STORE = {'cache-control': 'no-store, max-age=0', pragma: 'no-cache', 'x-content-type-options': 'nosniff'};
// 한 번에 내려주는 소식 줄 상한 — 순간 댓글 목록과 같은 50. 요청 파라미터로 늘리지 않는다.
const NEWS_LINE_LIMIT = 50;

function publicLine(line) {
  return {
    id: line.id,
    day: line.day,
    kind: line.kind,
    targetKind: line.targetKind,
    shareId: line.shareId,
    treeId: line.treeId,
    momentId: line.momentId,
    count: line.count,
    aiCount: line.aiCount,
    lastAt: line.lastAt,
    ...(line.kind === 'comment' ? {lastBody: line.lastBody} : {})
  };
}

export function createMyNewsService({communityRepo, productId, now = () => Date.now()}) {
  return {
    // 목록을 여는 순간이 곧 읽음이다 — 먼저 읽은 시각을 남기고 목록을 읽는다. lastReadAt 은 저장된 시각(동시에
    // 연 다른 창이 더 새 시각을 남겼다면 그 시각)이다.
    async list(subjectId) {
      const at = new Date(now()).toISOString();
      const lastReadAt = await communityRepo.markNewsRead({productId, subjectId, at});
      const lines = await communityRepo.listMyNewsLines({productId, subjectId, limit: NEWS_LINE_LIMIT});
      return {lines: lines.map(publicLine), lastReadAt: lastReadAt ?? at};
    },
    // 상단 계정 단추의 점 — 목록을 열지 않고도 안 읽은 줄 수를 센다. 읽음 표시는 여기서 하지 않는다.
    async unread(subjectId) {
      const after = await communityRepo.lastNewsReadAt({productId, subjectId});
      const unreadCount = await communityRepo.unreadNewsCount({productId, subjectId, after});
      return {unreadCount};
    }
  };
}

// 내 소식 경로만 맡는 핸들러. 나머지 경로는 null로 돌려 기존 커뮤니티 핸들러(순간 → 트리)가 그대로 판정한다 —
// 기존 핸들러들은 이 파일을 모른다(최소 결합, moment 핸들러와 같은 구조).
export function createMyNewsHandler({authenticate, service, productId, fallback = null}) {
  async function principal(request) {
    try {
      return parsePrincipal(await authenticate(request), productId);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'auth_unavailable', '로그인 연결에 문제가 생겼어요.');
    }
  }
  async function handle(request) {
    const path = String(request?.path || '');
    const method = request?.method || 'GET';
    if (path !== '/api/community/my-news' && path !== '/api/community/my-news/unread-count') return null;
    if (method !== 'GET') return null; // 읽기 전용 — 다른 메서드는 기존 커뮤니티 길로 넘긴다.
    const who = await principal(request);
    if (path === '/api/community/my-news/unread-count') {
      return {status: 200, body: await service.unread(who.subjectId), headers: NO_STORE};
    }
    return {status: 200, body: await service.list(who.subjectId), headers: NO_STORE};
  }
  return async (request) => {
    try {
      const mine = await handle(request);
      if (mine) return mine;
      // 폴백(순간 → 트리 커뮤니티)이 던지는 판정(예: 모르는 경로 404)도 여기서 응답으로 바꾼다 —
      // moment 핸들러는 자기 폴백의 예외를 감싸지 않으므로, 사슬의 맨 앞에서 한 번만 바꾸면 된다.
      return fallback ? await fallback(request) : null;
    } catch (error) {
      if (error instanceof ApiError) return {status: error.status, body: {error: {code: error.code, message: error.message, ...(error.details || {})}}, headers: NO_STORE};
      console.error('[lovetree-my-news] request failed', {path: request?.path, method: request?.method});
      return {status: 500, body: {error: {code: 'internal_error', message: '서버에서 처리하지 못했어요.'}}, headers: NO_STORE};
    }
  };
}
