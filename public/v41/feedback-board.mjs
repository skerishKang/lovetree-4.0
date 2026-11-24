// #540 2차 — AI 고객 '오늘 사용 일지' 글쓰기 + '내 의견'(보낸 의견·답변).
// #611 4번 — 내 의견에 새 답글이 오면 '내 의견' 옆 숫자·계정 단추 점을 알리고, 열어 보면 사라진다.
//            자기 의견 아래에 짧게 덧붙일 수 있고(운영센터 상세에 같은 줄로 보인다),
//            반영된 의견의 답글에는 새 소식 버전 링크('새 소식에도 올렸어요 — 4.1.3 보기')를 단다.
const KIND_LABEL = {opinion: '의견', journal: '일지'};
// #638: 고객에게 보이는 상태 말은 쉬운 말로 쓴다(운영센터의 말은 src/admin-view.js가 따로 쓴다).
const STATUS_LABEL = {received: '받았어요', reviewing: '살펴보는 중', fixed: '고쳤어요', later: '다음에', closed: '답했어요'};
const REPLY_SEEN_KEY = 'lt41.replySeen';
// A-15·A-20: 글자 막기·날짜 표기는 화면 정본 한 벌을 쓴다.
import { escapeHtml as esc } from './html-escape.mjs';
import { formatDisplayDate } from './book-usability.mjs';

const dateStyle = () => {
  try { const value = globalThis.localStorage?.getItem?.('lt41.dateStyle'); return value === 'dash' || value === 'long' ? value : 'dot'; }
  catch { return 'dot'; }
};
const time = value => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : formatDisplayDate(value, dateStyle());
};

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

export function createFeedbackBoard({$, notify, show, showFull, onReplyCount, onOpenUpdates, storage, fetchJson, isLoggedIn, memberPhase}) {
  const api = createApi();
  const jpanel = $('journal-panel');
  const jform = $('journal-form');
  const jerror = $('journal-error');
  const ppanel = $('myposts-panel');
  const plist = $('myposts-list');
  const store = storage ?? (() => { try { return globalThis.localStorage; } catch { return null; } })();
  // #1273 6번: 보낸 직후 응답의 글을 목록에 바로 넣고, 세션 확인이 끝나기 전에는
  // '로그인이 필요해요'를 띄우지 않는다.
  let sentPosts = [], lastPosts = null;
  const signedIn = () => typeof isLoggedIn === 'function' && !!isLoggedIn();
  const phase = () => String(typeof memberPhase === 'function' ? memberPhase() || '' : '');
  function mergePosts(posts) {
   const out = Array.isArray(posts) ? posts.slice() : [];
   const ids = new Set(out.map(p => Number(p?.id)));
   for (const post of sentPosts) if (!ids.has(Number(post.id))) { out.unshift(post); ids.add(Number(post.id)); }
   return out;
  }
  async function waitForSession() {
   for (let i = 0; i < 40; i++) {
    // 확인 중이라는 값이 있을 때만 기다린다(값이 없는 환경에서는 바로 본다).
    if (phase() !== 'checking') return;
    await new Promise(resolve => setTimeout(resolve, 100));
   }
  }
  function addSentPost(post) {
   if (!post || !Number.isInteger(Number(post.id)) || Number(post.id) <= 0) return;
   if (sentPosts.some(p => Number(p.id) === Number(post.id))) return;
   sentPosts.push(post);
   if (lastPosts && ppanel?.open) return renderPosts(mergePosts(lastPosts));
   return Promise.resolve();
  }

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
    plist.innerHTML = '<p class="panel-note">불러오는 중이에요.</p>';
    if (typeof showFull === 'function') showFull(); else ppanel.showModal();
    // 세션 확인이 끝나기 전에 목록을 부르면 로그인 상태인데도 401이 날 수 있다 — 확인을 먼저 기다린다.
    await waitForSession();
    const res = await api.call('/api/board/mine');
    if (!res.ok) {
      // 로그인 상태에서 서버가 아직 신원을 못 본 경우에는 '로그인이 필요해요'를 띄우지 않는다.
      const message = res.status === 401 && signedIn() ? '지금 로그인을 확인하고 있어요. 잠시 뒤 다시 열어 주세요.' : res.message || '불러오지 못했어요.';
      plist.innerHTML = `<p class="panel-note">${esc(message)}</p>`;
      return;
    }
    const posts = mergePosts(Array.isArray(res.posts) ? res.posts : []);
    sentPosts = [];
    // #611 4번: 열어 보면 새 답글 알림이 사라진다.
    const seen = readSeenReplies(store);
    for (const post of posts) for (const reply of Array.isArray(post.replies) ? post.replies : []) if (reply && Number.isInteger(reply.id)) seen.add(reply.id);
    writeSeenReplies(store, seen);
    reportUnread(posts);
    if (!posts.length) { lastPosts = posts; plist.innerHTML = '<p class="panel-note">아직 보낸 의견이 없어요.</p>'; return; }
    await renderPosts(posts);
  }

  async function renderPosts(posts) {
    lastPosts = posts;
    const updates = await updatesByIssue();
    plist.innerHTML = posts.map(post => {
      const replies = Array.isArray(post.replies) ? post.replies : [];
      // #678 후속 B: 내 덧붙임(canEdit·canDelete가 true)에만 고치기·지우기가 붙는다 — 가끔 쓰는 기능이라
      // 큰 단추 대신 머리 줄('내 덧붙임 (고침)') 오른쪽 끝의 작은 글자 단추 두 개로 둔다(누름 영역은 44px, CSS 몫).
      // 고친 덧붙임에는 (고침) 표시가 붙는다. 운영센터 답변(mine=false)에는 단추가 없다.
      const replyHtml = replies.length
        ? `<div class="myposts-replies">${replies.map(r => {
            const tools = r.canDelete === true
              ? `<span class="myposts-reply-tools"><button type="button" class="myposts-reply-btn" data-reply-edit="${esc(r.id)}">고치기</button><span class="myposts-reply-sep" aria-hidden="true">·</span><button type="button" class="myposts-reply-btn" data-reply-delete="${esc(r.id)}">지우기</button></span>`
              : '';
            const editedMark = r.edited === true ? '<span class="myposts-reply-edited">(고침)</span>' : '';
            return `<div class="myposts-reply" data-reply-id="${esc(r.id)}"><div class="myposts-reply-head"><span>${r.mine ? '내 덧붙임' : r.authorName === '운영센터' ? '운영센터' : '답변'}${editedMark}</span>${tools}</div><p>${esc(r.body)}</p></div>`;
          }).join('')}</div>`
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
      // 이슈 638: 의견 만들 때 서버가 제목을 본문 첫 줄로 채운다(server/feedback-service.js) —
      // 그래서 제목이 본문 앞부분을 그대로 반복한다. 본문이 제목으로 시작하면 굵은 제목을
      // 그리지 않고(본문만), 제목이 따로 있을 때는 굵은 줄을 두 줄로 줄인다(CSS line-clamp).
      const ownTitle = String(post.title || '').trim();
      const bodyText = String(post.body || '').trim();
      const titleHtml = ownTitle && !bodyText.startsWith(ownTitle) ? `<h3 class="myposts-title">${esc(ownTitle)}</h3>` : '';
      return `<article class="myposts-item">
        <div class="myposts-head"><span class="myposts-kind">${esc(KIND_LABEL[post.kind] || post.kind)}</span><span class="myposts-no">#${esc(post.id)}</span><span class="myposts-status">${esc(STATUS_LABEL[post.status] || post.status)}</span><span class="myposts-date">${esc(time(post.createdAt))}</span></div>
        ${titleHtml}
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
    // #678 후속 B: 내 덧붙임 고치기·지우기. 고치기를 누르면 원래 덧붙임 카드를 숨기고 그 자리에
    // 입력칸(저장·취소)을 놓는다(같은 글이 두 번 보이지 않게). 지우기는 한 번 확인한 뒤 지운다
    // (서버는 status='deleted'로 남긴다). 저장·지운 뒤에는 목록을 다시 부른다.
    for (const button of plist.querySelectorAll('[data-reply-edit]')) {
      button.addEventListener('click', () => {
        const box = button.closest('.myposts-reply');
        if (!box || box.hidden || box.parentElement?.querySelector('.myposts-reply-edit')) return;
        const replyId = box.dataset.replyId || '';
        const postId = button.closest('.myposts-item')?.querySelector('[data-followup]')?.dataset.followup || '';
        const current = box.querySelector('p')?.textContent || '';
        box.hidden = true;
        const form = document.createElement('form');
        form.className = 'myposts-reply-edit';
        form.innerHTML = `<span class="myposts-reply-edit-label">내 덧붙임 고치기</span><input name="reply" maxlength="2000" autocomplete="off" value="${esc(current)}"><div class="myposts-reply-edit-row"><button type="submit" class="myposts-reply-save">저장</button><button type="button" class="myposts-reply-cancel">취소</button></div><p class="myposts-reply-edit-error" role="alert"></p>`;
        box.after(form);
        const input = form.querySelector('input');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const error = form.querySelector('.myposts-reply-edit-error');
          const text = input.value.trim();
          if (!text) { error.textContent = '덧붙일 말을 입력해 주세요.'; return; }
          const res = await api.call(`/api/board/mine/${encodeURIComponent(postId)}/followup/${encodeURIComponent(replyId)}`, {method: 'PATCH', body: JSON.stringify({body: text})});
          if (!res.ok) { error.textContent = res.message || '고치지 못했어요.'; return; }
          if (typeof notify === 'function') notify(res.followup?.status === 'reviewing' ? '고쳤어요. 다시 살펴볼게요.' : '고쳤어요.');
          await openMyPosts();
        });
        form.querySelector('.myposts-reply-cancel').addEventListener('click', () => { openMyPosts(); });
      });
    }
    for (const button of plist.querySelectorAll('[data-reply-delete]')) {
      button.addEventListener('click', async () => {
        const replyId = button.closest('.myposts-reply')?.dataset.replyId || '';
        const postId = button.closest('.myposts-item')?.querySelector('[data-followup]')?.dataset.followup || '';
        if (!globalThis.confirm('이 덧붙임을 지울까요? 지우면 내 의견 목록에서 사라져요.')) return;
        const res = await api.call(`/api/board/mine/${encodeURIComponent(postId)}/followup/${encodeURIComponent(replyId)}`, {method: 'DELETE'});
        if (!res.ok) { if (typeof notify === 'function') notify(res.message || '지우지 못했어요.'); return; }
        if (typeof notify === 'function') notify('지웠어요.');
        await openMyPosts();
      });
    }
  }

  /** '내 의견' 옆 숫자와 계정 단추 점의 상태만 새로 묻는다(창은 열지 않는다). */
  async function refreshReplyDot() {
    const res = await api.call('/api/board/mine');
    if (!res.ok || !Array.isArray(res.posts)) { if (typeof onReplyCount === 'function') onReplyCount(0); return 0; }
    return reportUnread(res.posts);
  }

  return {openJournal, openMyPosts, refreshReplyDot, addSentPost};
}
