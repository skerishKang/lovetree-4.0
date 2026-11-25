// 서재 보기 틀 (#1376 1단계). 보기 이름별 배치·이동·정리만 여기서 맡는다.
// 데이터·카드 마크업·저장·메시지·주소·읽기 화면은 shelf.js(공용)에 그대로 둔다.
// 2026-11-25: 기존 분기를 값·조건·문구 변경 없이 옮긴다(겉모습 변화 0).
import { shelfRowLayout, shelfRotationLayout } from './shelf-model.mjs';

// 셸의 값 목록을 그대로 쓴다(화면에서 새로 만들지 않는다). 시험이 이름만 바꿔 같은 검사를 돈다.
export { SHELF_VIEWS as SHELF_VIEW_NAMES } from '../../domain.mjs';

function clearDragX(rail) {
  if (!rail || !rail.style) return;
  if (typeof rail.style.removeProperty === 'function') rail.style.removeProperty('--drag-x');
  else if (typeof rail.style.setProperty === 'function') rail.style.setProperty('--drag-x', '');
  else delete rail.style['--drag-x'];
}

function setDragX(rail, px) {
  if (!rail || !rail.style) return;
  if (typeof rail.style.setProperty === 'function') rail.style.setProperty('--drag-x', px + 'px');
  else rail.style['--drag-x'] = px + 'px';
}

// 빈 칸 자리: 원래 renderShelf가 카드 바로 뒤에 넣던 것을 보기가 맡는다.
// 다시 그릴 때 같은 자리를 먼저 지워 중복을 막는다(보이는 결과는 기존과 같다).
function decorate(ctx, grid) {
  var rail = ctx.rail();
  if (!rail) return;
  var old = rail.querySelectorAll ? rail.querySelectorAll('.shelf-empty-slot') : [];
  for (var i = 0; i < old.length; i += 1) old[i].remove();
  var list = ctx.books(), railWidth = ctx.railWidth();
  if (list.length > 0 && list.length < 4 && railWidth >= 1200) {
    var row = shelfRowLayout(list.length, railWidth);
    for (var slot = list.length; slot < 4; slot += 1) {
      var at = grid ? '' : ' style="--x:' + row.xOf(slot) + 'px"';
      rail.insertAdjacentHTML('beforeend', '<div class="shelf-empty-slot" aria-hidden="true"' + at + '><span>새 트리 자리</span></div>');
    }
  }
}

// 레일 손질(누르기·길게 누르기·끌기)은 두 보기가 같이 쓰고,
// 움직이는 중/끝에서만 보기별 규칙(policy)을 부른다.
function bindRail(ctx, policy) {
  var rail = ctx.rail();
  if (!rail) return function () {};
  var lpTimer = null, lpTarget = null, lpStart = null, lpFired = false;
  var drag = { active: false, startX: 0, moved: false, downIndex: null, startIndex: 0, lastDx: 0 };
  var clearLp = function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } lpStart = null; };

  function onClick(event) {
    if (event.target.closest('[data-manage-id]')) return;
    if (lpFired) { lpFired = false; lpTarget = null; return; }
    if (event.detail === 0) {
      var card = event.target.closest('[data-book-index]');
      if (card) ctx.open(Number(card.dataset.bookIndex));
    }
  }
  function onDown(event) {
    if (event.target.closest('[data-manage-id]')) return;
    var card = event.target.closest('.book-card');
    lpFired = false;
    lpTarget = (card && card.dataset && card.dataset.bookIndex !== undefined) ? card : null;
    clearLp(); lpStart = { x: event.clientX, y: event.clientY };
    if (lpTarget) lpTimer = setTimeout(function () { if (lpTarget) { lpTarget.classList.add('show-manage'); lpFired = true; } lpTimer = null; }, 500);
    drag.active = true; drag.startX = event.clientX; drag.moved = false;
    drag.downIndex = card ? Number(card.dataset.bookIndex) : null;
    drag.startIndex = ctx.center();
    rail.classList.add('dragging'); rail.setPointerCapture(event.pointerId);
  }
  function onMove(event) {
    if (lpTimer && lpStart && (Math.abs(event.clientX - lpStart.x) > 7 || Math.abs(event.clientY - lpStart.y) > 7)) clearLp();
    if (!drag.active) return;
    var dx = event.clientX - drag.startX;
    drag.lastDx = dx;
    if (Math.abs(dx) > 7) drag.moved = true;
    if (drag.moved) policy.onMove(ctx, dx, rail);
  }
  function onUp() {
    clearLp();
    if (!drag.active) return;
    var moved = drag.moved, downIndex = drag.downIndex, longFired = lpFired, dx = drag.lastDx || 0, startIndex = drag.startIndex;
    drag.active = false; rail.classList.remove('dragging');
    if (moved) policy.onEnd(ctx, { dx: dx, startIndex: startIndex, rail: rail });
    else if (longFired) { /* 길게 누르기: ⋯만 보이고 책은 열지 않는다 */ }
    else if (downIndex !== null) ctx.open(downIndex);
    drag.downIndex = null;
    if (!longFired) lpTarget = null;
  }
  function onCancel() {
    clearLp(); lpFired = false; lpTarget = null;
    if (!drag.active) return;
    drag.active = false; rail.classList.remove('dragging');
    ctx.setCenter(drag.startIndex || 0); ctx.relayout();
  }

  rail.addEventListener('click', onClick);
  rail.addEventListener('pointerdown', onDown);
  rail.addEventListener('pointermove', onMove);
  rail.addEventListener('pointerup', onUp);
  rail.addEventListener('pointercancel', onCancel);

  var ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(function () { ctx.relayout(); });
    ro.observe(rail);
  }
  return function destroy() {
    if (lpTimer) clearTimeout(lpTimer);
    lpTimer = null; lpTarget = null; lpStart = null; lpFired = false; drag.active = false;
    rail.removeEventListener('click', onClick);
    rail.removeEventListener('pointerdown', onDown);
    rail.removeEventListener('pointermove', onMove);
    rail.removeEventListener('pointerup', onUp);
    rail.removeEventListener('pointercancel', onCancel);
    if (ro && typeof ro.disconnect === 'function') ro.disconnect();
  };
}

// 보기 정의는 '설계도'다. VIEWS.create가 부를 때마다 새 인스턴스를 만들어
// 한 화면의 귀·타이머가 다른 화면(또는 시험)에 남지 않게 한다.
function defineView(name, layout, move, policy) {
  return function create() {
    var unbind = null;
    return {
      name: name,
      mount: function (ctx) { if (unbind) unbind(); unbind = bindRail(ctx, policy); },
      layout: layout,
      move: move,
      destroy: function () { if (unbind) { unbind(); unbind = null; } }
    };
  };
}

// 선반: 그리드가 자리를 정하고, 넘침 화살표는 레일 전체를 한 칸씩 민다.
var shelf = defineView('shelf', function (ctx) {
  var rail = ctx.rail();
  if (!rail) return;
  ctx.arrows(ctx.books().length, ctx.railWidth());
  setDragX(rail, -(ctx.offset() || 0) * 200);
  var center = ctx.center();
  ctx.cards().forEach(function (card, index) { card.classList.toggle('is-center', index === center); });
  ctx.atmosphere(ctx.books()[center]);
  ctx.reported(center);
  decorate(ctx, true);
}, function (ctx, direction) {
  var list = ctx.books();
  if (!list.length) return;
  var rail = ctx.rail();
  var layout = shelfRowLayout(list.length, rail ? rail.clientWidth : 0);
  var next = Math.max(0, Math.min(layout.maxOffset, (ctx.offset() || 0) + direction));
  if (next === ctx.offset()) return;
  ctx.setOffset(next); ctx.save(); ctx.relayout();
}, { onMove: function () {}, onEnd: function (ctx, e) { clearDragX(e.rail); } });

// 회전: 가운데 책 + 좌우 기울임, 드래그 중에는 레일 변수 한 개만 바꾼다.
var carousel = defineView('carousel', function (ctx) {
  var rail = ctx.rail();
  if (!rail) return;
  ctx.arrows(ctx.books().length, rail.clientWidth);
  var center = ctx.center();
  var layout = shelfRotationLayout(ctx.books().length, rail.clientWidth);
  center = layout.centerFor(center); ctx.setCenter(center);
  ctx.cards().forEach(function (card, index) {
    card.style.setProperty('--x', layout.xOf(index, center) + 'px');
    card.style.setProperty('--rot', layout.rotate(index, center) + 'deg');
    card.style.setProperty('--alpha', '1');
    card.style.setProperty('--scale', String(layout.scale(index, center)));
    card.style.setProperty('--z', layout.depth(index, center) + 'px');
    card.style.setProperty('--y', '0px');
    card.style.zIndex = String(100 - Math.abs(index - center));
    card.classList.toggle('is-center', index === center);
  });
  clearDragX(rail);
  ctx.atmosphere(ctx.books()[center]);
  ctx.reported(center);
  decorate(ctx, false);
}, function (ctx, direction) {
  var list = ctx.books();
  if (!list.length) return;
  var center = Math.max(0, Math.min(list.length - 1, ctx.center() + direction));
  if (center === ctx.center()) return;
  ctx.setCenter(center); ctx.save(); ctx.relayout();
}, {
  onMove: function (ctx, dx, rail) { setDragX(rail, dx); },
  onEnd: function (ctx, e) {
    var list = ctx.books();
    var shifted = Math.round(-(e.dx || 0) / 200);
    ctx.setCenter(Math.max(0, Math.min(list.length - 1, e.startIndex + shifted)));
    ctx.save(); ctx.relayout();
  }
});

var BASE = { shelf: shelf, carousel: carousel };

// 화면에서 쓰는 얇은 껍데기. 정책 함수가 늘 최신 공용 ctx를 보게 한 번만 감싼다.
export const VIEWS = {
  create: function (name) {
    var base = (BASE[name] || BASE.shelf)();
    var currentCtx = null;
    return {
      name: base.name,
      mount: function (ctx) { currentCtx = ctx; base.mount(ctx); },
      layout: function (ctx) { currentCtx = ctx; base.layout(ctx); },
      move: function (direction) { base.move(currentCtx, direction); },
      destroy: function () { base.destroy(); }
    };
  }
};
