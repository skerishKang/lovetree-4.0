import {ApiError} from './errors.js';
import {parsePrincipal} from './principal.js';

/**
 * 고객 의견 창구 (#540) — 로그인·로그아웃 모두 같은 길로 의견을 받는다.
 *
 * - 종류·글을 검사한다(글 2000자까지, 종류는 정해진 값만).
 * - 개인 정보(이메일·전화번호 꼴)는 저장 전에 가린다.
 * - 로그아웃은 같은 곳(Cloudflare가 붙인 client ip)에서 10분에 3번까지. 로그인은 계정별로 넉넉히.
 * - 목록·상태 변경은 관리자만(admin-roles와 같은 권한 확인).
 */
export const FEEDBACK_CATEGORIES = Object.freeze(['bug', 'inconvenient', 'feature', 'other']);
export const FEEDBACK_STATUSES = Object.freeze(['received', 'reviewing', 'fixed', 'later']);

const CONTEXT_KEYS = Object.freeze(['screen', 'viewport', 'theme', 'version', 'loggedIn', 'treeId']);
const MAX_BODY = 2000;
const MAX_MEMO = 2000;
const MAX_ISSUE = 40;
const NO_STORE = {'cache-control':'no-store, max-age=0',pragma:'no-cache','x-content-type-options':'nosniff'};

const isCategory = value => typeof value === 'string' && FEEDBACK_CATEGORIES.includes(value);
const isStatus = value => typeof value === 'string' && FEEDBACK_STATUSES.includes(value);
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g;

/** 이메일·전화번호 꼴을 저장 전에 가린다. 원문은 남기지 않는다. */
export function maskPersonal(text) {
  return String(text)
    .replace(EMAIL, '[이메일]')
    .replace(PHONE, '[전화번호]');
}

function jsonBody(request) {
  if (!String(request?.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'JSON 요청만 사용할 수 있어요.');
  }
  try { return JSON.parse(typeof request.body === 'string' ? request.body : String(request.body || '')); }
  catch { throw new ApiError(400, 'invalid_json', '요청 형식을 읽을 수 없어요.'); }
}

function clientKey(request) {
  const raw = String(request?.headers?.['x-lovetree-client-ip'] || '').trim();
  return /^[0-9A-Fa-f.:]{3,64}$/.test(raw) ? raw : 'anonymous';
}

function sanitizeContext(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const key of CONTEXT_KEYS) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export function createFeedbackService({feedbackRepo,productId,admin=null,now=()=>Date.now()}={}){
  if(!feedbackRepo)throw new Error('feedbackRepo가 필요합니다.');
  const writes=new Map();
  function rate(key,limit,windowMs,message){
   const cut=now()-windowMs,list=(writes.get(key)||[]).filter(at=>at>cut);
   if(list.length>=limit)throw new ApiError(429,'rate_limited',message);
   list.push(now());writes.set(key,list);
  }
  async function isAdmin(principal){
   return !!principal&&!!admin&&await admin.roleFor(principal)==='admin';
  }
  return {
   categories:FEEDBACK_CATEGORIES,
   statuses:FEEDBACK_STATUSES,

   /** 의견 보내기. 로그인·로그아웃 모두 받는다(subjectId가 없으면 로그아웃). */
   async submit({principal=null,request,category,body,context}={}){
    if(!isCategory(category))throw new ApiError(400,'category_invalid','어떤 의견인지 골라 주세요.');
    const text=clean(body,MAX_BODY);
    if(!text)throw new ApiError(400,'body_required','의견을 입력해 주세요.');
    const subjectId=principal&&typeof principal.subjectId==='string'?principal.subjectId:null;
    if(subjectId)rate('sub:'+subjectId,20,10*60_000,'잠시 뒤 다시 보내 주세요.');
    else rate('ip:'+clientKey(request),3,10*60_000,'같은 곳에서 10분에 3번까지 보낼 수 있어요. 잠시 뒤 다시 시도해 주세요.');
    const masked=maskPersonal(text);
    const row=await feedbackRepo.create({productId,subjectId,category,body:masked,context:sanitizeContext(context)});
    return {id:row.id,status:row.status,createdAt:row.createdAt};
   },

   /** 관리자 목록(최신 순). 종류·상태로 거를 수 있다. */
   async list(principal,{status='',category=''}={}){
    if(!await isAdmin(principal))throw new ApiError(403,'admin_forbidden','관리자만 볼 수 있어요.');
    if(status&&!isStatus(status))throw new ApiError(400,'status_invalid','상태 값을 확인해 주세요.');
    if(category&&!isCategory(category))throw new ApiError(400,'category_invalid','종류 값을 확인해 주세요.');
    return feedbackRepo.list({productId,status,category});
   },

   /** 관리자 상태·메모·연결 이슈 번호 변경. */
   async update(principal,id,patch={}){
    if(!await isAdmin(principal))throw new ApiError(403,'admin_forbidden','관리자만 바꿀 수 있어요.');
    const status=patch.status===undefined?'':patch.status;
    if(status&&!isStatus(status))throw new ApiError(400,'status_invalid','상태 값을 확인해 주세요.');
    let memo,pint;
    if(patch.memo!==undefined){memo=typeof patch.memo==='string'?patch.memo.slice(0,MAX_MEMO):'';}
    if(patch.issueNumber!==undefined){
     const raw=clean(patch.issueNumber,MAX_ISSUE);
     if(raw&&!/^[0-9A-Za-z#._-]{1,40}$/.test(raw))throw new ApiError(400,'issue_number_invalid','이슈 번호 모양을 확인해 주세요.');
     pint=raw;
    }
    const row=await feedbackRepo.update({productId,id,status:status||null,memo,issueNumber:pint});
    if(!row)throw new ApiError(404,'feedback_not_found','의견을 찾을 수 없어요.');
    return row;
   }
  };
}

export function createFeedbackHandler({authenticate,service,productId}){
 async function optionalPrincipal(request){
  try{return parsePrincipal(await authenticate(request),productId);}
  catch(error){if(error instanceof ApiError&&error.status===401)return null;if(error instanceof ApiError)throw error;throw new ApiError(503,'auth_unavailable','로그인 연결에 문제가 생겼어요.');}
 }
 async function requiredPrincipal(request){
  const who=await optionalPrincipal(request);
  if(!who)throw new ApiError(401,'unauthenticated','로그인이 필요해요.');
  return who;
 }
 async function handle(request){
  const path=String(request?.path||''),method=request?.method||'GET',query=request?.query||new URLSearchParams();
  if(path==='/api/feedback'&&method==='POST'){
   const who=await optionalPrincipal(request);
   const body=jsonBody(request);
   return {status:201,body:await service.submit({principal:who,request,category:body?.category,body:body?.body,context:body?.context}),headers:NO_STORE};
  }
  if(path==='/api/admin/feedback'&&method==='GET'){
   const who=await requiredPrincipal(request);
   return {status:200,body:{feedback:await service.list(who,{status:query.get('status')||'',category:query.get('category')||''})},headers:NO_STORE};
  }
  const item=path.match(/^\/api\/admin\/feedback\/([^/]+)$/);
  if(item&&method==='PATCH'){
   const who=await requiredPrincipal(request);
   const body=jsonBody(request);
   return {status:200,body:{feedback:await service.update(who,decodeURIComponent(item[1]),body)},headers:NO_STORE};
  }
  throw new ApiError(404,'not_found','요청을 찾을 수 없어요.');
 }
 return async request=>{try{return await handle(request);}catch(error){if(error instanceof ApiError)return {status:error.status,body:{error:{code:error.code,message:error.message,...(error.details||{})}},headers:NO_STORE};console.error('[lovetree-feedback] request failed',{path:request?.path,method:request?.method});return {status:500,body:{error:{code:'internal_error',message:'서버에서 처리하지 못했어요.'}},headers:NO_STORE};}};
}