// 필요할 때 창 모듈을 불러오는 프록시.


export function createLazyPanel(ctx){
  // #1026 E 2단계(A-06): 창을 열 때만 쓰는 모듈은 그때 받는다. 지연 프록시는 첫 메서드 호출에 모듈을
  // 불러오고 factory를 한 번만 만든 뒤, 이후 호출은 곧바로 실제 객체로 넘긴다(동기 반환도 유지).
  function lazyPanel(load){
   let promise=null,inst=null;
   const init=()=>promise||(promise=Promise.resolve().then(load).then(x=>(inst=x,x)));
   return new Proxy({},{get(_,key){
    if(key==='__ready')return ()=>!!inst;
    return (...args)=>{if(inst)return inst[key](...args);return init().then(x=>x[key](...args));};
   }});
  }
  Object.defineProperties(ctx,{
    lazyPanel:{value:lazyPanel}
  });
  return {mount(){

  }};
}
