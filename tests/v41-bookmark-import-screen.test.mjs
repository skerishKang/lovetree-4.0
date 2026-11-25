import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// #822 1단계 북마크에서 가져오기: 실제 화면에서 수치로 잰다(눈 확인에 기대지 않는다).
// 1440·390 × 밤·정원에서 입구 → 파일 고르기 → 미리보기 목록 → 담는 중 → 마침, 그리고 트리 없는 계정의 빈 화면 한 줄.
// 재는 것: 가로 넘침 0, 글자 12px·단추 13px 이상, 누르는 곳 44px 이상, 겹침 0, 글자 대비 4.5:1 이상,
// 화면 글자에 undefined·null·NaN 없음, 저장 뒤 트리 순간 수, 서버로 가는 요청(북마크 내용이 실리지 않음).
// 시험 자료는 가짜 북마크 파일뿐이다(tests/fixtures/bookmarks). LT_BOOKMARK_IMPORT_REQUIRE=1 일 때 실행한다.
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_BOOKMARK_IMPORT_REQUIRE === '1';
const SHOT = process.env.LT_BOOKMARK_IMPORT_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

const FIXTURE = fileURLToPath(new URL('./fixtures/bookmarks/chrome.html', import.meta.url));
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#4a4458"/><circle cx="160" cy="90" r="34" fill="#8a7fb8"/></svg>';
const SIZES = [[1440, 900], [390, 844]];
const THEMES = ['night', 'garden'];

// 영상 n개짜리 가짜 북마크 파일(크롬 형식) — 폴더 다섯 개에 나눠 담는다.
function bookmarkFile(count) {
  const folders = ['직캠 모음', '음악 방송', '콘서트', '연습 영상', '인터뷰'];
  const per = Math.ceil(count / folders.length);
  let n = 0, body = '';
  for (const folder of folders) {
    body += `<DT><H3 ADD_DATE="1700000000">${folder}</H3>\n<DL><p>\n`;
    for (let i = 0; i < per && n < count; i += 1, n += 1) body += `<DT><A HREF="https://www.youtube.com/watch?v=FAKE${String(n).padStart(7, '0')}" ADD_DATE="${1690000000 + n * 97000}">가짜 무대 직캠 ${n + 1} - YouTube</A>\n`;
    body += '</DL><p>\n';
  }
  return Buffer.from(`<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${body}<DT><A HREF="https://example.test/private">가짜 개인 북마크</A>\n</DL><p>\n`, 'utf8');
}

// 이미 담아 둔 트리: 크롬 가짜 북마크의 쇼츠(FAKEvid0003)가 들어 있다 → 미리보기에서 '이미 있음'이 된다.
// 제목을 직접 적어 둔 순간이라 셸의 영상 제목 채우기(자동 제목만 고친다)가 돌지 않는다 — 시작부터 저장할 것이 없는 상태다.
function fixtureTrees() {
  let tree = createTree({ subject: '시험 트리', title: '이미 담은 쇼츠', note: '', date: '2026-11-18', url: 'https://www.youtube.com/watch?v=FAKEvid0003' }, '2026-11-18T00:00:00Z');
  tree = addMoment(tree, { title: '둘째 순간', note: '', date: '2026-11-19', url: '' }, tree.moments[0].id, '2026-11-19T00:00:01Z');
  return [tree];
}

async function openContext(browser, { width, height, theme, trees, titleDelayMs = 0 }) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width < 600, isMobile: width < 600 });
  const seen = { requests: [], puts: [] };
  await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); localStorage.setItem('lt41.publicNoticeShown', '1'); } catch {} }, theme);
  await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: IMG }));
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await ctx.route('**/api/youtube/oembed**', async (r) => {
    const id = new URL(r.request().url()).searchParams.get('v');
    if (titleDelayMs) await new Promise((ok) => setTimeout(ok, titleDelayMs));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videoId: id, title: `가짜 영상 제목 ${id.slice(-4)}`, authorName: '가짜 채널', thumbnailUrl: '' }) });
  });
  let revision = 1;
  await ctx.route('**/api/workspace**', (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees, prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) });
    seen.puts.push(JSON.parse(r.request().postData() || '{}'));
    revision += 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision, savedAt: '2026-11-24T00:00:00.000Z' }) });
  });
  const page = await ctx.newPage();
  page.on('request', (request) => { seen.requests.push({ url: request.url(), method: request.method(), body: request.postData() || '' }); });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  return { ctx, page, seen, errors };
}

// 창(또는 한 구역) 안을 수치로 잰다. 돌려주는 값은 어긋난 것들의 목록이다(비어 있어야 통과).
const MEASURE = (rootSelector) => {
  const root = document.querySelector(rootSelector);
  if (!root) return { problems: [`${rootSelector} 없음`], count: 0 };
  const problems = [];
  const visible = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (n.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const parse = (value) => {
    const text = String(value || '');
    let m = text.match(/^rgba?\(([^)]+)\)$/);
    if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]]; }
    m = text.match(/^color\(srgb\s+([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] === undefined ? 1 : p[3]]; }
    return [0, 0, 0, 0];
  };
  const over = (top, base) => { const a = top[3]; return [top[0] * a + base[0] * (1 - a), top[1] * a + base[1] * (1 - a), top[2] * a + base[2] * (1 - a), 1]; };
  const stage = (() => { const c = parse(getComputedStyle(document.documentElement).backgroundColor); return c[3] ? over(c, [0, 0, 0, 1]) : [4, 4, 7, 1]; })();
  // 요소 뒤의 바탕: 문서 바탕부터 조상들의 배경을 차례로 덧칠해 구한다(반투명 배경을 합성).
  const backdropOf = (el) => {
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.unshift(n);
    let color = stage;
    for (const n of chain) { const bg = parse(getComputedStyle(n).backgroundColor); if (bg[3] > 0) color = over(bg, color); }
    return color;
  };
  const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`;
  // ① 가로 넘침.
  for (const el of [root, ...root.querySelectorAll('.bmi-scroll,.bmi-foot,.bmi-items,.bmi-toolbar')]) {
    if (visible(el) && el.scrollWidth > el.clientWidth + 1) problems.push(`가로 넘침 ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
  }
  const box = root.getBoundingClientRect();
  if (box.left < -1 || box.right > innerWidth + 1) problems.push(`화면 밖 ${Math.round(box.left)}~${Math.round(box.right)} / ${innerWidth}`);
  // ② 글자 크기·대비·금지 글자.
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
    const el = node.parentElement;
    if (!text || !el || !visible(el) || el.closest('option')) continue;
    count += 1;
    if (/\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/.test(text)) problems.push(`금지 글자 "${text.slice(0, 30)}"`);
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const control = el.closest('button,select,input');
    if (size < (control ? 13 : 12)) problems.push(`글자 ${size}px ${name(el)} "${text.slice(0, 20)}"`);
    if (control?.disabled) continue;
    const fg = parse(cs.color);
    const bg = backdropOf(el);
    const ratio = contrast(over(fg, bg), bg);
    if (ratio < 4.5) problems.push(`대비 ${ratio.toFixed(2)} ${name(el)} "${text.slice(0, 20)}"`);
  }
  // ③ 누르는 곳 크기: 단추·고르기 칸·입력은 44px 이상(줄 전체가 누르는 곳인 항목은 그 줄 높이로 본다).
  const targets = [...root.querySelectorAll('button,select,input:not([type=file]),summary')].filter(visible);
  for (const el of targets) {
    const hit = el.type === 'checkbox' ? el.closest('label') || el : el;
    const r = hit.getBoundingClientRect();
    if (r.height < 43.5) problems.push(`누르는 곳 ${Math.round(r.height)}px ${name(el)}`);
  }
  // ④ 겹침: 누르는 곳끼리(부모-자식 아님) 겹치지 않는다. 스크롤 밖으로 잘린 것은 보이는 만큼만 본다.
  const scroll = root.querySelector('.bmi-scroll');
  const clip = (el) => {
    const r = el.getBoundingClientRect();
    const b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    if (scroll && scroll.contains(el)) { const s = scroll.getBoundingClientRect(); b.t = Math.max(b.t, s.top); b.b = Math.min(b.b, s.bottom); }
    return b;
  };
  const hits = targets.map((el) => (el.type === 'checkbox' ? el.closest('label') || el : el)).filter((el, i, list) => list.indexOf(el) === i);
  for (let i = 0; i < hits.length; i += 1) for (let j = i + 1; j < hits.length; j += 1) {
    const a = hits[i], b = hits[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = clip(a), rb = clip(b);
    const w = Math.min(ra.r, rb.r) - Math.max(ra.l, rb.l), h = Math.min(ra.b, rb.b) - Math.max(ra.t, rb.t);
    if (w > 1 && h > 1) problems.push(`겹침 ${name(a)} × ${name(b)} ${Math.round(w)}×${Math.round(h)}`);
  }
  return { problems, count };
};

async function measure(page, selector, label) {
  const result = await page.evaluate(MEASURE, selector);
  assert.deepEqual(result.problems, [], `${label}: 수치 검사`);
  assert.ok(result.count > 0, `${label}: 잰 글자가 있다`);
}

async function openWritePanel(page) {
  if (await page.locator('#write-menu').isVisible()) await page.click('#write-menu'); else await page.click('#mobile-add');
  await page.waitForFunction(() => document.getElementById('write-panel')?.open === true, null, { timeout: 10000 });
}
const viewShown = (name) => `(() => { const el = document.querySelector('#bookmark-import-panel .bmi-${name}'); return !!el && !el.hidden; })()`;

test('#822 북마크에서 가져오기 화면: 입구 → 미리보기 → 담는 중 → 마침을 1440·390 × 밤·정원에서 수치로 잰다', { skip: skip || !REQUIRE ? skip || 'LT_BOOKMARK_IMPORT_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of SIZES) for (const theme of THEMES) {
      const label = `${width}/${theme}`;
      const { ctx, page, seen, errors } = await openContext(browser, { width, height, theme, trees: fixtureTrees(), titleDelayMs: 150 });
      const shot = async (name) => { if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, `822-${name}-${width}-${theme}.png`) }); } };
      await page.goto(`${origin}/v41/?account=1#shelf`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      // ① 입구: 쉬운 추가 탭 아래 한 줄.
      await openWritePanel(page);
      const entry = await page.evaluate(() => {
        const button = document.getElementById('bookmark-import-open');
        const line = button?.closest('p');
        const submit = document.getElementById('quick-submit').getBoundingClientRect();
        const r = button.getBoundingClientRect();
        return { text: line?.textContent, top: r.top, bottom: r.bottom, height: r.height, submitBottom: submit.bottom, inView: r.bottom <= innerHeight, panelOverflow: document.getElementById('write-panel').scrollWidth - document.getElementById('write-panel').clientWidth };
      });
      assert.equal(entry.text, '이미 모아 둔 영상이 있나요? 북마크에서 가져오기', `${label}: 입구 문구`);
      assert.ok(entry.height >= 44, `${label}: 입구 단추 높이 ${entry.height}`);
      assert.ok(entry.top >= entry.submitBottom, `${label}: 입구는 담기 단추 아래(겹치지 않음)`);
      assert.ok(entry.inView, `${label}: 입구가 스크롤 없이 보인다`);
      assert.ok(entry.panelOverflow <= 0, `${label}: 순간 추가 창 가로 넘침 ${entry.panelOverflow}`);
      await measure(page, '#write-easy .bookmark-entry', `${label} 입구`);
      await shot('1-entry');
      // ② 처음: 창은 한 장 — 가져오기 창이 뜨면 순간 추가 창은 닫힌다.
      await page.click('#bookmark-import-open');
      await page.waitForFunction(() => document.getElementById('bookmark-import-panel')?.open === true, null, { timeout: 10000 });
      assert.equal(await page.evaluate(() => document.getElementById('write-panel').open), false, `${label}: 순간 추가 창은 닫힌다`);
      await page.waitForTimeout(150);
      await measure(page, '#bookmark-import-panel', `${label} 처음`);
      // 북마크 파일이 아닌 것을 고르면 까닭을 알린다.
      await page.setInputFiles('#bookmark-import-panel input[type=file]', { name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<!doctype html><a href="https://www.youtube.com/watch?v=FAKEvid0001">x</a>') });
      await page.waitForFunction(() => !!document.getElementById('bookmark-import-error')?.textContent, null, { timeout: 5000 });
      await measure(page, '#bookmark-import-panel', `${label} 처음(안내)`);
      // ③ 미리보기 목록.
      await page.setInputFiles('#bookmark-import-panel input[type=file]', FIXTURE);
      await page.waitForFunction(viewShown('preview'), null, { timeout: 10000 });
      await page.waitForFunction(() => [...document.querySelectorAll('#bookmark-import-panel .bmi-title')].filter((el) => el.textContent.startsWith('가짜 영상 제목')).length === 3, null, { timeout: 10000 });
      const preview = await page.evaluate(() => {
        const q = (sel) => [...document.querySelectorAll(`#bookmark-import-panel ${sel}`)];
        const thumbs = q('.bmi-thumb').map((el) => { const r = el.getBoundingClientRect(); return r.width / r.height; });
        const foot = document.querySelector('#bookmark-import-panel .bmi-foot').getBoundingClientRect();
        const scroll = document.querySelector('#bookmark-import-panel .bmi-scroll').getBoundingClientRect();
        const dialog = document.getElementById('bookmark-import-panel').getBoundingClientRect();
        return {
          summary: document.querySelector('#bookmark-import-panel .bmi-summary').textContent,
          folders: q('.bmi-group-head .bmi-folder-name').map((el) => el.textContent),
          rows: q('.bmi-item').map((el) => [el.querySelector('input').checked, el.querySelector('.bmi-title').textContent, el.querySelector('.bmi-badge')?.textContent || '']),
          thumbs, count: document.querySelector('#bookmark-import-panel .bmi-count').textContent, save: document.querySelector('#bookmark-import-panel .bmi-save').textContent,
          footBelowScroll: foot.top >= scroll.bottom - 1, footInDialog: foot.bottom <= dialog.bottom + 1, dialogInView: dialog.top >= -1 && dialog.bottom <= innerHeight + 1,
          tree: document.getElementById('bookmark-import-tree').selectedOptions[0]?.textContent,
        };
      });
      assert.equal(preview.summary, '유튜브 영상 4개를 찾았어요. 재생목록 1개·채널 1개는 이번에는 담지 않아요. 같은 영상 1개는 하나로 모았어요.', `${label}: 찾은 것 요약`);
      assert.deepEqual(preview.folders, ['북마크바', '북마크바 › 직캠 모음', '폴더 없음'], `${label}: 폴더 이름`);
      assert.deepEqual(preview.rows, [[true, '가짜 영상 제목 0001', ''], [true, '가짜 영상 제목 0002', ''], [false, '연습실 쇼츠', '이미 있음 · 시험 트리'], [true, '가짜 영상 제목 0004', '']], `${label}: 목록(이미 담은 영상은 빠져 있다)`);
      assert.ok(preview.thumbs.every((ratio) => Math.abs(ratio - 16 / 9) < 0.05), `${label}: 썸네일 16:9 — ${preview.thumbs}`);
      assert.deepEqual([preview.count, preview.save, preview.tree], ['3개 고름', '3개 담기', '시험 트리'], `${label}: 고른 수·담기 단추·담을 트리`);
      assert.ok(preview.footBelowScroll && preview.footInDialog && preview.dialogInView, `${label}: 아래 고정 줄이 목록 아래·창 안·화면 안에 있다`);
      await measure(page, '#bookmark-import-panel', `${label} 미리보기`);
      await shot('2-preview');
      // 새 트리 만들기를 고르면 이름 칸이 나온다(다시 원래 트리로 돌려 담는다).
      await page.selectOption('#bookmark-import-tree', '__new__');
      await page.click('#bookmark-import-panel .bmi-save');
      assert.equal(await page.locator('#bookmark-import-panel .bmi-foot-error').textContent(), '새 트리 이름을 적어 주세요.', `${label}: 이름 없이 담기`);
      await measure(page, '#bookmark-import-panel', `${label} 미리보기(새 트리)`);
      await page.selectOption('#bookmark-import-tree', { index: 0 });
      // ④ 담는 중: 이미 담은 쇼츠도 손으로 골라 제목 조회가 저장 때 한 번 더 돌게 한다.
      await page.locator('#bookmark-import-panel .bmi-item.is-existing').click();
      await page.click('#bookmark-import-panel .bmi-save');
      await page.waitForFunction(viewShown('saving'), null, { timeout: 5000 });
      const saving = await page.evaluate(() => {
        const bar = document.querySelector('#bookmark-import-panel .bmi-progress');
        const fill = bar.firstElementChild.getBoundingClientRect(), all = bar.getBoundingClientRect();
        return { role: bar.getAttribute('role'), max: bar.getAttribute('aria-valuemax'), now: Number(bar.getAttribute('aria-valuenow')), fill: fill.width <= all.width + 1, count: document.querySelector('#bookmark-import-panel .bmi-progress-count').textContent, closeDisabled: document.querySelector('#bookmark-import-panel .close').disabled };
      });
      assert.deepEqual([saving.role, saving.max, saving.closeDisabled, saving.fill], ['progressbar', '4', true, true], `${label}: 진행 표시`);
      assert.match(saving.count, /^[0-4] \/ 4$/, `${label}: N / 전체`);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.getElementById('bookmark-import-panel').open), true, `${label}: 담는 중에는 Esc로 닫히지 않는다`);
      await measure(page, '#bookmark-import-panel', `${label} 담는 중`);
      await shot('3-saving');
      // ⑤ 마침.
      await page.waitForFunction(viewShown('done'), null, { timeout: 30000 });
      await page.waitForTimeout(300);
      // 저장 뒤 뜨는 둘러보기 소개 질문은 이 창 위에 겹쳐 뜬다 — 답해도 결과 화면은 남아 있다.
      if (await page.evaluate(() => document.getElementById('discover-ask')?.open === true)) await page.click('#discover-ask-no');
      const done = await page.evaluate(() => ({
        open: document.getElementById('bookmark-import-panel').open,
        title: document.querySelector('#bookmark-import-panel .bmi-done-title').textContent,
        note: document.querySelector('#bookmark-import-panel .bmi-done-note').hidden,
        failed: document.querySelector('#bookmark-import-panel .bmi-failed').hidden,
        moments: window.LT41.trees[0].moments.map((m) => [m.date, m.title]),
      }));
      assert.equal(done.open, true, `${label}: 결과 화면이 남아 있다`);
      assert.equal(done.title, '✓ 4개를 ‘시험 트리’에 담았어요', `${label}: 마친 뒤 한 줄`);
      assert.deepEqual([done.note, done.failed], [true, true], `${label}: 서버 저장까지 끝났고 담지 못한 것이 없다`);
      assert.equal(done.moments.length, 6, `${label}: 저장 뒤 트리 순간 수 2 + 4`);
      assert.deepEqual(done.moments.slice(2).map((m) => m[1]), ['가짜 영상 제목 0001', '가짜 영상 제목 0002', '가짜 영상 제목 0003', '가짜 영상 제목 0004'], `${label}: 날짜순으로 담긴다`);
      assert.ok(done.moments.slice(2).every((m) => /^2024-0[3-6]-/.test(m[0])), `${label}: 순간 날짜는 북마크한 날 — ${done.moments.slice(2).map((m) => m[0])}`);
      assert.equal(seen.puts.at(-1)?.state?.trees?.[0]?.moments?.length, 6, `${label}: 서버로 간 마지막 저장의 순간 수`);
      await measure(page, '#bookmark-import-panel', `${label} 마침`);
      await shot('4-done');
      // 서버로 간 것: 북마크 파일은 올리지 않는다. 영상 제목 조회에는 영상 id만, 저장에는 담은 순간만 실린다.
      const sent = seen.requests.filter((request) => request.url.startsWith(origin) && request.url.includes('/api/'));
      const dump = JSON.stringify(sent);
      for (const secret of ['example.test', '가짜 소식', '가짜 채널', '북마크바', '직캠 모음', 'NETSCAPE']) assert.ok(!dump.includes(secret), `${label}: 요청에 '${secret}'이(가) 실리지 않는다`);
      assert.ok(sent.filter((request) => request.url.includes('/api/youtube/oembed')).every((request) => /\/api\/youtube\/oembed\?v=[A-Za-z0-9_-]{11}$/.test(request.url)), `${label}: 제목 조회는 영상 id만 보낸다`);
      // 쓰는 요청은 기존 저장 주소 하나뿐이다(위에서 이 시험이 답한 둘러보기 소개 질문의 답은 뺀다).
      const writes = sent.filter((request) => request.method !== 'GET' && !/\/api\/trees\/[^/]+\/discover$/.test(request.url));
      assert.ok(writes.length > 0 && writes.every((request) => request.url.endsWith('/api/workspace')), `${label}: 쓰는 요청은 기존 저장 주소 하나뿐 — ${writes.map((request) => request.url)}`);
      // 닫으면 붙잡기가 풀리고 화면으로 돌아간다.
      await page.click('#bookmark-import-panel .bmi-done-actions button:last-child');
      assert.equal(await page.evaluate(() => document.getElementById('bookmark-import-panel').open), false, `${label}: 닫기`);
      assert.deepEqual(errors, [], `${label}: 화면 오류 없음`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});

test('#822 한 번에 200개까지: 넘으면 200개만 골라 두고 안내하며, 담은 뒤 남은 것을 이어서 고른다', { skip: skip || !REQUIRE ? skip || 'LT_BOOKMARK_IMPORT_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of SIZES) {
      const label = `${width}/night`;
      const { ctx, page, seen, errors } = await openContext(browser, { width, height, theme: 'night', trees: fixtureTrees() });
      await page.goto(`${origin}/v41/?account=1#shelf`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      await openWritePanel(page);
      await page.click('#bookmark-import-open');
      await page.waitForFunction(() => document.getElementById('bookmark-import-panel')?.open === true, null, { timeout: 10000 });
      await page.setInputFiles('#bookmark-import-panel input[type=file]', { name: 'bookmarks.html', mimeType: 'text/html', buffer: bookmarkFile(230) });
      await page.waitForFunction(viewShown('preview'), null, { timeout: 10000 });
      const state = () => page.evaluate(() => ({
        picked: document.querySelectorAll('#bookmark-import-panel .bmi-item input:checked').length,
        rows: document.querySelectorAll('#bookmark-import-panel .bmi-item').length,
        count: document.querySelector('#bookmark-import-panel .bmi-count').textContent,
        limit: document.querySelector('#bookmark-import-panel .bmi-limit').textContent,
        save: document.querySelector('#bookmark-import-panel .bmi-save').textContent,
      }));
      const first = await state();
      assert.deepEqual([first.rows, first.picked, first.count, first.save], [230, 200, '200개 고름 · 한 번에 200개까지', '200개 담기'], `${label}: 230개 가운데 200개만 골라 둔다`);
      assert.equal(first.limit, '새 영상이 230개예요. 한 번에 200개까지 담을 수 있어서 먼저 200개를 골라 두었어요. 담고 나면 남은 영상을 이어서 고를 수 있어요.', `${label}: 나눠 담기 안내`);
      await measure(page, '#bookmark-import-panel', `${label} 200개 상한`);
      // 201번째를 고르려 하면 고르지 않고 까닭을 알린다.
      await page.locator('#bookmark-import-panel .bmi-item').nth(210).click();
      const refused = await state();
      assert.deepEqual([refused.picked, refused.limit], [200, '한 번에 200개까지 담을 수 있어요. 지금 고른 것을 먼저 담고, 남은 영상은 이어서 담아 주세요.'], `${label}: 201번째는 고르지 않는다`);
      // 담기 → 남은 30개 이어서.
      await page.click('#bookmark-import-panel .bmi-save');
      await page.waitForFunction(viewShown('done'), null, { timeout: 120000 });
      if (await page.evaluate(() => document.getElementById('discover-ask')?.open === true)) await page.click('#discover-ask-no');
      const done = await page.evaluate(() => ({ title: document.querySelector('#bookmark-import-panel .bmi-done-title').textContent, more: [...document.querySelectorAll('#bookmark-import-panel .bmi-done-actions button')].filter((b) => !b.hidden).map((b) => b.textContent), moments: window.LT41.trees[0].moments.length }));
      assert.equal(done.title, '✓ 200개를 ‘시험 트리’에 담았어요', `${label}: 200개 담음`);
      assert.deepEqual(done.more, ['트리 보러 가기', '남은 30개 이어서 고르기', '닫기'], `${label}: 남은 것 이어서 고르기`);
      assert.equal(done.moments, 202, `${label}: 저장 뒤 트리 순간 수 2 + 200`);
      await measure(page, '#bookmark-import-panel', `${label} 200개 마침`);
      await page.locator('#bookmark-import-panel .bmi-done-actions button', { hasText: '남은 30개 이어서 고르기' }).click();
      const next = await state();
      assert.deepEqual([next.picked, next.count, next.limit, next.save], [30, '30개 고름', '', '30개 담기'], `${label}: 남은 30개만 골라져 있다`);
      assert.equal(seen.puts.at(-1)?.state?.trees?.[0]?.moments?.length, 202, `${label}: 서버로 간 마지막 저장의 순간 수`);
      assert.deepEqual(errors, [], `${label}: 화면 오류 없음`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});

test('#822 처음 온 팬 안내: 트리가 없는 내 계정의 빈 서재·첫 순간 안내에 입구 한 줄이 보이고, 누르면 새 트리로 담긴다', { skip: skip || !REQUIRE ? skip || 'LT_BOOKMARK_IMPORT_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of SIZES) for (const theme of THEMES) for (const [hash, heading] of [['shelf', '아직 책장이 비어 있어요.'], ['book', '아직 트리가 없어요.']]) {
      const label = `${width}/${theme}/${hash}`;
      const { ctx, page, errors } = await openContext(browser, { width, height, theme, trees: [] });
      const shot = async (name) => { if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, `822-${name}-${hash}-${width}-${theme}.png`) }); } };
      await page.goto(`${origin}/v41/?account=1#${hash}`, { waitUntil: 'load' });
      await page.waitForFunction(() => { const el = document.getElementById('empty-bookmark-open'); return !!el && el.getClientRects().length > 0; }, null, { timeout: 20000 });
      await page.waitForTimeout(400);
      const empty = await page.evaluate(() => {
        const rect = (sel) => { const el = document.querySelector(sel); if (!el || el.hidden || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height }; };
        const overlap = (a, b) => (!a || !b ? 0 : Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)));
        const line = rect('#empty .empty-bookmark'), button = rect('#empty-bookmark-open'), main = rect('#empty-records');
        return {
          heading: document.querySelector('#empty h1').textContent, text: document.querySelector('#empty .empty-bookmark').textContent,
          height: button?.h || 0, belowMain: !!line && !!main && line.t >= main.b - 1, inView: !!line && line.b <= innerHeight,
          overlaps: [['새 소식', rect('.updates-card')], ['알림', rect('#toast')], ['＋ 단추', rect('#mobile-add')], ['아래 링크', rect('.home-links')]].map(([name, r]) => [name, overlap(line, r)]).filter(([, area]) => area > 0),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      assert.equal(empty.heading, heading, `${label}: 빈 화면 문구는 그대로`);
      assert.equal(empty.text, '이미 모아 둔 영상이 있나요? 북마크에서 가져오기', `${label}: 한 줄 문구`);
      assert.ok(empty.height >= 44, `${label}: 누르는 곳 높이 ${empty.height}`);
      assert.ok(empty.belowMain, `${label}: 주 단추 아래에 있다`);
      assert.ok(empty.inView, `${label}: 스크롤 없이 보인다`);
      assert.deepEqual(empty.overlaps, [], `${label}: 새 소식·알림·＋ 단추·아래 링크와 겹치지 않는다`);
      assert.ok(empty.overflow <= 0, `${label}: 가로 넘침 ${empty.overflow}`);
      await measure(page, '#empty .empty-bookmark', `${label} 빈 화면 한 줄`);
      await shot('5-empty');
      if (hash === 'shelf') {
        // 누르면 가져오기 창이 뜨고, 트리가 없으니 새 트리 만들기로 담는다.
        await page.click('#empty-bookmark-open');
        await page.waitForFunction(() => document.getElementById('bookmark-import-panel')?.open === true, null, { timeout: 10000 });
        await page.setInputFiles('#bookmark-import-panel input[type=file]', fileURLToPath(new URL('./fixtures/bookmarks/safari.html', import.meta.url)));
        await page.waitForFunction(viewShown('preview'), null, { timeout: 10000 });
        assert.equal(await page.evaluate(() => document.getElementById('bookmark-import-tree').value), '__new__', `${label}: 트리가 없으면 새 트리 만들기`);
        await measure(page, '#bookmark-import-panel', `${label} 첫 미리보기`);
        await page.fill('#bookmark-import-new-name', '가짜 첫 트리');
        await page.click('#bookmark-import-panel .bmi-save');
        await page.waitForFunction(viewShown('done'), null, { timeout: 30000 });
        if (await page.evaluate(() => document.getElementById('discover-ask')?.open === true)) await page.click('#discover-ask-no');
        const made = await page.evaluate(() => ({ trees: (window.LT41?.trees || []).map((tree) => [tree.title, tree.moments.length]), emptyHidden: document.getElementById('empty').hidden, title: document.querySelector('#bookmark-import-panel .bmi-done-title').textContent }));
        assert.deepEqual(made.trees, [['가짜 첫 트리', 4]], `${label}: 저장 뒤 새 트리 순간 수`);
        assert.equal(made.title, '✓ 4개를 ‘가짜 첫 트리’에 담았어요');
        assert.equal(made.emptyHidden, true, `${label}: 빈 화면은 사라진다`);
      }
      assert.deepEqual(errors, [], `${label}: 화면 오류 없음`);
      await ctx.close();
    }
    // 로그아웃 화면에는 이 한 줄이 없다.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/api/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"code":"unauthenticated"}}' }));
    const page = await ctx.newPage();
    await page.goto(`${origin}/v41/#shelf`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.member === 'out', null, { timeout: 20000 });
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => { const el = document.querySelector('#empty .empty-bookmark'); return !el || el.hidden || !el.getClientRects().length; }), true, '로그아웃: 한 줄이 보이지 않는다');
    await ctx.close();
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
