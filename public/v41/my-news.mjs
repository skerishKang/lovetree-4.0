// #1098 3단계 — 내 소식 창(화면). 서버 길은 #1159에서 만든 두 경로만 쓴다 — 서버 코드는 이 화면 작업에서 바꾸지 않는다.
//  · 목록(GET /api/community/my-news)을 열면 서버가 '여기까지 읽음'을 남긴다(#1159) — 창이 열리는 즉시 점을 지운다.
//  · 안 읽은 수(GET /api/community/my-news/unread-count)는 계정 단추의 점과 계정 메뉴 숫자를 갱신한다. 수가 0이면 점은 숨는다.
//  · 줄은 서버가 하루(한국 날짜)·종류·대상으로 묶어 최신순으로 내려 준다 — 화면은 그 순서를 그대로 그리고,
//    하루가 바뀌는 자리에 날짜 줄을 하나 쓴다. 같은 순간의 ♡ 5개는 서버가 한 줄('♡ 5')로 내려 준다.
//  · 불러오기에 실패하면 창 안에 짧은 안내 한 줄만 남긴다 — 창이 비거나 화면이 깨지지 않게.

/** 종류 이름표 — 줄 머리에 붙는다('♡ 5'·'댓글 2'·'담기 3'). 모르는 종류는 빈 값(그 줄은 그리지 않는다). */
export const NEWS_KIND_LABEL = { heart: '♡', comment: '댓글', favorite: '담기' };

export function newsLineLabel(line) {
  const label = NEWS_KIND_LABEL[String(line?.kind || '')];
  const count = Number(line?.count || 0);
  return label && Number.isFinite(count) && count > 0 ? `${label} ${count}` : '';
}

/** AI 명예회원 몫 이름표 — 0이면 빈 값. 계정 정보는 서버가 내려주지 않는다(#1159의 구분 숫자만 쓴다). */
export function newsAiLabel(line) {
  const count = Number(line?.aiCount || 0);
  return Number.isFinite(count) && count > 0 ? `AI 명예회원 ${count}` : '';
}

/** 대상 이름표 — 내 기록(트리 목록)에서 트리·순간을 찾아 붙인다. 못 찾으면 빈 값(빈 칸으로 남지 않게). */
export function newsTargetLabel(line, trees = []) {
  const list = Array.isArray(trees) ? trees : [];
  const tree = list.find(item => item && item.id === line?.treeId);
  if (!tree) return '';
  const treeName = String(tree.title || tree.subject || '').trim() || '내 트리';
  if (!line?.momentId) return treeName;
  const moment = (Array.isArray(tree.moments) ? tree.moments : []).find(item => item && item.id === line.momentId);
  const momentName = String(moment?.title || moment?.note || '').trim();
  return momentName ? `${treeName} · ${momentName}` : treeName;
}

/** 날짜 줄 — 서버의 한국 날짜('YYYY-MM-DD')를 '11월 22일'로. 올해 기록이 아니면 연도를 앞에 붙인다. */
export function newsDayLabel(day, currentYear = new Date().getFullYear()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return '';
  const label = `${month}월 ${date}일`;
  return year === currentYear ? label : `${year}년 ${label}`;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

/** 목록 HTML — 서버 순서(최신순)를 그대로 그린다. 댓글 줄에는 가장 최근 본문을 함께 쓴다(잘리지 않게 어기고). */
export function renderMyNews(lines, { trees = [] } = {}) {
  const rows = (Array.isArray(lines) ? lines : [])
    .map(line => ({ line, label: newsLineLabel(line) }))
    .filter(row => row.label);
  if (!rows.length) return '<p class="panel-note my-news-empty">아직 새 소식이 없어요. 누군가 내 트리에 마음을 남기면 여기에 모여요.</p>';
  let lastDay = '';
  const items = rows.map(({ line, label }) => {
    const day = String(line?.day || '');
    const dayRow = day && day !== lastDay ? `<li class="my-news-day">${esc(newsDayLabel(day))}</li>` : '';
    if (day) lastDay = day;
    const target = newsTargetLabel(line, trees);
    const ai = newsAiLabel(line);
    const last = line?.kind === 'comment' && String(line?.lastBody || '') ? `<span class="my-news-last">${esc(line.lastBody)}</span>` : '';
    const targetRow = target ? `<span class="my-news-target">${esc(target)}</span>` : '';
    const aiRow = ai ? `<span class="my-news-ai" aria-label="${esc(ai)}이 남긴 몫">${esc(ai)}</span>` : '';
    return `${dayRow}<li class="my-news-line" role="listitem"><span class="my-news-label">${esc(label)}</span>${last}${targetRow}${aiRow}</li>`;
  }).join('');
  return `<ul class="my-news-rows" aria-label="내 소식 목록">${items}</ul>`;
}

export const MY_NEWS_PANEL_ID = 'my-news-panel';
export const MY_NEWS_NOT_READY_TEXT = '소식을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';

/** 셸 배선. fetchNews·fetchCount는 시험에서 갈아 낀다(운영값은 shell.mjs가 community-api의 두 경로를 넘긴다). */
export function mountMyNews({ $ = null, showPanel = null, fetchNews, fetchCount, getTrees = () => [], onCount = () => {}, document: doc = globalThis.document } = {}) {
  const readNews = typeof fetchNews === 'function' ? fetchNews : async () => null;
  const readCount = typeof fetchCount === 'function' ? fetchCount : async () => null;
  const $id = id => (typeof $ === 'function' ? $(id) : doc?.getElementById?.(id)) || null;
  let lastCount = null;
  const paint = value => { lastCount = value; onCount(value); };
  // 점용 숫자 — 실패하면(null) 점을 바꾸지 않는다(알 수 없다고 0으로 두지 않는다). Number(null)은 0이라
  // 그대로 세면 실패를 '읽음 0'으로 잘못 그린다.
  // community-api의 실제 응답({ok, unreadCount})도 같은 길로 받는다 — 숫자만 받으면 운영 길에서 점이 못 그려진다.
  async function refreshCount() {
    let value = null;
    try { value = await readCount(); } catch { value = null; }
    const raw = value !== null && typeof value === 'object' ? value.unreadCount : value;
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(n) && n >= 0) paint(n);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  // 목록 창 — 성공하면(읽음 표시가 서버에 남았으므로) 점을 바로 지운다. 실패하면 점을 그대로 두고
  // 창 안에 안내 한 줄을 남긴다. 두 길 모두 창은 같은 틀로 열린다(접근성 이름은 창 머리글이 맡는다).
  async function open() {
    const list = $id('my-news-list');
    const error = $id('my-news-error');
    if (error) { error.hidden = true; error.textContent = ''; }
    if (list) list.innerHTML = '<p class="panel-note my-news-loading">소식을 불러오고 있어요.</p>';
    let lines = null;
    try {
      const answer = await readNews();
      lines = answer && answer.ok !== false && Array.isArray(answer.lines) ? answer.lines : null;
    } catch { lines = null; }
    if (list) {
      if (lines === null) {
        list.innerHTML = '';
        if (error) { error.textContent = MY_NEWS_NOT_READY_TEXT; error.hidden = false; }
      } else {
        list.innerHTML = renderMyNews(lines, { trees: getTrees() || [] });
        paint(0);
      }
    }
    if (typeof showPanel === 'function') showPanel(MY_NEWS_PANEL_ID);
    else $id(MY_NEWS_PANEL_ID)?.showModal?.();
    return lines;
  }
  return { open, refreshCount, lastCount: () => lastCount };
}
