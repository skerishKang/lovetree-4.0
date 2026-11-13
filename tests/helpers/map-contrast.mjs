// Canvas colours are measured from a browser screenshot, never from CSS tokens or
// fillStyle/strokeStyle. The probe records geometry only, to locate the pixels.
export function installMapPaintProbe() {
  const proto = CanvasRenderingContext2D.prototype;
  let path = [];
  const active = (ctx) => ctx.canvas.id === 'stage';
  const point = (ctx, x, y) => {
    const m = ctx.getTransform(), d = ctx.canvas.width / ctx.canvas.clientWidth || 1;
    return { x: (m.a * x + m.c * y + m.e) / d, y: (m.b * x + m.d * y + m.f) / d };
  };
  const wrap = (name, before) => {
    const fn = proto[name];
    proto[name] = function (...args) { if (active(this)) before.call(this, args); return fn.apply(this, args); };
  };
  window.__mapPaint = { texts: [], paths: [] };
  wrap('fillRect', function ([x, y, w, h]) {
    if (x === 0 && y === 0 && w >= this.canvas.clientWidth && h >= this.canvas.clientHeight) window.__mapPaint = { texts: [], paths: [] };
  });
  wrap('beginPath', () => { path = []; });
  wrap('moveTo', function ([x, y]) { path.push(point(this, x, y)); });
  wrap('lineTo', function ([x, y]) { path.push(point(this, x, y)); });
  wrap('arc', function ([x, y, r, from, to]) {
    for (let i = 0; i <= 64; i++) { const a = from + (to - from) * i / 64; path.push(point(this, x + Math.cos(a) * r, y + Math.sin(a) * r)); }
  });
  wrap('ellipse', function ([x, y, rx, ry, rot, from, to]) {
    for (let i = 0; i <= 96; i++) { const a = from + (to - from) * i / 96, px = Math.cos(a) * rx, py = Math.sin(a) * ry; path.push(point(this, x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot))); }
  });
  for (const operation of ['fill', 'stroke']) wrap(operation, function () {
    const stack = new Error().stack || '';
    const role = /drawRings/.test(stack) ? 'guide-ring' : /drawEdge/.test(stack) ? (operation === 'fill' ? 'arrow' : 'line') : null;
    if (role && path.length) window.__mapPaint.paths.push({ role, points: path.slice(), closed: operation === 'fill' });
  });
  wrap('fillText', function ([text, x, y]) {
    const p = point(this, x, y), m = this.measureText(text);
    window.__mapPaint.texts.push({ text: String(text), x: p.x, y: p.y, font: this.font, align: this.textAlign, baseline: this.textBaseline,
      left: p.x - m.actualBoundingBoxLeft, right: p.x + m.actualBoundingBoxRight, top: p.y - m.actualBoundingBoxAscent, bottom: p.y + m.actualBoundingBoxDescent,
      role: /drawHub/.test(new Error().stack || '') ? 'hub-number' : 'label' });
  });
}

// Called in the map frame with an actual Playwright screenshot PNG. The same
// pixel sampler is used by the executable test and the evidence report.
export async function measureMapPixelsInPage(png) {
  const img = new Image(); img.src = png; await img.decode();
  const scratch = document.createElement('canvas'); scratch.width = img.width; scratch.height = img.height;
  const sc = scratch.getContext('2d', { willReadFrequently: true }); sc.drawImage(img, 0, 0);
  const pixels = sc.getImageData(0, 0, img.width, img.height).data;
  const stage = document.getElementById('stage'), scale = img.width / stage.clientWidth;
  const rgb = (x, y) => { const i = (Math.max(0, Math.min(img.height - 1, Math.round(y * scale))) * img.width + Math.max(0, Math.min(img.width - 1, Math.round(x * scale)))) * 4; return [pixels[i], pixels[i + 1], pixels[i + 2]]; };
  const lum = (c) => c.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const hex = (c) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const quantile = (values, q) => values.slice().sort((a, b) => a.ratio - b.ratio)[Math.min(values.length - 1, Math.floor(values.length * q))];
  const overlays = [...document.querySelectorAll('.topbar button,.mode-pill,.hero,.legend,.controls,.detail.open,.route-status.show,.toast.show,.edge-tip.show,.mobile-ribbon,.lt-moment-picker')].filter(el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility === 'visible' && Number(s.opacity) > .01;
  }).map(el => el.getBoundingClientRect());
  const visible = (x, y) => {
    if (x < 3 || y < 3 || x >= stage.clientWidth - 3 || y >= stage.clientHeight - 3) return false;
    if (overlays.some(r => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1)) return false;
    const el = document.elementFromPoint(x, y);
    return el === stage || el?.classList.contains('paper-noise');
  };
  // The backdrop is a vertical gradient. Use the modal visible background in
  // nearby rows, rather than a single edge pixel (ellipse crossings) or a row
  // median (a long horizontal edge can cover over half a narrow viewport).
  const backdrops = new Map();
  const backdrop = (y) => {
    const row = Math.round(y * scale);
    if (!backdrops.has(row)) {
      const bins = new Map();
      for (const dy of [-3, 0, 3]) for (let x = 3; x < stage.clientWidth - 3; x += 11) if (visible(x, y + dy)) {
        const c = rgb(x, y + dy), key = c.map(v => Math.round(v / 4)).join(',');
        if (!bins.has(key)) bins.set(key, []); bins.get(key).push(c);
      }
      const samples = [...bins.values()].sort((a, b) => b.length - a.length)[0] || [rgb(2, y)];
      backdrops.set(row, [0, 1, 2].map(i => samples.map(s => s[i]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]));
    }
    return backdrops.get(row);
  };
  const sample = (x, y, bg = backdrop(y)) => ({ ratio: ratio(rgb(x, y), bg), fg: hex(rgb(x, y)), bg: hex(bg), x, y });
  const rows = [];
  const add = (role, id, samples, q = .85, why = null) => {
    if (!samples.length) { rows.push({ role, id, ratio: 0, fg: 'missing', bg: 'missing', samples: 0, why }); return; }
    const r = quantile(samples, q); rows.push({ role, id, ratio: Math.round(r.ratio * 100) / 100, fg: r.fg, bg: r.bg, samples: samples.length });
  };
  const mask = document.createElement('canvas'); mask.width = img.width; mask.height = img.height;
  // Keep the document's Korean language and font-synthesis rules. A detached
  // canvas otherwise picks different fallback glyph metrics on Windows.
  mask.lang = document.documentElement.lang;
  mask.style.cssText = 'position:absolute;left:-10000px;top:0;pointer-events:none';
  document.body.append(mask);
  // The map context uses alpha:false. Match that here so Chromium uses the
  // same opaque-canvas glyph rasterisation (transparent masks use different
  // hinting/subpixel coverage and can mistake surrounding pixels for ink).
  const mc = mask.getContext('2d', { alpha: false, willReadFrequently: true });
  const textBounds = [];
  for (const [i, t] of window.__mapPaint.texts.entries()) {
    if (!visible((t.left + t.right) / 2, (t.top + t.bottom) / 2)) continue;
    mc.setTransform(1, 0, 0, 1, 0, 0); mc.fillStyle = '#fff'; mc.fillRect(0, 0, mask.width, mask.height);
    mc.setTransform(scale, 0, 0, scale, 0, 0); mc.font = t.font; mc.textAlign = t.align; mc.textBaseline = t.baseline; mc.fillStyle = '#000'; mc.fillText(t.text, t.x, t.y);
    const x0 = Math.max(0, Math.floor(t.left * scale)), y0 = Math.max(0, Math.floor(t.top * scale));
    const w = Math.min(mask.width - x0, Math.ceil((t.right - t.left + 1) * scale)), h = Math.min(mask.height - y0, Math.ceil((t.bottom - t.top + 1) * scale));
    if (w <= 0 || h <= 0) continue;
    const data = mc.getImageData(x0, y0, w, h).data, samples = [];
    // 표본이 하나도 없을 때 까닭을 남긴다(글자 속이 안 그려졌는지, 가려졌는지 — 실패 글에 그대로 나온다).
    const why = { box: [x0, y0, w, h], font: t.font, darkest: 255, ink: 0, hidden: 0 };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const mi = (y * w + x) * 4, v = Math.max(data[mi], data[mi + 1], data[mi + 2]);
      if (v < why.darkest) why.darkest = v;
      if (v > 10) continue; // opaque glyph interiors, not antialias edges
      why.ink++;
      const px = (x0 + x) / scale, py = (y0 + y) / scale;
      if (!visible(px, py)) { why.hidden++; continue; }
      // Hub numbers sit on a coloured/white disc. The centre of its upper
      // inner rim is a rendered background pixel, away from the two digits.
      const bg = t.role === 'hub-number' ? rgb(t.x, t.y - 9) : backdrop(py);
      samples.push(sample(px, py, bg));
    }
    add(t.role, `${i}:${t.text}`, samples, .1, why); textBounds.push(t);
  }
  const dots = window.__lt.dots(), hubs = window.__lt.hubs();
  for (const d of dots) {
    if (!visible(d.x, d.y)) continue;
    const samples = [];
    for (let y = -d.r; y <= d.r; y += .5) for (let x = -d.r; x <= d.r; x += .5) {
      if (x * x + y * y > (d.r + .3) ** 2) continue;
      if (visible(d.x + x, d.y + y)) samples.push(sample(d.x + x, d.y + y));
    }
    // A selected dot may have a light centre; its visible coloured boundary
    // is the non-text indicator, so retain the strongest quarter of the disc.
    add(d.first ? 'first-dot' : 'dot', d.id, samples, .9);
    if (d.first) for (const offset of [5, 9]) {
      const ring = [];
      for (let a = 0; a < 64; a++) {
        const theta = a * Math.PI / 32, x = d.x + Math.cos(theta) * (d.r + offset), y = d.y + Math.sin(theta) * (d.r + offset);
        if (!visible(x, y)) continue;
        const near = [];
        for (let dx = -.5; dx <= .5; dx += .5) for (let dy = -.5; dy <= .5; dy += .5) near.push(sample(x + dx, y + dy));
        ring.push(quantile(near, 1));
      }
      if (ring.length) add(offset === 5 ? 'first-inner-ring' : 'first-ring', d.id, ring, .5);
    }
  }
  const clearPoint = (p) => visible(p.x, p.y) && ![...dots, ...hubs].some(d => Math.hypot(p.x - d.x, p.y - d.y) < d.r + (d.first ? 12 : 3)) && !textBounds.some(t => p.x > t.left - 2 && p.x < t.right + 2 && p.y > t.top - 2 && p.y < t.bottom + 2);
  for (const [i, p] of window.__mapPaint.paths.entries()) {
    const samples = [];
    const points = p.closed ? [{ x: p.points.reduce((n, q) => n + q.x, 0) / p.points.length, y: p.points.reduce((n, q) => n + q.y, 0) / p.points.length }] : p.points.slice(1).map((q, j) => ({ x: (q.x + p.points[j].x) / 2, y: (q.y + p.points[j].y) / 2 }));
    for (const q of points) {
      if (!clearPoint(q)) continue;
      const near = [];
      for (let dx = -.5; dx <= .5; dx += .5) for (let dy = -.5; dy <= .5; dy += .5) near.push(sample(q.x + dx, q.y + dy));
      samples.push(quantile(near, 1));
    }
    // Completely occluded/offscreen paths are not visible content. Every
    // remaining path gets its own result; none can hide behind another path's
    // passing result. Median cross-section cores avoid a crossing/shadow outlier.
    if (samples.length) add(p.role, String(i), samples, .5);
  }
  mask.remove();
  return { rows, dimensions: [img.width, img.height], counts: { text: window.__mapPaint.texts.length, paths: window.__mapPaint.paths.length, dots: dots.length } };
}

export function measureMapDOMInPage() {
  const parse = (s) => [...String(s).matchAll(/rgba?\(([^)]+)\)/g)].map(m => { const a = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [...a.slice(0, 3), a[3] ?? 1]; });
  const over = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])).concat(1);
  const lum = c => c.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const stage = document.getElementById('stage'), canvas = stage.getContext('2d'), d = stage.width / stage.clientWidth;
  const roles = [
    ['toolbar', '.topbar button, #modePill'], ['hint', '.hero p'],
    ['legend', '.legend h3, .legend-row'], ['explorer', '.controls h3, .controls button'],
    ['detail', '.detail.open .detail-kicker, .detail.open h2, .detail.open .chip, .detail.open .detail-block span, .detail.open .detail-block p, .detail.open button'],
    ['ribbon', '.mobile-ribbon button'], ['route', '.route-status.show b, .route-status.show span'], ['tooltip', '.edge-tip.show'],
    ['picker', '.lt-moment-picker label>span,.lt-moment-picker select,.lt-moment-picker button']
  ];
  const rows = [];
  for (const [role, selector] of roles) for (const el of document.querySelectorAll(selector)) {
    if (!el.textContent.trim()) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight || cs.visibility !== 'visible') continue;
    const chain = []; let opacity = 1;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none') { opacity = 0; break; } opacity *= Number(s.opacity); chain.unshift(p); }
    if (opacity <= 0) continue;
    const px = Math.max(0, Math.min(stage.width - 1, Math.floor((r.left + r.width / 2) * d))), py = Math.max(0, Math.min(stage.height - 1, Math.floor((r.top + r.height / 2) * d)));
    const base = [...canvas.getImageData(px, py, 1, 1).data].slice(0, 3).concat(1);
    let backgrounds = [base];
    for (const p of chain) {
      // #stage is opaque and covers body/.app backgrounds.
      if (p === document.body || p.classList.contains('app')) continue;
      const s = getComputedStyle(p), colour = parse(s.backgroundColor).filter(c => c[3] > 0), gradient = parse(s.backgroundImage);
      for (const layer of [colour, gradient]) if (layer.length) backgrounds = backgrounds.flatMap(b => layer.map(c => over(c, b)));
    }
    const text = parse(cs.color)[0]; if (!text) continue;
    text[3] *= opacity;
    let worst = null;
    for (const bg of backgrounds) { const fg = over(text, bg), value = ratio(fg, bg); if (!worst || value < worst.ratio) worst = { ratio: value, fg: hex(fg), bg: hex(bg) }; }
    rows.push({ role, id: el.id || `${el.tagName.toLowerCase()}.${el.className}`, text: el.textContent.trim(), ratio: Math.round(worst.ratio * 100) / 100, fg: worst.fg, bg: worst.bg });
  }
  return rows;
}

export async function measureMap(frame) {
  const screenshot = await frame.locator('#stage').screenshot({ animations: 'disabled' });
  const canvas = await frame.evaluate(measureMapPixelsInPage, `data:image/png;base64,${screenshot.toString('base64')}`);
  const dom = await frame.evaluate(measureMapDOMInPage);
  return { canvas, dom, screenshot };
}

export function worstMapRoles(results) {
  const map = new Map();
  for (const result of results) for (const [kind, rows] of [['canvas', result.canvas.rows], ['dom', result.dom]]) for (const row of rows) {
    const key = `${kind}:${row.role}`, before = map.get(key);
    if (!before || row.ratio < before.ratio) map.set(key, { kind, ...row });
  }
  return [...map.values()];
}


// 지도 화면이 멈출 때까지 기다린다(확대·이동 연출이 끝나 점·묶음 좌표가 연속 3번 같을 때).
// 고정 대기(100~180ms)는 느린 CI에서 연출이 끝나기 전에 좌표를 읽어 클릭이 빗나가거나 캡처가 비었다(2026-11-13 간헐 실패).
export async function settleMap(frame, { timeout = 6000, gap = 90 } = {}) {
  const snap = () => frame.evaluate(() => {
    const lt = window.__lt; if (!lt) return '';
    const pts = [...(lt.hubs?.() || []), ...(lt.dots?.() || [])];
    return pts.map(n => `${Math.round(n.x * 2)},${Math.round(n.y * 2)}`).join('|') + '#' + (lt.state?.mode || '');
  });
  const start = Date.now(); let prev = await snap(), same = 0;
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, gap));
    const cur = await snap();
    if (cur && cur === prev) { if (++same >= 3) return true; } else { same = 0; prev = cur; }
  }
  return false;
}
