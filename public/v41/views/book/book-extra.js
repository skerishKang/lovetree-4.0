// 2026-11-08 책 사용성 1~9 화면 보조. 데이터·저장 계약은 그대로 두고 표시만 바꾼다.
import {displayTitle,withoutAutoTitle,titleParts,mediaSourceText,editAffordances,embedUrl,connectionLine,readLens,writeLens,detailPlacement,nextMomentMessage,NEXT_PAGE_COPY,NEXT_PAGE_ACTION,treeTitleText,isPrimaryButton,createOverflowRejudge,titleView,formatDisplayDate} from '/v41/book-usability.mjs';
import {formatRange,youtubeRangeEmbedUrl} from '/v41/domain.mjs';
import {coverChoice,COVER_PALETTE} from '/v41/views/shelf/shelf-model.mjs';
import {coverMomentFor} from '/v41/views/shelf/shelf-model.mjs';
import {thumbnailCandidates,thumbFallbackAttrs,coverFallbackAttrs,fallbackCardMarkup,mountThumbFallback,VIDEO_UNAVAILABLE_TEXT} from '/v41/thumb-fallback.mjs';
import {mountExpandControls,ytOpenUrl} from '/v41/yt-expand.mjs';
import {createCommunityApi} from '/v41/community-api.mjs';
// #792 4단계 ⑤: 공유 책의 순간 상세에서도 같은 규칙으로 '이 무대 담기' 단추를 붙인다.
import {stageShareId,stageVoteLabel,stageVoteNotice,readStage,toggleStage} from '/v41/community-stages.mjs';
mountThumbFallback(document);
const $b=s=>document.querySelector(s);
// #347 후속: 제목 보기 설정은 계정(LTDEMO.prefs)에서 읽고, 화면은 한 벌(titleView)로 그린다.
const titleDisplay=()=>{try{return LTDEMO.prefs?.titleDisplay||'both'}catch{return 'both'}};
const titleViewFor=m=>titleView(m,titleDisplay());
const titleMainFor=(title,m)=>m?titleViewFor(m).main:(title||'');
/* #368 3차: 날짜 표기는 계정 설정(state.prefs.dateStyle). 셸이 프레임 속성(data-lt-date-style)과
   lt41-date-style 메시지로 알려 주고, 바뀌면 열려 있는 펼침면·상세를 다시 그린다. */
const ltDateStyle=()=>{
 try{const attr=document.documentElement.getAttribute('data-lt-date-style');if(attr)return attr;
  const cached=localStorage.getItem('lt41.dateStyle');if(cached)return cached;}catch{}
 return 'dot';};
const styledDate=v=>formatDisplayDate(v,ltDateStyle());
try{window.LTBookTitle={view:titleViewFor,date:styledDate}}catch{}
const t=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
/* 5. 돋보기: 기본 꺼짐. 선택값은 localStorage(실패하면 꺼짐). */
let lensPref=readLens(window.localStorage);
try{lensOn=lensPref}catch{}
/* 이슈 584: 돋보기는 아이콘 단추 — 글자 대신 SVG를 쓰고, 상태는 aria-pressed·말풍선으로 알린다. */
function paintLensButton(){const b=$b('#lensBtn');if(!b)return;b.classList.toggle('active',lensPref);b.setAttribute('aria-pressed',String(lensPref));const tip='돋보기 — 마우스 근처를 크게 보기 · '+(lensPref?'켜짐':'꺼짐');b.setAttribute('data-lt-tip',tip);b.setAttribute('aria-label',tip)}
/* 이슈 584: 머리줄 단추 설명 — 브라우저 기본 title 대신 러브트리 모양 작은 말풍선.
   마우스를 올리거나 키보드 초점에 뜨고, 휴대폰(마우스 없는 기기)은 0.5초 길게 누르면 뜬다.
   설명 문구는 단추의 aria-label 과 같아서 낭독기와 눈이 같은 말을 듣는다. */
let tipTimer=0,tipTarget=null;
function showTip(el){
 const text=el?.getAttribute?.('data-lt-tip');if(!text)return;
 let bubble=$b('#lt-tip-bubble');
 if(!bubble){bubble=document.createElement('div');bubble.id='lt-tip-bubble';bubble.className='lt-tip-bubble';bubble.setAttribute('role','tooltip');document.body.appendChild(bubble)}
 tipTarget=el;bubble.textContent=text;bubble.hidden=false;
 const r=el.getBoundingClientRect(),b=bubble.getBoundingClientRect();
 const left=Math.max(8,Math.min(r.left+r.width/2-b.width/2,innerWidth-b.width-8));
 let top=r.top-b.height-8;if(top<8)top=r.bottom+8;
 bubble.style.left=left+'px';bubble.style.top=top+'px';
}
function hideTip(){tipTarget=null;clearTimeout(tipTimer);const bubble=$b('#lt-tip-bubble');if(bubble)bubble.hidden=true}
function mountTips(){
 document.addEventListener('mouseover',e=>{const el=e.target.closest?.('[data-lt-tip]');if(el)showTip(el)});
 document.addEventListener('mouseout',e=>{if(tipTarget&&(!e.relatedTarget||!tipTarget.contains(e.relatedTarget)))hideTip()});
 document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-lt-tip]');if(el)showTip(el)});
 document.addEventListener('focusout',()=>hideTip());
 addEventListener('scroll',hideTip,true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTip()});
 document.addEventListener('pointerdown',e=>{const el=e.target.closest?.('[data-lt-tip]');if(!el||matchMedia('(hover:hover)').matches)return;tipTimer=setTimeout(()=>showTip(el),500)},{passive:true});
 for(const kind of ['pointerup','pointercancel','pointermove'])document.addEventListener(kind,e=>{if(matchMedia('(hover:hover)').matches)return;clearTimeout(tipTimer);if(kind!=='pointermove'||!tipTarget?.contains(e.target))hideTip()},{passive:true});
}
/* 4. '다음 순간 추가': 이 순간을 부모로 기존 순간 추가 편집기를 연다. */
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
 setBookOpen($b('#detail'),false);
 if(card&&card.isConnected){card.classList.remove('detail-open');card.setAttribute('tabindex','-1');try{card.focus({preventScroll:true})}catch{}}
}
function detailMeta(m){return t(LTLabels.type(m.kind))+' · '+t(formatDisplayDate(m.date,ltDateStyle()))+' · '+t(m.emotion)}
function detailMarkup(m,showMeta=true){
 const nextInfo=nextMomentOf(m.id);
 /* #815: 연결 이유는 적었을 때만 보인다(비면 아무것도 그리지 않는다). */
 const line=connectionLine(nextInfo?.title,nextInfo?.reason,{hideEmptyWhy:true});
 const rangeLine=formatRange(m.startSeconds,m.endSeconds);
 const open=m.url&&isYouTubeUrl(m.url)?'YouTube에서 열기 ↗':'원본 링크 열기 ↗';
 // #327 2부: 내 기록(서버)의 순간 상세에서 다른 트리로 옮길 수 있다. 공유·예시는 숨긴다.
 const canMove=(window.parent&&window.parent.LT41)?window.parent.LT41.source==='server':false;
 const view=titleViewFor(m);
 return (showMeta?'<div class="detail-kicker">'+detailMeta(m)+'</div>':'')+
  (view.main?'<h2>'+t(view.main)+'</h2>'+(view.sub&&view.sub.toLowerCase()!==view.main.trim().toLowerCase()?'<p class="video-title">▶ '+t(view.sub)+'</p>':''):'')+
  '<p>'+t(m.note)+' · 출처: '+t(m.source)+'</p>'+
  (rangeLine?'<p class="detail-range">기억할 구간 '+t(rangeLine)+'</p>':'')+
  '<div class="chips">'+m.keywords.map(k=>'<span class="chip">#'+t(k)+'</span>').join('')+'</div>'+
  (line?'<div class="detail-why">'+t(line)+'</div>':'')+
  '<div class="detail-actions"><button type="button" data-detail-viewer>순간 열기</button>'+
  '<button type="button" data-detail-stage hidden>이 무대 담기</button>'+
  (m.url?'<a href="'+t(m.url)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+open+'</a>':'')+
  '<button type="button" data-detail-index>목차에서 보기</button>'+
  (canMove?'<button type="button" data-detail-move="'+t(m.id)+'">다른 트리로 옮기기</button>':'')+'</div>';
}
/* #792 4단계 ⑤: 표지·고른 순간이 공개 무대일 때만 '순간 열기' 옆에 '이 무대 담기'가 선다.
   공유 번호는 주소(#share/<id>/<보기>)에서 읽는다 — 셸에 새 값을 넘기지 않는다.
   단추가 확인되기 전에는 hidden으로 자리도 비워 두지 않는다(상세 줄이 흔들리지 않게). */
let stageMountToken=0;
async function mountStageButton(m){
 const button=$b('[data-detail-stage]');if(!button||!m)return;
 const host=window.parent!==window&&window.parent.location?window.parent.location:location;
 const shareId=stageShareId(host.hash);if(!shareId)return;
 const token=++stageMountToken;
 const stage=await readStage({api:createCommunityApi(),shareId,momentId:m.id});
 if(token!==stageMountToken||!button.isConnected||!stage)return;
 const note=document.createElement('p');note.className='detail-stage-note';note.setAttribute('role','status');note.hidden=true;
 button.after(note);
 const paint=voted=>{button.textContent=stageVoteLabel(voted);button.setAttribute('aria-pressed',String(voted));button.hidden=false;};
 paint(stage.voted);
 button.addEventListener('click',async()=>{
  button.disabled=true;
  const result=await toggleStage({api:createCommunityApi(),stageId:stage.stageId,voted:button.getAttribute('aria-pressed')==='true'});
  button.disabled=false;
  if(!result.ok){note.textContent=stageVoteNotice(result.answer);note.hidden=false;return;}
  note.hidden=true;paint(result.voted);
 });
}
function cardFor(id){return [...document.querySelectorAll('.moment[data-moment]')].find(el=>el.dataset.moment===id&&el.closest('.page,.mobile-page'))||null}
function placeDetail(id,card){
 const m=metadataFor(id);if(!m)return;
 // 390에서는 오른쪽 페이지가 화면에 없으므로 카드 옆 패널을 쓴다.
 /* #393 4: 한 장/두 장은 폭이 아니라 보기 모드가 정한다(book.js의 single()). */
  const rightEmpty=!!currentSpread()?.right?.synthetic&&!single();
 if(detailPlacement(rightEmpty)==='right-page'){
  rightPage.innerHTML='<div class="page-detail">'+detailMarkup(m)+'</div>';
 }else{
  const panel=$b('#detailSide');if(!panel)return;
  panel.innerHTML='<div class="detail-top"><span class="detail-kicker">'+detailMeta(m)+'</span><button type="button" class="close" data-detail-close aria-label="상세 닫기">×</button></div><div class="side-detail">'+detailMarkup(m,false)+'</div>';
  panel.hidden=false;
  if(narrow()){panel.style.top='';}
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
 mountStageButton(m);
}
const originalShowDetail=showDetail;
showDetail=function(id){
 originalShowDetail(id);
 const m=metadataFor(id);if(m){const view=titleViewFor(m);$b('#detailTitle').textContent=view.main;if(view.sub)$b('#detailTag').textContent+=' · ▶ '+view.sub;}
 setBookOpen($b('#detail'),false);
 const card=cardFor(id);
 if(card)placeDetail(id,card);
};
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(document.querySelector('.lt-lightbox'))return;const panel=$b('#detailSide');if(panel&&!panel.hidden){e.preventDefault();closeDetail();}},true);
/* 1. 실제 기록에서 재생 단추가 눌리지 않던 문제(2026-11-08): 카드 위 겹침·다른 리스너의 전파 차단에
   영향받지 않도록 pointerdown에서 먼저 잡고, 재생 주소를 못 만들면 원본 링크를 새 창으로 연다. */
function playInline(yt,media){
 const start=Number(yt.dataset.ytStart||0),end=Number(yt.dataset.ytEnd||0);
 const url=(end>start)?(youtubeRangeEmbedUrl(yt.dataset.ytPlay,start,end)+'&autoplay=1'):embedUrl(yt.dataset.ytPlay,start);
 if(!url){if(media&&media.openUrl)window.open(media.openUrl,'_blank','noopener');return}
 const frame=document.createElement('iframe');frame.className='yt-frame'+(yt.dataset.ytVertical==='1'?' is-vertical':'');frame.src=url;frame.title='YouTube 영상 재생';
 frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';frame.allowFullscreen=true;
 frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 const host=yt.parentElement;if(!host)return;
 // #833: 쇼츠는 재생 중 YouTube가 전체 화면 단추를 숨기므로 칸 모서리 단추로 크게 본다(안 되면 덮는 창).
 const watch=(media&&media.openUrl)?media.openUrl:('https://www.youtube.com/watch?v='+yt.dataset.ytPlay);
 const cell=mountExpandControls(host,{url:watch,openUrl:watch,vertical:yt.dataset.ytVertical==='1',lightbox:(u,ti,v)=>{window.LTMedia&&LTMedia.openLightbox(u,ti,v)}});
 cell.stage.append(frame);
 if(end>start)host.insertAdjacentHTML('beforeend','<button type="button" class="yt-from-start" data-yt-from-start="'+t(yt.dataset.ytPlay)+'">처음부터 보기</button>');
}
document.addEventListener('pointerdown',e=>{
 if(!isPrimaryButton(e))return;
 if(e.target.closest&&e.target.closest('[data-lt-title-edit]'))return;
 const fromStart=e.target.closest&&e.target.closest('[data-yt-from-start]');
 if(fromStart){e.preventDefault();e.stopPropagation();const host=fromStart.parentElement;if(!host||host.querySelector('iframe.yt-frame'))return;
  const frame=document.createElement('iframe');frame.className='yt-frame';frame.src=embedUrl(fromStart.dataset.ytFromStart,0);frame.title='YouTube 영상 재생';
  frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';frame.allowFullscreen=true;
  frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
  // #833: '처음부터 보기' 재생 칸도 같은 모서리 단추를 둔다.
  const cell=mountExpandControls(host,{url:ytOpenUrl(fromStart.dataset.ytFromStart),openUrl:ytOpenUrl(fromStart.dataset.ytFromStart),lightbox:(u,ti,v)=>{window.LTMedia&&LTMedia.openLightbox(u,ti,v)}});
  cell.stage.append(frame);return}
 const yt=e.target.closest&&e.target.closest('[data-yt-play]');
 if(!yt||yt.querySelector('.lt-fallback-card'))return;
 e.preventDefault();e.stopPropagation();
 const url=yt.dataset.ytPlay?{openUrl:'https://www.youtube.com/watch?v='+yt.dataset.ytPlay+(Number(yt.dataset.ytStart||0)?'&t='+Number(yt.dataset.ytStart||0):'')}:null;
 playInline(yt,url);
},true);
document.addEventListener('click',e=>{
 if(!isPrimaryButton(e))return;
 const noteMore=e.target.closest&&e.target.closest('[data-note-more]');
 if(noteMore){e.preventDefault();e.stopPropagation();const wrap=noteMore.closest('.moment-note-wrap');if(wrap){const open=wrap.classList.toggle('is-open');noteMore.textContent=open?'접기':'더 보기';noteMore.setAttribute('aria-expanded',String(open));}return}
 if(e.target.closest&&e.target.closest('[data-lt-title-edit]'))return;
 // #393 2: 크게 보기 — 어두운 깔개 위 화면 가운데 크게(세로 높이 가득·가로 폭 가득). 바깥 클릭·Esc로 책 복귀.
 const expand=e.target.closest('[data-yt-expand]');
 if(expand){e.preventDefault();e.stopPropagation();const m=metadataFor(expand.dataset.ytExpand);
  if(m&&m.url&&window.LTMedia&&LTMedia.openLightbox)LTMedia.openLightbox(m.url,titleViewFor(m).main,LTMedia.verticalVideo(m.url,m.mediaMetadata));return}
 const next=e.target.closest('[data-next-moment]');
 if(next){if(LTDEMO.readOnly)return;e.preventDefault();e.stopPropagation();requestNextMoment(next.dataset.nextMoment||selectedMomentId);return}
 // #393 5: 마지막 장의 다른 트리 표지 — 셸이 이미 듣고 있는 lt41-open-book(view-navigation의 openBook)으로 그 트리 책으로 간다.
 const openTree=e.target.closest('[data-open-tree]');
 if(openTree){e.preventDefault();e.stopPropagation();const momentId=openTree.dataset.openMoment,treeId=openTree.dataset.openTree;if(momentId&&treeId)LTDEMO.openBook(momentId,treeId);return}
 /* 1. YouTube 그 자리 재생: 누른 뒤에만 iframe을 만든다(시작 시점 반영, referrerpolicy 엄격). */
 const yt=e.target.closest('[data-yt-play]');
 if(yt){if(yt.querySelector('.lt-fallback-card'))return;e.preventDefault();e.stopPropagation();if(!yt.parentElement||yt.parentElement.querySelector('iframe.yt-frame'))return;
  playInline(yt,{openUrl:'https://www.youtube.com/watch?v='+yt.dataset.ytPlay});return}
 /* 책 글자 다듬기(261116) ③: 잘린 제목은 누르면 펼침·다시 누르면 접힌다(✎ 고치기는 그대로). 폰의 길게 누름(0.42초)은
    돋보기에 배정돼 있으므로 누름(탭)에 배정해 충돌이 없다. 펼침은 읽는 동작 — 단추가 있는 책(내 기록)에서만 온다. */
 const titleBtn=e.target.closest&&e.target.closest('.moment-title-button');
 if(titleBtn&&(titleBtn.classList.contains('title-open')||titleBtn.scrollHeight>titleBtn.clientHeight+1)){e.preventDefault();e.stopPropagation();
  const titleOpen=!titleBtn.classList.contains('title-open');
  if(titleOpen)openTitles.add(titleBtn.dataset.titleEdit||'');else openTitles.delete(titleBtn.dataset.titleEdit||'');
  titleBtn.classList.toggle('title-open',titleOpen);
  titleBtn.setAttribute('aria-expanded',String(titleOpen));
  titleBtn.setAttribute('aria-label',(titleOpen?'제목 접기: ':'제목 펼치기: ')+titleBtn.textContent);return}
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
/* #800: 모든 순간 카드는 정보 줄 → 제목 → 메모 순서로 한 번만 그린다. */
/* 책 글자 다듬기(261116) ③: 펼쳐 둔 제목은 다시 그리기(꼬리표 준비·설정 메시지·보기 바꾸기)에 유지한다 —
   버튼을 다시 그리면 클래스가 지워져 첫 누름이 무시된 것처럼 보였다(390 실측: 누름 70ms 뒤 노드 교체 확인). */
const openTitles=new Set();
function paintTitle(m){
 const source=LTDEMO.moments.find(x=>x.id===m.id);
 const view=titleViewFor(source||m);
 const parts={main:view.main,note:view.note,media:view.sub};
 const noteText=source?String(source.memo??'').trim():parts.note;
 parts.note=noteText;
 const hands=editAffordances({readOnly:!LTDEMO.writable,synthetic:!!m.synthetic,hasTitle:!!parts.main,hasNote:!!parts.note});
 const date=m.date?formatDisplayDate(m.date,ltDateStyle()):'';
 const range=formatRange(m.startSeconds,m.endSeconds);
 const metaText=[date,range,m.emotion].filter(value=>String(value||'').trim()).map(t).join(' · ');
 const edit=LTDEMO.writable&&!m.synthetic?'<button type="button" class="moment-edit" data-title-edit="'+t(m.id)+'"><span aria-hidden="true">✎</span> 고치기</button>':'';
 const meta='<div class="moment-meta"><span class="moment-meta-copy">'+metaText+'</span>'+edit+'</div>';
 /* #635: 유튜브 제목이 사용자 제목과 같으면(앞뒤 공백·대소문자 무시) '▶ 제목' 줄은 두 번 보이지 않게 감춘다. */
 const sub=parts.media&&parts.media.trim().toLowerCase()!==String(parts.main||'').trim().toLowerCase()?'<p class="video-title">▶ '+t(parts.media)+'</p>':'';
 const heading=parts.main?(hands.title
  ?'<div class="moment-heading"><button type="button" class="moment-title-button'+(openTitles.has(m.id)?' title-open':'')+'" data-title-edit="'+t(m.id)+'" aria-label="'+(openTitles.has(m.id)?'제목 접기: ':'제목 고치기: ')+t(parts.main)+'"'+(openTitles.has(m.id)?' aria-expanded="true"':'')+'>'+t(parts.main)+'</button></div>'
  :'<h3>'+t(parts.main)+'</h3>'):'';
 /* #537: 마음 한마디가 비었을 때 '이 순간에 남기고 싶은 마음을 적어 보세요…' 안내를 내용처럼 그리지 않는다.
    (감상 화면에서 안내 글과 실제 마음이 같은 모양이라 내용으로 읽혔다 — 비면 아무것도 그리지 않는다.) */
 const note=noteText?'<div class="moment-note-wrap"><p class="moment-note">'+t(noteText)+'</p>'+(noteText.length>96?'<button type="button" class="moment-note-more" data-note-more aria-expanded="false">더 보기</button>':'')+'</div>':'';
 /* #627: 책 쪽(카드)에도 확정된 꾀리표를 1~3개 작게 보인다(노래 → 멤버 → 무대 순서). 유튜브·링크 쪽은
    book-extra의 momentContent가 paintTitle로 제목 줄을 다시 그리므로 여기에 함께 그린다. 꾀리표가 없으면
    아무것도 더하지 않는다(원본 모양 보존). LTTagLine이 늦게 도착하면 빈 채로 지나가고 다음 그리기에서 붙는다. */
 const tagChips=(window.LTTagLine&&source)?(window.LTTagLine.cardTags(source.keywords||[])||[]):[];
 const tagRow=tagChips.length?'<div class="chips">'+tagChips.map(k=>'<span class="chip lt-tag-chip">'+t(k.value)+'</span>').join('')+'</div>':'';
 return '<div class="moment-title">'+meta+heading+sub+note+tagRow+'</div>';
}
/* 3. 한 페이지에 다 들어오게 + 1. YouTube는 그 자리에서 재생(누르기 전 외부 요청 0). */
function localThumb(m){const src=String(m.image||'');if(src.startsWith('data:image/'))return src;if(src.startsWith('/api/media/'))return src;return ''}
const originalMomentContent=momentContent;
momentContent=function(m,compact=false){
 const safe=withoutAutoTitle(m);
 const writableBook=!!LTDEMO.writable;
 if(safe.url&&window.LTMedia&&LTMedia.describe){
  const media=LTMedia.describe(safe.url);
  const ctx=(typeof LTMedia.currentContext==='function')?LTMedia.currentContext():{source:'',owned:false};
  if(media.kind==='youtube'){
   // #327 1부: 내 기록(서버·로그인 소유자)은 썸네일을 처음부터 보여 준다(판정은 media-preview 의
   // autoLoadMedia 한 함수). #635 PR B(대표 결정): 감상 화면의 영상 칸은 빈 크림 상자였다 — 보관된 썸네일을
   // 먼저 보이게 한다(재생 임베드는 여전히 누르기 전까지 없다). 썸네일이 없거나 깨지면 #393 내려가기 틀로
   // 제목 글 카드가 된다(회색·빈 상자 금지). 보관 썸네일(data:·/api/media/)이 있으면 그것이 먼저다.
   const thumb=localThumb(safe);
   const vertical=LTMedia.verticalVideo(safe.url,safe.mediaMetadata);
   const defaultThumb=vertical?LTMedia.youtubeThumbUrl(media.videoId,true):media.loadUrl;
   const candidates=thumbnailCandidates(m,{vertical,autoLoad:true});
   const remoteThumb=candidates[0]||defaultThumb;
   const thumbFallback=thumbFallbackAttrs(m,{candidates:candidates.length?candidates:[remoteThumb],writable:writableBook,videoUnavailable:true,variant:'book',momentId:safe.id});
   // #584: 단추 이름을 '▶ 재생'으로 줄인다. 시작 시점이 있으면 '▶ 재생 · 1:23'.
   const label=media.startSeconds?('▶ 재생 · '+media.label.replace('YouTube 링크 · ','')):'▶ 재생';
   /* #635 PR B: 재생 전 칸이 빈 크림 상자(yt-placeholder)였다 — 감상에서 특히 티가 났다.
      보관된 썸네일(data:·/api/media/)을 먼저 보이고, 없으면 유튜브 보관 썸네일을 부른다(#635 PR B 대표 결정 —
      재생 임베드가 아니라 썸네일 <img> 하나다). 어느 쪽이든 깨지면 #393 내려가기 틀로 제목 글 카드가 된다 —
      빈 상자는 이제 어디에도 나오지 않는다. */
   const face=thumb?'<img src="'+t(thumb)+'" alt=""'+(thumb.startsWith('/api/media/')?thumbFallbackAttrs(safe,{candidates:[thumb],writable:writableBook,videoUnavailable:false,variant:'book',momentId:safe.id}):'')+'>'
    :'<img src="'+t(remoteThumb)+'" alt="'+t(safe.title||'YouTube 영상 썸네일')+'"'+thumbFallback+' referrerpolicy="no-referrer" loading="lazy" decoding="async">';
   // YouTube 출처는 링크 한 곳에만 남긴다.
   const piece='<div class="clipping moment" data-moment="'+t(safe.id)+'">'+
    '<button type="button" class="yt-play'+(vertical?' is-vertical':'')+'" data-lt-thumb-host data-yt-play="'+t(media.videoId)+'" data-yt-start="'+t(media.startSeconds||0)+'" data-yt-end="'+t(m.endSeconds||'')+'"'+(vertical?' data-yt-vertical="1"':'')+'>'+
    face+
    '<span class="yt-play-label">'+t(label)+'</span></button>'+
    '<div class="media-links"><a class="media-source-link" href="'+t(media.openUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">YouTube ↗</a>'+
    '<button type="button" data-yt-expand="'+t(safe.id)+'">크게 보기</button></div></div>';
   return piece+paintTitle(safe);
  }
  if(media.kind==='link'&&!localThumb(safe)&&LTMedia.autoLoadMedia(ctx.source,ctx.owned)){
   const piece='<div class="clipping moment" data-moment="'+t(safe.id)+'">'+
    fallbackCardMarkup(m,{writable:writableBook,videoUnavailable:false,variant:'book',momentId:safe.id})+
    '<div class="media-source"><a class="media-source-link" href="'+t(media.openUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">원본 링크 열기 ↗</a></div></div>';
   return piece+paintTitle(safe);
  }
 }
 if(safe.synthetic)return originalMomentContent(safe,compact);
 if(!safe.url&&!safe.image&&['memo','note','text','letter','archive'].includes(String(safe.kind||''))){
  return '<div class="book-card-moment moment" data-moment="'+t(safe.id)+'">'+paintTitle(safe)+'</div>';
 }
 const template=document.createElement('template');
 template.innerHTML=originalMomentContent(safe,compact);
 template.content.querySelector('.moment-title')?.remove();
 const piece=template.content.querySelector('.moment[data-moment]');
 if(!piece)return template.innerHTML+paintTitle(safe);
 const hasVisual=!!piece.querySelector('img,video,iframe,.lt-media,.lt-fallback-card,.collage,.ticket');
 piece.querySelectorAll(':scope > h2,:scope > p,:scope > .photo-caption').forEach(node=>node.remove());
 if(!hasVisual)return '<div class="book-card-moment moment" data-moment="'+t(safe.id)+'">'+paintTitle(safe)+'</div>';
 return template.innerHTML+paintTitle(safe);
};
/* 8. 가운데 머리 표시는 CSS로 지우고, 4. 오른쪽 빈 페이지 문구·버튼을 여기서 만든다. */
const originalRenderSpread=renderSpread;
renderSpread=function(idx,focusId=null,land=true){
 originalRenderSpread(idx,focusId,land);
 // #584: 주소·정보만으로 세로를 못 정한 YouTube 칸을 썸네일 실측으로 올려 고친다.
 //   공유·예시 화면은 누르기 전 외부 요청 0 규칙(#327)을 유지하기 위해 내 기록일 때만 본다.
 if(window.LTMedia?.upgradeVerticals){const ctx=(typeof LTMedia.currentContext==='function')?LTMedia.currentContext():{source:'',owned:false};if(LTMedia.autoLoadMedia(ctx.source,ctx.owned))LTMedia.upgradeVerticals(document);}
 // #537: 한 장은 순간 하나가 한 쪽 전체다 — 그 순간의 제목 한 벌만 다시 그리고, 두 장은 지금처럼 양쪽 페이지를 고친다.
 const one=single()?momentAtPos(current):null;
 if(one){
  const host=narrow()?mobileContent:rightPage;
  const old=host.querySelector('.moment-title');if(old&&!one.synthetic)old.outerHTML=paintTitle(one);
  /* 마지막 순간 뒤의 '다음 순간' 안내는 그 순간 글 아래에 이어 붙인다(쪽을 덮지 않는다).
     안내를 쪽 위에 겹쳐 놓으면 그 순간의 카드·단추를 가린다 — 순간 내용 상자 안 끝에 놓는다. */
  const spread=currentSpread();
  if(spread?.right?.synthetic&&current===pageCount()-1){
   /* #635: 감상 화면(공유·예시)에서는 '다음 이야기' 안내 자체를 감춘다 — 남의 트리를 보는 사람에게
      다음 순간을 남기라는 말은 맞지 않다. 내 트리에서는 값이 비면 안내 문장+단추를 그대로 둔다. */
   if(!LTDEMO.readOnly){
    const flow=host.querySelector('.page-content')||host;
    flow.insertAdjacentHTML('beforeend','<div class="next-page"><div><b>'+t(NEXT_PAGE_COPY)+'</b></div><button type="button" data-next-moment="'+t(one.id)+'">'+t(NEXT_PAGE_ACTION)+'</button>'+otherTreesBlock()+'</div>');
    try{window.__TRACK59__?.rejudgeOverflow?.()}catch{}
   }
  }
 }else{
  for(const [host,side] of [[leftPage,'left'],[rightPage,'right']]){
   const m=SPREADS[current][side];if(!m||m.synthetic)continue;
   const old=host.querySelector('.moment-title');if(old)old.outerHTML=paintTitle(m)
  }
  const right=SPREADS[current].right;
  if(right&&right.synthetic){
   /* #635: 감상 화면에서는 '다음 이야기' 안내를 감춘다 — 마지막 장은 깨끗하게 끝난다.
      (예전에는 여기에 otherTreesBlock()의 맨 return이 undefined로 그대로 찍혔다.) */
   rightPage.innerHTML=LTDEMO.readOnly?'':'<div class="next-page"><div><b>'+t(NEXT_PAGE_COPY)+'</b></div><button type="button" data-next-moment="'+t(SPREADS[current].left.id)+'">'+t(NEXT_PAGE_ACTION)+'</button>'+otherTreesBlock()+'</div>';
  }
 }
 paintLensButton();
};
/* 연결 한마디는 두 페이지의 가운데에 둔다. 빈 관계는 입력 버튼으로, 저장된 관계는 다시 편집할 수 있는 문장으로 보인다. */
const STORY_TIP_KEY='lt41.tips.bookStory';
let storyTipOpen=false,storyRequest=null;
try{storyTipOpen=LTDEMO.moments.length>=2&&localStorage.getItem(STORY_TIP_KEY)!=='1';if(storyTipOpen)localStorage.setItem(STORY_TIP_KEY,'1')}catch{storyTipOpen=LTDEMO.moments.length>=2}
function storyTipMarkup(){return storyTipOpen?'<div class="story-tip" role="note"><span>두 순간 사이에 한마디를 남기면, 책이 이야기처럼 이어져요. 안 적어도 괜찮아요.</span><button type="button" data-story-tip-dismiss>알겠어요</button></div>':''}
updateConnectionSummary=function(id){
 const next=nextMomentOf(id),host=$b('#whyMargin'),tipHost=$b('#storyTipHost'),momentId=String(id||'');
 if(!host)return;
 const tip=storyTipMarkup();
 /* #875: 안내 말풍선은 책 바깥 아래 host로 — 책 안에 두면 오른쪽 페이지 아래 글을 가린다. */
 if(tipHost){if(tip){tipHost.hidden=false;tipHost.innerHTML=tip}else{tipHost.hidden=true;tipHost.replaceChildren()}}
 let action='';
 if(next){
  const reason=String(next.reason||'').trim();
  if(LTDEMO.writable){
   const label=reason?'→ '+reason:'＋ 두 순간을 잇는 한마디';
   action='<button type="button" class="story-action" data-story-open data-from-moment="'+t(momentId)+'" data-to-moment="'+t(next.id)+'">'+t(label)+'</button>';
  }else if(reason){action='<span class="story-action story-readonly">→ '+t(reason)+'</span>'}
 }
 if(!action){host.hidden=true;host.replaceChildren();return}
 host.hidden=false;
 host.innerHTML='<div class="story-action-wrap">'+action+'</div>';
};
function openStoryEditor(fromMomentId,toMomentId,initial=''){
 const host=$b('#whyMargin');if(!host)return;
 /* #875: 안내는 책 바깥 아래 host로, 편집 칸은 지금 자리(#800)에 둔다. */
 const tip=storyTipMarkup(),tipHost=$b('#storyTipHost');
 if(tipHost){if(tip){tipHost.hidden=false;tipHost.innerHTML=tip}else{tipHost.hidden=true;tipHost.replaceChildren()}}
 host.innerHTML='<form class="story-editor" data-story-form data-from-moment="'+t(fromMomentId)+'" data-to-moment="'+t(toMomentId)+'"><input name="relation" maxlength="100" aria-label="두 순간을 잇는 한마디" placeholder="두 순간을 잇는 한마디" value="'+t(initial)+'"><button type="submit">저장</button><button type="button" data-story-cancel>취소</button></form>';
 host.hidden=false;
 const input=host.querySelector('input[name="relation"]');input?.focus();
}
document.addEventListener('click',e=>{
 const dismiss=e.target.closest?.('[data-story-tip-dismiss]');
 if(dismiss){e.preventDefault();storyTipOpen=false;try{localStorage.setItem(STORY_TIP_KEY,'1')}catch{}updateConnectionSummary(LTDEMO.get());return}
 const open=e.target.closest?.('[data-story-open]');
 if(open){e.preventDefault();e.stopPropagation();const child=LTDEMO.moments.find(item=>item.id===open.dataset.toMoment);openStoryEditor(open.dataset.fromMoment||'',open.dataset.toMoment||'',child?.relation||'');return}
 const cancel=e.target.closest?.('[data-story-cancel]');
 if(cancel){e.preventDefault();updateConnectionSummary(cancel.closest('[data-story-form]')?.dataset.fromMoment||LTDEMO.get());return}
},true);
document.addEventListener('submit',e=>{
 const form=e.target.closest?.('[data-story-form]');if(!form)return;
 e.preventDefault();
 if(!LTDEMO.writable||window.parent===window){toast('저장할 수 없는 화면이에요.');return}
 const input=form.querySelector('input[name="relation"]'),relation=String(input?.value||'').trim();
 if(relation.length>100){toast('한마디는 100자까지 적을 수 있어요.');return}
 const fromMomentId=form.dataset.fromMoment||'',momentId=form.dataset.toMoment||'',child=LTDEMO.moments.find(item=>item.id===momentId);
 if(!child||child.parentId!==fromMomentId){toast('이어진 순간을 찾지 못했어요.');return}
 storyRequest={treeId:LTDEMO.treeId,fromMomentId,momentId};
 const save=form.querySelector('button[type="submit"]');if(save)save.disabled=true;
 window.parent.postMessage({type:'lt41-story-save',treeId:LTDEMO.treeId,fromMomentId,momentId,relation},location.origin);
},true);
addEventListener('message',event=>{
 const data=event.data;
 if(event.origin!==location.origin||event.source!==window.parent||data?.type!=='lt41-story-saved'||!storyRequest)return;
 if(data.treeId!==storyRequest.treeId||data.fromMomentId!==storyRequest.fromMomentId||data.momentId!==storyRequest.momentId)return;
 const request=storyRequest;storyRequest=null;
 if(!data.ok){toast(data.error||'저장하지 못했어요.');const save=$b('[data-story-form] button[type="submit"]');if(save)save.disabled=false;return}
 const child=LTDEMO.moments.find(item=>item.id===request.momentId);
 if(child)child.relation=String(data.relation||'');
 const edge=LTDEMO.edges.find(item=>item.kind==='parent'&&item.from===request.fromMomentId&&item.to===request.momentId);
 if(edge)edge.reason=String(data.relation||'');
 updateConnectionSummary(request.fromMomentId);
 /* #905: 자동 저장 성공은 알리지 않는다 — 연결 요약이 바로 바뀐다. */
});
/* #537: 한 장의 작은 '탭하여 보기' 줄은 없앴다(순간마다 한 쪽 전체). 마지막 순간 뒤의 다음 순간 안내는
   renderSpread가 두 장의 빈 오른쪽 페이지와 같은 자리에 붙인다. */
/* #393 5: 다른 트리로 가는 길. 목록 내용·이동 규칙은 셸의 트리 드롭다운을 따른다.
   내용은 셸이 넣어 준 LTDEMO.library(부모 LT41.trees에서 온다)를 그대로 쓰고, 이동은 셸이 이미 듣고 있는
   lt41-open-book 메시지(view-navigation.js의 LTDEMO.openBook)로 한다 — 셸 파일은 고치지 않는다. */
const currentTreeId=()=>{try{return parent.LT41?.tree?.id||''}catch{return ''}};
const orderedTrees=()=>{const list=Array.isArray(LTDEMO.library)?[...LTDEMO.library]:[];return list.sort((a,b)=>Number(b?.inbox===true)-Number(a?.inbox===true))};
const treeCountText=tree=>tree.inbox===true?'정리 전 '+(tree.moments?.length||0):((tree.moments?.length||0)+'개의 순간');
const treeCoverSpan=(tree,index=0)=>{
 // 표지 판정은 책장과 같은 규칙(shelf-model coverChoice): 표지 사진 > 디자인 표지 > 기본 색.
 const choice=coverChoice(tree,index,COVER_PALETTE);
 const chosen=choice.coverMedia?coverMomentFor(tree):null;
 const coverCands=chosen?thumbnailCandidates(chosen,{autoLoad:true}):(choice.coverMedia?[choice.coverMedia]:[]);
 const thumb=choice.coverMedia?'<img src="'+t(choice.coverMedia)+'"'+coverFallbackAttrs(coverCands)+' alt="" loading="lazy" referrerpolicy="no-referrer">':'';
 const coverIdx=COVER_PALETTE.indexOf(choice.color);
 return '<span class="tree-cover'+(coverIdx>=0?' tree-cover-'+(coverIdx+1):'')+'"'+(choice.design?' data-cover-design="'+t(choice.design)+'"':'')+' aria-hidden="true">'+thumb+'</span>';
};
function otherTreesBlock(){
 if(LTDEMO.readOnly)return '';/* 공유·예시에서는 다른 트리로 갈 수 없다(셸의 이동 규칙도 막힌다) — #635: 빈 문자열을 돌려준다(맨 return은 undefined가 문자열에 그대로 붙었다) */
 const others=orderedTrees().filter(tree=>tree.id!==currentTreeId()).slice(0,3);
 if(!others.length)return '';
 return '<div class="other-trees"><b>다른 트리 보기</b><div class="other-tree-row">'+others.map((tree,index)=>'<button type="button" class="other-tree" data-open-tree="'+t(tree.id)+'" data-open-moment="'+t(tree.moments?.[0]?.id||'')+'">'+treeCoverSpan(tree,index)+'<span class="other-tree-name">'+t(treeTitleText(tree.title))+'</span><small>'+t(treeCountText(tree))+'</small></button>').join('')+'</div></div>';
}
const treeMenu=$b('#treeMenuPanel'),treeTrigger=$b('#bookTitleBtn');
function closeTreeMenu(){if(!treeMenu||treeMenu.hidden)return;treeMenu.hidden=true;treeTrigger.setAttribute('aria-expanded','false')}
function openTreeMenu(){
 if(!treeMenu||LTDEMO.readOnly)return;/* 공유·예시에서는 트리를 고르지 못한다(셸과 같다) */
 const currentId=currentTreeId();
 treeMenu.innerHTML=orderedTrees().map((tree,index)=>'<button type="button" role="menuitemradio" class="tree-item" data-tree-id="'+t(tree.id)+'" aria-checked="'+(tree.id===currentId)+'">'+treeCoverSpan(tree,index)+'<span class="tree-name">'+t(treeTitleText(tree.title))+'</span><span class="tree-count">'+t(treeCountText(tree))+'</span>'+(tree.id===currentId?'<span class="tree-check" aria-hidden="true">✓</span>':'')+'</button>').join('');
 treeMenu.hidden=false;treeTrigger.setAttribute('aria-expanded','true');treeMenu.querySelector('button')?.focus();
}
if(treeTrigger&&treeMenu){
 if(LTDEMO.readOnly){const caret=treeTrigger.querySelector('.book-title-caret');if(caret)caret.hidden=true}
 treeTrigger.addEventListener('click',e=>{e.stopPropagation();if(treeMenu.hidden)openTreeMenu();else closeTreeMenu()});
 treeMenu.addEventListener('click',e=>{
  const row=e.target.closest('[data-tree-id]');if(!row)return;
  closeTreeMenu();
  const id=row.dataset.treeId;if(!id||id===currentTreeId())return;
  const tree=LTDEMO.library.find(tr=>tr.id===id),first=tree?.moments?.[0]?.id;
  if(first)LTDEMO.openBook(first,id);
 });
 document.addEventListener('click',e=>{if(!treeMenu.hidden&&!e.target.closest('.book-title'))closeTreeMenu()});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!treeMenu.hidden){e.preventDefault();e.stopPropagation();closeTreeMenu();treeTrigger.focus();return}
  if(treeMenu.hidden)return;
  const items=[...treeMenu.querySelectorAll('button')],at=items.indexOf(document.activeElement);
  if(at<0)return;
  if(e.key==='ArrowDown'||e.key==='Down'){e.preventDefault();e.stopPropagation();items[(at+1)%items.length].focus()}
  else if(e.key==='ArrowUp'||e.key==='Up'){e.preventDefault();e.stopPropagation();items[(at-1+items.length)%items.length].focus()}
 });
}
/* #393 5: 마지막 장의 다른 트리 표지도 같은 이동 규칙(openBook)으로 간다. */
/* #345: '이어진 순간'(이슈 584에서 '여기까지 온 길'에서 이름을 바꿈) — 처음 순간부터 지금 보는 순간까지의 세로 타임라인.
   칸·단계·일수·감정 색 계산은 LT59Model.journeyTimeline(book-model.js)이 맡고 여기는 그리기만 한다. */
let journeyOpener=null;
function journeyMarkup(journey){
 return journey.items.map(item=>{
  const raw=(LTDEMO.moments||[]).find(x=>x.id===item.id)||item;
  const cands=item.thumb?thumbnailCandidates(raw,{autoLoad:true}):[];
  const src=cands[0]||item.thumb;
  const fbAttrs=src?thumbFallbackAttrs(raw,{candidates:cands.length?cands:[src],mode:'thumb-slot'}):'';
  const thumb=src?'<img src="'+t(src)+'"'+fbAttrs+' alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async">':'';
  const emotion=item.emotion?'<span class="journey-emotion"><span class="emotion-dot" data-tone="'+item.tone+'" aria-hidden="true"></span>'+t(item.emotion)+'</span>':'';
  return '<button type="button" class="journey-item'+(item.current?' current':'')+'" data-lt-moment-row data-journey="'+item.index+'" data-focus="'+t(item.id)+'">'+
   '<span class="journey-thumb" data-tone="'+item.tone+'">'+thumb+'</span>'+
   '<span class="journey-node" aria-hidden="true"></span>'+
   '<span class="journey-text"><span class="journey-date">'+t(styledDate(item.date))+(item.first?' · 첫 순간':'')+'</span>'+
   '<span class="journey-title-row"><span class="journey-title">'+t(item.title)+'</span>'+(item.current?'<span class="journey-now">지금 보는 순간</span>':'')+'</span>'+
   '<small class="lt-row-unavailable" data-lt-row-unavailable hidden>'+VIDEO_UNAVAILABLE_TEXT+'</small>'+
   emotion+'</span></button>'+
   (item.reason?'<p class="journey-reason">↳ '+t(item.reason)+'</p>':'');
 }).join('');
}
function openJourney(){
 journeyOpener=document.activeElement;
 const journey=LT59Model.journeyTimeline(LTDEMO.moments,LTDEMO.edges,LTDEMO.get(),titleMainFor);
 $b('#overviewFlow').innerHTML=journeyMarkup(journey);
 $b('#journeySummary').textContent=journey.days===null?journey.steps+'단계':journey.steps+'단계 · '+(journey.days===0?'첫날':journey.days+'일째');
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
 const focus=item.dataset.focus||'';
 closeJourney();
 // #537: 가는 자리는 보기 모드가 정한다(한 장은 그 순간, 두 장은 그 순간이 든 펼침면).
 const target=posOfMoment(focus);
 if(target===current)renderSpread(target,focus,false);
 else autoTurn(target>current?'next':'prev',target,focus);
});
window.__TRACK59__.openOverview=openJourney;
/* 5. 돋보기는 도구 줄에서 켜고 끈다. */
$b('#lensBtn').onclick=()=>{lensPref=!lensPref;/* #537: 단추와 책의 돋보기 상태를 한 값으로 맞춘다(예전에는 단추 글자만 바뀌어 따라오지 않았다). */lensOn=lensPref;writeLens(lensPref,window.localStorage);paintLensButton();if(!lensPref)hideLens()};
paintLensButton();if(!lensPref)hideLens();
/* #212: 책 위쪽 갈래 글자와 목차 머리에 트리 이름을 보여 준다(자동 접미사는 표시 단계에서만 뺀다). */
function paintTreeTitles(){
 const name=treeTitleText(LTDEMO&&LTDEMO.title);
 if(!name)return;
 const titleText=document.getElementById('bookTitleText');
 if(titleText&&titleText.textContent!==name)titleText.textContent=name;
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
if(typeof addEventListener==='function')addEventListener('message',e=>{
 if(e.data?.type!=='lt41-trees-renamed')return;
 const current=window.parent&&window.parent.LT41?window.parent.LT41.tree:null;
 const fresh=(Array.isArray(e.data.titles)?e.data.titles:[]).find(t=>t.id===current?.id);
 if(!fresh)return;
 LTDEMO.title=fresh.title;
 paintTreeTitles();
});
// #984: 저장이 서버에서 확인되면 책 화면의 트리 표지(트리 메뉴·다른 트리 보기)도 바로 새 값으로 본다.
// 저장 실패 때는 이 메시지가 오지 않는다 — 표지는 그대로이고, 셸의 저장 안내 떠가 실패를 알린다.
if(typeof addEventListener==='function')addEventListener('message',e=>{
 if(e.data?.type!=='lt41-trees-saved')return;
 const fresh=window.parent&&window.parent.LT41?window.parent.LT41.trees:null;
 if(!Array.isArray(fresh)||!Array.isArray(LTDEMO.library))return;
 if(fresh.length!==LTDEMO.library.length){location.reload();return;}
 let savedChanged=false;
 for(const t of fresh){
  const lib=LTDEMO.library.find(x=>x.id===t.id);
  if(!lib){location.reload();return;}
  const next={title:t.title,subject:t.subject,coverMode:t.coverMode||'',coverDesign:t.coverDesign||'',coverMomentId:t.coverMomentId||'',inbox:t.inbox===true};
  if(Object.keys(next).some(k=>lib[k]!==next[k])){Object.assign(lib,next);savedChanged=true;}
 }
 if(!savedChanged)return;
 if(treeMenu&&!treeMenu.hidden)openTreeMenu();
 const others=orderedTrees().filter(tree=>tree.id!==currentTreeId()).slice(0,3);
 document.querySelectorAll('.other-tree[data-open-tree]').forEach(btn=>{
  const index=others.findIndex(tree=>tree.id===btn.dataset.openTree);
  if(index<0)return;
  const span=btn.querySelector('.tree-cover');
  if(span)span.outerHTML=treeCoverSpan(others[index],index);
 });
});
mountTips();
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
// #368 2차: 설정의 페이지 넘김(종이처럼/부드럽게)이 바뀌면 다음 넘김부터 적용한다. book.js가 노출한
// setPageTurnMode로만 값을 바꾼다(모르는 값은 book.js 쪽 기본 규칙으로 돌아간다).
addEventListener('message',e=>{if(e.data?.type!=='lt41-page-turn')return;if(typeof window.setPageTurnMode==='function')window.setPageTurnMode(e.data.value);});
addEventListener('message',e=>{if(e.data?.type!=='lt41-date-style')return;try{document.documentElement.setAttribute('data-lt-date-style',e.data.value==='dash'||e.data.value==='long'?e.data.value:'dot')}catch{}try{renderSpread(current,LTDEMO.get(),false)}catch{}if($b('#detail')?.classList.contains('open')&&selectedMomentId)showDetail(selectedMomentId);});
// book-extra는 book.js 뒤에 불러오므로, 첫 렌더 제목을 한 벌 규칙으로 다시 그린다.
// #379 후속: 재그림은 현재 선택 순간(LTDEMO.get())을 유지해, 펼침면 오른쪽 페이지의 순간을 열면
// 왼쪽 페이지 순간으로 선택이 돌아가는 문제를 막는다(renderSpread의 land가 기본 true여 focusId 없으면 left.id로 재선택).
try{renderSpread(current,LTDEMO.get(),false)}catch{}
updateConnectionSummary(LTDEMO.get());
/* 책 글자 다듬기(261116) ③: 잘림은 폭·글꼴이 정하므로 그려진 뒤 실제 측정으로 단추의 낭독 이름·펼침 상태를 맞춘다 —
   접힌 제목이 '고치기'로 읽히면 누른 결과(펼침)와 낭독 이름이 어긋난다. 다 그린 뒤와 다시 그릴 때마다 맞춘다. */
function titleAriaSync(){
 for(const btn of document.querySelectorAll('.moment-title-button')){
  const open=btn.classList.contains('title-open');
  if(open){btn.setAttribute('aria-expanded','true');btn.setAttribute('aria-label','제목 접기: '+btn.textContent);}
  else if(btn.scrollHeight>btn.clientHeight+1){btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','제목 펼치기: '+btn.textContent);}
  else{btn.removeAttribute('aria-expanded');btn.setAttribute('aria-label','제목 고치기: '+btn.textContent);}
 }
}
const titleAriaObserver=new MutationObserver(()=>requestAnimationFrame(titleAriaSync));
titleAriaObserver.observe(document.getElementById('book')||document.body,{childList:true,subtree:true});
titleAriaSync();
