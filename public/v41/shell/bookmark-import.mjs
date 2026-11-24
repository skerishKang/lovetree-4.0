// #822 1단계: 북마크에서 가져오기 창.
// 판정·추출·문구 계산은 ../bookmark-import.mjs의 순수 함수가 맡고, 이 파일은 DOM만 만진다(docs/TESTING.md).
// 창은 처음 열 때 만든다 — 셸 첫 화면이 받는 파일을 늘리지 않으려고 마크업은 여기서 만들고,
// 스타일은 bookmark-import.css 한 장을 그때 싣는다. 북마크에서 온 글자는 textContent로만 넣는다.
// 북마크 파일은 이 브라우저 안에서만 읽는다(서버로 보내는 요청이 없다). 읽은 뒤 파일 내용은 붙들지 않는다.
import {
  BOOKMARK_FILE_MAX_BYTES, READ_NOT_BOOKMARK, readBookmarkVideos, foundSummaryText, folderGroups,
  existingVideoTrees, defaultPicked, scopeState, pickScope, pickOne, createTitleQueue, pickedCountText,
  NEW_TREE_VALUE, TREE_NAME_MAX, saveBlockText, saveBookmarkVideos, waitForSync, progressText, savedSummaryText, SYNC_DONE, SYNC_FAILED,
} from '../bookmark-import.mjs';
import { DROP_READONLY_NOTICE } from '../quick-add.mjs';
// 썸네일 주소·영상 제목·날짜 표기·트리 이름은 기존 한 벌을 그대로 쓴다(새 규칙을 만들지 않는다).
import { youtubeStageThumbUrl } from '../youtube-id.mjs';
import { fetchVideoTitle } from '../video-title.mjs';
import { formatDisplayDate } from '../book-usability.mjs';
import { displayTreeTitle } from '../tree-name.mjs';
// 담을 자리(가장 최근 순간 다음)와 제목 기다림 상한도 기존 값을 그대로 쓴다.
import { latestMomentId } from '../domain.mjs';
import { INTAKE_TITLE_WAIT_MS } from '../quick-intake.mjs';

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
  listTitle: '찾은 유튜브 영상',
  pickAll: '전체 고르기',
  exists: '이미 있음',
  noTitle: '제목 없는 영상',
  titlePending: '제목을 확인하고 있어요…',
  undated: '오늘 날짜로 담아요',
  treeLabel: '담을 트리',
  newTree: '＋ 새 트리 만들기',
  newNameLabel: '새 트리 이름',
  newNamePlaceholder: '새 트리 이름 (예: 좋아하는 가수)',
  savingTitle: '담는 중이에요',
  savingNote: '창을 닫지 말고 잠시만 기다려 주세요.',
  syncing: '서버에 저장하고 있어요…',
  busy: '담는 중이에요. 끝난 뒤에 닫을 수 있어요.',
  doneHint: '순간 날짜는 북마크한 날로 담았어요. 제목과 감상은 책에서 하나씩 다듬을 수 있어요.',
  syncPending: '서버에 저장하고 있어요. 잠시 뒤 저장 안내가 따로 뜨지 않으면 저장된 거예요.',
  syncFailed: '아직 서버에 저장되지 않았어요. 이 창을 닫고 화면의 저장 안내에서 다시 저장해 주세요.',
  retry: '다시 시도',
  openTree: '트리 보러 가기',
  done: '닫기',
});

/** 담기 단추 글자. */
export function saveLabel(count) { return count > 0 ? `${count}개 담기` : '담기'; }
/** 담지 못한 목록의 제목. */
export function failedTitle(count) { return `담지 못한 영상 ${count}개`; }
/** 남은 새 영상으로 돌아가는 단추 글자. */
export function continueLabel(count) { return `남은 ${count}개 이어서 고르기`; }

// 제목 조회(기존 oEmbed 경로)는 한 번에 하나씩, 사이를 띄우고, 파일 하나에 이 횟수까지만 부른다.
export const TITLE_FETCH_LIMIT = 200;
export const TITLE_FETCH_GAP_MS = 120;

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
  const fetchImpl = deps.fetchImpl || ((...args) => globalThis.fetch(...args));
  const pause = deps.pause || (() => new Promise((resolve) => setTimeout(resolve, 0)));
  // view: start(파일 고르기) → preview(미리보기·고르기) → saving(담는 중) → done(마침)
  const state = { view: 'start', result: null, reading: false, existing: new Map(), picked: new Set(), target: '', outcome: null };
  let opener = null;
  // 미리보기 목록의 노드 장부: 고를 때마다 목록을 다시 그리지 않고 칸·글자만 고친다.
  let rows = new Map();       // 영상 이름표 → { box, title, video }
  let rowsByVideo = new Map(); // 유튜브 영상 id → [row]
  let groups = [];            // [{ box, videos }]
  const treeName = (tree) => displayTreeTitle(String(tree?.title || tree?.subject || '') || '트리');
  const listTrees = () => { const trees = deps.listTrees?.(); return Array.isArray(trees) ? trees : []; };
  const titles = createTitleQueue({
    fetchTitle: (videoId) => fetchVideoTitle(videoId, fetchImpl),
    limit: deps.titleLimit ?? TITLE_FETCH_LIMIT,
    gapMs: deps.titleGapMs ?? TITLE_FETCH_GAP_MS,
    // 받은 제목을 그 영상의 줄에 넣는다. 상한까지 다 불렀으면 '확인 중'으로 남은 줄도 한 번 고쳐 그린다.
    onTitle: (videoId) => { for (const row of titles.exhausted() ? rows.values() : rowsByVideo.get(videoId) || []) paintTitle(row); },
  });

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
  refs.all = make('input', { type: 'checkbox', id: 'bookmark-import-all' });
  refs.count = make('span', { class: 'bmi-count', role: 'status' });
  refs.groups = make('div', { class: 'bmi-groups', role: 'group', 'aria-label': BOOKMARK_TEXT.listTitle });
  refs.preview = make('div', { class: 'bmi-preview', hidden: true },
    make('div', { class: 'bmi-summary-row' }, refs.summary, refs.another),
    refs.note,
    make('div', { class: 'bmi-toolbar' },
      make('label', { class: 'bmi-check bmi-all' }, refs.all, make('span', { text: BOOKMARK_TEXT.pickAll })),
      refs.count),
    refs.groups);
  // 담는 중
  refs.progressBar = make('div', { class: 'bmi-progress', role: 'progressbar', 'aria-labelledby': 'bookmark-import-saving-title', 'aria-valuemin': '0' }, make('span', { class: 'bmi-progress-fill' }));
  refs.progressCount = make('p', { class: 'bmi-progress-count', 'aria-hidden': 'true' });
  refs.progressNow = make('p', { class: 'bmi-progress-now' });
  refs.saving = make('div', { class: 'bmi-saving', hidden: true },
    make('p', { class: 'bmi-saving-title', id: 'bookmark-import-saving-title', text: BOOKMARK_TEXT.savingTitle }),
    refs.progressBar, refs.progressCount, refs.progressNow,
    make('p', { class: 'panel-note', text: BOOKMARK_TEXT.savingNote }));
  // 마침
  refs.doneTitle = make('p', { class: 'bmi-done-title', role: 'status', tabindex: '-1' });
  refs.doneHint = make('p', { class: 'bmi-done-hint', text: BOOKMARK_TEXT.doneHint });
  refs.doneNote = make('p', { class: 'bmi-done-note bmi-error' });
  refs.failedTitle = make('h3', { class: 'bmi-failed-title' });
  refs.failedList = make('ul', { class: 'bmi-failed-list' });
  refs.retry = make('button', { type: 'button', text: BOOKMARK_TEXT.retry });
  refs.failed = make('div', { class: 'bmi-failed', hidden: true }, refs.failedTitle, refs.failedList, make('div', { class: 'button-row' }, refs.retry));
  refs.openTree = make('button', { type: 'button', class: 'primary', text: BOOKMARK_TEXT.openTree });
  refs.more = make('button', { type: 'button' });
  refs.finish = make('button', { type: 'button', text: BOOKMARK_TEXT.done });
  refs.done = make('div', { class: 'bmi-done', hidden: true },
    refs.doneTitle, refs.doneHint, refs.doneNote, refs.failed,
    make('div', { class: 'button-row bmi-done-actions' }, refs.openTree, refs.more, refs.finish));
  refs.scroll = make('div', { class: 'bmi-scroll' }, refs.start, refs.preview, refs.saving, refs.done);
  // 아래 고정 줄: 담을 트리 고르기(새 트리 만들기 포함)와 담기 단추. 미리보기에서만 보인다.
  refs.tree = make('select', { id: 'bookmark-import-tree' });
  refs.newName = make('input', { id: 'bookmark-import-new-name', type: 'text', maxlength: String(TREE_NAME_MAX), autocomplete: 'off', placeholder: BOOKMARK_TEXT.newNamePlaceholder, 'aria-label': BOOKMARK_TEXT.newNameLabel, hidden: true });
  refs.footError = make('p', { class: 'bmi-error bmi-foot-error', role: 'alert' });
  refs.save = make('button', { type: 'button', class: 'primary bmi-save' });
  refs.foot = make('div', { class: 'bmi-foot', hidden: true },
    refs.footError,
    make('div', { class: 'bmi-foot-row' },
      make('div', { class: 'bmi-target' }, make('label', { for: 'bookmark-import-tree', text: BOOKMARK_TEXT.treeLabel }), refs.tree, refs.newName),
      refs.save));
  const dialog = make('dialog', { id: BOOKMARK_PANEL_ID, class: 'bmi', 'data-lt-panel': 'card', 'aria-labelledby': 'bookmark-import-title' },
    make('div', { class: 'panel-heading' },
      make('div', {}, make('span', { class: 'eyebrow', text: BOOKMARK_TEXT.eyebrow }), make('h2', { id: 'bookmark-import-title', text: BOOKMARK_TEXT.title })),
      refs.close),
    refs.scroll,
    refs.foot);
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

  // ---- 미리보기 목록 ----
  function titleOf(row) {
    return titles.title(row.video.videoId) || row.video.title || (titles.has(row.video.videoId) || titles.exhausted() ? BOOKMARK_TEXT.noTitle : BOOKMARK_TEXT.titlePending);
  }
  function paintTitle(row) { row.title.textContent = titleOf(row); }
  function dateText(video) {
    return video.dated ? formatDisplayDate(video.date, deps.dateStyle?.()) : BOOKMARK_TEXT.undated;
  }

  function buildItem(video) {
    const box = make('input', { type: 'checkbox' });
    box.checked = state.picked.has(video.id);
    const image = make('img', { class: 'bmi-thumb-img', alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', src: youtubeStageThumbUrl(video.videoId, 'mqdefault') });
    const thumb = make('span', { class: 'bmi-thumb', 'aria-hidden': 'true' }, image);
    // 썸네일을 못 받으면(없어진 영상 등) 깨진 그림 대신 빈 칸을 둔다.
    image.addEventListener('error', () => { image.hidden = true; thumb.classList.add('is-missing'); });
    const title = make('span', { class: 'bmi-title' });
    const meta = make('span', { class: 'bmi-meta' }, make('span', { class: 'bmi-date', text: dateText(video) }));
    const existsIn = state.existing.get(video.id);
    if (existsIn !== undefined) meta.append(make('span', { class: 'bmi-badge', text: existsIn ? `${BOOKMARK_TEXT.exists} · ${existsIn}` : BOOKMARK_TEXT.exists }));
    const row = { box, title, video };
    paintTitle(row);
    box.addEventListener('change', () => { togglePick(video, box.checked); });
    rows.set(video.id, row);
    if (!rowsByVideo.has(video.videoId)) rowsByVideo.set(video.videoId, []);
    rowsByVideo.get(video.videoId).push(row);
    return make('li', {}, make('label', { class: `bmi-item${existsIn !== undefined ? ' is-existing' : ''}` }, box, thumb, make('span', { class: 'bmi-text' }, title, meta)));
  }

  function renderList() {
    rows = new Map();
    rowsByVideo = new Map();
    groups = folderGroups(state.result?.videos || []).map((group) => {
      const box = make('input', { type: 'checkbox', 'aria-label': `${group.label} 폴더의 영상 모두 고르기` });
      box.addEventListener('change', () => { toggleScope(group.videos, box.checked); });
      const node = make('div', { class: 'bmi-group' },
        make('label', { class: 'bmi-check bmi-group-head' }, box,
          make('span', { class: 'bmi-folder-name', text: group.label }),
          make('span', { class: 'bmi-folder-count', text: `${group.videos.length}개` })),
        make('ul', { class: 'bmi-items' }, ...group.videos.map(buildItem)));
      return { box, videos: group.videos, node };
    });
    refs.groups.replaceChildren(...groups.map((group) => group.node));
  }

  function paintScope(box, videos) {
    const scope = scopeState(videos, state.existing, state.picked);
    box.checked = scope.checked;
    box.indeterminate = scope.mixed;
    box.disabled = scope.empty;
  }
  // 고름이 바뀐 뒤: 칸 모양과 고른 수만 고친다(목록은 다시 그리지 않는다).
  function syncPicks() {
    for (const row of rows.values()) row.box.checked = state.picked.has(row.video.id);
    for (const group of groups) paintScope(group.box, group.videos);
    paintScope(refs.all, state.result?.videos || []);
    refs.count.textContent = pickedCountText(state.picked.size);
    refs.save.textContent = saveLabel(state.picked.size);
    refs.save.disabled = state.picked.size === 0;
    refs.footError.textContent = '';
  }
  // 고른 영상의 제목만 차례로 받는다(기존 oEmbed 경로, 한 번에 하나·상한).
  function askTitles() {
    const wanted = (state.result?.videos || []).filter((video) => state.picked.has(video.id)).map((video) => video.videoId);
    void titles.add(wanted);
  }
  function togglePick(video, on) {
    state.picked = pickOne(state.picked, video.id, on).picked;
    syncPicks();
    if (on) askTitles();
  }
  function toggleScope(videos, on) {
    state.picked = pickScope(videos, state.existing, state.picked, on).picked;
    syncPicks();
    if (on) askTitles();
  }

  // 새 목록을 받았을 때: 이미 담은 영상을 가려 표시하고, 나머지를 처음 고름으로 둔다.
  function startPreview(result) {
    state.result = result;
    state.view = 'preview';
    state.existing = existingVideoTrees(result.videos, listTrees(), treeName);
    state.picked = new Set(defaultPicked(result.videos, state.existing));
    state.target = '';
    state.outcome = null;
    refs.newName.value = '';
    renderList();
    render();
    askTitles();
  }

  // ---- 담을 트리 ----
  // 트리 목록·이름 규칙·처음 고르는 트리는 쉬운 추가(shell/quick-add.mjs)와 같다: 늘 같은 트리 설정 → 지금 보는 트리 → 모아둔 순간 → 첫 트리.
  function treeChoices() {
    return listTrees().map((tree) => ({ id: String(tree?.id || ''), name: treeName(tree), inbox: tree?.inbox === true })).filter((tree) => tree.id);
  }
  function defaultTarget(choices) {
    const pref = deps.quickTargetPreference?.() || null;
    if (pref?.mode === 'fixed' && pref.treeId && choices.some((tree) => tree.id === pref.treeId)) return pref.treeId;
    const current = String(deps.currentTreeId?.() || '');
    if (current && choices.some((tree) => tree.id === current)) return current;
    return (choices.find((tree) => tree.inbox) || choices[0])?.id || NEW_TREE_VALUE;
  }
  function renderTarget() {
    const choices = treeChoices();
    if (state.target !== NEW_TREE_VALUE && !choices.some((tree) => tree.id === state.target)) state.target = defaultTarget(choices);
    refs.tree.replaceChildren(
      ...choices.map((tree) => make('option', { value: tree.id, text: tree.name })),
      make('option', { value: NEW_TREE_VALUE, text: BOOKMARK_TEXT.newTree }));
    refs.tree.value = state.target;
    refs.newName.hidden = state.target !== NEW_TREE_VALUE;
  }

  function render() {
    const view = state.result ? state.view : 'start';
    refs.start.hidden = view !== 'start';
    refs.preview.hidden = view !== 'preview';
    refs.saving.hidden = view !== 'saving';
    refs.done.hidden = view !== 'done';
    refs.foot.hidden = view !== 'preview';
    refs.close.disabled = view === 'saving';
    refs.pick.disabled = state.reading;
    refs.status.textContent = state.reading ? BOOKMARK_TEXT.reading : '';
    refs.dropHint.hidden = !isFinePointer();
    if (view === 'preview') {
      refs.summary.textContent = foundSummaryText(state.result);
      refs.note.textContent = state.result.truncated ? BOOKMARK_TEXT.truncated : '';
      refs.note.hidden = !state.result.truncated;
      renderTarget();
      syncPicks();
    }
    if (view === 'done') renderDone();
  }

  // ---- 한 번에 저장 ----
  function paintProgress({ done, total, video }) {
    refs.progressBar.setAttribute('aria-valuemax', String(total));
    refs.progressBar.setAttribute('aria-valuenow', String(done));
    refs.progressBar.setAttribute('aria-valuetext', progressText(done, total));
    refs.progressBar.style?.setProperty?.('--bmi-progress', `${total ? Math.round((done / total) * 100) : 0}%`);
    refs.progressCount.textContent = progressText(done, total);
    refs.progressNow.textContent = video ? (titles.title(video.videoId) || video.title || '') : BOOKMARK_TEXT.syncing;
  }
  // 저장 직전의 제목: 받아 둔 것이 있으면 그것, 없으면 기존 조회 경로로 한 번 받아 본다(기다림 상한은 빠른 담기와 같은 값).
  // 연달아 세 번 못 받으면 이번 담기에서는 더 묻지 않는다 — 조회가 막힌 날에도 담기가 늘어지지 않게.
  function titleSource() {
    let misses = 0;
    return async (video) => {
      const known = titles.title(video.videoId);
      if (known || misses >= 3) return known;
      let timer = null;
      const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve(''), deps.titleWaitMs ?? INTAKE_TITLE_WAIT_MS); });
      let title = '';
      try { title = String((await Promise.race([fetchVideoTitle(video.videoId, fetchImpl), timedOut])) || '').trim(); } catch { title = ''; }
      clearTimeout(timer);
      titles.remember(video.videoId, title);
      misses = title ? 0 : misses + 1;
      for (const row of rowsByVideo.get(video.videoId) || []) paintTitle(row);
      return title;
    };
  }

  async function runSave(videos, target) {
    const member = deps.getMember?.();
    state.view = 'saving';
    state.outcome = null;
    titles.stop(); // 미리보기용 제목 줄은 멈추고, 제목은 담는 차례대로 하나씩 받는다
    deps.holdPanel?.(BOOKMARK_PANEL_ID, true); // 담는 동안과 결과를 보는 동안에는 다른 창·화면 이동이 이 창을 닫지 못한다
    render();
    paintProgress({ done: 0, total: videos.length, video: null });
    refs.progressNow.textContent = '';
    const outcome = await saveBookmarkVideos({
      videos,
      target,
      apply: (...args) => member.apply(...args),
      titleFor: titleSource(),
      onProgress: paintProgress,
      pause,
    });
    // 뒤에 열려 있던 화면을 한 번 다시 그린다 — 담는 동안은 모델만 바꿨으므로(화면 다시 띄우기 0) 보드·서재가 옛 목록을 들고 있지 않게.
    if (outcome.saved.length) { try { deps.refreshScreen?.(); } catch { /* 화면 갱신 실패는 담기 결과에 영향이 없다 */ } }
    const sync = outcome.saved.length ? await waitForSync(() => member.snapshot(), { timeoutMs: deps.syncWaitMs, pollMs: deps.syncPollMs, wait: deps.wait }) : SYNC_DONE;
    const trees = listTrees();
    const tree = trees.find((item) => item?.id === outcome.treeId) || null;
    state.outcome = { ...outcome, sync, treeName: tree ? treeName(tree) : '' };
    if (tree) state.target = tree.id;
    // 담은 영상은 이제 '이미 있음'이다 — 목록을 다시 가려 두면 이어서 고를 때 남은 것만 골라진다.
    state.existing = existingVideoTrees(state.result.videos, trees, treeName);
    state.picked = new Set(defaultPicked(state.result.videos, state.existing));
    state.view = 'done';
    renderList();
    render();
    refs.doneTitle.focus?.();
    return state.outcome;
  }

  function startSave() {
    if (state.view !== 'preview' || !state.result) return null;
    const trees = listTrees();
    const newName = String(refs.newName.value ?? '').trim();
    const blocked = saveBlockText({ count: state.picked.size, target: state.target, trees, newName });
    if (blocked) {
      refs.footError.textContent = blocked;
      if (state.target === NEW_TREE_VALUE && (!newName || newName.length > TREE_NAME_MAX)) refs.newName.focus?.();
      return null;
    }
    const videos = state.result.videos.filter((video) => state.picked.has(video.id));
    const tree = trees.find((item) => item?.id === state.target) || null;
    const target = tree
      ? { treeId: tree.id, afterMomentId: latestMomentId(tree) || tree.moments?.find((m) => m.parentId === null)?.id || '' }
      : { newName };
    return runSave(videos, target);
  }

  // 담지 못한 것만 다시 담는다 — 같은 트리의, 마지막으로 담은 순간 다음에.
  function retryFailed() {
    const outcome = state.outcome;
    if (state.view !== 'done' || !outcome?.failed.length) return null;
    const tree = listTrees().find((item) => item?.id === outcome.treeId) || null;
    const target = tree
      ? { treeId: tree.id, afterMomentId: latestMomentId(tree) || '' }
      : { newName: String(refs.newName.value ?? '').trim() };
    return runSave(outcome.failed.map((item) => item.video), target);
  }

  function remaining() { return defaultPicked(state.result?.videos || [], state.existing).length; }

  function renderDone() {
    const outcome = state.outcome;
    if (!outcome) return;
    refs.doneTitle.textContent = savedSummaryText({ saved: outcome.saved.length, treeName: outcome.treeName });
    refs.doneNote.textContent = !outcome.saved.length || outcome.sync === SYNC_DONE ? '' : outcome.sync === SYNC_FAILED ? BOOKMARK_TEXT.syncFailed : BOOKMARK_TEXT.syncPending;
    refs.doneNote.hidden = !refs.doneNote.textContent;
    refs.doneHint.hidden = outcome.saved.length === 0;
    refs.failed.hidden = outcome.failed.length === 0;
    refs.failedTitle.textContent = failedTitle(outcome.failed.length);
    refs.failedList.replaceChildren(...outcome.failed.map(({ video, reason }) => make('li', {},
      make('span', { class: 'bmi-failed-name', text: titles.title(video.videoId) || video.title || BOOKMARK_TEXT.noTitle }),
      make('span', { class: 'bmi-failed-why', text: reason }))));
    refs.openTree.hidden = !outcome.treeId || outcome.saved.length === 0;
    const left = remaining();
    refs.more.hidden = left === 0;
    refs.more.textContent = continueLabel(left);
  }

  function backToPreview() {
    if (!state.result) return;
    state.view = 'preview';
    state.outcome = null;
    render();
    askTitles();
    refs.another.focus?.();
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
    startPreview(result);
    refs.another.focus?.();
    return true;
  }

  function showStart() {
    state.view = 'start';
    state.result = null;
    state.existing = new Map();
    state.picked = new Set();
    state.target = '';
    state.outcome = null;
    titles.stop();
    refs.groups.replaceChildren();
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
    // 마친 화면에서 닫았다가 다시 열면: 남은 영상이 있으면 미리보기로, 없으면 처음으로.
    if (state.view === 'done') { if (remaining() > 0) { state.view = 'preview'; state.outcome = null; } else showStart(); }
    render();
    if (state.view === 'preview') askTitles();
    (state.view === 'preview' ? refs.another : refs.pick).focus?.();
    return true;
  }

  // 닫기: 담는 중에는 닫지 않는다(×·Esc·창 밖·뒤로가기 모두). 그 밖에는 그대로 닫는다.
  function close() {
    if (!dialog.open) return false;
    if (state.view === 'saving') { deps.notify?.(BOOKMARK_TEXT.busy); return false; }
    dialog.close();
    return true;
  }

  refs.close.addEventListener('click', close);
  refs.pick.addEventListener('click', () => { refs.file.click?.(); });
  refs.file.addEventListener('change', () => {
    const file = refs.file.files?.[0] || null;
    refs.file.value = ''; // 같은 파일을 다시 골라도 change가 오게
    void readFile(file);
  });
  refs.another.addEventListener('click', showStart);
  refs.all.addEventListener('change', () => { toggleScope(state.result?.videos || [], refs.all.checked); });
  refs.tree.addEventListener('change', () => {
    state.target = refs.tree.value || state.target;
    refs.newName.hidden = state.target !== NEW_TREE_VALUE;
    refs.footError.textContent = '';
    if (state.target === NEW_TREE_VALUE) refs.newName.focus?.();
  });
  refs.newName.addEventListener('input', () => { refs.footError.textContent = ''; });
  refs.newName.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault?.(); void startSave(); } });
  refs.save.addEventListener('click', () => { void startSave(); });
  refs.retry.addEventListener('click', () => { void retryFailed(); });
  refs.more.addEventListener('click', backToPreview);
  refs.finish.addEventListener('click', close);
  refs.openTree.addEventListener('click', () => {
    const outcome = state.outcome;
    if (!outcome?.treeId) return;
    const momentId = outcome.saved[0]?.momentId || '';
    if (close()) deps.openBook?.(outcome.treeId, momentId);
  });
  // Esc: 담는 중이면 닫히지 않게 막는다.
  dialog.addEventListener('cancel', (event) => { if (state.view === 'saving') { event.preventDefault?.(); deps.notify?.(BOOKMARK_TEXT.busy); } });
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
    titles.stop(); // 닫힌 창을 위해 제목을 더 묻지 않는다(다시 열면 이어서 받는다)
    deps.holdPanel?.(BOOKMARK_PANEL_ID, false);
    const visible = (node) => !!node?.getClientRects?.().length;
    const target = [opener, $('write-menu'), $('mobile-add'), $('mobile-more')].find(visible) || null;
    opener = null;
    setTimeout(() => target?.focus?.(), 0);
  });

  // 뒤로가기: 공통 창 틀은 붙잡아 둔 창을 닫지 않는다(담는 중 보호). 결과를 보는 동안에는 뒤로가기로도 닫히게 여기서 맡는다.
  // 맨 위 창이 이 창이었는지는 공통 틀과 같은 방식으로 캡처 단계에서 적어 둔다(다른 창이 위에 겹쳐 있으면 그 창의 차례다).
  const view = deps.window || (typeof globalThis.addEventListener === 'function' ? globalThis : null);
  if (view) {
    let wasTop = false;
    view.addEventListener('popstate', () => {
      const modals = [...(doc.querySelectorAll?.('dialog[open]') || [])].filter((node) => node.matches?.(':modal'));
      wasTop = modals[modals.length - 1] === dialog;
    }, true);
    view.addEventListener('popstate', () => { if (wasTop && dialog.open && state.view === 'done') close(); wasTop = false; });
  }

  return { open, close, readFile, startSave, retryFailed, isOpen: () => !!dialog.open, state: () => ({ view: state.view, count: state.result?.videos.length || 0, reading: state.reading, picked: [...state.picked] }), outcome: () => state.outcome, titles, refs };
}
