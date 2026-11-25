// 예시 기록의 지연 불러오기.
import { withPreviewExamples } from '../preview-examples.mjs';


export function createExampleLoader(ctx){
  let exampleTree, examplePromise, exampleInitializing;
  function loadExampleTree(){if(!examplePromise)examplePromise=import('../example.mjs').then(mod=>{exampleTree=withPreviewExamples(mod.exampleTree,globalThis.location?.hostname,globalThis.location?.search);return exampleTree});return examplePromise;}
  Object.defineProperties(ctx,{
    exampleTree:{get:()=>exampleTree,set:value=>{exampleTree=value;}},
    exampleInitializing:{get:()=>exampleInitializing,set:value=>{exampleInitializing=value;}},
    loadExampleTree:{value:loadExampleTree}
  });
  return {mount(){
    // #1026 E: 예시 데이터(1MB)는 정적으로 부르지 않는다 — 로그인 사용자의 화면 로딩을 막지 않게
    // 예시가 실제로 필요한 순간에만 동적으로 부른다(로그아웃 첫 화면, 예시 카드 열기, 예시 둘러보기).
    exampleTree=null,examplePromise=null,exampleInitializing=false;
  }};
}
