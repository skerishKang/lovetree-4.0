import { logServerError } from './error-log.js';
// 인스타그램 릴스 oEmbed 프록시(#791 2단계) — 틱톡과 같은 모양으로, 표시 정보만 서버에서 safely 가져온다.
//
// - 실제 요청은 고정 호스트의 oEmbed 하나로만 나간다. 입력에서 온 주소가 목적지가 되지 않는다(SSRF 표면 없음).
// - Meta oEmbed는 2026-06-15부터 토큰·앱 심사 없이 호출할 수 있다. 다만 호출 한도가 낮을 수 있어
//   429는 그대로 돌려준다. 화면은 한도에 걸려도 링크를 먼저 저장하고, 다음에 다시 조회한다.
// - 2025-11-03부터 응답에 썸네일이 없다. 캡션 앞부분과 @계정만 받고, 사진은 고객이 올린 그림을 쓴다.
// - 성공 응답만 24시간 캐시한다. 실패(429 포함)는 캐시하지 않는다.
import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';

export const INSTAGRAM_SHORTCODE = /^[A-Za-z0-9_-]{8,30}$/;
const HOSTS = new Set(['www.instagram.com', 'instagram.com', 'instagr.am']);
const OEMBED_ENDPOINT = 'https://graph.facebook.com/instagram_oembed';
const THUMBNAIL_HOST = /(?:^|\.)(?:cdninstagram\.com|instagram\.com|fbcdn\.net)$/;
export const DEFAULT_TIMEOUT_MS = 3000;
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_TITLE = 500;
const MAX_AUTHOR = 120;
const MAX_THUMBNAIL = 2048;

/** 릴스·릴스 목록·사진 글·짧은 공유 주소에서 짧은 코드만 뽑는다. 평문 코드도 받는다. */
export function instagramShortcode(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (INSTAGRAM_SHORTCODE.test(raw) && !/[/.]/.test(raw)) return raw;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.username || parsed.password || parsed.protocol !== 'https:') return null;
  if (!HOSTS.has(parsed.hostname)) return null;
  const matched = (parsed.pathname || '').match(/^\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{8,30})\/?$/);
  return matched && INSTAGRAM_SHORTCODE.test(matched[1]) ? matched[1] : null;
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
  return url.protocol === 'https:' && !url.username && !url.password && THUMBNAIL_HOST.test(url.hostname) ? url.href : '';
}

/** oEmbed 원본 응답에서 표시에 쓰는 필드만 남긴다. 썸네일은 보통 비어 있다(2025-11-03부터). */
export function exposedMetadata(shortcode, data) {
  return {
    shortcode,
    title: safeText(data?.title, MAX_TITLE),
    authorName: safeText(data?.author_name, MAX_AUTHOR),
    thumbnailUrl: safeThumbnail(data?.thumbnail_url)
  };
}

export function createInstagramOembedClient({ fetchImpl = (...args) => fetch(...args), timeoutMs = DEFAULT_TIMEOUT_MS, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const cache = new Map();

  function read(shortcode) {
    const hit = cache.get(shortcode);
    if (!hit) return null;
    if (hit.expiresAt <= now()) { cache.delete(shortcode); return null; }
    return hit.value;
  }

  function remember(shortcode, value) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(shortcode, { expiresAt: now() + ttlMs, value });
  }

  return {
    async metadata(input, { refresh = false } = {}) {
      const shortcode = instagramShortcode(input);
      if (!shortcode) throw new ApiError(400, 'instagram_id', '인스타그램 릴스 주소가 필요해요.');
      if (!refresh) {
        const cached = read(shortcode);
        if (cached) return { ...cached, cached: true };
      }
      const canonical = `https://www.instagram.com/reel/${shortcode}/`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      let response;
      try {
        response = await fetchImpl(`${OEMBED_ENDPOINT}?url=${encodeURIComponent(canonical)}&format=json`, { headers: { accept: 'application/json' }, redirect: 'error', signal: controller.signal });
      } catch {
        throw new ApiError(502, 'instagram_unreachable', '릴스 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      } finally {
        clearTimeout(timer);
      }
      // 호출 한도(429)는 화면에 그대로 전달한다 — 링크 저장은 막지 않고 다음에 다시 조회한다.
      if (response.status === 429) throw new ApiError(429, 'instagram_rate_limited', '인스타그램 조회 한도에 걸렸어요. 잠시 뒤 다시 시도할게요.');
      if (!response.ok) throw new ApiError(502, 'instagram_metadata', '릴스 정보를 불러오지 못했어요.');
      let data;
      try { data = await response.json(); } catch { throw new ApiError(502, 'instagram_metadata', '릴스 정보 형식을 알아보지 못했어요.'); }
      // 공식 응답은 영상도 type:'rich'(임베드 블록)로 온다. 사진 글만 거른다.
      if (data?.type && ['image', 'photo'].includes(String(data.type).toLowerCase())) throw new ApiError(400, 'instagram_not_video', '영상이 아닌 글은 릴스로 담지 않아요.');
      const value = exposedMetadata(shortcode, data);
      remember(shortcode, value);
      return { ...value, cached: false };
    },
    size: () => cache.size
  };
}

export function createInstagramOembedHandler({ authenticate, productId, client, fetchImpl, timeoutMs, ttlMs, now } = {}) {
  const resolved = client ?? createInstagramOembedClient({ fetchImpl, timeoutMs, ttlMs, now });
  const effectiveTtl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  const headers = { 'cache-control': `private, max-age=${Math.floor(effectiveTtl / 1000)}`, 'x-content-type-options': 'nosniff' };
  const errorHeaders = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

  return async function request(request) {
    try {
      parsePrincipal(await authenticate(request ?? {}), productId);
      if (String(request?.path ?? '') !== '/api/instagram/oembed') throw new ApiError(404, 'not_found', '요청을 찾을 수 없어요.');
      if ((request?.method ?? 'GET') !== 'GET') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
      const value = String(request?.query?.get?.('v') ?? '').trim() || String(request?.query?.get?.('url') ?? '').trim();
      if (!value) throw new ApiError(400, 'instagram_id', '인스타그램 릴스 주소가 필요해요.');
      const refresh = ['1', 'true', 'yes'].includes(String(request?.query?.get?.('refresh') ?? '').trim().toLowerCase());
      return { status: 200, body: await resolved.metadata(value, { refresh }), headers };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: { code: error.code, message: error.message } }, headers: errorHeaders };
      logServerError(error, 'lovetree-instagram');
      return { status: 502, body: { error: { code: 'instagram_unreachable', message: '릴스 정보를 불러오지 못했어요.' } }, headers: errorHeaders };
    }
  };
}
