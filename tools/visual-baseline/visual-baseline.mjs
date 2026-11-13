#!/usr/bin/env node
// 리팩터링 전후 화면 비교 도구(#231). 로그아웃 예시 모드만 찍는다(시험 계정 로그인 없음).
//
//   node tools/visual-baseline/visual-baseline.mjs capture --out /mnt/e/base-before
//   node tools/visual-baseline/visual-baseline.mjs capture --base http://127.0.0.1:5173/v41/ --out ./after
//   node tools/visual-baseline/visual-baseline.mjs compare --before ./before --after ./after
//
// 흔들림 고정은 "보이는 iframe 안쪽"에서만 한다. 셸 문서의 rAF·타이머는 건드리지 않는다
// (셸 화면 교체가 rAF 두 번을 기다리므로 셸 rAF를 멈추면 화면이 바뀌지 않는다).

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 화면별 기준치(%). 기억 보드는 실·핀 선을 매 로드마다 미세하게 다시 그려 0.1%를 넘는 장이 나온다
// (정리는 리팩터링 3단계 예정, #231).
const SCENE_THRESHOLDS = { board: 0.5 };

const DEFAULTS = {
  base: 'https://lovetree-4-0.pages.dev/v41/',
  out: path.join(os.tmpdir(), 'lovetree-visual-baseline'),
  threshold: 0.1
};

// 화면 목록. expect: 보이는 iframe이 실제로 열어야 하는 파일 이름.
// 첫 여정 주소는 `#journey`가 아니라 `#journey/00`(first-journey.mjs JOURNEY_ROUTE_PREFIX).
// Pages는 `.html` 없이도 같은 화면을 준다(iframe 주소가 .../design/views/track59-sketchbook 형태).
const SCENES = [
  { name: 'home', hash: '', expect: '/v41/home' },
  { name: 'shelf', hash: '#shelf', expect: 'track32-bookshelf' },
  { name: 'book', hash: '#book', expect: 'track59-sketchbook' },
  { name: 'board', hash: '#board', expect: 'track58-pinboard' },
  { name: 'network', hash: '#network', expect: 'track56-network' }
];

// 헤더 오른쪽 계정 자리(로그아웃이면 "로그인" 알약)를 연 상태도 기준선에 넣는다.
const ACCOUNT = { name: 'account', hash: '', expect: '/v41/home', openAccount: true };
const WIDTHS = [
  { width: 1440, height: 900, tag: '1440' },
  { width: 390, height: 844, tag: '390' }
];
const THEMES = ['night', 'garden'];

// 안쪽 화면에서만 시간·난수를 고정한다(셸은 실제 시계·rAF 그대로).
// 궤도·관계 지도처럼 캔버스로 그리는 화면이 실행마다 같은 그림이 되게 한다.
const FREEZE_INNER = `(() => {
  if (window.top === window) return;
  if (window.__visualBaselineFrozen) return;
  window.__visualBaselineFrozen = true;
  let seed = 20261108;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  try { performance.now = () => 0; } catch {}
  const RealDate = Date;
  Date.now = () => 1762580400000;
  window.Date = new Proxy(RealDate, {
    construct(target, args) { return new target(...(args.length ? args : [1762580400000])); },
    get(target, key) { return key === 'now' ? () => 1762580400000 : target[key]; }
  });
})();`;

// 화면이 다 열린 뒤 안쪽 문서에만 거는 고정 장치: CSS 애니메이션 정지·커서 제거·토스트 숨김.
const STABILIZE = `(() => {
  if (document.querySelector('style[data-visual-baseline]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-visual-baseline', '1');
  style.textContent = '*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;animation-duration:0s!important;transition:none!important;caret-color:transparent!important}#toast,.toast,[role="status"]{visibility:hidden!important}';
  document.documentElement.append(style);
  for (const animation of document.getAnimations?.() || []) {
    try {
      const timing = animation.effect?.getComputedTiming?.() || {};
      if (Number.isFinite(timing.duration) && Number.isFinite(timing.iterations)) animation.finish();
      else { animation.pause(); animation.currentTime = 0; }
    } catch {}
  }
  try { window.scrollTo(0, 0); } catch {}
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

// 지금 "보이는" iframe(#view 또는 #view-next, hidden 아님)의 주소. 두 장 교대 구조라 둘 다 본다.
async function visibleFrameUrl(page) {
  return page.evaluate(() => {
    const frames = [...document.querySelectorAll('#view, #view-next')].filter((frame) => !frame.hidden);
    const frame = frames[frames.length - 1];
    try { return frame?.contentWindow?.location?.href || ''; } catch { return ''; }
  }).catch(() => '');
}

// 기대 화면이 보이는 iframe에 실제로 열릴 때까지 기다린다(최대 timeoutMs).
async function waitForScene(page, expect, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const href = await visibleFrameUrl(page);
    last = href;
    if (href.includes(expect)) {
      const frame = page.frames().find((item) => item !== page.mainFrame() && item.url().includes(expect));
      if (frame) {
        const ready = await frame.evaluate(() => document.readyState).catch(() => 'loading');
        if (ready === 'complete') {
          await frame.evaluate(async () => { try { await document.fonts.ready; } catch {} }).catch(() => {});
          return { frame, href };
        }
      }
    }
    await page.waitForTimeout(200);
  }
  return { frame: null, href: last };
}

async function openScene(page, base, scene) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`${base}${scene.hash}`, { waitUntil: 'domcontentloaded' });
    if (!scene.hash) {
      const home = await waitForScene(page, scene.expect);
      if (home.frame) return home;
      continue;
    }
    // 딥링크가 셸 준비 전에 들어오면 첫 화면에 머무는 경우가 있어, 준비된 뒤 해시를 다시 건다.
    let result = await waitForScene(page, scene.expect);
    if (result.frame) return result;
    await page.evaluate((hash) => { location.hash = hash; }, scene.hash).catch(() => {});
    result = await waitForScene(page, scene.expect);
    if (result.frame) return result;
  }
  return { frame: null, href: await visibleFrameUrl(page) };
}

// 안쪽 화면에만 고정 장치를 걸고, 같은 그림이 두 번 연속 나올 때까지 기다린다.
const SETTLE_SHELL = `(() => {
  if (document.querySelector('style[data-visual-baseline-shell]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-visual-baseline-shell', '1');
  style.textContent = '#view,#view-next{transform:none!important;opacity:1!important;animation:none!important;transition:none!important}';
  document.documentElement.append(style);
  for (const animation of document.getAnimations?.() || []) { try { animation.finish(); } catch {} }
})();`;

// 그림·글꼴이 다 익을 때까지 기다린다(#347 조사: font-display:swap 때문에 글꼴이 늦게 오면
// 대체 글꼴 상태 그대로 두 장이 같아져 저장되고, 그림도 마찬가지라 실행마다 다른 그림이 나온다).
const WAIT_ASSETS = `(async () => {
  const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
  try { await withTimeout(document.fonts.ready, 8000); } catch {}
  const seen = new Set();
  const collect = (root) => {
    for (const img of root.querySelectorAll('img')) seen.add(img);
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot);
  };
  try { collect(document); } catch {}
  await Promise.all([...seen].map((img) => (img.decode ? withTimeout(img.decode().catch(() => {}), 8000) : Promise.resolve())));
})()`;

// 아직 내려받는 중인 그림·글꼴이 남아 있으면 0보다 크게 나온다(그림은 완료·실패 모두 complete가 된다).
const ASSETS_PENDING = `(() => {
  let pending = 0;
  const collect = (root) => {
    for (const img of root.querySelectorAll('img')) if (!img.complete) pending += 1;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot);
  };
  try { collect(document); } catch {}
  try { pending += [...document.fonts].filter((face) => face.status === 'loading').length; } catch {}
  return pending;
})()`;

async function settleInside(frame, page) {
  // 화면 교체 애니메이션이 소수점 배율로 남으면 같은 화면도 픽셀이 흔들리므로, 다 열린 뒤 배율을 1로 고정한다.
  await page.evaluate(SETTLE_SHELL).catch(() => {});
  await frame.evaluate(STABILIZE).catch(() => {});
  // 글꼴·그림을 먼저 다 읽혀 둔다. 읽는 중 상태도 "두 장이 같은" 안정 상태라 그대로 저장될 수 있다.
  await frame.evaluate(WAIT_ASSETS).catch(() => {});
  await page.evaluate(WAIT_ASSETS).catch(() => {});
  // 데이터 요청도 기다린다 — 늦게 도착한 데이터는 패널 높이를 바꿔 지도 배치를 다시 그린다.
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(200);
}

// 남은 그림·글꼴이 없고, 자료 요청도 새로 늘어나지 않을 때까지 기다린다(최대 6초). true면 자료 다 익음.
async function assetsReady(frame, page) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const inside = await frame.evaluate(ASSETS_PENDING).catch(() => 0);
    const shell = await page.evaluate(ASSETS_PENDING).catch(() => 0);
    const before = await page.evaluate(() => performance.getEntriesByType('resource').length).catch(() => 0);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => performance.getEntriesByType('resource').length).catch(() => 0);
    if (inside === 0 && shell === 0 && before === after) return true;
  }
  return false;
}

async function stableShot(frame, page, file) {
  await settleInside(frame, page);
  let previous = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // 자료가 다 익지 않았으면 찍지 않고 기다린다 — 읽는 중 화면도 "안정"으로 둔갑하기 때문.
    if (!(await assetsReady(frame, page))) { previous = null; await settleInside(frame, page); continue; }
    const buffer = await page.screenshot();
    if (previous && buffer.equals(previous)) {
      writeFileSync(file, buffer);
      return true;
    }
    previous = buffer;
    await settleInside(frame, page);
    if (!(await assetsReady(frame, page))) { previous = null; continue; }
    await page.waitForTimeout(250);
  }
  writeFileSync(file, previous);
  return false;
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
  const manifest = [];
  let count = 0;
  let unstable = 0;
  try {
    for (const viewport of WIDTHS) {
      for (const theme of THEMES) {
        for (const scene of [...SCENES, ACCOUNT]) {
          // 장마다 새 context·새 페이지. 크기·테마는 context를 만들 때 정하고, 같은 페이지에서 크기를 바꾸지 않는다.
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
          await context.addInitScript(FREEZE_INNER);
          const page = await context.newPage();
          const name = scene.openAccount ? `account-${viewport.tag}-${theme}.png` : shotName(scene.name, viewport, theme);
          try {
            const { frame, href } = await openScene(page, options.base, scene);
            if (!frame) {
              manifest.push({ shot: name, scene: scene.name, opened: false, shown: href });
              console.log(`! ${name}: 화면이 열리지 않음 (${href || '주소 없음'})`);
              unstable += 1;
              continue;
            }
            if (scene.openAccount) {
              await page.evaluate(() => {
                const entry = document.getElementById('account-entry');
                const avatar = document.getElementById('account-avatar');
                if (avatar && !avatar.hidden) avatar.click();
                else if (entry) entry.focus();
              }).catch(() => {});
              await page.waitForTimeout(400);
            }
            const stable = await stableShot(frame, page, path.join(out, name));
            manifest.push({ shot: name, scene: scene.name, opened: true, shown: href, stable });
            if (!stable) unstable += 1;
            count += 1;
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`${count}장 저장: ${out}`);
  console.log(`도착 ${manifest.filter((row) => row.opened).length}장 / 고정 실패 ${unstable}장`);
  return unstable ? 1 : 0;
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
  const thresholdFor = (name, note) => (/\["?크기 다름|after 없음/.test(note) ? threshold : SCENE_THRESHOLDS[name.split('-')[0]] ?? threshold);
  const rows = [];
  let failed = 0;
  try {
    for (const name of names) {
      const afterPath = path.join(after, name);
      if (!existsSync(afterPath)) {
        rows.push({ name, ratio: 100, limit: threshold, note: 'after 없음' });
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
        const leftData = canvasOf(left).getContext('2d').getImageData(0, 0, left.width, left.height).data;
        const rightData = canvasOf(right).getContext('2d').getImageData(0, 0, left.width, left.height).data;
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
        a: `data:image/png;base64,${readFileSync(path.join(before, name)).toString('base64')}`,
        b: `data:image/png;base64,${readFileSync(afterPath).toString('base64')}`
      });
      const ratio = Number(result.ratio.toFixed(4));
      if (result.diff) writeFileSync(path.join(out, `diff-${name}`), Buffer.from(result.diff.split(',')[1], 'base64'));
      const limit = thresholdFor(name, result.note || '');
      const ok = ratio <= limit;
      if (!ok) failed += 1;
      rows.push({ name, ratio, limit, note: result.note || (ok ? '' : `기준 초과(${limit}%)`) });
    }
  } finally {
    await browser.close();
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  console.log(`${'장'.padEnd(width)}  차이(%)  결과`);
  for (const row of rows) {
    console.log(`${row.name.padEnd(width)}  ${row.ratio.toFixed(3).padStart(7)}  ${row.ratio === 0 ? '동일' : row.ratio <= row.limit ? '기준 이내' : 'FAIL'} ${row.note}`);
  }
  // CI(미리보기 검사)가 표를 그릴 수 있게 결과를 JSON으로도 남긴다(2026-11-08).
  if (options.json && options.json !== 'true') {
    writeFileSync(path.resolve(options.json), JSON.stringify({
      before, after, out,
      threshold: Number(options.threshold),
      shots: rows,
      worst: Math.max(...rows.map((row) => row.ratio)),
      over: rows.filter((row) => row.ratio > row.limit).length
    }, null, 1));
  }
  const worst = Math.max(...rows.map((row) => row.ratio));
  const limits = [...new Set(rows.map((row) => row.limit))].sort((a, b) => a - b);
  console.log(`\n${rows.length}장 중 차이 ${rows.filter((row) => row.ratio > 0).length}장, 최대 ${worst.toFixed(3)}% (기준 ${limits.join('/')}%)`);
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
    console.log('사용법:\n  capture --base <url> --out <폴더>\n  compare --before <폴더> --after <폴더> [--out <폴더>] [--threshold 0.1] [--json <파일>]');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
