// 그래프 보기(#627 2단계 PR3) — 실제 트리(셸이 iframe에 넘기는 LT41.tree)를 graph-model.mjs 한 벌로
// 묶음 원형(결정론)으로 그린다. 설계: docs/GRAPH_VIEW_20261115.md §2·§4(시안 v2를 실제 데이터로 옮긴 것).
// - 허브(노래·멤버·무대·가수)가 큰 점, 순간은 고리 위 썸네일 동그라미(시간 순서 시계 방향).
// - 기본 화면에는 발자취 줄이 없다 — 순간·허브를 고르거나 '발자취 걷기'를 눌렀을 때 그 길만 밝게(대표 결정).
// - 같은 영상·같은 무대(stacks — same-stage.mjs 한 벌)는 한 무더기 + 개수로 접어 그린다.
// - 꼬리표 없는 순간은 아래 선반 + '꼬리표 한 번에 제안받기'(tags.mjs suggestForMoments — 제안만, 저장은 정리 화면).
// - 색·모서리는 identity.css의 --lt-* 토큰만(밤·정원은 속성 전환으로 CSS가 처리한다).
import { buildGraph, pathFor } from '../../graph-model.mjs';
import { suggestForMoments } from '../../tags.mjs';
import { videoKey } from '../../same-stage.mjs';

const KIND_LABEL = { stage: '무대', song: '노래', member: '멤버', artist: '가수' };
const KIND_OWN = { stage: '이 무대의 내 순간들', song: '이 노래의 내 순간들', member: '이 멤버의 내 순간들', artist: '이 가수의 내 순간들' };
const KIND_COLOR = { stage: 'var(--lt-gold-deep)', song: 'var(--lt-rose)', member: 'var(--lt-violet, #8b69e8)', artist: 'var(--lt-blue, #547cd0)' };
const GOLDEN = 137.508 * Math.PI / 180;
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('gsvg');

const ctx = parent.LT41 || {};
const tree = ctx.tree || {};
const demo = tree.demoData;
const rawMoments = (demo ? demo.moments : tree.moments || []).map(m => ({ ...m }));
const GRAPH = buildGraph(rawMoments.map(m => ({ ...m, keywords: Array.isArray(m.keywords) ? m.keywords : [] })));
const MOMENT_OF = new Map(rawMoments.map((m) => [m.id, m]));
const model = { graph: GRAPH, narrow: false, W: 0, H: 0 };
let selected = GRAPH.moments.length ? { type: 'moment', id: GRAPH.footprint.order[0] } : { type: null };
let filterHub = null;
let walkIndex = -1, walkTimer = null;

const thumbOf = (m) => {
  const t = m?.mediaMetadata?.thumbnail;
  if (t) return t;
  const key = videoKey(m?.url || '');
  if (key) return `https://i.ytimg.com/vi/${key}/hqdefault.jpg`;
  const demoImg = ctx.exampleMedia?.[m?.id]?.image;
  return demoImg || '';
};
const dayOf = (m) => String(MOMENT_OF.get(m?.id)?.date || '');
const byTime = (a, b) => dayOf(b).localeCompare(dayOf(a)) || String(b.id).localeCompare(String(a.id));
const momentById = (id) => GRAPH.moments.find((m) => m.id === id) || null;
const hubById = (key) => GRAPH.hubs.find((h) => h.id === key) || null;
const titleOf = (m) => String(MOMENT_OF.get(m?.id)?.title || MOMENT_OF.get(m?.id)?.subject || m?.id || '');
const memoOf = (m) => String(MOMENT_OF.get(m?.id)?.note ?? MOMENT_OF.get(m?.id)?.whyNext ?? '') || '메모 없음';
const emotionOf = (m) => String(MOMENT_OF.get(m?.id)?.emotion || '');
const hash01 = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
const textWidth = (text, fs) => String(text ?? '').length * fs * 0.62;

/* ── 배치(결정론) — 넓은 무대: 황금각 타원(시안 v2). 좁은 무대: 묶음 격자(390이 화면 폭을 다 쓰고,
   이름은 점 바깥 고정 자리 — 겹치면 줄을 옮기고 그래도 겹치면 작은 묶음 이름을 숨긴다). ── */
function layoutModel(W, H) {
  const { hubs, moments, stacks } = model.graph;
  const narrow = W < 860;
  const s = narrow ? Math.max(0.72, Math.min(1, W / 760)) : Math.max(0.9, Math.min(1, W / 1240));
  const shelfH = narrow ? 46 : 52;
  const dotR = (m) => 11 * s;
  /* 고리 반지름은 보이는 점 수(무더기로 접힌 것은 대표 하나) 기준 — 접힌 뒤에도 고리가 점에 맞는다. */
  const leadCount = (h) => {
    const leads = new Set();
    for (const id of h.momentIds) {
      const m = momentById(id);
      const stack = m?.stackId ? model.graph.stacks.find((s2) => s2.key === m.stackId) : null;
      leads.add(stack ? stack.leadId : id);
    }
    return leads.size;
  };
  const hubR = (h) => {
    const base = Math.min(30 * s, Math.max((10 + 2 * leadCount(h)) * s, 12 * s));
    return h.kindId === 'artist' ? base * 0.85 : base;
  };
  const ringR = (h) => {
    const n = Math.max(leadCount(h), 1);
    const mr = 11 * s, gap = 6 * s;
    return Math.max(hubR(h) + mr + 5 * s, (n * (2 * mr + gap)) / (2 * Math.PI) + 3 * s);
  };
  model.narrow = narrow; model.W = W; model.H = H; model.s = s; model.dotR = dotR;
  if (!hubs.length) {
    for (const m of moments) { m.x = W / 2; m.y = (H - shelfH) / 2; }
    return;
  }

  if (!narrow) {
    /* 넓은 무대: 황금각 타원 + 고리 */
    const maxC = Math.max(...hubs.map(ringR), 0);
    const maxR = Math.max(...hubs.map(hubR), 0);
    const top = 20, usableBottom = H - shelfH - 4;
    const cx = W / 2, cy = (top + usableBottom) / 2;
    const horizPad = maxC + maxR + 58, vertPad = maxC + maxR + 30;
    const rx = Math.max(60, W / 2 - horizPad);
    const ry = Math.max(54, (usableBottom - top) / 2 - vertPad);
    hubs.forEach((h, i) => {
      const a = i * GOLDEN + 0.55;
      h.x = cx + Math.cos(a) * rx;
      h.y = cy + Math.sin(a) * ry * 0.84;
      h.color = KIND_COLOR[h.kindId]; h.cr = ringR(h); h.hr = hubR(h);
      placeRing(h);
    });
  } else {
    /* 좁은 무대: 묶음 격자(행·열 고정) — 이름은 묶음 아래 고정 자리. 전체가 남는 높이에 맞게 축소한다. */
    const cols = W >= 700 ? 3 : 2;
    const sorted = [...hubs].sort((a, b) => b.momentIds.length - a.momentIds.length || a.id.localeCompare(b.id));
    let scale = 1;
    for (let pass = 0; pass < 6; pass++) {
      const cellW = W / cols;
      const rows = Math.ceil(sorted.length / cols);
      const cellH = (H - shelfH - 4) / Math.max(rows, 1);
      const need = Math.max(...sorted.map((h) => ringR(h) * scale * 2 + 30), 40);
      if (need <= cellH * 0.9 || scale <= 0.5) {
        sorted.forEach((h, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          const cx = cellW * col + cellW / 2;
          const cy = cellH * row + cellH / 2 + 4;
          h.x = cx; h.y = cy; h.color = KIND_COLOR[h.kindId]; h.cr = ringR(h) * scale; h.hr = hubR(h) * scale;
          placeRing(h);
        });
        break;
      }
      scale *= 0.9;
    }
  }
  /* 발자초 위치: 모든 순간(무더기에 접힌 것은 대표 점과 같은 자리). 선반은 시간 순서(왼쪽부터). */
  const at = new Map();
  for (const h of hubs) for (const id of h.momentIds) at.set(id, { x: h.x, y: h.y });
  const orderAt = new Map(model.graph.footprint.order.map((id, i) => [id, i]));
  const shelfMoments = moments.filter((m) => m.hubId === null).sort((a, b) => (orderAt.get(a.id) ?? 0) - (orderAt.get(b.id) ?? 0));
  const gap = narrow ? 40 : 56, x0 = narrow ? 20 : 96;
  shelfMoments.forEach((m, i) => at.set(m.id, { x: x0 + i * gap, y: H - shelfH }));
  for (const m of moments) {
    const stack = m.stackId ? stacks.find((s2) => s2.key === m.stackId) : null;
    const anchorId = stack ? stack.leadId : m.id;
    const p = at.get(anchorId) || at.get(m.id) || { x: W / 2, y: (H - shelfH) / 2 };
    m.x = p.x; m.y = p.y;
  }
}
function placeRing(h) {
  const members = h.momentIds.map((id) => momentById(id)).filter(Boolean).sort(byTime);
  const base = hash01(h.id) * 2 * Math.PI;
  const isLead = (m) => !m.stackId || model.graph.stacks.find((s2) => s2.key === m.stackId)?.leadId === m.id;
  const visible = members.filter(isLead);
  visible.forEach((m, j) => {
    const aa = base + (j / Math.max(visible.length, 1)) * 2 * Math.PI;
    m.x = h.x + Math.cos(aa) * h.cr;
    m.y = h.y + Math.sin(aa) * h.cr;
  });
}

/* ── 그리기(SVG — 색은 --lt-* 토큰이라 밤·정원 전환이 CSS만으로 처리된다) ── */
const el = (name, attrs, parent) => {
  const n = document.createElementNS(SVGNS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};
const dimmed = (hubKey) => filterHub !== null && filterHub !== hubKey;
const selectedMoment = () => selected.type === 'moment' ? momentById(selected.id) : null;
const selectedHub = () => selected.type === 'hub' ? hubById(selected.key) : null;
const trailD = (pts) => {
  if (pts.length < 2) return '';
  let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
  }
  return d;
};

function render() {
  const box = svg.parentElement.getBoundingClientRect();
  const W = Math.max(280, Math.round(box.width)), H = Math.max(300, Math.round(box.height));
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.replaceChildren();
  layoutModel(W, H);
  const { moments, hubs, footprint } = model.graph;
  const defs = el('defs', {}, svg);
  const selM = selectedMoment(), selH = selectedHub();
  const orderPos = (id) => { const m = momentById(id); return m && m.x != null ? m : null; };
  const trailOrderAll = footprint.order.map(orderPos).filter(Boolean);
  const firstM = trailOrderAll[0], lastM = trailOrderAll[trailOrderAll.length - 1];

  /* 묶음 고리 + 고아 허브 점선 */
  const ringG = el('g', {}, svg);
  const spokeG = el('g', {}, svg);
  for (const h of hubs) {
    const dim = dimmed(h.id);
    if (h.momentIds.length > 0) {
      el('circle', { cx: h.x, cy: h.y, r: h.cr, fill: 'none', stroke: h.color, 'stroke-width': selH === h ? 2.4 : 1.2, opacity: dim ? .08 : (selH === h ? .55 : .3) }, ringG);
    } else {
      for (const id of h.linkedIds) { const m = momentById(id); if (m && m.x != null) el('line', { x1: h.x, y1: h.y, x2: m.x, y2: m.y, stroke: h.color, 'stroke-width': 1.2, opacity: dim ? .08 : .45, 'stroke-dasharray': '3 5' }, spokeG); }
    }
  }

  /* 발자취 줄 — 고른 곳에 걸린 구간(pathFor)·걷기만 그린다(기본 화면에는 없다) */
  const trailG = el('g', {}, svg);
  const drawSeg = (ids, color, width) => {
    const pts = [];
    for (const id of ids) { const p = orderPos(id); if (p && (pts.length === 0 || pts.at(-1) !== p)) pts.push(p); }
    if (pts.length >= 2) el('path', { d: trailD(pts), fill: 'none', stroke: color, 'stroke-width': width, opacity: .92, 'stroke-linecap': 'round' }, trailG);
  };
  if (selM) drawSeg(pathFor(model.graph, { momentId: selM.id }).segments.flat(), 'var(--lt-gold)', 2.6);
  if (selH) drawSeg(pathFor(model.graph, { hubId: selH.id }).segments.flat(), selH.color, 2.3);
  /* 처음·지금 표시는 허브 이름 상자를 피해 자리를 잡는다(이름 배치가 끝난 뒤 그린다 — 아래에서 호출). */
  const markDot = (m, text, avoid) => {
    if (!m || m.x == null) return;
    const ux = (m.x - model.W / 2) / Math.max(Math.hypot(m.x - model.W / 2, m.y - (model.H || H) / 2), 1);
    const tw = textWidth(text, 12.5);
    const hit = (ax, ay, anchor) => {
      const left = anchor === 'end' ? ax - tw : ax;
      return (avoid || []).some((r) => left < r.right && r.left < left + tw && ay - 13 < r.bottom && r.top < ay + 4);
    };
    let anchor = ux >= 0 ? 'start' : 'end';
    let ax = ux >= 0 ? m.x + 15 : m.x - 15;
    if (anchor === 'start' && ax + tw > W - 4) { anchor = 'end'; ax = m.x - 15; }
    if (anchor === 'end' && ax - tw < 4) { anchor = 'start'; ax = m.x + 15; }
    ax = anchor === 'start' ? Math.min(ax, W - tw - 4) : Math.max(ax, tw + 4);
    let ay = m.y - 12;
    if (ay < 16) ay = m.y + 24;
    for (let tries = 0; tries < 4 && hit(ax, ay, anchor); tries++) ay += 16;
    el('text', { x: ax, y: ay, class: 'g-mark', 'text-anchor': anchor }, trailG).textContent = text;
  };
  const marks = [];
  if (walkIndex >= 0) {
    el('path', { d: trailD(trailOrderAll), fill: 'none', stroke: 'var(--lt-gold-line)', 'stroke-width': 1.4, opacity: .3, 'stroke-linecap': 'round' }, trailG);
    el('path', { d: trailD(trailOrderAll.slice(0, Math.max(walkIndex + 1, 2))), fill: 'none', stroke: 'var(--lt-gold)', 'stroke-width': 2.6, opacity: .95, 'stroke-linecap': 'round' }, trailG);
    marks.push([firstM, '처음'], [trailOrderAll[Math.min(walkIndex, trailOrderAll.length - 1)], '지금']);
  } else if (selM || selH) {
    marks.push([firstM, '처음'], [lastM, '지금']);
  }

  /* 허브 점 + 고리 바깥 고정 자리의 이름(이름·종류·개수 한 줄) — 겹치면 줄 이동, 그래도 겹치면 숨김 */
  const labelEls = [];
  for (const h of hubs) {
    const dim = dimmed(h.id);
    const g = el('g', { tabindex: '0', role: 'button', 'aria-label': KIND_LABEL[h.kindId] + ' ' + h.value + ' · 순간 ' + (h.momentIds.length || '관련 ' + h.linkedIds.length) + '개', opacity: dim ? .14 : 1 }, svg);
    el('circle', { cx: h.x, cy: h.y, r: h.hr, fill: h.color, opacity: .95 }, g);
    const ux = (h.x - W / 2) / Math.max(Math.hypot(h.x - W / 2, h.y - H / 2), 1);
    let lx, ly, anchor;
    const fs = model.narrow ? 12.5 : 13.5;
    const subText = KIND_LABEL[h.kindId] + ' ' + (h.momentIds.length > 0 ? h.momentIds.length : '관련 ' + h.linkedIds.length);
    const tw = textWidth(h.value, fs) + 6 + textWidth(subText, Math.max(12, fs - 1.5));
    if (model.narrow) { lx = h.x; ly = h.y + h.cr + 15; anchor = 'middle'; }
    else {
      lx = h.x + ux * (h.cr + 22); ly = h.y + ux * 0 + (h.y - H / 2) / Math.max(Math.hypot(h.x - W / 2, h.y - H / 2), 1) * (h.cr + 24);
      anchor = ux > .45 ? 'start' : ux < -.45 ? 'end' : 'middle';
    }
    if (anchor === 'start' && lx + tw > W - 6) anchor = 'end';
    else if (anchor === 'end' && lx - tw < 6) anchor = 'start';
    else if (anchor === 'middle') { if (lx + tw / 2 > W - 6) anchor = 'end'; else if (lx - tw / 2 < 6) anchor = 'start'; }
    if (anchor === 'start') lx = Math.min(lx, W - tw - 6);
    if (anchor === 'end') lx = Math.max(lx, tw + 6);
    if (anchor === 'middle') lx = Math.min(Math.max(lx, tw / 2 + 4), W - tw / 2 - 4);
    ly = Math.min(Math.max(ly, 16), H - 10);
    const yName = ly;
    /* 폭은 그려진 뒤 실측(getBBox)으로 — 근사 폭은 한글에서 어긋나 이름·보조가 겹친다(검사기가 잡았다).
       자리: start = 이름 lx·보조 오른쪽 / end = 보조 lx(끝)·이름 왼쪽 / middle = 합쳐 중앙. */
    const name = el('text', { x: lx, y: yName, class: 'g-hubname', 'text-anchor': anchor, style: 'font-size:' + fs + 'px' }, g);
    name.textContent = h.value;
    const sub = el('text', { x: lx, y: yName, class: 'g-hubname g-hubsub', 'text-anchor': anchor, style: 'font-size:' + Math.max(12, fs - 1.5) + 'px' }, g);
    sub.textContent = subText;
    const wValue = name.getBBox().width, wSub = sub.getBBox().width;
    if (anchor === 'start') { sub.setAttribute('x', lx + wValue + 6); }
    else if (anchor === 'end') { sub.setAttribute('x', lx); sub.setAttribute('text-anchor', 'end'); name.setAttribute('x', lx - wSub - 6); }
    else { name.setAttribute('text-anchor', 'start'); sub.setAttribute('text-anchor', 'start'); name.setAttribute('x', lx - (wValue + 6 + wSub) / 2); sub.setAttribute('x', lx - (wValue + 6 + wSub) / 2 + wValue + 6); }
    labelEls.push({ g, name, sub, count: h.momentIds.length });
    g.addEventListener('click', () => { filterHub = null; stopWalk(); selected = { type: 'hub', key: h.id }; refresh(); });
  }
  const boxes = labelEls.map((x) => ({ x, r: x.name.getBoundingClientRect(), r2: x.sub.getBoundingClientRect(), dy: 0 }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    for (const [ra, rb] of [[a.r, b.r], [a.r, b.r2], [a.r2, b.r], [a.r2, b.r2]]) {
      if (ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom) {
        if (b.r.top >= a.r.top) b.dy = Math.max(b.dy, a.dy + 17); else a.dy = Math.max(a.dy, b.dy + 17);
      }
    }
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom) {
      if (b.r.top >= a.r.top) b.dy = a.dy + 17; else a.dy = b.dy + 17;
    }
  }
  for (const b of boxes.filter((x) => x.dy)) {
    b.x.name.setAttribute('y', (parseFloat(b.x.name.getAttribute('y')) + b.dy).toFixed(1));
    b.x.sub.setAttribute('y', (parseFloat(b.x.sub.getAttribute('y')) + b.dy).toFixed(1));
  }
  for (let i = 0; i < labelEls.length; i++) for (let j = i + 1; j < labelEls.length; j++) {
    const rA = labelEls[i].name.getBoundingClientRect(), rA2 = labelEls[i].sub.getBoundingClientRect();
    const rB = labelEls[j].name.getBoundingClientRect(), rB2 = labelEls[j].sub.getBoundingClientRect();
    const hit = (r1, r2) => r1.width && r2.width && r1.left < r2.right && r2.left < r1.right && r1.top < r2.bottom && r2.top < r1.bottom;
    if (hit(rA, rB) || hit(rA, rB2) || hit(rA2, rB) || hit(rA2, rB2)) {
      const small = labelEls[i].count <= labelEls[j].count ? labelEls[i] : labelEls[j];
      small.name.style.display = 'none'; small.sub.style.display = 'none'; /* 범례에 이름이 남는다 */
    }
  }

  /* 순간 점: 고리 위 썸네일 동그라미. 무더기(stacks)는 대표 점 + 개수. */
  const dotG = el('g', {}, svg);
  let cid = 0;
  const stackCount = new Map();
  for (const m of moments) if (m.stackId) stackCount.set(m.stackId, (stackCount.get(m.stackId) || 0) + 1);
  const leadOf = new Map();
  for (const s2 of model.graph.stacks) leadOf.set(s2.key, s2.leadId);
  for (const m of moments) {
    if (m.x == null) continue;
    if (m.stackId && leadOf.get(m.stackId) !== m.id) continue; /* 무더기는 대표만 그린다 */
    const hub = m.hubId ? hubById(m.hubId) : null;
    const color = hub ? hub.color : 'var(--lt-muted)';
    const dim = m.hubId ? dimmed(m.hubId) : filterHub !== null;
    const isSel = selM === m;
    const stackN = m.stackId ? (stackCount.get(m.stackId) || 1) : 1;
    const r = model.dotR(m) + (isSel ? 2.5 : 0);
    const g = el('g', { tabindex: '0', role: 'button', 'aria-label': '순간 ' + titleOf(m) + ' · ' + dayOf(m) + (stackN > 1 ? ' · 같은 기록 ' + stackN + '개' : ''), opacity: dim ? .14 : 1 }, dotG);
    g.dataset.moment = m.id;
    const thumb = thumbOf(MOMENT_OF.get(m.id));
    if (thumb) {
      cid += 1;
      const cp = el('clipPath', { id: 'clip' + cid }, defs);
      el('circle', { cx: m.x, cy: m.y, r: r }, cp);
      el('image', { href: thumb, x: m.x - r, y: m.y - r, width: r * 2, height: r * 2, 'clip-path': 'url(#clip' + cid + ')', preserveAspectRatio: 'xMidYMid slice' }, g);
      el('circle', { cx: m.x, cy: m.y, r: r, fill: 'none', stroke: color, 'stroke-width': isSel ? 3 : 1.6, opacity: isSel ? 1 : .85 }, g);
    } else {
      el('circle', { cx: m.x, cy: m.y, r: r, fill: color, stroke: isSel ? 'var(--lt-gold)' : 'var(--lt-stage)', 'stroke-width': isSel ? 3 : 1.4 }, g);
    }
    if (stackN > 1) el('text', { x: m.x, y: m.y + r + 12, class: 'g-stackcount', 'text-anchor': 'middle' }, g).textContent = '×' + stackN;
    g.addEventListener('click', () => { stopWalk(); selected = { type: 'moment', id: m.id }; try { parent.postMessage({ type: 'lt-selection', id: m.id }, location.origin); } catch {} refresh(); });
  }

  /* 처음·지금 표시는 마지막에 그린다 — 허브 이름·무더기 개수 상자를 피해 자리를 잡는다. */
  // 회피 상자를 SVG 사용자 단위로 바꾼다 — markDot의 ax·ay는 viewBox 단위고, getBoundingClientRect는
  // 화면 단위라 좌표계가 다르면 회피가 헛돈다(검사기가 잡은 '지금'×'가수 2' 겹침).
  const wrapBox = svg.parentElement.getBoundingClientRect();
  const avoidBoxes = [];
  const toUser = (r) => ({ left: r.left - wrapBox.left, top: r.top - wrapBox.top, right: r.right - wrapBox.left, bottom: r.bottom - wrapBox.top });
  for (const l of labelEls) {
    avoidBoxes.push(toUser(l.name.getBoundingClientRect()), toUser(l.sub.getBoundingClientRect()));
  }
  for (const t of svg.querySelectorAll('.g-stackcount')) avoidBoxes.push(toUser(t.getBoundingClientRect()));
  for (const [m, text] of marks) markDot(m, text, avoidBoxes);
}

/* ── 범례(품을 꼬리표 뷰) ── */
function drawLegend() {
  const row = document.getElementById('legendRow');
  row.replaceChildren();
  const groups = new Map();
  for (const h of model.graph.hubs) {
    if (!groups.has(h.kindId)) groups.set(h.kindId, []);
    groups.get(h.kindId).push(h);
  }
  const kinds = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const kind of kinds) {
    const wrap = document.createElement('div'); wrap.className = 'g-legend-group';
    const title = document.createElement('div'); title.className = 'g-legend-title';
    title.textContent = KIND_LABEL[kind] + ' ' + groups.get(kind).length;
    wrap.appendChild(title);
    for (const h of groups.get(kind)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'g-legend-item';
      const dot = document.createElement('i'); dot.style.background = KIND_COLOR[h.kindId];
      const label = document.createElement('span'); label.textContent = h.value;
      const n = document.createElement('small'); n.textContent = String(h.momentIds.length || h.linkedIds.length);
      b.append(dot, label, n);
      b.addEventListener('click', () => { stopWalk(); filterHub = filterHub === h.id ? null : h.id; selected = { type: 'hub', key: h.id }; refresh(); });
      wrap.appendChild(b);
    }
    row.appendChild(wrap);
  }
  if (filterHub !== null) {
    const all = document.createElement('button'); all.type = 'button'; all.className = 'g-legend-all'; all.textContent = '전체 보기';
    all.addEventListener('click', () => { filterHub = null; refresh(); });
    row.appendChild(all);
  }
}

/* ── 상세 판 — 순간(발자취 이웃)·허브('이 노래의 내 순간들' 시간 순서) ── */
const chipEl = (kindLabel, value, color) => {
  const c = document.createElement('span'); c.className = 'd-chip';
  const k = document.createElement('span'); k.className = 'chip-kind'; k.textContent = kindLabel;
  const v = document.createElement('b'); v.textContent = value;
  if (color) c.style.borderColor = color;
  c.append(k, v);
  return c;
};
function drawDetail() {
  const card = document.getElementById('detailCard');
  card.replaceChildren();
  if (selected.type === 'hub') {
    const h = selectedHub();
    if (!h) return;
    const kick = document.createElement('div'); kick.className = 'd-kicker'; kick.textContent = KIND_LABEL[h.kindId] + ' 묶음';
    const h2 = document.createElement('h2'); h2.textContent = h.value;
    const date = document.createElement('div'); date.className = 'd-date';
    date.textContent = h.momentIds.length > 0 ? '묶음 순간 ' + h.momentIds.length + '개 · 관련 꼬리표 순간 ' + h.linkedIds.length + '개' : '묶음 없이 관련된 순간 ' + h.linkedIds.length + '개';
    card.append(kick, h2, date);
    if (h.momentIds.length > 0) {
      const listhead = document.createElement('div'); listhead.className = 'd-listhead';
      listhead.textContent = (KIND_OWN[h.kindId] || '이 묶음의 내 순간들') + ' — 시간 순서';
      const list = document.createElement('ul'); list.className = 'd-list';
      const ordered = [...h.momentIds].sort((a, b) => dayOf(momentById(b)).localeCompare(dayOf(momentById(a))) || String(b).localeCompare(String(a)));
      for (const id of ordered) {
        const m = momentById(id);
        const li = document.createElement('li');
        const b = document.createElement('button'); b.type = 'button';
        const d = document.createElement('small'); d.textContent = dayOf(m);
        const t = document.createElement('span'); t.textContent = titleOf(m);
        b.append(d, t);
        b.addEventListener('click', () => { stopWalk(); selected = { type: 'moment', id: m.id }; refresh(); });
        li.appendChild(b); list.appendChild(li);
      }
      card.append(listhead, list);
    }
    return;
  }
  const m = selectedMoment();
  if (!m) return;
  const raw = MOMENT_OF.get(m.id) || {};
  const kick = document.createElement('div'); kick.className = 'd-kicker'; kick.textContent = '순간 · 무대 날짜';
  const h2 = document.createElement('h2'); h2.textContent = titleOf(m);
  const date = document.createElement('div'); date.className = 'd-date'; date.textContent = dayOf(m);
  const chips = document.createElement('div'); chips.className = 'd-chips';
  const emo = emotionOf(m);
  if (emo) { const e2 = document.createElement('span'); e2.className = 'd-chip emo'; e2.textContent = '감정 ' + emo; chips.appendChild(e2); }
  const rawTags = Array.isArray(raw.keywords) ? raw.keywords : [];
  for (const rawTag of rawTags) {
    const p = rawTag.split(':');
    chips.appendChild(chipEl(p.length > 1 ? KIND_LABEL[p[0]] || p[0] : '꼬리표', p.length > 1 ? p.slice(1).join(':') : rawTag, KIND_COLOR[p[0]]));
  }
  if (rawTags.length === 0) chips.appendChild(chipEl('꼬리표', '아직 없음', 'var(--lt-line)'));
  const memo = document.createElement('p'); memo.className = 'd-memo'; memo.textContent = memoOf(m);
  const nav = document.createElement('div'); nav.className = 'd-nav';
  for (const [label, mm] of [['발자취 이전', prevOf(m)], ['발자취 다음', nextOf(m)]]) {
    const b = document.createElement('button'); b.type = 'button';
    const small = document.createElement('small'); small.textContent = mm ? label : label + ' · 없음';
    const span = document.createElement('span'); span.textContent = mm ? titleOf(mm) : '—';
    b.append(small, span);
    if (mm) b.addEventListener('click', () => { stopWalk(); selected = { type: 'moment', id: mm.id }; refresh(); });
    nav.appendChild(b);
  }
  card.append(kick, h2, date, chips, memo, nav);
}
const prevOf = (m) => { const i = model.graph.footprint.order.indexOf(m.id); return i > 0 ? momentById(model.graph.footprint.order[i - 1]) : null; };
const nextOf = (m) => { const i = model.graph.footprint.order.indexOf(m.id); return i >= 0 && i < model.graph.footprint.order.length - 1 ? momentById(model.graph.footprint.order[i + 1]) : null; };

/* ── 꼬리표 없는 순간 선반 + 제안(제안만 — 확인해야 저장이다) ── */
function drawShelf() {
  const untagged = model.graph.moments.filter((m) => m.hubId === null);
  document.getElementById('shelfLabel').textContent = untagged.length > 0 ? '꼬리표 없는 순간 ' + untagged.length : '';
  document.getElementById('gShelf').style.display = untagged.length > 0 ? 'flex' : 'none';
  const badge = document.getElementById('gBadge');
  const n = model.graph.moments.length;
  badge.textContent = n > 0 ? '순간 ' + n + ' · 묶음 ' + model.graph.hubs.length : '';
}
document.getElementById('shelfHint').addEventListener('click', () => {
  const untagged = model.graph.moments.filter((m) => m.hubId === null).map((m) => MOMENT_OF.get(m.id)).filter(Boolean);
  const suggestions = suggestForMoments(untagged);
  const card = document.getElementById('detailCard');
  card.replaceChildren();
  const head = document.createElement('div'); head.className = 'd-kicker'; head.textContent = '꼬리표 한 번에 제안받기';
  const note = document.createElement('p'); note.className = 'd-memo';
  note.innerHTML = '<b>제안일 뿐</b> — 확인한 것만 저장된다. 꼬리표 정리 화면에서 확인해 저장하세요(지금 화면은 저장하지 않는다).';
  const list = document.createElement('ul'); list.className = 'd-list';
  let shown = 0;
  for (const s of suggestions) {
    if (!s.suggestions?.length) continue;
    shown += 1;
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button';
    const d = document.createElement('small'); d.textContent = dayOf(model.graph.moments.find((m) => m.id === s.momentId) || {});
    const t = document.createElement('span'); t.textContent = s.title + ' — ' + s.suggestions.map((p) => p.raw).join(', ');
    b.append(d, t);
    b.addEventListener('click', () => { stopWalk(); selected = { type: 'moment', id: s.momentId }; refresh(); });
    li.appendChild(b); list.appendChild(li);
  }
  if (!shown) { const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.textContent = '지금 제안할 꼬리표가 없어요'; li.appendChild(b); list.appendChild(li); }
  card.append(head, note, list);
});

/* ── 발자초 걷기(시간 순서 전체를 한 점씩 밝히며 걷는다) ── */
const walkBtn = document.getElementById('walkBtn');
function stopWalk() {
  if (walkTimer) { clearInterval(walkTimer); walkTimer = null; }
  walkIndex = -1;
  walkBtn.dataset.on = 'false';
  walkBtn.textContent = '▶ 발자취 걷기 (시간 순서)';
}
walkBtn.addEventListener('click', () => {
  if (walkIndex >= 0) { stopWalk(); refresh(); return; }
  walkIndex = 0;
  walkBtn.dataset.on = 'true'; walkBtn.textContent = '■ 걷기 멈추기';
  walkTimer = setInterval(() => {
    walkIndex += 1;
    if (walkIndex >= model.graph.footprint.order.length) { stopWalk(); }
    refresh();
  }, 550);
});

/* ── 그리기 갱신 ── */
function refresh() { render(); drawLegend(); drawDetail(); drawShelf(); }
let lastW = 0, lastH = 0;
const onResize = () => {
  const box = svg.parentElement.getBoundingClientRect();
  const w = Math.round(box.width), h = Math.round(box.height);
  if (Math.abs(w - lastW) < 8 && Math.abs(h - lastH) < 8) return;
  lastW = w; lastH = h;
  refresh();
};
// 컨테이너 크기가 그리기 뒤에 바뀌면(글꼴 적재·사이드바 등) viewBox와 어긋나 배치가 밀린다 —
// 비율 고정을 풀고(엘리먼트 = viewBox 1:1) 크기 변화마다 다시 그린다(#627 PR3 — 검사기가 잡은 밀림).
svg.setAttribute('preserveAspectRatio', 'none');
new ResizeObserver(() => onResize()).observe(svg.parentElement);
window.addEventListener('resize', onResize);
document.fonts?.ready?.then(() => refresh()).catch(() => {});

/* ── 빈 트리 안내(순간 1개 규칙 — 설계 §2) ── */
function drawEmptyNote() {
  const n = model.graph.moments.length;
  const empty = document.getElementById('gEmpty');
  if (n === 1) { empty.hidden = false; empty.textContent = '순간이 하나예요. 다음 순간을 남기면 흐름이 보여요.'; }
  else if (n === 0) { empty.hidden = false; empty.textContent = '아직 남긴 순간이 없어요. 순간을 남기면 흐름이 보여요.'; }
  else empty.hidden = true;
}

refresh();
drawEmptyNote();
lastW = Math.round(svg.parentElement.getBoundingClientRect().width);

/* 수치 점검(?check=1): 가로 넘침·이름 상자 겹침·오른쪽 여유 — 캡처·검사기와 같은 판정 */
if (new URLSearchParams(location.search).get('check') === '1') {
  setTimeout(() => {
    const de = document.documentElement;
    const boxes = [...document.querySelectorAll('.g-hubname,.g-mark,.g-shelf-label,.g-shelf-hint')]
      .map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    let pairs = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) pairs++;
    }
    const dots = [...svg.querySelectorAll('circle,image')].filter((c) => { const r = c.getBoundingClientRect(); return r.width >= 12; });
    let dotPairs = 0;
    for (const c of dots) { const r = c.getBoundingClientRect(); for (const b of boxes) if (r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom) dotPairs++; }
    const sRect = svg.getBoundingClientRect();
    let clip = 0;
    for (const t of svg.querySelectorAll('text')) { const r = t.getBoundingClientRect(); if (r.width > 0 && (r.right > sRect.right + 1 || r.left < sRect.left - 1)) clip++; }
    let slack = 9999;
    for (const x of document.body.querySelectorAll('*')) {
      if (x.children.length > 0) continue;
      const r = x.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) slack = Math.min(slack, de.clientWidth - r.right);
    }
    console.log('GRAPH_CHECK ' + JSON.stringify({
      w: de.clientWidth, overflowX: Math.max(0, de.scrollWidth - de.clientWidth), labelBoxPairs: pairs,
      dotLabelPairs: dotPairs, svgClipCount: clip, minRightSlack: Math.round(slack),
      thumbs: svg.querySelectorAll('image').length
    }));
  }, 800);
}
