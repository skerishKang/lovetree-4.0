// #1025 1단계: 공개 '세로' 순간을 숏츠처럼 넘겨 보기.
// iframe은 지금 것과 다음 것만 둔다 — 넘긴 것은 DOM에서 제거한다(동시에 살아 있는 iframe ≤ 2).
// 세로 판정은 서버가 화면과 같은 함수(isVerticalMoment)로 해서 내려준다 — 여기서는 새로 만들지 않는다.
import {parseTag,tagKey} from './tags.mjs';
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
// 구간 재생: 시작·끝 초가 있으면 기존 구간 재생 규칙(start·end)대로 주소에 넣는다.
const embedSrc=(id,item={})=>{
 const params=['autoplay=1','mute=1','playsinline=1','controls=0','rel=0','modestbranding=1','enablejsapi=1'];
 const start=Number(item.startSeconds),end=Number(item.endSeconds);
 if(Number.isSafeInteger(start)&&start>0)params.push('start='+start);
 if(Number.isSafeInteger(end)&&end>start)params.push('end='+end);
 params.push('origin='+encodeURIComponent(location.origin));
 return `${EMBED}${encodeURIComponent(id)}?${params.join('&')}`;
};

export function mountMoments({panel,onOpenShare,onAddToTree,notify,memberLogin}){
 const stage=el('div','moments-stage');
 const card=el('div','moments-card');
 const media=el('div','moments-media');
 const poster=el('img','moments-poster');poster.alt='';poster.loading='lazy';
 // 썸네일이 안 떠도 판이 비지 않게 — 세로 포스터가 없으면 기존 가로 포스터로 한 번 더 시도한다.
 poster.onerror=()=>{const item=current();if(item?.videoId&&!/hqdefault\.jpg/.test(poster.getAttribute('src')||''))poster.src='https://i.ytimg.com/vi/'+encodeURIComponent(item.videoId)+'/hqdefault.jpg';};
 const overlay=el('div','moments-overlay');
 const treeLine=el('div','moments-tree');
 const titleLine=el('div','moments-title');
 const tagLine=el('div','moments-tags');
 const noteLine=el('div','moments-note');
 overlay.append(treeLine,titleLine,tagLine,noteLine);
 const progress=el('div','moments-progress');const progressFill=el('span','moments-progress-fill');progress.append(progressFill);
 media.append(poster,overlay,progress);
 card.append(media);
 const rail=el('div','moments-rail');
 const nav=el('div','moments-nav');
 const up=el('button','moments-step','▲');up.type='button';up.setAttribute('aria-label','이전 순간');
 const down=el('button','moments-step','▼');down.type='button';down.setAttribute('aria-label','다음 순간');
 nav.append(up,down);
 stage.append(card,rail,nav);
 // ♡·담기·공유는 2단계 자리 — 지금은 자리만 잡는다(트리 보기는 1단계에서 동작).
 const railButtons=[
  {icon:'♡',label:'마음'},
  {icon:treeIcon(),label:'트리',action:()=>current()&&onOpenShare?.({shareId:current().shareId,view:'book'})},
  {icon:'＋',label:'담기',action:()=>current()&&openAddDialog(current())},
  {icon:'↗',label:'공유',action:()=>current()&&copyShare(current())}
 ];
 for(const spec of railButtons){
  const button=el('button','moments-rail-button');
  button.type='button';
  const icon=typeof spec.icon==='string'?el('span','moments-rail-icon',spec.icon):spec.icon;
  if(typeof spec.icon!=='string')icon.setAttribute('class','moments-rail-svg');
  button.append(icon,el('span','moments-rail-label',spec.label));
  if(spec.action)button.onclick=spec.action;
  else{button.disabled=true;button.title='랭킹과 함께 정해요';button.setAttribute('aria-disabled','true');}
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
 const addClose=el('button','moments-add-close','×');addClose.type='button';addClose.setAttribute('aria-label','닫기');addClose.onclick=()=>{addDialog.hidden=true;};
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
  addDialog.hidden=false;
 }
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
  frame.onload=()=>frame.classList.add('is-ready');
  frames.push(frame);
  return frame;
 }
 function render(){
  const item=current();
  if(!item){empty.hidden=false;stage.hidden=true;return;}
  empty.hidden=true;stage.hidden=false;
  // 썸네일이 늘 보이게 깔고 iframe은 그 아래에 둔다 — 유튜브가 안 떠도 판이 비지 않는다(#1025 재검수).
  media.classList.remove('is-playing');
  poster.src=item.thumbnail||'';
  poster.alt=item.title||'';
  treeLine.replaceChildren();
  if(item.aiTester)treeLine.append(el('span','moments-ai','AI 명예회원'));
  treeLine.append(el('span','moments-tree-name',item.treeTitle||''));
  titleLine.textContent=item.title||'';
  // 꼬리표는 '가수:아이유' 같은 머리말을 뺀 값만 — 기존 parseTag 한 벌을 그대로 쓴다.
  tagLine.textContent=(item.keywords||[]).slice(0,4).map(raw=>parseTag(raw)?.value||raw).filter(Boolean).join(' · ');
  noteLine.textContent=item.note||'';
  noteLine.hidden=!item.note;
  // 지금 것 + 다음 것만 iframe — 나머지는 포스터로 남긴다.
  clearFrames();
  const now=makeFrame(item),next=makeFrame(items[index+1]);
  media.querySelectorAll('.moments-frame').forEach(node=>node.remove());
  if(now)media.append(now);
  if(next){next.classList.add('moments-next');media.append(next);}
  progressFill.classList.remove('is-running');
  void progressFill.offsetWidth;
  progressFill.classList.add('is-running');
  unmuted=false;
  currentFrame=now;
  stage.dataset.ltMomentsCount=String(frames.length);
  stage.dataset.ltMomentsId=item.videoId||item.id;
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
  render();
 }
 up.onclick=()=>step(-1);
 down.onclick=()=>step(1);
 stage.addEventListener('wheel',event=>{if(Math.abs(event.deltaY)<4)return;event.preventDefault();step(event.deltaY>0?1:-1);},{passive:false});
 // 유튜브가 실제로 재생을 시작한 뒤에만 썸네일을 걷는다 — 그 전에는 썸네일이 판을 채운다(빈 판 방지).
 if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('message',event=>{
  if(!currentFrame||event.source!==currentFrame.contentWindow)return;
  let data;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
  if(data?.event==='onStateChange'){
   const state=Number(data.info),item=current(),start=Number(item?.startSeconds);
   // 구간이 있는 순간은 끝나면 그 구간 처음으로 돌아간다(기존 구간 재생 규칙과 같은 동작).
   if(state===0&&item&&Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(Number(item.endSeconds))&&Number(item.endSeconds)>start){
    try{currentFrame.contentWindow.postMessage('{"event":"command","func":"seekTo","args":['+start+',true]}','https://www.youtube.com');currentFrame.contentWindow.postMessage('{"event":"command","func":"playVideo","args":[]}','https://www.youtube.com');}catch{}
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
 stage.addEventListener('touchstart',event=>{touchY=event.touches[0]?.clientY??null;},{passive:true});
 stage.addEventListener('touchend',event=>{
  if(touchY===null)return;
  const dy=(event.changedTouches[0]?.clientY??touchY)-touchY;
  if(Math.abs(dy)>40)step(dy<0?1:-1);
  touchY=null;
 },{passive:true});
 media.addEventListener('click',()=>{
  if(!currentFrame||unmuted)return;
  try{currentFrame.contentWindow?.postMessage('{"event":"command","func":"unMute","args":[]}','https://www.youtube.com');}catch{}
  try{currentFrame.contentWindow?.postMessage('{"event":"command","func":"setVolume","args":[100]}','https://www.youtube.com');}catch{}
  unmuted=true;
  stage.dataset.ltMomentsMuted='false';
 });
 function activate(){if(!items.length&&!loading)void load();else render();}
 function deactivate(){clearFrames();media.querySelectorAll('.moments-frame').forEach(node=>node.remove());}
 return {activate,deactivate,load,step,state:()=>({count:frames.length,id:stage.dataset.ltMomentsId||'',index,loaded:items.length})};
}
