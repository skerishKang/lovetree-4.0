import {ApiError} from './errors.js';
import {parsePrincipal} from './principal.js';
import {ROLE_ADMIN, ROLE_AI_CUSTOMER} from './admin-roles.js';

/**
 * 고객 의견 창구 (#540) + 2차 관리자 게시판.
 *
 * 1차: 로그인·로그아웃 모두 의견을 받는다(개인정보 가림, 로그아웃 10분 3회).
 * 2차: AI 고객은 '오늘 사용 일지'를 게시판 글쓰기로 쓴다(하루 한 건, 다시 쓰면 고치기).
 *      관리자 화면은 게시판 — 목록·상세·답글(고객 답변/내부 메모)·페르소나.
 */
export const FEEDBACK_CATEGORIES = Object.freeze(['bug', 'inconvenient', 'feature', 'other']);
export const FEEDBACK_STATUSES = Object.freeze(['received', 'reviewing', 'fixed', 'later', 'closed']);
export const FEEDBACK_KINDS = Object.freeze(['opinion', 'journal']);
const CONTEXT_KEYS = Object.freeze(['screen', 'viewport', 'theme', 'version', 'loggedIn', 'treeId']);
const MAX_BODY = 2000;
const MAX_TITLE = 120;
const MAX_MEMO = 2000;
const MAX_ISSUE = 40;
const MAX_REPLY = 4000;
const NO_STORE = {'cache-control':'no-store, max-age=0',pragma:'no-cache','x-content-type-options':'nosniff'};

const isCategory = value => typeof value === 'string' && FEEDBACK_CATEGORIES.includes(value);
const isStatus = value => typeof value === 'string' && FEEDBACK_STATUSES.includes(value);
const isKind = value => typeof value === 'string' && FEEDBACK_KINDS.includes(value);
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const firstLine = (text, max = MAX_TITLE) => String(text || '').split('\n').map(line => line.trim()).find(Boolean)?.slice(0, max) || '';

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

function boardRow(row) {
  return {...row, displayTitle: row.title || firstLine(row.body)};
}

export function createFeedbackService({feedbackRepo,productId,admin=null,now=()=>Date.now()}={}){
  if(!feedbackRepo)throw new Error('feedbackRepo가 필요합니다.');
  const writes=new Map();
  function rate(key,limit,windowMs,message){
   const cut=now()-windowMs,list=(writes.get(key)||[]).filter(at=>at>cut);
   if(list.length>=limit)throw new ApiError(429,'rate_limited',message);
   list.push(now());writes.set(key,list);
  }
  async function roleOf(principal){return principal&&admin?await admin.roleFor(principal):null;}
  async function isAdmin(principal){return await roleOf(principal)===ROLE_ADMIN;}
  async function requireAdmin(principal){if(!await isAdmin(principal))throw new ApiError(403,'admin_forbidden','관리자만 볼 수 있어요.');}
  async function isAiCustomer(principal){return await roleOf(principal)===ROLE_AI_CUSTOMER;}
  function requirePrincipal(principal){if(!principal)throw new ApiError(401,'unauthenticated','로그인이 필요해요.');return principal;}

  return {
   categories:FEEDBACK_CATEGORIES,
   statuses:FEEDBACK_STATUSES,
   kinds:FEEDBACK_KINDS,

   /** 1차: 의견 보내기(로그인·로그아웃). */
   async submit({principal=null,request,category,body,context}={}){
    if(!isCategory(category))throw new ApiError(400,'category_invalid','어떤 의견인지 골라 주세요.');
    const text=clean(body,MAX_BODY);
    if(!text)throw new ApiError(400,'body_required','의견을 입력해 주세요.');
    const subjectId=principal&&typeof principal.subjectId==='string'?principal.subjectId:null;
    if(subjectId)rate('sub:'+subjectId,20,10*60_000,'잠시 뒤 다시 보내 주세요.');
    else rate('ip:'+clientKey(request),3,10*60_000,'같은 곳에서 10분에 3번까지 보낼 수 있어요. 잠시 뒤 다시 시도해 주세요.');
    const masked=maskPersonal(text);
    const row=await feedbackRepo.create({productId,subjectId,kind:'opinion',category,title:firstLine(masked),body:masked,context:sanitizeContext(context)});
    return {id:row.id,status:row.status,createdAt:row.createdAt};
   },

   /** 2차: AI 고객 '오늘 사용 일지'(게시판 글쓰기). 하루 한 건, 다시 쓰면 고친다. */
   async createJournal({principal,title,body,score}={}){
    requirePrincipal(principal);
    if(!await isAiCustomer(principal))throw new ApiError(403,'ai_customer_only','AI 고객만 사용 일지를 쓸 수 있어요.');
    const text=clean(title,MAX_TITLE);
    if(!text)throw new ApiError(400,'title_required','제목을 입력해 주세요.');
    const content=clean(body,MAX_BODY);
    if(!content)throw new ApiError(400,'body_required','오늘 사용한 내용을 적어 주세요.');
    let value=null;
    if(score!==undefined&&score!==null&&score!==''){value=Number(score);if(!Number.isInteger(value)||value<1||value>5)throw new ApiError(400,'score_invalid','다시 올 점수는 1~5로 골라 주세요.');}
    rate('journal:'+principal.subjectId,20,10*60_000,'잠시 뒤 다시 시도해 주세요.');
    const masked=maskPersonal(content);
    const today=await feedbackRepo.todayJournal({productId,subjectId:principal.subjectId});
    if(today){
     const row=await feedbackRepo.update({productId,id:today.id,title:text,body:masked,score:value});
     return {id:row.id,status:row.status,updated:true,createdAt:row.createdAt};
    }
    const row=await feedbackRepo.create({productId,subjectId:principal.subjectId,kind:'journal',category:'other',title:text,body:masked,score:value,journalDate:(new Date(now())).toISOString().slice(0,10)});
    return {id:row.id,status:row.status,updated:false,createdAt:row.createdAt};
   },

   /** 내 일지(오늘). AI 고객이 고치려고 읽는다. */
   async myJournal({principal}={}){
    requirePrincipal(principal);
    if(!await isAiCustomer(principal))throw new ApiError(403,'ai_customer_only','AI 고객만 볼 수 있어요.');
    const row=await feedbackRepo.todayJournal({productId,subjectId:principal.subjectId});
    return row?boardRow(row):null;
   },

   /** 내 글(의견·일지). 의견은 고객용 답글·상태를 함께 본다. */
   async myPosts({principal}={}){
    requirePrincipal(principal);
    const posts=await feedbackRepo.listBySubject({productId,subjectId:principal.subjectId});
    const out=[];
    for(const post of posts){
     const item=boardRow(post);
     if(item.kind==='opinion'){
      const replies=await feedbackRepo.listReplies({productId,postId:item.id});
      item.replies=replies.filter(reply=>reply.authorType==='customer');
     }else{
      item.replies=[];
     }
     out.push(item);
    }
    return out;
   },

   /** 관리자 목록(최신 순). 종류·상태·종류(의견/일지) 거르기. */
   async list(principal,{kind='',status='',category=''}={}){
    await requireAdmin(principal);
    if(kind&&!isKind(kind))throw new ApiError(400,'kind_invalid','종류 값을 확인해 주세요.');
    if(status&&!isStatus(status))throw new ApiError(400,'status_invalid','상태 값을 확인해 주세요.');
    if(category&&!isCategory(category))throw new ApiError(400,'category_invalid','종류 값을 확인해 주세요.');
    const rows=await feedbackRepo.list({productId,kind,status,category});
    return rows.map(boardRow);
   },

   /** 관리자 상세: 글 + 답글 + 글쓴이 페르소나. */
   async get(principal,id){
    await requireAdmin(principal);
    const row=await feedbackRepo.get({productId,id});
    if(!row)throw new ApiError(404,'feedback_not_found','글을 찾을 수 없어요.');
    const replies=await feedbackRepo.listReplies({productId,postId:row.id});
    const persona=row.subjectId?await feedbackRepo.getPersona({productId,subjectId:row.subjectId}):null;
    return {...boardRow(row),replies,persona};
   },

   /** 관리자 답글. 고객 답변(customer) / 내부 메모(internal). 일지는 내부 메모만. */
   async reply(principal,id,{authorType='internal',body}={}){
    await requireAdmin(principal);
    if(!['customer','internal'].includes(authorType))throw new ApiError(400,'author_type_invalid','답글 종류를 확인해 주세요.');
    const post=await feedbackRepo.get({productId,id});
    if(!post)throw new ApiError(404,'feedback_not_found','글을 찾을 수 없어요.');
    if(post.kind==='journal'&&authorType==='customer')throw new ApiError(400,'journal_internal_only','사용 일지에는 내부 메모만 남길 수 있어요.');
    const text=clean(body,MAX_REPLY);
    if(!text)throw new ApiError(400,'body_required','답글을 입력해 주세요.');
    const reply=await feedbackRepo.addReply({productId,postId:post.id,authorType,authorSubjectId:principal.subjectId,body:maskPersonal(text)});
    return reply;
   },

   /** 관리자 상태·메모·연결 이슈 번호 변경. */
   async update(principal,id,patch={}){
    await requireAdmin(principal);
    const status=patch.status===undefined?'':patch.status;
    if(status&&!isStatus(status))throw new ApiError(400,'status_invalid','상태 값을 확인해 주세요.');
    let memo,issue,pint,title,pbody,pscore;
    if(patch.memo!==undefined){memo=typeof patch.memo==='string'?patch.memo.slice(0,MAX_MEMO):'';}
    if(patch.issueNumber!==undefined){
     const raw=clean(patch.issueNumber,MAX_ISSUE);
     if(raw&&!/^[0-9A-Za-z#._-]{1,40}$/.test(raw))throw new ApiError(400,'issue_number_invalid','이슈 번호 모양을 확인해 주세요.');
     pint=raw;
    }
    if(patch.title!==undefined)title=clean(patch.title,MAX_TITLE);
    if(patch.body!==undefined)pbody=clean(patch.body,MAX_BODY);
    if(patch.score!==undefined&&patch.score!==null&&patch.score!==''){pscore=Number(patch.score);if(!Number.isInteger(pscore)||pscore<1||pscore>5)throw new ApiError(400,'score_invalid','점수는 1~5로 주세요.');}
    const row=await feedbackRepo.update({productId,id,status:status||null,memo,issueNumber:pint,title,pbody,score:pscore});
    if(!row)throw new ApiError(404,'feedback_not_found','글을 찾을 수 없어요.');
    return boardRow(row);
   },

   /** 관리자: 글쓴이(AI 고객) 페르소나 소개. */
   async persona(principal,subjectId){
    await requireAdmin(principal);
    const row=await feedbackRepo.getPersona({productId,subjectId});
    return row||{productId,subjectId,name:'',intro:{},updatedAt:null};
   },

   async savePersona(principal,subjectId,{name,intro}={}){
    await requireAdmin(principal);
    const cleanName=clean(name,MAX_TITLE);
    if(!cleanName)throw new ApiError(400,'name_required','이름을 입력해 주세요.');
    const cleanIntro=intro&&typeof intro==='object'&&!Array.isArray(intro)?intro:{};
    return feedbackRepo.upsertPersona({productId,subjectId,name:cleanName,intro:cleanIntro});
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
  if(path==='/api/board'&&method==='POST'){
   const who=await requiredPrincipal(request);
   const body=jsonBody(request);
   return {status:201,body:await service.createJournal({principal:who,title:body?.title,body:body?.body,score:body?.score}),headers:NO_STORE};
  }
  if(path==='/api/board/mine'&&method==='GET'){
   const who=await requiredPrincipal(request);
   return {status:200,body:{posts:await service.myPosts({principal:who})},headers:NO_STORE};
  }
  if(path==='/api/board/journal/today'&&method==='GET'){
   const who=await requiredPrincipal(request);
   return {status:200,body:{journal:await service.myJournal({principal:who})},headers:NO_STORE};
  }
  if(path==='/api/admin/feedback'&&method==='GET'){
   const who=await requiredPrincipal(request);
   return {status:200,body:{feedback:await service.list(who,{kind:query.get('kind')||'',status:query.get('status')||'',category:query.get('category')||''})},headers:NO_STORE};
  }
  const item=path.match(/^\/api\/admin\/feedback\/([^/]+)$/);
  if(item&&method==='GET'){
   const who=await requiredPrincipal(request);
   return {status:200,body:{feedback:await service.get(who,decodeURIComponent(item[1]))},headers:NO_STORE};
  }
  if(item&&method==='PATCH'){
   const who=await requiredPrincipal(request);
   const body=jsonBody(request);
   return {status:200,body:{feedback:await service.update(who,decodeURIComponent(item[1]),body)},headers:NO_STORE};
  }
  const reply=path.match(/^\/api\/admin\/feedback\/([^/]+)\/reply$/);
  if(reply&&method==='POST'){
   const who=await requiredPrincipal(request);
   const body=jsonBody(request);
   return {status:201,body:{reply:await service.reply(who,decodeURIComponent(reply[1]),{authorType:body?.authorType,body:body?.body})},headers:NO_STORE};
  }
  const persona=path.match(/^\/api\/admin\/persona\/([^/]+)$/);
  if(persona){
   const who=await requiredPrincipal(request);
   if(method==='GET')return {status:200,body:{persona:await service.persona(who,decodeURIComponent(persona[1]))},headers:NO_STORE};
   if(method==='PUT'){const body=jsonBody(request);return {status:200,body:{persona:await service.savePersona(who,decodeURIComponent(persona[1]),{name:body?.name,intro:body?.intro})},headers:NO_STORE};}
  }
  throw new ApiError(404,'not_found','요청을 찾을 수 없어요.');
 }
 return async request=>{try{return await handle(request);}catch(error){if(error instanceof ApiError)return {status:error.status,body:{error:{code:error.code,message:error.message,...(error.details||{})}},headers:NO_STORE};console.error('[lovetree-feedback] request failed',{path:request?.path,method:request?.method});return {status:500,body:{error:{code:'internal_error',message:'서버에서 처리하지 못했어요.'}},headers:NO_STORE};}};
}