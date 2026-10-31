const BOOK='track59-sketchbook.html', BOARD='track58-pinboard.html', SHELF='track32-bookshelf.html';
// Reuse 4.0's screen. Only translate its actions into the 4.1 shell's existing selection.
export function createHomeActions({getContext,send,gallery=false}) {
 const select=id=>{if(gallery&&getContext()?.source!=='example')return false;if(!getContext()?.tree?.moments.some(m=>m.id===id))return false;send({type:'lt41-select',id});return true;};
 return {select,actions:{
  resume:()=>{const c=getContext();if(c?.source!=='example'&&c?.tree?.moments.some(m=>m.id===c.momentId))send({type:'lt41-navigate',view:BOOK});},
  account:()=>send({type:'lt41-account'}),
  navigate:where=>send({type:'lt41-navigate',view:where==='trees'?SHELF:'src064-orbit.html'}),
  openBook:(_tree,id)=>{if(gallery&&getContext()?.source!=='example'){send({type:'lt41-example',view:BOOK,momentId:id});return;}if(select(id))send({type:'lt41-navigate',view:BOOK});},
  openWorkspace:(_tree,id)=>{if(select(id))send({type:'lt41-navigate',view:BOARD});},
  requestMoment:mode=>{if(['new','add','edit'].includes(mode))send({type:'lt41-write',mode});}
 }};
}
