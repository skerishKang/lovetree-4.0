#!/usr/bin/env node
// 접근성(axe-core) 자동 점검 — 4.1 화면 전체와 셸 대화상자를 훑는다.
//
//   npm run a11y -- --out .tmp-261109/a11y-before
//   npm run a11y -- --state in --width 1440 --theme night --screen shelf --out ...
//
// - 화면: home·first-journey(00~04)·shelf·book·board·network. 셸(바깥 문서)과
//   iframe 안쪽 문서를 따로 검사한다.
// - 대화상자: 계정 메뉴·책 정보 관리·순간 남기기(로그인 상태만). 로그인 화면은
//   auth.padiem.net이 외부 서비스라 이 저장소의 스킨 원본
//   (docs/design/auth-skin/login-*.html)을 검사한다.
// - serious·critical만 보고한다. 색·디자인을 바꿔야 하는 대비 문제는 고치지 않고
//   목록으로만 남긴다(디자인 판단).
// - 계정 시험 자료는 tools/a11y/README.md의 절차(트리 3권·사진 표지)로 만든다.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const AXE_SOURCE = readFileSync(AXE_PATH, 'utf8');

const DEFAULTS = {
  base: process.env.LT_BASE || 'https://lovetree-4-0.pages.dev/v41/',
  out: path.join(os.tmpdir(), 'lovetree-a11y'),
  account: process.env.LT_ACCOUNT || '01',
  secrets: process.env.LT_SECRETS || path.join(os.homedir(), '.secrets', '.env'),
  width: '',
  theme: '',
  state: '',
  screen: ''
};

// 첫 여정은 마지막에 본다 — 여정을 나가면 셸이 직전 화면으로 돌아가므로
// 다른 화면 검사 뒤에 두어야 주소와 화면이 어긋나지 않는다.
const SCREENS = [
  { name: 'home', hash: '' },
  { name: 'shelf', hash: '#shelf', expect: 'track32-bookshelf' },
  { name: 'book', hash: '#book', expect: 'track59-sketchbook' },
  { name: 'board', hash: '#board', expect: 'track58-pinboard' },
  { name: 'network', hash: '#network', expect: 'track56-network' },
  { name: 'first-journey', hash: '#journey/00', expect: 'first-journey' }
];
const WIDTHS = [
  { width: 1440, height: 900, tag: '1440' },
  { width: 390, height: 844, tag: '390' }
];
const THEMES = ['night', 'garden'];
const STATES = ['out', 'in'];

// 화면이 흔들리지 않게: CSS 애니메이션·전환을 멈춘다. 숨기지는 않는다(axe가 보는 값을 바꾸지 않게).
const STABILIZE = `(() => {
  if (document.querySelector('style[data-a11y-run]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-a11y-run', '1');
  style.textContent = '*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;animation-duration:0s!important;transition:none!important;caret-color:transparent!important}';
  document.documentElement.append(style);
  for (const animation of document.getAnimations?.() || []) {
    try { animation.finish(); } catch {}
  }
})();`;

async function loadChromium() {
  for (const candidate of ['playwright', 'playwright-core']) {
    try {
      return (await import(candidate)).chromium;
    } catch {}
  }
  throw new Error('playwright를 찾지 못했습니다. `npm install`을 먼저 실행하세요.');
}

// 이 PC의 Chrome/Edge를 먼저 쓴다(playwright 브라우저를 내려받지 않아도 된다).
function findChromiumBinary() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function launch(chromium) {
  const executablePath = findChromiumBinary();
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
  });
}

function secrets(file) {
  const values = {};
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) values[match[1]] = match[2].trim();
    }
  } catch {}
  const suffix = String(DEFAULTS.account).padStart(2, '0');
  const email = values[`PADIEM_TUTORIAL${suffix}_EMAIL`] || '';
  const password = values[`PADIEM_TUTORIAL${suffix}_PASSWORD`] || '';
  if (!email || !password) throw new Error(`.secrets에 PADIEM_TUTORIAL${suffix}_EMAIL/_PASSWORD가 없습니다.`);
  return { email, password, suffix };
}

// 셸은 iframe(#view)에 화면을 띄운다. 주소 해시에 따라 보이는 iframe이 달라진다.
async function visibleFrame(page) {
  return page.evaluate(() => {
    const frames = [...document.querySelectorAll('#view, #view-next')].filter((frame) => !frame.hidden);
    return frames[frames.length - 1] ? frames.length : 0;
  }).catch(() => 0);
}

async function waitForScreen(page, screen, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // 화면 전환은 iframe 두 개(#view·#view-next)를 쓴다. 지금 "보이는" iframe만 본다.
    const handle = await page.evaluateHandle(() => {
      const frames = [...document.querySelectorAll('#view, #view-next')].filter((frame) => !frame.hidden);
      return frames[frames.length - 1] || null;
    }).catch(() => null);
    const element = handle?.asElement?.();
    if (element) {
      const frame = await element.contentFrame().catch(() => null);
      if (frame) {
        const url = frame.url();
        const match = screen.name === 'home' ? /\/v41\/home/.test(url) : screen.expect && url.includes(screen.expect);
        if (match) {
          try {
            // about:blank가 URL만 먼저 잡힌 순간을 화면으로 착각하지 않는다(내용이 그려진 뒤에만 인정).
            const ready = await frame.evaluate(() => ({ state: document.readyState, filled: Boolean(document.body && document.body.children.length > 0 && document.documentElement.lang) }));
            if (ready.state === 'complete' && ready.filled) return frame;
          } catch {}
        }
      }
    }
    await handle?.dispose?.().catch?.(() => {});
    await page.waitForTimeout(250);
  }
  return null;
}

function hasAxe(frame) {
  return frame.evaluate(() => Boolean(window.axe?.run)).catch(() => false);
}

async function injectAxe(frame) {
  if (await hasAxe(frame)) return;
  await frame.evaluate(AXE_SOURCE).catch(() => {});
}

// axe 실행. serious·critical만 남긴다.
async function runAxe(frame, label) {
  if (!(await hasAxe(frame))) return null;
  if (/^about:blank/.test(frame.url())) return { label, skipped: true, violations: [] };
  // iframe이 about:blank로 갈아 끼워지는 순간을 문서로 착각하지 않는다.
  const ready = await frame.evaluate(() => ({
    lang: Boolean(document.documentElement.getAttribute('lang')),
    title: Boolean(document.title && document.title.trim()),
    content: Boolean(document.body && document.body.children.length > 0)
  })).catch(() => null);
  if (ready && (!ready.lang || !ready.title || !ready.content)) {
    if (process.env.A11Y_DEBUG) console.log(`  [debug] ${label}: 준비 안 됨 ${JSON.stringify(ready)} url=${frame.url()}`);
    return { label, skipped: true, violations: [] };
  }
  return frame.evaluate(async (label) => {
    // iframe 안쪽은 따로 검사하므로 여기서는 프레임을 넘지 않는다(외부 YouTube 프레임 보호).
    const result = await window.axe.run(document, {
      resultTypes: ['violations'],
      iframes: false
    });
    const keep = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    return {
      label,
      violations: keep.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        details: v.nodes.slice(0, 8).map((n) => ({
          target: n.target.join(' '),
          html: String(n.html || '').slice(0, 300),
          summary: String(n.failureSummary || '').slice(0, 400)
        }))
      }))
    };
  }, label).catch((error) => ({ label, error: error.message }));
}

async function freeze(page) {
  await page.evaluate(STABILIZE).catch(() => {});
}

function shotName(screen, width, theme, state) {
  return `${screen}-${width}-${theme}-${state}.png`;
}

async function openContext(browser, options, { width, height, theme, state, storage }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    ...(storage ? { storageState: storage } : {})
  });
  await context.addInitScript((value) => {
    try { localStorage.setItem('lt41.theme', value); } catch {}
  }, theme);
  // 이미 1회차 지시가 있으면 안내 창이 화면을 덮지 않게 한다(검사 대상은 화면·대화상자).
  await context.addInitScript(() => {
    try { localStorage.setItem('lt41.tips.firstTree', '1'); } catch {}
  });
  return context;
}

// 로그인 쿠키를 한 번 얻어 모든 context에 재사용한다.
async function loginStorage(browser, options, base) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul'
  });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const member = await page.evaluate(() => document.body.dataset.member).catch(() => 'out');
    if (member !== 'in') {
      const href = await page.getAttribute('#account-entry', 'href');
      if (!href) throw new Error('로그인 링크를 찾지 못했습니다.');
      await page.goto(new URL(href, base).href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      if (!page.url().startsWith('https://auth.padiem.net')) throw new Error('로그인 화면으로 가지 못했습니다: ' + page.url());
      const creds = secrets(options.secrets);
      await page.locator('#email').fill(creds.email);
      await page.locator('#password').fill(creds.password);
      await page.click('button.primary.submit');
      let ok = false;
      for (let i = 0; i < 45; i += 1) {
        await page.waitForTimeout(1000);
        const url = page.url();
        const state = await page.evaluate(() => document.body.dataset.member).catch(() => 'out');
        if (!url.startsWith('https://auth.padiem.net') && state === 'in') { ok = true; break; }
      }
      if (!ok) throw new Error('로그인에 실패했습니다: ' + page.url());
    }
    return await context.storageState();
  } finally {
    await context.close();
  }
}

async function readWorkspace(page, base) {
  await page.evaluate(() => { location.hash = '#shelf'; }).catch(() => {});
  await page.waitForTimeout(1200);
  return page.evaluate(async () => {
    const response = await fetch('/api/workspace', { credentials: 'same-origin' });
    if (!response.ok) return null;
    const body = await response.json();
    return body.state?.trees || [];
  }).catch(() => null);
}

// 셸 대화상자 검사(로그인 상태).
// - 계정 메뉴·책 정보 관리: 책장 화면
// - 순간 남기기: 기억책 화면(책장에서 `순간 남기기`는 첫 여정으로 간다)
async function auditDialogs(page, browser, options, base, storage, width, theme, results) {
  const trees = await readWorkspace(page, base);
  const pick = trees?.[1] || trees?.[0] || null;
  const query = pick ? `?tree=${pick.id}&moment=${pick.moments[0].id}` : '';
  await page.evaluate((hash) => { location.hash = hash; }, '#my/shelf' + query).catch(() => {});
  await page.waitForTimeout(1500);
  await waitForScreen(page, { name: 'shelf', expect: 'track32-bookshelf' });
  await freeze(page);
  await injectAxe(page.mainFrame());

  // 1) 계정 메뉴
  await page.evaluate(() => document.getElementById('account-avatar')?.click()).catch(() => {});
  await page.waitForTimeout(500);
  results.push(await runAxe(page.mainFrame(), `shell:account-menu:${width}:${theme}`));
  await page.evaluate(() => document.getElementById('account-avatar')?.click()).catch(() => {});

  // 2) 책 정보 관리(표지 고르기 포함)
  await page.evaluate(() => {
    const manage = document.getElementById('manage-tree');
    if (manage && !manage.hidden) manage.click();
  }).catch(() => {});
  await page.waitForTimeout(700);
  const managerOpen = await page.evaluate(() => Boolean(document.getElementById('tree-manager')?.open));
  if (managerOpen) {
    results.push(await runAxe(page.mainFrame(), `shell:tree-manager:${width}:${theme}`));
    await page.evaluate(() => document.getElementById('tree-manager')?.close()).catch(() => {});
  }

  // 3) 순간 남기기 — 기억책 화면에서 연다. 2026-11-09(#327 ②)부터 고르기 창(빠른/자세한 추가)이
  //    먼저 열리고, 각각의 창을 차례로 검사한다. 자세한 추가는 기존 편집기 다이얼로그다.
  await page.evaluate((hash) => { location.hash = hash; }, '#my/book' + query).catch(() => {});
  await page.waitForTimeout(2000);
  await waitForScreen(page, { name: 'book', expect: 'track59-sketchbook' });
  await page.waitForTimeout(600);
  await freeze(page);
  await injectAxe(page.mainFrame());
  await page.evaluate(() => {
    const write = document.getElementById('write-menu');
    if (write && !write.hidden) write.click();
  }).catch(() => {});
  await page.waitForTimeout(900);
  const chooserOpen = await page.evaluate(() => Boolean(document.getElementById('write-chooser')?.open));
  if (chooserOpen) {
    results.push(await runAxe(page.mainFrame(), `shell:write-chooser:${width}:${theme}`));
    await page.evaluate(() => document.getElementById('write-quick')?.click()).catch(() => {});
    await page.waitForTimeout(700);
    const quickOpen = await page.evaluate(() => Boolean(document.getElementById('quick-add')?.open));
    if (quickOpen) {
      results.push(await runAxe(page.mainFrame(), `shell:quick-add:${width}:${theme}`));
      await page.evaluate(() => document.getElementById('quick-add')?.close()).catch(() => {});
    }
    await page.evaluate(() => document.getElementById('write-chooser')?.close()).catch(() => {});
    // 자세한 추가(기존 편집기)도 같은 화면에서 연다.
    await page.evaluate(() => document.getElementById('write-menu')?.click()).catch(() => {});
    await page.waitForTimeout(700);
    await page.evaluate(() => document.getElementById('write-detailed')?.click()).catch(() => {});
    await page.waitForTimeout(900);
  }
  const editorOpen = await page.evaluate(() => Boolean(document.getElementById('editor')?.open));
  if (editorOpen) {
    results.push(await runAxe(page.mainFrame(), `shell:editor:${width}:${theme}`));
    await page.evaluate(() => document.getElementById('editor')?.close()).catch(() => {});
  }
}

// 로그인 화면 스킨(문서 원본). 외부 auth.padiem.net은 이 저장소 밖이라 원본만 검사한다.
async function auditLoginSkin(browser, options, theme, results) {
  const file = path.join(process.cwd(), 'docs', 'design', 'auth-skin', `login-${theme}.html`);
  if (!existsSync(file)) return;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto('file:///' + file.replaceAll('\\', '/'), { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await freeze(page);
    await injectAxe(page.mainFrame());
    results.push(await runAxe(page.mainFrame(), `login:${theme}`));
  } finally {
    await context.close();
  }
}

function totals(rows) {
  let serious = 0;
  let critical = 0;
  for (const row of rows) {
    for (const violation of row.violations || []) {
      if (violation.impact === 'critical') critical += violation.nodes;
      if (violation.impact === 'serious') serious += violation.nodes;
    }
  }
  return { serious, critical, total: serious + critical };
}

async function main(argv) {
  const options = { ...DEFAULTS, ...argv };
  const out = path.resolve(options.out);
  mkdirSync(out, { recursive: true });
  const chromium = await loadChromium();
  const browser = await launch(chromium);
  const results = [];
  const shots = [];
  try {
    let storage = null;
    for (let attempt = 1; attempt <= 2 && !storage; attempt += 1) {
      try {
        storage = await loginStorage(browser, options, options.base);
      } catch (error) {
        console.log(`로그인 ${attempt}회차 실패: ${error.message}`);
      }
    }
    if (!storage) throw new Error('로그인을 확인하지 못했습니다(auth.padiem.net 응답 확인 필요).');
    console.log('로그인 확인 완료. 화면 검사를 시작합니다.');

    const widths = options.width ? WIDTHS.filter((item) => item.tag === options.width) : WIDTHS;
    const themes = options.theme ? THEMES.filter((item) => item === options.theme) : THEMES;
    const states = options.state ? STATES.filter((item) => item === options.state) : STATES;
    const screens = options.screen ? SCREENS.filter((item) => item.name === options.screen) : SCREENS;

    for (const viewport of widths) {
      for (const theme of themes) {
        for (const state of states) {
          const context = await openContext(browser, options, {
            width: viewport.width,
            height: viewport.height,
            theme,
            state,
            storage: state === 'in' ? storage : undefined
          });
          const page = await context.newPage();
          page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
          try {
            // 셸은 한 번만 새로 열고, 화면은 해시로만 바꾼다(새로고침하면 첫 여정 주소 규칙이 초기화된다).
            await page.goto(options.base + '#home', { waitUntil: 'domcontentloaded' });
            await waitForScreen(page, { name: 'home' }, 20000);
            for (const screen of screens) {
              // 화면마다 첫 화면에서 출발한다(첫 여정에서 나가면 직전 화면으로 돌아가는 규칙 회피).
              // 전환 연출(최대 1.5초 + 0.6초 뒤 이전 iframe 비우기)이 끝난 뒤에 다음 화면으로 간다.
              if (screen.name !== 'home') {
                await page.evaluate(() => { location.hash = '#home'; }).catch(() => {});
                await waitForScreen(page, { name: 'home' }, 8000);
                await page.waitForTimeout(900);
              }
              await page.evaluate((hash) => { location.hash = hash || '#home'; }, screen.hash).catch(() => {});
              await waitForScreen(page, screen);
              await page.waitForTimeout(1300);
              // 로그인 상태에서는 셸이 #my/… 주소로 한 번 더 바꾸며 iframe을 교체한다.
              // 교체 뒤의 "지금 보이는" iframe을 다시 잡는다.
              let frame = await waitForScreen(page, screen, 5000);
              await page.waitForTimeout(300);
              await freeze(page);
              if (frame) await frame.evaluate(STABILIZE).catch(() => {});
              await injectAxe(page.mainFrame());
              if (!frame) {
                console.log(`- ${screen.name} ${viewport.tag} ${theme} ${state}: 건너뜀(화면이 열리지 않음)`);
                continue;
              }
              const shellRow = await runAxe(page.mainFrame(), `shell:${screen.name}:${viewport.tag}:${theme}:${state}`);
              results.push(shellRow);
              let innerRow = null;
              for (let retry = 0; retry < 3; retry += 1) {
                const live = retry === 0 ? frame : await waitForScreen(page, screen, 3000);
                if (!live) { innerRow = { label: `view:${screen.name}:${viewport.tag}:${theme}:${state}`, skipped: true, violations: [] }; continue; }
                await injectAxe(live);
                innerRow = await runAxe(live, `view:${screen.name}:${viewport.tag}:${theme}:${state}`);
                if (innerRow && !innerRow.skipped) break;
                await page.waitForTimeout(500);
              }
              results.push(innerRow);
              const file = path.join(out, shotName(screen.name, viewport.tag, theme, state));
              await page.screenshot({ path: file, fullPage: false }).catch(() => {});
              shots.push(file);
              console.log(`- ${screen.name} ${viewport.tag} ${theme} ${state}: 검사${shellRow && innerRow ? '' : ' (일부 실패)'}`);
            }
            if (state === 'in' && !options.screen) {
              await auditDialogs(page, browser, options, options.base, storage, viewport.tag, theme, results);
              console.log(`- 대화상자 ${viewport.tag} ${theme}: 검사`);
            }
          } finally {
            await context.close();
          }
        }
      }
    }

    if (!options.screen && !options.state) {
      for (const theme of themes) await auditLoginSkin(browser, options, theme, results);
    }
  } finally {
    await browser.close();
  }

  const cleaned = results.filter(Boolean);
  const summary = cleaned.map((row) => ({
    label: row.label,
    skipped: Boolean(row.skipped),
    error: row.error || '',
    serious: (row.violations || []).filter((v) => v.impact === 'serious').reduce((sum, v) => sum + v.nodes, 0),
    critical: (row.violations || []).filter((v) => v.impact === 'critical').reduce((sum, v) => sum + v.nodes, 0),
    violations: row.violations || []
  }));
  const report = {
    base: options.base,
    generatedAt: new Date().toISOString(),
    account: DEFAULTS.account,
    total: totals(summary),
    rows: summary,
    shots
  };
  writeFileSync(path.join(out, 'a11y.json'), JSON.stringify(report, null, 1));

  const failing = summary.filter((row) => !row.skipped && (row.serious + row.critical > 0 || row.error));
  const skipped = summary.filter((row) => row.skipped).length;
  console.log(`\n검사 ${summary.length}건(건너뜀 ${skipped}) · serious ${report.total.serious} · critical ${report.total.critical}`);
  for (const row of failing) {
    const ids = [...new Set(row.violations.map((v) => `${v.id}(${v.impact})`))].join(', ');
    console.log(`FAIL ${row.label}: ${row.serious + row.critical}${row.error ? ' [검사 실패] ' + row.error : ''} ${ids}`);
  }
  console.log(`보고서: ${path.join(out, 'a11y.json')}`);
  return failing.length ? 1 : 0;
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

const argv = parseArgs(process.argv.slice(2));
try {
  process.exitCode = await main(argv);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
