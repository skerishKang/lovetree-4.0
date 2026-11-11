// 러브트리 4.1 — 첫 트리 = 첫 여정의 순수 로직.
// 화면(iframe)과 셸이 같이 쓴다. 저장은 여기서 하지 않는다: 셸이 기존 member.apply('new'/'add')로
// 도메인 함수(createTree/addMoment)와 workspace PUT을 그대로 쓴다.
import {EMOTIONS, normalizeEmotion, safeUrl, suggestMomentTitle} from './domain.mjs';

export const JOURNEY_STORAGE_KEY = 'lovetree.v41.first-journey';
export const JOURNEY_COMPLETION_KEY = 'lovetree.v41.first-journey.finished';
export const JOURNEY_STEPS = Object.freeze([
  {index: '00', key: 'subject', label: '트리 이름'},
  {index: '01', key: 'first', label: '첫 순간'},
  {index: '02', key: 'memory', label: '마음 남기기'},
  {index: '03', key: 'next', label: '다음 영상 잇기'},
  {index: '04', key: 'growth', label: '성장'},
]);
export const JOURNEY_LAST_STEP = JOURNEY_STEPS.length - 1;
export const JOURNEY_EMOTIONS = EMOTIONS;

const LIMIT = {subject: 60, note: 500, reason: 500, nextReason: 100, nextNote: 500};
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const trimmed = value => (typeof value === 'string' ? value.trim() : '');
const isoDay = clock => (clock instanceof Date ? clock : new Date(clock)).toISOString().slice(0, 10);

function clampStep(value) {
  const step = Number.parseInt(value, 10);
  return Number.isFinite(step) ? Math.min(JOURNEY_LAST_STEP, Math.max(0, step)) : 0;
}

function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

export function emptyJourneyDraft({subject = '', clock = new Date()} = {}) {
  return {
    step: 0,
    subject: text(trimmed(subject), LIMIT.subject),
    url: '',
    note: '',
    emotion: '설렘',
    date: isoDay(clock),
    reason: '',
    nextUrl: '',
    nextReason: '',
    nextNote: '',
    skipped: false,
    savedTreeId: '',
    savedMomentId: '',
  };
}

// 저장된 임시 값은 믿지 않는다. 모르는 키는 버리고 길이·단계만 안전하게 되살린다.
export function normalizeJourneyDraft(value = {}, {clock = new Date()} = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const draft = emptyJourneyDraft({subject: source.subject, clock});
  draft.step = clampStep(source.step);
  draft.url = text(trimmed(source.url), 2048);
  draft.note = text(source.note, LIMIT.note);
  draft.emotion = normalizeEmotion(source.emotion);
  draft.date = validDay(source.date) ? source.date : draft.date;
  draft.reason = text(source.reason, LIMIT.reason);
  draft.nextUrl = text(trimmed(source.nextUrl), 2048);
  draft.nextReason = text(source.nextReason, LIMIT.nextReason);
  draft.nextNote = text(source.nextNote, LIMIT.nextNote);
  draft.skipped = source.skipped === true;
  draft.savedTreeId = text(trimmed(source.savedTreeId), 80);
  draft.savedMomentId = text(trimmed(source.savedMomentId), 80);
  if (!draft.savedTreeId || !draft.savedMomentId) {
    draft.savedTreeId = '';
    draft.savedMomentId = '';
  }
  return draft;
}

export function journeyDraftHasContent(value) {
  if (!value || typeof value !== 'object') return false;
  return [value.subject, value.url, value.note, value.reason, value.nextUrl, value.nextReason, value.nextNote]
    .some(item => trimmed(item) !== '');
}

export function readJourneyDraft(storage) {
  try {
    const raw = storage?.getItem?.(JOURNEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return journeyDraftHasContent(parsed) ? normalizeJourneyDraft(parsed) : null;
  } catch {
    return null;
  }
}

export function writeJourneyDraft(storage, draft) {
  try {
    storage?.setItem?.(JOURNEY_STORAGE_KEY, JSON.stringify(normalizeJourneyDraft(draft)));
    return true;
  } catch {
    return false;
  }
}

export function clearJourneyDraft(storage) {
  try {
    storage?.removeItem?.(JOURNEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// 저장을 마친 여정은 임시값을 지우고 완료 표시를 남긴다. 표시는 다음 새 여정이
// 한 번 소비한다. pagehide가 늦게 돌아도 완료 뒤에는 다시 쓰지 않는다.
export function persistJourneyDraft(storage, draft, {completed = false} = {}) {
  if (completed) return false;
  return writeJourneyDraft(storage, draft);
}

export function finishJourneyDraft(storage) {
  try {
    storage?.setItem?.(JOURNEY_COMPLETION_KEY, '1');
    storage?.removeItem?.(JOURNEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function discardFinishedJourneyDraft(storage) {
  try {
    if (storage?.getItem?.(JOURNEY_COMPLETION_KEY) !== '1') return false;
    storage.removeItem(JOURNEY_COMPLETION_KEY);
    storage.removeItem(JOURNEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function journeyRestoreQuestion(draft) {
  if (!journeyDraftHasContent(draft)) return '';
  const subject = trimmed(draft.subject);
  return subject
    ? `작성 중이던 첫 여정이 있어요. “${subject}”에서 이어서 쓸까요?`
    : '작성 중이던 첫 여정이 있어요. 이어서 쓸까요?';
}

export function nextJourneyStep(step) {
  return Math.min(JOURNEY_LAST_STEP, clampStep(step) + 1);
}

export function previousJourneyStep(step) {
  return Math.max(0, clampStep(step) - 1);
}

export function journeyStepProblem(step, draft = {}) {
  const value = normalizeJourneyDraft(draft);
  const current = clampStep(step);
  if (current === 0) {
    if (!trimmed(value.subject)) return '좋아하는 대상을 적어 주세요.';
    if (Array.from(trimmed(value.subject)).length > LIMIT.subject) return `좋아하는 대상은 ${LIMIT.subject}자까지 적을 수 있어요.`;
    return '';
  }
  if (current === 1) {
    if (!value.url) return '첫 순간의 링크나 사진 주소를 넣어 주세요.';
    try { safeUrl(value.url); } catch (error) { return error.message; }
    return '';
  }
  if (current === 2) {
    if (!value.savedTreeId) {
      if (!trimmed(value.subject)) return '좋아하는 대상을 먼저 적어 주세요.';
      if (!value.url) return '첫 순간의 링크나 사진 주소를 먼저 넣어 주세요.';
    }
    if (!validDay(value.date)) return '기억할 시점을 확인해 주세요.';
    return '';
  }
  if (current === 3) {
    if (value.skipped) return '';
    if (!value.nextUrl) return '다음 링크를 넣거나 나중에 잇기를 눌러 주세요.';
    try { safeUrl(value.nextUrl); } catch (error) { return error.message; }
    return '';
  }
  return '';
}

export function canAdvanceJourney(step, draft) {
  return journeyStepProblem(step, draft) === '';
}

export function journeyPreviewTitle(draft = {}) {
  const value = normalizeJourneyDraft(draft);
  try {
    return suggestMomentTitle({title: '', note: trimmed(value.reason) || value.note, url: value.url})
      || '아직 비어 있는 첫 순간';
  } catch {
    return '아직 비어 있는 첫 순간';
  }
}

// 02에서 트리+첫 순간을, 03에서 두 번째 순간을 만든다. 두 번째는 첫 순간의 parentId로 이어지고
// 연결 이유는 기존 relation 필드에 담는다(links/스키마 변경 없음).
export function journeySavePlan(draft = {}) {
  const value = normalizeJourneyDraft(draft);
  const treeId = value.savedTreeId;
  const savedMomentId = value.savedMomentId;
  let first = null;
  if (!treeId) {
    if (!trimmed(value.subject)) throw new Error('좋아하는 대상을 적어 주세요.');
    if (!value.url) throw new Error('첫 순간의 링크나 사진 주소를 넣어 주세요.');
    first = {
      subject: trimmed(value.subject),
      url: safeUrl(value.url),
      note: trimmed(value.reason) || value.note,
      emotion: normalizeEmotion(value.emotion),
      date: validDay(value.date) ? value.date : isoDay(new Date()),
    };
  }
  let second = null;
  if (!value.skipped && value.nextUrl) {
    second = {
      url: safeUrl(value.nextUrl),
      relation: trimmed(value.nextReason).slice(0, LIMIT.nextReason),
      emotion: normalizeEmotion(value.emotion),
      date: validDay(value.date) ? value.date : isoDay(new Date()),
      note: value.nextNote,
    };
  }
  return {first, second, treeId, momentId: savedMomentId};
}

// 진입 경로: 로그아웃=로그인 창, 편집 연결 없음=설정 "내 데이터"(#368 — 옛 내 기록 창 자리), 새 트리=첫 여정, 추가·수정=기존 패널.
export function journeyEntry({owned = false, writable = false, mode = 'new'} = {}) {
  if (!owned) return {screen: 'login', reason: 'signed-out'};
  if (!writable) return {screen: 'settings', reason: 'not-writable'};
  if (mode !== 'new') return {screen: 'panel', reason: 'panel-mode', mode};
  return {screen: 'journey', reason: 'new-tree'};
}

// 2026-11-08 첫 여정 뒤로가기: 단계마다 #journey/00~04 기록을 남기고, popstate에서 그 기록을 해석한다.
// 셸은 이 순수 규칙만 보고 이동하고, 실제 history 조작은 셸 한 곳에서만 한다.
export const JOURNEY_ROUTE_PREFIX = '#journey/';

export function journeyRouteHash(step) {
  const value = clampStep(step);
  return JOURNEY_ROUTE_PREFIX + JOURNEY_STEPS[value].index;
}

export function parseJourneyRoute(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(JOURNEY_ROUTE_PREFIX)) return null;
  const index = hash.slice(JOURNEY_ROUTE_PREFIX.length);
  const position = JOURNEY_STEPS.findIndex(step => step.index === index);
  return position < 0 ? null : {step: position, index: JOURNEY_STEPS[position].index};
}

// 새로고침·직접 주소로 들어올 때 열 단계. 임시 보관값이 없으면 00,
// 이미 트리를 만든 임시 값은 03(성장) 아래로 내려가지 않는다.
export function journeyResumeStep(draft) {
  if (!draft || !journeyDraftHasContent(draft)) return 0;
  const value = normalizeJourneyDraft(draft);
  return value.savedTreeId ? Math.max(3, value.step) : value.step;
}

// hash와 현재 화면만으로 뒤로가기 처리 방법을 정한다. 저장이 끝난 뒤에는
// 성장 단계 기록으로 다시 들어가지 않고 첫 화면으로 나간다(같은 트리를 두 번 만들지 않는다).
export function journeyRouteDecision({hash = '', open = false, saved = false} = {}) {
  const route = parseJourneyRoute(hash);
  if (route) {
    if (saved) return {action: 'finished', step: null};
    return {action: open ? 'goto' : 'open', step: route.step};
  }
  return {action: open ? 'leave' : 'ignore', step: null};
}
