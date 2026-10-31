const TIMEOUT=8_000;
export function createShareApi({fetchImpl=(...args)=>fetch(...args)}={}) {
  async function call(path,init={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT);
    try {
      const response=await fetchImpl(path,{credentials:'same-origin',headers:{accept:'application/json',...(init.body?{'content-type':'application/json'}:{})},...init,signal:controller.signal});
      const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null;}catch{}
      return {ok:response.ok,status:response.status,code:payload?.error?.code||null,message:payload?.error?.message||null,...(payload&&typeof payload==='object'?payload:{})};
    } catch(error) {
      return {ok:false,status:0,code:error?.name==='AbortError'?'timeout':'network',message:null};
    } finally { clearTimeout(timer); }
  }
  return {
    preview:input=>call('/api/shares/preview',{method:'POST',body:JSON.stringify(input)}),
    create:input=>call('/api/shares',{method:'POST',body:JSON.stringify(input)}),
    list:()=>call('/api/shares'),
    revoke:id=>call('/api/shares/'+encodeURIComponent(id),{method:'DELETE'}),
    read:id=>call('/api/public/shares/'+encodeURIComponent(id))
  };
}
