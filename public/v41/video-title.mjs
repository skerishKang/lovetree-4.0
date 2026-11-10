// 영상 제목 조회 한 벌(#344, 2026-11-10). 서버 oEmbed 프록시(/api/youtube/oembed)만 쓴다.
// 빠른 추가·자세한 추가가 미리보기 때 받아 둔 영상 제목을 저장 시 mediaMetadata.title로 함께 넘기는 데 쓴다.
// 실패(응답 실패·모양 틀림)는 조용히 '' — 자동 제목은 기존 도메인 규칙(suggestMomentTitle)으로 물러난다.
export async function fetchVideoTitle(videoId, fetchImpl = (...args) => globalThis.fetch(...args)) {
  const id = String(videoId ?? '').trim();
  if (!id) return '';
  try {
    const answer = await fetchImpl('/api/youtube/oembed?v=' + encodeURIComponent(id), { headers: { accept: 'application/json' } });
    if (!answer?.ok) return '';
    const data = await answer.json();
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    return title || '';
  } catch {
    return '';
  }
}
