#!/usr/bin/env node
// 리팩터링 전후 화면 비교 도구(#231). 로그아웃 예시 모드만 찍는다(시험 계정 로그인 없음).
//
//   node tools/visual-baseline/visual-baseline.mjs capture --out /mnt/e/base-before
//   node tools/visual-baseline/visual-baseline.mjs capture --base http://127.0.0.1:5173/v41/ --out ./after
//   node tools/visual-baseline/visual-baseline.mjs compare --before ./before --after ./after
//
// compare는 장마다 픽셀 차이 비율을 재고, 차이가 있으면 out 폴더에 diff-*.png를 남긴다.
// 기준치(기본 0.1%)를 넘는 장이 하나라도 있으면 종료 코드 1.

import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULTS = {
  base: 'https://lovetree-4-0.pages.dev/v41/',
  out: path.join(os.tmpdir(), 'lovetree-visual-baseline'),
  threshold: 0.1
};

// 화면 목록: 셸 해시 라우트(로그아웃 예시 모드에서 열리는 순서 그대로)
// expect: 그 화면이 실제로 열렸는지 확인할 iframe 경로 조각. 딥링크가 가끔 이전 화면에 머무르므로 확인 후 다시 연다.
const SCENES = [
  { name: 'home', hash: '', expect: null },
  { name: 'shelf', hash: '#shelf', expect: 'track32-bookshelf' },
  { name: 'book', hash: '#book', expect: 'track59-sketchbook' },
  { name: 'board', hash: '#board', expect: 'track58-pinboard' },
  { name: 'network', hash: '#network', expect: 'track56-network' },
  { name: 'journey', hash: '#journey', expect: 'first-journey' }
];
const WIDTHS = [
  { width: 1440, height: 900, tag: '1440' },
  { width: 390, height: 844, tag: '390' }
];
const THEMES = ['night', 'garden'];

// 흔들리는 요소를 고정한다: 애니메이션·전환 멈춤, 깜빡이는 커서 제거, 알림/토스트 숨김.
// 난수만 고정한다(관계 지도·보드의 배치가 실행마다 달라지지 않게).
// Date·performance.now는 앱의 대기·전환 로직이 쓰므로 건드리지 않는다.
const FREEZE = `(() => {
  if (window.__visualBaselineSeeded) return;
  window.__visualBaselineSeeded = true;
  let seed = 20261108;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
})();`;

const STOP_RAF = `(() => { window.requestAnimationFrame = () => 0; window.scrollTo(0, 0); })();`;

const STABILIZE = `(() => {
  const style = document.createElement('style');
  style.setAttribute('data-visual-baseline', '1');
  style.textContent = '*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;animation-duration:0s!important;transition:none!important;caret-color:transparent!important}#toast,.toast,[role="status"]{visibility:hidden!important}';
  document.documentElement.append(style);
  for (const animation of document.getAnimations?.() || []) { try { animation.pause(); animation.currentTime = 0; } catch {} }
})();`;

async function loadChromium() {
  const candidates = ['playwright-core', '../postdeploy/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try {
      return (await import(candidate)).chromium;
    } catch {}
  }
  throw new Error('playwright-core를 찾지 못했습니다. `cd tools/postdeploy && npm install` 뒤 다시 실행하세요.');
}

// 설치된 크로미움을 찾는다: CHROME_PATH → 저장소 캐시(~/.cache/ms-playwright) → playwright 기본값.
function findChromiumBinary() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    for (const dir of readdirSync(cache).filter((name) => name.startsWith('chromium-')).sort().reverse()) {
      const candidate = path.join(cache, dir, 'chrome-linux64', 'chrome');
      if (existsSync(candidate)) return candidate;
      const legacy = path.join(cache, dir, 'chrome-linux', 'chrome');
      if (existsSync(legacy)) return legacy;
    }
  } catch {}
  return undefined;
}

async function launch(chromium) {
  const executablePath = findChromiumBinary();
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars'];
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), args });
}

// 같은 그림이 두 번 연속 나올 때까지 기다린다(남은 애니메이션·늦게 붙는 내용 흡수).
async function stableShot(page, file) {
  let previous = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const buffer = await page.screenshot({ path: file });
    if (previous && buffer.equals(previous)) return true;
    previous = buffer;
    for (const frame of page.frames()) await frame.evaluate(STOP_RAF).catch(() => {});
    await page.waitForTimeout(250);
  }
  return false;
}

// 해시로 화면을 열고, 그 화면이 실제로 떴는지 iframe 경로로 확인한다(최대 4번).
async function openScene(page, base, scene) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    // 먼저 첫 화면을 띄워 셸이 준비된 뒤 해시로 이동한다(바로 해시로 들어가면 딥링크가 이전 화면에 머무는 일이 있음).
    await page.goto(`${base}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.evaluate((hash) => { location.hash = hash; }, scene.hash || '#home');
    await page.waitForTimeout(600);
    if (!scene.expect) return true;
    const opened = await page
      .waitForFunction((fragment) => {
        const frames = Array.from(document.querySelectorAll('#view, #view-next'));
        return frames.some((frame) => {
          const src = frame.getAttribute('src') || '';
          if (src.includes(fragment)) return true;
          try { return (frame.contentWindow?.location?.href || '').includes(fragment); } catch { return false; }
        });
      }, scene.expect, { timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return true;
  }
  // 열리지 않으면 있는 화면 그대로 찍는다(로그아웃 상태에서 열리지 않는 화면이 있음). 대신 무엇이 찍혔는지 남긴다.
  return false;
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  for (const frame of page.frames()) {
    await frame.evaluate(async () => { try { await document.fonts.ready; } catch {} }).catch(() => {});
  }
  await page.waitForTimeout(700);
  for (const frame of page.frames()) {
    await frame.evaluate(STABILIZE).catch(() => {});
    await frame.evaluate(STOP_RAF).catch(() => {});
  }
  await page.waitForTimeout(150);
}

function shotName(scene, viewport, theme) {
  return `${scene}-${viewport.tag}-${theme}.png`;
}

async function capture(argv) {
  const options = { ...DEFAULTS, ...argv };
  const chromium = await loadChromium();
  const browser = await launch(chromium);
  const out = path.resolve(options.out);
  mkdirSync(out, { recursive: true });
  let count = 0;
  const manifest = [];
  try {
    for (const viewport of WIDTHS) {
      for (const theme of THEMES) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
          colorScheme: 'dark',
          locale: 'ko-KR',
          timezoneId: 'Asia/Seoul'
        });
        await context.addInitScript((value) => {
          try { localStorage.setItem('lt41.theme', value); } catch {}
        }, theme);
        await context.addInitScript(FREEZE);
        const page = await context.newPage();
        for (const scene of SCENES) {
          const opened = await openScene(page, options.base, scene);
          await settle(page);
          const shown = await page.evaluate(() => {
            const frame = document.querySelector('#view') || document.querySelector('#view-next');
            try { return (frame?.contentWindow?.location?.href || '').split('/v41/')[1] || ''; } catch { return ''; }
          }).catch(() => '');
          manifest.push({ shot: shotName(scene.name, viewport, theme), scene: scene.name, opened, shown });
          await stableShot(page, path.join(out, shotName(scene.name, viewport, theme)));
          count += 1;
        }
        // 헤더 오른쪽 계정 자리(로그아웃이면 "로그인" 알약, 로그인이면 동그라미)를 연 상태
        await page.goto(`${options.base}`, { waitUntil: 'domcontentloaded' });
        await settle(page);
        await page.evaluate(() => {
          const entry = document.getElementById('account-entry');
          const avatar = document.getElementById('account-avatar');
          if (avatar && !avatar.hidden) avatar.click();
          else if (entry) entry.focus();
        }).catch(() => {});
        await page.waitForTimeout(400);
        await settle(page);
        await stableShot(page, path.join(out, `account-${viewport.tag}-${theme}.png`));
        count += 1;
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`${count}장 저장: ${out}`);
  const missing = manifest.filter((row) => row.opened === false);
  if (missing.length) console.log(`로그아웃 상태에서 열리지 않은 화면 ${missing.length}장: ${[...new Set(missing.map((row) => row.scene))].join(', ')}`);
  return 0;
}

async function compare(argv) {
  const options = { ...DEFAULTS, ...argv };
  if (!options.before || !options.after) throw new Error('compare에는 --before와 --after 폴더가 필요합니다.');
  const before = path.resolve(options.before);
  const after = path.resolve(options.after);
  const out = path.resolve(options.out);
  mkdirSync(out, { recursive: true });
  for (const dir of [before, after]) if (!existsSync(dir)) throw new Error(`폴더가 없습니다: ${dir}`);

  const names = readdirSync(before).filter((name) => name.endsWith('.png')).sort();
  if (!names.length) throw new Error(`비교할 PNG가 없습니다: ${before}`);

  // 의존성 없이 비교한다: 두 PNG를 브라우저 캔버스에 올려 픽셀을 직접 센다.
  const chromium = await loadChromium();
  const browser = await launch(chromium);
  const page = await browser.newPage();
  const threshold = Number(options.threshold);
  const rows = [];
  let failed = 0;
  try {
    for (const name of names) {
      const afterPath = path.join(after, name);
      if (!existsSync(afterPath)) {
        rows.push({ name, ratio: 100, note: 'after 없음' });
        failed += 1;
        continue;
      }
      const result = await page.evaluate(async ({ a, b }) => {
        const load = (src) => new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('decode'));
          image.src = src;
        });
        const [left, right] = await Promise.all([load(a), load(b)]);
        if (left.width !== right.width || left.height !== right.height) {
          return { ratio: 100, note: `크기 다름 ${left.width}x${left.height} vs ${right.width}x${right.height}`, diff: '' };
        }
        const canvasOf = (image) => {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          canvas.getContext('2d').drawImage(image, 0, 0);
          return canvas;
        };
        const leftCanvas = canvasOf(left), rightCanvas = canvasOf(right);
        const leftData = leftCanvas.getContext('2d').getImageData(0, 0, left.width, left.height).data;
        const rightData = rightCanvas.getContext('2d').getImageData(0, 0, right.width, right.height).data;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = left.width;
        outCanvas.height = left.height;
        const outContext = outCanvas.getContext('2d');
        const outData = outContext.createImageData(left.width, left.height);
        let changed = 0;
        for (let i = 0; i < leftData.length; i += 4) {
          const delta = Math.abs(leftData[i] - rightData[i]) + Math.abs(leftData[i + 1] - rightData[i + 1]) + Math.abs(leftData[i + 2] - rightData[i + 2]) + Math.abs(leftData[i + 3] - rightData[i + 3]);
          if (delta > 12) {
            changed += 1;
            outData.data[i] = 255; outData.data[i + 1] = 0; outData.data[i + 2] = 80; outData.data[i + 3] = 255;
          } else {
            const grey = 255 - Math.round((leftData[i] + leftData[i + 1] + leftData[i + 2]) / 3 / 4);
            outData.data[i] = grey; outData.data[i + 1] = grey; outData.data[i + 2] = grey; outData.data[i + 3] = 255;
          }
        }
        outContext.putImageData(outData, 0, 0);
        const ratio = (changed / (left.width * left.height)) * 100;
        return { ratio, diff: changed ? outCanvas.toDataURL('image/png') : '' };
      }, {
        a: `data:image/png;base64,${Buffer.from((await import('node:fs')).readFileSync(path.join(before, name))).toString('base64')}`,
        b: `data:image/png;base64,${Buffer.from((await import('node:fs')).readFileSync(afterPath)).toString('base64')}`
      });
      const ratio = Number(result.ratio.toFixed(4));
      if (result.diff) {
        writeFileSync(path.join(out, `diff-${name}`), Buffer.from(result.diff.split(',')[1], 'base64'));
      }
      const ok = ratio <= threshold;
      if (!ok) failed += 1;
      rows.push({ name, ratio, note: result.note || (ok ? '' : '기준 초과') });
    }
  } finally {
    await browser.close();
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  console.log(`${'장'.padEnd(width)}  차이(%)  결과`);
  for (const row of rows) {
    console.log(`${row.name.padEnd(width)}  ${row.ratio.toFixed(3).padStart(7)}  ${row.ratio === 0 ? '동일' : row.ratio <= threshold ? '기준 이내' : 'FAIL'} ${row.note}`);
  }
  const worst = Math.max(...rows.map((row) => row.ratio));
  console.log(`\n${rows.length}장 중 차이 ${rows.filter((row) => row.ratio > 0).length}장, 최대 ${worst.toFixed(3)}% (기준 ${threshold}%)`);
  if (failed) console.log(`diff 이미지: ${out}`);
  return failed ? 1 : 0;
}

function parseArgs(list) {
  const argv = {};
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const value = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : 'true';
    argv[key] = value;
  }
  return argv;
}

const [command, ...rest] = process.argv.slice(2);
const argv = parseArgs(rest);
try {
  if (command === 'capture') process.exitCode = await capture(argv);
  else if (command === 'compare') process.exitCode = await compare(argv);
  else {
    console.log('사용법:\n  capture --base <url> --out <폴더>\n  compare --before <폴더> --after <폴더> [--out <폴더>] [--threshold 0.1]');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
