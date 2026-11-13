import './styles.css';
import './admin.css';

/**
 * 러브트리 관리자 — 고객 의견·사용 일지 게시판 (#540 2차).
 *
 * - 게시판: 목록(제목·글쓴이·날짜·종류·상태·답글 수) → 상세(본문 + 답글 스레드).
 * - 답글: 고객에게 보이는 답변 / 내부 메모.
 * - 글쓴이(AI 고객)를 누르면 페르소나 소개 + 그 고객 글 목록.
 * - 이슈 탭: GitHub 이슈 목록·상태만(공개 저장소, 토큰 없이).
 */

const text = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const time = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR', {hour12: false});
};
const KIND_LABEL = {opinion: '의견', journal: '일지'};
const STATUS_LABEL = {received: '받음', reviewing: '확인 중', fixed: '고침', later: '다음에'};
const STATUS_ORDER = ['received', 'reviewing', 'fixed', 'later'];
const PERSONA_FIELDS = [
  ['who', '누구'], ['why', '왜 쓰나'], ['how', '쓰는 모습'], ['satisfied', '만족한 점'], ['disappointed', '실망한 점'], ['now', '지금 상태']
];

const state = {tab: 'board', kind: '', status: '', selectedId: null, personaSubject: null, editingPersona: false};

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

function head() {
  return `<header class="site-header"><a href="/" class="brand">${text('러브트리')}<span class="brand-dot">.</span></a><nav aria-label="주 메뉴"><a href="/">app으로</a><button type="button" data-tab="board" class="${state.tab === 'board' ? 'is-active' : ''}">게시판</button><button type="button" data-tab="reports" class="${state.tab === 'reports' ? 'is-active' : ''}">신고</button><button type="button" data-tab="issues" class="${state.tab === 'issues' ? 'is-active' : ''}">이슈</button></nav></header>`;
}

function renderLogin() {
  const authenticated = session?.ok && session.authenticated;
  if (authenticated) return false;
  host.innerHTML = `${head()}<div class="admin-shell"><section class="storage-notice admin-card"><div class="admin-card-head"><strong>${session ? '로그인이 필요해요' : '관리자 상태를 확인하지 못했어요'}</strong><span class="notice">${session ? 'PADIEM 계정으로 로그인한 뒤 다시 열어 주세요. 관리자 여부는 서버가 확인한 신원으로만 정해집니다.' : '서버에 닿지 못했습니다.'}</span></div><div class="admin-actions"><a class="button primary" href="/auth/login?next=/admin.html">로그인</a></div></section></div>`;
  return true;
}

function statusBadge(status) { return `<span class="lt-badge" data-status="${text(status)}">${text(STATUS_LABEL[status] || status)}</span>`; }
function kindBadge(kind) { return `<span class="lt-badge" data-kind="${text(kind)}">${text(KIND_LABEL[kind] || kind)}</span>`; }
function authorLabel(row) { return row.authorName || (row.subjectId ? '고객' : '익명'); }

async function render() {
  if (renderLogin()) return;
  const authenticated = session?.ok && session.authenticated;
  const admin = authenticated && session.admin;
  if (!admin) {
    host.innerHTML = `${head()}<div class="admin-shell"><section class="storage-notice admin-card"><div class="admin-card-head"><strong>일반 사용자 상태</strong><span class="notice">이 계정에는 러브트리 관리자 역할이 없습니다.</span></div></section></div>`;
    return;
  }
  if (state.tab === 'issues') { await renderIssues(); return; }
  if (state.tab === 'reports') { await renderReports(); return; }
  if (state.selectedId) { await renderDetail(); return; }
  if (state.personaSubject) { await renderPersona(); return; }
  await renderList();
}

async function renderList() {
  const params = new URLSearchParams();
  if (state.kind) params.set('kind', state.kind);
  if (state.status) params.set('status', state.status);
  const res = await read('/api/admin/feedback?' + params.toString());
  const rows = res.ok && Array.isArray(res.payload?.feedback) ? res.payload.feedback : [];
  const filters = `<div class="lt-filters">
    <select data-filter="kind" aria-label="종류 거르기"><option value="">종류 전체</option><option value="opinion"${state.kind === 'opinion' ? ' selected' : ''}>의견</option><option value="journal"${state.kind === 'journal' ? ' selected' : ''}>일지</option></select>
    <select data-filter="status" aria-label="상태 거르기"><option value="">상태 전체</option>${STATUS_ORDER.map(s => `<option value="${s}"${state.status === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select>
  </div>`;
  const list = rows.length
    ? rows.map(row => `<article class="lt-post" data-open="${row.id}" tabindex="0" role="button">
        <div class="lt-post-top">${kindBadge(row.kind)}${statusBadge(row.status)}<span class="lt-post-date">${text(time(row.createdAt))}</span></div>
        <h3 class="lt-post-title">${text(row.displayTitle || '(제목 없음)')}</h3>
        <div class="lt-post-meta"><span class="lt-post-author" data-author="${text(row.subjectId || '')}">${text(authorLabel(row))}</span><span>답글 ${row.replyCount || 0}</span></div>
      </article>`).join('')
    : '<p class="lt-empty">접수된 글이 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">고객 의견</h1><p class="lt-sub">${rows.length}건 · 최신 순</p></div>
    ${filters}
    <div class="lt-post-list">${list}</div>
  </div>`;
}

async function renderDetail() {
  const res = await read('/api/admin/feedback/' + encodeURIComponent(state.selectedId));
  const post = res.ok ? res.payload?.feedback : null;
  if (!post) { state.selectedId = null; await render(); return; }
  const replies = Array.isArray(post.replies) ? post.replies : [];
  const persona = post.persona && post.persona.name ? post.persona : null;
  const replyRows = replies.length
    ? replies.map(r => `<div class="lt-reply" data-type="${r.authorType}"><div class="lt-reply-head"><span>${r.authorType === 'customer' ? '고객 답변' : '내부 메모'}</span><span>${text(time(r.createdAt))}</span></div><p>${text(r.body)}</p></div>`).join('')
    : '<p class="lt-empty">아직 답글이 없습니다.</p>';
  const author = post.subjectId
    ? `<button type="button" class="lt-author-link" data-persona="${text(post.subjectId)}">${text(authorLabel(post))}${persona ? ' · 페르소나' : ''}</button>`
    : `<span>${text(authorLabel(post))}</span>`;
  const statusBtns = STATUS_ORDER.map(s => `<button type="button" data-set-status="${s}" class="${post.status === s ? 'is-on' : ''}">${STATUS_LABEL[s]}</button>`).join('');
  const journalOnly = post.kind === 'journal';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <button type="button" class="lt-back" data-back>← 목록</button>
    <article class="lt-card">
      <div class="lt-post-top">${kindBadge(post.kind)}${statusBadge(post.status)}${post.score ? `<span class="lt-badge">점수 ${post.score}</span>` : ''}<span class="lt-post-date">${text(time(post.createdAt))}</span></div>
      <h1 class="lt-h1">${text(post.displayTitle || '(제목 없음)')}</h1>
      <div class="lt-post-meta">글쓴이 ${author}</div>
      <div class="lt-body">${text(post.body).replace(/\n/g, '<br>')}</div>
    </article>
    <section class="lt-card">
      <h2 class="lt-h2">답글</h2>
      <div class="lt-reply-list">${replyRows}</div>
      <form class="lt-reply-form" data-reply-form>
        <select name="authorType" aria-label="답글 종류"${journalOnly ? ' disabled' : ''}>
          <option value="internal">내부 메모</option>
          ${journalOnly ? '' : '<option value="customer">고객에게 보이는 답변</option>'}
        </select>
        <textarea name="body" rows="3" maxlength="4000" placeholder="${journalOnly ? '내부 메모만 남길 수 있어요' : '답글을 입력하세요'}" aria-label="답글 본문"></textarea>
        <button type="submit" class="lt-btn primary">답글 남기기</button>
      </form>
      <p class="lt-status" role="status"></p>
    </section>
    <section class="lt-card">
      <h2 class="lt-h2">처리</h2>
      <div class="lt-status-row">${statusBtns}</div>
      <label class="lt-field">운영 메모<textarea data-memo rows="2" maxlength="2000">${text(post.memo || '')}</textarea></label>
      <label class="lt-field">연결 이슈 번호<input data-issue value="${text(post.issueNumber || '')}" placeholder="예: 541"></label>
      <div class="lt-actions"><button type="button" class="lt-btn primary" data-save>저장</button><button type="button" class="lt-btn" data-make-issue>GitHub 이슈 글 만들기</button></div>
      <p class="lt-status" data-save-status role="status"></p>
    </section>
  </div>`;
}

async function renderPersona() {
  const subjectId = state.personaSubject;
  const res = await read('/api/admin/persona/' + encodeURIComponent(subjectId));
  const persona = res.ok ? res.payload?.persona : {name: '', intro: {}};
  const postsRes = await read('/api/admin/feedback');
  const posts = (postsRes.ok ? postsRes.payload?.feedback : []).filter(p => p.subjectId === subjectId);
  const intro = persona.intro || {};
  const form = PERSONA_FIELDS.map(([key, label]) => `<label class="lt-field">${label}<input data-intro="${key}" value="${text(intro[key] || '')}"></label>`).join('');
  const postRows = posts.length
    ? posts.map(p => `<button type="button" class="lt-post lt-post-row" data-open="${p.id}"><span>${kindBadge(p.kind)}</span><span class="lt-post-title">${text(p.displayTitle || '')}</span><span class="lt-post-date">${text(time(p.createdAt))}</span></button>`).join('')
    : '<p class="lt-empty">쓴 글이 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <button type="button" class="lt-back" data-back-list>← 게시판</button>
    <section class="lt-card">
      <h1 class="lt-h1">페르소나 · ${text(persona.name || '이름 없음')}</h1>
      <div class="lt-actions"><button type="button" class="lt-btn primary" data-persona-save>소개 저장</button></div>
      <label class="lt-field">이름<input data-persona-name value="${text(persona.name || '')}" maxlength="120"></label>
      ${form}
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
        return `<article class="lt-card" data-report="${report.id}">
          <div class="lt-post-top"><span class="lt-badge">${text(stateLabel)}</span><span class="lt-badge">${text(visibility)}</span><span class="lt-post-date">${text(time(report.createdAt))}</span></div>
          <p class="lt-body">${text(report.reason)}</p>
          <div class="lt-post-meta">공유 ${text(report.shareId)}</div>
          <div class="lt-actions">
            <button type="button" class="lt-btn" data-report-act="hide" data-id="${report.id}" ${hide}>검토 완료·발견 숨김</button>
            <button type="button" class="lt-btn" data-report-act="restore" data-id="${report.id}" ${restore}>신고 기각·발견 복구</button>
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
  const res = await read('/api/admin/session');
  let issues = [], error = '';
  try {
    const r = await fetch('https://api.github.com/repos/skerishKang/lovetree-4.0/issues?state=all&per_page=50&sort=updated', {headers: {accept: 'application/vnd.github+json'}});
    if (r.ok) issues = (await r.json()).filter(i => !i.pull_request);
    else error = '이슈를 불러오지 못했어요(' + r.status + ').';
  } catch { error = '이슈를 불러오지 못했어요(네트워크).'; }
  const rows = issues.length
    ? issues.map(i => `<a class="lt-post lt-post-row" href="${text(i.html_url)}" target="_blank" rel="noopener"><span class="lt-badge" data-status="${i.state === 'open' ? 'received' : 'fixed'}">${i.state === 'open' ? '열림' : '닫힘'}</span><span class="lt-post-title">#${i.number} ${text(i.title)}</span><span class="lt-post-date">댓글 ${i.comments}</span></a>`).join('')
    : `<p class="lt-empty">${text(error || '이슈가 없습니다.')}</p>`;
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
  if (tab) { state.tab = tab.dataset.tab; state.selectedId = null; state.personaSubject = null; await render(); return; }
  const filter = event.target.closest('[data-filter]');
  if (filter) return; // handled by change
  const open = event.target.closest('[data-open]');
  if (open && !event.target.closest('[data-persona]')) { state.selectedId = open.dataset.open; state.personaSubject = null; await render(); return; }
  const persona = event.target.closest('[data-persona]');
  if (persona && persona.dataset.persona) { state.personaSubject = persona.dataset.persona; state.selectedId = null; await render(); return; }
  if (event.target.closest('[data-back]')) { state.selectedId = null; await render(); return; }
  if (event.target.closest('[data-back-list]')) { state.personaSubject = null; await render(); return; }
  const setStatus = event.target.closest('[data-set-status]');
  if (setStatus) {
    const res = await read('/api/admin/feedback/' + encodeURIComponent(state.selectedId), {method: 'PATCH', body: JSON.stringify({status: setStatus.dataset.setStatus})});
    if (res.ok) await renderDetail();
    return;
  }
  if (event.target.closest('[data-save]')) {
    const memo = document.querySelector('[data-memo]')?.value || '';
    const issue = document.querySelector('[data-issue]')?.value || '';
    const res = await read('/api/admin/feedback/' + encodeURIComponent(state.selectedId), {method: 'PATCH', body: JSON.stringify({memo, issueNumber: issue})});
    const el = document.querySelector('[data-save-status]');
    if (el) el.textContent = res.ok ? '저장했어요.' : (res.payload?.error?.message || '저장에 실패했어요.');
    return;
  }
  if (event.target.closest('[data-make-issue]')) {
    const post = (await read('/api/admin/feedback/' + encodeURIComponent(state.selectedId))).payload?.feedback;
    if (post) {
      const ctx = post.context && typeof post.context === 'object' ? post.context : {};
      const env = [ctx.viewport && '화면 ' + ctx.viewport, ctx.theme && '테마 ' + ctx.theme, ctx.version && '앱 버전 ' + ctx.version].filter(Boolean).join(' · ');
      const body = `## 증상\n${post.body}\n\n## 화면\n- ${ctx.screen || '알 수 없음'}\n\n## 환경\n${env ? '- ' + env : '- (없음)'}\n\n> 고객 의견 창구에서 만든 글입니다. 보낸 계정·트리 내용은 넣지 않았습니다.`;
      try { await navigator.clipboard.writeText(body); const el = document.querySelector('[data-save-status]'); if (el) el.textContent = '이슈 본문을 복사했어요.'; } catch { /* clipboard blocked */ }
    }
    return;
  }
  if (event.target.closest('[data-persona-save]')) {
    const name = document.querySelector('[data-persona-name]')?.value || '';
    const intro = {};
    document.querySelectorAll('[data-intro]').forEach(el => { intro[el.dataset.intro] = el.value; });
    const res = await read('/api/admin/persona/' + encodeURIComponent(state.personaSubject), {method: 'PUT', body: JSON.stringify({name, intro})});
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
  const authorType = form.querySelector('[name="authorType"]').value;
  const res = await read('/api/admin/feedback/' + encodeURIComponent(state.selectedId) + '/reply', {method: 'POST', body: JSON.stringify({authorType, body})});
  if (res.ok) await renderDetail();
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open][role="button"]')) {
    event.preventDefault();
    state.selectedId = event.target.dataset.open;
    render();
  }
});

await render();