// #443 결함 수정 — 첫 화면 금빛 내 카드(.card.mine)가 두 테마 모두에서 한눈에 구별되는 계약.
// 소스 계약은 정규식으로 고정하고, 계산된 색 검증은 별도 브라우저 눈 확인에서 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');
const orbitCSS = readFileSync(new URL('../src/views/orbit-source.css', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../public/v41/identity.css', import.meta.url), 'utf8');

const ruleOf = (src, selectorStart) => {
  const at = src.indexOf(selectorStart);
  assert.ok(at >= 0, selectorStart + ' 규칙이 있다');
  return src.slice(at, src.indexOf('}', at) + 1);
};

test('일반 카드는 얇고 차분한 테두리다(진한 금테·금빛 링을 갖지 않는다)', () => {
  const base = ruleOf(orbit, '.card{text-align:left');
  assert.match(base, /border:1px solid rgba\(255,234,183,\.30\)/, '1px 차분한 테두리');
  assert.doesNotMatch(base, /0 0 0 1px/, '기본 카드에는 금빛 링 그림자가 없다');
  assert.doesNotMatch(base, /#f2cd7c/, '기본 카드에 진한 금 3px를 쓰지 않는다');
  const after = ruleOf(orbit, '.card:after{');
  assert.match(after, /border:1px solid rgba\(255,234,183,\.28\)/, '이중선도 차분하게');
});

test('내 카드는 진한 금 테두리 3px + 은은한 금빛 바깥빛이다(토큰만 쓴다)', () => {
  const mine = ruleOf(orbit, '.card.mine{');
  assert.match(mine, /border-width:3px/, '내 카드 테두리는 3px');
  assert.match(mine, /border-color:var\(--lt-gold-deep\)/, '진한 금(--lt-gold-deep: 밤 #e6b14c · 정원 #98505e)');
  assert.match(mine, /0 0 0 1px var\(--lt-gold-line\)/, '이중선 링');
  assert.match(mine, /0 0 20px var\(--lt-gold-glow\)/, '은은한 바깥빛');
  assert.doesNotMatch(mine, /#[0-9a-fA-F]{3,8}\b/, '규칙 본문은 토큰만 쓴다');
  const mineAfter = ruleOf(orbit, '.card.mine:after{');
  assert.match(mineAfter, /border-color:var\(--lt-gold-line\)/);
});

test('정원에서도 .card.mine 규칙이 이긴다(구체성 0-3-1 > 정원 일반 규칙 0-2-1)', () => {
  const gardenMine = ruleOf(orbit, ':host([data-lt-theme=garden]) .card.mine{');
  assert.match(gardenMine, /border-color:var\(--lt-rose\)/, '정원 내 카드는 강조 장밋 테두리(일반 #98505e 1px와 색·두께 모두 다름)');
  assert.match(gardenMine, /box-shadow:var\(--lt-garden-shadow\),0 0 0 1px var\(--lt-gold-line\),0 0 20px var\(--lt-gold-glow\)/, '정원 깊이 그림자 + 금빛 링·바깥빛');
  assert.match(ruleOf(orbit, ':host([data-lt-theme=garden]) .recent-card{'), /border-color:var\(--lt-rose\)/, '마지막 순간 카드도 같은 장밋');
  // identity.css의 정원 일반 규칙(.card·.card.memo)보다 선택자가 길어 이긴다.
  assert.match(identity, /:host\(\[data-lt-theme=garden\]\) \.card\{border-color:var\(--lt-gold-deep\)/);
  assert.match(identity, /:host\(\[data-lt-theme=garden\]\) \.card\.memo\{border-color:var\(--lt-ink\)\}/);
});

test('"마지막 순간" 카드도 내 카드와 같은 진한 금 테두리를 쓴다', () => {
  const recent = ruleOf(orbit, '.recent-card{pointer-events:auto');
  assert.match(recent, /border:3px solid var\(--lt-gold-deep\)/);
  assert.match(recent, /0 0 0 1px var\(--lt-gold-line\)/);
  assert.match(recent, /0 0 22px var\(--lt-gold-glow\)/);
});

test('첫 순간 표식은 12px 글자에 진한 배경·금색 긐자로 읽힌다', () => {
  const mark = ruleOf(orbitCSS, '.firstMark{');
  assert.match(mark, /font-size:12px/, '12px 이상');
  assert.match(mark, /padding:6px 9px/);
  assert.match(mark, /background:rgba\(12,9,6,\.72\)/, '진한 배경');
  assert.match(mark, /color:#ffe6a6/, '금색 긐자');
  assert.doesNotMatch(mark, /216,143,156/, '옛 분홍 테두리를 쓰지 않는다');
});

test('좁은 화면(≤650px)에서 마지막 순간 카드가 화면 안에 온전히 들어온다', () => {
  // 카드 폭은 calc(100vw - 32px)인데 가운데 묶음(.center)이 78vw(700px 이하 규칙)라 카드가 오른쪽으로 넘쳤다(#443 눈 확인).
  // ≤650px에서 .center 폭을 화면-16px로 맞춰 카드(화면-32px)가 가운데에 온전히 들어오게 한다.
  assert.match(orbit, /@media\(max-width:650px\)\{\.center\{width:calc\(100vw - 16px\);max-width:calc\(100vw - 16px\)\}\.recent-card\{width:calc\(100vw - 32px\)\}/);
});

test('불투명·blur 없음·밝기 깊이는 그대로 유지한다(#440 계약)', () => {
  assert.doesNotMatch(orbit, /el\.style\.opacity=/);
  assert.match(orbit, /el\.style\.filter=`brightness\(/);
  // 카드 본체 규칙(.card·.card.mine·정원 .card.mine)에는 반투명·blur가 없다 — 캡션·hover 칩의 글자 투명도는 별개다.
  for (const [src, start] of [[orbitCSS, '.card{position:absolute'], [orbit, '.card.mine{'], [orbit, ':host([data-lt-theme=garden]) .card.mine{']]) {
    const body = ruleOf(src, start);
    assert.doesNotMatch(body, /opacity\s*:/, '카드 본체 반투명 없음: ' + start);
    assert.doesNotMatch(body, /blur/, '카드 본체 blur 없음: ' + start);
  }
});
