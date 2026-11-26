// #777 경로 재생. 배치와 순간 자료는 읽기만 하며, 선 위의 표시만 갱신한다.
import { branchPoints } from './tree-layout.mjs';

const NS = 'http://www.w3.org/2000/svg';
const SPEEDS = [1, 1.25, 1.5];
const makePath = (d) => {
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('class', 'ts-play-line');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'var(--ts-path)');
  path.setAttribute('stroke-width', '3.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  return path;
};
const pathD = (edge, curve) => 'M' + branchPoints(edge, curve, 24).map(([x, y]) => x.toFixed(2) + ' ' + y.toFixed(2)).join('L');

export function createTreePathPlayer({ layer, cards, controls, isReduced, onState }) {
  let route = [], index = 0, current = null, currentLength = 0, raf = 0, started = 0;
  let elapsed = 0, speed = 1, status = 'idle', stamps = [], pulses = new Set();
  const duration = 620;
  const metrics = { frames: 0, over20: 0, maxGap: 0, finished: false };
  const resetMetrics = () => {
    stamps = []; Object.assign(metrics, { frames: 0, over20: 0, maxGap: 0, finished: false });
  };
  const clearPulse = () => {
    for (const node of pulses) node.classList.remove('is-path-pulse');
    pulses.clear();
  };
  const pulse = (id) => {
    const node = [...cards.children].find((el) => el.dataset.kind === 'moment' && el.dataset.id === id);
    if (!node) return;
    node.classList.add('is-path-pulse');
    pulses.add(node);
    setTimeout(() => { node.classList.remove('is-path-pulse'); pulses.delete(node); }, 460);
  };
  const notify = () => {
    controls.play.textContent = status === 'playing' ? '멈춤' : status === 'paused' ? '계속' : '재생';
    controls.play.setAttribute('aria-label', status === 'playing' ? '경로 재생 멈춤' : status === 'paused' ? '경로 재생 계속' : '경로 재생');
    controls.play.setAttribute('aria-pressed', String(status === 'playing'));
    controls.replay.disabled = !route.length;
    controls.speed.textContent = speed + '배';
    controls.speed.setAttribute('aria-label', '경로 속도 ' + speed + '배, 누르면 다음 속도');
    onState?.({ status, index, count: route.length, speed, metrics: { ...metrics } });
  };
  const end = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; current = null; currentLength = 0; status = 'done'; metrics.finished = true;
    notify();
  };
  const startSegment = () => {
    if (index >= route.length) return end();
    const item = route[index];
    const path = makePath(item.d);
    layer.append(path);
    current = path;
    currentLength = path.getTotalLength();
    path.style.strokeDasharray = String(currentLength);
    path.style.strokeDashoffset = String(currentLength);
    if (isReduced()) {
      path.style.strokeWidth = '5.5px';
      path.style.strokeDashoffset = '0';
      pulse(item.to);
      index += 1;
      return startSegment();
    }
    started = 0; elapsed = 0;
    raf = requestAnimationFrame(tick);
  };
  const tick = (now) => {
    if (status !== 'playing') return;
    if (stamps.length) {
      const delta = now - stamps[stamps.length - 1];
      metrics.frames += 1;
      metrics.maxGap = Math.max(metrics.maxGap, delta);
      if (delta > 20) metrics.over20 += 1;
    }
    stamps.push(now);
    if (!started) started = now;
    const progress = Math.min(1, (elapsed + (now - started) * speed) / duration);
    current.style.strokeDashoffset = String(currentLength * (1 - progress));
    if (progress >= 1) {
      pulse(route[index].to);
      index += 1;
      current = null;
      notify();
      startSegment();
    } else raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    status = 'idle'; index = 0; current = null; currentLength = 0; elapsed = 0;
    clearPulse(); layer.replaceChildren(); notify();
  };
  const configure = (layout, target, curve) => {
    stop(); resetMetrics();
    const byId = new Map(layout.cards.filter((card) => card.kind === 'moment').map((card) => [card.id, card]));
    const byEdge = new Map(layout.edges.filter((edge) => edge.kind === 'moment').map((edge) => [edge.to, edge]));
    const reversed = [];
    const seen = new Set();
    for (let id = target; id && byId.has(id) && !seen.has(id); id = byId.get(id).parentId) {
      seen.add(id);
      const edge = byEdge.get(id);
      if (edge) reversed.push({ to: id, d: pathD(edge, curve) });
    }
    route = reversed.reverse();
    notify();
  };
  const play = () => {
    if (!route.length) { status = 'done'; metrics.finished = true; notify(); return; }
    if (status === 'done' || status === 'idle') {
      if (status === 'done') { layer.replaceChildren(); clearPulse(); }
      index = 0; current = null; currentLength = 0; resetMetrics();
    }
    if (isReduced()) {
      layer.replaceChildren();
      for (const segment of route) {
        const path = makePath(segment.d);
        path.style.strokeWidth = '5.5px';
        layer.append(path);
      }
      index = route.length;
      return end();
    }
    status = 'playing';
    if (current) { started = performance.now(); raf = requestAnimationFrame(tick); }
    else startSegment();
    notify();
  };
  const pause = () => {
    if (status !== 'playing') return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (started) elapsed += (performance.now() - started) * speed;
    started = 0; status = 'paused'; notify();
  };
  controls.play.addEventListener('click', () => status === 'playing' ? pause() : play());
  controls.replay.addEventListener('click', () => { stop(); play(); });
  controls.speed.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    if (status === 'playing' && started) {
      elapsed += (performance.now() - started) * (SPEEDS[(SPEEDS.indexOf(speed) + SPEEDS.length - 1) % SPEEDS.length]);
      started = performance.now();
    }
    notify();
  });
  notify();
  return { configure, stop, play, pause, metrics, get status() { return status; } };
}
