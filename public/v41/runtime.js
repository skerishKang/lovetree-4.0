(() => {
  const context = parent.LT41;
  if (!context?.tree) throw new Error('트리를 먼저 선택하세요.');
  const tree = context.tree;
  const moments = tree.moments.map(m => {
    const media=window.LTMedia?.describe(m.url||'');
    const outgoing = tree.edges.filter(e => e.kind === 'parent' && e.from === m.id);
    return {id:m.id,title:m.title,date:m.date,emotion:m.emotion,memo:m.note,
      whyNext:outgoing.map(e=>e.reason).filter(Boolean).join(' / '),
      type:context.exampleMedia?.[m.id]?.type||(media?.kind==='photo'?'photo':media?.kind==='video'||media?.kind==='youtube'?'video':m.url?'link':'memo'),source:context.exampleMedia?'예시 이미지':media?.openUrl?new URL(media.openUrl).hostname:'불러온 기록',image:context.exampleMedia?.[m.id]?.image||'',externalUrl:m.url||'',
      first:m.parentId===null,next:outgoing[0]?.to||null,branch:outgoing[1]?.to||null};
  });
  if(context.source==='server')addEventListener('DOMContentLoaded',()=>{for(const label of document.querySelectorAll('#detail .section .label'))if(label.textContent==='감상 예시'){label.textContent='내 기록';label.nextElementSibling.textContent='상단에서 수정·연결을 관리할 수 있어요.';}});
  if(typeof document!=='undefined')addEventListener('DOMContentLoaded',()=>{
    const detail=document.querySelector('#detailNote');
    if(detail&&window.LTMedia){const host=document.createElement('div');detail.parentElement.after(host);let last=null;
      const update=()=>{const id=context.momentId;if(id===last)return;last=id;const m=tree.moments.find(m=>m.id===id);host.innerHTML=m?.url?window.LTMedia.markup(m.url,m.title):'';};
      new MutationObserver(update).observe(document.getElementById('detailTitle'),{childList:true,subtree:true});update();
    }
  });
  window.LTDEMO = {title:tree.title,moments,edges:tree.edges,
    get:()=>context.momentId,
    select:id=>{if(moments.some(m=>m.id===id)){context.momentId=id;parent.postMessage({type:'lt-selection',id},location.origin)}}};
})();
