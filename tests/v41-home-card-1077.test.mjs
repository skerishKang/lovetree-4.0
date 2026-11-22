// #1077: 390 로그아웃 첫 화면의 떠다니는 예시 카드가 바닥 링크·새 소식 카드를 가리지 않는지 실제 움직임으로 잰다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';

const REQUIRE = process.env.LT_HOME_CARD_1077_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = '화면 시험용 브라우저가 없어 건너뜀';
} catch { skip = '화면 시험용 브라우저가 없어 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 건너뜀';

const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

// 카드 사각형(이미지 꾸밈 배율 제거)과 바닥 구역, 교차 면적을 한 문장으로 둔다(1018 판정과 같은 계산).
const SAMPLE = () => {
  const root = document.getElementById('orbit')?.shadowRoot;
  const all = root ? [...root.querySelectorAll('button.card')] : [];
  const rectOf = (c) => {
    const inner = c.querySelector('.surface img') || c.querySelector('.surface') || c;
    const r = inner.getBoundingClientRect();
    let k = 1; const t = getComputedStyle(inner).transform;
    if (t && t !== 'none') { const m = t.match(/^matrix\(([^)]+)\)/); if (m) { const v = m[1].split(',').map(Number); k = Math.hypot(v[0], v[1]) || 1; } }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = r.width / k, h = r.height / k;
    return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
  };
  const shell = parent.document, fr = frameElement?.getBoundingClientRect(), ox = fr?.left || 0, oy = fr?.top || 0;
  const zone = (el) => {
    if (!el) return null;
    const cs = parent.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { l: r.left - ox - 12, t: r.top - oy - 12, r: r.right - ox + 12, b: r.bottom - oy + 12 } : null;
  };
  const zones = [zone(shell.querySelector('.home-links')), zone(shell.getElementById('updates-card'))].filter(Boolean);
  const hit = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const visible = all.filter((c) => { const cs = getComputedStyle(c); return cs.display !== 'none' && cs.visibility !== 'hidden' && !c.classList.contains('off'); });
  // 바닥 자리를 지나는 동안 투명해진 카드는 글자를 덮지 않는다 — '가리는 카드'만 교차로 센다.
  const opaque = visible.filter((c) => Number(getComputedStyle(c).opacity) > 0.05);
  let pairs = 0;
  for (const box of opaque.map(rectOf)) for (const z of zones) if (hit(box, z) > 1) pairs += 1;
  const first = opaque[0] ? rectOf(opaque[0]) : null;
  return { cards: all.length, visible: visible.length, opaque: opaque.length, zones: zones.length, pairs, firstCenter: first ? [Math.round((first.l + first.r) / 2), Math.round((first.t + first.b) / 2)] : null };
};

test('#1077 390 로그아웃 첫 화면의 떠다니는 카드는 바닥 링크를 가리지 않는다', { skip: skip || undefined, timeout: 300000 }, async (t) => {
  if (skip) { t.skip(skip); return; }
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ['night', 'garden']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
      try {
        await ctx.addInitScript((v) => { try { localStorage.setItem('lt41.theme', v); } catch {} }, theme);
        await ctx.route('**://i.ytimg.com/**', THUMB);
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/#home`, { waitUntil: 'load' });
        await page.waitForFunction(() => { const c = document.getElementById('updates-card'); return c && !c.hidden && c.getBoundingClientRect().width > 0; }, null, { timeout: 15000 });
        await page.waitForTimeout(1500);
        let frame = null;
        for (const f of page.frames()) {
          if (f === page.mainFrame()) continue;
          const ok = await f.evaluate(() => document.documentElement.getBoundingClientRect().width > 0 && !!document.getElementById('orbit')?.shadowRoot?.querySelector('button.card')).catch(() => false);
          if (ok) { frame = f; break; }
        }
        assert.ok(frame, `${theme}: 첫 화면 프레임을 찾는다`);
        await frame.waitForFunction(() => { const r = document.getElementById('orbit')?.shadowRoot; return r && [...r.querySelectorAll('button.card')].some((c) => !c.classList.contains('off')); }, null, { timeout: 15000 });

        // 빈손 통과 금지: 카드를 바닥 구역을 가장 많이 지나는 위상에 놓아 경로 자체가 겹치는지 확인한다.
        const crossed = await frame.evaluate(() => {
          const root = document.getElementById('orbit').shadowRoot;
          const all = [...root.querySelectorAll('button.card')];
          const zones = [parent.document.querySelector('.home-links'), parent.document.getElementById('updates-card')].map((el) => {
            if (!el) return null; const r = el.getBoundingClientRect(); const fr = frameElement.getBoundingClientRect();
            return { l: r.left - fr.left - 12, t: r.top - fr.top - 12, r: r.right - fr.left + 12, b: r.bottom - fr.top + 12 };
          }).filter(Boolean);
          const hit = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
          let max = 0;
          // #1086: 공전은 WAAPI가 아니라 rAF에서 위치를 직접 쓴다 — 실제 그리기 경로로 48위상을 훑는다.
          if (window.__LT_ORBIT_TEST__) {
            for (let k = 0; k < 48; k++) {
              window.__LT_ORBIT_TEST__.seek(k / 48);
              for (const c of all) {
                const el = c.querySelector('.surface img') || c.querySelector('.surface') || c;
                const r = el.getBoundingClientRect(); let scale = 1; const t = getComputedStyle(el).transform;
                if (t && t !== 'none') { const m = t.match(/^matrix\(([^)]+)\)/); if (m) { const v = m[1].split(',').map(Number); scale = Math.hypot(v[0], v[1]) || 1; } }
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = r.width / scale, h = r.height / scale;
                const box = { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
                max = Math.max(max, zones.reduce((n, z) => n + hit(box, z), 0));
              }
            }
            window.__LT_ORBIT_TEST__.restore();
          }
          return Math.round(max);
        });
        assert.ok(crossed > 0, `${theme}: 궤도 경로가 바닥 자리를 지난다(최대 교차 ${crossed}px²) — 빈손 통과가 아니다`);

        const samples = [];
        for (let i = 0; i < 7; i += 1) { samples.push(await frame.evaluate(SAMPLE)); if (i < 6) await page.waitForTimeout(500); }
        const total = samples.reduce((n, s) => n + s.pairs, 0);
        const moved = samples[0].firstCenter && samples[6].firstCenter && Math.hypot(samples[0].firstCenter[0] - samples[6].firstCenter[0], samples[0].firstCenter[1] - samples[6].firstCenter[1]) > 3;
        console.log('#1077', theme, JSON.stringify({ crossed, total, samples: samples.map((s) => ({ pairs: s.pairs, visible: s.visible, zones: s.zones })), moved }));
        assert.ok(samples.every((s) => s.zones === 2 && s.visible >= 9 && s.opaque > 0), `${theme}: 바닥 링크·새 소식 카드가 보이는 자리에서 카드 9장 이상을 유지하고 잰다: ${JSON.stringify(samples[0])}`);
        assert.ok(moved, `${theme}: 3초 동안 카드가 움직인다`);
        assert.equal(total, 0, `${theme}: 3초×0.5초 간격 보이는 카드×바닥 자리 교차 ${total}쌍`);
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.close(); }
});