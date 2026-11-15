// #627 PR B: 꼬리표 줄 — 순간 상세(책·보드·지도)와 쉬운 추가로 담은 직후 안내에 붙는 한 벌 화면 조각.
// 규칙·계산은 tag-model.mjs·tags.mjs 한 벌을 쓰고, 이 파일은 그리기·누르기만 한다.
// 제안은 흐린 칩, 확정은 진한 칩이다. 누르면 확정·해제된다. 사용자가 확인하기 전에는 저장하지 않는다 —
// 저장 호출은 onCommit(바뀐 keywords 전체)으로 바깥에 맡기고, 이 파일은 저장 경로를 모른다.
import { TAG_KINDS } from './tags.mjs';
import { cardTags, chipText, tagLineChips, toggledKeywords, inputTag } from './tag-model.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOO_LONG_TEXT = '24자를 넘어요';

function chipHTML(tag) {
  if (tag.state === 'tooLong') {
    return `<span class="lt-tag-chip is-toolong" data-toolong="1">${esc(chipText(tag))} · ${TOO_LONG_TEXT}</span>`;
  }
  const cls = tag.state === 'confirmed' ? 'is-confirmed' : 'is-proposal';
  const title = tag.state === 'confirmed' ? '누르면 꼬리표를 뗀다' : '누르면 꼬리표를 붙인다';
  return `<button type="button" class="lt-tag-chip ${cls}" data-tag-raw="${esc(tag.raw || tag.value)}" title="${title}">${esc(chipText(tag))}</button>`;
}

// 꼬리표 줄 하나를 host에 그린다. update(moment)로 같은 자리에 다시 그리고, destroy로 지운다.
export function renderTagLine({ host, doc = document, moment, knownTags = [], writable = false, onCommit, emptyText = '아직 꼬리표가 없어요' }) {
  const state = {
    momentId: moment?.id || '',
    title: moment?.title || '',
    keywords: Array.isArray(moment?.keywords) ? [...moment.keywords] : [],
    knownTags: Array.isArray(knownTags) ? [...knownTags] : []
  };
  if (!host) return null;
  host.classList.add('lt-tagline-host');

  function draw() {
    const { confirmed, proposals } = tagLineChips({ keywords: state.keywords, title: state.title, knownTags: state.knownTags });
    // 제안은 쓸 수 있는 자리(소유자)에서만 보인다 — 읽어 보는 화면(공유·예시)에는 확정된 꼬리표만 보인다.
    const chips = [...confirmed, ...(writable ? proposals : [])];
    const kinds = [...TAG_KINDS.map((k) => `<option value="${k.id}">${k.label}</option>`), '<option value="">종류 없이</option>'].join('');
    host.innerHTML = `<div class="lt-tagline">`
      + `<span class="lt-tagline-name">꼬리표</span>`
      + (chips.length ? `<span class="lt-tagline-chips">${chips.map(chipHTML).join('')}</span>`
        : `<span class="lt-tagline-empty">${esc(emptyText)}</span>`)
      + (writable ? `<div class="lt-tagline-input" role="group" aria-label="꼬리표 직접 입력">`
          + `<label class="lt-tagline-label">종류<select class="lt-tagline-kind" aria-label="꼬리표 종류">${kinds}</select></label>`
          + `<label class="lt-tagline-label">값<input class="lt-tagline-value" maxlength="24" autocomplete="off" placeholder="꼬리표 값" aria-label="꼬리표 값"></label>`
          + `<button type="button" class="lt-tagline-add">붙이기</button></div>`
        : '')
      + `<p class="lt-tagline-error" role="alert" hidden></p>`
      + `</div>`;
    host.hidden = !(chips.length || writable);
  }

  function fail(message) {
    const line = host.querySelector('.lt-tagline-error');
    if (!line) return;
    line.textContent = message;
    line.hidden = !message;
  }

  function commit(next) {
    state.keywords = Array.isArray(next) ? [...next] : [];
    draw();
    try { onCommit?.([...state.keywords]); } catch (error) { fail(error?.message || '저장하지 못했어요.'); }
  }

  host.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tag-raw]');
    if (!chip) return;
    fail('');
    commit(toggledKeywords(state.keywords, chip.dataset.tagRaw));
  });
  // 직접 입력: 쓰기 창 안에도 붙으므로 form 대신 group으로 두고 Enter·단추로 붙인다(중첩 form 금지).
  function submitInput() {
    const kind = host.querySelector('.lt-tagline-kind')?.value || '';
    const value = host.querySelector('.lt-tagline-value')?.value || '';
    const made = inputTag(kind, value);
    if (!made.ok) { fail(made.reason === 'long' ? TOO_LONG_TEXT : '꼬리표 값을 적어 주세요.'); return; }
    const valueInput = host.querySelector('.lt-tagline-value');
    if (valueInput) valueInput.value = '';
    fail('');
    commit(toggledKeywords(state.keywords, made.raw));
  }
  host.addEventListener('click', (event) => { if (event.target.closest('.lt-tagline-add')) submitInput(); });
  host.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.closest('.lt-tagline-value')) { event.preventDefault(); submitInput(); }
  });

  draw();
  return {
    update(moment) {
      if (!moment) return;
      state.momentId = moment.id || state.momentId;
      state.title = moment.title || '';
      state.keywords = Array.isArray(moment.keywords) ? [...moment.keywords] : [];
      draw();
    },
    setKnownTags(tags) { state.knownTags = Array.isArray(tags) ? [...tags] : []; draw(); },
    get momentId() { return state.momentId; },
    destroy() { host.replaceChildren(); host.classList.remove('lt-tagline-host'); host.hidden = true; }
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
    insertAfter: (doc) => doc.querySelector('#detail .chips') || null,
    buildHost: (doc) => {
      const block = doc.createElement('div');
      block.className = 'detail-block lt-tagline-section';
      block.append(Object.assign(doc.createElement('span'), { textContent: '꼬리표' }));
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
    window.parent.postMessage({ type: 'lt41-tags', treeId: context?.tree?.id || '', momentId, keywords }, location.origin);
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
        onCommit: (keywords) => sendTags(c, moment.id, keywords)
      });
    } else {
      line.update({ id: moment.id, title: moment.title || '', keywords: moment.keywords });
      line.setKnownTags(knownTagsOf(c));
    }
    shownId = moment.id;
  }

  // 상세 제목이 바뀌면(다른 순간을 열면) 다시 그린다. 같은 순간을 다시 열어도 다시 그린다(값이 바뀌었을 수 있다).
  new MutationObserver(() => {
    const id = context()?.momentId || '';
    if (id && id !== shownId) render();
    else if (id) render();
  }).observe(title, { childList: true, characterData: true, subtree: true });

  // 셸의 저장 답: 모델의 keywords를 다시 읽어 그리고, 화면이 들고 있는 자기 사본에게 알린다(보드 카드 등).
  addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.type !== 'lt41-tags-saved') return;
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
  window.LTTagLine = { cardTags, chipText };

  // 책·보드·지도 화면은 스스로 붙는다(tree-title.mjs와 같은 화면 판정).
  const screen = document.documentElement.dataset.v41Screen;
  if (screen === 'board' || screen === 'book' || screen === 'network') mountViewTagLine({ screen });
}
