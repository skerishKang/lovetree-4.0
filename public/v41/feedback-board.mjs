// #540 2차 — AI 고객 '오늘 사용 일지' 글쓰기 + '내 의견'(보낸 의견·답변).
const KIND_LABEL = {opinion: '의견', journal: '일지'};
const STATUS_LABEL = {received: '받음', reviewing: '확인 중', fixed: '고침', later: '다음에'};
const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const time = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ko-KR', {hour12: false}); };

function createApi(fetchImpl = (...args) => fetch(...args)) {
  async function call(path, init = {}) {
    try {
      const response = await fetchImpl(path, {credentials: 'same-origin', headers: {accept: 'application/json', ...(init.body ? {'content-type': 'application/json'} : {})}, ...init});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return {ok: false, status: response.status, code: body?.error?.code || 'request_failed', message: body?.error?.message || ''};
      return {ok: true, status: response.status, ...body};
    } catch (error) {
      return {ok: false, status: 0, code: error?.name === 'AbortError' ? 'timeout' : 'offline', message: ''};
    }
  }
  return {call};
}

export function createFeedbackBoard({$, notify, show, showFull}) {
  const api = createApi();
  const jpanel = $('journal-panel');
  const jform = $('journal-form');
  const jerror = $('journal-error');
  const ppanel = $('myposts-panel');
  const plist = $('myposts-list');

  async function openJournal() {
    if (!jpanel) return;
    jform.reset();
    jerror.textContent = '';
    // 오늘 이미 쓴 일지가 있으면 불러와 고치게 한다.
    const today = await api.call('/api/board/journal/today');
    if (today.ok && today.journal) {
      jform.querySelector('[name="title"]').value = today.journal.title || '';
      jform.querySelector('[name="body"]').value = today.journal.body || '';
      if (today.journal.score) jform.querySelector('[name="score"]').value = String(today.journal.score);
    }
    if (typeof show === 'function') show(); else jpanel.showModal();
    jform.querySelector('[name="title"]')?.focus();
  }

  jform?.addEventListener('submit', async event => {
    event.preventDefault();
    const title = jform.querySelector('[name="title"]').value.trim();
    const body = jform.querySelector('[name="body"]').value.trim();
    const score = jform.querySelector('[name="score"]').value;
    if (!title) { jerror.textContent = '제목을 입력해 주세요.'; return; }
    if (!body) { jerror.textContent = '오늘 사용한 내용을 적어 주세요.'; return; }
    const save = $('journal-save');
    if (save) save.disabled = true;
    const res = await api.call('/api/board', {method: 'POST', body: JSON.stringify({title, body, score: score === '' ? null : Number(score)})});
    if (save) save.disabled = false;
    if (!res.ok) { jerror.textContent = res.message || '저장에 실패했어요.'; return; }
    jpanel.close();
    if (typeof notify === 'function') notify('오늘 사용 일지를 저장했어요.');
  });

  async function openMyPosts() {
    if (!ppanel) return;
    plist.innerHTML = '<p class="panel-note">불러오는 중…</p>';
    if (typeof showFull === 'function') showFull(); else ppanel.showModal();
    const res = await api.call('/api/board/mine');
    const posts = res.ok && Array.isArray(res.posts) ? res.posts : [];
    if (!posts.length) { plist.innerHTML = '<p class="panel-note">아직 보낸 의견이 없어요.</p>'; return; }
    plist.innerHTML = posts.map(post => {
      const replies = Array.isArray(post.replies) ? post.replies : [];
      const replyHtml = replies.length
        ? `<div class="myposts-replies">${replies.map(r => `<div class="myposts-reply"><span>답변</span><p>${esc(r.body)}</p></div>`).join('')}</div>`
        : '';
      const issue = post.status === 'fixed' && post.issueNumber ? `<span class="myposts-issue">이슈 ${esc(post.issueNumber)}</span>` : '';
      return `<article class="myposts-item">
        <div class="myposts-head"><span class="myposts-kind">${esc(KIND_LABEL[post.kind] || post.kind)}</span><span class="myposts-status">${esc(STATUS_LABEL[post.status] || post.status)}</span><span class="myposts-date">${esc(time(post.createdAt))}</span></div>
        <h3 class="myposts-title">${esc(post.displayTitle || '(제목 없음)')}</h3>
        <p class="myposts-body">${esc(post.body)}</p>
        ${issue}${replyHtml}
      </article>`;
    }).join('');
    if (!res.ok) plist.innerHTML = `<p class="panel-note">${esc(res.message || '불러오지 못했어요.')}</p>`;
  }

  return {openJournal, openMyPosts};
}