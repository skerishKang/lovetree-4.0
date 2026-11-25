import { logServerError } from './error-log.js';
// 틱톡 oEmbed 프록시 — 영상 표시 정보(제목·작성자·썸네일·크기)를 서버에서 안전하게 가져온다(#791).
//
// - 실제 요청은 고정 호스트 `www.tiktok.com`의 두 경로(oembed·정본 영상 페이지)로만
//   나간다. 입력에서 온 주소가 목적지가 되지 않는다(SSRF 표면 없음). 클라이언트가 준
//   숫자 영상 id나 정본/짧은 틱톡 주소만 허용하고, 그 밖은 받지도 않는다.
// - 운영 oEmbed는 200을 주면서 thumbnail_url·title·author_name을 담지 않는다(2026-11 실측).
//   썸네일이 없을 때만 같은 호스트의 영상 페이지를 읽어 페이지 안의 표지 주소를 쓴다.
// - 짧은 주소(vm·vt.tiktok.com)는 서버에서 한 번 따라가(redirect) 정본 주소의 숫자
//   id를 뽑는다. 따라간 주소의 호스트는 tiktok.com 계열일 때만 받아들인다.
// - 틱톡 oEmbed는 없는 id에도 200을 돌려줄 수 있다. 응답 코드로 영상 존재를 단정하지
//   않는다 — 사라진 영상은 공식 재생기 화면에서 틱톡이 직접 알린다.
// - 성공한 응답만 24시간 캐시한다. 실패는 캐시하지 않는다. 썸네일은 시간이 지나 막히면
//   refresh 요청으로 캐시를 지우고 다시 받아온다(유튜브 썸네일 다시 받기와 같은 길).
// - 돌려주는 필드는 화이트리스트(제목·작성자·썸네일·크기)뿐이다. oEmbed가 담지 않으면
//   빈 문자열로 둔다.
import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';

export const TIKTOK_VIDEO_ID = /^\d{15,25}$/;
const TIKTOK_HOSTS = new Set(['www.tiktok.com', 'tiktok.com']);
const SHORT_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);
const OEMBED_ENDPOINT = 'https://www.tiktok.com/oembed';
const VIDEO_PAGE_ENDPOINT = 'https://www.tiktok.com/@tiktok/video/';
const PAGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const REHYDRATION_SCRIPT = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/;
const THUMBNAIL_HOST = /(?:^|\.)(?:tiktokcdn\.com|tiktok\.com)$/;
export const DEFAULT_TIMEOUT_MS = 3000;
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_TITLE = 500;
const MAX_AUTHOR = 120;
const MAX_THUMBNAIL = 2048;

/** 숫자 id나 @사용자/video/{id} 정본 주소에서 영상 id만 뽑는다. 그 밖은 null. */
export function tiktokVideoId(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (TIKTOK_VIDEO_ID.test(raw)) return raw;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.username || parsed.password || parsed.protocol !== 'https:') return null;
  if (!TIKTOK_HOSTS.has(parsed.hostname)) return null;
  const matched = (parsed.pathname || '').match(/^\/@[A-Za-z0-9_.]+\/video\/(\d{15,25})\/?$/);
  return matched ? matched[1] : null;
}

/** vm·vt.tiktok.com 짧은 주소인지. 짧은 주소는 요청으로 따라가 자야 정본 id를 안다. */
export function tiktokShortUrl(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.username || parsed.password || parsed.protocol !== 'https:') return null;
  if (!SHORT_HOSTS.has(parsed.hostname)) return null;
  const code = (parsed.pathname || '').split('/').filter(Boolean)[0] || '';
  return /^[A-Za-z0-9]{4,32}$/.test(code) ? parsed.href : null;
}

/** 정본 주소 경로의 @계정 이름. 짧은 주소·평문 id는 모른다(따라간 뒤에 안다). */
export function tiktokAuthor(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let parsed;
  try { parsed = new URL(raw); } catch { return ''; }
  if (!TIKTOK_HOSTS.has(parsed.hostname)) return '';
  const matched = (parsed.pathname || '').match(/^\/@([A-Za-z0-9_.]+)\/video\/\d{15,25}\/?$/);
  return matched ? matched[1] : '';
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

/** oEmbed 원본 응답에서 표시에 쓰는 필드만 남긴다. */
export function exposedMetadata(videoId, data) {
  const width = Number(data?.width);
  const height = Number(data?.height);
  return {
    videoId,
    title: safeText(data?.title, MAX_TITLE),
    authorName: safeText(data?.author_name, MAX_AUTHOR),
    thumbnailUrl: safeThumbnail(data?.thumbnail_url),
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : 0,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : 0
  };
}

/** 영상 페이지의 정적 데이터에서 요청한 영상과 같은 id의 표지 주소만 꺼낸다. */
export function thumbnailFromPage(html, videoId) {
  const matched = REHYDRATION_SCRIPT.exec(String(html || ''));
  if (!matched) return '';
  let data;
  try { data = JSON.parse(matched[1]); } catch { return ''; }
  const item = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
  if (!item || String(item.id) !== String(videoId)) return '';
  const video = item.video || {};
  for (const key of ['originCover', 'cover', 'dynamicCover']) {
    const candidate = safeThumbnail(video[key]);
    if (candidate) return candidate;
  }
  return '';
}

export function createTiktokOembedClient({ fetchImpl = (...args) => fetch(...args), timeoutMs = DEFAULT_TIMEOUT_MS, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const cache = new Map();

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

  // 짧은 주소는 서버에서 따라간다. 따라간 주소의 호스트가 틱톡이 아니면 받지 않는다.
  async function resolveShortUrl(shortUrl, signal) {
    const response = await fetchImpl(shortUrl, { headers: { accept: 'text/html' }, redirect: 'follow', signal });
    const finalUrl = String(response?.url || '');
    if (!finalUrl) throw new ApiError(502, 'tiktok_unreachable', '영상 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    const videoId = tiktokVideoId(finalUrl);
    if (!videoId) throw new ApiError(400, 'tiktok_unresolved', '짧은 주소가 틱톡 영상으로 열리지 않아요. 정본 주소로 넣어 주세요.');
    return { videoId, author: tiktokAuthor(finalUrl) };
  }

  async function resolveInput(value) {
    const direct = tiktokVideoId(value);
    if (direct) return { videoId: direct, author: tiktokAuthor(value) };
    const short = tiktokShortUrl(value);
    if (short) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      try { return await resolveShortUrl(short, controller.signal); }
      catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, 'tiktok_unreachable', '영상 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      } finally { clearTimeout(timer); }
    }
    throw new ApiError(400, 'tiktok_id', '틱톡 영상 주소나 숫자 영상 id가 필요해요.');
  }

  // oEmbed가 썸네일을 주지 않을 때만 정본 영상 페이지를 읽는다. 실패하면 빈 문자열로
  // 두고, 링크 저장은 막지 않는다. 페이지 크기에는 상한을 둔다.
  async function pageThumbnail(videoId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetchImpl(`${VIDEO_PAGE_ENDPOINT}${videoId}`, {
        headers: { accept: 'text/html', 'user-agent': PAGE_USER_AGENT },
        redirect: 'error',
        signal: controller.signal
      });
      if (!response?.ok || typeof response.text !== 'function') return '';
      const length = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(length) && length > MAX_PAGE_BYTES) return '';
      const html = await response.text();
      return String(html || '').length > MAX_PAGE_BYTES ? '' : thumbnailFromPage(html, videoId);
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async metadata(input, { refresh = false } = {}) {
      const { videoId, author } = await resolveInput(input);
      if (!refresh) {
        const cached = read(videoId);
        if (cached) return { ...cached, cached: true };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      let response;
      try {
        const canonical = `https://www.tiktok.com/@tiktok/video/${videoId}`;
        response = await fetchImpl(`${OEMBED_ENDPOINT}?url=${encodeURIComponent(canonical)}&format=json`, { headers: { accept: 'application/json' }, redirect: 'error', signal: controller.signal });
      } catch {
        throw new ApiError(502, 'tiktok_unreachable', '영상 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new ApiError(502, 'tiktok_metadata', '영상 정보를 불러오지 못했어요.');
      let data;
      try { data = await response.json(); } catch { throw new ApiError(502, 'tiktok_metadata', '영상 정보 형식을 알아보지 못했어요.'); }

      // @계정 이름은 oEmbed가 주지 않으면 따라간 정본 주소(또는 입력 정본)에서 푼다.
      const value = { ...exposedMetadata(videoId, data), author: safeText(author, MAX_AUTHOR) };
      if (!value.thumbnailUrl) value.thumbnailUrl = await pageThumbnail(videoId);
      remember(videoId, value);
      return { ...value, cached: false };
    },
    size: () => cache.size
  };
}

export function createTiktokOembedHandler({ authenticate, productId, client, fetchImpl, timeoutMs, ttlMs, now } = {}) {
  const resolved = client ?? createTiktokOembedClient({ fetchImpl, timeoutMs, ttlMs, now });
  const effectiveTtl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  const headers = { 'cache-control': `private, max-age=${Math.floor(effectiveTtl / 1000)}`, 'x-content-type-options': 'nosniff' };
  const errorHeaders = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

  return async function request(request) {
    try {
      parsePrincipal(await authenticate(request ?? {}), productId);
      if (String(request?.path ?? '') !== '/api/tiktok/oembed') throw new ApiError(404, 'not_found', '요청을 찾을 수 없어요.');
      if ((request?.method ?? 'GET') !== 'GET') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
      const value = String(request?.query?.get?.('v') ?? '').trim() || String(request?.query?.get?.('url') ?? '').trim();
      if (!value) throw new ApiError(400, 'tiktok_id', '틱톡 영상 주소나 숫자 영상 id가 필요해요.');
      const refresh = ['1', 'true', 'yes'].includes(String(request?.query?.get?.('refresh') ?? '').trim().toLowerCase());
      return { status: 200, body: await resolved.metadata(value, { refresh }), headers };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: { code: error.code, message: error.message } }, headers: errorHeaders };
      logServerError(error, 'lovetree-tiktok');
      return { status: 502, body: { error: { code: 'tiktok_unreachable', message: '영상 정보를 불러오지 못했어요.' } }, headers: errorHeaders };
    }
  };
}
