// #822 1단계: 브라우저 북마크 파일에서 유튜브 영상을 골라내는 순수 계산.
// 화면(shell/bookmark-import.mjs)은 이 파일의 판정만 쓰고, 이 파일은 DOM을 만지지 않는다(docs/TESTING.md).
// 북마크 파일은 글자로만 읽는다 — 문서로 만들어 실행하지 않고(DOMParser·innerHTML 없음), 어디에도 보내지 않는다.
// 꺼내는 것은 유튜브 영상 주소·북마크 제목·폴더 이름·추가 날짜뿐이고, 나머지 북마크는 읽은 자리에서 버린다.
// 영상 판정은 기존 한 벌(youtube-id.mjs), 같은 영상 판정도 기존 한 벌(quick-intake.mjs #876)을 그대로 쓴다.
import { youtubeIdFrom, YOUTUBE_HOSTS } from './youtube-id.mjs';
import { isSameVideoMoment } from './quick-intake.mjs';
import { localDateOnly } from './local-date.mjs';

// 파일 크기 상한: 크롬·엣지는 북마크마다 아이콘 그림을 글자로 함께 적어 파일이 몇 MB까지 커진다.
export const BOOKMARK_FILE_MAX_BYTES = 20 * 1024 * 1024;
// 읽는 북마크 수 상한(안전판) — 넘으면 앞에서부터 이만큼만 읽고 알린다.
export const BOOKMARK_SCAN_MAX = 50000;
const FOLDER_DEPTH_MAX = 64;
const TITLE_MAX = 300;
const URL_MAX = 2048;
export const NO_FOLDER_LABEL = '폴더 없음';
export const UNNAMED_FOLDER_LABEL = '이름 없는 폴더';
export const FOLDER_JOIN = ' › ';

// 읽지 못한 까닭(화면 문구는 shell 쪽이 정한다).
export const READ_NOT_BOOKMARK = 'not-bookmark';
export const READ_NO_VIDEO = 'no-video';

// 크롬·엣지·파이어폭스·사파리가 내보내는 북마크 파일은 모두 이 머리말로 시작한다.
const BOOKMARK_MARKER = /<!DOCTYPE\s+NETSCAPE-Bookmark-file-1/i;
export function isBookmarkFile(text) {
  return BOOKMARK_MARKER.test(String(text ?? '').slice(0, 4096));
}

const ENTITY = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos|nbsp);/gi;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(value) {
  return String(value ?? '').replace(ENTITY, (whole, body) => {
    const name = body.toLowerCase();
    if (name in NAMED) return NAMED[name];
    const point = name.startsWith('#x') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return '';
    try { return String.fromCodePoint(point); } catch { return ''; }
  });
}
function plainText(value) {
  const text = decodeEntities(String(value ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  return text.length > TITLE_MAX ? Array.from(text).slice(0, TITLE_MAX).join('') : text;
}

// 필요한 꼬리표(a·h3·dl)만 본다. 속성 값의 따옴표 안에 든 '>'는 꼬리표 끝으로 세지 않는다.
const TAG = /<(\/?)(a|h3|dl)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
const ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
function attributesOf(source) {
  const out = {};
  ATTR.lastIndex = 0;
  let found;
  while ((found = ATTR.exec(source))) {
    const name = found[1].toLowerCase();
    if (name in out) continue;
    out[name] = decodeEntities(found[2] ?? found[3] ?? found[4] ?? '');
  }
  return out;
}

/**
 * 북마크 파일 글자에서 북마크를 차례로 꺼낸다. 구조가 조금 어긋나도 멈추지 않고 읽을 수 있는 만큼 읽는다
 * (사파리는 맨 위 목록에 dl이 없고, 파이어폭스는 설명(dd)·구분선(hr)이 섞인다).
 * 돌려주는 값: { entries: [{ href, title, addDate, folderPath }], truncated }
 * folderPath는 바깥 폴더부터 안쪽 폴더까지의 이름 목록이다(폴더 밖이면 빈 목록).
 */
export function parseBookmarkHtml(text) {
  const source = String(text ?? '');
  const entries = [];
  const folders = [];   // 지금 들어와 있는 폴더 이름들
  const frames = [];    // dl마다: 이 목록이 폴더를 하나 열었는가
  let pendingFolder = null;
  let open = null;      // 닫는 꼬리표를 기다리는 a·h3 { tag, attrs, from }
  let truncated = false;
  const closeAnchor = (until) => {
    const attrs = attributesOf(open.attrs);
    entries.push({ href: attrs.href || '', title: plainText(source.slice(open.from, until)), addDate: attrs.add_date || '', folderPath: folders.slice() });
  };
  TAG.lastIndex = 0;
  let found;
  while ((found = TAG.exec(source))) {
    const closing = found[1] === '/';
    const tag = found[2].toLowerCase();
    if (open) {
      // 닫히지 않은 채 다음 꼬리표가 오면 거기까지를 그 이름으로 본다.
      if (open.tag === 'a') closeAnchor(found.index);
      else pendingFolder = plainText(source.slice(open.from, found.index));
      const closedSelf = closing && tag === open.tag;
      open = null;
      if (entries.length >= BOOKMARK_SCAN_MAX) { truncated = true; break; }
      if (closedSelf) continue;
    }
    if (closing) {
      if (tag === 'dl' && frames.length && frames.pop()) folders.pop();
      continue;
    }
    if (tag === 'dl') {
      const opensFolder = pendingFolder !== null && folders.length < FOLDER_DEPTH_MAX;
      if (opensFolder) folders.push(pendingFolder || UNNAMED_FOLDER_LABEL);
      pendingFolder = null;
      frames.push(opensFolder);
      continue;
    }
    // 목록(dl) 없이 끝난 폴더 이름은 버린다 — 다음 북마크가 그 폴더에 든 것으로 읽히지 않게.
    pendingFolder = null;
    open = { tag, attrs: found[3], from: TAG.lastIndex };
  }
  return { entries, truncated };
}

const OTHER = Object.freeze({ kind: 'other', url: '', videoId: '' });
/**
 * 북마크 주소 하나를 가른다: 유튜브 영상(video)·재생목록(playlist)·채널(channel)·그 밖(other).
 * 영상 판정은 기존 한 벌(youtubeIdFrom: watch·youtu.be·shorts·live·embed)을 그대로 쓴다.
 * 재생목록 안의 영상(watch?v=…&list=…)은 영상이다.
 */
export function classifyBookmarkUrl(href) {
  const raw = String(href ?? '').trim();
  if (!raw || raw.length > URL_MAX) return OTHER;
  let parsed;
  try { parsed = new URL(raw); } catch { return OTHER; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return OTHER;
  if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return OTHER;
  const videoId = youtubeIdFrom(parsed.href, { allowThumbnail: false });
  if (videoId) return { kind: 'video', url: parsed.href, videoId };
  const path = parsed.pathname || '/';
  if ((path === '/playlist' || path === '/watch') && parsed.searchParams.get('list')) return { kind: 'playlist', url: parsed.href, videoId: '' };
  if (/^\/(?:channel\/|c\/|user\/|@)/.test(path)) return { kind: 'channel', url: parsed.href, videoId: '' };
  return OTHER;
}

/**
 * 북마크 제목 손질: 브라우저 탭 제목에서 온 꼬리 ' - YouTube'를 떼고, 그 꼬리가 있던 제목만 앞의 알림 수 '(3) '도 뗀다
 * (직접 붙인 이름 '(2024) 연말 무대' 같은 것은 건드리지 않는다). 주소뿐인 제목은 빈 값.
 */
const TAB_TAIL = /\s+[-–—|]\s+YouTube(?:\s+Music)?$/i;
export function cleanBookmarkTitle(raw) {
  let text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (TAB_TAIL.test(text)) text = text.replace(TAB_TAIL, '').replace(/^\(\d{1,3}\+?\)\s+/, '').trim();
  if (!text || /^https?:\/\//i.test(text) || /^youtube(?:\s+music)?$/i.test(text)) return '';
  return text;
}

// 유튜브가 생기기 전 날짜·앞날은 잘못 적힌 값으로 보고 쓰지 않는다.
const EARLIEST_SECONDS = Date.UTC(2005, 0, 1) / 1000;
/**
 * 북마크 추가 날짜(ADD_DATE, 1970년부터의 초)를 순간 날짜(기기 지역 날짜 'YYYY-MM-DD')로 바꾼다.
 * 없거나 쓸 수 없는 값이면 오늘이다. dated는 북마크 날짜를 썼는지.
 */
export function bookmarkDate(addDate, now = new Date()) {
  const clock = now instanceof Date ? now : new Date(now);
  const today = localDateOnly(clock);
  const raw = String(addDate ?? '').trim();
  if (!/^\d{1,17}$/.test(raw)) return { date: today, dated: false };
  let seconds = Number(raw);
  if (seconds > 1e14) seconds /= 1e6;        // 백만분의 일 초로 적는 도구
  else if (seconds > 1e11) seconds /= 1e3;   // 천분의 일 초로 적는 도구
  if (seconds < EARLIEST_SECONDS || seconds > clock.getTime() / 1000 + 86400) return { date: today, dated: false };
  return { date: localDateOnly(new Date(seconds * 1000)), dated: true };
}

export function folderLabel(folderPath) {
  const names = (Array.isArray(folderPath) ? folderPath : []).filter(Boolean);
  return names.length ? names.join(FOLDER_JOIN) : NO_FOLDER_LABEL;
}

/**
 * 북마크 목록에서 유튜브 영상만 고른다. 재생목록·채널 주소는 담지 않고 개수만 센다.
 * 같은 영상·같은 장면(#876 규칙: 영상 id와 구간이 같음)이 여러 번 나오면 처음 것만 남긴다.
 * 돌려주는 값: { videos: [{ id, url, videoId, title, folderPath, folder, date, dated }], playlistCount, channelCount, duplicateCount, bookmarkCount }
 */
export function collectBookmarkVideos(entries, { now = new Date() } = {}) {
  const videos = [];
  const byVideo = new Map();
  let playlistCount = 0, channelCount = 0, duplicateCount = 0;
  const list = Array.isArray(entries) ? entries : [];
  for (const entry of list) {
    const found = classifyBookmarkUrl(entry?.href);
    if (found.kind === 'playlist') { playlistCount += 1; continue; }
    if (found.kind === 'channel') { channelCount += 1; continue; }
    if (found.kind !== 'video') continue;
    const same = byVideo.get(found.videoId) || [];
    if (same.some((video) => isSameVideoMoment({ url: video.url }, found.url))) { duplicateCount += 1; continue; }
    const folderPath = (Array.isArray(entry.folderPath) ? entry.folderPath : []).filter(Boolean);
    const video = {
      id: `b${videos.length}`,
      url: found.url,
      videoId: found.videoId,
      title: cleanBookmarkTitle(entry.title),
      folderPath,
      folder: folderLabel(folderPath),
      ...bookmarkDate(entry.addDate, now),
    };
    videos.push(video);
    same.push(video);
    byVideo.set(found.videoId, same);
  }
  return { videos, playlistCount, channelCount, duplicateCount, bookmarkCount: list.length };
}

/**
 * 파일 글자 → 유튜브 영상 목록. 북마크 파일이 아니거나 영상이 없으면 ok:false와 까닭을 돌려준다.
 */
export function readBookmarkVideos(text, options = {}) {
  if (!isBookmarkFile(text)) return { ok: false, reason: READ_NOT_BOOKMARK, videos: [], playlistCount: 0, channelCount: 0, duplicateCount: 0, bookmarkCount: 0, truncated: false };
  const parsed = parseBookmarkHtml(text);
  const collected = collectBookmarkVideos(parsed.entries, options);
  if (!collected.videos.length) return { ok: false, reason: READ_NO_VIDEO, ...collected, truncated: parsed.truncated };
  return { ok: true, reason: '', ...collected, truncated: parsed.truncated };
}

/** 폴더별 묶음 — 파일에서 처음 나온 순서를 지킨다. [{ key, label, videos }] */
export function folderGroups(videos) {
  const groups = new Map();
  for (const video of Array.isArray(videos) ? videos : []) {
    const key = (video.folderPath || []).join('\u001f');
    if (!groups.has(key)) groups.set(key, { key, label: video.folder || folderLabel(video.folderPath), videos: [] });
    groups.get(key).videos.push(video);
  }
  return [...groups.values()];
}

/** 찾은 것 한 줄 요약(화면 안내). 개인 북마크 내용은 넣지 않고 개수만 말한다. */
export function foundSummaryText({ videos = [], playlistCount = 0, channelCount = 0, duplicateCount = 0 } = {}) {
  const parts = [`유튜브 영상 ${videos.length}개를 찾았어요.`];
  const skipped = [];
  if (playlistCount) skipped.push(`재생목록 ${playlistCount}개`);
  if (channelCount) skipped.push(`채널 ${channelCount}개`);
  if (skipped.length) parts.push(`${skipped.join('·')}는 이번에는 담지 않아요.`);
  if (duplicateCount) parts.push(`같은 영상 ${duplicateCount}개는 하나로 모았어요.`);
  return parts.join(' ');
}

// ---- 3단계: 미리보기 목록의 계산(이미 담은 영상·고르기·제목 줄) ----

/**
 * 이미 담은 영상 찾기: 내 트리 어디에든 같은 영상·같은 장면(#876 판정 한 벌)이 있으면 그 트리 이름을 돌려준다.
 * 돌려주는 값: Map(영상 이름표 → 트리 이름). 구간이 다른 같은 영상은 다른 장면이라 '이미 있음'이 아니다.
 */
export function existingVideoTrees(videos, trees, nameOf = (tree) => String(tree?.title || tree?.subject || '')) {
  const index = new Map();
  for (const tree of Array.isArray(trees) ? trees : []) {
    for (const moment of tree?.moments || []) {
      const key = youtubeIdFrom(moment?.url);
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ moment, tree });
    }
  }
  const found = new Map();
  for (const video of Array.isArray(videos) ? videos : []) {
    const hit = (index.get(video.videoId) || []).find(({ moment }) => isSameVideoMoment(moment, video.url));
    if (hit) found.set(video.id, nameOf(hit.tree));
  }
  return found;
}

/** 처음 고름: 이미 담은 영상은 빼고, 파일 순서대로 max개까지. */
export function defaultPicked(videos, existing, max = Infinity) {
  const picked = [];
  for (const video of Array.isArray(videos) ? videos : []) {
    if (existing.has(video.id)) continue;
    if (picked.length >= max) break;
    picked.push(video.id);
  }
  return picked;
}

/**
 * 묶음(전체·폴더) 고르기 칸의 모양. 새 영상(이미 있음이 아닌 것)을 기준으로 본다:
 * 모두 골랐으면 checked, 일부만이거나 이미 있음만 손으로 골랐으면 mixed, 새 영상이 없으면 empty.
 */
export function scopeState(videos, existing, picked) {
  let total = 0, on = 0, extra = 0;
  for (const video of Array.isArray(videos) ? videos : []) {
    const chosen = picked.has(video.id);
    if (existing.has(video.id)) { if (chosen) extra += 1; continue; }
    total += 1;
    if (chosen) on += 1;
  }
  return { total, on, checked: total > 0 && on === total, mixed: (on > 0 && on < total) || (on === 0 && extra > 0), empty: total === 0 };
}

/**
 * 묶음 고르기: 켜면 그 묶음의 새 영상을 max개가 찰 때까지 차례로 고르고(못 고른 수는 clipped),
 * 끄면 그 묶음에서 고른 것을 모두 푼다(손으로 고른 이미 있음까지).
 */
export function pickScope(videos, existing, picked, on, max = Infinity) {
  const next = new Set(picked);
  let clipped = 0;
  for (const video of Array.isArray(videos) ? videos : []) {
    if (!on) { next.delete(video.id); continue; }
    if (existing.has(video.id) || next.has(video.id)) continue;
    if (next.size >= max) { clipped += 1; continue; }
    next.add(video.id);
  }
  return { picked: next, clipped };
}

/** 하나 고르기: 상한이 찼으면 더 고르지 않는다(refused). 풀기는 언제나 된다. */
export function pickOne(picked, id, on, max = Infinity) {
  const next = new Set(picked);
  if (!on) { next.delete(id); return { picked: next, refused: false }; }
  if (next.has(id)) return { picked: next, refused: false };
  if (next.size >= max) return { picked: next, refused: true };
  next.add(id);
  return { picked: next, refused: false };
}

/**
 * 영상 제목을 차례로 받는 줄. 조회는 기존 경로(video-title.mjs → 서버 oEmbed 프록시)를 그대로 받아 쓴다(fetchTitle).
 * 한꺼번에 몰아 부르지 않는다 — 한 번에 하나씩, 사이를 gapMs만큼 띄우고, 이 줄이 부르는 횟수는 limit까지다.
 * 받은 제목은 기억해 같은 영상을 다시 부르지 않는다(받지 못한 것도 '' 로 기억한다).
 */
export function createTitleQueue({ fetchTitle, limit = 200, gapMs = 0, onTitle = () => {}, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const known = new Map();
  const waiting = [];
  const queued = new Set();
  let asked = 0, running = false, stopped = false;
  async function run() {
    if (running) return;
    running = true;
    while (!stopped && waiting.length && asked < limit) {
      const id = waiting.shift();
      queued.delete(id);
      if (known.has(id)) continue;
      asked += 1;
      let title = '';
      try { title = String((await fetchTitle(id)) || '').trim(); } catch { title = ''; }
      known.set(id, title);
      onTitle(id, title);
      if (gapMs > 0 && waiting.length && !stopped && asked < limit) await wait(gapMs);
    }
    running = false;
  }
  return {
    /** 받을 영상 id들을 줄 뒤에 세운다(이미 알거나 줄에 있으면 건너뜀). */
    add(ids) {
      for (const id of Array.isArray(ids) ? ids : []) {
        if (!id || known.has(id) || queued.has(id)) continue;
        queued.add(id);
        waiting.push(id);
      }
      stopped = false;
      return run();
    },
    /** 줄을 비우고 멈춘다(창을 닫을 때). 지금 받고 있는 하나는 끝까지 받는다. */
    stop() { stopped = true; waiting.length = 0; queued.clear(); },
    /** 저장 쪽이 직접 받은 제목도 여기 적어 둔다 — 같은 영상을 두 번 묻지 않게. */
    remember(id, title) { if (id) known.set(id, String(title || '').trim()); },
    title: (id) => known.get(id) || '',
    has: (id) => known.has(id),
    asked: () => asked,
    /** 상한까지 다 불렀는가 — 더는 제목이 오지 않는다. */
    exhausted: () => asked >= limit,
    waiting: () => waiting.length,
    idle: () => !running,
  };
}

/** 고른 수 안내. */
export function pickedCountText(count) {
  return count > 0 ? `${count}개 고름` : '고른 영상이 없어요';
}
