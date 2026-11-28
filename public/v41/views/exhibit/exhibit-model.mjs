// 전시 보기(#1425 시제품) 계산 한 벌 — 차례·쪽 번호·레일 자리·넘김 움직임.
// 화면(exhibit.js)은 그리기와 입력만 맡고 숫자는 모두 여기서 나온다. 시험은 이 파일을 직접 부른다.
// 나무 엮기는 트리 보기의 buildHierarchy 를 그대로 쓴다(형제 차례 = 만든 차례, 깨진 기록도 한 나무로).
import { buildHierarchy } from '../tree/tree-layout.mjs';

export const EXHIBIT_ORDERS = Object.freeze(['path', 'date']);
export const DEFAULT_EXHIBIT_ORDER = 'path';
export const normalizeExhibitOrder = (value) => (EXHIBIT_ORDERS.includes(value) ? value : DEFAULT_EXHIBIT_ORDER);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 트리 차례: 시작 순간에서 먼저 이어진 길을 끝까지 따라간 뒤, 가장 가까운 갈림으로 돌아와 다음 길을 잇는다.
 * (앞에서부터 깊이 우선 — 책·트리 보기에서 읽는 길과 같은 차례다.)
 */
export function pathOrder(moments) {
  const root = buildHierarchy(moments);
  if (!root) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    out.push(node.moment);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return out;
}

function dayOf(moment) {
  const matched = String(moment?.date ?? '').trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (matched) return matched[1] + '-' + matched[2].padStart(2, '0') + '-' + matched[3].padStart(2, '0');
  const created = String(moment?.createdAt ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : '';
}

/** 날짜 차례: 순간 날짜(없으면 만든 날)가 이른 것부터. 같은 날은 만든 차례, 날짜를 모르는 순간은 맨 뒤. */
export function dateOrder(moments) {
  const seen = new Set();
  const rows = [];
  for (const moment of Array.isArray(moments) ? moments : []) {
    if (!moment || moment.id == null || seen.has(moment.id)) continue;
    seen.add(moment.id);
    rows.push({ moment, at: rows.length, day: dayOf(moment), created: String(moment.createdAt ?? '') });
  }
  rows.sort((a, b) => {
    if (a.day !== b.day) return !a.day ? 1 : !b.day ? -1 : a.day < b.day ? -1 : 1;
    if (a.created !== b.created) return a.created < b.created ? -1 : 1;
    return a.at - b.at;
  });
  return rows.map((row) => row.moment);
}

export function orderMoments(moments, order = DEFAULT_EXHIBIT_ORDER) {
  return normalizeExhibitOrder(order) === 'date' ? dateOrder(moments) : pathOrder(moments);
}

/** 쪽 번호. 열 개 미만도 두 자리로 맞추고(01), 백 개가 넘으면 자릿수를 따라간다. */
export function pageNumber(index, count) {
  const width = Math.max(2, String(Math.max(0, count)).length);
  return String(clamp(index, 0, Math.max(0, count - 1)) + 1).padStart(width, '0');
}
export function pageText(index, count) {
  if (!(count > 0)) return '00 / 00';
  return pageNumber(index, count) + ' / ' + pageNumber(count - 1, count);
}

/**
 * 무대 크기 → 레일·장면 자리. 레일은 화면 위쪽 큰 원의 아랫부분이다(가운데가 가장 낮다).
 * narrow = 휴대폰 세로, short = 휴대폰 가로처럼 낮은 창.
 */
export function railMetrics(width, height) {
  const w = Math.max(1, Number(width) || 0);
  const h = Math.max(1, Number(height) || 0);
  const short = h <= 420;
  const narrow = !short && w <= 700;
  const stationY = short ? 30 : narrow ? 46 : clamp(h * 0.11, 64, 104);
  const radius = short ? clamp(w * 1.1, 640, 1800) : narrow ? Math.max(320, w * 0.9) : clamp(w * 0.5, 700, 1320);
  // 이웃 점 사이의 호 길이(px). 이름표가 이 폭 안에 들어간다.
  const nodeArc = short ? 150 : narrow ? 112 : clamp(w * 0.115, 150, 230);
  return {
    width: w, height: h, short, narrow, layout: short ? 'short' : narrow ? 'narrow' : w >= 2000 ? 'huge' : 'wide', stationY, radius,
    cx: w / 2, cy: stationY - radius,
    nodeArc, nodeStep: nodeArc / radius,
    // 장면 사이 거리 = 무대 폭. 쉬고 있을 때 이웃 장면은 정확히 한 화면 밖에 있다.
    sceneSpacing: w
  };
}

/** 레일 위 점 하나의 자리. phase 는 지금 가운데에 온 차례(소수 가능). */
export function railNode(index, phase, metrics) {
  const d = index - phase;
  const distance = Math.abs(d);
  const turn = d * metrics.nodeStep;
  const x = metrics.cx + metrics.radius * Math.sin(turn);
  const y = metrics.cy + metrics.radius * Math.cos(turn);
  const inside = x > -metrics.nodeArc && x < metrics.width + metrics.nodeArc && y > -28 && turn > -1.4 && turn < 1.4;
  return {
    x, y, distance,
    visible: inside,
    active: distance < 0.5,
    // 이름표는 가운데와 가까운 이웃만(좁은 화면은 양옆 하나씩). 무대 위 끝에 걸려 잘리는 자리는 점만 둔다.
    labelled: y > 8 && distance < (metrics.narrow ? 1.45 : 2.6),
    fade: clamp(1 - distance * 0.16, 0.28, 1)
  };
}

/** 장면 하나의 자리. 쉬고 있을 때 이웃 장면은 화면 밖에 있다(한 번에 주인공 하나). */
export function sceneSlot(index, phase, metrics) {
  const d = index - phase;
  const distance = Math.abs(d);
  return {
    x: d * metrics.sceneSpacing,
    scale: clamp(1 - distance * 0.04, 0.92, 1),
    opacity: clamp(1 - distance, 0, 1),
    active: distance < 0.5
  };
}

/** 지금 그려 둘 장면 범위(가운데 ± reach). 순간이 많아도 장면 DOM 은 이 범위만 만든다. */
export function sceneWindow(phase, count, reach = 1) {
  if (!(count > 0)) return [0, -1];
  const lo = clamp(Math.floor(phase) - reach, 0, count - 1);
  const hi = clamp(Math.ceil(phase) + reach, 0, count - 1);
  return [lo, hi];
}

/* ── 넘김 움직임 ─────────────────────────────────────────────────────── */

export function createMotion(count, start = 0) {
  const max = Math.max(0, count - 1);
  const at = clamp(Math.round(Number(start) || 0), 0, max);
  return { phase: at, target: at, velocity: 0, max };
}

/** 목표 차례를 정한다. 멀리 건너뛸 때(3장 넘게)는 목표 바로 옆으로 옮긴 뒤 마지막 한 장만 움직인다. */
export function aimMotion(motion, index, { jump = false } = {}) {
  const target = clamp(Math.round(index), 0, motion.max);
  const gap = target - motion.phase;
  if (jump) { motion.phase = target; motion.velocity = 0; }
  else if (Math.abs(gap) > 3) { motion.phase = target - Math.sign(gap); motion.velocity = 0; }
  motion.target = target;
  return target;
}

/**
 * 한 프레임 움직인다. frames 는 60분의 1초를 1로 본 경과(느린 프레임은 2.5까지).
 * 움직임 줄이기(reduced)면 곧바로 목표에 선다. 더 움직일 것이 있으면 true.
 */
export function stepMotion(motion, frames = 1, { reduced = false } = {}) {
  if (reduced) {
    motion.phase = motion.target;
    motion.velocity = 0;
    return false;
  }
  const dt = clamp(Number(frames) || 1, 0.25, 2.5);
  const gap = motion.target - motion.phase;
  // 시안의 값(당김 0.075·감쇠 0.8)은 목표를 22% 지나쳤다가 돌아온다 — 장면 간격이 한 화면이라 크게 출렁인다.
  // 지나침이 2% 아래로 가라앉는 값으로 바꿨다(한 장 넘김 약 0.6초).
  motion.velocity += gap * 0.06 * dt;
  motion.velocity *= Math.pow(0.7, dt);
  motion.velocity = clamp(motion.velocity, -0.16, 0.16);
  motion.phase = clamp(motion.phase + motion.velocity * dt, 0, motion.max);
  if (Math.abs(motion.target - motion.phase) < 0.002 && Math.abs(motion.velocity) < 0.002) {
    motion.phase = motion.target;
    motion.velocity = 0;
    return false;
  }
  return true;
}

/** 끌기를 놓았을 때 설 차례. 조금만 끌어도(20%) 그 방향으로 한 장, 빠르게 튕기면 한 장 더는 가지 않는다. */
export function releaseTarget(phase, startIndex, velocityPerFrame, max) {
  const moved = phase - startIndex;
  let target = Math.round(phase);
  if (target === startIndex) {
    // 놓는 순간의 빠르기가 있으면 그 방향이 먼저다(끌다가 되돌려 튕기면 되돌아간다). 없으면 끈 거리로 정한다.
    if (Math.abs(velocityPerFrame) > 0.012) target = startIndex + Math.sign(velocityPerFrame);
    else if (Math.abs(moved) > 0.2) target = startIndex + Math.sign(moved);
  }
  return clamp(target, 0, max);
}

/**
 * 휠 묶음: 굴린 양이 문턱을 넘으면 한 장 넘기고 잠깐(쉬는 시간) 쉰다.
 * 마우스 한 칸 = 한 장, 터치패드의 긴 밀기는 쉬는 시간마다 한 장씩 넘어간다.
 */
export function createWheelGate({ threshold = 50, restMs = 240 } = {}) {
  let sum = 0, lastAt = -Infinity, restUntil = -Infinity;
  return function wheel(deltaX, deltaY, now) {
    const raw = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
    if (!Number.isFinite(raw) || raw === 0) return 0;
    if (now < restUntil) { lastAt = now; return 0; }
    if (now - lastAt > 180 || Math.sign(raw) !== Math.sign(sum)) sum = 0;
    lastAt = now;
    sum += raw;
    if (Math.abs(sum) < threshold) return 0;
    const step = Math.sign(sum);
    sum = 0;
    restUntil = now + restMs;
    return step;
  };
}

/** 작품 틀의 가로세로 비(가로÷세로). 유튜브는 16:9·9:16 고정, 사진은 실제 비율을 9:16~16:9 안으로. */
export function artRatio(kind, naturalWidth, naturalHeight) {
  if (kind === 'youtube') return 16 / 9;
  if (kind === 'youtube-vertical') return 9 / 16;
  const w = Number(naturalWidth), h = Number(naturalHeight);
  if (!(w > 0) || !(h > 0)) return 4 / 3;
  return clamp(w / h, 9 / 16, 16 / 9);
}

/** 작은 그림을 억지로 키우지 않는다: 보이는 폭은 원본 폭의 scale 배까지. 유튜브 4:3 썸네일은 위아래 띠를 뺀 그림 폭으로 센다. */
export function artWidthCap(naturalWidth, scale = 1.35) {
  const w = Number(naturalWidth);
  return w > 0 ? Math.round(w * scale) : 0;
}
