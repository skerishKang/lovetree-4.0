// 영상 제목 조회 한 벌(#344, 2026-11-10). 서버 oEmbed 프록시(/api/youtube/oembed)만 쓴다.
// 빠른 추가·자세한 추가가 미리보기 때 받아 둔 영상 제목을 저장 시 mediaMetadata.title로 함께 넘기는 데 쓴다.
// 실패(응답 실패·모양 틀림)는 조용히 '' — 자동 제목은 기존 도메인 규칙(suggestMomentTitle)으로 물러난다.
export async function fetchVideoMetadata(videoId, fetchImpl = (...args) => globalThis.fetch(...args)) {
  const id = String(videoId ?? '').trim();
  if (!id) return null;
  try {
    const answer = await fetchImpl('/api/youtube/oembed?v=' + encodeURIComponent(id), { headers: { accept: 'application/json' } });
    if (!answer?.ok) return null;
    const data = await answer.json();
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    const channel = typeof data?.authorName === 'string' ? data.authorName.trim() : '';
    const thumbnail = typeof data?.thumbnailUrl === 'string' ? data.thumbnailUrl.trim() : '';
    if (!title && !channel && !thumbnail) return null;
    return { title, channel, thumbnail };
  } catch {
    return null;
  }
}

export async function fetchVideoTitle(videoId, fetchImpl = (...args) => globalThis.fetch(...args)) {
  const meta = await fetchVideoMetadata(videoId, fetchImpl);
  return meta?.title || '';
}

// 틱톡 영상 정보 한 벌(#791). 서버 틱톡 oEmbed 프록시(/api/tiktok/oembed)만 쓴다.
// 짧은 주소(vm·vt)도 서버가 정본 id까지 풀어 준다. 실패는 조용히 null.
export async function fetchTikTokMetadata(value, fetchImpl = (...args) => globalThis.fetch(...args)) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const answer = await fetchImpl('/api/tiktok/oembed?url=' + encodeURIComponent(raw), { headers: { accept: 'application/json' } });
    if (!answer?.ok) return null;
    const data = await answer.json();
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    const authorName = typeof data?.authorName === 'string' ? data.authorName.trim() : '';
    const thumbnailUrl = typeof data?.thumbnailUrl === 'string' ? data.thumbnailUrl.trim() : '';
    const videoId = typeof data?.videoId === 'string' ? data.videoId.trim() : '';
    const width = Number(data?.width) || 0;
    const height = Number(data?.height) || 0;
    if (!title && !authorName && !thumbnailUrl && !videoId) return null;
    return { title, authorName, thumbnailUrl, videoId, width, height };
  } catch {
    return null;
  }
}
