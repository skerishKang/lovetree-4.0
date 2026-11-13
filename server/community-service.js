import {randomUUID} from 'node:crypto';
import {ApiError} from './errors.js';
import {parsePrincipal} from './principal.js';
import {projectSharedTree} from './share-service.js';
import {coverModeOf} from '../src/domain.js';

export const REACTION_KINDS=Object.freeze(['heart','like','love','laugh','wow','sad','angry']);
const isReactionKind=value=>typeof value==='string'&&REACTION_KINDS.includes(value);

const SHARE_ID=/^[A-Za-z0-9_-]{20,64}$/;
const ITEM_ID=/^[A-Za-z0-9_-]{1,80}$/;
const IDEMPOTENCY=/^[A-Za-z0-9._:-]{8,128}$/;
const NO_STORE={'cache-control':'no-store, max-age=0',pragma:'no-cache','x-content-type-options':'nosniff'};
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function jsonBody(request){
 if(!String(request?.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))throw new ApiError(415,'unsupported_media_type','JSON 요청만 사용할 수 있어요.');
 try{return JSON.parse(typeof request.body==='string'?request.body:String(request.body||''));}
 catch{throw new ApiError(400,'invalid_json','요청 형식을 읽을 수 없어요.');}
}
function clientKey(request){const value=String(request?.headers?.['idempotency-key']||'');if(!IDEMPOTENCY.test(value))throw new ApiError(400,'idempotency_key_required','안전한 중복 방지 키가 필요해요.');return value;}
function publicComment(row,viewer,isAdmin=false){const mine=!!viewer&&row.subjectId===viewer;const edited=!!(row.editedAt||(row.updatedAt&&row.createdAt&&String(row.updatedAt)>String(row.createdAt)));return {id:row.id,body:row.body,createdAt:row.createdAt,updatedAt:row.updatedAt,edited,mine,canDelete:mine||isAdmin,canEdit:mine,authorLabel:mine?'나':'기록한 사람'};}

export function createCommunityService({communityRepo,shareRepo,workspaceRepo,visibilityRepo=null,productId,admin=null,now=()=>Date.now(),makeId=()=>randomUUID()}){
 const writes=new Map();
 function rate(subjectId,kind,limit=20){
  const key=subjectId+'\0'+kind,cut=now()-60_000,list=(writes.get(key)||[]).filter(at=>at>cut);
  if(list.length>=limit)throw new ApiError(429,'rate_limited','잠시 뒤 다시 시도해 주세요.');
  list.push(now());writes.set(key,list);
 }
 async function activeShare(shareId){
  if(!SHARE_ID.test(shareId))throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');
  const share=await shareRepo.load({productId,shareId});
  if(!share||share.status!=='active')throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');
  // #538: 비공개 트리는 댓글·반응·신고·차단 등 커뮤니티 경로에서도 서버가 막는다(없는 것과 같이).
  if(visibilityRepo){const visibility=(await visibilityRepo.get({productId,subjectId:share.subjectId,treeId:share.treeId})).visibility;if(visibility==='private')throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');}
  return share;
 }
 async function card(share,viewerSubjectId,statsOverride=null,lastActivityAt=null){
  const stored=await workspaceRepo.load({productId,subjectId:share.subjectId});
  if(!stored)return null;
  let projected;try{projected=projectSharedTree(stored.doc,share.treeId);}catch{return null;}
  if(!projected.tree.moments.length)return null;
  const tree=projected.tree,cover=tree.moments.find(moment=>moment.id===tree.coverMomentId)||tree.moments.find(moment=>moment.id===share.entryMomentId)||tree.moments[0];
  // #425 2번: 표지 주소는 '순간에서(moment)'일 때만 보낸다. 사진 표지는 공개 판정에서
  // 디자인/기본으로 바뀌고(projectSharedTree), 디자인·기본 표지에는 주소가 없다.
  const coverUrl=coverModeOf(tree)==='moment'?(cover?.url||''):'';
  const emotions=[...new Set(tree.moments.map(moment=>moment.emotion).filter(Boolean))];
  const stats=statsOverride||await communityRepo.stats({productId,shareId:share.shareId,viewerSubjectId});
  return {shareId:share.shareId,title:tree.title,subject:tree.subject,summary:clean(cover?.note,160),emotions,momentCount:tree.moments.length,entryMomentId:share.entryMomentId,view:share.view,cover:{title:cover?.title||tree.title,url:coverUrl,emotion:cover?.emotion||''},createdAt:share.createdAt,lastActivityAt:lastActivityAt||share.createdAt,stats};
 }
 return {
  async discover({query='',emotion='',cursor='',limit=12,viewerSubjectId=null}={}){
   const q=clean(query,80).toLocaleLowerCase('ko-KR'),tag=clean(emotion,12),size=Math.max(1,Math.min(24,Number(limit)||12));
   let entries;
   if(typeof communityRepo.listDiscoverableSummaries==='function'){
    const summaries=await communityRepo.listDiscoverableSummaries({productId,viewerSubjectId,limit:240});
    entries=await Promise.all(summaries.map(async summary=>{
     const item=await card(summary.share,viewerSubjectId,summary.stats,summary.lastActivityAt);
     return item;
    }));
   }else{
    const shares=await communityRepo.listDiscoverable({productId,viewerSubjectId,limit:240});
    entries=await Promise.all(shares.map(share=>card(share,viewerSubjectId)));
   }
   const cards=[];
   for(const item of entries){if(!item)continue;const haystack=(item.title+' '+item.subject+' '+item.summary).toLocaleLowerCase('ko-KR');if(q&&!haystack.includes(q))continue;if(tag&&!item.emotions.includes(tag))continue;cards.push(item);}
   const start=cursor?Math.max(0,cards.findIndex(item=>item.shareId===cursor)+1):0,items=cards.slice(start,start+size),next=start+size<cards.length?items.at(-1)?.shareId||null:null;
   return {items,nextCursor:next,totalVisible:cards.length};
  },
  async favorite(subjectId,shareId,enabled){await activeShare(shareId);rate(subjectId,'favorite',40);await communityRepo.setFavorite({productId,shareId,subjectId,enabled});return communityRepo.stats({productId,shareId,viewerSubjectId:subjectId});},
  async favorites(subjectId){return communityRepo.listFavorites({productId,subjectId});},
  async react(subjectId,shareId,enabled,kind='heart'){
   if(!isReactionKind(kind))throw new ApiError(400,'reaction_kind_invalid','지원하지 않는 반응이에요.');
   const share=await activeShare(shareId);rate(subjectId,'reaction',40);
   if(communityRepo?.isBlocked){
    const blocked=await communityRepo.isBlocked({productId,blockerSubjectId:subjectId,blockedSubjectId:share.subjectId});
    if(blocked)throw new ApiError(403,'reaction_blocked','차단한 기록에는 반응할 수 없어요.');
   }
   await communityRepo.setReaction({productId,shareId,subjectId,kind,enabled});return communityRepo.stats({productId,shareId,viewerSubjectId:subjectId});},
  async comments(shareId,viewerSubjectId){await activeShare(shareId);const isAdmin=!!viewerSubjectId&&!!admin&&await admin.roleFor({productId,subjectId:viewerSubjectId})==='admin';return (await communityRepo.listComments({productId,shareId,limit:50})).map(row=>publicComment(row,viewerSubjectId,isAdmin));},
  async comment(subjectId,shareId,body,key){const share=await activeShare(shareId);rate(subjectId,'comment',12);if(communityRepo?.isBlocked){const blocked=await communityRepo.isBlocked({productId,blockerSubjectId:subjectId,blockedSubjectId:share.subjectId});if(blocked)throw new ApiError(403,'comment_blocked','차단한 기록에는 댓글을 남길 수 없어요.');}const text=clean(body,1000);if(!text)throw new ApiError(400,'comment_empty','댓글을 입력해 주세요.');const row=await communityRepo.createComment({productId,commentId:makeId(),shareId,subjectId,body:text,clientKey:key});return publicComment(row,subjectId);},
  async updateComment(subjectId,commentId,body){if(!ITEM_ID.test(commentId))throw new ApiError(404,'comment_not_found','댓글을 찾을 수 없어요.');rate(subjectId,'comment',12);const text=clean(body,1000);if(!text)throw new ApiError(400,'comment_empty','댓글을 입력해 주세요.');const current=await communityRepo.getComment?.({productId,commentId});if(!current||current.status!=='visible')throw new ApiError(404,'comment_not_found','댓글을 찾을 수 없어요.');if(current.subjectId!==subjectId)throw new ApiError(403,'comment_forbidden','이 댓글을 수정할 수 없어요.');const share=await shareRepo.load({productId,shareId:current.shareId});if(!share||share.status!=='active')throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');if(communityRepo?.isBlocked){const blocked=await communityRepo.isBlocked({productId,blockerSubjectId:subjectId,blockedSubjectId:share.subjectId});if(blocked)throw new ApiError(403,'comment_blocked','차단한 기록에는 댓글을 남길 수 없어요.');}const row=await communityRepo.updateComment({productId,commentId,subjectId,body:text});if(!row)throw new ApiError(403,'comment_forbidden','이 댓글을 수정할 수 없어요.');return publicComment(row,subjectId);},
  async deleteComment(subjectId,commentId){if(!ITEM_ID.test(commentId))throw new ApiError(404,'comment_not_found','댓글을 찾을 수 없어요.');const principal={productId,subjectId};const isAdmin=!!admin&&await admin.roleFor(principal)==='admin';const row=await communityRepo.deleteComment({productId,commentId,subjectId,admin:isAdmin});if(!row)throw new ApiError(403,'comment_forbidden','이 댓글을 지울 수 없어요.');return {deleted:true};},
  async report(subjectId,shareId,reason,key){await activeShare(shareId);rate(subjectId,'report',6);const text=clean(reason,500);if(!text)throw new ApiError(400,'report_reason_required','신고 이유를 입력해 주세요.');const row=await communityRepo.createReport({productId,reportId:makeId(),shareId,subjectId,reason:text,clientKey:key});return {id:row.id,status:row.status,createdAt:row.createdAt};},
  async block(subjectId,shareId){const share=await activeShare(shareId);if(share.subjectId===subjectId)throw new ApiError(400,'cannot_block_self','내 공개 트리는 차단할 수 없어요.');await communityRepo.blockOwner({productId,blockerSubjectId:subjectId,blockedSubjectId:share.subjectId});return {blocked:true};},
  async reports(principal){if(!admin||await admin.roleFor(principal)!=='admin')throw new ApiError(403,'admin_forbidden','관리자 권한이 필요해요.');return communityRepo.listReports({productId,limit:100});},
  async moderate(principal,reportId,{status,visibility}){if(!admin||await admin.roleFor(principal)!=='admin')throw new ApiError(403,'admin_forbidden','관리자 권한이 필요해요.');if(!['resolved','dismissed'].includes(status))throw new ApiError(400,'moderation_status_invalid','처리 상태를 확인해 주세요.');if(!['hidden','visible'].includes(visibility))throw new ApiError(400,'moderation_visibility_invalid','공개 상태를 확인해 주세요.');const row=await communityRepo.moderateReport({productId,reportId,status,visibility,actorSubjectId:principal.subjectId});if(!row)throw new ApiError(404,'report_not_found','신고를 찾을 수 없어요.');return {id:row.id,status:row.status,hidden:row.hidden,resolvedAt:row.resolvedAt};}
 };
}

export function createCommunityHandler({authenticate,service,productId}){
 async function principal(request,required=true){
  try{return parsePrincipal(await authenticate(request),productId);}
  catch(error){if(!required&&error instanceof ApiError&&error.status===401)return null;if(error instanceof ApiError)throw error;throw new ApiError(503,'auth_unavailable','로그인 연결에 문제가 생겼어요.');}
 }
 async function handle(request){
  const path=String(request?.path||''),method=request?.method||'GET',query=request?.query||new URLSearchParams();
  if(path==='/api/community/shares'&&method==='GET'){const who=await principal(request,false);return {status:200,body:await service.discover({query:query.get('q')||'',emotion:query.get('emotion')||'',cursor:query.get('cursor')||'',limit:query.get('limit')||12,viewerSubjectId:who?.subjectId||null}),headers:NO_STORE};}
  if(path==='/api/community/me/favorites'&&method==='GET'){const who=await principal(request);return {status:200,body:{shareIds:await service.favorites(who.subjectId)},headers:NO_STORE};}
  if(path==='/api/community/admin/reports'&&method==='GET'){const who=await principal(request);return {status:200,body:{reports:await service.reports(who)},headers:NO_STORE};}
  const moderate=path.match(/^\/api\/community\/admin\/reports\/([^/]+)$/);
  if(moderate&&method==='PATCH'){const who=await principal(request),body=jsonBody(request);return {status:200,body:{report:await service.moderate(who,moderate[1],body)},headers:NO_STORE};}
  const comments=path.match(/^\/api\/community\/shares\/([^/]+)\/comments$/);
  if(comments){if(method==='GET'){const who=await principal(request,false);return {status:200,body:{comments:await service.comments(comments[1],who?.subjectId||null)},headers:NO_STORE};}if(method==='POST'){const who=await principal(request),body=jsonBody(request);return {status:201,body:{comment:await service.comment(who.subjectId,comments[1],body.body,clientKey(request))},headers:NO_STORE};}}
  const commentItem=path.match(/^\/api\/community\/comments\/([^/]+)$/);
  if(commentItem&&method==='DELETE'){const who=await principal(request);return {status:200,body:await service.deleteComment(who.subjectId,commentItem[1]),headers:NO_STORE};}
  if(commentItem&&method==='PATCH'){const who=await principal(request),body=jsonBody(request);return {status:200,body:{comment:await service.updateComment(who.subjectId,commentItem[1],body.body)},headers:NO_STORE};}
  const action=path.match(/^\/api\/community\/shares\/([^/]+)\/(favorite|reaction|report|block)$/);
  if(action){const who=await principal(request),[,shareId,kind]=action;if(kind==='favorite'&&(method==='PUT'||method==='DELETE'))return {status:200,body:{stats:await service.favorite(who.subjectId,shareId,method==='PUT')},headers:NO_STORE};if(kind==='reaction'&&(method==='PUT'||method==='DELETE')){let reactionKind='heart';if(method==='PUT'){try{const body=jsonBody(request);reactionKind=(body&&typeof body==='object'&&typeof body.kind==='string'&&body.kind.trim()!==''?body.kind.trim():'heart');}catch{reactionKind='heart';}}else{const q=String(request?.query?.get?.('kind')||'').trim();reactionKind=q||'heart';}return {status:200,body:{stats:await service.react(who.subjectId,shareId,method==='PUT',reactionKind)},headers:NO_STORE};}if(kind==='report'&&method==='POST'){const body=jsonBody(request);return {status:201,body:{report:await service.report(who.subjectId,shareId,body.reason,clientKey(request))},headers:NO_STORE};}if(kind==='block'&&method==='POST')return {status:200,body:await service.block(who.subjectId,shareId),headers:NO_STORE};}
  throw new ApiError(404,'not_found','요청을 찾을 수 없어요.');
 }
 return async request=>{try{return await handle(request);}catch(error){if(error instanceof ApiError)return {status:error.status,body:{error:{code:error.code,message:error.message,...(error.details||{})}},headers:NO_STORE};console.error('[lovetree-community] request failed',{path:request?.path,method:request?.method});return {status:500,body:{error:{code:'internal_error',message:'서버에서 처리하지 못했어요.'}},headers:NO_STORE};}};
}
