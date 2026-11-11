// 셸의 순간 패널·편집기·책 정보 (#231 1-B ③-2).
// 2026-11-08 리팩터링: 동작·문구·디자인·저장 계약 변경 0.
// shell.mjs에서 조건·조회 방식·인자 형태를 바꾸지 않고 그대로 옮겼다(원칙 7).
// 셸은 자기 상태(member·source·window.LT41·업로드)를 읽기 함수로 넘기고, 이 파일은 패널만 만진다.
import {parentCandidates, suggestMomentTitle, coverModeOf} from '../domain.mjs';
import {displayTreeTitle} from '../tree-name.mjs';
import {mountPrivateUpload} from '../private-upload.mjs';
import {fetchVideoTitle} from '../video-title.mjs';

export function createPanels(deps) {
  const {$} = deps;
  const getMember = deps.getMember;
  const getCurrent = deps.getCurrent;
  const getSource = deps.getSource;
  const getUploads = deps.getUploads;
  const notify = deps.notify;
  const panel = deps.panel;
  // #368: 읽기 전용 안내는 설정 "내 데이터" 묶음으로 연다(옛 내 기록 창 자리).
  const openSettingsData = deps.openSettingsData;
  const requestClose = deps.requestClose;
  const show = deps.show;
  const selection = deps.selection;
  const openFirstJourney = deps.openFirstJourney;
  const openLoginStart = deps.openLoginStart;
  // #425: 순간 추가 한 창의 탭(쉬운 추가·자세한 추가)은 shell/write-panel.mjs가 맡는다.
  const dwrite = deps.writePanel;

  // 편집기 모드와 폼 기준값은 이 파일이 들고 있는다(셸은 formDirty·treeDirty만 묻는다).
  let editorMode = 'add';
  let formBaseline = '';
  let parentBaseline = '';
  let treeBaseline = '';

  function parentValue() {
    return new URLSearchParams({
      targetId: $('parent-target').value,
      relation: $('parent-relation').value
    }).toString();
  }
  function parentDirty() {
    return !$('parent-management').hidden && parentValue() !== parentBaseline;
  }
  // #425: 더러움은 한 창 두 구역을 모두 본다 — 자세한 추가(폼·연결)와 쉬운 추가(주소를 적고 아직 담지 않음).
  function detailedDirty() {
    return $('write-panel').open && $('write-easy').hidden
      && (new URLSearchParams(new FormData($('moment-form'))).toString() !== formBaseline || parentDirty());
  }
  function formDirty() {
    return $('write-panel').open
      && (new URLSearchParams(new FormData($('moment-form'))).toString() !== formBaseline || parentDirty());
  }
  function treeDirty() {
    return $('tree-manager').open
      && new URLSearchParams(new FormData($('tree-form'))).toString() !== treeBaseline;
  }

  // 2026-11-08 기억책 오른쪽 페이지 '다음 순간 남기기': 부모가 될 순간을 지정해 편집기를 연다.
  // 선택 순간을 부모로 쓰는 기존 경로(선택 순간 + '순간 추가')와 같은 저장 계약이며, 부모만 명시한다.
  let parentChoice = '';
  function setEditorMode(mode, parentId = '') {
    const uploads = getUploads();
    if (uploads.busy) {
      notify('파일 전송을 마치거나 취소한 뒤 작업을 바꿔 주세요.');
      return;
    }
    if (formDirty() && !confirm('현재 입력을 비우고 작업을 바꿀까요?')) return;
    uploads.reset();
    const c = window.LT41;
    parentChoice = mode === 'add' && parentId && c?.tree.moments.some(moment => moment.id === parentId) && c.tree.moments.some(moment => moment.id === c.momentId) ? parentId : '';
    const m = parentChoice ? c.tree.moments.find(moment => moment.id === parentChoice) : c?.tree.moments.find(moment => moment.id === c.momentId);
    if (!m) {
      notify('먼저 순간을 선택해 주세요.');
      return;
    }
    editorMode = mode;
    // #425: 같은 창이다. 더하기는 위쪽 탭 [쉬운 추가 | 자세한 추가]가 있고, 수정은 탭 없이 제목만 '순간 수정'.
    $('write-panel-title').textContent = mode === 'edit' ? '순간 수정' : '순간 추가';
    $('write-eyebrow').textContent = mode === 'edit' ? '나의 순간' : '순간 남기기';
    dwrite.setTabsVisible(mode !== 'edit');
    if (mode !== 'edit') dwrite.show('detailed');
    const form = $('moment-form');
    form.reset();
    $('relation-label').hidden = mode !== 'add';
    for (const name of ['title', 'note', 'emotion', 'date', 'url', 'relation']) form.elements[name].value = mode === 'edit' ? m[name] || '' : name === 'emotion' ? '설렘' : name === 'date' ? new Date().toISOString().slice(0, 10) : '';
    // 2026-11-08 수정 모드에서 이미 적어 둔 제목·감정·날짜가 있으면 '더 적기'를 펼친 상태로 연다.
    $('more-fields').open = mode === 'edit' && Boolean((m.title || '').trim() || (m.emotion || '').trim() || (m.date || '').trim());
    const parent = mode === 'edit' && m.parentId ? c.tree.moments.find(moment => moment.id === m.parentId) : null;
    $('editor-context').textContent = mode === 'add' ? `새 순간 추가 · ${m.title}에서 이어집니다.` : parent ? `수정할 순간 · ${m.title} · 현재 이전 순간: ${parent.title}` : `수정할 순간 · ${m.title} · 트리의 시작 순간`;
    $('form-error').textContent = ''; $('moment-management').hidden = mode !== 'edit';
    const reparenting = mode === 'edit' && m.parentId !== null;
    $('parent-management').hidden = !reparenting; $('parent-current').textContent = parent ? `현재 이전 순간 · ${parent.title}` : '';
    $('parent-target').replaceChildren();
    if (reparenting) {
      for (const other of parentCandidates(c.tree, m.id)) {
        const o = document.createElement('option');
        o.value = other.id; o.textContent = other.title;
        $('parent-target').append(o);
      }
      $('parent-target').value = m.parentId; $('parent-relation').value = m.relation || '';
    } else $('parent-relation').value = '';
    $('related-target').replaceChildren();
    for (const other of c?.tree.moments || []) {
      if (other.id === m?.id) continue;
      const o = document.createElement('option');
      o.value = other.id;
      o.textContent = (m?.links?.includes(other.id) ? '연결됨 · ' : '') + other.title;
      $('related-target').append(o);
    }
    updateMediaPreview(); updateQuickEntryHint();
    formBaseline = new URLSearchParams(new FormData(form)).toString();
    parentBaseline = parentValue();
  }

  function openEditor(requestedMode, parentId = '') {
    if (getSource() !== 'server' || !getMember()?.snapshot().owned) {
      openLoginStart('new-tree'); return;
    }
    if (!getMember().snapshot().writable) {
      notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.'); openSettingsData?.(); return;
    }
    const mode = ['new', 'add', 'edit'].includes(requestedMode) ? requestedMode : window.LT41 ? 'add' : 'new';
    if (mode === 'new') { openFirstJourney(); return; }
    setEditorMode(mode, parentId);
    panel('write-panel');
    queueMicrotask(() => $('moment-form').elements.note.focus());
  }

  // #380 5번: 표지를 정하는 방법은 한 줄에서 하나만 고른다(첫 순간(기본)·순간에서·디자인·사진).
  // 고른 방법의 내용만 아래에 보이고, 저장에는 고른 방법(coverMode)을 함께 넘긴다.
  function treeCoverMode() {
    const form = $('tree-form');
    const value = form.elements.coverMode?.value || 'basic';
    return ['basic', 'moment', 'design', 'photo'].includes(value) ? value : 'basic';
  }
  function firstMomentId(tree) {
    const moments = [...(tree?.moments || [])].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    return moments[0]?.id || '';
  }
  function showTreeCoverMethod() {
    const mode = treeCoverMode();
    $('tree-cover-moment-box').hidden = !(mode === 'moment' || mode === 'photo');
    $('tree-design').hidden = mode !== 'design';
    $('tree-cover-upload').hidden = mode !== 'photo';
    updateTreeCoverHint();
  }
  function updateTreeCoverHint() {
    const c = window.LT41, mode = treeCoverMode(), tree = c?.tree;
    const selected = tree?.moments.find(m => m.id === $('tree-cover').value);
    // 디자인 줄은 disabled로 막지 않는다 — 막으면 라디오가 전송에서 빠져 저장할 때 고른 디자인이 지워진다.
    const photoCover = !!selected && LTMedia.describe(selected.url || '').kind === 'photo';
    $('tree-photo-cover').hidden = !((mode === 'photo' || mode === 'moment') && photoCover);
    if (mode === 'basic') {
      const first = tree?.moments.find(m => m.id === firstMomentId(tree));
      $('tree-cover-hint').textContent = first
        ? `“${first.title}” — 이 트리의 첫 순간을 표지로 씁니다. 그 순간에 사진이 있으면 사진, 없으면 기본 표지예요.`
        : '첫 순간을 표지로 씁니다. 순간이 없으면 기본 표지예요.';
      return;
    }
    if (mode === 'design') {
      const design = $('tree-form').elements.coverDesign?.value || '';
      $('tree-cover-hint').textContent = design ? '고른 디자인을 표지로 씁니다. 저장해 둔 사진 표지는 지우지 않고 그대로 둡니다.' : '디자인을 고르지 않으면 기본 표지를 씁니다. 저장해 둔 사진 표지는 지우지 않고 그대로 둡니다.';
      return;
    }
    if (mode === 'photo') {
      $('tree-cover-hint').textContent = photoCover ? '올린 사진을 표지로 씁니다.' : '사진을 올리면 그 사진이 이 트리의 새 순간이 되고 표지가 됩니다.';
      return;
    }
    if (!selected) {
      $('tree-cover-hint').textContent = '순간을 고르면 그 순간이 표지가 됩니다.';
      return;
    }
    const media = LTMedia.describe(selected.url || '');
    $('tree-cover-hint').textContent = media.kind === 'photo' ? `“${selected.title}”의 사진을 표지로 사용합니다.` : `“${selected.title}”을 표지 순간으로 표시하고 기본 표지를 사용합니다.`;
  }
  function fillTreeCoverOptions(tree) {
    // #256-3 2단계: 책 표지 선택지는 이 함수 한 곳에서 채운다(창 열기·새 사진 표지 만들기 뒤 다시 채우기 공용).
    $('tree-cover').replaceChildren();
    const fallback = document.createElement('option');
    fallback.value = ''; fallback.textContent = '순간을 고르지 않음';
    $('tree-cover').append(fallback);
    for (const moment of tree.moments) {
      const option = document.createElement('option'), media = LTMedia.describe(moment.url || '');
      option.value = moment.id;
      option.textContent = `${moment.title} · ${media.kind === 'photo' ? '사진' : media.kind === 'video' ? '영상' : media.kind === 'youtube' ? 'YouTube' : media.kind === 'link' ? '링크' : '기록'}`;
      $('tree-cover').append(option);
    }
  }
  function openTreeManager() {
    if (getSource() !== 'server' || !getMember()?.snapshot().owned || !getMember().snapshot().writable || !window.LT41) {
      notify('내 서버 기록을 불러온 뒤 트리를 관리해 주세요.'); return;
    }
    const tree = window.LT41.tree, form = $('tree-form');
    form.elements.title.value = tree.title;
    form.elements.subject.value = tree.subject;
    fillTreeCoverOptions(tree);
    $('tree-cover').value = tree.coverMomentId || firstMomentId(tree);
    // #256-3 2단계: 새 사진 표지 만들기는 로그인·서버 기록에서만 보인다(방법 '사진'을 골랐을 때만 보인다).
    // #314: 이전 책에서 고르던 파일·전송 결과 안내가 새 책 창에 남지 않게 업로드 상태를 비운다.
    coverUploads.reset();
    $('tree-cover-title').value = '';
    // #314: RadioNodeList.value = ''는 이전에 체크된 라디오를 해제하지 않는다(Chrome 실측).
    // 모르는 값은 도메인 규칙에 정리되므로, 저장값(없으면 지금 규칙)과 같은 라디오만 checked로 둔다.
    const mode = coverModeOf(tree);
    for (const radio of form.elements.coverMode || []) radio.checked = radio.value === mode;
    const design = tree.coverDesign || '';
    for (const radio of form.elements.coverDesign || []) radio.checked = radio.value === design;
    $('tree-form-error').textContent = '';
    showTreeCoverMethod();
    treeBaseline = new URLSearchParams(new FormData(form)).toString();
    panel('tree-manager');
    queueMicrotask(() => form.elements.title.focus());
  }

  // 편집기가 미리보기에서 받아 둔 영상 제목(#344). videoTitleCache는 같은 영상을 다시 열 때 요청을 줄인다.
  const videoTitleCache = new Map();
  let editorVideoTitle = '';
  let editorVideoUrl = '';
  function updateMediaPreview() {
    const form = $('moment-form'), url = form.elements.url.value, info = LTMedia.describe(url);
    $('url-media-hint').textContent = info.kind === 'none' ? '사진·영상은 직접 HTTPS 링크를 사용할 수 있어요. YouTube와 일반 링크도 지원해요. 사진·영상 파일도 직접 첨부할 수 있어요.' : info.kind === 'invalid' ? '링크 형식을 확인해 주세요.' : info.label;
    $('url-media-preview').innerHTML = url ? LTMedia.markup(url, form.elements.title.value) : '';
    // #344: 미리보기 때 서버 oEmbed 프록시로 영상 제목을 받아 둔다(실패는 조용히). 저장 시 mediaMetadata.title로 함께 넘긴다.
    editorVideoTitle = '';
    editorVideoUrl = info.kind === 'youtube' && info.videoId ? url : '';
    if (editorVideoUrl) {
      const videoId = info.videoId;
      void fetchVideoTitle(videoId).then(title => { if (title && editorVideoUrl === url) { editorVideoTitle = title; videoTitleCache.set(videoId, title); updateQuickEntryHint(); } });
    }
  }
  function editorMediaTitle() {
    if (!editorVideoUrl) return {};
    const url = $('moment-form').elements.url.value.trim();
    if (url !== editorVideoUrl) return {};
    return editorVideoTitle ? { mediaMetadata: { title: editorVideoTitle } } : {};
  }
  function updateQuickEntryHint() {
    const form = $('moment-form'), title = form.elements.title.value.trim(), note = form.elements.note.value.trim(), url = form.elements.url.value.trim();
    let suggested = '';
    try { suggested = suggestMomentTitle({title, note, url, mediaMetadata: editorVideoTitle && url === editorVideoUrl ? {title: editorVideoTitle} : null}); } catch {}
    $('quick-entry-hint').textContent = title ? '입력한 제목으로 저장합니다.' : suggested ? `제목은 “${suggested}”(으)로 자동 정리됩니다.` : '제목·마음·링크나 첨부 중 하나만 남겨도 저장할 수 있어요.';
  }

  // 계정 메뉴·편집기 버튼은 셸이 열고, 이 파일은 폼 상태만 본다.
  const manageTreeButton = $('manage-tree'); if (manageTreeButton) manageTreeButton.onclick = openTreeManager;
  $('tree-cover').onchange = updateTreeCoverHint;
  for (const radio of $('tree-form').elements.coverMode || []) radio.onchange = showTreeCoverMethod;
  for (const radio of $('tree-form').elements.coverDesign || []) radio.onchange = updateTreeCoverHint;
  // #256-3: 사진 표지를 빼면 첫 순간(기본) 으로 돌아간다. 순간 자체는 지우지 않는다.
  $('tree-photo-clear').onclick = () => {
    for (const radio of $('tree-form').elements.coverMode || []) radio.checked = radio.value === 'basic';
    showTreeCoverMethod();
  };
  // #256-3 2단계: 창에서 새 사진을 올려 표지로 만든다. 순간 폼의 업로드와 같은 제한·문구를 쓰고(onUploaded 옵션),
  // 성공 뒤 두 번 저장한다 — 순간 추가(루트 아래) → 표지 지정. 한쪽이 실패하면 어디까지 됐는지 상태 칸에 알린다.
  function coverUploadStatus() { return $('tree-form').querySelector('[data-upload-status]'); }
  async function makeCoverFromUpload(url) {
    const tree = window.LT41?.tree;
    if (!tree) throw Error('책을 먼저 불러와 주세요. 내 보관 파일에서 다시 고를 수 있어요.');
    const root = tree.moments.find(moment => moment.parentId === null);
    const title = $('tree-cover-title').value.trim();
    let added;
    try {
      added = getMember().apply('add', { url, ...(title ? { title } : {}) }, { treeId: tree.id, momentId: root.id });
    } catch (error) { throw Error('사진은 보관 파일로 남았어요. 순간으로 만들지는 못했어요 — ' + error.message); }
    try {
      getMember().apply('editTree', { title: tree.title, subject: tree.subject, coverMomentId: added.momentId, coverDesign: tree.coverDesign || '', coverMode: 'photo' }, { treeId: tree.id });
    } catch (error) {
      fillTreeCoverOptions(window.LT41?.tree || tree);
      throw Error('사진은 순간으로 남았지만 표지 지정은 실패했어요 — ' + error.message + ' · 위 “표지”에서 직접 골라 저장할 수 있어요.');
    }
    const updated = window.LT41?.tree;
    if (updated && updated.id === tree.id) { fillTreeCoverOptions(updated); $('tree-cover').value = added.momentId; }
    for (const radio of $('tree-form').elements.coverMode || []) radio.checked = radio.value === 'photo';
    showTreeCoverMethod();
    $('tree-cover-title').value = '';
    treeBaseline = new URLSearchParams(new FormData($('tree-form'))).toString();
    if (coverUploadStatus()) coverUploadStatus().textContent = '새 사진 순간을 표지로 만들었어요. 창 아래 저장하기를 누르지 않아도 저장됐어요.';
    notify('새 사진 순간을 표지로 만들었어요.');
  }
  const coverUploads = mountPrivateUpload({
    form: $('tree-form'), assets: null, imagesOnly: true,
    getSubject: () => getSource() === 'server' && getMember()?.snapshot().writable ? getMember().snapshot().subject : null,
    getState: () => getMember()?.state() || null,
    onChange: () => {},
    onUploaded: url => makeCoverFromUpload(url)
  });
  $('tree-form').onsubmit = e => {
    e.preventDefault();
    try {
      // #380 5번: 고른 방법 하나만 표지가 된다. 고르지 않은 곳의 저장값(사진 표지 순간·디자인)은 지우지 않는다.
      const tree = window.LT41?.tree, mode = treeCoverMode();
      const values = Object.fromEntries(new FormData(e.target));
      values.coverMode = mode;
      // 고르지 않은 방법의 저장값은 덮어쓰지 않는다 — 첫 순간(기본)·디자인은 저장해 둔 표지 순간을 그대로 두고,
      // 순간에서·사진만 지금 고른 순간으로 바꾼다(되돌리면 그대로 다시 보인다).
      values.coverMomentId = (mode === 'basic' || mode === 'design') ? (tree?.coverMomentId || '') : ($('tree-cover').value || '');
      getMember().apply('editTree', values, selection());
      treeBaseline = new URLSearchParams(new FormData(e.target)).toString();
      if(typeof dispatchEvent==='function')dispatchEvent(new Event('lt41-trees-changed'));
      $('tree-manager').close();
      notify('트리 정보를 서버에 저장하고 있어요.');
    } catch (error) { $('tree-form-error').textContent = error.message; }
  };
  $('tree-delete').onclick = () => {
    const tree = window.LT41?.tree;
    if (!tree || !confirm(`“${displayTreeTitle(tree.title)}”과 ${tree.moments.length}개 순간을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      getMember().apply('deleteTree', {}, selection());
      treeBaseline = '';
      if(typeof dispatchEvent==='function')dispatchEvent(new Event('lt41-trees-changed'));
      $('tree-manager').close();
      notify('트리를 삭제하고 서버에 반영하고 있어요.');
    } catch (error) { $('tree-form-error').textContent = error.message; }
  };
  // #380 4: 트리 관리 Esc·바깥 클릭 닫기와 "저장하지 않고 닫을까요?" 확인은 shell/dialogs.mjs 공통 틀이 맡는다.
  // × 버튼(data-close)은 shell.mjs의 기존 규칙(바쁠 때·바뀐 값이 있으면 확인)을 그대로 쓴다.
  // '순간 남기기'는 이제 shell/quick-add.mjs가 고르기 창을 연다(#빠른 추가 ②). 이 파일은 편집기만 맡는다.

  for (const name of ['title', 'note', 'url']) $('moment-form').elements[name].addEventListener('input', () => { if (name === 'url' || name === 'title') updateMediaPreview(); updateQuickEntryHint(); });
  $('moment-form').onsubmit = e => {
    e.preventDefault();
    if (getUploads().busy) return;
    if (parentDirty()) {
      $('form-error').textContent = '이전 순간 변경은 아래 버튼으로 먼저 저장해 주세요.';
      return;
    }
    try {
      // #344: 미리보기 때 받아 둔 영상 제목을 저장 입력에 함께 넘긴다(사용자 입력 제목이 항상 우선 — 도메인 판정).
      getMember().apply(editorMode, {...Object.fromEntries(new FormData(e.target)), ...editorMediaTitle()}, selection());
      formBaseline = new URLSearchParams(new FormData(e.target)).toString();
      $('write-panel').close();
      if (editorMode === 'new') show('track59-sketchbook.html');
      notify('서버에 저장하고 있어요.');
    } catch (error) { $('form-error').textContent = error.message; }
  };
  // #380 4 2차: Esc·바깥 클릭·× 닫기와 "저장하지 않고 닫을까요?" 확인은 shell/dialogs.mjs 공통 틀이 맡는다
  // (트리 관리와 같은 규칙). 편집기만의 규칙은 공통 틀보다 우선한다 — 업로드 중이면 닫지 않는다.
  $('editor-cancel').onclick = () => { requestClose?.('write-panel'); };
  $('change-parent').onclick = () => {
    try {
      getMember().apply('reparent', {targetId: $('parent-target').value, relation: $('parent-relation').value}, selection());
      formBaseline = new URLSearchParams(new FormData($('moment-form'))).toString();
      parentBaseline = parentValue();
      setEditorMode('edit');
      notify('이전 순간을 바꾸고 서버에 저장하고 있어요.');
      queueMicrotask(() => $('change-parent').focus());
    } catch (e) { $('form-error').textContent = e.message; }
  };
  for (const [id, action] of [['link-moment', 'link'], ['unlink-moment', 'unlink']]) $(id).onclick = () => {
    try {
      getMember().apply(action, {targetId: $('related-target').value}, selection());
      formBaseline = new URLSearchParams(new FormData($('moment-form'))).toString();
      parentBaseline = parentValue();
      setEditorMode('edit');
    } catch (e) { $('form-error').textContent = e.message; }
  };
  $('delete-moment').onclick = () => {
    if (!confirm('이 순간을 삭제할까요? 자식 순간은 이전 순간으로 이어지고 관련 연결은 해제됩니다.')) return;
    try {
      getMember().apply('delete', {}, selection());
      $('write-panel').close();
    } catch (e) { $('form-error').textContent = e.message; }
  };

  // 업로드 모듈이 파일을 바꾼 뒤 미리보기·자동 제목 안내를 다시 그린다.
  function uploadsChanged() {
    updateMediaPreview();
    updateQuickEntryHint();
  }

  return {
    setEditorMode,
    openEditor,
    openTreeManager,
    updateTreeCoverHint,
    updateMediaPreview,
    updateQuickEntryHint,
    uploadsChanged,
    formDirty,
    detailedDirty,
    treeDirty,
    editorMode: () => editorMode
  };
}
