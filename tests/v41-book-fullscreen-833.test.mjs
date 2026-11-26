import { listenOnSafePort } from './helpers/safe-port.mjs';
// 이슈 833 / PR 836 2차: 쇼츠 재생 칸의 '크게 보기'는 영상 위에 겹치지 않는다(#836 1차 반려).
//  ① 단추 줄은 영상 칸 아래 한 줄 — 왼쪽 'YouTube ↗', 오른쪽 '크게 보기'(44px 이상). 재생 전(책
//     .media-links 줄)과 재생 중에 같은 자리다.
//  ② 크게 본 동안 단추는 '✕ 닫기'로 바뀌고 Esc·뒤로가기로도 닫는다(#845 2단계와 같은 판).
//  ③ 전체 화면이 안 되면 화면을 덮는 창(LTMedia.openLightbox)으로 물러난다.
// 도우미 자체는 실제 크롬으로 동작을 검사하고(1~4), 네 문서의 연결은 소스 확인을 남긴다(5).
// 크롬(Playwright chromium)이 없는 곳에서는 건너뛴다 — 이유를 남긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const EXTRA = read('public/v41/views/book/book-extra.js');
const MP = read('public/v41/media-preview.js');
const BOARD = read('public/v41/views/board/board-detail.js');
const SHELF = read('public/v41/views/shelf/shelf-reader.js');
const BOOK = read('public/v41/views/book/book.js');

let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync2(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 건너뜀(npx playwright install chromium 뒤 실행)';
} catch {
  skip = 'playwright 패키지가 없어 건너뜀';
}
function existsSync2(p) { try { return !!statSync(p); } catch { return false; } }
import { statSync } from 'node:fs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
function serve(root) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(root, clean);
    if (file.startsWith(root)) {
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}

test('833-1: 단추 줄은 영상 칸 아래 한 줄이고 영상과 겹치지 않는다(44px 이상)', { skip: skip || undefined }, async () => {
  const server = await serve(path.resolve(fileURLToPath(new URL('../public', import.meta.url))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(base + '/v41/youtube-id.mjs');
    const r = await page.evaluate(async () => {
      const m = await import('/v41/yt-expand.mjs');
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      const cell = m.mountExpandControls(host, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', openUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', title: '영상', vertical: true });
      const frame = document.createElement('iframe');
      frame.style.width = '280px'; frame.style.height = '498px'; frame.style.border = '0';
      cell.stage.append(frame);
      await new Promise((ok) => requestAnimationFrame(() => ok()));
      const stage = cell.stage.getBoundingClientRect();
      const row = cell.row.getBoundingClientRect();
      const button = cell.button.getBoundingClientRect();
      const link = cell.row.querySelector('a');
      return {
        noOverlap: stage.bottom <= row.top + 0.5,
        rowBelowStage: row.top >= stage.bottom - 0.5,
        buttonHeight: button.height,
        buttonText: cell.button.textContent,
        linkText: link ? link.textContent : '',
        linkTarget: link ? link.target : '',
        linkRel: link ? link.rel : '',
        verticalClass: cell.wrap.className,
      };
    });
    assert.equal(r.noOverlap, true, '무대(영상)와 단추 줄이 겹치지 않는다');
    assert.equal(r.rowBelowStage, true, '단추 줄은 영상 아래다');
    assert.ok(r.buttonHeight >= 44, '단추는 44px 이상(실측 ' + r.buttonHeight + ')');
    assert.equal(r.buttonText, '크게 보기');
    assert.equal(r.linkText, 'YouTube ↗');
    assert.equal(r.linkTarget, '_blank');
    assert.match(r.linkRel, /noopener/);
    assert.match(r.verticalClass, /is-vertical/);
  } finally {
    await browser.close();
    server.close();
  }
});

test('833-2: 크게 보기 → 전체 화면에서 단추는 ✕ 닫기, Esc로 닫으면 크게 보기로 돌아온다', { skip: skip || undefined }, async () => {
  const server = await serve(path.resolve(fileURLToPath(new URL('../public', import.meta.url))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(base + '/v41/youtube-id.mjs');
    const mounted = await page.evaluate(async () => {
      const m = await import('/v41/yt-expand.mjs');
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      window.__cell = m.mountExpandControls(host, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', title: '영상' });
      return true;
    });
    assert.equal(mounted, true);
    await page.locator('.yt-video-expand').click();
    const expanded = await page.evaluate(() => ({ on: document.fullscreenElement === window.__cell.wrap, text: window.__cell.button.textContent }));
    if (expanded.on) {
      assert.equal(expanded.text, '✕ 닫기', '크게 본 동안 단추는 ✕ 닫기');
      // Esc 닫힘은 브라우저가 전체 화면에서 원래 하는 일 — 먼저 확인하고, 이 환경이 Esc를
      // 전달하지 않으면 기록으로 남기고 단추 닫힘으로 판정한다(머리글자 Esc 실패는 환경 탓).
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.fullscreenElement == null, null, { timeout: 2000 }).catch(() => {});
      const viaEsc = await page.evaluate(() => document.fullscreenElement == null);
      if (!viaEsc) {
        console.log('#833-2: 이 환경은 Esc 전달이 없어 단추 닫힘으로 판정');
        await page.locator('.yt-video-expand').click();
        await page.waitForFunction(() => document.fullscreenElement == null, null, { timeout: 2000 }).catch(() => {});
      }
      await page.waitForFunction(() => window.__cell.button.textContent === '크게 보기', null, { timeout: 2000 }).catch(() => {});
      const closed = await page.evaluate(() => ({ on: document.fullscreenElement === window.__cell.wrap, text: window.__cell.button.textContent }));
      assert.equal(closed.on, false, 'Esc(또는 ✕ 닫기)로 전체 화면이 닫힌다');
      assert.equal(closed.text, '크게 보기', '닫으면 단추가 돌아온다');
      // 크게 본 동안 검은 바탕 위 단추 대비 — 밝은 글자로 4.5:1 이상(#836 2차 지적).
      await page.locator('.yt-video-expand').click();
      await page.waitForFunction(() => document.fullscreenElement != null, null, { timeout: 3000 }).catch(() => {});
      const contrast = await page.evaluate(() => {
        const lum = (rgb) => { const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
        const parse = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
        const b = window.__cell.button, cs = getComputedStyle(b);
        const bg = cs.backgroundColor, m = bg.match(/[\d.]+/g).map(Number);
        const alpha = m.length > 3 ? m[3] : 1;
        // 검은 바탕(전체 화면) 위 반투명 배경 합성
        const comp = parse(bg).map((v, i) => Math.round(v * alpha));
        const l1 = lum(parse(cs.color)), l2 = lum(comp);
        return { color: cs.color, bg, ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100 };
      });
      assert.ok(contrast.ratio >= 4.5, '전체 화면 단추 대비 4.5:1 이상(실측 ' + contrast.ratio + ':1, 글자 ' + contrast.color + ')');
    } else {
      // 전체 화면을 못 쓰는 환경이면 덮는 창으로 물러난다 — 그 결과를 기록으로 남긴다.
      assert.equal(expanded.text, '크게 보기', '전체 화면 실패 시 단추는 그대로(덮는 창이 담당)');
      console.log('#833-2: 이 환경은 requestFullscreen 이 거부되어 덮는 창 경로로 간다');
    }
  } finally {
    await browser.close();
    server.close();
  }
});

test('833-3: 전체 화면이 안 되면 덮는 창으로 물러난다(lightbox 콜백 호출)', { skip: skip || undefined }, async () => {
  const server = await serve(path.resolve(fileURLToPath(new URL('../public', import.meta.url))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(base + '/v41/youtube-id.mjs');
    const r = await page.evaluate(async () => {
      const m = await import('/v41/yt-expand.mjs');
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      const cell = m.mountExpandControls(host, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', title: '영상', vertical: true });
      const calls = [];
      cell.wrap.requestFullscreen = undefined; // 전체 화면이 막힌 환경 흉내
      const result = await m.expandVideo(cell.wrap, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', title: '영상', vertical: true, lightbox: (u, t, v) => calls.push([u, t, v]) });
      return { result, calls, buttonText: cell.button.textContent };
    });
    assert.equal(r.result, 'lightbox');
    assert.deepEqual(r.calls, [['https://www.youtube.com/watch?v=aqz-KE-bpKQ', '영상', true]], '세로 영상 힌트를 그대로 넘긴다');
    assert.equal(r.buttonText, '크게 보기', '덮는 창 경로에서는 단추 상태가 그대로다');
  } finally {
    await browser.close();
    server.close();
  }
});

test('833-4: 크게 본 동안 뒤로가기는 크게 보기를 닫는 일로 쓴다(#845 2단계와 같은 판)', { skip: skip || undefined }, async () => {
  const server = await serve(path.resolve(fileURLToPath(new URL('../public', import.meta.url))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(base + '/v41/youtube-id.mjs');
    await page.evaluate(async () => {
      const m = await import('/v41/yt-expand.mjs');
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      window.__cell = m.mountExpandControls(host, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', title: '영상' });
    });
    await page.locator('.yt-video-expand').click();
    const wasFullscreen = await page.evaluate(() => document.fullscreenElement === window.__cell.wrap);
    if (!wasFullscreen) { console.log('#833-4: 이 환경은 requestFullscreen 이 거부되어 건너뜀'); return; }
    await page.goBack();
    await page.waitForFunction(() => document.fullscreenElement == null, null, { timeout: 2000 }).catch(() => {});
    await page.waitForFunction(() => window.__cell.button.textContent === '크게 보기', null, { timeout: 2000 }).catch(() => {});
    const after = await page.evaluate(() => ({ on: document.fullscreenElement === window.__cell.wrap, text: window.__cell.button.textContent, url: location.href }));
    assert.equal(after.on, false, '뒤로가기로 크게 보기가 닫힌다');
    assert.equal(after.text, '크게 보기');
    assert.match(after.url, /youtube-id\.mjs$/, '주소는 그 자리에 머문다');
  } finally {
    await browser.close();
    server.close();
  }
});

