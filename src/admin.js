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
