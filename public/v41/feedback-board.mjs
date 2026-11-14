// #540 2차 — AI 고객 '오늘 사용 일지' 글쓰기 + '내 의견'(보낸 의견·답변).
// #611 4번 — 내 의견에 새 답글이 오면 '내 의견' 옆 숫자·계정 단추 점을 알리고, 열어 보면 사라진다.
//            자기 의견 아래에 짧게 덧붙일 수 있고(운영센터 상세에 같은 줄로 보인다),
//            반영된 의견의 답글에는 새 소식 버전 링크('새 소식에도 올렸어요 — 4.1.3 보기')를 단다.
const KIND_LABEL = {opinion: '의견', journal: '일지'};
const STATUS_LABEL = {received: '받음', reviewing: '확인 중', fixed: '고침', later: '다음에', closed: '처리 끝'};
const REPLY_SEEN_KEY = 'lt41.replySeen';
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

/** 본 적이 있는 운영센터 답글 id 묶음(브라우저 저장). */
function readSeenReplies(storage) {
  try {
    const raw = storage?.getItem?.(REPLY_SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter(id => Number.isInteger(id)) : []);
  } catch {
    return new Set();
  }
}

function writeSeenReplies(storage, seen) {
  try { storage?.setItem?.(REPLY_SEEN_KEY, JSON.stringify([...seen].slice(-500))); } catch { /* 저장소가 없으면 이번 접속만 */ }
}

/** 운영센터 답글(내 덧붙임은 빼고) 가운데 안 본 수. */
export function unreadReplyCount(posts, seenIds) {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds || []);
  let count = 0;
  for (const post of Array.isArray(posts) ? posts : []) {
    for (const reply of Array.isArray(post?.replies) ? post.replies : []) {
      if (reply && reply.mine !== true && !seen.has(reply.id)) count += 1;
    }
  }
  return count;
}

export function createFeedbackBoard({$, notify, show, showFull, onReplyCount, onOpenUpdates, storage, fetchJson}) {
  const api = createApi();
  const jpanel = $('journal-panel');
  const jform = $('journal-form');
  const jerror = $('journal-error');
  const ppanel = $('myposts-panel');
  const plist = $('myposts-list');
  const store = storage ?? (() => { try { return globalThis.localStorage; } catch { return null; } })();

  async function updatesByIssue() {
    try {
      const response = await (typeof fetchJson === 'function' ? fetchJson() : fetch('/v41/updates.json', { headers: { accept: 'application/json' } }));
      const list = Array.isArray(response) ? response : (response?.ok === false ? [] : (await response?.json?.().catch(() => [])) || []);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function reportUnread(posts) {
    if (typeof onReplyCount !== 'function') return 0;
    const seen = readSeenReplies(store);
    const count = unreadReplyCount(posts, seen);
    onReplyCount(count);
    return count;
  }

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
    if (!res.ok) { plist.innerHTML = `<p class="panel-note">${esc(res.message || '불러오지 못했어요.')}</p>`; return; }
    // #611 4번: 열어 보면 새 답글 알림이 사라진다.
    const seen = readSeenReplies(store);
    for (const post of posts) for (const reply of Array.isArray(post.replies) ? post.replies : []) if (reply && Number.isInteger(reply.id)) seen.add(reply.id);
    writeSeenReplies(store, seen);
    reportUnread(posts);
    if (!posts.length) { plist.innerHTML = '<p class="panel-note">아직 보낸 의견이 없어요.</p>'; return; }

    const updates = await updatesByIssue();
    plist.innerHTML = posts.map(post => {
      const replies = Array.isArray(post.replies) ? post.replies : [];
      const replyHtml = replies.length
        ? `<div class="myposts-replies">${replies.map(r => `<div class="myposts-reply"><span>${r.mine ? '내 덧붙임' : '답변'}</span><p>${esc(r.body)}</p></div>`).join('')}</div>`
        : '';
      const issue = (post.status === 'fixed' || post.status === 'closed') && post.issueNumber ? `<span class="myposts-issue">이슈 ${esc(post.issueNumber)}</span>` : '';
      // #611 4번: 이 의견이 반영된 버전이 새 소식에 있으면 본인에게 보여 준다.
      let updatesLink = '';
      if ((post.status === 'fixed' || post.status === 'closed') && post.issueNumber) {
        const version = updates.find(entry => Array.isArray(entry?.items) && entry.items.some(item => item?.issue === post.issueNumber))?.version;
        if (version) updatesLink = `<button type="button" class="myposts-updates-link" data-updates-version="${esc(version)}">새 소식에도 올렸어요 — ${esc(version)} 보기</button>`;
      }
      const appendForm = post.kind === 'opinion'
        ? `<form class="myposts-followup" data-followup="${esc(post.id)}"><label>덧붙일 말<input name="followup" maxlength="2000" autocomplete="off" placeholder="짧게 덧붙여 주세요"></label><button type="submit" class="myposts-followup-submit">덧붙이기</button><p class="myposts-followup-error" role="alert"></p></form>`
        : '';
      return `<article class="myposts-item">
        <div class="myposts-head"><span class="myposts-kind">${esc(KIND_LABEL[post.kind] || post.kind)}</span><span class="myposts-status">${esc(STATUS_LABEL[post.status] || post.status)}</span><span class="myposts-date">${esc(time(post.createdAt))}</span></div>
        <h3 class="myposts-title">${esc(post.displayTitle || '(제목 없음)')}</h3>
        <p class="myposts-body">${esc(post.body)}</p>
        ${issue}${updatesLink}${replyHtml}
        ${appendForm}
      </article>`;
    }).join('');

    for (const form of plist.querySelectorAll('.myposts-followup')) {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const error = form.querySelector('.myposts-followup-error');
        const text = form.querySelector('[name="followup"]')?.value.trim() || '';
        if (!text) { if (error) error.textContent = '덧붙일 말을 입력해 주세요.'; return; }
        const res = await api.call(`/api/board/mine/${encodeURIComponent(form.dataset.followup)}/followup`, {method: 'POST', body: JSON.stringify({body: text})});
        if (!res.ok) { if (error) error.textContent = res.message || '덧붙이지 못했어요.'; return; }
        if (typeof notify === 'function') notify(res.followup?.status === 'reviewing' ? '덧붙였어요. 다시 살펴볼게요.' : '덧붙였어요.');
        await openMyPosts();
      });
    }
    for (const link of plist.querySelectorAll('.myposts-updates-link')) {
      link.addEventListener('click', () => { if (typeof onOpenUpdates === 'function') onOpenUpdates(link.dataset.updatesVersion); });
    }
  }

  /** '내 의견' 옆 숫자와 계정 단추 점의 상태만 새로 묻는다(창은 열지 않는다). */
  async function refreshReplyDot() {
    const res = await api.call('/api/board/mine');
    if (!res.ok || !Array.isArray(res.posts)) { if (typeof onReplyCount === 'function') onReplyCount(0); return 0; }
    return reportUnread(res.posts);
  }

  return {openJournal, openMyPosts, refreshReplyDot};
}
