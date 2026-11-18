// 유튜브 영상 id 판정 한 벌 — thumb-fallback(썸네일)·title-backfill(제목 채우기)·
// functions/_lib/tree-preview(공유 링크 카드)가 각각 들고 있던 세 벌의 복사본을 여기 한 곳에 모은다.
// 처리 범위: watch·youtu.be·shorts·live·embed 주소, m.youtube·music.youtube 호스트, ytimg(/vi/·/vi_webp/)
// 썸네일 주소. t=·start= 같은 덧붙임 인수는 id 판정에 영향을 주지 않는다.
// 규칙(2026-11-15 thumb-fallback youtubeIdFrom 기준, 동작 바꾸지 않기): http·https만 받고,
// userinfo(https://user:pass@…)와 2048자 넘는 주소는 받지 않으며, 영상 id는 11자리([A-Za-z0-9_-])일 때만 뽑는다.
// 규칙을 바꿀 때는 이 파일 한 곳만 고친다 — 세 곳이 같은 판정인 것은 tests/pages-search-preview.test.mjs 가 확인한다.
export const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
export const YTIMG_HOST = /^(?:img\.youtube\.com|(?:[a-z0-9-]+\.)*ytimg\.com)$/i;
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const trimText = (value) => (typeof value === 'string' ? value.trim() : '');

/** YouTube 영상 ID를 뽑는다. 시청 주소만 받는 호출에서는 allowThumbnail을 끈다. */
export function youtubeIdFrom(value, { allowThumbnail = true } = {}) {
  const raw = trimText(value);
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
  if (allowThumbnail && YTIMG_HOST.test(host)) {
    const matched = (parsed.pathname || '').match(/^\/vi(?:_webp)?\/([^/?#]+)\//);
    return matched && VIDEO_ID_RE.test(matched[1]) ? matched[1] : '';
  }
  return '';
}

/** https + ytimg.com thumbnail URL only; invalid or user supplied hosts are rejected. */
/** https YouTube thumbnail hosts only; reject user supplied lookalike or insecure URLs. */
export function safeYoutubeThumb(value) {
  const raw = trimText(value);
  if (!raw || raw.length > 2048) return '';
  let parsed;
  try { parsed = new URL(raw); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  return YTIMG_HOST.test(parsed.hostname) ? parsed.href : '';
}

export function youtubeStageThumbUrl(videoId, stage = 'hqdefault') {
  const id = trimText(videoId);
  if (!VIDEO_ID_RE.test(id)) return '';
  const file = stage === 'oardefault' ? 'oardefault.jpg' : stage === 'mqdefault' ? 'mqdefault.jpg' : 'hqdefault.jpg';
  return `https://i.ytimg.com/vi/${id}/${file}`;
}

export function isVerticalMoment(moment) {
  const url = trimText(moment?.url) || trimText(moment?.externalUrl);
  if (url) {
    try {
      const parsed = new URL(url);
      if (YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase()) && /^\/shorts\//.test(parsed.pathname || '')) return true;
    } catch { /* ignore */ }
  }
  const meta = moment?.mediaMetadata;
  return Number(meta?.width) > 0 && Number(meta?.height) > Number(meta?.width);
}
