// Reuses src/media.js parser (LoveBud b80647f1); display only.
(() => {
/* Pure parser excerpt from src/media.js; click-only network behavior follows below. */

const MAX_START_SECONDS = 12 * 60 * 60;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_URL_LENGTH = 2048;

/** '83' · '1:23' · '1:02:03' · '1h2m3s' · 한국어 단위까지 → 초. 0 이하·형식 외는 null. */
function parseTimeToSeconds(value = '') {
  const normalized = String(value ?? '').trim()
    .replace(/초/g, 's')
    .replace(/분/g, 'm')
    .replace(/시간/g, 'h')
    .replace(/\s+/g, '');
  if (!normalized || normalized.startsWith('-')) return null;

  let seconds = null;
  if (/^\d+(?::\d{1,2}){1,2}$/.test(normalized)) {
    const parts = normalized.split(':').map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
    if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (/^\d+$/.test(normalized)) {
    seconds = Number(normalized);
  } else {
    const time = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (time && (time[1] || time[2] || time[3])) seconds = Number(time[1] || 0) * 3600 + Number(time[2] || 0) * 60 + Number(time[3] || 0);
  }
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  seconds = Math.floor(seconds);
  if (seconds <= 0 || seconds > MAX_START_SECONDS) return null;
  return seconds;
}

/** 초 → 'm:ss'(1시간 미만) 또는 'h:mm:ss'. */
function formatStart(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function startFrom(parsed) {
  const search = parsed.searchParams.get('t') || parsed.searchParams.get('start');
  const hash = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
  return parseTimeToSeconds(search || hash.get('t') || hash.get('start'));
}

/** watch/shorts/live/youtu.be 네 형태만 YouTube로 본다. 재생목록만 있는 링크는 일반 링크. */
function youtubeVideoId(parsed) {
  const path = parsed.pathname || '';
  if (parsed.hostname === 'youtu.be') {
    const [id] = path.split('/').filter(Boolean);
    return id && VIDEO_ID.test(id) ? id : null;
  }
  if (path === '/watch') {
    const id = parsed.searchParams.get('v');
    return id && VIDEO_ID.test(id) ? id : null;
  }
  const single = path.match(/^\/(shorts|live)\/([^/?#]+)/);
  if (single) return VIDEO_ID.test(single[2]) ? single[2] : null;
  return null;
}

/**
 * 입력 링크를 표시용 정보로 바꾼다. 원본은 그대로 두고(`original`), 여는 주소만 계산한다.
 * kind: 'youtube' | 'link' | 'invalid' | 'none'
 */
function parseMomentLink(value = '') {
  const original = String(value ?? '').trim();
  if (!original) return { kind: 'none', original: '', label: '', openUrl: '' };

  let parsed = null;
  try { parsed = new URL(original); } catch { return { kind: 'invalid', original, label: '링크 형태를 알아듣지 못했어요.', openUrl: '' }; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || original.length > MAX_URL_LENGTH) {
    return { kind: 'invalid', original, label: 'http 또는 https 링크만 사용할 수 있어요.', openUrl: '' };
  }

  if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    const videoId = youtubeVideoId(parsed);
    if (videoId) {
      const startSeconds = startFrom(parsed);
      const openUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${startSeconds ? `&t=${startSeconds}s` : ''}`;
      return {
        kind: 'youtube', original, videoId, startSeconds,
        openUrl,
        label: startSeconds ? `YouTube 링크 · 시작 ${formatStart(startSeconds)}` : 'YouTube 링크',
        actionLabel: 'YouTube에서 열기'
      };
    }
  }

  return { kind: 'link', original, openUrl: parsed.href, label: parsed.hostname.replace(/^www\./, ''), actionLabel: '원본 링크 열기' };
}


// Member media is URL-derived. No request is made until an explicit load action.
function describe(value=''){
 const link=parseMomentLink(value);
 if(!link.openUrl)return {...link,kind:link.kind==='none'?'none':'invalid'};
 if(link.kind==='youtube')return {...link,loadUrl:'https://i.ytimg.com/vi/'+link.videoId+'/hqdefault.jpg',loadLabel:'영상 썸네일 불러오기'};
 const u=new URL(link.openUrl);let path=u.pathname;try{path=decodeURIComponent(path)}catch{}
 const kind=/\.(?:png|jpe?g|webp|avif|gif)$/i.test(path)?'photo':/\.(?:mp4|webm|ogv)$/i.test(path)?'video':'link';
 const privateFile=u.origin===globalThis.location?.origin && /^\/api\/media\/[a-f0-9-]+\.(?:png|jpg|gif|webp|mp4|webm)$/.test(u.pathname);
 return {...link,kind,privateFile,loadUrl:kind==='link'?'':u.href,loadLabel:kind==='photo'?'사진 불러오기':'영상 불러오기',label:kind==='photo'?'사진 링크':kind==='video'?'영상 링크':link.label};
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function markup(url,title=''){
 const m=describe(url);
 if(m.kind==='none')return '';
 if(m.kind==='invalid')return '<p class="lt-media-error">링크를 열 수 없어요. 원본 주소를 확인해 주세요.</p>';
 const canLoad=!!m.loadUrl&&(new URL(m.loadUrl).protocol==='https:'||m.privateFile);
 let html = '<div class="lt-media" data-lt-url="'+esc(url)+'" data-lt-title="'+esc(title)+'"><div class="lt-media-body">'+(canLoad?'<button type="button" data-lt-load>'+esc(m.loadLabel)+'</button>':'<span>'+esc(m.label)+'</span>')+'</div><p class="lt-media-status" role="status">'+(canLoad?'불러오기를 누르면 원본 사이트에 연결됩니다.':'원본 사이트에서 확인할 수 있어요.')+'</p><a href="'+esc(m.openUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+esc(m.kind==='youtube'?m.actionLabel+(m.startSeconds?' · 시작 '+formatStart(m.startSeconds):''):'원본 링크 열기')+' ↗</a></div>';
 if(m.privateFile)html=html.replace('불러오기를 누르면 원본 사이트에 연결됩니다.','내 계정에 보관한 파일입니다. 불러오기를 눌러 확인하세요.').replace(/<a href=[\s\S]*?<\/a>/,'');
 return html;
}
async function load(root){
 const m=describe(root.dataset.ltUrl),body=root.querySelector('.lt-media-body'),status=root.querySelector('.lt-media-status');
 if(!m.loadUrl||(new URL(m.loadUrl).protocol!=='https:'&&!m.privateFile)||root.dataset.ltLoading)return;
 root.dataset.ltLoading='1';
 const element=document.createElement(m.kind==='video'?'video':'img');
 status.textContent='불러오는 중이에요…';
 const failed=()=>{delete root.dataset.ltLoading;body.replaceChildren();const retry=document.createElement('button');retry.type='button';retry.dataset.ltLoad='';retry.textContent='다시 불러오기';body.append(retry);status.textContent='불러오지 못했어요. 원본 링크에서 확인하거나 다시 시도해 주세요.';};
 element.addEventListener('error',failed,{once:true});
 if(m.kind==='video'){element.className='lt-user-video';element.controls=true;element.preload='metadata';element.playsInline=true;element.addEventListener('loadedmetadata',()=>status.textContent='영상이 준비됐어요. 재생을 눌러 보세요.',{once:true});}
 else{element.alt=root.dataset.ltTitle||'기록한 사진';element.referrerPolicy='no-referrer';element.addEventListener('load',()=>status.textContent=m.kind==='youtube'?'썸네일을 불러왔어요. 영상은 YouTube에서 열어 보세요.':'사진을 불러왔어요.',{once:true});}
 let src=m.loadUrl;
 if(m.privateFile){
  try{const {createWorkspaceApi}=await import('/v41/api.mjs');const answer=await createWorkspaceApi().fetchMedia(new URL(m.loadUrl).pathname.slice(11));if(!answer.ok)throw Error('unavailable');if(!root.isConnected)return;src=URL.createObjectURL(answer.blob);ownedUrls.set(element,src);}
  catch{failed();status.textContent='파일이 없거나 로그인 확인이 필요해요. 내 기록을 다시 불러온 뒤 시도해 주세요.';return;}
 }
 delete root.dataset.ltLoading;body.replaceChildren(element);element.src=src;
}
const ownedUrls=new Map();
window.LTMedia={describe,markup};
if(typeof document!=='undefined'){
 const cleanup=()=>{for(const [node,url] of ownedUrls)if(!node.isConnected){URL.revokeObjectURL(url);ownedUrls.delete(node);}};
 new MutationObserver(cleanup).observe(document.documentElement,{childList:true,subtree:true});
 addEventListener('pagehide',()=>{for(const url of ownedUrls.values())URL.revokeObjectURL(url);ownedUrls.clear();});
 document.addEventListener('pointerdown',e=>{if(e.target.closest?.('.lt-media'))e.stopPropagation();},true);
 document.addEventListener('click',e=>{const root=e.target.closest?.('.lt-media');if(!root)return;e.stopImmediatePropagation();if(e.target.closest('[data-lt-load]')){e.preventDefault();load(root);}},true);
}
})();