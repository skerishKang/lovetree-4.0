/**
 * /t/<공유 id> — 공유 링크 미리보기 카드(#541, 1차).
 *
 * - 사람이 열면 지금 공유 주소 형식(#share/<id>/<view>)으로 302 를 보내고,
 *   링크 미리보기·검색 봇(카카오·페이스북·트위터·디스코드 등)에게는 og 메타가 담긴
 *   HTML 을 돌려준다. 봇 판정을 놓친 브라우저를 위해 HTML 안에 스크립트 넘기기를 한 겹 더 둔다.
 * - 카드 내용은 서버의 공개 공유 읽기(GET /api/public/shares/:id)에서 온다:
 *   제목 = 트리 제목, 설명 = '순간 N개 · 좋아하는 대상' + 첫 순간 제목 한 줄,
 *   그림 = 첫 순간이 YouTube 면 i.ytimg.com hqdefault, 아니면 기본 카드 그림.
 * - 계정 이름·아이디·이메일·내부 id(트리·순간 id)는 HTML 어디에도 쓰지 않는다.
 *   직접 올린 사진(/api/media/)은 카드 그림으로 쓰지 않는다(#427 전까지).
 * - 취소·삭제·없는 공유는 '공유가 취소되었어요' 기본 카드(noindex)이고, 사람은 첫 화면으로 보낸다.
 *   서버에 닿지 못했을 때는 중립 기본 카드(noindex)를 주고, 사람은 공유 주소로 보낸다(앱이 상태를 알려 준다).
 */
import { jsonError, upstreamOrigin } from './proxy.js';
import {
  CARD_IMAGE_URL, PRODUCTION_HOST, SEARCH_OPEN, SHARE_ID, SITE_TAGLINE, SITE_TITLE,
  appHomeUrl, appShareUrl, escapeHtml, isBotUserAgent, isProductionHost, oneLine
} from './search-meta.mjs';

const VIEWS = new Set(['book', 'board', 'network']);
const CANCELED_TITLE = '공유가 취소되었어요';
const CANCELED_DESCRIPTION = '이 공유 주소는 더 이상 열리지 않아요. 러브트리에서 좋아하는 순간을 모아 새 공유 주소를 만들 수 있어요.';

// thumb-fallback.mjs(youtubeIdFrom)와 같은 규칙의 함수 한 벌 — 함수 묶음을 작게 유지하려고
// 클라이언트 모듈을 통째로 가져오지 않고 여기 둔다. 두 벌의 일치는 tests/pages-search-preview.test.mjs 가 확인한다.
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const YTIMG_HOST = /(?:^|\.)ytimg\.com$/i;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) return '';
  let parsed;
  try { parsed = new URL(raw); } catch { return ''; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
  const host = parsed.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) {
    if (host === 'youtu.be') {
      const id = (parsed.pathname || '').split('/').filter(Boolean)[0] || '';
      return VIDEO_ID_RE.test(id) ? id : '';
    }
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v') || '';
      return VIDEO_ID_RE.test(id) ? id : '';
    }
    const matched = (parsed.pathname || '').match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
    return matched && VIDEO_ID_RE.test(matched[1]) ? matched[1] : '';
  }
  if (YTIMG_HOST.test(host)) {
    const matched = (parsed.pathname || '').match(/^\/vi(?:_webp)?\/([^/?#]+)\//);
    return matched && VIDEO_ID_RE.test(matched[1]) ? matched[1] : '';
  }
  return '';
}

// 저장해 둔 썸네일 주소는 https + ytimg.com 만 받는다(임의 외부 호스트·사내 주소 차단).
function safeSavedThumb(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) return '';
  let parsed;
  try { parsed = new URL(raw); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  return YTIMG_HOST.test(parsed.hostname) ? parsed.href : '';
}

// 카드 그림: 저장 썸네일 → 첫 순간 링크의 YouTube hqdefault → 기본 카드 그림.
// /api/media/ 사진은 어떤 경로로도 나가지 않게 애초에 ytimg 주소만 허용한다.
export function cardImageFor(moment) {
  if (!moment) return '';
  const saved = safeSavedThumb(moment.mediaMetadata?.thumbnail);
  if (saved) return saved;
  const id = youtubeVideoId(moment.url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

// 서버 공개 공유 읽기(200 본문 {share, tree})에서 카드 내용을 뽑는다.
// 첫 순간은 공유가 처음 열리는 순간(entryMomentId)이 기준 — 둘러보기 카드(community-service card())와 같은 순서다.
export function shareCardFromRead(read) {
  const tree = read && typeof read === 'object' ? read.tree || {} : {};
  const share = read && typeof read === 'object' ? read.share || {} : {};
  const moments = Array.isArray(tree.moments) ? tree.moments.filter(Boolean) : [];
  const entry = moments.find((moment) => moment.id === share.entryMomentId)
    || moments.find((moment) => moment.parentId === null)
    || moments[0]
    || null;
  const title = oneLine(tree.title, 80) || SITE_TITLE;
  const subject = oneLine(tree.subject, 40);
  const base = `순간 ${moments.length}개${subject ? ` · 좋아하는 대상 ${subject}` : ''}`;
  const firstTitle = entry ? oneLine(entry.title, 60) : '';
  // #611 3번: AI 테스터 기록은 미리보기 카드 문구에도 'AI 테스터'로 알린다(계정 정보는 여전히 넣지 않는다).
  const aiNote = read && typeof read === 'object' && read.aiTester === true ? ' · AI 테스터' : '';
  const description = oneLine(firstTitle ? `${base} · “${firstTitle}”${aiNote}` : `${base}${aiNote}`, 160);
  const image = cardImageFor(entry) || CARD_IMAGE_URL;
  return { title, description, image, view: VIEWS.has(share.view) ? share.view : 'book' };
}

function homeRedirectJs() {
  return 'location.replace(location.origin+(location.hostname==="lovetree.padiem.net"?"/":"/v41/"))';
}

function shareRedirectJs(shareId, view) {
  return `location.replace(location.origin+(location.hostname==="lovetree.padiem.net"?"/":"/v41/")+"#share/${shareId}/${view}")`;
}

// 봇에게 줄 HTML. og:url·canonical 은 운영 주소 기준(#541)으로 고정한다.
export function cardHtml({ titleTag, title, description, image, canonical, appHref, redirectJs, noindex = false, defaultImage = false }) {
  const robots = noindex ? '\n<meta name="robots" content="noindex">' : '';
  // 크기 표시는 기본 카드 그림(1200×630)에만 붙인다. YouTube 썸네일은 480×360 이라 크기를 적지 않는다.
  const dimensions = defaultImage ? '\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : '';
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(titleTag)}</title>
<meta name="description" content="${escapeHtml(description)}">${robots}
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">${dimensions}
<meta property="og:site_name" content="러브트리">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
</head><body>
<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p><a rel="nofollow" href="${escapeHtml(appHref)}">러브트리에서 열기</a></p></main>
<script>${redirectJs}</script>
</body></html>`;
}

function respondHtml(request, html, { status = 200, cache = 'public, max-age=60' } = {}) {
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache, 'x-content-type-options': 'nosniff' };
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  return new Response(html, { status, headers });
}

function respondRedirect(request, location) {
  const headers = { location, 'cache-control': 'no-store' };
  return new Response(request.method === 'HEAD' ? null : '', { status: 302, headers });
}

async function readShare(fetcher, origin, shareId, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
  try {
    const response = await fetcher(`${origin}/api/public/shares/${shareId}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'manual'
    });
    if (response.ok) {
      const type = String(response.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('application/json')) {
        await response.body?.cancel().catch(() => {});
        return { canceled: false };
      }
      return { canceled: false, read: await response.json() };
    }
    await response.body?.cancel().catch(() => {});
    // 취소(410 share_revoked)·삭제·없음(404)·빈 트리(422)는 같은 취소 카드로 취급한다.
    return { canceled: response.status === 404 || response.status === 410 || response.status === 422 };
  } finally {
    clearTimeout(timer);
  }
}

export function createTreePreview({ fetcher = (...args) => fetch(...args), timeoutMs = 10_000, searchOpen = SEARCH_OPEN } = {}) {
  return async function onRequest({ request, env }) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
    }
    const shareId = url.pathname.replace(/^\/t\/?/, '');
    const bot = isBotUserAgent(request.headers.get('user-agent') || '');
    const canceled = () => respondHtml(request, cardHtml({
      titleTag: `${CANCELED_TITLE} · 러브트리`,
      title: CANCELED_TITLE,
      description: CANCELED_DESCRIPTION,
      image: CARD_IMAGE_URL,
      defaultImage: true,
      canonical: `https://${PRODUCTION_HOST}${url.pathname}`,
      appHref: appHomeUrl(url),
      redirectJs: homeRedirectJs(),
      noindex: true
    }), { cache: 'no-store' });

    // 주소 형식이 밖이면 서버까지 가지 않는다 — 취소 카드와 같은 취급.
    if (!SHARE_ID.test(shareId)) {
      return bot ? canceled() : respondRedirect(request, appHomeUrl(url));
    }

    const origin = upstreamOrigin(env);
    if (!origin) {
      const html = cardHtml({
        titleTag: `${SITE_TITLE} · 좋아하는 순간을 모아 두는 곳`,
        title: SITE_TITLE,
        description: SITE_TAGLINE,
        image: CARD_IMAGE_URL,
        defaultImage: true,
        canonical: `https://${PRODUCTION_HOST}${url.pathname}`,
        appHref: appShareUrl(url, shareId, 'book'),
        redirectJs: shareRedirectJs(shareId, 'book'),
        noindex: true
      });
      return bot ? respondHtml(request, html, { cache: 'no-store' }) : respondRedirect(request, appShareUrl(url, shareId, 'book'));
    }

    let read = null;
    let canceledShare = false;
    try {
      const answer = await readShare(fetcher, origin, shareId, timeoutMs);
      read = answer.read || null;
      canceledShare = answer.canceled === true;
    } catch {
      canceledShare = false;
    }

    if (read) {
      const card = shareCardFromRead(read);
      const canonical = `https://${PRODUCTION_HOST}/t/${shareId}`;
      if (bot) {
        const html = cardHtml({
          titleTag: `${card.title} · 러브트리`,
          title: card.title,
          description: card.description,
          image: card.image,
          defaultImage: card.image === CARD_IMAGE_URL,
          canonical,
          appHref: appShareUrl(url, shareId, card.view),
          redirectJs: shareRedirectJs(shareId, card.view),
          // 검색을 열기 전에는 공유 카드도 noindex(링크 미리보기는 그대로 보인다).
          noindex: searchOpen !== true
        });
        return respondHtml(request, html);
      }
      return respondRedirect(request, appShareUrl(url, shareId, card.view));
    }
    if (canceledShare) {
      return bot ? canceled() : respondRedirect(request, appHomeUrl(url));
    }
    // 서버에 닿지 못했거나 예상 밖 응답 — 중립 기본 카드(noindex)를 주고, 사람은 공유 주소로 보낸다.
    const html = cardHtml({
      titleTag: `${SITE_TITLE} · 좋아하는 순간을 모아 두는 곳`,
      title: SITE_TITLE,
      description: SITE_TAGLINE,
      image: CARD_IMAGE_URL,
      defaultImage: true,
      canonical: `https://${PRODUCTION_HOST}/t/${shareId}`,
      appHref: appShareUrl(url, shareId, 'book'),
      redirectJs: shareRedirectJs(shareId, 'book'),
      noindex: true
    });
    return bot ? respondHtml(request, html, { cache: 'no-store' }) : respondRedirect(request, appShareUrl(url, shareId, 'book'));
  };
}
