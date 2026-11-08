import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {loginUrlWithTheme, homeStartLoginUrl, readLoginIntent, LOGIN_INTENTS} from '../public/v41/header-state.mjs';
import {memberLoginUrl, MEMBER_LOGIN_URL} from '../public/v41/member-entry.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = 'https://lovetree-4-0.pages.dev';
const parse = url => new URL(url, base);
const shell = read('public/v41/shell.mjs');
const index = read('public/v41/index.html');
const home = read('v41/home.js');
const css = read('public/v41/identity.css');
const shellCss = read('public/v41/shell.css');

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

const nightSource = css.slice(0, css.indexOf('html[data-lt-theme=garden]'));
const gardenBlock = cssBlock(css, 'html[data-lt-theme=garden]');
const token = (source, name) => {
  const match = source.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`));
  assert.ok(match, `--${name} token`);
  return match[1].toLowerCase();
};

test('lt_theme는 night|garden만 /auth/login에 실리고 그 외 값은 빠진다', () => {
  for (const theme of ['night', 'garden']) {
    const url = parse(loginUrlWithTheme('/auth/login?next=%2Fv41%2F', theme));
    assert.equal(url.pathname, '/auth/login');
    assert.equal(url.searchParams.get('lt_theme'), theme);
    assert.equal(url.searchParams.get('next'), '/v41/');
    assert.equal(url.searchParams.getAll('lt_theme').length, 1);
    assert.equal(parse(memberLoginUrl(theme)).searchParams.get('lt_theme'), theme);
  }
  for (const theme of ['', 'day', 'GARDEN', 'night ', 'garden\n', 'dark', null, undefined]) {
    const url = parse(loginUrlWithTheme('/auth/login?next=%2Fv41%2F&lt_theme=evil', theme));
    assert.equal(url.searchParams.has('lt_theme'), false, String(theme));
    assert.equal(url.searchParams.get('next'), '/v41/');
  }
});

test('로그인 intent는 new-tree|shelf만 next에 실리고 모르는 값은 받지 않는다', () => {
  assert.deepEqual(LOGIN_INTENTS, ['new-tree', 'shelf']);
  for (const intent of ['new-tree', 'shelf']) {
    const url = parse(loginUrlWithTheme(MEMBER_LOGIN_URL, 'garden', intent));
    assert.equal(url.searchParams.get('next'), `/v41/?intent=${intent}`);
    assert.equal(url.searchParams.get('lt_theme'), 'garden');
  }
  const invalid = parse(loginUrlWithTheme('/auth/login?next=%2Fv41%2F%3Fintent%3Devil', 'night', 'evil'));
  assert.equal(invalid.searchParams.get('next'), '/v41/');
  assert.equal(readLoginIntent('?intent=shelf'), 'shelf');
  assert.equal(readLoginIntent('?intent=new-tree'), 'new-tree');
  assert.equal(readLoginIntent('?intent=evil'), '');
  assert.equal(readLoginIntent(''), '');
  assert.equal(homeStartLoginUrl('night', 'new-tree'), '/auth/login?next=%2Fv41%2F%3Fintent%3Dnew-tree&lt_theme=night');
  assert.equal(homeStartLoginUrl(), '/auth/login?next=%2Fv41%2F');
});

test('안내 창은 의도별 문구와 로그인/회원가입/닫기 포커스 복귀를 가진다', () => {
  for (const text of ['새 트리는 로그인하면 만들 수 있어요', '내 책장은 로그인하면 볼 수 있어요', '로그인하고 시작하기']) {
    assert.ok(shell.includes(text), text);
  }
  assert.match(shell, /function openLoginStart\(intent='first'\)/);
  assert.match(shell, /login-start-copy/);
  assert.match(shell, /login-start-signup/);
  assert.match(shell, /function restoreLoginFocus\(\)/);
  assert.match(shell, /addEventListener\('close',restoreLoginFocus\)/);
  assert.match(shell, /addEventListener\('cancel'/);
  assert.match(shell, /lt41-login-focus/);
  assert.match(home, /loginFocusButton/);
  assert.match(home, /lt41-login-focus/);
  assert.match(shell, /openLoginStart\('shelf'\)/);
  assert.match(shell, /show\('track32-bookshelf\.html'\)/);
  assert.match(shell, /pendingLoginIntent/);
  assert.match(index, /id="login-start-signup"/);
  assert.match(index, /id="login-start-copy"/);
  assert.match(index, /이메일로 회원가입/);
  assert.match(home, /newButton\.onclick=\(\)=>bridge\.actions\.requestMoment\('new'\)/);
  assert.match(home, /treesButton\.onclick=\(\)=>bridge\.actions\.navigate\('trees'\)/);
});

test('밤·정원 안내 창 글자 대비는 4.5:1 이상이다', () => {
  const pairs = [
    ['night', '--lt-pearl', '--lt-stage'],
    ['night', '--lt-muted', '--lt-stage'],
    ['night', '--lt-primary-ink', '--lt-primary'],
    ['garden', '--lt-ink', '--lt-paper'],
    ['garden', '--lt-muted', '--lt-paper'],
    ['garden', '--lt-primary-ink', '--lt-primary'],
    ['garden', '--lt-rose-ink', '--lt-paper'],
  ];
  for (const [theme, fg, bg] of pairs) {
    const source = theme === 'night' ? nightSource : gardenBlock;
    const ratio = contrast(token(source, fg.slice(2)), token(source, bg.slice(2)));
    assert.ok(ratio >= 4.5, `${theme} ${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
  }
  assert.match(shellCss, /#login-start\{[^}]*border:1px solid var\(--lt-gold-line\)/);
  assert.match(shellCss, /html\[data-lt-theme=garden\] #login-start\{[^}]*background:var\(--lt-paper\)/);
  assert.match(shellCss, /#login-start-signup\{[^}]*color:var\(--lt-pearl\)/);
});

test('auth-skin 시안은 로컬 자산만 쓰고 1440·390 스크린샷이 있다', () => {
  const root = 'docs/design/auth-skin';
  const files = ['login-night.html', 'login-garden.html', 'signup-night.html', 'signup-garden.html', 'auth-skin.css', 'README.md'];
  for (const file of files) assert.ok(existsSync(new URL(`../${root}/${file}`, import.meta.url)), file);
  for (const name of ['login-night', 'login-garden', 'signup-night', 'signup-garden']) {
    for (const width of [1440, 390]) {
      assert.ok(existsSync(new URL(`../${root}/screenshots/${name}-${width}.png`, import.meta.url)), `${name}-${width}`);
    }
  }
  const html = ['login-night', 'login-garden', 'signup-night', 'signup-garden'].map(name => read(`${root}/${name}.html`)).join('\n');
  const mockCss = read(`${root}/auth-skin.css`);
  assert.equal(/https?:\/\//i.test(html + mockCss), false, 'mockups must have no external URL');
  assert.match(mockCss, /--lt-stage:\s*#040407/);
  assert.match(mockCss, /body\.garden\s*\{[^}]*--lt-stage:\s*#f7f0e8/);
  assert.match(mockCss, /GowunBatang-Bold\.latin\.woff2/);
});

test('밤 시안은 장미색을 쓰지 않고, Google 버튼은 공식 로고를 쓴다', () => {
  const root = 'docs/design/auth-skin';
  const mockCss = read(`${root}/auth-skin.css`);

  // #195: 밤은 무채색(검정·진주색·금테), 장미색은 정원 전용.
  assert.match(mockCss, /\.eyebrow\s*\{[^}]*color:\s*var\(--lt-muted\)/, '밤 머리글은 --lt-muted');
  assert.match(mockCss, /\.error\s*\{[^}]*color:\s*var\(--lt-pearl\)/, '밤 오류 문구는 --lt-pearl');
  assert.match(mockCss, /body\.garden \.eyebrow\s*\{[^}]*var\(--lt-rose-ink\)/, '정원 머리글은 그대로');
  assert.match(mockCss, /body\.garden \.error\s*\{[^}]*var\(--lt-rose-ink\)/, '정원 오류 문구는 그대로');

  // 밤 기본 규칙(.eyebrow/.error)에 장미색이 남아 있으면 안 된다.
  const nightRules = mockCss.slice(0, mockCss.indexOf('body.garden'));
  assert.equal(/var\(--lt-rose/.test(nightRules), false, '밤 규칙에 --lt-rose 금지');

  // Google 브랜드 가이드라인: 공식 색상 G SVG를 로컬 자산으로 쓰고, 가이드라인 색을 지킨다.
  assert.ok(existsSync(new URL(`../${root}/assets/googleg-standard-color.svg`, import.meta.url)), '공식 G 로고 SVG');
  const logo = read(`${root}/assets/googleg-standard-color.svg`);
  for (const color of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) assert.ok(logo.includes(color), color);
  assert.match(mockCss, /--lt-google-fill:\s*#131314/, '밤 Google 버튼 바탕');
  assert.match(mockCss, /--lt-google-stroke:\s*#8e918f/, '밤 Google 버튼 테두리');
  assert.match(mockCss, /--lt-google-font:\s*#e3e3e3/, '밤 Google 버튼 글자');
  assert.match(mockCss, /--lt-google-fill:\s*#ffffff/, '정원 Google 버튼 바탕');
  assert.match(mockCss, /--lt-google-stroke:\s*#747775/, '정원 Google 버튼 테두리');
  assert.match(mockCss, /--lt-google-font:\s*#1f1f1f/, '정원 Google 버튼 글자');

  for (const name of ['login-night', 'login-garden']) {
    const page = read(`${root}/${name}.html`);
    assert.match(page, /class="btn google"/, `${name} Google 버튼`);
    assert.match(page, /src="assets\/googleg-standard-color\.svg"/, `${name} 공식 로고`);
    assert.match(page, /Google 계정으로 계속/, `${name} 가이드라인 문구`);
    assert.equal(/<span class="g">G<\/span>/.test(page), false, `${name} 동그라미 글자 G 금지`);
  }
});
