/**
 * 검색 준비 공용 조각 — #541.
 *
 * - 운영 주소(lovetree.padiem.net)만 검색에 내보낸다. 개발 주소(*.pages.dev)는
 *   robots.txt 전면 차단(이 파일 createRobots)과 문서에 X-Robots-Tag noindex
 *   (functions/index.js · functions/v41/index.js) 두 겹으로 막는다.
 * - canonical·og:url·기본 카드 그림 주소는 운영 주소 기준으로 고정한다.
 * - 사람이 앱을 여는 공유 주소 형식은 public/v41/shell/messages.mjs shareUrlFor 와
 *   같은 규칙(운영 주소 루트, 그 밖은 /v41/)을 따른다.
 */
import { jsonError, upstreamOrigin } from './proxy.js';

export const PRODUCTION_HOST = 'lovetree.padiem.net';
// 기본 카드 그림. public/og/lovetree-card.png 로 배포되며 1200×630 이다.
export const CARD_IMAGE_PATH = '/og/lovetree-card.png';
export const CARD_IMAGE_URL = `https://${PRODUCTION_HOST}${CARD_IMAGE_PATH}`;
export const SITE_TITLE = '러브트리';
export const SITE_TAGLINE = '좋아하는 순간을 모아 두는 곳';
// 서버 share-service 의 SHARE_ID 와 같은 형식 검사. 주소 형식이 밖이면 서버까지 가지 않는다.
export const SHARE_ID = /^[A-Za-z0-9_-]{20,64}$/;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// 카드·메타에 들어갈 문장은 한 줄로 줄인다(개행 제거, 너무 길면 말줄임).
export function oneLine(value, max = 80) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text;
}

export function isProductionHost(hostname) {
  return hostname === PRODUCTION_HOST;
}

// 검색 열기 스위치 — 서비스 시작 전이라 닫아 둔다(대표 결정 2026-11-14).
// false 동안은 운영 주소도 개발 주소처럼 robots 전면 차단·sitemap 404·문서 noindex 다.
// 링크 미리보기 카드(/t/<id>, 카톡·페이스북 등)는 검색과 별개라 그대로 나간다.
// 서비스를 열 때 이 한 줄만 true 로 바꾸고, 그 뒤 서치어드바이저·서치 콘솔에 등록한다.
export const SEARCH_OPEN = false;

export function isSearchOpenHost(hostname, searchOpen = SEARCH_OPEN) {
  return searchOpen === true && isProductionHost(hostname);
}

// 운영 주소는 루트(/)에서 4.1 앱을 serve 한다(functions/index.js). 나머지는 /v41/.
export function appBasePath(hostname) {
  return isProductionHost(hostname) ? '/' : '/v41/';
}

export function appHomeUrl(url) {
  return `${url.origin}${appBasePath(url.hostname)}`;
}

// 지금 공유 주소 형식(#share/<id>/<view>) — 기존 주소도 계속 열리게 유지한다(#541).
export function appShareUrl(url, shareId, view) {
  return `${url.origin}${appBasePath(url.hostname)}#share/${shareId}/${view}`;
}

// 링크 미리보기·검색 봇만 골라 낸다. 사람(브라우저) UA 는 걸리지 않는다.
const BOT_UA = /(facebookexternalhit|facebot|twitterbot|discordbot|kakao|daumapps|daumaudi|slackbot|whatsapp|telegrambot|skypeuripreview|vkshare|pinterestbot|linkedinbot|embedly|googlebot|bingbot|applebot|duckduckbot|yandexbot|baiduspider|yeti|naverbot|seznambot|robot|crawler|spider|slurp)/i;

export function isBotUserAgent(ua) {
  return BOT_UA.test(String(ua || ''));
}

// robots.txt — 검색이 열린 운영 주소만 허용 + sitemap 안내, 그 밖은 전면 차단(#541).
export function createRobots({ searchOpen = SEARCH_OPEN } = {}) {
  return function onRequest({ request }) {
    const url = new URL(request.url);
    const body = isSearchOpenHost(url.hostname, searchOpen)
      ? `User-agent: *\nAllow: /\nSitemap: https://${PRODUCTION_HOST}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /\n';
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' }
    });
  };
}

function dateOnly(value) {
  const text = String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

async function fetchJson(fetcher, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
  try {
    const response = await fetcher(url, { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`upstream_${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// sitemap 에 나열할 공유의 조건은 이 함수 한 곳에서만 정한다(#541).
// 지금: '둘러보기에 공개된 공유'(status active && discoverable)만 — 서버의
// GET /api/community/shares(discover) 목록이 이미 이 조건으로 거른다.
// #538(공유 기본 공개)이 머지되면 이 함수가 부르는 경로·조건만 여기서 바꾸면 된다.
export const SITEMAP_MAX_ENTRIES = 200;

export async function collectSitemapShares({ fetcher = (...args) => fetch(...args), origin, timeoutMs = 10_000, maxEntries = SITEMAP_MAX_ENTRIES } = {}) {
  // discover 의 페이지 크기는 서버가 최대 24까지 받는다(server/community-service.js).
  const size = 24;
  const entries = [];
  let cursor = '';
  const maxPages = Math.ceil(maxEntries / size);
  for (let page = 0; entries.length < maxEntries && page < maxPages; page += 1) {
    const query = new URLSearchParams({ limit: String(size) });
    if (cursor) query.set('cursor', cursor);
    const body = await fetchJson(fetcher, `${origin}/api/community/shares?${query}`, timeoutMs);
    for (const item of Array.isArray(body?.items) ? body.items : []) {
      if (item && SHARE_ID.test(String(item.shareId || ''))) {
        entries.push({ shareId: String(item.shareId), lastmod: dateOnly(item.createdAt) });
      }
    }
    const next = typeof body?.nextCursor === 'string' && body.nextCursor ? body.nextCursor : '';
    if (!next) break;
    cursor = next;
  }
  return entries.slice(0, maxEntries);
}

// sitemap.xml — 검색이 열린 운영 주소에서만 내보낸다. 그 밖은 404 로 끊는다.
export function createSitemap({ fetcher = (...args) => fetch(...args), timeoutMs = 10_000, searchOpen = SEARCH_OPEN } = {}) {
  return async function onRequest({ request, env }) {
    const url = new URL(request.url);
    if (!isSearchOpenHost(url.hostname, searchOpen)) return jsonError(404, 'not_found', '이 주소에는 사이트맵이 없어요.');
    const origin = upstreamOrigin(env);
    if (!origin) return jsonError(503, 'storage_unavailable', '서버 저장 주소가 설정되지 않았어요.');
    let entries;
    try {
      entries = await collectSitemapShares({ fetcher, origin, timeoutMs });
    } catch {
      return jsonError(503, 'sitemap_unavailable', '사이트맵을 만들지 못했어요.');
    }
    const urls = entries.map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>https://${PRODUCTION_HOST}/t/${escapeHtml(entry.shareId)}</loc>${lastmod}\n  </url>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    return new Response(xml, {
      status: 200,
      headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' }
    });
  };
}
