// 2026-11-08 기억책 사용성 1~9 화면 보조. 데이터·저장 계약은 그대로 두고 표시만 바꾼다.
import {displayTitle,withoutAutoTitle,titleParts,mediaSourceText,editAffordances,embedUrl,connectionLine,readLens,writeLens,detailPlacement,nextMomentMessage,NEXT_PAGE_COPY,NEXT_PAGE_ACTION,treeTitleText,isPrimaryButton,tapIntent,createOverflowRejudge,titleView,formatDisplayDate} from '/v41/book-usability.mjs';
const $b=s=>document.querySelector(s);
// #347 후속: 제목 보기 설정은 계정(LTDEMO.prefs)에서 읽고, 화면은 한 벌(titleView)로 그린다.
const titleDisplay=()=>{try{return LTDEMO.prefs?.titleDisplay||'both'}catch{return 'both'}};
const titleViewFor=m=>titleView(m,titleDisplay());
const titleMainFor=(title,m)=>m?titleViewFor(m).main:(title||'');
try{window.LTBookTitle={view:titleViewFor,date:formatDisplayDate}}catch{}
// #296: 손을 뗀 순간의 판단은 book-usability.mjs의 tapIntent가 맡는다(book.js는 클래식 스크립트라 여기서 넘겨 준다).
window.LTTapIntent=tapIntent;
const t=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
/* 5. 돋보기: 기본 꺼짐. 선택값은 localStorage(실패하면 꺼짐). */
let lensPref=readLens(window.localStorage);
try{lensOn=lensPref}catch{}
function paintLensButton(){const b=$b('#lensBtn');if(!b)return;b.classList.toggle('active',lensPref);b.textContent=lensPref?'돋보기 켜짐':'돋보기';b.setAttribute('aria-pressed',String(lensPref))}
/* 4. '다음 순간 남기기': 이 순간을 부모로 기존 순간 추가 편집기를 연다. */
function requestNextMoment(parentId){
 if(!parentId)return;
 // #315: 공유 감상은 쓰기를 열지 않는다(버튼이 남아도 메시지를 보내지 않는다).
 if(LTDEMO.readOnly)return;
 if(window.parent===window){toast('순간 추가는 러브트리 화면에서 열 수 있어요');return}
 // 편집기는 지금 고른 순간을 기준으로 열린다. 먼저 이 순간을 고른 뒤 추가를 연다.
 window.parent.postMessage({type:'lt41-select',id:parentId},location.origin);
 window.parent.postMessage({...nextMomentMessage(parentId)},location.origin);
}
/* 6. 상세 카드: 오른쪽 페이지가 비면 오른쪽 페이지에, 아니면 카드 옆 작은 패널로. */
let detailAnchor=null;
const nextMomentOf=id=>LT59Model.nextMomentOf(id,LTDEMO.moments,LTDEMO.edges,titleMainFor);
function closeDetail(){
 const panel=$b('#detailSide'),card=detailAnchor;
 if(panel){panel.hidden=true;panel.replaceChildren()}
 detailAnchor=null;
 $b('#detail')?.classList.remove('open');
 if(card&&card.isConnected){card.classList.remove('detail-open');card.setAttribute('tabindex','-1');try{card.focus({preventScroll:true})}catch{}}
}
function detailMarkup(m){
 const nextInfo=nextMomentOf(m.id);
 const line=connectionLine(nextInfo?.title,nextInfo?.reason);
 const open=m.url&&isYouTubeUrl(m.url)?'YouTube에서 열기 ↗':'원본 링크 열기 ↗';
 // #327 2부: 내 기록(서버)의 순간 상세에서 다른 트리로 옮길 수 있다. 공유·예시는 숨긴다.
 const canMove=(window.parent&&window.parent.LT41)?window.parent.LT41.source==='server':false;
 const view=titleViewFor(m);
 return '<div class="detail-kicker">'+t(LTLabels.type(m.kind))+' · '+t(formatDisplayDate(m.date))+' · '+t(m.emotion)+'</div>'+
  (view.main?'<h2>'+t(view.main)+'</h2>'+(view.sub?'<p class="video-title">▶ '+t(view.sub)+'</p>':''):'')+
  '<p>'+t(m.note)+' · 출처: '+t(m.source)+'</p>'+
  '<div class="chips">'+m.keywords.map(k=>'<span class="chip">#'+t(k)+'</span>').join('')+'</div>'+
  '<div class="detail-why">'+t(line||'연결 이유는 아직 적지 않았어요')+'</div>'+
  '<div class="detail-actions"><button type="button" data-detail-viewer>순간 열기</button>'+
  (m.url?'<a href="'+t(m.url)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+open+'</a>':'')+
  '<button type="button" data-detail-index>목차에서 보기</button>'+
  (canMove?'<button type="button" data-detail-move="'+t(m.id)+'">다른 트리로 옮기기</button>':'')+'</div>';
}
function cardFor(id){return [...document.querySelectorAll('.moment[data-moment]')].find(el=>el.dataset.moment===id&&el.closest('.page,.mobile-page'))||null}
function placeDetail(id,card){
 const m=metadataFor(id);if(!m)return;
 // 390에서는 오른쪽 페이지가 화면에 없으므로 카드 옆 패널을 쓴다.
 /* #393 4: 한 장/두 장은 폭이 아니라 보기 모드가 정한다(book.js의 single()). */
  const rightEmpty=!!SPREADS[current].right?.synthetic&&!single();
 if(detailPlacement(rightEmpty)==='right-page'){
  rightPage.innerHTML='<div class="page-detail">'+detailMarkup(m)+'</div>';
 }else{
  const panel=$b('#detailSide');if(!panel)return;
  panel.innerHTML='<div class="detail-top"><span class="detail-kicker">'+t(LTLabels.type(m.kind))+' · '+t(formatDisplayDate(m.date))+'</span><button type="button" class="close" data-detail-close aria-label="상세 닫기">×</button></div><div class="side-detail">'+detailMarkup(m)+'</div>';
  panel.hidden=false;
  if(single()){panel.style.top='';}
  else{
  // 카드가 놓인 페이지의 바깥쪽 여백에 세운다. 자리가 없으면 페이지 안쪽으로 붙인다.
  const page=card.closest('.page'),rect=card.getBoundingClientRect();
  const host=panel.offsetParent||document.body,hostRect=host.getBoundingClientRect();
  const pageRect=(page||host).getBoundingClientRect();
  const pw=panel.offsetWidth||280;
  const isLeft=!page||page.classList.contains('left');
  let left=isLeft?pageRect.left-hostRect.left-pw-14:pageRect.right-hostRect.left+14;
  if(left<0||left+pw>hostRect.width)left=Math.max(8,pageRect.left-hostRect.left+10);
  panel.style.left=left+'px';panel.style.right='auto';
  panel.style.top=Math.max(8,Math.round(rect.top-hostRect.top))+'px';
  }
 }
 if(detailAnchor&&detailAnchor!==card)detailAnchor.classList.remove('detail-open');
 detailAnchor=card;
 card.classList.add('detail-open');card.setAttribute('tabindex','-1');
}
const originalShowDetail=showDetail;
showDetail=function(id){
 originalShowDetail(id);
 const m=metadataFor(id);if(m){const view=titleViewFor(m);$b('#detailTitle').textContent=view.main;if(view.sub)$b('#detailTag').textContent+=' · ▶ '+view.sub;}
 $b('#detail')?.classList.remove('open');
 const card=cardFor(id);
 if(card)placeDetail(id,card);
};
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(document.querySelector('.lt-lightbox'))return;const panel=$b('#detailSide');if(panel&&!panel.hidden){e.preventDefault();closeDetail();}},true);
/* 1. 실제 기록에서 재생 단추가 눌리지 않던 문제(2026-11-08): 카드 위 겹침·다른 리스너의 전파 차단에
   영향받지 않도록 pointerdown에서 먼저 잡고, 재생 주소를 못 만들면 원본 링크를 새 창으로 연다. */
function playInline(yt,media){
 const url=embedUrl(yt.dataset.ytPlay,Number(yt.dataset.ytStart||0));
 if(!url){if(media&&media.openUrl)window.open(media.openUrl,'_blank','noopener');return}
 const frame=document.createElement('iframe');frame.className='yt-frame'+(yt.dataset.ytVertical==='1'?' is-vertical':'');frame.src=url;frame.title='YouTube 영상 재생';
 frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';frame.allowFullscreen=true;
 frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 const host=yt.parentElement;if(!host)return;host.replaceChildren(frame);
}
document.addEventListener('pointerdown',e=>{
 if(!isPrimaryButton(e))return;
 const yt=e.target.closest&&e.target.closest('[data-yt-play]');
 if(!yt)return;
 e.preventDefault();e.stopPropagation();
 const url=yt.dataset.ytPlay?{openUrl:'https://www.youtube.com/watch?v='+yt.dataset.ytPlay+(Number(yt.dataset.ytStart||0)?'&t='+Number(yt.dataset.ytStart||0):'')}:null;
 playInline(yt,url);
},true);
document.addEventListener('click',e=>{
 if(!isPrimaryButton(e))return;
 // #393 2: 크게 보기 — 어두운 깔개 위 화면 가운데 크게(세로 높이 가득·가로 폭 가득). 바깥 클릭·Esc로 책 복귀.
 const expand=e.target.closest('[data-yt-expand]');
 if(expand){e.preventDefault();e.stopPropagation();const m=metadataFor(expand.dataset.ytExpand);
  if(m&&m.url&&window.LTMedia&&LTMedia.openLightbox)LTMedia.openLightbox(m.url,titleViewFor(m).main,LTMedia.verticalVideo(m.url,m.mediaMetadata));return}
 const next=e.target.closest('[data-next-moment]');
 if(next){if(LTDEMO.readOnly)return;e.preventDefault();e.stopPropagation();requestNextMoment(next.dataset.nextMoment||selectedMomentId);return}
 /* 1. YouTube 그 자리 재생: 누른 뒤에만 iframe을 만든다(시작 시점 반영, referrerpolicy 엄격). */
 const yt=e.target.closest('[data-yt-play]');
 if(yt){e.preventDefault();e.stopPropagation();if(!yt.parentElement||yt.parentElement.querySelector('iframe.yt-frame'))return;
  playInline(yt,{openUrl:'https://www.youtube.com/watch?v='+yt.dataset.ytPlay});return}
 const edit=e.target.closest('[data-title-edit],[data-note-edit]');
 if(edit){if(LTDEMO.readOnly)return;e.preventDefault();e.stopPropagation();const id=edit.dataset.titleEdit||edit.dataset.noteEdit||'';if(window.parent===window){toast('이 순간 고치기는 러브트리 화면에서 열 수 있어요');return}
  window.parent.postMessage({type:'lt41-select',id},location.origin);
  window.parent.postMessage({type:'lt41-write',mode:'edit',momentId:id},location.origin);return}
 if(e.target.closest('[data-detail-viewer]')){e.preventDefault();openViewer();return}
 // #327 2부: 옮기기는 셸 정리 창이 맡는다(여기는 요청만 보낸다).
 const move=e.target.closest('[data-detail-move]');
 if(move){e.preventDefault();e.stopPropagation();parent.postMessage({type:'lt41-move',momentId:move.dataset.detailMove},location.origin);return}
 if(e.target.closest('[data-detail-index]')){e.preventDefault();closeDetail();openArchive();return}
 if(e.target.closest('[data-detail-close]')){e.preventDefault();closeDetail();return}
},true);
/* 2. 자동 제목은 표시 단계에서만 거른다(데이터 그대로). 제목·마음 한마디·감정을 나눠 그린다(#345).
   날짜는 제목 위에 작게, 제목이 주인공, 감정은 색 점+글자, 마음 한마디가 비면 흐린 안내(누르면 바로 쓰기). */
function emotionMarkup(emotion){
 const value=String(emotion||'').trim();
 if(!value)return '';
 return '<span class="moment-emotion"><span class="emotion-dot" data-tone="'+window.LT59Model.emotionTone(value)+'" aria-hidden="true"></span>'+t(value)+'</span>';
}
function paintTitle(m){
 const source=LTDEMO.moments.find(x=>x.id===m.id);
 const view=titleViewFor(source||m);
 const parts={main:view.main,note:view.note,media:view.sub};
 const noteText=source?String(source.memo??'').trim():parts.note;
 parts.note=noteText;
 const hands=editAffordances({readOnly:!!LTDEMO.readOnly,synthetic:!!m.synthetic,hasTitle:!!parts.main,hasNote:!!parts.note});
 const date=m.date?'<p class="moment-date">'+t(formatDisplayDate(m.date))+'</p>':'';
 const sub=parts.media?'<p class="video-title">▶ '+t(parts.media)+'</p>':'';
 const heading=parts.main?(hands.title
  ?'<div class="moment-heading"><button type="button" class="moment-title-button" data-title-edit="'+t(m.id)+'" aria-label="제목 고치기: '+t(parts.main)+'">'+t(parts.main)+'</button>'+(hands.hint?'<button type="button" class="title-edit-hint" data-title-edit="'+t(m.id)+'" aria-label="제목 고치기"><span aria-hidden="true">✎</span> 고치기</button>':'')+'</div>'
  :'<h3>'+t(parts.main)+'</h3>'):'';
 const guide='<button type="button" class="moment-note is-empty'+(parts.main?'':' moment-note-lead')+'" data-note-edit="'+t(m.id)+'">이 순간에 남기고 싶은 마음을 적어 보세요…</button>';
 let lead='';
 if(parts.main)lead=heading+sub;
 else if(parts.note)lead='<p class="moment-note moment-note-lead">'+t(parts.note)+'</p>';
 else if(hands.guide)lead=guide;
 const tail=parts.main?(parts.note?'<p class="moment-note">'+t(parts.note)+'</p>':(hands.guide?guide:'')):'';
 return '<div class="moment-title">'+date+lead+emotionMarkup(m.emotion)+tail+'</div>';
}
/* 3. 한 페이지에 다 들어오게 + 1. YouTube는 그 자리에서 재생(누르기 전 외부 요청 0). */
const NEXT_TITLE='이 순간 다음 이야기를 남겨 보세요';
function localThumb(m){const src=String(m.image||'');if(src.startsWith('data:image/'))return src;if(src.startsWith('/api/media/'))return src;return ''}
const originalMomentContent=momentContent;
momentContent=function(m,compact=false){
 const safe=withoutAutoTitle(m);
 if(safe.url&&window.LTMedia&&LTMedia.describe){
  const media=LTMedia.describe(safe.url);
  if(media.kind==='youtube'){
   // #327 1부: 내 기록(서버·로그인 소유자)은 썸네일을 처음부터 보여 준다(판정은 media-preview 의
   // autoLoadMedia 한 함수). 공유·예시는 기존 규칙 그대로 — 누르기 전 외부 요청 0.
   const thumb=localThumb(safe);
   const ctx=(typeof LTMedia.currentContext==='function')?LTMedia.currentContext():{source:'',owned:false};
   const auto=!thumb&&LTMedia.autoLoadMedia(ctx.source,ctx.owned);
   // #393: 세로 영상은 세로 틀(9:16)·원본 비율 썸네일(잘림 없음). 판정·주소는 LTMedia 한 벌.
   const vertical=LTMedia.verticalVideo(safe.url,safe.mediaMetadata);
   const remoteThumb=vertical?LTMedia.youtubeThumbUrl(media.videoId,true):media.loadUrl;
   const thumbFallback=vertical?' onerror="this.onerror=null;this.src=\''+LTMedia.youtubeThumbUrl(media.videoId,false)+'\'"':'';
   const label=media.startSeconds?('여기서 재생 · '+media.label.replace('YouTube 링크 · ','')):'여기서 재생';
   const face=thumb?'<img src="'+t(thumb)+'" alt="">'
    :auto?'<img src="'+t(remoteThumb)+'" alt="'+t(safe.title||'YouTube 영상 썸네일')+'"'+thumbFallback+' referrerpolicy="no-referrer" loading="lazy" decoding="async">'
    :'<span class="yt-placeholder"></span>';
   // #345: 영상 바로 아래 한 줄 — ▶ 영상 제목 · 채널 … YouTube ↗. 제목이 없으면 원본 링크만 남긴다.
    const source=String(safe.mediaMetadata?.channel||'').trim();
   const piece='<div class="clipping moment" data-moment="'+t(safe.id)+'">'+
    '<div class="yt-expand"><button type="button" data-yt-expand="'+t(safe.id)+'">크게 보기</button></div>'+
    '<button type="button" class="yt-play'+(vertical?' is-vertical':'')+'" data-yt-play="'+t(media.videoId)+'" data-yt-start="'+t(media.startSeconds||0)+'"'+(vertical?' data-yt-vertical="1"':'')+'>'+
    face+
    '<span class="yt-play-label">'+t(label)+'</span></button>'+
    '<div class="media-source">'+
    (source?'<span class="media-source-mark" aria-hidden="true">▶</span><span class="media-source-text">'+t(source)+'</span><span class="media-source-sep" aria-hidden="true"></span>':'')+
    '<a class="media-source-link" href="'+t(media.openUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">YouTube ↗</a></div></div>';
   return piece+paintTitle(safe);
  }
 }
 return originalMomentContent(safe,compact);
};
/* 8. 가운데 머리 표시는 CSS로 지우고, 4. 오른쪽 빈 페이지 문구·버튼을 여기서 만든다. */
const originalRenderSpread=renderSpread;
renderSpread=function(idx,focusId=null,land=true){
 originalRenderSpread(idx,focusId,land);
 for(const [host,side] of [[leftPage,'left'],[rightPage,'right']]){
  const m=SPREADS[current][side];if(!m||m.synthetic)continue;
  const old=host.querySelector('.moment-title');if(old)old.outerHTML=paintTitle(m);
 }
 const right=SPREADS[current].right;
 if(right&&right.synthetic){
  rightPage.innerHTML='<div class="next-page"><div><b>'+t(NEXT_PAGE_COPY)+'</b></div>'+(LTDEMO.readOnly?'':'<button type="button" data-next-moment="'+t(SPREADS[current].left.id)+'">'+t(NEXT_PAGE_ACTION)+'</button>')+'</div>';
 }
 // #345: 390 한 장도 같은 규칙(날짜·제목·감정·마음 안내)으로 다시 그린다.
 const mobileMain=!SPREADS[current].right.synthetic&&focusId===SPREADS[current].right.id?SPREADS[current].right:SPREADS[current].left;
 const mobileTitle=mobileContent.querySelector('.moment-title');
 if(mobileTitle&&mobileMain&&!mobileMain.synthetic)mobileTitle.outerHTML=paintTitle(mobileMain);
 paintLensButton();
};
/* 9. 연결 안내는 한 줄, 다음 순간이 없으면 숨긴다. 시스템 용어를 쓰지 않는다. */
const originalUpdateConnectionSummary=updateConnectionSummary;
updateConnectionSummary=function(id){
 const next=nextMomentOf(id),host=$b('#whyMargin');
 const line=connectionLine(next&&next.title,next&&next.reason);
 if(!line){host.hidden=true;host.replaceChildren();return}
 host.hidden=false;
 host.innerHTML='<span></span>'+t(line);
};
/* 4. 모바일에서도 같은 문구·버튼. */
const originalMobileSpreadContent=mobileSpreadContent;
mobileSpreadContent=function(s,focusId=null){
 let html=originalMobileSpreadContent(s,focusId);
 if(s.right&&s.right.synthetic){
  const at=html.lastIndexOf('<div class="mobile-support">');
  if(at>=0){const close=html.indexOf('</div>',at);
   if(close>at)html=html.slice(0,at)+'<div class="mobile-support next-page"><b>'+t(NEXT_TITLE)+'</b>'+(LTDEMO.readOnly?'':'<button type="button" data-next-moment="'+t(s.left.id)+'">'+t(NEXT_PAGE_ACTION)+'</button>')+'</div>'+html.slice(close+6);}
 }
 return html;
};
/* #345: '여기까지 온 길' — 처음 순간부터 지금 보는 순간까지의 세로 타임라인.
   칸·단계·일수·감정 색 계산은 LT59Model.journeyTimeline(book-model.js)이 맡고 여기는 그리기만 한다. */
let journeyOpener=null;
function journeyMarkup(journey){
 return journey.items.map(item=>{
  const thumb=item.thumb?'<img src="'+t(item.thumb)+'" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async">':'';
  const emotion=item.emotion?'<span class="journey-emotion"><span class="emotion-dot" data-tone="'+item.tone+'" aria-hidden="true"></span>'+t(item.emotion)+'</span>':'';
  return '<button type="button" class="journey-item'+(item.current?' current':'')+'" data-journey="'+item.index+'" data-focus="'+t(item.id)+'">'+
   '<span class="journey-thumb" data-tone="'+item.tone+'">'+thumb+'</span>'+
   '<span class="journey-node" aria-hidden="true"></span>'+
   '<span class="journey-text"><span class="journey-date">'+t(formatDisplayDate(item.date))+(item.first?' · 첫 순간':'')+'</span>'+
   '<span class="journey-title-row"><span class="journey-title">'+t(item.title)+'</span>'+(item.current?'<span class="journey-now">지금 보는 순간</span>':'')+'</span>'+
   emotion+'</span></button>'+
   (item.reason?'<p class="journey-reason">↳ '+t(item.reason)+'</p>':'');
 }).join('');
}
function openJourney(){
 journeyOpener=document.activeElement;
 const journey=LT59Model.journeyTimeline(LTDEMO.moments,LTDEMO.edges,LTDEMO.get(),titleMainFor);
 $b('#overviewFlow').innerHTML=journeyMarkup(journey);
 $b('#journeySummary').textContent=journey.days===null?journey.steps+'단계':journey.steps+'단계 · '+journey.days+'일';
 const overlay=$b('#overview');overlay.inert=false;overlay.classList.add('open');
 setTimeout(()=>$b('#overviewClose').focus(),40);
}
function closeJourney(){
 const overlay=$b('#overview');overlay.classList.remove('open');overlay.inert=true;
 if(journeyOpener&&journeyOpener.isConnected)try{journeyOpener.focus({preventScroll:true})}catch{}
 journeyOpener=null;
}
$b('#overviewBtn').onclick=openJourney;
$b('#overviewClose').onclick=closeJourney;
$b('#overview').addEventListener('click',e=>{if(e.target===$b('#overview'))closeJourney()});
$b('#overview').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeJourney()}});
$b('#overviewFlow').addEventListener('click',e=>{
 const item=e.target.closest('[data-journey]');if(!item)return;
 const momentIndex=Number(item.dataset.journey),focus=item.dataset.focus||'';
 closeJourney();
 const spread=Math.floor(momentIndex/2);
 if(spread===current)renderSpread(current,focus,false);
 else autoTurn(spread>current?'next':'prev',spread,focus);
});
window.__TRACK59__.openOverview=openJourney;
/* 5. 돋보기는 도구 줄에서 켜고 끈다. */
$b('#lensBtn').onclick=()=>{lensPref=!lensPref;writeLens(lensPref,window.localStorage);paintLensButton();if(!lensPref)hideLens()};
paintLensButton();if(!lensPref)hideLens();
/* #212: 책 위쪽 갈래 글자와 목차 머리에 트리 이름을 보여 준다(자동 접미사는 표시 단계에서만 뺀다). */
function paintTreeTitles(){
 const name=treeTitleText(LTDEMO&&LTDEMO.title);
 if(!name)return;
 for(const el of document.querySelectorAll('.crumb')){if(el.textContent!==name)el.textContent=name;}
 const head=document.querySelector('.archive-head');
 if(head){
  let line=head.querySelector('.archive-tree');
  if(!line){line=document.createElement('p');line.className='archive-tree';head.after(line);}
  if(line.textContent!==name)line.textContent=name;
 }
 if(document.body.dataset.treeName!==name)document.body.dataset.treeName=name;
}
paintTreeTitles();
/* 원본 화면은 이 모듈보다 먼저 한 번 그린다. 새 규칙으로 다시 그린다(저장·선택은 그대로). */
/* #295 보완: 넘침 판정을 렌더 때만 하면 이미지가 늦게 로드되어 페이지가 나중에 넘칠 때 다시 잘린다.
   book.js(클래식)는 createOverflowRejudge를 못 불러 오므로 여기서 연결하고, 이미지 load·창 크기 변경·
   페이지 크기 변화(ResizeObserver) 뒤에 rAF로 묶어 다시 판정하게 한다. 아래 재그리기 때 관찰이 시작된다. */
window.__TRACK59__.overflowRejudge=createOverflowRejudge({judge:()=>window.__TRACK59__.rejudgeOverflow(),raf:f=>requestAnimationFrame(f),cancelRaf:id=>cancelAnimationFrame(id),addDocListener:(t,f,o)=>document.addEventListener(t,f,o),addWinListener:(t,f)=>addEventListener(t,f),ResizeObserver:typeof ResizeObserver==='undefined'?null:ResizeObserver,isPageImage:n=>n instanceof HTMLImageElement&&!!n.closest('.page-content,.mobile-content')});
renderSpread(current,LTDEMO.get(),false);
syncLensClone();
window.__BOOK_USABILITY__={titleParts,closeDetail,placeDetail,nextMomentOf,paintTitle,openJourney,get lensPref(){return lensPref}};

// #347 후속: 계정 제목 보기 설정이 바뀌면 지금 펼침면·상세를 다시 그린다.
addEventListener('message',e=>{if(e.data?.type!=='lt41-title-display')return;try{LTDEMO.prefs={...(LTDEMO.prefs||{}),titleDisplay:e.data.value}}catch{}try{renderSpread(current,LTDEMO.get(),false)}catch{}if($b('#detail')?.classList.contains('open')&&selectedMomentId)showDetail(selectedMomentId);});
// book-extra는 book.js 뒤에 불러오므로, 첫 렌더 제목을 한 벌 규칙으로 다시 그린다.
// #379 후속: 재그림은 현재 선택 순간(LTDEMO.get())을 유지해, 펼침면 오른쪽 페이지의 순간을 열면
// 왼쪽 페이지 순간으로 선택이 돌아가는 문제를 막는다(renderSpread의 land가 기본 true여 focusId 없으면 left.id로 재선택).
try{renderSpread(current,LTDEMO.get(),false)}catch{}
