// Reuse Track32's cover transition, then read through the single Track59 reader.
(() => {
 const c=parent.LT41;
 LTDEMO.library=(c?.trees||[c.tree]).map(t=>({id:t.id,title:t.title,subject:t.subject,coverMomentId:t.coverMomentId||'',moments:t.id===c.tree.id?LTDEMO.moments.map(moment=>{const raw=t.moments.find(item=>item.id===moment.id),media=LTMedia.describe(raw?.url||'');return {...moment,image:media.kind==='photo'&&media.privateFile?media.loadUrl:moment.image||''};}):t.moments.map(m=>{const media=LTMedia.describe(m.url||'');return {id:m.id,title:m.title,memo:m.note,emotion:m.emotion,date:m.date,externalUrl:m.url||'',type:media.kind==='photo'?'photo':media.kind==='video'||media.kind==='youtube'?'video':m.url?'link':'memo',image:media.kind==='photo'&&media.privateFile?media.loadUrl:''};})}));
 LTDEMO.openBook=(id,treeId=c.tree.id)=>{
  if(!LTDEMO.library.some(t=>t.id===treeId&&t.moments.some(m=>m.id===id)))return;
  parent.postMessage({type:'lt41-open-book',treeId,id},location.origin);
 };
 const apply=()=>{
  const shelf=location.pathname.includes('track32-bookshelf');
  const style=document.createElement('style');
  style.textContent=shelf?'.app>.topbar{display:none}.app>main{padding-top:18px}':
   '.topbar .ui-btn,#archiveClose{min-height:44px;min-width:44px}.archive-panel,.detail{transition-property:transform}.archive-panel:not(.open),.detail:not(.open){visibility:hidden;pointer-events:none}.topbar .brand strong,.topbar .brand .crumb{display:none}.topbar .brand span{max-width:32vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:820px){.topbar .brand{display:none}.topbar .tools{width:100%;justify-content:flex-end}}';
  document.head.append(style);
  if(shelf){
   const p=document.querySelector('.hero-copy>p:not(.eyebrow)');if(p)p.textContent='책을 누르면 읽던 순간부터 기억책이 열려요.';
   const jump=document.getElementById('shelfJump');if(jump)jump.textContent='기억책 열기';
   const stage=document.querySelector('.stage-label');if(stage)stage.textContent='내 책장';
   const art=document.querySelector('.hero-stage');if(art){art.setAttribute('aria-hidden','true');}
  }else{
   const name=document.querySelector('.topbar .brand span');if(name)name.textContent=c?.tree.title||'기억책';
   const index=document.getElementById('archiveBtn');if(index)index.textContent='목차';
   const title=document.querySelector('#archivePanel h2');if(title)title.textContent='순간 목차';
  }
 };
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
