// YouTube oEmbed 프록시 — 영상 제목·채널·썸네일만 서버에서 안전하게 가져온다.
//
// - 실제 요청은 고정 호스트 `www.youtube.com/oembed` 하나로만 나간다. 입력에서 온
//   주소·경로가 목적지가 되지 않는다(SSRF 표면 없음). 클라이언트가 준 11자리 영상 id만
//   쿼리로 붙는다.
// - 허용 호스트는 youtube.com 계열뿐이다. 닮은 호스트(`youtube.com.evil.example`)와
//   재생목록 전용 링크는 영상으로 보지 않는다.
// - 성공한 응답만 24시간 캐시한다. 실패(404·5xx·형식 오류·시간 초과)는 캐시하지 않는다.
// - 돌려주는 필드는 화이트리스트(제목·채널·썸네일)뿐이고, 썸네일은 https + ytimg.com
//   도메인일 때만 남긴다. 원본 HTML·저자 주소 등은 노출하지 않는다.
import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
const THUMBNAIL_HOST = /(?:^|\.)ytimg\.com$/;
export const DEFAULT_TIMEOUT_MS = 3000;
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
// #666: 유튜브 oEmbed가 알려 주는 '이 영상은 못 보여 준다'의 네 가지. 응답 코드를 바꾸지 않고 그대로 넘긴다.
// 5xx·응답 없음은 여기에 없다 — 그건 '모른다'(unknown)로 두고 502로 돌려준다.
const UPSTREAM_ERRORS = {
  400: { code: 'youtube_missing', message: '이 영상은 없어졌어요.' },
  401: { code: 'youtube_embed_forbidden', message: '이 영상은 다른 곳에서 보여 줄 수 없어요.' },
  403: { code: 'youtube_private', message: '이 영상은 비공개예요.' },
  404: { code: 'youtube_not_found', message: '이 영상을 찾을 수 없어요.' }
};
const MAX_CACHE_ENTRIES = 500;
const MAX_TITLE = 200;
const MAX_AUTHOR = 120;
const MAX_THUMBNAIL = 2048;

/** 평문 11자리 id나 watch/shorts/live/embed/youtu.be 주소에서 영상 id만 뽑는다. 그 밖은 null. */
export function youtubeVideoId(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (YOUTUBE_VIDEO_ID.test(raw)) return raw;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.username || parsed.password || !['https:'].includes(parsed.protocol)) return null;
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) return null;
  const path = parsed.pathname || '';
  if (parsed.hostname === 'youtu.be') {
    const [id] = path.split('/').filter(Boolean);
    return id && YOUTUBE_VIDEO_ID.test(id) ? id : null;
  }
  if (path === '/watch') {
    const id = parsed.searchParams.get('v');
    return id && YOUTUBE_VIDEO_ID.test(id) ? id : null;
  }
  const single = path.match(/^\/(shorts|live|embed)\/([^/?#]+)/);
  return single && YOUTUBE_VIDEO_ID.test(single[2]) ? single[2] : null;
}

function safeText(value, max) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed.slice(0, max) : '';
}

function safeThumbnail(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > MAX_THUMBNAIL) return '';
  let url;
  try { url = new URL(raw); } catch { return ''; }
  return url.protocol === 'https:' && THUMBNAIL_HOST.test(url.hostname) ? url.href : '';
}

/** oEmbed 원본 응답에서 표시에 쓰는 필드만 남긴다. */
export function exposedMetadata(videoId, data) {
  return {
    videoId,
    title: safeText(data?.title, MAX_TITLE),
    authorName: safeText(data?.author_name, MAX_AUTHOR),
    thumbnailUrl: safeThumbnail(data?.thumbnail_url)
  };
}

export function createYoutubeOembedClient({ fetchImpl = (...args) => fetch(...args), timeoutMs = DEFAULT_TIMEOUT_MS, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {  const cache = new Map();

  function read(videoId) {
    const hit = cache.get(videoId);
    if (!hit) return null;
    if (hit.expiresAt <= now()) { cache.delete(videoId); return null; }
    return hit.value;
  }

  function remember(videoId, value) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(videoId, { expiresAt: now() + ttlMs, value });
  }

  return {
    async metadata(videoId) {
      const cached = read(videoId);
      if (cached) return { ...cached, cached: true };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      let response;
      try {
        const url = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
        response = await fetchImpl(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: controller.signal });
      } catch {
        throw new ApiError(502, 'youtube_unreachable', '영상 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        // #666: 유튜브가 준 응답 코드를 그대로 돌려준다(예전에는 403·401·400을 모두 502로 물감았다).
        // 그래야 화면이 비공개(403)·임베드 금지(401)·없는 영상(400)·없어진 영상(404)을 갈라 보여 줄 수 있다.
        const upstream = UPSTREAM_ERRORS[response.status];
        if (upstream) throw new ApiError(response.status, upstream.code, upstream.message);
        throw new ApiError(502, 'youtube_metadata', '영상 정보를 불러오지 못했어요.');
      }
      let data;
      try { data = await response.json(); } catch { throw new ApiError(502, 'youtube_metadata', '영상 정보 형식을 알아보지 못했어요.'); }

      const value = exposedMetadata(videoId, data);
      remember(videoId, value);
      return { ...value, cached: false };
    },
    size: () => cache.size
  };
}

export function createYoutubeOembedHandler({ authenticate, productId, client, fetchImpl, timeoutMs, ttlMs, now } = {}) {
  const resolved = client ?? createYoutubeOembedClient({ fetchImpl, timeoutMs, ttlMs, now });
  const effectiveTtl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  const headers = { 'cache-control': `private, max-age=${Math.floor(effectiveTtl / 1000)}`, 'x-content-type-options': 'nosniff' };
  // #666: 실패 응답은 기억하지 않는다. 특히 비공개(403)는 나중에 공개로 바뀔 수 있어서
  // 하루 동안 브라우저·중간 캐시에 남으면 안 된다(같은 이유로 화면도 403을 기억하지 않는다).
  const errorHeaders = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

  return async function request(request) {
    try {
      parsePrincipal(await authenticate(request ?? {}), productId);
      if (String(request?.path ?? '') !== '/api/youtube/oembed') throw new ApiError(404, 'not_found', '요청을 찾을 수 없어요.');
      if ((request?.method ?? 'GET') !== 'GET') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
      const value = String(request?.query?.get?.('v') ?? '').trim() || String(request?.query?.get?.('url') ?? '').trim();
      const videoId = youtubeVideoId(value);
      if (!videoId) throw new ApiError(400, 'youtube_id', 'YouTube 영상 주소나 11자리 영상 id가 필요해요.');

      return { status: 200, body: await resolved.metadata(videoId), headers };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: { code: error.code, message: error.message } }, headers: errorHeaders };
      console.error('[lovetree-youtube] oEmbed 요청 실패', { path: request?.path, method: request?.method });
      return { status: 502, body: { error: { code: 'youtube_unreachable', message: '영상 정보를 불러오지 못했어요.' } }, headers: errorHeaders };
    }
  };
}
