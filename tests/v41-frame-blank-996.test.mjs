// #996: 화면을 600ms 안에 다시 바꾸면 가운데 무대가 about:blank로 비어 굳던 것.
// 화면 교대 뒤 600ms 지연 비우기 타이머가, 그 사이 다시 보이는 장이 된 프레임까지 비우던 자리다
// (shell/screens.mjs). 전환이 보이자마자 0·100·300·500ms 뒤에 다시 전환해도, 다시 전환한 화면이
// 실제로 보이고 1초 뒤에도 보이는 프레임은 빈 화면이 아니어야 하며 본문에 내용이 있어야 한다.
// 로고(서재→첫 화면)와 보기 이동(서재→책) 두 흐름, 1440·390 두 폭에서 잰다.
// 첫 화면은 vite 번들이라 dist가 있어야 돈다 — 없으면 이유를 적고 건너뛴다.
// LT_FRAME_BLANK_REQUIRE=1(CI 화면 잡)에서는 건너뜀=실패.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { waitForShownScreen } from './helpers/visible-frame.mjs';

const REQUIRE = process.env.LT_FRAME_BLANK_REQUIRE === '1';
const DIST_HOME = new URL('../dist/v41/home.html', import.meta.url);
let chromium, skip = '';
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 빠른 재전환 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 빠른 재전환 시험을 건너뜀'; }
if (!REQUIRE && !skip && !existsSync(DIST_HOME)) skip = '빌드 결과가 없어 빠른 재전환 시험을 건너뜀(npm run build 뒤 실행)';

// 지금 보이는 프레임의 주소·본문 내용. 빈 장(about:blank)이면 본문이 비어 있다.
// 첫 화면처럼 그림자 DOM·canvas로 그리는 화면은 innerText가 비어 있을 수 있어 그림자 속 내용도 함께 센다.
const shownState = page => page.evaluate(() => {
  const frame = [...document.querySelectorAll('#view, #view-next')].find(f => !f.hidden && f.getClientRects().length > 0);
  let href = '', path = '', kids = -1, text = -1, shadowKids = 0, media = 0;
  try {
    href = frame?.contentWindow?.location?.href || '';
    path = frame?.contentWindow?.location?.pathname || '';
    const d = frame?.contentDocument;
    kids = d?.body?.children?.length ?? -1;
    text = (d?.body?.innerText || '').trim().length;
    const walk = root => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { shadowKids += el.shadowRoot.children.length; walk(el.shadowRoot); }
        if (['CANVAS', 'IMG', 'SVG'].includes(el.tagName)) media++;
      }
    };
    if (d?.body) walk(d.body);
  } catch {}
  return { href, path, kids, text, shadowKids, media, hash: location.hash };
});

test('#996 빠른 재전환(0·100·300·500ms) 뒤 보이는 무대는 빈 화면이 아니다 — 1440·390', { skip: REQUIRE ? false : (skip || 'LT_FRAME_BLANK_REQUIRE=1 일 때 실행'), timeout: 240000 }, async () => {
  assert.ok(chromium && !skip, '브라우저 준비 실패: ' + (skip || '알 수 없음') + ' (REQUIRE=1에서는 건너뜀=실패)');
  assert.ok(existsSync(DIST_HOME), '빌드 결과(dist/v41/home.html)가 없다 — npm run build 뒤 실행(REQUIRE=1에서는 건너뜀=실패)');
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      for (const delay of [0, 100, 300, 500]) {
        for (const flow of ['logo', 'view']) {
          const page = await browser.newPage({ viewport: { width, height } });
          page.on('pageerror', e => errors.push(String(e)));
          const label = `${width}px·${delay}ms·${flow === 'logo' ? '서재→로고→첫 화면' : '서재→책'}`;
          try {
            await page.goto(`${origin}/v41/`, { waitUntil: 'load' });
            await waitForShownScreen(page, { path: 'home\\.html' }, 20000);
            await page.evaluate(() => { location.hash = '#shelf'; });
            await waitForShownScreen(page, { path: 'track32-bookshelf', hash: '#shelf' }, 10000);
            // 서재가 보이자마자 delay ms 뒤에 다시 전환한다(600ms 비우기 창 안).
            if (delay) await page.waitForTimeout(delay);
            if (flow === 'logo') await page.click('.brand');
            else await page.evaluate(() => { location.hash = '#book'; });
            // 다시 전환한 화면이 실제로 보여야 한다 — 빈 장으로 굳으면 여기서 멈춘다.
            const want = flow === 'logo' ? { path: 'home\\.html', hash: '#home' } : { path: 'track59-sketchbook', hash: '#book' };
            try {
              await waitForShownScreen(page, want, 8000);
            } catch {
              throw new Error(label + ' — 다시 전환한 화면이 보이지 않는다(빈 무대 굳음): ' + JSON.stringify(await shownState(page)));
            }
            // 보인 뒤 1초가 지나도 빈 화면으로 굳지 않고 본문에 내용이 있어야 한다.
            await page.waitForTimeout(1000);
            const st = await shownState(page);
            assert.notEqual(st.href, 'about:blank', label + ' — 보이는 프레임이 빈 화면으로 굳었다');
            assert.ok(st.kids > 0 && (st.text > 0 || st.shadowKids > 0 || st.media > 0), label + ' — 본문에 내용이 없다: ' + JSON.stringify(st));
          } finally {
            await page.close();
          }
        }
      }
    }
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally {
    await browser.close();
    server.close();
  }
});
