// #792 2단계: 영상을 보다가 지금 재생 위치를 순간의 시작으로, 시작+10초를 끝으로 담는다.
// 계산은 순수 함수로 두고, 화면 연결은 createSegmentCapture가 맡는다. 저장 규칙은 바꾸지 않는다 —
// 결과는 지금의 시작·끝 칸 값과 같은 경로로 저장된다.
import { formatTimecode, parseTimecode } from './domain.mjs';

export const CAPTURE_DEFAULT_SECONDS = 10;

/** 재생 위치(초) → 시작은 내림, 끝은 시작+길이. 길이가 없으면 기본 10초. */
export function capturedRange(currentSeconds, duration = CAPTURE_DEFAULT_SECONDS) {
  const start = Math.max(0, Math.floor(Number(currentSeconds) || 0));
  const length = Math.max(1, Math.floor(Number(duration) || CAPTURE_DEFAULT_SECONDS));
  return { start, end: start + length };
}

/** 길이 단추 값('5'·'10'·'15'·'none') → 끝 초. 'none'은 끝 없이(책갈피)라 null. */
export function endForDuration(startSeconds, duration) {
  if (duration === 'none' || duration === null || duration === undefined || duration === '') return null;
  const start = Number(startSeconds);
  const length = Number(duration);
  if (!Number.isSafeInteger(start) || start < 0) return null;
  if (!Number.isSafeInteger(length) || length <= 0) return null;
  return start + length;
}

/** 끝 칸에 넣을 글자. 끝 없이는 빈 칸. */
export function endTextForDuration(startSeconds, duration) {
  const end = endForDuration(startSeconds, duration);
  return end === null ? '' : formatTimecode(end);
}

/** 반복 미리보기: 현재 위치가 끝에 닿았는지(작은 여유를 둬 끝 화면을 한 번은 보여 준다). */
export function loopBoundaryReached(currentSeconds, startSeconds, endSeconds, slack = 0.35) {
  const now = Number(currentSeconds);
  const start = Number(startSeconds);
  const end = Number(endSeconds);
  if (!Number.isFinite(now) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return false;
  if (end <= start || start < 0) return false;
  return now >= end - slack;
}

let apiPromise = null;

/** YouTube IFrame API를 한 번만 불러온다. 실패·시간 초과면 거부하고 다음에 다시 시도한다. */
export function loadYouTubeIframeApi(timeoutMs = 8000) {
  if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('no-document')); return; }
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('youtube-api-timeout')), timeoutMs);
    const previous = globalThis.onYouTubeIframeAPIReady;
    globalThis.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } catch {}
      if (globalThis.YT?.Player) finish(resolve, globalThis.YT);
      else finish(reject, new Error('youtube-api-missing'));
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => finish(reject, new Error('youtube-api-load-failed'));
    document.head.append(script);
  }).catch((error) => { apiPromise = null; throw error; });
  return apiPromise;
}

/**
 * 재생기와 시작·끝 칸을 잇는다. 반환값이 null이면 화면에 필요한 요소가 없어 연결하지 않은 것이다.
 * 오류·재생 불가면 호출 쪽(panels)이 이 컨트롤을 버리고 단추 묶음을 숨긴다.
 */
export function createSegmentCapture({ player = null, form, scope = document } = {}) {
  // #1097: 재생기 없이도 길이 칩은 칸 값을 채운다 — 재생기는 반복 미리보기에서만 필요하다.
  const find = (id) => { try { return scope?.querySelector?.(`#${id}`) || document.getElementById?.(id) || null; } catch { return null; } };
  const block = find('segment-capture');
  const startInput = form?.elements?.startSeconds;
  const endInput = form?.elements?.endSeconds;
  const loopInput = find('segment-loop');
  const status = find('segment-status');
  const captureButton = find('segment-capture-start');
  if (!block || !startInput || !endInput || !loopInput) return null;

  const durationButtons = [...block.querySelectorAll('[data-segment-duration]')];
  const listeners = new AbortController();
  const { signal } = listeners;
  let destroyed = false;
  let loop = false;

  const setStatus = (text) => {
    if (!status) return;
    status.textContent = text || '';
    status.hidden = !text;
  };
  const setDuration = (value) => {
    for (const button of durationButtons) button.setAttribute('aria-pressed', String(button.dataset.segmentDuration === String(value)));
  };
  const currentTime = () => {
    try { return Number(player.getCurrentTime()) || 0; } catch { return 0; }
  };
  const seekTo = (seconds) => {
    try { player.seekTo(seconds, true); } catch {}
  };
  const play = () => {
    try { player.playVideo(); } catch {}
  };
  const readRange = () => {
    const start = parseTimecode(startInput.value);
    const end = parseTimecode(endInput.value);
    return start !== null && end !== null && end > start ? { start, end } : null;
  };
  const previewFromStart = () => {
    const range = readRange();
    if (!range) return;
    seekTo(range.start);
    play();
  };
  const tick = () => {
    if (destroyed || !loop) return;
    const range = readRange();
    if (!range) return;
    if (loopBoundaryReached(currentTime(), range.start, range.end)) {
      seekTo(range.start);
      play();
    }
  };

  captureButton?.addEventListener('click', () => {
    const range = capturedRange(currentTime(), CAPTURE_DEFAULT_SECONDS);
    startInput.value = formatTimecode(range.start);
    endInput.value = formatTimecode(range.end);
    setDuration(CAPTURE_DEFAULT_SECONDS);
    setStatus(`지금 위치에서 ${CAPTURE_DEFAULT_SECONDS}초를 담았어요.`);
    if (loop) previewFromStart();
  }, { signal });

  for (const button of durationButtons) {
    button.addEventListener('click', () => {
      let start = parseTimecode(startInput.value);
      if (start === null && !String(startInput.value).trim()) {
        start = Math.max(0, Math.floor(currentTime()));
        startInput.value = formatTimecode(start);
      }
      if (start === null) {
        setStatus('시작 시간을 확인한 뒤 길이를 골라 주세요.');
        return;
      }
      endInput.value = endTextForDuration(start, button.dataset.segmentDuration);
      setDuration(button.dataset.segmentDuration);
      setStatus(button.dataset.segmentDuration === 'none' ? '끝을 비웠어요 — 시작 지점만 담아요.' : '');
      if (loop) previewFromStart();
    }, { signal });
  }

  loopInput.addEventListener('change', () => {
    loop = loopInput.checked;
    if (!loop) { setStatus(''); return; }
    if (!readRange()) {
      setStatus('시작과 끝 시간을 먼저 정해 주세요.');
      return;
    }
    setStatus('');
    previewFromStart();
  }, { signal });

  const timer = setInterval(tick, 250);
  setDuration(CAPTURE_DEFAULT_SECONDS);

  return {
    destroy() {
      destroyed = true;
      clearInterval(timer);
      listeners.abort();
    }
  };
}
