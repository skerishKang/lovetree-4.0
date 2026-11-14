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

/** watch/shorts/live/embed/youtu.be 형태만 YouTube로 본다. 재생목록만 있는 링크는 일반 링크. 임베드도 start= 시점을 살려 watch로 정규화한다. */
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
  const single = path.match(/^\/(shorts|live|embed)\/([^/?#]+)/);
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
      // #393: /shorts/ 주소는 세로 영상이다. 틀·썸네일 비율 판정은 이 한 곳에서 나온다.
      const vertical = /^\/shorts\//.test(parsed.pathname || '');
      return {
        kind: 'youtube', original, videoId, startSeconds, vertical,
        openUrl,
        label: startSeconds ? `YouTube 링크 · 시작 ${formatStart(startSeconds)}` : 'YouTube 링크',
        actionLabel: 'YouTube에서 열기'
      };
    }
  }

  return { kind: 'link', original, openUrl: parsed.href, label: parsed.hostname.replace(/^www\./, ''), actionLabel: '원본 링크 열기' };
}


// Recognize only our two public aliases, then fetch private files on this origin.
function privateAssetName(value,currentOrigin=globalThis.location?.origin){
 try{
  if(!currentOrigin)return null;
  const u=new URL(value,currentOrigin),aliases=['https://lovetree-4-0.pages.dev','https://lovetree.padiem.net'];
  if(u.username||u.password||u.search||u.hash)return null;
  if(u.origin!==currentOrigin&&!(aliases.includes(currentOrigin)&&aliases.includes(u.origin)))return null;
  return /^\/api\/media\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:png|jpg|gif|webp|mp4|webm))$/.exec(u.pathname)?.[1]||null;
 }catch{return null;}
}
// #393: 썸네일 주소 한 벌. 세로(쇼츠)는 원본 비율(oardefault·잘림 없음), 가로는 hqdefault.
// oardefault 가 없는 영상(일반 가로 등)은 부르는 쪽에서 hqdefault 로 물러난다.
function youtubeThumbUrl(videoId, vertical = false) {
  return 'https://i.ytimg.com/vi/' + videoId + '/' + (vertical ? 'oardefault.jpg' : 'hqdefault.jpg');
}
function safeSavedYoutubeThumb(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && /(?:^|\.)ytimg\.com$/i.test(u.hostname) ? u.href : '';
  } catch { return ''; }
}
function youtubeCandidates(videoId, vertical = false, mediaMetadata = null) {
  const saved = safeSavedYoutubeThumb(mediaMetadata?.thumbnail || mediaMetadata?.thumbnailUrl);
  const list = [];
  if (saved) list.push(saved);
  if (videoId) {
    if (!saved && vertical) list.push(youtubeThumbUrl(videoId, true));
    list.push(youtubeThumbUrl(videoId, false));
    list.push('https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg');
  }
  return [...new Set(list.filter(Boolean))];
}
// Member media is URL-derived. No request is made until an explicit load action.
function describe(value=''){
 const link=parseMomentLink(value);
 if(!link.openUrl)return {...link,kind:link.kind==='none'?'none':'invalid'};
 if(link.kind==='youtube')return {...link,loadUrl:youtubeThumbUrl(link.videoId,link.vertical),loadLabel:'영상 썸네일 불러오기'};
 const u=new URL(link.openUrl);let path=u.pathname;try{path=decodeURIComponent(path)}catch{}
 const kind=/\.(?:png|jpe?g|webp|avif|gif)$/i.test(path)?'photo':/\.(?:mp4|webm|ogv)$/i.test(path)?'video':'link';
 const privateFile=!!privateAssetName(u.href);
 if(privateFile)u.href=globalThis.location.origin+u.pathname;
 return {...link,kind,privateFile,loadUrl:kind==='link'?'':u.href,loadLabel:kind==='photo'?'사진 불러오기':'영상 불러오기',label:kind==='photo'?'사진 링크':kind==='video'?'영상 링크':link.label};
}
// #327 1부(대표 결정 2026-11-09): 화면 판정은 이 한 함수. 내 기록(서버 기록·로그인 소유자)만
// YouTube 썸네일을 처음부터 보여 준다. 공유·예시·파일 기록은 눌렀을 때만 요청한다(기존 규칙).
function autoLoadMedia(source, owned) {
  return source === 'server' && owned === true;
}
// markup 을 그리는 문서의 기록 상태를 읽는다. 셸 문서는 window.LT41·body 데이터 속성을 쓰고,
// 화면 문서(iframe)는 parent 의 같은 값을 읽는다. 아무 근거도 없으면(시험·파일 기록) 누를 때만.
function mediaContext() {
  try {
    const shell = window.LT41 ? window : (window.parent && window.parent.LT41 ? window.parent : null);
    // 기록 상태 데이터 속성은 셸 문서에 있다. 화면 문서(iframe)는 셸 것을 읽는다.
    const body = (shell && shell.document && shell.document.body) || (typeof document !== 'undefined' && document.body) || null;
    const source = (shell && shell.LT41 && typeof shell.LT41.source === 'string' && shell.LT41.source) || (body && body.dataset.recordSource) || '';
    const owned = source === 'server' && !!(body && body.dataset.member === 'in');
    return { source, owned };
  } catch { return { source: '', owned: false }; }
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// #393: 세로 영상 판정 한 벌 — /shorts/ 주소 또는 영상 정보의 가로세로(세로가 더 길면 세로).
// #584: 주소·정보만으로 못 정하면 썸네일 실측으로 보강한다(oardefault 가로세로).
//   oEmbed의 가로세로는 watch 주소 기준 항상 200×113(가로)이라 신호로 못 쓴다(2026-11-14 실측).
//   oardefault는 세로 영상에만 있고(가로는 404) 세로는 높이가 더 크다 — Image 요소의
//   naturalWidth/naturalHeight 읽기는 CORS 없이도 가능하다(픽셀 읽기와 달리 오염되지 않음).
const verticalProbed = new Map();
const verticalPending = new Map();
function verticalFromProbe(data) {
  const w = Number(data?.width), h = Number(data?.height);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && h > w;
}
function probeVertical(url) {
  const m = describe(url);
  if (m.kind !== 'youtube') return Promise.resolve(false);
  const id = m.videoId;
  if (verticalProbed.has(id)) return Promise.resolve(verticalProbed.get(id));
  if (verticalPending.has(id)) return verticalPending.get(id);
  const p = new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(false);
    const img = new Image();
    img.onload = () => resolve(verticalFromProbe({ width: img.naturalWidth, height: img.naturalHeight }));
    img.onerror = () => resolve(false);
    img.src = 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/oardefault.jpg';
  });
  verticalPending.set(id, p);
  return p.then((v) => { verticalProbed.set(id, v); verticalPending.delete(id); return v; });
}
// #584: 이미 그린 재생 칸을 세로 판정 결과로 올려 고친다. 책 화면이 넘긴 뒤에 부른다.
function upgradeVerticals(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll('.yt-play[data-yt-play]:not([data-yt-probed])')) {
    el.dataset.ytProbed = '1';
    if (el.dataset.ytVertical === '1') continue;
    const id = el.dataset.ytPlay;
    void probeVertical('https://www.youtube.com/watch?v=' + id).then((v) => {
      if (!v || !el.isConnected) return;
      el.classList.add('is-vertical');
      el.dataset.ytVertical = '1';
      const img = el.querySelector('img');
      if (img && /hqdefault\.jpg/.test(img.getAttribute('src') || '')) img.src = youtubeThumbUrl(id, true);
      if (typeof window !== 'undefined' && window.__TRACK59__?.rejudgeOverflow) window.__TRACK59__.rejudgeOverflow();
    });
  }
}
function verticalVideo(url, mediaMetadata = null) {
  const m = describe(url);
  if (m.kind !== 'youtube') return false;
  const metaVertical = Number(mediaMetadata?.width) > 0 && Number(mediaMetadata?.height) > Number(mediaMetadata?.width);
  // #584: 썸네일 실측으로 세로가 밝혀진 영상도 세로로 답한다(크게 보기·그 자리 재생이 같은 판정을 쓰게).
  if (verticalProbed.get(m.videoId) === true) return true;
  return !!(m.vertical || metaVertical);
}
function markup(url,title='',mediaMetadata=null,momentId='',context=null,momentMeta=null,opts=null){
 const m=describe(url);
 if(m.kind==='none')return '';
 if(m.kind==='invalid')return '<p class="lt-media-error">링크를 열 수 없어요. 원본 주소를 확인해 주세요.</p>';
 // #601: 보드 카드의 큰 썸네일 한 장 — 크게 보기·안내 글·원본 링크·두 번째 제목은 상세가 맡는다.
 const compact=!!opts?.compact;
 const canLoad=!!m.loadUrl&&(new URL(m.loadUrl).protocol==='https:'||m.privateFile);
 const ctx=context||mediaContext();
 const ownedServer=autoLoadMedia(ctx.source,ctx.owned);
 const auto=canLoad&&m.kind==='youtube'&&ownedServer;
 const vertical=verticalVideo(url,mediaMetadata);
 const caption=[mediaMetadata?.title,mediaMetadata?.channel,mediaMetadata?.source].filter(value=>typeof value==='string'&&value.trim()).join(' · ');
 const cached=(caption&&!compact)?'<p class="lt-media-title">'+esc(caption)+'</p>':'';
 const fb=globalThis.LTThumbFallback||null;
 const momentRecord={id:momentId,title,url,mediaMetadata,...(momentMeta||{})};
 const candidates=auto?youtubeCandidates(m.videoId,vertical,mediaMetadata):[];
 const previewSrc=candidates[0]||(vertical?youtubeThumbUrl(m.videoId,true):m.loadUrl);
 const previewFallback=auto
  ?(fb
    ?fb.thumbFallbackAttrs(momentRecord,{candidates,writable:ownedServer&&!globalThis.LTDEMO?.readOnly,videoUnavailable:true,variant:'media',momentId,treeId:momentMeta?.treeId||''})
    :' data-lt-candidates="'+esc(JSON.stringify(candidates))+'" data-lt-cand-index="0" data-lt-fallback-mode="card"')
  :'';
 const linkCard=(ownedServer&&m.kind==='link'&&fb)
  ?fb.fallbackCardMarkup(momentRecord,{writable:!globalThis.LTDEMO?.readOnly,videoUnavailable:false,variant:'media',momentId,treeId:momentMeta?.treeId||''})
  :'';
 const body=auto
  // 내 기록: 썸네일을 처음부터 보여 준다(no-referrer·lazy). 재생 표시는 썸네일 전체를 덮는 단추라
  // 썸네일 아무 곳이나 눌러도 그 자리에서 재생한다. autoplay 는 누른 뒤 만들어지는 embed 주소에만 있다.
  ?'<figure class="lt-yt-preview" data-lt-thumb-host><img src="'+esc(previewSrc)+'" alt="'+esc(title||'YouTube 영상 썸네일')+'"'+previewFallback+' referrerpolicy="no-referrer" loading="lazy" decoding="async"><button type="button" class="lt-yt-play" data-lt-play aria-label="바로 재생"><span aria-hidden="true">▶</span></button></figure>'+cached
  :(linkCard?linkCard:(canLoad?'<button type="button" data-lt-load>'+esc(m.loadLabel)+'</button>':'<span>'+esc(m.label)+'</span>')+cached);
 const status=compact?'':(auto?'재생을 누르면 여기서 바로 재생해요.':(canLoad?'불러오기를 누르면 원본 사이트에 연결됩니다.':'원본 사이트에서 확인할 수 있어요.'));
 // #393 2: 크게 보기 — 영상을 어두운 깔개 위 화면 가운데 크게 연다(바깥 클릭·Esc로 복귀).
 const expand=canLoad&&!compact&&(m.kind==='youtube'||m.kind==='video')?'<div class="lt-media-toolbar"><button type="button" data-lt-expand>크게 보기</button></div>':'';
 let html = '<div class="lt-media" data-lt-url="'+esc(url)+'" data-lt-title="'+esc(title)+'"'+(momentId?' data-lt-moment-id="'+esc(momentId)+'"':'')+(m.kind==='youtube'?' data-lt-youtube="1"':'')+(vertical?' data-lt-vertical="1"':'')+'>'+expand+'<div class="lt-media-body">'+body+'</div>'+(compact?'':'<p class="lt-media-status" role="status">'+status+'</p><a href="'+esc(m.openUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+esc(m.kind==='youtube'?m.actionLabel+(m.startSeconds?' · 시작 '+formatStart(m.startSeconds):''):'원본 링크 열기')+' ↗</a>')+'</div>';
 if(m.privateFile)html=html.replace('불러오기를 누르면 원본 사이트에 연결됩니다.','내 계정에 보관한 파일입니다. 불러오기를 눌러 확인하세요.').replace(/<a href=[\s\S]*?<\/a>/,'');
 return html;
}
// 그 자리 재생: embed 주소는 book-usability.mjs 의 embedUrl 한 벌에서 만든다(누른 뒤에만 불린다).
// 주소를 못 만들면(모듈 실패·모양이 다름) 원본 링크 안내로 물러난다.
async function playInPlace(root){
 const m=describe(root.dataset.ltUrl);
 if(m.kind!=='youtube'||root.dataset.ltPlaying)return;
 root.dataset.ltPlaying='1';
 const body=root.querySelector('.lt-media-body'),status=root.querySelector('.lt-media-status');
 let embed=null;
 try{const usability=await import('/v41/book-usability.mjs');embed=usability.embedUrl(m.videoId,m.startSeconds);}catch{}
 if(!embed){delete root.dataset.ltPlaying;if(status)status.textContent='바로 재생할 수 없어요. 아래 원본 링크에서 열어 주세요.';return;}
 if(!root.isConnected){delete root.dataset.ltPlaying;return;}
 const frame=document.createElement('iframe');
 frame.className='lt-yt-frame';frame.src=embed;frame.title=root.dataset.ltTitle||'YouTube 영상';
 frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;
 // #584: no-referrer 는 YouTube 플레이어 구성 오류(오류 153)를 낸다(2026-11-14 실측).
 // strict-origin-when-cross-origin 으로 같은 영상이 그 자리에서 재생된다.
 frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 body.replaceChildren(frame);
 delete root.dataset.ltPlaying;
 if(status)status.textContent='재생 중이에요. 아래 원본 링크로도 열 수 있어요.';
}
async function youtubeMeta(root,m,onUnavailable){
 // 제목·채널은 서버 oEmbed 프록시에서만 받는다. YouTube가 없는 영상을 가리켜도
 // 썸네일 호스트가 기본 이미지를 200으로 줄 수 있으므로 oEmbed의 404도 실패로 표시한다.
 if(typeof fetch!=='function')return;
 if(root.querySelector('.lt-media-title'))return;
 try{
  const answer=await fetch('/api/youtube/oembed?v='+encodeURIComponent(m.videoId),{headers:{accept:'application/json'}});
  if(answer.status===404){if(root.isConnected)onUnavailable?.();return;}
  if(!answer.ok)throw Error('unavailable');
  const data=await answer.json(),title=typeof data.title==='string'?data.title.trim():'',channel=typeof data.authorName==='string'?data.authorName.trim():'',thumbnail=safeSavedYoutubeThumb(data.thumbnailUrl);
  const bits=[title,channel].filter(Boolean);
  if(!bits.length||!root.isConnected)return;
  const body=root.querySelector('.lt-media-body');if(!body)return;
  const source=new URL(root.dataset.ltUrl).hostname,caption=document.createElement('p');caption.className='lt-media-title';caption.textContent=[...bits,source].join(' · ');body.append(caption);
  const momentId=root.dataset.ltMomentId;
  if(momentId&&window.parent!==window)window.parent.postMessage({type:'lt41-media-metadata',momentId,url:root.dataset.ltUrl,mediaMetadata:{title,channel,source,...(thumbnail?{thumbnail}:{})}},location.origin);
 }catch{}
}
async function load(root){
 const m=describe(root.dataset.ltUrl),body=root.querySelector('.lt-media-body'),status=root.querySelector('.lt-media-status');
 if(!m.loadUrl||(new URL(m.loadUrl).protocol!=='https:'&&!m.privateFile)||root.dataset.ltLoading)return;
 root.dataset.ltLoading='1';
 const cachedCaption=body.querySelector('.lt-media-title')?.cloneNode(true)||null;
 const element=document.createElement(m.kind==='video'?'video':'img');
 status.textContent='불러오는 중이에요…';
  const failed=()=>{delete root.dataset.ltLoading;body.replaceChildren();if(cachedCaption)body.append(cachedCaption);const fallback=document.createElement('p');fallback.className='lt-media-fallback';fallback.textContent=(m.kind==='youtube'?'YouTube 영상':m.kind==='video'?'영상':m.kind==='photo'?'사진':'링크')+'을(를) 여기서 열지 못했어요.';body.append(fallback);const retry=document.createElement('button');retry.type='button';retry.dataset.ltLoad='';retry.textContent='다시 불러오기';body.append(retry);status.textContent='불러오지 못했어요. 아래 원본 링크에서 확인하거나 다시 시도해 주세요.';};
  // #429: YouTube 썸네일은 후보 순서(oardefault/hqdefault → mqdefault)로 내려가고, 회색(120×90)도 실패로 본다.
  const loadCandidates=m.kind==='youtube'?youtubeCandidates(m.videoId,root.dataset.ltVertical==='1',null):[];
  let loadIndex=0;
  const advanceOrFail=()=>{if(loadIndex+1<loadCandidates.length){loadIndex+=1;element.src=loadCandidates[loadIndex];return;}failed()};
  element.addEventListener('error',()=>advanceOrFail());
  if(m.kind==='video'){element.className='lt-user-video';element.controls=true;element.preload='metadata';element.playsInline=true;element.addEventListener('stalled',()=>{if(!element.readyState)status.textContent='영상 데이터를 받는 중이에요. 원본 링크에서도 확인할 수 있어요.';},{once:true});element.addEventListener('loadedmetadata',()=>{status.textContent='영상이 준비됐어요. 재생을 눌러 보세요.';if(element.videoWidth>0&&element.videoHeight>element.videoWidth)root.dataset.ltVertical='1';else delete root.dataset.ltVertical;},{once:true});element.addEventListener('playing',()=>status.textContent='재생 중이에요.',{once:true});element.addEventListener('canplay',()=>{if(!element.paused)status.textContent='재생 중이에요.';},{once:true});}
  else{element.alt=root.dataset.ltTitle||'기록한 사진';element.referrerPolicy='no-referrer';element.addEventListener('load',()=>{if(m.kind==='youtube'&&element.naturalWidth===120&&element.naturalHeight===90){advanceOrFail();return;}status.textContent=m.kind==='youtube'?'썸네일을 불러왔어요. 영상은 YouTube에서 열어 보세요.':'사진을 불러왔어요.';if(m.kind==='youtube')void youtubeMeta(root,m,failed);});}
 let src=loadCandidates[0]||m.loadUrl;
 if(m.privateFile){
  try{const {createWorkspaceApi}=await import('/v41/api.mjs');const answer=await createWorkspaceApi().fetchMedia(new URL(m.loadUrl).pathname.slice(11));if(!answer.ok)throw Error('unavailable');if(!root.isConnected)return;src=URL.createObjectURL(answer.blob);ownedUrls.set(element,src);}
  catch{failed();status.textContent='파일이 없거나 로그인 확인이 필요해요. 내 기록을 다시 불러온 뒤 시도해 주세요.';return;}
 }
 delete root.dataset.ltLoading;body.replaceChildren(element);if(cachedCaption)body.append(cachedCaption);element.src=src;
}
const ownedUrls=new Map();
// #393 2: 크게 보기 — 지금 문서(책·보드 등)를 어둡게 깔고 영상을 화면 가운데 크게 연다.
// 세로 영상은 화면 높이 가득, 가로는 폭 가득. 바깥 클릭·Esc·닫기 단추로 복귀하고,
// 닫으면 iframe/video 를 치워 재생도 멈춘다. 유튜브 자체 전체 화면은 iframe allowFullscreen 그대로.
let lightbox=null,lightboxOpener=null,lightboxBlob=null;
function closeLightbox(){
 if(!lightbox)return;
 const node=lightbox;lightbox=null;
 document.removeEventListener('keydown',lightboxKey,true);
 if(lightboxBlob){URL.revokeObjectURL(lightboxBlob);lightboxBlob=null}
 node.remove();
 const opener=lightboxOpener;lightboxOpener=null;
 if(opener&&opener.isConnected)try{opener.focus({preventScroll:true})}catch{}
}
function lightboxKey(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeLightbox()}}
async function openLightbox(url,title='',verticalHint=null){
 const m=describe(url);
 if(m.kind!=='youtube'&&m.kind!=='video')return;
 closeLightbox();
 lightboxOpener=document.activeElement;
 const vertical=verticalHint===null?!!m.vertical:!!verticalHint;
 const overlay=document.createElement('div');
 overlay.className='lt-lightbox'+(vertical?' lt-lightbox-vertical':'');
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','영상 크게 보기');
 overlay.innerHTML='<div class="lt-lightbox-stage"></div><button type="button" class="lt-lightbox-close" aria-label="크게 보기 닫기">×</button><p class="lt-lightbox-title"></p>';
 overlay.querySelector('.lt-lightbox-title').textContent=title||m.label||'';
 const stage=overlay.querySelector('.lt-lightbox-stage');
 document.body.append(overlay);
 lightbox=overlay;
 document.addEventListener('keydown',lightboxKey,true);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeLightbox()});
 overlay.querySelector('.lt-lightbox-close').addEventListener('click',closeLightbox);
 overlay.querySelector('.lt-lightbox-close').focus();
 const alive=()=>lightbox===overlay;
 if(m.kind==='youtube'){
  let embed=null;
  try{const usability=await import('/v41/book-usability.mjs');embed=usability.embedUrl(m.videoId,m.startSeconds)}catch{}
  if(!alive())return;
  if(!embed){stage.innerHTML='<p class="lt-lightbox-note">바로 재생할 수 없어요. 원본 링크에서 열어 주세요.</p>';return}
  const frame=document.createElement('iframe');
  frame.className='lt-lightbox-media';frame.src=embed;frame.title=title||'YouTube 영상';
  frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;
  // #584: 그 자리 재생과 같은 이유(오류 153)로 no-referrer 를 쓰지 않는다.
  frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
  stage.replaceChildren(frame);
 }else{
  let src=m.loadUrl;
  if(m.privateFile){
   try{const {createWorkspaceApi}=await import('/v41/api.mjs');const answer=await createWorkspaceApi().fetchMedia(new URL(m.loadUrl).pathname.slice(11));if(!answer.ok)throw Error('unavailable');if(!alive())return;src=URL.createObjectURL(answer.blob);lightboxBlob=src}
   catch{if(alive())stage.innerHTML='<p class="lt-lightbox-note">파일을 불러오지 못했어요. 로그인 확인 후 다시 시도해 주세요.</p>';return}
  }
  if(!alive())return;
  const video=document.createElement('video');
  video.className='lt-lightbox-media';video.controls=true;video.autoplay=true;video.playsInline=true;
  // 영상 정보의 가로세로: 세로면 틀도 세로로 바꾼다.
  video.addEventListener('loadedmetadata',()=>{if(!alive())return;overlay.classList.toggle('lt-lightbox-vertical',video.videoWidth>0&&video.videoHeight>video.videoWidth)},{once:true});
  video.src=src;stage.replaceChildren(video);
 }
}
window.LTMedia={describe,markup,privateAssetName,autoLoadMedia,currentContext:mediaContext,youtubeThumbUrl,youtubeCandidates,verticalVideo,probeVertical,upgradeVerticals,openLightbox,closeLightbox};
if(typeof document!=='undefined'){
 const cleanup=()=>{for(const [node,url] of ownedUrls)if(!node.isConnected){URL.revokeObjectURL(url);ownedUrls.delete(node);}};
 new MutationObserver(cleanup).observe(document.documentElement,{childList:true,subtree:true});
 addEventListener('pagehide',()=>{for(const url of ownedUrls.values())URL.revokeObjectURL(url);ownedUrls.clear();});
 document.addEventListener('pointerdown',e=>{if(e.target.closest?.('.lt-media'))e.stopPropagation();},true);
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-lt-title-edit]'))return;const root=e.target.closest?.('.lt-media');if(!root)return;e.stopImmediatePropagation();if(e.target.closest('[data-lt-expand]')){e.preventDefault();void openLightbox(root.dataset.ltUrl,root.dataset.ltTitle,root.hasAttribute('data-lt-vertical')?true:null);return;}if(e.target.closest('[data-lt-play]')){e.preventDefault();void playInPlace(root);return;}if(e.target.closest('[data-lt-load]')){e.preventDefault();load(root);}},true);
}
})();
