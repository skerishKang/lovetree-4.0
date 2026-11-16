// #611 새 소식 화면: 알림 카드(한 번만) · 계정 단추 점 · 로그아웃 입구 · 출처 문구.
// 크롬이 필요한 실행형 시험이라 LT_UPDATES_611_REQUIRE=1 에서만 돈다(미리보기 검사 잡에 연결).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestEntry } from '../public/v41/updates.mjs';

const UPDATES_JSON = JSON.parse(readFileSync(new URL('../public/v41/updates.json', import.meta.url), 'utf8'));

const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_UPDATES_611_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE && skip) throw new Error(`LT_UPDATES_611_REQUIRE=1 인데 실행 시험을 건너뛴다: ${skip}`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function hostHtml() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="/v41/shell.css"><link rel="stylesheet" href="/v41/identity.css"></head><body>
<button type="button" class="account-avatar" id="account-avatar">나</button>
<button type="button" id="account-updates">새 소식</button>
<button type="button" id="settings-updates-open">새 소식 보기</button>
<div id="updates-card" class="updates-card" role="status" hidden><p class="updates-card-text" id="updates-card-text"></p><div class="updates-card-actions"><button type="button" id="updates-view">보기</button><button type="button" id="updates-dismiss" aria-label="새 소식 알림 닫기">×</button></div></div>
<div class="home-links"><button type="button" id="updates-link" class="feedback-link">새 소식</button></div>
<dialog id="updates-panel" data-lt-panel="full" aria-labelledby="updates-title"><div class="panel-heading"><div><span class="eyebrow">새 소식</span><h2 id="updates-title">새 소식</h2></div><button type="button" id="updates-close" class="close" aria-label="새 소식 닫기">×</button></div>
<div id="updates-list" class="updates-list"></div>
<details id="eras" class="eras" hidden><summary class="eras-summary"><span>러브트리가 걸어온 길</span></summary><ol id="eras-list" class="eras-list"></ol></details>
<div class="updates-foot"><button type="button" id="updates-foot-close">닫기</button></div></dialog>
<script type="module">
import { mountUpdates } from '/v41/updates.mjs';
const $ = id => document.getElementById(id);
const mount = mountUpdates({ $, showPanel: id => $(id).showModal(), onDot: unread => $('account-avatar').classList.toggle('has-dot', !!unread) });
$('account-updates').onclick = () => mount.openUpdates();
$('updates-link').onclick = () => mount.openUpdates();
$('settings-updates-open').onclick = () => mount.openUpdates();
$('updates-close').onclick = () => $('updates-panel').close();
$('updates-foot-close').onclick = () => $('updates-panel').close();
window.__updatesDot = null;
const probe = setInterval(() => {
  const avatar = $('account-avatar');
  window.__updatesDot = avatar.classList.contains('has-dot');
}, 50);
mount.start();
</script></body></html>`;
}
function serve() {
  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/host611')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(hostHtml());
      return;
    }
    const clean = decodeURIComponent(url.split('?')[0]);
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (!file.startsWith(ROOT)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

let server, base;
test.before(async () => { server = await serve(); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((ok) => server.close(ok)));

test('611 실행: 새 소식은 로그아웃 상태에서도 보이고, 알림 카드는 한 번만 뜬다', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.goto(`${base}/host611`, { waitUntil: 'load' });
    // 로그아웃 입구: 작은 링크 '새 소식'이 보인다(계정은 필요 없다).
    const link = page.locator('#updates-link');
    await link.waitFor({ state: 'visible', timeout: 8000 });
    assert.equal(await link.textContent(), '새 소식');
    // 첫 접속: 작은 카드 "러브트리가 새로워졌어요 — <최신 버전>"가 한 번 뜬다. 버전이 지나가도 깨지지 않게
    // updates.json의 최신 버전을 읽어 대조한다(4.1.4 고정 단정은 4.1.5가 나오자 깨졌다 — #706).
    const card = page.locator('#updates-card');
    await card.waitFor({ state: 'visible', timeout: 8000 });
    const latestVersion = latestEntry(UPDATES_JSON).version;
    assert.match(await page.locator('#updates-card-text').textContent(), new RegExp(latestVersion.replaceAll('.', '\\.')), `카드는 최신 버전(${latestVersion})을 말한다`);
    assert.equal(await page.evaluate(() => document.getElementById('account-avatar').classList.contains('has-dot')), true, '계정 단추에 작은 점이 뜬다');
    // 닫으면 그 버전은 다시 안 뜬다.
    await page.click('#updates-dismiss');
    await page.waitForFunction(() => document.getElementById('updates-card').hidden, null, { timeout: 5000 });
    // 로그아웃 입구로 새 소식 창을 연다.
    await page.click('#updates-link');
    const panel = page.locator('#updates-panel');
    await panel.waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.getElementById('updates-panel').open, null, { timeout: 5000 });
    const text = await page.locator('#updates-list').textContent();
    assert.match(text, new RegExp('러브트리 ' + latestVersion.replaceAll('.', '\\.')), '맨 위 버전 제목');
    assert.match(text, /새로워진 것/, '새로워진 것');
    assert.match(text, /고친 것/, '고친 것');
    assert.match(text, /AI 명예회원 윤제 님이 알려 준 것/, '출처 표시');
    assert.match(text, /AI 명예회원 보람 님이 알려 준 것/, '출처 표시 — 보람');
    // 4.1.6(2026-11-16): 새로워진 것 → 고친 것 → 아직 준비 중 순서, '아직 준비 중'은 한 번만.
    const fresh = text.indexOf('새로워진 것');
    const fixed = text.indexOf('고친 것');
    const soon = text.indexOf('아직 준비 중');
    assert.ok(fresh > -1 && fixed > fresh && soon > fixed, '새로워진 것 → 고친 것 → 아직 준비 중 순서다');
    assert.equal((text.match(/아직 준비 중/g) || []).length, 1, '아직 준비 중 제목은 한 번만 보인다');
    assert.match(text, /검색 사이트/, '아직 준비 중 — 검색 등록');
    assert.match(text, /비밀번호 찾기/, '아직 준비 중 — 비밀번호 찾기');
    assert.doesNotMatch(text, /undefined|null|NaN/, '화면 글자에 undefined·null·NaN 없다');
    assert.match(text, /핀보드/, '첫 노트 항목');
    assert.match(text, /칸마다 차곡차곡/i, '다음 버전 항목이 함께 보인다');
    assert.doesNotMatch(text, /여러분이/, '금지 문국이 없다');
    assert.doesNotMatch(text, /이슈 #|#[0-9]{2,}/, '이슈 번호를 보여 주지 않는다');
    assert.equal(await page.evaluate(() => document.getElementById('account-avatar').classList.contains('has-dot')), false, '새 소식을 보면 점이 사라진다');
    await page.evaluate(() => document.getElementById('updates-panel').close());
    // 새로고침(같은 저장소): 카드·점이 다시 뜨지 않는다.
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#updates-card').evaluate(el => el.hidden), true, '다시 접속하면 카드를 안 보인다');
    assert.equal(await page.evaluate(() => document.getElementById('account-avatar').classList.contains('has-dot')), false, '점도 다시 안 뜬다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
    await ctx.close();
  } finally {
    await browser.close();
  }
});

test('611 실행: 390에서도 작은 카드와 새 소식 창이 보인다', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/host611`, { waitUntil: 'load' });
    const card = page.locator('#updates-card');
    await card.waitFor({ state: 'visible', timeout: 8000 });
    const box = await card.boundingBox();
    assert.ok(box && box.width <= 390, '카드는 390 화면 안에 든다');
    await page.click('#updates-link');
    await page.waitForFunction(() => document.getElementById('updates-panel').open, null, { timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, '가로 넘침이 없다');
    await ctx.close();
  } finally {
    await browser.close();
  }
});

// 새 소식 창 닫기(261116): 창을 열면 맨 위에서 열려 ✕가 바로 보인다(입구에서 열 때는 굴리지 않는다 —
// 예전에는 열자마자 최신 버전으로 굴러 ✕가 창 위로 밀려났다). 목록 끝 '닫기'·Esc·✕ 세 길로 닫힌다. 390 휴대폰 폭에서 재단다.
// 창이 모달이라 바깥 메뉴는 누를 수 없어 '같은 입구 다시 누르기'는 닫기 길이 아니다.
test('611 실행: 새 소식 창은 맨 위에서 열리고 세 길로 닫힌다(390)', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.goto(`${base}/host611`, { waitUntil: 'load' });
    // 목록은 창을 열 때 채워지므로, 열기 전에는 카드(접속 때 한 번)가 뜨는지만 기다린다.
    await page.waitForFunction(() => !document.getElementById('updates-card')?.hidden, null, { timeout: 8000 });
    const open = () => page.waitForFunction(() => document.getElementById('updates-panel').open, null, { timeout: 5000 });
    const closed = () => page.waitForFunction(() => !document.getElementById('updates-panel').open, null, { timeout: 5000 });

    // 1) 입구에서 열면 맨 위에서 열린다 — ✕가 창 안에 그대로 보인다(굸러 들어가지 않는다).
    await page.click('#updates-link');
    await open();
    const top = await page.evaluate(() => {
      const panel = document.getElementById('updates-panel');
      const btn = panel.querySelector('.close');
      const r = btn.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      return { scrollTop: panel.scrollTop, visible: r.height > 0 && r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1, width: Math.round(r.width) };
    });
    assert.ok(top.scrollTop < 4, `입구에서 열면 맨 위에서 열린다(scrollTop=${top.scrollTop})`);
    assert.ok(top.visible, `열자마자 ✕가 창 안에 보인다(${JSON.stringify(top)})`);
    assert.ok(top.width >= 40, `✕ 누름 영역이 44px 근처다(${top.width}px)`);

    // 2) 목록 끝 '닫기' 단추로 닫친다.
    await page.click('#updates-foot-close');
    await closed();

    // 3) Esc로 닫친다.
    await page.click('#updates-link');
    await open();
    await page.keyboard.press('Escape');
    await closed();

    // 4) ✕로 닫친다.
    await page.click('#updates-link');
    await open();
    await page.click('#updates-close');
    await closed();

    assert.deepEqual(errors, [], '페이지 오류 없음');
    await ctx.close();
  } finally {
    await browser.close();
  }
});

// 261116(대표 확정): 4.1.1·4.1.2 복원 + '러브트리가 걸어온 길' 접이식 구획.
// 눈이 아니라 숫자로 본다 — 버전 순서, 카드 다섯 장·순서·금테 한 장, 390 가로 넘침 0, 밤·정원 대비 4.5:1.
test('261116 실행: 4.1.2·4.1.1이 4.1.3 아래에 보이고, 걸어온 길은 접혔다가 펼쳐진다(1440·390 × 밤·정원)', { skip }, async () => {
  const browser = await chromium.launch();
  const ERAS = JSON.parse(readFileSync(new URL('../public/v41/eras.json', import.meta.url), 'utf8'));
  try {
    for (const theme of ['night', 'garden']) {
      for (const width of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));
        await page.goto(`${base}/host611`, { waitUntil: 'load' });
        await page.evaluate((t) => document.documentElement.setAttribute('data-lt-theme', t), theme);
        await page.waitForFunction(() => !document.getElementById('updates-card')?.hidden, null, { timeout: 8000 });
        await page.click('#updates-link');
        await page.waitForFunction(() => document.getElementById('updates-panel').open, null, { timeout: 5000 });
        await page.waitForFunction(() => !document.getElementById('eras')?.hidden, null, { timeout: 5000 });

        // ① 복원한 두 판이 4.1.3 아래·4.1.0 위에 있다(자료 순서 그대로 화면에 선다).
        const versions = await page.evaluate(() => [...document.querySelectorAll('#updates-list .updates-version')].map(el => el.dataset.updatesVersion));
        const at = (v) => versions.indexOf(v);
        assert.ok(at('4.1.3') >= 0 && at('4.1.0') >= 0, `${width}/${theme}: 옛 판이 함께 보인다`);
        assert.ok(at('4.1.3') < at('4.1.2') && at('4.1.2') < at('4.1.1') && at('4.1.1') < at('4.1.0'), `${width}/${theme}: 4.1.3 → 4.1.2 → 4.1.1 → 4.1.0 순서(${versions.join(',')})`);
        const restored = await page.evaluate(() => ['4.1.2', '4.1.1'].map(v => document.querySelector(`[data-updates-version="${v}"]`)?.innerText || ''));
        assert.match(restored[0], /보드에서 순간 날짜를 바로 바꿀 수 있어요/, '4.1.2 문구');
        assert.match(restored[1], /보드가 핀보드로 바뀌었어요/, '4.1.1 문구');

        // ② 구획은 처음엔 접힘 — 카드는 아직 안 보이고 제목만 있다.
        const collapsed = await page.evaluate(() => {
          const box = document.getElementById('eras');
          const cards = document.querySelectorAll('#eras-list .eras-card');
          const summary = box.querySelector('.eras-summary');
          const r = summary.getBoundingClientRect();
          return { open: box.open, hidden: box.hidden, cards: cards.length, label: summary.textContent.trim(), height: Math.round(r.height) };
        });
        assert.equal(collapsed.open, false, `${width}/${theme}: 처음엔 접힘`);
        assert.equal(collapsed.hidden, false, `${width}/${theme}: 자료를 읽었으면 구획이 보인다`);
        assert.equal(collapsed.cards, ERAS.length, `${width}/${theme}: 카드 ${ERAS.length}장`);
        assert.equal(collapsed.label, '러브트리가 걸어온 길', '구획 이름');
        assert.ok(collapsed.height >= 40, `${width}/${theme}: 접힌 줄 누름 영역 ${collapsed.height}px`);

        // ③ 펼치면 세대 카드가 옛것 → 지금, 마지막 한 장만 금테.
        await page.click('#eras .eras-summary');
        await page.waitForFunction(() => document.getElementById('eras').open, null, { timeout: 3000 });
        const opened = await page.evaluate(() => {
          const cards = [...document.querySelectorAll('#eras-list .eras-card')];
          return {
            marks: cards.map(c => c.querySelector('.eras-mark')?.textContent.trim()),
            names: cards.map(c => c.querySelector('.eras-name')?.textContent.trim()),
            current: cards.filter(c => c.dataset.current === 'true').map(c => c.querySelector('.eras-name')?.textContent.trim()),
            lastIsCurrent: cards.at(-1)?.dataset.current === 'true',
            currentBorder: getComputedStyle(cards.at(-1)).borderTopColor,
            plainBorder: getComputedStyle(cards[0]).borderTopColor,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            panelRight: Math.round(document.getElementById('updates-panel').getBoundingClientRect().right),
            widestRight: Math.round(Math.max(...cards.map(c => c.getBoundingClientRect().right))),
            text: document.getElementById('eras-list').innerText
          };
        });
        assert.deepEqual(opened.marks, ERAS.map(e => e.mark), `${width}/${theme}: 번호 순서`);
        assert.deepEqual(opened.names, ERAS.map(e => e.name), `${width}/${theme}: 이름 순서(옛것 → 지금)`);
        assert.deepEqual(opened.current, ['러브트리 4.1'], `${width}/${theme}: 금테는 지금 카드 한 장`);
        assert.equal(opened.lastIsCurrent, true, `${width}/${theme}: 마지막 카드가 지금`);
        assert.notEqual(opened.currentBorder, opened.plainBorder, `${width}/${theme}: 금테 색이 다른 카드와 다르다`);
        assert.ok(opened.overflow <= 0, `${width}/${theme}: 가로 넘침 ${opened.overflow}px`);
        assert.ok(opened.widestRight <= opened.panelRight + 1, `${width}/${theme}: 카드가 창 밖으로 나가지 않는다(${opened.widestRight} ≤ ${opened.panelRight})`);
        assert.doesNotMatch(opened.text, /undefined|null|NaN/, '화면 글자에 undefined·null·NaN 없음');
        assert.doesNotMatch(opened.text, /https?:|github|저장소/, '저장소 주소·개발 용어 없음');

        // ④ 밤·정원 모두 카드 글자 대비 4.5:1 이상(실제 그려진 색을 겹쳐서 잰다).
        const ratios = await page.evaluate(() => {
          const parse = (text) => {
            const m = /rgba?\(([^)]+)\)/.exec(text || '');
            if (!m) return null;
            const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
            if (p.length < 3 || p.some(n => Number.isNaN(n))) return null;
            return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
          };
          const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
          const lum = (c) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
          const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          const stack = (el) => {
            const layers = [];
            for (let node = el; node; node = node.parentElement) {
              const bg = parse(getComputedStyle(node).backgroundColor);
              if (bg && bg.a > 0) layers.push(bg);
              if (bg && bg.a === 1) break;
            }
            const base = parse(getComputedStyle(document.body).backgroundColor) || { r: 4, g: 4, b: 7, a: 1 };
            return layers.reduceRight((under, top) => over(top, under), base.a === 1 ? base : { r: 4, g: 4, b: 7, a: 1 });
          };
          return ['.eras-name', '.eras-line', '.eras-when', '.eras-mark', '.eras-summary'].map((sel) => {
            const el = document.querySelector(sel);
            const fg = parse(getComputedStyle(el).color);
            const bg = stack(el);
            return { sel, ratio: Math.round(ratio(fg, bg) * 100) / 100 };
          });
        });
        for (const row of ratios) assert.ok(row.ratio >= 4.5, `${width}/${theme}: ${row.sel} 대비 ${row.ratio}:1 (4.5:1 이상)`);
        assert.deepEqual(errors, [], `${width}/${theme}: 페이지 오류 없음`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
});
