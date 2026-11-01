import {validateState} from './domain.mjs';
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

// Serialize cookie rotation across tabs and retry only responses rejected with 401.
export async function refreshUnauthorized({fetchImpl, request, response, refreshUrl='/auth/refresh', signal}) {
  if (response.status !== 401) return response;
  const refreshAndRetry = async () => {
    const retry = await request();
    if (retry.status !== 401) return retry;
    const refreshed = await fetchImpl(refreshUrl, {method:'POST', credentials:'same-origin', ...(signal ? {signal} : {})});
    return refreshed.ok ? request() : retry;
  };
  return globalThis.navigator?.locks?.request
    ? globalThis.navigator.locks.request('lovetree-shared-auth-refresh', signal ? {signal} : {}, refreshAndRetry)
    : refreshAndRetry();
}

export function createWorkspaceApi({ fetchImpl = (...args) => globalThis.fetch(...args), base = '', timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  async function call(path, init, { requiresRevision = false, requiresState = false, binary = false, requestTimeout = timeoutMs, signal = null } = {}) {
    // 타이머는 응답 본문까지 읽고 나서 해제한다. 본문을 다 읽지 못한 채 끝나면 아직 성공이 아니다.
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let expired = false;
    const cancel = () => controller?.abort();
    signal?.addEventListener('abort', cancel, {once:true});
    if (signal?.aborted) cancel();
    const timer = controller ? setTimeout(() => { expired = true; controller.abort(); }, Math.max(0, requestTimeout)) : null;
    try {
      const request = () => fetchImpl(`${base}${path}`, { credentials: 'same-origin', ...init, ...(controller ? { signal: controller.signal } : {}) });
      let response = await request();
      if (response.status === 401 && path.startsWith('/api/')) {
        response = await refreshUnauthorized({fetchImpl, request, response, refreshUrl:`${base}/auth/refresh`, signal:controller?.signal});
      }
      if (response.status === 401 && path.startsWith('/api/') && globalThis.dispatchEvent && typeof Event === 'function') globalThis.dispatchEvent(new Event('lovetree-auth-required'));
      if (binary && response.ok) return {ok:true,status:response.status,blob:await response.blob()};
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
        writeSubjectBound: payload?.writeSubjectBound === true,
        subject: typeof payload?.subject === 'string' && payload.subject ? payload.subject : null,
        savedAt: payload?.savedAt ?? null,
        ...(path.startsWith('/api/media') ? {media:payload} : {}),
        state: payload?.state ?? null
      };
    } catch (error) {
      // AbortError는 우리가 시간을 넘긴 자리다. 저장(PUT)에서 이 경로를 타면 요청 키를
      // 유지한 채 다시 보내므로, 서버가 이미 커밋한 경우는 복제 회신으로 끝난다.
      const timedOut = expired || error?.name === 'AbortError';
      return { ok: false, status: 0, code: signal?.aborted ? 'cancelled' : timedOut ? 'timeout' : 'network', message: null };
    } finally {
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }

  return {
    uploadMedia: (file, subject, id, signal) => call('/api/media', {method:'POST', headers:{'content-type':file.type,'x-lovetree-subject':subject,'x-lovetree-upload-id':id},body:file}, {requestTimeout:60_000,signal}),
    listMedia: () => call('/api/media', {method:'GET'}),
    removeMedia: (name, subject) => call('/api/media/'+encodeURIComponent(name), {method:'DELETE',headers:{'x-lovetree-subject':subject}}),
    fetchMedia: name => call('/api/media/'+encodeURIComponent(name), {method:'GET'}, {binary:true,requestTimeout:60_000}),
    get: () => call('/api/workspace', { method: 'GET', headers: { accept: 'application/json' } }, { requiresRevision: true, requiresState: true }),
    put: (body) => call('/api/workspace', {
      method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body)
    }, { requiresRevision: true }),
    logout: () => call('/auth/logout', { method: 'POST', headers: { accept: 'application/json' } })
  };
}
