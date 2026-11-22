(() => {
  const context = parent.LT41;
  if (!context?.tree) throw new Error('트리를 먼저 선택하세요.');
  const tree = context.tree;
  // 예시 기록은 셸이 만들어 둔 demoData를 그대로 쓰고(design/shared.js와 같은 모양), 실제 기록은 서버 트리에서 만든다.
  const demo = tree.demoData;
  // #1001 (3): 순간 변환을 한 함수로 — 처음 그림과 모델 전용 갱신(refresh)이 같은 모양을 쓴다.
  function projectMoments(tree, context) {
    const demo = tree.demoData;
    return demo ? demo.moments.map(m => ({...m})) : tree.moments.map(m => {
    const media=window.LTMedia?.describe(m.url||'');
    const outgoing = tree.edges.filter(e => e.kind === 'parent' && e.from === m.id);
    return {id:m.id,title:m.title,date:m.date,emotion:m.emotion,memo:m.note,mediaMetadata:m.mediaMetadata||null,startSeconds:m.startSeconds,endSeconds:m.endSeconds,
      whyNext:outgoing.map(e=>e.reason).filter(Boolean).join(' / '),
      kind:context.exampleMedia?.[m.id]?.type||(media?.kind==='photo'?'photo':media?.kind==='video'||media?.kind==='youtube'?'video':m.url?'link':'memo'),
      type:context.exampleMedia?.[m.id]?.type||(media?.kind==='photo'?'photo':media?.kind==='video'||media?.kind==='youtube'?'video':m.url?'link':'memo'),source:context.exampleMedia?'예시 이미지':media?.openUrl?new URL(media.openUrl).hostname:'불러온 기록',image:context.exampleMedia?.[m.id]?.image||'',externalUrl:m.url||'',
      first:m.parentId===null,next:outgoing[0]?.to||null,branch:outgoing[1]?.to||null,
      parentId:m.parentId,relation:m.relation||'',startSeconds:m.startSeconds,endSeconds:m.endSeconds,
      x:m.x,y:m.y,rot:m.rot,pinStyle:m.pinStyle,cardStyle:m.cardStyle,color:m.color,keywords:m.keywords||[],createdAt:m.createdAt};
    });
  }
  const moments = projectMoments(tree, context);
  if(context.source==='server')addEventListener('DOMContentLoaded',()=>{for(const label of document.querySelectorAll('#detail .section .label'))if(label.textContent==='감상 예시'){label.textContent='내 기록';label.nextElementSibling.textContent='상단에서 수정·연결을 관리할 수 있어요.';}});
  if(typeof document!=='undefined')addEventListener('DOMContentLoaded',()=>{
    /* #951 ⑤: 지도 상세 판은 화면(network.js)이 사진·영상을 스스로 그린다(#detailPlayer) — 여기서 또 넣으면 두 번 보인다. */
    const detail=document.querySelector('#detailPlayer')?null:document.querySelector('#detailNote');
    if(detail&&window.LTMedia){const host=document.createElement('div');detail.parentElement.after(host);let last=null;
      const update=()=>{const id=context.momentId;if(id===last)return;last=id;const m=tree.moments.find(m=>m.id===id);host.innerHTML=m?.url?window.LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id,null,{emotion:m.emotion,date:m.date,note:m.note,treeId:tree.id,startSeconds:m.startSeconds,endSeconds:m.endSeconds}):'';
        // #327 2부: 내 기록(서버)의 순간 상세에서 다른 트리로 옮기기. 공유·예시는 숨긴다.
        if(m&&context.source==='server'){const button=document.createElement('button');button.type='button';button.className='lt-move-btn';button.textContent='다른 트리로 옮기기';button.addEventListener('click',()=>parent.postMessage({type:'lt41-move',momentId:m.id},location.origin));host.append(button);}};
      new MutationObserver(update).observe(document.getElementById('detailTitle'),{childList:true,subtree:true});update();
    }
  });
  // #315: 읽기 전용 판정은 여기 한 곳. 셸이 iframe에 넘기는 LT41.source에 이미 'share'가 있으므로
  // 그걸 그대로 판정한다(공유 감상은 쓰기·편집 UI를 렌더하지 않는다).
  // #464(2026-11-13): 예시(demoData)도 읽기 전용이다 — 고칠 수 없는 화면이다. 예전에는 source==='share'만
  // 보아 예시 책에 "이 순간에 남기고 싶은 마음을 적어 보세요…"와 "✎ 고치기"가 보였다(CTO 지적).
  const readOnly = context.source === 'share' || context.source === 'example' || !!demo;
  window.LTDEMO = {title:tree.title,treeId:tree.id,source:context.source,writable:context.source==='server'&&!!context.writable,moments,edges:tree.edges,example:!!demo,readOnly,prefs:context.prefs||{titleDisplay:'both'},
    get:()=>context.momentId,
    select:id=>{if(moments.some(m=>m.id===id)){context.momentId=id;parent.postMessage({type:'lt-selection',id},location.origin)}},
    // #1001 (3): 셸이 모델만 갱신한 뒤(lt41-moments-saved) 화면이 부모 LT41.tree에서 순간·연결을 다시 읽는다.
    // moments 배열은 제자리에서 바꿔, 이미 이 배열을 든 화면(book.js SPREADS 재구축 등)이 같은 참조로 새 값을 본다.
    refresh:()=>{const fresh=parent.LT41?.tree;if(!fresh||fresh.id!==tree.id)return false;const next=projectMoments(fresh,context);moments.length=0;for(const m of next)moments.push(m);window.LTDEMO.edges=fresh.edges;window.LTDEMO.title=fresh.title;window.LTDEMO.writable=parent.LT41?.source==='server'&&!!parent.LT41.writable;window.LTDEMO.prefs=parent.LT41?.prefs||{titleDisplay:'both'};return true;}};
})();
