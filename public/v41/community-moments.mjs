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
// #1098 2단계: 댓글 단추 아이콘 — 나무 선 아이콘과 같은 선 굵기·currentColor 한 벌.
function bubbleIcon(){
 const svg=document.createElementNS(SVG_NS,'svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
 const bubble=document.createElementNS(SVG_NS,'path');bubble.setAttribute('d','M4 5h16v11H10l-6 4V5z');
 svg.append(bubble);
 return svg;
}
// 구간 재생: 시작·끝 초가 있으면 기존 구간 재생 규칙(start·end)대로 주소에 넣는다.
const embedSrc=(id,item={})=>{
 const params=['autoplay=1','mute=1','playsinline=1','controls=0','rel=0','modestbranding=1','enablejsapi=1'];
 const start=Number(item.startSeconds),end=Number(item.endSeconds);
 if(Number.isSafeInteger(start)&&start>0)params.push('start='+start);
 if(Number.isSafeInteger(end)&&end>start)params.push('end='+end);
 params.push('origin='+encodeURIComponent(location.origin));
 return `${EMBED}${encodeURIComponent(id)}?${params.join('&')}`;
};

export function mountMoments({panel,onOpenShare,onAddToTree,notify,memberLogin,api=null,when=null,historyLayers=null}){
 const stage=el('div','moments-stage');
 const card=el('div','moments-card');
 const media=el('div','moments-media');
 const poster=el('img','moments-poster');poster.alt='';poster.loading='lazy';
 const posterFallback=el('div','moments-fallback');posterFallback.hidden=true;
 function showPosterFallback(){const item=current();if(!item)return;posterFallback.innerHTML=fallbackCardMarkup(item,{variant:'orbit',videoUnavailable:!!item.videoId});posterFallback.hidden=false;poster.hidden=true;}
 poster.onload=()=>{if(isGrayThumbnail(poster))showPosterFallback();};
 // 썸네일이 안 떠도 판이 비지 않게 — 세로 포스터가 없으면 기존 가로 포스터로 한 번 더 시도한다.
 poster.onerror=()=>{const item=current();const src=poster.getAttribute('src')||'';if(item?.videoId&&!/hqdefault\.jpg/.test(src))poster.src=youtubeStageThumbUrl(item.videoId,'hqdefault');else showPosterFallback();};
 const overlay=el('div','moments-overlay');
 const treeLine=el('div','moments-tree');
 const owner=el('span','moments-owner');owner.setAttribute('aria-hidden','true');
 const ownerText=el('span','moments-owner-text');
 const titleLine=el('div','moments-title');
 const tagLine=el('div','moments-tags');
 const noteLine=el('button','moments-note');noteLine.type='button';noteLine.setAttribute('aria-label','설명 펼치기');
 noteLine.onclick=()=>{const expanded=noteLine.getAttribute('aria-expanded')==='true';noteLine.setAttribute('aria-expanded',String(!expanded));noteLine.setAttribute('aria-label',expanded?'설명 펼치기':'설명 접기');};
 const mute=el('button','moments-mute','소리 켜기');mute.type='button';mute.setAttribute('aria-label','소리 켜기');
 const progressButton=el('div','moments-player-controls');
 overlay.append(treeLine,titleLine,tagLine,noteLine);
 const progress=el('div','moments-progress');const progressFill=el('span','moments-progress-fill');
 const playerProgress=el('progress','moments-progress-native');playerProgress.max=100;playerProgress.value=0;playerProgress.setAttribute('aria-label','재생 진행');
 progress.append(progressFill,playerProgress);
 const swipeLayer=el('div','moments-swipe-layer');swipeLayer.setAttribute('aria-hidden','true');
 const hint=el('div','moments-swipe-hint','위로 밀어 다음 순간');hint.setAttribute('role','status');hint.hidden=true;
 progressButton.append(mute);
 media.append(poster,posterFallback,swipeLayer,overlay,progress,progressButton,hint);
 card.append(media);
 const rail=el('div','moments-rail');
 const nav=el('div','moments-nav');
 const up=el('button','moments-step','▲');up.type='button';up.setAttribute('aria-label','이전 순간');
 const down=el('button','moments-step','▼');down.type='button';down.setAttribute('aria-label','다음 순간');
 nav.append(up,down);
 stage.append(card,rail,nav);
 let liked=false,heartButton=null,heartCount=null,commentsCount=null;
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
 const chips=el('div','moments-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','가수 고르기');
 const empty=el('p','moments-empty','아직 공개 세로 순간이 없어요. 쇼츠를 담은 공개 트리가 늘면 여기에 나타나요.');
 empty.hidden=true;
 panel.append(chips,stage,empty);

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

 let items=[],index=0,loading=false,token=0,frames=[],seen=new Set(),unmuted=false,touchY=null,activeTag='',groups=[];
 const current=()=>items[index]||null;
 // 칩 줄: 전체 + 서버가 센 공개 쇼츠 가수 꼬리표 상위 6개. 누르면 그 가수만 다시 섞는다.
 function renderChips(){
  const choices=[{value:'',label:'전체'},...(groups||[]).map(g=>({value:tagKey(g.value)||g.value,label:g.value,tag:'가수:'+g.value}))];
  chips.replaceChildren(...choices.map(choice=>{
   const chip=el('button','moments-chip',choice.label);chip.type='button';
   const active=(choice.value?('가수:'+choice.label):'')===activeTag;
   chip.classList.toggle('is-active',active);chip.setAttribute('aria-pressed',String(active));
   chip.onclick=()=>{if(activeTag===(choice.tag||''))return;activeTag=choice.tag||'';items=[];seen=new Set();index=0;clearFrames();void load();};
   return chip;
  }));
 }

 function clearFrames(){
  for(const frame of frames){frame.onload=null;frame.src='about:blank';frame.remove();}
  frames=[];
 }
 function makeFrame(item){
  if(!item?.videoId)return null;
  const frame=document.createElement('iframe');
  frame.className='moments-frame';
  frame.title=item.title||'공개 세로 순간';
  frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.referrerpolicy='strict-origin-when-cross-origin';
  frame.setAttribute('allowfullscreen','');
  frame.src=embedSrc(item.videoId,item);
  frame.onload=()=>{frame.classList.add('is-ready');try{frame.contentWindow?.postMessage('{"event":"listening"}','https://www.youtube-nocookie.com');}catch{}};
  frames.push(frame);
  return frame;
 }
 function render(){
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
  treeLine.append(owner,ownerText);
  if(item.aiTester)treeLine.append(el('span','moments-ai','✦ AI 명예회원'));
  treeLine.append(el('span','moments-tree-name',item.treeTitle||''));
  titleLine.textContent=item.title||'';
  // 꼬리표는 '가수:아이유' 같은 머리말을 뺀 값만 — 기존 parseTag 한 벌을 그대로 쓴다.
  tagLine.textContent=(item.keywords||[]).slice(0,4).map(raw=>parseTag(raw)?.value||raw).filter(Boolean).join(' · ');
  noteLine.textContent=item.note||'';
  noteLine.setAttribute('aria-expanded','false');noteLine.setAttribute('aria-label','설명 펼치기');
  noteLine.hidden=!item.note;
  // 지금 것 + 다음 것만 iframe — 나머지는 포스터로 남긴다.
  clearFrames();
  const now=makeFrame(item),next=makeFrame(items[index+1]);
  media.querySelectorAll('.moments-frame').forEach(node=>node.remove());
  if(now)media.append(now);
  if(next){next.classList.add('moments-next');media.append(next);}
  progressFill.classList.remove('is-running');
  playerProgress.value=0;
  progress.dataset.ltProgress='0';
  if(!matchMedia('(max-width:780px)').matches){void progressFill.offsetWidth;progressFill.classList.add('is-running');}
  unmuted=false;mute.textContent='소리 켜기';mute.setAttribute('aria-label','소리 켜기');
  stage.dataset.ltMomentsMuted='true';
  media.dataset.orientation=item.vertical===false||item.isVertical===false?'landscape':'portrait';
  if(matchMedia('(max-width:780px)').matches){try{hint.hidden=localStorage.getItem('lt41.momentSwipeSeen')==='1';}catch{hint.hidden=false;}}else hint.hidden=true;
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
  loading=true;
  const id=++token;
  const exclude=[...seen].join(',');
  const query='/api/public/moments?limit=12'+(exclude?'&exclude='+encodeURIComponent(exclude):'')+(activeTag?'&tag='+encodeURIComponent(activeTag):'');
  try{
   const answer=await fetch(query,{headers:{accept:'application/json'}});
   if(!answer.ok)throw new Error('moments_load_failed');
   const data=await answer.json();
   if(id!==token)return;
   if(activeTag&&!items.length&&!(Array.isArray(data.items)?data.items:[]).length){empty.hidden=false;empty.textContent=`${activeTag.slice('가수:'.length)} 쇼츠가 아직 없어요.`;stage.hidden=true;renderChips();return;}
   if(Array.isArray(data.groups)){groups=data.groups;renderChips();}
   const fresh=(Array.isArray(data.items)?data.items:[]).filter(item=>item&&item.videoId&&!seen.has(item.videoId));
   if(!fresh.length&&!items.length){items=[];render();return;}
   items=[...items,...fresh];
   for(const item of fresh)seen.add(item.videoId);
   if(!current())index=0;
   render();
  }catch{
   if(id===token&&!items.length){empty.hidden=false;empty.textContent='공개 세로 순간을 불러오지 못했어요.';stage.hidden=true;}
  }finally{loading=false;}
 }
 function step(delta){
  const nextIndex=index+delta;
  if(nextIndex>=items.length){void load();index=Math.min(index,items.length-1);return;}
  if(nextIndex<0)return;
  index=nextIndex;
  if(matchMedia('(max-width:780px)').matches){hint.hidden=true;try{localStorage.setItem('lt41.momentSwipeSeen','1');}catch{}}
  render();
 }
 up.onclick=()=>step(-1);
 down.onclick=()=>step(1);
 stage.addEventListener('wheel',event=>{if(Math.abs(event.deltaY)<4)return;event.preventDefault();step(event.deltaY>0?1:-1);},{passive:false});
 // 유튜브가 실제로 재생을 시작한 뒤에만 썸네일을 걷는다 — 그 전에는 썸네일이 판을 채운다(빈 판 방지).
 if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('message',event=>{
  if(!currentFrame||event.source!==currentFrame.contentWindow)return;
  let data;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
  if(data?.event==='infoDelivery'&&data.info&&typeof data.info==='object'){
    const info=data.info;const duration=Number(info.duration),time=Number(info.currentTime);
    if(Number.isFinite(duration)&&duration>0&&Number.isFinite(time)){const value=Math.max(0,Math.min(100,time/duration*100));playerProgress.value=value;progress.dataset.ltProgress=String(Math.round(value));}
    if(typeof info.muted==='boolean'){unmuted=!info.muted;mute.textContent=unmuted?'소리 끄기':'소리 켜기';mute.setAttribute('aria-label',mute.textContent);stage.dataset.ltMomentsMuted=String(!unmuted);}
  }
  if(data?.event==='onStateChange'){
   const state=Number(data.info),item=current(),start=Number(item?.startSeconds);
   // 구간이 있는 순간은 끝나면 그 구간 처음으로 돌아간다(기존 구간 재생 규칙과 같은 동작).
   if(state===0&&item&&Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(Number(item.endSeconds))&&Number(item.endSeconds)>start){
    try{currentFrame.contentWindow.postMessage('{"event":"command","func":"seekTo","args":['+start+',true]}','https://www.youtube-nocookie.com');currentFrame.contentWindow.postMessage('{"event":"command","func":"playVideo","args":[]}','https://www.youtube-nocookie.com');}catch{}
    return;
   }
   media.classList.toggle('is-playing',state===1);
  }
 });
 if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('keydown',event=>{
  if(!panel.closest('dialog')?.open||panel.hidden)return;
  if(event.key==='ArrowDown'){event.preventDefault();step(1);}
  if(event.key==='ArrowUp'){event.preventDefault();step(-1);}
 });
  stage.addEventListener('touchstart',event=>{const t=event.touches[0];touchY=t?{x:t.clientX,y:t.clientY}:null;},{passive:true});
 stage.addEventListener('touchend',event=>{
  if(touchY===null)return;
  const t=event.changedTouches[0],dy=(t?.clientY??touchY.y)-touchY.y,dx=(t?.clientX??touchY.x)-touchY.x;
  if(Math.abs(dy)>55&&Math.abs(dy)>Math.abs(dx)*1.4&&!(event.target?.closest?.('button,textarea,select,input')))step(dy<0?1:-1);
  touchY=null;
 },{passive:true});
  mute.onclick=event=>{
    event.stopPropagation();
    if(!currentFrame)return;
    const command=unmuted?'mute':'unMute';
    try{currentFrame.contentWindow?.postMessage(JSON.stringify({event:'command',func:command,args:[]}),'https://www.youtube-nocookie.com');}catch{}
    unmuted=!unmuted;mute.textContent=unmuted?'소리 끄기':'소리 켜기';mute.setAttribute('aria-label',mute.textContent);stage.dataset.ltMomentsMuted=String(!unmuted);
  };
  media.addEventListener('click',event=>{
    if(event.target.closest('button'))return;
  if(!currentFrame||unmuted||matchMedia('(max-width:780px)').matches)return;
  try{currentFrame.contentWindow?.postMessage('{"event":"command","func":"unMute","args":[]}','https://www.youtube-nocookie.com');}catch{}
  try{currentFrame.contentWindow?.postMessage('{"event":"command","func":"setVolume","args":[100]}','https://www.youtube-nocookie.com');}catch{}
  unmuted=true;
  stage.dataset.ltMomentsMuted='false';
 });
 function activate(){if(!items.length&&!loading)void load();else render();}
 function deactivate(){clearFrames();media.querySelectorAll('.moments-frame').forEach(node=>node.remove());}
 return {activate,deactivate,load,step,state:()=>({count:frames.length,id:stage.dataset.ltMomentsId||'',index,loaded:items.length})};
}
