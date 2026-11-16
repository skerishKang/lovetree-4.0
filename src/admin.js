import './styles.css';
import './admin.css';
import {
  applyThemeAttribute, nextTheme, readTheme, themeButtonAriaLabel, themeButtonLabel, themePressed, writeTheme
} from '../public/v41/header-state.mjs';
import {
  GITHUB_REPO, KIND_LABEL, STATUS_LABEL, STATUS_ORDER, PERSONA_FIELDS, PENDING_STATUS,
  escapeText, richParagraph, formatTime, parseHash, viewHash, viewToTab,
  filterRows, statusTabs, kindTabs, TABS, BOARD_KIND_TABS, boardKindTabs, boardStatusTabs, filterBoardRows, ALL_STATUS,
  linkedIssueNumbers, normalizeIssueNumber, issueStateLabel, needsFixButton,
  statusChangeMessage, buildIssueUrl, issueLink, journalsSummary, journalRowsByCustomer,
  isPendingStatus, overviewModel, statsCards,
  customerSummaryCards, customerRows, customerDetailModel, customerViewRows
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
// 머리줄은 .wrap 밖 body의 곧은 자식(#admin-header)에 그린다 — 본 화면 셸처럼 화면 양 끝까지 퍼지고(261116 대표 지적),
// 내용(.wrap)은 가운데 폭을 유지한다. head()는 머리줄을 그리고 빈 문자열을 돌려 기존 host.innerHTML = `${head()}…` 자리에 내용만 남긴다.
const headerHost = document.getElementById('admin-header');
let moreOpen = false; // ≤780의 '메뉴 더보기'(☰) 판이 열려 있는가 — 셸의 #mobile-more·#header-overflow와 같은 규칙.
// 테마는 본 사이트와 같은 한 벌(저장 키 lt41.theme — header-state.mjs) — 본 사이트에서 고른 밤/정원이
// 운영센터에도 그대로 적용된다. 첫 그림 전에 속성부터 붙여 밤→정원 깜빡임을 막는다.
applyThemeAttribute(document.documentElement, readTheme(localStorage));
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
  // 밤/정원 전환(2026-11-15 2단계) — 본 사이트와 같은 저장 키·문구(header-state.mjs 한 벌).
  const theme = readTheme(localStorage);
  const themeBtn = `<button type="button" class="lt-theme-toggle" data-lt-theme-toggle aria-pressed="${themePressed(theme)}" aria-label="${themeButtonAriaLabel(theme)}" title="${themeButtonAriaLabel(theme)}">${themeButtonLabel(theme)}</button>`;
  // #655: '한눈에'가 맨 앞 탭이다(운영센터를 열면 기본). 기존 탭·주소는 그대로 둔다.
  // 오른쪽 끝은 셸과 같은 .header-actions 자리 — 테마 단추 + ≤780의 ☰ 더보기. 좁은 화면에서는 알약 탭 대신 이 판으로 고른다.
  const tabs = TABS.map(t => tabBtn(t.view, t.label)).join('');
  headerHost.innerHTML = `<a class="brand" href="/v41/" title="러브트리로" aria-label="러브트리로"><span>LoveTree</span><small>4.1</small></a>`
    + `<nav aria-label="관리자 메뉴">${tabs}</nav>`
    + `<div class="header-actions">${themeBtn}<button type="button" class="lt-more" data-admin-more aria-expanded="${moreOpen}" aria-controls="admin-overflow" aria-label="메뉴 더보기">☰</button></div>`
    + `<div id="admin-overflow" class="lt-overflow" role="menu" aria-label="관리자 메뉴"${moreOpen ? '' : ' hidden'}>${tabs}</div>`;
  return '';
}

function renderLogin() {
  const authenticated = session?.ok && session.authenticated;
  if (authenticated) return false;
  host.innerHTML = `${head()}<div class="admin-shell"><section class="admin-card"><div class="admin-card-head"><strong>${session ? '로그인이 필요해요' : '관리자 상태를 확인하지 못했어요'}</strong><span class="admin-note">${session ? 'PADIEM 계정으로 로그인한 뒤 다시 열어 주세요. 관리자 여부는 서버가 확인한 신원으로만 정해집니다.' : '서버에 닿지 못했습니다.'}</span></div><div class="admin-actions"><a class="button primary" href="/auth/login?next=/admin.html">로그인</a><a class="button" href="/v41/">러브트리로 돌아가기</a></div></section></div>`;
  return true;
}

function statusBadge(status, prefix = '') { return `<span class="lt-badge" data-status="${escapeText(status)}">${escapeText(prefix + (STATUS_LABEL[status] || status))}</span>`; }
function kindBadge(kind) { return `<span class="lt-badge" data-kind="${escapeText(kind)}">${escapeText(KIND_LABEL[kind] || kind)}</span>`; }
// #611 3번: 운영센터에서는 AI 고객 이름을 'AI 명예회원' 호칭으로 알린다(2026-11-15 호칭 결정).
function authorLabel(row) { const name = row.authorName || (row.subjectId ? '고객' : '익명'); return row.authorRole === 'ai_customer' ? `AI 명예회원 ${name}` : name; }

async function render() {
  releaseMediaObjectUrls(); // 지난 자세히 판의 사진 미리보기 주소를 거둔다.
  if (renderLogin()) return;
  const authenticated = session?.ok && session.authenticated;
  const admin = authenticated && session.admin;
  if (!admin) {
    // #540 마무리: 권한 없음 화면도 러브트리 안내 모양으로 — 4.0의 연베이지 상자·초록 글씨(storage-notice·notice)를 쓰지 않는다.
    host.innerHTML = `${head()}<div class="admin-shell"><section class="admin-card"><div class="admin-card-head"><strong>운영센터는 관리자 계정만 볼 수 있어요</strong><span class="admin-note">이 계정에는 러브트리 관리자 역할이 없습니다. 관리자 여부는 서버가 확인한 신원으로만 정해집니다.</span></div><div class="admin-actions"><a class="button primary" href="/v41/">러브트리로 돌아가기</a></div></section></div>`;
    return;
  }
  if (route.view === 'overview') { await renderOverview(); return; }
  if (route.view === 'customers') { await renderCustomers(); return; }
  if (route.view === 'customer' && route.id) { await renderCustomerDetail(route.id); return; }
  if (route.view === 'issues') { await renderIssues(); return; }
  if (route.view === 'reports') { await renderReports(); return; }
  if (route.view === 'journals') { await renderJournals(); return; }
  if (route.view === 'feedback' && route.id) { await renderDetail(route.id); return; }
  if (route.view === 'persona' && route.id) { await renderPersona(route.id); return; }
  await renderList();
}

/** #655 '한눈에' 탭 — 이미 있는 탭이 부르는 API만 모아 처리할 일을 숫자로 보여 준다. 서버를 바꾸지 않는다.
 *  하나라도 못 불러오면 그 카드만 '불러오지 못했어요'로 두고 나머지는 그린다. */
async function renderOverview() {
  // #655 2차: 맨 위 전체 숫자는 서버가 집계한다(계정·트리·순간·공개·둘러보기·AI 명예회원).
  // 이 응답이 실패해도 나머지 카드는 그대로 그린다 — 그 줄만 '불러오지 못했어요'.
  const [feedbackRes, journalsRes, reportsRes, statsRes] = await Promise.all([read('/api/admin/feedback'), read('/api/admin/journals'), read('/api/community/admin/reports'), read('/api/admin/stats')]);
  const posts = feedbackRes.ok && Array.isArray(feedbackRes.payload?.feedback) ? feedbackRes.payload.feedback : [];
  // 고치는 일: 고객 글의 연결 이슈 상태만('고치는 일' 탭과 같은 공개 읽기 경로). 하나가 실패해도 나머지 카드는 그린다.
  const numbers = linkedIssueNumbers(posts);
  let issuesOk = true;
  const states = new Map();
  if (numbers.length) {
    const results = await Promise.allSettled(numbers.map(async number => {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${number}`, {headers: {accept: 'application/vnd.github+json'}});
      if (!r.ok) throw new Error(String(r.status));
      const issue = await r.json();
      return issue.pull_request ? null : issue;
    }));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) states.set(numbers[index], result.value.state);
      else if (result.status === 'rejected') issuesOk = false;
    });
  }
  const model = overviewModel({feedback: feedbackRes, journals: journalsRes, reports: reportsRes, issues: {ok: issuesOk, states}});
  const fb = model.feedbackCard, rp = model.reportCard, is = model.issueCard, jr = model.journalCard;
  const card = (value, label, view, status = '', failed = false, unanswered = false) => failed
    ? `<button type="button" class="lt-ov-card" role="button" tabindex="0" disabled><span class="lt-ov-value">—</span><span class="lt-ov-label">${escapeText(label)}</span><span class="lt-ov-fail">불러오지 못했어요</span></button>`
    : `<button type="button" class="lt-ov-card" role="button" tabindex="0" data-ov-view="${escapeText(view)}"${status ? ` data-ov-status="${escapeText(status)}"` : ''}${unanswered ? ' data-ov-unanswered="1"' : ''}><span class="lt-ov-value">${escapeText(value)}</span><span class="lt-ov-label">${escapeText(label)}</span></button>`;
  // 2026-11-17: 처리할 일 카드 세 장 — 할 일·답 안 단 글·신고 대기.
  const cards = [
    card(fb.pending, '할 일', 'board', PENDING_STATUS, Boolean(fb.error)),
    card(fb.unanswered, '답 안 단 글', 'board', '', Boolean(fb.error), true),
    card(rp.pending, '신고 대기', 'reports', PENDING_STATUS, Boolean(rp.error))
  ].join('');
  const journalSection = jr.error
    ? `<section class="lt-card"><h2 class="lt-h2">사용 일지</h2><p class="lt-empty">불러오지 못했어요</p></section>`
    : `<section class="lt-card"><h2 class="lt-h2">사용 일지 · 고객별 최근 기록</h2><div class="lt-post-list">${jr.rows.length ? jr.rows.map(row => `<button type="button" class="lt-post lt-post-row" data-ov-view="journals"><span class="lt-post-title">${escapeText(row.name)}</span><span class="lt-post-meta">최근 ${escapeText(row.lastDay || '—')}</span>${row.latestScore == null ? '<span class="lt-badge">점수 없음</span>' : `<span class="lt-badge">다시 올 ${escapeText(row.latestScore)}점</span>`}</button>`).join('') : '<p class="lt-empty">아직 사용 일지가 없습니다.</p>'}</div></section>`;
  const todosBlock = fb.error
    ? '<p class="lt-empty">불러오지 못했어요</p>'
    : (model.todos.length
        ? model.todos.map(row => `<article class="lt-post lt-post-row" data-open="${escapeText(row.id)}" tabindex="0" role="button"><span class="lt-post-title">${escapeText(row.title)}</span>${row.issueNumber ? `<span class="lt-post-issue">이슈 ${issueLink(row.issueNumber)}</span>` : '<span class="lt-post-issue"></span>'}<span class="lt-post-date">${escapeText(formatTime(row.createdAt))}</span></article>`).join('')
        : '<p class="lt-empty">답을 기다리는 글이 없습니다.</p>');
  const statModel = statsCards(statsRes);
  // 전체 숫자 줄(#655 2차). '실제 사용자'를 크게, 'AI 명예회원'·'시험 계정'을 작게 나란히 적는다(#671).
  // #743: 카드마다 큰 숫자가 무엇을 세는지 카드 안에 적고('실제 고객'), 전체 = 실제+AI+시험을 함께 적어
  // 숫자가 서로 어긋나 보이지 않게 한다. 누르면 그 갈래 수(과 트리 계열은 제목 목록)를 카드 아래에 펼친다.
  const statSplit = (item) => `<ul class="lt-stat-split"><li>실제 고객 <b>${escapeText(item.real)}</b></li><li>AI 명예회원 <b>${escapeText(item.aiTester)}</b></li><li>시험 계정 <b>${escapeText(item.tester)}</b></li></ul>`;
  const statDetail = (item) => {
    const hasTitles = Array.isArray(item.titles);
    const titles = hasTitles && item.titles.length
      ? `<p class="lt-stat-note">제목 (최대 20)</p><ul class="lt-stat-titles">${item.titles.map((title) => `<li>${escapeText(title)}</li>`).join('')}</ul>`
      : (hasTitles ? '<p class="lt-stat-note">아직 없습니다.</p>' : '');
    return `<div class="lt-stat-detail" id="stat-detail-${escapeText(item.key)}" hidden>${statSplit(item)}${titles}</div>`;
  };
  const statCell = (item) => item.error
    ? `<div class="lt-stat-cell"><button type="button" class="lt-stat" role="button" tabindex="0" disabled><span class="lt-stat-value">—</span><span class="lt-stat-label">${escapeText(item.label)}</span><span class="lt-stat-fail">불러오지 못했어요</span></button></div>`
    : `<div class="lt-stat-cell"><button type="button" class="lt-stat" role="button" tabindex="0" data-stat-toggle="${escapeText(item.key)}" aria-expanded="false" aria-controls="stat-detail-${escapeText(item.key)}"><span class="lt-stat-value">${escapeText(item.real)}</span><span class="lt-stat-label">${escapeText(item.label)}</span><span class="lt-stat-mean">실제 고객</span><span class="lt-stat-others">전체 ${escapeText(item.total)} · AI ${escapeText(item.aiTester)} · 시험 ${escapeText(item.tester)}</span></button>${statDetail(item)}</div>`;
  // 두 묶음 사이에 작은 제목을 단다: '전체 숫자'(계정·트리·순간…) / '처리할 일'(고객 글·신고·이슈).
  const statsRow = statModel.error
    ? '<section class="lt-ov-section"><h2 class="lt-ov-heading">전체 숫자</h2><div class="lt-stats" aria-label="전체 숫자"><p class="lt-empty">불러오지 못했어요</p></div></section>'
    : `<section class="lt-ov-section"><h2 class="lt-ov-heading">전체 숫자</h2><div class="lt-stats" role="group" aria-label="전체 숫자 · 실제 고객 / AI 명예회원 / 시험 계정">${statModel.cards.map(statCell).join('')}</div></section>`;
  const todoCards = `<section class="lt-ov-section"><h2 class="lt-ov-heading">처리할 일</h2><div class="lt-ov-cards" role="group" aria-label="처리할 일 숫자">${cards}</div></section>`;
  host.innerHTML = `${head()}<div class="admin-shell lt-board is-overview">
    <div class="lt-board-head"><h1 class="lt-h1">한눈에</h1><p class="lt-sub">지금 쌓인 처리할 일 · 숫자를 누르면 그 탭이 그 조건으로 열리고, 탭이 없는 숫자는 내역이 펼쳐집니다</p></div>
    ${statsRow}
    ${todoCards}
    ${journalSection}
    <section class="lt-card"><h2 class="lt-h2">오늘 할 일 · 답 안 단 글 오래된 순</h2><div class="lt-post-list">${todosBlock}</div></section>
  </div>`;
}

// ---- 운영센터 고객 정보(261116 대표 결정: 운영진은 고객 정보를 다 본다) ----
// 읽기만 한다 — 고치거나 지우는 단추는 두지 않는다. subject 원문은 화면 글자에 내지 않고
// 가린 id만 보인다(서버가 가린 id만 내려 준다). 목록 줄에는 줄 번호만 달아 자세히 판으로 이동한다.
let customerCache = [];   // 목록 응답 원본(자세히 판 이동에 쓴다) — 줄 번호 → subject.
let mediaObjectUrls = []; // 자세히 판에서 만든 사진 미리보기 주소 — 다시 그릴 때 거둔다.

function releaseMediaObjectUrls() {
  while (mediaObjectUrls.length) URL.revokeObjectURL(mediaObjectUrls.pop());
}

/** 자세히 판의 사진 미리보기 — 관리자 인증으로만 내려받는 경로를 fetch로 받아 임시 주소로 보인다.
 *  <img src>에 서버 경로를 직접 쓰지 않는다(주소 칸에 subject 원문이 노출되는 일을 줄인다). */
async function loadCustomerMedia(root) {
  for (const img of root.querySelectorAll('img[data-media-path]')) {
    try {
      const res = await fetch(img.dataset.mediaPath, {credentials: 'same-origin', headers: {accept: 'image/*,video/*'}});
      const type = String(res.headers.get('content-type') || '');
      // 서버가 사진·영상이 아닌 것을 주면(로그인 풀림·오류 JSON 등) 그림 칸을 깨뜨리지 않고 '못 불러옴'으로 둔다.
      if (!res.ok || !/^(?:image|video)\//.test(type)) { img.closest('.lt-cust-media-item')?.classList.add('is-failed'); continue; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      mediaObjectUrls.push(url);
      img.src = url;
      img.removeAttribute('data-media-path');
    } catch { img.closest('.lt-cust-media-item')?.classList.add('is-failed'); }
  }
}

async function renderCustomers() {
  const [statsRes, listRes, viewsRes] = await Promise.all([
    read('/api/admin/stats'),
    read('/api/admin/customers'),
    read('/api/admin/customers/views?limit=20')
  ]);
  const summary = customerSummaryCards(statsRes);
  const list = customerRows(listRes);
  const views = customerViewRows(viewsRes);
  customerCache = list.rows;
  const cards = summary.error
    ? '<p class="lt-empty">불러오지 못했어요</p>'
    : `<div class="lt-cust-cards" role="group" aria-label="고객 숫자">${summary.cards.map(c => `<div class="lt-cust-card"><span class="lt-cust-value">${escapeText(c.value)}</span><span class="lt-cust-label">${escapeText(c.label)}</span>${c.detail ? `<span class="lt-cust-detail">${escapeText(c.detail)}</span>` : ''}</div>`).join('')}</div>`;
  const rows = list.error
    ? '<p class="lt-empty">불러오지 못했어요</p>'
    : (list.rows.length
      ? `<div class="lt-cust-head" role="row"><span>고객</span><span>이메일</span><span>구분</span><span>가입</span><span>마지막 로그인</span><span>마지막 활동</span><span>기록</span><span>고객 id</span></div>`
        + list.rows.map((row, index) => `<button type="button" class="lt-cust-row" role="row" tabindex="0" data-cust-index="${index}" data-cust-role="button" aria-label="${escapeText(row.displayName || row.email)} 자세히 보기">
          <span class="lt-cust-name${row.displayName ? ' has-name' : ''}">${escapeText(row.displayName || String(row.email || '').split('@')[0] || '—')}</span>
          <span class="lt-cust-email" data-label="이메일">${escapeText(row.email)}</span>
          <span class="lt-badge" data-role="${escapeText(row.role || 'real')}">${escapeText(row.roleLabel)}</span>
          <span class="lt-cust-time" data-label="가입">${escapeText(formatTime(row.joinedAt))}</span>
          <span class="lt-cust-time" data-label="마지막 로그인">${escapeText(formatTime(row.lastLoginAt))}</span>
          <span class="lt-cust-time" data-label="마지막 활동">${escapeText(formatTime(row.lastActivityAt))}</span>
          <span class="lt-cust-count" data-label="기록">트리 ${escapeText(row.treeCount)} · 순간 ${escapeText(row.momentCount)}</span>
          <span class="lt-cust-id" data-label="고객 id">${escapeText(row.subjectMasked || '—')}</span>
        </button>`).join('')
      : '<p class="lt-empty">아직 로그인한 고객이 없습니다.</p>');
  const viewRows = views.error
    ? '<p class="lt-empty">불러오지 못했어요</p>'
    : (views.rows.length
      ? views.rows.map(row => `<div class="lt-cust-view-row"><span>${escapeText(formatTime(row.viewedAt))}</span><span>관리자 ${escapeText(row.adminMasked || '—')}</span><span>${escapeText(row.customerName || row.customerEmail || '(삭제된 계정)')}</span></div>`).join('')
      : '<p class="lt-empty">아직 열람 기록이 없습니다.</p>');
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">고객</h1><p class="lt-sub">열 때마다 열람 기록이 남아요</p></div>
    ${cards}
    <section class="lt-card"><h2 class="lt-h2">고객 목록</h2><div class="lt-cust-list">${rows}</div></section>
    <section class="lt-card"><h2 class="lt-h2">열람 기록 · 최근 20</h2><p class="lt-sub">누가(관리자)·언제·어느 고객을 열었는지 — 90일 뒤 자동으로 지워진다</p><div class="lt-cust-views">${viewRows}</div></section>
  </div>`;
}

function customerField(label, value) {
  return `<div class="lt-cust-field"><dt>${escapeText(label)}</dt><dd>${value}</dd></div>`;
}

async function renderCustomerDetail(subjectId) {
  const res = await read('/api/admin/customers/' + encodeURIComponent(subjectId));
  if (!res.ok || !res.payload?.ok) {
    const message = res.status === 404 ? '그 고객 계정을 찾을 수 없어요.' : (res.payload?.error?.message || '고객 정보를 불러오지 못했어요.');
    host.innerHTML = `${head()}<div class="admin-shell lt-board"><button type="button" class="lt-back" data-back-customers>← 고객 목록</button><section class="admin-card"><div class="admin-card-head"><strong>${escapeText(message)}</strong></div></section></div>`;
    return;
  }
  const c = customerDetailModel(res);
  if (c.error) { host.innerHTML = `${head()}<div class="admin-shell lt-board"><p class="lt-empty">불러오지 못했어요</p></div>`; return; }
  const field = (label, value) => customerField(label, value);
  const account = `<section class="lt-card"><h2 class="lt-h2">계정 정보</h2><dl class="lt-cust-fields">`
    + field('표시 이름', escapeText(c.displayName || '(없음)'))
    + field('이메일', escapeText(c.email))
    + field('구분', `<span class="lt-badge">${escapeText(c.roleLabel)}</span>`)
    + field('가입일', escapeText(formatTime(c.joinedAt)))
    + field('마지막 로그인', escapeText(formatTime(c.lastLoginAt)))
    + field('마지막 활동', escapeText(formatTime(c.lastActivityAt)))
    + field('만 14세 확인', escapeText(formatTime(c.ageVerifiedAt)))
    + field('고객 id', escapeText(c.subjectMasked || '—'))
    + `</dl></section>`;
  const momentRowHtml = (m) => `<li class="lt-cust-moment">
    <div class="lt-cust-moment-top"><strong>${escapeText(m.title || '(제목 없음)')}</strong><time>${escapeText(m.date || '—')}</time>${m.emotion ? `<span class="lt-badge" data-emotion="${escapeText(m.emotion)}">${escapeText(m.emotion)}</span>` : ''}</div>
    ${m.keywords.length ? `<div class="lt-cust-tags">${m.keywords.map(k => `<span class="lt-cust-tag">${escapeText(k)}</span>`).join('')}</div>` : ''}
    ${m.url ? (m.uploaded
      ? '<span class="lt-cust-url">올린 파일 — 아래 사진·영상 목록에 있습니다</span>'
      : `<a class="lt-cust-url" href="${escapeText(m.url)}" target="_blank" rel="noopener noreferrer no-referrer">영상 주소</a>`) : ''}
    ${m.note ? `<p class="lt-cust-note">${richParagraph(m.note)}</p>` : ''}
  </li>`;
  const trees = c.trees.length
    ? c.trees.map(tree => `<section class="lt-cust-tree"><div class="lt-cust-tree-head"><h3>${escapeText(tree.title || '(제목 없음)')}</h3><span class="lt-badge" data-visibility="${escapeText(tree.visibility)}">${escapeText(tree.visibility)}</span><span class="lt-cust-count">순간 ${escapeText(tree.moments.length)}</span></div>${tree.moments.length ? `<ul class="lt-cust-moments">${tree.moments.map(momentRowHtml).join('')}</ul>` : '<p class="lt-empty">빈 트리입니다.</p>'}</section>`).join('')
    : '<p class="lt-empty">아직 트리가 없습니다.</p>';
  const mediaItems = c.media.length
    ? c.media.map(item => item.mime.startsWith('video/')
      ? `<div class="lt-cust-media-item is-video"><span class="lt-cust-media-name">${escapeText(item.name)}</span><span class="lt-cust-media-meta">영상 · ${escapeText(formatTime(item.createdAt))}</span></div>`
      : `<figure class="lt-cust-media-item"><img data-media-path="${escapeText(item.path)}" alt="${escapeText(item.name)} 올린 사진" loading="lazy"><figcaption>${escapeText(formatTime(item.createdAt))}</figcaption></figure>`).join('')
    : '<p class="lt-empty">올린 사진·영상이 없습니다.</p>';
  const feedbackRows = c.feedback.length
    ? c.feedback.map(row => `<article class="lt-post">
        <div class="lt-post-top">${kindBadge(row.kind)}${statusBadge(row.status)}${row.score ? `<span class="lt-badge">점수 ${escapeText(row.score)}</span>` : ''}${row.journalDate ? `<span class="lt-badge">${escapeText(row.journalDate)}</span>` : ''}<span class="lt-post-date">${escapeText(formatTime(row.createdAt))}</span></div>
        <h3 class="lt-post-title">${escapeText(row.displayTitle || '(제목 없음)')}</h3>
        <div class="lt-body">${richParagraph(row.body)}</div>
        <div class="lt-post-meta"><a href="#feedback/${encodeURIComponent(String(row.id))}">전체 글·답글 보기</a><span>답글 ${escapeText(row.replyCount)}</span></div>
      </article>`).join('')
    : '<p class="lt-empty">보낸 의견·일지가 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <button type="button" class="lt-back" data-back-customers>← 고객 목록</button>
    <div class="lt-board-head"><h1 class="lt-h1">${escapeText(c.displayName || c.email)}</h1><p class="lt-sub">열 때마다 열람 기록이 남아요</p></div>
    ${account}
    <section class="lt-card"><h2 class="lt-h2">트리 · 순간(공개·비공개 모두)</h2>${trees}</section>
    <section class="lt-card"><h2 class="lt-h2">올린 사진 · 영상</h2><p class="lt-sub">관리자 인증으로만 내려받습니다</p><div class="lt-cust-media">${mediaItems}</div></section>
    <section class="lt-card"><h2 class="lt-h2">의견 · 일지 본문</h2><div class="lt-post-list">${feedbackRows}</div></section>
  </div>`;
  await loadCustomerMedia(host);
}

async function renderList() {
  // 탭 숫자를 함께 보여 주려고 목록을 거르지 않고 한 번에 읽어 화면에서 거른다(#570 2). 목록은 작다.
  // 2026-11-17: 둘러보기 신고도 같은 카드 모양으로 섞어 보여 준다(처리 단추는 신고 탭의 것 그대로).
  const [res, reportsRes] = await Promise.all([read('/api/admin/feedback'), read('/api/community/admin/reports')]);
  const posts = res.ok && Array.isArray(res.payload?.feedback) ? res.payload.feedback : [];
  const reports = reportsRes.ok && Array.isArray(reportsRes.payload?.reports) ? reportsRes.payload.reports : [];
  const reportRows = reports.map(report => ({
    id: `report:${report.id}`, reportId: report.id, kind: 'report', report,
    status: report.status === 'open' ? 'reviewing' : report.status === 'resolved' ? 'fixed' : 'closed',
    displayTitle: String(report.reason || '').slice(0, 90) || '신고', createdAt: report.createdAt, replyCount: 0
  }));
  const rows = [...posts, ...reportRows];
  const activeStatus = route.status || PENDING_STATUS;
  const visible = filterBoardRows(rows, {kind: route.kind, status: activeStatus});
  const tabBtn = (data, value, label, count, active) =>
    `<button type="button" ${data}="${escapeText(value)}" class="lt-tab${active ? ' is-active' : ''}" aria-label="${escapeText(label)} ${count}건">${escapeText(label)} <span class="lt-tab-count">${count}</span></button>`;
  const kindRow = boardKindTabs(rows, activeStatus)
    .map(t => tabBtn('data-kind-tab', t.key, t.label, t.count, route.kind === t.key)).join('');
  // 숫자 0인 상태 칸은 숨긴다.
  const statusRow = boardStatusTabs(rows, route.kind)
    .filter(t => t.count > 0)
    .map(t => tabBtn('data-status-tab', t.key, t.label, t.count, activeStatus === t.key)).join('');
  const list = visible.length
    ? visible.map(row => row.kind === 'report' ? reportCard(row.report) : `<article class="lt-post" data-open="${escapeText(row.id)}" tabindex="0" role="button">
        <div class="lt-post-top">${kindBadge(row.kind)}${statusBadge(row.status)}${row.kind === 'journal' && row.score ? `<span class="lt-badge">점수 ${escapeText(row.score)}</span>` : ''}${row.kind === 'journal' && row.journalDate ? `<span class="lt-badge">${escapeText(row.journalDate)}</span>` : ''}<span class="lt-post-date">${escapeText(formatTime(row.createdAt))}</span></div>
        <h3 class="lt-post-title">${escapeText(row.displayTitle || '(제목 없음)')}</h3>
        <div class="lt-post-meta"><span class="lt-post-author" data-author="${escapeText(row.subjectId || '')}">${escapeText(authorLabel(row))}</span>${issueLink(row.issueNumber) ? `<span class="lt-post-issue">이슈 ${issueLink(row.issueNumber)}</span>` : ''}<span>답글 ${row.replyCount || 0}</span></div>
      </article>`).join('')
    : '<p class="lt-empty">지금 조건에 맞는 글이 없습니다.</p>';
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head lt-board-head--filters">
      <h1 class="lt-h1">고객 글 <small>${visible.length}건 · 최신 순</small></h1>
      <div class="lt-kind-bundle" role="group" aria-label="종류">${kindRow}</div>
    </div>
    <div class="lt-tabs lt-status-row" role="group" aria-label="상태">${statusRow}</div>
    ${route.unanswered ? '<p class="lt-post-meta">답글 0인 글만 보는 중 · <button type="button" class="lt-btn" data-clear-filter="board">조건 지우기</button></p>' : ''}
    <div class="lt-post-list">${list}</div>
  </div>`;
}

/** 신고 카드 — 고객 글과 같은 .lt-post 모양에 신고 탭의 처리 단추를 그대로 둔다. */
function reportCard(report) {
  const stateLabel = report.status === 'open' ? '검토 대기' : report.status === 'resolved' ? '처리 완료' : '기각';
  const visibility = report.hidden ? '발견 숨김' : '발견 노출';
  const hide = report.hidden ? 'disabled' : '';
  const restore = !report.hidden && report.status === 'dismissed' ? 'disabled' : '';
  return `<article class="lt-post lt-report-card" data-report="${escapeText(report.id)}">
    <div class="lt-post-top">${kindBadge('report')}<span class="lt-badge">${escapeText(stateLabel)}</span><span class="lt-badge">${escapeText(visibility)}</span><span class="lt-post-date">${escapeText(formatTime(report.createdAt))}</span></div>
    <h3 class="lt-post-title">${escapeText(String(report.reason || '').slice(0, 90) || '신고')}</h3>
    <div class="lt-post-meta">공유 ${escapeText(report.shareId)}</div>
    <div class="lt-actions">
      <button type="button" class="lt-btn" data-report-act="hide" data-id="${escapeText(report.id)}" ${hide}>검토 완료·발견 숨김</button>
      <button type="button" class="lt-btn" data-report-act="restore" data-id="${escapeText(report.id)}" ${restore}>신고 기각·발견 복구</button>
    </div>
  </article>`;
}

async function renderDetail(id) {
  const res = await read('/api/admin/feedback/' + encodeURIComponent(id));
  const post = res.ok ? res.payload?.feedback : null;
  if (!post) { navigate('board'); return; }
  replyKind = 'internal'; // 글을 다시 열면 내부 메모부터(#564 8).
  const replies = Array.isArray(post.replies) ? post.replies : [];
  const persona = post.persona && post.persona.name ? post.persona : null;
  // #678 후속 B: 고객이 지우거나 고친 덧붙임은 status('deleted')·edited_at(PR A)으로 알린다.
  // 지운 것은 흐리게 '고객이 지움 · 시각', 고친 것은 '고객이 고침 · 시각'을 머리 줄에 붙인다.
  const replyRows = replies.length
    ? replies.map(r => {
        const removed = r.status === 'deleted';
        const stateMark = removed ? ' · 고객이 지움' : (r.editedAt ? ' · 고객이 고침' : '');
        const stateTime = stateMark ? formatTime(r.editedAt || r.createdAt) : formatTime(r.createdAt);
        return `<div class="lt-reply${removed ? ' is-deleted' : ''}" data-type="${r.authorType}"><div class="lt-reply-head"><span>${r.fromCustomer ? '고객 덧붙임' : (r.authorType === 'customer' ? '고객 답변' : '내부 메모')}${stateMark}</span><span>${escapeText(stateTime)}</span></div><p>${richParagraph(r.body)}</p></div>`;
      }).join('')
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
  // #743: '한눈에'의 신고 대기 카드가 #reports?status=open 으로 열면 검토 대기만 보여 준다.
  const shown = route.status ? reports.filter(report => report?.status === route.status) : reports;
  const rows = shown.length
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
    <div class="lt-board-head"><h1 class="lt-h1">발견·커뮤니티 신고 검토</h1><p class="lt-sub">신고 ${shown.length}건 · 자동 숨김 없이 관리자가 명시적으로 처리합니다.</p></div>
    ${route.status ? '<p class="lt-post-meta">검토 대기만 보는 중 · <button type="button" class="lt-btn" data-clear-filter="reports">조건 지우기</button></p>' : ''}
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
    // 번호가 PR을 가리켜도 그대로 돌려준다 — 줄에서 'PR #번호 · 제목'으로 보여 준다(대표 요청 2026-11-16,
    // '#637 (이슈를 불러오지 못했어요)'처럼 PR을 못 부른 것처럼 보이지 않게).
    const results = await Promise.allSettled(numbers.map(async number => {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${number}`, {headers: {accept: 'application/vnd.github+json'}});
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    }));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) byNumber.set(numbers[index], result.value);
      else if (result.status === 'rejected') error = '이슈 상태를 불러오지 못했어요';
    });
  }
  // #743: '한눈에'의 열린/닫힌 이슈 카드가 #issues?status=open|closed 로 열면 그 상태만 보여 준다.
  // PR은 이슈 상태 거름이 아니므로 거름에 넣지 않는다(둘 다 열리지 않은 것처럼 숨기지 않고 그대로 보인다).
  const shown = route.status ? numbers.filter(number => { const row = byNumber.get(number); return row && !row.pull_request && row.state === route.status; }) : numbers;
  const rows = shown.map(number => {
    const issue = byNumber.get(number);
    // #636: 저장된 값에 앞의 '#'이 붙어 있을 수 있다 — 읽는 쪽은 숫자로 맞춰 비교한다.
    const linked = posts.filter(post => normalizeIssueNumber(post.issueNumber) === String(number));
    const isPr = Boolean(issue?.pull_request);
    const stateLabel = issue && !isPr ? issueStateLabel(issue.state) : '';
    const issueTitle = issue ? (isPr ? `PR #${number} · ${issue.title}` : issue.title) : '(이슈를 불러오지 못했어요)';
    const postRows = linked.map(post => {
      // 이슈가 닫혔는데 고객 글이 아직 '고침'이 아니면 바꾸는 단추를 내놓는다. 누르기 전까지는 자동으로 바꾸지 않는다(#570 4).
      const fixBtn = needsFixButton(post, issue?.state)
        ? `<button type="button" class="lt-btn lt-fix-btn" data-fix-status="${escapeText(post.id)}">고침으로 바꾸기</button>` : '';
      // 고객 글 상태 칩에는 '고객에게:' 머리를 붙인다(대표 요청 2026-11-16) — 이슈 상태 칩('이슈 열림/이슈 닫힘')과
      // 같은 말이 반복되어 보이지 않게. 다른 탭의 상태 이름(새 글·확인 중·고침…)은 그대로 쓴다.
      return `<article class="lt-post lt-post-row lt-issue-post" data-open="${escapeText(post.id)}" tabindex="0" role="button"><span class="lt-post-title">${escapeText(post.displayTitle || '(제목 없음)')}</span>${statusBadge(post.status, '고객에게: ')}${fixBtn}</article>`;
    }).join('');
    return `<section class="lt-card lt-issue-row" data-issue-row="${number}">
      <div class="lt-issue-head"><a class="lt-issue-link" href="https://github.com/${GITHUB_REPO}/${isPr ? 'pull' : 'issues'}/${number}" target="_blank" rel="noopener">#${number}</a><span class="lt-issue-title">${escapeText(issueTitle)}</span>${stateLabel ? `<span class="lt-badge" data-issue-state="${escapeText(issue.state)}">${stateLabel}</span>` : ''}</div>
      <div class="lt-post-list">${postRows}</div>
    </section>`;
  }).join('');
  host.innerHTML = `${head()}<div class="admin-shell lt-board">
    <div class="lt-board-head"><h1 class="lt-h1">고치는 일</h1><p class="lt-sub">고객 글과 연결된 이슈만 · 공개 저장소 읽기만</p></div>
    ${route.status ? `<p class="lt-post-meta">${route.status === 'open' ? '열린' : '닫힌'} 이슈만 보는 중 · <button type="button" class="lt-btn" data-clear-filter="issues">조건 지우기</button></p>` : ''}
    ${error ? `<p class="lt-empty" data-issue-error>${escapeText(error)}</p>` : ''}
    ${rows || '<p class="lt-empty">고객 글에 연결된 이슈가 없습니다.</p>'}
  </div>`;
}

// ---- events (delegated) ----
document.addEventListener('click', async (event) => {
  // ☰ 더보기(≤780) — 셸의 #mobile-more와 같은 규칙. 판 밖을 누르면 닫는다.
  const moreBtn = event.target.closest('[data-admin-more]');
  if (moreBtn) { moreOpen = !moreOpen; head(); return; }
  if (moreOpen && !event.target.closest('#admin-overflow')) { moreOpen = false; head(); }
  const themeBtn = event.target.closest('[data-lt-theme-toggle]');
  if (themeBtn) {
    // 본 사이트와 같은 한 벌(저장 키 lt41.theme) — 누르면 밤↔정원을 저장하고 속성·단추 문구를 다시 칠한다.
    const theme = writeTheme(localStorage, nextTheme(readTheme(localStorage)));
    applyThemeAttribute(document.documentElement, theme);
    render();
    return;
  }
  const reportAct = event.target.closest('[data-report-act]');
  if (reportAct) {
    const hide = reportAct.dataset.reportAct === 'hide';
    const res = await read('/api/community/admin/reports/' + encodeURIComponent(reportAct.dataset.id), {method: 'PATCH', body: JSON.stringify({status: hide ? 'resolved' : 'dismissed', visibility: hide ? 'hidden' : 'visible'})});
    if (res.ok) await render(); // 신고 카드는 고객 글 목록에 있으므로 목록을 다시 그린다.
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) { moreOpen = false; navigate(tab.dataset.tab); return; }
  // #655: '한눈에' 카드 — 그 조건이 열린 탭 주소로 이동한다(예: #board?status=pending).
  // #743: 답글 0·신고 대기·열린/닫힌 이슈도 조건을 주소로 남겨 그 탭을 걸러 연다.
  const ovCard = event.target.closest('[data-ov-view]');
  if (ovCard) {
    const view = ovCard.dataset.ovView;
    navigate(view, null, {status: ovCard.dataset.ovStatus || '', kind: '', unanswered: ovCard.dataset.ovUnanswered === '1'});
    return;
  }
  // #743: 갈 탭이 없는 카드(계정·트리·순간…)는 카드 아래 내역을 펼친다(다시 누르면 접힘).
  const statToggle = event.target.closest('[data-stat-toggle]');
  if (statToggle) {
    const key = statToggle.dataset.statToggle;
    const detail = document.getElementById('stat-detail-' + key);
    if (detail) {
      const open = detail.hidden;
      detail.hidden = !open;
      statToggle.setAttribute('aria-expanded', String(open));
      statToggle.classList.toggle('is-open', open);
    }
    return;
  }
  // #743: 걸러 본 탭에서 조건을 지운다(신고·고치는 일).
  const clearFilter = event.target.closest('[data-clear-filter]');
  if (clearFilter) { navigate(clearFilter.dataset.clearFilter, null, {}); return; }
  // 탭 거르기(#570 2): 다시 누르면 해제한다. 상태는 주소(#board?status=..&kind=..)에 남는다.
  const statusTab = event.target.closest('[data-status-tab]');
  if (statusTab) {
    // 고른 칩을 다시 누르면 조건을 푼다(status=all — 칸 없는 값이라 종류의 모든 글이 보인다).
    const active = route.status || PENDING_STATUS;
    const next = active === statusTab.dataset.statusTab ? ALL_STATUS : statusTab.dataset.statusTab;
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
    if (res.ok) await render();
    return;
  }
  const open = event.target.closest('[data-open]');
  if (open && !event.target.closest('[data-persona]')) { navigate('feedback', open.dataset.open); return; }
  // #596: 고객 줄을 누르면 그 고객 일지를 날짜 내림차순으로 펼쳐 읽는다. 본문 줄바꿈 유지, 그날 의견 링크.
  // 운영센터 고객 정보(261116): 목록 줄 → 자세히 판. 줄에 subject 원문을 달지 않고 목록 순서로 찾는다.
  const custRow = event.target.closest('[data-cust-index]');
  if (custRow) {
    const entry = customerCache[Number(custRow.dataset.custIndex)];
    if (entry?.subjectId) navigate('customer', entry.subjectId);
    return;
  }
  if (event.target.closest('[data-back-customers]')) { navigate('customers'); return; }
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
    // #636: 저장은 숫자만 — 앞의 '#'은 화면 표시일 뿐이다.
    const issue = normalizeIssueNumber(document.querySelector('[data-issue]')?.value || '');
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
  if (event.key === 'Escape' && moreOpen) { moreOpen = false; head(); return; }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open][role="button"]')) {
    event.preventDefault();
    navigate('feedback', event.target.dataset.open);
  }
});

// 주소가 바뀌면(뒤로 가기·앞으로 가기·직접 수정) 그 주소의 화면을 다시 그린다(#564 2).
window.addEventListener('hashchange', () => { route = parseHash(location.hash); render(); });

await render();


