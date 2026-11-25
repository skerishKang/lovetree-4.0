// #1378 책 화면: 실제 재생을 시작한 뒤 임베드 상태만 확인합니다.
// iframe API의 로딩 경로나 호출 시점을 변경하지 않습니다.
export function monitorBookYoutubeFrame(frame, stage, videoId, originalUrl) {
  if (!frame || !stage) return;
  // 책의 다른 순간이 먼저 재생 중이었다면 기존 자동 재생 iframe을 종료합니다.
  for (const previous of document.querySelectorAll('iframe.yt-frame')) {
    if (previous !== frame) previous.remove();
  }
  const controller = new AbortController();
  const observer = new MutationObserver(() => {
    if (!frame.isConnected) {
      controller.abort();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const unavailable = () => {
    if (!frame.isConnected) return;
    const note = document.createElement('p');
    note.className = 'yt-unavailable-note';
    note.setAttribute('role', 'status');
    note.textContent = '이 영상은 여기서 재생할 수 없습니다.';
    const link = document.createElement('a');
    link.className = 'yt-unavailable-link';
    link.href = originalUrl || 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'YouTube에서 보기';
    stage.replaceChildren(note, link);
  };
  window.addEventListener('message', event => {
    if (!frame.isConnected || event.source !== frame.contentWindow ||
        !['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(event.origin)) return;
    let message = event.data;
    if (typeof message === 'string') {
      try { message = JSON.parse(message); } catch { return; }
    }
    if (message?.event === 'onError' && [2, 5, 100, 101, 150, 153].includes(Number(message.info))) {
      unavailable();
    }
  }, { signal: controller.signal });
  void import('/v41/video-status.mjs')
    .then(module => module.fetchVideoStatus(videoId))
    .then(status => {
      if (['noembed', 'gone', 'private'].includes(status)) unavailable();
    })
    .catch(() => {});
}
