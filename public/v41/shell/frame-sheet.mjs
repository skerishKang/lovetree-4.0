// 프레임 안의 겹과 무대 상태 감시.


export function createFrameSheet(ctx){
  let sheetObservers;
  let syncCurrentSheet=()=>{};
  function watchFrameSheet(frame){
    const d=frame.contentDocument;if(!d)return;
    const old=sheetObservers.get(frame);if(old){old.disconnect();sheetObservers.delete(frame);}
    const roots=new WeakSet(),layers=new WeakSet();
    const observer=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)observeTree(node);
      sync();
    });
    const observeTree=root=>{
      if(!root||![1,9,11].includes(root.nodeType))return;
      if(root.nodeType===9||root.nodeType===11){
        if(!roots.has(root)){roots.add(root);observer.observe(root,{childList:true,subtree:true});}
      }
      const nodes=[...(root.nodeType===1?[root]:[]),...root.querySelectorAll('*')];
      for(const el of nodes){
        if((el.matches('.detail,#detailSide')||el.tagName==='DIALOG')&&!layers.has(el)){
          layers.add(el);observer.observe(el,{attributes:true,attributeFilter:el.tagName==='DIALOG'?['open']:['class','hidden']});
        }
        if(el.shadowRoot)observeTree(el.shadowRoot);
      }
    };
    const hasOpenLayer=root=>{
      if(root.querySelector('dialog[open],.detail.open,#detailSide:not([hidden])'))return true;
      for(const el of root.querySelectorAll('*'))if(el.shadowRoot&&hasOpenLayer(el.shadowRoot))return true;
      return false;
    };
    const hasOpenDialog=root=>{
      if(root.querySelector('dialog[open]'))return true;
      for(const el of root.querySelectorAll('*'))if(el.shadowRoot&&hasOpenDialog(el.shadowRoot))return true;
      return false;
    };
    // 지금 보이는 장(#view)의 창 상태만 반영한다 — 옛 장이 about:blank로 바뀌어도 상태가 흔들리지 않는다.
    const sync=()=>{const cur=[...document.querySelectorAll('iframe')].find(f=>f.id==='view');
      const doc=cur&&cur.contentDocument;
      const dialogOpen=!!doc&&hasOpenDialog(doc);
      document.body.classList.toggle('lt-sheet-open',!!doc&&hasOpenLayer(doc));
      document.body.classList.toggle('lt-frame-dialog-open',dialogOpen);
      document.body.classList.toggle('lt-book-lightbox-open',!!doc&&!!doc.querySelector('.lt-lightbox'));};
    observeTree(d);
    syncCurrentSheet=sync;
    sheetObservers.set(frame,observer);
    sync();
  }
  Object.defineProperties(ctx,{
    watchFrameSheet:{value:watchFrameSheet},
    syncFrameSheet:{value:()=>syncCurrentSheet()}
  });
  return {mount(){
    // 화면 안의 상세 판과 순간 목록 같은 창을 셸이 알아채 body.lt-sheet-open에 옮긴다 —
    // 아래 고정 요소는 창이 열려 있는 동안 숨고 닫으면 돌아온다(shell.css).
    sheetObservers=new Map();
  }};
}
