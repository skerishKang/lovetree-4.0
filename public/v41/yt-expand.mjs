// #833: 쇼츠 재생 칸의 '크게 보기' 단추 + 'YouTube에서 보기' 링크 — 영상 칸 아래 한 줄(#836 2차).
// YouTube 쇼츠 플레이어는 좁은 칸(약 280px)에서 전체 화면 단추를 자동으로 숨기므로 크게 보기 길을
// 우리가 둔다. 영상 위에 겹쳐 두지 않고(#836 1차 반려) 칸 아래 단추 줄로 둔다 — 보드 상세 판의
// 아래 단추 줄과 같은 모양이고, 재생 전(책 .media-links 줄)과 재생 중에 같은 자리에 있다.
// 누르면 영상 칸을 화면 가득(requestFullscreen) 띄우고, 지원 안 되면 화면을 덮는 창
// (LTMedia.openLightbox)으로 물러난다. 크게 본 동안 단추는 '✕ 닫기'로 바뀌고 Esc·뒤로가기로도
// 닫는다(#845 2단계와 같은 판 — 뒤로가기는 주소를 뒤로 가지 않고 크게 보기를 닫는 일로 쓴다).
// 단추 줄 스타일은 문서당 한 번만 넣는다(책·보드·서재는 문서가 따로다).
const STYLE_ID = 'lt-yt-expand-style';
const STYLE_TEXT = `
.yt-video-cell{display:flex;flex-direction:column;gap:6px}
.yt-video-stage{display:flex;flex-direction:column;align-items:center}
.yt-video-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:0 2px}
.yt-video-row.no-open{justify-content:flex-end}
.yt-video-row a,.yt-video-row button{display:inline-flex;align-items:center;min-height:44px;padding:8px 14px;border-radius:var(--lt-r-pill,999px);border:1px solid var(--lt-gold-line,rgba(255,230,166,.45));background:rgba(255,230,166,.08);color:inherit;font-size:13px;line-height:1.2;white-space:nowrap;text-decoration:none}
.yt-video-row button{cursor:pointer}
.yt-video-row a:hover,.yt-video-row button:hover{background:rgba(255,230,166,.18)}
.yt-video-row a:focus-visible,.yt-video-row button:focus-visible{outline:2px solid #e8b8c9;outline-offset:2px}
/* #836: 크게 본 동안(검은 바탕)은 color:inherit 이 어두운 금색을 물려받아 단추가 거의 안 보였다 —
   밝은 글자·밝은 반투명 테두리로 4.5:1 이상을 보증한다(261118 실측 17.9:1). */
.yt-video-cell:fullscreen .yt-video-row a,.yt-video-cell:fullscreen .yt-video-row button{color:#f5f1e9;border-color:rgba(255,230,166,.7);background:rgba(255,230,166,.14)}
.yt-video-cell:fullscreen .yt-video-row a:hover,.yt-video-cell:fullscreen .yt-video-row button:hover{background:rgba(255,230,166,.24)}
.yt-video-cell:fullscreen{background:#000;justify-content:center;gap:12px;padding:12px;box-sizing:border-box}
.yt-video-cell:fullscreen .yt-video-stage{flex:1;min-height:0}
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
 * 칸(.yt-video-cell)=무대(.yt-video-stage)+아래 단추 줄(.yt-video-row)을 만든다.
 * 무대에 iframe을 넣으면 되고, 미리 넣지 않는다(iframe을 옮기면 재생이 끊긴다).
 * showOpen:false 면 링크를 거둔다(보드 상세처럼 YouTube 링크를 이미 아래 줄에 둔 판).
 */
export function mountExpandControls(host, { url, openUrl = '', title = '', vertical = false, lightbox = null, showOpen = true } = {}) {
  const doc = host?.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'yt-video-cell' + (vertical ? ' is-vertical' : '');
  const stage = doc.createElement('div');
  stage.className = 'yt-video-stage';
  const row = doc.createElement('div');
  row.className = 'yt-video-row' + (showOpen ? '' : ' no-open');
  if (showOpen) {
    const open = doc.createElement('a');
    open.className = 'yt-video-open';
    open.href = openUrl || url || '#';
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.referrerPolicy = 'no-referrer';
    open.textContent = 'YouTube ↗';
    row.append(open);
  }
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'yt-video-expand';
  button.textContent = '크게 보기';
  button.setAttribute('aria-label', '영상 크게 보기');
  row.append(button);
  wrap.append(stage, row);
  ensureStyle(doc);
  host.replaceChildren(wrap);
  const context = { wrap, stage, row, button };
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (doc.fullscreenElement === wrap) {
      void doc.exitFullscreen?.();
      return;
    }
    void expandVideo(wrap, { url, title, vertical, lightbox }).then((result) => {
      if (result === 'fullscreen') setExpanded(context, doc, true);
    });
  });
  // 크게 본 동안 단추는 '✕ 닫기' — Esc로 나가면 전체 화면 변화에서 되돌린다.
  const onFullscreenChange = () => setExpanded(context, doc, doc.fullscreenElement === wrap);
  doc.addEventListener('fullscreenchange', onFullscreenChange);
  // #845 2단계와 같은 판: 크게 본 동안 뒤로가기는 주소를 뒤로 가지 않고 크게 보기를 닫는 일로 쓴다.
  // 열 때 주소가 그대로인 기록 한 칸을 쌓고, 뒤로가기(popstate)가 오면 전체 화면을 닫는다.
  // 닫는 다른 길(단추·Esc)에서는 기록을 소비하지 않는다(#866 261118 실측 — 소비하면 프레임 기록까지
  // 훑어 안쪽 문서가 다시 뜬다. 한 번 밀리는 것은 창 판과 같은 값으로 둔다).
  context.pushForExpand = () => {
    try { history.pushState({ ltYtExpand: 1 }, ''); } catch { /* 파일 문서 등 pushState 가 막힌 곳 */ }
  };
  const onPopState = () => {
    if (doc.fullscreenElement === wrap) void doc.exitFullscreen?.();
  };
  window.addEventListener('popstate', onPopState);
  // Esc 닫힘은 브라우저가 전체 화면에서 원래 해 주지만, 초점이 이 문서에 있을 때는 확실히 돌린다.
  const onKeyDown = (event) => {
    if (event.key !== 'Escape' || doc.fullscreenElement !== wrap) return;
    event.stopPropagation();
    void doc.exitFullscreen?.();
  };
  doc.addEventListener('keydown', onKeyDown, true);
  context.teardown = () => {
    doc.removeEventListener('fullscreenchange', onFullscreenChange);
    window.removeEventListener('popstate', onPopState);
    doc.removeEventListener('keydown', onKeyDown, true);
  };
  return context;
}
function setExpanded(context, doc, on) {
  const { wrap, button } = context;
  if (on) {
    button.textContent = '✕ 닫기';
    button.setAttribute('aria-label', '크게 보기 닫기');
    context.pushForExpand?.();
  } else {
    button.textContent = '크게 보기';
    button.setAttribute('aria-label', '영상 크게 보기');
  }
}
/** 영상 칸을 화면 가득 띄우려 하고, 안 되면 덮는 창으로 물러난다. 결과는 'fullscreen'|'lightbox'|'none'. */
export async function expandVideo(wrap, { url, title = '', vertical = false, lightbox = null } = {}) {
  const doc = wrap?.ownerDocument;
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
