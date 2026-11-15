/**
 * 운영센터 화면의 순수 조각(#564). DOM·가져오기 없이 node 시험에서 바로 쓴다.
 * - 주소(해시) ↔ 화면 상태: #board · #feedback/<id> · #persona/<id> · #reports · #issues
 * - 날짜 '11.14 06:31'(지역 시간, 초 없음)
 * - 답글 줄바꿈(이스케이프 유지)
 * - GitHub 이슈 새 글 주소(개인정보 없이)
 * - '닫음'(closed) 상태: 목록 기본에서는 제외
 * - 탭 거르기(#570): 상태·종류 탭 숫자 계산과 주소(#board?status=..&kind=..) 왕복
 * - '고치는 일' 탭(#570): 고객 글에 연결된 이슈만, open/closed를 '고치는 중/고침 완료'로
 * - '한눈에' 전체 숫자 카드(#655 2차): 서버 집계 응답을 '실제 사용자 / AI 테스터'로 나눠 보여 준다
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
  // #655: 'pending'은 받음·확인 중을 한 번에 보는 보조 조건이다('한눈에' 카드에서 쓴다).
  const status = [...STATUS_ORDER, PENDING_STATUS].includes(params.get('status')) ? params.get('status') : '';
  const kind = params.get('kind') in KIND_LABEL ? params.get('kind') : '';
  if (name === 'overview') return {view: 'overview', id: null, status: '', kind: ''};
  if (name === 'feedback' && id) return {view: 'feedback', id, status: '', kind: ''};
  if (name === 'persona' && id) return {view: 'persona', id, status: '', kind: ''};
  if (name === 'journals') return {view: 'journals', id: null, status: '', kind: ''};
  if (name === 'reports') return {view: 'reports', id: null, status: '', kind: ''};
  if (name === 'issues') return {view: 'issues', id: null, status: '', kind: ''};
  // #655: 운영센터를 열면(주소 없이) '한눈에'가 기본이다. 기존 주소(#board 등)는 그대로다.
  if (!name) return {view: 'overview', id: null, status: '', kind: ''};
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
  if (view === 'overview') return '#overview';
  return '#board';
}

/** 머리줄 탭 표시용: 글·페르소나 화면은 게시판 탭이 눌려 있다. */
/** 탭: 한눈에(#655) · 고객 글 · 사용 일지(#596) · 신고 · 고치는 일. 나머지 화면(상세·페르소나)은 고객 글 탭 소속으로 본다. */
export function viewToTab(view) {
  return view === 'overview' || view === 'reports' || view === 'issues' || view === 'journals' ? view : 'board';
}

/** 탭 거르기(#570 2). 상태 탭을 고르면 그 상태만(닫음 포함), 고르지 않으면 '닫음'을 뺀 전체. 종류 탭도 같은 식.
 *  #655: 'pending'(처리 대기)은 받음·확인 중을 한 번에 보는 보조 조건이다 — 주소 #board?status=pending. */
export const PENDING_STATUS = 'pending';
export function isPendingStatus(status) {
  return status === 'received' || status === 'reviewing';
}
export function filterRows(rows, {kind = '', status = ''} = {}) {
  let list = Array.isArray(rows) ? rows : [];
  if (kind) list = list.filter(row => row?.kind === kind);
  if (status === PENDING_STATUS) list = list.filter(row => isPendingStatus(row?.status));
  else if (status) list = list.filter(row => row?.status === status);
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

/**
 * 연결 이슈 번호를 숫자 글자로 맞춘다(#636). 앞의 '#'은 뜻이 아니라 표시일 뿐인데, 예전에는 '#'이 붙은 값
 * (`#584`)을 숫자가 아니라고 버려서 운영센터 '고치는 일' 탭이 비어 보였다. 읽는 쪽은 모두 이 함수를 거친다.
 * 숫자로 볼 수 없으면 빈 문자열을 돌려준다(잘못된 값은 조용히 무시).
 */
export function normalizeIssueNumber(value) {
  const raw = String(value ?? '').trim().replace(/^#/, '').trim();
  return /^\d{1,20}$/.test(raw) ? raw : '';
}

/** 연결 이슈 번호를 GitHub 이슈 링크로(#564 14). 숫자가 아니면 링크를 만들지 않는다. */
export function issueLink(issueNumber) {
  const raw = normalizeIssueNumber(issueNumber);
  if (!raw) return '';
  return `<a class="lt-issue-link" href="https://github.com/${GITHUB_REPO}/issues/${raw}" target="_blank" rel="noopener">#${escapeText(raw)}</a>`;
}

/** 고객 글의 '연결 이슈 번호'에 있는 이슈만 추려 번호 내림차순으로(#570 4). 개발 이슈 전체는 보지 않는다. */
export function linkedIssueNumbers(rows) {
  const numbers = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const raw = normalizeIssueNumber(row?.issueNumber);
    if (raw) numbers.add(Number(raw));
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

/** 만든 시각(UTC ISO)을 한국 시각 날짜로 — journal_date가 비어 있을 때의 보조 기준(#627 회차 운영 기준). */
const seoulDayOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul'}).format(d);
};

/** 일지의 날짜(운영 기준 journal_date, 비어 있으면 만든 날짜 — 한국 시각으로 읽는다). */
const journalDayOf = row => String(row?.journalDate || seoulDayOf(row?.createdAt) || String(row?.createdAt || '').slice(0, 10));

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

// ── '한눈에' 탭(#655) — 이미 있는 API의 응답만 모아 처리할 일을 숫자로 낸다(1차). ──

/**
 * '한눈에' 맨 위 전체 숫자 카드(#655 2차). 서버 `/api/admin/stats` 응답({ok, payload:{ok, stats}})만 받는다.
 * 값이 하나라도 이상하면 그 카드만 '불러오지 못했어요'로 두고 나머지는 그린다(숫자를 지어내지 않는다).
 * '실제 사용자'(real)·'AI 테스터'(aiTester)·'시험 계정'(tester)을 카드마다 나눠 보여 준다.
 * 셋은 겹치지 않고 전체 = 셋의 합이다(#671). 시험 계정은 이 화면(운영센터)에서만 보이고 남에게 보이는
 * 공개 화면에는 표시하지 않는다.
 */
export function statsCards(response) {
  const stats = response?.ok && response.payload?.ok ? response.payload.stats : null;
  if (!stats || typeof stats !== 'object') return {error: true, cards: []};
  const cells = [
    ['accounts', '계정', stats.accounts],
    ['accounts-new', '새 계정 · 7일', stats.accounts?.new],
    ['trees', '트리', stats.trees],
    ['moments', '순간', stats.moments],
    ['moments-new', '새 순간 · 7일', stats.moments?.new],
    ['public-trees', '공개 트리', stats.trees?.public],
    ['featured-trees', '둘러보기 소개', stats.trees?.featured]
  ];
  const num = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
  const cards = cells.map(([key, label, value]) => {
    const real = num(value?.real);
    const aiTester = num(value?.aiTester);
    const tester = num(value?.tester);
    return real === null || aiTester === null || tester === null
      ? {key, label, error: true}
      : {key, label, real, aiTester, tester};
  });
  return {error: cards.every(card => card.error), cards};
}



/** '오늘 할 일'(#655): 답이 없는 글(답글 0) 중 오래된 순 5개. 닫은 글은 처리가 끝난 것이므로 세지 않는다.
 *  연결 이슈 번호는 '#584' 같은 표시도 숫자로 맞춰 돌려준다(#636). */
export function overviewTodos(posts, limit = 5) {
  if (!Array.isArray(posts)) return [];
  return posts
    .filter(row => (row?.replyCount || 0) === 0 && row?.status !== 'closed')
    .slice()
    .sort((a, b) => String(a?.createdAt || '').localeCompare(String(b?.createdAt || '')))
    .slice(0, limit)
    .map(row => ({id: row?.id, title: row?.displayTitle || '(제목 없음)', createdAt: row?.createdAt, issueNumber: normalizeIssueNumber(row?.issueNumber)}));
}

/**
 * '한눈에' 카드 모델(#655). 각 탭이 이미 부르는 응답({ok, payload})만 받아 숫자를 낸다.
 * 하나가 실패하면 그 카드만 {error:true}를 내고 나머지는 그대로 계산한다(화면은 카드마다 따로 그린다).
 * issues는 {ok, states} — states는 연결 이슈 번호 → 'open'/'closed'(GitHub 공개 읽기 결과).
 */
export function overviewModel({feedback, journals, reports, issues} = {}) {
  const posts = feedback?.ok && Array.isArray(feedback.payload?.feedback) ? feedback.payload.feedback : null;
  const journalRows = journals?.ok && Array.isArray(journals.payload?.journals) ? journalRowsByCustomer(journals.payload.journals) : null;
  const reportRows = reports?.ok && Array.isArray(reports.payload?.reports) ? reports.payload.reports : null;
  const feedbackCard = posts ? {
    pending: posts.filter(row => isPendingStatus(row?.status)).length,
    fixed: posts.filter(row => row?.status === 'fixed').length,
    total: posts.length,
    unanswered: posts.filter(row => (row?.replyCount || 0) === 0 && row?.status !== 'closed').length
  } : {error: true};
  const reportCard = reportRows
    ? {pending: reportRows.filter(row => row?.status === 'open').length, total: reportRows.length}
    : {error: true};
  const issueCard = posts && issues?.ok && issues.states instanceof Map ? (() => {
    let open = 0, closed = 0;
    for (const number of linkedIssueNumbers(posts)) {
      const state = issues.states.get(number);
      if (state === 'open') open += 1;
      else if (state === 'closed') closed += 1;
    }
    return {open, closed};
  })() : {error: true};
  const journalCard = journalRows
    ? {
        total: journalRows.length,
        rows: journalRows.slice(0, 6).map(row => ({name: row.name, subjectId: row.subjectId, lastDay: row.lastDay, latestScore: row.latestScore}))
      }
    : {error: true};
  return {feedbackCard, reportCard, issueCard, journalCard, todos: overviewTodos(posts)};
}
