// #657 — 화면 공통 검사기의 검사 함수. 화면 시험 파일은 tests/v41-screen-audit.test.mjs 하나다.
// 네 가지를 한 번에 잰다(기준은 각 이슈에서 정한 값을 그대로 쓴다 — 여기서 기준을 바꾸지 않는다):
//   ① 보이는 글자·단추끼리 겹침 0 + 다른 요소에 가려진 글자 0(#635 PR B의 scanOverlap 규칙 —
//      렌즈 복제본(#lens·#mobileLensStage)·opacity 0·닫힌 패널은 제외, 부모-자식은 겹침이 아니다)
//   ② 가로 넘침 0px·잘린 글자 0(overflow가 있는 요소에서 scrollWidth > clientWidth — 의도한 한 줄 말줄임은 제외, #662)
//   ③ 화면 글자에 undefined·null·NaN·[object Object] 없음(#635의 scanPage와 같은 값 넷)
//   ④ 12px 미만 글자 0·단추 13px 미만 0(#548의 COLLECT 규칙 — 그림자 DOM까지, 보이지 않는 글자 제외)
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
export const AUDIT_FN = function audit() {
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

  // 보이는 글자만 좌표 검사 대상. 635가 뺀 것(책장 판·hidden 속성)도 같이 뺀다.
  const vis = all.filter((el) => inTop(el) && visible(el) && !el.closest('.flip-sheet') && !el.closest('[hidden]'));
  // 토스트는 위에 잠깐 뜨는 것이 정상인 오버레이라 겹침·가려짐 판정에서 뺀다(타이밍에 따라 결과가 달라지는 소음을 줄인다).
  const isToast = (el) => chain(el).some((n) => n.id === 'toast' || /\btoast\b/.test(String(n.className || '')));
  const pairable = vis.filter((el) => !isToast(el));
  const rects = pairable.map((el) => ({ el, r: clipRect(el) }));

  // ① 겹침 — 쌍끼리 4px 초과로 포개지면 실패(부모-자식은 겹침이 아니다).
  const issues = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ox > 4 && oy > 4) issues.push({ a: sel(a.el), b: sel(b.el), x: Math.round(Math.max(a.r.left, b.r.left)), y: Math.round(Math.max(a.r.top, b.r.top)) });
  }
  // ① 가려짐 — 글자 가운데 점에 다른 요소가 오면 실패(elementFromPoint).
  const covered = [];
  for (const { el, r } of rects) {
    if (isToast(el)) continue;
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const top = document.elementFromPoint(cx, cy);
    if (!top) continue;
    if (isToast(top)) continue;
    if (top === el || chain(top).includes(el) || chain(el).includes(top)) continue;
    if (chain(top).some((n) => LENS.has(n.id))) continue;
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

  return { issues, covered, bad, overflow, clipped, small };
};

// 페이지와 그 안의 모든 프레임(같은 출처)에 검사를 돌려 한 묶음으로 모은다.
const EMPTY = () => ({ issues: [], covered: [], bad: [], clipped: [], small: [], overflowList: [], errors: [] });
export async function auditPage(page, screen) {
  const out = EMPTY();
  for (const frame of page.frames()) {
    let res;
    try { res = await frame.evaluate(AUDIT_FN); } catch (e) {
      // 검사 함수가 잘못되면 조용히 건너뛰지 않는다 — 기록해 두고 시험이 실패하게 한다(about:blank 등은 애초에 evaluate가 오류를 내지 않는다).
      out.errors.push({ 화면: screen, 프레임: frame.url(), 오류: String(e).slice(0, 200) });
      continue;
    }
    const url = frame.url().replace(/^https?:\/\/[^/]+/, '');
    for (const key of ['issues', 'covered', 'clipped', 'small']) for (const item of res[key] || []) out[key].push({ 화면: screen, 프레임: url, ...item });
    for (const b of res.bad || []) out.bad.push({ 화면: screen, 프레임: url, 값: b });
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
  return rows.map(([항목, 줄]) => ({ 항목, 줄: `${줄} · ${크기}·${테마}` }));
}
