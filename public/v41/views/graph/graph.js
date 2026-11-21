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
import { applyThemeAttribute, readTheme } from '../../header-state.mjs';

const KIND_LABEL = { stage: '무대', song: '노래', member: '멤버', artist: '가수' };
const KIND_OWN = { stage: '이 무대의 내 순간들', song: '이 노래의 내 순간들', member: '이 멤버의 내 순간들', artist: '이 가수의 내 순간들' };
/* 보여주기 3단계 '다른 팬 보기'(#627) — 허브 종류별 칸 제목(소스 상수 — 캡처에서 옮겨 적지 않는다).
   빈 상태 문구는 '아직 ' + 이 문구 + '이 없어요'로 합성한다. */
const OTHER_FANS = { stage: '같은 무대를 본 다른 팬', song: '같은 노래를 담은 다른 팬', member: '같은 멤버를 좋아하는 다른 팬', artist: '같은 가수를 좋아하는 다른 팬' };
const FANS_PREVIEW = 3; /* 처음엔 3개만 — '더 보기'로 나머지(서버 상한 30) */
const KIND_COLOR = { stage: 'var(--lt-gold-deep)', song: 'var(--lt-rose)', member: 'var(--lt-violet, #8b69e8)', artist: 'var(--lt-blue, #547cd0)' };
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('gsvg');

// 테마도 본 사이트와 같은 한 벌(저장 키 lt41.theme) — 셸이 속성을 넘겨 주기 전에 스스로 적용한다(호스트로 열 때도).
applyThemeAttribute(document.documentElement, readTheme(localStorage));

const ctx = parent.LT41 || {};
const tree = ctx.tree || {};
const demo = tree.demoData;
const rawMoments = (demo ? demo.moments : tree.moments || []).map(m => ({ ...m }));
const GRAPH = buildGraph(rawMoments.map(m => ({ ...m, keywords: Array.isArray(m.keywords) ? m.keywords : [] })));
const MOMENT_OF = new Map(rawMoments.map((m) => [m.id, m]));
const model = { graph: GRAPH, narrow: false, W: 0, H: 0 };
let selected = { type: null };
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

/* ── 배치(결정론) — 시안 v2(d6a490f)의 묶음 원형을 그대로 옮긴 것: 허브는 큰 원 위(넓게) 또는 3열 격자(좁게),
   순간은 허브 주위 고리(orbitR)에 시간 순서로, 무더기(stacks)는 고리 위 한 칸 + 개수. ── */
function layoutModel(W, H) {
  const { hubs, moments, stacks } = model.graph;
  const narrow = W < 600;
  const s = narrow ? 1 : Math.max(.94, Math.min(1, W / 1040));
  const shelfH = narrow ? 54 : 62;
  const top = 22;
  const usableBottom = H - shelfH - (narrow ? 16 : 8);
  const dotR = (narrow ? 7 : 8.5) * s;
  /* 고리 위에 보이는 칸 수 — 무더기(stacks)는 대표 하나로 접힌다. */
  const leadCount = (h) => {
    const leads = new Set();
    for (const id of h.momentIds) {
      const m = momentById(id);
      const stack = m?.stackId ? stacks.find((s2) => s2.key === m.stackId) : null;
      leads.add(stack ? stack.leadId : id);
    }
    return leads.size;
  };
  hubs.forEach((h) => {
    const n = leadCount(h);
    const strength = Math.max(1, n);
    h.hr = (narrow ? 9 : 12) + Math.sqrt(strength) * (narrow ? 1.8 : 2);
    const orbitR = n > 0 ? Math.max(h.hr + dotR + (narrow ? 13 : 17), n * (dotR * 2 + 4) / (Math.PI * 2)) : 0;
    h.orbitR = orbitR;
    h.cr = n > 0 ? orbitR + dotR + 5 : h.hr + 8; /* 묶음 테두리는 고리 바깥 */
    h.color = KIND_COLOR[h.kindId];
  });
  const maxC = Math.max(...hubs.map((h) => h.cr), 0);
  const cx = W / 2, cy = (top + usableBottom) / 2 - (narrow ? 0 : 7);
  const rx = Math.max(0, Math.min(W * .36, W / 2 - maxC - 96));
  const ry = Math.max(0, Math.min((usableBottom - top) / 2 - maxC - 48, H * .32));
  /* 좁은 무대: 2열 격자 — 각 칸 = 고리 + 바로 아래 가운데 이름 두 줄. 고리끼리·이름끼리 안 겹치게
     칸 높이를 잡고, 필요하면 세로로 길어진다(세로 스크롤 허용 — 이름을 숨기지 않는 대신). */
  const cols = narrow ? 2 : 3;
  const rows = Math.ceil(hubs.length / cols);
  const maxCr = Math.max(...hubs.map((h) => h.cr), 0);
  const rowH = narrow ? maxCr * 2 + 46 + 12 : (usableBottom - top) / rows;
  if (narrow) {
    const neededH = top + rows * rowH + shelfH + 16;
    if (neededH > H) H = neededH;
    model.rowH = rowH; model.maxCr = maxCr;
  }
  const orderAt = new Map(model.graph.footprint.order.map((id, i) => [id, i]));
  hubs.forEach((h, i) => {
    if (hubs.length === 1) {
      /* 묶음 1개(#864): 위 몰림 배치(-π/2 → 꼭대기) 대신 무대 가운데 — 발자취가 화면의 주인공이 되게.
         좁은 무대는 이름 두 줄(고리 아래 17·37px)이 선반에 닿지 않게 한계를 둔다. */
      h.x = cx;
      h.y = narrow ? Math.min(top + ((H - shelfH - 16) - top) / 2, (H - shelfH - 16) - h.cr - 46) : cy;
    } else if (narrow) {
      const col = i % cols, row = Math.floor(i / cols);
      h.x = (col + .5) * W / cols;
      h.y = top + row * model.rowH + model.maxCr + 10;
    } else {
      const a = -Math.PI / 2 + i * Math.PI * 2 / hubs.length;
      h.x = cx + Math.cos(a) * rx;
      h.y = cy + Math.sin(a) * ry;
    }
    /* 고리 위의 점 순서 = 그 묶음 안의 시간 순서(시계 방향, id 기반 결정론 흔들림) */
    const members = h.momentIds.map((id) => momentById(id)).filter(Boolean).sort(byTime);
    const isLead = (m) => !m.stackId || stacks.find((s2) => s2.key === m.stackId)?.leadId === m.id;
    const visible = members.filter(isLead);
    visible.forEach((m, j) => {
      const a = -Math.PI / 2 + j * Math.PI * 2 / visible.length + hash01(m.id) * .12;
      m.x = h.x + Math.cos(a) * h.orbitR;
      m.y = h.y + Math.sin(a) * h.orbitR;
    });
  });
  /* 무더기에 접힌 순간은 대표 점과 같은 자리(걷기 길이 그 점을 지난다). */
  const leadPos = new Map();
  for (const m of moments) if (m.x != null) leadPos.set(m.id, { x: m.x, y: m.y });
  for (const m of moments) {
    if (m.x != null) continue;
    const stack = m.stackId ? stacks.find((s2) => s2.key === m.stackId) : null;
    const p = stack ? leadPos.get(stack.leadId) : null;
    m.x = p ? p.x : W / 2; m.y = p ? p.y : (H - shelfH) / 2;
  }
  /* 꼬리표 없는 순간 선반: 시간 순서대로 가운데에서 양쪽으로(시안 v2 방식).
     묶음이 없으면(#864) 발자취 줄이 주인공 — 바닥 대신 무대 가운데 가까이(쓸 수 있는 높이의 56%). */
  const shelf = moments.filter((m) => m.hubId === null).sort((a, b) => (orderAt.get(a.id) ?? 0) - (orderAt.get(b.id) ?? 0));
  const gap = narrow ? (W - 76) / Math.max(1, shelf.length - 1) : Math.min(54, (W - 60) / Math.max(1, shelf.length - 1));
  const x0 = (W - gap * Math.max(0, shelf.length - 1)) / 2;
  const rowY = hubs.length === 0 ? Math.round(top + (usableBottom - top) * 0.56) : H - shelfH;
  shelf.forEach((m, i) => { m.x = x0 + i * gap; m.y = rowY; });
  model.footprintRowY = rowY;
  model.narrow = narrow; model.W = W; model.H = H; model.s = s; model.dotR = dotR; model.shelfH = shelfH; model.cx = cx; model.cy = cy;
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
  const W = Math.max(280, Math.round(box.width)), availH = Math.max(300, Math.round(box.height));
  layoutModel(W, availH); /* 좁은 무대에서는 model.H가 필요 높이로 늘어난다 */
  const H = model.H;
  svg.setAttribute('viewBox', '0 0 ' + model.W + ' ' + model.H);
  svg.parentElement.style.height = model.narrow ? model.H + 'px' : '';
  svg.replaceChildren();
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
      el('circle', { cx: h.x, cy: h.y, r: h.cr, class: 'g-ring', 'data-key': h.id, fill: 'none', stroke: h.color, 'stroke-width': selH === h ? 2.4 : 1.2, opacity: dim ? .08 : (selH === h ? .55 : .3) }, ringG);
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
  if (selH) { // 고른 허브의 순간들끼리 시간 순서로만 — 선반(꼬리표 없는) 점과는 잇지 않는다(대표 지적).
    const shelfIds = new Set(model.graph.shelf);
    const segs = pathFor(model.graph, { hubId: selH.id }).segments.filter(([a, b]) => !shelfIds.has(a) && !shelfIds.has(b));
    for (const seg of segs) drawSeg(seg, selH.color, 2.3);
  }
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
    let ay = m.y - 16; /* 점 위 12px → 16px: 글자 아래 4px 이상 띄워 '맞닿아 보임'을 없앤다(#864 캡처 판독) */
    if (ay < 16) ay = m.y + 24;
    for (let tries = 0; tries < 6 && hit(ax, ay, anchor); tries++) ay += 16;
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

  /* 허브 이름 자리(시안 v2 d6a490f 방식): 4방향 시도 → clearLabel — 무대 안 + 이미 놓인 이름 없음 +
     순간 점·허브 점과 닿지 않음(접촉 반경 dotR+3) — 어느 방향도 안 되면 그 묶음 이름을 숨긴다(범례에 남는다). */
  const labelEls = [];
  const placed = [];
  const hit = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const labelRect = (name, sub) => {
    const a = name.getBBox(), b = sub.getBBox();
    return { x: Math.min(a.x, b.x) - 2, y: Math.min(a.y, b.y) - 2, width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x) + 4, height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) + 4 };
  };
  const textOnPoint = (r, point, radius) => {
    const x = Math.max(r.x, Math.min(point.x, r.x + r.width));
    const y = Math.max(r.y, Math.min(point.y, r.y + r.height));
    return Math.hypot(point.x - x, point.y - y) < radius + 3;
  };
  const clearLabel = (r, placedHere) => {
    const shelfH = model.shelfH;
    if (r.x < 6 || r.y < 6 || r.x + r.width > model.W - 6 || r.y + r.height > model.H - shelfH - 6) return false;
    if (placedHere.some((other) => hit(other, r))) return false;
    if (model.graph.moments.some((m) => m.x != null && textOnPoint(r, m, model.dotR + (m.stackId ? 15 : 0)))) return false;
    return !model.graph.hubs.some((h) => textOnPoint(r, h, h.hr));
  };
  const placeHubLabel = (h, name, sub, group, placedHere) => {
    const { W, narrow } = model;
    const maxWidth = narrow ? Math.min(112, W / 3 - 10) : 148;
    while (name.getComputedTextLength() > maxWidth && name.textContent.length > 2) {
      name.textContent = name.textContent.replace(/…?$/, '') + '…';
    }
    const sides = narrow ? ['bottom', 'top', 'right', 'left'] : (Math.abs(h.x - model.cx) > Math.abs(h.y - model.cy)
      ? [h.x < model.cx ? 'left' : 'right', h.y < model.cy ? 'top' : 'bottom', 'bottom', 'top']
      : [h.y < model.cy ? 'top' : 'bottom', h.x < model.cx ? 'left' : 'right', 'right', 'left']);
    for (const side of sides) {
      let x = h.x, y = h.y, anchor = 'middle';
      if (side === 'bottom') y = h.y + h.cr + 16;
      if (side === 'top') y = h.y - h.cr - 34;
      if (side === 'left' || side === 'right') {
        x = h.x + (side === 'left' ? -1 : 1) * (h.cr + 13);
        y = h.y - 7;
        anchor = side === 'left' ? 'end' : 'start';
      }
      if (anchor === 'middle') {
        const width = Math.max(name.getComputedTextLength(), sub.getComputedTextLength());
        x = Math.max(width / 2 + 8, Math.min(x, W - width / 2 - 8));
      }
      name.setAttribute('x', x);
      name.setAttribute('y', y);
      name.setAttribute('text-anchor', anchor);
      sub.setAttribute('x', x);
      sub.setAttribute('y', y + 21);
      sub.setAttribute('text-anchor', anchor);
      const r = labelRect(name, sub);
      if (clearLabel(r, placedHere)) { placedHere.push(r); return r; }
    }
    group.remove();
    return null;
  };
  for (const h of hubs) {
    const dim = dimmed(h.id);
    const g = el('g', { tabindex: '0', role: 'button', 'data-hub-key': h.id, 'data-cr': h.cr.toFixed(1), 'aria-label': KIND_LABEL[h.kindId] + ' ' + h.value + ' · 순간 ' + (h.momentIds.length || '관련 ' + h.linkedIds.length) + '개', opacity: dim ? .14 : 1 }, svg);
    el('circle', { cx: h.x, cy: h.y, r: h.hr, class: 'g-hubdot', fill: h.color, opacity: .95 }, g);
    const fs2 = model.narrow ? 12.5 : 14.5;
    const subText = KIND_LABEL[h.kindId] + ' ' + (h.momentIds.length > 0 ? h.momentIds.length : '관련 ' + h.linkedIds.length);
    const name = el('text', { class: 'g-hubname', style: 'font-size:' + fs2 + 'px' }, g);
    name.textContent = h.value;
    const sub = el('text', { class: 'g-hubname g-hubsub', style: 'font-size:' + Math.max(12, fs2 - 1.5) + 'px' }, g);
    sub.textContent = subText;
    if (model.narrow) {
      /* 좁은 무대(2열 격자): 이름은 자기 고리 바로 아래 가운데 두 줄(이름 / 종류 개수) — 숨기지 않는다.
         길면 …로 줄여 칸 폭 안에 둔다. 칸이 고리+이름을 담도록 layoutModel이 칸 높이를 잡았다. */
      const maxWidth = model.W / 2 - 16;
      while (name.getComputedTextLength() > maxWidth && name.textContent.length > 2) {
        name.textContent = name.textContent.replace(/…?$/, '') + '…';
      }
      name.setAttribute('x', h.x); name.setAttribute('y', h.y + h.cr + 17); name.setAttribute('text-anchor', 'middle');
      sub.setAttribute('x', h.x); sub.setAttribute('y', h.y + h.cr + 37); sub.setAttribute('text-anchor', 'middle');
      labelEls.push({ g, name, sub, count: h.momentIds.length });
    } else {
      const r = placeHubLabel(h, name, sub, g, placed);
      if (r) labelEls.push({ g, name, sub, count: h.momentIds.length, rect: r });
      else g.remove(); /* 넓은 무대에서 자리를 못 찾으면 숨긴다(범례에 이름이 남는다) */
    }
    // #1057: 점에 초점을 두고 Enter·Space를 눌러도 누름과 같은 상세를 연다.
    const activateHub = () => { filterHub = null; stopWalk(); selected = { type: 'hub', key: h.id }; refresh(); };
    g.addEventListener('click', activateHub);
    g.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateHub(); } });
  }
  /* 순간 점: 고리 위 썸네일 동그라미(없으면 묶음 색 점). 무더기(stacks)는 대표 점 + 개수. */
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
    const r = model.dotR + (isSel ? 2.5 : 0);
    const g = el('g', { tabindex: '0', role: 'button', 'data-moment': m.id, 'aria-label': '순간 ' + titleOf(m) + ' · ' + dayOf(m) + (stackN > 1 ? ' · 같은 기록 ' + stackN + '개' : ''), opacity: dim ? .14 : 1 }, dotG);
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
    if (stackN > 1) {
      /* 개수 표시 자리: 점 중심에서 8방향 후보 — 다른 점(원 거리)·허브 점·이미 놓인 이름 상자를 모두 피하는
         첫 후보를 고른다(검사기가 ×N↔점을 원 거리로, 이름 겹침을 상자로 잰다 — CTO 지적 #714 후속). */
      const countEl = el('text', { class: 'g-stackcount', 'text-anchor': 'middle' }, g);
      countEl.textContent = '×' + stackN;
      const bb = countEl.getBBox();
      const w2 = bb.width / 2 + 2, h2 = bb.height / 2 + 2;
      const dotCX = m.x, dotCY = m.y;
      const hubDot = hub ? { x: hub.x, y: hub.y, r: hub.hr } : null;
      const otherDots = moments.filter((o) => o !== m && o.x != null).map((o) => ({ x: o.x, y: o.y, r: model.dotR }));
      const labelBoxes = placed.map((r2) => r2);
      const cand = [
        [r + 12 + w2, -(r + h2 + 6)], [-(r + 12 + w2), -(r + h2 + 6)],
        [r + 12 + w2, r + h2 + 6], [-(r + 12 + w2), r + h2 + 6],
        [r + 12 + w2, 0], [-(r + 12 + w2), 0], [0, -(r + h2 + 16)], [0, r + h2 + 16]
      ];
      const clear2 = (cx2, cy2) => {
        if (cx2 - w2 < 4 || cx2 + w2 > model.W - 4 || cy2 - h2 < 4 || cy2 + h2 > model.H - model.shelfH - 2) return false;
        if (otherDots.some((d) => Math.hypot(cx2 - d.x, cy2 - d.y) < d.r + h2 + 1)) return false;
        if (hubDot && Math.hypot(cx2 - hubDot.x, cy2 - hubDot.y) < hubDot.r + h2 + 1) return false;
        return !labelBoxes.some((r2) => cx2 - w2 < r2.x + r2.width && r2.x < cx2 + w2 && cy2 - h2 < r2.y + r2.height && r2.y < cy2 + h2);
      };
      let chosen = null;
      for (const [dx2, dy2] of cand) {
        const cx2 = dotCX + dx2, cy2 = dotCY + dy2;
        if (clear2(cx2, cy2)) { chosen = { cx: cx2, cy: cy2 }; break; }
      }
      /* 어느 후보도 안 되면: 점 테두리에서 최소 6px 떨어진 오른쪽 위로 물러난다(텍스트 하단이 점 상자에
         닿아 '×N이 점에 겹친다'로 보였다 — 2026-11-16 CTO 지적 #740 캡처). */
      if (!chosen) chosen = { cx: dotCX + r + 12 + w2, cy: dotCY - (r + h2 + 6) };
      countEl.setAttribute('x', (chosen.cx - w2).toFixed(1));
      countEl.setAttribute('y', (chosen.cy + h2).toFixed(1));
    }
    // #1057: 순간 점도 키보드로 같은 감상 상세를 연다.
    const activateMoment = () => { stopWalk(); selected = { type: 'moment', id: m.id }; try { parent.postMessage({ type: 'lt-selection', id: m.id }, location.origin); } catch {} refresh(); };
    g.addEventListener('click', activateMoment);
    g.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateMoment(); } });
  }
  /* 처음·지금 표시는 허브 이름 상자를 피해 자리를 잡는다(좌표계: viewBox 사용자 단위로 통일). */
  const wrapBox = svg.parentElement.getBoundingClientRect();
  const avoidBoxes = [];
  for (const l of labelEls) {
    for (const t of [l.name, l.sub]) {
      const r = t.getBoundingClientRect();
      avoidBoxes.push({ left: r.left - wrapBox.left, top: r.top - wrapBox.top, right: r.right - wrapBox.left, bottom: r.bottom - wrapBox.top });
    }
  }
  for (const t of svg.querySelectorAll('.g-stackcount')) {
    const r = t.getBoundingClientRect();
    avoidBoxes.push({ left: r.left - wrapBox.left, top: r.top - wrapBox.top, right: r.right - wrapBox.left, bottom: r.bottom - wrapBox.top });
  }
  /* '처음'·'지금' 표식이 점(노드)에 겹치지 않게 — 점·허브 점 상자도 피한다(#864 캡처 53).
     자기 점은 15px 옆이라 상자(반경 8.5)와 닿지 않는다. */
  const nodeBoxes = [];
  for (const m of moments) {
    if (m.x == null) continue;
    if (m.stackId && leadOf.get(m.stackId) !== m.id) continue;
    const rr = model.dotR + (m.stackId ? 15 : 0);
    nodeBoxes.push({ left: m.x - rr, right: m.x + rr, top: m.y - rr, bottom: m.y + rr });
  }
  for (const h of hubs) nodeBoxes.push({ left: h.x - h.hr, right: h.x + h.hr, top: h.y - h.hr, bottom: h.y + h.hr });
  for (const [m, text] of marks) markDot(m, text, avoidBoxes.concat(nodeBoxes));
}

/* ── 범례(묶음 (꼬리표 허브)) ── */
function drawLegend() {
  const row = document.getElementById('legendRow');
  row.replaceChildren();
  // #937: 범례 판(.g-card)은 묶음이 있을 때만 보인다 — 묶음 0이면 제목만 있는 빈 줄이 남았다.
  const card = row.closest ? (row.closest('.g-card') || row.parentElement) : row.parentElement;
  const groups = new Map();
  for (const h of model.graph.hubs) {
    // #854: 이름이 서지 않는 묶음(빈 값)은 범례에서도 숨긴다 — 색 점만 남는다.
    if (!String(h.value ?? '').trim()) continue;
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
      const dot = document.createElement('i'); dot.className = 'g-kind-' + h.kindId;
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
  // #937: 그릴 것이 하나도 없으면 판 자체를 숨긴다(빈 줄 0). 하나라도 서면 다시 보인다.
  if (card) card.hidden = !row.childElementCount;
}

/* ── 상세 판 — 순간(발자취 이웃)·허브('이 노래의 내 순간들' 시간 순서) ── */
const chipEl = (kindLabel, value, color) => {
  const c = document.createElement('span'); c.className = 'd-chip';
  const k = document.createElement('span'); k.className = 'chip-kind'; k.textContent = kindLabel;
  const v = document.createElement('b'); v.textContent = value;
  /* 칩 테두리 색(이전 JS 인라인 borderColor를 클래스로 — 종류별 고정값. 기본 --lt-line과 같은 색은 생략) */
  const chipClass = { 'var(--lt-gold-deep)': 'd-chip-stage', 'var(--lt-rose)': 'd-chip-song', 'var(--lt-violet, #8b69e8)': 'd-chip-member', 'var(--lt-blue, #547cd0)': 'd-chip-artist' }[color];
  if (chipClass) c.classList.add(chipClass);
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
    drawOtherFans(card, h);
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

/* ── '같은 노래를 담은 다른 팬'(보여주기 3단계 #627) — 서버 GET /api/public/tag-moments(#695 한 벌).
   공개 경로라 로그아웃 상태에서도 된다. 그 허브의 꼬리표('가수:값' — 서버 parseTag와 같은 표기)로 부른다.
   없으면 한 줄 문구, 불러오기 실패면 이 칸만 조용히 숨긴다(그래프는 그대로). */
const fansCache = new Map(); /* tag → 약속(성공만 — 걷기 매 칫발 다시 부르지 않게) */
const fansShown = new Map(); /* 허브 id → 펼친 개수(상세 판이 다시 그려져도 '더 보기'를 기억) */
function drawOtherFans(card, h) {
  const title = OTHER_FANS[h.kindId] || '같은 꼬리표를 담은 다른 팬';
  const head = document.createElement('div'); head.className = 'd-listhead d-fanshead'; head.textContent = title;
  const box = document.createElement('ul'); box.className = 'd-fans'; box.setAttribute('aria-label', title);
  card.append(head, box);
  const tag = (KIND_LABEL[h.kindId] || '') + ':' + h.value;
  const reqHub = h.id;
  let waiting = fansCache.get(tag);
  if (!waiting) {
    waiting = fetch('/api/public/tag-moments?tag=' + encodeURIComponent(tag)).then((r) => {
      if (!r.ok) throw new Error('fans ' + r.status);
      return r.json();
    });
    waiting.catch(() => fansCache.delete(tag)); /* 실패는 기억하지 않는다 — 다음에 다시 시도 */
    fansCache.set(tag, waiting);
  }
  waiting.then((data) => {
    /* 부르는 동안 선택이 바뀌면 버린다 — 상세 판은 refresh마다 다시 그려진다. */
    if (selected.type !== 'hub' || selectedHub()?.id !== reqHub) return;
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      const li = document.createElement('li'); li.className = 'd-fans-empty';
      li.textContent = '아직 ' + title + '이 없어요';
      box.appendChild(li);
      return;
    }
    const render = (n) => {
      box.replaceChildren();
      for (const item of items.slice(0, n)) box.appendChild(fanRow(item));
      if (items.length > n) {
        const li = document.createElement('li');
        const more = document.createElement('button'); more.type = 'button'; more.className = 'd-fans-more';
        more.textContent = '더 보기 (남은 ' + (items.length - n) + '개)';
        more.addEventListener('click', () => { fansShown.set(reqHub, items.length); render(items.length); });
        li.appendChild(more); box.appendChild(li);
      }
    };
    render(fansShown.get(reqHub) || FANS_PREVIEW);
  }).catch(() => {
    if (selected.type === 'hub' && selectedHub()?.id === reqHub) { head.remove(); box.remove(); }
  });
}
const fanRow = (item) => {
  const li = document.createElement('li');
  const a = document.createElement('a'); a.className = 'd-fans-row'; a.href = String(item.link || '/t/'); a.target = '_blank'; a.rel = 'noopener';
  if (item.thumbnail) {
    const img = document.createElement('img'); img.className = 'd-fans-thumb'; img.alt = ''; img.loading = 'lazy';
    img.src = String(item.thumbnail);
    a.appendChild(img);
  }
  const meta = document.createElement('span'); meta.className = 'd-fans-meta';
  const t = document.createElement('b'); t.textContent = String(item.title || '제목 없는 순간');
  const s = document.createElement('small'); s.textContent = [item.treeTitle, item.date].filter(Boolean).join(' · ');
  meta.append(t, s);
  a.append(meta);
  if (item.aiTester) { const ai = document.createElement('i'); ai.className = 'd-fans-ai'; ai.textContent = 'AI 명예회원'; a.appendChild(ai); }
  li.appendChild(a);
  return li;
};

/* ── 아직 묶음에 안 든 순간 선반 + 제안(제안만 — 확인해야 저장이다) ──
   2026-11-16 CTO 지적: '꼬리표 없는 순간'은 실제 뜻이 아니다 — 꼬리표가 있어도 값이 1개뿐이면
   묶음(허브)에 안 든다. 실제 뜻에 맞게 부른다. */
function drawShelf() {
  const untagged = model.graph.moments.filter((m) => m.hubId === null);
  document.getElementById('shelfLabel').textContent = untagged.length > 0 ? '아직 묶음에 안 든 순간 ' + untagged.length : '';
  /* 빈 판 안내가 떠 있을 때는 선반의 단추를 숨기고 글자만 남긴다 — 안내의 단추와 두 번 연달아
     보이는 것을 막는다(2026-11-16 CTO 지적). 조건은 drawEmptyNote의 안내와 같다(순간 2개 이상·묶음 0).
     묶음이 생겨 안내가 사라지면 단추는 지금처럼 보인다. */
  const guideShown = model.graph.moments.length > 1 && model.graph.hubs.length === 0;
  document.getElementById('shelfHint').hidden = guideShown;
  const gShelf = document.getElementById('gShelf');
  gShelf.classList.toggle('off', untagged.length === 0);
  /* 묶음이 없으면(#864) 선반 글자 줄도 점 행을 따라 가운데로 — 바닥에 남겨 두면 점과 흩어진다.
     점 행 아래 40px(점 반경 8.5 + 여백). 묶음이 생기면 기본 자리(CSS)로 돌아간다. */
  const shelfBar = document.getElementById('gShelf');
  if (model.graph.hubs.length === 0 && model.footprintRowY != null && untagged.length > 0) {
    shelfBar.style.bottom = Math.max(6, Math.round(svg.parentElement.clientHeight - model.footprintRowY - 40)) + 'px';
    /* #864 CTO 2차: 선반 글자 줄도 발자취 덩어리 안으로 — 왼쪽 따로가 아니라 점 행 바로 아래 가운데. */
    shelfBar.classList.add('g-shelf-centered');
  } else {
    shelfBar.style.bottom = '';
    shelfBar.classList.remove('g-shelf-centered');
  }
  const badge = document.getElementById('gBadge');
  const n = model.graph.moments.length;
  badge.textContent = n > 0 ? '순간 ' + n + ' · 묶음 ' + model.graph.hubs.length : '';
}
/* 2026-11-16 대표 결정: 그래프 보기는 지도 안의 보기 하나 — 위 보기 고르기에서 그물형·동심원형을 고르면
   지도 보기 저장 키(lt41.network.view — network.js의 VIEW_KEY 한 벌)에 넣고 기존 화면 전환 메시지
   (lt41-navigate) 한 길로 지도로 돌아간다. 지금 트리·순간은 셸이 그대로 유지한다. */
const goMapWithView = (v) => {
  try { localStorage.setItem('lt41.network.view', v); } catch {}
  try { parent.postMessage({ type: 'lt41-navigate', view: 'track56-network.html' }, location.origin); } catch {}
};
document.getElementById('gViewNet')?.addEventListener('click', () => goMapWithView('network'));
document.getElementById('gViewConc')?.addEventListener('click', () => goMapWithView('tag'));
document.getElementById('gViewGraph')?.addEventListener('click', () => goMapWithView('time'));
/* 제안 목록 — 선반 단추와 빈 판 안내 단추가 같은 한 길로 쓴다. 목록 제목도 실제 뜻으로 부른다
   (2026-11-16 CTO 지적: '꼬리표 없는'이 아니라 '아직 묶음에 안 든'이다). */
function showSuggestions() {
  const untagged = model.graph.moments.filter((m) => m.hubId === null).map((m) => MOMENT_OF.get(m.id)).filter(Boolean);
  try { parent.postMessage({ type: 'lt-suggest-request', momentIds: untagged.map((m) => m.id) }, location.origin); } catch {}
  try { parent.postMessage({ type: 'lt41-open-tags', suggest: true }, location.origin); } catch {}
  const requestSuggestions = ctx.suggestForMoments || suggestForMoments;
  const byMoment = new Map((requestSuggestions(untagged) || []).map((s) => [s.momentId, s.suggestions]));
  const card = document.getElementById('detailCard');
  card.replaceChildren();
  const head = document.createElement('div'); head.className = 'd-kicker'; head.textContent = '아직 묶음에 안 든 순간 ' + untagged.length + ' — 꼬리표 한 번에 제안받기';
  const note = document.createElement('p'); note.className = 'd-memo'; note.textContent = '제안을 고르면 바로 붙어요.';
  const list = document.createElement('ul'); list.className = 'd-list';
  for (const moment of untagged) {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button';
    const title = String(moment.title || moment.subject || '').trim() || '제목 없음';
    const date = String(moment.date || '').trim();
    const d = document.createElement('small'); d.textContent = [date, title].filter(Boolean).join(' · ');
    b.append(d);
    const tags = (Array.isArray(byMoment.get(moment.id)) ? byMoment.get(moment.id) : [])
      .map((p) => (typeof p === 'string' ? p : p?.raw)).map((x) => String(x ?? '').trim()).filter(Boolean);
    if (tags.length) { const t = document.createElement('span'); t.textContent = ' — ' + tags.join(', '); b.append(t); }
    b.addEventListener('click', () => { stopWalk(); selected = { type: 'moment', id: moment.id }; refresh(); });
    li.appendChild(b); list.appendChild(li);
  }
  if (!untagged.length) { const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.textContent = '지금 제안할 꼬리표가 없어요'; li.appendChild(b); list.appendChild(li); }
  card.append(head, note, list);
}
document.getElementById('shelfHint').addEventListener('click', () => showSuggestions());
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'lt41-tags-saved' || !event.data.ok) return;
  const moment = MOMENT_OF.get(event.data.momentId);
  if (!moment) return;
  moment.keywords = Array.isArray(event.data.keywords) ? event.data.keywords : [];
  const rebuilt = buildGraph([...MOMENT_OF.values()].map((m) => ({ ...m, keywords: Array.isArray(m.keywords) ? m.keywords : [] })));
  model.graph = rebuilt;
  if (selected?.type === 'moment' && !momentById(selected?.id)) selected = { type: null };
  refresh();
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
function refresh() { render(); drawLegend(); drawDetail(); drawShelf(); drawEmptyNote(); }
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
/* ── 빈 판 안내: 순간 1개 규칙(설계 §2) + 묶음 0개 안내(2026-11-16 CTO 지적 — 처음 쓰는 고객은
   빈 무대를 고장으로 본다). 안내의 단추는 선반의 '꼬리표 한 번에 제안받기'와 같은 한 길(showSuggestions).
   묶음이 생기면(허브 1개 이상) 안내는 사라진다. ── */
function drawEmptyNote() {
  const n = model.graph.moments.length;
  const hubs = model.graph.hubs.length;
  const empty = document.getElementById('gEmpty');
  /* 묶음이 없으면(#864) 안내 문구·제안 단추를 발자취 줄 바로 위에 붙여 한 덩어리로 —
     화면 한가운데 떠 있는 안내가 아니라 발자취의 안내문이 되게. */
  const rideWithRow = () => {
    if (model.footprintRowY == null) return;
    /* #864 CTO 2차: 단추 아래모서리가 '처음'·'지금' 표식 글자에 걸리지 않게 —
       표식 글자가 있으면 그 가장 위 글자 위 18px까지 올려 붙인다(없으면 점 행 위 16px). */
    const wrapTop = svg.parentElement.getBoundingClientRect().top;
    const markTops = [...svg.querySelectorAll('.g-mark')]
      .map((t) => t.getBoundingClientRect().top - wrapTop)
      .filter((v) => Number.isFinite(v) && v > 0);
    const refY = markTops.length ? Math.min(...markTops) : model.footprintRowY;
    empty.style.top = refY + 'px';
    empty.classList.add('g-empty-riding');
  };
  const rideOff = () => { empty.style.top = ''; empty.classList.remove('g-empty-riding'); };
  if (n === 0) { rideOff(); empty.replaceChildren(); empty.hidden = false; empty.textContent = '아직 남긴 순간이 없어요. 순간을 남기면 흐름이 보여요.'; }
  else if (n === 1) { rideWithRow(); empty.replaceChildren(); empty.hidden = false; empty.textContent = '순간이 하나예요. 다음 순간을 남기면 흐름이 보여요.'; }
  else if (hubs === 0) {
    rideWithRow();
    const p = document.createElement('p');
    p.className = 'g-empty-text';
    p.textContent = '같은 가수·노래·무대 꼬리표가 붙은 순간이 2개 이상이면 여기에 묶여요.';
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'g-empty-cta';
    cta.textContent = '꼬리표 한 번에 제안받기';
    cta.addEventListener('click', () => showSuggestions());
    empty.replaceChildren(p, cta);
    empty.hidden = false;
  }
  else { rideOff(); empty.replaceChildren(); empty.hidden = true; }
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
