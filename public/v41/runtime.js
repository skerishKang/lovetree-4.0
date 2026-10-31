(() => {
  const context = parent.LT41;
  if (!context?.tree) throw new Error('트리를 먼저 선택하세요.');
  const tree = context.tree;
  const moments = tree.moments.map(m => {
    const outgoing = tree.edges.filter(e => e.kind === 'parent' && e.from === m.id);
    return {id:m.id,title:m.title,date:m.date,emotion:m.emotion,memo:m.note,
      whyNext:outgoing.map(e=>e.reason).filter(Boolean).join(' / '),
      type:context.exampleMedia?.[m.id]?.type||'memo',source:context.exampleMedia?'예시 이미지':'불러온 기록',image:context.exampleMedia?.[m.id]?.image||'',externalUrl:m.url||'',
      first:m.parentId===null,next:outgoing[0]?.to||null,branch:outgoing[1]?.to||null};
  });
  window.LTDEMO = {title:tree.title,moments,edges:tree.edges,
    get:()=>context.momentId,
    select:id=>{if(moments.some(m=>m.id===id)){context.momentId=id;parent.postMessage({type:'lt-selection',id},location.origin)}}};
})();
