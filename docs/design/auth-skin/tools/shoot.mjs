// auth-skin 시안 스크린샷 생성기.
// 1440·390 두 폭으로 4개 시안을 찍고, 외부 URL 요청이 0건인지 함께 검사한다.
// 사용: node docs/design/auth-skin/tools/shoot.mjs
// playwright는 저장소 의존성이 아니다(CI 설치 시간을 늘리지 않기 위해).
// 전역 설치본을 쓰고, 경로가 다르면 PLAYWRIGHT_ROOT 환경 변수로 지정한다.
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, resolve} from 'node:path';
import {execSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = resolve(root, 'screenshots');

function playwrightRoot() {
  const candidates = [process.env.PLAYWRIGHT_ROOT, resolve(here, 'node_modules')];
  try {
    candidates.push(resolve(execSync('npm root -g', {encoding: 'utf8'}).trim(), 'playwright'));
  } catch { /* npm이 없으면 건너뛴다 */ }
  try {
    candidates.push(resolve(execSync('npm root -g', {encoding: 'utf8', shell: 'cmd.exe'}).trim(), 'playwright'));
  } catch { /* 위와 같음 */ }
  const found = candidates.find(path => path && existsSync(resolve(path, 'package.json')));
  if (!found) throw new Error('playwright를 찾지 못했습니다. PLAYWRIGHT_ROOT에 설치 경로를 지정하세요.');
  return found;
}

const playwright = await import(pathToFileURL(resolve(playwrightRoot(), 'index.js')).href);
const {chromium} = playwright.default ?? playwright;

const pages = ['login-night', 'login-garden', 'signup-night', 'signup-garden'];
const widths = [1440, 390];

const browser = await chromium.launch({channel: process.env.PW_CHANNEL || 'chrome'});
const external = [];

for (const width of widths) {
  const context = await browser.newContext({
    viewport: {width, height: width === 1440 ? 900 : 844},
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  context.on('request', request => {
    const url = request.url();
    if (!url.startsWith('file:') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(`${width} ${url}`);
    }
  });

  for (const name of pages) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(pathToFileURL(resolve(root, `${name}.html`)).href, {waitUntil: 'load'});
    // 글꼴·이미지가 모두 로컬에서 끝날 때까지 기다린다.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({path: resolve(shots, `${name}-${width}.png`), fullPage: false});
    if (errors.length) console.error(`${name}-${width} pageerror: ${errors.join(' | ')}`);
    await page.close();
  }
  await context.close();
}

await browser.close();

if (external.length) {
  console.error(`외부 요청 ${external.length}건:`);
  for (const line of external) console.error('  ' + line);
  process.exit(1);
}
console.log(`스크린샷 ${pages.length * widths.length}장 생성, 외부 요청 0건.`);
