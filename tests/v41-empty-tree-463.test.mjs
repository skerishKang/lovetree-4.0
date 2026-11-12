// #463(2026-11-13) — 트리 0개 계정의 빈 화면 문구·단추 강조와 '빈 트리 미리보기' 그림.
//
// CTO 지적(2026-11-12 18시): ① 첫 화면 문구가 다시 온 사람용("기억은 아직 여기에서 이어지고 있어요"),
// ② "감상 예시 · 내 기록에는 저장되지 않아요"가 모호, ③ 빈 화면에서 '예시 둘러보기'가 강조되고
// '첫 트리 만들기'는 덜 강조, ④ 빈 화면 바탕이 너무 비어 보인다(대표 결정: 점선 빈 카드 3장 + 금빛 실).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const shell = read('public/v41/shell.mjs');
const index = read('public/v41/index.html');
const identity = read('public/v41/identity.css');
const home = read('v41/home.js');

// ── ③ 빈 화면 문구·단추: 로그인(트리 0개)이면 '첫 트리 만들기'가 주 버튼 ──
test('#463 트리 0개 빈 화면 문구는 처음 온 사람용 한 줄이고, 예시 안내를 밝힌다', () => {
  const block = shell.slice(shell.indexOf('function paintEmptyCopy(){'));
  const body = block.slice(0, block.indexOf('\n}\n'));
  assert.match(body, /좋아하는 영상 주소 하나면 시작돼요/, '처음 온 사람용 한 줄(#463 고칠 방향)');
  assert.match(body, /지금 보이는 카드는 예시예요/, '떠 있는 카드가 예시라는 것을 밝힌다');
  assert.doesNotMatch(body, /예시를 둘러보거나 첫 트리를 만들어 보세요/, '옛 문구(다시 온 사람용)가 남아 있지 않다');
});

test('#463 로그인(트리 0개)에서는 "＋ 첫 트리 만들기"가 주 버튼, "예시 둘러보기"는 보조', () => {
  const block = shell.slice(shell.indexOf('function paintEmptyCopy(){'));
  const body = block.slice(0, block.indexOf('\n}\n'));
  assert.match(body, /\+ 첫 트리 만들기|＋ 첫 트리 만들기/, '로그인 상태의 단추 이름');
  // 주 버튼 표시는 계정 상태에 따라 뒤집힌다.
  assert.match(body, /empty-records'?\)\.classList\.toggle\('primary',owned\)|\$\('empty-records'\)\.classList\.toggle\('primary',owned\)/, '첫 트리 만들기가 주 버튼');
  assert.match(body, /\$\('empty-sample'\)\.classList\.toggle\('primary',!owned\)/, '예시 둘러보기는 보조');
});


test('#463 제목·강조는 상태 갱신에도 유지된다(단추 이름·주 버튼이 엇갈리지 않게)', () => {
  // refreshWrite 가 이름을 다시 쓰면 한 곳과 같은 글자여야 하고, 강조도 같이 유지되어야 한다.
  assert.equal((shell.match(/＋ 첫 트리 만들기/g) || []).length >= 2, true, '이름이 두 자리에서 같게 쓰인다');
  assert.doesNotMatch(shell, /textContent=status.writable?'첫 트리 만들기'/, '옵은 글자(＋ 없이)가 남아 있지 않다');
  assert.match(shell, /empty-records'\)\.classList\.toggle\('primary',!!status\.writable\)/, '갱신 뒤에도 주 버튼 표시를 다시 맞춘다');
});
test('#463 로그아웃 문구·단추는 지금 그대로 둔다(2026-11-07 방침)', () => {
  const block = shell.slice(shell.indexOf('function paintEmptyCopy(){'));
  const body = block.slice(0, block.indexOf('\n}\n'));
  assert.match(body, /'다시 펼칠 순간을 기다리고 있어요\.'/, '로그아웃 제목 그대로');
  assert.match(body, /'예시를 둘러보거나 로그인한 계정의 기록을 불러오세요\.'/, '로그아웃 문구 그대로');
  assert.match(body, /'내 기록 불러오기'/, '로그아웃 단추 이름 그대로');
});

// ── 누르면 실제로 그 일이 되는지: 단추 id가 셸의 동작과 이어져 있는지 ──
test('#463 빈 화면 단추 두 개가 실제 동작(첫 트리 만들기·예시 둘러보기)과 이어져 있다', () => {
  assert.match(index, /id="empty-records"/, '첫 트리 만들기 단추');
  assert.match(index, /id="empty-sample"/, '예시 둘러보기 단추');
  assert.match(shell, /\$\('empty-records'\)\.onclick|empty-records'\)\.addEventListener/, '첫 트리 만들기 배선');
  assert.match(shell, /\$\('empty-sample'\)\.onclick|empty-sample'\)\.addEventListener/, '예시 둘러보기 배선');
  // 문구가 말하는 일과 단추가 하는 일이 같은지 — '첫 트리 만들기'는 트리 생성 흐름으로 간다.
  const wiring = shell.slice(shell.indexOf("$('empty-records').onclick"));
  assert.match(wiring.slice(0, 300), /createTree|openTree|newTree|quickAdd|openEditor|startTree/i, '첫 트리 만들기 → 트리 생성 흐름');
});

// ── ① 첫 화면 문구: 트리 0개(순간 없음)면 처음 온 사람용 ──
test('#463 첫 화면 문구는 순간이 하나도 없을 때 처음 온 사람용 한 줄을 준다', () => {
  assert.match(home, /if\(!hasAnyMoment\)label='첫 순간을 남기면 여기서 이어 볼 수 있어요'/, '순간 0개 문구');
  // 다시 온 사람용 문장은 유지하되, 순간 0개에는 위 한 줄이 함께 붙는다.
  assert.match(home, /target\.append\('기억은 아직 여기에서 이어지고 있어요\.'\)/, '한 줄은 그대로');
});

test('#463 예시 카드 안내는 "예시"임을 밝힌다(모호한 옛 문구 제거)', () => {
  // #426 이후 둘째 줄은 안내 한 줄만 — 옛 '감상 예시 · 내 기록에는 저장되지 않아요'는 로그인 화면에서 쓰지 않는다.
  const loginPart = home.slice(home.indexOf('if(loggedIn){'), home.indexOf('const mobileFit='));
  assert.doesNotMatch(loginPart, /감상 예시 · 내 기록에는 저장되지 않아요/, '로그인 첫 화면에 모호한 옛 안내가 없다');
});

// ── ④ 빈 트리 미리보기 그림 ──
test('#463 빈 화면에 점선 빈 카드 3장과 금빛 실 그림이 있다', () => {
  assert.match(index, /id="empty-tree-art"/, '그림 컨테이너');
  const art = index.slice(index.indexOf('id="empty-tree-art"'), index.indexOf('<h1>', index.indexOf('id="empty-tree-art"')));
  assert.equal((art.match(/class="eta-card eta-card-\d"/g) || []).length, 6, '가로 3장 + 세로 3장(한 번에 하나만 보인다)');
  assert.match(art, /class="eta-thread"/, '금빛 실');
  assert.match(identity, /\.eta-card rect\{[^}]*stroke-dasharray/, '카드는 점선');
  assert.match(identity, /\.eta-thread\{[^}]*stroke:var\(--lt-gold\)/, '실은 금빛');
});

test('#463 그림은 장식 — 화면 읽기 프로그램에는 숨긴다', () => {
  assert.match(index, /id="empty-tree-art" class="empty-tree-art" aria-hidden="true"/, 'aria-hidden="true"');
  // 두 SVG 모두 장식으로 선언한다(그림 자체는 낭독하지 않고 옆 문구가 내용을 나른다).
  const art = index.slice(index.indexOf('id="empty-tree-art"'), index.indexOf('<h1>', index.indexOf('id="empty-tree-art"')));
  const svgs = art.match(/<svg[^>]*>/g) || [];
  assert.ok(svgs.length >= 1, '그림 SVG가 있다');
  for (const tag of svgs) assert.match(tag, /role="presentation"/, '모든 SVG가 presentation');
  assert.doesNotMatch(art, /aria-label|<title>/, '읽어 줄 이름을 달지 않는다');
});

test('#463 움직임 줄이기 설정이면 반짝임을 멈춘다', () => {
  const reduced = identity.slice(identity.lastIndexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced, /\.eta-card-1\{animation:none/, '움직임 줄이기에서 애니메이션 없음');
  assert.match(identity, /\.eta-card-1\{animation:eta-breathe/, '기본은 은은한 반짝임');
});

test('#463 움직임은 CSS만 — 가만히 있을 때 화면 그리기 호출(rAF/setInterval) 0', () => {
  // JS로 애니메이션 고리를 돌리면 idle에서도 draw 호출이 남는다. 이 그림은 정적 SVG + CSS 애니메이션이다.
  const artMarkup = index.slice(index.indexOf('id="empty-tree-art"'), index.indexOf('<h1>', index.indexOf('id="empty-tree-art"')));
  assert.doesNotMatch(artMarkup, /<script/, '그림에 스크립트가 없다');
  assert.doesNotMatch(shell.slice(shell.indexOf('function paintEmptyCopy(){')), /requestAnimationFrame/, '빈 화면을 그릴 때 rAF를 돌리지 않는다');
});

test('#463 모바일(390)은 세로 3장, 넓은 화면은 가로 3장 (가로 넘침 0)', () => {
  assert.match(identity, /\.empty-tree-art \.eta-tall\{display:none\}/, '기본은 가로만');
  const mobile = identity.slice(identity.indexOf('@media(max-width:600px)'));
  assert.match(mobile, /\.eta-wide\{display:none\}/, '좁은 화면에서 가로를 숨긴다');
  assert.match(mobile, /\.eta-tall\{display:block\}/, '좁은 화면에서 세로를 보인다');
  assert.match(identity, /\.empty-tree-art\{position:relative;display:block;width:min\(420px,100%\)/, '폭은 화면 안으로');
});

test('#463 흐림(blur)·반투명 겹침을 쓰지 않는다(2026-11-08 대표)', () => {
  const artBlock = identity.slice(identity.lastIndexOf('/* #463(2026-11-13): 트리 0개 빈 화면의'));
  assert.doesNotMatch(artBlock, /filter:blur|backdrop-filter/, '흐림 없음');
});
