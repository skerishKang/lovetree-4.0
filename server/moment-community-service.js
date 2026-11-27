import {randomUUID} from 'node:crypto';
import {ApiError} from './errors.js';
import {parsePrincipal} from './principal.js';
import {projectSharedTree} from './share-service.js';
import {projectPublicMomentStats} from './public-projection.js';
import {createRateLimiter} from './rate-limit.js';
import {isAiTesterRole} from './admin-roles.js';

// #1098 2단계 — 순간 단위 ♡·댓글 서버 규칙(러브버드 규칙 — 코드는 옮기지 않고 규칙만 가져왔다).
// · 트리와 그 순간이 둘 다 공개일 때만 남이 쓸 수 있다. 4.1에는 순간 단위 공개 값이 없으므로
//   '순간 공개'는 공개 트리의 공개 사본(projectSharedTree)에 그 순간이 남아 있는 것으로 판정한다 —
//   트리가 비공개·공유 취소·숨김이면 없는 것과 같이 막고, 순간이 트리에서 사라지거나 다른 트리로
//   옮겨졌어도 같은 404로 막는다(있는 것과 같이 — 공개 경로 규칙 #538과 같은 모양).
// · 같은 요청 두 번 막기: 댓글·신고는 idempotency 키(기존 client_key 길), 반응은 표 PK가 하나만 남긴다.
// · 쓰기 기록: 운영 조치(숨기기·처리)는 기존 moderation_audit 길로 남는다(새 감사 경로를 만들지 않는다).
// · 쓰기 횟수 제한: 공용 한 벌(server/rate-limit.js, #1073 B-19) — 커뮤니티 창구와 같은 1분 창을 쓴다.
// · 순간 반응 종류는 ♡(heart) 하나다.
// · 신고·숨기기는 순간 댓글도 트리와 같은 운영센터 길(같은 신고 표·관리자 경로)로 간다.
// · 공개 숫자에서 시험 계정(tester) 것은 빼고, AI 명예회원(ai_customer) 것은 aiHearts·aiTester 비트로 구분한다.
const SHARE_ID=/^[A-Za-z0-9_-]{20,64}$/;
const ITEM_ID=/^[A-Za-z0-9_-]{1,80}$/;
const IDEMPOTENCY=/^[A-Za-z0-9._:-]{8,128}$/;
const NO_STORE={'cache-control':'no-store, max-age=0',pragma:'no-cache','x-content-type-options':'nosniff'};
// 한 번에 내려주는 순간 댓글 상한 — 트리 댓글 목록과 같은 50. 요청 파라미터로 늘리지 않는다.
const MOMENT_COMMENT_LIMIT=50;
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function jsonBody(request){
 if(!String(request?.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))throw new ApiError(415,'unsupported_media_type','JSON 요청만 사용할 수 있어요.');
 try{return JSON.parse(typeof request.body==='string'?request.body:String(request.body||''));}
 catch{throw new ApiError(400,'invalid_json','요청 형식을 읽을 수 없어요.');}
}
function clientKey(request){const value=String(request?.headers?.['idempotency-key']||'');if(!IDEMPOTENCY.test(value))throw new ApiError(400,'idempotency_key_required','안전한 중복 방지 키가 필요해요.');return value;}
function publicComment(row,viewer,isAiAuthor=false,isAdmin=false){
 const mine=!!viewer&&row.subjectId===viewer;
 const edited=!!(row.editedAt||(row.updatedAt&&row.createdAt&&String(row.updatedAt)>String(row.createdAt)));
 return {id:row.id,body:row.body,createdAt:row.createdAt,updatedAt:row.updatedAt,edited,mine,canDelete:mine||isAdmin,canEdit:mine,authorLabel:mine?'나':'기록한 사람',...(isAiAuthor?{aiTester:true}:{})};
}

export function createMomentCommunityService({communityRepo,shareRepo,workspaceRepo,visibilityRepo=null,productId,admin=null,now=()=>Date.now(),makeId=()=>randomUUID()}){
 // 속도 제한은 공용 한 벌(server/rate-limit.js)로 — 커뮤니티 창구는 1분 창을 쓴다(#1073 B-19).
 const limiter=createRateLimiter({now});
 const rate=(subjectId,kind,limit=20)=>limiter.rate(subjectId+'\0'+kind,limit);
 async function activeShare(shareId){
  if(!SHARE_ID.test(shareId))throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');
  const share=await shareRepo.load({productId,shareId});
  if(!share||share.status!=='active')throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');
  // #538: 비공개 트리는 커뮤니티 경로에서 없는 것과 같이 막는다 — 순간 쓰기도 같은 규칙(러브버드 규칙의 '트리가 공개').
  if(visibilityRepo){const visibility=(await visibilityRepo.get({productId,subjectId:share.subjectId,treeId:share.treeId})).visibility;if(visibility==='private')throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');}
  return share;
 }
 // '순간이 공개' 판정 — 공개 트리의 공개 사본에 그 순간이 남아 있는지. 트리 단위 공개 검사(activeShare)를 함께 통과해야 한다.
 async function publicMoment(shareId,momentId){
  const share=await activeShare(shareId);
  if(!ITEM_ID.test(momentId||''))throw new ApiError(404,'moment_not_found','공개 순간을 찾을 수 없어요.');
  const stored=await workspaceRepo.load({productId,subjectId:share.subjectId});
  if(!stored)throw new ApiError(404,'moment_not_found','공개 순간을 찾을 수 없어요.');
  let tree;
  try{tree=projectSharedTree(stored.doc,share.treeId).tree;}
  catch{throw new ApiError(404,'moment_not_found','공개 순간을 찾을 수 없어요.');}
  const moment=tree.moments.find(item=>item.id===momentId);
  if(!moment)throw new ApiError(404,'moment_not_found','공개 순간을 찾을 수 없어요.');
  return {share,moment};
 }
 async function roleOf(subjectId){
  if(!admin)return null;
  try{return await admin.roleFor({productId,subjectId});}catch{return null;}
 }
 async function assertNotBlocked(subjectId,ownerSubjectId,code,message){
  if(communityRepo?.isBlocked){
   const blocked=await communityRepo.isBlocked({productId,blockerSubjectId:subjectId,blockedSubjectId:ownerSubjectId});
   if(blocked)throw new ApiError(403,code,message);
  }
 }
 return {
  // 순간 ♡·댓글 공개 숫자(읽기) — 시험 계정 몫은 빠져 있고, AI 명예회원 몫은 aiHearts로 구분된다.
  async stats({viewerSubjectId=null,shareId,momentId}){
   await publicMoment(shareId,momentId);
   return projectPublicMomentStats(await communityRepo.momentStats({productId,shareId,momentId,viewerSubjectId}));
  },
  async react(subjectId,shareId,momentId,enabled,kind='heart'){
   // 순간 반응 종류는 ♡ 하나 — 다른 종은 트리 반응(7종)과 달리 받지 않는다.
   if(kind!=='heart')throw new ApiError(400,'reaction_kind_invalid','순간 반응은 공감(♡)만 남길 수 있어요.');
   const {share}=await publicMoment(shareId,momentId);
   rate(subjectId,'moment-reaction',40);
   await assertNotBlocked(subjectId,share.subjectId,'reaction_blocked','차단한 기록의 순간에는 반응할 수 없어요.');
   await communityRepo.setMomentReaction({productId,shareId,momentId,subjectId,enabled,kind:'heart'});
   return projectPublicMomentStats(await communityRepo.momentStats({productId,shareId,momentId,viewerSubjectId:subjectId}));
  },
  async comments(shareId,momentId,viewerSubjectId){
   await publicMoment(shareId,momentId);
   const isAdmin=!!viewerSubjectId&&await roleOf(viewerSubjectId)==='admin';
   const rows=await communityRepo.listMomentComments({productId,shareId,momentId,limit:MOMENT_COMMENT_LIMIT});
   return rows.map(row=>publicComment(row,viewerSubjectId,row.aiTester===true,isAdmin));
  },
  async comment(subjectId,shareId,momentId,body,key){
   const {share}=await publicMoment(shareId,momentId);
   rate(subjectId,'moment-comment',12);
   await assertNotBlocked(subjectId,share.subjectId,'comment_blocked','차단한 기록의 순간에는 댓글을 남길 수 없어요.');
   const text=clean(body,1000);
   if(!text)throw new ApiError(400,'comment_empty','댓글을 입력해 주세요.');
   const row=await communityRepo.createMomentComment({productId,commentId:makeId(),shareId,momentId,subjectId,body:text,clientKey:key});
   return publicComment(row,subjectId,isAiTesterRole(await roleOf(subjectId)));
  },
  // 순간 댓글 신고 — 트리 신고와 같은 신고 표(client_key 중복 방지 포함)로 들어가고,
  // 어떤 댓글인지 comment_id 로 붙는다. 운영센터는 기존 관리자 경로(신고 목록·처리)로 처리한다.
  async reportComment(subjectId,shareId,momentId,commentId,reason,key){
   const {share}=await publicMoment(shareId,momentId);
   rate(subjectId,'moment-report',6);
   if(!ITEM_ID.test(commentId||''))throw new ApiError(404,'comment_not_found','댓글을 찾을 수 없어요.');
   const text=clean(reason,500);
   if(!text)throw new ApiError(400,'report_reason_required','신고 이유를 입력해 주세요.');
   const target=await communityRepo.getComment?.({productId,commentId});
   if(!target||target.status!=='visible'||target.shareId!==shareId||target.momentId!==momentId||target.targetKind!=='moment')throw new ApiError(404,'comment_not_found','댓글을 찾을 수 없어요.');
   const row=await communityRepo.createReport({productId,reportId:makeId(),shareId,subjectId,reason:text,clientKey:key,commentId});
   return {id:row.id,status:row.status,createdAt:row.createdAt};
  }
 };
}

// 순간 경로만 맡는 핸들러. 나머지 경로는 null로 돌려 기존 커뮤니티 핸들러(fallback)가 그대로 판정한다 —
// 기존 커뮤니티 서비스·핸들러는 이 파일을 모른다(최소 결합).
export function createMomentCommunityHandler({authenticate,service,productId,fallback=null}){
 async function principal(request,required=true){
  try{return parsePrincipal(await authenticate(request),productId);}
  catch(error){if(!required&&error instanceof ApiError&&error.status===401)return null;if(error instanceof ApiError)throw error;throw new ApiError(503,'auth_unavailable','로그인 연결에 문제가 생겼어요.');}
 }
 async function handle(request){
  const path=String(request?.path||''),method=request?.method||'GET';
  const base=path.match(/^\/api\/community\/shares\/([A-Za-z0-9_-]{20,64})\/moments\/([A-Za-z0-9_-]{1,80})/);
  if(!base)return null;
  const [,shareId,momentId]=base;
  const rest=path.slice(base[0].length);
  if(rest===''&&method==='GET'){
   const who=await principal(request,false);
   return {status:200,body:await service.stats({viewerSubjectId:who?.subjectId??null,shareId,momentId}),headers:NO_STORE};
  }
  if(rest==='/reaction'&&(method==='PUT'||method==='DELETE')){
   const who=await principal(request);
   let kind='heart';
   if(method==='PUT'){try{const body=jsonBody(request);kind=(body&&typeof body==='object'&&typeof body.kind==='string'&&body.kind.trim()!==''?body.kind.trim():'heart');}catch{kind='heart';}}
   else{const q=String(request?.query?.get?.('kind')||'').trim();kind=q||'heart';}
   return {status:200,body:await service.react(who.subjectId,shareId,momentId,method==='PUT',kind),headers:NO_STORE};
  }
  if(rest==='/comments'){
   if(method==='GET'){const who=await principal(request,false);return {status:200,body:{comments:await service.comments(shareId,momentId,who?.subjectId||null)},headers:NO_STORE};}
   if(method==='POST'){const who=await principal(request),body=jsonBody(request);return {status:201,body:{comment:await service.comment(who.subjectId,shareId,momentId,body.body,clientKey(request))},headers:NO_STORE};}
  }
  const report=rest.match(/^\/comments\/([A-Za-z0-9_-]{1,80})\/report$/);
  if(report&&method==='POST'){const who=await principal(request),body=jsonBody(request);return {status:201,body:{report:await service.reportComment(who.subjectId,shareId,momentId,report[1],body.reason,clientKey(request))},headers:NO_STORE};}
  // /stage 등 나머지 순간 경로는 트리 커뮤니티 핸들러의 기존 길이다.
  return null;
 }
 return async request=>{
  let mine;
  try{mine=await handle(request);}
  catch(error){
   if(error instanceof ApiError)return {status:error.status,body:{error:{code:error.code,message:error.message,...(error.details||{})}},headers:NO_STORE};
   console.error('[lovetree-moment-community] request failed',{path:request?.path,method:request?.method});
   return {status:500,body:{error:{code:'internal_error',message:'서버에서 처리하지 못했어요.'}},headers:NO_STORE};
  }
  if(mine)return mine;
  return fallback?fallback(request):null;
 };
}
