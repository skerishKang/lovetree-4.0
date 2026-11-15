// 사라진 영상 감지 한 벌(#632, 2026-11-15). 판정 재료는 화면이 이미 쓰는 길 두 개다:
//   ① 서버 oEmbed 프록시(/api/youtube/oembed, #344) — 새 서버 함수는 만들지 않는다.
//   ② 썸네일 호스트 i.ytimg.com(#429 내려가기) — 삭제·비공개는 썸네일도 함께 사라진다.
// 실측(2026-11-15, 유튜브 직접 + 개발 주소 프록시):
//   정상(dQw4w9WgXcQ·kFenGaDfuI4)  프록시 200 · 썸네일 200
//   삭제(R5mpcDWpYSA·3wbZA8SMB0Q)  유튜브 404 → 프록시 404 youtube_not_found · 썸네일 404
//   비공개(yZIXLfi8CZQ, 시청 페이지 LOGIN_REQUIRED) 유튜브 403 → 프록시 403 youtube_private · 썸네일 404
//   임베드 금지·영상은 있음(3xlegeyULX8·P6qXFavZplE) 유튜브 401 → 프록시 401 youtube_embed_forbidden · 썸네일 200
//   없는 id(aaaaaaaaaaa) 유튜브 400 → 프록시 400 youtube_missing
// #666: 예전에는 프록시가 403·401·400을 모두 502로 묽개 보내 화면이 구분하지 못했다. 이제 유튜브 코드가
// 그대로 오므로 네 가지를 갈라 보여 준다 — 403 비공개(사라진 영상으로 표시), 401 임베드 금지(표시하지 않고
// '유튜브에서 보기' 안내), 400·404 없는 영상(삭제와 같이 표시), 5xx·응답 없음 unknown(표시를 바꾸지 않는다).
// 응답 자체가 없으면(끊김·시간 초과·기기 오프라인) 'unknown'으로 돌려 표시를 바꾸지 않는다.
// 결과는 이 기기에 하루 기억한다(화면을 열 때마다 같은 영상을 다시 묻지 않게, #632). 삭제처럼 확정인
// ok·gone만 기억한다 — 비공개(403)는 나중에 공개로 바뀔 수 있어 기억하지 않고, held·unknown도 기억하지 않는다.

export const VIDEO_STATUS_TTL_MS = 24 * 60 * 60 * 1000;
export const VIDEO_STATUS_CACHE_KEY = 'lt41.video-status.v1';
export const VIDEO_STATUS_CACHE_LIMIT = 500;

// 유튜브 oEmbed가 알려 주는 네 가지(+응답 없음). 이 표에 없는 코드는 아래에서 갈라 판정한다.
const KNOWN = { 200: 'ok', 400: 'gone', 401: 'noembed', 403: 'private', 404: 'gone' };

/**
 * 프록시 응답 코드 → 'ok' | 'gone' | 'private' | 'noembed' | 'held' | 'unknown'.
 *   200 영상 있음 · 404·400 없는 영상(삭제와 같이 표시) · 403 비공개(사라진 영상으로 표시)
 *   401 임베드 금지(사라진 영상으로 표시하지 않고 '유튜브에서 보기' 안내)
 *   5xx·응답 없음 unknown(사라졌다고 말하지 않는다) · 그 밖의 답은 held(보류)
 */
export function classifyOembedStatus(httpStatus) {
  const code = Number(httpStatus);
  if (!Number.isFinite(code) || code <= 0) return 'unknown';
  if (KNOWN[code]) return KNOWN[code];
  if (code >= 500) return 'unknown';
  return 'held';
}

function readMap(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  let raw = '';
  try { raw = storage.getItem(VIDEO_STATUS_CACHE_KEY) || ''; } catch { return null; }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

/** 이 기기에 기억한 상태. 없거나 하루가 지났거나 모양이 틀리면 null(다시 묻는다). */
export function readVideoStatusCache(storage, videoId, now = Date.now(), ttlMs = VIDEO_STATUS_TTL_MS) {
  const id = String(videoId ?? '').trim();
  if (!id) return null;
  const map = readMap(storage);
  if (!map) return null;
  const hit = map[id];
  if (!hit || typeof hit !== 'object') return null;
  const at = Number(hit.at);
  if (!Number.isFinite(at) || at <= 0 || now - at > ttlMs) return null;
  return hit.s === 'ok' || hit.s === 'gone' ? hit.s : null;
}

/** 확정 판정(ok·gone)만 기억한다. 한도를 넘으면 오래된 것부터 버리고 만료된 값도 함께 치운다. */
export function writeVideoStatusCache(storage, videoId, status, now = Date.now(), ttlMs = VIDEO_STATUS_TTL_MS) {
  const id = String(videoId ?? '').trim();
  if (!id || (status !== 'ok' && status !== 'gone')) return false;
  if (!storage || typeof storage.setItem !== 'function') return false;
  const map = readMap(storage) || {};
  const entries = Object.entries(map)
    .filter(([, value]) => value && typeof value === 'object' && (value.s === 'ok' || value.s === 'gone') && Number.isFinite(Number(value.at)) && Number(value.at) > 0)
    .map(([key, value]) => [key, { s: value.s, at: Number(value.at) }])
    .filter(([key, value]) => key === id || now - value.at <= ttlMs);
  const rest = entries.filter(([key]) => key !== id);
  rest.push([id, { s: status, at: now }]);
  rest.sort((a, b) => a[1].at - b[1].at);
  const kept = rest.slice(Math.max(0, rest.length - VIDEO_STATUS_CACHE_LIMIT));
  const next = {};
  for (const [key, value] of kept) next[key] = value;
  try { storage.setItem(VIDEO_STATUS_CACHE_KEY, JSON.stringify(next)); } catch { return false; }
  return true;
}

/** 프록시에 실제로 물어 본다. 답이 오면 위 여섯 가지, 응답이 없으면(끊김·시간 초과·오프라인) 'unknown' — 사라졌다고 말하지 않는다. */
export async function fetchVideoStatus(videoId, { fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = 5000 } = {}) {
  const id = String(videoId ?? '').trim();
  if (!id) return 'unknown';
  // 기기가 오프라인이면 물어 볼 길이 없다 — 응답 없음으로 본다(사라진 영상으로 세지 않는다).
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'unknown';
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller && Number.isFinite(timeoutMs) && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const answer = await fetchImpl('/api/youtube/oembed?v=' + encodeURIComponent(id), {
      headers: { accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {})
    });
    return classifyOembedStatus(answer?.status);
  } catch {
    return 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
