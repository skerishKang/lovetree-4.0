// Reuse Track32's cover transition, then read through the single Track59 reader.
(() => {
 const c=parent.LT41;
 const describe=value=>globalThis.LTMedia?.describe(value)||{kind:value?'link':'none',privateFile:false,loadUrl:''};
 const ctx=globalThis.LTMedia?.currentContext?.()||{source:c?.source||'',owned:false};
 const auto=globalThis.LTMedia?.autoLoadMedia?.(ctx.source,ctx.owned)===true;
 const ytThumb=(raw,media)=>{if(!auto||media.kind!=='youtube')return '';const list=globalThis.LTMedia?.youtubeCandidates?.(media.videoId,globalThis.LTMedia?.verticalVideo?.(raw?.url||'',raw?.mediaMetadata),raw?.mediaMetadata)||[];return list[0]||media.loadUrl||'';};
 LTDEMO.library=(c?.trees||[c.tree]).map(t=>({id:t.id,title:t.title,subject:t.subject,coverMomentId:t.coverMomentId||'',coverDesign:t.coverDesign||'',coverMode:t.coverMode||'',inbox:t.inbox===true,moments:t.id===c.tree.id?LTDEMO.moments.map(moment=>{const raw=t.moments.find(item=>item.id===moment.id),media=describe(raw?.url||''),yt=ytThumb(raw,media),photo=media.kind==='photo'&&media.privateFile?media.loadUrl:'';return {...moment,mediaMetadata:raw?.mediaMetadata||moment.mediaMetadata||null,image:photo||moment.image||yt,youtubeThumb:!!(!photo&&!moment.image&&yt)};}):t.moments.map(m=>{const media=describe(m.url||''),yt=ytThumb(m,media),photo=media.kind==='photo'&&media.privateFile?media.loadUrl:'';return {id:m.id,title:m.title,memo:m.note,emotion:m.emotion,date:m.date,mediaMetadata:m.mediaMetadata||null,externalUrl:m.url||'',type:media.kind==='photo'?'photo':media.kind==='video'||media.kind==='youtube'?'video':m.url?'link':'memo',image:photo||yt,youtubeThumb:!!(!photo&&yt)};})}));
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
   const p=document.querySelector('.hero-copy>p:not(.eyebrow)');if(p)p.textContent='책을 누르면 읽던 순간부터 책이 열려요.';
   const jump=document.getElementById('shelfJump');if(jump)jump.textContent='책 열기';
   // #256-1: .stage-label은 이어 읽기 칸(#resumeCard) 안의 것을 그대로 두고, 장식 단계가 아니면 덮어쓰지 않는다.
   const stage=document.querySelector('.stage-label');if(stage&&!stage.closest('#resumeCard'))stage.textContent='서재';
   const art=document.querySelector('.hero-stage:not(#resumeCard)');if(art){art.setAttribute('aria-hidden','true');}
  }else{
   const name=document.querySelector('.topbar .brand span');if(name)name.textContent=c?.tree.title||'책';
   const index=document.getElementById('archiveBtn');if(index)index.textContent='목차';
   const title=document.querySelector('#archivePanel h2');if(title)title.textContent='순간 목차';
   // 책 글자 다듬기(261116): 좁은 폭 축약 '이어진 길'은 없앤다 — 이름이 가려져 읽는 사람이 다른 단추로 읽었다(#584 문자열과 섞임).
   // 전체 이름 '이어진 순간'을 그대로 쓰고 390에서 15px로 본문과 같은 결(실측: 도구 줄 193px ≤ 60vw 234px, 단추 오른쪽 376 ≤ 화면-8 — 잘림 0).
   // 폰에서도 버튼 이름은 한 줄로 유지하고, 자세한 설명은 data-lt-tip에 남긴다.
   const overview=document.getElementById('overviewBtn');
   if(overview){
    overview.textContent='이어진 순간';
   }
  }
 };
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
