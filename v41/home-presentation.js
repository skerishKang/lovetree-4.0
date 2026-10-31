// The landing artwork is always the original gallery, never a member's document.
export function homePresentation(context) {
 return {trees:[],context:{treeId:null,momentId:null,readOnly:true},
  accountLabel:context?.source==='server'?'내 계정':'로그인',
  canResume:context?.source!=='example'&&!!context?.tree?.moments.some(m=>m.id===context.momentId)};
}
