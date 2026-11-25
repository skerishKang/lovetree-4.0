// #417: 보드·지도 머리의 트리 제목 ▾ — 책(#416)과 같은 내용·키보드 동작.
// #952: 화면 배선을 글자로 고정하던 33개 단정을 걷어내고, 보드 화면을 띄워 결과로 잰다 —
// 제목 글자·▾ 열기·행 순서(정리 전 먼저)·지금 트리 표시·행을 눌러 lt41-open-view·← 서재는
// lt41-navigate·Esc 닫기(단추로 초점 복귀)·위아래 이동·바깥 누르기·읽기 전용에서 숨김.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = path.join(ROOT, 'public');
let chromium, skip = false;
const REQUIRE = process.env.LT_BOARD_417_REQUIRE === '1';
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 트리 제목 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 트리 제목 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

function serve(extra = {}) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (extra[clean]) { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(extra[clean]); return; }
    for (const file of [path.join(PUB, clean), path.join(PUB, clean, 'index.html')]) {
      if (path.relative(PUB, file).startsWith('..')) continue;
      try {
        if (!(await stat(file)).isFile()) continue;
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res); return;
      } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const moment = (id, title) => ({ id, title, date: '2026-01-01', emotion: '설렘', note: '메모', parentId: null, url: '', x: 120, y: 120, rot: 0, color: 'rose', keywords: [] });

// 셸 흉내: 보기·읽기 전용 여부와 트리 목록을 넘기고, 프레임이 보내는 메시지를 모은다.
const hostHTML = ({ source, writable, trees, treeId }) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>보드 호스트</title></head><body>
<script>
window.__msgs=[];
addEventListener('message',e=>{if(e.data&&/^lt41-/.test(String(e.data.type||'')))window.__msgs.push(e.data)});
window.LT41={source:${JSON.stringify(source)},writable:${writable},owned:true,momentId:${JSON.stringify(trees[0].moments[0].id)},prefs:{},trees:${JSON.stringify(trees)},tree:${JSON.stringify(trees.find(t => t.id === treeId))}};
</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const TREES = [
  { id: 't1', title: '지금 보는 트리', moments: [moment('a1', '첫 순간'), moment('a2', '둘째 순간')], edges: [] },
  { id: 't2', title: '정리 전 트리', inbox: true, moments: [moment('b1', '쌓인 순간')], edges: [] },
  { id: 't3', title: '다른 트리', moments: [moment('c1', '한 순간')], edges: [] }
];

async function openHost(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const problems = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '보드 프레임이 열린다');
  await frame.waitForSelector('.lt-screen-toolbar .lt-toolbar-title', { timeout: 20000 });
  await page.waitForTimeout(400);
  return { context, page, frame, problems };
}

// #1249: 트리 선택은 셸의 공통 메뉴로 통합되었다. 메뉴의 키보드/선택 동작은
// v41-topmenu-885.test.mjs에서 검증하고, 보드에서는 중복 메뉴가 없는지 확인한다.
for (const [source, writable] of [['server', true], ['share', false]]) {
  test(`#417 #1249 보드 공통 줄: ${source} 트리 이름 한 번 표시, 이전 선택 메뉴 숨김`, { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
    const browser = await chromium.launch();
    const server = await serve({ '/host.html': hostHTML({ source, writable, trees: TREES, treeId: 't1' }) });
    t.after(async () => { await browser.close(); server.close(); });
    const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`);
    assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
    await frame.waitForFunction(title => document.querySelector('.lt-toolbar-title')?.textContent.trim() === title, TREES[0].title);
    const head = await frame.evaluate(title => {
      const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const names = [...document.querySelectorAll('*')].filter(el => el.children.length === 0 && el.textContent.trim() === title && visible(el));
      return {
        title: document.querySelector('.lt-toolbar-title').textContent.trim(),
        names: names.length,
        oldButton: visible(document.getElementById('treeTitleBtn')),
        oldMenu: visible(document.getElementById('treeMenuPanel'))
      };
    }, TREES[0].title);
    assert.deepEqual(head, { title: TREES[0].title, names: 1, oldButton: false, oldMenu: false });
    await frame.click('.lt-toolbar-title');
    assert.equal(await frame.locator('#treeMenuPanel').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.__msgs.filter(m => m.type === 'lt41-open-view')), []);
    await context.close();
  });
}
