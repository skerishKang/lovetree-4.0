// #547: '오늘' 날짜는 기기의 지역 날짜로 만든다(UTC 날짜였을 때 새벽 순간이 하루 전으로 찍혔다).
import { localDateOnly } from './local-date.mjs';
import { isAutoTitle, autoTitleFor } from './auto-title.mjs';
import { DEFAULT_TREE_OPEN_VIEW, normalizeTreeOpenView } from './tree-open-view.mjs';

// #792: 순간 구간의 순수 계산(서버 사본 src/moment-range.js와 같은 규칙 — tests/moment-range-792.test.mjs가 대조).
export const MAX_RANGE_SECONDS = 12 * 60 * 60;

export function parseTimecode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let seconds;
  if (/^\d+$/.test(raw)) {
    seconds = Number(raw);
  } else if (/^\d+m(?:\d+s?)?$/.test(raw)) {
    // #1316: 주소의 t=1m35s처럼 분·초를 붙여 쓴 값도 같은 해석 함수에서 초로 바꾼다.
    const parts = raw.match(/^(\d+)m(?:(\d+)s?)?$/);
    const minute = Number(parts[1]), second = Number(parts[2] || 0);
    if (second >= 60) return null;
    seconds = minute * 60 + second;
  } else {
    const parts = raw.split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d{1,2}$/.test(part))) return null;
    const nums = parts.map(Number);
    if (parts.length === 2) {
      if (nums[1] >= 60) return null;
      seconds = nums[0] * 60 + nums[1];
    } else {
      if (nums[1] >= 60 || nums[2] >= 60) return null;
      seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
    }
  }
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > MAX_RANGE_SECONDS) return null;
  return seconds;
}

/** 주소의 t=·start=(물음표·해시)에서 시작 초를 읽는다. src/media.js의 startFrom과 같은 자리. */
export function startFromUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  const hash = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
  for (const value of [parsed.searchParams.get('t'), parsed.searchParams.get('start'), hash.get('t'), hash.get('start')]) {
    if (value === null || value === '') continue;
    const seconds = parseTimecode(String(value).replace(/s$/, ''));
    if (seconds !== null) return seconds;
  }
  return null;
}

const hasValue = (value) => value !== undefined && value !== null && value !== '';

/** 불러오기용(관대): 틀린 값은 그 필드만 버린다. */
export function rangeFields(input = {}, url = input?.url || '') {
  const raw = input && typeof input === 'object' ? input : {};
  const hasStart = hasValue(raw.startSeconds);
  const hasEnd = hasValue(raw.endSeconds);
  if (!hasStart && !hasEnd) {
    const keyed = Object.prototype.hasOwnProperty.call(raw, 'startSeconds') || Object.prototype.hasOwnProperty.call(raw, 'endSeconds');
    if (!keyed) return {};
    const fromUrl = startFromUrl(url);
    return fromUrl === null ? {} : { startSeconds: fromUrl };
  }
  let start = hasStart ? parseTimecode(raw.startSeconds) : startFromUrl(url);
  const end = hasEnd ? parseTimecode(raw.endSeconds) : null;
  if (end !== null && start === null) start = 0;
  if (end !== null && start !== null && end <= start) return start === 0 ? {} : { startSeconds: start };
  if (start === null && end === null) return {};
  const out = {};
  if (start !== null) out.startSeconds = start;
  if (end !== null) out.endSeconds = end;
  return out;
}

/** 입력용(엄격): 형식이 틀리면 사용자 문구로 거부한다. 둘 다 없으면 빈 객체. */
export function validateRange(input = {}, url = input?.url || '') {
  const raw = input && typeof input === 'object' ? input : {};
  const hasStart = hasValue(raw.startSeconds);
  const hasEnd = hasValue(raw.endSeconds);
  if (!hasStart && !hasEnd) {
    const keyed = Object.prototype.hasOwnProperty.call(raw, 'startSeconds') || Object.prototype.hasOwnProperty.call(raw, 'endSeconds');
    if (!keyed) return {};
    const fromUrl = startFromUrl(url);
    if (fromUrl === null) return {};
    return { startSeconds: fromUrl };
  }
  if (hasStart && parseTimecode(raw.startSeconds) === null) throw new Error('시작 시간은 01:30 또는 01:02:30 형식으로 적어 주세요.');
  let start = hasStart ? parseTimecode(raw.startSeconds) : startFromUrl(url);
  const end = hasEnd ? parseTimecode(raw.endSeconds) : null;
  if (hasEnd) {
    const lower = start === null ? 0 : start;
    if (end === null || end <= lower) throw new Error('끝 시간은 시작 시간보다 뒤여야 해요.');
    if (start === null) start = 0;
  }
  const out = {};
  if (start !== null) out.startSeconds = start;
  if (hasEnd) out.endSeconds = end;
  return out;
}

function clock(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return '';
  const n = Number(seconds);
  if (!Number.isSafeInteger(n) || n < 0) return '';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 초를 입력 칸용 시간 표기(1:30·1:02:30)로 되돌린다. 없으면 빈 값. */
export function formatTimecode(seconds) {
  return clock(seconds);
}

/** 추가·고치기 창의 시작 칸 자동 채움: 이미 적은 값은 건드리지 않고, 주소의 t=만 읽어 채운다. */
export function fillStartFromUrl(url, currentValue) {
  if (String(currentValue ?? '').trim() !== '') return null;
  return startFromUrl(url);
}

/** 시작·끝을 '0:42–1:08'로, 끝이 없으면 '0:42부터'로 적는다. */
export function formatRange(start, end) {
  const from = clock(start);
  if (!from) return '';
  const to = Number.isSafeInteger(end) && end > start ? clock(end) : '';
  return to ? `${from}–${to}` : `${from}부터`;
}

/** 끝은 시작보다 클 때만 붙인다. */
export function youtubeRangeEmbedUrl(videoId, start, end) {
  const id = String(videoId ?? '').trim();
  const s = Number(start);
  if (!id || !Number.isSafeInteger(s) || s < 0) return '';
  const params = [`start=${s}`];
  if (Number.isSafeInteger(end) && end > s) params.push(`end=${end}`);
  params.push('rel=0');
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params.join('&')}`;
}

export const EMOTIONS = ['설렘', '위로', '벅참', '그리움', '고마움', '즐거움'];
// #256-3: 책(트리)마다 고르는 디자인 표지. 테마 표지 색(--lt-cover-N) 위의 질감 변형 6종.
// 값은 이 목록뿐이다. 모르는 값·타입은 저장 거부가 아니라 ''(기본 표지)로 되돌린다.
// src/domain.js(서버가 쓰는 같은 규칙)의 목록과 같은지 tests/v41-cover-design.test.mjs가 확인한다.
export const COVER_DESIGN_IDS = ['texture-1', 'texture-2', 'texture-3', 'texture-4', 'texture-5', 'texture-6'];
export function normalizeCoverDesign(value) {
  return COVER_DESIGN_IDS.includes(value) ? value : '';
}
// #380 5번: 표지를 정하는 방법은 하나만 고른다 — 첫 순간(기본) / 순간에서 / 디자인 / 사진.
// 고른 방법 하나만 표지가 되고, 고르지 않은 방법의 저장값(사진 표지 순간·디자인)은 지우지 않고 그대로 둔다
// (되돌리면 그대로 다시 보인다). ''는 옛 저장본이라 아래 coverModeOf가 지금 규칙으로 읽는다.
// src/domain.js(서버가 쓰는 같은 규칙)의 목록과 같은지 tests/v41-cover-method.test.mjs가 확인한다.
export const COVER_MODES = ['basic', 'moment', 'design', 'photo'];
export function normalizeCoverMode(value) {
  return COVER_MODES.includes(value) ? value : '';
}
// 표지 방법 판정 한 곳: 저장된 방법이 있으면 그것, 없으면 지금 규칙(사진 표지 > 디자인 표지 > 기본 표지).
// 책장(shelf-model coverChoice)·책 제목 ▾·마지막 장·트리 관리 창이 모두 이 함수를 쓴다.
export function coverModeOf(tree) {
  const explicit = normalizeCoverMode(tree?.coverMode);
  if (explicit) return explicit;
  const cover = (tree?.moments || []).find(moment => moment.id === tree?.coverMomentId);
  if (cover && cover.type === 'photo' && cover.image) return 'moment';
  if (normalizeCoverDesign(tree?.coverDesign)) return 'design';
  return tree?.coverMomentId ? 'moment' : 'basic';
}
export const MAX_MOMENTS = 300;
export const MAX_TREES = 50;
export const MAX_LINKS = 20;
// #327(① 데이터 규칙): 빠른 추가가 순간을 모아 두는 기본 트리. 트리 이름·대상 기본값이다.
// src/domain.js(서버가 쓰는 같은 규칙)의 상수와 같은지 tests/v41-inbox-data.test.mjs가 확인한다.
export const INBOX_SUBJECT = '모아둔 순간';
export const TITLE_DISPLAYS = ['both', 'mine', 'video'];
export const DEFAULT_TITLE_DISPLAY = 'both';
// #1094: 서재에서 책을 누를 때 여는 보기 — book(책으로)·list(목록으로). 모르는 값은 기본 '책'. 상태(state.prefs)에 저장한다.
export const BOOK_DISPLAYS = ['book', 'list'];
export const DEFAULT_BOOK_DISPLAY = 'book';
// #1093: 서재 진열 방식 — shelf(선반, 기본)·carousel(회전). 상태(state.prefs)에 저장한다.
export const SHELF_VIEWS = ['shelf', 'carousel'];
export const DEFAULT_SHELF_VIEW = 'carousel';
// #368 2차: 프로필(표시 이름·동그라미 색). 계정 기록의 설정 칸(state.prefs)에 함께 저장한다(#371).
// 표시 이름은 공백을 한 칸으로 모으고 20자(문자 단위)까지만 남긴다. 값이 없으면 ''라 이전 저장본도 그대로 읽힌다.
// src/domain.js(서버가 쓰는 같은 규칙)와 값이 같은지 tests/v41-title-prefs.test.mjs가 확인한다.
export const MAX_DISPLAY_NAME = 20;
// 동그라미 색 팔레트 — 밤(어두운 무대)·정원(밝은 종이) 모두에서 잘 보이는 가운데 톤 7색. ''는 기본색이다.
export const ACCENT_COLORS = ['', 'rose', 'gold', 'green', 'blue', 'purple', 'orange', 'teal'];
export function normalizeDisplayName(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return Array.from(trimmed).slice(0, MAX_DISPLAY_NAME).join('');
}
export function normalizeAccentColor(value) {
  return ACCENT_COLORS.includes(value) ? value : '';
}
// #368 3차: 화면·시작·공유 기본값. 모르는 값은 기본으로, 값이 없으면(옛 저장본) 지금 동작 그대로다.
//  - dateStyle: 순간 날짜 표기 — 'dot'(2026. 11. 10, 지금 기본)·'dash'(2026-11-10)·'long'(11월 10일)
//  - startPlace: 로그인 후 처음 보여 줄 곳 — 'home'(첫 화면)·'shelf'(내 트리 전체 보기)·'resume'(이어 읽기, 지금 동작)
//  - shareView: 공유 링크가 처음에 열 보기 — 'book'(기억책, 지금 기본)·'board'·'network'
//  - shareDiscover: 새 공유를 둘러보기에도 올릴지 기본값 — false(꺼짐, 지금 기본)
export const DATE_STYLES = ['dot', 'dash', 'long'];
export const DEFAULT_DATE_STYLE = 'dot';
export const START_PLACES = ['home', 'shelf', 'resume'];
export const DEFAULT_START_PLACE = 'resume';
export const SHARE_VIEWS = ['book', 'board', 'network'];
export const DEFAULT_SHARE_VIEW = 'book';
export function normalizeDateStyle(value) {
  return DATE_STYLES.includes(value) ? value : DEFAULT_DATE_STYLE;
}
export function normalizeStartPlace(value) {
  return START_PLACES.includes(value) ? value : DEFAULT_START_PLACE;
}
export function normalizeShareView(value) {
  return SHARE_VIEWS.includes(value) ? value : DEFAULT_SHARE_VIEW;
}
export function normalizeShareDiscover(value) {
  return value === true;
}
// 첫 화면 카드 모드(261116 PR 2): 마지막·고정·그날·무작위·트리. 모르는 값은 기본 '마지막'.
// 고정·트리가 걸 때 쓰는 id는 지우고 남은 순간이어도 화면이 마지막으로 돌아오므로(home-card-mode homeMomentPick)
// 여기서는 형식(문자열 80자)만 맞춘다. 서버(src/domain.js)와 같은 한 벌을 유지한다.
export const HOME_MOMENT_MODES = ['last', 'pin', 'day', 'random', 'tree'];
export function normalizeHomeMoment(value) {
  const mode = HOME_MOMENT_MODES.includes(value?.mode) ? value.mode : 'last';
  const id = text => (typeof text === 'string' ? text.trim().slice(0, 80) : '');
  return {mode, treeId: id(value?.treeId), momentId: id(value?.momentId)};
}
// 제목 보기 설정(#347 후속): 모르는 값은 기본 '둘 다'. 상태(state.prefs)에 저장한다.
export function normalizeTitleDisplay(value) {
  return TITLE_DISPLAYS.includes(value) ? value : DEFAULT_TITLE_DISPLAY;
}
export function normalizeBookDisplay(value) {
  return BOOK_DISPLAYS.includes(value) ? value : DEFAULT_BOOK_DISPLAY;
}
export function normalizeShelfView(value) {
  return SHELF_VIEWS.includes(value) ? value : DEFAULT_SHELF_VIEW;
}
// 순간 목록의 트리 칩 순서(2026-11-17, 대표 결정): 계정 설정 칸(state.prefs)에 트리 id 순서로 저장한다.
// 문자열만 남기고('전체'='all'은 칩 고정이라 저장하지 않는다) 중복을 지우며, 너무 긴 목록은 64개에서 끊는다.
export function normalizeTreeChipOrder(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of list) {
    const id = String(item ?? '').trim();
    if (!id || id === 'all' || out.includes(id)) continue;
    out.push(id);
    if (out.length >= 64) break;
  }
  return out;
}
export function normalizePrefs(value) {
  return {
    titleDisplay: normalizeTitleDisplay(value?.titleDisplay),
    displayName: normalizeDisplayName(value?.displayName),
    accentColor: normalizeAccentColor(value?.accentColor),
    dateStyle: normalizeDateStyle(value?.dateStyle),
    startPlace: normalizeStartPlace(value?.startPlace),
    shareView: normalizeShareView(value?.shareView),
    shareDiscover: normalizeShareDiscover(value?.shareDiscover),
    treeChipOrder: normalizeTreeChipOrder(value?.treeChipOrder),
    bookDisplay: normalizeBookDisplay(value?.bookDisplay), shelfView: normalizeShelfView(value?.shelfView), homeMoment: normalizeHomeMoment(value?.homeMoment)

  };
}
export function updatePrefs(state, patch = {}) {
  return { ...state, version: 1, prefs: normalizePrefs({ ...(state?.prefs || {}), ...(patch || {}) }) };
}
export const EMPTY_STATE = () => ({ version: 1, trees: [], prefs: normalizePrefs() });

export function newId(provider = globalThis.crypto) {
  if (typeof provider?.randomUUID === 'function') return provider.randomUUID();
  // getRandomValues is also available on local HTTP preview origins.
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function requireText(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}을(를) 1~${max}자로 적어 주세요.`);
  return value.trim();
}
function optionalText(value, name, max) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name}을(를) 1~${max}자로 적어 주세요.`);
  return value.trim();
}
// #1038: 세로 판정값(선택) — 없는 값은 '모름'으로 두고, 있으면 형식만 엄격히 지킨다.
// src/domain.js와 같은 규칙이다(서버·화면 왕복에서 값이 지워지지 않게).
function normalizeVerticalMedia(value) {
  const out = {};
  if (value.vertical !== undefined && value.vertical !== null) {
    if (typeof value.vertical !== 'boolean') throw new Error('미디어 세로 값은 참이나 거짓이어야 해요.');
    out.vertical = value.vertical;
  }
  for (const key of ['width', 'height']) {
    const number = value[key];
    if (number === undefined || number === null) continue;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 100000) throw new Error('미디어 가로세로 크기는 0 이상의 숫자여야 해요.');
    out[key] = number;
  }
  return out;
}
function normalizeMediaMetadata(value, url) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('미디어 정보를 확인해 주세요.');
  const title = optionalText(value.title, '미디어 제목', 240);
  const channel = optionalText(value.channel, '미디어 채널', 160);
  // 저장은 주소의 공개 가능 여부를 판단하지 않는다. 공개 응답에서만 거른다.
  const images = {};
  for (const key of ['thumbnail', 'thumbnailUrl', 'poster', 'image', 'authorName']) {
    if (typeof value[key] === 'string' && value[key].length <= 2048 && value[key]) images[key] = value[key];
  }
  const vertical = normalizeVerticalMedia(value);
  if (!title && !channel && !Object.keys(images).length && !Object.keys(vertical).length) return null;
  const source = url ? new URL(url).hostname : '';
  if (!source) return null;
  return {title, channel, source, ...vertical, ...images};
}
function shortened(value, max = 40) {
  const text = Array.from(value.replace(/\s+/g, ' ').trim()).join('');
  if (text.length <= max) return text;
  // '…' 포함 max 자를 넘지 않게 한다: '…' 자리(1자)를 비우고 채운다.
  // 저장 검사가 UTF-16 길이(.length)를 쓰므로 이모지(서로게이트 쌍)도 안 나뉘고 max 자를 넘지 않게 자른다.
  let out = '';
  let size = 0;
  for (const ch of text) {
    if (size + ch.length > max - 1) break;
    out += ch;
    size += ch.length;
  }
  return `${out}…`;
}
export function safeUrl(value = '') {
  if (!value.trim()) return '';
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('https://로 시작하는 올바른 링크를 입력해 주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('http 또는 https 링크만 사용할 수 있어요.');
  if (url.href.length > 2048) throw new Error('링크가 너무 길어요.');
  return url.href;
}
export function suggestMomentTitle({ title = '', note = '', url = '', mediaMetadata = null } = {}) {
  const explicit = optionalText(title, '순간 제목', 80);
  if (explicit) return explicit;
  // #344(2026-11-10 대표 요청): 미리보기 때 서버 oEmbed 프록시가 받아 둔 영상 제목을 자동 제목으로 쓴다(80자 자르기).
  // 우선순위: 사용자 입력 > 영상 제목 > 마음 한마디 첫 줄 > 기존 도메인 규칙. oEmbed를 못 받으면(빈 값) 기존 규칙으로 물러난다.
  // src/domain.js(서버가 쓰는 같은 규칙)와 이 규칙이 같은지 tests/v41-video-title.test.mjs가 확인한다.
  const videoTitle = typeof mediaMetadata?.title === 'string' ? mediaMetadata.title.trim() : '';
  if (videoTitle) return shortened(videoTitle, 80);
  const memo = optionalText(note, '마음 한마디', 500);
  if (memo) return shortened(memo.split(/\r?\n/)[0] || memo);
  const normalized = safeUrl(url);
  if (!normalized) return '';
  const parsed = new URL(normalized);
  if (/\.(?:png|jpe?g|gif|webp)$/.test(parsed.pathname.toLowerCase())) return '사진으로 남긴 순간';
  if (/\.(?:mp4|webm)$/.test(parsed.pathname.toLowerCase())) return '영상으로 남긴 순간';
  return autoTitleFor(normalized);
}
export function normalizeEmotion(value) {
  if (EMOTIONS.includes(value)) return value;
  // 가져온 기록(리모네 등)의 감정을 설렘으로 바꾸지 않고 그대로 보존한다.
  const custom = typeof value === 'string' ? value.trim() : '';
  return custom && custom.length <= 12 && !/[\u0000-\u001f]/.test(custom) ? custom : '설렘';
}
export function validateMomentInput(input) {
  const note = optionalText(input.note, '마음 한마디', 500);
  const url = safeUrl(input.url || '');
  // #344: 영상 제목(mediaMetadata.title)을 자동 제목 후보로 함께 넘겨 판정하고, 저장값에도 그대로 남긴다.
  const mediaMetadata = normalizeMediaMetadata(input.mediaMetadata, url);
  const title = suggestMomentTitle({ title: input.title, note, url, mediaMetadata });
  if (!title) throw new Error('순간 제목, 마음 한마디, 링크나 첨부 중 하나는 남겨 주세요.');
  const emotion = normalizeEmotion(input.emotion);
  // #547: '오늘'은 사용자 기기의 지역 날짜다(UTC가 아니다) — 새벽에 남긴 순간이 하루 전으로 찍히던 자리.
  const date = input.date || localDateOnly();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('날짜를 확인해 주세요.');
  const relation = typeof input.relation === 'string' ? input.relation.trim() : '';
  if (relation.length > 100) throw new Error('연결 이유는 100자까지 적을 수 있어요.');
  // #792: 시작·끝 구간은 선택 값. 둘 다 없으면 키 자체를 넣지 않는다.
  const range = validateRange(input, url);
  const result = { title, note, emotion, date, relation, url, ...range };
  if (mediaMetadata) result.mediaMetadata = mediaMetadata;
  return result;
}
// 기억 보드 배치(선택): 카드 위치·회전·핀/카드 모양·색·키워드. 없거나 형식이 틀리면 그 항목만 버린다.
// 저장 계약을 넓히지 않도록 허용 목록·범위만 통과시키고 나머지 필드는 그대로 두지 않는다.
const BOARD_TOKEN = /^[a-z0-9_-]{1,24}$/i;
export function boardLayoutOf(m) {
  const out = {};
  const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (finite(m.x, -10000, 10000)) out.x = Math.round(m.x);
  if (finite(m.y, -10000, 10000)) out.y = Math.round(m.y);
  if (finite(m.rot, -360, 360)) out.rot = m.rot;
  if (typeof m.pinStyle === 'string' && BOARD_TOKEN.test(m.pinStyle)) out.pinStyle = m.pinStyle;
  if (typeof m.cardStyle === 'string' && BOARD_TOKEN.test(m.cardStyle)) out.cardStyle = m.cardStyle;
  if (typeof m.color === 'string' && BOARD_TOKEN.test(m.color)) out.color = m.color;
  if (Array.isArray(m.keywords)) {
    const keywords = [...new Set(m.keywords.filter(k => typeof k === 'string' && k.length > 0 && k.length <= 24 && !/[\u0000-\u001f]/.test(k)))].slice(0, 20);
    if (keywords.length) out.keywords = keywords;
  }
  return out;
}
export function createTree(input, clock = new Date().toISOString()) {
  const subject = requireText(input.subject, '좋아하는 대상', 60);
  const moment = { ...validateMomentInput(input), id: newId(), parentId: null, relation: '', links: [], createdAt: clock };
  // #212: 자동 접미사(", 나의 순간들")는 더 붙이지 않는다. 표시 단계 규칙은 tree-name.mjs.
  return { id: newId(), subject, title: subject, openView: normalizeTreeOpenView(input.openView), coverMomentId: '', coverDesign: '', inbox: false, createdAt: clock, updatedAt: clock, moments: [moment] };
}
export function editTree(tree, input, clock = new Date().toISOString()) {
  const title = requireText(input.title, '트리 이름', 100);
  const subject = requireText(input.subject, '좋아하는 대상', 60);
  const coverMomentId = input.coverMomentId === undefined || input.coverMomentId === null || input.coverMomentId === '' ? '' : input.coverMomentId;
  if (typeof coverMomentId !== 'string' || (coverMomentId && !tree.moments.some(moment => moment.id === coverMomentId))) throw new Error('이 트리에서 표지 순간을 선택해 주세요.');
  const coverDesign = normalizeCoverDesign(input.coverDesign);
  // #380 5번: 표지 방법(basic·moment·design·photo)은 따로 저장한다. 고른 방법 하나만 표지가 되고,
  // 고르지 않은 곳의 저장값은 지우지 않는다(되돌리면 그대로 다시 보인다).
  const coverMode = normalizeCoverMode(input.coverMode);
  const openView = normalizeTreeOpenView(input.openView === undefined ? tree.openView : input.openView);
  if (tree.openView === openView && tree.title === title && tree.subject === subject &&
      (tree.coverMomentId || '') === coverMomentId && (tree.coverDesign || '') === coverDesign &&
      (tree.coverMode || '') === coverMode) return tree;
  const next = { ...tree, title, subject, openView, coverMomentId, coverDesign, updatedAt: clock };
  // 방법을 고르지 않은 옛 저장본에는 빈 값을 새로 심지 않는다(모양을 그대로 둔다).
  if (coverMode) next.coverMode = coverMode; else delete next.coverMode;
  return next;
}
export function addMoment(tree, input, parentId, clock = new Date().toISOString()) {
  if (tree.moments.length >= MAX_MOMENTS) throw new Error(`한 트리에는 ${MAX_MOMENTS}개의 순간까지 담을 수 있어요.`);
  const empty = tree.moments.length === 0;
  if (!empty && !tree.moments.some(m => m.id === parentId)) throw new Error('이어질 순간을 먼저 선택해 주세요.');
  const moment = { ...validateMomentInput(input), id: newId(), parentId: empty ? null : parentId, links: [], createdAt: clock };
  return { ...tree, updatedAt: clock, moments: [...tree.moments, moment] };
}
export function editMoment(tree, id, input, clock = new Date().toISOString()) {
  const current = tree.moments.find(m => m.id === id);
  if (!current) throw new Error('이 순간을 찾을 수 없어요.');
  const next = validateMomentInput(input);
  return { ...tree, updatedAt: clock, moments: tree.moments.map(m => {
    if (m.id !== id) return m;
    const edited = {...m, ...next, relation: m.parentId ? next.relation : ''};
    for (const key of ['pinStyle', 'cardStyle']) {
      if (!Object.hasOwn(input, key)) continue;
      if (input[key] === '') delete edited[key];
      else if (boardLayoutOf(input)[key]) edited[key] = boardLayoutOf(input)[key];
    }
    if (next.url !== m.url && !next.mediaMetadata) delete edited.mediaMetadata;
    return edited;
  }) };
}
export function cacheMomentMediaMetadata(tree, id, url, metadata, clock = new Date().toISOString()) {
  const current = tree.moments.find(m => m.id === id);
  if (!current || !url || current.url !== safeUrl(url)) return tree;
  const refreshed = normalizeMediaMetadata(metadata, current.url);
  // 같은 주소의 영상 정보를 다시 받더라도 응답에 없는 기존 정보는 지우지 않는다.
  const mediaMetadata = refreshed ? { ...current.mediaMetadata, ...refreshed } : null;
  if (mediaMetadata && current.mediaMetadata) {
    for (const key of ['title', 'channel']) {
      if (!refreshed[key] && typeof current.mediaMetadata[key] === 'string') mediaMetadata[key] = current.mediaMetadata[key];
    }
  }
  const metadataChanged = !!mediaMetadata && JSON.stringify(current.mediaMetadata || null) !== JSON.stringify(mediaMetadata);
  // #678 후속(둘러보기 트리 재발, 2026-11-15): 늦게 도착한 영상 제목은 mediaMetadata뿐 아니라 자동 제목
  // ('<도메인>에서 간직한 순간' — suggestMomentTitle의 기본 문구)까지 바로잡는다. 고객이 직접 적은
  // 제목은 절대 건드리지 않는다(자동 제목 판정은 auto-title.mjs의 isAutoTitle — 규칙 한 벌).
  const videoTitle = typeof mediaMetadata?.title === 'string' ? mediaMetadata.title.trim() : '';
  const titleFix = videoTitle && isAutoTitle(String(current.title || '').trim()) ? shortened(videoTitle, 80) : null;
  if (!metadataChanged && !titleFix) return tree;
  return {...tree, updatedAt:clock, moments:tree.moments.map(m => m.id === id ? {...m, mediaMetadata: metadataChanged ? mediaMetadata : m.mediaMetadata, ...(titleFix ? {title: titleFix} : {})} : m)};
}
export function parentCandidates(tree, id) {
  if (!tree.moments.some(m => m.id === id)) return [];
  const blocked = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const moment of tree.moments) {
      if (moment.parentId && blocked.has(moment.parentId) && !blocked.has(moment.id)) {
        blocked.add(moment.id);
        changed = true;
      }
    }
  }
  return tree.moments.filter(m => !blocked.has(m.id));
}
export function reparentMoment(tree, id, parentId, relation = '', clock = new Date().toISOString()) {
  const current = tree.moments.find(m => m.id === id);
  if (!current) throw new Error('이 순간을 찾을 수 없어요.');
  if (current.parentId === null) throw new Error('트리의 시작 순간은 이전 순간을 바꿀 수 없어요.');
  if (!tree.moments.some(m => m.id === parentId)) throw new Error('같은 트리에서 새 이전 순간을 선택해 주세요.');
  if (!parentCandidates(tree, id).some(m => m.id === parentId)) throw new Error('자기 자신이나 이어진 다음 순간은 이전 순간으로 정할 수 없어요.');
  const nextRelation = optionalText(relation, '연결 이유', 100);
  if (current.parentId === parentId && current.relation === nextRelation) return tree;
  return {
    ...tree,
    updatedAt: clock,
    moments: tree.moments.map(m => m.id === id ? { ...m, parentId, relation: nextRelation } : m)
  };
}
export function removeMoment(tree, id, clock = new Date().toISOString()) {
  const target = tree.moments.find(m => m.id === id);
  if (!target) throw new Error('이 순간을 찾을 수 없어요.');
  if (tree.moments.length === 1) throw new Error('마지막 순간이에요. 트리 전체를 지우려면 내 트리에서 삭제해 주세요.');
  let parentId = target.parentId;
  // A deleted moment must not leave a dangling related link behind.
  const remaining = tree.moments.filter(m => m.id !== id).map(m => m.links?.includes(id) ? { ...m, links: m.links.filter(link => link !== id) } : m);
  if (parentId === null) {
    const successor = remaining.find(m => m.parentId === id);
    if (!successor) throw new Error('순간 연결을 확인해 주세요.');
    parentId = successor.id;
    return { ...tree, coverMomentId: tree.coverMomentId === id ? '' : tree.coverMomentId || '', updatedAt: clock, moments: remaining.map(m => m.id === successor.id ? { ...m, parentId: null, relation: '' } : m.parentId === id ? { ...m, parentId, relation: '' } : m) };
  }
  return { ...tree, coverMomentId: tree.coverMomentId === id ? '' : tree.coverMomentId || '', updatedAt: clock, moments: remaining.map(m => m.parentId === id ? { ...m, parentId, relation: '' } : m) };
}

export function undoMomentDelete(tree, record, clock = new Date().toISOString()) {
  if (!record || record.treeId !== tree.id || !record.before || !record.after || organizePrint(tree) !== organizePrint(record.after)) {
    throw new Error('되돌릴 작업을 찾을 수 없어요.');
  }
  return { ...structuredClone(record.before), id: tree.id, updatedAt: clock };
}

// #327(① 데이터 규칙): 옮겨진 순간들을 한 트리에서 떼어 낸다. 남은 순간은 옮겨진 조상 중
// 가장 가까운 남은 조상 아래로 다시 붙는다(한 개를 옮길 때는 '옮긴 순간의 부모에게 다시 붙는다'와
// 같은 결과다). 남은 조상이 하나도 없으면 남은 순간 중 가장 먼저 만든 것을 새 시작 순간으로 올리고
// 나머지를 그 아래로 붙인다. 옮긴 순간을 가리키던 링크도 남은 순간에서 지운다. 연결 이유는
// 붙는 부모가 바뀐 순간만 ''로 되돌린다. src/domain.js의 같은 함수와 한 벌로 유지한다.
function detachMoments(tree, movedIds) {
  const byId = new Map(tree.moments.map(m => [m.id, m]));
  const remaining = tree.moments.filter(m => !movedIds.has(m.id));
  const oldest = [...remaining].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null;
  return remaining.map(m => {
    const next = { ...m, links: linksOf(m).filter(link => !movedIds.has(link)) };
    let keeper = next.parentId;
    const seen = new Set();
    while (keeper && movedIds.has(keeper)) {
      if (seen.has(keeper)) break;
      seen.add(keeper);
      keeper = byId.get(keeper)?.parentId ?? null;
    }
    if (keeper && byId.has(keeper)) { if (next.parentId !== keeper) { next.parentId = keeper; next.relation = ''; } }
    else if (oldest && next.id !== oldest.id) { next.parentId = oldest.id; next.relation = ''; }
    else { next.parentId = null; next.relation = ''; }
    return next;
  });
}

// #327(① 데이터 규칙): 빠른 추가 — 주소 하나만으로 순간을 바로 저장한다. inbox 트리가 없으면
// 만들고 그 순간이 시작 순간이 되고, 있으면 시작 순간 아래에 붙인다. 제목·감정은 기존 자동
// 규칙(suggestMomentTitle·기본 감정)을 쓴다. 트리·순간 한도를 넘으면 기존 문구로 막는다.
// '가' 결정(2026-11-15, 지도 #601): 사용자가 이전 순간을 고르지 않으면 새 순간은 첫 순간이 아니라
// 가장 최근 순간 다음에 이어진다. 가장 최근 = 날짜가 가장 늦은 순간, 같은 날짜면 만든 순서(createdAt)
// 가 가장 늦은 순간. 순간이 하나뿐이면 그 순간(첫 순간)이 나온다. 이미 저장된 연결은 바꾸지 않는다.
export function latestMomentId(tree) {
  let best = null;
  for (const m of tree?.moments || []) {
    if (!best) { best = m; continue; }
    const byDate = String(m.date || '').localeCompare(String(best.date || ''));
    if (byDate > 0 || (byDate === 0 && String(m.createdAt || '') > String(best.createdAt || ''))) best = m;
  }
  return best?.id || '';
}

export function quickAdd(state, input, clock = new Date().toISOString()) {
  // #344: 빠른 추가도 미리보기 때 받은 영상 제목(mediaMetadata)을 저장에 함께 넘긴다.
  // #1316: 주소의 시작 초는 기존 자동 채움 함수로 읽어 일반 추가와 같은 규칙으로 저장한다.
  const url = input?.url || '';
  const fromUrl = fillStartFromUrl(url, '');
  const source = { url, mediaMetadata: input?.mediaMetadata, ...(fromUrl === null ? {} : { startSeconds: fromUrl }) };
  const moment = { ...validateMomentInput(source), id: newId(), parentId: null, relation: '', links: [], createdAt: clock };
  const trees = state.trees;
  // #638(고른 트리 우선, CTO 결정 2026-11-15): 지금 고른 트리(input.treeId)에 담는다. 예전(#327)에는
  // 빠른 추가를 일부러 '모아둔 순간'(inbox)에 담았지만, 트리를 고른 채 담으면 엉뚱한 첫 트리에 들어가는
  // 고장이므로 고른 트리를 우선한다. 트리가 0개면 지금처럼 기본 트리('모아둔 순간')를 만들고,
  // 고른 트리를 찾지 못하면(오래된 화면·지워진 트리) 기존 규칙(inbox)으로 물러난다.
  const chosen = trees.find(tree => tree.id === input?.treeId);
  if (chosen) {
    // 이슈 671: '그 순간 다음에 담기'(input.parentId)가 이 트리의 순간이면 그 순간 바로 다음에 잇는다.
    // 목적지가 없거나 못 찾으면(오래된 화면·지워진 순간) 기존 규칙대로 가장 최근 순간 다음에 담는다.
    const after = chosen.moments.length === 0 ? null : (chosen.moments.some(m => m.id === input?.parentId) ? input.parentId : (latestMomentId(chosen) || chosen.moments.find(m => m.parentId === null).id));
    const grown = addMoment(chosen, source, after, clock);
    return { state: { version: 1, trees: trees.map(tree => tree.id === chosen.id ? grown : tree), prefs: normalizePrefs(state.prefs) }, treeId: chosen.id, momentId: grown.moments.at(-1).id };
  }
  const inbox = trees.find(tree => tree.inbox === true);
  if (!inbox) {
    if (trees.length >= MAX_TREES) throw new Error(`트리는 ${MAX_TREES}개까지 만들 수 있어요.`);
    const tree = { id: newId(), subject: INBOX_SUBJECT, title: INBOX_SUBJECT, openView: DEFAULT_TREE_OPEN_VIEW, coverMomentId: '', coverDesign: '', inbox: true, createdAt: clock, updatedAt: clock, moments: [moment] };
    return { state: { version: 1, trees: [...trees, tree], prefs: normalizePrefs(state.prefs) }, treeId: tree.id, momentId: moment.id };
  }
  // '가' 결정: 빠른 추가는 이전 순간을 고를 길이 없으므로 가장 최근 순간 다음에 잇는다(첫 순간 하나뿐이면 첫 순간).
  const grown = addMoment(inbox, source, inbox.moments.length === 0 ? null : (latestMomentId(inbox) || inbox.moments.find(m => m.parentId === null).id), clock);
  return { state: { version: 1, trees: trees.map(tree => tree.id === inbox.id ? grown : tree), prefs: normalizePrefs(state.prefs) }, treeId: inbox.id, momentId: grown.moments.at(-1).id };
}

// #327(① 데이터 규칙): 순간 하나를 다른 트리로 옮긴다. 자식은 함께 가지 않고 원래 트리에
// 다시 붙는다(detachMoments). 옮긴 순간의 링크는 비우고, 표지로 쓰던 순간이면 표지를 해제하며,
// 원래 트리가 비면 그 트리를 지운다(inbox 트리도 같다 — 다음 빠른 추가 때 다시 생긴다).
// 같은 트리 안 이동은 기존 reparentMoment를 쓴다.
export function moveMoment(state, fromTreeId, momentId, toTreeId, parentId, clock = new Date().toISOString()) {
  if (fromTreeId === toTreeId) throw new Error('같은 트리 안에서는 옮길 수 없어요. 이전 순간 바꾸기를 사용해 주세요.');
  const from = state.trees.find(tree => tree.id === fromTreeId);
  const target = state.trees.find(tree => tree.id === toTreeId);
  if (!from || !target) throw new Error('트리를 찾을 수 없어요.');
  const moving = from.moments.find(m => m.id === momentId);
  if (!moving) throw new Error('이 순간을 찾을 수 없어요.');
  if (target.moments.length >= MAX_MOMENTS) throw new Error(`한 트리에는 ${MAX_MOMENTS}개의 순간까지 담을 수 있어요.`);
  let attachTo = parentId ?? null;
  if (!attachTo) attachTo = target.moments.find(m => m.parentId === null)?.id || null;
  if ((target.moments.length || attachTo) && !target.moments.some(m => m.id === attachTo)) throw new Error('옮겨 붙일 순간을 대상 트리에서 골라 주세요.');
  const moved = { ...moving, parentId: attachTo, relation: '', links: [] };
  const targetNext = { ...target, updatedAt: clock, moments: [...target.moments, moved] };
  const moments = detachMoments(from, new Set([momentId]));
  if (!moments.length) {
    return { state: { version: 1, trees: state.trees.filter(tree => tree.id !== fromTreeId).map(tree => tree.id === toTreeId ? targetNext : tree), prefs: normalizePrefs(state.prefs) }, treeId: toTreeId, momentId };
  }
  const fromNext = { ...from, coverMomentId: from.coverMomentId === momentId ? '' : from.coverMomentId || '', updatedAt: clock, moments };
  return { state: { version: 1, trees: state.trees.map(tree => tree.id === fromTreeId ? fromNext : tree.id === toTreeId ? targetNext : tree), prefs: normalizePrefs(state.prefs) }, treeId: toTreeId, momentId };
}

// #327(① 데이터 규칙): 고른 순간들로 새 트리(inbox=false)를 만든다. 고른 순서의 첫 순간이
// 시작 순간이 되고 나머지는 그 아래에 붙는다. 원래 트리 처리는 moveMoment와 같다. 이름(subject)은
// 기존 requireText 규칙으로 반드시 적게 한다.
export function treeFromMoments(state, fromTreeId, momentIds, options = {}, clock = new Date().toISOString()) {
  const from = state.trees.find(tree => tree.id === fromTreeId);
  if (!from) throw new Error('트리를 찾을 수 없어요.');
  const subject = requireText(options.subject, '좋아하는 대상', 60);
  const wanted = Array.isArray(momentIds) ? [...momentIds] : [];
  if (!wanted.length) throw new Error('옮길 순간을 먼저 골라 주세요.');
  if (new Set(wanted).size !== wanted.length) throw new Error('같은 순간을 두 번 골랐어요.');
  const movedIds = new Set(wanted);
  const moving = wanted.map(id => {
    const moment = from.moments.find(m => m.id === id);
    if (!moment) throw new Error('이 순간을 찾을 수 없어요.');
    return moment;
  });
  if (state.trees.length >= MAX_TREES) throw new Error(`트리는 ${MAX_TREES}개까지 만들 수 있어요.`);
  const root = { ...moving[0], parentId: null, relation: '', links: [] };
  const tree = { id: newId(), subject, title: `${subject}, 나의 순간들`, openView: DEFAULT_TREE_OPEN_VIEW, coverMomentId: '', coverDesign: '', inbox: false, createdAt: clock, updatedAt: clock, moments: [root, ...moving.slice(1).map(m => ({ ...m, parentId: root.id, relation: '', links: [] }))] };
  const moments = detachMoments(from, movedIds);
  if (!moments.length) return { state: { version: 1, trees: [...state.trees.filter(t => t.id !== fromTreeId), tree], prefs: normalizePrefs(state.prefs) }, treeId: tree.id };
  const fromNext = { ...from, coverMomentId: movedIds.has(from.coverMomentId) ? '' : from.coverMomentId || '', updatedAt: clock, moments };
  return { state: { version: 1, trees: [...state.trees.map(t => t.id === fromTreeId ? fromNext : t), tree], prefs: normalizePrefs(state.prefs) }, treeId: tree.id };
}

// #1439: 순간 정리 — 고른 순간을 다른 트리 하나로 옮기거나(move), 여러 트리에 복사한다(copy).
// 옮기기는 기존 moveMoment를 한 번씩 그대로 쓴다(자식·링크·표지·빈 트리 규칙 같음).
// 복사는 따로 노는 사본이다: 새 id를 만들고 제목·메모·감정·다음으로 간 이유(relation)·주소·구간·꼬리표는
// 그대로 둔다. 길 연결(parentId·links)은 원래 트리의 순간을 가리키므로 비우고, 대상 트리의 시작 순간
// 아래에 둔다 — 옮기기(moveMoment)가 붙이는 자리와 같고, 대상 트리의 이어진 길 중간에 끼워 넣지 않는다.
// 사본에는 원본 id(copiedFrom)를 남긴다. 사본을 다시 복사해도 처음 원본을 가리킨다(같은 순간 묶음 유지).
// skip = {트리 id: [순간 id…]} — '이미 있음'에서 건너뛰기를 고른 순간은 그 트리에만 넣지 않는다.
// record는 undoOrganize가 이 한 번을 통째로 되돌리는 데 쓴다(관련 트리의 전·후 모습).
export function organizeMoments(state, { mode = '', fromTreeId = '', momentIds = [], toTreeIds = [], skip = {}, newTreeName = '' } = {}, clock = new Date().toISOString(), makeId = newId) {
  if (mode !== 'move' && mode !== 'copy') throw new Error('지원하지 않는 작업이에요.');
  const from = state.trees.find(tree => tree.id === fromTreeId);
  if (!from) throw new Error('트리를 찾을 수 없어요.');
  const wanted = [...new Set(Array.isArray(momentIds) ? momentIds : [])];
  if (!wanted.length) throw new Error('옮길 순간을 먼저 골라 주세요.');
  const sources = wanted.map(id => {
    const moment = from.moments.find(m => m.id === id);
    if (!moment) throw new Error('이 순간을 찾을 수 없어요.');
    return moment;
  });
  // 새 트리와 담기를 한 번의 정리 작업으로 적용한다. 빈 트리는 저장하지 않는다.
  if (newTreeName) {
    const subject = requireText(newTreeName, '좋아하는 것', 60);
    const existing = [...new Set(Array.isArray(toTreeIds) ? toTreeIds : [])];
    if (mode === 'move' && existing.length) throw new Error('옮기기는 트리 하나만 고를 수 있어요.');
    if (state.trees.length >= MAX_TREES) throw new Error(`트리는 ${MAX_TREES}개까지 만들 수 있어요.`);
    const made = treeFromMoments(state, fromTreeId, wanted, { subject }, clock);
    let target = made.state.trees.find(t => t.id === made.treeId);
    if (mode === 'copy') {
      const ids = new Map(sources.map(m => [m.id, makeId()]));
      target = { ...target, moments: sources.map((m, i) => ({
        ...m, id: ids.get(m.id), parentId: i ? ids.get(sources[0].id) : null,
        relation: i ? m.relation : '', links: [], createdAt: clock, copiedFrom: m.copiedFrom || m.id
      })) };
    }
    if (existing.includes(fromTreeId)) throw new Error('같은 트리 안에서는 옮길 수 없어요. 이전 순간 바꾸기를 사용해 주세요.');
    for (const id of existing) if (!state.trees.some(tree => tree.id === id)) throw new Error('트리를 찾을 수 없어요.');
    const active = existing.filter(id => {
      const omitted = new Set(Array.isArray(skip?.[id]) ? skip[id] : []);
      return wanted.some(momentId => !omitted.has(momentId));
    });
    const extra = active.length ? organizeMoments(state, { mode, fromTreeId, momentIds: wanted, toTreeIds: active, skip }, clock, makeId) : null;
    const allSkipped = (existing.length - active.length) * wanted.length;
    const next = validateState(mode === 'move' ? made.state : { ...state, trees: [...(extra?.state.trees || state.trees), target] });
    const involved = [fromTreeId, ...existing, target.id];
    const before = involved.map(id => {
      const index = state.trees.findIndex(t => t.id === id);
      return { id, index, tree: index < 0 ? null : structuredClone(state.trees[index]) };
    });
    const after = involved.map(id => {
      const tree = next.trees.find(t => t.id === id);
      return { id, print: tree ? organizePrint(tree) : null };
    });
    const done = [...(extra?.record.done || []), ...target.moments.map((m, i) => ({ treeId: target.id, momentId: m.id, sourceId: sources[i].id }))];
    return { state: next, treeId: next.trees.some(t => t.id === fromTreeId) ? fromTreeId : target.id,
      record: { mode, fromTreeId, toTreeIds: [...existing, target.id], before, after, done, at: clock },
      summary: { moments: wanted.length, trees: new Set(done.map(d => d.treeId)).size, placed: done.length, skipped: allSkipped + (extra?.summary.skipped || 0) } };
  }
  const targets = [...new Set(Array.isArray(toTreeIds) ? toTreeIds : [])];
  if (!targets.length) throw new Error('넣을 트리를 골라 주세요.');
  if (mode === 'move' && targets.length !== 1) throw new Error('옮기기는 트리 하나만 고를 수 있어요.');
  if (targets.includes(fromTreeId)) throw new Error('같은 트리 안에서는 옮길 수 없어요. 이전 순간 바꾸기를 사용해 주세요.');
  for (const id of targets) if (!state.trees.some(tree => tree.id === id)) throw new Error('트리를 찾을 수 없어요.');
  const skipped = treeId => new Set(Array.isArray(skip?.[treeId]) ? skip[treeId] : []);
  const involved = [fromTreeId, ...targets];
  const before = involved.map(id => {
    const index = state.trees.findIndex(tree => tree.id === id);
    return { id, index, tree: structuredClone(state.trees[index]) };
  });
  const done = [];
  let skippedCount = 0;
  let next = state;
  if (mode === 'move') {
    const toTreeId = targets[0];
    const skipSet = skipped(toTreeId);
    for (const moment of sources) {
      if (skipSet.has(moment.id)) { skippedCount += 1; continue; }
      next = moveMoment(next, fromTreeId, moment.id, toTreeId, undefined, clock).state;
      done.push({ treeId: toTreeId, momentId: moment.id, sourceId: moment.id });
    }
  } else {
    let trees = state.trees;
    for (const toTreeId of targets) {
      const skipSet = skipped(toTreeId);
      const target = trees.find(tree => tree.id === toTreeId);
      let root = target.moments.find(m => m.parentId === null)?.id || null;
      if (target.moments.length && !root) throw new Error('넣을 트리의 시작 순간을 찾을 수 없어요.');
      const copies = [];
      for (const source of sources) {
        if (skipSet.has(source.id)) { skippedCount += 1; continue; }
        const copy = { ...source, id: makeId(), parentId: root, links: [], createdAt: clock, copiedFrom: source.copiedFrom || source.id };
        if (!root) { copy.relation = ''; root = copy.id; }
        copies.push(copy);
        done.push({ treeId: toTreeId, momentId: copy.id, sourceId: source.id });
      }
      if (!copies.length) continue;
      if (target.moments.length + copies.length > MAX_MOMENTS) throw new Error(`한 트리에는 ${MAX_MOMENTS}개의 순간까지 담을 수 있어요.`);
      trees = trees.map(tree => tree.id === toTreeId ? { ...tree, updatedAt: clock, moments: [...tree.moments, ...copies] } : tree);
    }
    next = { version: 1, trees, prefs: normalizePrefs(state.prefs) };
  }
  if (!done.length) throw new Error('넣을 순간이 없어요. 모두 건너뛰었어요.');
  const validated = validateState(next);
  const after = involved.map(id => {
    const tree = validated.trees.find(t => t.id === id);
    return { id, print: tree ? organizePrint(tree) : null };
  });
  const fromKept = validated.trees.some(tree => tree.id === fromTreeId);
  const record = { mode, fromTreeId, toTreeIds: targets, before, after, done, at: clock };
  return {
    state: validated,
    treeId: fromKept ? fromTreeId : targets[0],
    record,
    summary: { moments: new Set(done.map(item => item.sourceId)).size, trees: new Set(done.map(item => item.treeId)).size, placed: done.length, skipped: skippedCount }
  };
}

// 되돌리기 판정용 모양 문자열(키 순서와 무관). 저장 직후와 같은 모양이면 그사이 아무것도 바뀌지 않은 것이다.
function organizePrint(value) {
  if (Array.isArray(value)) return `[${value.map(organizePrint).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${organizePrint(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

// #1439: 옮기기·복사하기 한 번을 통째로 되돌린다.
// 그 뒤로 관련 트리가 그대로면(보통) 관련 트리를 그 전 모습으로 돌린다 — 옮긴 순간은 원래 트리의 원래 자리
// (원래 부모·연결·다음으로 간 이유·표지)로, 옮겨서 비어 지워졌던 트리는 원래 순서 자리에 다시 생긴다.
// 그사이 다른 저장으로 관련 트리가 바뀌었으면 그 바뀜은 지키고 이 작업으로 생긴 것만 거둔다
// (복사는 사본만 지우고, 옮기기는 원래 트리의 원래 부모 아래로 다시 옮긴다).
export function undoOrganize(state, record, clock = new Date().toISOString()) {
  if (!record || (record.mode !== 'move' && record.mode !== 'copy') || !Array.isArray(record.before) || !Array.isArray(record.after) || !Array.isArray(record.done)) throw new Error('되돌릴 작업을 찾을 수 없어요.');
  const untouched = record.after.every(({ id, print }) => {
    const now = state.trees.find(tree => tree.id === id);
    return print === null ? !now : !!now && organizePrint(now) === print;
  });
  let trees = state.trees.slice();
  // 새 트리나 빈 대상 트리에 담은 작업은 이후 수정이 있으면 통째로 되돌리지 않는다.
  // 기존 기록을 덮거나 새로 담은 순간을 잃지 않도록 한다.
  if (!untouched && record.before.some(item => item.tree === null || (record.toTreeIds.includes(item.id) && item.tree.moments.length === 0))) {
    throw new Error('정리한 뒤 트리가 바뀌었어요. 기록을 지키기 위해 되돌리지 않았어요.');
  }
  if (untouched) {
    for (const item of record.before.filter(item => item.tree === null)) {
      trees = trees.filter(t => t.id !== item.id);
    }
    for (const { id, index, tree } of record.before.filter(item => item.tree !== null).sort((a, b) => a.index - b.index)) {
      const at = trees.findIndex(t => t.id === id);
      if (at >= 0) trees[at] = structuredClone(tree);
      else trees.splice(Math.min(Math.max(index, 0), trees.length), 0, structuredClone(tree));
    }
  } else if (record.mode === 'copy') {
    for (const { treeId, momentId } of record.done) {
      const tree = trees.find(t => t.id === treeId);
      if (!tree || !tree.moments.some(m => m.id === momentId) || tree.moments.length < 2) continue;
      const shrunk = removeMoment(tree, momentId, clock);
      trees = trees.map(t => t.id === treeId ? shrunk : t);
    }
  } else {
    const fromBefore = record.before.find(item => item.id === record.fromTreeId);
    if (!trees.some(t => t.id === record.fromTreeId) && fromBefore) {
      // 옮겨서 비어 지워진 트리: 원래 모습으로 다시 세우고, 대상 트리에 남은 그 순간들은 거둔다.
      const moved = new Set(record.done.map(item => item.momentId));
      trees = trees.map(t => {
        if (!record.toTreeIds.includes(t.id)) return t;
        const remaining = t.moments.filter(m => !moved.has(m.id));
        return remaining.length && remaining.length !== t.moments.length ? { ...t, updatedAt: clock, moments: detachMoments(t, moved) } : t;
      });
      trees.splice(Math.min(Math.max(fromBefore.index, 0), trees.length), 0, structuredClone(fromBefore.tree));
    } else {
      let working = { version: 1, trees, prefs: normalizePrefs(state.prefs) };
      for (const { treeId, momentId } of record.done) {
        const holder = working.trees.find(t => t.id === treeId);
        const home = working.trees.find(t => t.id === record.fromTreeId);
        if (!holder || !home || !holder.moments.some(m => m.id === momentId)) continue;
        const originalParent = fromBefore?.tree.moments.find(m => m.id === momentId)?.parentId || undefined;
        const parentId = originalParent && home.moments.some(m => m.id === originalParent) ? originalParent : undefined;
        working = moveMoment(working, treeId, momentId, record.fromTreeId, parentId, clock).state;
      }
      trees = working.trees;
    }
  }
  const validated = validateState({ version: 1, trees, prefs: state.prefs });
  const backTo = record.mode === 'move' && validated.trees.some(tree => tree.id === record.fromTreeId) ? record.fromTreeId
    : validated.trees.some(tree => tree.id === record.fromTreeId) ? record.fromTreeId : (validated.trees[0]?.id || null);
  return { state: validated, treeId: backTo, exact: untouched };
}

export function linksOf(moment) {
  return Array.isArray(moment?.links) ? moment.links : [];
}
export function relatedMoments(tree, id) {
  const current = tree.moments.find(m => m.id === id);
  if (!current) return [];
  const ids = new Set(linksOf(current));
  for (const other of tree.moments) if (linksOf(other).includes(id)) ids.add(other.id);
  ids.delete(id);
  return tree.moments.filter(m => ids.has(m.id));
}
export function linkMoments(tree, id, targetId, clock = new Date().toISOString()) {
  if (id === targetId) throw new Error('같은 순간끼리는 이을 수 없어요.');
  const current = tree.moments.find(m => m.id === id), target = tree.moments.find(m => m.id === targetId);
  if (!current || !target) throw new Error('이을 순간을 찾을 수 없어요.');
  if (linksOf(current).includes(targetId)) return tree;
  if (linksOf(current).length >= MAX_LINKS || linksOf(target).length >= MAX_LINKS) throw new Error(`한 순간에는 ${MAX_LINKS}개의 관련 순간까지 이을 수 있어요.`);
  return {
    ...tree,
    updatedAt: clock,
    moments: tree.moments.map(m => m.id === id ? { ...m, links: [...linksOf(m), targetId] } : m.id === targetId ? { ...m, links: [...linksOf(m), id] } : m)
  };
}
export function unlinkMoments(tree, id, targetId, clock = new Date().toISOString()) {
  const without = (moment, other) => linksOf(moment).filter(link => link !== other);
  return {
    ...tree,
    updatedAt: clock,
    moments: tree.moments.map(m => m.id === id ? { ...m, links: without(m, targetId) } : m.id === targetId ? { ...m, links: without(m, id) } : m)
  };
}

export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.trees) || value.trees.length > MAX_TREES) throw new Error('지원하지 않는 러브트리 파일이에요.');
  const treeIds = new Set();
  const idValid = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
  const time = v => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
  // #327(① 데이터 규칙): inbox는 참/거짓뿐이고 한 계정에 최대 1개다. 2개 이상이면
  // 목록의 첫 번째만 true로 남기고 나머지는 false로 정리한다(저장 거부가 아니다).
  let inboxSeen = false;
  const trees = value.trees.map(tree => {
    if (!tree || typeof tree !== 'object') throw new Error('트리 데이터가 올바르지 않아요.');
    if (!idValid(tree.id) || treeIds.has(tree.id) || !Array.isArray(tree.moments) || tree.moments.length > MAX_MOMENTS || !time(tree.createdAt) || !time(tree.updatedAt)) throw new Error('트리 데이터가 올바르지 않아요.');
    treeIds.add(tree.id);
    const ids = new Set();
    const moments = tree.moments.map(m => {
      if (!m || typeof m !== 'object') throw new Error('순간 데이터가 올바르지 않아요.');
      if (!idValid(m.id) || ids.has(m.id) || !time(m.createdAt) || (m.parentId !== null && !idValid(m.parentId))) throw new Error('순간 데이터가 올바르지 않아요.');
      const rawLinks = m.links ?? [];
      if (!Array.isArray(rawLinks) || rawLinks.length > MAX_LINKS) throw new Error('관련 순간 데이터가 올바르지 않아요.');
      for (const link of rawLinks) if (!idValid(link) || link === m.id) throw new Error('관련 순간 데이터가 올바르지 않아요.');
      ids.add(m.id);
      // 틀린 구간 값은 그 필드만 버린다(순간 전체를 거부하지 않는다).
      const clean = { ...m };
      delete clean.startSeconds; delete clean.endSeconds;
      // #1439: 복사한 순간은 원본 순간 id(copiedFrom)를 남긴다. 원본은 다른 트리에 있거나 지워졌을 수 있어 모양만 본다.
      const copiedFrom = idValid(m.copiedFrom) && m.copiedFrom !== m.id ? { copiedFrom: m.copiedFrom } : {};
      // 이미 저장된 미디어 정보는 새 입력의 정리 결과로 덮어쓰지 않는다.
      // 형식 검사는 유지하고, 공개 여부와 미래 필드는 공개 응답에서만 판단한다.
      const validated = validateMomentInput(clean);
      if (m.mediaMetadata !== undefined && m.mediaMetadata !== null) {
        validated.mediaMetadata = structuredClone(m.mediaMetadata);
      }
      return { ...validated, ...rangeFields(m, m.url), id: m.id, parentId: m.parentId, links: [...new Set(rawLinks)], createdAt: m.createdAt, ...boardLayoutOf(m), ...copiedFrom };
    });
    if (moments.length && moments.filter(m => m.parentId === null).length !== 1) throw new Error('트리의 시작 순간은 하나여야 해요.');
    const byId = new Map(moments.map(m => [m.id, m]));
    for (const moment of moments) for (const link of moment.links) if (!byId.has(link)) throw new Error('연결된 순간이 파일에 없어요.');
    for (const moment of moments) {
      let current = moment;
      const seen = new Set();
      while (current.parentId !== null) {
        if (seen.has(current.id)) throw new Error('순간 연결이 원을 이루고 있어요.');
        seen.add(current.id);
        current = byId.get(current.parentId);
        if (!current) throw new Error('연결된 순간이 파일에 없어요.');
      }
    }
    const coverMomentId = tree.coverMomentId ?? '';
    if (typeof coverMomentId !== 'string' || (coverMomentId && !byId.has(coverMomentId))) throw new Error('표지 순간이 트리에 없어요.');
    const coverDesign = normalizeCoverDesign(tree.coverDesign);
    const coverMode = normalizeCoverMode(tree.coverMode);
    const inbox = tree.inbox === true && !inboxSeen;
    if (inbox) inboxSeen = true;
    const out = { id: tree.id, subject: requireText(tree.subject, '대상', 60), title: requireText(tree.title, '트리 제목', 100), openView: normalizeTreeOpenView(tree.openView), coverMomentId, coverDesign, inbox, createdAt: tree.createdAt, updatedAt: tree.updatedAt, moments };
    if (coverMode) out.coverMode = coverMode;
    return out;
  });
  return { version: 1, trees, prefs: normalizePrefs(value.prefs) };
}

// 디자인 표지가 어떤 테마 표지 색을 쓰는지. texture-1..4는 --lt-cover-1..4와 짝이고 5·6은 다시 1·2색에 다른 질감이다.
export function coverDesignPaletteIndex(design) {
  const index = COVER_DESIGN_IDS.indexOf(design);
  return index < 0 ? -1 : index % 4;
}

export function importTrees(current, incoming) {
  const safe = validateState(incoming);
  if (current.trees.length + safe.trees.length > MAX_TREES) throw new Error(`트리는 ${MAX_TREES}개까지 보관할 수 있어요.`);
  const copies = safe.trees.map(tree => {
    const ids = new Map(tree.moments.map(m => [m.id, newId()]));
    return { ...tree, id: newId(), coverMomentId: tree.coverMomentId ? ids.get(tree.coverMomentId) : '', moments: tree.moments.map(m => ({ ...m, id: ids.get(m.id), parentId: m.parentId === null ? null : ids.get(m.parentId), links: linksOf(m).map(link => ids.get(link)).filter(Boolean) })) };
  });
  return { version: 1, trees: [...current.trees, ...copies], prefs: normalizePrefs(current.prefs) };
}

export function stemGroups(tree) {
  const root = tree.moments.find(m => m.parentId === null);
  if (!root) return [];
  const children = new Map();
  for (const m of tree.moments) {
    if (!m.parentId) continue;
    const list = children.get(m.parentId) || [];
    list.push(m);
    children.set(m.parentId, list);
  }
  const byDate = (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
  for (const list of children.values()) list.sort(byDate);
  const collect = moment => [moment, ...(children.get(moment.id) || []).flatMap(collect)];
  const stems = [{ id: root.id, title: root.title, root: true, moments: [root] }];
  for (const child of children.get(root.id) || []) stems.push({ id: child.id, title: child.title, root: false, moments: collect(child) });
  return stems;
}

export function pathTo(tree, id) {
  const resolved = (id && typeof id === 'object') ? id.id : id;
  const byId = new Map(tree.moments.map(m => [m.id, m]));
  const path = [];
  const seen = new Set();
  let current = byId.get(resolved);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentId === null ? null : byId.get(current.parentId);
  }
  return path.reverse();
}

export function treeLayout(tree) {
  const children = new Map(tree.moments.map(m => [m.id, []]));
  for (const m of tree.moments) if (m.parentId) children.get(m.parentId)?.push(m);
  const root = tree.moments.find(m => m.parentId === null);
  const positions = new Map();
  let nextLeaf = 0;
  let maxDepth = 0;
  function visit(m, depth) {
    maxDepth = Math.max(maxDepth, depth);
    const kids = children.get(m.id);
    const rows = kids.map(child => visit(child, depth + 1));
    const row = rows.length ? (rows[0] + rows.at(-1)) / 2 : nextLeaf++;
    positions.set(m.id, { x: 55 + depth * 290, y: 55 + row * 205 });
    return row;
  }
  if (root) visit(root, 0);
  return { positions, width: Math.max(880, 110 + (maxDepth + 1) * 290), height: Math.max(470, 110 + nextLeaf * 205) };
}
