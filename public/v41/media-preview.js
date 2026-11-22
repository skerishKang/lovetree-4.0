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
/* #792: 기억할 구간의 표·재생 주소. 규칙은 src/moment-range.js·public/v41/domain.mjs의 한 벌과 같다(여기는 그 자리 재생용 사본). */
function formatRange(start, end) {
  const from = formatStart(start);
  if (!from) return '';
  const to = (Number.isFinite(Number(end)) && Number(end) > Number(start)) ? formatStart(end) : '';
  return to ? `${from}–${to}` : `${from}부터`;
}
function rangeEmbedUrl(videoId, start, end) {
  const id = String(videoId ?? '').trim();
  const s = Number(start);
  if (!id || !Number.isSafeInteger(s) || s < 0) return '';
  const params = [`start=${s}`];
  if (Number.isSafeInteger(end) && end > s) params.push(`end=${end}`);
  params.push('autoplay=1', 'rel=0');
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params.join('&')}`;
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
// #1060: ytimg 주소 글자는 정본(youtube-id.mjs) 한 벌에서만 만든다. 클래식 스크립트라
// 모듈이 등록한 globalThis.LTYouTubeId 로 단계(크기·세로)만 넘겨 부른다.
// #393: 세로(쇼츠)는 원본 비율(oardefault·잘림 없음), 가로는 hqdefault.
// oardefault 가 없는 영상(일반 가로 등)은 부르는 쪽에서 hqdefault 로 물러난다.
function stageThumb(videoId, stage) {
  const api = globalThis.LTYouTubeId || globalThis.LTThumbFallback;
  return api && typeof api.youtubeStageThumbUrl === 'function' ? api.youtubeStageThumbUrl(videoId, stage) : '';
}
function youtubeThumbUrl(videoId, vertical = false) {
  return stageThumb(videoId, vertical ? 'oardefault' : 'hqdefault');
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
    list.push(stageThumb(videoId, 'mqdefault'));
  }
  return [...new Set(list.filter(Boolean))];
}
// Member media is URL-derived. No request is made until an explicit load action.
function describe(value=''){
 const link=parseMomentLink(value);
 if(!link.openUrl)return {...link,kind:link.kind==='none'?'none':'invalid'};
 if(link.kind==='youtube')return {...link,loadUrl:youtubeThumbUrl(link.videoId,link.vertical),loadLabel:'영상 썸네일 불러오기'};
 const u=new URL(link.openUrl);let path=u.pathname;try{path=decodeURIComponent(path)}catch(e){globalThis.LT41Report?.report(e,'미디어 링크 주소 해석')}
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
    img.src = stageThumb(id, 'oardefault');
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
      if (!el.isConnected) return;
      // #1038: 실측이 세로를 확인하면 기존 미디어 정보 저장 경로로 한 번 부른다(열 때마다 실측하지 않게).
      // 다른 제목·채널 값은 그대로 합쳐 보낸다 — 저장값 하나가 나머지를 지우지 않게.
      if (v) {
        const momentId = el.closest('[data-moment]')?.dataset.moment;
        const moment = momentId && typeof window !== 'undefined' ? window.LTDEMO?.moments?.find(m => m.id === momentId) : null;
        if (moment?.url && window.parent !== window) {
          try { window.parent.postMessage({ type: 'lt41-media-metadata', momentId, url: moment.url, mediaMetadata: { ...(moment.mediaMetadata || {}), vertical: v } }, location.origin); } catch {}
        }
      }
      if (!v) return;
      // #1030: 같은 영상이 펼침면 양쪽에 있으면 실측 결과를 한 쪽만 적용하지 않는다.
      // 주소 형태가 달라 한 쪽만 판정 전 상태로 남는 일이 없게 같은 videoId의 칸을 함께 올린다.
      const targets = [...root.querySelectorAll('.yt-play[data-yt-play="' + id + '"]')];
      for (const target of targets) {
        target.classList.add('is-vertical');
        target.dataset.ytVertical = '1';
        const img = target.querySelector('img');
        if (img && /hqdefault\.jpg/.test(img.getAttribute('src') || '')) img.src = youtubeThumbUrl(id, true);
        else if (!img) {
          // #635 PR C: 썸네일이 몇 번 실패해 내려가기 틀(제목 글 카드)로 정해진 뒤에 실측이 세로를 밝히는 경우 —
          // 실측은 oardefault를 실제로 불러 온 뒤의 답이라 그림이 있다는 뜻이다. 칸을 원래 모양(그림+재생 글자)으로 되돌린다.
          const card = target.querySelector('.lt-fallback-card');
          if (card) {
            const start = Number(target.dataset.ytStart || 0);
            const restored = document.createElement('img');
            restored.src = youtubeThumbUrl(id, true);
            restored.alt = '';
            restored.referrerPolicy = 'no-referrer';
            restored.loading = 'lazy';
            restored.decoding = 'async';
            const label = document.createElement('span');
            label.className = 'yt-play-label';
            label.textContent = '▶ 재생' + (start > 0 ? ' · 시작 ' + formatStart(start) : '');
            card.replaceWith(restored);
            target.append(label);
          }
        }
      }
      if (typeof window !== 'undefined' && window.__TRACK59__?.rejudgeOverflow) window.__TRACK59__.rejudgeOverflow();
    });
  }
}
function verticalVideo(url, mediaMetadata = null) {
  const m = describe(url);
  if (m.kind !== 'youtube') return false;
  // #1038: 저장된 실측값이 주소·썸네일 판정보다 먼저다(저장값이 있으면 실측을 다시 하지 않는다).
  if (typeof mediaMetadata?.vertical === 'boolean') return mediaMetadata.vertical;
  const metaVertical = Number(mediaMetadata?.width) > 0 && Number(mediaMetadata?.height) > Number(mediaMetadata?.width);
  // #584: 썸네일 실측으로 세로가 밝혀진 영상도 세로로 답한다(크게 보기·그 자리 재생이 같은 판정을 쓰게).
  if (verticalProbed.get(m.videoId) === true) return true;
  return !!(m.vertical || metaVertical);
}
function markup(url,title='',mediaMetadata=null,momentId='',context=null,momentMeta=null,opts=null){
 const m=describe(url);
 if(m.kind==='none')return '';
 if(m.kind==='invalid')return '<p class="lt-media-error">링크를 열 수 없어요. 원본 주소를 확인해 주세요.</p>';
 // #632: 내 기록(auto) YouTube 카드만 사라짐 감지를 청한다. 표시는 data-lt-auto 로만 남기고
 // 실제 요청은 화면에 보일 때(IntersectionObserver) 한다 — 공유·예시는 #327 '누르기 전 외부 요청 0'을 그대로 유지.
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
 // #792: 기억할 구간 표 — 순간의 시작·끝(저장 값)이 있을 때만 작은 한 줄을 보인다. 재생은 그 구간만(data-lt-end).
 const rangeText=(m.kind==='youtube'&&momentMeta)?formatRange(momentMeta.startSeconds,momentMeta.endSeconds):'';
 const rangeLine=rangeText?'<div class="lt-media-range"><span class="lt-media-range-mark" aria-hidden="true">기억할 구간</span><strong>'+esc(rangeText)+'</strong></div>':'';
 let html = '<div class="lt-media" data-lt-url="'+esc(url)+'" data-lt-title="'+esc(title)+'"'+(momentId?' data-lt-moment-id="'+esc(momentId)+'"':'')+(m.kind==='youtube'?' data-lt-youtube="1"':'')+(auto?' data-lt-auto="1"':'')+(vertical?' data-lt-vertical="1"':'')+(momentMeta&&Number(momentMeta.endSeconds)>0?' data-lt-end="'+Number(momentMeta.endSeconds)+'"':'')+(momentMeta&&Number(momentMeta.startSeconds)>0?' data-lt-start="'+Number(momentMeta.startSeconds)+'"':'')+'>'+expand+'<div class="lt-media-body">'+body+'</div>'+rangeLine+(compact?'':'<p class="lt-media-status" role="status">'+status+'</p><a href="'+esc(m.openUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+esc(m.kind==='youtube'?m.actionLabel+(m.startSeconds?' · 시작 '+formatStart(m.startSeconds):''):'원본 링크 열기')+' ↗</a>')+'</div>';
 if(m.privateFile)html=html.replace('불러오기를 누르면 원본 사이트에 연결됩니다.','내 계정에 보관한 파일입니다. 불러오기를 눌러 확인하세요.').replace(/<a href=[\s\S]*?<\/a>/,'');
 return html;
}
// 그 자리 재생: embed 주소는 book-usability.mjs 의 embedUrl 한 벌에서 만든다(누른 뒤에만 불린다).
// 주소를 못 만들면(모듈 실패·모양이 다름) 원본 링크 안내로 물러난다.
async function playInPlace(root){
 const m=describe(root.dataset.ltUrl);
 if(m.kind!=='youtube'||root.dataset.ltPlaying||root.dataset.ltVanished==='1')return;
 root.dataset.ltPlaying='1';
 const body=root.querySelector('.lt-media-body'),status=root.querySelector('.lt-media-status');
 // #792: 기억할 구간 — 순간의 시작·끝(카드가 들고 있는 저장 값)이 있으면 그 구간만 재생한다.
 // '처음부터 보기'를 누른 뒤엔 시작 시점도 없이 처음부터. 끝이 없으면 시작 시점부터.
 const fromStart=root.dataset.ltFromStart==='1';
 const end=Number(root.dataset.ltEnd||0);
 const start=Number(root.dataset.ltStart||m.startSeconds||0);
 const rangeUsed=!fromStart&&end>start;
 let embed=null;
 try{const usability=await import('/v41/book-usability.mjs');embed=fromStart?usability.embedUrl(m.videoId,0):(rangeUsed?rangeEmbedUrl(m.videoId,start,end):usability.embedUrl(m.videoId,start));}catch(e){globalThis.LT41Report?.report(e,'미디어 임베드 준비')}
 if(!embed){delete root.dataset.ltPlaying;if(status)status.textContent='바로 재생할 수 없어요. 아래 원본 링크에서 열어 주세요.';return;}
 // #792 2단계: 추가·고치기 창의 미리보기만 IFrame API로 재생 위치를 읽는다. 다른 화면은 지금 그대로다.
 const segmentEditor=!!root.closest('#moment-form');
 if(segmentEditor)embed+=(embed.includes('?')?'&':'?')+'enablejsapi=1&origin='+encodeURIComponent(location.origin);
 if(!root.isConnected){delete root.dataset.ltPlaying;return;}
 const frame=document.createElement('iframe');
 frame.className='lt-yt-frame';frame.src=embed;frame.title=root.dataset.ltTitle||'YouTube 영상';
 frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;
 // #584: no-referrer 는 YouTube 플레이어 구성 오류(오류 153)를 낸다(2026-11-14 실측).
 // strict-origin-when-cross-origin 으로 같은 영상이 그 자리에서 재생된다.
 frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 // #833: 쇼츠는 재생 중 YouTube가 전체 화면 단추를 숨기므로 칸 모서리 단추로 크게 본다(안 되면 덮는 창).
 try{const {mountExpandControls}=await import('/v41/yt-expand.mjs');const cell=mountExpandControls(body,{url:m.openUrl||root.dataset.ltUrl,openUrl:m.openUrl||root.dataset.ltUrl,vertical:root.hasAttribute('data-lt-vertical'),lightbox:(u,t,v)=>openLightbox(u,t,v)});cell.stage.append(frame);}
 catch{body.replaceChildren(frame);}
 if(segmentEditor)root.dispatchEvent(new CustomEvent('lt41:media-playing',{bubbles:true,detail:{frame,videoId:m.videoId,start}}));
 if(rangeUsed&&!fromStart){const again=document.createElement('button');again.type='button';again.className='lt-from-start';again.dataset.ltFromStart='';again.textContent='처음부터 보기';body.append(again);}
 delete root.dataset.ltPlaying;
 delete root.dataset.ltFromStart;
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
 // #983: compact 카드에는 상태 글이 없다. 요소가 있을 때만 글자를 쓴다(다른 화면의 상태 글자는 그대로).
 const setStatus=(text)=>{if(status)status.textContent=text;};
 if(!m.loadUrl||(new URL(m.loadUrl).protocol!=='https:'&&!m.privateFile)||root.dataset.ltLoading)return;
 root.dataset.ltLoading='1';
 const cachedCaption=body.querySelector('.lt-media-title')?.cloneNode(true)||null;
 const element=document.createElement(m.kind==='video'?'video':'img');
 setStatus('불러오는 중이에요…');
  const failed=()=>{delete root.dataset.ltLoading;body.replaceChildren();if(cachedCaption)body.append(cachedCaption);const fallback=document.createElement('p');fallback.className='lt-media-fallback';fallback.textContent=(m.kind==='youtube'?'YouTube 영상':m.kind==='video'?'영상':m.kind==='photo'?'사진':'링크')+'을(를) 여기서 열지 못했어요.';body.append(fallback);const retry=document.createElement('button');retry.type='button';retry.dataset.ltLoad='';retry.textContent='다시 불러오기';body.append(retry);setStatus('불러오지 못했어요. 아래 원본 링크에서 확인하거나 다시 시도해 주세요.');};
  // #429: YouTube 썸네일은 후보 순서(oardefault/hqdefault → mqdefault)로 내려가고, 회색(120×90)도 실패로 본다.
  const loadCandidates=m.kind==='youtube'?youtubeCandidates(m.videoId,root.dataset.ltVertical==='1',null):[];
  let loadIndex=0;
  const advanceOrFail=()=>{if(loadIndex+1<loadCandidates.length){loadIndex+=1;element.src=loadCandidates[loadIndex];return;}failed()};
  element.addEventListener('error',()=>advanceOrFail());
  if(m.kind==='video'){element.className='lt-user-video';element.controls=true;element.preload='metadata';element.playsInline=true;element.addEventListener('stalled',()=>{if(!element.readyState)setStatus('영상 데이터를 받는 중이에요. 원본 링크에서도 확인할 수 있어요.');},{once:true});element.addEventListener('loadedmetadata',()=>{setStatus('영상이 준비됐어요. 재생을 눌러 보세요.');if(element.videoWidth>0&&element.videoHeight>element.videoWidth)root.dataset.ltVertical='1';else delete root.dataset.ltVertical;},{once:true});element.addEventListener('playing',()=>setStatus('재생 중이에요.'),{once:true});element.addEventListener('canplay',()=>{if(!element.paused)setStatus('재생 중이에요.');},{once:true});}
  else{element.alt=root.dataset.ltTitle||'기록한 사진';element.referrerPolicy='no-referrer';element.addEventListener('load',()=>{if(m.kind==='youtube'&&element.naturalWidth===120&&element.naturalHeight===90){advanceOrFail();return;}setStatus(m.kind==='youtube'?'썸네일을 불러왔어요. 영상은 YouTube에서 열어 보세요.':'사진을 불러왔어요.');if(m.kind==='youtube')void youtubeMeta(root,m,failed);});}
 let src=loadCandidates[0]||m.loadUrl;
 if(m.privateFile){
  try{const {createWorkspaceApi}=await import('/v41/api.mjs');const answer=await createWorkspaceApi().fetchMedia(new URL(m.loadUrl).pathname.slice(11));if(!answer.ok)throw Error('unavailable');if(!root.isConnected)return;src=URL.createObjectURL(answer.blob);ownedUrls.set(element,src);}
  catch{failed();setStatus('파일이 없거나 로그인 확인이 필요해요. 내 기록을 다시 불러온 뒤 시도해 주세요.');return;}
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
  try{const usability=await import('/v41/book-usability.mjs');embed=usability.embedUrl(m.videoId,m.startSeconds)}catch(e){globalThis.LT41Report?.report(e,'미디어 임베드 준비')}
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
// #632: 사라진 영상 감지·표시 — 내 기록(auto) YouTube 카드만, 보이는 카드만 검사하고 결과는 하루 기억한다.
// 신호 두 개를 짝으로 쓴다: ① 썸네일 내려가기 카드(삭제·비공개는 i.ytimg.com 그림도 함께 사라진다 — 실측 404)
// ② oEmbed 프록시(#344) — #666부터 유튜브 응답 코드가 그대로 온다.
//   200 ok(영상 있음) · 404·400 gone(없는 영상 — 삭제와 같이 표시) · 403 private(비공개 — 사라진 영상으로 표시)
//   401 noembed(임베드 금지 — 사라진 영상으로 표시하지 않고 '유튜브에서 보기' 안내)
//   5xx·응답 없음 unknown(사라졌다고 말하지 않는다) · 그 밖 held(보류)
// 썸네일이 살아 있는 카드는 영상이 있는 것이므로 묻지 않는다(임베드 금지를 사라진 영상으로 세지 않게,
// 정상 카드마다 요청을 보내지 않게). 썸네일이 실패한 카드만 프록시에 물어 보고, gone·private(하루 기억)과
// held(기억하지 않음 — 다음 화면에 다시 판정)일 때 '사라진 영상'으로 정한다. 401은 사라진 영상이 아니라
// '유튜브에서 보기' 안내만 붙이고 기억하지 않는다(나중에 임베드가 풀릴 수 있다). 403도 기억하지 않는다 —
// 비공개는 나중에 공개로 바뀔 수 있다. ok면 썸네일만 잠깐 실패한 것이므로 기존 안내('영상을 볼 수 없어요')를
// 그대로 두고, unknown이면 검사 표시를 지워 연결이 돌아오면(online) 다시 묻는다.
const VANISHED_TEXT='영상이 삭제되었거나 비공개예요';
const VANISHED_BADGE='사라진 영상';
const NOEMBED_TEXT='이 영상은 여기서 볼 수 없어요. 유튜브에서 볼 수 있어요.';
const NOEMBED_LABEL='유튜브에서 보기';
const VANISHED_CONCURRENCY=3;
const vanishedQueue=new Set();
let vanishedInFlight=0,vanishedIo=null,vanishedWatchTimer=0;
let videoStatusLoader=null; // 시험이 끼워 넣는 판정 모듈 — 평소에는 video-status.mjs를 동적으로 불러 온다.
function loadVideoStatusModule(){
 if(videoStatusLoader)return Promise.resolve(videoStatusLoader()).catch(()=>null);
 return import('/v41/video-status.mjs').catch(()=>null);
}
function localStore(){try{return globalThis.localStorage||null}catch{return null}}
// 썸네일 내려가기가 실패로 끝난 카드 — 썸네일이 살아 있으면 영상이 있는 것이므로 묻지 않는다.
function thumbFailed(root){
 return !!(root.querySelector && root.querySelector('[data-lt-fallback],.lt-fallback-notice'));
}
function applyVanished(root, doc = (typeof document !== 'undefined' ? document : null)){
 if(!root||!root.querySelectorAll||!doc||root.dataset.ltVanished==='1')return;
 root.dataset.ltVanished='1';
 root.classList.add('lt-media-vanished');
 // 재생·크게 보기·기존 안내는 치우고, 보관된 제목·채널(그림·글 카드)은 그대로 둔다.
 for(const el of root.querySelectorAll('.lt-media-toolbar,[data-lt-play],.lt-media-status,.lt-fallback-notice,.lt-media-noembed-note'))el.remove();
 const note=doc.createElement('p');
 note.className='lt-media-vanished-note';
 note.setAttribute('role','status');
 const badge=doc.createElement('strong');
 badge.className='lt-media-vanished-badge';
 badge.textContent=VANISHED_BADGE;
 note.append(badge,doc.createTextNode(' '+VANISHED_TEXT));
 const host=root.querySelector('.lt-media-body')||root;
 host.after(note);
}
// 401(임베드 금지): 영상은 멀짓하므로 '사라진 영상'으로 표시하지 않는다 — 대신 '유튜브에서 보기' 안내를 붙인다.
// 제목·그림·도구줄은 그대로 두고 기존 안내만 치운다(재생 창은 유튜브가 거절한다).
function applyNoEmbed(root, doc = (typeof document !== 'undefined' ? document : null)){
 if(!root||!root.querySelectorAll||!doc||root.dataset.ltNoembed==='1')return;
 const m=describe(root.dataset.ltUrl||'');
 if(m.kind!=='youtube'||!m.videoId)return;
 root.dataset.ltNoembed='1';
 root.classList.add('lt-media-noembed');
 for(const el of root.querySelectorAll('.lt-media-status,.lt-media-vanished-note'))el.remove();
 const note=doc.createElement('p');
 note.className='lt-media-noembed-note';
 note.setAttribute('role','status');
 const link=doc.createElement('a');
 link.className='lt-media-noembed-link';
 link.href='https://www.youtube.com/watch?v='+encodeURIComponent(m.videoId);
 link.target='_blank';
 link.rel='noopener noreferrer';
 link.textContent=NOEMBED_LABEL;
 note.append(doc.createTextNode(NOEMBED_TEXT+' '),link);
 const host=root.querySelector('.lt-media-body')||root;
 host.after(note);
}
function scheduleVanishedCheck(root){
 if(!root||root.dataset?.ltAuto!=='1'||root.dataset.ltVanishedChecked==='1')return;
 // 썸네일이 아직 실패하지 않은 카드는 표시를 남기지 않고 나중에 다시 본다(지금 검사해도 '영상 있음'이 된다).
 if(!thumbFailed(root))return;
 root.dataset.ltVanishedChecked='1';
 vanishedQueue.add(root);
 void runVanishedQueue();
}
function runVanishedQueue(){
 while(vanishedInFlight<VANISHED_CONCURRENCY&&vanishedQueue.size){
  const root=vanishedQueue.values().next().value;
  vanishedQueue.delete(root);
  if(!root.isConnected)continue;
  vanishedInFlight+=1;
  checkVanished(root).catch(()=>{}).finally(()=>{vanishedInFlight=Math.max(0,vanishedInFlight-1);void runVanishedQueue();});
 }
}
async function checkVanished(root, hooks = null){
 // hooks는 시험이 끼우는 자리(doc·store)다 — 평소에는 이 문서의 document·localStorage를 쓴다.
 const m=describe(root?.dataset?.ltUrl||'');
 if(m.kind!=='youtube'||!m.videoId||!root.isConnected)return;
 if(!thumbFailed(root))return;
 const mod=await loadVideoStatusModule();
 if(!mod||!root.isConnected)return;
 const store=(hooks&&hooks.store)||localStore();
 let status=mod.readVideoStatusCache?mod.readVideoStatusCache(store,m.videoId):null;
 if(!status){
  status=await mod.fetchVideoStatus(m.videoId);
  // 확정 판정(ok·gone)만 기억한다 — held·unknown은 다음에 다시 묻는다.
  if((status==='ok'||status==='gone')&&root.isConnected)mod.writeVideoStatusCache?.(store,m.videoId,status);
 }
 // gone(삭제·없는 영상)·private(비공개)·held(보류 — 썸네일 실패가 짝 신호)는 '사라진 영상'으로 표시하고,
 // noembed(임베드 금지)는 '유튜브에서 보기' 안내만, ok는 그대로 둔다.
 // unknown(응답 없음 — 지하철·기내 모드 같은 끊김이나 유튜브 5xx)은 표시하지 않고 검사 표시를 지워
 // 다음에 화면에 보일 때(online 포함) 다시 묻는다.
 // hooks.doc는 undefined를 지나야 기본 문서(document)에 닿는다 — null을 넘기지 않게 한다.
 if(status==='gone'||status==='private'||status==='held'){
  if(root.isConnected)applyVanished(root,hooks?hooks.doc:undefined);
 }else if(status==='noembed'){
  if(root.isConnected)applyNoEmbed(root,hooks?hooks.doc:undefined);
 }else if(status==='unknown'&&root.isConnected){
  delete root.dataset.ltVanishedChecked;
 }
}
function watchVanished(){
 // 이미 '사라진 영상'으로 정해진 칸에 썸네일 내려가기가 나중에 글 카드를 놓으면 기존 안내가 따로 붙는다 — 겹침을 치운다.
 for(const el of document.querySelectorAll('.lt-media-vanished .lt-fallback-notice'))el.remove();
 // 검사 상대는 썸네일이 실패한 카드뿐이다 — 정상 카드는 요청도 관찰도 하지 않는다.
 const pending=[];
 for(const el of document.querySelectorAll('.lt-media[data-lt-auto="1"]:not([data-lt-vanished-checked])')){
  if(thumbFailed(el))pending.push(el);
 }
 if(!pending.length)return;
 if(typeof IntersectionObserver!=='function'){ // 보이는 판정을 못 하면(오래된 브라우저) 문서의 카드를 한 번 검사한다.
  for(const el of pending)scheduleVanishedCheck(el);
  return;
 }
 if(!vanishedIo){
  vanishedIo=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting)continue;
    vanishedIo.unobserve(entry.target);
    scheduleVanishedCheck(entry.target);
   }
  },{rootMargin:'160px 0px 160px 0px'});
 }
 for(const el of pending)vanishedIo.observe(el);
}
function queueWatchVanished(){ // 끌기·넘기기 동안 몰리는 바뀜마다 일을 하지 않게 조금 뒤에 한 번만 본다.
 if(vanishedWatchTimer)return;
 vanishedWatchTimer=setTimeout(()=>{vanishedWatchTimer=0;watchVanished();},300);
}
window.LTMedia={describe,markup,privateAssetName,autoLoadMedia,currentContext:mediaContext,youtubeThumbUrl,youtubeCandidates,verticalVideo,probeVertical,upgradeVerticals,openLightbox,closeLightbox,applyVanished,applyNoEmbed,scheduleVanishedCheck,checkVanished,watchVanished,setVideoStatusLoader(fn){videoStatusLoader=typeof fn==='function'?fn:null;}};
if(typeof document!=='undefined'){
 const cleanup=()=>{for(const [node,url] of ownedUrls)if(!node.isConnected){URL.revokeObjectURL(url);ownedUrls.delete(node);}};
 new MutationObserver(()=>{cleanup();queueWatchVanished();}).observe(document.documentElement,{childList:true,subtree:true});
 addEventListener('pagehide',()=>{for(const url of ownedUrls.values())URL.revokeObjectURL(url);ownedUrls.clear();});
 // 끊겼던 연결이 돌아오면 unknown으로 되돌려 둔 카드를 다시 묻는다.
 addEventListener('online',queueWatchVanished);
 watchVanished();
 // #601: 보드 카드의 그림은 카드를 끄는 자리다 — 카드 안에서는 이 막음을 풀어 준다(다른 화면은 그대로).
 document.addEventListener('pointerdown',e=>{if(e.target.closest?.('.lt-media')&&!e.target.closest?.('.card'))e.stopPropagation();},true);
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-lt-title-edit]'))return;const root=e.target.closest?.('.lt-media');if(!root)return;e.stopImmediatePropagation();if(e.target.closest('[data-lt-expand]')){e.preventDefault();void openLightbox(root.dataset.ltUrl,root.dataset.ltTitle,root.hasAttribute('data-lt-vertical')?true:null);return;}if(e.target.closest('[data-lt-from-start]')){e.preventDefault();delete root.dataset.ltEnd;root.dataset.ltFromStart='1';void playInPlace(root);return;}if(e.target.closest('[data-lt-play]')){e.preventDefault();void playInPlace(root);return;}if(e.target.closest('[data-lt-load]')){e.preventDefault();load(root);}},true);
}
})();
