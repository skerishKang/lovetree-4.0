const BOOK='track59-sketchbook.html', BOARD='track58-pinboard.html', SHELF='track32-bookshelf.html';
// Reuse 4.0's screen. Only translate its actions into the 4.1 shell's existing selection.
export function createHomeActions({getContext,send,gallery=false}) {
 const select=id=>{if(gallery&&getContext()?.source!=='example')return false;if(!getContext()?.tree?.moments.some(m=>m.id===id))return false;send({type:'lt41-select',id});return true;};
  // 카드의 treeId 는 합성 래퍼('home-cards')일 수 있으니 셸 트리에서 실제 트리를 다시 찾는다.
  const ownTree=(treeId,id)=>{const trees=getContext()?.trees;if(!Array.isArray(trees))return null;return (treeId?trees.find(t=>t.id===treeId&&t.moments?.some(m=>m.id===id)):null)||trees.find(t=>t.moments?.some(m=>m.id===id))||null;};
 return {select,actions:{
  resume:()=>{const c=getContext();if(c?.source!=='example'&&c?.tree?.moments.some(m=>m.id===c.momentId))send({type:'lt41-navigate',view:BOOK});},
  start:()=>send({type:'lt41-start'}),
   account:()=>send({type:'lt41-account'}),
   community:()=>send({type:'lt41-community'}),
   // #380: 정리 화면 열기(홈 둘째 줄 '정리하기').
   cleanup:()=>send({type:'lt41-move'}),
  navigate:where=>send({type:'lt41-navigate',view:where==='trees'?SHELF:'src064-orbit.html'}),
  openMine:(treeId,id)=>{const tree=ownTree(treeId,id);if(!tree)return;send({type:'lt41-open-book',treeId:tree.id,id});},
  openBook:(treeId,id)=>{const tree=ownTree(treeId,id);if(gallery&&tree){send({type:'lt41-open-book',treeId:tree.id,id});return;}if(gallery&&getContext()?.source!=='example'){send({type:'lt41-example',view:BOOK,momentId:id});return;}if(select(id))send({type:'lt41-navigate',view:BOOK});},
  openWorkspace:(_tree,id)=>{if(gallery&&getContext()?.source!=='example'){send({type:'lt41-example',view:BOARD,momentId:id});return;}if(select(id))send({type:'lt41-navigate',view:BOARD});},
  requestMoment:mode=>{if(['new','add','edit'].includes(mode))send({type:'lt41-write',mode});}
 }};
}
