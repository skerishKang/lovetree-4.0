// 셸의 순간 패널·편집기·책 정보 (#231 1-B ③-2).
// 2026-11-08 리팩터링: 동작·문구·디자인·저장 계약 변경 0.
// shell.mjs에서 조건·조회 방식·인자 형태를 바꾸지 않고 그대로 옮겼다(원칙 7).
// 셸은 자기 상태(member·source·window.LT41·업로드)를 읽기 함수로 넘기고, 이 파일은 패널만 만진다.
import {parentCandidates, coverModeOf, latestMomentId, validateRange, startFromUrl, fillStartFromUrl, formatTimecode} from '../domain.mjs';
// #876: 같은 영상 판정(quick-intake 한 벌)과 안내 창 날짜 표기(book-usability 한 벌) — 새 규칙을 만들지 않는다.
import {findSameVideoInTree, treesWithSameVideo} from '../quick-intake.mjs';
import {formatDisplayDate} from '../book-usability.mjs';
import {localDateOnly} from '../local-date.mjs';
import {displayTreeTitle} from '../tree-name.mjs';
import {mountPrivateUpload} from '../private-upload.mjs';
import {fetchVideoTitle, fetchTikTokMetadata, fetchInstagramMetadata} from '../video-title.mjs';
import {loadYouTubeIframeApi, createSegmentCapture} from '../segment-capture.mjs';

// #934: 링크 칸에 열 수 없는 주소가 남았을 때의 안내 — 미리보기 경고('링크를 열 수 없어요')와
// 저장 판정이 같은 뜻을 말하도록 한 문장으로 둔다. 칸을 비우면 링크 없이 저장하는 길을 알려 준다.
export const LINK_FORMAT_ERROR = '링크 칸의 주소를 열 수 없어요. 주소를 고치거나 칸을 비우면 링크 없이 저장돼요.';

export function createPanels(deps) {
  const {$} = deps;
  const getMember = deps.getMember;
  const getCurrent = deps.getCurrent;
  const getSource = deps.getSource;
  const getUploads = deps.getUploads;
  const notify = deps.notify;
  // #876 규칙 3의 한 줄: 다른 트리 이름으로 알린다. 여러 트리면 첫 이름과 나머지 개수로(토스트 한 줄 계약).
  function otherTreesLine(others) {
    const names = (Array.isArray(others) ? others : []).map(tree => displayTreeTitle(String(tree?.title || tree?.subject || '') || '트리'));
    if (!names.length) return '';
    return names.length === 1 ? `'${names[0]}' 트리에도 있어요` : `'${names[0]}' 외 ${names.length - 1}개 트리에도 있어요`;
  }
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

  // #1097: 이어짐(이전 순간·새로 이어진 이유·관련 연결)은 저장하기 한 번에 함께 저장한다.
  // 의도 상태: 이전 순간 select 값 + 이유 + 칩으로 고른 관련 연결. 저장이 끝나면 기준값이 된다.
  let intendedLinks = new Set();
  let baselineLinks = [];
  let baselineParentId = '';
  let baselineRelation = '';
  function parentValue() {
    return new URLSearchParams({
      targetId: $('parent-target').value,
      relation: $('parent-relation').value,
      links: [...intendedLinks].sort().join(',')
    }).toString();
  }
  // 닫을 때 물을지 — 열었을 때(마지막 저장)보다 이어짐(이전 순간·이유·관련)이 바뀌었으면 변경으로 본다.
  function parentDirty() {
    if ($('moment-management').hidden) return false;
    const wantLinks = [...intendedLinks].sort().join(',');
    const savedLinks = [...baselineLinks].sort().join(',');
    return $('parent-target').value !== baselineParentId
      || $('parent-relation').value !== baselineRelation
      || wantLinks !== savedLinks;
  }
  // #1097: 머리 한 줄 — 트리 이름 · 담은 날(순간의 날짜). add 모드는 기존 문구를 그대로 둔다.
  function editorContextLine(mode, m) {
    if (mode !== 'edit') return `새 순간 추가 · ${m.title}에서 이어집니다.`;
    const treeTitle = displayTreeTitle(String(window.LT41?.tree?.title || window.LT41?.tree?.subject || '') || '트리');
    let dateText = '';
    try { dateText = formatDisplayDate(m.date, getMember()?.state?.()?.prefs?.dateStyle) || ''; } catch { dateText = ''; }
    return `${treeTitle} · ${dateText || m.date || ''}`.replace(/ · $/, '');
  }
  // #1097: 이전 순간 썸네일 — YouTube는 썸네일, 사진은 그 주소, 그 밖은 빈 칸(색 사각형은 호출 쪽이 그린다).
  function thumbForMoment(moment) {
    if (!moment?.url || !window.LTMedia?.describe) return '';
    try {
      const info = LTMedia.describe(moment.url);
      if (info.kind === 'youtube' && info.videoId && LTMedia.youtubeThumbUrl) return LTMedia.youtubeThumbUrl(info.videoId, !!info.vertical);
      // #791: 틱톡은 저장된 썸네일 주소를 그대로 쓴다(새 요청 없이 그린다).
      if (info.kind === 'tiktok' && LTMedia.tiktokThumbCandidates) return LTMedia.tiktokThumbCandidates(moment.mediaMetadata)[0] || '';
      // #791 2단계: 릴스는 올린 그림이 있을 때만 썸네일이 있다.
      if (info.kind === 'instagram') return String(moment?.image || '').startsWith('/api/media/') ? moment.image : '';
      if (info.kind === 'photo') return moment.url;
    } catch {}
    return '';
  }
  function updateParentPreview() {
    const c = window.LT41;
    const target = c?.tree?.moments.find(moment => moment.id === $('parent-target').value);
    const preview = $('parent-preview');
    preview.replaceChildren();
    const src = thumbForMoment(target);
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = '';
      preview.append(img);
    } else if (target) {
      const mark = document.createElement('span');
      mark.textContent = (target.emotion || target.title || '·').slice(0, 1);
      preview.append(mark);
    }
  }
  // #1097: '이어짐 · 이전 순간 N · 관련 N' — 접힌 칸에서도 지금 연결 상태를 한 줄로 읽힌다.
  function renderContinueSummary() {
    const c = window.LT41;
    const m = c?.tree?.moments.find(moment => moment.id === c?.momentId);
    if (!m || editorMode !== 'edit') { $('continue-summary').textContent = '이어짐'; return; }
    $('continue-summary').textContent = `이어짐 · 이전 순간 ${m.parentId ? 1 : 0} · 관련 ${intendedLinks.size}`;
  }
  function renderRelatedChips() {
    const c = window.LT41;
    const host = $('related-chips');
    host.replaceChildren();
    for (const id of intendedLinks) {
      const moment = c?.tree?.moments.find(item => item.id === id);
      if (!moment) continue;
      const chip = document.createElement('span');
      chip.className = 'related-chip';
      chip.textContent = moment.title;
      const cut = document.createElement('button');
      cut.type = 'button';
      cut.className = 'related-chip-cut';
      cut.setAttribute('aria-label', `${moment.title} 연결 끊기`);
      cut.textContent = '×';
      cut.onclick = () => { intendedLinks.delete(id); renderRelatedChips(); renderContinueSummary(); };
      chip.append(cut);
      host.append(chip);
    }
    if (!intendedLinks.size) {
      const empty = document.createElement('span');
      empty.className = 'related-chip-empty';
      empty.textContent = '관련 연결 없음';
      host.append(empty);
    }
  }
  function fillRelatedOptions() {
    const c = window.LT41;
    const select = $('related-target');
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '고르기';
    select.append(placeholder);
    for (const other of c?.tree.moments || []) {
      if (other.id === c?.momentId || intendedLinks.has(other.id)) continue;
      const o = document.createElement('option');
      o.value = other.id;
      o.textContent = other.title;
      select.append(o);
    }
  }
  // #425: 더러움은 한 창 두 구역을 모두 본다 — 자세한 추가(폼·연결)와 쉬운 추가(주소를 적고 아직 담지 않음).
  // #453 B: ＋ 순간 추가(쉬운 추가)로 연 창은 자세한 폼의 기준값이 없었다. 탭을 처음 보일 때 기본값을 한 번 채우고
  // 그 상태를 기준값으로 삼아, 아무것도 안 바꿨으면 닫을 때 묻지 않는다.
  function startQuickSession() {
    // #462: ＋ 순간 추가는 늘 새 순간이다. 직전에 '이 순간 수정'으로 연 상태(제목 '순간 수정'·그 순간의 값·
    // 수정 전용 묶음)가 남아, 자세한 추가에서 저장하면 그 순간을 고쳐 버리던 것을 여기서 비운다.
    if (editorMode === 'edit') resetToAdd();
    formBaseline = '';
    parentBaseline = parentValue();
  }
  function resetToAdd() {
    editorMode = 'add';
    parentChoice = '';
    getUploads()?.reset?.();
    $('moment-form').reset();
    $('write-panel-title').textContent = '순간 추가';
    $('write-eyebrow').textContent = '순간 추가';
    $('relation-label').hidden = false;
    $('relation-hint').hidden = false;
    $('delete-moment').hidden = true;
    $('moment-management').hidden = true;
    setMediaChangeOpen(false);
    intendedLinks = new Set(); baselineLinks = []; baselineParentId = '';
    $('editor-context').textContent = '';
    $('form-error').textContent = '';
    updateMediaPreview();
  }
  // #1097: 감정은 누르는 칩(하나만 고르기, role=radio) — 값은 히든 칸 emotion에 두고 칩이 눌림 상태만 비춘다.
  function emotionChips() { try { return [...$('emotion-chips').querySelectorAll('[data-emotion]')]; } catch { return []; } }
  function syncEmotionChips() {
    const current = $('moment-form').elements.emotion?.value || '';
    let tabbable = false;
    for (const chip of emotionChips()) {
      const checked = chip.dataset?.emotion === current;
      try { chip.setAttribute('aria-checked', checked ? 'true' : 'false'); } catch {}
      if (checked) tabbable = true;
    }
    // 고른 칩 하나만 탭 정지점에 둔다(고른 게 없으면 첫 칩).
    let first = true;
    for (const chip of emotionChips()) {
      const checked = chip.dataset?.emotion === current;
      try { chip.tabIndex = checked || (!tabbable && first) ? 0 : -1; } catch {}
      first = false;
    }
  }
  function pickEmotionChip(value) {
    const input = $('moment-form').elements.emotion;
    if (input) input.value = value;
    syncEmotionChips();
  }
  function onWriteTab(tab) {
    if (tab !== 'detailed' || formBaseline) return;
    const form = $('moment-form');
    if (!form.elements.date.value) { form.elements.date.value = localDateOnly(); $('stage-date-hint').hidden = false; } // #547: 기기의 오늘(UTC 아님); #627: 자동으로 채운 무대 날짜에는 안내를 붙인다
    if (!form.elements.emotion.value) form.elements.emotion.value = '설렘';
    formBaseline = new URLSearchParams(new FormData(form)).toString();
    parentBaseline = parentValue();
    // '가' 결정: 쉬운 추가 탭에서 자세한 추가로 바꾸면 어디에 이어지는지 보여 준다(빈 줄만 채운다).
    const parent = window.LT41?.tree?.moments.find(moment => moment.id === addParentMomentId());
    if (parent && !$('editor-context').textContent) $('editor-context').textContent = `새 순간 추가 · ${parent.title}에서 이어집니다.`;
  }
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

  // 2026-11-08 책 오른쪽 페이지 '다음 순간 추가': 부모가 될 순간을 지정해 편집기를 연다.
  // 선택 순간을 부모로 쓰는 기존 경로(선택 순간 + '순간 추가')와 같은 저장 계약이며, 부모만 명시한다.
  let parentChoice = '';
  // '가' 결정(2026-11-15, 지도 #601): 자세한 추가에서 사용자가 이전 순간을 고르지 않으면(책의 '다음 순간 추가'처럼
  // 부모를 정해 열지 않았으면) 첫 순간이 아니라 가장 최근 순간 다음에 잇는다. 고른 이전 순간은 그대로다.
  function addParentMomentId() {
    const c = window.LT41;
    if (parentChoice && c?.tree?.moments.some(moment => moment.id === parentChoice)) return parentChoice;
    return (c?.tree && latestMomentId(c.tree)) || c?.momentId || '';
  }
  function setEditorMode(mode, parentId = '') {
    const uploads = getUploads();
    if (uploads.busy) {
      notify('파일 전송을 마치거나 취소한 뒤 작업을 바꿔 주세요.');
      return;
    }
    if (formDirty() && !confirm('현재 입력을 비우고 작업을 바꿀까요?')) return;
    uploads.reset();
    const c = window.LT41;
    parentChoice = mode === 'add' && parentId && c?.tree.moments.some(moment => moment.id === parentId) ? parentId : '';
    const m = mode === 'add'
      ? c?.tree.moments.find(moment => moment.id === addParentMomentId())
      : c?.tree.moments.find(moment => moment.id === c.momentId);
    if (!m) {
      notify('먼저 순간을 선택해 주세요.');
      return;
    }
    editorMode = mode;
    // #425: 같은 창이다. 더하기는 위쪽 탭 [쉬운 추가 | 자세한 추가]가 있고, 수정은 탭 없이 제목만 '순간 수정'.
    $('write-panel-title').textContent = mode === 'edit' ? '순간 수정' : '순간 추가';
    $('write-eyebrow').textContent = mode === 'edit' ? '나의 순간' : '순간 추가';
    dwrite.setTabsVisible(mode !== 'edit');
    if (mode !== 'edit') dwrite.show('detailed');
    const form = $('moment-form');
    form.reset();
    $('relation-label').hidden = mode !== 'add';
    $('relation-hint').hidden = mode !== 'add';
    $('delete-moment').hidden = mode !== 'edit';
    setMediaChangeOpen(false);
    for (const name of ['title', 'note', 'emotion', 'date', 'url', 'relation']) form.elements[name].value = mode === 'edit' ? m[name] || '' : name === 'emotion' ? '설렘' : name === 'date' ? localDateOnly() : ''; // #547: 기기의 오늘
    syncEmotionChips();
    // #792: 시작·끝 구간 칸 — 고치기는 저장된 초를 시간 표기로 되돌려 채우고, 추가는 빈 칸(주소의 t=는 미리보기에서 채운다).
    if (form.elements.startSeconds) form.elements.startSeconds.value = mode === 'edit' && m.startSeconds !== undefined && m.startSeconds !== null ? formatTimecode(m.startSeconds) : '';
    if (form.elements.endSeconds) form.elements.endSeconds.value = mode === 'edit' && m.endSeconds !== undefined && m.endSeconds !== null ? formatTimecode(m.endSeconds) : '';
    // #627: 추가 모드는 날짜를 자동으로 채워 두므로 무대 날짜 안내를 보인다; 수정 모드의 날짜는 이미 정해진 값이다.
    $('stage-date-hint').hidden = mode !== 'add';
    // #1097: 제목은 접지 않는다 — 제목·감정·무대 날짜가 항상 보인다(#638의 접힘 불편을 그대로 없앤다).
    $('editor-context').textContent = editorContextLine(mode, m);
    $('form-error').textContent = '';
    $('moment-management').hidden = mode !== 'edit';
    // #1097: 이어짐은 390에서는 접힌 칸으로, 그보다 큰 화면에서는 열린 상태로 연다.
    try { $('moment-management').open = !(window.matchMedia && window.matchMedia('(max-width: 780px)').matches); } catch { $('moment-management').open = true; }
    const parent = mode === 'edit' && m.parentId ? c.tree.moments.find(moment => moment.id === m.parentId) : null;
    const reparenting = mode === 'edit' && m.parentId !== null;
    $('parent-current').textContent = mode !== 'edit' ? '' : parent ? `현재 이전 순간 · ${parent.title}` : '트리의 시작 순간이에요.';
    $('parent-target').replaceChildren();
    $('parent-target').disabled = !reparenting;
    $('parent-relation').disabled = !reparenting;
    if (reparenting) {
      for (const other of parentCandidates(c.tree, m.id)) {
        const o = document.createElement('option');
        o.value = other.id; o.textContent = other.title;
        $('parent-target').append(o);
      }
      $('parent-target').value = m.parentId; $('parent-relation').value = m.relation || '';
    } else $('parent-relation').value = '';
    baselineParentId = mode === 'edit' ? (m.parentId || '') : '';
    baselineRelation = mode === 'edit' ? (m.relation || '') : '';
    baselineLinks = mode === 'edit' ? [...(m.links || [])] : [];
    intendedLinks = new Set(baselineLinks);
    renderRelatedChips();
    fillRelatedOptions();
    updateParentPreview();
    renderContinueSummary();
    updateMediaPreview();
    formBaseline = new URLSearchParams(new FormData(form)).toString();
    parentBaseline = parentValue();
  }

  function openEditor(requestedMode, parentId = '') {
    if (!getMember()?.snapshot().owned) {
      openLoginStart('new-tree'); return;
    }
    // #453 A: 예시를 둘러보는 중이면 로그인 화면 대신 내 기록으로 돌아와 같은 동작을 이어 간다.
    if (getSource() !== 'server') { deps.resumeMember?.(requestedMode === 'edit' ? 'write' : requestedMode || 'write'); return; }
    if (!getMember().snapshot().writable) {
      notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.'); openSettingsData?.(); return;
    }
    const mode = ['new', 'add', 'edit'].includes(requestedMode) ? requestedMode : window.LT41 ? 'add' : 'new';
    if (mode === 'new') { openFirstJourney(); return; }
    setEditorMode(mode, parentId);
    panel('write-panel');
    // #898: 창을 열 때는 맨 위부터 — 쉬운 추가에서 내용을 읽다가 '지금 다듬기'로 넘어오면 스크롤이 중간에 남고,
    // 초점을 노트 칸으로 옮기는 것만으로도 창이 스크롤된다. 초점을 준 뒤에 맨 위로 되돌린다.
    queueMicrotask(() => { $('moment-form').elements.note.focus(); $('write-panel').scrollTop = 0; });
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
    form.elements.subject.value = tree.subject === '모아둔 순간' ? '' : tree.subject;
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
  // #791: 틱톡 oEmbed 미리보기 값(제목·id·@계정·썸네일).
  const tiktokMetaCache = new Map();
  let editorTikTokMeta = null;
  // #791 2단계: 릴스 — 한도(429)면 메타 없이 링크만 저장하고 다음에 다시 조회한다.
  const instagramMetaCache = new Map();
  const instagramLimited = new Set();
  let editorInstagramUrl = '';
  let editorInstagramMeta = null;
  // #792 2단계: 영상을 보다가 지금 위치를 담는 재생기 연결. 주소·제목이 바뀌면 끊고 새로 잇는다.
  let segmentToken = 0, segmentPlayer = null, segmentCapture = null;
  function hideSegmentCapture() {
    segmentToken += 1;
    try { segmentCapture?.destroy?.(); } catch {}
    segmentCapture = null;
    const block = $('segment-capture');
    if (block) block.hidden = true;
    const status = $('segment-status');
    if (status) { status.hidden = true; status.textContent = ''; }
  }
  function resetSegmentCapture() {
    hideSegmentCapture();
    try { segmentPlayer?.destroy?.(); } catch {}
    segmentPlayer = null;
  }
  async function attachSegmentPlayer(frame) {
    resetSegmentCapture();
    const token = segmentToken;
    const block = $('segment-capture');
    if (block) block.dataset.segmentState = 'loading';
    try {
      const YT = await loadYouTubeIframeApi();
      if (token !== segmentToken || !frame?.isConnected) return;
      const player = new YT.Player(frame, {
        events: {
          onReady: () => {
            if (token !== segmentToken || !frame.isConnected) return;
            segmentPlayer = player;
            segmentCapture = createSegmentCapture({player, form: $('moment-form'), scope: document});
            if (block) { block.hidden = !segmentCapture; block.dataset.segmentState = segmentCapture ? 'ready' : 'no-ui'; }
          },
          // 재생할 수 없는 영상(권한·삭제·오류 153 등)은 단추를 숨기고 글자 입력만 남긴다.
          onError: (event) => {
            if (token !== segmentToken) return;
            if (block) block.dataset.segmentState = 'error:' + (event?.data ?? 'unknown');
            const mediaStatus = $('url-media-preview').querySelector('.lt-media-status') || $('moment-media-status');
            if (mediaStatus) mediaStatus.textContent = '이 영상은 바로 재생할 수 없어요. 시작·끝 시간을 직접 적어 주세요.';
            hideSegmentCapture();
          }
        }
      });
      segmentPlayer = player;
    } catch (error) {
      if (token === segmentToken) {
        if (block) block.dataset.segmentState = 'catch:' + String(error?.message || error).slice(0, 120);
        const mediaStatus = $('url-media-preview').querySelector('.lt-media-status') || $('moment-media-status');
        if (mediaStatus) mediaStatus.textContent = '이 영상은 바로 재생할 수 없어요. 시작·끝 시간을 직접 적어 주세요.';
        hideSegmentCapture();
      }
    }
  }
  $('url-media-preview').addEventListener('lt41:media-playing', (event) => {
    const frame = event.detail?.frame;
    if (frame) void attachSegmentPlayer(frame);
  });
  // #1097: '영상 바꾸기'는 눌렀을 때만 링크·올리기·보관 파일 선택을 펼친다(닫힌 상태가 기본).
  function setMediaChangeOpen(open) {
    const box = $('media-change-box'), toggle = $('media-change-toggle');
    if (box) box.hidden = !open;
    if (toggle) { toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? '닫기' : '영상 바꾸기'; }
  }
  // #1097: 영상 아래 한 줄 — 크게 보기·YouTube에서 열기(원본 링크는 맞는 이름으로). 영상 안의 중복 단추는 없다.
  function renderMediaActions(info, url, title) {
    const host = $('moment-media-open');
    host.replaceChildren();
    if (!url || info.kind === 'none' || info.kind === 'invalid') return;
    if (info.kind === 'youtube' || info.kind === 'video') {
      const expand = document.createElement('button');
      expand.type = 'button';
      expand.className = 'moment-media-expand';
      expand.textContent = '크게 보기';
      expand.onclick = () => { try { window.LTMedia?.openLightbox?.(url, title || ''); } catch {} };
      host.append(expand);
    }
    if (info.openUrl) {
      const open = document.createElement('a');
      open.href = info.openUrl;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.referrerPolicy = 'no-referrer';
      open.textContent = (info.kind === 'youtube' ? 'YouTube에서 열기' : (info.kind === 'tiktok' || info.kind === 'instagram') ? '원본에서 열기' : '원본 링크 열기') + ' ↗';
      host.append(open);
    }
  }
  function updateMediaPreview() {
    resetSegmentCapture();
    const form = $('moment-form'), url = form.elements.url.value, info = LTMedia.describe(url);
    // #462: 주소가 비었을 때의 긴 안내는 칸 이름·파일 고르기와 같은 말이라 비운다(주소를 넣으면 종류·형식만 알린다).
    $('url-media-hint').textContent = info.kind === 'none' ? '' : info.kind === 'invalid' ? '링크 형식을 확인해 주세요.' : info.label;
    // #1097: 영상은 미리보기 본문(compact)만 — 크게 보기·열기는 아래 한 줄(renderMediaActions)로 옮긴다.
    $('url-media-preview').innerHTML = url ? LTMedia.markup(url, form.elements.title.value, null, '', null, null, {compact: true}) : '';
    renderMediaActions(info, url, form.elements.title.value);
    // #792: 시작·끝 구간 칸은 YouTube 주소일 때만 보인다. 주소에 t=·start=가 있으면 빈 시작 칸을 채운다(이미 적은 값은 그대로).
    const rangeFields = $('range-fields');
    if (rangeFields) rangeFields.hidden = info.kind !== 'youtube';
    if (info.kind === 'youtube' && form.elements.startSeconds) {
      const fill = fillStartFromUrl(url, form.elements.startSeconds.value);
      if (fill !== null) form.elements.startSeconds.value = formatTimecode(fill);
    }
    const rangeError = $('range-error');
    if (rangeError) { rangeError.hidden = true; rangeError.textContent = ''; }
    // #1097: 구간 칩(5/10/15초·끝까지·반복 미리보기)은 재생을 누르기 전부터 보인다 — 재생기가 없이도 칸을 채운다.
    if (info.kind === 'youtube' && !segmentCapture) {
      try {
        segmentCapture = createSegmentCapture({form: $('moment-form'), scope: document});
        const block = $('segment-capture');
        if (block) block.hidden = !segmentCapture;
      } catch { segmentCapture = null; }
    }
    // #344: 미리보기 때 서버 oEmbed 프록시로 영상 제목을 받아 둔다(실패는 조용히). 저장 시 mediaMetadata.title로 함께 넘긴다.
    editorVideoTitle = '';
    editorTikTokMeta = null;
    editorInstagramUrl = '';
    editorInstagramMeta = null;
    editorVideoUrl = info.kind === 'youtube' && info.videoId ? url : '';
    if (editorVideoUrl) {
      const videoId = info.videoId;
      void fetchVideoTitle(videoId).then(title => { if (title && editorVideoUrl === url) { editorVideoTitle = title; videoTitleCache.set(videoId, title); } });
    }
    // #791: 틱톡은 제목·영상 id·@계정·썸네일을 미리 받아 저장값에 함께 넘긴다.
    if (info.kind === 'tiktok') {
      editorVideoUrl = url;
      const known = tiktokMetaCache.get(url);
      if (known) { editorTikTokMeta = known; if (known.title) editorVideoTitle = known.title; }
      else void fetchTikTokMetadata(url).then(meta => {
        if (!meta || editorVideoUrl !== url) return;
        const saved = {
          title: meta.title || '', tiktokId: meta.videoId || '',
          tiktokAuthor: meta.author || '', thumbnail: meta.thumbnailUrl || ''
        };
        tiktokMetaCache.set(url, saved);
        editorTikTokMeta = saved;
        editorVideoTitle = saved.title;
      });
    }
    // #791 2단계: 릴스 caption·@계정. 한도면 링크만 둔다.
    if (info.kind === 'instagram') {
      editorInstagramUrl = url;
      const known = instagramMetaCache.get(url);
      if (known) { editorInstagramMeta = known; if (known.title) editorVideoTitle = known.title; }
      else if (!instagramLimited.has(url)) void fetchInstagramMetadata(url).then(meta => {
        if (editorInstagramUrl !== url) return;
        if (!meta) return;
        if (meta.limited) { instagramLimited.add(url); return; }
        const saved = { title: meta.title || '', author: meta.authorName || '', shortcode: meta.shortcode || '' };
        instagramMetaCache.set(url, saved);
        editorInstagramMeta = saved;
        if (saved.title) editorVideoTitle = saved.title;
      });
    }
  }
  function editorMediaTitle() {
    if (!editorVideoUrl) return {};
    const url = $('moment-form').elements.url.value.trim();
    if (url !== editorVideoUrl) return {};
    if (LTMedia.describe(url).kind === 'tiktok') {
      const meta = editorTikTokMeta || {};
      const mediaMetadata = {};
      if (meta.title) mediaMetadata.title = meta.title;
      if (meta.tiktokId) mediaMetadata.tiktokId = meta.tiktokId;
      if (meta.tiktokAuthor) mediaMetadata.tiktokAuthor = meta.tiktokAuthor;
      if (meta.thumbnail) mediaMetadata.thumbnail = meta.thumbnail;
      return Object.keys(mediaMetadata).length ? { mediaMetadata } : {};
    }
    if (LTMedia.describe(url).kind === 'instagram') {
      if (!editorInstagramMeta || instagramLimited.has(url)) return {};
      const meta = editorInstagramMeta;
      const mediaMetadata = {};
      if (meta.title) mediaMetadata.title = meta.title;
      if (meta.author) { mediaMetadata.channel = meta.author; mediaMetadata.instagramAuthor = meta.author; }
      if (meta.shortcode) mediaMetadata.instagramShortcode = meta.shortcode;
      return Object.keys(mediaMetadata).length ? { mediaMetadata } : {};
    }
    return editorVideoTitle ? { mediaMetadata: { title: editorVideoTitle } } : {};
  }
  // 계정 메뉴·편집기 버튼은 셸이 열고, 이 파일은 폼 상태만 본다.
  // #481 L15: #manage-tree는 index.html에 없는 죽은 가드였다 — 열기 버튼은 셸이 직접 openTreeManager를 부른다.
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
      if (!values.subject) values.subject = tree?.subject || '모아둔 순간';
      values.coverMode = mode;
      // 고르지 않은 방법의 저장값은 덮어쓰지 않는다 — 첫 순간(기본)·디자인은 저장해 둔 표지 순간을 그대로 두고,
      // 순간에서·사진만 지금 고른 순간으로 바꾼다(되돌리면 그대로 다시 보인다).
      values.coverMomentId = (mode === 'basic' || mode === 'design') ? (tree?.coverMomentId || '') : ($('tree-cover').value || '');
      // #978: 기준값을 저장 전에 맞춘다 — apply 가 화면을 다시 그리며 창을 닫으려 할 때(treeDirty)
      // '저장하지 않고 닫을까요?'를 잘못 묻지 않게 한다. 저장 실패 때는 옛 기준값으로 되돌린다.
      const prevBaseline = treeBaseline;
      treeBaseline = new URLSearchParams(new FormData(e.target)).toString();
      try {
        getMember().apply('editTree', values, selection());
      } catch (error) { treeBaseline = prevBaseline; throw error; }
      if(typeof dispatchEvent==='function')dispatchEvent(new Event('lt41-trees-changed'));
      $('tree-manager').close();
      // #905: 저장 진행·성공은 알리지 않는다 — apply 는 동기이라 1초 안에 끝나고, 실패는 폼 오류 줄로 알린다.
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
  // '순간 추가'는 이제 shell/quick-add.mjs가 고르기 창을 연다(#빠른 추가 ②). 이 파일은 편집기만 맡는다.

  for (const name of ['title', 'note', 'url']) $('moment-form').elements[name].addEventListener('input', () => { if (name === 'url' || name === 'title') updateMediaPreview(); });
  // 감정 칩: 누르기 + 화살표 키로 고르기(선택이 곧 초점이 된다, 표준 라디오 묶음 동작).
  try {
    const chipHost = $('emotion-chips');
    chipHost.addEventListener('click', (event) => {
      const chip = event.target?.closest?.('[data-emotion]');
      if (chip?.dataset?.emotion && chip.dataset.emotion !== $('moment-form').elements.emotion.value) pickEmotionChip(chip.dataset.emotion);
      else if (chip?.dataset?.emotion) syncEmotionChips();
    });
    chipHost.addEventListener('keydown', (event) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const chips = emotionChips();
      if (!chips.length) return;
      const currentIndex = chips.findIndex(chip => chip.dataset?.emotion === $('moment-form').elements.emotion.value);
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = chips.length - 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (currentIndex <= 0 ? chips.length - 1 : currentIndex - 1);
      else next = (currentIndex >= chips.length - 1 || currentIndex < 0 ? 0 : currentIndex + 1);
      event.preventDefault();
      pickEmotionChip(chips[next].dataset.emotion);
      try { chips[next].focus(); } catch {}
    });
  } catch {}
  syncEmotionChips();
  // #627: 사용자가 무대 날짜를 직접 고치면 자동 채움 안내를 감춘다.
  $('moment-form').elements.date.addEventListener('input', () => { $('stage-date-hint').hidden = true; });
  // #876(규칙 1·4): 자세한 추가도 쉬운 추가와 같은 규칙 — 같은 트리에 같은 영상·같은 장면이 이미 있으면
  // 막지 말고 담기 전에 한 번 알려 준다. [그래도 담기]는 이 판정을 다시 보지 않고(requestSubmit에
  // editorDupBypass 표시) 원래 저장을 그대로 한다. 수정('edit')은 이미 담긴 순간을 고치는 길이라 보지 않는다.
  let editorDupBypass = false;
  function editorDupCheck() {
    if (editorMode !== 'add' || editorDupBypass) return null;
    const url = $('moment-form').elements.url.value.trim();
    if (!url) return null;
    const treeId = String(selection()?.treeId || '');
    const trees = getMember()?.state?.()?.trees || [];
    const targetTree = trees.find(tree => tree.id === treeId) || null;
    const dup = targetTree ? findSameVideoInTree(targetTree, url) : null;
    return dup ? { dup, treeId, treeName: displayTreeTitle(String(targetTree?.title || targetTree?.subject || '') || '트리') } : null;
  }
  // #934: 링크 칸에 열 수 없는 값이 남아 있으면 저장하지 않는다.
  //  전에는 미리보기만 '링크를 열 수 없어요'를 띄우고 저장은 그대로 됐다 — 경고와 결과가 어긋났다.
  //  판정은 미리보기가 경고를 띄우는 그 함수(LTMedia.describe의 kind==='invalid')를 그대로 쓴다.
  //  그래서 '경고가 뜨면 저장도 막힌다'가 한 곳에서 정해진다(쉬운 추가와도 같은 답 — v41-934 시험).
  //  칸을 비우면 링크 없이 저장하는 길은 그대로 열어 둔다.
  function linkFieldError() {
    const field = $('moment-form').elements.url;
    const value = String(field?.value ?? '').trim();
    if (!value) return '';
    let info = null;
    try { info = LTMedia.describe(value); } catch { info = null; }
    // 판정을 못 받았으면(미리보기가 아직 없는 화면) 막지 않는다 — 막는 쪽은 'invalid'라는 분명한 답이 있을 때만.
    if (!info || info.kind !== 'invalid') return '';
    return LINK_FORMAT_ERROR;
  }
  $('moment-form').onsubmit = e => {
    e.preventDefault();
    if (getUploads().busy) return;
    const linkError = linkFieldError();
    if (linkError) {
      $('form-error').textContent = linkError;
      $('moment-form').elements.url.focus?.();
      return;
    }
    // #1097: 이어짐은 아래 '저장하기' 한 번에 함께 저장한다(별도 버튼으로 먼저 저장하라고 막지 않는다).
    // #792: 시작·끝 구간 검사 — 틀리면 칸 아래에 validateRange의 문구 그대로 알리고 저장하지 않는다.
    const rangeForm = $('moment-form');
    const rangeStart = rangeForm.elements.startSeconds, rangeEnd = rangeForm.elements.endSeconds;
    if (rangeStart || rangeEnd) {
      try {
        validateRange({ startSeconds: rangeStart?.value ?? '', endSeconds: rangeEnd?.value ?? '' }, rangeForm.elements.url.value.trim());
        const rangeError = $('range-error');
        if (rangeError) { rangeError.hidden = true; rangeError.textContent = ''; }
      } catch (error) {
        const rangeError = $('range-error');
        if (rangeError) { rangeError.textContent = error.message; rangeError.hidden = false; }
        rangeStart?.focus?.();
        return;
      }
    }
    // #876 규칙 1: 담기 전에 같은 영상·같은 장면을 한 번 알려 준다(막지 않는다). 창의 [그래도 담기]가
    // requestSubmit으로 돌아오면 editorDupBypass 때문에 이 판정을 다시 보지 않고 저장한다.
    const dupInfo = editorDupCheck();
    if (dupInfo) {
      deps.videoDup?.open({
        treeId: dupInfo.treeId,
        momentId: dupInfo.dup.id,
        treeName: dupInfo.treeName,
        dateText: formatDisplayDate(dupInfo.dup.date, 'long'),
        onContinue: () => { editorDupBypass = true; try { $('moment-form').requestSubmit(); } finally { editorDupBypass = false; } },
      });
      return;
    }
    try {
      // #344: 미리보기 때 받아 둔 영상 제목을 저장 입력에 함께 넘긴다(사용자 입력 제목이 항상 우선 — 도메인 판정).
      // '가' 결정: 자세한 추가의 부모는 편집기를 열 때 정한 이전 순간(고르지 않았으면 가장 최근 순간)이다.
      // #1097: 수정 저장은 내용(edit) → 이전 순간(reparent) → 관련 연결(link·unlink) 순서로 한 번에 한다.
      //  각 단계는 member-session의 meta 모델 전용 길(재적재 0)을 그대로 쓴다. 한 단계가 실패하면
      //  성공한 단계의 기준값만 갱신하고, 무엇이 안 됐는지 폼 오류 줄로 알린다(#905: 성공 진행 안내는 띄우지 않는다).
      const sel = editorMode === 'add' ? { ...selection(), momentId: addParentMomentId() } : selection();
      const input = {...Object.fromEntries(new FormData(e.target)), ...editorMediaTitle()};
      // #791 2단계: 릴스 링크를 적어 둔 채 캡처 그림을 올리면 그림은 썸네일로, 링크는 원본으로 남긴다.
      if (editorInstagramUrl && LTMedia.describe(String(input.url ?? '')).privateFile) {
        input.image = String(input.url).trim();
        input.url = editorInstagramUrl;
      }
      getMember().apply(editorMode, input, sel, editorMode === 'add' ? {moment:true} : undefined);
      formBaseline = new URLSearchParams(new FormData(e.target)).toString();
      const failedNotes = [];
      if (editorMode === 'edit') {
        const c = window.LT41?.tree;
        const wantParent = $('parent-target').value;
        const wantRelation = $('parent-relation').value;
        const wantLinks = [...intendedLinks];
        // 이전 순간 바꾸기: 시작 순간은 도메인에서 못 바꾸므로 선택지가 비활성이다. 이전 순간이나 이유가 바뀌었을 때만 보낸다.
        if (baselineParentId && (wantParent !== baselineParentId || wantRelation !== baselineRelation)) {
          try {
            getMember().apply('reparent', {targetId: wantParent, relation: wantRelation}, sel);
            baselineParentId = wantParent; baselineRelation = wantRelation;
          } catch (error) { failedNotes.push(`이전 순간 변경은 안 됐어요 — ${error.message}`); }
        }
        // 관련 연결: 끊긴 것(unlink)을 먼저, 새로 잇는 것(link)을 다음으로 차례로 보낸다.
        const removed = baselineLinks.filter(id => !intendedLinks.has(id));
        const added = wantLinks.filter(id => !baselineLinks.includes(id));
        for (const id of removed) {
          const title = c?.moments.find(moment => moment.id === id)?.title || '관련 순간';
          try { getMember().apply('unlink', {targetId: id}, sel); baselineLinks = baselineLinks.filter(link => link !== id); }
          catch (error) { failedNotes.push(`${title} 연결 해제는 안 됐어요 — ${error.message}`); }
        }
        for (const id of added) {
          const title = c?.moments.find(moment => moment.id === id)?.title || '관련 순간';
          try { getMember().apply('link', {targetId: id}, sel); baselineLinks = [...baselineLinks, id]; }
          catch (error) { failedNotes.push(`${title} 연결은 안 됐어요 — ${error.message}`); }
        }
        parentBaseline = parentValue();
        renderContinueSummary();
        if (failedNotes.length) {
          // 내용(edit)은 이미 저장됐다 — 안 된 부분만 이름으로 알리고 창은 연 채로 둔다.
          $('form-error').textContent = `내용은 저장됐어요. ${failedNotes.join(' · ')}`;
          return;
        }
      }
      $('write-panel').close();
      if (editorMode === 'new') show('track59-sketchbook.html');
      // #876 규칙 3: 다른 트리에 같은 영상이 있으면 담은 뒤 한 줄 알린다(막지 않는다).
      // #905: 저장 자체의 진행·성공 안내는 띄우지 않는다 — 같은 영상이 있을 때만 한 줄 알린다.
      const url = $('moment-form').elements.url.value.trim();
      const others = treesWithSameVideo(getMember()?.state?.()?.trees || [], { excludeTreeId: String(selection()?.treeId || ''), url });
      const otherLine = others.length ? otherTreesLine(others) : '';
      if (otherLine) notify(`담은 영상이 ${otherLine}`);
    } catch (error) { $('form-error').textContent = error.message; }
  };
  // #380 4 2차: Esc·바깥 클릭·× 닫기와 "저장하지 않고 닫을까요?" 확인은 shell/dialogs.mjs 공통 틀이 맡는다
  // (트리 관리와 같은 규칙). 편집기만의 규칙은 공통 틀보다 우선한다 — 업로드 중이면 닫지 않는다.
  $('editor-cancel').onclick = () => { requestClose?.('write-panel'); };
  // #1097: 영상 바꾸기 펼침 — 닫힌 상태가 기본이고, 닫기 시 더러움 확인은 그대로다(폼 기준값이 맡는다).
  $('media-change-toggle').onclick = () => { setMediaChangeOpen($('media-change-box').hidden); };
  $('parent-target').onchange = () => updateParentPreview();
  // #1097: '+ 연결 추가'를 고르면 칩으로 얹힌다 — 실제 저장은 '저장하기' 한 번에 나타난다.
  $('related-target').onchange = () => {
    const id = $('related-target').value;
    if (id && !intendedLinks.has(id)) {
      intendedLinks.add(id);
      renderRelatedChips();
      fillRelatedOptions();
      renderContinueSummary();
    }
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
  }

  function focusTitleInput() {
    // #1097: 제목은 접히지 않아 항상 보인다 — 바로 초점을 준다.
    queueMicrotask(() => {
      const titleInput = $('moment-form')?.elements?.title;
      titleInput?.focus?.();
      titleInput?.select?.();
    });
  }

  return {
    setEditorMode,
    openEditor,
    focusTitleInput,
    openTreeManager,
    updateTreeCoverHint,
    updateMediaPreview,
    uploadsChanged,
    formDirty,
    detailedDirty,
    startQuickSession,
    onWriteTab,
    treeDirty,
    editorMode: () => editorMode
  };
}
