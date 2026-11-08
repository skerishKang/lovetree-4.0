import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appliedTheme} from '../public/v41/header-state.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const navigation = read('public/v41/shell/navigation.mjs');
const themeModule = read('public/v41/shell/theme.mjs');
const html = read('public/v41/views/first-journey.html');
const shell = read('public/v41/shell.mjs');
const css = read('public/v41/identity.css');

// 2026-11-08 정원 테마 2단계: 적용 범위에 첫 여정만 더한다. 안쪽 네 화면은 계속 A다.

function cssBlock(source, selector) {
  const start = source.indexOf(`${selector}{`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

function luminance(hex) {
  const channel = value => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const garden = cssBlock(css, 'html[data-lt-theme=garden]');
const token = raw => {
  const name = raw.replace(/^--/, '');
  const match = garden.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`));
  assert.ok(match, `정원 토큰 --${name}이 있어야 한다`);
  return match[1].toLowerCase();
};

test('정원이면 첫 여정도 정원이고, 밤이면 A, 기억책·보드·지도는 언제나 A다', () => {
  assert.equal(appliedTheme('garden', 'journey'), 'garden');
  assert.equal(appliedTheme('night', 'journey'), 'night');
  // #212: 내 책장도 정원을 받는다(정원=지금 크림색 책장). 2026-11-08: 기억책도 정원을 따라간다.
  assert.equal(appliedTheme('garden', 'shelf'), 'garden');
  assert.equal(appliedTheme('garden', 'book'), 'garden');
  // 기억 보드·관계 지도는 계속 A다.
  for (const view of ['board', 'network', 'inner']) {
    assert.equal(appliedTheme('garden', view), 'night', view);
  }
  // #231 1-B: 화면별 테마 대상은 shell/navigation.mjs에 있다.
  assert.match(navigation, /if \(file === 'first-journey\.html'\) return 'journey';/);
  assert.match(navigation, /if \(file === 'track32-bookshelf\.html'\) return 'shelf';/);
});

test('셸은 첫 여정 iframe에만 테마 속성을 넘기고 화면마다 다시 계산한다', () => {
  assert.match(themeModule, /const applied = applyThemeAttribute\(document\.documentElement, appliedTheme\(theme, themedViewFor\(file\)\)\);/);
  assert.match(themeModule, /const frame = \$\('view'\)\.contentDocument;\n  if \(frame\) applyThemeAttribute\(frame\.documentElement, applied\);/);
  // #211: 화면 두 장이 교대하므로 load 마다 그 화면에 테마를 다시 계산한다.
  assert.match(shell, /function frameLoaded\(frame\)\{\s*applyTheme\(\);/);
  assert.match(shell, /for\(const f of frames\(\)\)f\.addEventListener\('load',\(\)=>frameLoaded\(f\)\);/);
  assert.match(shell, /function openFirstJourney/, '첫 여정은 셸이 여는 iframe 하나뿐이다');
});

test('첫 여정 문서는 셸 테마를 첫 그리기 전에 받고, 단독일 때만 저장값을 읽는다', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /window\.parent!==window\?window\.parent\.document\.documentElement\.getAttribute\('data-lt-theme'\)/);
  assert.match(head, /if\(!ltHostTheme&&window\.parent===window\)ltHostTheme=localStorage\.getItem\('lt41\.theme'\)==='garden'\?'garden':null;/);
  assert.ok(head.indexOf('ltHostTheme') < html.indexOf('<script type="module">'), '모듈 스크립트보다 먼저 실행된다');
  assert.match(head, /catch\(e\)\{\}/, '셸·저장소 접근이 막히면 A로 남는다');
});

test('정원 첫 여정은 크림·잉크·장미 토큰, 정원 테두리·그림자, Gowun Batang 제목, keep-all을 쓴다', () => {
  const start = html.indexOf('html[data-lt-theme=garden]{color-scheme:light}');
  assert.ok(start > 0, '정원 규칙 블록이 있어야 한다');
  const block = html.slice(start, html.indexOf('</style>'));
  assert.match(block, /html\[data-lt-theme=garden\] h1\{font-family:'Gowun Batang',var\(--lt-reading\);font-weight:700/);
  assert.match(block, /\.grow,html\[data-lt-theme=garden\] \.restore,html\[data-lt-theme=garden\] \.moment-card\{border-color:var\(--lt-gold-deep\);box-shadow:var\(--lt-garden-shadow\)\}/);
  assert.match(block, /html\[data-lt-theme=garden\] \.primary\{background:var\(--lt-primary\);color:var\(--lt-primary-ink\)\}/);
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(block), false, '새 hex 색을 쓰지 않는다');
  assert.match(html, /body\{[^}]*word-break:keep-all\}/);
  assert.match(block, /\.eyebrow[^}]*color:var\(--lt-rose-ink\)/, '작은 글자는 진한 장미로 대비를 확보한다');
});

test('정원 첫 여정 글자 대비는 4.5:1 이상이다', () => {
  const pairs = [
    ['--lt-pearl', '--lt-stage'],
    ['--lt-muted', '--lt-stage'],
    ['--lt-muted', '--lt-stage-2'],
    ['--lt-ink', '--lt-paper'],
    ['--lt-gold-ink', '--lt-stage'],
    ['--lt-rose-ink', '--lt-stage'],
    ['--lt-primary-ink', '--lt-primary'],
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrast(token(fg), token(bg));
    assert.ok(ratio >= 4.5, `${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
  }
});

test('단계 구성·뒤로가기 규칙은 정원에서도 그대로다', () => {
  for (const label of ['트리 이름', '첫 순간', '마음 남기기', '다음 영상 잇기', '성장']) assert.match(html, new RegExp(label));
  assert.match(html, /journeyRouteHash/);
  assert.match(html, /addEventListener\('popstate'/);
  assert.match(html, /@keyframes lt-bloom/, '피어남 연출은 그대로다');
});
