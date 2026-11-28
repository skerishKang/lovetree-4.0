// 전시 보기(#1425 시제품) — 트리 하나를 전시처럼, 순간 하나를 전시물 하나로 넘겨 본다.
// 숫자(차례·자리·움직임)는 exhibit-model.mjs, 여기는 그리기와 입력만 맡는다.
// 데이터·동작은 다른 보기와 같은 공용 길을 쓴다: 순간은 runtime.js 의 LTDEMO, 책 열기·선택 알림은 셸 메시지,
// 재생은 공용 크게 보기(LTMedia.openLightbox). 저장·주소·방문 기록은 셸이 맡는다.
import { mountScreenToolbar } from '/v41/screen-toolbar.mjs';
import { MSG, isShellMessage } from '/v41/frame-messages.mjs';
import { formatDisplayDate, titleView, readTitleDisplay, normalizeTitleDisplay } from '/v41/book-usability.mjs';
import { localDateOnly } from '/v41/local-date.mjs';
import { thumbnailCandidates, nextThumbnailStep, emotionToneOf, localOrPrivatePhoto, youtubeIdFrom, youtubeStageThumbUrl, isVerticalMoment, siteNameOf } from '/v41/thumb-fallback.mjs';
import {
  normalizeExhibitOrder, orderMoments, pageNumber, pageText, railMetrics, railNode, sceneSlot, sceneWindow,
  createMotion, aimMotion, stepMotion, releaseTarget, createWheelGate, artRatio, artWidthCap
} from './exhibit-model.mjs';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const stage = $('stage'), world = $('world'), nodesEl = $('nodes'), ring = $('ring'), station = $('station');
const live = $('live'), countEl = $('exCount'), prevBtn = $('exPrev'), nextBtn = $('exNext'), progressFill = $('progressFill');
const detail = $('exDetail');
const data = window.LTDEMO;
const abort = new AbortController();
const on = (target, type, fn, options) => target.addEventListener(type, fn, { signal: abort.signal, ...(options || {}) });
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 개발용 값(시제품): 차례(?order=path|date)와 사진 흑백 끄기(?mono=off). 셸 주소와 이 화면 주소 둘 다에서 읽는다.
const order = normalizeExhibitOrder('path');

let dateStyle = 'dot';
try { const value = root.getAttribute('data-lt-date-style') || localStorage.getItem('lt41.dateStyle'); dateStyle = value === 'dash' || value === 'long' ? value : 'dot'; } catch {}
const readTitleSetting = () => { try { return readTitleDisplay(parent.LT41?.prefs ? parent.LT41 : { titleDisplay: localStorage.getItem('lt41.titleDisplay') }); } catch { return 'both'; } };
let titleDisplay = readTitleSetting();
const dateText = (m) => formatDisplayDate(m.date || (m.createdAt ? localDateOnly(m.createdAt) : ''), dateStyle);
const autoLoad = data.source === 'server';

const osReduced = matchMedia('(prefers-reduced-motion: reduce)');
let shellPaused = false;
const reduced = () => osReduced.matches || shellPaused;
const paintMotion = () => { if (reduced()) root.dataset.exMotion = 'reduce'; else delete root.dataset.exMotion; };

let items = [];
let metrics = railMetrics(1, 1);
let motion = createMotion(0);
let settledIndex = -1;
let raf = 0, lastFrame = 0, drawQueued = 0;
let drag = null, suppressClick = false, restoring = false;
const scenes = new Map();
let nodeButtons = [];
let shownNodes = new Set();
const wheelGate = createWheelGate();
const perf = { frames: [], sceneBuilds: 0 };

/* ── 순간 → 전시물 ───────────────────────────────────────────────────── */

function heroCandidates(m, videoId, ownPhoto, vertical) {
  const base = thumbnailCandidates(m, { autoLoad, vertical: videoId ? vertical : null });
  if (!autoLoad || !videoId || ownPhoto) return base;
  // 큰 그림부터: 가로 영상은 maxresdefault, 세로 영상은 원본 비율(oardefault). 없으면 공용 차례(저장된 썸네일 → hq → mq)로 내려간다.
  const first = youtubeStageThumbUrl(videoId, vertical ? 'oardefault' : 'maxresdefault');
  return [...new Set([first, ...base].filter(Boolean))];
}

function toItem(m, index, count) {
  const view = titleView(m, titleDisplay);
  const url = String(m.externalUrl || m.url || '');
  const videoId = youtubeIdFrom(url);
  const ownPhoto = localOrPrivatePhoto(m);
  const vertical = !!videoId && !ownPhoto && isVerticalMoment(m);
  const media = window.LTMedia?.describe(url) || { kind: 'none', openUrl: '' };
  return {
    moment: m, id: String(m.id), index,
    number: pageNumber(index, count),
    title: view.main || String(m.title || '').trim() || '제목 없음',
    sub: view.sub,
    memo: String(m.memo || '').trim(),
    emotion: String(m.emotion || '').trim(),
    tone: emotionToneOf(m.emotion),
    date: dateText(m),
    url, media, videoId, vertical,
    photo: !!ownPhoto,
    artKind: ownPhoto ? 'photo' : videoId ? (vertical ? 'youtube-vertical' : 'youtube') : 'photo',
    candidates: heroCandidates(m, videoId, ownPhoto, vertical),
    kindLabel: media.kind === 'youtube' ? '영상' : media.kind === 'video' ? '영상' : media.kind === 'photo' ? '사진' : media.kind === 'link' ? (siteNameOf(url) || '링크') : '글',
    thumb: null, thumbFailed: false
  };
}

function reasonFor(item) {
  const m = item.moment;
  if (m.parentId == null) return '';
  const edge = (data.edges || []).find((e) => e.kind === 'parent' && String(e.to) === item.id);
  const parent = items.find((it) => it.id === String(m.parentId));
  const why = String(m.relation || edge?.reason || '').trim();
  if (!parent) return why;
  return why ? '‘' + parent.title + '’에서 — ' + why : '‘' + parent.title + '’에서 이어진 순간';
}

/* ── 그리기 ─────────────────────────────────────────────────────────── */

function buildNodes() {
  shownNodes = new Set();
  nodeButtons = new Array(items.length);
  nodesEl.replaceChildren();
}
function makeNode(item) {
  {
    const node = el('button', 'ex-node');
    node.type = 'button';
    node.hidden = true;
    node.tabIndex = -1;
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-selected', 'false');
    node.dataset.index = String(item.index);
    node.title = item.title;
    node.setAttribute('aria-label', item.number + '번째 순간 · ' + item.title);
    node.append(el('span', 'ex-node-dot'), el('span', 'ex-node-label', item.title));
    return node;
  }
}

function placard(item) {
  const card = el('button', 'ex-placard');
  card.type = 'button';
  card.dataset.open = item.id;
  card.setAttribute('aria-label', item.title + ' — 순간 보기');
  const text = item.memo || item.title;
  card.append(el('span', 'ex-placard-kind', item.kindLabel), el('span', 'ex-placard-text', text), el('span', 'ex-placard-foot', [item.emotion, item.date].filter(Boolean).join(' · ')));
  item.placardShowsMemo = !!item.memo;
  return card;
}

function applyThumb(button, item, scene) {
  // 세로로 긴 작품은 좁은 화면에서 위 여백이 없어 뒤 큰 낱말을 감춘다(CSS 가 is-tall 을 본다).
  scene.classList.toggle('is-tall', item.thumb.ratio < 1.1);
  button.style.setProperty('--ex-ar', item.thumb.ratio.toFixed(4));
  if (item.thumb.cap) button.style.setProperty('--ex-cap-w', item.thumb.cap + 'px');
  button.classList.add('is-ready');
}

function artwork(item, scene) {
  if (!item.candidates.length || item.thumbFailed) { scene.classList.add('is-text'); return placard(item); }
  const frame = el('div', 'ex-frame');
  const button = el('button', 'ex-art');
  button.type = 'button';
  button.dataset.open = item.id;
  button.setAttribute('aria-label', item.title + ' — 순간 보기');
  button.style.setProperty('--ex-ar', artRatio(item.artKind, 0, 0).toFixed(4));
  const img = el('img');
  img.alt = ''; img.decoding = 'async'; img.draggable = false; img.referrerPolicy = 'no-referrer';
  // 이미 고른 그림이 있으면(장면을 다시 만들 때) 그 차례에서 이어 간다 — 처음부터 다시 세면 고른 주소가 뒤바뀐다.
  let index = item.thumb ? item.thumb.index : 0;
  const judge = (error) => {
    const step = nextThumbnailStep(item.candidates, index, { error, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    if (step.status === 'retry') { index = step.index; img.src = step.src; return; }
    if (step.status === 'fallback') {
      item.thumbFailed = true;
      scene.classList.remove('is-photo'); scene.classList.add('is-text');
      const card = placard(item);
      frame.replaceWith(card);
      scene.querySelector('.ex-memo')?.toggleAttribute('hidden', !!item.placardShowsMemo);
      return;
    }
    // 유튜브 4:3 썸네일(480×360)은 위아래 검은 띠를 뺀 16:9 그림만 보이므로, 키우는 한계도 그림 폭으로 센다.
    const pictureWidth = item.artKind === 'youtube-vertical' ? Math.min(img.naturalWidth, img.naturalHeight * 9 / 16) : img.naturalWidth;
    item.thumb = { src: step.src, index: step.index, ratio: artRatio(item.artKind, img.naturalWidth, img.naturalHeight), cap: artWidthCap(pictureWidth), width: img.naturalWidth, height: img.naturalHeight };
    applyThumb(button, item, scene);
  };
  on(img, 'load', () => judge(false));
  on(img, 'error', () => judge(true));
  if (item.thumb) applyThumb(button, item, scene);
  img.src = item.candidates[index];
  if (item.photo) scene.classList.add('is-photo');
  if (item.vertical) scene.classList.add('is-vertical');
  button.append(img);
  frame.append(button);
  return frame;
}

function buildScene(item) {
  perf.sceneBuilds += 1;
  const scene = el('article', 'ex-scene');
  scene.dataset.index = String(item.index);
  scene.dataset.id = item.id;
  scene.setAttribute('aria-label', [item.number + '번째 순간', item.title, item.date, item.emotion].filter(Boolean).join(' · '));
  const piece = el('div', 'ex-piece');
  const floor = el('span', 'ex-floor'); floor.setAttribute('aria-hidden', 'true');
  // 뒤 큰 낱말(감정)은 장식이다 — 글자 노드가 아니라 CSS 생성 글자로 그려 읽어 주기·글자 겹침 검사 대상에서 뺀다.
  // 넓은 화면은 글 뒤(is-side), 좁은 화면은 작품 위쪽(is-top)에 둔다. 둘 중 하나만 보인다.
  const ghost = (where) => { const g = el('span', 'ex-ghost ' + where); g.dataset.word = item.emotion; g.setAttribute('aria-hidden', 'true'); return g; };
  if (item.emotion) piece.append(ghost('is-top'));
  piece.append(artwork(item, scene), floor);
  const note = el('div', 'ex-note');
  const dot = el('i', 'ex-dot'); dot.dataset.tone = String(item.tone); dot.setAttribute('aria-hidden', 'true');
  const copy = el('div', 'ex-copy');
  copy.append(el('p', 'ex-eyebrow', [item.number, item.date].filter(Boolean).join(' · ')));
  const title = el('h2', 'ex-title', item.title); title.title = item.title;
  copy.append(title);
  if (item.sub) copy.append(el('p', 'ex-sub', item.sub));
  if (item.memo) { const memo = el('p', 'ex-memo', item.memo); memo.hidden = !!item.placardShowsMemo && scene.classList.contains('is-text'); copy.append(memo); }
  const open = el('button', 'ex-open', '순간 보기');
  open.type = 'button'; open.dataset.open = item.id;
  copy.append(open);
  if (item.emotion) note.append(ghost('is-side'));
  note.append(dot, copy);
  scene.append(piece, note);
  return scene;
}

function syncScenes() {
  const [lo, hi] = sceneWindow(motion.phase, items.length, 1);
  for (const [index, scene] of scenes) if (index < lo || index > hi) { scene.remove(); scenes.delete(index); }
  for (let index = lo; index <= hi; index++) {
    if (scenes.has(index)) continue;
    const scene = buildScene(items[index]);
    scenes.set(index, scene);
    world.append(scene);
  }
}

function draw() {
  drawQueued = 0;
  if (!items.length) return;
  syncScenes();
  const phase = motion.phase;
  for (const [index, scene] of scenes) {
    const slot = sceneSlot(index, phase, metrics);
    scene.style.setProperty('--x', slot.x.toFixed(1) + 'px');
    scene.style.setProperty('--s', slot.scale.toFixed(4));
    scene.style.setProperty('--o', slot.opacity.toFixed(3));
    scene.classList.toggle('is-active', slot.active);
  }
  const next = new Set();
  const lo = Math.max(0, Math.floor(phase) - 9), hi = Math.min(items.length - 1, Math.ceil(phase) + 9);
  for (let index = lo; index <= hi; index++) {
    const at = railNode(index, phase, metrics);
    if (!at.visible) continue;
    let node = nodeButtons[index];
    if (!node) { node = makeNode(items[index]); nodeButtons[index] = node; nodesEl.append(node); }
    next.add(index);
    node.hidden = false;
    node.style.setProperty('--x', at.x.toFixed(1) + 'px');
    node.style.setProperty('--y', at.y.toFixed(1) + 'px');
    node.style.setProperty('--fade', at.fade.toFixed(2));
    node.classList.toggle('is-active', at.active);
    node.classList.toggle('is-labelled', at.labelled);
  }
  for (const index of shownNodes) if (!next.has(index) && nodeButtons[index]) { nodeButtons[index].remove(); nodeButtons[index] = undefined; }
  shownNodes = next;
  const nearest = clamp(Math.round(phase), 0, items.length - 1);
  countEl.textContent = pageText(nearest, items.length);
  progressFill.style.setProperty('--p', ((phase + 1) / items.length).toFixed(4));
}
const queueDraw = () => { if (!drawQueued) drawQueued = requestAnimationFrame(draw); };

/* ── 넘김 ───────────────────────────────────────────────────────────── */

function settle() {
  stage.dataset.moving = 'false';
  const index = clamp(Math.round(motion.phase), 0, Math.max(0, items.length - 1));
  const changed = index !== settledIndex;
  settledIndex = index;
  for (const [at, scene] of scenes) {
    const active = at === index;
    scene.inert = !active;
    if (active) scene.removeAttribute('aria-hidden'); else scene.setAttribute('aria-hidden', 'true');
  }
  nodeButtons.forEach((node, at) => {
    node.tabIndex = at === index ? 0 : -1;
    node.setAttribute('aria-selected', String(at === index));
  });
  prevBtn.disabled = index <= 0;
  nextBtn.disabled = index >= items.length - 1;
  if (!changed) return;
  const item = items[index];
  if (!item) return;
  live.textContent = [pageText(index, items.length), item.title, item.date, item.emotion].filter(Boolean).join(' · ');
  // 지금 보는 순간을 셸의 현재 순간으로 알린다(방문 기록은 늘리지 않는다) — 책·보드로 옮겨도 같은 순간이 이어진다.
  if (!restoring && typeof data.select === 'function' && data.get?.() !== item.id) data.select(item.id, { noHistory: true });
  remember();
}

function tick(now) {
  raf = 0;
  const frames = (now - lastFrame) / 16.667;
  perf.frames.push(now - lastFrame);
  if (perf.frames.length > 600) perf.frames.shift();
  lastFrame = now;
  const moving = stepMotion(motion, frames, { reduced: reduced() });
  draw();
  if (moving) raf = requestAnimationFrame(tick);
  else settle();
}
function run() {
  if (drag?.live) return;
  if (reduced()) { stepMotion(motion, 1, { reduced: true }); draw(); settle(); return; }
  if (raf) return;
  stage.dataset.moving = 'true';
  lastFrame = performance.now();
  raf = requestAnimationFrame(tick);
}
function goTo(index, { jump = false } = {}) {
  if (!items.length) return;
  aimMotion(motion, index, { jump });
  if (jump) { draw(); settle(); return; }
  run();
}
const step = (direction) => goTo(Math.round(motion.target) + direction);

/* ── 순간 상세 ───────────────────────────────────────────────────────── */

function snapshot(panel) { return { lt41Exhibit: true, lt41ExhibitPanel: panel || null, lt41ExhibitId: items[settledIndex]?.id || '' }; }
function remember() { if (restoring) return; try { history.replaceState(snapshot(detail.open ? 'detail' : null), ''); } catch {} }

function fillDetail(item) {
  $('exDetailKicker').textContent = ['순간 ' + item.number, item.date, item.emotion].filter(Boolean).join(' · ');
  $('exDetailTitle').textContent = item.title;
  const sub = $('exDetailSub'); sub.textContent = item.sub || ''; sub.hidden = !item.sub;
  const media = $('exDetailMedia');
  media.replaceChildren();
  let noteInMedia = false;
  if (item.thumb) {
    const still = el('div', 'ex-still' + (item.photo ? ' is-photo' : ''));
    still.style.setProperty('--ex-ar', item.thumb.ratio.toFixed(4));
    const img = el('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = item.thumb.src;
    still.append(img); media.append(still);
  } else if (item.memo) { media.append(el('p', 'ex-quote', item.memo)); noteInMedia = true; }
  media.hidden = !media.childElementCount;
  media.parentElement.classList.toggle('is-plain', media.hidden);
  const noteBlock = $('exDetailNoteBlock');
  $('exDetailNote').textContent = item.memo;
  noteBlock.hidden = !item.memo || noteInMedia;
  const why = reasonFor(item);
  $('exDetailWhy').textContent = why;
  $('exDetailWhyBlock').hidden = !why;
  const play = $('exDetailPlay');
  const kind = item.media.kind;
  play.hidden = !['youtube', 'video', 'photo', 'link'].includes(kind) || typeof window.LTMedia?.openLightbox !== 'function';
  play.textContent = kind === 'youtube' || kind === 'video' ? '재생' : kind === 'photo' ? '크게 보기' : '원본 링크 열기';
  play.dataset.kind = kind;
}

function openDetail(id, { record = true } = {}) {
  const item = items.find((it) => it.id === id);
  if (!item) return;
  if (item.index !== settledIndex) goTo(item.index, { jump: true });
  fillDetail(item);
  if (!detail.open) detail.showModal();
  if (record && !restoring) { try { history.pushState(snapshot('detail'), ''); } catch {} }
}
on($('exDetailClose'), 'click', () => detail.close());
// 닫기로 방문 기록을 더 쌓지 않는다 — 지금 칸의 상태만 '닫힘'으로 바꾼다(뒤로 가기는 그 칸을 쓴다). 트리 보기와 같다.
on(detail, 'close', () => { if (!restoring) { try { history.replaceState(snapshot(null), ''); } catch {} } });
on(detail, 'click', (event) => { if (event.target === detail) detail.close(); });
on($('exDetailBook'), 'click', () => {
  const item = items[settledIndex];
  if (item) parent.postMessage({ type: MSG.openBook, treeId: data.treeId, id: item.id }, location.origin);
});
on($('exDetailPlay'), 'click', () => {
  const item = items[settledIndex];
  if (!item) return;
  if (item.media.kind === 'link') { window.open(item.media.openUrl, '_blank', 'noopener,noreferrer'); return; }
  // 플레이어는 이 판 안에 두지 않는다. 판을 닫고 공용 크게 보기로 넘긴다(플레이어 위에 우리 요소 0 — #1354·#1378).
  // 크게 보기는 열 때 초점이 있던 곳으로 닫을 때 돌아간다 — 그 자리를 '순간 보기' 단추로 맞춰 둔다.
  detail.close();
  scenes.get(settledIndex)?.querySelector('.ex-open')?.focus({ preventScroll: true });
  void window.LTMedia.openLightbox(item.url, item.title, item.vertical ? true : null);
});
on(window, 'popstate', () => {
  const st = history.state;
  restoring = true;
  const wantDetail = st?.lt41Exhibit && st.lt41ExhibitPanel === 'detail';
  if (detail.open && !wantDetail) detail.close();
  const at = st?.lt41Exhibit ? items.findIndex((it) => it.id === st.lt41ExhibitId) : -1;
  if (at >= 0 && at !== settledIndex) goTo(at, { jump: true });
  if (wantDetail && !detail.open && at >= 0) openDetail(items[at].id, { record: false });
  restoring = false;
});

/* ── 입력: 누르기·끌기·휠·자판 ───────────────────────────────────────── */

on(stage, 'click', (event) => {
  if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
  const node = event.target.closest('.ex-node');
  if (node) {
    const index = Number(node.dataset.index);
    if (index === settledIndex && motion.target === index) openDetail(items[index].id); else goTo(index);
    return;
  }
  const opener = event.target.closest('[data-open]');
  if (opener) openDetail(opener.dataset.open);
}, true);

on(stage, 'pointerdown', (event) => {
  if (event.button > 0 || !items.length) return;
  if (event.target.closest('.ex-node,.ex-open')) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, phase: motion.phase, start: Math.round(motion.target), lastX: event.clientX, lastT: event.timeStamp, velocity: 0, live: false };
});
on(stage, 'pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.live) {
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    drag.live = true; suppressClick = true;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    stage.dataset.dragging = 'true'; stage.dataset.moving = 'true';
    try { stage.setPointerCapture(event.pointerId); } catch {}
  }
  const dt = Math.max(8, event.timeStamp - drag.lastT);
  drag.velocity = (-(event.clientX - drag.lastX) / metrics.sceneSpacing) * (16.667 / dt);
  drag.lastX = event.clientX; drag.lastT = event.timeStamp;
  motion.phase = clamp(drag.phase - dx / metrics.sceneSpacing, 0, motion.max);
  motion.target = motion.phase;
  queueDraw();
});
function endDrag(event) {
  if (!drag || drag.id !== event.pointerId) return;
  const ended = drag;
  drag = null;
  if (!ended.live) return;
  stage.dataset.dragging = 'false';
  // 취소된 손짓(전화·시스템 손짓 등)은 넘기지 않는다 — 끌기 시작한 장면으로 돌아간다.
  const cancelled = event.type === 'pointercancel';
  motion.target = cancelled ? ended.start : releaseTarget(motion.phase, ended.start, ended.velocity, motion.max);
  motion.velocity = cancelled ? 0 : clamp(ended.velocity, -0.16, 0.16);
  // 끌기 뒤 곧바로 오는 click 한 번만 막는다.
  setTimeout(() => { suppressClick = false; }, 0);
  run();
}
on(stage, 'pointerup', endDrag);
on(stage, 'pointercancel', endDrag);
on(stage, 'wheel', (event) => {
  // Ctrl+휠(화면 확대·축소)은 브라우저에 맡긴다.
  if (!items.length || event.ctrlKey) return;
  event.preventDefault();
  const direction = wheelGate(event.deltaX, event.deltaY, event.timeStamp);
  if (direction) step(direction);
}, { passive: false });

on(document, 'keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || !items.length) return;
  if (detail.open || document.querySelector('.lt-lightbox')) return;
  if (event.target?.closest?.('input,textarea,select,[contenteditable]')) return;
  const fromNode = !!event.target?.closest?.('.ex-node');
  let move = null;
  if (event.key === 'ArrowRight') move = () => step(1);
  else if (event.key === 'ArrowLeft') move = () => step(-1);
  else if (event.key === 'Home') move = () => goTo(0);
  else if (event.key === 'End') move = () => goTo(items.length - 1);
  if (move) {
    event.preventDefault();
    move();
    if (fromNode) nodeButtons[Math.round(motion.target)]?.focus({ preventScroll: true });
    return;
  }
  if (event.key === 'Enter' && !event.target?.closest?.('button,a')) {
    event.preventDefault();
    const item = items[Math.round(motion.target)];
    if (item) openDetail(item.id);
  }
});
on(prevBtn, 'click', () => step(-1));
on(nextBtn, 'click', () => step(1));

/* ── 크기·설정·자료 바뀜 ─────────────────────────────────────────────── */

function measure() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return false;
  metrics = railMetrics(w, h);
  root.dataset.exLayout = metrics.layout;
  root.style.setProperty('--ex-stage-h', h + 'px');
  ring.style.setProperty('--ex-ring-d', (metrics.radius * 2).toFixed(1) + 'px');
  ring.style.setProperty('--ex-ring-x', (metrics.cx - metrics.radius).toFixed(1) + 'px');
  ring.style.setProperty('--ex-ring-y', (metrics.cy - metrics.radius).toFixed(1) + 'px');
  station.style.setProperty('--ex-station-y', metrics.stationY.toFixed(1) + 'px');
  nodesEl.style.setProperty('--ex-label-w', Math.round(metrics.nodeArc - 16) + 'px');
  return true;
}
const resizer = new ResizeObserver(() => { if (measure()) draw(); });
resizer.observe(stage);

const titleSource = el('span', '', data.title || '트리');
mountScreenToolbar({ screen: 'tree', titleFrom: titleSource, initialBar: document.querySelector('.lt-screen-toolbar'), tools: [prevBtn, countEl, nextBtn] });

function load(keepId) {
  const ordered = orderMoments(data.moments, order);
  items = ordered.map((m, index) => toItem(m, index, ordered.length));
  for (const scene of scenes.values()) scene.remove();
  scenes.clear();
  const empty = !items.length;
  $('exEmpty').hidden = !empty;
  stage.hidden = empty;
  prevBtn.disabled = nextBtn.disabled = true;
  countEl.textContent = pageText(0, items.length);
  buildNodes();
  if (empty) { settledIndex = -1; return; }
  const start = Math.max(0, items.findIndex((it) => it.id === keepId));
  motion = createMotion(items.length, start);
  settledIndex = -1;
  measure();
  draw();
  settle();
}

on(window, 'message', (event) => {
  if (!isShellMessage(event)) return;
  const type = event.data.type;
  if (type === MSG.motion) { shellPaused = !!event.data.paused; paintMotion(); return; }
  if (type === MSG.dateStyle) {
    const next = event.data.value === 'dash' || event.data.value === 'long' ? event.data.value : 'dot';
    if (next === dateStyle) return;
    dateStyle = next;
    try { root.setAttribute('data-lt-date-style', dateStyle); } catch {}
    load(items[settledIndex]?.id);
    return;
  }
  if (type === MSG.titleDisplay) {
    const next = normalizeTitleDisplay(event.data.value);
    if (next === titleDisplay) return;
    titleDisplay = next;
    try { localStorage.setItem('lt41.titleDisplay', titleDisplay); } catch {}
    load(items[settledIndex]?.id);
    return;
  }
  if (type === MSG.momentsSaved && data.refresh()) { titleSource.textContent = data.title; load(items[settledIndex]?.id); }
});
on(osReduced, 'change', paintMotion);
on(window, 'pagehide', () => destroy());

function destroy() {
  abort.abort();
  resizer.disconnect();
  if (raf) cancelAnimationFrame(raf);
  if (drawQueued) cancelAnimationFrame(drawQueued);
  raf = 0; drawQueued = 0;
}

paintMotion();
const wanted = new URLSearchParams(location.search).get('open') || history.state?.lt41ExhibitId || (typeof data.get === 'function' ? String(data.get() || '') : '');
load(wanted);
if (history.state?.lt41Exhibit && history.state.lt41ExhibitPanel === 'detail' && items[settledIndex]) openDetail(items[settledIndex].id, { record: false });
window.__LT_EXHIBIT_VIEW__ = { get items() { return items; }, get motion() { return motion; }, get metrics() { return metrics; }, get index() { return settledIndex; }, order, perf, goTo, destroy };
