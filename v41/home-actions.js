const BOOK='track59-sketchbook.html', BOARD='track58-pinboard.html', SHELF='track32-bookshelf.html';
// Reuse 4.0's screen. Only translate its actions into the 4.1 shell's existing selection.
export function createHomeActions({getContext,send}) {
 const select=id=>{if(!getContext()?.tree.moments.some(m=>m.id===id))return false;send({type:'lt41-select',id});return true;};
 return {select,actions:{
  navigate:where=>send({type:'lt41-navigate',view:where==='trees'?SHELF:'src064-orbit.html'}),
  openBook:(_tree,id)=>{if(select(id))send({type:'lt41-navigate',view:BOOK});},
  openWorkspace:(_tree,id)=>{if(select(id))send({type:'lt41-navigate',view:BOARD});},
  requestMoment:mode=>{if(['new','add','edit'].includes(mode))send({type:'lt41-write',mode});}
 }};
}
