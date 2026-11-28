
import { buildHierarchy, layoutTree, branchWidth, edgeWidths, branchRibbon, branchPoints } from './tree-layout.mjs';
import { thumbnailCandidates, nextThumbnailStep } from '/v41/thumb-fallback.mjs';
import { mountScreenToolbar } from '/v41/screen-toolbar.mjs';
import { MSG, isShellMessage } from '/v41/frame-messages.mjs';
import {formatDisplayDate,titleView,readTitleDisplay,normalizeTitleDisplay} from '/v41/book-usability.mjs';
import {localDateOnly} from '/v41/local-date.mjs';

const scriptStart = performance.now();
const SVG = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const stage = $('stage'), world = $('world'), cardsEl = $('cards'), note = $('note');
const layers = { ground: $('ground'), leaves: $('leaves'), limbs: $('limbs'), lit: $('lit') };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 시안 두 개: 자리 규칙은 같고 가지 그리는 법만 다르다(굵은 가지에 맞춰 가지 띠가 조금 넓고 높다).
const STYLE = { bandPad:22, bandMin:56, bandSlope:.12, curve:{lean:.16,k1:.42,k2:.6}, width:n=>({min:2.6,max:clamp(12+1.8*Math.sqrt(n),14,34),power:.5,flare:1.35}) };
// 카드 크기: 뿌리·사진 카드·글 카드·묶음이 서로 다르다(가변 크기 배치). 좁은 화면은 한 단계 작게.
const SIZES = {
  wide: { card: [108, 100, 60], rootCard: [132, 122, 80], noteCard: [108, 66, 0], chip: [80, 38] },
  narrow: { card: [92, 88, 52], rootCard: [112, 106, 68], noteCard: [92, 60, 0], chip: [68, 34] }
};

const state = { expanded:new Set(),root:null,layout:null,sizes:SIZES.wide,scale:1,tx:0,ty:0,pick:null,mode:'fit' };

/* #1295 뒤로 가기: 순간 열기·상세는 기록하고, 접기·뿌리로·전체·확대·축소는 기록하지 않는다.
   기록하지 않는 동작은 같은 자리에서 여러 번 눌러도 기록이 쌓이지 않게 pushState를 쓰지 않는다. */
const detail = document.getElementById('treeDetail');
let restoringTree = false;
function treeSnapshot(panel) {
  return {
    lt41Tree: true,
    lt41TreePanel: panel || null,
    lt41TreePick: state.pick,
    // #1333: 셸의 현재 순간도 함께 적어 두면 뒤로 가기로 되돌릴 때 같이 복원된다.
    lt41TreeShellMoment: window.LT41?.momentId || (typeof data?.get === 'function' ? String(data.get() || '') : ''),
    lt41TreeExpanded: [...state.expanded],
    lt41TreeView: { scale: state.scale, tx: state.tx, ty: state.ty, mode: state.mode }
  };
}
function pushTree(panel) {
  if (restoringTree) return;
  try { history.pushState(treeSnapshot(panel), ''); } catch {}
}
function rememberTree() {
  if (restoringTree) return;
  try { history.replaceState(treeSnapshot(null), ''); } catch {}
}
function restoreTree(st) {
  if (!st?.lt41Tree) return;
  restoringTree = true;
  const wantDetail = st.lt41TreePanel === 'detail';
  if (detail?.open && !wantDetail) detail.close();
  state.pick = st.lt41TreePick ?? null;
  state.expanded = new Set(st.lt41TreeExpanded || []);
  const v = st.lt41TreeView;
  if (v) { state.scale = v.scale; state.tx = v.tx; state.ty = v.ty; state.mode = v.mode || 'free'; }
  const shellMoment = st.lt41TreeShellMoment || state.pick || (typeof data?.get === 'function' ? String(data.get() || '') : '');
  if (shellMoment && typeof data?.select === 'function') data.select(shellMoment, { noHistory: true });
  if (wantDetail && detail && !detail.open && state.pick) openDetail(state.pick);
  else draw();
  applyNow();
  restoringTree = false;
}
addEventListener('popstate', () => {
  const st = history.state;
  if (st?.lt41Tree) restoreTree(st);
  else restoreTree(treeSnapshot(null));
});
// 숫자로 재는 것: 계산·그리기 시간, 주소를 연 때부터 첫 그림까지, 끌기 중 프레임 간격.
// 무대 크기는 카드를 넣기 전에 한 번 재 둔다 — 카드 120장을 넣은 뒤에 재면 그 자리에서 전체 배치를 다시 계산하게 된다.
const view = { w: 0, h: 0 };
const measure = () => { view.w = stage.clientWidth; view.h = stage.clientHeight; };
const perf = { scriptStartMs: scriptStart, layoutMs: 0, drawMs: 0, firstBuildMs: null, firstPaintMs: null, drag: null };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svg = (tag, cls, attrs) => { const e = document.createElementNS(SVG, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
let dateStyle='dot';
try{const value=document.documentElement.getAttribute('data-lt-date-style')||localStorage.getItem('lt41.dateStyle');dateStyle=value==='dash'||value==='long'?value:'dot'}catch{}
const dateText = (m) => formatDisplayDate(m.date||(m.createdAt?localDateOnly(m.createdAt):''),dateStyle);
const readTitleSetting=()=>{try{return readTitleDisplay(parent.LT41?.prefs?parent.LT41:{titleDisplay:localStorage.getItem('lt41.titleDisplay')})}catch{return 'both'}};
let titleDisplay=readTitleSetting();
const titleMain=(m)=>titleView(m,titleDisplay).main||m.title||'제목 없음';

function sizeOf(item) {
  const s = state.sizes;
  const pick = item.kind !== 'moment' ? s.chip : item.root ? s.rootCard : item.moment.thumb ? s.card : s.noteCard;
  return { w: pick[0], h: pick[1] };
}

/* ── 그리기 ─────────────────────────────────────────────────────────── */

function draw() {
  const t0 = performance.now();
  const style = STYLE;
  state.sizes = view.w < 700 ? SIZES.narrow : SIZES.wide;
  const layout = layoutTree(state.root, { sizeOf, expanded: state.expanded, bandPad: style.bandPad, bandMin: style.bandMin, bandSlope: style.bandSlope });
  state.layout = layout;
  perf.layoutMs = performance.now() - t0;
  drawCards(layout);
  drawWood(layout, style);

  setPick(state.pick && layout.cards.some((c) => c.id === state.pick) ? state.pick : null);
  perf.drawMs = performance.now() - t0;
  tell();
}

function drawCards(layout) {
  const frag = document.createDocumentFragment();
  for (const c of layout.cards) {
    let node;
    if (c.kind === 'moment') {
      const m = c.moment;
      node = el('button', 'ts-card' + (c.root ? ' is-root' : '') + (m.thumb ? '' : ' is-note'));

      if (m.thumb) {
        const thumb = el('span', 'ts-thumb');
        const img = el('img');
        img.alt = ''; img.decoding = 'async'; img.draggable = false; let index=0;
        const advance=(error)=>{const step=nextThumbnailStep(m.thumbs,index,{error,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight});if(step.status==='retry'){index=step.index;img.src=step.src;}else if(step.status==='fallback'){thumb.remove();node.classList.add('is-note');}};
        img.addEventListener('error',()=>advance(true));img.addEventListener('load',()=>advance(false));img.src=m.thumb;
        thumb.append(img);
        if (c.root) thumb.append(el('span', 'ts-first', '첫 순간'));
        node.append(thumb);
        node.style.setProperty('--thumb', (c.root ? state.sizes.rootCard[2] : state.sizes.card[2]) + 'px');
      }
      const cap = el('span', 'ts-cap');
      const meta = el('span', 'ts-meta');
      // 카드 폭에 늘 들어가도록 감정은 색 점으로만, 낱말은 고른 순간 안내와 풍선말·읽어 주는 이름에 둔다.
      meta.append(el('i', 'ts-emo'), document.createTextNode(dateText(m)));
      node.title = `${dateText(m)} · ${m.emotion} · ${titleMain(m)}`;
      cap.append(meta, el('span', 'ts-title', titleMain(m)));
      node.append(cap);
      node.setAttribute('aria-label', `${c.root ? '첫 순간' : '뿌리에서 ' + (c.depth + 1) + '번째'} · ${dateText(m)} · ${m.emotion} · ${titleMain(m)}`);
    } else if (c.kind === 'bundle') {
      node = el('button', 'ts-chip', `+${c.count}개`);
      node.setAttribute('aria-label', `접힌 갈림 ${c.count}개 펼치기 (순간 ${c.size}개)`);
    } else {
      node = el('button', 'ts-chip is-fold', '접기');
      node.setAttribute('aria-label', `갈림 ${c.count}개를 다시 접기`);
    }
    node.type = 'button';
    node.dataset.id = c.id;
    node.dataset.kind = c.kind;
    node.style.setProperty('--x', c.x + 'px'); node.style.setProperty('--y', c.y + 'px');
    node.style.setProperty('--w', c.w + 'px'); node.style.setProperty('--h', c.h + 'px');
    frag.append(node);
  }
  cardsEl.replaceChildren(frag);
}

function drawWood(layout, style) {
  const total = layout.total;
  const widths = style.width(total);
  const rootCard = layout.cards[0];
  // 가는 가지부터 그려 굵은 줄기가 위에 온다 → 갈림에서 곁가지가 줄기 뒤에서 나오는 것처럼 보인다.
  const edges = layout.edges.map((e) => ({ e, w: edgeWidths(e, total, widths) })).sort((a, b) => a.w[1] - b.w[1]);
  const limbs = document.createDocumentFragment(), leaves = document.createDocumentFragment();
  state.ribbons = new Map();
  for (const { e, w } of edges) {
    const ribbon = branchRibbon(e, w[0], w[1], style.curve, 14);
    state.ribbons.set(e.to, ribbon.d);
    limbs.append(svg('path', 'ts-limb' + (e.kind === 'moment' ? '' : ' is-bundle'), { d: ribbon.d }));
    if (w[1] >= 7) {
      // 굵은 가지에만 왼쪽 가장자리에 밝은 결 한 줄(시안 ②에서만 보인다) — 둥근 줄기처럼 보이게.
      const pts = branchPoints(e, style.curve, 14);
      limbs.append(svg('path', 'ts-grain', { d: 'M' + pts.map((p) => `${(p[0] - w[1] * 0.3).toFixed(1)} ${p[1].toFixed(1)}`).join('L'), 'stroke-width': Math.max(1, w[1] * 0.07).toFixed(1) }));
    }
    if (e.kind === 'moment' && e.size === 1) {
      // 장식 잎: 가지 끝(더 이어지지 않는 순간)의 카드 바로 아래에만 두 장. 카드보다 아래 층에 그려 구조를 가리지 않는다.
      const k = state.sizes === SIZES.narrow ? 0.8 : 1;
      leaves.append(svg('path', 'ts-leaf', { d: 'M0 0C4 -7 13 -8 18 -2C12 3 4 4 0 0Z', transform: `translate(${e.x1.toFixed(1)} ${(e.y1 + 15).toFixed(1)}) rotate(-32) scale(${k})` }));
      leaves.append(svg('path', 'ts-leaf', { d: 'M0 0C4 -7 13 -8 18 -2C12 3 4 4 0 0Z', transform: `translate(${e.x1.toFixed(1)} ${(e.y1 + 24).toFixed(1)}) rotate(212) scale(${k * 0.85})` }));
    }
  }
  layers.limbs.replaceChildren(limbs);
  layers.leaves.replaceChildren(leaves);
  // 뿌리 아래: 시안 ①은 흙 선 한 줄, 시안 ②는 밑동과 뿌리.
  const base = branchWidth(total, total, widths);
  const ground = document.createDocumentFragment();
  const half = rootCard.w * 0.9;
  ground.append(svg('path', 'ts-soil', { d: `M${-half} 20Q0 8 ${half} 20`, 'stroke-width': 1.5 }));
  ground.append(svg('path', 'ts-stump', { d: `M${-base / 2} -10L${-base / 2} 4C${-base / 2} 14 ${-base * 0.9} 20 ${-base * 1.5} 24L${base * 1.5} 24C${base * 0.9} 20 ${base / 2} 14 ${base / 2} 4L${base / 2} -10Z` }));
  for (const [dx, dy, k] of [[-2.6, 16, 0.42], [2.6, 16, 0.42], [-1.5, 22, 0.3], [1.6, 22, 0.3]]) {
    ground.append(svg('path', 'ts-root', { d: `M${dx * base * 0.3} 14Q${dx * base * 0.7} ${14 + dy * 0.4} ${dx * base} ${14 + dy}`, 'stroke-width': (base * k).toFixed(1) }));
  }
  layers.ground.replaceChildren(ground);
}

/* ── 고른 순간 강조 ─────────────────────────────────────────────────── */

function setPick(id) {
  state.pick = id;
  const path = new Set();
  if (id) {
    const byId = new Map(state.layout.cards.map((c) => [c.id, c]));
    for (let at = byId.get(id); at; at = byId.get(at.parentId)) path.add(at.id);
  }
  stage.classList.toggle('has-pick', !!id);
  for (const node of cardsEl.children) {
    node.classList.toggle('on-path', path.has(node.dataset.id));
    node.classList.toggle('is-pick', node.dataset.id === id);
    if (node.dataset.kind === 'moment') node.setAttribute('aria-pressed', node.dataset.id === id ? 'true' : 'false');
  }
  const lit = document.createDocumentFragment();
  for (const pid of path) { const d = state.ribbons.get(pid); if (d) lit.append(svg('path', 'ts-lit', { d })); }
  layers.lit.replaceChildren(lit);
  tell();
}

function tell(){const L=state.layout;if(!L)return;note.textContent='순간 '+L.visible+'/'+L.total+'개'+(L.hidden?' · 접힌 순간 '+L.hidden+'개':'');}

/* ── 옮기기·확대 ────────────────────────────────────────────────────── */

// 끌기처럼 한 프레임에 여러 번 부르는 곳은 apply(), 한 번에 자리를 옮기는 곳은 applyNow().
let frame = 0;
function applyNow() {
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
  world.style.transform = `translate3d(${state.tx}px,${state.ty}px,0) scale(${state.scale})`;
  const lod = state.sizes.card[0] * state.scale < 62 ? 'far' : 'near';
  if (stage.dataset.lod !== lod) stage.dataset.lod = lod;
}
function apply() {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; applyNow(); });
}
function glide() {
  stage.dataset.glide = 'true';
  clearTimeout(glide.timer);
  glide.timer = setTimeout(() => { stage.dataset.glide = 'false'; }, 320);
}
// 화면에서 상태 글·조작 단추가 가리는 자리(좁은 화면: 위 한 줄 + 아래 한 줄, 넓은 화면: 아래 여백만).
function insets() {
  const narrow = view.w < 700;
  return narrow ? {side:12,top:16,bottom:16} : {side:36,top:28,bottom:24};
}
function fitAll(animate) {
  const b = state.layout.bounds, pad = insets();
  const w = view.w, h = view.h, below = 30;
  const scale = clamp(Math.min((w - pad.side * 2) / b.width, (h - pad.top - pad.bottom) / (b.height + below)), 0.04, 1);
  state.scale = scale;
  state.tx = w / 2 - (b.minX + b.maxX) / 2 * scale;
  state.ty = pad.top + (h - pad.top - pad.bottom) / 2 - (b.minY + b.maxY + below) / 2 * scale;
  state.mode = 'fit';
  if (animate) glide();
  applyNow();
}
function toRoot(animate) {
  // 뿌리 카드가 읽히는 크기(1배)로, 화면 아래 가운데에 온다.
  state.scale = 1;
  state.tx = view.w / 2;
  state.ty = view.h - insets().bottom - 36;
  state.mode = 'root';
  if (animate) glide();
  applyNow();
}
function zoomAt(factor, px, py) {
  const next = clamp(state.scale * factor, 0.04, 3);
  const k = next / state.scale;
  state.tx = px - (px - state.tx) * k;
  state.ty = py - (py - state.ty) * k;
  state.scale = next;
  state.mode = 'free';
  apply();
}
const center = () => [view.w / 2, view.h / 2];

const pointers = new Map();
let drag = null, pinch = null, suppressClick = false, meter = null;
function startMeter() {
  meter = { stamps: [], on: true };
  const tick = (t) => { if (!meter || !meter.on) return; meter.stamps.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function stopMeter() {
  if (!meter) return;
  meter.on = false;
  const gaps = [];
  for (let i = 1; i < meter.stamps.length; i++) gaps.push(meter.stamps[i] - meter.stamps[i - 1]);
  if (gaps.length > 5) {
    const sorted = [...gaps].sort((a, b) => a - b);
    perf.drag = { frames: gaps.length, avgGap: gaps.reduce((a, b) => a + b, 0) / gaps.length, p95Gap: sorted[Math.floor(sorted.length * 0.95)], maxGap: sorted[sorted.length - 1], over20: gaps.filter((g) => g > 20).length, over34: gaps.filter((g) => g > 34).length };
    if (!state.pick) tell();
  }
  meter = null;
}
stage.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty, live: false };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: state.scale };
    drag = null;
  }
});
stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const before = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const box = stage.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    zoomAt(pinch.scale * d / pinch.d / state.scale, (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
    state.tx += (e.clientX - before.x) / 2; state.ty += (e.clientY - before.y) / 2;
    suppressClick = true;
    return;
  }
  if (!drag || drag.id !== e.pointerId) return;
  if (!drag.live) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.live = true; suppressClick = true;
    stage.dataset.dragging = 'true';
    stage.setPointerCapture(e.pointerId);
    startMeter();
  }
  state.tx = drag.tx + e.clientX - drag.x;
  state.ty = drag.ty + e.clientY - drag.y;
  state.mode = 'free';
  apply();
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && drag.id === e.pointerId) {
    if (drag.live) { stage.dataset.dragging = 'false'; stopMeter(); }
    drag = null;
  }
  // 끌기가 끝난 뒤 뒤따라오는 click 한 번만 막는다.
  if (suppressClick) setTimeout(() => { suppressClick = false; }, 0);
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const box = stage.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - box.left, e.clientY - box.top);
}, { passive: false });
stage.addEventListener('click', (e) => {
  if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
  const node = e.target.closest('[data-id]');
  if (!node) { if (state.pick) setPick(null); return; }
  if (node.dataset.kind === 'moment') { setPick(node.dataset.id); openDetail(node.dataset.id); pushTree('detail'); parent.postMessage({type:MSG.treeDetail,open:true},location.origin); return; }
  // 묶음 가지를 펼치거나 다시 접는다. 그 갈림의 부모 카드가 화면에서 움직이지 않게 자리를 맞춘다.
  const hubId = node.dataset.id.slice(0, node.dataset.id.lastIndexOf(':'));
  const before = state.layout.cards.find((c) => c.id === hubId);
  if (node.dataset.kind === 'bundle') state.expanded.add(hubId); else state.expanded.delete(hubId);
  draw();
  const after = state.layout.cards.find((c) => c.id === hubId);
  state.tx += (before.cx - after.cx) * state.scale;
  state.ty += (before.y - after.y) * state.scale;
  state.mode = 'free';
  applyNow();
  cardsEl.querySelector(`[data-id="${CSS.escape(hubId)}"]`)?.focus({ preventScroll: true });
}, true);
stage.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 240 : 80;
  const [cx, cy] = center();
  if (e.key === 'ArrowLeft') state.tx += step; else if (e.key === 'ArrowRight') state.tx -= step;
  else if (e.key === 'ArrowUp') state.ty += step; else if (e.key === 'ArrowDown') state.ty -= step;
  else if (e.key === '+' || e.key === '=') return zoomAt(1.25, cx, cy);
  else if (e.key === '-') return zoomAt(0.8, cx, cy);
  else if (e.key === 'Home') return toRoot(true);
  else if (e.key === 'Escape') return setPick(null);
  else return;
  e.preventDefault(); state.mode = 'free'; apply();
});
// 자판으로 옮겨 간 카드가 화면 밖이면 안으로 데려온다.
cardsEl.addEventListener('focusin', (e) => {
  if (!e.target.matches(':focus-visible')) return;
  const r = e.target.getBoundingClientRect(), s = stage.getBoundingClientRect(), m = 24;
  const dx = r.left < s.left + m ? s.left + m - r.left : r.right > s.right - m ? s.right - m - r.right : 0;
  const dy = r.top < s.top + m ? s.top + m - r.top : r.bottom > s.bottom - m ? s.bottom - m - r.bottom : 0;
  if (dx || dy) { state.tx += dx; state.ty += dy; state.mode = 'free'; glide(); apply(); }
});

$('goRoot').addEventListener('click', () => toRoot(true));
$('goFit').addEventListener('click', () => fitAll(true));
$('zoomIn').addEventListener('click', () => { glide(); zoomAt(1.3, ...center()); });
$('zoomOut').addEventListener('click', () => { glide(); zoomAt(1 / 1.3, ...center()); });


const data=window.LTDEMO;
const titleSource=el('span','',data.title||'트리');
mountScreenToolbar({screen:'tree',titleFrom:titleSource,initialBar:document.querySelector('.lt-screen-toolbar'),tools:['goRoot','goFit','zoomOut','zoomIn'].map($)});
function openDetail(id){
 const m=data.moments.find(m=>m.id===id);if(!m)return;
 // #1333: 고른 순간을 셸의 현재 순간으로 넘긴다. #1295 기록 중복을 피하려고 '기록하지 않음'을 함께 보낸다.
 if(typeof data.select==='function')data.select(id,{noHistory:true});
 $('treeDetailTitle').textContent=titleMain(m);
 $('treeDetailNote').textContent=[dateText(m),m.emotion,m.memo].filter(Boolean).join(' · ');
 const host=$('treeDetailMedia');host.replaceChildren();
 const src=thumbnailCandidates(m,{autoLoad:data.source==='server'})[0];
 if(src){const img=el('img');img.alt='';img.src=src;img.addEventListener('error',()=>img.remove(),{once:true});host.append(img);}
 if(!detail.open)detail.showModal();
}
$('treeDetailClose').addEventListener('click',()=>detail.close());
// 닫기로 기록을 더 쌓지 않는다 — 현재 칸의 상태만 '상세 닫힘'으로 갱신한다(뒤로 가기는 그 칸을 소비한다).
detail.addEventListener('close',()=>{if(!restoringTree){try{history.replaceState(treeSnapshot(null),'');}catch{}if(state.pick&&typeof data?.select==='function')data.select(state.pick,{noHistory:true});parent.postMessage({type:MSG.treeDetail,open:false},location.origin);}});
$('openMoment').addEventListener('click',()=>{if(state.pick)parent.postMessage({type:MSG.openBook,treeId:data.treeId,id:state.pick},location.origin);});
function rehome(){if(!state.layout)return;if(state.mode==='fit')fitAll(false);else if(state.mode==='root')toRoot(false);else applyNow();rememberTree();}
function load(){
 const moments=data.moments.map(m=>{const thumbs=thumbnailCandidates(m,{autoLoad:data.source==='server'});return {...m,id:String(m.id),parentId:m.parentId==null?null:String(m.parentId),thumb:thumbs[0]||'',thumbs};});
 state.root=buildHierarchy(moments);state.expanded.clear();state.pick=null;
 $('treeEmpty').hidden=!!state.root;stage.hidden=!state.root;
 for(const id of ['goRoot','goFit','zoomOut','zoomIn'])$(id).disabled=!state.root;
 if(!state.root){state.layout=null;note.textContent='순간 0개';return;}
 measure();draw();
 // #1525: 순간이 많을 때는 카드를 누를 수 있는 1배로 열고, 전체 맞춤은 '전체' 단추에서만 한다.
 if(state.root.size>=40)toRoot(false);else fitAll(false);
 // 기본 칸도 트리 상태로 적어 둔다 — 뒤로 가기로 돌아올 때 닫힌 상세와 펼침 상태를 복원한다.
 rememberTree();
 const initialOpen=new URLSearchParams(location.search).get('open')||(history.state?.lt41TreePanel==='detail'?history.state.lt41TreePick:null);
 if(initialOpen&&data.moments.some(m=>m.id===initialOpen)){setPick(initialOpen);openDetail(initialOpen);pushTree('detail');}
}
new ResizeObserver(()=>{const before={...view};measure();if(!state.root||(before.w===view.w&&before.h===view.h))return;if((before.w<700)!==(view.w<700))draw();rehome();}).observe(stage);
addEventListener('message',e=>{
 if(!isShellMessage(e))return;
 if(e.data.type===MSG.dateStyle){
  dateStyle=e.data.value==='dash'||e.data.value==='long'?e.data.value:'dot';
  try{document.documentElement.setAttribute('data-lt-date-style',dateStyle)}catch{}
  if(state.root)draw();
  if(detail.open&&state.pick)openDetail(state.pick);
  return;
 }
 if(e.data.type===MSG.titleDisplay){
  titleDisplay=normalizeTitleDisplay(e.data.value);
  try{localStorage.setItem('lt41.titleDisplay',titleDisplay)}catch{}
  if(state.root)draw();
  if(detail.open&&state.pick)openDetail(state.pick);
  return;
 }
 if(e.data.type===MSG.momentsSaved&&data.refresh()){titleSource.textContent=data.title;load();}
});
load();perf.firstBuildMs=perf.drawMs;requestAnimationFrame(()=>requestAnimationFrame(()=>{perf.firstPaintMs=performance.now();}));
window.__LT_TREE_VIEW__={state,perf,fitAll,toRoot};
