/**
 * #14 링크·미디어의 첫 조각 — 사용자가 넣은 `url` 하나를 해석하는 유일한 자리.
 *
 * 러브버드 `js/utils/media.js`의 시간 파싱·시작 추출을 검증된 동작 그대로 옮겨왔다
 * (lovebud tests/contracts/editor-viewer-selected-moment-media-play-contract.test.cjs
 * 가 '83'→83, '1:23'→83, '1m23s'→83, 'invalid'→null 을 이미 견딘다). 도메인은
 * 러브버드의 신뢰 목록과 같은 규칙으로 정확히 맞춘다.
 *
 * 이 파일은 아무것도 저장하지 않고 아무 요청도 보내지 않는다. 썸네일·iframe·서버 수집은
 * 이번 범위가 아니고, 원본 문자열을 고치지 않는다 — 표시용 해석만 더한다.
 */

const MAX_START_SECONDS = 12 * 60 * 60;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_URL_LENGTH = 2048;

/** '83' · '1:23' · '1:02:03' · '1h2m3s' · 한국어 단위까지 → 초. 0 이하·형식 외는 null. */
export function parseTimeToSeconds(value = '') {
  const normalized = String(value ?? '').trim()
    .replace(/초/g, 's')
    .replace(/분/g, 'm')
    .replace(/시간/g, 'h')
    .replace(/\s+/g, '');
  if (!normalized || normalized.startsWith('-')) return null;

  let seconds = null;
  if (/^\d+(?::\d{1,2}){1,2}$/.test(normalized)) {
    const parts = normalized.split(':').map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
    if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (/^\d+$/.test(normalized)) {
    seconds = Number(normalized);
  } else {
    const time = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (time && (time[1] || time[2] || time[3])) seconds = Number(time[1] || 0) * 3600 + Number(time[2] || 0) * 60 + Number(time[3] || 0);
  }
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  seconds = Math.floor(seconds);
  if (seconds <= 0 || seconds > MAX_START_SECONDS) return null;
  return seconds;
}

/** 초 → 'm:ss'(1시간 미만) 또는 'h:mm:ss'. */
export function formatStart(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function startFrom(parsed) {
  const search = parsed.searchParams.get('t') || parsed.searchParams.get('start');
  const hash = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
  return parseTimeToSeconds(search || hash.get('t') || hash.get('start'));
}

/** watch/shorts/live/youtu.be 네 형태만 YouTube로 본다. 재생목록만 있는 링크는 일반 링크. */
function youtubeVideoId(parsed) {
  const path = parsed.pathname || '';
  if (parsed.hostname === 'youtu.be') {
    const [id] = path.split('/').filter(Boolean);
    return id && VIDEO_ID.test(id) ? id : null;
  }
  if (path === '/watch') {
    const id = parsed.searchParams.get('v');
    return id && VIDEO_ID.test(id) ? id : null;
  }
  const single = path.match(/^\/(shorts|live)\/([^/?#]+)/);
  if (single) return VIDEO_ID.test(single[2]) ? single[2] : null;
  return null;
}

/**
 * 입력 링크를 표시용 정보로 바꾼다. 원본은 그대로 두고(`original`), 여는 주소만 계산한다.
 * kind: 'youtube' | 'link' | 'invalid' | 'none'
 */
export function parseMomentLink(value = '') {
  const original = String(value ?? '').trim();
  if (!original) return { kind: 'none', original: '', label: '', openUrl: '' };

  let parsed = null;
  try { parsed = new URL(original); } catch { return { kind: 'invalid', original, label: '링크 형태를 알아듣지 못했어요.', openUrl: '' }; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || original.length > MAX_URL_LENGTH) {
    return { kind: 'invalid', original, label: 'http 또는 https 링크만 사용할 수 있어요.', openUrl: '' };
  }

  if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    const videoId = youtubeVideoId(parsed);
    if (videoId) {
      const startSeconds = startFrom(parsed);
      const openUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${startSeconds ? `&t=${startSeconds}s` : ''}`;
      return {
        kind: 'youtube', original, videoId, startSeconds,
        openUrl,
        label: startSeconds ? `YouTube 링크 · 시작 ${formatStart(startSeconds)}` : 'YouTube 링크',
        actionLabel: 'YouTube에서 열기'
      };
    }
  }

  return { kind: 'link', original, openUrl: parsed.href, label: parsed.hostname.replace(/^www\./, ''), actionLabel: '원본 링크 열기' };
}

/** 저장된 값을 알아듣지 못할 때의 안내. 원본은 지우지 않는다는 점을 먼저 말한다. */
export const UNRECOGNIZED_NOTE = '저장된 링크의 형태를 알아볼 수 없어요. 입력한 값은 그대로 두었습니다.';

/**
 * 화면 표시용 해석. 각 화면은 이 결과를 markup에 넣기만 하면 되고,
 * 원본 문자열에는 손대지 않는다. 값이 비어 있으면 null.
 */
export function mediaLinkView(value = '') {
  const info = parseMomentLink(value);
  if (info.kind === 'none') return null;
  if (info.kind === 'invalid') return { kind: 'invalid', href: '', text: UNRECOGNIZED_NOTE };
  const start = info.kind === 'youtube' && info.startSeconds ? ` · 시작 ${formatStart(info.startSeconds)}` : '';
  return { kind: info.kind, href: info.openUrl, text: info.actionLabel + start };
}

/** 작성창의 실시간 안내. 저장 규칙(domain.js safeUrl)과 같은 것을 미리 알려준다. */
export function describeLinkForField(value = '') {
  const info = parseMomentLink(value);
  if (info.kind === 'none') return { tone: 'idle', text: '' };
  if (info.kind === 'invalid') return { tone: 'warn', text: `${info.label} 저장하려고 지우지는 않아요.` };
  if (info.kind === 'youtube') return { tone: 'ok', text: info.startSeconds ? `YouTube 링크로 저장해요 · 시작 ${formatStart(info.startSeconds)}` : 'YouTube 링크로 저장해요' };
  return { tone: 'ok', text: `일반 링크로 저장해요 · ${info.label}` };
}
