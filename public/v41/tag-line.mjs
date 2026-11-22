import { MSG } from './frame-messages.mjs';
// #627 PR B: 꼬리표 줄 — 순간 상세(책·보드·지도)와 쉬운 추가로 담은 직후 안내에 붙는 한 벌 화면 조각.
// 규칙·계산은 tag-model.mjs·tags.mjs 한 벌을 쓰고, 이 파일은 그리기·누르기만 한다.
// 제안은 흐린 칩, 확정은 진한 칩이다. 누르면 확정·해제된다. 사용자가 확인하기 전에는 저장하지 않는다 —
// 저장 호출은 onCommit(바뀐 keywords 전체, 지금 보고 있는 순간 id)으로 바깥에 맡기고, 이 파일은 저장 경로를 모른다.
import { TAG_KINDS, TAG_MAX_LENGTH, parseTag } from './tags.mjs';
import { cardTags, chipText, tagLineChips, toggledKeywords, inputTag } from './tag-model.mjs';
import { escapeHtml as esc } from './html-escape.mjs';

// A-20: 값 칸 한도는 저장 형식 '종류:값'의 24자에서 종류 표시를 뺀 값이다.
export const valueLimit = (kindId) => TAG_MAX_LENGTH - (TAG_KINDS.find((k) => k.id === kindId)?.prefix.length || 0);
const TOO_LONG_TEXT = '24자를 넘어요';
// 직접 붙이기 칸의 갈래별 예시(261116 대표 지적 — '종류'·'값' 같은 낱말 대신 예시로 뜻을 알린다).
// 순서는 tags.mjs의 TAG_KINDS를 따르고, 갈래 없이는 문장 꼬리표의 예다.
// 261117 고객 의견: '예: ILLIT'는 특정 가수 이름이라, 가수 갈래는 실명을 들지 않는 예시로 바꾼다.
const KIND_PLACEHOLDER = { artist: '예: 좋아하는 가수', song: '예: Magnetic', member: '예: 원희', era: '예: 4세대', stage: '예: 인기가요', emotion: '예: 설렘', '': '예: 입덕 순간, 무대, 직캠' };
const MANUAL_GUIDE = '가수·노래를 붙여 두면 나중에 저절로 묶여요';
const MANUAL_TOGGLE = '직접 붙이기';

function chipHTML(tag) {
  const cls = tag.state === 'confirmed' ? 'is-confirmed' : 'is-proposal';
  const title = tag.state === 'confirmed' ? '누르면 꼬리표를 뗀다' : '누르면 꼬리표를 붙인다';
  return `<button type="button" class="lt-tag-chip ${cls}" data-tag-raw="${esc(tag.raw || tag.value)}" title="${title}">${esc(chipText(tag))}</button>`;
}

// 꼬리표 줄 하나를 host에 그린다. update(moment)로 같은 자리에 다시 그리고, destroy로 지운다.
export function renderTagLine({ host, doc = document, moment, knownTags = [], writable = false, onCommit, emptyText = '아직 꼬리표가 없어요', errorReserve = 0, undoMs = 5000 }) {
  // #739: 눌러 듣는 귀는 이 줄 인스턴스에 묶는다 — destroy로 함께 거둔다. 안 그러면 같은 host에 줄을
  // 다시 그릴 때(쉬운 추가 연속 담기) 옛 줄의 귀가 살아 남아 옛 순간에 저장하고, 같은 칩을 다시 누르면
  // 옛 줄이 해제 저장해 어디에도 남지 않는다(하은 1회차 실측 — 세 순간 모두 keywords []).
  const state = {
    momentId: moment?.id || '',
    title: moment?.title || '',
    keywords: Array.isArray(moment?.keywords) ? [...moment.keywords] : [],
    knownTags: Array.isArray(knownTags) ? [...knownTags] : [],
    manualOpen: false, // 직접 붙이기 칸은 접힘이 기본이다(261116 대표 지적 — 다음 영상을 바로 담는 사람을 막지 않게)
    kind: 'artist',
    errorReserve: Number(errorReserve) || 0, // 실패 문구를 데려올 때 비켜 앉힐 높이(고정 단추가 있는 곳만 넘긴다)
    undo: null, // #37: 방금 뺀 꼬리표(되돌리기 알림이 떠 있는 동안만 채운다)
    undoTimer: 0
  };
  if (!host) return null;
  host.classList.add('lt-tagline-host');

  function draw() {
    const { confirmed, proposals } = tagLineChips({ keywords: state.keywords, title: state.title, knownTags: state.knownTags });
    // 제안은 쓸 수 있는 자리(소유자)에서만 보인다 — 읽어 보는 화면(공유·예시)에는 확정된 꼬리표만 보인다.
    const chips = [...confirmed, ...(writable ? proposals : [])];
    const kinds = [...TAG_KINDS.map((k) => `<option value="${k.id}">${k.label}</option>`), '<option value="">그냥 단어로</option>'].join('');
    // 직접 붙이기(261116 대표 지적): 접힘이 기본 — 제안이 없으면 안내 한 줄+[직접 붙이기], 있으면 칩 아래 작은 링크만.
    // 누르면 한 줄로 펼친다: [가수 ▾][예: 좋아하는 가수][붙이기] — 라벨 대신 select의 갈래 이름과 placeholder 예시로 뜻을 알린다.
    const guide = chips.length ? '' : `<span class="lt-tagline-guide">${esc(MANUAL_GUIDE)}</span>`;
    const manual = !state.manualOpen
      ? `<div class="lt-tagline-manual">${guide}<button type="button" class="lt-tagline-toggle${chips.length ? ' is-link' : ''}">${MANUAL_TOGGLE}</button></div>`
      : `<div class="lt-tagline-manual">${guide}`
          + `<div class="lt-tagline-input" role="group" aria-label="꼬리표 직접 붙이기">`
          + `<select class="lt-tagline-kind" aria-label="붙일 꼬리표의 갈래">${kinds}</select>`
          + `<input class="lt-tagline-value" maxlength="${valueLimit(state.kind)}" autocomplete="off" placeholder="${esc(KIND_PLACEHOLDER[state.kind] || '')}" aria-label="붙일 꼬리표 내용">`
          + `<button type="button" class="lt-tagline-add">붙이기</button></div></div>`;
    // '꼬리표' 낱말은 줄 안에 한 번만 보인다(#754 이후) — 빈 상태에서는 라벨을 숨기고
    // '아직 꼬리표가 없어요' 빈 문구만 그린다. 칩이 보일 때만 라벨이 나란히 붙는다.
    const undoLine = state.undo ? `<p class="lt-tagline-undo" role="status"><span>꼬리표를 뺐어요</span><button type="button" class="lt-tagline-undo-btn">되돌리기</button></p>` : '';
    host.innerHTML = `<div class="lt-tagline">`
      + (chips.length ? `<span class="lt-tagline-name">꼬리표</span><span class="lt-tagline-chips">${chips.map(chipHTML).join('')}</span>`
        : `<span class="lt-tagline-empty">${esc(emptyText)}</span>`)
      + undoLine
      + (writable ? manual : '')
      + `<p class="lt-tagline-error" role="alert" hidden></p>`
      + `</div>`;
    host.hidden = !(chips.length || writable);
  }

  function fail(message) {
    const line = host.querySelector('.lt-tagline-error');
    if (!line) return;
    line.textContent = message;
    line.hidden = !message;
    // 하은 2회차 손질 ①(261116): 실패 문구가 고정 단추(쉬운 추가의 '담기') 뒤에 가려지지 않게 —
    // 문구를 눈앞으로 데려온다. scrollIntoView는 sticky 단추에 가려진 것을 '보이는 것'으로 치므로,
    // 스크롤 통에서 단추 높이만큼(state.errorReserve) 비켜 앉힌다(tag-line.css의 scroll-margin도 함께 둔다).
    if (message) revealError(line);
  }

  function revealError(line) {
    let scroller = null;
    for (let n = line.parentElement; n; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1) { scroller = n; break; }
    }
    if (!scroller) { line.scrollIntoView?.({ block: 'nearest' }); return; }
    const port = scroller.getBoundingClientRect();
    const r = line.getBoundingClientRect();
    const reserve = state.errorReserve || 0;
    const hidden = r.bottom - (port.bottom - reserve);
    if (hidden > 0) scroller.scrollTop += hidden;
    else if (r.top < port.top) scroller.scrollTop -= (port.top - r.top);
  }

  // #37(AI 고객 37회차): 확정 칩을 다시 눌러 빼는 것은 저장까지 조용히 끝났다 — 잘못 누른 사람은 눈치채지
  // 못한다. 빼기가 저장되면 '꼬리표를 뺐어요 · 되돌리기'를 5초 보여 주고, 되돌리기를 누르면 다시 붙여 저장한다.
  function armUndo(raw) {
    if (state.undoTimer) clearTimeout(state.undoTimer);
    state.undo = raw;
    draw();
    state.undoTimer = setTimeout(() => {
      state.undoTimer = 0;
      if (!alive() || state.undo !== raw) return;
      state.undo = null;
      draw();
    }, undoMs);
  }
  function clearUndo() {
    if (state.undoTimer) { clearTimeout(state.undoTimer); state.undoTimer = 0; }
    state.undo = null;
  }

  function commit(next) {
    const prev = [...state.keywords];
    clearUndo();
    state.keywords = Array.isArray(next) ? [...next] : [];
    draw();
    // #735: onCommit에 '지금 보고 있는 순간 id'를 함께 넘긴다 — 줄을 처음 만든 순간의 id를 클로저로
    // 계속 보내 다른 카드의 꼬리표가 첫 순간에 저장되던 결함을 막는다(update()로 state.momentId가 바뀐다).
    // 누른 값: 누르기 전·후 가운데 달라진 하나(붙이기든 끄기든).
    const before = new Set(prev);
    const after = new Set(state.keywords);
    const clicked = [...after].find((v) => !before.has(v)) ?? [...before].find((v) => !after.has(v)) ?? '';
    const revert = (message) => {
      // 하은 2회차 손질 ②(261116): 실패하면 누른 칩만 꺼진 모양으로 끝낸다 — '누르기 전 모양'으로
      // 되돌리면(예전) 끄기 시도가 실패한 뒤에도 칩이 켜져 성공으로 보였다. 다른 확정 칩은 그대로 둔다.
      state.keywords = clicked ? prev.filter((v) => v !== clicked) : [...prev];
      draw();
      fail(message);
    };
    try {
      const saved = onCommit?.([...state.keywords], state.momentId);
      // 하은 2회차 ④(261116): 저장이 실패했다고 바깥이 알려주면({ok:false}) 눌렀던 칩을 꺼진 모양으로
      // 되돌리고 실패 문구를 보인다 — 칩만 붙고 저장은 안 된 거짓 성공을 막는다.
      // 성공({ok:true})과 결과를 돌려주지 않는 옛 부름(화면 저장 요청 postMessage)은 그대로다.
      const removed = clicked && before.has(clicked) && !after.has(clicked);
      if (saved && saved.ok === false) revert(saved.error || '저장하지 못했어요. 다시 시도해 주세요.');
      else if (removed) armUndo(clicked);
    } catch (error) { revert(error?.message || '저장하지 못했어요. 다시 시도해 주세요.'); }
  }

  const off = new AbortController();
  const when = { signal: off.signal };
  // #739: 거둔 줄의 귀는 두 번 막는다 — signal로 지우고(진짜 DOM), aborted면 무시한다(host가 귀를 안 지우는 흉내·옛 브라우저까지).
  const alive = () => !off.signal.aborted;
  host.addEventListener('click', (event) => {
    if (!alive()) return;
    const chip = event.target.closest('[data-tag-raw]');
    if (!chip) return;
    fail('');
    commit(toggledKeywords(state.keywords, chip.dataset.tagRaw));
  }, when);
  // 되돌리기: 방금 뺀 꼬리표를 다시 붙여 저장한다(빠진 값이니 toggledKeywords는 붙이는 쪽으로 돌아온다).
  host.addEventListener('click', (event) => {
    if (!alive()) return;
    if (!event.target.closest('.lt-tagline-undo-btn')) return;
    const raw = state.undo;
    if (!raw) return;
    fail('');
    commit(toggledKeywords(state.keywords, raw));
  }, when);
  // 직접 입력: 쓰기 창 안에도 붙으므로 form 대신 group으로 두고 Enter·단추로 붙인다(중첩 form 금지).
  function submitInput() {
    const kind = host.querySelector('.lt-tagline-kind')?.value || '';
    const value = host.querySelector('.lt-tagline-value')?.value || '';
    const made = inputTag(kind, value);
    if (!made.ok) { fail(made.reason === 'long' ? TOO_LONG_TEXT : '붙일 내용을 적어 주세요.'); return; }
    const valueInput = host.querySelector('.lt-tagline-value');
    if (valueInput) valueInput.value = '';
    fail('');
    commit(toggledKeywords(state.keywords, made.raw));
  }
  host.addEventListener('click', (event) => {
    if (!alive()) return;
    if (event.target.closest('.lt-tagline-add')) { submitInput(); return; }
    if (event.target.closest('.lt-tagline-toggle')) {
      state.manualOpen = true;
      draw();
      host.querySelector('.lt-tagline-value')?.focus();
    }
  }, when);
  // 갈래를 바꾸면 예시도 함께 바꾼다(가수·노래·무대 … 갈래마다 다른 예시).
  host.addEventListener('change', (event) => {
    if (!alive()) return;
    const select = event.target.closest('.lt-tagline-kind');
    if (!select) return;
    state.kind = select.value;
    const input = host.querySelector('.lt-tagline-value');
    if (input) {
      input.placeholder = KIND_PLACEHOLDER[state.kind] || '';
      input.maxLength = valueLimit(state.kind);
    }
  }, when);
  host.addEventListener('keydown', (event) => {
    if (!alive()) return;
    if (event.key === 'Enter' && event.target.closest('.lt-tagline-value')) { event.preventDefault(); submitInput(); }
  }, when);

  draw();
  return {
    update(moment) {
      if (!moment) return;
      clearUndo(); // #37: 다른 순간으로 바뀌면 방금 뺐다는 알림도 그 순간의 이야기라 거둔다.
      state.momentId = moment.id || state.momentId;
      state.title = moment.title || '';
      state.keywords = Array.isArray(moment.keywords) ? [...moment.keywords] : [];
      draw();
    },
    setKnownTags(tags) { state.knownTags = Array.isArray(tags) ? [...tags] : []; draw(); },
    get momentId() { return state.momentId; },
    destroy() { clearUndo(); off.abort(); host.replaceChildren(); host.classList.remove('lt-tagline-host'); host.hidden = true; }
  };
}

// ── 책·보드·지도 상세에 붙이기(화면 파일은 건드리지 않고 관찰로 붙는다) ─────────────────────

// 화면마다 다른 자리: 상세 제목이 바뀌면(=다른 순간을 열면) 그 순간의 꼬리표 줄을 다시 그린다.
const SCREENS = {
  board: {
    title: 'dTitle',
    insertAfter: (doc) => doc.getElementById('dBasic')?.closest('.section') || null,
    buildHost: (doc) => {
      const section = doc.createElement('div');
      section.className = 'section lt-tagline-section';
      // '꼬리표' 표시는 줄 안에 하나만 있다(#627 2차 — 예전에는 여기에도 붙여 두 번 보였다).
      const host = doc.createElement('div');
      host.id = 'dTags';
      section.append(host);
      return { wrap: section, host };
    }
  },
  book: {
    title: 'detailTitle',
    insertAfter: (doc) => doc.getElementById('detailChips') || null,
    buildHost: (doc) => {
      const host = doc.createElement('div');
      host.id = 'detailTagLine';
      host.className = 'detail-tags';
      return { wrap: host, host };
    }
  },
  network: {
    title: 'detailTitle',
    // #951 ⑤: 지도 상세 판을 보드와 같은 틀로 바꾸면서 '칩 줄'이 없어졌다 — 꼬리표 줄은 '날짜·트리' 줄 아래에 붙인다(보드와 같다).
    insertAfter: (doc) => doc.getElementById('dBasic')?.closest('.section') || null,
    buildHost: (doc) => {
      const block = doc.createElement('div');
      block.className = 'detail-block lt-tagline-section';
      // 라벨은 꼬리표 줄 안의 것 하나만 쓴다(#754 이후) — 블록에도 '꼬리표'를 붙이면 두 번 보였다.
      const host = doc.createElement('div');
      host.id = 'detailTags';
      block.append(host);
      return { wrap: block, host };
    }
  }
};

function frameContext() {
  try { if (window.parent === window) return null; return window.parent.LT41 || null; } catch { return null; }
}

// 트리에서 쓴 꼬리표(재사용 제안의 재료) — 저장 순서대로.
function knownTagsOf(context) {
  const out = [];
  for (const m of context?.tree?.moments || []) {
    for (const k of Array.isArray(m.keywords) ? m.keywords : []) if (!out.includes(k)) out.push(k);
  }
  return out;
}

// 셸에 저장을 부른다(기존 순간 수정 경로). 답이 오면 lt41-tags-saved로 돌아온다.
function sendTags(context, momentId, keywords) {
  try {
    window.parent.postMessage({ type: MSG.tags, treeId: context?.tree?.id || '', momentId, keywords }, location.origin);
  } catch { /* 부모와 통신할 수 없는 화면(직접 연 뒤)에서는 누름을 저장하지 않는다 */ }
}

// 한 화면(iframe 문서)에 꼬리표 줄을 붙인다. 화면 스크립트는 건드리지 않는다 — 상세 제목을 관찰해 붙는다.
export function mountViewTagLine({ screen }) {
  const spec = SCREENS[screen];
  if (!spec) return null;
  const doc = document;
  const title = doc.getElementById(spec.title);
  const anchor = spec.insertAfter(doc);
  if (!title || !anchor) return null;
  const context = () => frameContext();
  const writable = () => { const c = context(); return !!c && c.source === 'server' && c.writable === true; };
  const momentOf = (id) => (context()?.tree?.moments || []).find((m) => m.id === id) || null;

  const { wrap, host } = spec.buildHost(doc);
  anchor.after(wrap);
  let line = null;
  let shownId = '';

  function render() {
    const c = context();
    const moment = momentOf(c?.momentId);
    if (!moment) { if (line) { line.destroy(); line = null; } shownId = ''; return; }
    if (!line) {
      line = renderTagLine({
        host, doc,
        moment: { id: moment.id, title: moment.title || '', keywords: moment.keywords },
        knownTags: knownTagsOf(c),
        writable: writable(),
        // #735: 저장할 순간 id는 줄이 가진 현재 값(renderTagLine이 넘겨 주는 것)으로 정한다 —
        // 처음 만든 순간의 객체를 클로저로 계속 보내지 않는다.
        onCommit: (keywords, momentId) => { if (momentId) sendTags(c, momentId, keywords); }
      });
    } else {
      line.update({ id: moment.id, title: moment.title || '', keywords: moment.keywords });
      line.setKnownTags(knownTagsOf(c));
    }
    shownId = moment.id;
  }

  // 상세 제목이 바뀌면(다른 순간을 열면) 다시 그린다. 같은 순간을 다시 열어도 다시 그린다(값이 바뀌었을 수 있다).
  // #735: 제목만 관찰하면 보드에서 같은 제목의 다른 카드로 바꿀 때 다시 그리지 않아, 꼬리표 줄이 옛 순간의
  // keywords를 그대로 들고 저장할 수 있다. 상세 전체를 관찰해 선택이 바뀐 것(제목이 같아도 보드는 dBasic·dConn을
  // 다시 그린다)을 잡고, 꼬리표 줄이 스스로 그린 바뀜(wrap 안)은 무시한다.
  const detailRoot = doc.getElementById('detail') || title;
  new MutationObserver((records) => {
    if (records.every((record) => wrap.contains(record.target))) return;
    const id = context()?.momentId || '';
    if (id && id !== shownId) render();
    else if (id && records.some((record) => title.contains(record.target))) render();
  }).observe(detailRoot, { childList: true, characterData: true, subtree: true });

  // 셸의 저장 답: 모델의 keywords를 다시 읽어 그리고, 화면이 들고 있는 자기 사본에게 알린다(보드 카드 등).
  addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.type !== MSG.tagsSaved) return;
    const c = context();
    const moment = momentOf(event.data.momentId);
    if (moment && Array.isArray(event.data.keywords)) {
      // 부모의 모델이 이미 바꿔 둔 값이 없으면(저장 실패) 답의 값으로 되돌려 놓는다.
      const fresh = (c?.tree?.moments || []).find((m) => m.id === event.data.momentId);
      if (!fresh || !Array.isArray(fresh.keywords) || fresh.keywords.join('\u0000') !== event.data.keywords.join('\u0000')) {
        moment.keywords = [...(event.data.keywords || [])];
      }
    }
    if (line && (event.data.momentId === line.momentId || event.data.momentId === context()?.momentId)) render();
    try {
      dispatchEvent(new CustomEvent('lt41-tags-changed', { detail: { momentId: event.data.momentId, keywords: event.data.keywords || [], ok: event.data.ok !== false } }));
    } catch { /* 답을 쓰는 화면이 없어도 저장은 끝난다 */ }
  });

  // 그려질 때 이미 열린 상세(선택 복원)에도 붙는다 — 화면 스크립트가 나중에 이벤트를 받아도 늦지 않게.
  if (doc.getElementById(spec.title) && context()?.momentId) render();
  dispatchEvent(new Event('lt41-tagline-ready'));
  return { render };
}

// 클래식 스크립트(보드 카드·책 페이지)가 쓰는 한 벌 노출 — 카드 칩 순서·개수 규칙은 tag-model.mjs 하나다.
// (시험은 Node에서 이 모듈을 부르기도 한다 — 브라우저 전역이 없는 자리에서는 노출·붙이기를 건너뛴다.)
if (typeof window !== 'undefined') {
  window.LTTagLine = { cardTags, chipText, parseTag };

  // 책·보드·지도 화면은 스스로 붙는다(tree-title.mjs와 같은 화면 판정).
  const screen = document.documentElement.dataset.v41Screen;
  if (screen === 'board' || screen === 'book' || screen === 'network') mountViewTagLine({ screen });
}
