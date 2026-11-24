// #1026 첫 화면 첫 프레임 측정 — Playwright, 캐시 비움, 1440·390 × 밤·정원 × 5회.
// 사용: node tools/orbit-perf/1026-first-frame.mjs [결과디렉터리] [--url=http://...]
// --url이 없으면 dist/를 로컬 정적 서버로 띄운다(로컬 빌드 측정).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'orbit-perf-1026';
const external = process.argv.find(a => a.startsWith('--url='))?.slice(6);
const root = path.resolve('dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };

const server = external ? null : createServer(async (req, res) => {
  try {
    let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!f.startsWith(root + path.sep) && f !== root) throw Error();
    if (f.endsWith(path.sep)) f = path.join(f, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
if (server) await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = external || 'http://127.0.0.1:' + server.address().port;

// 모든 프레임(셸 + 화면 iframe)에서 문서 시작 전에 붙는 계측기. 이벤트는 맨 위로 모은다.
function instrument() {
  const TOP = window.top;
  let origin;
  try { origin = TOP.performance.timeOrigin; } catch { origin = performance.timeOrigin; }
  const isTop = window.top === window;
  const ev = [], shifts = [];
  const post = o => { try { TOP.postMessage(Object.assign({ __LT1026: 1 }, o), '*'); } catch {} };
  const push = (n, extra) => {
    const item = Object.assign({ n, t: Math.round((Date.now() - origin) * 10) / 10 }, extra || {});
    ev.push(item); post({ item });
  };
  window.addEventListener('message', e => {
    if (!e.data || !e.data.__LT1026) return;
    if (e.data.shift) shifts.push(e.data.shift); else if (e.data.item) ev.push(e.data.item);
  });
  try {
    new PerformanceObserver(list => {
      for (const en of list.getEntries()) {
        if (en.hadRecentInput) continue;
        const srcs = (en.sources || []).slice(0, 6).map(s => ({
          el: s.node ? (s.node.nodeName + (s.node.id ? '#' + s.node.id : '') + (typeof s.node.className === 'string' && s.node.className.trim() ? '.' + s.node.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) : '?'
        }));
        const sh = { t: Math.round((performance.timeOrigin + en.startTime - origin) * 10) / 10, v: Math.round(en.value * 10000) / 10000, srcs };
        shifts.push(sh); post({ shift: sh });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  const rects = new Map(), seen = new Map();
  const vis = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) >= 0.02;
  };
  // 그림판(canvas)에서는 DOM 카드에 opacity:0이 붙지만 실제로는 캔버스에 그려진다. 카드의 공개 여부는
  // 첫 프레임 표시 클래스·숨김 클래스로 판정한다(수정 전/후 같은 기준).
  const cardVis = el => {
    if (!el || el.classList.contains('off') || el.classList.contains('lt-first-frame') || el.classList.contains('clash')) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const track = (items, now) => {
    for (const { k, el } of items) {
      if (!el) continue;
      const shown = k.startsWith('card') ? cardVis(el) : vis(el);
      const r = el.getBoundingClientRect(), prev = rects.get(k + '|m');
      if (prev && (Math.abs(prev.x - r.x) > 8 || Math.abs(prev.y - r.y) > 8)) push('big-move', { el: k, dx: Math.round(r.x - prev.x), dy: Math.round(r.y - prev.y) });
      rects.set(k + '|m', { x: r.x, y: r.y });
      if (shown) {
        if (!seen.has(k)) seen.set(k, { t: now, x: r.x, y: r.y, counted: false });
        const s = seen.get(k);
        if (!s.counted && now - s.t < 1200 && (Math.abs(r.x - s.x) > 8 || Math.abs(r.y - s.y) > 8)) {
          s.counted = true;
          push('pop-move', { el: k, dx: Math.round(r.x - s.x), dy: Math.round(r.y - s.y), after: Math.round(now - s.t) });
        }
      }
    }
  };
  const tick = () => {
    try {
      const now = Math.round((Date.now() - origin) * 10) / 10;
      if (!isTop) {
        let doc = document;
        try { const f = TOP.document && TOP.document.getElementById('view'); if (f && f.contentDocument) doc = f.contentDocument; } catch {}
        const sr = doc.querySelector('#orbit')?.shadowRoot;
        if (sr) {
          const h1 = sr.querySelector('.center h1') || sr.querySelector('h1');
          if (h1 && h1.textContent.trim() && vis(h1) && !ev.some(e => e.n === 'center-first')) push('center-first', { text: h1.textContent.trim().slice(0, 40) });
          const cards = [...sr.querySelectorAll('button.card')];
          if (!ev.some(e => e.n === 'card-first')) {
            for (const c of cards) {
              const img = c.querySelector('img');
              if (img && img.complete && img.naturalWidth > 0 && cardVis(c)) { push('card-first', { img: (img.getAttribute('src') || '').split('/').pop() }); break; }
            }
          }
          if (!ev.some(e => e.n === 'my-card-first')) {
            const mine = cards.find(c => !c.hasAttribute('data-example') && cardVis(c));
            if (mine) push('my-card-first', {});
          }
          const items = [];
          const center = sr.querySelector('.center');
          if (center) items.push({ k: 'center', el: center });
          cards.slice(0, 14).forEach((c, i) => items.push({ k: 'card' + i, el: c }));
          track(items, now);
        }
      } else {
        const hdr = document.querySelector('header.app-header');
        if (hdr && vis(hdr) && !ev.some(e => e.n === 'header-first')) push('header-first');
        const btns = hdr ? [...hdr.querySelectorAll('button')] : [];
        btns.forEach((b, i) => {
          const r = b.getBoundingClientRect(), k = 'hb' + i, prev = rects.get(k + '|h');
          if (prev && (Math.abs(prev.x - r.x) > 0.5 || Math.abs(prev.y - r.y) > 0.5)) push('header-btn-move', { el: k, dx: Math.round(r.x - prev.x), dy: Math.round(r.y - prev.y) });
          rects.set(k + '|h', { x: r.x, y: r.y });
        });
        track([...(hdr ? [{ k: 'header', el: hdr }] : []), ...btns.map((b, i) => ({ k: 'hb' + i, el: b }))], now);
      }
    } catch {}
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__LT1026 = { ev, shifts };
}

const med = a => { const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2 * 10) / 10; };
const max = a => Math.max(...a);
const combos = [];
for (const state of ['out']) for (const [w, h] of [[1440, 900], [390, 844]]) for (const theme of ['night', 'garden']) combos.push({ state, w, h, theme });

await mkdir(outDir, { recursive: true });
let browser;
const all = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const c of combos) {
    const runs = [];
    for (let run = 0; run < 5; run++) {
      // 새 문맥 = 빈 캐시·빈 저장소. 테마는 문서 시작 전에 넣는다.
      const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 });
      try {
        await ctx.addInitScript(t => { try { localStorage.setItem('lt41.theme', t); } catch {} }, c.theme);
        await ctx.addInitScript(instrument);
        const page = await ctx.newPage();
        await page.goto(base + '/v41/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5200);
        const raw = await page.evaluate(() => ({ ev: window.__LT1026?.ev || [], shifts: window.__LT1026?.shifts || [] }));
        const uniq = [], keys = new Set();
        for (const e of raw.ev) {
          const k = e.n + '|' + e.t + '|' + (e.el || '') + '|' + (e.text || '');
          if (!keys.has(k)) { keys.add(k); uniq.push(e); }
        }
        uniq.sort((a, b) => a.t - b.t);
        const first = n => { const e = uniq.find(x => x.n === n); return e ? e.t : null; };
        const last = n => uniq.filter(x => x.n === n).at(-1) || null;
        const sk = new Set(), sh = [];
        for (const s of raw.shifts) { const k = s.t + '|' + s.v; if (!sk.has(k)) { sk.add(k); sh.push(s); } }
        const bm = last('big-move'), pm = uniq.filter(e => e.n === 'pop-move');
        const cardPm = pm.filter(e => String(e.el).startsWith('card'));
        const gap = first('card-first') !== null && first('center-first') !== null ? Math.round(first('card-first') - first('center-first')) : null;
        runs.push({
          headerFirst: first('header-first'), headerBtnLast: first('header-btn-move') !== null ? (last('header-btn-move') || {}).t : null,
          centerFirst: first('center-first'), cardFirst: first('card-first'), gap,
          lastBigMove: bm ? { t: bm.t, el: bm.el } : null,
          popCount: cardPm.length, headerPopCount: pm.length - cardPm.length,
          popTop: cardPm.sort((a, b) => (Math.abs(b.dx) + Math.abs(b.dy)) - (Math.abs(a.dx) + Math.abs(a.dy))).slice(0, 3).map(p => ({ el: p.el, t: p.t, dx: p.dx, dy: p.dy, after: p.after })),
          cls: Math.round(sh.reduce((a, s) => a + s.v, 0) * 10000) / 10000
        });
      } finally { await ctx.close(); }
    }
    const col = k => runs.map(r => r[k]).filter(v => v !== null && v !== undefined);
    const jank = runs.filter(r => r.gap > 300 || r.popCount > 0).length;
    const row = {
      combo: `${c.w}-${c.theme}`, state: c.state, n: runs.length, runs,
      headerFirst: col('headerFirst'), headerBtnLast: col('headerBtnLast'), centerFirst: col('centerFirst'), cardFirst: col('cardFirst'),
      gap: col('gap'), lastMove: runs.map(r => r.lastBigMove?.t).filter(v => v !== undefined), cls: col('cls'), jank
    };
    all.push(row);
    console.log(JSON.stringify({ ...row, runs: undefined }));
  }
  await writeFile(path.join(outDir, 'results.json'), JSON.stringify(all, null, 2));
  console.log('\n조합 | 항목 | 중앙값/최대값(ms) | 끊김');
  for (const r of all) {
    const fmt = a => a.length ? `${med(a)} / ${max(a)}` : '-';
    console.log(`${r.combo} | 머리줄 ${fmt(r.headerFirst)} | 단추 ${fmt(r.headerBtnLast)} | 글귀 ${fmt(r.centerFirst)} | 카드 ${fmt(r.cardFirst)} | 글귀-카드 ${fmt(r.gap)} | CLS ${fmt(r.cls)} | ${r.jank}/${r.n}`);
  }
} finally {
  await browser?.close();
  if (server) await new Promise(ok => server.close(ok));
}
