// #1025 1단계: 공개 '세로' 순간을 숏츠처럼 넘겨 보기.
// iframe은 지금 것과 다음 것만 둔다 — 넘긴 것은 DOM에서 제거한다(동시에 살아 있는 iframe ≤ 2).
// 세로 판정은 서버가 화면과 같은 함수(isVerticalMoment)로 해서 내려준다 — 여기서는 새로 만들지 않는다.
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const EMBED='https://www.youtube-nocookie.com/embed/';
const embedSrc=id=>`${EMBED}${encodeURIComponent(id)}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;

export function mountMoments({panel,onOpenShare}){
 const stage=el('div','moments-stage');
 const card=el('div','moments-card');
 const media=el('div','moments-media');
 const poster=el('img','moments-poster');poster.alt='';poster.loading='lazy';
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
  {icon:'🌳',label:'트리',action:()=>current&&onOpenShare?.({shareId:current.shareId,view:'book'})},
  {icon:'＋',label:'담기'},
  {icon:'↗',label:'공유'}
 ];
 for(const spec of railButtons){
  const button=el('button','moments-rail-button');
  button.type='button';button.append(el('span','moments-rail-icon',spec.icon),el('span','moments-rail-label',spec.label));
  if(spec.action)button.onclick=spec.action;
  else{button.disabled=true;button.title='2단계에서 열려요';button.setAttribute('aria-disabled','true');}
  rail.append(button);
 }
 const empty=el('p','moments-empty','아직 공개 세로 순간이 없어요. 쇼츠를 담은 공개 트리가 늘면 여기에 나타나요.');
 empty.hidden=true;
 panel.append(stage,empty);

 let items=[],index=0,loading=false,token=0,frames=[],seen=new Set(),unmuted=false,touchY=null;
 const current=()=>items[index]||null;

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
  frame.src=embedSrc(item.videoId);
  frame.onload=()=>frame.classList.add('is-ready');
  frames.push(frame);
  return frame;
 }
 function render(){
  const item=current();
  if(!item){empty.hidden=false;stage.hidden=true;return;}
  empty.hidden=true;stage.hidden=false;
  // 사진이 실제로 보이는지 먼저 확인된 뒤에만 iframe을 붙인다(빈 화면 캡처 금지).
  poster.src=item.thumbnail||'';
  poster.alt=item.title||'';
  treeLine.replaceChildren();
  if(item.aiTester)treeLine.append(el('span','moments-ai','AI 명예회원'));
  treeLine.append(el('span','moments-tree-name',item.treeTitle||''));
  titleLine.textContent=item.title||'';
  tagLine.textContent=(item.keywords||[]).slice(0,4).join(' · ');
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
  try{
   const answer=await fetch('/api/public/moments?limit=12'+(exclude?'&exclude='+encodeURIComponent(exclude):''),{headers:{accept:'application/json'}});
   if(!answer.ok)throw new Error('moments_load_failed');
   const data=await answer.json();
   if(id!==token)return;
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
  media.classList.add('is-unmuted');
 });
 function activate(){if(!items.length&&!loading)void load();else render();}
 function deactivate(){clearFrames();media.querySelectorAll('.moments-frame').forEach(node=>node.remove());}
 return {activate,deactivate,load,step,state:()=>({count:frames.length,id:stage.dataset.ltMomentsId||'',index,loaded:items.length})};
}
