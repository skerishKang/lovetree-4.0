import './styles.css';
import './admin.css';

/**
 * 관리자 진입·상태 화면 (#67 첫 범위).
 *
 * 서버가 답한 역할 판정만 보여 준다. 회원 기록을 읽거나 지우거나 다른 계정으로
 * 들어가는 자리는 여기 없다 — 그 기능은 이 범위가 아니다.
 * `src/main.js`를 건드리지 않는 별도 진입점이다(컴1과 겹치는 화면 파일을 줄이기 위해).
 */

const text = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const time = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR', { hour12: false });
};

async function read(path) {
  try {
    const response = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    return { status: response.status, payload };
  } catch {
    return { status: 0, payload: null };
  }
}

function card({ title, note, rows = [], actions = '' }) {
  const list = rows.length ? `<dl class="admin-facts">${rows.map(([key, value]) => `<div><dt>${text(key)}</dt><dd>${text(value)}</dd></div>`).join('')}</dl>` : '';
  return `<section class="storage-notice admin-card"><div class="admin-card-head"><strong>${text(title)}</strong>${note ? `<span class="notice">${text(note)}</span>` : ''}</div>${list}${actions ? `<div class="admin-actions">${actions}</div>` : ''}</section>`;
}

function render(host, { session, status, roles, error }) {
  const authenticated = session?.ok && session.authenticated;
  const admin = authenticated && session.admin;
  const head = `<header class="site-header"><a href="/" class="brand">${text('러브트리')}<span class="brand-dot">.</span></a><nav aria-label="주 메뉴"><a href="/">app으로</a></nav></header>`;
  if (!authenticated) {
    host.innerHTML = `${head}<div class="admin-shell">${card({
      title: session ? '로그인이 필요해요' : '관리자 상태를 확인하지 못했어요',
      note: session ? 'PADIEM 계정으로 로그인한 뒤 다시 열어 주세요. 관리자 여부는 서버가 확인한 신원으로만 정해집니다.' : error ?? '서버에 닿지 못했습니다.',
      rows: session ? [['상태 코드', String(status)]] : [],
      actions: '<a class="button primary" href="/auth/login?next=/admin.html">로그인</a>'
    })}</div>`;
    return;
  }
  const rows = [
    ['역할', session.role ?? '없음 (일반 사용자)'],
    ['관리자 진입', admin ? '가능' : '거부됨'],
    ['확인 시각', time(session.checkedAt)]
  ];
  if (admin && roles?.ok) {
    rows.push(['등록된 관리자 수', String(roles.registry?.length ?? 0)], ['마지막 변경', roles.history?.length ? `${roles.history[0].action === 'assign' ? '부여' : '회수'} · ${time(roles.history[0].changedAt)}` : '기록 없음']);
  }
  host.innerHTML = `${head}<div class="admin-shell">${card({
    title: admin ? '관리자 상태' : '일반 사용자 상태',
    note: admin ? '회원 기록 열람·삭제·대행 로그인은 이 화면에 없습니다(첫 범위).' : '이 계정에는 러브트리 관리자 역할이 없습니다.',
    rows
  })}${admin && roles?.ok ? card({
    title: '역할 등록부',
    note: '제품 역할만 표시합니다 — 다른 제품의 권한은 여기로 오지 않습니다.',
    rows: (roles.registry ?? []).flatMap((row, index) => [[`관리자 ${index + 1}`, row.subjectId], ['부여 주체', row.grantedBy ?? '운영 절차']]),
    actions: ''
  }) : ''}</div>`;
}

const host = document.getElementById('main');
const session = await read('/api/admin/session');
const roles = session.payload?.admin ? await read('/api/admin/roles') : null;
render(host, {
  session: session.payload ?? (session.status === 401 ? {} : null),
  status: session.status,
  roles: roles?.payload ?? null,
  error: session.status === 0 ? '서버에 닿지 못했어요.' : null
});


async function communityRequest(path, init = {}) {
  try {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
      ...init
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, payload: null };
  }
}

async function mountCommunityModeration(sessionState) {
  if (!sessionState?.authenticated || !sessionState?.admin) return;
  const shell = document.querySelector('.admin-shell');
  if (!shell) return;
  const section = document.createElement('section');
  section.className = 'storage-notice admin-card admin-community';
  const heading = document.createElement('div');
  heading.className = 'admin-card-head';
  const title = document.createElement('strong');
  title.textContent = '발견·커뮤니티 신고 검토';
  const note = document.createElement('span');
  note.className = 'notice';
  note.textContent = '신고 처리와 발견 목록 숨김·복구를 함께 기록합니다. 공유 주소 자체의 소유자 회수와는 구분됩니다.';
  heading.append(title, note);
  const status = document.createElement('p');
  status.className = 'admin-community-status';
  status.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'admin-report-list';
  section.append(heading, status, list);
  shell.append(section);

  async function act(report, action) {
    const hide = action === 'hide';
    const result = await communityRequest('/api/community/admin/reports/' + encodeURIComponent(report.id), {
      method: 'PATCH',
      body: JSON.stringify({ status: hide ? 'resolved' : 'dismissed', visibility: hide ? 'hidden' : 'visible' })
    });
    status.textContent = result.ok
      ? (hide ? '검토를 완료하고 발견 목록에서 숨겼어요.' : '신고를 기각하고 발견 목록 노출을 복구했어요.')
      : (result.payload?.error?.message || '신고 처리에 실패했어요.');
    if (result.ok) await load();
  }

  function row(report) {
    const article = document.createElement('article');
    article.className = 'admin-report';
    const top = document.createElement('div');
    top.className = 'admin-report-head';
    const state = document.createElement('strong');
    state.textContent = report.status === 'open' ? '검토 대기' : report.status === 'resolved' ? '처리 완료' : '기각';
    const visibility = document.createElement('span');
    visibility.textContent = report.hidden ? '발견 숨김' : '발견 노출';
    top.append(state, visibility);
    const reason = document.createElement('p');
    reason.textContent = report.reason;
    const meta = document.createElement('small');
    meta.textContent = '공유 ' + report.shareId + ' · ' + time(report.createdAt);
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.textContent = '검토 완료·발견 숨김';
    hide.disabled = report.hidden;
    hide.onclick = () => act(report, 'hide');
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = '신고 기각·발견 복구';
    restore.disabled = !report.hidden && report.status === 'dismissed';
    restore.onclick = () => act(report, 'restore');
    actions.append(hide, restore);
    article.append(top, reason, meta, actions);
    return article;
  }

  async function load() {
    status.textContent = '신고를 불러오는 중입니다.';
    const result = await communityRequest('/api/community/admin/reports');
    list.replaceChildren();
    if (!result.ok) {
      status.textContent = result.payload?.error?.message || '신고를 불러오지 못했어요.';
      return;
    }
    const reports = Array.isArray(result.payload?.reports) ? result.payload.reports : [];
    for (const report of reports) list.append(row(report));
    if (!reports.length) {
      const empty = document.createElement('p');
      empty.textContent = '접수된 신고가 없습니다.';
      list.append(empty);
    }
    status.textContent = '신고 ' + reports.length + '건 · 자동 숨김 없이 관리자가 명시적으로 처리합니다.';
  }
  await load();
}

await mountCommunityModeration(session.payload);

const FEEDBACK_CATEGORY_LABEL = { bug: '이상해요', inconvenient: '불편해요', feature: '기능 제안', other: '그 밖에' };
const FEEDBACK_STATUS_LABEL = { received: '받음', reviewing: '확인 중', fixed: '고침', later: '다음에' };

function feedbackIssueBody(row) {
  const ctx = row.context && typeof row.context === 'object' ? row.context : {};
  const env = [
    ctx.viewport ? '화면 ' + ctx.viewport : '',
    ctx.theme ? '테마 ' + ctx.theme : '',
    ctx.version ? '앱 버전 ' + ctx.version : '',
    typeof ctx.loggedIn === 'boolean' ? '로그인 ' + (ctx.loggedIn ? '예' : '아니오') : ''
  ].filter(Boolean).join(' · ');
  return [
    '## 증상',
    String(row.body || ''),
    '',
    '## 화면',
    '- ' + (ctx.screen || '알 수 없음'),
    '',
    '## 환경',
    env ? '- ' + env : '- (표시할 환경 정보 없음)',
    '',
    '> 고객 의견 창구에서 만든 글입니다. 보낸 계정·트리 내용은 넣지 않았습니다.'
  ].join('\n');
}

async function mountFeedback(sessionState) {
  if (!sessionState?.authenticated || !sessionState?.admin) return;
  const shell = document.querySelector('.admin-shell');
  if (!shell) return;

  const section = document.createElement('section');
  section.className = 'storage-notice admin-card admin-feedback';

  const heading = document.createElement('div');
  heading.className = 'admin-card-head';
  const title = document.createElement('strong');
  title.textContent = '고객 의견';
  const note = document.createElement('span');
  note.className = 'notice';
  note.textContent = '사이트 ‘의견 보내기’로 들어온 의견입니다. 상태·메모·연결 이슈 번호를 적고, GitHub 이슈 글을 만들어 씁니다.';
  heading.append(title, note);

  const filters = document.createElement('div');
  filters.className = 'admin-feedback-filters';
  const statusSel = document.createElement('select');
  statusSel.setAttribute('aria-label', '상태 거르기');
  statusSel.append(new Option('상태 전체', ''), ...Object.entries(FEEDBACK_STATUS_LABEL).map(([value, label]) => new Option(label, value)));
  const catSel = document.createElement('select');
  catSel.setAttribute('aria-label', '종류 거르기');
  catSel.append(new Option('종류 전체', ''), ...Object.entries(FEEDBACK_CATEGORY_LABEL).map(([value, label]) => new Option(label, value)));
  filters.append(statusSel, catSel);

  const status = document.createElement('p');
  status.className = 'admin-community-status';
  status.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'admin-report-list';
  section.append(heading, filters, status, list);
  shell.append(section);

  async function act(id, patch, okText) {
    const result = await communityRequest('/api/admin/feedback/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    status.textContent = result.ok ? okText : (result.payload?.error?.message || '변경에 실패했어요.');
    if (result.ok) await load();
    return result.ok;
  }

  function item(row) {
    const article = document.createElement('article');
    article.className = 'admin-report';

    const top = document.createElement('div');
    top.className = 'admin-report-head';
    const state = document.createElement('strong');
    state.textContent = FEEDBACK_STATUS_LABEL[row.status] || row.status;
    const who = document.createElement('span');
    who.textContent = (FEEDBACK_CATEGORY_LABEL[row.category] || row.category) + ' · ' + (row.subjectId ? '회원' : '로그아웃');
    top.append(state, who);

    const body = document.createElement('p');
    body.textContent = row.body;

    const meta = document.createElement('small');
    const ctx = row.context && typeof row.context === 'object' ? row.context : {};
    const envBits = [ctx.screen, ctx.viewport, ctx.theme, ctx.version].filter(Boolean).join(' · ');
    meta.textContent = '#' + row.id + ' · ' + time(row.createdAt) + (envBits ? ' · ' + envBits : '');

    const statusRow = document.createElement('div');
    statusRow.className = 'admin-actions';
    for (const [value, label] of Object.entries(FEEDBACK_STATUS_LABEL)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.disabled = row.status === value;
      button.onclick = () => act(row.id, { status: value }, '상태를 ‘' + label + '’(으)로 바꿨어요.');
      statusRow.append(button);
    }

    const memoLabel = document.createElement('label');
    memoLabel.className = 'admin-feedback-field';
    memoLabel.textContent = '운영 메모';
    const memo = document.createElement('textarea');
    memo.rows = 2;
    memo.value = row.memo || '';
    memo.setAttribute('aria-label', '#' + row.id + ' 운영 메모');
    memoLabel.append(memo);

    const issueLabel = document.createElement('label');
    issueLabel.className = 'admin-feedback-field';
    issueLabel.textContent = '연결 이슈 번호';
    const issue = document.createElement('input');
    issue.value = row.issueNumber || '';
    issue.placeholder = '예: 541';
    issue.setAttribute('aria-label', '#' + row.id + ' 연결 이슈 번호');
    issueLabel.append(issue);

    const saveRow = document.createElement('div');
    saveRow.className = 'admin-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '메모·이슈 저장';
    save.onclick = () => act(row.id, { memo: memo.value, issueNumber: issue.value }, '메모·이슈 번호를 저장했어요.');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'GitHub 이슈 글 만들기';
    copy.onclick = async () => {
      const text = feedbackIssueBody(row);
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = '이슈 본문을 복사했어요. GitHub에 붙여 넣으세요(계정·트리 내용은 빠졌습니다).';
      } catch {
        status.textContent = '복사가 막혔어요. 화면에서 직접 선택해 복사해 주세요.';
      }
    };
    saveRow.append(save, copy);

    article.append(top, body, meta, statusRow, memoLabel, issueLabel, saveRow);
    return article;
  }

  async function load() {
    status.textContent = '의견을 불러오는 중입니다.';
    const result = await communityRequest('/api/admin/feedback?status=' + encodeURIComponent(statusSel.value) + '&category=' + encodeURIComponent(catSel.value));
    list.replaceChildren();
    if (!result.ok) {
      status.textContent = result.payload?.error?.message || '의견을 불러오지 못했어요.';
      return;
    }
    const rows = Array.isArray(result.payload?.feedback) ? result.payload.feedback : [];
    for (const row of rows) list.append(item(row));
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.textContent = '접수된 의견이 없습니다.';
      list.append(empty);
    }
    status.textContent = '의견 ' + rows.length + '건 · 최신 순.';
  }

  statusSel.onchange = load;
  catSel.onchange = load;
  await load();
}

await mountFeedback(session.payload);
