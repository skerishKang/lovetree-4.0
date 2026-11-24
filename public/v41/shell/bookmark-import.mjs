// #822 1단계: 북마크에서 가져오기 창.
// 판정·추출·문구 계산은 ../bookmark-import.mjs의 순수 함수가 맡고, 이 파일은 DOM만 만진다(docs/TESTING.md).
// 창은 처음 열 때 만든다 — 셸 첫 화면이 받는 파일을 늘리지 않으려고 마크업은 여기서 만들고,
// 스타일은 bookmark-import.css 한 장을 그때 싣는다. 북마크에서 온 글자는 textContent로만 넣는다.
// 북마크 파일은 이 브라우저 안에서만 읽는다(서버로 보내는 요청이 없다). 읽은 뒤 파일 내용은 붙들지 않는다.
import { BOOKMARK_FILE_MAX_BYTES, READ_NOT_BOOKMARK, readBookmarkVideos, foundSummaryText, folderGroups } from '../bookmark-import.mjs';
import { DROP_READONLY_NOTICE } from '../quick-add.mjs';

export const BOOKMARK_PANEL_ID = 'bookmark-import-panel';
export const BOOKMARK_STYLE_HREF = '/v41/bookmark-import.css';

export const BOOKMARK_TEXT = Object.freeze({
  eyebrow: '순간 추가',
  title: '북마크에서 가져오기',
  close: '북마크에서 가져오기 닫기',
  lede: '브라우저에 모아 둔 유튜브 영상을 한 번에 담아요. 북마크 파일은 이 기기 안에서만 읽고, 어디에도 올리지 않아요.',
  pick: '북마크 파일 고르기',
  pickHint: '브라우저에서 내보낸 북마크 파일(.html)을 골라 주세요.',
  dropHint: '이 창으로 끌어다 놓아도 돼요.',
  reading: '북마크 파일을 읽고 있어요…',
  helpTitle: '북마크 파일은 어떻게 만드나요?',
  help: [
    ['크롬', '북마크 관리자(Ctrl+Shift+O) → 오른쪽 위 ⋮ → 북마크 내보내기'],
    ['엣지', '즐겨찾기(Ctrl+Shift+O) → ⋯ → 즐겨찾기 내보내기'],
    ['파이어폭스', '북마크 관리(Ctrl+Shift+O) → 가져오기 및 백업 → HTML로 북마크 내보내기'],
    ['사파리(맥)', '위쪽 메뉴의 파일 → 내보내기 → 책갈피'],
  ],
  facts: [
    '비밀번호나 방문 기록이 아니라 북마크만 담긴 파일이에요.',
    '브라우저의 북마크는 바뀌지 않아요.',
    '유튜브 영상 주소·제목·썸네일 주소만 쓰고, 영상은 복사하지 않아요.',
  ],
  tooLarge: '파일이 너무 커요. 20MB까지 읽을 수 있어요.',
  unreadable: '파일을 읽지 못했어요. 다시 골라 주세요.',
  notBookmark: '브라우저에서 내보낸 북마크 파일이 아닌 것 같아요. 아래 방법으로 내보낸 파일을 골라 주세요.',
  noVideo: '이 북마크 파일에는 유튜브 영상 주소가 없어요.',
  truncated: '북마크가 아주 많아 앞에서부터 읽을 수 있는 만큼만 읽었어요.',
  another: '다른 파일 고르기',
  foldersTitle: '폴더별로 찾은 영상',
});

/** 영상은 없고 재생목록·채널만 있을 때의 안내 — 왜 담을 것이 없는지 개수로 알려 준다. */
export function noVideoText({ playlistCount = 0, channelCount = 0 } = {}) {
  const skipped = [];
  if (playlistCount) skipped.push(`재생목록 ${playlistCount}개`);
  if (channelCount) skipped.push(`채널 ${channelCount}개`);
  return skipped.length ? `${BOOKMARK_TEXT.noVideo} ${skipped.join('·')}는 이번에는 담지 않아요.` : BOOKMARK_TEXT.noVideo;
}

export function createBookmarkImport(deps = {}) {
  const doc = deps.document || globalThis.document;
  const $ = deps.$ || ((id) => doc.getElementById(id));
  const isFinePointer = deps.isFinePointer || (() => globalThis.matchMedia?.('(pointer:fine)').matches === true);
  const state = { view: 'start', result: null, reading: false };
  let opener = null;

  function make(tag, props = {}, ...children) {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'hidden' || key === 'disabled' || key === 'type' || key === 'id' || key === 'accept' || key === 'open') node[key] = value;
      else node.setAttribute(key, String(value));
    }
    if (children.length) node.append(...children);
    return node;
  }

  // ---- 스타일 한 장: 처음 열 때 싣고, 다 실릴 때까지 잠깐 기다렸다가 창을 띄운다(맨몸으로 번쩍이지 않게). ----
  let styleReady = null;
  function ensureStyle() {
    if (deps.ensureStyle) return Promise.resolve(deps.ensureStyle());
    if (styleReady) return styleReady;
    styleReady = new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const link = make('link', { rel: 'stylesheet', href: BOOKMARK_STYLE_HREF });
      link.addEventListener('load', finish);
      link.addEventListener('error', finish);
      setTimeout(finish, 1500);
      (doc.head || doc.body).append(link);
    });
    return styleReady;
  }

  // ---- 창 마크업 ----
  const refs = {};
  refs.close = make('button', { type: 'button', class: 'close', 'aria-label': BOOKMARK_TEXT.close, text: '×' });
  refs.pick = make('button', { type: 'button', class: 'primary bmi-pick', text: BOOKMARK_TEXT.pick });
  refs.file = make('input', { type: 'file', accept: '.html,.htm,text/html', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
  refs.dropHint = make('span', { class: 'bmi-drop-hint', text: BOOKMARK_TEXT.dropHint });
  refs.error = make('p', { class: 'bmi-error', role: 'alert', id: 'bookmark-import-error' });
  refs.status = make('p', { class: 'bmi-status', role: 'status' });
  refs.start = make('div', { class: 'bmi-start' },
    make('p', { class: 'panel-note', text: BOOKMARK_TEXT.lede }),
    make('div', { class: 'bmi-drop' },
      refs.pick,
      make('p', { class: 'bmi-pick-hint' }, make('span', { text: `${BOOKMARK_TEXT.pickHint} ` }), refs.dropHint),
      refs.file),
    refs.status,
    refs.error,
    make('details', { class: 'bmi-help' },
      make('summary', { text: BOOKMARK_TEXT.helpTitle }),
      make('ul', { class: 'bmi-help-list' }, ...BOOKMARK_TEXT.help.map(([name, steps]) => make('li', {}, make('strong', { text: name }), make('span', { text: steps }))))),
    make('ul', { class: 'bmi-facts' }, ...BOOKMARK_TEXT.facts.map((text) => make('li', { text }))));
  refs.summary = make('p', { class: 'bmi-summary', role: 'status' });
  refs.note = make('p', { class: 'bmi-note' });
  refs.another = make('button', { type: 'button', class: 'bmi-link', text: BOOKMARK_TEXT.another });
  refs.folders = make('ul', { class: 'bmi-folders', 'aria-label': BOOKMARK_TEXT.foldersTitle });
  refs.preview = make('div', { class: 'bmi-preview', hidden: true },
    make('div', { class: 'bmi-summary-row' }, refs.summary, refs.another),
    refs.note,
    refs.folders);
  refs.scroll = make('div', { class: 'bmi-scroll' }, refs.start, refs.preview);
  const dialog = make('dialog', { id: BOOKMARK_PANEL_ID, class: 'bmi', 'data-lt-panel': 'card', 'aria-labelledby': 'bookmark-import-title' },
    make('div', { class: 'panel-heading' },
      make('div', {}, make('span', { class: 'eyebrow', text: BOOKMARK_TEXT.eyebrow }), make('h2', { id: 'bookmark-import-title', text: BOOKMARK_TEXT.title })),
      refs.close),
    refs.scroll);
  refs.dialog = dialog;
  doc.body.append(dialog);

  // 진입 가드는 쉬운 추가(shell/quick-add.mjs ensureWritable)와 같은 순서·같은 문구다.
  function ensureWritable() {
    const member = deps.getMember?.();
    if (!member?.snapshot().owned) { deps.openLoginStart?.('new-tree'); return false; }
    if (deps.getSource?.() !== 'server') { deps.resumeMember?.('write'); return false; }
    if (!member.snapshot().writable) { deps.notify?.(DROP_READONLY_NOTICE); deps.openSettingsData?.(); return false; }
    return true;
  }

  function setError(text) { refs.error.textContent = text || ''; }

  function renderFolders() {
    const groups = folderGroups(state.result?.videos || []);
    refs.folders.replaceChildren(...groups.map((group) => make('li', {},
      make('span', { class: 'bmi-folder-name', text: group.label }),
      make('span', { class: 'bmi-folder-count', text: `${group.videos.length}개` }))));
  }

  function render() {
    const preview = state.view === 'preview' && !!state.result;
    refs.start.hidden = preview;
    refs.preview.hidden = !preview;
    refs.pick.disabled = state.reading;
    refs.status.textContent = state.reading ? BOOKMARK_TEXT.reading : '';
    refs.dropHint.hidden = !isFinePointer();
    if (!preview) return;
    refs.summary.textContent = foundSummaryText(state.result);
    refs.note.textContent = state.result.truncated ? BOOKMARK_TEXT.truncated : '';
    refs.note.hidden = !state.result.truncated;
    renderFolders();
  }

  // 파일 하나를 읽어 유튜브 영상 목록으로 바꾼다. 읽은 글자는 이 함수 밖으로 나가지 않는다.
  async function readFile(file) {
    if (!file || state.reading) return false;
    setError('');
    if (Number(file.size) > BOOKMARK_FILE_MAX_BYTES) { setError(BOOKMARK_TEXT.tooLarge); return false; }
    state.reading = true;
    render();
    let result = null;
    try { result = readBookmarkVideos(await file.text()); }
    catch { result = null; }
    state.reading = false;
    if (!result) { render(); setError(BOOKMARK_TEXT.unreadable); return false; }
    if (!result.ok) { render(); setError(result.reason === READ_NOT_BOOKMARK ? BOOKMARK_TEXT.notBookmark : noVideoText(result)); return false; }
    state.result = result;
    state.view = 'preview';
    render();
    refs.another.focus?.();
    return true;
  }

  function showStart() {
    state.view = 'start';
    state.result = null;
    setError('');
    render();
    refs.pick.focus?.();
  }

  async function open() {
    if (!ensureWritable()) return false;
    await ensureStyle();
    if (!dialog.open) {
      opener = doc.activeElement || null;
      dialog.showModal();
      deps.onModalShown?.();
    }
    render();
    (state.view === 'preview' ? refs.another : refs.pick).focus?.();
    return true;
  }

  function close() { if (dialog.open) dialog.close(); }

  refs.close.addEventListener('click', close);
  refs.pick.addEventListener('click', () => { refs.file.click?.(); });
  refs.file.addEventListener('change', () => {
    const file = refs.file.files?.[0] || null;
    refs.file.value = ''; // 같은 파일을 다시 골라도 change가 오게
    void readFile(file);
  });
  refs.another.addEventListener('click', showStart);
  // 끌어다 놓기: 이 창 위에서는 셸의 '주소 끌어다 놓기'(quick-add mountDrop)가 받지 않게 여기서 멈춘다.
  const hasFiles = (event) => Array.from(event?.dataTransfer?.types || []).includes('Files');
  for (const type of ['dragenter', 'dragover']) {
    dialog.addEventListener(type, (event) => {
      event.stopPropagation?.();
      if (!hasFiles(event)) return;
      event.preventDefault?.();
      if (event.dataTransfer) event.dataTransfer.dropEffect = state.view === 'start' ? 'copy' : 'none';
    });
  }
  dialog.addEventListener('drop', (event) => {
    event.stopPropagation?.();
    event.preventDefault?.();
    if (state.view !== 'start') return;
    void readFile(event.dataTransfer?.files?.[0] || null);
  });
  // 바깥 누르기 = 닫기(공통 창 틀과 같은 판정: 창 상자 밖을 눌렀을 때만).
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog || !dialog.getBoundingClientRect) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  // 닫히면 연 단추로 초점을 돌려준다. 연 단추가 안 보이면(순간 추가 창이 함께 닫힘) 머리줄의 순간 추가 단추로.
  dialog.addEventListener('close', () => {
    const visible = (node) => !!node?.getClientRects?.().length;
    const target = [opener, $('write-menu'), $('mobile-add'), $('mobile-more')].find(visible) || null;
    opener = null;
    setTimeout(() => target?.focus?.(), 0);
  });

  return { open, close, readFile, isOpen: () => !!dialog.open, state: () => ({ view: state.view, count: state.result?.videos.length || 0, reading: state.reading }), refs };
}
