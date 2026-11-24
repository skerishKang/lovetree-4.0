// #792 3단계: 책의 YouTube 순간을 책 순서대로 이어 보는 화면.
// 첫 재생은 '이어 보기'를 누른 사용자 동작으로 시작하고, 그다음 순간부터는 같은 재생기에서 이어 간다.
import {formatRange} from '/v41/domain.mjs';
import {loadYouTubeIframeApi} from '/v41/segment-capture.mjs';
import {buildPlaybackQueue, stepPlayable, firstPlayable, playbackChipText, segmentReached, playbackStatusOf, STATUS_PLAYING, STATUS_BUFFERING, STATUS_SKIPPED} from '/v41/playback-core.mjs';

const $ = (selector) => document.querySelector(selector);
const overlay = $('#playback');
const playAllBtn = $('#playAllBtn');
if (!overlay || !playAllBtn) throw new Error('playback markup missing');

let items = [];
let index = -1;
let player = null;
let token = 0;
let open = false;
let advancing = false;
let tickTimer = 0;
let statusTimer = 0;

const titleOf = (moment) => {
  try { return window.LTBookTitle?.view?.(moment)?.main || moment?.title || '순간'; } catch { return moment?.title || '순간'; }
};
const dateOf = (moment) => {
  try { return window.LTBookTitle?.date?.(moment?.date) || moment?.date || ''; } catch { return moment?.date || ''; }
};
const itemsForBook = () => {
  const moments = (typeof window.__TRACK59__?.playbackMoments === 'function' ? window.__TRACK59__.playbackMoments() : []) || [];
  return buildPlaybackQueue(moments, window.LTMedia?.describe, titleOf, dateOf);
};
const currentItem = () => items[index] || null;
const setStatus = (text) => { const node = $('#pbStatus'); if (node) node.textContent = text || ''; };
const setRange = (item) => {
  const node = $('#pbRange');
  if (!node) return;
  node.textContent = item ? `${formatRange(item.start, item.end)} · ${item.duration}초` : '';
};

function chipMarkup(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'playback-chip';
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.dataset.playbackIndex = String(items.indexOf(item));
  button.textContent = playbackChipText(item);
  button.title = playbackChipText(item);
  if (item.unavailable) {
    button.classList.add('is-unavailable');
    button.setAttribute('aria-disabled', 'true');
  }
  button.addEventListener('click', () => {
    if (item.unavailable) { setStatus('이 순간은 볼 수 없어요.'); return; }
    goTo(items.indexOf(item));
  });
  return button;
}

function renderChips() {
  const host = $('#pbChips');
  if (!host) return;
  host.replaceChildren(...items.map(chipMarkup));
  markChip();
}

function markChip() {
  const host = $('#pbChips');
  if (!host) return;
  [...host.children].forEach((chip, i) => {
    chip.setAttribute('aria-selected', String(i === index));
    chip.classList.toggle('is-current', i === index);
  });
  const active = host.children[index];
  if (active) active.scrollIntoView({block: 'nearest', inline: 'center'});
}

function renderCurrent() {
  const item = currentItem();
  if (!item) return;
  $('#pbTitle').textContent = item.title;
  $('#pbMeta').textContent = `${item.date || '날짜 없음'} · ${index + 1} / ${items.length}`;
  setRange(item);
  markChip();
  const previous = stepPlayable(items, index, -1);
  const next = stepPlayable(items, index, 1);
  $('#pbPrev').disabled = previous < 0;
  $('#pbNext').disabled = next < 0;
}

function showDone() {
  $('#pbDone').hidden = false;
  $('#pbToggle').textContent = '재생';
  $('#pbPrev').disabled = stepPlayable(items, index, -1) < 0;
  $('#pbNext').disabled = true;
  setStatus('마지막 순간까지 봤어요.');
}

function hideDone() {
  $('#pbDone').hidden = true;
}

function resetPlayerHost() {
  if (player) {
    try { player.destroy(); } catch {}
    player = null;
  }
  const stage = $('.playback-stage');
  let host = $('#pbPlayer');
  if (!host || host.tagName === 'IFRAME') {
    host = document.createElement('div');
    host.id = 'pbPlayer';
    stage?.prepend(host);
  } else {
    host.replaceChildren();
  }
}

function loadItem(item) {
  if (!item || !player || !open) return;
  const myToken = token;
  hideDone();
  setStatus('이어 보는 중이에요.');
  try {
    player.loadVideoById({videoId: item.videoId, startSeconds: item.start, endSeconds: item.end});
    player.playVideo();
  } catch {
    if (myToken === token) markUnavailable(index);
  }
  $('#pbToggle').textContent = '멈춤';
  renderCurrent();
}

function markUnavailable(at) {
  const item = items[at];
  if (!item || item.unavailable) return;
  item.unavailable = true;
  const chip = $('#pbChips')?.children[at];
  if (chip) {
    chip.classList.add('is-unavailable');
    chip.setAttribute('aria-disabled', 'true');
    chip.textContent = playbackChipText(item);
    chip.title = playbackChipText(item);
  }
  setStatus(STATUS_SKIPPED);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { if (open) advance(1); }, 650);
}

function advance(delta) {
  if (!open || advancing) return;
  const next = stepPlayable(items, index, delta);
  if (next < 0) { showDone(); return; }
  advancing = true;
  index = next;
  renderCurrent();
  loadItem(currentItem());
  setTimeout(() => { advancing = false; }, 550);
}

function goTo(next) {
  if (!open || next < 0 || next >= items.length || items[next].unavailable) return;
  index = next;
  hideDone();
  renderCurrent();
  loadItem(currentItem());
}

function finishAll() {
  try { player?.pauseVideo?.(); } catch {}
  showDone();
}

function closePlayback() {
  if (!open) return;
  open = false;
  token += 1;
  clearInterval(tickTimer);
  clearTimeout(statusTimer);
  try { player?.pauseVideo?.(); } catch {}
  overlay.classList.remove('open');
  overlay.setAttribute('inert', '');
  document.documentElement.removeAttribute('data-playback-open');
  hideDone();
  playAllBtn.focus?.({preventScroll: true});
}

function onStateChange(event) {
  if (!open) return;
  const state = event?.data;
  if (state === 0) { advance(1); return; }
  if (state === 1) $('#pbToggle').textContent = '멈춤';
  if (state === 2) $('#pbToggle').textContent = '재생';
  const text = playbackStatusOf(state);
  if (text) setStatus(text);
}

function onError(event) {
  if (!open) return;
  // 150·153처럼 이 자리에서 재생할 수 없는 영상은 다음 순간으로 건너뛴다.
  if (event?.data !== undefined) console.info?.('playback skip', event.data);
  markUnavailable(index);
}

function tick() {
  if (!open || !player || advancing) return;
  const item = currentItem();
  if (!item) return;
  let state = -1;
  try { state = Number(player.getPlayerState?.()) || -1; } catch {}
  if (state === 1) {
    // 상태 이벤트를 놓쳐 '불러오는 중'이 남은 경우를 되살린다 — 사용자가 멈춘 문구는 그대로 둔다.
    const now = $('#pbStatus')?.textContent;
    if (now === STATUS_BUFFERING) setStatus(STATUS_PLAYING);
    $('#pbToggle').textContent = '멈춤';
  }
  let now2 = 0;
  try { now2 = Number(player.getCurrentTime()) || 0; } catch { return; }
  if (segmentReached(now2, item.end)) advance(1);
}

async function openPlayback() {
  items = itemsForBook();
  if (items.length) playAllBtn.hidden = false;
  const first = firstPlayable(items);
  if (first < 0) {
    setStatus('이어 볼 수 있는 YouTube 순간이 없어요.');
    return;
  }
  if (open) return;
  open = true;
  token += 1;
  const myToken = token;
  index = first;
  advancing = false;
  overlay.classList.add('open');
  overlay.removeAttribute('inert');
  document.documentElement.setAttribute('data-playback-open', '1');
  renderChips();
  renderCurrent();
  resetPlayerHost();
  const host = $('#pbPlayer');
  host.replaceChildren();
  try {
    const YT = await loadYouTubeIframeApi();
    if (!open || myToken !== token) return;
    player = new YT.Player(host, {
      videoId: currentItem().videoId,
      playerVars: {
        autoplay: 1,
        start: currentItem().start,
        end: currentItem().end,
        rel: 0,
        playsinline: 1,
        origin: location.origin
      },
      events: {
        onReady: () => {
          if (!open || myToken !== token) return;
          try { player.getIframe?.()?.setAttribute?.('referrerpolicy', 'strict-origin-when-cross-origin'); } catch {}
          try { player.getIframe?.()?.setAttribute?.('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'); } catch {}
          player.playVideo();
          setStatus('이어 보는 중이에요.');
        },
        onStateChange,
        onError
      }
    });
    tickTimer = setInterval(tick, 200);
    $('#pbClose').focus();
  } catch {
    if (open && myToken === token) {
      setStatus('YouTube 재생기를 불러오지 못했어요. 원본 링크에서 확인해 주세요.');
      markUnavailable(index);
    }
  }
}

function restart() {
  const first = firstPlayable(items);
  if (first < 0) { showDone(); return; }
  hideDone();
  index = first;
  renderCurrent();
  loadItem(currentItem());
}

function togglePlay() {
  if (!player) return;
  let state = -1;
  try { state = player.getPlayerState(); } catch {}
  if (state === 1) { try { player.pauseVideo(); } catch {} }
  else { try { player.playVideo(); } catch {} }
}

function updateAvailability() {
  items = itemsForBook();
  playAllBtn.hidden = false;
  if (!items.length && open) closePlayback();
}

// 390에서는 머리줄 도구가 넘치지 않도록 '이어 보기'를 책 아래 이동 줄로 옮긴다.
function placePlayButton() {
  const phone = document.documentElement.dataset.bookShape === 'phone';
  const tools = document.querySelector('.lt-toolbar-tools');
  const nav = document.querySelector('.nav-pill');
  if (phone && nav && playAllBtn.parentElement !== nav) {
    playAllBtn.classList.add('playback-launch');
    nav.append(playAllBtn);
  } else if (!phone && tools && playAllBtn.parentElement !== tools) {
    playAllBtn.classList.remove('playback-launch');
    tools.append(playAllBtn);
  }
}

function wire() {
  updateAvailability();
  placePlayButton();
  addEventListener('resize', placePlayButton);
  new MutationObserver(placePlayButton).observe(document.documentElement, {attributes: true, attributeFilter: ['data-book-shape']});
  playAllBtn.addEventListener('click', () => { void openPlayback(); });
  $('#pbClose').addEventListener('click', closePlayback);
  $('#pbCloseBottom').addEventListener('click', closePlayback);
  $('#pbPrev').addEventListener('click', () => {
    const previous = stepPlayable(items, index, -1);
    if (previous >= 0) goTo(previous);
    else if (currentItem()) {
      try { player?.seekTo?.(currentItem().start, true); player?.playVideo?.(); } catch {}
      setStatus('이 순간의 처음으로 돌아갔어요.');
    }
  });
  $('#pbNext').addEventListener('click', () => {
    if (stepPlayable(items, index, 1) >= 0) advance(1);
    else finishAll();
  });
  $('#pbToggle').addEventListener('click', togglePlay);
  $('#pbRestart').addEventListener('click', restart);
  document.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePlayback(); return; }
    if (['ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'ArrowLeft') $('#pbPrev').click();
      else if (event.key === 'ArrowRight') $('#pbNext').click();
      else togglePlay();
    }
  }, true);
  addEventListener('pagehide', () => { try { player?.destroy?.(); } catch {} }, {once: true});
  if (window.__TRACK59__) {
    window.__TRACK59__.openPlayback = openPlayback;
    window.__TRACK59__.playbackItems = () => items.map((item) => ({...item}));
  }
}

// YouTube IFrame API를 미리 받아 두어 첫 '이어 보기' 클릭이 사용자 동작 안에서 시작되게 한다.
void loadYouTubeIframeApi().catch(() => {});
wire();
