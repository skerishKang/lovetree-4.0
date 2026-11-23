import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPagesPreviewHost, isProductionHost, hasPreviewExamples } from '../public/v41/host-context.mjs';
import { withPreviewExamples, previewSamples, PREVIEW_MOMENTS } from '../public/v41/preview-examples.mjs';
import { quickPreviewNoticeText, QUICK_PREVIEW_NOTICE } from '../public/v41/quick-add.mjs';

const PREVIEW = '660970a2.lovetree-4-0.pages.dev';
const ROOT = 'lovetree-4-0.pages.dev';
const PROD = 'lovetree.padiem.net';

test('미리보기 호스트만 알아본다 — 운영 주소는 절대 미리보기가 아니다', () => {
  assert.equal(isProductionHost(PROD), true);
  assert.equal(isProductionHost(PREVIEW), false);
  assert.equal(isPagesPreviewHost(PREVIEW), true);
  assert.equal(isPagesPreviewHost(ROOT), true);
  assert.equal(isPagesPreviewHost(PROD), false);
  assert.equal(isPagesPreviewHost('www.lovetree.padiem.net'), false);
  assert.equal(isPagesPreviewHost('lovetree-4-0.pages.dev.evil.test'), false);
  assert.equal(isPagesPreviewHost(''), false);
  assert.equal(hasPreviewExamples(PREVIEW, '?lt791=1'), true);
  assert.equal(hasPreviewExamples(PREVIEW, ''), false);
  assert.equal(hasPreviewExamples(PROD, '?lt791=1'), false);
});

test('화면과 서버의 운영 호스트 정의가 같다', async () => {
  const { PRODUCTION_HOST: SERVER_HOST } = await import('../functions/_lib/search-meta.mjs');
  const { PRODUCTION_HOST } = await import('../public/v41/host-context.mjs');
  assert.equal(PRODUCTION_HOST, SERVER_HOST);
});

test('미리보기에서만 예시 트리에 틱톡 2개와 릴스 1개를 얹는다', () => {
  const demoData = { moments: [{ id: 'm01', title: '원본 예시' }] };
  const tree = { id: 'limone-example', moments: [{ id: 'm01', title: '원본 예시' }], edges: [], demoData };
  const prod = withPreviewExamples(tree, PROD);
  assert.equal(prod, tree, '운영에서는 원본 객체를 그대로 쓴다');
  assert.equal(prod.moments.length, 1);

  assert.equal(withPreviewExamples(tree, PREVIEW), tree, '질의 값이 없으면 자동 검사에서 예시를 넣지 않는다');
  const preview = withPreviewExamples(tree, PREVIEW, '?lt791=1');
  assert.equal(preview.moments.length, 4);
  assert.equal(preview.edges.length, 3);
  assert.deepEqual(preview.moments.slice(0, 3).map((m) => m.id), ['pv-tt-1', 'pv-tt-2', 'pv-ig-1']);
  assert.equal(preview.demoData.moments.length, 4);
  const tiktoks = preview.moments.filter((m) => String(m.url || '').includes('tiktok.com'));
  assert.equal(tiktoks.length, 2);
  assert.ok(tiktoks.every((m) => m.mediaMetadata?.title && m.mediaMetadata?.tiktokId && !m.mediaMetadata?.thumbnail));
  const reel = preview.moments.find((m) => m.id === 'pv-ig-1');
  assert.match(reel.url, /instagram\.com\/reel\//);
  assert.equal(reel.mediaMetadata.thumbnail, undefined, '릴스는 썸네일 없는 글 카드');
  assert.equal(previewSamples(PROD, '?lt791=1').length, 0, '운영에서는 질의 값이 있어도 예시 없음');
  assert.equal(previewSamples(PREVIEW).length, 0);
  assert.equal(previewSamples(PREVIEW, '?lt791=1').length, 3);
  assert.equal(PREVIEW_MOMENTS.every((m) => m.externalUrl === m.url), true, '보드도 링크를 읽을 수 있게');
});

test('체험 예시는 기본 예시 사진을 빌리지 않고 첫 순간 표시도 붙이지 않는다', () => {
  const samples = JSON.parse(readFileSync(new URL('../src/views/orbit-samples.json', import.meta.url), 'utf8'));
  assert.equal(samples.filter((m) => m.first === true).length, 1, '첫 순간 표시는 기본 예시 한 장만');
  assert.equal(samples[0].title, '첫인상');
  for (const moment of PREVIEW_MOMENTS) {
    assert.equal(moment.first, false, moment.id);
    assert.ok(!moment.image, '기본 예시 사진을 쓰지 않는다: ' + moment.id);
    assert.ok(!moment.mediaMetadata?.thumbnail, '저장된 썸네일도 없다: ' + moment.id);
    assert.ok(['TIKTOK', 'INSTAGRAM'].includes(moment.platform), moment.id);
  }
  for (const sample of previewSamples(PREVIEW, '?lt791=1')) {
    assert.ok(!sample.image, '궤도 앞줄 카드도 기본 사진을 쓰지 않는다: ' + sample.id);
    assert.equal(sample.first, false);
  }
  // 실제 브라우저에서 재생 확인한 공개 영상만 쓴다(옛 영상은 삭제됨).
  assert.deepEqual(
    PREVIEW_MOMENTS.filter((m) => m.platform === 'TIKTOK').map((m) => m.mediaMetadata.tiktokId),
    ['7709419447567551775', '7697839765374143745']
  );
});

test('정적 예시 데이터에는 릴스·틱톡 주소가 없다(운영에 섞이지 않는다)', () => {
  const samples = readFileSync(new URL('../src/views/orbit-samples.json', import.meta.url), 'utf8');
  const example = readFileSync(new URL('../public/v41/example.mjs', import.meta.url), 'utf8');
  for (const source of [samples, example]) {
    assert.doesNotMatch(source, /tiktok\.com/);
    assert.doesNotMatch(source, /instagram\.com/);
  }
});

test('첫 화면 앞줄은 체험 모드에서만 그리고 기본 궤도는 건드리지 않는다', () => {
  const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');
  assert.match(orbit, /const previewStripMarkup=previewStrip\.length\?/);
  assert.match(orbit, /const exampleSamples = samples;/);
  assert.match(orbit, /data-lt-preview-play/);
  assert.match(orbit, /lt-preview-mode/);
});

// #791: '스크립트를 불렀다'가 아니라 '재생기가 실제로 보인다'를 확인한다(실제 브라우저).
test('체험 카드 ▶를 누르면 공식 iframe이 화면에 보인다(1440·390)', { timeout: 180000 }, async () => {
  const { existsSync } = await import('node:fs');
  const http = await import('node:http');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const rootPath = fileURLToPath(new URL('../dist/', import.meta.url));
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { return; }
  if (!existsSync(path.join(rootPath, 'v41/home.html'))) return; // 빌드 없는 환경에서는 건너뛴다.
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    let file = path.join(rootPath, decodeURIComponent(u.pathname));
    if (u.pathname === '/v41/' || u.pathname === '/v41' || (u.pathname.startsWith('/v41/') && !path.extname(u.pathname))) file = path.join(rootPath, 'v41/index.html');
    try { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file)); }
    catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const host = 'pv.lovetree-4-0.pages.dev';
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 } });
      await context.route(`https://${host}/**`, async (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === '/api/account') return route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
        if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"state":{"version":1,"trees":[]},"items":[],"shares":[]}' });
        if (u.pathname.startsWith('/auth/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        const local = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`);
        return route.fulfill({ status: local.status, contentType: local.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await local.arrayBuffer()) });
      });
      const page = await context.newPage();
      await page.goto(`https://${host}/v41/?lt791=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      const evalHome = async (fn, arg) => {
        for (const frame of page.frames()) {
          const value = await frame.evaluate(fn, arg).catch(() => null);
          if (value) return value;
        }
        return null;
      };
      const stripCount = await evalHome(() => {
        const root = [...document.querySelectorAll('*')].find((el) => el.shadowRoot)?.shadowRoot;
        return root?.querySelectorAll('.lt-preview-card').length || 0;
      });
      assert.equal(stripCount, 3, width + ': 체험 카드 3장이 없다');
      for (const [id, origin] of [['pv-tt-1', 'tiktok.com'], ['pv-ig-1', 'instagram.com']]) {
        await evalHome((cardId) => {
          const root = [...document.querySelectorAll('*')].find((el) => el.shadowRoot?.querySelector('[data-lt-preview-card="' + cardId + '"]'))?.shadowRoot;
          const button = root?.querySelector('[data-lt-preview-card="' + cardId + '"] [data-lt-preview-play]');
          if (!button) return false;
          button.click();
          return true;
        }, id);
        const player = await evalHome((cardId) => {
          const root = [...document.querySelectorAll('*')].find((el) => el.shadowRoot?.querySelector('[data-lt-preview-card="' + cardId + '"]'))?.shadowRoot;
          const frame = root?.querySelector('[data-lt-preview-card="' + cardId + '"] iframe');
          if (!frame) return null;
          const rect = frame.getBoundingClientRect();
          return { src: frame.src, w: Math.round(rect.width), h: Math.round(rect.height) };
        }, id);
        assert.ok(player, width + '/' + id + ': 재생기 iframe이 없다');
        assert.match(player.src, new RegExp(origin));
        assert.ok(player.w > 0 && player.h > 0, width + '/' + id + ': 재생기 크기가 0이다');
      }
      await context.close();
    }
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
});

test('미리보기 담기 안내는 플랫폼과 영상 번호만 보여 준다', () => {
  assert.equal(QUICK_PREVIEW_NOTICE, '체험 — 실제 담기는 로그인 뒤');
  assert.equal(quickPreviewNoticeText('TIKTOK', '7646985299326749983'), '체험 — 실제 담기는 로그인 뒤 · TIKTOK · 영상 7646985299326749983');
  assert.equal(quickPreviewNoticeText('TIKTOK', ''), '체험 — 실제 담기는 로그인 뒤 · TIKTOK');
  assert.equal(quickPreviewNoticeText(), '체험 — 실제 담기는 로그인 뒤');
});
