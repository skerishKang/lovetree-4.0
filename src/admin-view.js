/**
 * 운영센터 화면의 순수 조각(#564). DOM·가져오기 없이 node 시험에서 바로 쓴다.
 * - 주소(해시) ↔ 화면 상태: #board · #feedback/<id> · #persona/<id> · #reports · #issues
 * - 날짜 '11.14 06:31'(지역 시간, 초 없음)
 * - 답글 줄바꿈(이스케이프 유지)
 * - GitHub 이슈 새 글 주소(개인정보 없이)
 * - '닫음'(closed) 상태: 목록 기본에서는 제외
 * - 탭 거르기(#570): 상태·종류 탭 숫자 계산과 주소(#board?status=..&kind=..) 왕복
 * - '고치는 일' 탭(#570): 고객 글에 연결된 이슈만, open/closed를 '고치는 중/고침 완료'로
 */

export const KIND_LABEL = {opinion: '의견', journal: '일지'};
// '받음'은 운영센터에서 '새 글'로 부른다(#570 2). 서버 값 received 는 그대로고, 고객 쪽 표시는 따로 있다.
export const STATUS_LABEL = {received: '새 글', reviewing: '확인 중', fixed: '고침', later: '다음에', closed: '닫음'};
export const STATUS_ORDER = ['received', 'reviewing', 'fixed', 'later', 'closed'];
export const PERSONA_FIELDS = [
  ['who', '누구'], ['why', '왜 쓰나'], ['how', '쓰는 모습'], ['habits', '자주 쓰는 곳·익숙한 디자인'], ['satisfied', '만족한 점'], ['disappointed', '실망한 점'], ['now', '지금 상태']
];
export const GITHUB_REPO = 'skerishKang/lovetree-4.0';

export const escapeText = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

/** 본문·답글 공용: 이스케이프한 뒤 줄바꿈을 <br>로 살린다(#564 11). */
export function richParagraph(value) {
  return escapeText(value).replace(/\r\n|\n|\r/g, '<br>');
}

const pad2 = (n) => String(n).padStart(2, '0');

/** '11.14 06:31' — 지역 시간, 초는 보이지 않는다(#564 5). */
export function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getMonth() + 1)}.${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 주소 해시를 화면 상태로. 모르는 모양은 목록으로 돌린다. 탭 거르기는 #board?status=..&kind=.. 로 남긴다(#570 2). */
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const [name, ...rest] = path.split('/');
  const id = decodeURIComponent(rest.join('/') || '');
  const status = STATUS_ORDER.includes(params.get('status')) ? params.get('status') : '';
  const kind = params.get('kind') in KIND_LABEL ? params.get('kind') : '';
  if (name === 'feedback' && id) return {view: 'feedback', id, status: '', kind: ''};
  if (name === 'persona' && id) return {view: 'persona', id, status: '', kind: ''};
  if (name === 'journals') return {view: 'journals', id: null, status: '', kind: ''};
  if (name === 'reports') return {view: 'reports', id: null, status: '', kind: ''};
  if (name === 'issues') return {view: 'issues', id: null, status: '', kind: ''};
  return {view: 'board', id: null, status, kind};
}

/** 화면 상태를 주소 해시로. 탭 거르기는 #board 물음표 뒤에 남긴다(#570 2). */
export function viewHash(view, id = null, filters = {}) {
  if (view === 'board') {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', String(filters.status));
    if (filters.kind) params.set('kind', String(filters.kind));
    const query = params.toString();
    return query ? `#board?${query}` : '#board';
  }
  if (view === 'feedback' && id != null) return '#feedback/' + encodeURIComponent(id);
  if (view === 'persona' && id != null) return '#persona/' + encodeURIComponent(id);
  if (view === 'journals') return '#journals';
  if (view === 'reports') return '#reports';
  if (view === 'issues') return '#issues';
  return '#board';
}

/** 머리줄 탭 표시용: 글·페르소나 화면은 게시판 탭이 눌려 있다. */
/** 탭: 고객 글 · 사용 일지(#596) · 신고 · 고치는 일. 나머지 화면(상세·페르소나)은 고객 글 탭 소속으로 본다. */
export function viewToTab(view) {
  return view === 'reports' || view === 'issues' || view === 'journals' ? view : 'board';
}

/** 탭 거르기(#570 2). 상태 탭을 고르면 그 상태만(닫음 포함), 고르지 않으면 '닫음'을 뺀 전체. 종류 탭도 같은 식. */
export function filterRows(rows, {kind = '', status = ''} = {}) {
  let list = Array.isArray(rows) ? rows : [];
  if (kind) list = list.filter(row => row?.kind === kind);
  if (status) list = list.filter(row => row?.status === status);
  else list = list.filter(row => row?.status !== 'closed');
  return list;
}

/** 상태 탭 줄(#570 2). 숫자는 종류 탭이 반영된 목록에서 센다. '닫음'은 숫자를 보이지 않는다. */
export function statusTabs(rows, kind = '') {
  const base = Array.isArray(rows) ? rows : [];
  const scoped = kind ? base.filter(row => row?.kind === kind) : base;
  return STATUS_ORDER.map(status => ({
    status,
    label: STATUS_LABEL[status],
    count: status === 'closed' ? null : scoped.filter(row => row?.status === status).length
  }));
}

/** 종류 탭 줄(#570 2). 숫자는 상태 탭이 반영된 목록에서 센다 — 상태를 고르지 않으면 '닫음'을 뺀 기본 화면의 숫자다. */
export function kindTabs(rows, status = '') {
  const base = Array.isArray(rows) ? rows : [];
  const scoped = status ? base.filter(row => row?.status === status) : base.filter(row => row?.status !== 'closed');
  return [
    {kind: '', label: '전체', count: scoped.length},
    ...Object.keys(KIND_LABEL).map(kind => ({kind, label: KIND_LABEL[kind], count: scoped.filter(row => row?.kind === kind).length}))
  ];
}

/** 받침이 있으면 '으로', 없으면 '로'(ㄹ 받침은 '로'). 상태 알림 문구에 쓴다. */
export function josaRo(word) {
  const last = String(word ?? '').slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8 ? '로' : '으로';
  }
  return '로';
}

/** 상태를 바꾼 뒤의 한 줄(#564 6). */
export function statusChangeMessage(status) {
  const label = STATUS_LABEL[status] || status;
  return `상태를 '${label}'${josaRo(label)} 바꿨어요`;
}

/** GitHub 이슈 새 글 주소. 제목·본문만 넣고 계정·트리 정보는 넣지 않는다(#564 4). */
export function buildIssueUrl({title, body} = {}) {
  const params = new URLSearchParams();
  params.set('title', String(title ?? ''));
  params.set('body', String(body ?? ''));
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
}

/** 연결 이슈 번호를 GitHub 이슈 링크로(#564 14). 숫자가 아니면 링크를 만들지 않는다. */
export function issueLink(issueNumber) {
  const raw = String(issueNumber ?? '').trim();
  if (!/^\d+$/.test(raw)) return '';
  return `<a class="lt-issue-link" href="https://github.com/${GITHUB_REPO}/issues/${raw}" target="_blank" rel="noopener">#${escapeText(raw)}</a>`;
}

/** 고객 글의 '연결 이슈 번호'에 있는 이슈만 추려 번호 내림차순으로(#570 4). 개발 이슈 전체는 보지 않는다. */
export function linkedIssueNumbers(rows) {
  const numbers = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const raw = String(row?.issueNumber ?? '').trim();
    if (/^\d+$/.test(raw)) numbers.add(Number(raw));
  }
  return [...numbers].sort((a, b) => b - a);
}

/** GitHub open/closed를 '고치는 중/고침 완료'로 바꿔 쓴다(#570 4). */
export function issueStateLabel(state) {
  return state === 'open' ? '고치는 중' : state === 'closed' ? '고침 완료' : '';
}

/** 고침 완료 이슈에 연결됐지만 아직 '고침'이 아닌 고객 글에만 [고침으로 바꾸기]를 보여 준다(#570 4). 자동으로 바꾸지 않는다. */
export function needsFixButton(post, issueState) {
  return Boolean(post) && issueState === 'closed' && post.status !== 'fixed';
}

// ── 사용 일지 탭(#596) — 날짜·고객 묶음·오늘 요약·떠남 위험. 순수 계산(node 시험에서 바로 쓴다). ──

/** 일지의 날짜(운영 기준 journal_date, 비어 있으면 만든 날짜). */
const journalDayOf = row => String(row?.journalDate || String(row?.createdAt || '').slice(0, 10));

/** 일지 날짜 수로 보는 단계: 1일 '시작', 2~4일 '꾸준', 5일 이상 '정착'. */
export function journalStage(dayCount) {
  return dayCount >= 5 ? '정착' : dayCount >= 2 ? '꾸준' : '시작';
}

/** 고객별 줄(#596): 이름·단계·최근 점수·날짜별 점수 흐름·마지막 기록일. 최근 기록일 내림차순. */
export function journalRowsByCustomer(journals) {
  const map = new Map();
  for (const row of Array.isArray(journals) ? journals : []) {
    const key = row?.subjectId || `anon:${row?.id}`;
    if (!map.has(key)) map.set(key, {subjectId: row?.subjectId || '', name: (row?.authorRole === 'ai_customer' ? 'AI ' : '') + (row?.authorName || '고객'), journals: []});
    map.get(key).journals.push(row);
  }
  const rows = [...map.values()].map(entry => {
    const sorted = entry.journals.slice().sort((a, b) => (journalDayOf(b) + String(b.createdAt || '')).localeCompare(journalDayOf(a) + String(a.createdAt || '')));
    const byDay = new Map();
    for (const row of sorted) if (!byDay.has(journalDayOf(row))) byDay.set(journalDayOf(row), row);
    const days = [...byDay.keys()].sort();
    const lastScore = days.length ? (byDay.get(days[days.length - 1])?.score ?? null) : null;
    const prevScore = days.length >= 2 ? (byDay.get(days[days.length - 2])?.score ?? null) : null;
    return {
      subjectId: entry.subjectId,
      name: entry.name,
      journals: sorted,
      dayCount: days.length,
      stage: journalStage(days.length),
      latestScore: lastScore,
      lastDay: days.length ? days[days.length - 1] : '',
      flow: days.map(day => ({day, score: byDay.get(day)?.score ?? null})),
      atRisk: lastScore != null && prevScore != null && lastScore <= 2 && prevScore <= 2
    };
  });
  return rows.sort((a, b) => String(b.lastDay).localeCompare(String(a.lastDay)));
}

/** 오늘 요약(#596): 활동 고객 수·오늘 일지 수·평균 다시 올 점수·떠남 위험(이틀 연속 2 이하) 수. */
export function journalsSummary(journals, day) {
  const today = Array.isArray(journals) ? journals.filter(row => journalDayOf(row) === day) : [];
  const subjects = new Set(today.map(row => row?.subjectId).filter(Boolean));
  const scores = today.map(row => row?.score).filter(score => score != null);
  const rows = journalRowsByCustomer(journals);
  return {
    activeCustomers: subjects.size,
    journalCount: today.length,
    avgScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10 : null,
    atRisk: rows.filter(row => row.atRisk).length
  };
}
