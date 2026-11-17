// #833: 재생 중인 영상 칸 모서리의 '크게 보기' 단추 + 'YouTube에서 보기' 링크.
// YouTube 쇼츠 플레이어는 좁은 칸(약 280px)에서 전체 화면 단추를 자동으로 숨기므로,
// 칸 바깥 모서리에 우리 단추를 둔다. 누르면 영상 칸을 화면 가득(requestFullscreen) 띄우고,
// 지원 안 되면 화면을 덮는 창(LTMedia.openLightbox)으로 물러난다. 세로 영상은 세로 비율 유지·가운데.
// 단추 스타일은 문서당 한 번만 넣는다(책·보드·서재는 문서가 따로다).
const STYLE_ID = 'lt-yt-corner-style';
const STYLE_TEXT = `
.yt-video-cell{position:relative}
.yt-video-stage{display:flex;flex-direction:column;align-items:center}
.yt-video-corner{position:absolute;top:8px;right:8px;z-index:5;display:flex;gap:8px;align-items:center}
.yt-video-corner a,.yt-video-corner button{display:inline-flex;align-items:center;min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(12,10,16,.78);color:#f5f1e9;font-size:13px;line-height:1.2;white-space:nowrap;text-decoration:none}
.yt-video-corner button{cursor:pointer}
.yt-video-corner a:focus-visible,.yt-video-corner button:focus-visible{outline:2px solid #e8b8c9;outline-offset:2px}
.yt-video-cell:fullscreen{background:#000}
.yt-video-cell:fullscreen .yt-video-corner{position:fixed;top:12px;right:12px}
.yt-video-cell:fullscreen .yt-video-stage{display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.yt-video-cell:fullscreen .yt-video-stage iframe{width:min(100%,177.78vh);aspect-ratio:16/9;height:auto;border:0}
.yt-video-cell.is-vertical:fullscreen .yt-video-stage iframe{width:auto;height:min(100%,177.78vw);aspect-ratio:9/16}
`;
function ensureStyle(doc) {
  if (!doc || doc.getElementById?.(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  doc.head?.appendChild(style);
}
function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
/**
 * 재생 중 iframe을 넣을 칸을 만든다. host 안의 기존 내용은 비우고
 * 래퍼(.yt-video-cell)+모서리 단추줄+무대(.yt-video-stage)를 만든다.
 * 무대에 iframe을 넣으면 되고, 미리 넣지 않는다(iframe을 옮기면 재생이 끊긴다).
 */
export function mountExpandControls(host, { url, openUrl = '', title = '', vertical = false, lightbox = null } = {}) {
  const doc = host?.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'yt-video-cell' + (vertical ? ' is-vertical' : '');
  const stage = doc.createElement('div');
  stage.className = 'yt-video-stage';
  const corner = doc.createElement('div');
  corner.className = 'yt-video-corner';
  const open = doc.createElement('a');
  open.className = 'yt-video-open';
  open.href = openUrl || url || '#';
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.referrerPolicy = 'no-referrer';
  open.textContent = 'YouTube에서 보기 ↗';
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'yt-video-expand';
  button.textContent = '⤢ 크게 보기';
  button.setAttribute('aria-label', '영상 크게 보기');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void expandVideo(wrap, { url, title, vertical, lightbox });
  });
  corner.append(open, button);
  wrap.append(stage, corner);
  ensureStyle(doc);
  host.replaceChildren(wrap);
  return { wrap, stage, expand: () => expandVideo(wrap, { url, title, vertical, lightbox }) };
}
/** 영상 칸을 화면 가득 띄우려 하고, 안 되면 덮는 창으로 물러난다. 결과는 'fullscreen'|'lightbox'|'none'. */
export async function expandVideo(wrap, { url, title = '', vertical = false, lightbox = null } = {}) {
  const request = wrap?.requestFullscreen?.bind(wrap);
  if (request) {
    try {
      await request();
      return 'fullscreen';
    } catch {
      // 바깥 iframe이 전체 화면을 허용하지 않거나 거부되면 덮는 창 아래로.
    }
  }
  const fallback = typeof lightbox === 'function' ? lightbox : (window.LTMedia && window.LTMedia.openLightbox ? (u, t, v) => window.LTMedia.openLightbox(u, t, v) : null);
  if (fallback) {
    try { fallback(url, title, vertical ? true : null); return 'lightbox'; } catch { return 'none'; }
  }
  return 'none';
}
export function ytOpenUrl(videoId) {
  return 'https://www.youtube.com/watch?v=' + encodeURIComponent(String(videoId || ''));
}
