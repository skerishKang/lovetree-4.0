// 빠른 담기 입구(붙여넣기·공유 시트)의 순수 계산 (2026-11-10; 2026-11-11 파라미터 3종 보완).
// 판정은 기존 빠른 추가 한 벌(./quick-add.mjs)을 재사용한다 — 새 판정 함수를 만들지 않는다.
// 화면 배선(붙여넣기 리스너·진입 소비·로그인 라운드트립)은 shell/quick-intake.mjs가 맡는다(docs/TESTING.md).
// 데이터 규칙(quickAdd·inbox)은 로컬1 계약을 쓴다 — 화면은 이름만 부른다.
import { parseQuickUrl } from './quick-add.mjs';

// share_target params 가 싣고 오는 쿼리 이름(매니페스트와 한 벌).
export const INTAKE_URL_PARAM = 'quickadd';
export const INTAKE_TEXT_PARAM = 'qtext';
export const INTAKE_TITLE_PARAM = 'qtitle';

// 주소 앞뒤 문구는 버리고, 이 길이를 넘는 주소는 담지 않는다(safeUrl 상한과 같다).
export const INTAKE_MAX_URL_LENGTH = 2048;
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/;

// 값들에서 첫 http(s) 주소만 뽑는다(앞뒤 문구·문장부호 제거). 상한 초과 주소는 건너뛴다.
export function firstHttpUrl(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    for (const raw of value.match(URL_PATTERN) ?? []) {
      const url = raw.replace(/[.,;:!?…]+$/, '');
      if (!url || url.length > INTAKE_MAX_URL_LENGTH) continue;
      try { if (['http:', 'https:'].includes(new URL(url).protocol)) return url; } catch { /* 다음 후보 */ }
    }
  }
  return '';
}

// url → text → title 순으로 첫 주소를 고른다.
export function resolveIntakeCandidate({ url = '', text = '', title = '' } = {}) {
  return firstHttpUrl(url, text, title);
}

// 파라미터를 읽고 지운다 — 한 번만 통하는 값이라 부팅 때 한 번 읽고, 나머지는 그대로 둔다.
export function readIntakeParams(search) {
  const params = new URLSearchParams(String(search ?? ''));
  const found = [INTAKE_URL_PARAM, INTAKE_TEXT_PARAM, INTAKE_TITLE_PARAM].some((name) => params.has(name));
  if (!found) return { found: false, url: '', text: '', title: '', rest: params.toString() };
  const read = (name) => String(params.get(name) ?? '').trim();
  const url = read(INTAKE_URL_PARAM);
  const text = read(INTAKE_TEXT_PARAM);
  const title = read(INTAKE_TITLE_PARAM);
  params.delete(INTAKE_URL_PARAM);
  params.delete(INTAKE_TEXT_PARAM);
  params.delete(INTAKE_TITLE_PARAM);
  return { found, url, text, title, rest: params.toString() };
}

// 붙여넣기/공유로 들어온 글자를 기존 판정 한 벌로 분류한다.
export function classifyIntake(text, describe) {
  const parsed = parseQuickUrl(text, describe);
  return { status: parsed.status, url: parsed.status === 'ok' ? parsed.value : '' };
}

// 비교용 정규화 — 저장은 URL.href 규칙(safeUrl)이라 새 URL이 실패할 때만 원문을 쓴다.
export function canonicalUrl(value) {
  const text = String(value ?? '').trim();
  try { return new URL(text).href; } catch { return text; }
}

// inbox(모아둔 순간) 트리에 같은 주소가 이미 있는지 — '같은 주소 두 번 담기' 방지.
// 모르는 모양은 조용히 거짓(막지 않는다).
export function isInboxDuplicate(trees, url) {
  const target = canonicalUrl(url);
  if (!target) return false;
  return (Array.isArray(trees) ? trees : []).some(tree =>
    tree?.inbox === true
    && Array.isArray(tree.moments)
    && tree.moments.some(moment => moment?.url && canonicalUrl(moment.url) === target));
}

export const INTAKE_DUP_TEXT = '이미 모아둔 순간에 있는 주소예요.';   // 같은 주소 두 번 담기 방지 안내(문구 계약).
export const INTAKE_LOGIN_RETRY_TEXT = '로그인한 뒤 다시 공유해 주세요.';   // 두 번째 로그아웃 안내 — 로그인 고리를 끊는 자리(문구 계약, #342 후속).

// 세션 상태에 따른 한 걸음 판정(#342 후속: 공유 진입 로그인 고리 차단).
// session = {source, owned, phase} — 셸의 기록 출처, 서버 기록을 읽은 내 계정인지, 동기화 단계(phase).
// attempt = {attempted} — 보관한 같은 주소로 이미 로그인을 시작했는지.
// 세션이 확정되기 전(checking·offline 등)에는 '기다림'이라 아무것도 하지 않는다 — 이 한 줄이 고리를 끊는다.
export const INTAKE_STEP_WAIT = 'wait';       // 아직 모름: 담지도, 로그인으로 보내지도 않는다
export const INTAKE_STEP_SAVE = 'save';       // 서버 기록 load 완료(source==='server' && owned): 담는다
export const INTAKE_STEP_LOGIN = 'login';     // 로그인 필요가 확정: 한 번만 로그인으로 보낸다
export const INTAKE_STEP_NOTICE = 'notice';   // 이미 한 번 보냈다: 다시 보내지 않고 안내로 멈춘다
export const INTAKE_STEP_SKIP = 'skip';       // 공유 감상 화면: 담지 않는다

export function intakeStep(session = {}, attempt = {}) {
  const source = String(session?.source ?? '');
  const phase = String(session?.phase ?? '');
  if (source === 'share') return INTAKE_STEP_SKIP;
  if (source === 'server' && session?.owned === true) return INTAKE_STEP_SAVE;
  if (source === 'server' && phase === 'login') return attempt?.attempted === true ? INTAKE_STEP_NOTICE : INTAKE_STEP_LOGIN;
  return INTAKE_STEP_WAIT;
}

const PENDING_KEY = 'lovetree.v41.pending-share';
const LOGIN_ATTEMPT_KEY = 'lovetree.v41.pending-share-login';

function defaultPendingStorage() {
  try { return globalThis.sessionStorage || null; } catch { return null; }   // 저장소를 못 읽는 환경(프라이버시 모드 등)
}

// 로그인 라운드트립 동안 주소 하나를 맡는 탭 단위 보관소 — 쓰면 지우고, 남기지 않는다.
// sessionStorage를 못 쓰면 조용히 아무것도 않는다(막지 않는다).
export function createPendingSlot(storage = defaultPendingStorage()) {
  const read = () => { try { const raw = storage?.getItem(PENDING_KEY); return raw ? { url: String(raw) } : null; } catch { return null; } };
  const write = (url) => { try { storage?.setItem(PENDING_KEY, String(url)); } catch { /* 보관 못 해도 로그인 흐름은 간다 */ } };
  const clear = () => { try { storage?.removeItem(PENDING_KEY); } catch { /* 지울 수 없으면 세션 수명에 맡긴다 */ } };
  return { read, write, clear };
}

// 이 주소로 이미 로그인을 시작했는지 — 같은 값이면 로그인 화면으로 두 번 보내지 않는다(고리 차단, #342 후속).
export function loginAttempted(markedUrl, url) {
  const marked = canonicalUrl(markedUrl);
  return !!marked && marked === canonicalUrl(url);
}

// 로그인 시도 표시 보관소 — 보관한 주소와 같은 수명(탭 단위)을 쓴다. 저장소가 막히면 조용히 아무것도 않는다.
export function createLoginAttemptSlot(storage = defaultPendingStorage()) {
  const read = () => { try { return String(storage?.getItem(LOGIN_ATTEMPT_KEY) ?? ''); } catch { return ''; } };
  const mark = (url) => { try { storage?.setItem(LOGIN_ATTEMPT_KEY, String(url)); } catch { /* 표시 못 해도 담기 흐름은 간다 */ } };
  const clear = () => { try { storage?.removeItem(LOGIN_ATTEMPT_KEY); } catch { /* 표시 지우기 실패는 세션 수명에 맡긴다 */ } };
  return { read, mark, clear };
}
