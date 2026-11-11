// #429 1부: 썸네일 내려가기·글 카드·최소 카드 공용 한 벌.
// 순서: 저장된 썸네일 주소(mediaMetadata.thumbnail) → [세로이고 저장 썸네일 없으면 oardefault]
//      → hqdefault → mqdefault → 모두 회색(120×90)/실패면 글 카드 → 제목도 없으면 최소 카드.
// 썸네일 그림은 우리 서버에 복사하지 않고 주소만 다룬다(저작권 원칙).
import { userTitleText, formatDisplayDate } from './book-usability.mjs';

export const GRAY_THUMB_WIDTH = 120;
export const GRAY_THUMB_HEIGHT = 90;
export const VIDEO_UNAVAILABLE_TEXT = '영상을 볼 수 없어요';
export const ADD_TITLE_LABEL = '제목 달기';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const YTIMG_HOST = /(?:^|\.)ytimg\.com$/i;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PUBLIC_ORIGINS = new Set(['https://lovetree-4-0.pages.dev', 'https://lovetree.padiem.net']);
const PRIVATE_PHOTO_PATH = /^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:png|jpg|gif|webp)$/i;
const EMOTION_TONES = { 설렘: 1, 그리움: 2, 위로: 3, 벅참: 4, 고마움: 5, 즐거움: 6 };

const trimText = (value) => (typeof value === 'string' ? value.trim() : '');
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

/** https + ytimg.com 썸네일 주소만 허용한다(서버 복사 없음, 임의 외부 호스트 차단). */
export function safeYoutubeThumb(value) {
  const raw = trimText(value);
  if (!raw || raw.length > 2048) return '';
  let parsed;
  try { parsed = new URL(raw); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  return YTIMG_HOST.test(parsed.hostname) ? parsed.href : '';
}

/** YouTube 시청/쇼츠/라이브/임베드 주소 또는 ytimg 썸네일 주소에서 11자리 영상 ID를 뽑는다. */
export function youtubeIdFrom(value) {
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
  if (YTIMG_HOST.test(host)) {
    const matched = (parsed.pathname || '').match(/^\/vi(?:_webp)?\/([^/?#]+)\//);
    return matched && VIDEO_ID_RE.test(matched[1]) ? matched[1] : '';
  }
  return '';
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

export function isVideoMoment(moment) {
  const url = trimText(moment?.url) || trimText(moment?.externalUrl);
  if (youtubeIdFrom(url)) return true;
  if (safeYoutubeThumb(moment?.mediaMetadata?.thumbnail || moment?.mediaMetadata?.thumbnailUrl)) return true;
  if (url) {
    try {
      const parsed = new URL(url, 'https://lovetree.local');
      if (/\.(?:mp4|webm|ogv)$/i.test(decodeURIComponent(parsed.pathname || ''))) return true;
    } catch { /* ignore */ }
  }
  return moment?.type === 'video' || moment?.kind === 'video' || moment?.youtubeThumb === true;
}

/** data: 이미지, 같은 출처 경로, 공식 별칭의 내 보관 사진 주소만 돌려준다. */
export function localOrPrivatePhoto(moment, currentOrigin = globalThis.location?.origin) {
  const check = (value) => {
    const raw = trimText(value);
    if (!raw) return '';
    if (/^data:image\//i.test(raw)) return raw;
    if (/^\/(?!\/)/.test(raw)) {
      if (/^\/api\/media\/.+\.(?:mp4|webm|ogv)$/i.test(raw)) return '';
      return raw;
    }
    if (!currentOrigin) return '';
    let parsed;
    try { parsed = new URL(raw, currentOrigin); } catch { return ''; }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    const sameOrigin = parsed.origin === currentOrigin;
    const officialAlias = !sameOrigin && PUBLIC_ORIGINS.has(currentOrigin) && PUBLIC_ORIGINS.has(parsed.origin);
    if (!sameOrigin && !officialAlias) return '';
    return PRIVATE_PHOTO_PATH.test(parsed.pathname) ? currentOrigin + parsed.pathname : '';
  };
  const candidates = [
    moment?.image,
    moment?.mediaMetadata?.thumbnail,
    moment?.mediaMetadata?.poster,
    moment?.mediaMetadata?.image,
    moment?.attachment?.url,
    moment?.media?.url,
    moment?.url,
    moment?.externalUrl,
  ];
  for (const value of candidates) {
    const hit = check(value);
    if (hit) return hit;
  }
  return '';
}

/**
 * 썸네일 후보 주소 목록.
 * 1) 내 사진/로컬 그림이 있으면 그 주소 하나
 * 2) 내 기록(autoLoad=true)의 YouTube면: 저장된 썸네일(oEmbed) → [세로이고 저장본 없으면 oardefault] → hqdefault → mqdefault
 * 3) 공유·예시·로그아웃(autoLoad=false)이나 비YouTube 링크는 외부 요청 0([])
 */
export function thumbnailCandidates(moment, { vertical = null, autoLoad = true, currentOrigin = globalThis.location?.origin } = {}) {
  const local = localOrPrivatePhoto(moment, currentOrigin);
  if (local) return [local];
  if (!autoLoad) return [];
  const saved = safeYoutubeThumb(moment?.mediaMetadata?.thumbnail || moment?.mediaMetadata?.thumbnailUrl);
  const url = trimText(moment?.url) || trimText(moment?.externalUrl);
  const videoId = youtubeIdFrom(url) || youtubeIdFrom(saved);
  const isVert = vertical === null ? isVerticalMoment(moment) : !!vertical;
  const list = [];
  if (saved) list.push(saved);
  if (videoId) {
    if (!saved && isVert) list.push(youtubeStageThumbUrl(videoId, 'oardefault'));
    list.push(youtubeStageThumbUrl(videoId, 'hqdefault'));
    list.push(youtubeStageThumbUrl(videoId, 'mqdefault'));
  }
  return [...new Set(list.filter(Boolean))];
}

/** YouTube 기본 회색 "..." 그림(120×90) 또는 깨진 그림(0) 판정. */
export function isGrayThumbnail({ naturalWidth = 0, naturalHeight = 0 } = {}) {
  const w = Number(naturalWidth);
  const h = Number(naturalHeight);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return true;
  return w === GRAY_THUMB_WIDTH && h === GRAY_THUMB_HEIGHT;
}

/** 현재 후보 결과(오류 또는 크기)로 다음 단계(유지 / 다음 주소 재시도 / 글·최소 카드 내려감)를 정한다. */
export function nextThumbnailStep(candidates, index = 0, { error = false, naturalWidth = 0, naturalHeight = 0 } = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const at = Math.max(0, Number.isInteger(index) ? index : Number(index) || 0);
  if (!list.length) return { status: 'fallback', src: '', index: 0 };
  if (!error && at < list.length && !isGrayThumbnail({ naturalWidth, naturalHeight })) {
    return { status: 'ok', src: list[at], index: at };
  }
  if (at + 1 < list.length) {
    return { status: 'retry', src: list[at + 1], index: at + 1 };
  }
  return { status: 'fallback', src: '', index: list.length };
}

export function siteNameOf(value) {
  const raw = trimText(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    const host = parsed.hostname.toLowerCase();
    if (YOUTUBE_HOSTS.has(host) || YTIMG_HOST.test(host)) return 'YouTube';
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function emotionToneOf(emotion) {
  const value = trimText(emotion);
  if (!value) return 1;
  if (EMOTION_TONES[value]) return EMOTION_TONES[value];
  let hash = 0;
  for (const ch of value) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return (hash % 6) + 1;
}

/** 처음부터 썸네일 후보가 없을 때 글 카드·최소 카드로 그려야 하는지 판정한다(일반 사용자 메모는 기존 종이 유지). */
export function needsFallbackCard(moment, { autoLoad = true, currentOrigin = globalThis.location?.origin } = {}) {
  if (thumbnailCandidates(moment, { autoLoad, currentOrigin }).length > 0) return false;
  const url = trimText(moment?.url) || trimText(moment?.externalUrl);
  if (url) return true;
  const mine = userTitleText(moment);
  const video = trimText(moment?.mediaMetadata?.title);
  const channel = trimText(moment?.mediaMetadata?.channel || moment?.mediaMetadata?.authorName);
  const note = trimText(moment?.note) || trimText(moment?.memo);
  return !mine && !video && !channel && !note;
}

/**
 * 모든 썸네일이 회색/실패이거나 썸네일이 없을 때의 카드 정보.
 * - 제목(사용자 제목 → 저장된 영상 제목·채널)이 있으면 글 카드(kind: 'text')
 * - 제목도 없으면 최소 카드(kind: 'minimal', 사이트 이름 + 저장 날짜 + 감정 색 + "제목 달기")
 */
export function fallbackCardData(moment, { writable = false, videoUnavailable = null } = {}) {
  const mine = userTitleText(moment);
  const video = trimText(moment?.mediaMetadata?.title);
  const channel = trimText(moment?.mediaMetadata?.channel || moment?.mediaMetadata?.authorName);
  const emotion = trimText(moment?.emotion) || '설렘';
  const tone = emotionToneOf(emotion);
  const date = formatDisplayDate(moment?.date || moment?.createdAt || '');
  const url = trimText(moment?.url) || trimText(moment?.externalUrl);
  const rawSource = trimText(moment?.domain) || trimText(moment?.source);
  const siteName = siteNameOf(url)
    || (rawSource && !/예시|기록|보관함/.test(rawSource) ? rawSource.replace(/^www\./i, '') : '')
    || '링크';
  const isVideo = videoUnavailable !== null ? !!videoUnavailable : isVideoMoment(moment);

  if (mine || video || channel) {
    const title = mine || video || channel;
    const sub = mine
      ? [video, channel].filter(Boolean).join(' · ')
      : (video ? channel : '');
    return {
      kind: 'text',
      title,
      sub,
      emotion,
      tone,
      date,
      siteName,
      notice: isVideo ? VIDEO_UNAVAILABLE_TEXT : '',
      canAddTitle: false,
    };
  }

  return {
    kind: 'minimal',
    title: '',
    sub: '',
    emotion,
    tone,
    date,
    siteName,
    notice: isVideo ? VIDEO_UNAVAILABLE_TEXT : '',
    canAddTitle: !!writable,
  };
}

/** 글 카드·최소 카드 공통 마크업. <button> 안에도 안전하게 들어가도록 제목 달기는 role="button"을 쓴다. */
export function fallbackCardMarkup(moment, {
  writable = false,
  videoUnavailable = null,
  variant = 'card',
  momentId = '',
  treeId = '',
} = {}) {
  const info = fallbackCardData(moment, { writable, videoUnavailable });
  const id = trimText(momentId) || trimText(moment?.id);
  const tid = trimText(treeId) || trimText(moment?.treeId);
  const action = info.canAddTitle && id
    ? `<span class="lt-fallback-action" role="button" tabindex="0" data-lt-title-edit="${escapeHtml(id)}"${tid ? ` data-lt-tree-id="${escapeHtml(tid)}"` : ''}>${ADD_TITLE_LABEL}</span>`
    : '';
  if (info.kind === 'text') {
    return `<div class="lt-fallback-card lt-fallback-text" data-lt-fallback="text" data-lt-variant="${escapeHtml(variant)}" data-tone="${info.tone}">` +
      `<span class="lt-fallback-head"><span class="lt-fallback-emotion">${escapeHtml(info.emotion)}</span>${info.date ? `<span class="lt-fallback-date">${escapeHtml(info.date)}</span>` : ''}</span>` +
      `<strong class="lt-fallback-title">${escapeHtml(info.title)}</strong>` +
      (info.sub ? `<span class="lt-fallback-sub">${escapeHtml(info.sub)}</span>` : '') +
      (info.notice ? `<small class="lt-fallback-notice">${escapeHtml(info.notice)}</small>` : '') +
      `</div>`;
  }
  return `<div class="lt-fallback-card lt-fallback-minimal" data-lt-fallback="minimal" data-lt-variant="${escapeHtml(variant)}" data-tone="${info.tone}">` +
    `<span class="lt-fallback-head"><strong class="lt-fallback-site">${escapeHtml(info.siteName)}</strong><span class="lt-fallback-emotion">${escapeHtml(info.emotion)}</span></span>` +
    (info.date ? `<span class="lt-fallback-date">${escapeHtml(info.date)}</span>` : '') +
    (info.notice ? `<small class="lt-fallback-notice">${escapeHtml(info.notice)}</small>` : '') +
    action +
    `</div>`;
}

/** <img> 태그에 붙일 내려가기 속성 문자열. */
export function thumbFallbackAttrs(moment, {
  candidates = null,
  mode = 'card',
  writable = false,
  videoUnavailable = null,
  variant = 'card',
  momentId = '',
  treeId = '',
  autoLoad = true,
  vertical = null,
} = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : thumbnailCandidates(moment, { autoLoad, vertical });
  if (!list.length) return '';
  let fallbackHtml = '';
  if (mode === 'card') {
    fallbackHtml = fallbackCardMarkup(moment, { writable, videoUnavailable, variant, momentId, treeId });
  } else if (mode === 'thumb-slot') {
    const tone = emotionToneOf(moment?.emotion);
    fallbackHtml = `<span class="lt-thumb-tone" data-tone="${tone}" aria-hidden="true"></span>`;
  }
  return ` data-lt-candidates="${escapeHtml(JSON.stringify(list))}" data-lt-cand-index="0" data-lt-fallback-mode="${escapeHtml(mode)}"` +
    (fallbackHtml ? ` data-lt-fallback-html="${escapeHtml(fallbackHtml)}"` : '');
}

/** 표지(책장·트리 드롭다운·이어 읽기) <img>에 붙일 내려가기 속성. 모두 실패하면 <img>를 치워 색 표지만 남긴다. */
export function coverFallbackAttrs(momentOrCandidates) {
  const list = Array.isArray(momentOrCandidates)
    ? momentOrCandidates.filter(Boolean)
    : thumbnailCandidates(momentOrCandidates, { autoLoad: true });
  if (!list.length) return '';
  return ` data-lt-candidates="${escapeHtml(JSON.stringify(list))}" data-lt-cand-index="0" data-lt-fallback-mode="cover"`;
}

function parseCandidates(img) {
  try {
    const raw = img?.getAttribute?.('data-lt-candidates') || img?.dataset?.ltCandidates || '';
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function applyThumbOutcome(img, outcome = {}) {
  if (!img || img.dataset?.ltThumbSettled === '1') return null;
  const candidates = parseCandidates(img);
  if (!candidates.length) return null;
  const index = Number(img.getAttribute?.('data-lt-cand-index') ?? img.dataset?.ltCandIndex ?? 0) || 0;
  const step = nextThumbnailStep(candidates, index, outcome);
  if (step.status === 'ok') {
    if (img.dataset) img.dataset.ltThumbState = 'ok';
    return step;
  }
  if (step.status === 'retry') {
    if (img.setAttribute) img.setAttribute('data-lt-cand-index', String(step.index));
    if (img.dataset) img.dataset.ltCandIndex = String(step.index);
    img.src = step.src;
    return step;
  }
  if (img.dataset) img.dataset.ltThumbSettled = '1';
  const mode = img.getAttribute?.('data-lt-fallback-mode') || img.dataset?.ltFallbackMode || 'card';
  const html = img.getAttribute?.('data-lt-fallback-html') || img.dataset?.ltFallbackHtml || '';
  if (mode === 'cover') {
    if (img.id === 'coverMedia') {
      img.hidden = true;
      img.removeAttribute?.('src');
      img.removeAttribute?.('data-lt-candidates');
    } else {
      img.remove?.();
    }
    return step;
  }
  if (mode === 'thumb-slot') {
    const row = img.closest?.('[data-lt-moment-row]');
    const badge = row?.querySelector?.('[data-lt-row-unavailable]');
    if (badge) badge.hidden = false;
    if (html && img.insertAdjacentHTML) {
      img.insertAdjacentHTML('afterend', html);
    }
    img.remove?.();
    return step;
  }
  const host = img.closest?.('[data-lt-thumb-host]') || img.parentElement;
  const card = img.closest?.('.card');
  if (card) {
    card.classList?.add?.('lt-has-fallback');
    card.querySelector?.('.playGlyph')?.remove?.();
  }
  if (host && html) {
    host.innerHTML = html;
  } else {
    img.remove?.();
  }
  return step;
}

const mountedRoots = new WeakSet();

/**
 * 문서 또는 ShadowRoot에 썸네일 내려가기와 "제목 달기" 동작을 한 번 붙인다.
 * 캡처 단계 load/error + 이미 완료된 캐시 이미지 즉시 판정 + MutationObserver를 함께 쓴다.
 */
export function mountThumbFallback(root = globalThis.document, { onEditTitle = null, isReadOnly = null } = {}) {
  if (!root || typeof root.addEventListener !== 'function') return () => {};
  if (mountedRoots.has(root)) return () => {};
  mountedRoots.add(root);

  const inspectComplete = (scope) => {
    if (!scope?.querySelectorAll) return;
    const imgs = scope.querySelectorAll('img[data-lt-candidates]');
    for (const img of imgs) {
      if (!img.complete || img.dataset?.ltThumbSettled === '1') continue;
      if (img.naturalWidth === 0) applyThumbOutcome(img, { error: true });
      else applyThumbOutcome(img, { error: false, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    }
  };

  const onLoad = (event) => {
    const img = event?.target;
    if (!img || !img.getAttribute?.('data-lt-candidates')) return;
    applyThumbOutcome(img, { error: false, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
  };

  const onError = (event) => {
    const img = event?.target;
    if (!img || !img.getAttribute?.('data-lt-candidates')) return;
    applyThumbOutcome(img, { error: true });
  };

  const triggerEdit = (target, event) => {
    if (!target) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    const readOnly = typeof isReadOnly === 'function'
      ? isReadOnly()
      : (globalThis.LTDEMO?.readOnly === true || globalThis.window?.parent?.LT41?.source === 'share');
    if (readOnly) return;
    const momentId = target.getAttribute?.('data-lt-title-edit') || target.dataset?.ltTitleEdit || '';
    const treeId = target.getAttribute?.('data-lt-tree-id') || target.dataset?.ltTreeId || '';
    if (!momentId) return;
    if (typeof onEditTitle === 'function') {
      onEditTitle({ momentId, treeId });
      return;
    }
    try {
      if (globalThis.window?.parent && globalThis.window.parent !== globalThis.window) {
        if (!treeId) globalThis.window.parent.postMessage({ type: 'lt41-select', id: momentId }, globalThis.location.origin);
        globalThis.window.parent.postMessage({ type: 'lt41-write', mode: 'edit', treeId, momentId, focusTitle: true }, globalThis.location.origin);
      }
    } catch { /* ignore cross-window failure */ }
  };

  const onClick = (event) => {
    const btn = event?.target?.closest?.('[data-lt-title-edit]');
    if (!btn) return;
    triggerEdit(btn, event);
  };

  const onKeyDown = (event) => {
    if (event?.key !== 'Enter' && event?.key !== ' ') return;
    const btn = event?.target?.closest?.('[data-lt-title-edit]');
    if (!btn) return;
    triggerEdit(btn, event);
  };

  root.addEventListener('load', onLoad, true);
  root.addEventListener('error', onError, true);
  root.addEventListener('click', onClick, true);
  root.addEventListener('keydown', onKeyDown, true);

  let observer = null;
  const observeTarget = root.documentElement || root;
  if (typeof MutationObserver === 'function' && observeTarget) {
    observer = new MutationObserver(() => inspectComplete(root));
    try { observer.observe(observeTarget, { childList: true, subtree: true }); } catch { observer = null; }
  }
  inspectComplete(root);

  return () => {
    mountedRoots.delete(root);
    root.removeEventListener?.('load', onLoad, true);
    root.removeEventListener?.('error', onError, true);
    root.removeEventListener?.('click', onClick, true);
    root.removeEventListener?.('keydown', onKeyDown, true);
    observer?.disconnect?.();
  };
}

const api = {
  GRAY_THUMB_WIDTH,
  GRAY_THUMB_HEIGHT,
  VIDEO_UNAVAILABLE_TEXT,
  ADD_TITLE_LABEL,
  safeYoutubeThumb,
  youtubeIdFrom,
  youtubeStageThumbUrl,
  isVerticalMoment,
  isVideoMoment,
  localOrPrivatePhoto,
  thumbnailCandidates,
  isGrayThumbnail,
  nextThumbnailStep,
  siteNameOf,
  emotionToneOf,
  needsFallbackCard,
  fallbackCardData,
  fallbackCardMarkup,
  thumbFallbackAttrs,
  coverFallbackAttrs,
  applyThumbOutcome,
  mountThumbFallback,
};

if (typeof globalThis !== 'undefined') {
  globalThis.LTThumbFallback = api;
}
