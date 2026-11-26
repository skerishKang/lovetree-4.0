// #1025 1단계: 공개 '세로' 순간을 숏츠처럼 넘겨 보기.
// iframe은 지금 것과 다음 것만 둔다 — 넘긴 것은 DOM에서 제거한다(동시에 살아 있는 iframe ≤ 2).
// 세로 판정은 서버가 화면과 같은 함수(isVerticalMoment)로 해서 내려준다 — 여기서는 새로 만들지 않는다.
import {parseTag,tagKey} from './tags.mjs';
// #1060: 썸네일 주소 글자는 정본(youtube-id.mjs) 한 벌에서만 만든다.
import {youtubeStageThumbUrl} from './youtube-id.mjs';
import {isGrayThumbnail,fallbackCardMarkup} from './thumb-fallback.mjs';
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const SVG_NS='http://www.w3.org/2000/svg';
// 나무 모양 선 아이콘 — 다른 단추와 같은 currentColor·같은 선 굵기(#1025 2단계).
function treeIcon(){
 const svg=document.createElementNS(SVG_NS,'svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
 const crown=document.createElementNS(SVG_NS,'path');crown.setAttribute('d','M12 3 5 13h4l-4 5h14l-4-5h4L12 3z');
 const trunk=document.createElementNS(SVG_NS,'path');trunk.setAttribute('d','M12 18v3');
 svg.append(crown,trunk);
 return svg;
}
const EMBED='https://www.youtube-nocookie.com/embed/';
// #1352·#1360: 연속 재생은 기본 켜짐(선택만 이 기기에 기억), 재생 불가 오류는 잠시 뒤 다음으로 넘긴다.
const AUTO_NEXT_KEY='lt41.momentAutoNext';
const AUTO_NEXT_ERROR_MS=1500;
const AUTO_NEXT_ERROR_CODES=new Set(['100','101','150']);
const autoNextEnabled=()=>{try{return localStorage.getItem(AUTO_NEXT_KEY)!=='0';}catch{return true;}};
// #1098 2단계: 댓글 단추 아이콘 — 나무 선 아이콘과 같은 선 굵기·currentColor 한 벌.
function soundIcon(muted){
 const svg=document.createElementNS(SVG_NS,'svg');for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
 const body=document.createElementNS(SVG_NS,'path');body.setAttribute('d','M4 9h4l5-4v14l-5-4H4z');svg.append(body);
 const wave=document.createElementNS(SVG_NS,'path');wave.setAttribute('d','M16 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12');svg.append(wave);
 return svg;
}
function bubbleIcon(){
 const svg=document.createElementNS(SVG_NS,'svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
 const bubble=document.createElementNS(SVG_NS,'path');bubble.setAttribute('d','M4 5h16v11H10l-6 4V5z');
 svg.append(bubble);
 return svg;
}
// 구간 재생: 시작·끝 초가 있으면 기존 구간 재생 규칙(start·end)대로 주소에 넣는다.
const embedSrc=(id,item={},{autoplay=true}={})=>{
 const params=[autoplay?'autoplay=1':'autoplay=0','mute=1','playsinline=1','controls=1','rel=0','enablejsapi=1'];
 const start=Number(item.startSeconds),end=Number(item.endSeconds);
 if(Number.isSafeInteger(start)&&start>0)params.push('start='+start);
 if(Number.isSafeInteger(end)&&end>start)params.push('end='+end);
 params.push('origin='+encodeURIComponent(location.origin));
 return `${EMBED}${encodeURIComponent(id)}?${params.join('&')}`;
};

import {orderTreeMoments} from './community-moments-order.mjs';

export function mountMoments({panel,onOpenShare,onAddToTree,notify,memberLogin,api=null,when=null,historyLayers=null,isMember=()=>false,getShareContext=()=>'',onScopeChange=null}){
 const stage=el('div','moments-stage');
 const card=el('div','moments-card');
 const media=el('div','moments-media');
 const poster=el('img','moments-poster');poster.alt='';poster.loading='lazy';
 const posterFallback=el('div','moments-fallback');posterFallback.hidden=true;
 function showPosterFallback(){
  const item=current();if(!item)return;
  // #1354: 재생 가능한 플레이어 앞에는 안내 카드를 올리지 않는다.
  if(stage.dataset.ltMomentUnavailable!=='1'&&media.querySelector('.moments-frame:not(.moments-next)'))return;
  posterFallback.innerHTML=fallbackCardMarkup(item,{variant:'orbit',videoUnavailable:!!item.videoId});
  posterFallback.hidden=false;poster.hidden=true;
 }
 poster.onload=()=>{if(isGrayThumbnail(poster))showPosterFallback();};
 // 썸네일이 안 떠도 판이 비지 않게 — 세로 포스터가 없으면 기존 가로 포스터로 한 번 더 시도한다.
 poster.onerror=()=>{const item=current();const src=poster.getAttribute('src')||'';if(item?.videoId&&!/hqdefault\.jpg/.test(src))poster.src=youtubeStageThumbUrl(item.videoId,'hqdefault');else showPosterFallback();};
 const context=el('section','moments-context');context.setAttribute('aria-label','순간 정보');
 const overlay=el('div','moments-overlay');
 const treeLine=el('div','moments-tree');
 const owner=el('span','moments-owner');owner.setAttribute('aria-hidden','true');
 const ownerText=el('span','moments-owner-text');
 const titleLine=el('div','moments-title');
 const tagLine=el('div','moments-tags');
 const noteLine=el('button','moments-note');noteLine.type='button';noteLine.setAttribute('aria-label','설명 펼치기');
 noteLine.onclick=()=>{const expanded=noteLine.getAttribute('aria-expanded')==='true';noteLine.setAttribute('aria-expanded',String(!expanded));noteLine.setAttribute('aria-label',expanded?'설명 펼치기':'설명 접기');};
let soundButton=null;
 const toolbar=el('div','moments-toolbar');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','순간 영상 도구');
 const infoButton=el('button','moments-info-button','ⓘ 정보');infoButton.type='button';infoButton.setAttribute('aria-label','순간 정보 열기');infoButton.setAttribute('aria-expanded','false');
 const closeButton=el('button','moments-close-button','×');closeButton.type='button';closeButton.setAttribute('aria-label','둘러보기 닫기');closeButton.onclick=()=>panel.closest?.('dialog')?.close();
 toolbar.append(infoButton,closeButton);
 overlay.append(treeLine,titleLine,tagLine,noteLine);
 const progress=el('div','moments-progress');const progressFill=el('span','moments-progress-fill');
 const playerProgress=el('progress','moments-progress-native');playerProgress.max=100;playerProgress.value=0;playerProgress.setAttribute('aria-label','재생 진행');
 progress.append(progressFill,playerProgress);
 media.append(poster,posterFallback);
 card.append(media);
 context.append(overlay);
 const rail=el('div','moments-rail');
 const nav=el('div','moments-nav');
 const up=el('button','moments-step','▲');up.type='button';up.setAttribute('aria-label','이전 순간');
 const down=el('button','moments-step','▼');down.type='button';down.setAttribute('aria-label','다음 순간');
 nav.append(up,down);
 rail.append(up,down);
 stage.append(context,card,rail);
 let liked=false,heartButton=null,heartCount=null,commentsCount=null;
 // #1356: 순간 보기 범위. '이 트리만'은 공유 트리 문맥이 있을 때만, '내 순간'은 로그인했을 때만 보인다.
 let scope='all',scopeShareId='';
 const setLiked=(value)=>{
  liked=!!value;
  if(!heartButton)return;
  heartButton.querySelector('.moments-rail-icon').textContent=liked?'♥':'♡';
  heartButton.classList?.toggle?.('is-liked',liked);
  heartButton.setAttribute('aria-pressed',String(liked));
 };
 // #1098 2단계: 그 순간의 ♡·댓글 수 — 공개 숫자 규칙(#824 결정 7)을 그대로, 3 미만은 숫자를 남기지 않는다.
 const momentStats={hearts:0,comments:0};
 const paintCount=(span,value)=>{if(span)span.textContent=Number(value)>=3?String(value):'';};
 const railCountLabel=(span,value)=>{if(span)span.textContent=Number(value)>=3?String(value):span.dataset.fallback||'';};
 const paintCounts=()=>{paintCount(heartCount,momentStats.hearts);paintCount(commentsCount,momentStats.comments);};
 const applyStats=(answer)=>{
  if(!answer)return;
  if(Number.isFinite(answer.hearts))momentStats.hearts=Number(answer.hearts);
  if(Number.isFinite(answer.comments))momentStats.comments=Number(answer.comments);
  if('hearted' in answer)setLiked(!!answer.hearted);
  paintCounts();
 };
 async function loadStats(){
  const item=current();if(!item||!item.shareId||!item.id||!api||typeof api.momentStats!=='function')return;
  const answer=await api.momentStats(item.shareId,item.id);
  if(!answer.ok||current()!==item)return; // 모양이 다른 응답(모의 응답)·넘겨 뒤 늦게 온 응답은 조용히 버린다
  applyStats(answer);
 }
 async function toggleHeart(){
  const item=current();if(!item||!item.shareId||!item.id||!api||typeof api.momentReact!=='function')return setLiked(!liked);
  const enabled=!liked;
  setLiked(enabled); // 낙관적 표시 — 서버가 막으면 되돌린다
  const answer=await api.momentReact(item.shareId,item.id,enabled);
  if(answer.ok){applyStats(answer);return;}
  setLiked(!enabled); // 막히면 되돌리고 서버 응답 안내를 그대로 보여 준다
  notify?.((answer&&answer.message)||(answer.status===401?'로그인하면 공감을 남길 수 있어요.':'공감을 남기지 못했어요.'));
  if(answer.status===401)memberLogin?.();
 }
 const railButtons=[
  {icon:'♡',label:'마음',action:()=>toggleHeart()},
  {icon:bubbleIcon(),label:'댓글',action:()=>current()&&openComments()},
  {icon:'＋',label:'담기',action:()=>current()&&openAddDialog(current())},
  {icon:treeIcon(),label:'트리',action:()=>current()&&onOpenShare?.({shareId:current().shareId,view:'book'})},
  {icon:'↗',label:'공유',action:()=>current()&&copyShare(current())}
 ];
 for(const spec of railButtons){
  const button=el('button','moments-rail-button');
  button.type='button';button.setAttribute('aria-label',spec.label);
  const icon=typeof spec.icon==='string'?el('span','moments-rail-icon',spec.icon):spec.icon;
  if(typeof spec.icon!=='string')icon.setAttribute('class','moments-rail-svg');
  button.append(icon,el('span','moments-rail-label',spec.label));
  if(spec.action)button.onclick=spec.action;
  else{button.disabled=true;button.title='랭킹과 함께 정해요';button.setAttribute('aria-disabled','true');}
  if(spec.label==='마음'){button.classList?.add?.('is-heart');heartButton=button;setLiked(false);heartCount=el('span','moments-rail-count','');button.append(heartCount);}
  if(spec.label==='댓글'){commentsCount=el('span','moments-rail-count','');button.append(commentsCount);}
  rail.append(button);
 }
  soundButton=el('button','moments-rail-button is-sound');soundButton.type='button';
  const soundStart=soundIcon(true);soundStart.setAttribute('class','moments-rail-svg');
  soundButton.append(soundStart,el('span','moments-rail-label','소리 켜기'));
  soundButton.setAttribute('aria-label','소리 켜기');soundButton.onclick=toggleSound;
  rail.prepend(soundButton);
 rail.append(up,down);
 const scopeChips=el('div','moments-scope-control');
 const scopeTrigger=el('button','moments-scope-trigger','보는 범위: 전체 ▾');
 scopeTrigger.type='button';scopeTrigger.setAttribute('aria-haspopup','true');scopeTrigger.setAttribute('aria-expanded','false');
 const scopeMenu=el('div','moments-scope-menu');scopeMenu.hidden=true;
 const scopeButtons={};
 const scopeSummary=el('span','moments-scope-summary');scopeSummary.hidden=true;
 const scopeReset=el('button','moments-scope-reset','×');scopeReset.type='button';scopeReset.hidden=true;scopeReset.setAttribute('aria-label','전체 순간 보기');
 scopeChips.append(scopeTrigger,scopeMenu,scopeSummary,scopeReset);
 const treePicker=el('div','moments-tree-picker');treePicker.hidden=true;treePicker.setAttribute('role','dialog');treePicker.setAttribute('aria-label','공개 트리 고르기');
 const treePickerSearch=el('input','moments-tree-picker-search');treePickerSearch.type='search';treePickerSearch.placeholder='공개 트리 검색';treePickerSearch.setAttribute('aria-label','공개 트리 검색');
 const treePickerOptions=el('div','moments-tree-picker-options');
 const treePickerClose=el('button','moments-tree-picker-close','×');treePickerClose.type='button';treePickerClose.setAttribute('aria-label','트리 고르기 닫기');treePickerClose.onclick=()=>treePicker.hidden=true;
 treePicker.append(treePickerClose,treePickerSearch,treePickerOptions);
 const cardTree=el('button','moments-card-tree');cardTree.type='button';cardTree.setAttribute('aria-label','트리 주인과 트리 이름');
 card.append(cardTree);
 const ownerMenu=el('div','moments-owner-menu');ownerMenu.hidden=true;
 const ownerOnly=el('button','moments-owner-only','이 트리 순간만 보기');ownerOnly.type='button';
 ownerMenu.append(ownerOnly);
 const emptyRetry=el('button','moments-empty-retry','다시 시도');emptyRetry.type='button';emptyRetry.hidden=true;
 emptyRetry.onclick=()=>{empty.hidden=true;emptyRetry.hidden=true;void load();};
 const chips=el('div','moments-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','가수 고르기');
 const empty=el('p','moments-empty','아직 공개 세로 순간이 없어요. 쇼츠를 담은 공개 트리가 늘면 여기에 나타나요.');
 empty.hidden=true;
 context.append(chips);
 panel.closest?.('dialog')?.querySelector('.community-top-row')?.append(toolbar);
 panel.closest?.('dialog')?.querySelector('.community-top-row')?.append(scopeChips);
 panel.append(treePicker,stage,empty,emptyRetry);stage.append(ownerMenu);

 // 담기 창 — 기존 트리 고르기 창이 따로 없어 이 보기 안에 작은 창을 둔다(트리 목록은 셸 모델을 쓴다).
 const addDialog=el('div','moments-add-dialog');addDialog.setAttribute('role','dialog');addDialog.setAttribute('aria-modal','true');addDialog.setAttribute('aria-label','어느 트리에 담을까요');addDialog.hidden=true;
 const addTitle=el('h3','moments-add-title','어느 트리에 담을까요');
 const addList=el('div','moments-add-list');
 const addClose=el('button','moments-add-close','×');addClose.type='button';addClose.setAttribute('aria-label','닫기');addClose.onclick=()=>{if(historyLayers)historyLayers.dismiss('moment-add');else addDialog.hidden=true;};
 addDialog.append(addTitle,addClose,addList);panel.append(addDialog);
 let pendingAdd=null;
 function openAddDialog(item){
  pendingAdd=item;
  const trees=(globalThis.LT41?.trees||[]).filter(t=>t?.id&&t?.moments?.length);
  if(!trees.length){notify?.('로그인한 뒤 내 트리에 담을 수 있어요.');memberLogin?.();return;}
  addList.replaceChildren(...trees.map(tree=>{
   const button=el('button','moments-add-option',tree.title||tree.subject||'트리');button.type='button';
   button.onclick=()=>{
    addDialog.hidden=true;
    const result=onAddToTree?.(pendingAdd,tree.id);
    if(result?.ok)notify?.('담았어요 · 트리 보기',{action:{label:'트리 보기',run:()=>onOpenShare?.({shareId:pendingAdd?.shareId,view:'book'})}});
    else notify?.(result?.reason==='login'?'로그인한 뒤 내 트리에 담을 수 있어요.':'담지 못했어요.');
    if(result?.reason==='login')memberLogin?.();
   };
   return button;
  }));
  addDialog.hidden=false;historyLayers?.open('moment-add',()=>{addDialog.hidden=true;});
 }
 // #1098 2단계: 순간 댓글 창 — 읽기·쓰기는 순간 단위 API(서버 #1136). 막히면 서버 응답 안내를 그대로 보여 주고,
 // 로그아웃(401)에는 트리 댓글과 같이 로그인 안내를 곁들인다. AI 명예회원 댓글은 트리 작성자 표시와 같은 방식으로 구분한다.
 const commentsDialog=el('div','moments-comments-dialog');commentsDialog.setAttribute('role','dialog');commentsDialog.setAttribute('aria-modal','true');commentsDialog.setAttribute('aria-label','순간 댓글');commentsDialog.hidden=true;
 const commentsTitle=el('h3','moments-comments-title','댓글');
 const closeComments=()=>{commentsDialog.hidden=true;panel.classList.remove('lt-comments-open');};
 const commentsClose=el('button','moments-add-close','×');commentsClose.type='button';commentsClose.setAttribute('aria-label','닫기');commentsClose.onclick=()=>{if(historyLayers)historyLayers.dismiss('moment-comments');else closeComments();};
 const commentsNotice=el('p','moments-comments-notice');commentsNotice.setAttribute('role','status');commentsNotice.hidden=true;
 const commentsList=el('div','moments-comments-list');
 const commentsForm=el('form','community-comment-form');const commentsInput=el('textarea','');const commentsSubmit=el('button','community-mini','댓글 남기기');
 commentsInput.maxLength=1000;commentsInput.required=true;commentsInput.placeholder='이 순간에 남길 말을 적어 주세요.';commentsSubmit.type='submit';
 commentsForm.append(commentsInput,commentsSubmit);
 commentsDialog.append(commentsTitle,commentsClose,commentsNotice,commentsList,commentsForm);
 panel.append(commentsDialog);
 const whenOf=(value)=>{try{return when?when(value):String(value||'').slice(0,10);}catch{return '';}};
 const paintCommentsRow=(comment)=>{
  const item=el('article','community-comment');const edited=comment.edited?' · 수정됨':'';
  item.append(el('small','',`${comment.aiTester?'AI 명예회원 · ':''}${comment.authorLabel} · ${whenOf(comment.createdAt)}${edited}`));
  item.append(el('p','',comment.body));
  return item;
 };
 const emptyComments=()=>el('p','community-muted','아직 댓글이 없어요. 첫 댓글을 남겨 보세요.');
 let commentsCache=[];
 const paintCommentRows=(list)=>{
  commentsList.replaceChildren(...(list.length?list.map(paintCommentsRow):[emptyComments()]));
  commentsTitle.textContent=Number(list.length)>=3?`댓글 ${list.length}`:'댓글';
  momentStats.comments=list.length;paintCounts();
 };
 async function openComments(){
  const item=current();if(!item||!item.shareId||!item.id||!api||typeof api.momentComments!=='function')return;
  commentsDialog.hidden=false;panel.classList.add('lt-comments-open');historyLayers?.open('moment-comments',closeComments);commentsNotice.hidden=true;
  commentsTitle.textContent='댓글';
  commentsList.replaceChildren(el('p','community-muted','댓글을 불러오는 중…'));
  const answer=await api.momentComments(item.shareId,item.id);
  if(current()!==item){if(historyLayers)historyLayers.dismiss('moment-comments');else closeComments();return;} // 넘겨 뒤 늦게 온 응답은 버린다
  if(!answer.ok){
   commentsNotice.textContent=(answer&&answer.message)||(answer.status===401?'로그인하면 댓글을 남길 수 있어요.':'댓글을 불러오지 못했어요.');
   commentsNotice.hidden=false;
   if(answer.status===401)memberLogin?.();
   commentsList.replaceChildren();
   return;
  }
  const list=Array.isArray(answer.comments)?answer.comments:[];
  commentsCache=list;paintCommentRows(list);
 }
 commentsForm.onsubmit=async event=>{
  event.preventDefault();commentsSubmit.disabled=true;
  const item=current();
  const answer=item?await api.momentComment(item.shareId,item.id,commentsInput.value):{ok:false,status:0,message:''};
  commentsSubmit.disabled=false;
  if(!answer.ok){
   commentsNotice.textContent=(answer&&answer.message)||(answer&&answer.status===401?'로그인하면 댓글을 남길 수 있어요.':'댓글을 남기지 못했어요.');
   commentsNotice.hidden=false;
   if(answer.status===401)memberLogin?.();
   return;
  }
  commentsInput.value='';commentsNotice.hidden=true;
  // 서버가 돌려 준 그 댓글을 그 자리에 더한다(POST 응답 {comment}) — 다시 읽어 오는 동안 목록이 깜빡이지 않게.
  if(answer.comment&&answer.comment.body!=null){commentsCache=[...commentsCache,answer.comment];paintCommentRows(commentsCache);}
  else await openComments();
 };
 // 공유: 공개 공유가 있는 순간은 /t/<shareId> 주소가 늘 있다 — 복사할 주소가 없으면 원본 영상 주소로 돌린다.
 async function copyShare(item){
  const url=item.shareId?new URL('/t/'+encodeURIComponent(item.shareId),location.origin).href:(item.url||'');
  if(!url){notify?.('복사할 주소가 없어요.');return;}
  try{
   if(globalThis.navigator?.clipboard?.writeText)await navigator.clipboard.writeText(url);
   else{const box=el('textarea');box.value=url;document.body.append(box);box.select();document.execCommand?.('copy');box.remove();}
   notify?.('주소를 복사했어요');
  }catch{notify?.('주소를 복사하지 못했어요.');}
 }

 let items=[],index=0,loading=false,token=0,frames=[],seen=new Set(),unmuted=false,wantSound=false,touchY=null,activeTag='',groups=[];
let advancing=0,unavailableTimer=0,unavailableId='';
 let enoughVisible=false;
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
   enoughVisible=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>0.5);
   if(!enoughVisible&&currentFrame)command(currentFrame,'pauseVideo');
   else if(enoughVisible&&currentFrame)kickPlay(currentFrame);
 },{root:panel.closest?.('dialog')||null,threshold:[0,0.5,0.51,1]}):null;
 observer?.observe(card);
 const current=()=>items[index]||null;
 const INFO_KEY='lt41.momentInfoOpen';
 let infoOpen=false;try{infoOpen=localStorage.getItem(INFO_KEY)==='1';}catch{}
 function paintInfo(){
   stage.classList.toggle('moments-info-open',infoOpen);
   infoButton.setAttribute('aria-expanded',String(infoOpen));
   infoButton.setAttribute('aria-label',infoOpen?'순간 정보 닫기':'순간 정보 열기');
   infoButton.textContent=infoOpen?'ⓘ 닫기':'ⓘ 정보';
 }
 infoButton.onclick=()=>{
   infoOpen=!infoOpen;
   try{localStorage.setItem(INFO_KEY,infoOpen?'1':'0');}catch{}
   paintInfo();
 };
 paintInfo();
 function paintSound(){
   if(!soundButton)return;
   soundButton.hidden=stage.dataset.ltMomentUnavailable==='1';
   soundButton.replaceChildren();
   const icon=soundIcon(!unmuted);icon.setAttribute('class','moments-rail-svg');
   soundButton.append(icon,el('span','moments-rail-label',unmuted?'소리 끄기':'소리 켜기'));
   soundButton.setAttribute('aria-label',unmuted?'소리 끄기':'소리 켜기');
   soundButton.classList.toggle('is-muted',!unmuted);
   stage.dataset.ltMomentsMuted=String(!unmuted);
 }
 // #1441: 순간 범위는 칩 줄이 아닌 상단의 단일 선택 메뉴에 둔다.
 let publicTreeChoices=[],treeMomentOrder=[],treeMomentTotal=0,treeTitle='';
 const scopeNames={all:'전체',mine:'내 순간',tree:'트리 고르기'};
 function closeScope(){scopeMenu.hidden=true;scopeTrigger.setAttribute('aria-expanded','false');}
 function renderScopeChips(){
  scopeTrigger.textContent='보는 범위: '+(scope==='tree'?(treeTitle||'트리 하나'):scopeNames[scope])+' ▾';
  scopeMenu.replaceChildren(...[['all','전체'],['mine','내 순간'],['tree','트리 고르기']].map(([value,label])=>{
   const button=el('button','moments-scope-chip',label);button.type='button';button.dataset.scope=value;
   button.setAttribute('aria-pressed',String(scope===value));
   button.classList.toggle('is-active',scope===value);
   if(value==='mine'&&!isMember())button.hidden=true;
   button.onclick=()=>{closeScope();if(value==='tree'){void openTreePicker();return;}chooseScope(value);};
   scopeButtons[value]=button;return button;
  }));
  scopeSummary.hidden=scope!=='tree';scopeReset.hidden=scope!=='tree';
  scopeSummary.textContent=scope==='tree'?((treeTitle||'선택한')+' 트리 · '+(items.length?index+1:0)+'/'+(treeMomentTotal||items.length)):'';
 }
 scopeTrigger.onclick=()=>{const opening=scopeMenu.hidden;scopeMenu.hidden=!opening;scopeTrigger.setAttribute('aria-expanded',String(opening));};
 scopeReset.onclick=()=>{treeTitle='';scopeShareId='';chooseScope('all');};
 document.addEventListener('pointerdown',event=>{if(!scopeChips.contains(event.target))closeScope();if(!treePicker.hidden&&!treePicker.contains(event.target))treePicker.hidden=true;if(!ownerMenu.contains(event.target)&&!treeLine.contains(event.target))ownerMenu.hidden=true;});
 scopeChips.addEventListener('keydown',event=>{if(event.key==='Escape'){closeScope();scopeTrigger.focus();}});
 const safeTree=(item)=>item&&item.shareId&&(item.isPublic!==false&&item.visibility!=='private'&&item.public!==false);
 async function openTreePicker(){
  treePicker.hidden=false;treePickerOptions.replaceChildren(el('p','community-muted','공개 트리를 불러오는 중이에요.'));
  treePickerSearch.value='';
  const answer=await api.discover({limit:50,sort:'newest'});
  if(treePicker.hidden)return;
  publicTreeChoices=(answer.ok&&Array.isArray(answer.items)?answer.items:[]).filter(safeTree);
  paintTreeChoices();
  treePickerSearch.focus();
 }
 function paintTreeChoices(){
  const q=treePickerSearch.value.toLocaleLowerCase('ko');
  const choices=publicTreeChoices.filter(item=>String(item.title||item.subject||'').toLocaleLowerCase('ko').includes(q));
  treePickerOptions.replaceChildren(...(choices.map(item=>{
   const button=el('button','moments-tree-picker-option',(item.title||item.subject||'공개 트리')+(item.publicDisplayName?' · '+item.publicDisplayName:''));
   button.type='button';button.dataset.shareId=item.shareId;
   button.onclick=()=>{treeTitle=item.title||item.subject||'트리';treePicker.hidden=true;setScopeContext(item.shareId);chooseScope('tree');};return button;
  }).concat(choices.length?[]:[el('p','community-muted','고를 공개 트리가 없어요.') ])));
 }
 treePickerSearch.oninput=paintTreeChoices;
 function setScopeContext(shareId){
  const next=String(shareId||'');
  const changed=next!==scopeShareId;scopeShareId=next;
  if(changed){treeMomentOrder=[];treeMomentTotal=0;}
  if(changed&&scope==='tree'&&!scopeShareId)scope='all';
  renderScopeChips();
 }
 function chooseScope(value,{syncHash=true}={}){
  if(value===scope&&value!=='tree')return;
  if(value==='tree'&&!scopeShareId)return;
  if(value==='mine'&&!isMember())return;
  token+=1;loading=false;scope=value;items=[];seen=new Set();index=0;treeMomentOrder=[];treeMomentTotal=0;
  clearFrames();media.querySelectorAll('.moments-frame').forEach(node=>node.remove());
  currentFrame=null;stage.hidden=true;
  empty.hidden=true;emptyRetry.hidden=true;
  panel.scrollTop=0;stage.scrollTop=0;
  renderScopeChips();renderChips();
  void load();
  if(syncHash)onScopeChange?.(scope,scopeShareId);
 }
 function applyScope(value,shareId=''){
  const wanted=['all','tree','mine'].includes(value)?value:'all';
  setScopeContext(wanted==='tree'?shareId:'');
  if(wanted!==scope||wanted==='tree'){chooseScope(wanted,{syncHash:false});}
 }
 // 칩 줄: 전체 + 서버가 센 공개 쇼츠 가수 꼬리표 상위 6개. 누르면 그 가수만 다시 섞는다.
 function renderChips(){
  const choices=[{value:'',label:'전체'},...(groups||[]).map(g=>({value:tagKey(g.value)||g.value,label:g.value,tag:'가수:'+g.value}))];
  // #1305: 고를 가수가 없으면 '전체'만 덩그러니 남기지 않는다.
  chips.hidden=choices.length<2;
  chips.replaceChildren(...choices.map(choice=>{
   const chip=el('button','moments-chip',choice.label);chip.type='button';
   const active=(choice.value?('가수:'+choice.label):'')===activeTag;
   chip.classList.toggle('is-active',active);chip.setAttribute('aria-pressed',String(active));
   chip.onclick=()=>{if(activeTag===(choice.tag||''))return;activeTag=choice.tag||'';items=[];seen=new Set();index=0;clearFrames();void load();};
   return chip;
  }));
 }

 // #1305: 유튜브 API 명령은 postMessage 목표가 주소의 origin과 같아야 닿는다.
 const YT_ORIGIN='https://www.youtube-nocookie.com';
 const command=(frame,func,args=[])=>{
  if(!frame?.contentWindow)return false;
  try{frame.contentWindow.postMessage(JSON.stringify({event:'command',func,args}),YT_ORIGIN);return true;}catch{return false;}
 };
 // 휴대폰에서는 iframe 문서가 뜬 뒤에도 플레이어 준비가 늦어, 한 번 보낸 재생 명령이 버려진다.
 // 재생이 실제로 시작됐다는 신호(상태 1)가 올 때까지 짧은 간격으로 듣기·음소거·재생을 다시 보낸다(최대 8초).
 function kickPlay(frame){
  if(frame!==currentFrame||!enoughVisible)return; // 다음 영상이나 절반 이하로 보이는 플레이어는 시작하지 않는다.
  clearInterval(frame._ltKick);
  let tries=0;
  const send=()=>{
   if(!frame.isConnected||frame!==currentFrame||!enoughVisible||stage.dataset.ltPlaying==='1'||tries++>=32){clearInterval(frame._ltKick);return;}
   try{frame.contentWindow?.postMessage('{"event":"listening"}',YT_ORIGIN);}catch{}
   // 소리를 켠 채로는 휴대폰이 자동 재생을 막는다 — 2초 안에 시작하지 않으면 음소거로 시작한다.
   // 소리를 켜 둔 사람은 새 영상에서도 소리로 시작한다(주소의 mute=1을 풀어 준다).
   // 휴대폰이 소리 자동 재생을 막아 2초 안에 시작하지 않으면 음소거로 시작한다.
   if(wantSound){command(frame,'playVideo');command(frame,'unMute');command(frame,'setVolume',[100]);}
   else{command(frame,'mute');command(frame,'playVideo');}
   stage.dataset.ltAutoplay='1';
  };
  send();
  frame._ltKick=setInterval(send,250);
 }
 function clearFrames(){
  for(const frame of frames)clearInterval(frame._ltKick);
  // 앞 영상을 먼저 멈추고 지운다 — DOM에서만 빼면 소리가 남는 경우가 있다.
  if(currentFrame)command(currentFrame,'pauseVideo');
  for(const frame of frames){frame.onload=null;frame.src='about:blank';frame.remove();}
  frames=[];
 }
 function makeFrame(item,{preload=false}={}){
  if(!item?.videoId)return null;
  const frame=document.createElement('iframe');
  frame.className='moments-frame';
  frame.title=item.title||'공개 세로 순간';
  frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.referrerpolicy='strict-origin-when-cross-origin';
  frame.setAttribute('allowfullscreen','');
  // 다음 영상은 자동 재생 없이 미리 준비한다.
  frame.src=embedSrc(item.videoId,item,{autoplay:!preload});
  if(preload)frame.dataset.ltPreloaded='1';
  // #1305: 재생이 막히던 원인 — 'listening'만 보내고 재생 명령을 보내지 않았다.
  //에이피아이가 켜진 iframe은 주소의 autoplay=1만으로 시작하지 않으므로 준비 뒤 playVideo를 보낸다.
  frame.onload=()=>{
   frame.classList.add('is-ready');
   kickPlay(frame);
  };
  frames.push(frame);
  return frame;
 }
 function render(){
  advancing=0;unavailableId='';clearTimeout(unavailableTimer);unavailableTimer=0;
  delete stage.dataset.ltMomentUnavailable;
  const item=current();
  if(!item){empty.hidden=false;stage.hidden=true;return;}
  empty.hidden=true;stage.hidden=false;
  // 썸네일이 늘 보이게 깔고 iframe은 그 아래에 둔다 — 유튜브가 안 떠도 판이 비지 않는다(#1025 재검수).
  media.classList.remove('is-playing');
  posterFallback.hidden=true;posterFallback.replaceChildren();poster.hidden=false;
  poster.src=item.thumbnail||'';
  poster.alt=item.title||'';
  treeLine.replaceChildren();
  const displayOwner=String(item.ownerName||item.publicDisplayName||item.authorLabel||item.ownerLabel||item.creatorName||item.authorName||'트리 주인').trim();
  owner.textContent=displayOwner.slice(0,1);
  ownerText.textContent=displayOwner;
  const treeOwner=el('button','moments-tree-owner',displayOwner);treeOwner.type='button';treeOwner.setAttribute('aria-label','트리 주인과 이름');
  treeLine.append(owner,treeOwner);
  if(item.aiTester)treeLine.append(el('span','moments-ai','✦ AI 명예회원'));
  const treeName=el('button','moments-tree-name',item.treeTitle||item.ownerName||'트리');treeName.type='button';
  treeName.title=item.treeTitle||'';
  const openOwnerMenu=()=>{ownerMenu.hidden=!ownerMenu.hidden;};
  treeOwner.onclick=openOwnerMenu;treeName.onclick=openOwnerMenu;
  cardTree.textContent=displayOwner+' · '+(item.treeTitle||'트리');cardTree.onclick=openOwnerMenu;
  ownerOnly.onclick=()=>{if(!item.shareId)return;ownerMenu.hidden=true;treeTitle=item.treeTitle||'트리';setScopeContext(item.shareId);chooseScope('tree');};
  treeLine.append(treeName);
  titleLine.textContent=item.title||'';
  // 꼬리표는 '가수:아이유' 같은 머리말을 뺀 값만 — 기존 parseTag 한 벌을 그대로 쓴다.
  tagLine.textContent=(item.keywords||[]).slice(0,4).map(raw=>parseTag(raw)?.value||raw).filter(Boolean).join(' · ');
  noteLine.textContent=item.note||'';
  noteLine.setAttribute('aria-expanded','false');noteLine.setAttribute('aria-label','설명 펼치기');
  noteLine.hidden=!item.note;
  renderScopeChips();
  // 지금 것 + 다음 것만 iframe — 다음 것은 autoplay=0, mute=1로 준비한다.
  clearFrames();
  const now=makeFrame(item),next=makeFrame(items[index+1],{preload:true});
  media.querySelectorAll('.moments-frame').forEach(node=>node.remove());
  if(now)media.append(now);
  if(next){next.classList.add('moments-next');media.append(next);}
  progressFill.classList.remove('is-running');
  playerProgress.value=0;
  progress.dataset.ltProgress='0';
  if(!matchMedia('(max-width:780px)').matches){void progressFill.offsetWidth;progressFill.classList.add('is-running');}
  // #1305: 소리 선택은 이번 방문 동안 유지 — 순간을 넘겨도 되돌리지 않는다.
  paintSound();
  stage.dataset.ltAutoplay='';stage.dataset.ltPlaying='0';
  media.dataset.orientation=item.vertical===false||item.isVertical===false?'landscape':'portrait';
  paintInfo();
  currentFrame=now;
  stage.dataset.ltMomentsCount=String(frames.length);
  stage.dataset.ltMomentsId=item.videoId||item.id;
  closeComments(); // 순간을 넘기면 댓글 창을 닫는다 — 다음 순간 것을 다시 열게
  momentStats.hearts=0;momentStats.comments=0;setLiked(false);paintCounts();
  void loadStats(); // 그 순간의 ♡·댓글 수 — 모양이 다른 응답은 조용히 기본 표시를 유지한다
 }
 let currentFrame=null;
 async function load(){
  if(loading)return;
  if(scope==='tree'&&!scopeShareId)return;
  if(scope==='mine'&&!isMember())return;
  loading=true;
  const id=++token;
  const exclude=[...seen].join(',');
  empty.hidden=true;emptyRetry.hidden=true;
  try{
   const answer=scope==='mine'
    ? await api.myMoments({exclude,limit:12})
    : await api.publicMoments({shareId:scope==='tree'?scopeShareId:'',exclude,tag:activeTag,limit:12});
   if(!answer?.ok)throw new Error('moments_load_failed');
   if(id!==token)return;
   const data=answer;
   const listed=(Array.isArray(data.items)?data.items:[]).filter(item=>scope!=='mine'||!activeTag||(Array.isArray(item?.keywords)&&item.keywords.includes(activeTag)));
   if(activeTag&&!items.length&&!listed.length){empty.hidden=false;empty.textContent=`${activeTag.slice('가수:'.length)} 쇼츠가 아직 없어요.`;stage.hidden=true;renderChips();return;}
   if(Array.isArray(data.groups)){groups=data.groups;renderChips();}
   let fresh=listed.filter(item=>item&&item.videoId&&!seen.has(item.videoId));
   if(scope==='tree'){
    // 공개 공유 응답만 사용한다. 비공개 트리와 순간은 서버에서 반환하지 않는다.
    const shared=await api.publicShare(scopeShareId);
    if(id!==token)return;
    if(!shared?.ok||!shared.tree){fresh=[];treeMomentOrder=[];treeMomentTotal=0;}
    else {
     const path=orderTreeMoments(Array.isArray(shared.tree.moments)?shared.tree.moments:[]);
     treeMomentOrder=path.map(moment=>String(moment.id));
     treeMomentTotal=path.filter(moment=>moment.videoId||moment.type==='youtube'||moment.type==='video'||moment.url).length||path.length;
     treeTitle=shared.tree.title||shared.tree.subject||treeTitle||'트리';
     const byId=new Map(treeMomentOrder.map((key,pos)=>[key,pos]));
     fresh=fresh.filter(item=>item.shareId===scopeShareId&&(!treeMomentOrder.length||byId.has(String(item.id))));
     fresh.sort((a,b)=>(byId.get(String(a.id))??Number.MAX_SAFE_INTEGER)-(byId.get(String(b.id))??Number.MAX_SAFE_INTEGER));
    }
   }
   if(!fresh.length&&!items.length){items=[];render();return;}
   items=[...items,...fresh];
   if(scope==='tree'&&treeMomentOrder.length){const byId=new Map(treeMomentOrder.map((key,pos)=>[key,pos]));items.sort((a,b)=>(byId.get(String(a.id))??Number.MAX_SAFE_INTEGER)-(byId.get(String(b.id))??Number.MAX_SAFE_INTEGER));}
   for(const item of fresh)seen.add(item.videoId);
   if(!current())index=0;
   render();
  }catch{
   if(id===token&&!items.length){empty.hidden=false;empty.textContent=scope==='mine'?'내 순간을 불러오지 못했어요.':scope==='tree'?'이 트리의 순간을 불러오지 못했어요.':'공개 세로 순간을 불러오지 못했어요.';emptyRetry.hidden=false;stage.hidden=true;}
  }finally{if(id===token)loading=false;}
 }
 // 재생이 끝난 뒤 한 번만 넘긴다(유튜브가 같은 상태를 여러 번 보낼 수 있다).
 function advanceAfterEnd(){
  if(advancing)return;
  advancing=1;
  step(1); // render()가 advancing을 되돌린다
 }
 function step(delta){
  const nextIndex=index+delta;
  if(nextIndex>=items.length){void load();index=Math.min(index,items.length-1);return;}
  if(nextIndex<0)return;
  index=nextIndex;

  render();
 }
 up.onclick=()=>step(-1);
 down.onclick=()=>step(1);
 stage.addEventListener('wheel',event=>{if(event.target?.closest?.('.moments-media,.moments-card')||Math.abs(event.deltaY)<4)return;event.preventDefault();step(event.deltaY>0?1:-1);},{passive:false});
 // 유튜브가 실제로 재생을 시작한 뒤에만 썸네일을 걷는다 — 그 전에는 썸네일이 판을 채운다(빈 판 방지).
 if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('message',event=>{
  if(!currentFrame||event.source!==currentFrame.contentWindow)return;
  let data;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
  if(data?.event==='infoDelivery'&&data.info&&typeof data.info==='object'){
    const info=data.info;const duration=Number(info.duration),time=Number(info.currentTime);
    if(Number.isFinite(duration)&&duration>0&&Number.isFinite(time)){const value=Math.max(0,Math.min(100,time/duration*100));playerProgress.value=value;progress.dataset.ltProgress=String(Math.round(value));}
    if(info.playerState===1){media.classList.add('is-playing');posterFallback.hidden=true;stage.dataset.ltPlaying='1';}
    // 화면 표시는 유튜브가 알려 준 실제 상태를 따른다. 새 영상은 주소의 mute=1로 음소거 상태를 알려 오므로,
    // 소리를 켜 둔 사람의 선택(wantSound)이 있으면 몇 번 더 소리를 다시 켠다(브라우저가 막으면 알약이 다시 보인다).
    if(typeof info.muted==='boolean'){
     unmuted=!info.muted;
     if(info.muted&&wantSound&&(currentFrame._ltSoundTries=(currentFrame._ltSoundTries||0)+1)<=8){
      command(currentFrame,'unMute');command(currentFrame,'setVolume',[100]);
     }
     paintSound();
    }
  }
  if(data?.event==='onError'){
   const code=String(data.data??data.info??'');
   if(!AUTO_NEXT_ERROR_CODES.has(code))return;
   const item=current();
   if(!item||unavailableId===item.id)return;
   unavailableId=item.id;
   stage.dataset.ltMomentUnavailable='1';
   // #1354: 오류 플레이어와 미리 불러 둔 플레이어를 걷고 안내만 표시한다.
   clearFrames();
   media.querySelectorAll('.moments-frame').forEach(frame=>frame.remove());
   currentFrame=null;
   stage.dataset.ltMomentsCount='0';
   media.classList.remove('is-playing');
   stage.dataset.ltPlaying='0';
   showPosterFallback();
   if(soundButton)soundButton.hidden=true;
   clearTimeout(unavailableTimer);
   unavailableTimer=setTimeout(()=>{
    if(unavailableId===current()?.id&&autoNextEnabled())advanceAfterEnd();
   },AUTO_NEXT_ERROR_MS);
   return;
  }
  if(data?.event==='onStateChange'){
   const state=Number(data.info),item=current(),start=Number(item?.startSeconds),end=Number(item?.endSeconds);
   if(state===0&&item){
    // #1352: 연속 재생이 켜져 있으면 구간이 있는 순간도 끝에서 다음으로 넘어간다.
    if(autoNextEnabled())advanceAfterEnd();
    // 꺼져 있을 때만 기존 구간 반복을 유지한다.
    else if(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(end)&&end>start){
     try{currentFrame.contentWindow.postMessage('{"event":"command","func":"seekTo","args":['+start+',true]}','https://www.youtube-nocookie.com');currentFrame.contentWindow.postMessage('{"event":"command","func":"playVideo","args":[]}','https://www.youtube-nocookie.com');}catch{}
    }
    media.classList.remove('is-playing');stage.dataset.ltPlaying='0';
    return;
   }
   media.classList.toggle('is-playing',state===1);
   stage.dataset.ltPlaying=state===1?'1':'0';
  }
 });
 if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('keydown',event=>{
  if(!panel.closest?.('dialog')?.open||panel.hidden)return;
  if(event.key==='ArrowDown'){event.preventDefault();step(1);}
  if(event.key==='ArrowUp'){event.preventDefault();step(-1);}
 });
  const videoTouch=event=>{
    const touch=event.touches?.[0]||event.changedTouches?.[0];
    const frame=media.querySelector('.moments-frame:not(.moments-next)');
    if(!touch||!frame)return false;
    const box=frame.getBoundingClientRect();
    return touch.clientX>=box.left&&touch.clientX<box.right&&touch.clientY>=box.top&&touch.clientY<box.bottom;
   };
   const swipeTargets=[stage,toolbar];
  for(const target of swipeTargets)target.addEventListener('touchstart',event=>{
    if(event.target?.closest?.('.moments-media')||(event.isTrusted&&videoTouch(event))){touchY=null;return;}
    const t=event.touches[0];touchY=t?{x:t.clientX,y:t.clientY}:null;
  },{passive:true});
 for(const target of swipeTargets)target.addEventListener('touchend',event=>{
  if(touchY===null)return;
  const t=event.changedTouches[0],dy=(t?.clientY??touchY.y)-touchY.y,dx=(t?.clientX??touchY.x)-touchY.x;
  if(Math.abs(dy)>55&&Math.abs(dy)>Math.abs(dx)*1.4&&!event.target?.closest?.('.moments-media,textarea,select,input'))step(dy<0?1:-1);
  touchY=null;
 },{passive:true});
  function toggleSound(event){
    event.stopPropagation();
    if(!currentFrame)return;
    wantSound=!wantSound;unmuted=wantSound;
    command(currentFrame,wantSound?'unMute':'mute');
    if(wantSound){command(currentFrame,'setVolume',[100]);command(currentFrame,'playVideo');}
    paintSound();
  };
 // 플레이어 위에는 어떤 클릭·제스처 층도 두지 않는다.
 // 재생·일시 정지는 유튜브 기본 컨트롤이 전담한다.
 function activate(){if(scope!=='tree')scopeShareId=getShareContext?.()||scopeShareId;renderScopeChips();if(!items.length&&!loading)void load();else render();}
 function deactivate(){clearFrames();media.querySelectorAll('.moments-frame').forEach(node=>node.remove());}
 return {activate,deactivate,load,step,setScopeContext,applyScope,state:()=>({count:frames.length,id:stage.dataset.ltMomentsId||'',index,loaded:items.length,scope,scopeShareId})};
}
