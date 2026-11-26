import { listenOnSafePort } from './helpers/safe-port.mjs';
// #1098 3단계 — 내 소식 화면: 계정 단추 점(0이면 숨김)·계정 메뉴 입구·목록 창·읽음 뒤 점 지움·
// 불러오기 실패 안내 한 줄·키보드 열기·Esc 닫기·접근성 이름·폭 360·768·1280 × 밤/정원에서 점 위치·창 겹침.
// 크롬이 필요한 실행형 시험이라 LT_MY_NEWS_REQUIRE=1 에서만 실패로 셈한다(미리보기 검사 잡에 연결).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_MY_NEWS_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE && skip) throw new Error(`LT_MY_NEWS_REQUIRE=1 인데 실행 시험을 건너뛴다: ${skip}`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function hostHtml() {
  // 실제 창(index.html의 my-news-panel)과 같은 구조를 최소 호스트로 옮겨 그린다 — 셸 전체를 켜지 않고
  // 내 소식 조각만 실제 스타일(shell.css)로 잰다. 서버 응답은 #1159 응답 모양을 그대로 흉내 낸다.
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/v41/shell.css"><link rel="stylesheet" href="/v41/identity.css"></head><body style="margin:0">
<div style="height:56px;display:flex;align-items:center;justify-content:flex-end;padding:0 16px;background:#0b0a10">
<div class="account-slot" style="position:relative;display:inline-block">
<button type="button" class="account-avatar" id="account-avatar" aria-haspopup="menu" aria-expanded="false">나</button>
<div id="account-popover" class="account-popover" role="menu" aria-labelledby="account-avatar" hidden>
<button type="button" role="menuitem" id="account-open-settings">설정</button>
<button type="button" role="menuitem" id="account-my-news">내 소식<span class="account-menu-count" id="account-my-news-count" hidden></span></button>
</div>
</div>
</div>
<dialog id="my-news-panel" data-lt-panel="full" data-lt-return="account-my-news" aria-labelledby="my-news-title"><div class="panel-heading"><div><span class="eyebrow">내 소식</span><h2 id="my-news-title">내 소식</h2></div><button type="button" id="my-news-close" aria-label="내 소식 창 닫기" class="close">×</button></div>
<p class="panel-note">내 트리·순간에 남겨진 ♡·댓글·담기를 하루별로 모아 최신순으로 보여 줍니다. 창을 열면 지금까지 읽은 것으로 남아요.</p>
<div id="my-news-list" class="my-news-list"></div>
<p id="my-news-error" class="panel-note" role="status" hidden></p>
<div class="updates-foot"><button type="button" id="my-news-foot-close">닫기</button></div>
</dialog>
<script type="module">
import { mountMyNews } from '/v41/my-news.mjs';
const $ = id => document.getElementById(id);
const host = { apiLog: { news: 0, count: 0 } };
host.newsAnswer = { ok: true, lines: [
  { day: '2026-11-22', kind: 'heart', count: 5, aiCount: 2, treeId: 't1', momentId: 'm1' },
  { day: '2026-11-22', kind: 'comment', count: 1, treeId: 't1', momentId: 'm1', lastBody: '소식이 될 댓글' },
  { day: '2026-11-21', kind: 'favorite', count: 2, treeId: 't1' }
], lastReadAt: '2026-11-22T09:00:00.000Z' };
host.countAnswer = 3;
const mount = mountMyNews({
  $,
  showPanel: id => $(id).showModal(),
  fetchNews: async () => { host.apiLog.news += 1; return host.newsAnswer; },
  fetchCount: async () => { host.apiLog.count += 1; return host.countAnswer; },
  getTrees: () => [{ id: 't1', title: '첫 무대', moments: [{ id: 'm1', title: '이어지는 순간' }] }],
  onCount: n => {
    $('account-avatar').classList.toggle('has-dot', n > 0);
    const badge = $('account-my-news-count');
    badge.hidden = !(n > 0);
    if (n > 0) badge.textContent = String(n);
  }
});
$('account-my-news').onclick = () => { $('account-popover').hidden = true; void mount.open(); };
$('my-news-close').onclick = () => $('my-news-panel').close();
$('my-news-foot-close').onclick = () => $('my-news-panel').close();
host.mount = mount;
window.__host = host;
mount.refreshCount();
</script></body></html>`;
}
function serve() {
  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/host1098')) {
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
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}
const serverHost = server => `http://127.0.0.1:${server.address().port}`;

test('내 소식 화면 — 점(0이면 숨김)·창 열기·읽음 뒤 점 지움·실패 안내·키보드·Esc·접근성 이름', { skip }, async (t) => {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  t.after(async () => { await browser.close(); await new Promise((ok) => server.close(ok)); });
  await page.goto(`${serverHost(server)}/host1098`);
  await page.waitForFunction(() => window.__host?.mount);

  await t.test('안 읽은 수 3 — 계정 단추에 점과 숫자가 함께 보인다', async () => {
    await page.waitForFunction(() => document.getElementById('account-avatar').classList.contains('has-dot'));
    assert.equal(await page.getAttribute('#account-my-news-count', 'hidden'), null, '배지는 보인다');
    assert.equal(await page.textContent('#account-my-news-count'), '3');
  });

  await t.test('안 읽은 수 0 — 점과 숫자는 숨는다', async () => {
    await page.evaluate(() => { window.__host.countAnswer = 0; });
    await page.evaluate(() => window.__host.mount.refreshCount());
    await page.waitForFunction(() => !document.getElementById('account-avatar').classList.contains('has-dot'));
    assert.equal(await page.getAttribute('#account-my-news-count', 'hidden'), '', '배지는 숨는다');
    await page.evaluate(() => { window.__host.countAnswer = 3; });
    await page.evaluate(() => window.__host.mount.refreshCount());
    await page.waitForFunction(() => document.getElementById('account-avatar').classList.contains('has-dot'));
  });

  await t.test('메뉴 항목 누르면 창이 열리고, ♡ 5 한 줄·대상·명예회원 몫이 최신순으로 그려진다', async () => {
    const before = await page.evaluate(() => window.__host.apiLog.news);
    await page.evaluate(() => { document.getElementById('account-popover').hidden = false; });
    await page.click('#account-my-news');
    await page.waitForFunction(() => document.getElementById('my-news-panel').open);
    assert.equal(await page.evaluate(() => window.__host.apiLog.news), before + 1, '목록 한 번 — 읽음 표시는 이 읽기에 서버가 남긴다(#1159)');
    const labels = await page.$$eval('.my-news-label', els => els.map(el => el.textContent));
    assert.deepEqual(labels, ['♡ 5', '댓글 1', '담기 2'], '최신순 그대로');
    assert.ok((await page.textContent('#my-news-list')).includes('첫 무대 · 이어지는 순간'), '대상 이름표');
    assert.ok((await page.textContent('#my-news-list')).includes('AI 명예회원 2'), '명예회원 몫은 구분 이름표로');
    assert.ok((await page.textContent('#my-news-list')).includes('소식이 될 댓글'), '댓글 줄에는 최근 본문');
    assert.equal(await page.evaluate(() => document.getElementById('account-avatar').classList.contains('has-dot')), false, '창을 열었으므로 점은 바로 사라진다');
    assert.equal(await page.getAttribute('#account-my-news-count', 'hidden'), '', '배지도 숨는다');
  });

  await t.test('창에 접근성 이름이 있다(머리글 연결)', async () => {
    assert.equal(await page.getAttribute('#my-news-panel', 'aria-labelledby'), 'my-news-title');
    assert.equal((await page.textContent('#my-news-title')).trim(), '내 소식');
  });

  await t.test('Esc로 창이 닫힌다', async () => {
    assert.ok(await page.evaluate(() => document.getElementById('my-news-panel').open));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('my-news-panel').open);
  });

  await t.test('키보드로도 열린다(메뉴 항목에 초점 → Enter)', async () => {
    // 앞 단계에서 항목을 눌러 메뉴가 접혔다 — 실제로는 계정 단추를 다시 열면 펼쳐진다. 같은 상태를 만든 뒤 초점을 준다.
    await page.evaluate(() => { document.getElementById('account-popover').hidden = false; });
    await page.focus('#account-my-news');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('my-news-panel').open);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('my-news-panel').open);
  });

  await t.test('불러오기 실패 — 창 안에 짧은 안내 한 줄, 점은 지우지 않는다', async () => {
    await page.evaluate(() => {
      window.__host.countAnswer = 2;
      window.__host.newsAnswer = { ok: false, status: 500 };
      return window.__host.mount.refreshCount();
    });
    await page.waitForFunction(() => document.getElementById('account-avatar').classList.contains('has-dot'));
    await page.evaluate(() => window.__host.mount.open());
    await page.waitForFunction(() => document.getElementById('my-news-panel').open);
    assert.equal(await page.evaluate(() => document.getElementById('my-news-error').hidden), false);
    assert.match(await page.textContent('#my-news-error'), /소식을 불러오지 못했어요/);
    assert.equal(await page.evaluate(() => document.getElementById('my-news-list').textContent.trim()), '', '실패한 목록 내용은 남지 않는다');
    assert.equal(await page.evaluate(() => document.getElementById('account-avatar').classList.contains('has-dot')), true, '읽음 표시가 남지 않았으므로 점은 그대로다');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('my-news-panel').open);
  });

  await t.test('빈 목록 — 안내 한 줄', async () => {
    await page.evaluate(() => { window.__host.newsAnswer = { ok: true, lines: [], lastReadAt: '2026-11-22T09:00:00.000Z' }; });
    await page.evaluate(() => window.__host.mount.open());
    await page.waitForFunction(() => document.getElementById('my-news-panel').open);
    assert.match(await page.textContent('#my-news-list'), /아직 새 소식이 없어요/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('my-news-panel').open);
  });

  await t.test('폭 360·768·1280 × 밤/정원 — 점은 단추 안에 있고 창은 계정 단추와 겹치지 않는다', async () => {
    for (const width of [360, 768, 1280]) {
      for (const theme of [null, 'garden']) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(value => {
          if (value) document.documentElement.setAttribute('data-lt-theme', value);
          else document.documentElement.removeAttribute('data-lt-theme');
        }, theme);
        await page.evaluate(() => { document.getElementById('account-popover').hidden = true; });
        // 겹침을 재려면 창이 열려 있어야 한다 — 열 때마다 읽음 표시가 서버에 남는 모양이므로 검사 뒤 점을 되살린다.
        await page.evaluate(() => window.__host.mount.open());
        await page.waitForFunction(() => document.getElementById('my-news-panel').open);
        const measure = await page.evaluate(() => {
          const avatar = document.getElementById('account-avatar').getBoundingClientRect();
          const panel = document.getElementById('my-news-panel').getBoundingClientRect();
          return {
            avatarRight: Math.round(avatar.right),
            avatarBottom: Math.round(avatar.bottom),
            panelTop: Math.round(panel.top),
            viewport: document.documentElement.clientWidth,
            dotOn: document.getElementById('account-avatar').classList.contains('has-dot')
          };
        });
        assert.ok(measure.avatarRight <= measure.viewport, `폭 ${width} ${theme || '밤'}: 점 단추가 화면 안에 있다`);
        assert.ok(measure.panelTop >= measure.avatarBottom - 2, `폭 ${width} ${theme || '밤'}: 창 머리(${measure.panelTop})가 계정 단추(${measure.avatarBottom})를 덮지 않는다`);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('my-news-panel').open);
      }
    }
    await page.evaluate(() => { window.__host.countAnswer = 3; });
    await page.evaluate(() => window.__host.mount.refreshCount());
    await page.waitForFunction(() => document.getElementById('account-avatar').classList.contains('has-dot'));
  });
});
