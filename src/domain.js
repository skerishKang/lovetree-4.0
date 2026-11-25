import { validateRange, rangeFields, fillStartFromUrl } from './moment-range.js';
import { DEFAULT_TREE_OPEN_VIEW, normalizeTreeOpenView } from '../public/v41/tree-open-view.mjs';
export const EMOTIONS = ['설렘', '위로', '벅참', '그리움', '고마움', '즐거움'];
// #256-3: 책(트리)마다 고르는 디자인 표지. 테마 표지 색(--lt-cover-N) 위의 질감 변형 6종.
// 값은 이 목록뿐이다. 모르는 값·타입은 저장 거부가 아니라 ''(기본 표지)로 되돌린다.
// public/v41/domain.mjs의 같은 목록과 이 파일의 목록이 같은지 tests/v41-cover-design.test.mjs가 확인한다.
export const COVER_DESIGN_IDS = ['texture-1', 'texture-2', 'texture-3', 'texture-4', 'texture-5', 'texture-6'];
export function normalizeCoverDesign(value) {
  return COVER_DESIGN_IDS.includes(value) ? value : '';
}
// #380 5번: 표지 방법은 하나만 고른다 — 첫 순간(기본) / 순간에서 / 디자인 / 사진.
// 고른 방법 하나만 표지가 되고, 고르지 않은 방법의 저장값은 지우지 않는다.
// public/v41/domain.mjs의 같은 목록·규칙과 같은지 tests/v41-cover-method.test.mjs가 확인한다.
export const COVER_MODES = ['basic', 'moment', 'design', 'photo'];
export function normalizeCoverMode(value) {
  return COVER_MODES.includes(value) ? value : '';
}
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
// public/v41/domain.mjs의 같은 상수와 이 값이 같은지 tests/v41-inbox-data.test.mjs가 확인한다.
export const INBOX_SUBJECT = '모아둔 순간';
export const TITLE_DISPLAYS = ['both', 'mine', 'video'];
export const DEFAULT_TITLE_DISPLAY = 'both';
// #1094: 서재에서 책을 누를 때 여는 보기 — book(책으로)·list(목록으로). 모르는 값은 기본 '책'. 상태(state.prefs)에 저장한다.
export const BOOK_DISPLAYS = ['book', 'list'];
export const DEFAULT_BOOK_DISPLAY = 'book';
// #1093: 서재 진열 방식 — shelf(선반, 기본)·carousel(회전). 상태(state.prefs)에 저장한다.
export const SHELF_VIEWS = ['shelf', 'carousel'];
export const DEFAULT_SHELF_VIEW = 'shelf';
// #368 2차: 프로필(표시 이름·동그라미 색). 계정 기록의 설정 칸(state.prefs)에 함께 저장한다(#371).
// 표시 이름은 공백을 한 칸으로 모으고 20자(문자 단위)까지만 남긴다. 값이 없으면 ''라 이전 저장본도 그대로 읽힌다.
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
// 여기서는 형식(문자열 80자)만 맞춘다.
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
function safeMediaThumbnail(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2048) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && /(?:^|\.)(?:ytimg\.com|tiktokcdn\.com|tiktok\.com)$/i.test(parsed.hostname) ? parsed.href : '';
  } catch {
    return '';
  }
}
// #1038: 세로 판정값(선택) — 없는 값은 '모름'으로 두고, 있으면 형식만 엄격히 지킨다.
// 문자열·음수·Infinity·NaN은 저장하지 않고 거부한다(새 필드가 생겨도 옛 문서는 그대로 읽힌다 → 이전 불필요).
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
// #791 2단계: 릴스 캡처 그림(업로드 경로가 만든 같은 출처 주소)만 썸네일로 남긴다.
function safeSavedImage(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) return '';
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw)) return raw;
  if (/^\/api\/media\/[a-f0-9-]+\.(?:png|jpe?g|gif|webp)$/i.test(raw)) return raw;
  return '';
}
function normalizeMediaMetadata(value, url) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('미디어 정보를 확인해 주세요.');
  const title = optionalText(value.title, '미디어 제목', 240);
  const channel = optionalText(value.channel, '미디어 채널', 160);
  const thumbnail = safeMediaThumbnail(value.thumbnail);
  const vertical = normalizeVerticalMedia(value);
  // #791: 틱톡 — 짧은 주소를 서버가 푼 숫자 id와 @계정 이름을 함께 남긴다.
  const tiktokId = /^\d{15,25}$/.test(String(value.tiktokId ?? '').trim()) ? String(value.tiktokId).trim() : '';
  const tiktokAuthor = optionalText(value.tiktokAuthor, '미디어 작성자', 120);
  // #791 2단계: 릴스 @계정과 짧은 코드(한도에 걸리면 빈 값).
  const instagramAuthor = optionalText(value.instagramAuthor, '미디어 작성자', 120);
  const instagramShortcode = /^[A-Za-z0-9_-]{8,30}$/.test(String(value.instagramShortcode ?? '').trim()) ? String(value.instagramShortcode).trim() : '';
  if (!title && !channel && !thumbnail && !tiktokId && !tiktokAuthor && !instagramAuthor && !instagramShortcode && !Object.keys(vertical).length) return null;
  const source = url ? new URL(url).hostname : '';
  if (!source) return null;
  const result = {title, channel, source, ...vertical};
  if (thumbnail) result.thumbnail = thumbnail;
  if (tiktokId) result.tiktokId = tiktokId;
  if (tiktokAuthor) result.tiktokAuthor = tiktokAuthor;
  if (instagramAuthor) result.instagramAuthor = instagramAuthor;
  if (instagramShortcode) result.instagramShortcode = instagramShortcode;
  return result;
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
  // public/v41/domain.mjs의 같은 함수와 이 규칙이 같은지 tests/v41-video-title.test.mjs가 확인한다.
  const videoTitle = typeof mediaMetadata?.title === 'string' ? mediaMetadata.title.trim() : '';
  if (videoTitle) return shortened(videoTitle, 80);
  const memo = optionalText(note, '마음 한마디', 500);
  if (memo) return shortened(memo.split(/\r?\n/)[0] || memo);
  const normalized = safeUrl(url);
  if (!normalized) return '';
  const parsed = new URL(normalized);
  if (/\.(?:png|jpe?g|gif|webp)$/.test(parsed.pathname.toLowerCase())) return '사진으로 남긴 순간';
  if (/\.(?:mp4|webm)$/.test(parsed.pathname.toLowerCase())) return '영상으로 남긴 순간';
  return `${parsed.hostname.replace(/^www\./, '') || '링크'}에서 간직한 순간`;
}
export function normalizeEmotion(value) {
  if (EMOTIONS.includes(value)) return value;
  // 가져온 기록(리모네 등)의 감정을 설렘으로 바꾸지 않고 그대로 보존한다.
  const custom = typeof value === 'string' ? value.trim() : '';
  return custom && custom.length <= 12 && !/[\u0000-\u001f]/.test(custom) ? custom : '설렘';
}
// #547: 지역 연·월·일로 'YYYY-MM-DD'를 만든다(클라이언트 public/v41/local-date.mjs와 같은 규칙).
// toISOString은 UTC 날짜라 한국 시간 0시~9시에 하루 전이 됐다.
export function localDateOnly(clock = new Date()) {
  const at = clock instanceof Date ? clock : new Date(clock);
  const date = Number.isNaN(at.getTime()) ? new Date() : at;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function validateMomentInput(input) {
  const note = optionalText(input.note, '마음 한마디', 500);
  const url = safeUrl(input.url || '');
  // #344: 영상 제목(mediaMetadata.title)을 자동 제목 후보로 함께 넘겨 판정하고, 저장값에도 그대로 남긴다.
  const mediaMetadata = normalizeMediaMetadata(input.mediaMetadata, url);
  const title = suggestMomentTitle({ title: input.title, note, url, mediaMetadata });
  if (!title) throw new Error('순간 제목, 마음 한마디, 링크나 첨부 중 하나는 남겨 주세요.');
  const emotion = normalizeEmotion(input.emotion);
  // #547: '오늘'은 이 기기의 지역 날짜다(UTC가 아니다). public/v41/local-date.mjs와 같은 규칙이다.
  const date = input.date || localDateOnly();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('날짜를 확인해 주세요.');
  const relation = typeof input.relation === 'string' ? input.relation.trim() : '';
  if (relation.length > 100) throw new Error('연결 이유는 100자까지 적을 수 있어요.');
  // #792: 시작·끝 구간은 선택 값. 둘 다 없으면 키 자체를 넣지 않는다.
  const range = validateRange(input, url);
  const result = { title, note, emotion, date, relation, url, ...range };
  // #791 2단계: 릴스 캡처 그림은 링크를 대체하지 않고 별도 썸네일로 남긴다.
  const image = safeSavedImage(input.image);
  if (image) result.image = image;
  if (mediaMetadata) result.mediaMetadata = mediaMetadata;
  return result;
}
// 기억 보드 배치(선택): 카드 위치·회전·핀/카드 모양·색·키워드. 4.1 보드가 저장하는 값이며,
// 없거나 형식이 틀리면 그 항목만 버린다. 저장 계약을 넓히지 않도록 허용 목록·범위만 통과시킨다.
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
  return { id: newId(), subject, title: `${subject}, 나의 순간들`, openView: normalizeTreeOpenView(input.openView), coverMomentId: '', coverDesign: '', inbox: false, createdAt: clock, updatedAt: clock, moments: [moment] };
}
export function editTree(tree, input, clock = new Date().toISOString()) {
  const title = requireText(input.title, '트리 이름', 100);
  const subject = requireText(input.subject, '좋아하는 대상', 60);
  const coverMomentId = input.coverMomentId === undefined || input.coverMomentId === null || input.coverMomentId === '' ? '' : input.coverMomentId;
  if (typeof coverMomentId !== 'string' || (coverMomentId && !tree.moments.some(moment => moment.id === coverMomentId))) throw new Error('이 트리에서 표지 순간을 선택해 주세요.');
  const coverDesign = normalizeCoverDesign(input.coverDesign);
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
  if (!tree.moments.some(m => m.id === parentId)) throw new Error('이어질 순간을 먼저 선택해 주세요.');
  const moment = { ...validateMomentInput(input), id: newId(), parentId, links: [], createdAt: clock };
  return { ...tree, updatedAt: clock, moments: [...tree.moments, moment] };
}
export function editMoment(tree, id, input, clock = new Date().toISOString()) {
  const current = tree.moments.find(m => m.id === id);
  if (!current) throw new Error('이 순간을 찾을 수 없어요.');
  const next = validateMomentInput(input);
  return { ...tree, updatedAt: clock, moments: tree.moments.map(m => {
    if (m.id !== id) return m;
    const edited = { ...m, ...next, relation: m.parentId ? next.relation : '' };
    if (next.url !== m.url && !next.mediaMetadata) delete edited.mediaMetadata;
    return edited;
  }) };
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

// #327(① 데이터 규칙): 옮겨진 순간들을 한 트리에서 떼어 낸다. 남은 순간은 옮겨진 조상 중
// 가장 가까운 남은 조상 아래로 다시 붙는다(한 개를 옮길 때는 '옮긴 순간의 부모에게 다시 붙는다'와
// 같은 결과다). 남은 조상이 하나도 없으면 남은 순간 중 가장 먼저 만든 것을 새 시작 순간으로 올리고
// 나머지를 그 아래로 붙인다. 옮긴 순간을 가리키던 링크도 남은 순간에서 지운다. 연결 이유는
// 붙는 부모가 바뀐 순간만 ''로 되돌린다.
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
  // #638(고른 트리 우선, CTO 결정 2026-11-15): 지금 고른 트리(input.treeId)에 담는다(#327의 '모아둔 순간 고정'을 바꾼 결정).
  // 트리가 0개면 기본 트리('모아둔 순간')를 만들고, 고른 트리를 찾지 못하면 기존 규칙(inbox)으로 물러난다.
  // public/v41/domain.mjs와 같은 규칙을 유지한다(#327 두 벌 같게).
  const chosen = trees.find(tree => tree.id === input?.treeId);
  if (chosen) {
    // 이슈 671: '그 순간 다음에 담기'(input.parentId)가 이 트리의 순간이면 그 순간 바로 다음에 잇는다.
    // 목적지가 없거나 못 찾으면 기존 규칙대로 가장 최근 순간 다음에 담는다. public/v41/domain.mjs와 같은 규칙.
    const after = chosen.moments.some(m => m.id === input?.parentId) ? input.parentId : (latestMomentId(chosen) || chosen.moments.find(m => m.parentId === null).id);
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
  const grown = addMoment(inbox, source, latestMomentId(inbox) || inbox.moments.find(m => m.parentId === null).id, clock);
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
  if (!attachTo || !target.moments.some(m => m.id === attachTo)) throw new Error('옮겨 붙일 순간을 대상 트리에서 골라 주세요.');
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
    if (!idValid(tree.id) || treeIds.has(tree.id) || !Array.isArray(tree.moments) || !tree.moments.length || tree.moments.length > MAX_MOMENTS || !time(tree.createdAt) || !time(tree.updatedAt)) throw new Error('트리 데이터가 올바르지 않아요.');
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
      return { ...validateMomentInput(clean), ...rangeFields(m, m.url), id: m.id, parentId: m.parentId, links: [...new Set(rawLinks)], createdAt: m.createdAt, ...boardLayoutOf(m) };
    });
    if (moments.filter(m => m.parentId === null).length !== 1) throw new Error('트리의 시작 순간은 하나여야 해요.');
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
