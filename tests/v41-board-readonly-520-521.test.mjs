// #520·#521: 읽기 전용(예시·공유) 보드에서는 390에서도 '＋ 순간 꽂기'가 숨는지(#520),
// '진주빛 보드 · 읽기 전용' 표시가 모바일 순간 선택 패널에 가려지지 않는지(#521),
// 쓰기 가능한 내 보드에서는 390에서도 단추가 보이고 눌리는지(실행형) 시험한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_BOARD_CONTRAST_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_BOARD_CONTRAST_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 보드 읽기 전용 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 보드 읽기 전용 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

// 쓰기 가능 보드 시험용: 셸 없이 LT41(서버·쓰기 가능·demoData 없음)을 넘겨 보드를 여는 호스트 페이지.
// 계정 없이 쓰기 가능 상태를 재현하려는 목적이고, 실제 저장까지는 보지 않는다(모달이 열리는지까지).
const HOST_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body>
<script>
window.LT41={source:'server',writable:true,momentId:'m1',prefs:{},tree:{id:'t1',title:'내 테스트 보드',moments:[
 {id:'m1',title:'첫 순간',date:'2026-01-01',emotion:'끌림',note:'첫 메모',parentId:null,url:'',x:120,y:120,rot:0,color:'rose',keywords:[]},
 {id:'m2',title:'다음 순간',date:'2026-01-02',emotion:'설렘',note:'둘째 메모',parentId:'m1',url:'',x:330,y:170,rot:2,color:'violet',keywords:[]},
 {id:'m3',title:'셋째 순간',date:'2026-01-03',emotion:'몰입',note:'셋째 메모',parentId:'m2',url:'',x:540,y:120,rot:-2,color:'cyan',keywords:[]}],edges:[
 {id:'e1',kind:'parent',from:'m1',to:'m2',reason:'이어서'},{id:'e2',kind:'parent',from:'m2',to:'m3',reason:'또 이어서'}]}};
</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe>
</body></html>`;

function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/__lt-board-host.html') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(HOST_HTML); return; }
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (path.relative(ROOT, file).startsWith('..')) continue;
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

async function openSampleBoard(browser, base, { width, theme, plate }) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 852 : 900 }, isMobile: width === 390, hasTouch: width === 390, reducedMotion: 'reduce' });
  await context.addInitScript(([t, p]) => { try { localStorage.setItem('lt41.theme', t); if (p === 'night') localStorage.setItem('lt41.boardTheme', 'night'); else localStorage.removeItem('lt41.boardTheme'); } catch {} }, [theme, plate]);
  const page = await context.newPage();
  await page.goto(`${base}/v41/#board`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /track58-pinboard/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '보드 프레임이 열린다');
  await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  return { context, page, frame };
}

test('읽기 전용 보드: 390 × 밤·정원 × 판 종이·밤에서 도구 줄에 ＋ 순간 꽂기가 없다(1440도 유지)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, mobile] of [[390, true], [1440, false]]) {
      for (const theme of ['night', 'garden']) {
        for (const plate of ['paper', 'night']) {
          const { context, frame } = await openSampleBoard(browser, base, { width, theme, plate });
          const state = await frame.evaluate(() => { const b = document.getElementById('addBtn'); return { exists: !!b, readOnly: window.LTDEMO?.readOnly }; });
          assert.equal(state.readOnly, true, `${width} ${theme}/${plate}: 예시 보드는 읽기 전용으로 판정된다`);
          assert.equal(state.exists, false, `${width} ${theme}/${plate}: 도구 줄에 '+ 순간 추가' 단추가 없다(#891⑤ — 머리줄 한 벌만 둔다)`);
          await context.close();
        }
      }
    }
  } finally {
    await browser?.close();
    server.close();
  }
});

test('390 보드: 읽기 전용 표시가 순간 선택 패널에 가려지지 않는다 × 밤·정원 × 판 종이·밤', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const theme of ['night', 'garden']) {
      for (const plate of ['paper', 'night']) {
        const { context, frame } = await openSampleBoard(browser, base, { width: 390, theme, plate });
        const m = await frame.evaluate(() => {
          const badge = document.getElementById('themeBadge');
          const picker = document.querySelector('.lt-moment-picker');
          if (!badge || !picker) return { found: false };
          const b = badge.getBoundingClientRect(), p = picker.getBoundingClientRect();
          const w = Math.max(0, Math.round(Math.min(b.right, p.right) - Math.max(b.left, p.left)));
          const h = Math.max(0, Math.round(Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top)));
          const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
          return { found: true, overlap: w * h, hitInsidePicker: hit ? !!picker.contains(hit) : null, badgeText: badge.textContent.trim(), badgeBox: { top: b.top, bottom: b.bottom, left: b.left, right: b.right }, pickerBox: { top: p.top, bottom: p.bottom, left: p.left, right: p.right }, pickerTop: getComputedStyle(picker).top, pickerTopVariable: getComputedStyle(document.documentElement).getPropertyValue('--lt-board-picker-top').trim(), toolbarBottom: document.querySelector('.lt-screen-toolbar')?.getBoundingClientRect().bottom, headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom };
        });
        assert.equal(m.found, true, `${theme}/${plate}: 표시·패널이 모두 있다`);
        assert.equal(m.overlap, 0, `${theme}/${plate}: 표시와 선택 패널 겹침(전: 96×11) ${JSON.stringify(m)}`);
        assert.equal(m.hitInsidePicker, false, `${theme}/${plate}: 표시가 패널 뒤에 있지 않다`);
        assert.equal(m.badgeText.includes('읽기 전용'), true, `${theme}/${plate}: 표시 문구가 유지된다`);
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    server.close();
  }
});

// '쓰기 가능 내 보드: 390에서 ＋ 순간 꽂기가 보이고 눌리면 창이 열린다' 시험은 #891⑤(CTO)로 보드 도구 줄의
// '+ 순간 추가' 단추를 치우면서 함께 지웠다 — 쓰기 입구는 셸 머리줄 한 벌(quick-add 흐름 시험이 지킨다).
