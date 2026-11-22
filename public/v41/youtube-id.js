// #1060: 유튜브 영상 id·썸네일 단계 주소 정본. 일반 스크립트와 모듈이 같은 값을 쓰게
// globalThis.LTYouTubeId 한 곳에 등록한다(주소 글자는 이 파일에서만 만든다).
// youtube-id.mjs는 이 파일을 import해 모듈 쓰는 곳에 같은 값을 그대로 내보낸다.
// 규칙: http·https만 받고, userinfo·2048자 초과는 거르며, 영상 id는 11자리만 뽑는다.
(function () {
  const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
  const YTIMG_HOST = /^(?:img\.youtube\.com|(?:[a-z0-9-]+\.)*ytimg\.com)$/i;
  const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  const trimText = (value) => (typeof value === 'string' ? value.trim() : '');

  function youtubeIdFrom(value, { allowThumbnail = true } = {}) {
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

  function safeYoutubeThumb(value) {
    const raw = trimText(value);
    if (!raw || raw.length > 2048) return '';
    let parsed;
    try { parsed = new URL(raw); } catch { return ''; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    return YTIMG_HOST.test(parsed.hostname) ? parsed.href : '';
  }

  function youtubeStageThumbUrl(videoId, stage = 'hqdefault') {
    const id = trimText(videoId);
    if (!VIDEO_ID_RE.test(id)) return '';
    const file = stage === 'maxresdefault' ? 'maxresdefault.jpg'
      : stage === 'oardefault' ? 'oardefault.jpg'
      : stage === 'mqdefault' ? 'mqdefault.jpg'
      : 'hqdefault.jpg';
    return `https://i.ytimg.com/vi/${id}/${file}`;
  }

  function isVerticalMoment(moment) {
    const meta = moment?.mediaMetadata;
    if (typeof meta?.vertical === 'boolean') return meta.vertical;
    if (typeof meta?.width === 'number' && typeof meta?.height === 'number' && meta.width > 0 && meta.height > 0) return meta.height > meta.width;
    const url = trimText(moment?.url) || trimText(moment?.externalUrl);
    if (url) {
      try {
        const parsed = new URL(url);
        if (YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase()) && /^\/shorts\//.test(parsed.pathname || '')) return true;
      } catch { /* ignore */ }
    }
    return Number(meta?.width) > 0 && Number(meta?.height) > Number(meta?.width);
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.LTYouTubeId = { YOUTUBE_HOSTS, YTIMG_HOST, VIDEO_ID_RE, youtubeIdFrom, safeYoutubeThumb, youtubeStageThumbUrl, isVerticalMoment };
  }
})();
