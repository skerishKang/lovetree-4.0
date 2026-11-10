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

  return { escapeHTML, cardPosition, threadPath, fitZoom, removeConnection, editGuard, collectPath, nextConnections, detailButtonState, cinemaBeats, filterVisible, maxCreatedOrder, threadRedrawStep, decorationMotion, cursorMode, cursorHover, cursorScale, cursorEffectAllowed };
})();
