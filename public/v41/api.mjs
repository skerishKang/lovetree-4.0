import {validateState} from './domain.mjs';
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

export function createWorkspaceApi({ fetchImpl = (...args) => globalThis.fetch(...args), base = '', timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  async function call(path, init, { requiresRevision = false, requiresState = false } = {}) {
    // 타이머는 응답 본문까지 읽고 나서 해제한다. 본문을 다 읽지 못한 채 끝나면 아직 성공이 아니다.
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let expired = false;
    const timer = controller ? setTimeout(() => { expired = true; controller.abort(); }, Math.max(0, timeoutMs)) : null;
    try {
      const request = () => fetchImpl(`${base}${path}`, { credentials: 'same-origin', ...init, ...(controller ? { signal: controller.signal } : {}) });
      let response = await request();
      // Web Locks serializes refresh across tabs: retry after acquiring the lock
      // first, since another tab might already have rotated the credential.
      const sharedSession = /(?:^|;\s*)__Host-lovetree-shared=1(?:;|$)/.test(globalThis.document?.cookie || '');
      if (response.status === 401 && path.startsWith('/api/') && sharedSession) {
        const refreshAndRetry = async () => {
          const retry = await request();
          if (retry.status !== 401) return retry;
          const refreshed = await fetchImpl(`${base}/auth/refresh`, { method: 'POST', credentials: 'same-origin', ...(controller ? { signal: controller.signal } : {}) });
          return refreshed.ok ? request() : retry;
        };
        response = globalThis.navigator?.locks?.request
          ? await globalThis.navigator.locks.request('lovetree-shared-auth-refresh', refreshAndRetry)
          : await refreshAndRetry(); // Server grace covers overlapping tabs without Web Locks.
      }
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
      // 모양뿐 아니라 문서 검증까지 통과해야 서버 기록으로 다룬다.
      const documentOk = (state) => { try { validateState(state); return true; } catch { return false; } };
      const shaped = Number.isSafeInteger(payload?.revision) && (!requiresState || documentOk(payload.state));
      if (response.ok && requiresRevision && !shaped) {
        // 정적 프리뷰는 없는 API 경로에 index.html을 200으로 돌려준다. 문서가 아닌 응답을
        // 성공으로 읽으면 없는 서버 기록을 들이밀게 되므로 미설정으로 다룬다.
        return { ok: false, status: 503, code: 'storage_unavailable', message: null, currentRevision: undefined, revision: undefined, subject: null, savedAt: null, state: null };
      }
      return {
        ok: response.ok,
        status: response.status,
        code: payload?.error?.code ?? null,
        message: payload?.error?.message ?? null,
        currentRevision: payload?.error?.currentRevision ?? undefined,
        revision: Number.isSafeInteger(payload?.revision) ? payload.revision : undefined,
        subject: typeof payload?.subject === 'string' && payload.subject ? payload.subject : null,
        savedAt: payload?.savedAt ?? null,
        state: payload?.state ?? null
      };
    } catch (error) {
      // AbortError는 우리가 시간을 넘긴 자리다. 저장(PUT)에서 이 경로를 타면 요청 키를
      // 유지한 채 다시 보내므로, 서버가 이미 커밋한 경우는 복제 회신으로 끝난다.
      const timedOut = expired || error?.name === 'AbortError';
      return { ok: false, status: 0, code: timedOut ? 'timeout' : 'network', message: null };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  return {
    get: () => call('/api/workspace', { method: 'GET', headers: { accept: 'application/json' } }, { requiresRevision: true, requiresState: true }),
    put: (body) => call('/api/workspace', {
      method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body)
    }, { requiresRevision: true }),
    logout: () => call('/auth/logout', { method: 'POST', headers: { accept: 'application/json' } })
  };
}
