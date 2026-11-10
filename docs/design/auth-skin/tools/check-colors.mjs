// auth-skin 시안의 계산된 색을 검사한다.
// 1) 밤 시안에 장미색(--lt-rose 계열)이 남아 있지 않은지
// 2) Google 버튼이 가이드라인 색·로고를 쓰는지
// 사용: node docs/design/auth-skin/tools/check-colors.mjs
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, resolve} from 'node:path';
import {execSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function playwrightRoot() {
  const candidates = [process.env.PLAYWRIGHT_ROOT, resolve(here, 'node_modules')];
  try {
    candidates.push(resolve(execSync('npm root -g', {encoding: 'utf8'}).trim(), 'playwright'));
  } catch { /* npm이 없으면 건너뛴다 */ }
  const found = candidates.find(path => path && existsSync(resolve(path, 'package.json')));
  if (!found) throw new Error('playwright를 찾지 못했습니다. PLAYWRIGHT_ROOT에 설치 경로를 지정하세요.');
  return found;
}

const playwright = await import(pathToFileURL(resolve(playwrightRoot(), 'index.js')).href);
const {chromium} = playwright.default ?? playwright;

// --lt-rose 계열(밤/정원)과 그 파생색. 밤 화면에서는 하나도 나오면 안 된다.
const ROSE = ['#d88f9c', '#bd5d72', '#c86e79', '#98505e', '#f3a8b6', '#e5a5af'];

const browser = await chromium.launch({channel: process.env.PW_CHANNEL || 'chrome'});
const failures = [];
const report = [];

for (const name of ['login-night', 'signup-night', 'login-garden', 'signup-garden']) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  await page.goto(pathToFileURL(resolve(root, `${name}.html`)).href, {waitUntil: 'load'});
  await page.evaluate(() => document.fonts.ready);

  const data = await page.evaluate(() => {
    const rgb = value => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(',').map(Number);
      return {hex: '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''), a};
    };
    const pick = (selector, props) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      const out = {};
      for (const prop of props) out[prop] = style.getPropertyValue(prop);
      return out;
    };
    const all = [];
    for (const el of document.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      for (const prop of ['color', 'background-color', 'border-top-color', 'outline-color']) {
        const parsed = rgb(style.getPropertyValue(prop));
        if (parsed) all.push({selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''), prop, ...parsed});
      }
    }
    return {
      colors: all,
      eyebrow: pick('.eyebrow', ['color']),
      error: pick('.error', ['color']),
      google: pick('.btn.google', ['background-color', 'border-top-color', 'color', 'font-family', 'font-size', 'border-radius', 'min-height']),
      googleLogo: (() => {
        const img = document.querySelector('.btn.google .g-logo');
        if (!img) return null;
        const box = img.getBoundingClientRect();
        return {src: img.getAttribute('src'), natural: [img.naturalWidth, img.naturalHeight], box: [Math.round(box.width), Math.round(box.height)], alt: img.getAttribute('alt')};
      })(),
      googleText: (() => {
        const el = document.querySelector('.btn.google');
        return el ? el.textContent.trim() : null;
      })(),
    };
  });

  const isNight = name.endsWith('night');
  const roseHits = data.colors.filter(c => ROSE.includes(c.hex) && c.a > 0);

  report.push({
    name,
    eyebrow: data.eyebrow?.color,
    error: data.error?.color,
    google: data.google,
    logo: data.googleLogo,
    text: data.googleText,
    roseHits: roseHits.length,
  });

  if (isNight && roseHits.length) {
    for (const hit of roseHits) failures.push(`${name}: 장미색 ${hit.hex} (${hit.selector} ${hit.prop})`);
  }
  // Google 버튼은 로그인 시안에만 있다(회원가입은 이름·이메일·비밀번호만).
  if (name.startsWith('login')) {
    if (!data.google) failures.push(`${name}: Google 버튼(.btn.google) 없음`);
    if (!data.googleLogo) failures.push(`${name}: 공식 G 로고 이미지 없음`);
  }  await page.close();
}

await browser.close();

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('\n실패:');
  for (const line of failures) console.error('  ' + line);
  process.exit(1);
}
console.log('\n계산된 색 검사 통과: 밤 시안에 장미색 0건, Google 버튼·로고 확인.');
