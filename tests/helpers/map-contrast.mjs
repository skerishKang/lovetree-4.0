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
  // #628: 재그리기 판정은 '세대 번호'로 한다 — 예전에는 그리기 기록 전체(글자·경로)를 문자열로 만들어
  // 두 번 주고받았다. 캔버스를 통째로 지우는 순간이 곧 새 그리기의 시작이므로 그때 번호를 올리면 충분하다.
  window.__mapPaint = { gen: 0, texts: [], paths: [] };
  wrap('fillRect', function ([x, y, w, h]) {
    if (x === 0 && y === 0 && w >= this.canvas.clientWidth && h >= this.canvas.clientHeight) {
      window.__mapPaint = { gen: (window.__mapPaint.gen || 0) + 1, texts: [], paths: [] };
    }
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

// Called in the map frame with an actual Playwright screenshot PNG and the overlay rects captured
// right BEFORE that screenshot. The same pixel sampler is used by the executable test and the evidence report.
export async function measureMapPixelsInPage([png, overlaysArg]) {
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
  // 겹침 사각형은 스크린샷 직전(overlayRectsInPage)에 잰 것을 넘겨 받는다. 점을 누르면 고정되는
  // '연결 이유' 말풍선(3.2초)·토스트(2.3초)가 스크린샷 뒤에 사라지면, 겹침 계산이 사라진 뒤에
  // 실행되어 가려진 어두운 패널 픽셀을 선 색으로 오인했다(2026-11-14 실측 — #591).
  // 스크린샷에는 토스트가 남아 있고 그 아래 지도는 backdrop-filter로 뿌옇다 — 좌표와 픽셀의
  // 시점을 맞추지 않으면 뿌연 픽셀을 가리개 없이 재어 line(43) 1.08:1 < 3 가 나왔다(#591 실측).
  // #628: 가림 판정을 elementFromPoint 에서 '겹침 격자'로 바꿨다. 표본마다 히트 테스트를 하면(글자 속 픽셀·
  // 점 둘레·선 중간점 — 재기 한 번에 수만 번) 재기 시간의 대부분이 여기서 나왔다(실측 1,517ms/회).
  // 겹치는 요소의 사각형은 스크린샷 직전에 이미 재 두므로(overlayRectsInPage), 그 사각형을 2px 격자에
  // 한 번만 칠해 두고 표본은 격자만 본다. 가리는 요소의 범위는 예전보다 넓어지기만 한다(더 보수적).
  const CELL = 2, cw = stage.clientWidth, ch = stage.clientHeight;
  const gw = Math.ceil(cw / CELL) + 1, gh = Math.ceil(ch / CELL) + 1;
  const cover = new Uint8Array(gw * gh);
  {
    const origin = stage.getBoundingClientRect();
    for (const r of overlaysArg || []) {
      const l = r.left - origin.left, t = r.top - origin.top, rr = r.right - origin.left, b = r.bottom - origin.top;
      const x0 = Math.max(0, Math.floor((l - 1) / CELL)), x1 = Math.min(gw - 1, Math.ceil((rr + 1) / CELL));
      const y0 = Math.max(0, Math.floor((t - 1) / CELL)), y1 = Math.min(gh - 1, Math.ceil((b + 1) / CELL));
      for (let y = y0; y <= y1 && y < gh; y++) cover.fill(1, y * gw + x0, y * gw + x1 + 1);
    }
  }
  const inside = (x, y) => x >= 3 && y >= 3 && x < cw - 3 && y < ch - 3;
  const covered = (x, y) => cover[Math.min(gh - 1, Math.floor(y / CELL)) * gw + Math.min(gw - 1, Math.floor(x / CELL))] === 1;
  const visible = (x, y) => inside(x, y) && !covered(x, y);
  // 배경색 행 훑기도 같은 격자를 쓴다(예전에는 사각형 목록을 매 표본마다 훑었다).
  const visibleRect = visible;
  // The backdrop is a vertical gradient. Use the modal visible background in
  // nearby rows, rather than a single edge pixel (ellipse crossings) or a row
  // median (a long horizontal edge can cover over half a narrow viewport).
  const backdrops = new Map();
  const backdrop = (y) => {
    const row = Math.round(y * scale);
    if (!backdrops.has(row)) {
      const bins = new Map();
      for (const dy of [-3, 0, 3]) for (let x = 3; x < stage.clientWidth - 3; x += 11) if (visibleRect(x, y + dy)) {
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
  const mask = document.createElement('canvas');
  // Keep the document's Korean language and font-synthesis rules. A detached
  // canvas otherwise picks different fallback glyph metrics on Windows.
  mask.lang = document.documentElement.lang;
  mask.style.cssText = 'position:absolute;left:-10000px;top:0;pointer-events:none';
  document.body.append(mask);
  // The map context uses alpha:false. Match that here so Chromium uses the
  // same opaque-canvas glyph rasterisation (transparent masks use different
  // hinting/subpixel coverage and can mistake surrounding pixels for ink).
  let mc = null, maskW = 0, maskH = 0;
  // 각 글자마다 상자 크기의 마스크를 새로 만든다(예전에는 전체 캔버스를 글자마다 흰 칠해 2880×1800 ×
  // 글자 수만큼 다시 칠했다). 상자 밖은 어차피 읽지 않으므로 읽는 픽셀은 완전히 같다.
  const maskFor = (w, h) => {
    if (mc && maskW === w && maskH === h) { mc.setTransform(1, 0, 0, 1, 0, 0); mc.fillStyle = '#fff'; mc.fillRect(0, 0, w, h); return mc; }
    mask.width = w; mask.height = h; maskW = w; maskH = h;
    mc = mask.getContext('2d', { alpha: false, willReadFrequently: true });
    mc.fillStyle = '#fff'; mc.fillRect(0, 0, w, h);
    return mc;
  };
  const textBounds = [];
  for (const [i, t] of window.__mapPaint.texts.entries()) {
    if (!visible((t.left + t.right) / 2, (t.top + t.bottom) / 2)) continue;
    const x0 = Math.max(0, Math.floor(t.left * scale)), y0 = Math.max(0, Math.floor(t.top * scale));
    const w = Math.min(img.width - x0, Math.ceil((t.right - t.left + 1) * scale)), h = Math.min(img.height - y0, Math.ceil((t.bottom - t.top + 1) * scale));
    if (w <= 0 || h <= 0) continue;
    const mc = maskFor(w, h);
    mc.setTransform(scale, 0, 0, scale, -x0, -y0); mc.font = t.font; mc.textAlign = t.align; mc.textBaseline = t.baseline; mc.fillStyle = '#000'; mc.fillText(t.text, t.x, t.y);
    const data = mc.getImageData(0, 0, w, h).data, samples = [];
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
    let samples = [];
    // #951 ③: 점 자리에 사진(작은 원)이 있으면 사진 속 색 대신 그 점의 테두리 선(점 색)을 잰다 —
    // 사진 자체는 대비 보장 대상이 아니다(사진은 임의 색). 겹침 판정은 점 원으로 그대로 둔다.
    if (d.thumb && d.tr) {
      for (let a = 0; a < 96; a++) {
        const theta = a * Math.PI / 48;
        for (const rr of [d.tr, d.tr - 0.3, d.tr + 0.3]) {
          const x = d.x + Math.cos(theta) * rr, y = d.y + Math.sin(theta) * rr;
          if (visible(x, y)) samples.push(sample(x, y));
        }
      }
    } else {
      for (let y = -d.r; y <= d.r; y += .5) for (let x = -d.r; x <= d.r; x += .5) {
        if (x * x + y * y > (d.r + .3) ** 2) continue;
        if (visible(d.x + x, d.y + y)) samples.push(sample(d.x + x, d.y + y));
      }
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
  // #601: 점 썸네일(이름표 앞 16px 사진)도 점과 같은 불투명 요소다 — 사진 뒤를 지나는 선은 가린 것으로 본다.
  const thumbRects = (typeof window !== 'undefined' && window.__lt?.thumbRects?.()) || [];
  // #628: 선 위의 점을 고를 때 점·이름표·썸네일과 겹치는지 확인한다. 예전에는 표본마다 목록 전체를 훑었다
  // (이름표 130여 개 × 선 위 점 수천 개 = 100만 번 비교, 재기 시간의 절반 이상). 같은 판정을 격자에 한 번
  // 칠해 두고 표본은 격자만 본다 — 격자 칸 2px 이라 경계 오차는 1px 안쪽이다.
  const block = new Uint8Array(gw * gh);
  const markRect = (l, t, r, b) => {
    const x0 = Math.max(0, Math.floor(l / CELL)), x1 = Math.min(gw - 1, Math.ceil(r / CELL));
    const y0 = Math.max(0, Math.floor(t / CELL)), y1 = Math.min(gh - 1, Math.ceil(b / CELL));
    for (let y = y0; y <= y1; y++) block.fill(1, y * gw + x0, y * gw + x1 + 1);
  };
  const markCircle = (cx, cy, rad) => {
    const x0 = Math.max(0, Math.floor((cx - rad - 1) / CELL)), x1 = Math.min(gw - 1, Math.ceil((cx + rad + 1) / CELL));
    const y0 = Math.max(0, Math.floor((cy - rad - 1) / CELL)), y1 = Math.min(gh - 1, Math.ceil((cy + rad + 1) / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x * CELL - cx, dy = y * CELL - cy;
      if (dx * dx + dy * dy <= (rad + 1) * (rad + 1)) block[y * gw + x] = 1;
    }
  };
  for (const t of textBounds) markRect(t.left - 2, t.top - 2, t.right + 2, t.bottom + 2);
  for (const d of [...dots, ...hubs]) markCircle(d.x, d.y, d.r + (d.first ? 12 : 3));
  for (const r of thumbRects) markRect(r.x - 2, r.y - 2, r.x + r.w + 2, r.y + r.h + 2);
  const blocked = (x, y) => [...dots, ...hubs].some(d => Math.hypot(x - d.x, y - d.y) < d.r + (d.first ? 12 : 3)) || textBounds.some(t => x > t.left - 2 && x < t.right + 2 && y > t.top - 2 && y < t.bottom + 2) || thumbRects.some(r => x > r.x - 2 && x < r.x + r.w + 2 && y > r.y - 2 && y < r.y + r.h + 2);
  const clearPoint = (p) => {
    if (!visible(p.x, p.y)) return false;
    // 격자에 안 칠해진 칸은 '확실히 비었다'(격자는 넉넉히 칠했다) — 칠해진 칸만 예전과 같은 정확한 판정을 한다.
    if (block[Math.min(gh - 1, Math.floor(p.y / CELL)) * gw + Math.min(gw - 1, Math.floor(p.x / CELL))] === 0) return true;
    return !blocked(p.x, p.y);
  };
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

/** 겹침 사각형 — 스크린샷 직전에 frame.evaluate 로 부른다(measureMap 첫 줄). */
// 좌표는 화면 기준(getBoundingClientRect)이고, 가림 격자로 옮길 때 캔버스 원점을 뺀다.
export function overlayRectsInPage() {
  return [...document.querySelectorAll('.topbar button,.mode-pill,.hero,.legend,.controls,.detail.open,.route-status.show,.toast.show,.edge-tip.show,.mobile-ribbon,.lt-moment-picker')]
    .filter(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility === 'visible' && Number(s.opacity) > .01; })
    .map(el => {
      const r = el.getBoundingClientRect();
      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
      // #951 ⑤: 토스트는 몸체뿐 아니라 그림자(번짐)도 지도를 가린다 — 사각형만 제외하면 그림자 속
      // 동심원 가이드 링 표본이 어두워진 색으로 재져 대비 미달이 된다(실측 guide-ring 2.44:1 < 3).
      // 그림자 번짐+옮김만큼 사각형을 넓혀 제외한다(가림 판정은 늘 보수적 — #591와 같은 뜻).
      if (el.classList.contains('toast')) {
        const m = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(getComputedStyle(el).boxShadow || '');
        const ox = m ? +m[1] : 0, oy = m ? +m[2] : 14, blur = m ? +m[3] : 40;
        left -= blur + Math.max(0, -ox); right += blur + Math.max(0, ox);
        top -= blur + Math.max(0, -oy); bottom += blur + Math.max(0, oy);
      }
      return { left, top, right, bottom };
    });
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
    // #951 ⑤: 상세 판을 보드와 같은 틀로 바꿨다 — 칩·detail-block 대신 제목·마음·날짜·이어진 순간·아래 단추를 잰다.
    ['detail', '.detail.open .detail-kicker, .detail.open h2, .detail.open .detail-label, .detail.open .heartText, .detail.open .value, .detail.open .connName, .detail.open .connWhy, .detail.open button'],
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
  // 스크린샷과 픽셀 해석 사이에 지도가 다시 그려지면(이행 중 페이드 등) 스크린샷 픽셀과 그리기 기록이
  // 어긋나 이행 중 색을 잘못 잰다(간헐 실패). 잴 때마다 앞·뒤 그리기 기록이 같은지 확인하고,
  // 어긋나면 화면이 멈출 때까지 기다렸다 다시 잰다(최대 3번). 멈춰 있으면 검사가 추가로 걸리지 않는다.
  // 겹침 사각형은 스크린샷 직전에 잰다(freshScreenshot이 overlayRectsInPage를 같은 시점에 부른다) —
  // 점을 누르면 고정되는 '연결 이유' 말풍선(3.2초)·토스트(2.3초)가 스크린샷 뒤에 사라지면 겹침 계산이
  // 사라진 뒤에 실행되어 가려진 어두운 패널 픽셀을 선 색으로 오인했다(2026-11-14 실측 — #591).
  // 직전에 잰 사각형으로 스크린샷 시점과 같은 겹침으로 거른다.
  await settlePaint(frame);
  for (let attempt = 0; ; attempt += 1) {
    // #628: 그리기 기록 전체(문자열) 대신 세대 번호만 본다 — 뜻은 같고 비용은 거의 0이다.
    const before = await frame.evaluate(() => window.__mapPaint?.gen || 0);
    const { screenshot, overlays } = await freshScreenshot(frame);
    const canvas = await frame.evaluate(measureMapPixelsInPage, [`data:image/png;base64,${screenshot.toString('base64')}`, overlays]);
    const dom = await frame.evaluate(measureMapDOMInPage);
    const after = await frame.evaluate(() => window.__mapPaint?.gen || 0);
    if (before === after || attempt >= 2) return { canvas, dom, screenshot };
    await settlePaint(frame, { quiet: 150 });
  }
}

// #594: 헤드리스 크로미움은 캔버스를 그린 뒤 곧바로 화면(present)에 올리지 않을 때가 있다(실측 0.6~2.4초+, 실행기가
// 바쁠수록 길다). 올라가지 않은 옛날 프레임을 재면 그리기 기록(지금 상태)과 픽셀이 어긋나 이행 전 색을 잰다 — #591
// 지도 잡 간헐 실패의 원인(동심원 보기 focus에서 클릭 전 프레임의 흐린 선 alpha .16이 잠깼다: line(43) 1.08:1).
// 기존의 앞·뒤 기록 비교는 기하만 보므로 알파만 달라진 재그리기와 스틸 프레임을 가리지 못한다.
// 그래서 두 가지를 한다. ① #stage에 번역 없는 transform(translateZ(0))을 걸었다가 캡처 뒤 되돌려 합성을 다시
// 하게 한다(부하 아래 실측 — 이것만이 확실히 새 프레임을 올렸다: 스틸 8회 연속 → 토글 뒤 즉시 신선).
// ② 모서리 한 픽셀(CSS 0.5,0.5 — 측정은 가장자리 3px 안을 표본에서 제외하므로 값에 영향이 없다)에 심은
// 신호 색(#010203)이 스크린샷에 찍혔는지 확인한다. 신호가 없으면 여전히 옛날 프레임이라는 뜻이므로
// 화면이 멈춘 뒤 다시 시도(최대 10번)하고, 끝내 안 찍히면 잘못된 재보다 실패가 낫다 — 이유를 남긴다.
async function freshScreenshot(frame) {
  for (let i = 0; ; i += 1) {
    // 겉요소(토스트 포함) 사각형을 캡처 직전에 읽는다(overlayRectsInPage) — 스크린샷과 좌표의 시점을 맞추기 위해서다(#594).
    const overlays = await frame.evaluate(overlayRectsInPage);
    await frame.evaluate(() => {
      const s = document.getElementById('stage');
      const c = s.getContext('2d');
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#010203'; c.fillRect(0, 0, 1, 1); c.restore();
      s.dataset.ltPrevTransform = s.style.transform || '';
      s.style.transform = 'translateZ(0)';
    });
    let screenshot;
    try {
      // #628: animations:'disabled' 는 캡처 때 스타일시트를 주입해 CSS 애니메이션을 끝내는데, 이 화면은
      // reducedMotion('reduce')으로 이미 애니메이션이 꺼져 있고 지도 그림은 캔버스라 CSS 애니메이션이 아니다.
      // 주입이 화면 상태를 건드리지 않도록 옵션을 뺀다(캡처 앞뒤 세대 번호가 같은지로 계속 확인한다).
      screenshot = await frame.locator('#stage').screenshot();
    } finally {
      await frame.evaluate(() => { const s = document.getElementById('stage'); s.style.transform = s.dataset.ltPrevTransform || ''; delete s.dataset.ltPrevTransform; });
    }
    const fresh = await frame.evaluate(async png => {
      const img = new Image(); img.src = png; await img.decode();
      const scratch = document.createElement('canvas'); scratch.width = 1; scratch.height = 1;
      const sc = scratch.getContext('2d', { willReadFrequently: true });
      sc.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = sc.getImageData(0, 0, 1, 1).data;
      return r <= 5 && g <= 6 && b <= 7; // 신호가 찍힌 값(실측 0,0,0). 스틸 프레임의 모서리는 주변과 섞여 밝다(실측 10,8,7).
    }, `data:image/png;base64,${screenshot.toString('base64')}`);
    if (fresh) return { screenshot, overlays };
    if (i >= 9) throw new Error('스크린샷이 최신 그리기를 보여 주지 않는다(모서리 신호 픽셀 10번 재시도에도 없음) — 표시 지연이 길다. 이 재면 이행 전 색을 잊으므로 실패로 멈춘다');
    await settleMap(frame);
  }
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
// #628: 재기 직전에 '그리기까지 멈춘' 순간을 기다린다(세대 번호가 quiet 250ms 동안 그대로). 지도는 연출(1.6초 밝히기)·카메라 이동·썸네일 도착 때
// 다시 그리는데, 기계가 바쁘면 그 간격이 100ms 까지 벌어져 캡처 도중에 다시 그려졌다(실측 40회 중 17회 =
// 스크린샷을 두 번 찍어 시간이 절반 더 들고, 스크린샷과 픽셀 해석의 시점도 어긋났다). 세대 번호가
// quiet ms 동안 그대로일 때만 잰다(화면 코드는 손대지 않는다).
export async function settlePaint(frame, { timeout = 6000, gap = 25, quiet = 250 } = {}) {
  // #951 ③: 점 자리 썸네일이 읽히는 동안에는 한 번 더 그린다 — 다 읽기 전에 재면 스틸 프레임을 잰다.
  const snap = () => frame.evaluate(() => (window.__mapPaint?.gen || 0) + '#' + (window.__imgPending || 0) + '#' + (window.__lt?.thumbsSettled?.() === false ? 'p' : 's'));
  const start = Date.now(); let prev = await snap(), last = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, gap));
    const cur = await snap();
    if (cur !== prev) { prev = cur; last = Date.now(); }
    else if (Date.now() - last >= quiet) return true;
  }
  return true;
}

export async function settleMap(frame, { timeout = 6000, gap = 20 } = {}) {
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
