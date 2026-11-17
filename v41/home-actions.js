const BOOK='track59-sketchbook.html', BOARD='track58-pinboard.html', SHELF='track32-bookshelf.html';
// Reuse 4.0's screen. Only translate its actions into the 4.1 shell's existing selection.
export function createHomeActions({getContext,send,gallery=false}) {
 const select=id=>{if(gallery&&getContext()?.source!=='example')return false;if(!getContext()?.tree?.moments.some(m=>m.id===id))return false;send({type:'lt41-select',id});return true;};
  // 카드의 treeId 는 합성 래퍼('home-cards')일 수 있으니 셸 트리에서 실제 트리를 다시 찾는다.
  const ownTree=(treeId,id)=>{const trees=getContext()?.trees;if(!Array.isArray(trees))return null;return (treeId?trees.find(t=>t.id===treeId&&t.moments?.some(m=>m.id===id)):null)||trees.find(t=>t.moments?.some(m=>m.id===id))||null;};
 return {select,actions:{
  start:()=>send({type:'lt41-start'}),
   account:()=>send({type:'lt41-account'}),
   community:()=>send({type:'lt41-community'}),
   // 261117 고객 의견: 첫 화면 둘째 줄 '모아둔 순간 N개 정리하기' — 모아둔 순간 정리 창을 연다(순간 옮기기 picker와 별개).
   cleanup:()=>send({type:'lt41-cleanup'}),
  navigate:where=>send({type:'lt41-navigate',view:where==='trees'?SHELF:'src064-orbit.html'}),
  openMine:(treeId,id)=>{const tree=ownTree(treeId,id);if(!tree)return;send({type:'lt41-open-book',treeId:tree.id,id});},
  openBook:(treeId,id)=>{const tree=ownTree(treeId,id);if(gallery&&tree){send({type:'lt41-open-book',treeId:tree.id,id});return;}if(gallery&&getContext()?.source!=='example'){send({type:'lt41-example',view:BOOK,momentId:id});return;}if(select(id))send({type:'lt41-navigate',view:BOOK});},
  openWorkspace:(_tree,id)=>{if(gallery&&getContext()?.source!=='example'){send({type:'lt41-example',view:BOARD,momentId:id});return;}if(select(id))send({type:'lt41-navigate',view:BOARD});},
  requestMoment:mode=>{if(['new','add','edit'].includes(mode))send({type:'lt41-write',mode});},
  // 순간 목록에서의 옮기기(2026-11-17, 대표 결정): 골라 온 순간들을 한 트리로 옮긴다 — 기존 moveMoment 저장 길 그대로.
  // pairs는 되돌리기용 출발 트리 기록({id, fromTreeId}); 없으면 셸이 각 순간의 트리를 직접 찾는다.
  moveMoments:payload=>send({type:'lt41-move-moments',
    momentIds:Array.isArray(payload?.momentIds)?payload.momentIds.map(id=>String(id||'')).filter(Boolean):[],
    pairs:Array.isArray(payload?.pairs)?payload.pairs.map(p=>({id:String(p?.id||''),fromTreeId:String(p?.fromTreeId||''),toTreeId:String(p?.toTreeId||'')})).filter(p=>p.id&&p.fromTreeId):null,
    fromTreeId:String(payload?.fromTreeId||''),toTreeId:String(payload?.toTreeId||''),
    targetLabel:String(payload?.targetLabel||''),noticeText:String(payload?.noticeText||'')}),
  // 트리 칩 순서: 계정 설정 칸(state.prefs.treeChipOrder)에 저장한다 — 기존 setPrefs 길(새 저장 경로 없음).
  saveTreeChipOrder:order=>send({type:'lt41-prefs',patch:{treeChipOrder:Array.isArray(order)?order.map(id=>String(id||'')).filter(Boolean):[]}})
 }};
}
