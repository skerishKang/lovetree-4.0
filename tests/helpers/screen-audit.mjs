// #657 — 화면 공통 검사기의 검사 함수. 화면 시험 파일은 tests/v41-screen-audit.test.mjs 하나다.
// 네 가지를 한 번에 잰다(기준은 각 이슈에서 정한 값을 그대로 쓴다 — 여기서 기준을 바꾸지 않는다):
//   ① 보이는 글자·단추끼리 겹침 0 + 다른 요소에 가려진 글자 0(#635 PR B의 scanOverlap 규칙 —
//      렌즈 복제본(#lens·#mobileLensStage)·opacity 0·닫힌 패널은 제외, 부모-자식은 겹침이 아니다)
//   ② 가로 넘침 0px·잘린 글자 0(overflow가 있는 요소에서 scrollWidth > clientWidth — 의도한 한 줄 말줄임은 제외, #662)
//   ③ 화면 글자에 undefined·null·NaN·[object Object] 없음(#635의 scanPage와 같은 값 넷)
//   ④ 12px 미만 글자 0·단추 13px 미만 0(#548의 COLLECT 규칙 — 그림자 DOM까지, 보이지 않는 글자 제외)
//   ⑤ 알림 줄(토스트)이 떠 있을 때, 화면 아래에 붙은 것들(링크 줄·＋ 단추·새 소식 카드)을 덮지 않음(#666)
//   ⑥ 보드 안내 풍선(.toast)의 글자 대비 4.5:1 이상 — 배경은 반투명이므로 아래 층과 합성해 잰다(#662 후속)
// 검사는 좌표·DOM으로 한다(눈 확인에 기대지 않는다). 실패 한 건을 한 줄로 만드는 lineOf도 여기 둔다.
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

// dist를 우선 쓰고(빌드 결과), 없으면 public을 바로 쓴다(#635와 같은 판정).
export function distOrPublic() {
  return existsSync(path.join(REPO, 'dist', 'v41', 'home.html')) ? path.join(REPO, 'dist') : path.join(REPO, 'public');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

// extraRoutes: { '/share-host.html': html } 처럼 시험용 호스트 페이지를 얹는다(#635 방식).
export function serve(extraRoutes = {}) {
  const ROOT = distOrPublic();
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (extraRoutes[clean]) { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(extraRoutes[clean]); return; }
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

// 한 문서(프레임) 안의 네 가지 검사. 페이지·프레임마다 이 함수를 evaluate로 돌린다.
export const AUDIT_FN = function audit(opts) {
  // '보드·안내' 상태에서는 안내 풍선도 검사 대상이다 — 풍선은 '도구×캔버스' 제외 대상이 아니다(CTO 지시 #662 후속).
  const CHECK_TOAST = !!(opts && opts.checkToast);
  const LENS = new Set(['lens', 'mobileLensStage']); // 렌즈 복제본 — 보이지 않는 거울(#635)
  // 조상 사슬(그림자 경계를 넘어 호스트까지).
  const chain = (el) => {
    const out = [];
    for (let n = el; n; n = n.parentElement || (n.getRootNode ? n.getRootNode().host : null)) out.push(n);
    return out;
  };
  const sel = (el) => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
      if (cls) s += '.' + cls.slice(0, 40);
    }
    return s;
  };
  // 조상이 overflow로 잘라내는 영역을 반영한 사각형 — 잘린 부분은 눈에도 보이지 않는다(#662:
  // 스크롤 경계에 잘린 글자·굴리는 칸 밖으로 밀린 글자를 보이는 것으로 세지 않는다).
  const clipRect = (el) => {
    const own = el.getBoundingClientRect();
    let box = { left: own.left, top: own.top, right: own.right, bottom: own.bottom };
    for (let n = el.parentElement; n; n = n.parentElement || (n.getRootNode ? n.getRootNode().host : null)) {
      const cs = getComputedStyle(n);
      if ((cs.overflowX && cs.overflowX !== 'visible') || (cs.overflowY && cs.overflowY !== 'visible')) {
        const nb = n.getBoundingClientRect();
        box = { left: Math.max(box.left, nb.left), top: Math.max(box.top, nb.top), right: Math.min(box.right, nb.right), bottom: Math.min(box.bottom, nb.bottom) };
      }
    }
    return box;
  };
  const visible = (el) => {
    for (const n of chain(el)) {
      if (LENS.has(n.id)) return false;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    const r = clipRect(el);
    if (!(r.right - r.left > 2 && r.bottom - r.top > 2)) return false;
    // 화면 밖(닫힌 패널이 transform으로 치워진 것 등)은 판정에서 뺀다(#635).
    return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  const hasDirectText = (el) => {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  };
  // 그림자 DOM까지 도는 글자 수집(흔적 값 검사는 숨은 패널까지, 좌표 검사는 보이는 것만).
  const all = [];
  const collect = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) collect(el.shadowRoot);
      if (!hasDirectText(el)) continue;
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(el.tagName)) continue;
      all.push(el);
    }
  };
  collect(document);

  // 창(dialog)이 열려 있으면 창 뒤 본문은 가려진 것이 정상이다 — 창 안의 글자만 좌표 검사 대상으로 삼는다.
  const openDialogs = [];
  const findDialogs = (root) => {
    for (const d of root.querySelectorAll('dialog[open]')) openDialogs.push(d);
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) findDialogs(el.shadowRoot);
  };
  findDialogs(document);
  const inTop = openDialogs.length ? (el) => openDialogs.some((d) => d === el || d.contains(el)) : () => true;

  // ③ 흔적 값 — 그린 글자 전부(숨은 패널 포함)에서 값 넷을 찾는다(#635 scanPage와 같은 넷).
  let text = '';
  for (const el of all) text += ' ' + el.textContent;
  const bad = ['undefined', 'null', 'NaN', '[object Object]'].filter((b) => text.includes(b));

  // 토스트는 위에 잠깐 뜨는 것이 정상인 오버레이라 겹침·가려짐 판정에서 뺀다(타이밍에 따라 결과가 달라지는 소음을 줄인다).
  // ('보드·안내' 상태에서는 CHECK_TOAST로 풍선까지 검사 대상에 넣는다 — 아래 pairable에서)
  const isToast = (el) => chain(el).some((n) => n.id === 'toast' || /\btoast\b/.test(String(n.className || '')));
  // 보이는 글자만 좌표 검사 대상. 635가 뺀 것(책장 판·hidden 속성)도 같이 뺀다.
  // 상세 판이 열려 있으면 판은 창과 같은 것 — 판에 가려지는 본문(카드·도구줄)은 '정상 가려짐'이라 좌표 검사에서 뺀다(#662 후속).
  // 판 안의 글자와 판에 닿지 않는 요소(책 이면 글·머리글·탐색 판 등), 판 위에 뜨는 풍선은 그대로 검사 대상.
  const openPanel = document.querySelector('.detail.open');
  const panelRect = openPanel ? openPanel.getBoundingClientRect() : null;
  const underPanel = (el) => {
    if (!panelRect || openPanel.contains(el) || isToast(el)) return false;
    const r = clipRect(el);
    return Math.min(r.right, panelRect.right) - Math.max(r.left, panelRect.left) > 4 && Math.min(r.bottom, panelRect.bottom) - Math.max(r.top, panelRect.top) > 4;
  };
  const vis = all.filter((el) => inTop(el) && visible(el) && !underPanel(el) && !el.closest('.flip-sheet') && !el.closest('[hidden]'));
  // 토스트는 위에 잠깐 뜨는 것이 정상인 오버레이라 겹침·가려짐 판정에서 뺀다(타이밍에 따라 결과가 달라지는 소음을 줄인다).
  const CHROME_SEL = 'header,.lt-moment-picker,.toolbar,.cinemaBtn,#themeBadge';
  const inChrome = (el) => chain(el).some((n) => n.matches && n.matches(CHROME_SEL));
  const inWorld = (el) => chain(el).some((n) => n.id === 'world');
  const chromeVsWorld = (a, b) => (inChrome(a) && inWorld(b)) || (inWorld(a) && inChrome(b));
  const pairable = vis.filter((el) => CHECK_TOAST || !isToast(el));
  const rects = pairable.map((el) => ({ el, r: clipRect(el) }));

  // ① 겹침 — 쌍끼리 4px 초과로 포개지면 실패(부모-자식은 겹침이 아니다).
  const issues = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (chromeVsWorld(a.el, b.el)) continue;
    const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ox > 4 && oy > 4) issues.push({ a: sel(a.el), b: sel(b.el), x: Math.round(Math.max(a.r.left, b.r.left)), y: Math.round(Math.max(a.r.top, b.r.top)) });
  }
  // ① 가려짐 — 글자 가운데 점에 다른 요소가 오면 실패(elementFromPoint).
  const covered = [];
  for (const { el, r } of rects) {
    // 풍선(.toast)은 pointer-events:none이라 elementFromPoint가 풍선을 never 반환해 가려짐 판정이 성립하지 않는다 —
    // 풍선의 본검사는 ①겹침(사각형 교차, CHECK_TOAST일 때 대상에 넣음)과 ⑥대비다(#662 후속).
    if (isToast(el)) continue;
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const top = document.elementFromPoint(cx, cy);
    if (!top) continue;
    if (isToast(top)) continue;
    if (top === el || chain(top).includes(el) || chain(el).includes(top)) continue;
    if (chain(top).some((n) => LENS.has(n.id))) continue;
    if ((inChrome(el) && inWorld(top)) || (inWorld(el) && inChrome(top))) continue;
    covered.push({ el: sel(el), by: sel(top), x: Math.round(cx), y: Math.round(cy) });
  }

  // ② 가로 넘침(문서 기준)·잘린 글자(넘침을 자르는 요소에서 scrollWidth > clientWidth).
  // 한 줄 말줄임(text-overflow:ellipsis + nowrap)은 의도한 잘라 보이기다 — 실패가 아니라 제목·연결 이유의 원래 모양(#662).
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const clipped = [];
  for (const el of vis) {
    const cs = getComputedStyle(el);
    if (!cs.overflowX || cs.overflowX === 'visible') continue;
    if (cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap') continue;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push({ el: sel(el), text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), sw: el.scrollWidth, cw: el.clientWidth });
  }

  // ④ 작은 글자 — 12px 미만 글자 0·단추 13px 미만 0(#548: 단추 판정은 요소 자신이 단추일 때).
  const small = [];
  for (const el of vis) {
    const px = parseFloat(getComputedStyle(el).fontSize);
    const interactive = /^(button|a)$/i.test(el.tagName) || el.getAttribute('role') === 'button';
    if (px < 12 || (interactive && px < 13)) small.push({ el: sel(el), px, 단추: interactive, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) });
  }

  // ⑥ 보드 안내 풍선(.toast)의 글자 대비 — 4.5:1 미만이면 실패(#662 후속: 정원에서 흰 종이 바탕에 흰 글자가 됐었다).
  //    배경이 반투명(rgba 알파)이므로 조상의 바탕색과 합성해 계산한다. 바탕을 못 찾으면 흰 종이로 본다(어두운 글자 기준으로 엄하게).
  const contrast = [];
  const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(',').map((v) => parseFloat(v)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const over = (t, b) => [t[0] * t[3] + b[0] * (1 - t[3]), t[1] * t[3] + b[1] * (1 - t[3]), t[2] * t[3] + b[2] * (1 - t[3]), 1];
  for (const el of vis) {
    if (!/\btoast\b/.test(String(el.className || ''))) continue;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 0.95) continue;
    const fg = rgb(cs.color); if (!fg) continue;
    const layers = [];
    for (let n = el; n; n = n.parentElement) { const bg = rgb(getComputedStyle(n).backgroundColor); if (bg) { layers.push(bg); if (bg[3] >= 1) break; } }
    let bgc = layers.length && layers[layers.length - 1][3] >= 1 ? layers[layers.length - 1] : [255, 255, 255, 1];
    for (let i = layers.length - 2; i >= 0; i--) bgc = over(layers[i], bgc);
    const fgEff = fg[3] < 1 ? over(fg, bgc) : fg;
    const ratio = (Math.max(lum(fgEff), lum(bgc)) + 0.05) / (Math.min(lum(fgEff), lum(bgc)) + 0.05);
    if (ratio < 4.5) contrast.push({ el: sel(el), ratio: Math.round(ratio * 100) / 100, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) });
  }

  // #662(CTO 지시): 보드 전용 — 카드가 읽히는 배율인지. 보이는 카드(화면과 4px 넘게 걸치는) 중 가장 넓은 카드의 폭.
  // 좁은 판 200px·넓은 판 180px 미만이면 '너무 작게 맞춰졌다'로 실패(겹침·잘림만으로는 못 잡는 쓸 수 없는 화면).
  let cards = null;
  const cardLayer = document.getElementById('cardLayer');
  if (cardLayer) {
    let maxW = 0, n = 0;
    for (const c of cardLayer.querySelectorAll('.card')) {
      const r = clipRect(c);
      const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      if (w > 4 && h > 4) { n++; if (w > maxW) maxW = Math.round(w); }
    }
    cards = { n, maxW };
  }

  // ⑤ 알림 줄(#toast)이 떠 있으면, 화면 아래에 붙은 것들(.home-links·#mobile-add·#updates-card)을 덮지 않아야 한다(#666).
  //    토스트는 ①·①의 판정에서 빠져 있으므로(위 isToast) 자리 자체를 여기서 따로 잰다 — 1px도 겹치면 실패다.
  const toastHits = [];
  const toastEl = document.getElementById('toast');
  if (toastEl && !toastEl.hidden && visible(toastEl)) {
    const toastRect = toastEl.getBoundingClientRect();
    for (const bottomSel of ['.home-links', '#mobile-add', '#updates-card']) {
      for (const other of document.querySelectorAll(bottomSel)) {
        if (other.hidden || !visible(other)) continue;
        const r2 = other.getBoundingClientRect();
        const ox = Math.min(toastRect.right, r2.right) - Math.max(toastRect.left, r2.left);
        const oy = Math.min(toastRect.bottom, r2.bottom) - Math.max(toastRect.top, r2.top);
        if (ox > 0 && oy > 0) toastHits.push({ el: sel(toastEl), by: sel(other), x: Math.round(Math.max(toastRect.left, r2.left)), y: Math.round(Math.max(toastRect.top, r2.top)) });
      }
    }
  }

  return { issues, covered, bad, overflow, clipped, small, cards, toastHits, contrast };
};

// 페이지와 그 안의 모든 프레임(같은 출처)에 검사를 돌려 한 묶음으로 모은다.
const EMPTY = () => ({ issues: [], covered: [], bad: [], clipped: [], small: [], overflowList: [], toastHits: [], errors: [], cardsList: [], contrast: [] });
export async function auditPage(page, screen) {
  const out = EMPTY();
  for (const frame of page.frames()) {
    let res;
    try { res = await frame.evaluate(AUDIT_FN, { checkToast: screen.startsWith('보드·안내') }); } catch (e) {
      // 검사 함수가 잘못되면 조용히 건너뛰지 않는다 — 기록해 두고 시험이 실패하게 한다(about:blank 등은 애초에 evaluate가 오류를 내지 않는다).
      out.errors.push({ 화면: screen, 프레임: frame.url(), 오류: String(e).slice(0, 200) });
      continue;
    }
    const url = frame.url().replace(/^https?:\/\/[^/]+/, '');
    for (const key of ['issues', 'covered', 'clipped', 'small', 'toastHits', 'contrast']) for (const item of res[key] || []) out[key].push({ 화면: screen, 프레임: url, ...item });
    for (const b of res.bad || []) out.bad.push({ 화면: screen, 프레임: url, 값: b });
    if (res.cards) out.cardsList.push({ 화면: screen, 프레임: url, ...res.cards });
    if ((res.overflow || 0) > 0) out.overflowList.push({ 화면: screen, 프레임: url, overflow: res.overflow });
  }
  return out;
}

// 실패 한 건을 한 줄로 — 화면·크기·테마·항목·선택자·좌표가 모두 들어간다.
export function lineOf(res) {
  if (res.항목 === '가로넘침') return `${res.화면} 가로넘침 ${res.overflow}px`;
  if (res.항목 === '흔적값') return `${res.화면} 흔적값 ${res.값}`;
  if (res.항목 === '겹침') return `${res.화면} 겹침 ${res.a} × ${res.b} @(${res.x},${res.y})`;
  if (res.항목 === '가려짐') return `${res.화면} 가려짐 ${res.el} ← ${res.by} @(${res.x},${res.y})`;
  if (res.항목 === '잘림') return `${res.화면} 잘림 ${res.el} "${res.text}" ${res.sw}>${res.cw}`;
  if (res.항목 === '작은글자') return `${res.화면} 작은글자 ${res.px}px${res.단추 ? '(단추)' : ''} ${res.el} "${res.text}"`;
  if (res.항목 === '알림줄겹침') return `${res.화면} 알림줄겹침 ${res.el} × ${res.by} @(${res.x},${res.y})`;
  if (res.항목 === '대비') return `${res.화면} 대비 ${res.el} ${res.ratio}:1 < 4.5:1 "${res.text}"`;
  return JSON.stringify(res);
}

// 검사 결과를 (항목, 줄) 목록으로 — 크기·테마를 줄 끝에 붙인다. 알려진 문제와 대조할 때 쓴다.
export function failuresOf(res, 크기, 테마) {
  const rows = [];
  for (const e of res.errors) rows.push(['검사오류', `${e.화면} 검사오류 ${e.프레임} ${e.오류}`]);
  for (const o of res.overflowList) rows.push(['가로넘침', lineOf({ 항목: '가로넘침', ...o })]);
  for (const b of res.bad) rows.push(['흔적값', lineOf({ 항목: '흔적값', ...b })]);
  for (const i of res.issues) rows.push(['겹침', lineOf({ 항목: '겹침', ...i })]);
  for (const c of res.covered) rows.push(['가려짐', lineOf({ 항목: '가려짐', ...c })]);
  for (const c of res.clipped) rows.push(['잘림', lineOf({ 항목: '잘림', ...c })]);
  for (const s of res.small) rows.push(['작은글자', lineOf({ 항목: '작은글자', ...s })]);
  for (const c of res.cardsList || []) {
    const 기준 = 크기 < 700 ? 200 : 180;
    if (String(c.화면).startsWith('보드') && c.maxW < 기준) rows.push(['작은카드', `${c.화면} 작은카드 보이는 카드 ${c.n}장 중 가장 넓은 폭 ${c.maxW}px < ${기준}px`]);
  }
  for (const t of res.toastHits) rows.push(['알림줄겹침', lineOf({ 항목: '알림줄겹침', ...t })]);
  for (const c of res.contrast || []) rows.push(['대비', lineOf({ 항목: '대비', ...c })]);
  return rows.map(([항목, 줄]) => ({ 항목, 줄: `${줄} · ${크기}·${테마}` }));
}
