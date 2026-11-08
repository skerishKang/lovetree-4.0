#!/usr/bin/env node
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL_VERSION = '0.1.2';
// 보기 메뉴의 기대 항목은 제품 함수에서 계산한다(로그아웃 5 · 로그인 7).
// 도구를 저장소 밖에서 단독 실행하면 파일이 없을 수 있으므로 실패하면 숫자 기대값으로 돌아간다.
let viewMenuItems = null;
try {
  ({ viewMenuItems } = await import(new URL('../../v41/home-view-menu.js', import.meta.url).href));
} catch {
  viewMenuItems = null;
}
// 헤더 탭 개수·구성의 기대값도 제품 함수(public/v41/header-state.mjs, #222)로 계산한다.
// 로그아웃 3 · 로그인+트리 없음 3 · 로그인+트리 있음 7 이라 고정값으로는 상태를 가릴 수 없다.
let headerPartsFor = null;
let treePickerText = null;
try {
  ({ headerPartsFor, treePickerText } = await import(new URL('../../public/v41/header-state.mjs', import.meta.url).href));
} catch {
  headerPartsFor = null;
  treePickerText = null;
}
// 첫 화면·내 책장·둘러보기는 모든 상태에서 남는 기본 탭이다.
const BASE_HEADER_TABS = 3;
function headerExpectation({ owned = false, treeCount = 0, publicReading = false } = {}) {
  if (!headerPartsFor) {
    const state = owned ? (Number(treeCount) > 0 ? 'in-trees' : 'in-empty') : 'out';
    return { state, treePicker: state === 'in-trees', treeViews: state === 'in-trees', write: owned, tabs: state === 'in-trees' ? 7 : 3, source: 'fallback' };
  }
  const parts = headerPartsFor({ owned, treeCount, publicReading });
  const tabs = BASE_HEADER_TABS + (parts.treePicker ? 1 : 0) + (parts.treeViews ? 3 : 0);
  return { ...parts, tabs, source: 'public/v41/header-state.mjs' };
}
function expectedPickerLabel({ owned, treeTitle = '', pendingDraft = false } = {}) {
  if (treePickerText) return treePickerText({ owned, treeTitle, pendingDraft });
  if (!owned) return pendingDraft ? '저장 안 된 기록' : '트리 고르기';
  return treeTitle ? `트리: ${treeTitle}` : '트리 고르기';
}
const REACTION_KINDS = ['heart', 'like', 'love', 'laugh', 'wow', 'sad', 'angry'];
const REACTION_LABELS = { heart: '공감', like: '좋아요', love: '사랑', laugh: '웃음', wow: '대단', sad: '슬픔', angry: '화남' };
const OEMBED_KEYS = new Set(['title', 'authorName', 'thumbnailUrl', 'providerName', 'videoId', 'cached']);

const USAGE = `lovetree-postdeploy ${TOOL_VERSION}

4.1 배포 직후 확인용 읽기 위주 검사기. 기본은 읽기 전용이며 아무것도 저장하지 않는다.

사용법:
  node postdeploy.mjs <대상주소> [옵션]

예:
  node postdeploy.mjs https://lovetree.padiem.net/v41/
  node postdeploy.mjs https://<preview>.lovetree-4-0.pages.dev/v41/
  node postdeploy.mjs https://lovetree.padiem.net/v41/ --write --share <shareId>

주요 옵션:
  --login             처음 한 번, 열린 브라우저에서 직접 로그인(비밀번호는 저장하지 않음)
  --headed            화면을 보이게 실행(기본은 헤드리스)
  --write             쓰기 검사 실행(반응/댓글). --share 와 함께 써야 함. 기본 꺼짐
  --share <id>        쓰기 검사 대상 공유 id
  --youtube <id>      oEmbed 검사에 쓸 공개 YouTube 영상 id(기본 dQw4w9WgXcQ)
  --secrets <path>    자동 로그인 비밀 파일(기본 %USERPROFILE%\\.secrets\\.env)
  --profile <dir>     로그인 세션 프로필 폴더(기본 tools/postdeploy/.profile)
  --out <dir>         결과 JSON·스크린샷 폴더(기본 tools/postdeploy/out)
  --timeout <ms>      대기 시간(기본 60000)
  --strict            경고(겹침 등)도 실패로 간주
  --cdp <endpoint>    기존 크롬의 CDP 주소에 붙기(http://127.0.0.1:9222)
  --auto-login        시험 계정(kimbs5993+tutorial01@gmail.com) 으로 env 에서 비밀번호를 읽어 PADIEM 비밀번호 폼 자동 로그인. Google 화면이면 중단. --login 과 함께 쓸 수 없음
  -h, --help          이 도움말

로그인 세션:
  수동: node postdeploy.mjs <주소> --login   (열린 창에서 로그인 후 터미널에서 Enter)
  자동: node postdeploy.mjs <주소> --auto-login (--secrets 기본 %USERPROFILE%\\.secrets\\.env 의 PADIEM_TUTORIAL01_PASSWORD 로 로그인)
  이후 실행은 같은 프로필을 재사용하므로 비밀번호 없이 읽기 검사를 돌린다.

종료 코드: 실패 있으면 2, 경고만 있으면 0(--strict 시 2), 전부 통과면 0.`;

function parseArgs(argv) {
  const opts = {
    target: null,
    secrets: process.env.LOVETREE_SECRETS || path.join(process.env.USERPROFILE || process.env.HOME || '', '.secrets', '.env'),
    profile: process.env.LOVETREE_POSTDEPLOY_PROFILE || path.join(HERE, '.profile'),
    out: process.env.LOVETREE_POSTDEPLOY_OUT || path.join(HERE, 'out'),
    headless: true,
    login: false,
    autoLogin: false,
    authFlows: false,
    write: false,
    share: null,
    youtube: 'dQw4w9WgXcQ',
    timeout: 60000,
    strict: false,
    cdp: null,
    help: false
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h':
      case '--help': opts.help = true; break;
      case '--login': opts.login = true; opts.headless = false; break;
      case '--headed': opts.headless = false; break;
      case '--write': opts.write = true; break;
      case '--strict': opts.strict = true; break;
      case '--secrets': opts.secrets = argv[++i]; break;
      case '--profile': opts.profile = argv[++i]; break;
      case '--out': opts.out = argv[++i]; break;
      case '--share': opts.share = argv[++i]; break;
      case '--youtube': opts.youtube = argv[++i]; break;
      case '--timeout': opts.timeout = Number(argv[++i]); break;
      case '--cdp': opts.cdp = argv[++i]; opts.headless = false; break;
      case '--auto-login': opts.autoLogin = true; opts.headless = false; break;
      case '--auth-flows': opts.authFlows = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
        rest.push(a);
    }
  }
  if (rest.length) opts.target = rest[0];
  return opts;
}

const checks = [];
const consoleErrors = [];
const consoleWarnings = [];
const pageErrors = [];

function summarize(summary) {
  return `pass=${summary.pass} fail=${summary.fail} warn=${summary.warn} skip=${summary.skip}`;
}

function record(id, area, status, detail, data) {
  checks.push({ id, area, status, detail, data: data ?? null });
  const tag = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', skip: 'SKIP', info: 'INFO' }[status] || status.toUpperCase();
  console.log(`  [${tag}] ${area}/${id} — ${detail}`);
}

// 상태 판정에 영향을 주지 않는 참고 기록(예: 첫 방문 안내를 닫고 진행했다).
function recordInfo(id, area, detail, data) {
  record(id, area, 'info', detail, data);
}

function isIgnorableConsoleError(text) {
  const t = String(text);
  if (/favicon\.ico/i.test(t) || /ERR_BLOCKED_BY_CLIENT/i.test(t)) return true;
  if (!/^Failed to load resource/i.test(t)) return false;
  if (/status of (401|403)/.test(t)) return true;
  if (/\/api\/(lovetree\/)?(account|session)/.test(t)) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickSmart(page, selector) {
  try {
    await page.click(selector, { timeout: 5000 });
    return true;
  } catch {
    return page.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (!node) return false;
      node.click();
      return true;
    }, selector);
  }
}

async function launch(opts) {
  if (opts.cdp) {
    const browser = await chromium.connectOverCDP(opts.cdp);
    const context = browser.contexts()[0] || (await browser.newContext());
    return { context, close: async () => { await browser.close(); } };
  }
  await mkdir(opts.profile, { recursive: true });
  const context = await chromium.launchPersistentContext(opts.profile, {
    channel: 'chrome',
    headless: opts.headless,
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check']
  });
  return { context, close: async () => { await context.close(); } };
}

function wireConsole(page) {
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const location = typeof msg.location === 'function' ? msg.location() : null;
    const url = location && location.url ? location.url : '';
    const entry = url ? `${text} [${url}]` : text;
    if (type === 'error') consoleErrors.push(entry);
    else if (type === 'warning') consoleWarnings.push(entry);
  });
  page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
}

const AUTO_LOGIN_EMAIL = 'kimbs5993+tutorial01@gmail.com';

async function readSecret(key, secretsPath) {
  const fs = await import('node:fs');
  try {
    const lines = fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/);
    const line = lines.find((l) => l.startsWith(`${key}=`));
    if (!line) return { ok: false, reason: 'missing-key' };
    const value = line.slice(key.length + 1);
    return value ? { ok: true, value } : { ok: false, reason: 'empty-value' };
  } catch (error) {
    return { ok: false, reason: String(error && error.message ? error.message : error) };
  }
}

async function sessionLoggedIn(page, timeout) {
  try {
    const res = await page.request.get(new URL('/api/workspace', page.url()).href, {
      timeout,
      headers: { accept: 'application/json' },
      maxRedirects: 0
    });
    if (res.status() === 200 || res.status() === 204) return true;
  } catch { /* fall through to DOM cue */ }
  const text = await page.locator('#account-entry').innerText().catch(() => '');
  if (/내 계정/.test(text)) return true;
  // 2026-11-07: 로그인 상태는 "내 계정" 글자 대신 첫 글자 동그라미로 표시된다.
  const avatar = page.locator('#account-avatar');
  if (await avatar.count().catch(() => 0)) {
    const visible = await avatar.isVisible().catch(() => false);
    const label = await avatar.getAttribute('aria-label').catch(() => '');
    if (visible && /^내 계정 메뉴, .+로 로그인됨$/.test(label || '')) return true;
  }
  return false;
}

async function viewFrame(page) {
  // 2026-11-08: 첫 여정 등 iframe이 늘어 '첫 번째 하위 frame'이 #view가 아닐 수 있다.
  const el = await page.$('#view').catch(() => null);
  const f = el ? await el.contentFrame().catch(() => null) : null;
  return f || page.frames().find((x) => x !== page.mainFrame()) || null;
}

async function fillAuthEmailLogin(page, password) {
  // 2026-11-08: 공용 로그인 화면(auth.padiem.net)의 이메일 로그인 폼.
  const email = page.locator('#email');
  if (!(await email.count())) return false;
  await email.fill(AUTO_LOGIN_EMAIL).catch(() => {});
  await page.locator('#password').fill(password).catch(() => {});
  await page.locator('form button[type=submit]').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(2500);
  if (!/auth\.padiem\.net/.test(page.url())) return { ok: true };
  const error = await page.locator('[role=alert], .error, .form-error').first().innerText().catch(() => '');
  return error ? { ok: false, error: error.trim() } : { ok: true };
}

async function fillChatPasswordLogin(page, password) {
  const identifier = page.locator('#passwordLoginIdentifier');
  if (!(await identifier.count())) return false;
  const visible = await identifier.isVisible().catch(() => false);
  if (!visible) {
    await page.locator('#authOpen, [data-auth-open], button:has-text("로그인")').first().click({ timeout: 3000 }).catch(() => {});
    await sleep(800);
  }
  await identifier.fill(AUTO_LOGIN_EMAIL).catch(() => {});
  await page.locator('#passwordLoginPassword').fill(password).catch(() => {});
  await page.locator('#passwordLoginSubmit').click({ timeout: 5000 }).catch(() => {});
  await sleep(2500);
  const error = await page.locator('#passwordLoginError').innerText().catch(() => '');
  return error ? { ok: false, error: error.trim() } : { ok: true };
}

async function autoLogin(page, opts, target) {
  const secret = await readSecret('PADIEM_TUTORIAL01_PASSWORD', opts.secrets);
  if (!secret.ok) {
    record('auto-login-secrets', 'auth', 'warn', `비밀번호 원천을 읽지 못함 (${opts.secrets}): ${secret.reason}`);
    return false;
  }

  if (await sessionLoggedIn(page, opts.timeout)) {
    record('auto-login', 'auth', 'pass', `이미 로그인된 세션을 재사용 (${AUTO_LOGIN_EMAIL})`);
    return true;
  }

  const href = await page.getAttribute('#account-entry', 'href').catch(() => null);
  const loginUrl = new URL(href || '/auth/login?next=%2Fv41%2F', target.href).href;
  const navRes = await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch((error) => {
    record('auto-login-nav', 'auth', 'warn', `로그인 시작 주소 접속 실패: ${error.message}`);
    return null;
  });
  if (navRes && navRes.status() >= 400) {
    record('auto-login-nav', 'auth', 'warn', `로그인 시작 주소 응답 ${navRes.status()} — 공용 로그인 중계가 준비되지 않았을 수 있음`);
    return false;
  }

  const deadline = Date.now() + opts.timeout;
  let attempts = 0;
  let lastStep = '';
  while (Date.now() < deadline) {
    const current = page.url();
    if (current.startsWith(target.origin) && (await sessionLoggedIn(page, opts.timeout))) {
      if (new URL(current).pathname !== new URL(target.href).pathname) {
        await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
      }
      await page.waitForSelector('#community-menu', { timeout: opts.timeout }).catch(() => {});
      consoleErrors.length = 0;
      consoleWarnings.length = 0;
      pageErrors.length = 0;
      record('auto-login', 'auth', 'pass', `시험 계정 ${AUTO_LOGIN_EMAIL} 로그인 완료 (${lastStep || 'redirect'})`);
      return true;
    }
    if (/accounts\.google\.com/.test(current)) {
      record('auto-login', 'auth', 'fail', 'Google OAuth 화면이 나와서 입력하지 않고 멈춤 — PADIEM 자체 비밀번호 폼만 사용');
      return false;
    }
    if (/auth\.padiem\.net/.test(current) && lastStep !== 'auth:email') {
      if (await page.locator('#email').count()) {
        const result = await fillAuthEmailLogin(page, secret.value).catch((error) => ({ ok: false, error: error.message }));
        lastStep = 'auth:email';
        if (result && result.ok === false && result.error) {
          record('auto-login', 'auth', 'fail', `이메일 로그인 실패: ${result.error}`);
          return false;
        }
        await sleep(2000);
        continue;
      }
      await sleep(1000);
      continue;
    }
    if (/chat\.padiem\.net/.test(current)) {
      if (await page.locator('#passwordLoginIdentifier').count()) {
        const result = await fillChatPasswordLogin(page, secret.value).catch((error) => ({ ok: false, error: error.message }));
        lastStep = 'chat:password';
        if (result && result.ok === false && result.error) {
          record('auto-login', 'auth', 'fail', `공용 로그인 거절: ${result.error}`);
          return false;
        }
        await sleep(2000);
        continue;
      }
      await sleep(1000);
      continue;
    }
    attempts += 1;
    if (attempts === 1) {
      const status = await page.locator('body').innerText().catch(() => '');
      if (/503|unavailable|service/i.test(status) && !/로그인/.test(status)) {
        record('auto-login', 'auth', 'warn', '로그인 중계가 응답하지 않아 자동 로그인을 못 함(503 가능)');
        return false;
      }
    }
    await sleep(800);
  }
  record('auto-login', 'auth', 'warn', `시간 안에 로그인 완료를 확인하지 못함 (마지막 단계: ${lastStep || '없음'})`);
  return false;
}

async function probeLogin(page, timeout) {
  const paths = ['/api/account', '/api/lovetree/account', '/api/session', '/api/workspace'];
  const out = {};
  for (const p of paths) {
    try {
      const res = await page.request.get(new URL(p, page.url()).href, {
        timeout,
        headers: { accept: 'application/json' },
        maxRedirects: 0
      });
      out[p] = { status: res.status(), contentType: res.headers()['content-type'] || '' };
    } catch (error) {
      out[p] = { error: String(error && error.message ? error.message : error) };
    }
  }
  return out;
}

async function checkPageLoad(page, target, opts) {
  try {
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout });
  } catch (error) {
    record('page-load', 'page', 'fail', `${target.href} 접속 실패: ${error.message}`);
    return { reachable: false };
  }
  await page.waitForLoadState('load', { timeout: opts.timeout }).catch(() => {});
  await page
    .waitForFunction(() => {
      const frame = document.querySelector('iframe#view');
      return !!frame && !!frame.contentDocument && frame.contentDocument.readyState !== 'loading';
    }, { timeout: 20000 })
    .catch(() => {});
  const info = await page.evaluate(() => ({
    title: document.title,
    ready: document.readyState,
    hasNav: !!document.querySelector('nav'),
    hasCommunityMenu: !!document.querySelector('#community-menu'),
    hasStage: !!document.querySelector('main#stage'),
    hasViewFrame: !!document.querySelector('iframe#view'),
    frameUrl: document.querySelector('iframe#view')?.contentWindow?.location?.href || null
  }));
  const ok = info.hasCommunityMenu && info.hasNav;
  record('page-load', 'page', ok ? 'pass' : 'fail',
    `title="${info.title}" ready=${info.ready} menu=${info.hasCommunityMenu} view=${info.hasViewFrame}`, info);
  return info;
}

async function openCommunity(page, opts) {
  await clickSmart(page, '#community-menu');
  const opened = await page
    .waitForFunction(() => {
      const dialog = document.querySelector('#community-panel');
      return !!dialog && dialog.open;
    }, { timeout: opts.timeout })
    .then(() => true)
    .catch(() => false);
  if (!opened) return { opened: false };
  await page
    .waitForFunction(() => {
      const feedback = document.querySelector('#community-feedback');
      return !!feedback && feedback.textContent.trim().length > 0;
    }, { timeout: opts.timeout })
    .catch(() => {});
  await sleep(600);
  return { opened: true };
}

async function readCommunity(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('#community-panel');
    const feedback = dialog.querySelector('#community-feedback')?.textContent?.trim() || '';
    const previewMeta = dialog.querySelector('#community-preview .community-preview-meta')?.textContent?.trim() || null;
    const cards = [...dialog.querySelectorAll('#community-list article.community-card')].map((card) => {
      const group = card.querySelector('.community-reaction-group');
      const reactions = [...(group ? group.querySelectorAll('button.community-reaction[data-reaction-kind]') : [])]
        .map((b) => ({ kind: b.dataset.reactionKind, label: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') }));
      const favorite = [...card.querySelectorAll('button.community-mini[aria-pressed]')]
        .find((b) => !b.classList.contains('community-reaction'));
      return {
        title: card.querySelector('h3')?.textContent?.trim() || '',
        subject: card.querySelector('.community-subject')?.textContent?.trim() || '',
        meta: card.querySelector('.community-muted')?.textContent?.trim() || '',
        reactions,
        favorite: favorite ? { label: favorite.textContent.trim(), pressed: favorite.getAttribute('aria-pressed') } : null,
        hasCommentCount: !!card.querySelector('[data-comment-count], .community-comment-count, [data-comments]'),
        hasLastActivity: !!card.querySelector('[data-last-activity], .community-last-activity, [data-activity]')
      };
    });
    return { feedback, previewMeta, cards };
  });
}

async function checkCommunity(page, opts) {
  const { opened } = await openCommunity(page, opts);
  if (!opened) {
    record('community-open', 'community', 'fail', '#community-menu 로 둘러보기 대화상자를 열지 못함');
    return null;
  }
  const data = await readCommunity(page);
  if (!data.cards.length) {
    const bad = /못했|실패|error/i.test(data.feedback);
    record('community-cards', 'community', bad ? 'fail' : 'warn',
      `카드 0개 — feedback="${data.feedback}"`, data);
    return data;
  }
  record('community-open', 'community', 'pass', `카드 ${data.cards.length}개, feedback="${data.feedback}"`);

  const badCards = data.cards.filter((card) => {
    const kinds = card.reactions.map((r) => r.kind).sort();
    const expected = [...REACTION_KINDS].sort();
    return card.reactions.length !== REACTION_KINDS.length || kinds.join(',') !== expected.join(',');
  });
  record('reaction-buttons-7', 'community', badCards.length ? 'fail' : 'pass',
    badCards.length
      ? `반응 7종이 아닌 카드 ${badCards.length}개: ${badCards.map((c) => `"${c.title}"(${c.reactions.length})`).join(', ')}`
      : `모든 카드에 반응 7종(${REACTION_KINDS.join('/')}) 노출`,
    { kinds: REACTION_KINDS, labels: REACTION_LABELS });

  const noCount = data.cards.filter((card) => card.reactions.some((r) => !/\d/.test(r.label)));
  record('reaction-counts', 'community', noCount.length ? 'fail' : 'pass',
    noCount.length ? `반응 수 숫자가 없는 카드 ${noCount.length}개` : '반응 버튼마다 숫자 카운트 표시됨');

  const aggregatesPresent = data.cards.filter((c) => c.hasCommentCount || c.hasLastActivity).length;
  const previewHasAggregate = !!data.previewMeta;
  const apiAggregate = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/community/shares?limit=12', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) return { status: res.status };
      const body = await res.json();
      const items = body.items || body.shares || [];
      return { status: res.status, items };
    } catch (error) {
      return { status: 0, error: String(error && error.message ? error.message : error) };
    }
  }).catch((error) => ({ status: 0, error: String(error.message || error) }));

  if (apiAggregate.status === 200 && Array.isArray(apiAggregate.items) && apiAggregate.items.length) {
    const badAggregate = apiAggregate.items.filter((item) => {
      const stats = item.stats || {};
      const reactions = stats.reactions;
      const hasKinds = reactions && typeof reactions === 'object' && typeof reactions.heart === 'number';
      return !hasKinds || typeof stats.comments !== 'number' || typeof stats.favorites !== 'number' || !item.lastActivityAt;
    });
    record('browse-aggregates', 'community', badAggregate.length ? 'fail' : 'pass',
      badAggregate.length
        ? `카드 집계(stats.reactions/comments/favorites/lastActivityAt)가 빠진 공유 ${badAggregate.length}개`
        : `서버 카드 집계 확인 — 공유 ${apiAggregate.items.length}개 모두 reactions 7종·comments·favorites·lastActivityAt 포함`,
      { sample: apiAggregate.items.slice(0, 3).map((item) => ({ shareId: item.shareId, stats: item.stats, lastActivityAt: item.lastActivityAt })) });
  } else if (aggregatesPresent || previewHasAggregate) {
    record('browse-aggregates', 'community', 'pass',
      `카드 집계 요소 ${aggregatesPresent}개 카드 / 미리보기 집계 ${previewHasAggregate ? `"${data.previewMeta}"` : '없음'}`);
  } else if (apiAggregate.status === 200) {
    record('browse-aggregates', 'community', 'warn', '공개 트리가 0개라 카드 집계를 확인할 대상이 없음', apiAggregate);
  } else {
    record('browse-aggregates', 'community', 'warn',
      `카드 집계 API 응답 ${apiAggregate.status} — DOM에도 댓글 수·최근 활동 요소가 없음`, apiAggregate);
  }
  return data;
}

async function measure(page) {
  const topDoc = await page.evaluate(() => {
    const path = (el) => {
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 4) {
        let name = node.tagName.toLowerCase();
        if (node.id) { parts.unshift(`${name}#${node.id}`); break; }
        if (node.className && typeof node.className === 'string') name += '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.');
        parts.unshift(name);
        node = node.parentElement;
      }
      return parts.join('>');
    };
    const de = document.scrollingElement || document.documentElement;
    const vw = window.innerWidth;
    // 2026-11-07: 헤더 탭 줄은 좁은 폭에서 가로 스크롤 컨테이너다. 그 안에서 스크롤로 닿는 요소는
    // 페이지 넘침이 아니다. 스크롤 컨테이너 밖으로 나간 요소만 넘침으로 센다.
    const scrollableAncestor = (el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return n;
      }
      return null;
    };
    const overflow = [];
    const scrolledInside = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!(r.width > 2 && r.height > 2 && r.right > vw + 1)) continue;
      const box = scrollableAncestor(el);
      if (box) { scrolledInside.push({ el: path(el), box: path(box) }); continue; }
      overflow.push({ el: path(el), right: Math.round(r.right) });
    }
    const nodes = [...document.querySelectorAll('button,a,[role="button"],input,select,textarea')]
      .map((el) => ({ el, r: el.getBoundingClientRect(), s: getComputedStyle(el) }))
      .filter(({ r, s }) => r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05);
    const overlaps = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 0 && h > 0 && w * h > 4) overlaps.push({ a: path(a.el), b: path(b.el), area: Math.round(w * h) });
      }
    }
    return {
      doc: { vw, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth },
      overflow: overflow.slice(0, 15),
      overflowCount: overflow.length,
      scrolledInsideCount: scrolledInside.length,
      overlaps: overlaps.slice(0, 10),
      overlapCount: overlaps.length
    };
  });
  let frameDoc = null;
  let frameOverflow = [];
  let frameOverlaps = [];
  const frame = await viewFrame(page);
  if (frame) {
    try {
      const result = await frame.evaluate(() => {
        const de = document.scrollingElement || document.documentElement;
        const vw = window.innerWidth;
        const overflow = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 2 && r.height > 2 && r.right > vw + 1) overflow.push(Math.round(r.right));
        }
        const nodes = [...document.querySelectorAll('button,a,[role="button"],input,select,textarea')]
          .map((el) => ({ r: el.getBoundingClientRect(), s: getComputedStyle(el) }))
          .filter(({ r, s }) => r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05);
        let overlapCount = 0;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i].r, b = nodes[j].r;
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (w > 0 && h > 0 && w * h > 4) overlapCount++;
          }
        }
        return { vw, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflow, overlapCount };
      });
      frameDoc = { vw: result.vw, scrollWidth: result.scrollWidth, clientWidth: result.clientWidth };
      frameOverflow = result.overflow.slice(0, 15);
      frameOverlaps = result.overlapCount;
    } catch { /* frame not ready */ }
  }
  return { topDoc, frameDoc, frameOverflow, frameOverlaps };
}

async function checkResponsive(page, width, height, outDir, stamp) {
  await page.setViewportSize({ width, height }).catch(() => {});
  await sleep(500);
  const m = await measure(page);
  const label = `${width}x${height}`;
  const topScroll = m.topDoc.doc.scrollWidth - m.topDoc.doc.clientWidth;
  const frameScroll = m.frameDoc ? m.frameDoc.scrollWidth - m.frameDoc.clientWidth : 0;
  const scrollOk = topScroll <= 1 && frameScroll <= 1;
  record(`no-hscroll-${width}`, 'layout', scrollOk ? 'pass' : 'fail',
    `top scrollWidth-client=${topScroll}, frame=${frameScroll}`, m);

  const overflowOk = m.topDoc.overflowCount === 0 && m.frameOverflow.length === 0;
  // 2026-11-07: 390·360에서 탭이 잘리는 것은 실제 결함이라 warn 이 아니라 fail 로 본다.
  record(`no-overflow-${width}`, 'layout', overflowOk ? 'pass' : 'fail',
    overflowOk ? `뷰포트를 넘는 요소 없음${m.topDoc.scrolledInsideCount ? ` (탭 줄 안 스크롤 ${m.topDoc.scrolledInsideCount}개)` : ''}`
      : `top ${m.topDoc.overflowCount}개 / frame ${m.frameOverflow.length}개 요소가 오른쪽으로 넘침`
      + (m.topDoc.overflow.length ? ` — 예: ${m.topDoc.overflow.slice(0, 3).map((o) => o.el).join(', ')}` : ''),
    { top: m.topDoc.overflow, frame: m.frameOverflow });

  // 헤더 탭: 좁은 폭에서 7개가 모두 스크롤로 닿고, 현재 탭이 화면 안에 보여야 한다.
  if (width <= 780) {
    const tabs = await page.evaluate(async () => {
      const nav = document.querySelector('.app-header nav');
      if (!nav) return { ok: false, reason: 'no-nav' };
      // 숨은 탭(로그아웃의 트리 보기 탭)은 세지 않는다. #213
      const items = [...nav.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0);
      const unreachable = [];
      for (const b of items) {
        b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
        await new Promise((r) => setTimeout(r, 80));
        const nr = nav.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        if (!(r.left >= nr.left - 1 && r.right <= nr.right + 1 && r.width > 2)) unreachable.push((b.textContent || '').trim().slice(0, 12));
      }
      nav.scrollLeft = 0;
      const active = nav.querySelector('[aria-current="true"]');
      let currentVisible = null;
      if (active) {
        const nr = nav.getBoundingClientRect();
        const r = active.getBoundingClientRect();
        currentVisible = r.left >= nr.left - 1 && r.right <= nr.right + 1;
      }
      // #213: 트리 보기 탭(기억책·기억 보드·관계 지도)은 로그인한 내 트리에서만 보인다.
      // 탭 개수 기대값은 셸이 적어 둔 상태(body.dataset.member/treeCount)로 제품 함수에서 계산한다.
      const avatar = document.getElementById('account-avatar');
      const avatarVisible = !!avatar && !avatar.hidden && getComputedStyle(avatar).display !== 'none';
      const owned = document.body.dataset.member ? document.body.dataset.member === 'in' : avatarVisible;
      const treeCount = Number(document.body.dataset.treeCount || (window.LT41?.trees?.length ?? 0)) || 0;
      return { ok: true, count: items.length, owned, treeCount, loggedIn: avatarVisible, unreachable, currentVisible, label: (active?.textContent || '').trim().slice(0, 12) };
    }).catch((e) => ({ ok: false, reason: e.message }));
    if (!tabs.ok) record(`tabs-${width}`, 'layout', 'fail', `탭 확인 실패: ${tabs.reason}`);
    else {
      const expected = headerExpectation({ owned: tabs.owned, treeCount: tabs.treeCount });
      const ok = tabs.count === expected.tabs && tabs.unreachable.length === 0 && tabs.currentVisible !== false;
      record(`tabs-${width}`, 'layout', ok ? 'pass' : 'fail',
        ok ? `${tabs.count}개 탭 모두 스크롤로 닿음, 현재 탭 "${tabs.label}" 보임 (${expected.state}${expected.source === 'fallback' ? ' · 제품 함수 없음' : ''})`
          : `탭 ${tabs.count}개 (기대 ${expected.tabs} · ${expected.state}) / 닿지 않음: ${tabs.unreachable.join(', ') || '없음'} / 현재 탭 보임: ${tabs.currentVisible}`,
        { ...tabs, expected });
    }
  }

  const overlapCount = m.topDoc.overlapCount + m.frameOverlaps;
  record(`no-overlap-${width}`, 'layout', overlapCount === 0 ? 'pass' : 'warn',
    overlapCount === 0 ? '겹치는 조작 요소 없음' : `겹치는 조작 요소 ${overlapCount}쌍`,
    { top: m.topDoc.overlaps, frameCount: m.frameOverlaps });

  await page.screenshot({ path: path.join(outDir, `${stamp}-${label}.png`) }).catch(() => {});
  return m;
}

async function checkVisualTokens(page, target, opts, stamp) {
  // 2026-11-05 시각 통일 기준(docs/PRODUCT.md '4.1 시각 통일 기준 v2') 회귀 검사:
  // 첫 화면은 공통 헤더 없이 전면, 안쪽 4화면은 검은 무대(#040407) 위 금테 프레임 + 첫 화면 알약 헤더 + --lt-* 토큰.
  const base = new URL(target.href);
  const screens = [
    { hash: '', id: 'home', frameBg: null },
    { hash: '#book', id: 'book', frameBg: 'rgb(4, 4, 7)' },
    { hash: '#board', id: 'board', frameBg: 'rgb(4, 4, 7)' },
    { hash: '#network', id: 'network', frameBg: 'rgb(245, 239, 226)' },
    { hash: '#shelf', id: 'shelf', frameBg: null }
  ];
  await page.setViewportSize({ width: 1280, height: 860 }).catch(() => {});
  // 2026-11-07 테마 기준: 기본 A. 이전 실행이 B를 남겼어도 첫 검사는 A에서 시작한다.
  await page.goto(base.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
  await page.evaluate(() => { try { localStorage.removeItem('lt41.theme'); } catch {} }).catch(() => {});
  const seen = [];
  for (const s of screens) {
    const url = new URL(base.href);
    url.search = `?vt=${Date.now()}`;
    url.hash = s.hash;
    await page.goto(url.href, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    await sleep(2500);
    const top = await page.evaluate(() => {
      const vis = (el) => el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
      const hdr = document.querySelector('.app-header');
      const fr = document.getElementById('view');
      const wm = document.getElementById('write-menu');
      const nav = document.querySelector('.app-header nav');
      const navKids = nav ? [...nav.children] : [];
      const recordIndex = navKids.findIndex((c) => c.id === 'record-menu');
      const treeIndex = navKids.findIndex((c) => c.id === 'tree-views');
      const avatar = document.getElementById('account-avatar');
      const login = document.getElementById('account-entry');
      const brandEl = document.querySelector('.brand');
      return {
        home: document.body.classList.contains('home-screen'),
        headerVisible: vis(hdr),
        headerBg: hdr ? getComputedStyle(hdr).backgroundColor : '',
        headerHeight: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
        brand: (brandEl?.textContent || '').trim(),
        brandFont: brandEl ? getComputedStyle(brandEl.querySelector('span')).fontFamily : '',
        brandColor: brandEl ? getComputedStyle(brandEl.querySelector('span')).color : '',
        themeAttr: document.documentElement.dataset.ltTheme || '',
        tabs: [...document.querySelectorAll('.app-header nav button')].filter(vis).length,
        frameBorder: fr ? getComputedStyle(fr).borderColor : '',
        pillBorder: wm ? getComputedStyle(wm).borderColor : '',
        // 2026-11-07 상단 메뉴 재구성 기준
        recordBeforeTreeViews: recordIndex >= 0 && treeIndex >= 0 && recordIndex < treeIndex,
        recordLabel: (document.getElementById('source-label')?.textContent || '').trim(),
        writeGold: wm ? /255, 230, 166/.test(getComputedStyle(wm).borderColor) : false,
        writeBg: wm ? getComputedStyle(wm).backgroundColor : '',
        avatarVisible: vis(avatar),
        avatarSize: avatar ? [Math.round(avatar.getBoundingClientRect().width), Math.round(avatar.getBoundingClientRect().height)] : null,
        avatarAria: avatar ? (avatar.getAttribute('aria-label') || '') : '',
        loginVisible: vis(login),
        connectionInHeader: vis(document.getElementById('connection-menu')),
        shareInHeader: vis(document.getElementById('share-menu')),
        treeViewsHidden: !vis(document.getElementById('tree-views')),
        treePickerHidden: !vis(document.getElementById('record-menu')),
        writeMenuHidden: !vis(document.getElementById('write-menu')),
        // 셸이 적어 둔 상태(#222). 기대값은 이 값으로 제품 함수에서 계산한다.
        member: document.body.dataset.member || '',
        treeCount: Number(document.body.dataset.treeCount || (window.LT41?.trees?.length ?? 0)) || 0,
        viewHidden: !fr || fr.hidden || getComputedStyle(fr).display === 'none'
      };
    });
    let inner = null;
    const frame = await viewFrame(page);
    if (frame) {
      inner = await frame.evaluate(() => ({
        screen: document.documentElement.getAttribute('data-v41-screen') || '',
        bodyBg: getComputedStyle(document.body).backgroundColor,
        stageToken: getComputedStyle(document.documentElement).getPropertyValue('--lt-stage').trim()
      })).catch(() => null);
    }
    seen.push({ id: s.id, top, inner });
    if (s.id !== 'home' && top.viewHidden && top.avatarVisible) {
      record(`visual-${s.id}`, 'visual', 'skip', `${s.id}: 로그인·트리 없음이라 안쪽 화면이 열리지 않음(로그아웃 실행에서 검사)`, { top });
      continue;
    }
    const problems = [];
    // #213 3번: 로그아웃(out)은 트리 선택·트리 보기가 없고, 로그인해도 트리가 없으면(in-empty) 같은 모양이다.
    // 트리가 있을 때(in-trees)만 트리 선택 + 기억책·보드·지도가 붙는다. 기대값은 header-state.mjs 가 계산한다.
    const owned = top.member ? top.member === 'in' : !top.loginVisible;
    const headerExpected = headerExpectation({ owned, treeCount: top.treeCount });
    const expectedTabs = headerExpected.tabs;
    if (headerExpected.state === 'out') {
      if (!top.treeViewsHidden) problems.push('로그아웃인데 트리 보기 탭이 보임');
      if (!top.treePickerHidden) problems.push('로그아웃인데 트리 선택이 보임');
      if (!top.writeMenuHidden) problems.push('로그아웃인데 순간 남기기 버튼이 보임');
      const label = expectedPickerLabel({ owned: false });
      if (![label, '저장 안 된 기록'].includes(top.recordLabel)) problems.push(`로그아웃 트리 선택 글자 "${top.recordLabel}" (기대 "${label}")`);
    } else if (headerExpected.state === 'in-empty') {
      if (!top.treeViewsHidden) problems.push('트리 없는 로그인인데 트리 보기 탭이 보임');
      if (!top.treePickerHidden) problems.push('트리 없는 로그인인데 트리 선택이 보임');
      if (top.writeMenuHidden) problems.push('트리 없는 로그인인데 순간 남기기 버튼이 숨겨짐');
      const label = expectedPickerLabel({ owned: true });
      if (![label, '저장 안 된 기록'].includes(top.recordLabel)) problems.push(`트리 없는 로그인 트리 선택 글자 "${top.recordLabel}" (기대 "${label}")`);
    } else {
      if (top.treeViewsHidden) problems.push('로그인 상태인데 트리 보기 탭이 숨겨짐');
      if (top.treePickerHidden) problems.push('로그인 상태인데 트리 선택이 숨겨짐');
      if (!/^트리: /.test(top.recordLabel)) problems.push(`로그인 트리 선택 글자 "${top.recordLabel}" (기대 "트리: <이름>")`);
    }
    // 2026-11-07: 트리 선택은 뒤쪽 탭 묶음 바로 앞, 주 버튼은 #write-menu 하나(금색), 연결 보기는 헤더에 없다.
    if (!top.treeViewsHidden && !top.recordBeforeTreeViews) problems.push('트리 선택이 기억책·보드·지도 탭 앞에 있지 않음');
    if (!top.writeMenuHidden && !top.writeGold) problems.push(`주 버튼 금색 강조 없음: ${top.pillBorder}`);
    if (top.connectionInHeader) problems.push('연결 보기가 아직 헤더에 있음');
    if (!/^LoveTree\s*4\.1$/.test(top.brand.replace(/\s+/g, ' ').trim())) problems.push(`워드마크 "${top.brand}" (기대 LoveTree 4.1)`);
    if (/MEMORY ORBIT/i.test(top.brand)) problems.push('워드마크에 MEMORY ORBIT 남음');
    if (top.themeAttr) problems.push(`기본 테마가 A가 아님(data-lt-theme=${top.themeAttr})`);
    if (s.id === 'home') {
      if (!top.home) problems.push('body.home-screen 아님');
      if (!top.headerVisible) problems.push('첫 화면에 공통 헤더가 안 보임');
      if (top.headerBg !== 'rgb(4, 4, 7)') problems.push(`헤더 배경 ${top.headerBg} (기대 rgb(4, 4, 7))`);
      if (top.tabs !== expectedTabs) problems.push(`탭 ${top.tabs}개 (기대 ${expectedTabs})`);
      if (!/255, 255, 255, 0\.22/.test(top.pillBorder) && !top.writeGold) problems.push(`행동 버튼 테두리 ${top.pillBorder}`);
    } else {
      if (top.home) problems.push('home-screen 클래스가 남아 있음');
      if (!top.headerVisible) problems.push('공통 헤더가 안 보임');
      if (top.headerBg !== 'rgb(4, 4, 7)') problems.push(`헤더 배경 ${top.headerBg} (기대 rgb(4, 4, 7))`);
      if (top.headerHeight < 88) problems.push(`헤더 높이 ${top.headerHeight} (기대 92 근처)`);
      if (top.tabs !== expectedTabs) problems.push(`탭 ${top.tabs}개 (기대 ${expectedTabs})`);
      if (!/255, 230, 166/.test(top.frameBorder)) problems.push(`금테 프레임 없음: ${top.frameBorder}`);
      if (!inner) problems.push('안쪽 화면 문서를 읽지 못함');
      else {
        if (inner.screen !== s.id) problems.push(`안쪽 화면 표시 ${inner.screen} (기대 ${s.id})`);
        if (inner.stageToken !== '#040407') problems.push(`안쪽 화면에 --lt-stage 토큰 없음 (${inner.stageToken || '빈 값'})`);
        if (s.frameBg && inner.bodyBg !== s.frameBg) problems.push(`안쪽 배경 ${inner.bodyBg} (기대 ${s.frameBg})`);
      }
    }
    // 계정 표시: 로그인 상태면 44x44 첫 글자 동그라미 + aria-label, 로그아웃 상태면 로그인 알약.
    if (top.avatarVisible) {
      if (!top.avatarSize || top.avatarSize[0] !== 44 || top.avatarSize[1] !== 44) problems.push(`계정 동그라미 크기 ${JSON.stringify(top.avatarSize)} (기대 44x44)`);
      if (!/^내 계정 메뉴, .+로 로그인됨$/.test(top.avatarAria)) problems.push(`계정 aria-label "${top.avatarAria}"`);
      if (top.loginVisible) problems.push('로그인 상태에서 로그인 알약이 같이 보임');
    } else if (!top.loginVisible) {
      problems.push('로그아웃 상태인데 로그인 알약이 안 보임');
    }
    record(`visual-${s.id}`, 'visual', problems.length ? 'fail' : 'pass',
      problems.length ? problems.join('; ') : `${s.id}: 무대·금테·헤더·토큰 일치`, { top, inner });
    await page.screenshot({ path: path.join(opts.out, `${stamp}-visual-${s.id}.png`) }).catch(() => {});
  }
  seen.push({ id: 'theme', result: await checkThemeRoundTrip(page, base, opts, stamp) });
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
  await page.waitForSelector('#community-menu', { timeout: opts.timeout }).catch(() => {});
  return seen;
}

async function checkHomeCardMenuMouse(page, target, opts, stamp) {
  // 2026-11-08 #213 2번: 첫 화면 도구 줄의 "보기 ▾" 메뉴를 마우스로 열어 1440/390에서 유지되는지,
  // 바깥 클릭·Esc로 닫히는지 운영에서 확인한다(shadow DOM retarget 회귀 방지).
  // 메뉴 하나에 움직임·테마(밤/정원)·카드 출처가 함께 있고, "순간 목록"은 메뉴 밖에 따로 남는다.
  // 기대 항목 수는 로그인 상태에 따라 다르다(로그아웃 5 = 움직임 1 + 테마 2 + 카드 2,
  // 로그인 7 = 움직임 1 + 테마 2 + 카드 4). 제품 함수 viewMenuItems 로 계산해 숫자를 두 번 적지 않는다.
  const problems = [];
  const base = new URL(target.href);
  const readMenu = () => page.evaluate(() => {
    const frame = document.getElementById('view');
    const doc = frame?.contentDocument;
    const sh = doc?.getElementById('orbit')?.shadowRoot;
    const menu = sh?.querySelector('#home-view-menu');
    const avatar = document.getElementById('account-avatar');
    return {
      hidden: menu?.hidden,
      expanded: sh?.querySelector('[data-lt-view-menu]')?.getAttribute('aria-expanded'),
      items: menu ? [...menu.querySelectorAll('[role^=menuitem]')].map((b) => b.textContent.trim()) : [],
      toolButtons: sh ? [...sh.querySelectorAll('.top-actions > button, .top-actions > span > button')].filter((b) => b.getClientRects().length > 0).map((b) => b.textContent.trim()) : [],
      loggedIn: !!avatar && !avatar.hidden && getComputedStyle(avatar).display !== 'none'
    };
  }).catch(() => null);
  const expectedItems = (loggedIn) => {
    if (!viewMenuItems) return { count: loggedIn ? 7 : 5, labels: [], source: 'fallback' };
    const items = viewMenuItems({ loggedIn });
    return {
      count: items.length,
      labels: items.map((item) => item.label),
      source: 'v41/home-view-menu.js'
    };
  };
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height }).catch(() => {});
    const url = new URL(base.href);
    url.search = `?cardmenu=${Date.now()}`;
    url.hash = '';
    await page.goto(url.href, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    await sleep(2500);
    // 첫 방문 안내(tree-tips)가 열려 있으면 클릭을 가로막으므로 먼저 닫고 진행한다.
    const tips = await page.evaluate(() => {
      const box = document.getElementById('tree-tips');
      if (!box || box.hidden || !box.getClientRects().length) return null;
      const title = box.querySelector('h2')?.textContent?.trim() || '안내';
      document.getElementById('tree-tips-close')?.click();
      return { title, closed: !!box.hidden };
    }).catch(() => null);
    if (tips) {
      await sleep(300);
      recordInfo(`card-menu-tips-${width}`, 'visual',
        `${width}: 첫 방문 안내(${tips.title})를 닫고 메뉴 검사를 진행${tips.closed ? '' : ' — 닫힘 확인 실패'}`, tips);
    }
    const frame = await viewFrame(page);
    const button = frame?.locator('[data-lt-view-menu]').first();
    if (!button || !(await button.count().catch(() => 0))) {
      problems.push(`${width}: 보기 메뉴 버튼 없음`);
      continue;
    }
    await button.click().catch((error) => problems.push(`${width}: 열기 클릭 실패 ${error.message}`));
    await sleep(900);
    const opened = await readMenu();
    if (!opened || opened.hidden !== false || opened.expanded !== 'true') {
      problems.push(`${width}: 마우스 클릭 후 닫힘 ${JSON.stringify(opened)}`);
      continue;
    }
    const expected = expectedItems(opened.loggedIn);
    const state = opened.loggedIn ? '로그인' : '로그아웃';
    if (!opened.items.includes('밤') || !opened.items.includes('정원')) problems.push(`${width}: 메뉴에 테마 항목 없음 ${JSON.stringify(opened.items)}`);
    if (!opened.items.some((label) => label.startsWith('움직임'))) problems.push(`${width}: 메뉴에 움직임 항목 없음 ${JSON.stringify(opened.items)}`);
    if (opened.items.length !== expected.count) problems.push(`${width}: ${state} 메뉴 항목 ${opened.items.length}개 (기대 ${expected.count}${expected.source === 'fallback' ? ' · 제품 함수 없음' : ''})`);
    for (const label of expected.labels) {
      const found = opened.items.some((actual) => actual === label || (label.startsWith('움직임') && actual.startsWith('움직임')));
      if (!found) problems.push(`${width}: ${state} 메뉴에 "${label}" 없음 ${JSON.stringify(opened.items)}`);
    }
    if (!opened.toolButtons.includes('순간 목록')) problems.push(`${width}: "순간 목록"이 도구 줄에 없음 ${JSON.stringify(opened.toolButtons)}`);
    if (opened.toolButtons.filter((label) => label && label !== '순간 목록').length !== 1) problems.push(`${width}: 도구 줄 버튼 ${JSON.stringify(opened.toolButtons)} (기대 보기·순간 목록 2개)`);
    await page.screenshot({ path: path.join(opts.out, `${stamp}-card-menu-mouse-${width}.png`) }).catch(() => {});
    await frame.locator('body').click({ position: { x: 2, y: 2 } }).catch((error) => problems.push(`${width}: 바깥 클릭 실패 ${error.message}`));
    await sleep(400);
    const closed = await readMenu();
    if (!closed || closed.hidden !== true) problems.push(`${width}: 바깥 클릭 후에도 열림 ${JSON.stringify(closed)}`);
    await button.click().catch(() => {});
    await sleep(300);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(300);
    const escaped = await readMenu();
    if (!escaped || escaped.hidden !== true) problems.push(`${width}: Esc 후에도 열림 ${JSON.stringify(escaped)}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  record('home-card-menu-mouse', 'visual', problems.length ? 'fail' : 'pass',
    problems.length ? problems.join('; ') : '보기 메뉴: 열림 유지·항목(움직임·밤/정원·카드, 로그인 상태별)·바깥 클릭/Esc 닫힘 (1440/390)', { problems });
}

// 로그인 상태에서만 보이는 헤더 버튼 검사(2026-11-08).
// #245 셸 분리 때 `#write-menu` 클릭 연결이 빠졌는데, 로그아웃 검사만으로는 이 버튼이 아예 안 보여 잡지 못했다.
// 그래서 로그인(--auto-login)·트리 있는 상태에서 "순간 남기기"→편집기, 책장에서"새 트리 흐름", 계정 메뉴·공유 패널 열고 닫기를 확인한다.
// 로그아웃 상태에서는 skip으로 남겨 세 실행(트리 있음·트리 0·로그아웃) 모두 같은 표를 갖게 한다.
async function checkSignedInActions(page, target, opts, stamp) {
  const state = await page.evaluate(() => {
    const avatar = document.getElementById('account-avatar');
    const owned = document.body.dataset.member ? document.body.dataset.member === 'in' : !!(avatar && !avatar.hidden);
    return { owned, treeCount: Number(document.body.dataset.treeCount || 0) || 0 };
  }).catch(() => ({ owned: false, treeCount: 0 }));
  if (!state.owned) {
    record('signed-in-actions', 'auth', 'skip', '로그아웃 상태라 로그인 전용 버튼 검사를 건너뜀');
    return;
  }

  const writeButton = () => page.evaluate(() => {
    const button = document.getElementById('write-menu');
    if (!button) return null;
    return { hidden: !!button.hidden, visible: button.getClientRects().length > 0, label: (button.textContent || '').trim() };
  }).catch(() => null);
  const editorOpen = () => page.waitForFunction(() => document.getElementById('editor')?.open === true, { timeout: 3000 })
    .then(() => true).catch(() => false);
  const closeEditor = async () => {
    await page.evaluate(() => document.getElementById('editor')?.close()).catch(() => {});
    await sleep(300);
  };

  // 1) 기록이 있는 화면: "순간 남기기" → 편집기(추가 모드)가 열린다.
  await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
  await page.waitForSelector('#community-menu', { timeout: opts.timeout }).catch(() => {});
  await sleep(1500);
  const button = await writeButton();
  if (!button || !button.visible) {
    record('write-menu-editor', 'auth', 'fail', `로그인 상태인데 "순간 남기기" 버튼이 보이지 않음 ${JSON.stringify(button)}`);
  } else {
    await clickSmart(page, '#write-menu');
    const opened = await editorOpen();
    const detail = await page.evaluate(() => ({
      hash: location.hash,
      editorOpen: !!document.getElementById('editor')?.open,
      editorTitle: document.getElementById('editor-title')?.textContent || '',
      journey: !!document.querySelector('iframe#view') && /first-journey/.test(document.getElementById('view')?.contentWindow?.location?.href || ''),
      feedback: document.getElementById('record-feedback')?.textContent || ''
    })).catch(() => ({}));
    // 트리가 없으면 같은 버튼이 편집기 대신 첫 여정(새 트리 흐름)을 연다 — 둘 다 정상이다.
    const newTreeFlow = /#journey/.test(detail.hash || '') || !!detail.journey;
    record('write-menu-editor', 'auth', opened || newTreeFlow ? 'pass' : 'fail',
      opened ? `"${button.label}" 클릭 → 편집기 열림 (${detail.editorTitle || detail.hash})`
        : newTreeFlow ? `"${button.label}" 클릭 → 새 트리 흐름 (${detail.hash || 'first-journey'})`
        : `"${button.label}" 클릭 뒤 3초 안에 #editor·첫 여정이 열리지 않음 (hash=${detail.hash || ''} journey=${detail.journey} 안내="${(detail.feedback || '').slice(0, 60)}")`,
      { button, detail });
    await page.screenshot({ path: path.join(opts.out, `${stamp}-write-menu-1440.png`) }).catch(() => {});
    if (opened) await closeEditor();

    // 2) 내 책장에서 같은 버튼 → 새 트리 흐름(첫 여정 또는 편집기 new 모드).
    await page.evaluate(() => { location.hash = '#shelf'; }).catch(() => {});
    await sleep(2500);
    await clickSmart(page, '#write-menu');
    const after = await page.evaluate(() => ({
      hash: location.hash,
      editorOpen: !!document.getElementById('editor')?.open,
      editorTitle: document.getElementById('editor-title')?.textContent || '',
      journey: /first-journey/.test(document.getElementById('view')?.contentWindow?.location?.href || '')
    })).catch(() => ({}));
    const newFlow = /#journey/.test(after.hash || '') || after.journey || (after.editorOpen && /새|추가/.test(after.editorTitle || ''));
    record('write-menu-shelf-new-tree', 'auth', newFlow ? 'pass' : 'fail',
      newFlow ? `책장에서 클릭 → 새 트리 흐름 (${after.hash || after.editorTitle})`
        : `책장에서 클릭 뒤 새 트리 흐름이 열리지 않음 ${JSON.stringify(after)}`, { after });
    if (after.editorOpen) await closeEditor();
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
    await page.waitForSelector('#community-menu', { timeout: opts.timeout }).catch(() => {});
    await sleep(1500);
  }

  // 3) 계정 메뉴: 동그라미 클릭 → 팝오버 열림, 바깥 클릭 → 닫힘.
  const popover = () => page.evaluate(() => ({
    hidden: document.getElementById('account-popover')?.hidden,
    expanded: document.getElementById('account-avatar')?.getAttribute('aria-expanded'),
    items: [...(document.getElementById('account-popover')?.querySelectorAll('[role=menuitem]') || [])].map((n) => (n.textContent || '').trim())
  })).catch(() => null);
  await clickSmart(page, '#account-avatar');
  await sleep(500);
  const openedMenu = await popover();
  // 닫기는 Esc(제품이 지원)로 먼저, 안 닫히면 바깥 클릭으로 한 번 더 확인한다.
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  let closedMenu = await popover();
  if (closedMenu && closedMenu.hidden === false) {
    await page.mouse.click(8, 400).catch(() => {});
    await sleep(500);
    closedMenu = await popover();
  }
  const menuOk = openedMenu && openedMenu.hidden === false && openedMenu.items.length >= 4 && closedMenu && closedMenu.hidden === true;
  record('account-menu-open-close', 'auth', menuOk ? 'pass' : 'fail',
    menuOk ? `계정 메뉴 열림(${openedMenu.items.length}개 항목)·바깥 클릭 닫힘`
      : `계정 메뉴 열림/닫힘 확인 실패 ${JSON.stringify({ openedMenu, closedMenu })}`, { openedMenu, closedMenu });

  // 4) 공유 패널: 로그인 전용 버튼 → 열림, 닫기 버튼 → 닫힘.
  const shareVisible = await page.evaluate(() => {
    const button = document.getElementById('share-menu');
    return !!button && !button.hidden;
  }).catch(() => false);
  if (!shareVisible) {
    record('share-panel-open-close', 'auth', 'warn', '공유 버튼이 보이지 않음(서버 기록을 열지 않은 상태일 수 있음)');
  } else {
    await clickSmart(page, '#share-menu');
    await sleep(1200);
    const shareOpen = await page.evaluate(() => !!document.getElementById('share-panel')?.open).catch(() => false);
    const feedback = await page.evaluate(() => document.getElementById('share-feedback')?.textContent || '').catch(() => '');
    let shareClosed = null;
    if (shareOpen) {
      const closeButton = await page.$('[data-close="share-panel"]');
      if (closeButton) await closeButton.click().catch(() => {});
      else await page.evaluate(() => document.getElementById('share-panel')?.close()).catch(() => {});
      await sleep(600);
      shareClosed = await page.evaluate(() => !document.getElementById('share-panel')?.open).catch(() => null);
      await page.screenshot({ path: path.join(opts.out, `${stamp}-share-panel-1440.png`) }).catch(() => {});
    }
    record('share-panel-open-close', 'auth', shareOpen && shareClosed ? 'pass' : 'fail',
      shareOpen && shareClosed ? '공유 패널 열림·닫힘 확인'
        : `공유 패널 확인 실패 (열림=${shareOpen} 닫힘=${shareClosed} 안내="${(feedback || '').slice(0, 60)}")`, { shareOpen, shareClosed, feedback });
  }
  await page.screenshot({ path: path.join(opts.out, `${stamp}-signed-in-1440.png`) }).catch(() => {});
}

// 로그인 흐름 자동 검사(2026-11-08 보완 3판, --auth-flows). 각 경로는 빈 프로필의 새 context에서 시작한다.
// 비밀번호는 .secrets에서 읽어 폼에만 넣고 로그·리포트에 남기지 않는다.
async function completeGateLogin(page, password, target, timeout) {
  const deadline = Date.now() + timeout;
  let lastStep = '';
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.startsWith(target.origin) && !/\/auth\//.test(url)) {
      if (await sessionLoggedIn(page, 5000).catch(() => false)) return { ok: true, lastStep };
    }
    if (/accounts\.google\.com/.test(url)) return { ok: false, reason: 'Google OAuth 화면이 나와 멈춤' };
    if (/auth\.padiem\.net/.test(url) && (await page.locator('#email').count().catch(() => 0))) {
      await page.locator('#email').fill(AUTO_LOGIN_EMAIL).catch(() => {});
      await page.locator('#password').fill(password).catch(() => {});
      await page.locator('form button[type=submit]').first().click({ timeout: 5000 }).catch(() => {});
      lastStep = 'auth:email';
      await sleep(2500);
      continue;
    }
    if (/chat\.padiem\.net/.test(url)) {
      const identifier = page.locator('#passwordLoginIdentifier');
      if (await identifier.count().catch(() => 0)) {
        if (!(await identifier.isVisible().catch(() => false))) {
          await page.locator('#authOpen, [data-auth-open], button:has-text("로그인")').first().click({ timeout: 3000 }).catch(() => {});
          await sleep(800);
        }
        await identifier.fill(AUTO_LOGIN_EMAIL).catch(() => {});
        await page.locator('#passwordLoginPassword').fill(password).catch(() => {});
        await page.locator('#passwordLoginSubmit').click({ timeout: 5000 }).catch(() => {});
        lastStep = 'chat:password';
        await sleep(2500);
        continue;
      }
    }
    await sleep(1000);
  }
  return { ok: false, reason: `로그인 완료 대기 시간 초과 (${page.url().split(/[?#]/)[0]})`, lastStep };
}

const flowVisibleFrame = (page) => page.frames().filter((frame) => frame !== page.mainFrame() && !frame.url().startsWith('about:')).pop();
const flowState = (page) => page.evaluate(() => ({
  href: location.href,
  search: location.search,
  hash: location.hash,
  path: location.pathname,
  member: document.body.dataset.member || '',
  treeCount: Number(document.body.dataset.treeCount || 0) || 0,
  entryVisible: (() => { const node = document.getElementById('account-entry'); return !!node && !node.hidden && node.getClientRects().length > 0; })(),
  avatarVisible: (() => { const node = document.getElementById('account-avatar'); return !!node && !node.hidden && node.getClientRects().length > 0; })(),
  theme: document.documentElement.dataset.ltTheme || document.documentElement.getAttribute('data-lt-theme') || ''
})).catch(() => ({}));

// 계정 메뉴를 열고 "로그아웃"을 누른다. 팝오버가 늦게 열려 클릭이 빗나가는 경우가 있어 재시도한다.
async function logoutViaAccountMenu(page, timeout) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.click('#account-avatar', { timeout: 5000 }).catch(() => {});
    const popover = page.locator('#account-popover');
    await popover.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    const logout = page.locator('#account-logout');
    if (await logout.count().catch(() => 0)) {
      await logout.click({ timeout: 4000 }).catch(() => {});
      await sleep(3500);
      const member = await page.evaluate(() => document.body.dataset.member || '').catch(() => '');
      if (member !== 'in') return { ok: true, attempts: attempt + 1 };
      // 팝오버가 열린 채 남아 있으면 닫고 다시 시도한다.
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(600);
    } else {
      await sleep(800);
    }
  }
  const member = await page.evaluate(() => document.body.dataset.member || '').catch(() => '');
  return { ok: member !== 'in', attempts: 3, member };
}

async function runAuthFlows(target, opts, stamp) {
  const secret = await readSecret('PADIEM_TUTORIAL01_PASSWORD', opts.secrets);
  if (!secret.ok) {
    record('auth-flows', 'auth-flows', 'warn', `비밀번호 원천을 읽지 못해 로그인 흐름 검사를 건너뜀 (${secret.reason})`);
    return { createdTrees: 0 };
  }
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: opts.headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check']
  });
  let createdTrees = 0;
  const restoreNavigation = new WeakSet();
  const withFlow = async (name, run) => {
    const started = Date.now();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    const errors = [];
    const badResponses = [];
    const dialogs = [];
    const notFound = [];
    const initiators = new Map();
    const safeUrl = (url) => { try { const u = new URL(url); return u.origin + u.pathname; } catch { return ''; } };
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', ({ request, initiator }) => {
      const frames = initiator?.stack?.callFrames || [];
      initiators.set(safeUrl(request.url), {
        type: initiator?.type || '',
        source: safeUrl(initiator?.url || ''),
        line: initiator?.lineNumber ?? null,
        stack: frames.slice(0, 4).map((f) => ({ url: safeUrl(f.url), line: f.lineNumber, function: f.functionName }))
      });
    });
    page.on('response', (response) => {
      if (response.status() === 404) notFound.push({
        url: safeUrl(response.url()), resourceType: response.request().resourceType(),
        initiator: initiators.get(safeUrl(response.url())) || null
      });
    });
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 120)));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const location = message.location();
      const url = location.url ? location.url.split(/[?#]/)[0] : '';
      errors.push(message.text().slice(0, 120) + (url ? ' [' + url + ':' + location.lineNumber + ']' : ''));
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && !/favicon|analytics|gtag/.test(response.url())) {
        badResponses.push(`${response.status()} ${response.url().split(/[?#]/)[0]}`);
      }
    });
    // 흐름 중 뜨는 확인창은 메시지만 남기고 기본 동작(취소)을 유지한다. 정리 단계에서만 수락한다.
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type() + ': ' + dialog.message().slice(0, 80));
      if (dialog.type() === 'beforeunload' && restoreNavigation.has(page)) dialog.accept().catch(() => {});
      else dialog.dismiss().catch(() => {});
    });
    let result = { ok: false, detail: '실행 전 중단' };
    try {
      result = await run(page, context);
    } catch (error) {
      result = { ok: false, detail: `예외: ${error.message.slice(0, 160)}` };
    } finally {
      const durationMs = Date.now() - started;
      const problem = errors.filter((text) => !isIgnorableConsoleError(text));
      if (result.ok && problem.length) {
        result = { ...result, ok: false, detail: `${result.detail} / 콘솔 오류 ${problem.length}건: ${problem[0]}${badResponses.length ? ` [실패 응답 ${badResponses.slice(0, 3).join(' | ')}]` : ''}` };
      }
      await page.screenshot({ path: path.join(opts.out, `${stamp}-${name}.png`) }).catch(() => {});
      const status = result.status || (result.ok ? 'pass' : 'fail');
      record(name, 'auth-flows', status, `${result.detail} (${(durationMs / 1000).toFixed(1)}초)`, {
        durationMs,
        steps: result.steps || null,
        diagnostics: { ...result.diagnostics, shell: await page.evaluate(() => ({ member: document.body.dataset.member || '', treeCount: document.body.dataset.treeCount || '' })).catch(() => ({})), frames: page.frames().map((frame) => frame.url().split(/[?#]/)[0]) },
        dialogs: dialogs.length ? dialogs : null,
        consoleErrors: problem,
        notFound,
        badResponses: badResponses.length ? badResponses.slice(0, 6) : null
      });
      await context.close().catch(() => {});
    }
    return result;
  };

  const openShell = async (page, hash = '') => {
    await page.goto(target.href + hash, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
    await page.waitForSelector('#community-menu', { timeout: opts.timeout }).catch(() => {});
    await sleep(2500);
  };
  const loginWithAccountEntry = async (page) => {
    await openShell(page);
    const href = await page.getAttribute('#account-entry', 'href').catch(() => null);
    if (!href) return { ok: false, reason: '로그인 링크(#account-entry)를 찾지 못함' };
    await page.goto(new URL(href, target.href).href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
    const result = await completeGateLogin(page, secret.value, target, opts.timeout);
    await sleep(2000);
    return result;
  };
  const createTree = async (page, steps) => {
    const state = await flowState(page);
    if (state.treeCount > 0) return true;
    await page.click('#write-menu', { timeout: 5000 }).catch(() => {});
    await sleep(3500);
    const frame = page.frames().find((item) => /first-journey/.test(item.url()) && item !== page.mainFrame());
    if (!frame) { steps?.push('첫 여정 화면을 찾지 못함'); return false; }
    await frame.locator('#subject').fill('레인4 흐름 검사 트리').catch(() => {});
    await frame.locator('#primary').click({ timeout: 5000 }).catch(() => {});
    await sleep(1800);
    await frame.locator('#url').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ').catch(() => {});
    await sleep(1200);
    for (let i = 0; i < 4; i += 1) {
      await frame.locator('#primary').click({ timeout: 5000 }).catch(() => {});
      await sleep(2000);
    }
    await openShell(page);
    const after = await flowState(page);
    steps?.push(`첫 여정으로 트리 생성 → treeCount=${after.treeCount}`);
    return after.treeCount > 0;
  };
  const watchRequests = (targetPage, label, log) => {
    targetPage.on('response', (response) => {
      const request = response.request();
      const url = response.url();
      const isPost = request.method() !== 'GET' && request.method() !== 'HEAD';
      if (isPost || /logout|auth|workspace|session/.test(url)) {
        log.push({ tab: label, method: request.method(), path: url.replace(/^https:\/\/[^/]+/, '').split('?')[0], status: response.status() });
      }
    });
  };
  const sessionStatus = (page) => page.evaluate(async () => {
    try {
      const response = await fetch('/api/workspace?features=bound-writes', { credentials: 'include', headers: { accept: 'application/json' } });
      return response.status;
    } catch (error) { return `error:${error.message.slice(0, 40)}`; }
  }).catch(() => 'error');
  const openEditor = async (page) => {
    await page.click('#write-menu', { timeout: 5000 }).catch(() => {});
    await sleep(2500);
    return page.evaluate(() => !!document.getElementById('editor')?.open).catch(() => false);
  };
  const fillMoment = (page, title) => page.evaluate((value) => {
    window.__lt41AuthRequired = window.__lt41AuthRequired || 0;
    if (!window.__lt41Watch) {
      window.__lt41Watch = true;
      window.addEventListener('lovetree-auth-required', () => { window.__lt41AuthRequired += 1; });
    }
    const form = document.getElementById('moment-form');
    form.elements.title.value = value;
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    form.elements.title.dispatchEvent(new Event('input', { bubbles: true }));
  }, title).catch(() => {});

  try {
    // A2-1 먼저: 빈 계정 기대값(트리 0). 뒤 검사들이 트리를 만들기 때문에 순서가 중요하다.
    await withFlow('flow-status-a2-shelf-intent-empty', async (page) => {
      await openShell(page);
      await page.click('nav button[data-view="track32-bookshelf.html"]', { timeout: 5000 }).catch(() => {});
      await sleep(2500);
      const loginUrl = page.url();
      const wentToLogin = new URL(loginUrl).host !== target.host || /\/auth\/login|\/login\?client_id=/.test(loginUrl);
      if (!wentToLogin) return { ok: false, detail: `내 책장 클릭이 로그인으로 이어지지 않음 (${loginUrl})` };
      const login = await completeGateLogin(page, secret.value, target, opts.timeout);
      if (!login.ok) return { ok: false, detail: `로그인 실패: ${login.reason}` };
      await sleep(5000);
      const state = await flowState(page);
      const empty = await page.evaluate(() => {
        const node = document.getElementById('empty');
        const heading = node?.querySelector('h1, h2, strong');
        return { visible: !!node && !node.hidden && node.getClientRects().length > 0, text: (heading?.textContent || '').trim().slice(0, 40) };
      }).catch(() => ({}));
      const apiCount = await page.evaluate(async () => {
        const response = await fetch('/api/workspace?features=bound-writes', { credentials: 'include' });
        if (!response.ok) return null;
        const data = await response.json();
        const state = data?.state || data;
        return Array.isArray(state?.trees) ? state.trees.length : null;
      }).catch(() => null);
      const ok = apiCount === 0 && /#(?:my\/)?shelf(?:[?]|$)/.test(state.hash || '') && empty.visible;
      return { ok, detail: ok
        ? `트리 0 계정: 복귀 ${state.hash} · #empty 보임("${empty.text}")`
        : `트리 0 계정 기대값 불일치: API trees=${apiCount} hash=${state.hash || ''} #empty=${empty.visible} frame=${flowVisibleFrame(page)?.url() || ''}` };
    });

    // A1: 로그인 복귀 주소에 ?intent= 없음 + 새 트리 흐름이 첫 여정을 한 번만 연다.
    await withFlow('flow-status-a1-login-return', async (page) => {
      const steps = [];
      const login = await loginWithAccountEntry(page);
      if (!login.ok) return { ok: false, detail: `로그인 실패: ${login.reason}`, steps };
      const after = await flowState(page);
      steps.push(`복귀: path=${after.path} search=${after.search || '(없음)'} hash=${after.hash || '(없음)'}`);
      if (/intent=/.test(after.search || '')) return { ok: false, detail: `복귀 주소에 ?intent= 가 남아 있음 (${after.search})`, steps };
      await page.click('#write-menu', { timeout: 5000 }).catch(() => {});
      await sleep(3000);
      const journey = await flowState(page);
      const openedFirst = /#journey\/0\d/.test(journey.hash || '');
      steps.push(`새 트리: hash=${journey.hash || '(없음)'}`);
      if (openedFirst) createdTrees += 1;
      if (!openedFirst) return { ok: false, detail: `새 트리 흐름이 첫 여정을 열지 않음 (hash=${journey.hash || ''})`, steps };
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(3500);
      const reloaded = await flowState(page);
      const again = /#journey\/0\d/.test(reloaded.hash || '');
      steps.push(`새로고침: hash=${reloaded.hash || '(없음)'} 재진입=${again}`);
      return { ok: true, detail: again ? '복귀 주소에 intent 없음 · 새로고침 뒤에도 첫 여정 1회' : '복귀 주소에 intent 없음 · 첫 여정 1회', steps };
    });

    // A2-2: 트리 있는 계정 — 복귀하면 보이는 iframe이 내 책장. (A1이 만든 트리를 그대로 쓴다)
    await withFlow('flow-status-a2-shelf-intent-tree', async (page) => {
      // Prepare the account elsewhere so journey/sessionStorage state cannot consume the shelf intent.
      const setupContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
      try {
        const setupPage = await setupContext.newPage();
        const loginFirst = await loginWithAccountEntry(setupPage);
        if (!loginFirst.ok) return { ok: false, detail: '트리 준비 로그인 실패: ' + loginFirst.reason };
        if (!(await createTree(setupPage, []))) return { ok: false, detail: '검사용 트리를 만들지 못함' };
        const serverCount = await setupPage.evaluate(async () => {
          const response = await fetch('/api/workspace?features=bound-writes', { credentials: 'include' });
          if (!response.ok) return null;
          const data = await response.json();
          return (data?.state?.trees || data?.trees || []).length;
        });
        if (!(serverCount > 0)) return { ok: false, detail: '준비한 트리의 서버 저장 확인 실패' };
      } finally {
        await setupContext.close();
      }
      await openShell(page);
      await page.click('nav button[data-view="track32-bookshelf.html"]', { timeout: 5000 }).catch(() => {});
      await sleep(2500);
      const loginUrl = page.url();
      const wentToLogin = new URL(loginUrl).host !== target.host || /\/auth\/login|\/login\?client_id=/.test(loginUrl);
      if (!wentToLogin) return { ok: false, detail: '트리 있는 계정의 책장 클릭이 로그인으로 이어지지 않음' };
      if (wentToLogin) {
        const login2 = await completeGateLogin(page, secret.value, target, opts.timeout);
        if (!login2.ok) return { ok: false, detail: `로그인 실패: ${login2.reason}` };
      }
      await page.waitForFunction(() => document.body.dataset.member === 'in' && Number(document.body.dataset.treeCount) > 0, null, { timeout: opts.timeout });
      await page.waitForFunction(() => /track32-bookshelf/.test(document.getElementById('view')?.contentDocument?.URL || ''), null, { timeout: opts.timeout });
      let frame = flowVisibleFrame(page);
      let state = await flowState(page);
      let shelf = /track32-bookshelf/.test(frame?.url() || '');
      if (!shelf && /#(?:my\/)?shelf(?:[?]|$)/.test(state.hash || '')) {
        await sleep(5000);
        frame = flowVisibleFrame(page);
        state = await flowState(page);
        shelf = /track32-bookshelf/.test(frame?.url() || '');
      }
      return { ok: shelf, detail: shelf
        ? `트리 ${state.treeCount}개 계정: 복귀 후 내 책장 iframe 열림`
        : `트리 ${state.treeCount}개 계정인데 내 책장이 열리지 않음 (hash=${state.hash || ''} frame=${frame?.url() || ''})` };
    });

    // A3: 정원 테마 유지
    await withFlow('flow-status-a3-garden-theme', async (page, context) => {
      await context.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'garden'); } catch {} });
      await openShell(page);
      const href = await page.getAttribute('#account-entry', 'href');
      await page.goto(new URL(href, target.href).href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
      const loginUrl = page.url();
      const hasTheme = /lt_theme=garden/.test(loginUrl);
      const login = await completeGateLogin(page, secret.value, target, opts.timeout);
      if (!login.ok) return { ok: false, detail: `로그인 실패: ${login.reason} (로그인 주소 lt_theme=${hasTheme})` };
      await sleep(3000);
      const state = await flowState(page);
      const ok = hasTheme && state.theme === 'garden';
      return { ok, detail: ok ? '로그인 화면 lt_theme=garden · 복귀 화면 data-lt-theme=garden' : `로그인 주소 lt_theme=${hasTheme} / 복귀 테마="${state.theme}"` };
    });

    // H1: 로그아웃 → 첫 화면·로그인 버튼 보임·아바타 숨김
    await withFlow('flow-status-h1-logout', async (page) => {
      const login = await loginWithAccountEntry(page);
      if (!login.ok) return { ok: false, detail: `로그인 실패: ${login.reason}` };
      const logout = await logoutViaAccountMenu(page, opts.timeout);
      await sleep(1500);
      const state = await flowState(page);
      const home = /#home$/.test(state.href) || /\/v41\/$/.test(state.href);
      if (!logout.ok) return { ok: false, detail: `로그아웃 클릭이 3회 모두 먹히지 않음 (member=${logout.member || state.member})`, steps: [`시도 ${logout.attempts}회`] };
      const ok = state.entryVisible && !state.avatarVisible && (home || state.member === 'out');
      return { ok, detail: ok ? `로그아웃 뒤 첫 화면 · 로그인 버튼 보임 · 아바타 숨김 (${state.hash || state.path})` : `로그아웃 뒤 상태: 로그인 버튼=${state.entryVisible} 아바타=${state.avatarVisible} href=${state.href}` };
    });

    // H2-a(진단): 원래 순서 — 탭 A에 먼저 입력한 뒤 탭 B 로그아웃. 미저장 보호 안내가 뜨는지 사실만 남긴다.
    await withFlow('flow-status-h2-protection-notice', async (page, context) => {
      const steps = [];
      const diagnostics = {};
      const login = await loginWithAccountEntry(page);
      if (!login.ok) return { ok: false, detail: `로그인 실패: ${login.reason}`, steps };
      const made = await createTree(page, steps);
      if (made) createdTrees += 1;
      await openShell(page);
      if (!(await openEditor(page))) return { ok: false, detail: '탭 A에서 편집기가 열리지 않음', steps };
      await fillMoment(page, '미저장 보호 확인용 입력');
      const tabB = await context.newPage();
      await tabB.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
      await tabB.waitForSelector('#account-avatar', { timeout: opts.timeout }).catch(() => {});
      await sleep(2500);
      const logoutB = await logoutViaAccountMenu(tabB, opts.timeout);
      await sleep(1500);
      const bState = await flowState(tabB);
      const notice = await tabB.evaluate(() => {
        const picks = ['#save-feedback', '#record-feedback', '#toast', '#account-notice', '#notice'];
        return picks.map((id) => ({ id, text: (document.getElementById(id)?.textContent || '').trim().slice(0, 80), hidden: document.getElementById(id)?.hidden })).filter((row) => row.text);
      }).catch(() => []);
      diagnostics.tabBMember = bState.member;
      diagnostics.notices = notice;
      diagnostics.sessionStatus = await sessionStatus(page);
      steps.push(`탭 B 로그아웃 시도 뒤 member=${bState.member} · 세션 확인=${diagnostics.sessionStatus}`);
      steps.push(`탭 B 안내: ${notice.map((row) => `${row.id}="${row.text}"`).join(' / ') || '(없음)'}`);
      await tabB.close().catch(() => {});
      return { ok: true, detail: bState.member === 'in' ? '미저장 보호 동작 확인(로그아웃 안 됨)' : '탭 B 로그아웃이 그대로 진행됨(보호 안내 없음)', steps, diagnostics };
    });

    // H2-b(본 검사): 탭 A는 편집기만(입력 전) → 탭 B 로그아웃 → 401 → 탭 A 입력·저장 → 만료 안내·보존·임시 키 → 재로그인 복원 → 다시 시도
    await withFlow('flow-status-h2-expiry-restore', async (page, context) => {
      const steps = [];
      const diagnostics = {};
      const requests = [];
      watchRequests(page, 'A', requests);
      const login = await loginWithAccountEntry(page);
      if (!login.ok) return { ok: false, detail: `로그인 실패: ${login.reason}`, steps };
      const made = await createTree(page, steps);
      if (made) createdTrees += 1;
      await openShell(page);
      const withTree = await flowState(page);
      steps.push(`트리 ${withTree.treeCount}개`);
      if (withTree.treeCount < 1) return { ok: false, detail: '트리가 없어 만료 시나리오를 만들 수 없음', steps };
      // 탭 A: 편집기만 연다(입력은 로그아웃 뒤에).
      if (!(await openEditor(page))) return { ok: false, detail: '탭 A에서 편집기가 열리지 않아 저장 시나리오를 만들 수 없음', steps };
      steps.push('탭 A 편집기 열어 둠(입력 전)');
      const tabB = await context.newPage();
      watchRequests(tabB, 'B', requests);
      diagnostics.sameContext = tabB.context() === page.context();
      await tabB.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
      await tabB.waitForSelector('#account-avatar', { timeout: opts.timeout }).catch(() => {});
      await sleep(2500);
      const logoutB = await logoutViaAccountMenu(tabB, opts.timeout);
      await sleep(1500);
      const bState = await flowState(tabB);
      steps.push(`탭 B 로그아웃 시도 ${logoutB.attempts}회`);
      diagnostics.tabBMember = bState.member || 'out';
      diagnostics.tabBMessages = await tabB.evaluate(() => ['#save-feedback', '#record-feedback', '#toast', '#account-notice'].map((id) => ({ id, text: (document.getElementById(id)?.textContent || '').trim().slice(0, 60) })).filter((row) => row.text)).catch(() => []);
      diagnostics.cookieNames = (await context.cookies(target.href).catch(() => [])).map((cookie) => cookie.name).sort();
      diagnostics.sessionStatus = await sessionStatus(page);
      diagnostics.tabAMember = (await flowState(page)).member || '';
      steps.push(`탭 B 로그아웃 뒤: member=${diagnostics.tabBMember} · 쿠키 이름=[${diagnostics.cookieNames.join(',')}] · 탭 A 세션 확인=${diagnostics.sessionStatus} (탭 A member=${diagnostics.tabAMember})`);
      if (diagnostics.tabBMessages.length) steps.push(`탭 B 안내: ${diagnostics.tabBMessages.map((row) => `${row.id}="${row.text}"`).join(' / ')}`);
      await tabB.close().catch(() => {});
      if (diagnostics.sessionStatus !== 401) {
        return { status: 'warn', detail: `탭 B 로그아웃 뒤 세션 확인이 ${diagnostics.sessionStatus} — 401이 아니라 만료 시나리오를 태울 수 없음 (탭 B member=${diagnostics.tabBMember})`, steps, diagnostics };
      }
      // 탭 A: 입력 후 저장 → 만료 안내·입력 보존·임시 키
      const momentTitle = `만료 검사 순간 ${stamp}`;
      await fillMoment(page, momentTitle);
      await sleep(400);
      await page.evaluate(() => document.getElementById('moment-form').requestSubmit());
      await sleep(4500);
      const afterSave = await page.evaluate(() => ({
        feedback: document.getElementById('save-feedback')?.hidden === false,
        message: (document.getElementById('save-message')?.textContent || '').slice(0, 80),
        title: document.getElementById('moment-form')?.elements?.title?.value || '',
        authRequired: window.__lt41AuthRequired || 0,
        keys: Object.keys(sessionStorage).filter((key) => key.startsWith('lovetree.v41.pending-write:'))
      })).catch(() => ({}));
      diagnostics.authRequiredEvents = afterSave.authRequired;
      diagnostics.pendingKeys = afterSave.keys?.length || 0;
      diagnostics.requests = requests.slice(0, 12);
      steps.push(`탭 A 저장: 안내줄=${afterSave.feedback} 이벤트=${afterSave.authRequired} 임시 키=${afterSave.keys?.length || 0} 입력 보존="${afterSave.title}"`);
      const expiredOk = afterSave.feedback && (afterSave.keys?.length || 0) > 0 && afterSave.title === momentTitle;
      if (!expiredOk) {
        return { ok: false, detail: `만료 처리 미동작: 안내=${afterSave.feedback} 이벤트=${afterSave.authRequired} 임시 키=${afterSave.keys?.length || 0}`, steps, diagnostics };
      }
      // 재로그인 → 새로고침 → 복원 안내 → 다시 시도 → 성공·임시 키 삭제
      // Follow the offered new-window login; navigating the dirty editor is cancelled by beforeunload.
      const [reloginPage] = await Promise.all([
        page.waitForEvent('popup', { timeout: opts.timeout }),
        page.locator('#save-actions button', { hasText: '새 창에서 로그인' }).click({ timeout: 5000 })
      ]);
      watchRequests(reloginPage, 'relogin', requests);
      let again = await completeGateLogin(reloginPage, secret.value, target, opts.timeout);
      await reloginPage.waitForFunction(() => document.body.dataset.member === 'in', null, { timeout: opts.timeout }).catch(() => {});
      const member = (await flowState(reloginPage)).member;
      diagnostics.reloginMember = member;
      if (!again.ok && member === 'in') {
        diagnostics.reloginFallbackUsed = true;
        again = { ok: true };
      }
      await reloginPage.close().catch(() => {});
      if (!again.ok || member !== 'in') return { ok: false, detail: '재로그인 실패: ' + (again.reason || 'member=' + member), steps, diagnostics };
      // Only after the pending draft was verified, accept the original tab's reload warning.
      restoreNavigation.add(page);
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: opts.timeout });
        await page.waitForFunction(() => document.body.dataset.member === 'in', null, { timeout: opts.timeout });
        await page.locator('#save-actions button', { hasText: '다시 시도' }).waitFor({ state: 'visible', timeout: opts.timeout });
      } finally {
        restoreNavigation.delete(page);
      }
      const restored = await page.evaluate(() => ({
        message: (document.getElementById('save-message')?.textContent || '').slice(0, 80),
        actions: [...(document.getElementById('save-actions')?.querySelectorAll('button') || [])].map((b) => (b.textContent || '').trim())
      })).catch(() => ({}));
      steps.push(`복원 안내="${restored.message}" 버튼=${(restored.actions || []).join('/') || '없음'}`);
      const retry = page.locator('#save-actions button', { hasText: '다시 시도' });
      if (!(await retry.count().catch(() => 0))) return { ok: false, detail: `복원 뒤 "다시 시도" 버튼이 없음 (안내="${restored.message}")`, steps, diagnostics };
      const savedResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/workspace' && response.request().method() === 'PUT',
        { timeout: opts.timeout }).catch(() => null);
      await retry.first().click({ timeout: 5000 });
      const saved = await savedResponse;
      diagnostics.retryStatus = saved?.status() ?? null;
      await page.waitForFunction(() => !Object.keys(sessionStorage).some((key) => key.startsWith('lovetree.v41.pending-write:')),
        null, { timeout: opts.timeout }).catch(() => {});
      diagnostics.serverSaved = await page.evaluate(async (title) => {
        const response = await fetch('/api/workspace?features=bound-writes', { credentials: 'include' });
        if (!response.ok) return false;
        const data = await response.json();
        return (data?.state?.trees || data?.trees || []).some((tree) => tree.moments?.some((moment) => moment.title === title));
      }, momentTitle).catch(() => false);
      const final = await page.evaluate(() => ({
        toast: (document.getElementById('toast')?.textContent || '').slice(0, 60),
        keys: Object.keys(sessionStorage).filter((key) => key.startsWith('lovetree.v41.pending-write:')).length,
        dirty: document.getElementById('write-menu')?.textContent || ''
      })).catch(() => ({}));
      steps.push(`다시 시도 뒤 토스트="${final.toast}" 임시 키=${final.keys}`);
      const savedOk = saved?.ok() && diagnostics.serverSaved && final.keys === 0 && !/미저장/.test(final.dirty || '');
      return { ok: savedOk, detail: savedOk ? '만료 안내 → 입력 보존 → 재로그인 복원 → 다시 시도 저장 성공 → 임시 키 삭제' : `다시 시도 뒤 저장 확인 실패 (임시 키=${final.keys})`, steps, diagnostics };
    });
  } finally {
    await browser.close().catch(() => {});
  }
  return { createdTrees };
}

async function cleanupAuthFlows(target, opts, stamp) {
  const started = Date.now();
  // 검사가 만든 트리·순간은 실패해도 반드시 지운다. 결과는 리포트에 남긴다.
  const secret = await readSecret('PADIEM_TUTORIAL01_PASSWORD', opts.secrets);
  if (!secret.ok) {
    record('flow-cleanup', 'auth-flows', 'warn', `정리용 비밀번호 원천을 읽지 못함 (${secret.reason})`);
    return;
  }
  const cleanupProfile = path.join(opts.out, '.flow-cleanup-profile');
  let context = null;
  let openError = '';
  try {
    context = await chromium.launchPersistentContext(cleanupProfile, {
      channel: 'chrome',
      headless: true,
      viewport: { width: 1440, height: 900 },
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check']
    });
  } catch (error) {
    openError = error.message.slice(0, 140);
  }
  if (!context) {
    record('flow-cleanup', 'auth-flows', 'warn', `정리용 브라우저를 열지 못함: ${openError}`);
    return;
  }
  const page = context.pages()[0] || (await context.newPage());
  let confirmCount = 0;
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'confirm') { confirmCount += 1; dialog.accept().catch(() => {}); }
    else dialog.dismiss().catch(() => {});
  });
  const cleanupFailures = [];
  const captureCleanupFailure = async (attempt, error) => {
    const screenshot = path.join(opts.out, `${stamp}-flow-cleanup-failure-${attempt}.png`);
    await page.screenshot({ path: screenshot }).catch(() => {});
    const state = await page.evaluate(() => {
      const dialog = document.getElementById('tree-manager');
      const button = document.getElementById('tree-delete');
      return { dialogExists: !!dialog, dialogOpen: !!dialog?.open,
        dialogVisible: !!dialog?.getClientRects().length,
        deleteExists: !!button, deleteVisible: !!button?.getClientRects().length,
        deleteDisabled: button?.disabled ?? null, member: document.body.dataset.member || '',
        treeCount: document.body.dataset.treeCount || '' };
    }).catch(() => ({}));
    cleanupFailures.push({ attempt, error, screenshot, ...state });
  };
  try {
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
    await page.waitForSelector('#community-menu', { timeout: opts.timeout }).catch(() => {});
    await sleep(2000);
    if (!(await sessionLoggedIn(page, 8000).catch(() => false))) {
      const href = await page.getAttribute('#account-entry', 'href').catch(() => null);
      await page.goto(new URL(href || '/auth/login?next=%2Fv41%2F', target.href).href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
      await completeGateLogin(page, secret.value, target, opts.timeout);
      await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
      await sleep(2500);
    }
    await page.waitForFunction(() => document.body.dataset.member === 'in', null, { timeout: opts.timeout });
    let removed = 0;
    let lastError = '';
    for (let i = 0; i < 6; i += 1) {
      const count = await page.evaluate(() => Number(document.body.dataset.treeCount || 0)).catch(() => -1);
      if (count === 0) break;
      // 책 정보 버튼은 기록 화면(#book)에서만 보인다. 해시 이동만 하면 화면이 늦게 붙어 실패하므로
      // 전체 이동(goto)으로 새로 열고, 준비될 때까지 기다린다.
      try {
        await page.goto(target.href + '#book', { waitUntil: 'domcontentloaded', timeout: opts.timeout });
        await page.waitForSelector('#manage-tree', { state: 'attached', timeout: opts.timeout }).catch(() => {});
        await sleep(2500);
        let visible = await page.evaluate(() => !document.getElementById('manage-tree')?.hidden).catch(() => false);
        for (let attempt = 0; attempt < 3 && !visible; attempt += 1) {
          await page.evaluate(() => { if (location.hash !== '#book') location.hash = '#book'; }).catch(() => {});
          await sleep(2500);
          visible = await page.evaluate(() => !document.getElementById('manage-tree')?.hidden).catch(() => false);
        }
        if (!visible) throw new Error('책 정보 버튼이 보이지 않음');
        const tipsClose = page.locator('#tree-tips-close');
        if (await tipsClose.isVisible().catch(() => false)) await tipsClose.click({ timeout: 5000 });
        await page.click('#manage-tree', { timeout: 5000 });
        // Share an 8-second deadline for the dialog and actionable delete button.
        const deadline = Date.now() + 8000;
        const remaining = () => Math.max(1, deadline - Date.now());
        await page.locator('#tree-manager[open]').waitFor({ state: 'visible', timeout: remaining() });
        const deleteButton = page.locator('#tree-manager #tree-delete');
        await deleteButton.waitFor({ state: 'visible', timeout: remaining() });
        await deleteButton.click({ trial: true, timeout: remaining() });
        const deletionSaved = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/workspace' && response.request().method() === 'PUT', { timeout: opts.timeout }).catch(() => null);
        const beforeConfirm = confirmCount;
        await deleteButton.click({ timeout: remaining() });
        if (confirmCount === beforeConfirm) throw new Error('삭제 확인창이 뜨지 않음');
        await page.waitForFunction((before) => Number(document.body.dataset.treeCount) < before,
          count, { timeout: opts.timeout });
        const response = await deletionSaved;
        if (!response?.ok()) throw new Error('삭제 저장 응답 실패: ' + (response?.status() ?? 'timeout'));
        removed += 1;
      } catch (error) {
        lastError = error.message.slice(0, 120);
        await captureCleanupFailure(i + 1, lastError);
        break;
      }
    }
    // 마지막 확인은 화면 표시가 아니라 계정 응답(/api/workspace)으로 한다.
    const apiTrees = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/workspace?features=bound-writes', { credentials: 'include', headers: { accept: 'application/json' } });
        if (!response.ok) return { status: response.status, trees: null };
        const data = await response.json();
        const state = data?.state || data;
        return { status: response.status, trees: Array.isArray(state?.trees) ? state.trees.length : null };
      } catch (error) {
        return { status: `error:${error.message.slice(0, 40)}`, trees: null };
      }
    }).catch(() => ({ status: 'error', trees: null }));
    const domCount = await page.evaluate(() => Number(document.body.dataset.treeCount || 0)).catch(() => -1);
    const treeCount = apiTrees.status === 200 ? apiTrees.trees : null;
    record('flow-cleanup', 'auth-flows', treeCount === 0 ? 'pass' : 'fail',
      treeCount === 0
        ? `검사용 트리 정리 완료 (삭제 ${removed}회, 계정 트리 0개 · /api/workspace ${apiTrees.status})`
        : `트리가 ${treeCount}개 남음 (삭제 ${removed}회 · /api/workspace ${apiTrees.status}${lastError ? ` · 마지막 오류: ${lastError}` : ''})`,
      { durationMs: Date.now() - started, removed, treeCount, apiStatus: apiTrees.status, domCount, lastError, cleanupFailures });
    await page.goto(target.href + '#home', { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
    await page.waitForFunction(() => document.body.dataset.member === 'in' && document.body.dataset.treeCount === '0', null, { timeout: opts.timeout });
    await page.screenshot({ path: path.join(opts.out, `${stamp}-flow-cleanup-trees.png`) });
    const assetsStarted = Date.now();
    // 보관 파일도 0개인지 확인한다(검사는 업로드를 하지 않지만 요구사항 확인).
    await page.evaluate(() => document.getElementById('account-assets-open')?.click()).catch(() => {});
    await page.locator('#account-assets[open]').waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForFunction(() => document.getElementById('account-assets')?.textContent.includes('보관한 파일이 없어요.'), null, { timeout: 8000 }).catch(() => {});
    const assets = await page.evaluate(() => {
      const host = document.getElementById('account-assets');
      return { open: !!host?.open, visible: !!host?.getClientRects().length,
        empty: !!host?.textContent.includes('보관한 파일이 없어요.'),
        count: host?.querySelectorAll('.upload-asset').length ?? null };
    }).catch(() => ({}));
    await page.screenshot({ path: path.join(opts.out, `${stamp}-flow-cleanup-assets.png`) });
    record('flow-cleanup-assets', 'auth-flows',
      assets.open && assets.visible && assets.empty && assets.count === 0 ? 'pass' : 'fail',
      `보관 파일 ${assets.empty ? 0 : "미확인"}개 (목록 열림=${assets.open}, 빈 목록 안내=${assets.empty})`, { ...assets, durationMs: Date.now() - assetsStarted });
  } catch (error) {
    record('flow-cleanup', 'auth-flows', 'fail', `정리 중 예외: ${error.message.slice(0, 160)}`);
  } finally {
    await context.close().catch(() => {});
  }
}

async function checkThemeRoundTrip(page, base, opts, stamp) {
  // 2026-11-08 #188: 첫 화면 토글로 정원(B) 전환·저장, 안쪽 화면은 A 고정, 다시 밤(A)으로 복귀.
  const problems = [];
  const state = () => page.evaluate(() => ({
    theme: document.documentElement.dataset.ltTheme || '',
    stored: (() => { try { return localStorage.getItem('lt41.theme') || ''; } catch { return 'n/a'; } })(),
    headerBg: getComputedStyle(document.querySelector('.app-header')).backgroundColor
  })).catch(() => ({ theme: '?', stored: '?', headerBg: '?' }));
  // #213 2번: 테마는 "보기 ▾" 메뉴의 밤/정원 항목이 맡는다(도구 줄 버튼 토글은 없어졌다).
  const homeFrame = () => page.frames().find((x) => x.name() === 'view' || /\/v41\/home/.test(x.url())) || null;
  const menuButton = () => homeFrame()?.locator('[data-lt-view-menu]').first() || null;
  const openMenu = async () => {
    const b = menuButton();
    if (!b || !(await b.count().catch(() => 0))) return false;
    if ((await b.getAttribute('aria-expanded').catch(() => '')) !== 'true') {
      await b.click().catch(() => {});
      await sleep(250);
    }
    return true;
  };
  const themeChecked = async (value) => {
    if (!(await openMenu())) return null;
    const f = homeFrame();
    if (!f) return null;
    const item = f.locator(`#home-view-menu [data-lt-view-item="theme:${value}"]`).first();
    const checked = await item.getAttribute('aria-checked').catch(() => null);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(150);
    return checked;
  };
  const pickTheme = async (value) => {
    if (!(await openMenu())) return false;
    const f = homeFrame();
    if (!f) return false;
    const item = f.locator(`#home-view-menu [data-lt-view-item="theme:${value}"]`).first();
    if (!(await item.count().catch(() => 0))) return false;
    await item.click().catch(() => {});
    await sleep(800);
    return true;
  };
  const u = new URL(base.href); u.search = `?vt=${Date.now()}`; u.hash = '';
  await page.goto(u.href, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
  await sleep(2500);
  const before = await themeChecked('night');
  if (before === null) problems.push('첫 화면 "보기" 메뉴([data-lt-view-menu]) 없음');
  else {
    if (before !== 'true') problems.push(`테마 초기 밤 항목 aria-checked=${before} (기대 true)`);
    if ((await themeChecked('garden')) !== 'false') problems.push('테마 초기 정원 항목이 켜져 있음(기대 밤)');
    if (!(await pickTheme('garden'))) problems.push('정원 항목을 고르지 못함');
    const b = await state();
    if (b.theme !== 'garden' || b.stored !== 'garden') problems.push(`정원 전환 ${JSON.stringify(b)}`);
    await page.screenshot({ path: path.join(opts.out, `${stamp}-visual-theme-garden.png`) }).catch(() => {});
    await page.reload({ waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    await sleep(2000);
    const r = await state();
    if (r.theme !== 'garden') problems.push(`새로고침 후 정원 유지 안 됨 ${JSON.stringify(r)}`);
    if (r.headerBg === 'rgb(4, 4, 7)') problems.push('정원인데 헤더가 A 색');
    const ub = new URL(base.href); ub.search = `?vt=${Date.now()}`; ub.hash = '#book';
    await page.goto(ub.href, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    await sleep(2500);
    const k = await state();
    // 2026-11-08 대표 결정: 기억책도 정원을 따라간다(밤=기본 글꼴, 정원=지금 글꼴). 보드·지도만 A 고정.
    if (k.theme !== 'garden') problems.push(`정원에서 기억책이 정원이 아님 ${JSON.stringify(k)}`);
    const boardUrl = new URL(base.href); boardUrl.search = `?vt=${Date.now()}`; boardUrl.hash = '#board';
    await page.goto(boardUrl.href, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    await sleep(2200);
    const boardState = await state();
    if (boardState.theme !== '') problems.push(`정원에서 기억 보드가 A가 아님 ${JSON.stringify(boardState)}`);
    await page.goto(u.href, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    await sleep(2500);
    if (!(await pickTheme('night'))) problems.push('밤 항목을 고르지 못함');
    const a = await state();
    if (a.theme !== '' || a.stored !== 'night') problems.push(`밤 복귀 ${JSON.stringify(a)}`);
  }
  await page.evaluate(() => { try { localStorage.removeItem('lt41.theme'); } catch {} }).catch(() => {});
  record('visual-theme', 'visual', problems.length ? 'fail' : 'pass',
    problems.length ? problems.join('; ') : '정원 전환·저장·새로고침 유지·기억책 정원·보드 A 고정·밤 복귀', {});
  return problems;
}

async function checkYoutubeEndpoint(page, videoId) {
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/youtube/oembed?v=${encodeURIComponent(id)}`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    });
    let body = null;
    try { body = await res.json(); } catch { /* not json */ }
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      cacheControl: res.headers.get('cache-control') || '',
      nosniff: res.headers.get('x-content-type-options') || '',
      body
    };
  }, videoId).catch((error) => ({ status: 0, error: String(error.message || error) }));

  if (result.status === 401) {
    record('youtube-oembed', 'youtube', 'skip', '로그인 세션이 없어 oEmbed 확인을 건너뜀(401). --login 후 다시 실행');
    return { loggedIn: false, result };
  }
  if (result.status !== 200) {
    record('youtube-oembed', 'youtube', 'fail',
      `/api/youtube/oembed?v=${videoId} 응답 ${result.status}${result.error ? ` (${result.error})` : ''}`);
    return { loggedIn: false, result };
  }
  const body = result.body || {};
  const hasBits = typeof body.title === 'string' && body.title.trim() && typeof body.authorName === 'string' && body.authorName.trim();
  const extraKeys = Object.keys(body).filter((k) => !OEMBED_KEYS.has(k));
  const cacheOk = /max-age=86400/.test(result.cacheControl);
  const privateOk = /private/.test(result.cacheControl);
  const noseOk = result.nosniff === 'nosniff';
  const thumbOk = !body.thumbnailUrl || /^https:\/\/(?:i\.)?ytimg\.com\//.test(String(body.thumbnailUrl));
  const ok = hasBits && thumbOk && extraKeys.length === 0;
  const notes = [
    `title="${body.title || ''}"`,
    `author="${body.authorName || ''}"`,
    `cache="${result.cacheControl}"`,
    cacheOk && privateOk ? '' : 'cache-control이 private,max-age=86400가 아님',
    noseOk ? '' : 'x-content-type-options: nosniff 없음',
    extraKeys.length ? `예상 밖 필드: ${extraKeys.join(',')}` : ''
  ].filter(Boolean);
  record('youtube-oembed', 'youtube', ok ? 'pass' : 'fail', notes.join(' / '), { status: result.status, body, cacheControl: result.cacheControl });
  return { loggedIn: true, result };
}

async function checkYoutubeCaption(page, videoId) {
  const frame = await viewFrame(page);
  let foundMemory = false;
  if (frame) {
    foundMemory = await frame.evaluate(() =>
      !!document.querySelector('.lt-media[data-lt-url*="youtube.com"], .lt-media[data-lt-url*="youtu.be"]')
    ).catch(() => false);
  }
  if (foundMemory && frame) {
    const result = await frame.evaluate(async () => {
      const root = document.querySelector('.lt-media[data-lt-url*="youtube.com"], .lt-media[data-lt-url*="youtu.be"]');
      if (!root) return { ok: false, reason: 'no-memory' };
      const existing = root.querySelector('.lt-media-body .lt-media-title');
      if (existing && existing.textContent.trim()) return { ok: true, caption: existing.textContent.trim() };
      const btn = root.querySelector('[data-lt-load]');
      if (!btn) return { ok: false, reason: 'no-load-button' };
      btn.click();
      const deadline = Date.now() + 9000;
      while (Date.now() < deadline) {
        const caption = root.querySelector('.lt-media-body .lt-media-title');
        if (caption && caption.textContent.trim()) return { ok: true, caption: caption.textContent.trim() };
        await new Promise((r) => setTimeout(r, 150));
      }
      return { ok: false, reason: 'caption-timeout' };
    }).catch((error) => ({ ok: false, reason: String(error.message || error) }));
    if (result.ok) {
      const parts = result.caption.split('·').map((s) => s.trim()).filter(Boolean);
      const both = parts.length >= 2;
      record('youtube-caption-memory', 'youtube', both ? 'pass' : 'fail',
        both ? `기억 매체 캡션(제목·채널): "${result.caption}"` : `캡션에 제목만 있고 채널이 없음: "${result.caption}"`,
        result);
      return both;
    }
    record('youtube-caption-memory', 'youtube', 'fail', `YouTube 기억 매체에서 캡션을 못 봄(${result.reason})`, result);
    return false;
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const result = await page.evaluate(async (ytUrl) => {
    const form = document.querySelector('#moment-form');
    if (!form || !form.elements.url) return { ok: false, reason: 'no-editor' };
    const input = form.elements.url;
    const previous = input.value;
    input.value = ytUrl;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const host = document.querySelector('#url-media-preview');
    const media = host?.querySelector('.lt-media[data-lt-url]');
    if (!media) { input.value = previous; input.dispatchEvent(new Event('input', { bubbles: true })); return { ok: false, reason: 'no-preview' }; }
    const btn = media.querySelector('[data-lt-load]');
    if (!btn) { input.value = previous; input.dispatchEvent(new Event('input', { bubbles: true })); return { ok: false, reason: 'no-load-button' }; }
    btn.click();
    const deadline = Date.now() + 9000;
    let caption = null;
    while (Date.now() < deadline) {
      const node = media.querySelector('.lt-media-body .lt-media-title');
      if (node && node.textContent.trim()) { caption = node.textContent.trim(); break; }
      await new Promise((r) => setTimeout(r, 150));
    }
    input.value = previous;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return caption ? { ok: true, caption } : { ok: false, reason: 'caption-timeout' };
  }, url).catch((error) => ({ ok: false, reason: String(error.message || error) }));

  if (result.ok) {
    const parts = result.caption.split('·').map((s) => s.trim()).filter(Boolean);
    const both = parts.length >= 2;
    record('youtube-caption-editor', 'youtube', both ? 'pass' : 'fail',
      both ? `작성 미리보기 캡션(제목·채널): "${result.caption}"` : `작성 미리보기 캡션에 채널이 없음: "${result.caption}"`,
      result);
    return both;
  }
  if (result.reason === 'no-editor') {
    record('youtube-caption-editor', 'youtube', 'skip', 'YouTube 기억이 없고 작성 미리보기에도 접근 못 해 캡션 확인 건너뜀');
    return null;
  }
  record('youtube-caption-editor', 'youtube', 'warn', `작성 미리보기 캡션 미확인(${result.reason}) — 썸네일 네트워크 의존`, result);
  return false;
}

async function resolveShareTitle(page, shareId) {
  return page.evaluate(async (id) => {
    const res = await fetch('/api/community/shares', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
    if (!res.ok) return { status: res.status };
    const data = await res.json();
    const items = data.shares || data.items || data.results || [];
    const found = items.find((item) => String(item.shareId || item.id) === String(id));
    return { status: 200, title: found ? String(found.title || '') : null, count: items.length };
  }, shareId).catch((error) => ({ status: 0, error: String(error.message || error) }));
}

async function writeChecks(page, opts) {
  if (!opts.share) {
    record('write-guard', 'write', 'fail', '--write 를 쓰려면 --share <id> 가 필요함');
    return;
  }
  const resolved = await resolveShareTitle(page, opts.share);
  if (resolved.status !== 200 || !resolved.title) {
    record('write-guard', 'write', 'skip', `공유 ${opts.share} 를 발견 목록에서 찾지 못해(상태 ${resolved.status}) 쓰기 검사를 건너뜀`, resolved);
    return;
  }
  const title = resolved.title;
  const cleanup = { reactionToggled: null, commentId: null };

  try {
    const toggle = await page.evaluate(({ title, kind }) => {
      const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
      const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
      if (!card) return { ok: false, reason: 'card-not-found' };
      const btn = card.querySelector(`button.community-reaction[data-reaction-kind="${kind}"]`);
      if (!btn) return { ok: false, reason: 'button-not-found' };
      const before = btn.getAttribute('aria-pressed') === 'true';
      btn.click();
      return { ok: true, before };
    }, { title, kind: 'heart' });
    if (!toggle.ok) {
      record('write-reaction', 'write', 'warn', `반응 버튼 클릭 실패(${toggle.reason})`);
    } else {
      cleanup.reactionToggled = !toggle.before;
      await sleep(900);
      const after = await page.evaluate(({ title, kind }) => {
        const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
        const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
        const btn = card?.querySelector(`button.community-reaction[data-reaction-kind="${kind}"]`);
        return btn ? { pressed: btn.getAttribute('aria-pressed') === 'true', label: btn.textContent.trim() } : null;
      }, { title, kind: 'heart' });
      const expected = !toggle.before;
      const ok = after && after.pressed === expected;
      record('write-reaction', 'write', ok ? 'pass' : 'fail',
        ok ? `공감 반응 토글 확인(버튼 텍스트 "${after.label}")` : `반응 상태가 기대(${expected})와 다름: ${JSON.stringify(after)}`);
      const restore = await page.evaluate(({ title, kind, before }) => {
        const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
        const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
        const btn = card?.querySelector(`button.community-reaction[data-reaction-kind="${kind}"]`);
        if (!btn) return { ok: false };
        if ((btn.getAttribute('aria-pressed') === 'true') !== before) btn.click();
        return { ok: true };
      }, { title, kind: 'heart', before: toggle.before });
      if (restore.ok) cleanup.reactionToggled = null;
      await sleep(700);
    }

    const openOk = await page.evaluate((title) => {
      const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
      const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
      const details = card?.querySelector('details.community-details');
      if (!details) return false;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
      return true;
    }, title);
    if (!openOk) {
      record('write-comment', 'write', 'warn', '댓글 영역(details)을 열지 못함');
      return;
    }
    await page.waitForFunction(() => !!document.querySelector('#community-panel .community-comment-form textarea'), { timeout: opts.timeout })
      .catch(() => {});
    const body = `배포 확인 댓글 ${Date.now()}`;
    const created = await page.evaluate(({ title, body }) => {
      const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
      const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
      const form = card?.querySelector('.community-comment-form');
      const input = form?.querySelector('textarea');
      if (!form || !input) return { ok: false, reason: 'no-form' };
      input.value = body;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return { ok: true };
    }, { title, body });
    if (!created.ok) {
      record('write-comment', 'write', 'warn', `댓글 작성 폼 없음(${created.reason})`);
      return;
    }
    const appeared = await page.waitForFunction(
      ({ title, body }) => {
        const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
        const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
        return !!card && [...card.querySelectorAll('article.community-comment p')].some((p) => p.textContent.trim() === body);
      },
      { title, body },
      { timeout: opts.timeout }
    ).then(() => true).catch(() => false);
    if (!appeared) {
      record('write-comment', 'write', 'fail', '작성한 댓글이 목록에 나타나지 않음');
      return;
    }
    record('write-comment', 'write', 'pass', '댓글 작성 확인(수정·삭제 단계 진행)');

    const edited = await page.evaluate(({ title, body }) => {
      const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
      const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
      const row = [...card.querySelectorAll('article.community-comment')].find((r) => r.querySelector('p')?.textContent.trim() === body);
      const edit = row?.querySelector('.community-comment-tools button.community-link');
      if (!edit) return { ok: false, reason: 'no-edit-button' };
      edit.click();
      const form = row.querySelector('form.community-comment-edit');
      const input = form?.querySelector('textarea');
      if (!form || !input) return { ok: false, reason: 'no-edit-form' };
      input.value = body + ' (수정)';
      form.requestSubmit();
      return { ok: true };
    }, { title, body });
    if (!edited.ok) {
      record('write-comment-edit', 'write', 'warn', `본인 댓글 수정 버튼/폼 없음(${edited.reason})`);
    } else {
      const editedShown = await page.waitForFunction(
        ({ title, body }) => {
          const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
          const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
          return !!card && [...card.querySelectorAll('article.community-comment')].some((r) => {
            const text = r.querySelector('p')?.textContent.trim() || '';
            const head = r.querySelector('small')?.textContent || '';
            return text === `${body} (수정)` && /수정됨/.test(head);
          });
        },
        { title, body },
        { timeout: opts.timeout }
      ).then(() => true).catch(() => false);
      record('write-comment-edit', 'write', editedShown ? 'pass' : 'fail',
        editedShown ? '댓글 수정 + "수정됨" 표시 확인' : '수정 결과 또는 "수정됨" 표시를 확인하지 못함');
    }

    const removed = await page.evaluate(({ title, body }) => {
      const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
      const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
      const rows = [...card.querySelectorAll('article.community-comment')];
      const row = rows.find((r) => /^\+?.*\(수정\)$/.test((r.querySelector('p')?.textContent || '').trim()) && (r.querySelector('p')?.textContent || '').includes(body))
        || rows.find((r) => (r.querySelector('p')?.textContent || '').includes(body));
      const buttons = [...(row?.querySelectorAll('.community-comment-tools button.community-link') || [])];
      const remove = buttons.find((b) => /삭제/.test(b.textContent));
      if (!remove) return { ok: false, reason: 'no-delete-button' };
      remove.click();
      return { ok: true };
    }, { title, body });
    if (!removed.ok) {
      record('write-comment-cleanup', 'write', 'warn', `삭제 버튼 없음(${removed.reason}) — 시험 댓글이 남았을 수 있음`);
    } else {
      const gone = await page.waitForFunction(
        ({ title, body }) => {
          const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
          const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
          return !!card && ![...card.querySelectorAll('article.community-comment p')].some((p) => p.textContent.includes(body));
        },
        { title, body },
        { timeout: opts.timeout }
      ).then(() => true).catch(() => false);
      record('write-comment-cleanup', 'write', gone ? 'pass' : 'warn',
        gone ? '시험 댓글 삭제 확인' : '시험 댓글이 아직 보임 — 수동 정리 필요');
    }
  } finally {
    if (cleanup.reactionToggled !== null) {
      await page.evaluate(({ title, kind, target }) => {
        const cards = [...document.querySelectorAll('#community-panel #community-list article.community-card')];
        const card = cards.find((c) => (c.querySelector('h3')?.textContent.trim() || '') === title);
        const btn = card?.querySelector(`button.community-reaction[data-reaction-kind="${kind}"]`);
        if (btn && (btn.getAttribute('aria-pressed') === 'true') !== target) btn.click();
      }, { title, kind: 'heart', target: cleanup.reactionToggled }).catch(() => {});
      await sleep(500);
    }
  }
}

function buildSummary() {
  const summary = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const check of checks) summary[check.status] = (summary[check.status] || 0) + 1;
  return summary;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (!opts.target) {
    console.error('대상 주소가 필요합니다.\n');
    console.log(USAGE);
    return 1;
  }
  let target;
  try {
    target = new URL(opts.target);
  } catch {
    console.error(`주소 형식이 올바르지 않습니다: ${opts.target}`);
    return 1;
  }

  await mkdir(opts.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  console.log(`lovetree-postdeploy ${TOOL_VERSION}`);
  console.log(`대상: ${target.href}`);
  console.log(`프로필: ${opts.profile}`);
  console.log(`모드: ${opts.autoLogin ? 'auto-login' : opts.login ? 'login' : opts.write ? 'read+write' : 'read-only'} / headless=${opts.headless}`);
  console.log('');

  if (opts.login && opts.autoLogin) {
    console.error('--login 과 --auto-login 은 함께 쓸 수 없습니다.');
    return 1;
  }

  let context = null;
  let close = async () => {};
  try {
    ({ context, close } = await launch(opts));
  } catch (error) {
    console.error(`브라우저를 시작하지 못했습니다: ${error.message}`);
    console.error('Chrome 설치 여부 또는 `npm install`(playwright-core) 여부를 확인하세요.');
    return 1;
  }

  try {
    const page = context.pages()[0] || (await context.newPage());
    wireConsole(page);
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});

    const pageInfo = await checkPageLoad(page, target, opts);

    let probe = {};
    let oembed = { loggedIn: false };

    if (pageInfo.reachable === false) {
      record('checks-skipped', 'page', 'skip', '페이지 접속 실패로 나머지 검사를 건너뜀');
    } else {
      if (opts.authFlows) {
        // --auth-flows: 로그인 흐름만 검사한다(각 경로는 빈 프로필 context에서 시작, 끝나면 검사용 트리 삭제).
        let flows = { createdTrees: 0 };
        try {
          flows = await runAuthFlows(target, opts, stamp);
        } finally {
          await cleanupAuthFlows(target, opts, stamp);
        }
        console.log(`\n로그인 흐름 검사 완료 (검사용 트리 생성=${flows.createdTrees})`);
      } else if (opts.autoLogin) {
        console.log('\n시험 계정으로 자동 로그인 시도 중...');
        const logged = await autoLogin(page, opts, target);
        if (!logged) {
          record('auto-login', 'auth', 'warn', '시험 계정 자동 로그인이 실패해 비로그인 상태로 나머지 검사를 진행');
          await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: opts.timeout }).catch(() => {});
          await page.waitForSelector('#community-menu', { timeout: opts.timeout }).catch(() => {});
        }
        consoleErrors.length = 0;
        consoleWarnings.length = 0;
        pageErrors.length = 0;
      } else if (opts.login) {
        console.log('\n로그인 창에서 직접 로그인한 뒤, 준비되면 터미널에서 Enter 를 누르세요.');
        await new Promise((resolve) => {
          process.stdin.resume();
          process.stdin.once('data', () => resolve());
        });
        record('login', 'auth', 'pass', '수동 로그인 완료, 이 프로필을 다음 실행에서 재사용');
      }

      if (!opts.authFlows) {
      probe = await probeLogin(page, opts.timeout);
      const probeOk = Object.values(probe).some((v) => v && (v.status === 200 || v.status === 204));
      record('session-probe', 'auth', probeOk ? 'pass' : 'warn',
        probeOk ? '로그인 세션 응답 확인' : '계정 확인 경로에서 200을 못 봄(비로그인일 수 있음)', probe);

      await checkCommunity(page, opts);
      await checkResponsive(page, 1440, 900, opts.out, stamp);
      await page.screenshot({ path: path.join(opts.out, `${stamp}-community-1440.png`) }).catch(() => {});
      await checkResponsive(page, 390, 844, opts.out, stamp);
      await page.screenshot({ path: path.join(opts.out, `${stamp}-community-390.png`) }).catch(() => {});
      await checkResponsive(page, 360, 800, opts.out, stamp);
      await page.screenshot({ path: path.join(opts.out, `${stamp}-community-360.png`) }).catch(() => {});
      await checkVisualTokens(page, target, opts, stamp);
      await checkHomeCardMenuMouse(page, target, opts, stamp);
      await checkSignedInActions(page, target, opts, stamp);

      await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
      oembed = await checkYoutubeEndpoint(page, opts.youtube);
      if (oembed.loggedIn) await checkYoutubeCaption(page, opts.youtube);
      else record('youtube-caption', 'youtube', 'skip', '비로그인 상태라 YouTube 캡션 확인을 건너뜀');

      if (opts.write) await writeChecks(page, opts);
      else record('write', 'write', 'skip', '쓰기 검사는 기본 꺼짐(--write --share <id> 로 실행)');
      }
    }

    const fatalConsole = consoleErrors.filter((text) => !isIgnorableConsoleError(text));
    const consoleOk = fatalConsole.length === 0 && pageErrors.length === 0;
    record('console-errors', 'console', consoleOk ? 'pass' : 'fail',
      consoleOk ? `콘솔 오류 0 (무시 ${consoleErrors.length - fatalConsole.length}건)` : `콘솔 ${fatalConsole.length}건 / 페이지 오류 ${pageErrors.length}건`,
      { consoleErrors: fatalConsole.slice(0, 20), pageErrors: pageErrors.slice(0, 20), consoleWarnings: consoleWarnings.slice(0, 20) });

    if (opts.strict) {
      for (const check of checks) {
        if (check.status === 'warn') check.status = 'fail';
      }
    }

    const summary = buildSummary();
    const finishedAt = new Date().toISOString();
    const report = {
      meta: {
        tool: 'lovetree-postdeploy',
        version: TOOL_VERSION,
        target: target.href,
        mode: opts.autoLogin ? 'auto-login' : opts.login ? 'login' : opts.write ? 'read+write' : 'read-only',
        headless: opts.headless,
        viewports: ['1440x900', '390x844'],
        startedAt,
        finishedAt,
        durationMs: Date.now() - startMs
      },
      login: { probe, loggedIn: oembed.loggedIn },
      checks,
      console: { errors: consoleErrors, pageErrors, warnings: consoleWarnings },
      summary
    };
    const reportPath = path.join(opts.out, `report-${stamp}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log('\n요약');
    console.table(checks.map((c) => ({ check: `${c.area}/${c.id}`, status: c.status, detail: c.detail })));
    console.log(`\n${summarize(summary)}`);
    console.log(`리포트: ${reportPath}`);
    console.log(`스크린샷: ${opts.out}\\${stamp}-*.png`);

    return summary.fail > 0 ? 2 : 0;
  } finally {
    await close().catch(() => {});
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`오류: ${error && error.stack ? error.stack : error}`);
    process.exit(1);
  });
