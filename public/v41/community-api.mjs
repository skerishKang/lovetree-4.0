export function createCommunityApi({fetchImpl=(...args)=>fetch(...args)}={}){
 async function call(path,init={}){try{const response=await fetchImpl(path,{...init,credentials:'same-origin',headers:{accept:'application/json',...(init.body?{'content-type':'application/json'}:{}),...(init.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)return {ok:false,status:response.status,code:body?.error?.code||'request_failed',message:body?.error?.message||''};return {ok:true,status:response.status,...body};}catch(error){return {ok:false,status:0,code:error?.name==='AbortError'?'timeout':'offline',message:''};}}
 const key=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 return {
  discover:params=>call('/api/community/shares?'+new URLSearchParams(Object.fromEntries(Object.entries(params||{}).filter(([,v])=>v!==''&&v!=null)))),
  favorite:(id,enabled)=>call('/api/community/shares/'+encodeURIComponent(id)+'/favorite',{method:enabled?'PUT':'DELETE'}),
  react:(id,enabled)=>call('/api/community/shares/'+encodeURIComponent(id)+'/reaction',{method:enabled?'PUT':'DELETE'}),
  comments:id=>call('/api/community/shares/'+encodeURIComponent(id)+'/comments'),
  comment:(id,body)=>call('/api/community/shares/'+encodeURIComponent(id)+'/comments',{method:'POST',headers:{'idempotency-key':key('comment')},body:JSON.stringify({body})}),
  removeComment:id=>call('/api/community/comments/'+encodeURIComponent(id),{method:'DELETE'}),
  report:(id,reason)=>call('/api/community/shares/'+encodeURIComponent(id)+'/report',{method:'POST',headers:{'idempotency-key':key('report')},body:JSON.stringify({reason})}),
  block:id=>call('/api/community/shares/'+encodeURIComponent(id)+'/block',{method:'POST'})
 };
}
