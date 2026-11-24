import { logServerError } from './error-log.js';
import {ApiError} from './errors.js';
import {parsePrincipal} from './principal.js';
import {createRateLimiter} from './rate-limit.js';
import {ROLE_ADMIN, ROLE_AI_CUSTOMER} from './admin-roles.js';
import {audienceForRole} from './ops-notify.js';
import {OPS_INGEST_PATH} from './proxy-proof.js';

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
const MAX_JOURNAL_BODY = 8000; // #596: 일지는 같은 날 2회차를 덧붙여 쓰므로 의견(2000)과 한도를 나눈다.
const MAX_TITLE = 120;
const MAX_MEMO = 2000;
const MAX_ISSUE = 40;
const MAX_REPLY = 4000;
const NO_STORE = {'cache-control':'no-store, max-age=0',pragma:'no-cache','x-content-type-options':'nosniff'};
// 일지 날짜(journal_date)는 한국 시각 기준으로 남긴다 — UTC 날짜로 쓰면 한국 시각 00:00~09:00 사이의
// 기록이 하루 전 날짜로 저장돼 '사용 일지 · 고객별 최근 기록'이 하루 이상 뒤처져 보인다. 오늘 일지 조회
// (feedback-postgres: journal_date=(now() AT TIME ZONE 'Asia/Seoul')::date)와 같은 기준이다.
const seoulDate = (ms) => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul'}).format(new Date(ms));

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

function isIsoDateTime(value){
  if(typeof value!=='string')return false;
  const match=/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match||!Number.isFinite(Date.parse(value)))return false;
  const [,year,month,day]=match.map(Number);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1];
}

function validateOpsEvent(event) {
  const invalid=()=>{throw new ApiError(400,'invalid_event','운영센터 요청 형식을 확인해 주세요.');};
  if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.eventKey!=='string'||event.eventKey.length<16||event.eventKey.length>128||/[^A-Za-z0-9_-]/.test(event.eventKey)||!Number.isSafeInteger(event.feedbackId)||event.feedbackId<=0)invalid();
  if(event.kind==='status'){
    if(!isStatus(event.status))invalid();
  }else if(event.kind==='reply'){
    if(typeof event.replyId!=='string'||!event.replyId.trim()||event.replyId.includes('\0')||typeof event.body!=='string'||!event.body.trim()||event.body.includes('\0')||[...event.body].length>2000||!isIsoDateTime(event.createdAt))invalid();
  }else invalid();
  return event;
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

// #678 후속: 덧붙임을 고객에게 내려 줄 때의 모양 — 커뮤니티 댓글의 publicComment와 같은 방식
// (mine·edited·canEdit·canDelete). 답변자 신원(subject)과 고친 시각 값은 고객에게 내리지 않는다
// (고쳤는지 여부만 알리고, 시각은 운영센터 상세의 응답이 그대로 가진다).
function publicFollowup(row,viewer){
  const mine=!!viewer&&row.authorSubjectId===viewer;
  return {id:row.id,body:row.body,createdAt:row.createdAt,edited:!!row.editedAt,mine,canEdit:mine,canDelete:mine};
}

export function createFeedbackService({feedbackRepo,productId,admin=null,opsNotify=null,outbox=null,now=()=>Date.now()}={}){
  if(!feedbackRepo)throw new Error('feedbackRepo가 필요합니다.');
  // 속도 제한은 공용 한 벌(server/rate-limit.js)로 — 의견 창구는 10분 창을 쓴다(#1073 B-19).
  const limiter=createRateLimiter({now,windowMs:10*60_000});
  const rate=(key,limit,message)=>limiter.rate(key,limit,message);
  async function roleOf(principal){return principal&&admin?await admin.roleFor(principal):null;}
  async function notifyAudience(principal){if(!opsNotify)return null;try{return audienceForRole(await roleOf(principal));}catch{return null;}}
  function notifySaved(kind,title,sourceId,audience){if(opsNotify&&audience)void opsNotify.notify({kind,audience,title,sourceId}).catch(()=>{});}
  async function isAdmin(principal){return await roleOf(principal)===ROLE_ADMIN;}
  async function requireAdmin(principal){if(!await isAdmin(principal))throw new ApiError(403,'admin_forbidden','관리자만 볼 수 있어요.');}
  async function isAiCustomer(principal){return await roleOf(principal)===ROLE_AI_CUSTOMER;}
  function requirePrincipal(principal){if(!principal)throw new ApiError(401,'unauthenticated','로그인이 필요해요.');return principal;}

  // #1190: 저장과 보낼 줄 넣기를 같은 트랜잭션에 담는다. 보낼 값에 이메일·소개는 넣지 않는다.
  function outboxEvent(event, {feedbackId,body='',status='',append=null,isAiCustomer=false,accountSubjectId=null,category='',title='',createdAt='',eventKey=''}={}) {
    return {
      productId,
      feedbackId:Number(feedbackId),
      eventKey:eventKey || (event==='new'?'new':`${event}:${status}:${createdAt}`),
      kind:event,
      payload:{event,feedbackId:Number(feedbackId),body,status,append,isAiCustomer,accountSubjectId,category,title,createdAt}
    };
  }
  async function saveWithOutbox(work,events){
    const run=async client=>{
      const result=await work(client);
      if(!outbox?.enqueue)return result;
      const list=await events(result);
      for(const item of [].concat(list||[]))if(item)await outbox.enqueue(item,client);
      return result;
    };
    return typeof feedbackRepo.transaction==='function'?feedbackRepo.transaction(run):run();
  }

  return {
   categories:FEEDBACK_CATEGORIES,
   statuses:FEEDBACK_STATUSES,
   kinds:FEEDBACK_KINDS,

   // 받음 기록과 쓰기는 한 거래로 묶고 정방향 보내기 함수를 거치지 않는다.
   async ingestOpsEvent(input){
    const event=validateOpsEvent(input);
    return feedbackRepo.transaction(async client=>{
      if(!await feedbackRepo.claimIngestEvent({productId,eventKey:event.eventKey},client))return {ok:true,duplicate:true};
      const post=await feedbackRepo.get({productId,id:event.feedbackId},client);
      if(!post||post.kind!=='opinion')throw new ApiError(404,'feedback_not_found','의견을 찾을 수 없어요.');
      if(event.kind==='reply'){
        await feedbackRepo.addReply({productId,postId:post.id,authorType:'customer',body:maskPersonal(event.body),opsReplyId:event.replyId,createdAt:event.createdAt},client);
      }else{
        await feedbackRepo.update({productId,id:post.id,status:event.status},client);
      }
      return {ok:true};
    });
   },

   /** 1차: 의견 보내기(로그인·로그아웃). */
   async submit({principal=null,request,category,body,context}={}){
    if(!isCategory(category))throw new ApiError(400,'category_invalid','어떤 의견인지 골라 주세요.');
    const text=clean(body,MAX_BODY);
    if(!text)throw new ApiError(400,'body_required','의견을 입력해 주세요.');
    const subjectId=principal&&typeof principal.subjectId==='string'?principal.subjectId:null;
    if(subjectId)rate('sub:'+subjectId,20,'잠시 뒤 다시 보내 주세요.');
    else rate('ip:'+clientKey(request),3,'같은 곳에서 10분에 3번까지 보낼 수 있어요. 잠시 뒤 다시 시도해 주세요.');
    const masked=maskPersonal(text);
    const isAi=await isAiCustomer(principal);
    const audience=await notifyAudience(principal);
    const row=await saveWithOutbox(
      client=>feedbackRepo.create({productId,subjectId,kind:'opinion',category,title:firstLine(masked),body:masked,context:sanitizeContext(context)},client),
      saved=>outboxEvent('new',{feedbackId:saved.id,body:masked,status:saved.status,isAiCustomer:isAi,accountSubjectId:subjectId,category,title:saved.title,createdAt:saved.createdAt})
    );
    notifySaved('feedback_new',row.title||firstLine(masked),String(row.id),audience);
    // #1273 6번: 보낸 직후 '내 의견' 목록에 같은 글을 바로 넣을 수 있게 저장된 값을 함께 돌려준다.
    return {id:row.id,status:row.status,createdAt:row.createdAt,kind:row.kind,category:row.category,title:row.title,body:row.body};
   },

   /** 2차: AI 고객 '오늘 사용 일지'(게시판 글쓰기). 하루 한 건, 다시 쓰면 고친다. */
   async createJournal({principal,title,body,score}={}){
    requirePrincipal(principal);
    if(!await isAiCustomer(principal))throw new ApiError(403,'ai_customer_only','AI 고객만 사용 일지를 쓸 수 있어요.');
    const text=clean(title,MAX_TITLE);
    if(!text)throw new ApiError(400,'title_required','제목을 입력해 주세요.');
    const content=clean(body,MAX_JOURNAL_BODY);
    if(!content)throw new ApiError(400,'body_required','오늘 사용한 내용을 적어 주세요.');
    let value=null;
    if(score!==undefined&&score!==null&&score!==''){value=Number(score);if(!Number.isInteger(value)||value<1||value>5)throw new ApiError(400,'score_invalid','다시 올 점수는 1~5로 골라 주세요.');}
    rate('journal:'+principal.subjectId,20,'잠시 뒤 다시 시도해 주세요.');
    const masked=maskPersonal(content);
    const today=await feedbackRepo.todayJournal({productId,subjectId:principal.subjectId});
    if(today){
     const row=await feedbackRepo.update({productId,id:today.id,title:text,body:masked,score:value});
     notifySaved('feedback_append',row.title||text,String(row.id),audienceForRole(ROLE_AI_CUSTOMER));
     return {id:row.id,status:row.status,updated:true,createdAt:row.createdAt};
    }
    const row=await feedbackRepo.create({productId,subjectId:principal.subjectId,kind:'journal',category:'other',title:text,body:masked,score:value,journalDate:seoulDate(now())});
    notifySaved('feedback_new',row.title||text,String(row.id),audienceForRole(ROLE_AI_CUSTOMER));
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
      // #611 4번: 고객이 직접 덧붙인 줄과 운영센터 답글을 구분한다(mine).
      // 답변자 신원은 고객에게 내리지 않는다 — 본인 글인지 여부만 알린다.
      // #678 후속: 고객이 지운 덧붙임(status='deleted')은 목록에서 뺀다(커뮤니티 댓글과 같은 방식).
      // 고칠 수 있는지(mine·canEdit·canDelete)와 고쳤는지(edited)는 댓글의 publicComment처럼 알린다.
      item.replies=replies.filter(reply=>reply.authorType==='customer'&&reply.status!=='deleted')
        .map(reply=>({...publicFollowup(reply,principal.subjectId),authorType:reply.authorType,...(reply.opsReplyId?{authorName:'운영센터'}:{})}));
     }else{
      item.replies=[];
     }
     out.push(item);
    }
    return out;
   },

   /** #611 4번: 고객이 자기 의견 아래에 짧게 덧붙인다. 상태가 고침·닫음이면 '다시 열림'으로 바뀐다. */
   async append({principal,id,body}={}){
    requirePrincipal(principal);
    const post=await feedbackRepo.get({productId,id});
    // 본인 의견인지, 남의 글·일지인지는 밖으로 알리지 않는다(없는 것과 같이 404).
    if(!post||post.subjectId!==principal.subjectId||post.kind!=='opinion')throw new ApiError(404,'feedback_not_found','글을 찾을 수 없어요.');
    const text=clean(body,MAX_BODY);
    if(!text)throw new ApiError(400,'body_required','덧붙일 말을 입력해 주세요.');
    rate('followup:'+principal.subjectId,20,'잠시 뒤 다시 시도해 주세요.');
    const isAi=await isAiCustomer(principal);
    const audience=await notifyAudience(principal);
    const result=await saveWithOutbox(async client=>{
     const reply=await feedbackRepo.addReply({productId,postId:post.id,authorType:'customer',authorSubjectId:principal.subjectId,body:maskPersonal(text)},client);
     let status=post.status;
     if(status==='fixed'||status==='closed'){
      const reopened=await feedbackRepo.update({productId,id:post.id,status:'reviewing',memo:null,issueNumber:null,title:null,body:null,score:null},client);
      status=reopened?.status||'reviewing';
     }
     return {reply,status};
    },({reply,status})=>[
     outboxEvent('append',{feedbackId:post.id,body:reply.body,status,append:reply.body,isAiCustomer:isAi,accountSubjectId:principal.subjectId,createdAt:reply.createdAt,eventKey:'reply:'+reply.id}),
     status!==post.status?outboxEvent('status',{feedbackId:post.id,body:post.body,status,isAiCustomer:isAi,accountSubjectId:principal.subjectId,createdAt:reply.createdAt}):null
    ]);
    notifySaved('feedback_append',post.title||firstLine(post.body),String(result.reply.id),audience);
    return {id:result.reply.id,postId:post.id,status:result.status,createdAt:result.reply.createdAt};
   },

   /** #678 후속: 고객이 자기 덧붙임을 고친다(커뮤니티 댓글 updateComment와 같은 방식).
    *  본인 덧붙임만 — 덧붙임 작성 계정 = 요청 계정 = 글 작성 계정. 운영센터 답변도 authorType은
    *  'customer'이지만 author_subject_id가 다르므로 여기서 걸린다. 글자 수 제한은 붙이기와 같다(2000).
    *  내용이 바뀌었으므로 상태가 고침·닫음이면 붙이기와 같이 '다시 열림'으로 바뀐다. */
   async updateFollowup({principal,id,replyId,body}={}){
    requirePrincipal(principal);
    const post=await feedbackRepo.get({productId,id});
    // 본인 의견인지, 남의 글·일지인지는 밖으로 알리지 않는다(없는 것과 같이 404 — append와 같은 원칙).
    if(!post||post.subjectId!==principal.subjectId||post.kind!=='opinion')throw new ApiError(404,'feedback_not_found','글을 찾을 수 없어요.');
    const current=await feedbackRepo.getReply?.({productId,replyId});
    if(!current||current.status!=='visible'||current.postId!==post.id)throw new ApiError(404,'followup_not_found','덧붙일 말을 찾을 수 없어요.');
    if(current.authorSubjectId!==principal.subjectId)throw new ApiError(403,'followup_forbidden','이 덧붙일 말을 고칠 수 없어요.');
    const text=clean(body,MAX_BODY);
    if(!text)throw new ApiError(400,'body_required','덧붙일 말을 입력해 주세요.');
    rate('followup:'+principal.subjectId,20,'잠시 뒤 다시 시도해 주세요.');
    const row=await feedbackRepo.updateReply({productId,replyId:current.id,subjectId:principal.subjectId,body:maskPersonal(text)});
    if(!row)throw new ApiError(403,'followup_forbidden','이 덧붙일 말을 고칠 수 없어요.');
    if(post.status==='fixed'||post.status==='closed'){
     const reopened=await feedbackRepo.update({productId,id:post.id,status:'reviewing',memo:null,issueNumber:null,title:null,body:null,score:null});
     return {...publicFollowup(row,principal.subjectId),status:reopened?.status||'reviewing'};
    }
    return {...publicFollowup(row,principal.subjectId),status:post.status};
   },

   /** #678 후속: 고객이 자기 덧붙임을 지운다(커뮤니티 댓글 deleteComment와 같은 방식 —
    *  실제 삭제가 아니라 status='deleted'로 남긴다. 운영센터 상세에는 '고객이 지움'으로 보인다). */
   async deleteFollowup({principal,id,replyId}={}){
    requirePrincipal(principal);
    const post=await feedbackRepo.get({productId,id});
    if(!post||post.subjectId!==principal.subjectId||post.kind!=='opinion')throw new ApiError(404,'feedback_not_found','글을 찾을 수 없어요.');
    const current=await feedbackRepo.getReply?.({productId,replyId});
    if(!current||current.status!=='visible'||current.postId!==post.id)throw new ApiError(404,'followup_not_found','덧붙일 말을 찾을 수 없어요.');
    if(current.authorSubjectId!==principal.subjectId)throw new ApiError(403,'followup_forbidden','이 덧붙일 말을 지울 수 없어요.');
    const row=await feedbackRepo.deleteReply({productId,replyId:current.id,subjectId:principal.subjectId});
    if(!row)throw new ApiError(403,'followup_forbidden','이 덧붙일 말을 지울 수 없어요.');
    return {deleted:true,id:row.id};
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
    const replies=(await feedbackRepo.listReplies({productId,postId:row.id})).map(reply=>({...reply,fromCustomer:reply.authorType==='customer'&&!!reply.authorSubjectId&&reply.authorSubjectId===row.subjectId}));
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
    const row=await saveWithOutbox(
     client=>feedbackRepo.update({productId,id,status:status||null,memo,issueNumber:pint,title,pbody,score:pscore},client),
     saved=>status?outboxEvent('status',{feedbackId:saved.id,body:saved.body,status:saved.status,accountSubjectId:saved.subjectId,createdAt:saved.updatedAt}):null
    );
    if(!row)throw new ApiError(404,'feedback_not_found','글을 찾을 수 없어요.');
    return boardRow(row);
   },

   /** 관리자: 사용 일지 탭(#596) — 일지만 날짜 내림차순으로 읽는다. 상태·본문은 여기서 바꾸지 않는다. */
   async adminJournals(principal,{limit=300}={}){
    await requireAdmin(principal);
    const rows=await feedbackRepo.listJournals({productId,limit});
    return rows.map(boardRow);
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
  if(path===OPS_INGEST_PATH&&method==='POST'){
   const bytes=request.rawBody??Buffer.from(request.body||'','utf8');
   if(request.bodyTooLarge||bytes.length>8192)throw new ApiError(400,'invalid_body','요청 본문 크기를 확인해 주세요.');
   let event;
   try {event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
   catch {throw new ApiError(400,'invalid_json','요청 형식을 읽을 수 없어요.');}
   return {status:200,body:await service.ingestOpsEvent(event),headers:NO_STORE};
  }
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
  const followup=path.match(/^\/api\/board\/mine\/([^/]+)\/followup$/);
  if(followup&&method==='POST'){
   const who=await requiredPrincipal(request);
   const body=jsonBody(request);
   return {status:201,body:{followup:await service.append({principal:who,id:decodeURIComponent(followup[1]),body:body?.body})},headers:NO_STORE};
  }
  // #678 후속: 고객이 자기 덧붙임을 고치거나 지운다(커뮤니티 댓글 경로와 같은 모양).
  const followupItem=path.match(/^\/api\/board\/mine\/([^/]+)\/followup\/([^/]+)$/);
  if(followupItem&&method==='PATCH'){
   const who=await requiredPrincipal(request);
   const body=jsonBody(request);
   return {status:200,body:{followup:await service.updateFollowup({principal:who,id:decodeURIComponent(followupItem[1]),replyId:decodeURIComponent(followupItem[2]),body:body?.body})},headers:NO_STORE};
  }
  if(followupItem&&method==='DELETE'){
   const who=await requiredPrincipal(request);
   return {status:200,body:await service.deleteFollowup({principal:who,id:decodeURIComponent(followupItem[1]),replyId:decodeURIComponent(followupItem[2])}),headers:NO_STORE};
  }
  if(path==='/api/board/journal/today'&&method==='GET'){
   const who=await requiredPrincipal(request);
   return {status:200,body:{journal:await service.myJournal({principal:who})},headers:NO_STORE};
  }
  if(path==='/api/admin/feedback'&&method==='GET'){
   const who=await requiredPrincipal(request);
   return {status:200,body:{feedback:await service.list(who,{kind:query.get('kind')||'',status:query.get('status')||'',category:query.get('category')||''})},headers:NO_STORE};
  }
  if(path==='/api/admin/journals'&&method==='GET'){
   const who=await requiredPrincipal(request);
   return {status:200,body:{journals:await service.adminJournals(who,{limit:Number(query.get('limit'))||300})},headers:NO_STORE};
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
 return async request=>{try{return await handle(request);}catch(error){if(error instanceof ApiError)return {status:error.status,body:{error:{code:error.code,message:error.message,...(error.details||{})}},headers:NO_STORE};logServerError(error,'lovetree-feedback');return {status:500,body:{error:{code:'internal_error',message:'서버에서 처리하지 못했어요.'}},headers:NO_STORE};}};
}
