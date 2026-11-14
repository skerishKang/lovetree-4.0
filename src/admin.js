import './styles.css';
import './admin.css';
import {
  GITHUB_REPO, KIND_LABEL, STATUS_LABEL, STATUS_ORDER, PERSONA_FIELDS,
  escapeText, richParagraph, formatTime, parseHash, viewHash, viewToTab,
  filterRows, statusTabs, kindTabs, linkedIssueNumbers, issueStateLabel, needsFixButton,
  statusChangeMessage, buildIssueUrl, issueLink, journalsSummary, journalRowsByCustomer
} from './admin-view.js';

/**
 * 러브트리 관리자 — 고객 의견·사용 일지 게시판 (#540 2차, #564 해시 라우팅, #570 탭).
 *
 * - 주소가 곧 화면: #board · #board?status=..&kind=.. · #feedback/<id> · #persona/<id> · #reports · #issues.
 *   뒤로 가기·새로 고침·링크 공유가 화면 상태를 그대로 따른다(#564 2). 탭 거르기도 주소에 남긴다(#570 2).
 * - 고객 글: 목록(제목·글쓴이·날짜·종류·상태·답글 수) → 상세(본문 + 답글 스레드).
 * - 탭: 상태(새 글·확인 중·고침·다음에·닫음)와 종류(전체·의견·일지)에 숫자를 붙인다(#570 2).
 *   기본은 '닫음 뺀 전체' — 어느 상태 탭도 안 고른 상태다(#564 10).
 * - 답글: 고객에게 보이는 답변 / 내부 메모.
 * - 글쓴이(AI 고객)를 누르면 페르소나 소개 + 그 고객 글 목록.
 * - '고치는 일' 탭: 고객 글의 '연결 이슈 번호'에 있는 GitHub 이슈만(#570 4). 공개 저장소 읽기만(토큰 없이).
 */

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
function navigate(view, id = null, filters = null) {
  const hash = viewHash(view, id, filters ?? {});
  if (location.hash === hash) { route = parseHash(hash); render(); }
  else location.hash = hash;
}

function head() {
  // #570 1: 머리줄의 '러브트리로 돌아가기'는 로고와 같은 일을 두 번 하는 셈이라 없앤다. 로고만 남기고 안내를 붙인다.
  // #570 3: 탭 이름 — 게시판→고객 글, 이슈→고치는 일. 신고는 그대로.
  const tab = viewToTab(route.view);
  const tabBtn = (name, label) => `<button type="button" data-tab="${name}" class="${tab === name ? 'is-active' : ''}">${label}</button>`;
  return `<header class="app-header"><a class="brand" href="/v41/" title="러브트리로" aria-label="러브트리로"><span>LoveTree</span><small>4.1</small></a><nav aria-label="관리자 메뉴">${tabBtn('board', '고객 글')}${tabBtn('journals', '사용 일지')}${tabBtn('reports', '신고')}${tabBtn('issues', '고치는 일')}</nav></header>`;
}

function renderLogin() {
  const authenticated = session?.ok && session.authenticated;
  if (authenticated) return false;
  host.innerHTML = `${head()}<div class="admin-shell"><section class="admin-card"><div class="admin-card-head"><strong>${session ? '로그인이 필요해요' : '관리자 상태를 확인하지 못했어요'}</strong><span class="admin-note">${session ? 'PADIEM 계정으로 로그인한 뒤 다시 열어 주세요. 관리자 여부는 서버가 확인한 신원으로만 정해집니다.' : '서버에 닿지 못했습니다.'}</span></div><div class="admin-actions"><a class="button primary" href="/auth/login?next=/admin.html">로그인</a><a class="button" href="/v41/">러브트리로 돌아가기</a></div></section></div>`;
  return true;
}

function statusBadge(status) { return `<span class="lt-badge" data-status="${escapeText(status)}">${escapeText(STATUS_LABEL[status] || status)}</span>`; }
function kindBadge(kind) { return `<span class="lt-badge" data-kind="${escapeText(kind)}">${escapeText(KIND_LABEL[kind] || kind)}</span>`; }
// #611 3번: 운영센터에서는 AI 고객 이름을 'AI 윤제'처럼 알린다(남에게 보이는 곳의 'AI 테스터' 표시와 같은 결정).
function authorLabel(row) { const name = row.authorName || (row.subjectId ? '고객' : '익명'); return row.authorRole === 'ai_customer' ? `AI ${name}` : name; }

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
  if (route.view === 'journals') { await renderJournals(); return; }
  if (route.view === 'feedback' && route.id) { await renderDetail(route.id); return; }
  if (route.view === 'persona' && route.id) { await renderPersona(route.id); return; }
  await renderList();
}

async function renderList() {
  // 탭 숫자를 함께 보여 주려고 목록을 거르지 않고 한 번에 읽어 화면에서 거른다(#570 2). 목록은 작다.
  const res = await read('/api/admin/feedback');
  const rows = res.ok && Array.isArray(res.payload?.feedback) ? res.payload.feedback : [];
  const filters = {kind: route.kind, status: route.status};
  const visible = filterRows(rows, filters);
  const tabBtn = (data, value, label, count, active) =>
    `<button type="button" ${data}="${escapeText(value)}" class="lt-tab${active ? ' is-active' : ''}"${count == null ? '' : ` aria-label="${escapeText(label)} ${count}건"`}>${escapeText(label)}${count == null ? '' : ` <span class="lt-tab-count">${count}</span>`}</button>`;
  const statusRow = statusTabs(rows, route.kind).map(t => tabBtn('data-status-tab', t.status, t.label, t.count, route.status === t.status)).join('');
  const kindRow = kindTabs(rows, route.status).map(t => tabBtn('data-kind-tab', t.kind, t.label, t.count, route.kind === t.kind)).join('');
  const tabRows = `<div class="lt-tabs" role="group" aria-label="상태 탭">${statusRow}</div><div class="lt-tabs" role="group" aria-label="종류 탭">${kindRow}</div>`;
  const list = visible.length
    ? visible.map(row => `<article class="lt-post" data-open="${escapeText(row.id)}" tabindex="0" role="button">
        <div class="lt-post-top">${kindBadge(row.kind)}${statusBadge(row.status)}<span class="lt-post-date">${escapeText(formatTime(row.createdAt))}</span></div>
        <h3 class="lt-post-title">${escapeText(row.displayTitle || '(제목 없음)')}</h3>
        <div class="lt-post-meta"><span class="lt-post-author" data-author="${escapeText(row.subjectId || '')}">${escapeText(authorLabel(row))}</span>${issueLink(row.issueNumber) ? `<span class="lt-post-issue">이슈 ${issueLink(row.issueNumber)}</span>` : ''}<span>답글 ${row.replyCount || 0}</span></div>
      </article>`).join('')
    : '<p class="lt-empty">접수된 글이 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">고객 글</h1><p class="lt-sub">${visible.length}건 · 최신 순</p></div>
    ${tabRows}
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
    ? replies.map(r => `<div class="lt-reply" data-type="${r.authorType}"><div class="lt-reply-head"><span>${r.fromCustomer ? '고객 덧붙임' : (r.authorType === 'customer' ? '고객 답변' : '내부 메모')}</span><span>${escapeText(formatTime(r.createdAt))}</span></div><p>${richParagraph(r.body)}</p></div>`).join('')
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
  const posts = postsRes.ok && Array.isArray(postsRes.payload?.feedback) ? postsRes.payload.feedback.filter(p => p.subjectId === subjectId) : [];
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
    <button type="button" class="lt-back" data-back-list>← 고객 글</button>
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

/** #596 사용 일지 탭 — 오늘 요약 + 고객별 줄(누르면 그 고객 일지를 날짜 내림차순으로 펼쳐 읽는다). */
async function renderJournals() {
  const [journalsRes, feedbackRes] = await Promise.all([read('/api/admin/journals'), read('/api/admin/feedback')]);
  const journals = journalsRes.ok && Array.isArray(journalsRes.payload?.journals) ? journalsRes.payload.journals : [];
  const feedback = feedbackRes.ok && Array.isArray(feedbackRes.payload?.feedback) ? feedbackRes.payload.feedback : [];
  // 오늘(운영 기준 KST 날짜) 요약. 일지 날짜는 journal_date(운영 기준 날짜), 의견 날짜는 만든 시각의 KST 날짜로 잡는다.
  const today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Asia/Seoul'});
  const kstDay = value => new Date(value).toLocaleDateString('sv-SE', {timeZone: 'Asia/Seoul'});
  const summary = journalsSummary(journals, today);
  const rows = journalRowsByCustomer(journals);
  // 그날 그 고객이 보낸 의견(같은 KST 날짜) — 펼친 일지 안에서 그날 의견으로 바로 가는 링크(#596).
  const opinionsByCustomerDay = new Map();
  for (const row of feedback) {
    if (row.kind !== 'opinion' || !row.subjectId) continue;
    const key = `${row.subjectId}|${kstDay(row.createdAt)}`;
    if (!opinionsByCustomerDay.has(key)) opinionsByCustomerDay.set(key, []);
    opinionsByCustomerDay.get(key).push(row);
  }
  window.__ltJournalsData = {journals, rows, opinionsByCustomerDay};
  const summaryItem = (label, value) => `<div class="lt-jsum-item"><span class="lt-jsum-value">${escapeText(value)}</span><span class="lt-jsum-label">${escapeText(label)}</span></div>`;
  const flowDots = row => row.flow.map(point => `<i class="lt-flow-dot" data-score="${escapeText(point.score ?? '')}" title="${escapeText(point.day)}${point.score == null ? '' : ' · ' + escapeText(point.score)}점" aria-hidden="true"></i>`).join('');
  const customerRows = rows.length
    ? rows.map(row => `<div class="lt-jrow-wrap">
        <article class="lt-jrow" data-customer="${escapeText(row.subjectId)}" tabindex="0" role="button" aria-expanded="false">
          <div class="lt-jrow-head">
            <span class="lt-jrow-name">${escapeText(row.name)}</span>
            <span class="lt-badge">${escapeText(row.stage)}</span>
            ${row.atRisk ? '<span class="lt-badge warn">떠남 위험</span>' : ''}
            <span class="lt-jrow-score">최근 ${escapeText(row.latestScore ?? '—')}점</span>
            <span class="lt-jrow-flow" role="img" aria-label="날짜별 점수 흐름 ${escapeText(row.flow.map(point => point.day.slice(5) + ' ' + (point.score ?? '없음') + '점').join(', '))}">${flowDots(row)}</span>
            <span class="lt-post-date">${escapeText(row.lastDay || '—')}</span>
            <span class="lt-jrow-count">일지 ${row.journals.length}건</span>
          </div>
        </article>
        <div class="lt-jdetail" hidden data-customer-body="${escapeText(row.subjectId)}"></div>
      </div>`).join('')
    : '<p class="lt-empty">아직 사용 일지가 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">사용 일지</h1><p class="lt-sub">고객별로 날짜 내림차순 · 줄을 누르면 펼쳐 읽기</p></div>
    <div class="lt-jsum" role="group" aria-label="오늘 요약">
      ${summaryItem('오늘 활동 고객', summary.activeCustomers)}
      ${summaryItem('오늘 일지', summary.journalCount)}
      ${summaryItem('평균 다시 올 점수', summary.avgScore ?? '—')}
      ${summaryItem('떠남 위험(이틀 연속 2 이하)', summary.atRisk)}
    </div>
    <div class="lt-post-list">${customerRows}</div>
  </div>`;
}

/** 펼친 고객 일지(#596) — 날짜 내림차순, 본문 줄바꿈 유지, 그날 의견 링크. */
function journalDetailHtml(subjectId) {
  const data = window.__ltJournalsData;
  const row = data?.rows.find(entry => entry.subjectId === subjectId);
  if (!row) return '<p class="lt-empty">일지를 찾지 못했습니다.</p>';
  return row.journals.map(journal => {
    const day = String(journal.journalDate || '');
    const opinions = data.opinionsByCustomerDay.get(`${subjectId}|${day}`) || [];
    const links = opinions.map(op => `<a class="lt-journal-opinion" href="#feedback/${escapeText(op.id)}">그날 의견 · ${escapeText(op.displayTitle || '(제목 없음)')}</a>`).join('');
    return `<article class="lt-journal">
      <div class="lt-post-top"><span class="lt-post-date">${escapeText(day)}</span>${statusBadge(journal.status)}<span class="lt-badge">다시 올 점수 ${escapeText(journal.score ?? '—')}</span></div>
      <h3 class="lt-post-title">${escapeText(journal.displayTitle || '(제목 없음)')}</h3>
      <p class="lt-body">${richParagraph(journal.body)}</p>
      ${links ? `<div class="lt-journal-links">${links}</div>` : ''}
    </article>`;
  }).join('');
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
  // #570 4: GitHub 이슈 전체 목록은 없애고, 고객 글의 '연결 이슈 번호'에 있는 이슈만 보여 준다.
  const res = await read('/api/admin/feedback');
  const posts = res.ok && Array.isArray(res.payload?.feedback) ? res.payload.feedback : [];
  const numbers = linkedIssueNumbers(posts);
  let error = '';
  const byNumber = new Map();
  if (numbers.length) {
    // 공개 저장소 읽기만(토큰 없이). 하나가 실패해도 나머지는 그린다.
    const results = await Promise.allSettled(numbers.map(async number => {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${number}`, {headers: {accept: 'application/vnd.github+json'}});
      if (!r.ok) throw new Error(String(r.status));
      const issue = await r.json();
      return issue.pull_request ? null : issue; // 번호가 PR을 가리키면 건너뛴다
    }));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) byNumber.set(numbers[index], result.value);
      else if (result.status === 'rejected') error = '이슈 상태를 불러오지 못했어요';
    });
  }
  const rows = numbers.map(number => {
    const issue = byNumber.get(number);
    const linked = posts.filter(post => String(post.issueNumber ?? '').trim() === String(number));
    const stateLabel = issue ? issueStateLabel(issue.state) : '';
    const postRows = linked.map(post => {
      // 이슈가 고침 완료인데 고객 글이 아직 '고침'이 아니면 바꾸는 단추를 내놓는다. 누르기 전까지는 자동으로 바꾸지 않는다(#570 4).
      const fixBtn = needsFixButton(post, issue?.state)
        ? `<button type="button" class="lt-btn lt-fix-btn" data-fix-status="${escapeText(post.id)}">고침으로 바꾸기</button>` : '';
      return `<article class="lt-post lt-post-row" data-open="${escapeText(post.id)}" tabindex="0" role="button"><span class="lt-post-title">${escapeText(post.displayTitle || '(제목 없음)')}</span>${statusBadge(post.status)}${fixBtn}</article>`;
    }).join('');
    return `<section class="lt-card lt-issue-row" data-issue-row="${number}">
      <div class="lt-issue-head"><a class="lt-issue-link" href="https://github.com/${GITHUB_REPO}/issues/${number}" target="_blank" rel="noopener">#${number}</a><span class="lt-issue-title">${issue ? escapeText(issue.title) : '(이슈를 불러오지 못했어요)'}</span>${stateLabel ? `<span class="lt-badge" data-issue-state="${escapeText(issue.state)}">${stateLabel}</span>` : ''}</div>
      <div class="lt-post-list">${postRows}</div>
    </section>`;
  }).join('');
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">고치는 일</h1><p class="lt-sub">고객 글과 연결된 이슈만 · 공개 저장소 읽기만</p></div>
    ${error ? `<p class="lt-empty" data-issue-error>${escapeText(error)}</p>` : ''}
    ${rows || '<p class="lt-empty">고객 글에 연결된 이슈가 없습니다.</p>'}
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
  // 탭 거르기(#570 2): 다시 누르면 해제한다. 상태는 주소(#board?status=..&kind=..)에 남는다.
  const statusTab = event.target.closest('[data-status-tab]');
  if (statusTab) {
    const next = route.status === statusTab.dataset.statusTab ? '' : statusTab.dataset.statusTab;
    navigate('board', null, {status: next, kind: route.kind});
    return;
  }
  const kindTab = event.target.closest('[data-kind-tab]');
  if (kindTab) {
    const next = route.kind === kindTab.dataset.kindTab ? '' : kindTab.dataset.kindTab;
    navigate('board', null, {status: route.status, kind: next});
    return;
  }
  const fixBtn = event.target.closest('[data-fix-status]');
  if (fixBtn) {
    const res = await read('/api/admin/feedback/' + encodeURIComponent(fixBtn.dataset.fixStatus), {method: 'PATCH', body: JSON.stringify({status: 'fixed'})});
    if (res.ok) await renderIssues();
    return;
  }
  const open = event.target.closest('[data-open]');
  if (open && !event.target.closest('[data-persona]')) { navigate('feedback', open.dataset.open); return; }
  // #596: 고객 줄을 누르면 그 고객 일지를 날짜 내림차순으로 펼쳐 읽는다. 본문 줄바꿈 유지, 그날 의견 링크.
  const jrow = event.target.closest('[data-customer]');
  if (jrow && !event.target.closest('a')) {
    const body = document.querySelector(`[data-customer-body="${CSS.escape(jrow.dataset.customer)}"]`);
    if (body) {
      if (!body.dataset.filled) body.innerHTML = journalDetailHtml(jrow.dataset.customer);
      body.hidden = !body.hidden;
      jrow.setAttribute('aria-expanded', String(!body.hidden));
      jrow.classList.toggle('is-open', !body.hidden);
    }
    return;
  }
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
