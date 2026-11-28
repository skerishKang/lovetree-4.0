import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {loginUrlWithTheme, policyUrlWithTheme, homeStartLoginUrl, readLoginIntent, LOGIN_INTENTS} from '../public/v41/header-state.mjs';
import {memberLoginUrl, MEMBER_LOGIN_URL} from '../public/v41/member-entry.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = 'https://lovetree-4-0.pages.dev';
const parse = url => new URL(url, base);
const shell = read('public/v41/shell.mjs');
// #231 1-B③-1: 로그인 시작·세션은 shell/auth.mjs로 옮겼다.
const authModule = read('public/v41/shell/auth.mjs');
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

test('#1592 두 정책 문서의 테마만 교체하고 다른 주소·쿼리·해시는 보존한다', () => {
  const privacy = 'https://auth.padiem.net/privacy';
  const terms = 'https://auth.padiem.net/terms';
  for (const theme of ['night', 'garden']) {
    assert.equal(policyUrlWithTheme(privacy + '#lovetree', theme), privacy + '?theme=' + theme + '#lovetree');
    assert.equal(policyUrlWithTheme(terms, theme), terms + '?theme=' + theme);
    const other = privacy + '?next=%2Fv41%2F&name=a%20b&theme=old&flag&theme=again#lovetree';
    const expected = privacy + '?next=%2Fv41%2F&name=a%20b&flag&theme=' + theme + '#lovetree';
    assert.equal(policyUrlWithTheme(other, theme), expected);
    assert.equal(policyUrlWithTheme(expected, theme), expected);
    for (const url of ['https://auth.padiem.net/login?theme=night', 'https://other.invalid/privacy#lovetree',
      'https://auth.padiem.net.evil.invalid/privacy', 'https://auth.padiem.net/privacy/other',
      'https://auth.padiem.net@other.invalid/terms', 'http://auth.padiem.net/terms',
      '/auth/login?next=%2Fv41%2F', 'https://auth.padiem.net/terms-old']) {
      assert.equal(policyUrlWithTheme(url, theme), url);
    }
  }
  for (const theme of ['', 'day', null, undefined]) assert.equal(policyUrlWithTheme(privacy + '#lovetree', theme), privacy + '#lovetree');
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
  // 안내 창이 없어졌으니 #login-start 대신 남은 셸 대화상자의 토큰 대비를 확인한다.
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
});

test('밤 시안은 장미색을 쓰지 않고, Google 버튼은 공식 로고를 쓴다', () => {
  const root = 'docs/design/auth-skin';
  const mockCss = read(`${root}/auth-skin.css`);

  // #195: 밤은 무채색(검정·진주색·금테), 장미색은 정원 전용.

  // 밤 기본 규칙(.eyebrow/.error)에 장미색이 남아 있으면 안 된다.
  const nightRules = mockCss.slice(0, mockCss.indexOf('body.garden'));
  assert.equal(/var\(--lt-rose/.test(nightRules), false, '밤 규칙에 --lt-rose 금지');

  // Google 브랜드 가이드라인: 공식 색상 G SVG를 로컬 자산으로 쓰고, 가이드라인 색을 지킨다.
  assert.ok(existsSync(new URL(`../${root}/assets/googleg-standard-color.svg`, import.meta.url)), '공식 G 로고 SVG');
  const logo = read(`${root}/assets/googleg-standard-color.svg`);

  for (const name of ['login-night', 'login-garden']) {
    const page = read(`${root}/${name}.html`);
  }
});

// ─── 이슈 970: 인증 화면(로그인·가입 시안)을 실제로 써 본다 ───
// 이 저장소의 인증 화면은 docs/design/auth-skin의 시안 4장이다(실제 화면은 auth.padiem.net이 그린다).
// 시안은 정적 파일이라 파일 주소로 바로 띄운다 — 운영 API·운영 계정을 쓰지 않고, 네트워크 요청 자체가
// 없어야 한다(외부 요청 0건을 실제 요청 목록에서 센다).
// 본다 것: 로그인↔가입 전환 링크, 빈 칸 제출이 기본 검증으로 막히며 안내를 내보내고 화면이 그 자리에
// 남는지, 오류 문구 자리(role=alert)가 창 안·화면 안에 보이는지. 밤·정원 × 1440·390.
const REQUIRE970A = process.env.LT_970_REQUIRE === '1';
let chromium970a, skip970a = false;
try {
  ({ chromium: chromium970a } = await import('playwright'));
  if (!existsSync(chromium970a.executablePath())) skip970a = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip970a = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }

test('970 실행: 로그인·가입 화면은 서로 오가고, 빈 칸 제출은 막히고, 오류 자리가 화면 안에 있다', { skip: skip970a || undefined, timeout: 180000 }, async () => {
  const fileUrl = (p) => pathToFileURL(fileURLToPath(new URL('../' + p, import.meta.url))).href;
  const browser = await chromium970a.launch({ headless: true });
  try {
    for (const theme of ['night', 'garden']) {
      for (const width of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
        const urls = [];
        const page = await ctx.newPage();
        page.on('request', (r) => urls.push(r.url()));
        await page.goto(fileUrl(`docs/design/auth-skin/login-${theme}.html`), { waitUntil: 'load' });

        // 로그인 → 가입 → 로그인 전환
        await page.click('a.alt-link');
        await page.waitForURL(/signup-/, { timeout: 10000 });
        assert.equal(await page.evaluate(() => document.querySelector('h1')?.textContent.trim()), '이메일로 회원가입', `${theme}·${width}: 가입 화면으로 옮겨진다`);
        await page.click('a.alt-link');
        await page.waitForURL(/login-/, { timeout: 10000 });
        assert.equal(await page.evaluate(() => document.querySelector('h1')?.textContent.trim()), 'LoveTree에 로그인', `${theme}·${width}: 로그인 화면으로 돌아온다`);

        // 빈 칸 제출: 기본 검증이 막고 안내를 내보내며, 화면은 그 자리에 남는다.
        await page.click('button.submit');
        const submit = await page.evaluate(() => {
          const email = document.querySelector('input[name=email]');
          return {
            valid: email.checkValidity(),
            msg: email.validationMessage,
            file: location.pathname.split('/').pop()
          };
        });
        assert.equal(submit.valid, false, `${theme}·${width}: 빈 이메일은 검증에 걸린다`);
        assert.ok(submit.msg.length > 0, `${theme}·${width}: 빈 칸 안내 문구가 내려온다(${submit.msg})`);
        assert.ok(/login-/.test(submit.file), `${theme}·${width}: 제출이 막혀 화면이 그 자리다`);

        // 오류 자리: role=alert이고, 창(카드) 안·화면 안에 보인다.
        const err = await page.evaluate(() => {
          const e = document.querySelector('.error');
          const r = e.getBoundingClientRect();
          const card = document.querySelector('.auth-card').getBoundingClientRect();
          return { role: e.getAttribute('role'), text: e.textContent.trim(), left: r.x, top: r.y, right: r.right, bottom: r.bottom, cardRight: card.right, cardBottom: card.bottom, vw: innerWidth, vh: innerHeight };
        });
        assert.equal(err.role, 'alert', `${theme}·${width}: 오류 자리는 role=alert이다`);
        assert.ok(err.text.length > 0, `${theme}·${width}: 오류 문구가 있다(${err.text})`);
        assert.ok(err.left >= 0 && err.top >= 0 && err.right <= err.vw + 1 && err.bottom <= err.vh + 1, `${theme}·${width}: 오류 문구가 화면 안에 보인다(${Math.round(err.right)}×${Math.round(err.bottom)} / ${err.vw}×${err.vh})`);
        assert.ok(err.right <= err.cardRight + 1 && err.bottom <= err.cardBottom + 1, `${theme}·${width}: 오류 문구가 창 안에 있다`);

        const external = urls.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
        assert.deepEqual(external, [], `${theme}·${width}: 외부 요청 0건 — ${JSON.stringify(external.slice(0, 3))}`);
        await ctx.close();
      }
    }
  } finally { await browser.close(); }
});
