import { youtubeIdFrom } from '../public/v41/youtube-id.mjs';
import { validateRange } from './moment-range.js';

/** 공개 순간의 URL과 저장 구간을 배정 조회용 키로 바꾼다. 지원하지 않는 순간은 null이다. */
export function stageKeyForMoment(moment) {
  const url = moment?.url;
  const videoId = youtubeIdFrom(url, { allowThumbnail: false });
  if (!videoId) return null;

  let range;
  try {
    // 구간 필드가 없던 자료도 URL의 t/start에서 책갈피를 복원한다.
    range = validateRange({ startSeconds: moment.startSeconds, endSeconds: moment.endSeconds }, url);
  } catch {
    return null;
  }
  const startSeconds = range.startSeconds ?? null;
  const endSeconds = range.endSeconds ?? null;
  let kind = 'whole';
  if (endSeconds !== null) kind = 'range';
  else if (startSeconds !== null) kind = 'bookmark';
  return { version: 1, platform: 'youtube', videoId, kind, startSeconds, endSeconds };
}

function matchScore(key, reference) {
  if (key.version !== reference.version || key.platform !== reference.platform ||
      key.videoId !== reference.videoId || key.kind !== reference.kind) return 0;
  if (key.kind !== 'range') return key.startSeconds === reference.startSeconds ? 1 : 0;

  const intersection = Math.min(key.endSeconds, reference.endSeconds) - Math.max(key.startSeconds, reference.startSeconds);
  if (intersection <= 0) return 0;
  const union = Math.max(key.endSeconds, reference.endSeconds) - Math.min(key.startSeconds, reference.startSeconds);
  return intersection / union;
}

/**
 * 아직 배정되지 않은 키를 등록부의 고정 기준들과 비교한다.
 * anchors의 각 항목은 { stageId, key, registrationOrder }이며 등록 순번은 유일한 정수다.
 * 기존 배정은 호출자가 그대로 사용하고, 일치하는 기준이 없으면 새 무대를 등록한다.
 */
export function findMatchingStageId(key, anchors) {
  if (!key) return null;
  let best = null;
  let bestScore = 0;
  for (const anchor of anchors) {
    const score = matchScore(key, anchor.key);
    if (score < 0.5) continue;
    if (!best || score > bestScore || (score === bestScore && anchor.registrationOrder < best.registrationOrder)) {
      best = anchor;
      bestScore = score;
    }
  }
  return best?.stageId ?? null;
}
