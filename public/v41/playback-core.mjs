// #792 3단계: 책의 순간들을 이어 보는 재생 대기열. 화면·플레이어와 분리한 순수 계산만 둔다.
// YouTube 순간만 담고, 구간이 없으면 시작부터 30초를 쓴다 — 긴 영상 하나가 하이라이트 릴 전체를 붙잡지 않게.
export const FALLBACK_SECONDS = 30;

function safeSeconds(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** 한 순간 → 재생 항목. YouTube가 아니면 null(이번 단계에서는 건너뛴다). */
export function playbackItemOf(moment, describe, titleOf = (m) => m?.title || '순간', dateOf = (m) => m?.date || '') {
  if (!moment) return null;
  let info = null;
  try { info = describe?.(moment.url || ''); } catch { return null; }
  if (!info || info.kind !== 'youtube' || !info.videoId) return null;
  const start = safeSeconds(moment.startSeconds) ?? 0;
  const rawEnd = safeSeconds(moment.endSeconds);
  const end = rawEnd !== null && rawEnd > start ? rawEnd : start + FALLBACK_SECONDS;
  return {
    id: String(moment.id ?? ''),
    videoId: info.videoId,
    title: titleOf(moment),
    date: dateOf(moment),
    start,
    end,
    duration: end - start,
    fallback: rawEnd === null || rawEnd <= start,
    unavailable: false
  };
}

/** 책 순서 그대로. 다른 플랫폼·YouTube가 아닌 순간은 넣지 않는다. */
export function buildPlaybackQueue(moments, describe, titleOf, dateOf) {
  if (!Array.isArray(moments)) return [];
  return moments.map((moment) => playbackItemOf(moment, describe, titleOf, dateOf)).filter(Boolean);
}

/** 지금 자리에서 delta 방향으로 갈 수 있는 다음 재생 가능 항목. 없으면 -1. */
export function stepPlayable(items, from, delta) {
  if (!Array.isArray(items) || !items.length) return -1;
  let index = Number(from) + (delta < 0 ? -1 : 1);
  while (index >= 0 && index < items.length) {
    if (!items[index].unavailable) return index;
    index += delta < 0 ? -1 : 1;
  }
  return -1;
}

/** 처음 재생할 수 있는 자리. 전부 볼 수 없으면 -1. */
export function firstPlayable(items) {
  return Array.isArray(items) ? items.findIndex((item) => !item.unavailable) : -1;
}

/** 칩에 쓸 글자: 제목 + 길이. 볼 수 없으면 '볼 수 없음'. */
export function playbackChipText(item) {
  if (!item) return '';
  return `${item.title} ${item.duration}초${item.unavailable ? ' · 볼 수 없음' : ''}`;
}

/** 구간 끝에 닿았는지(±1초 확인용). */
export function segmentReached(currentSeconds, endSeconds, slack = 0.35) {
  const now = Number(currentSeconds);
  const end = Number(endSeconds);
  return Number.isFinite(now) && Number.isFinite(end) && now >= end - slack;
}
