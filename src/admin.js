import './styles.css';
import './admin.css';
import {
  KIND_LABEL, STATUS_LABEL, STATUS_ORDER, PERSONA_FIELDS,
  escapeText, richParagraph, formatTime, parseHash, viewHash, viewToTab,
  visibleRows, statusChangeMessage, buildIssueUrl, issueLink
} from './admin-view.js';

/**
 * 러브트리 관리자 — 고객 의견·사용 일지 게시판 (#540 2차, #564 해시 라우팅).
 *
 * - 주소가 곧 화면: #board · #feedback/<id> · #persona/<id> · #reports · #issues.
 *   뒤로 가기·새로 고침·링크 공유가 화면 상태를 그대로 따른다(#564 2).
 * - 게시판: 목록(제목·글쓴이·날짜·종류·상태·답글 수) → 상세(본문 + 답글 스레드).
 * - 답글: 고객에게 보이는 답변 / 내부 메모. '닫음' 상태는 목록 기본에서 숨긴다(#564 10).
 * - 글쓴이(AI 고객)를 누르면 페르소나 소개 + 그 고객 글 목록.
 * - 이슈 탭: GitHub 이슈 목록·상태만(공개 저장소, 토큰 없이).
 */

// 화면이 직접 가지는 상태는 거르기와 답글 종류뿐이다. 나머지는 주소(해시)에서 온다.
const state = {kind: '', status: ''};
let route = parseHash(globalThis.location?.hash);
let replyKind = 'internal'; // 상세 화면에서만 쓰는 답글 종류(#564 8). 기본은 내부 메모.

async function read(path, init = {}) {
  try {
    const response = await fetch(path, {credentials: 'same-origin', headers: {accept: 'application/json', ...(init.body ? {'content-type': 'application/json'} : {})}, ...init});
    const payload = await response.json().catch(() => null);
    return {ok: response.ok, status: response.status, payload};
  } catch {
    return {ok: false, status: 0, payload: null};
  }
}

const host = document.getElementById('main');
const sessionRes = await read('/api/admin/session');
const session = sessionRes.payload ?? (sessionRes.status === 401 ? {} : null);

/** 화면을 주소로 바꾸고 그린다. 주소가 이미 같으면 hashchange가 오지 않으므로 직접 그린다. */
function navigate(view, id = null) {
  const hash = viewHash(view, id);
  if (location.hash === hash) { route = parseHash(hash); render(); }
  else location.hash = hash;
}

function head() {
  // #540 마무리: 머리줄을 러브트리 앱(public/v41/shell.css의 .app-header·.brand)과 같은 모양으로.
  // 'app으로'는 '러브트리로 돌아가기'이고, 제목 옆 점(brand-dot)은 앱 머리줄에 없어 뺐다.
  const tab = viewToTab(route.view);
  const tabBtn = (name, label) => `<button type="button" data-tab="${name}" class="${tab === name ? 'is-active' : ''}">${label}</button>`;
  return `<header class="app-header"><a class="brand" href="/v41/"><span>LoveTree</span><small>4.1</small></a><nav aria-label="관리자 메뉴"><a class="back-app" href="/v41/">러브트리로 돌아가기</a>${tabBtn('board', '게시판')}${tabBtn('reports', '신고')}${tabBtn('issues', '이슈')}</nav></header>`;
}

function renderLogin() {
  const authenticated = session?.ok && session.authenticated;
  if (authenticated) return false;
  host.innerHTML = `${head()}<div class="admin-shell"><section class="admin-card"><div class="admin-card-head"><strong>${session ? '로그인이 필요해요' : '관리자 상태를 확인하지 못했어요'}</strong><span class="admin-note">${session ? 'PADIEM 계정으로 로그인한 뒤 다시 열어 주세요. 관리자 여부는 서버가 확인한 신원으로만 정해집니다.' : '서버에 닿지 못했습니다.'}</span></div><div class="admin-actions"><a class="button primary" href="/auth/login?next=/admin.html">로그인</a><a class="button" href="/v41/">러브트리로 돌아가기</a></div></section></div>`;
  return true;
}

function statusBadge(status) { return `<span class="lt-badge" data-status="${escapeText(status)}">${escapeText(STATUS_LABEL[status] || status)}</span>`; }
function kindBadge(kind) { return `<span class="lt-badge" data-kind="${escapeText(kind)}">${escapeText(KIND_LABEL[kind] || kind)}</span>`; }
function authorLabel(row) { return row.authorName || (row.subjectId ? '고객' : '익명'); }

async function render() {
  if (renderLogin()) return;
  const authenticated = session?.ok && session.authenticated;
  const admin = authenticated && session.admin;
  if (!admin) {
    // #540 마무리: 권한 없음 화면도 러브트리 안내 모양으로 — 4.0의 연베이지 상자·초록 글씨(storage-notice·notice)를 쓰지 않는다.
    host.innerHTML = `${head()}<div class="admin-shell"><section class="admin-card"><div class="admin-card-head"><strong>운영센터는 관리자 계정만 볼 수 있어요</strong><span class="admin-note">이 계정에는 러브트리 관리자 역할이 없습니다. 관리자 여부는 서버가 확인한 신원으로만 정해집니다.</span></div><div class="admin-actions"><a class="button primary" href="/v41/">러브트리로 돌아가기</a></div></section></div>`;
    return;
  }
  if (route.view === 'issues') { await renderIssues(); return; }
  if (route.view === 'reports') { await renderReports(); return; }
  if (route.view === 'feedback' && route.id) { await renderDetail(route.id); return; }
  if (route.view === 'persona' && route.id) { await renderPersona(route.id); return; }
  await renderList();
}

async function renderList() {
  const params = new URLSearchParams();
  if (state.kind) params.set('kind', state.kind);
  if (state.status) params.set('status', state.status);
  const res = await read('/api/admin/feedback?' + params.toString());
  const rows = visibleRows(res.ok ? res.payload?.feedback : [], state.status);
  const filters = `<div class="lt-filters">
    <select data-filter="kind" aria-label="종류 거르기"><option value="">종류 전체</option><option value="opinion"${state.kind === 'opinion' ? ' selected' : ''}>의견</option><option value="journal"${state.kind === 'journal' ? ' selected' : ''}>일지</option></select>
    <select data-filter="status" aria-label="상태 거르기"><option value="">상태 전체</option>${STATUS_ORDER.map(s => `<option value="${s}"${state.status === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select>
  </div>`;
  const list = rows.length
    ? rows.map(row => `<article class="lt-post" data-open="${escapeText(row.id)}" tabindex="0" role="button">
        <div class="lt-post-top">${kindBadge(row.kind)}${statusBadge(row.status)}<span class="lt-post-date">${escapeText(formatTime(row.createdAt))}</span></div>
        <h3 class="lt-post-title">${escapeText(row.displayTitle || '(제목 없음)')}</h3>
        <div class="lt-post-meta"><span class="lt-post-author" data-author="${escapeText(row.subjectId || '')}">${escapeText(authorLabel(row))}</span>${issueLink(row.issueNumber) ? `<span class="lt-post-issue">이슈 ${issueLink(row.issueNumber)}</span>` : ''}<span>답글 ${row.replyCount || 0}</span></div>
      </article>`).join('')
    : '<p class="lt-empty">접수된 글이 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">고객 의견</h1><p class="lt-sub">${rows.length}건 · 최신 순</p></div>
    ${filters}
    <div class="lt-post-list">${list}</div>
  </div>`;
}

async function renderDetail(id) {
  const res = await read('/api/admin/feedback/' + encodeURIComponent(id));
  const post = res.ok ? res.payload?.feedback : null;
  if (!post) { navigate('board'); return; }
  replyKind = 'internal'; // 글을 다시 열면 내부 메모부터(#564 8).
  const replies = Array.isArray(post.replies) ? post.replies : [];
  const persona = post.persona && post.persona.name ? post.persona : null;
  const replyRows = replies.length
    ? replies.map(r => `<div class="lt-reply" data-type="${r.authorType}"><div class="lt-reply-head"><span>${r.authorType === 'customer' ? '고객 답변' : '내부 메모'}</span><span>${escapeText(formatTime(r.createdAt))}</span></div><p>${richParagraph(r.body)}</p></div>`).join('')
    : '<p class="lt-empty">아직 답글이 없습니다.</p>';
  const author = post.subjectId
    ? `<button type="button" class="lt-author-link" data-persona="${escapeText(post.subjectId)}">${escapeText(authorLabel(post))}${persona ? ' · 페르소나' : ''}</button>`
    : `<span>${escapeText(authorLabel(post))}</span>`;
  const statusBtns = STATUS_ORDER.map(s => `<button type="button" data-set-status="${s}" class="${post.status === s ? 'is-on' : ''}">${STATUS_LABEL[s]}</button>`).join('');
  const journalOnly = post.kind === 'journal';
  const issue = String(post.issueNumber || '').trim();
  const authorName = persona?.name || authorLabel(post);
  // #564 8: 답글 종류를 select 대신 큰 선택 두 개로. 고객 쪽을 고르면 누구에게 보이는지 안내한다.
  const replyKindBtns = journalOnly
    ? '<div class="lt-reply-kind"><button type="button" data-reply-kind="internal" class="is-on" aria-pressed="true">내부 메모</button></div>'
    : `<div class="lt-reply-kind" role="group" aria-label="답글 종류"><button type="button" data-reply-kind="internal" class="is-on" aria-pressed="true">내부 메모</button><button type="button" data-reply-kind="customer" aria-pressed="false">고객에게 보이는 답변</button></div><p class="lt-reply-note" data-reply-note hidden>${escapeText(authorName)}에게 보입니다</p>`;
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <button type="button" class="lt-back" data-back>← 목록</button>
    <article class="lt-card">
      <div class="lt-post-top">${kindBadge(post.kind)}${statusBadge(post.status)}${post.score ? `<span class="lt-badge">점수 ${escapeText(post.score)}</span>` : ''}<span class="lt-post-date">${escapeText(formatTime(post.createdAt))}</span></div>
      <h1 class="lt-h1">${escapeText(post.displayTitle || '(제목 없음)')}</h1>
      <div class="lt-post-meta">글쓴이 ${author}</div>
      <div class="lt-body">${richParagraph(post.body)}</div>
    </article>
    <section class="lt-card">
      <h2 class="lt-h2">답글</h2>
      <div class="lt-reply-list">${replyRows}</div>
      <form class="lt-reply-form" data-reply-form>
        ${replyKindBtns}
        <textarea name="body" rows="3" maxlength="4000" placeholder="${journalOnly ? '내부 메모만 남길 수 있어요' : '답글을 입력하세요'}" aria-label="답글 본문"></textarea>
        <button type="submit" class="lt-btn">답글 남기기</button>
      </form>
      <p class="lt-status" role="status"></p>
    </section>
    <section class="lt-card">
      <h2 class="lt-h2">처리</h2>
      <div class="lt-status-row">${statusBtns}</div>
      <label class="lt-field">운영 메모<textarea data-memo rows="2" maxlength="2000">${escapeText(post.memo || '')}</textarea><small class="lt-field-note">이 글 전체에 대한 메모예요. 고객에게 보이지 않아요.</small></label>
      <label class="lt-field">연결 이슈 번호<input data-issue value="${escapeText(issue)}" placeholder="예: 541"></label>
      ${issueLink(issue) ? `<p class="lt-post-meta">연결 이슈 ${issueLink(issue)}</p>` : ''}
      <div class="lt-actions"><button type="button" class="lt-btn primary" data-save>메모·이슈 저장</button><button type="button" class="lt-btn" data-make-issue>GitHub 이슈 글 만들기</button></div>
      <p class="lt-status" data-save-status role="status"></p>
    </section>
  </div>`;
}

async function renderPersona(subjectId) {
  const res = await read('/api/admin/persona/' + encodeURIComponent(subjectId));
  const persona = res.ok ? res.payload?.persona : {name: '', intro: {}};
  const postsRes = await read('/api/admin/feedback');
  const posts = visibleRows(postsRes.ok ? postsRes.payload?.feedback : [], 'all').filter(p => p.subjectId === subjectId);
  const intro = persona.intro || {};
  // #564 13: 소개는 길어 잘리지 않게 여러 줄 칸으로. 내용 줄 수에 따라 높이를 정한다.
  const rowsFor = value => {
    const lines = String(value || '').split('\n');
    const wrapped = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 40)), 0);
    return Math.min(14, Math.max(2, wrapped));
  };
  const form = PERSONA_FIELDS.map(([key, label]) => `<label class="lt-field">${label}<textarea data-intro="${key}" rows="${rowsFor(intro[key])}">${escapeText(intro[key] || '')}</textarea></label>`).join('');
  const postRows = posts.length
    ? posts.map(p => `<button type="button" class="lt-post lt-post-row" data-open="${escapeText(p.id)}"><span>${kindBadge(p.kind)}</span><span class="lt-post-title">${escapeText(p.displayTitle || '')}</span><span class="lt-post-date">${escapeText(formatTime(p.createdAt))}</span></button>`).join('')
    : '<p class="lt-empty">쓴 글이 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <button type="button" class="lt-back" data-back-list>← 게시판</button>
    <section class="lt-card">
      <h1 class="lt-h1">페르소나 · ${escapeText(persona.name || '이름 없음')}</h1>
      <label class="lt-field">이름<input data-persona-name value="${escapeText(persona.name || '')}" maxlength="120"></label>
      ${form}
      <div class="lt-actions"><button type="button" class="lt-btn primary" data-persona-save>소개 저장</button></div>
      <p class="lt-status" data-persona-status role="status"></p>
    </section>
    <section class="lt-card"><h2 class="lt-h2">이 고객의 글</h2><div class="lt-post-list">${postRows}</div></section>
  </div>`;
}

async function renderReports() {
  const res = await read('/api/community/admin/reports');
  const reports = res.ok && Array.isArray(res.payload?.reports) ? res.payload.reports : [];
  const rows = reports.length
    ? reports.map(report => {
        const stateLabel = report.status === 'open' ? '검토 대기' : report.status === 'resolved' ? '처리 완료' : '기각';
        const visibility = report.hidden ? '발견 숨김' : '발견 노출';
        const hide = report.hidden ? 'disabled' : '';
        const restore = !report.hidden && report.status === 'dismissed' ? 'disabled' : '';
        return `<article class="lt-card" data-report="${escapeText(report.id)}">
          <div class="lt-post-top"><span class="lt-badge">${escapeText(stateLabel)}</span><span class="lt-badge">${escapeText(visibility)}</span><span class="lt-post-date">${escapeText(formatTime(report.createdAt))}</span></div>
          <p class="lt-body">${richParagraph(report.reason)}</p>
          <div class="lt-post-meta">공유 ${escapeText(report.shareId)}</div>
          <div class="lt-actions">
            <button type="button" class="lt-btn" data-report-act="hide" data-id="${escapeText(report.id)}" ${hide}>검토 완료·발견 숨김</button>
            <button type="button" class="lt-btn" data-report-act="restore" data-id="${escapeText(report.id)}" ${restore}>신고 기각·발견 복구</button>
          </div>
        </article>`;
      }).join('')
    : '<p class="lt-empty">접수된 신고가 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">발견·커뮤니티 신고 검토</h1><p class="lt-sub">신고 ${reports.length}건 · 자동 숨김 없이 관리자가 명시적으로 처리합니다.</p></div>
    <div class="lt-post-list">${rows}</div>
  </div>`;
}

async function renderIssues() {
  let issues = [], error = '';
  try {
    const r = await fetch('https://api.github.com/repos/skerishKang/lovetree-4.0/issues?state=all&per_page=50&sort=updated', {headers: {accept: 'application/vnd.github+json'}});
    if (r.ok) issues = (await r.json()).filter(i => !i.pull_request);
    else error = '이슈를 불러오지 못했어요(' + r.status + ').';
  } catch { error = '이슈를 불러오지 못했어요(네트워크).'; }
  const rows = issues.length
    ? issues.map(i => `<a class="lt-post lt-post-row" href="${escapeText(i.html_url)}" target="_blank" rel="noopener"><span class="lt-badge" data-status="${i.state === 'open' ? 'received' : 'fixed'}">${i.state === 'open' ? '열림' : '닫힘'}</span><span class="lt-post-title">#${i.number} ${escapeText(i.title)}</span><span class="lt-post-date">댓글 ${i.comments}</span></a>`).join('')
    : `<p class="lt-empty">${escapeText(error || '이슈가 없습니다.')}</p>`;
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">GitHub 이슈</h1><p class="lt-sub">목록·상태만 · 공개 저장소</p></div>
    <div class="lt-post-list">${rows}</div>
  </div>`;
}

// ---- events (delegated) ----
document.addEventListener('click', async (event) => {
  const reportAct = event.target.closest('[data-report-act]');
  if (reportAct) {
    const hide = reportAct.dataset.reportAct === 'hide';
    const res = await read('/api/community/admin/reports/' + encodeURIComponent(reportAct.dataset.id), {method: 'PATCH', body: JSON.stringify({status: hide ? 'resolved' : 'dismissed', visibility: hide ? 'hidden' : 'visible'})});
    if (res.ok) await renderReports();
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) { navigate(tab.dataset.tab); return; }
  const filter = event.target.closest('[data-filter]');
  if (filter) return; // handled by change
  const open = event.target.closest('[data-open]');
  if (open && !event.target.closest('[data-persona]')) { navigate('feedback', open.dataset.open); return; }
  const persona = event.target.closest('[data-persona]');
  if (persona && persona.dataset.persona) { navigate('persona', persona.dataset.persona); return; }
  if (event.target.closest('[data-back]')) { navigate('board'); return; }
  if (event.target.closest('[data-back-list]')) { navigate('board'); return; }
  const replyKindBtn = event.target.closest('[data-reply-kind]');
  if (replyKindBtn) {
    replyKind = replyKindBtn.dataset.replyKind;
    document.querySelectorAll('[data-reply-kind]').forEach(btn => {
      const on = btn === replyKindBtn;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    const note = document.querySelector('[data-reply-note]');
    if (note) note.hidden = replyKind !== 'customer';
    return;
  }
  const setStatus = event.target.closest('[data-set-status]');
  if (setStatus) {
    const res = await read('/api/admin/feedback/' + encodeURIComponent(route.id), {method: 'PATCH', body: JSON.stringify({status: setStatus.dataset.setStatus})});
    if (res.ok) {
      await renderDetail(route.id);
      const el = document.querySelector('[data-save-status]');
      if (el) el.textContent = statusChangeMessage(setStatus.dataset.setStatus);
    }
    return;
  }
  if (event.target.closest('[data-save]')) {
    const memo = document.querySelector('[data-memo]')?.value || '';
    const issue = document.querySelector('[data-issue]')?.value || '';
    const res = await read('/api/admin/feedback/' + encodeURIComponent(route.id), {method: 'PATCH', body: JSON.stringify({memo, issueNumber: issue})});
    const el = document.querySelector('[data-save-status]');
    if (el) el.textContent = res.ok ? '저장했어요.' : (res.payload?.error?.message || '저장에 실패했어요.');
    return;
  }
  if (event.target.closest('[data-make-issue]')) {
    const post = (await read('/api/admin/feedback/' + encodeURIComponent(route.id))).payload?.feedback;
    if (post) {
      const ctx = post.context && typeof post.context === 'object' ? post.context : {};
      const env = [ctx.viewport && '화면 ' + ctx.viewport, ctx.theme && '테마 ' + ctx.theme, ctx.version && '앱 버전 ' + ctx.version].filter(Boolean).join(' · ');
      const body = `## 증상\n${post.body}\n\n## 화면\n- ${ctx.screen || '알 수 없음'}\n\n## 환경\n${env ? '- ' + env : '- (없음)'}\n\n> 고객 의견 창구에서 만든 글입니다. 보낸 계정·트리 내용은 넣지 않았습니다.`;
      // #564 4: 본문을 복사하는 대신 GitHub '새 이슈' 쓰기 화면을 연다. 제목·본문만 넣고 계정·트리 정보는 넣지 않는다.
      window.open(buildIssueUrl({title: post.displayTitle || '', body}), '_blank', 'noopener');
    }
    return;
  }
  if (event.target.closest('[data-persona-save]')) {
    const name = document.querySelector('[data-persona-name]')?.value || '';
    const intro = {};
    document.querySelectorAll('[data-intro]').forEach(el => { intro[el.dataset.intro] = el.value; });
    const res = await read('/api/admin/persona/' + encodeURIComponent(route.id), {method: 'PUT', body: JSON.stringify({name, intro})});
    const el = document.querySelector('[data-persona-status]');
    if (el) el.textContent = res.ok ? '소개를 저장했어요.' : (res.payload?.error?.message || '저장에 실패했어요.');
    return;
  }
});

document.addEventListener('change', async (event) => {
  const filter = event.target.closest('[data-filter]');
  if (filter) { state[filter.dataset.filter] = filter.value; await renderList(); }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-reply-form]');
  if (!form) return;
  event.preventDefault();
  const body = form.querySelector('[name="body"]').value;
  const authorType = replyKind;
  const res = await read('/api/admin/feedback/' + encodeURIComponent(route.id) + '/reply', {method: 'POST', body: JSON.stringify({authorType, body})});
  if (res.ok) await renderDetail(route.id);
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open][role="button"]')) {
    event.preventDefault();
    navigate('feedback', event.target.dataset.open);
  }
});

// 주소가 바뀌면(뒤로 가기·앞으로 가기·직접 수정) 그 주소의 화면을 다시 그린다(#564 2).
window.addEventListener('hashchange', () => { route = parseHash(location.hash); render(); });

await render();
