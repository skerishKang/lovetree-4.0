// 셸의 화면 목록·경로 선택·테마 대상 계산 (#231 1-B ①).
// 2026-11-08 리팩터링: 동작·겉모습 변경 0. `shell.mjs:214`에 있던 경로 선택을 이 파일 하나로 모은다.
// 1.5단계에서 안쪽 화면 두 벌(design/views/·views/)을 한 벌로 합쳤다(⑥). 화면 경로를 만드는 곳은 여기 하나뿐이다.
// 이름은 그대로 둔다(시험·postdeploy가 화면 파일 이름으로 판정한다).

export const screens = [
  ['home', 'src064-orbit.html', '첫 화면'],
  ['shelf', 'track32-bookshelf.html', '내 책장'],
  ['book', 'track59-sketchbook.html', '기억책'],
  ['board', 'track58-pinboard.html', '기억 보드'],
  ['network', 'track56-network.html', '관계 지도']
];

export const screenForView = view => screens.find(screen => screen[0] === view) || screens[0];
export const viewForFile = file => screens.find(screen => screen[1] === file)?.[0] || 'home';
export const screenTitle = file => screens.find(screen => screen[1] === file)?.[2] || '';

// 테마는 화면마다 다르게 칠한다(2026-11-08 정원 2단계). 첫 화면·첫 여정·책장·기억책만 정원을 받고
// 나머지 안쪽 화면은 밤으로 고정된다.
export function themedViewFor(file) {
  if (file === 'src064-orbit.html') return 'home';
  if (file === 'first-journey.html') return 'journey';
  if (file === 'track32-bookshelf.html') return 'shelf';
  if (file === 'track59-sketchbook.html') return 'book';
  return 'inner';
}

// 안쪽 화면 경로: 예시 감상도 실제 기록도 같은 한 벌(/v41/views/)을 쓴다(#231 1.5단계 ⑥).
// 두 벌을 한 벌로 합쳤으므로 source에 따라 경로를 가르지 않는다.
export function screenUrl(file, source, origin) {
  const path = file === 'src064-orbit.html' ? 'home-typo.html' : 'views/' + file;
  return new URL('/v41/' + path, origin).href;
}
