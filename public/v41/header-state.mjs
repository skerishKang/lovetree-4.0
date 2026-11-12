// 4.1 상단 메뉴 배치(대표 결정 2026-11-07)의 표시 규칙만 담는 순수 모듈.
// DOM·인증·저장을 건드리지 않는다. 셸(shell.mjs)과 첫 화면(v41/home.js)이 같은 규칙을 쓰고,
// 시험은 이 함수들만 호출한다.

const clean = value => (typeof value === 'string' ? value.trim() : '');

// '으로/로' 조사 선택. 한글은 받침, 라틴 문자는 흔한 발음(모음 끝)만 구분한다.
// 로그인 라벨은 이메일 또는 '내 계정'이라 이 정도면 충분하다.
function roParticle(value) {
  const last = Array.from(clean(value)).pop() || '';
  const code = last.codePointAt(0) || 0;
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '로' : '으로';
  return /[aeiouyAEIOUY]$/.test(last) ? '로' : '으로';
}

// 로그인 상태의 계정 표시: 글자 알약 대신 첫 글자 동그라미.
// 동그라미 글자는 표시 이름 → 이메일 첫 글자 순서로 고르고(#368), subject(usr_…) 첫 글자는 쓰지 않는다.
// 이메일 표시 규칙: 자기 계정 메뉴는 본인만 보는 곳이라 전체를 보여 주고, 가리기(maskEmail)는
// 공유 화면 등 남이 보는 곳에서만 쓴다 — 지금 이메일을 남이 보는 화면에 쓰는 곳은 없다(2026-11-11 확인).
// 로그아웃 상태는 기존 "로그인" 알약을 그대로 쓴다(모양이 확실히 달라야 한다).
export function accountPresentation({ owned = false, email = '', name = '' } = {}) {
  if (!owned) return { mode: 'login', label: '로그인', initial: '', ariaLabel: null, title: '로그인' };
  const address = clean(email);
  // 이름·이메일이 아직 없으면(공통 로그인이 이메일을 주기 전) 점 대신 '나'를 보여 준다.
  const letter = firstLetter(clean(name) || address);
  const initial = letter === '·' ? '나' : letter;
  const who = address || '내 계정';
  return {
    mode: 'avatar',
    label: who,
    initial,
    ariaLabel: `내 계정 메뉴, ${who}${roParticle(who)} 로그인됨`,
    title: who
  };
}

// 이메일 앞부분의 첫 글자. 한글·영문 모두 한 글자로 줄인다.
export function firstLetter(value) {
  const text = clean(value);
  const match = text.match(/[0-9A-Za-z가-힣]/);
  return match ? match[0].toUpperCase() : '·';
}

// 트리 선택 버튼 문구: 트리가 열려 있으면 그 이름, 없으면 "트리 고르기".
export function treePickerLabel(treeTitle) {
  const title = clean(treeTitle);
  return title || '트리 고르기';
}

// 트리 선택 버튼 문구(전체). 로그인 상태에서 트리가 열려 있으면 "트리: <이름> ▾" 형태로 보여 준다.
// 로그아웃이면 예시 트리가 열려 있어도 "트리 고르기"다(내 트리가 아니다).
// 브라우저에만 남은 미저장 기록이 있으면 "저장 안 된 기록"으로 구분해 보여 준다.
export function treePickerText({ owned = false, treeTitle = '', pendingDraft = false } = {}) {
  if (!owned) return pendingDraft ? '저장 안 된 기록' : '트리 고르기';
  const title = clean(treeTitle);
  return title ? `트리: ${title}` : '트리 고르기';
}

// 트리 보기 탭(기억책·기억 보드·관계 지도)은 로그인한 내 트리에서만 열린다.
// 로그아웃 상태에서는 예시 트리가 열려 있어도 숨긴다(내 기록이 아니다).
export function treeViewsVisible({ owned = false, publicReading = false } = {}) {
  return owned && !publicReading;
}

// 상태별 헤더 노출(대표 결정 2026-11-08, #213 3번).
// "비활성으로 보이기" 대신 "아예 숨기기"로 정리한다: 로그아웃이면 트리 탭·트리 선택·순간 남기기·공유가 없다.
export function headerState({ owned = false, treeCount = 0, publicReading = false } = {}) {
  if (publicReading) return 'share';
  if (!owned) return 'out';
  return Number(treeCount) > 0 ? 'in-trees' : 'in-empty';
}

const HEADER_PARTS = Object.freeze({
  out: { account: 'login', browse: true, treePicker: false, treeViews: false, write: false, share: false },
  'in-empty': { account: 'avatar', browse: true, treePicker: false, treeViews: false, write: true, share: false },
  'in-trees': { account: 'avatar', browse: true, treePicker: true, treeViews: true, write: true, share: true },
  share: { account: 'avatar', browse: true, treePicker: false, treeViews: false, write: false, share: false }
});

export function headerParts(state) {
  const key = Object.prototype.hasOwnProperty.call(HEADER_PARTS, state) ? state : 'out';
  return { ...HEADER_PARTS[key], state: key };
}

export function headerPartsFor(input = {}) {
  return headerParts(headerState(input));
}

// 첫 트리를 만든 직후 한 번만 보여 주는 말풍선(#213 3번).
// 닫으면 저장소에 남겨 다시 보여 주지 않는다. 저장소가 막히면 그냥 다시 보여 준다.
export const TIPS_KEY = 'lt41.tips.firstTree';
export const FIRST_TREE_TIPS = Object.freeze([
  { id: 'write', anchor: 'write-menu', title: '여기서 순간을 더 남겨요', body: '오른쪽 위 "＋ 순간 추가"를 누르면 오늘의 순간이 이 트리에 쌓입니다.' },
  { id: 'views', anchor: 'tree-views', title: '책·보드·지도로 다르게 봐요', body: '같은 기록을 책처럼, 카드처럼, 이어진 선처럼 볼 수 있어요.' }
]);

export function readTipsSeen(storage) {
  try {
    return storage?.getItem(TIPS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeTipsSeen(storage) {
  try {
    storage?.setItem(TIPS_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

// #457 2번: 예시 둘러보기·공유(읽기 전용)는 source가 'server'가 아니다 — pauseMember()가 로그인한
// member 참조를 그대로 두고 dispose만 해서(owned가 예시 모드에서도 true로 남는다), model.trees가
// 예시 트리로 바뀌어도 "내 첫 트리"로 잘못 보지 않게 source로 한 번 더 막는다.
export function tipsWanted({ owned = false, treeCount = 0, seen = false, source = 'server' } = {}) {
  return source === 'server' && !!owned && Number(treeCount) > 0 && !seen;
}

// 헤더 주 버튼(#write-menu) 문구. 첫 화면 가운데 첫 버튼과 어긋나지 않게 같은 규칙을 쓴다.
export function writeMenuLabel({ owned = false, dirty = false, reading = false, hasTree = false } = {}) {
  if (!owned) return '처음 시작하기';
  if (dirty) return '미저장 기록';
  if (!hasTree) return '새 트리 만들기';
  if (reading) return '순간 추가';
  return '순간 남기기';
}

// 첫 화면 가운데 버튼 3개. 자리와 개수는 그대로 두고 강조와 첫 버튼 문구만 상태로 바꾼다.
// 흰색 강조(primary-cta)는 언제나 정확히 하나다.
export function homeCenterState({ member = 'out', treeCount = 0 } = {}) {
  const signedIn = member === 'in';
  const hasTree = signedIn && Number(treeCount) > 0;
  if (!signedIn) {
    return {
      state: 'out',
      buttons: [
        { key: 'start', label: '처음 시작하기', emphasis: true, disabled: false, title: '로그인하거나 가입하고 첫 순간을 남겨 보세요.' },
        { key: 'new', label: '새 트리 만들기', emphasis: false, disabled: false, title: '로그인한 뒤 새 트리를 만들 수 있어요.' },
        { key: 'trees', label: '내 책장', emphasis: false, disabled: false, title: '내 책장을 엽니다.' }
      ]
    };
  }
  if (!hasTree) {
    return {
      state: 'in-empty',
      buttons: [
        { key: 'add', label: '＋ 순간 추가', emphasis: true, disabled: false, title: '새 순간을 남깁니다.' },
        { key: 'community', label: '둘러보기', emphasis: false, disabled: false, title: '다른 사람의 순간을 둘러봅니다.' }
      ]
    };
  }
  return {
    state: 'in-trees',
    buttons: [
      { key: 'add', label: '＋ 순간 추가', emphasis: true, disabled: false, title: '새 순간을 남깁니다.' },
      { key: 'community', label: '둘러보기', emphasis: false, disabled: false, title: '다른 사람의 순간을 둘러봅니다.' }
    ]
  };
}

// 로그아웃 상태의 첫 버튼은 로그인/가입으로 가고, 돌아올 곳은 4.1 첫 화면이다.
export const HOME_LOGIN_NEXT = '/v41/';

// 4.1 첫 화면 테마 A/B(대표 지시 2026-11-07). A=밤(지금 운영), B=정원.
// 셸과 첫 화면이 같은 키·같은 규칙을 쓰고, 시험은 이 함수들만 호출한다. 저장소는 인자로 받는다.
export const THEME_KEY = 'lt41.theme';
export const THEME_NIGHT = 'night';
export const THEME_GARDEN = 'garden';

// #368 2차: 페이지 넘김 — '종이처럼'은 기억책 종이 넘김(#411), '부드럽게'는 움직임 줄이기와 같은 0.35초 교차 페이드.
// 기기에 저장한다(localStorage). 기본은 종이처럼이고, 시스템 움직임 줄이기가 켜져 있으면 기억책이 고른 값과
// 상관없이 부드럽게로 읽는다(기억책 쪽 판정). 저장소는 인자로 받는다(테마와 같은 규칙).
export const PAGE_TURN_KEY = 'lt41.pageTurn';
export const PAGE_TURNS = ['paper', 'smooth'];
export const DEFAULT_PAGE_TURN = 'paper';

export function normalizePageTurn(value) {
  return PAGE_TURNS.includes(value) ? value : DEFAULT_PAGE_TURN;
}

export function readPageTurn(storage) {
  try {
    return normalizePageTurn(storage?.getItem(PAGE_TURN_KEY));
  } catch {
    return DEFAULT_PAGE_TURN;
  }
}

export function writePageTurn(storage, value) {
  const next = normalizePageTurn(value);
  try {
    storage?.setItem(PAGE_TURN_KEY, next);
  } catch {}
  return next;
}

export function normalizeTheme(value) {
  return value === THEME_GARDEN ? THEME_GARDEN : THEME_NIGHT;
}

// 저장값을 읽는다. 저장소가 없거나 접근이 막히면 A로 본다.
export function readTheme(storage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_KEY));
  } catch {
    return THEME_NIGHT;
  }
}

// 저장에 성공하면 그 값을, 실패하면 A를 돌려준다(실패하면 A 규칙).
export function writeTheme(storage, theme) {
  const next = normalizeTheme(theme);
  try {
    storage?.setItem(THEME_KEY, next);
  } catch {
    return THEME_NIGHT;
  }
  return next;
}

export function nextTheme(theme) {
  return normalizeTheme(theme) === THEME_GARDEN ? THEME_NIGHT : THEME_GARDEN;
}

// 버튼 글자는 지금이 아니라 '누르면 갈 곳'을 쓴다.
export function themeButtonLabel(theme) {
  return normalizeTheme(theme) === THEME_GARDEN ? '밤' : '정원';
}

export function themeButtonAriaLabel(theme) {
  return normalizeTheme(theme) === THEME_GARDEN ? '밤 테마로 바꾸기' : '정원 테마로 바꾸기';
}

export function themePressed(theme) {
  return normalizeTheme(theme) === THEME_GARDEN;
}

// 2단계 범위: 공통 헤더·첫 화면·첫 여정은 B를 쓴다. 내 책장은 #212, 기억책은 2026-11-08 대표 확인으로 B를 받는다.
// 기억 보드·관계 지도는 계속 A다(대표 결정: 책만 테마를 따라간다).
export function appliedTheme(theme, view) {
  return view === 'home' || view === 'journey' || view === 'shelf' || view === 'book' || view === 'board' || view === 'network' ? normalizeTheme(theme) : THEME_NIGHT;
}

// 속성 없음 = A. B일 때만 data-lt-theme=garden 을 붙인다.
export function applyThemeAttribute(root, theme) {
  if (!root) return THEME_NIGHT;
  if (normalizeTheme(theme) === THEME_GARDEN) root.setAttribute('data-lt-theme', THEME_GARDEN);
  else root.removeAttribute('data-lt-theme');
  return normalizeTheme(theme);
}
export const LOGIN_INTENTS = Object.freeze(['new-tree', 'shelf']);
export function readLoginIntent(search = '') {
  const intent = new URLSearchParams(search).get('intent');
  return LOGIN_INTENTS.includes(intent) ? intent : '';
}
export function loginUrlWithTheme(url, theme, intent = '') {
  const parsed = new URL(url, 'https://lovetree-4-0.pages.dev');
  const next = parsed.searchParams.get('next');
  if (next) {
    const target = new URL(next, 'https://lovetree-4-0.pages.dev');
    if (LOGIN_INTENTS.includes(intent)) target.searchParams.set('intent', intent);
    else target.searchParams.delete('intent');
    parsed.searchParams.set('next', `${target.pathname}${target.search}${target.hash}`);
  }
  if (theme === THEME_NIGHT || theme === THEME_GARDEN) parsed.searchParams.set('lt_theme', theme);
  else parsed.searchParams.delete('lt_theme');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
export function homeStartLoginUrl(theme, intent) {
  return loginUrlWithTheme(`/auth/login?next=${encodeURIComponent(HOME_LOGIN_NEXT)}`, theme, intent);
}
