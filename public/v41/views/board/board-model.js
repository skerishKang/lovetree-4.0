// 기억 보드의 순수 계산 한 벌. 화면(board.js)이 실제로 이 함수들을 부른다.
// 일반 스크립트로 불러오고(node 시험은 import), window.LT58Model 하나로 노출한다.
window.LT58Model = (() => {
  // 사용자 글자를 HTML에 넣기 전에 이스케이프한다.
  function escapeHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // === 바둑판 배치(#582): 보드는 핀보드다 — 관계 기준 배치를 버리고 날짜 최신순 바둑판에 꽂는다. ===
  // 관계도(줄)는 지도가 맡는다. 보드의 자리는 '칸(col)×줄(row)' 슬롯이다.
  const BASE_CARD_H = 424, ROW_GAP = 36, COL_PITCH = 300, GRID_MARGIN = 150;
  // 칸 수는 화면 폭이 정한다: 1440에서 4칸, 390에서 1칸, 2560에서 8칸. 카드 폭 242px + 사이 여백.
  function gridColumns(vw) {
    return Math.max(1, Math.floor(((Number(vw) || 0) - 32) / COL_PITCH));
  }
  // 기본 순서: 날짜 최신순. 같은 날짜면 최근에 만든 순간부터(createdOrder 내림).
  function dateDescOrder(moments) {
    return [...(moments || [])].sort((a, b) => {
      const d = String(b?.date || '').localeCompare(String(a?.date || ''));
      if (d) return d;
      return (Number(b?.createdOrder) || 0) - (Number(a?.createdOrder) || 0);
    }).map((m) => m.id);
  }
  // 저장한 자리(사람이 꽂은 칸)는 비켜 놓고, 나머지를 줄어든 순서대로 빈 칸에 채운다(왼쪽→오른쪽, 위→아래).
  // saved: Map(id → {col,row}) — 화면이 저장된 x·y에서 되새겨 넘긴다. 저장 자리는 원친대로 남는다(#395 계약).
  function pinboardSpread(ids, { cols = 4, saved = null } = {}) {
    const taken = new Set();
    const norm = new Map();
    if (saved) for (const [id, s] of saved) {
      if (!ids.includes(id)) continue;
      const slot = { col: Math.max(0, Math.floor(Number(s?.col) || 0)), row: Math.max(0, Math.floor(Number(s?.row) || 0)) };
      norm.set(id, slot);
      taken.add(slot.col + ':' + slot.row);
    }
    const out = new Map();
    let next = 0;
    for (const id of ids) {
      if (norm.has(id)) { out.set(id, norm.get(id)); continue; }
      let s = next;
      while (taken.has((s % cols) + ':' + Math.floor(s / cols))) s++;
      next = s + 1;
      const slot = { col: s % cols, row: Math.floor(s / cols) };
      taken.add(slot.col + ':' + slot.row);
      out.set(id, slot);
    }
    return out;
  }
  // 줄의 y: 그 줄에 꽂힌 카드 중 가장 큰 예약 높이 + 여백(#553 규칙을 바둑판에도 같은 원리로).
  // slots: Map(id → {col,row}), reserveOf(id) → 그 카드의 예약 높이. 큰 카드(YouTube)가 있는 줄은 그만큼 벌어진다.
  function gridRowTops(slots, reserveOf) {
    const list = [...slots.values()];
    const maxRow = list.length ? Math.max(...list.map((s) => s.row)) : 0;
    const rowH = new Array(maxRow + 1).fill(0);
    for (const [id, s] of slots) rowH[s.row] = Math.max(rowH[s.row], Number(reserveOf?.(id)) || 0);
    const tops = [];
    let y = GRID_MARGIN;
    for (let r = 0; r <= maxRow; r++) { tops.push(y); y += (rowH[r] || BASE_CARD_H) + ROW_GAP; }
    return tops;
  }
  // 슬롯 → 픽셀 자리. 줄의 y는 gridRowTops가 정한 값을 그대로 쓴다.
  function gridPosition(col, rowY, i) {
    return { x: GRID_MARGIN + col * COL_PITCH, y: rowY, rot: ((Number(i) || 0) % 3 - 1) * 2 };
  }
  // #601: 이 x가 핀보드가 저장한 칸 자리인가 — 카드 x는 칸 위치(GRID_MARGIN+col*300)에 스냅되어 저장된다.
  // 옛 관계 배치의 x·y는 아무 값이나 있으므로(±2px 안에 칸 위치가 거의 없다),
  // 이 판정을 통과한 x만 '내 배치'의 저장 자리로 센다. 옛 값은 지우지 않고(#395 계약) 배치 계산에서만 무시한다.
  function isPinboardSlot(x) {
    const v = Number(x);
    if (!Number.isFinite(v)) return false;
    const col = Math.max(0, Math.round((v - GRID_MARGIN) / COL_PITCH));
    return Math.abs(v - (GRID_MARGIN + col * COL_PITCH)) <= 2;
  }

  // 픽셀 자리 → 가장 가까운 슬롯(끌어 꽂기). 저장된 x·y든 끌다 놓은 x·y든 같은 규칙으로 되새긴다.
  function slotOf(x, y) {
    return {
      col: Math.max(0, Math.round(((Number(x) || 0) - GRID_MARGIN) / COL_PITCH)),
      row: Math.max(0, Math.round(((Number(y) || 0) - GRID_MARGIN) / (BASE_CARD_H + ROW_GAP)))
    };
  }

  // #553: 같은 열(같은 x)의 위아래 카드가 겹치지 않게 세로로 벌린다. 화면이 카드를 그린 뒤 실제
  // 높이(offsetHeight)를 재서 불러 준다. moving에 있는 카드(배치가 정한 자리 — 저장 자리가 없는
  // 순간)만 아래로 밀리고, 저장 자리 카드는 그대로다(그 아래 배치 카드가 저장 카드를 피해 내려간다).
  // 위에서부터 차례로 훑으므로 한 번의 통과로 끝난다. 반환: Map(id → 새 y).
  function settleColumnGaps(cards, moving, gap = 24) {
    const byColumn = new Map();
    for (const c of cards || []) {
      if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y) || !Number.isFinite(c?.h)) continue;
      const list = byColumn.get(c.x) || [];
      list.push(c);
      byColumn.set(c.x, list);
    }
    const out = new Map();
    for (const list of byColumn.values()) {
      list.sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
      let bottom = null;
      for (const c of list) {
        const y = moving?.has(c.id) && bottom !== null ? Math.max(c.y, bottom + gap) : c.y;
        out.set(c.id, y);
        bottom = y + c.h;
      }
    }
    return out;
  }

  function fitZoom(vw, vh) {
    return Math.min((vw - 40) / 2400, (vh - 40) / 2200, 0.92);
  }

  // #460 처음 열 때·전체 보기의 배율과 자리.
  // 무대 전체(2400x2200)를 맞추면 컴퓨터(1440)에서 33%·카드 글씨 5px이 되어 읽을 수 없었다.
  // 그래서 실제 순간이 있는 사각형(카드 묶음)을 기준으로 맞추고, 처음 열 때는 읽을 수 있는 배율을 지킨다.
  const READABLE_ZOOM = 0.8; // 카드 제목 16px → 12.8px
  const START_MAX_ZOOM = 1;
  const SURFACE_INSET = 48; // 흰 판(.surface)은 무대 안쪽 48px

  // 판(무대) 크기: 순간이 기본 무대(2400x2200) 밖까지 놓이면 그만큼 늘린다(아래 줄 카드가 판 밖 어두운 곳에 떨어지지 않게). 100px 단위.
  function boardSize(cards) {
    let w = 2400, h = 2200;
    for (const c of cards || []) {
      if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
      w = Math.max(w, Math.ceil((c.x + (c.w || 242) + 150) / 100) * 100);
      h = Math.max(h, Math.ceil((c.y + (c.h || 260) + 150) / 100) * 100);
    }
    return { w, h };
  }

  // 카드 묶음 사각형(여백 pad 포함). 카드가 없으면 null.
  function contentBox(cards, pad = 40) {
    const list = (cards || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
    if (!list.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of list) {
      x0 = Math.min(x0, c.x);
      y0 = Math.min(y0, c.y);
      x1 = Math.max(x1, c.x + (c.w || 242));
      y1 = Math.max(y1, c.y + (c.h || 260));
    }
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  }

  // 사각형 box가 보이는 칸 safe에 다 들어오는 배율·자리(가운데 맞춤, 최대 maxZoom).
  function fitBox(box, safe, maxZoom = START_MAX_ZOOM) {
    const z = Math.min(safe.w / box.w, safe.h / box.h, maxZoom);
    return { z, x: safe.x + (safe.w - box.w * z) / 2 - box.x * z, y: safe.y + (safe.h - box.h * z) / 2 - box.y * z };
  }

  // 사각형 rect가 칸 area보다 크게 보이면, area 안에 빈 곳(rect 밖)이 드러나지 않게 민다. 작으면 그대로 둔다.
  function clampAxis(t, z, start, size, areaStart, areaSize) {
    if (size * z < areaSize) return t;
    return Math.min(areaStart - start * z, Math.max(areaStart + areaSize - (start + size) * z, t));
  }
  function clampView(view, rect, area) {
    return { z: view.z, x: clampAxis(view.x, view.z, rect.x, rect.w, area.x, area.w), y: clampAxis(view.y, view.z, rect.y, rect.h, area.y, area.h) };
  }
  // #536: 판(흰 판 ∪ 순간 묶음)이 화면보다 좁은 축은 화면 가운데에 둔다. 덮을 수 있는 축은
  // clampAxis 그대로 민다(빈 곳 없이). 넓은 화면(2560)에서 순간이 적거나 한 줄로 길 때 판이
  // 오른쪽에만 그려지고 왼쪽 절반이 어두운 바탕으로 남은 것을 고친다.
  function coverAxis(t, z, start, size, areaStart, areaSize) {
    if (size * z >= areaSize) return clampAxis(t, z, start, size, areaStart, areaSize);
    return areaStart + (areaSize - size * z) / 2 - start * z;
  }
  function coverView(view, rect, area) {
    return {
      z: view.z,
      x: coverAxis(view.x, view.z, rect.x, rect.w, area.x, area.w),
      y: coverAxis(view.y, view.z, rect.y, rect.h, area.y, area.h)
    };
  }
  // 흰 판(.surface — 무대 안쪽 48px)과 순간 묶음을 합친 사각형. 이 판이 화면을 덮거나 가운데에 선다.
  function boardRect(box, world) {
    const surface = { x: SURFACE_INSET, y: SURFACE_INSET, w: world.w - SURFACE_INSET * 2, h: world.h - SURFACE_INSET * 2 };
    if (!box) return surface;
    const sx = Math.min(surface.x, box.x), sy = Math.min(surface.y, box.y);
    return { x: sx, y: sy, w: Math.max(surface.x + surface.w, box.x + box.w) - sx, h: Math.max(surface.y + surface.h, box.y + box.h) - sy };
  }

  // 순간 묶음 box와 보이는 칸 safe: box가 더 크면 칸을 채우고(빈 곳 없이), 작으면 칸 안에 다 들어오게 한다.
  function settleAxis(t, z, start, size, areaStart, areaSize) {
    const a = areaStart - start * z, b = areaStart + areaSize - (start + size) * z;
    return Math.min(Math.max(a, b), Math.max(Math.min(a, b), t));
  }
  function settleView(view, box, safe) {
    return { z: view.z, x: settleAxis(view.x, view.z, box.x, box.w, safe.x, safe.w), y: settleAxis(view.y, view.z, box.y, box.h, safe.y, safe.h) };
  }

  // 처음 보이는 자리. viewport={w,h}, safe=왼쪽 도구·오른쪽 상세 창을 뺀 보이는 칸,
  // cards=[{id,x,y,w,h}], focusId=마지막으로 보던 순간(없으면 firstId → 첫 카드).
  // 다 들어와도 읽을 수 있으면(0.8배 이상) 한눈에, 아니면 0.8배로 그 순간 근처를 보여 준다.
  // saved=기억한 자리({cx,cy,z}) — 같은 판 규칙(덮거나 가운데)을 거쳐 연다(#536).
  function startView({ viewport, safe, cards, focusId = null, firstId = null, world = boardSize(cards), saved = null }) {
    const box = contentBox(cards);
    // #536: 기억한 자리도 판 규칙을 따른다. 전에는 저장된 배율·자리를 그대로 써서 넓은 화면에서
    // 판이 한쪽으로 쏠렸다. 순간이 하나도 안 보이는 자리는 버린다(예전 규칙).
    if (saved) {
      const raw = { z: saved.z, x: viewport.w / 2 - saved.cx * saved.z, y: viewport.h / 2 - saved.cy * saved.z };
      if (!cards.length || visibleCards(raw, { x: 0, y: 0, w: viewport.w, h: viewport.h }, cards) > 0) {
        return { ...coverView(raw, boardRect(box, world), { x: 0, y: 0, w: viewport.w, h: viewport.h }), mode: 'user' };
      }
    }
    if (!box) {
      const z = fitZoom(viewport.w, viewport.h);
      return { z, x: (viewport.w - 2400 * z) / 2, y: (viewport.h - 2200 * z) / 2, mode: 'empty' };
    }
    const fit = fitBox(box, safe, START_MAX_ZOOM);
    let v = fit, mode = 'fit', f = null;
    if (fit.z < READABLE_ZOOM) {
      f = cards.find((c) => c.id === focusId) || cards.find((c) => c.id === firstId) || cards[0];
      const z = READABLE_ZOOM;
      v = { z, x: safe.x + safe.w / 2 - (f.x + (f.w || 242) / 2) * z, y: safe.y + safe.h / 2 - (f.y + (f.h || 260) / 2) * z };
      mode = 'focus';
    }
    // 판이 화면을 채우게(양옆·위아래 빈 띠 없이) 민다 — 판이 화면보다 좁은 축은 가운데 둔다(#536).
    // 그다음 순간 묶음이 보이는 칸에 맞게 한 번 더 민다(순간이 우선).
    const board = boardRect(box, world);
    v = coverView(v, board, { x: 0, y: 0, w: viewport.w, h: viewport.h });
    v = settleView(v, box, safe);
    // 그 순간 카드는 도구·상세 창에 가리지 않고 보이는 칸 안에 있어야 한다(마지막으로 한 번 더).
    if (f) v = settleView(v, { x: f.x, y: f.y, w: f.w || 242, h: f.h || 260 }, safe);
    return { ...v, mode };
  }

  // 보이는 칸 area와 겹치는 카드 수.
  function visibleCards(view, area, cards) {
    let n = 0;
    for (const c of cards || []) {
      const x = c.x * view.z + view.x, y = c.y * view.z + view.y, w = (c.w || 242) * view.z, h = (c.h || 260) * view.z;
      if (x < area.x + area.w && x + w > area.x && y < area.y + area.h && y + h > area.y) n++;
    }
    return n;
  }

  // 트리별로 마지막 보던 자리(화면 가운데의 무대 좌표 + 배율) 기억. 최근 cap개 트리만 남긴다.
  function rememberView(all, treeId, v, now, cap = 20) {
    const out = {};
    const entries = Object.entries(all && typeof all === 'object' ? all : {}).filter(([k, e]) => k !== treeId && savedView(e));
    entries.sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
    for (const [k, e] of entries.slice(0, cap - 1)) out[k] = e;
    out[treeId] = { cx: Math.round(v.cx), cy: Math.round(v.cy), z: Math.round(v.z * 1000) / 1000, t: now };
    return out;
  }
  function savedView(e) {
    if (!e || ![e.cx, e.cy, e.z].every(Number.isFinite)) return null;
    if (e.z < 0.1 || e.z > 1.45) return null;
    return { cx: e.cx, cy: e.cy, z: e.z };
  }

  // 지우기 허용 판단: 실제 기록(읽기 전용)이면 안내 문구를 함께 준다. (#582: 보드에서 줄을 만들거나 지우지 않으므로 연결 지우기는 지도가 맡는다)
  function editGuard(canEdit) {
    return canEdit ? { blocked: false, message: '' } : { blocked: true, message: '읽기 전용에서는 연결을 변경할 수 없어요.' };
  }


  // 경로 따라가기: 부모 연결을 한 줄로 따라가며 순간 id와 지나온 연결 id를 모은다.
  // 같은 순간으로 돌아오거나 연결이 끊기면 멈춘다(무한 반복 방지 상한 = 순간 수).
  function collectPath(start, momentCount, connections) {
    let ids = [start], cons = [], cur = start, guard = 0;
    while (guard++ < momentCount) {
      const outs = connections.filter((c) => c.kind === 'parent' && c.a === cur);
      if (!outs.length) break;
      const c = outs[0];
      cons.push(c.id);
      cur = c.b;
      if (ids.includes(cur)) break;
      ids.push(cur);
    }
    return { ids, cons };
  }

  // 다음/이전 후보: 고른 순간에서 이어진 부모 연결 목록.
  function nextConnections(dir, selected, connections) {
    return connections.filter((c) => c.kind === 'parent' && (dir === 'next' ? c.a === selected : c.b === selected));
  }

  // 상세 버튼 상태: 다음·이전 순간이 없으면 잠근다.
  function detailButtonState(ins, outs) {
    return {
      nextDisabled: outs.length === 0,
      nextTitle: outs.length ? '' : '다음으로 연결된 순간이 없어요',
      prevDisabled: ins.length === 0
    };
  }

  // 시네마 비트: 경로의 순간·연결·갈림 표시를 정해진 순서와 길이로 늘어놓는다.
  function cinemaBeats(path, moments, connections) {
    const beats = [];
    path.forEach((id, i) => {
      beats.push({
        type: 'moment',
        id,
        label: i === 0 ? (moments.find((m) => m.id === id)?.first ? '첫 순간' : 'SELECTED 순간') : 'NEXT 순간',
        dur: i === 0 ? 2200 : 1800
      });
      if (i < path.length - 1) {
        const c = connections.find((x) => x.a === id && x.b === path[i + 1]);
        if (c) {
          beats.push({ type: 'connection', cid: c.id, id, label: 'CONNECTION TRAVEL', dur: 2300 });
          beats.push({ type: 'why', cid: c.id, id, label: '연결 이유', dur: 1300 });
        }
        if (connections.filter((c2) => c2.a === id).length > 1) beats.push({ type: 'branch', id, label: 'BRANCH CUE', dur: 1200 });
      }
    });
    beats.push({ type: 'bloom', id: path[path.length - 1], label: 'WHOLE BOARD BLOOM', dur: 2300 });
    beats.push({ type: 'final', id: path[path.length - 1], label: 'FINAL CTA', dur: 999999 });
    return beats;
  }


  // 목록 필터 판정: 이 순간이 지금 화면에 보이는가.
  // 미디어(전체·first·unconnected·recent·종류) 조건과 키워드 조건을 AND로 본다.
  function filterVisible(m, state, connections) {
    const mf = state?.mediaFilter || 'all';
    const kf = state?.keywordFilter || 'all';
    let ok = true;
    if (mf !== 'all') {
      if (mf === 'first') ok = !!m.first;
      else if (mf === 'unconnected') ok = !connections.some((c) => c.a === m.id || c.b === m.id);
      else if (mf === 'recent') ok = (m.createdOrder || 0) >= (state?.maxOrder || 0) - 2;
      else ok = (m.originalType || m.type) === mf;
    }
    if (kf !== 'all') ok = ok && (m.keywords || []).includes(kf);
    return ok;
  }

  // 최근 모드의 기준점: 카드가 가진 가장 큰 생성 순번.
  function maxCreatedOrder(moments) {
    return Math.max(...moments.map((m) => m.createdOrder || 0));
  }

  // #346 2단계: 장식 애니메이션(실 점선 흐름·핀 숨쉬기)을 멈출 때인가.
  // 이동·확대·카드 드래그 중에는 매 프레임 SVG 페인트가 겹치므로 잠시 멈춘다(모양은 그대로, 움직임만 멈춤).
  // 시네마는 이 플래그를 쓰지 않는다 — 시네마 장면은 자기 갱신을 그대로 유지한다.
  function decorationMotion({ pan = false, pinch = false, dragging = false, zooming = false, touches = 0 } = {}) {
    // #536: zooming = 휠 확대. 전에는 핀치만 '확대'로 보아 휠 확대 중 실 점선 흐름이 계속 칠해졌다.
    return pan || pinch || dragging || zooming || touches > 0 ? 'paused' : 'running';
  }

  // 지우기 허용 판단: 실제 기록(읽기 전용)이면 안내 문구를 함께 준다. (#582: 보드에서 줄을 만들거나 지우지 않으므로 연결 지우기는 지도가 맡는다)
  return { escapeHTML, gridColumns, dateDescOrder, pinboardSpread, gridRowTops, gridPosition, slotOf, isPinboardSlot, settleColumnGaps, fitZoom, boardSize, contentBox, fitBox, clampView, startView, visibleCards, rememberView, savedView, editGuard, collectPath, nextConnections, detailButtonState, cinemaBeats, filterVisible, maxCreatedOrder, decorationMotion };
})();
