import {refreshUnauthorized, memberRefreshAllowed} from './api.mjs';
export function createCommunityApi({fetchImpl=(...args)=>fetch(...args)}={}){
 async function call(path,init={}){try{const request=()=>fetchImpl(path,{...init,credentials:'same-origin',headers:{accept:'application/json',...(init.body?{'content-type':'application/json'}:{}),...(init.headers||{})}});let response=await request();if(response.status===401)response=await refreshUnauthorized({fetchImpl,request,response,canRefresh:memberRefreshAllowed});const body=await response.json().catch(()=>({}));if(!response.ok)return {ok:false,status:response.status,code:body?.error?.code||'request_failed',message:body?.error?.message||''};return {ok:true,status:response.status,...body};}catch(error){return {ok:false,status:0,code:error?.name==='AbortError'?'timeout':'offline',message:''};}}
 const key=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 const stagePath=id=>'/api/community/stages/'+encodeURIComponent(id);
 return {
  momentStage:(shareId,momentId)=>call('/api/community/shares/'+encodeURIComponent(shareId)+'/moments/'+encodeURIComponent(momentId)+'/stage'),
  popularStages:()=>call('/api/community/stages/popular'),
  stageDetail:(id,{currentShareId,cursor}={})=>{
   const query=new URLSearchParams();
   if(currentShareId)query.set('currentShareId',currentShareId);
   if(cursor)query.set('cursor',cursor);
   return call(stagePath(id)+(query.size?'?'+query:''));
  },
  voteStage:(id,enabled)=>call(stagePath(id)+'/vote',{method:enabled?'PUT':'DELETE'}),
  discover:params=>call('/api/community/shares?'+new URLSearchParams(Object.fromEntries(Object.entries(params||{}).filter(([,v])=>v!==''&&v!=null)))),
  favorite:(id,enabled)=>call('/api/community/shares/'+encodeURIComponent(id)+'/favorite',{method:enabled?'PUT':'DELETE'}),
  react:(id,enabled,kind)=>kind?call('/api/community/shares/'+encodeURIComponent(id)+'/reaction'+(enabled?'':'?kind='+encodeURIComponent(kind)),{method:enabled?'PUT':'DELETE',body:enabled?JSON.stringify({kind}):undefined}):call('/api/community/shares/'+encodeURIComponent(id)+'/reaction',{method:enabled?'PUT':'DELETE'}),
  comments:id=>call('/api/community/shares/'+encodeURIComponent(id)+'/comments'),
  comment:(id,body)=>call('/api/community/shares/'+encodeURIComponent(id)+'/comments',{method:'POST',headers:{'idempotency-key':key('comment')},body:JSON.stringify({body})}),
  removeComment:id=>call('/api/community/comments/'+encodeURIComponent(id),{method:'DELETE'}),
  // #1098 2단계: 순간 단위 ♡·댓글(서버 #1136의 순간 경로) — 통계 읽기·♡ 켜기/끄기·댓글 읽기/쓰기.
  publicShare:shareId=>call('/api/public/shares/'+encodeURIComponent(shareId)),
  momentStats:(shareId,momentId)=>call('/api/community/shares/'+encodeURIComponent(shareId)+'/moments/'+encodeURIComponent(momentId)),
  momentReact:(shareId,momentId,enabled)=>call('/api/community/shares/'+encodeURIComponent(shareId)+'/moments/'+encodeURIComponent(momentId)+'/reaction',{method:enabled?'PUT':'DELETE',body:enabled?JSON.stringify({kind:'heart'}):undefined}),
  momentComments:(shareId,momentId)=>call('/api/community/shares/'+encodeURIComponent(shareId)+'/moments/'+encodeURIComponent(momentId)+'/comments'),
  momentComment:(shareId,momentId,body)=>call('/api/community/shares/'+encodeURIComponent(shareId)+'/moments/'+encodeURIComponent(momentId)+'/comments',{method:'POST',headers:{'idempotency-key':key('moment-comment')},body:JSON.stringify({body})}),
  editComment:(id,body)=>call('/api/community/comments/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({body})}),
  report:(id,reason)=>call('/api/community/shares/'+encodeURIComponent(id)+'/report',{method:'POST',headers:{'idempotency-key':key('report')},body:JSON.stringify({reason})}),
  block:id=>call('/api/community/shares/'+encodeURIComponent(id)+'/block',{method:'POST'}),
  // #1098 3단계 내 소식 — #1159에서 만든 두 읽기 경로만 쓴다(새 서버 경로 없음). 목록을 열면 서버가 읽음 표시를 남긴다.
  myNews:()=>call('/api/community/my-news'),
  myNewsUnread:()=>call('/api/community/my-news/unread-count')
 };
}
