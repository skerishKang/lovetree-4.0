// 기억 보드의 순수 계산 한 벌. 화면(board.js)이 실제로 이 함수들을 부른다.
// 일반 스크립트로 불러오고(node 시험은 import), window.LT58Model 하나로 노출한다.
window.LT58Model = (() => {
  // 사용자 글자를 HTML에 넣기 전에 이스케이프한다.
  function escapeHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 카드 자리: 8장씩 줄을 바꾸고, 세로는 400px 간격, 회전은 -2·0·2도.
  function cardPosition(i) {
    return { x: 150 + (i % 8) * 280, y: 150 + Math.floor(i / 8) * 400, rot: (i % 3 - 1) * 2 };
  }

  // 처음 배치(#395): 자리를 정한 적 없는 순간을 이야기 순서대로 펼친다.
  // 첫 순간은 왼쪽, 이어진 순간은 오른쪽으로 가지 치듯(가로 300px, 세로 420px 간격 = 카드끼리 겹치지 않음).
  // 회전은 cardPosition과 같은 -2·0·2도. 자리를 저장한 순간(x·y)은 board.js가 저장값을 그대로 쓴다.
  function treeSpread(ids, edges) {
    const known = new Set(ids);
    const kids = new Map(ids.map((id) => [id, []]));
    const hasParent = new Set();
    for (const e of edges || []) {
      if (e.kind !== 'parent' || !known.has(e.from) || !known.has(e.to) || hasParent.has(e.to)) continue;
      kids.get(e.from).push(e.to);
      hasParent.add(e.to);
    }
    const out = new Map();
    let nextRow = 0;
    // #469: 7칸 고정 대신 12칸으로 넓게 펼친다 — 긴 트리의 세로 길이를 줄인다.
    const cols = 12;
    function visit(id, depth, stack) {
      stack.add(id);
      const rows = kids.get(id).filter((k) => !stack.has(k) && !out.has(k)).map((k) => visit(k, depth + 1, stack));
      stack.delete(id);
      const row = rows.length ? (rows[0] + rows[rows.length - 1]) / 2 : nextRow++;
      out.set(id, { depth, row });
      return row;
    }
    for (const id of ids) if (!hasParent.has(id) && !out.has(id)) visit(id, 0, new Set());
    for (const id of ids) if (!out.has(id)) visit(id, 0, new Set());
    // #469: 밴드(깊이 12칸 구간)별로 실제로 쓴 줄 범위를 재고, 위 밴드가 쓴 줄 수만큼만 내려 쌓는다 —
    // 옛 규칙('전체 잎 줄 수 + 1' 간격)이 만들던 줄 사이 빈 칸을 없앤다. 각 밴드는 제일 윗 줄부터 시작한다.
    const bandRows = new Map();
    for (const { depth, row } of out.values()) {
      const b = Math.floor(depth / cols);
      const cur = bandRows.get(b) || [Infinity, -Infinity];
      cur[0] = Math.min(cur[0], row);
      cur[1] = Math.max(cur[1], row);
      bandRows.set(b, cur);
    }
    const bandTop = new Map();
    let acc = 0;
    for (const b of [...bandRows.keys()].sort((x, y) => x - y)) {
      bandTop.set(b, acc);
      const [minR, maxR] = bandRows.get(b);
      acc += (maxR - minR) + 1;
    }
    const result = new Map();
    let i = 0;
    for (const id of ids) {
      const { depth, row } = out.get(id);
      const wrap = Math.floor(depth / cols);
      const minR = (bandRows.get(wrap) || [0])[0];
      result.set(id, { x: 150 + (depth % cols) * 300, y: 150 + (row - minR + (bandTop.get(wrap) || 0)) * 420, rot: (i++ % 3 - 1) * 2 });
    }
    return result;
  }

  // 실(연결선) 베지에: 두 핀 사이를 아래로 늘어뜨린다. dx가 클수록 처짐이 커지되 140px까지.
  function threadPath(a, b) {
    const dx = b.x - a.x;
    const sag = Math.min(140, 55 + Math.abs(dx) * 0.08);
    const cy = Math.max(a.y, b.y) + sag;
    return { sag, cy, d: `M ${a.x} ${a.y} C ${a.x + dx * 0.32} ${cy}, ${a.x + dx * 0.68} ${cy}, ${b.x} ${b.y}` };
  }

  // 전체 맞춤 배율: 무대 여백 40px, 최대 0.92배.
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
  function startView({ viewport, safe, cards, focusId = null, firstId = null, world = boardSize(cards) }) {
    const box = contentBox(cards);
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
    // 판이 화면을 채우게(양옆·위아래 빈 띠 없이) 민 다음, 순간 묶음이 보이는 칸에 맞게 한 번 더 민다(순간이 우선).
    const surface = { x: SURFACE_INSET, y: SURFACE_INSET, w: world.w - SURFACE_INSET * 2, h: world.h - SURFACE_INSET * 2 };
    const sx = Math.min(surface.x, box.x), sy = Math.min(surface.y, box.y);
    const board = { x: sx, y: sy, w: Math.max(surface.x + surface.w, box.x + box.w) - sx, h: Math.max(surface.y + surface.h, box.y + box.h) - sy };
    v = clampView(v, board, { x: 0, y: 0, w: viewport.w, h: viewport.h });
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

  // 연결 지우기: 목록에서 id 하나만 뺀 새 배열을 준다(원본은 건드리지 않는다).
  function removeConnection(list, id) {
    return list.filter((c) => c.id !== id);
  }

  // 지우기 허용 판단: 실제 기록(읽기 전용)이면 안내 문구를 함께 준다.
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
  function decorationMotion({ pan = false, pinch = false, dragging = false, touches = 0 } = {}) {
    return pan || pinch || dragging || touches > 0 ? 'paused' : 'running';
  }

  // #346: 실 다시 그리기 예약 판정. 상시 rAF 루프 대신 필요할 때만, 한 프레임에 한 번 그린다.
  // - pending: 이미 한 프레임 예약됨 → 또 걸지 않는다
  // - hidden: 탭이 숨거나 보드 iframe이 화면 밖/숨김 → 그리지 않는다
  // - cinema: 시네마 장면이 자기 갱신을 맡는다(예전 루프도 시네마 동안 건너뛰었다)
  function threadRedrawStep({ pending = false, hidden = false, cinema: inCinema = false } = {}) {
    if (pending) return 'queued';
    if (hidden) return 'skip';
    if (inCinema) return 'skip';
    return 'draw';
  }

  // 커서: 끔 조건(pointer:coarse·터치·시네마)과 움직임 줄임은 위치만. 판정만 여기서, 그리기는 화면이 맡는다.
  function cursorMode({ pointerType = 'mouse', coarse = false, cinema = false, reducedMotion = false } = {}) {
    if (pointerType === 'touch' || coarse || cinema) return 'off';
    if (reducedMotion) return 'position';
    return 'full';
  }

  // 커서: 입력 위는 숨김, 카드·핀·실·버튼 위는 반응(커짐). 나머지는 기본.
  function cursorHover({ card = false, pin = false, thread = false, button = false, text = false } = {}) {
    if (text) return 'hidden';
    if (card || pin || thread || button) return 'interactive';
    return 'default';
  }

  // 커서 크기 배율: 끔 0, 드래그는 작은 점(핀 느낌), 누름 0.8, 반응 위 1.6, 기본 1.
  function cursorScale({ mode = 'full', hover = 'default', down = false, dragging = false } = {}) {
    if (mode === 'off') return 0;
    if (dragging) return 0.3;
    if (down) return 0.8;
    if (mode !== 'off' && hover === 'interactive') return 1.6;
    return 1;
  }

  // 한 번에 켜진 클릭 효과 묶음 수 한도(물결+물방울 한 묶음). 넘으면 새 묶음을 만들지 않는다.
  function cursorEffectAllowed(active = 0, cap = 3) {
    return active < cap;
  }

  // #361 후속: 커서가 보드 밖으로 나갔거나 탭이 가려지면 숨긴다. 다시 들어오면 그 위치에서 보인다.
  function cursorPresence({ seen = true, outside = false, blurred = false, hidden = false } = {}) {
    if (outside || blurred || hidden) return 'hidden';
    return seen ? 'shown' : 'hidden';
  }

  return { escapeHTML, cardPosition, treeSpread, threadPath, fitZoom, boardSize, contentBox, fitBox, clampView, startView, visibleCards, rememberView, savedView, removeConnection, editGuard, collectPath, nextConnections, detailButtonState, cinemaBeats, filterVisible, maxCreatedOrder, threadRedrawStep, decorationMotion, cursorMode, cursorHover, cursorScale, cursorEffectAllowed, cursorPresence };
})();
