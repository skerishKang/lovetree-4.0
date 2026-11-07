// 4.1 상단 메뉴 배치(대표 결정 2026-11-07)의 표시 규칙만 담는 순수 모듈.
// DOM·인증·저장을 건드리지 않는다. 셸(shell.mjs)과 첫 화면(v41/home.js)이 같은 규칙을 쓰고,
// 시험은 이 함수들만 호출한다.

const clean = value => (typeof value === 'string' ? value.trim() : '');

// 로그인 상태의 계정 표시: 글자 알약 대신 첫 글자 동그라미.
// 로그아웃 상태는 기존 "로그인" 알약을 그대로 쓴다(모양이 확실히 달라야 한다).
export function accountPresentation({ owned = false, email = '', subject = '' } = {}) {
  if (!owned) return { mode: 'login', label: '로그인', initial: '', ariaLabel: null, title: '로그인' };
  const address = clean(email);
  const source = address || clean(subject);
  const initial = firstLetter(source);
  const who = address || '내 계정';
  return {
    mode: 'avatar',
    label: who,
    initial,
    ariaLabel: `내 계정 메뉴, ${who}로 로그인됨`,
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
        { key: 'resume', label: '이어 보던 순간', emphasis: false, disabled: true, title: '아직 이어 볼 순간이 없어요' },
        { key: 'new', label: '새 트리 만들기', emphasis: true, disabled: false, title: '새 트리의 첫 순간을 기록합니다.' },
        { key: 'trees', label: '내 책장', emphasis: false, disabled: false, title: '내 책장을 엽니다.' }
      ]
    };
  }
  return {
    state: 'in-trees',
    buttons: [
      { key: 'resume', label: '이어 보던 순간', emphasis: true, disabled: false, title: '마지막으로 보던 순간을 엽니다.' },
      { key: 'new', label: '새 트리 만들기', emphasis: false, disabled: false, title: '새 트리의 첫 순간을 기록합니다.' },
      { key: 'trees', label: '내 책장', emphasis: false, disabled: false, title: '내 책장을 엽니다.' }
    ]
  };
}

// 로그아웃 상태의 첫 버튼은 로그인/가입으로 가고, 돌아올 곳은 4.1 첫 화면이다.
export const HOME_LOGIN_NEXT = '/v41/';
export function homeStartLoginUrl() {
  return `/auth/login?next=${encodeURIComponent(HOME_LOGIN_NEXT)}`;
}
