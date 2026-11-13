/**
 * 운영센터 화면의 순수 조각(#564). DOM·가져오기 없이 node 시험에서 바로 쓴다.
 * - 주소(해시) ↔ 화면 상태: #board · #feedback/<id> · #persona/<id> · #reports · #issues
 * - 날짜 '11.14 06:31'(지역 시간, 초 없음)
 * - 답글 줄바꿈(이스케이프 유지)
 * - GitHub 이슈 새 글 주소(개인정보 없이)
 * - '닫음'(closed) 상태: 목록 기본에서는 제외
 */

export const KIND_LABEL = {opinion: '의견', journal: '일지'};
export const STATUS_LABEL = {received: '받음', reviewing: '확인 중', fixed: '고침', later: '다음에', closed: '닫음'};
export const STATUS_ORDER = ['received', 'reviewing', 'fixed', 'later', 'closed'];
export const PERSONA_FIELDS = [
  ['who', '누구'], ['why', '왜 쓰나'], ['how', '쓰는 모습'], ['satisfied', '만족한 점'], ['disappointed', '실망한 점'], ['now', '지금 상태']
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

/** 주소 해시를 화면 상태로. 모르는 모양은 목록으로 돌린다. */
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [name, ...rest] = raw.split('/');
  const id = decodeURIComponent(rest.join('/') || '');
  if (name === 'feedback' && id) return {view: 'feedback', id};
  if (name === 'persona' && id) return {view: 'persona', id};
  if (name === 'reports') return {view: 'reports', id: null};
  if (name === 'issues') return {view: 'issues', id: null};
  return {view: 'board', id: null};
}

/** 화면 상태를 주소 해시로. */
export function viewHash(view, id = null) {
  if (view === 'feedback' && id != null) return '#feedback/' + encodeURIComponent(id);
  if (view === 'persona' && id != null) return '#persona/' + encodeURIComponent(id);
  if (view === 'reports') return '#reports';
  if (view === 'issues') return '#issues';
  return '#board';
}

/** 머리줄 탭 표시용: 글·페르소나 화면은 게시판 탭이 눌려 있다. */
export function viewToTab(view) {
  return view === 'reports' || view === 'issues' ? view : 'board';
}

/** 목록 기본(상태 전체)은 '닫음'을 숨긴다(#564 10). 상태를 골랐을 때는 서버 결과를 그대로 쓴다. */
export function visibleRows(rows, status) {
  const list = Array.isArray(rows) ? rows : [];
  return status ? list : list.filter(row => row?.status !== 'closed');
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
