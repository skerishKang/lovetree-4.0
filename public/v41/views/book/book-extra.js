// 2026-11-08 기억책 사용성 1~9 화면 보조. 데이터·저장 계약은 그대로 두고 표시만 바꾼다.
import {displayTitle,withoutAutoTitle,titleParts,embedUrl,connectionLine,readLens,writeLens,detailPlacement,nextMomentMessage,NEXT_PAGE_COPY,NEXT_PAGE_ACTION,treeTitleText,isPrimaryButton,tapIntent,createOverflowRejudge} from '/v41/book-usability.mjs';
const $b=s=>document.querySelector(s);
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
 if(window.parent===window){toast('순간 추가는 러브트리 화면에서 열 수 있어요');return}
 // 편집기는 지금 고른 순간을 기준으로 열린다. 먼저 이 순간을 고른 뒤 추가를 연다.
 window.parent.postMessage({type:'lt41-select',id:parentId},location.origin);
 window.parent.postMessage({...nextMomentMessage(parentId)},location.origin);
}
/* 6. 상세 카드: 오른쪽 페이지가 비면 오른쪽 페이지에, 아니면 카드 옆 작은 패널로. */
let detailAnchor=null;
const nextMomentOf=id=>LT59Model.nextMomentOf(id,LTDEMO.moments,LTDEMO.edges,displayTitle);
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
 return '<div class="detail-kicker">'+t(LTLabels.type(m.kind))+' · '+t(m.date)+' · '+t(m.emotion)+'</div>'+
  (displayTitle(m.title)?'<h2>'+t(displayTitle(m.title))+'</h2>':'')+
  '<p>'+t(m.note)+' · 출처: '+t(m.source)+'</p>'+
  '<div class="chips">'+m.keywords.map(k=>'<span class="chip">#'+t(k)+'</span>').join('')+'</div>'+
  '<div class="detail-why">'+t(line||'연결 이유는 아직 적지 않았어요')+'</div>'+
  '<div class="detail-actions"><button type="button" data-detail-viewer>순간 열기</button>'+
  (m.url?'<a href="'+t(m.url)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+open+'</a>':'')+
  '<button type="button" data-detail-index>목차에서 보기</button></div>';
}
function cardFor(id){return [...document.querySelectorAll('.moment[data-moment]')].find(el=>el.dataset.moment===id&&el.closest('.page,.mobile-page'))||null}
function placeDetail(id,card){
 const m=metadataFor(id);if(!m)return;
 // 390에서는 오른쪽 페이지가 화면에 없으므로 카드 옆 패널을 쓴다.
 const rightEmpty=!!SPREADS[current].right?.synthetic&&window.innerWidth>820;
 if(detailPlacement(rightEmpty)==='right-page'){
  rightPage.innerHTML='<div class="page-detail">'+detailMarkup(m)+'</div>';
 }else{
  const panel=$b('#detailSide');if(!panel)return;
  panel.innerHTML='<div class="detail-top"><span class="detail-kicker">'+t(LTLabels.type(m.kind))+' · '+t(m.date)+'</span><button type="button" class="close" data-detail-close aria-label="상세 닫기">×</button></div><div class="side-detail">'+detailMarkup(m)+'</div>';
  panel.hidden=false;
  if(window.innerWidth<=820){panel.style.top='';}
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
 $b('#detail')?.classList.remove('open');
 const card=cardFor(id);
 if(card)placeDetail(id,card);
};
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const panel=$b('#detailSide');if(panel&&!panel.hidden){e.preventDefault();closeDetail();}},true);
/* 1. 실제 기록에서 재생 단추가 눌리지 않던 문제(2026-11-08): 카드 위 겹침·다른 리스너의 전파 차단에
   영향받지 않도록 pointerdown에서 먼저 잡고, 재생 주소를 못 만들면 원본 링크를 새 창으로 연다. */
function playInline(yt,media){
 const url=embedUrl(yt.dataset.ytPlay,Number(yt.dataset.ytStart||0));
 if(!url){if(media&&media.openUrl)window.open(media.openUrl,'_blank','noopener');return}
 const frame=document.createElement('iframe');frame.className='yt-frame';frame.src=url;frame.title='YouTube 영상 재생';
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
 const next=e.target.closest('[data-next-moment]');
 if(next){e.preventDefault();e.stopPropagation();requestNextMoment(next.dataset.nextMoment||selectedMomentId);return}
 /* 1. YouTube 그 자리 재생: 누른 뒤에만 iframe을 만든다(시작 시점 반영, referrerpolicy 엄격). */
 const yt=e.target.closest('[data-yt-play]');
 if(yt){e.preventDefault();e.stopPropagation();if(!yt.parentElement||yt.parentElement.querySelector('iframe.yt-frame'))return;
  playInline(yt,{openUrl:'https://www.youtube.com/watch?v='+yt.dataset.ytPlay});return}
 const edit=e.target.closest('[data-title-edit]');
 if(edit){e.preventDefault();e.stopPropagation();if(window.parent===window){toast('제목 고치기는 러브트리 화면에서 열 수 있어요');return}
  window.parent.postMessage({type:'lt41-select',id:edit.dataset.titleEdit},location.origin);
  window.parent.postMessage({type:'lt41-write',mode:'edit',momentId:edit.dataset.titleEdit},location.origin);return}
 if(e.target.closest('[data-detail-viewer]')){e.preventDefault();openViewer();return}
 if(e.target.closest('[data-detail-index]')){e.preventDefault();closeDetail();openArchive();return}
 if(e.target.closest('[data-detail-close]')){e.preventDefault();closeDetail();return}
},true);
/* 2. 자동 제목은 표시 단계에서만 거른다(데이터 그대로). 제목·영상 제목·마음 한마디를 나눠 그린다. */
function paintTitle(m){
 const parts=titleParts(m);
 return '<div class="moment-title">'+
  (parts.main?'<h3>'+t(parts.main)+'</h3>':'<p class="moment-note">'+t(parts.note||'아직 마음 한마디를 남기지 않았어요')+'</p>')+
  (parts.main&&parts.note?'<p class="moment-note">'+t(parts.note)+'</p>':'')+
  (parts.media?'<p class="moment-video">'+t(parts.media)+'</p>':'')+
  '<p>'+t(m.date)+' · '+t(m.emotion)+' · '+t(m.source)+'</p>'+
  '<div class="chips">'+m.keywords.map(k=>'<span class="chip">#'+t(k)+'</span>').join('')+'</div>'+
  (m.synthetic?'':'<button type="button" class="title-edit" data-title-edit="'+t(m.id)+'">제목 고치기</button>')+
  '</div>';
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
   const thumb=localThumb(safe);
   const label=media.startSeconds?('여기서 재생 · '+media.label.replace('YouTube 링크 · ','')):'여기서 재생';
   const piece='<div class="clipping moment" data-moment="'+t(safe.id)+'">'+
    '<button type="button" class="yt-play" data-yt-play="'+t(media.videoId)+'" data-yt-start="'+t(media.startSeconds||0)+'">'+
    (thumb?'<img src="'+t(thumb)+'" alt="">':'<span class="yt-placeholder"></span>')+
    '<span class="yt-play-label">'+t(label)+'</span></button>'+
    '<a class="ui-btn ui-link" href="'+t(media.openUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">YouTube에서 열기 ↗</a></div>';
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
  rightPage.innerHTML='<div class="next-page"><div><b>'+t(NEXT_PAGE_COPY)+'</b></div><button type="button" data-next-moment="'+t(SPREADS[current].left.id)+'">'+t(NEXT_PAGE_ACTION)+'</button></div>';
 }
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
   if(close>at)html=html.slice(0,at)+'<div class="mobile-support next-page"><b>'+t(NEXT_TITLE)+'</b><button type="button" data-next-moment="'+t(s.left.id)+'">'+t(NEXT_PAGE_ACTION)+'</button></div>'+html.slice(close+6);}
 }
 return html;
};
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
window.__BOOK_USABILITY__={titleParts,closeDetail,placeDetail,nextMomentOf,paintTitle,get lensPref(){return lensPref}};
